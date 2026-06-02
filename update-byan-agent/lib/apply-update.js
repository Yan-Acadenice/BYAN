'use strict';

/**
 * Core of `update-byan-agent update`: rebuild the installed _byan tree and the
 * Copilot stubs from the create-byan-agent template, without a network install
 * and without ever leaving _byan deleted on failure.
 *
 * Design constraints (field-reported bugs this module fixes):
 *  - BUG3 : the updater already runs from the @latest package (npx -p ...), so
 *    the template lives next to the running bin. Resolve it locally instead of
 *    re-running `npm install create-byan-agent@latest` into the user project.
 *  - BUG2 : validate the replacement source on disk BEFORE touching the live
 *    _byan, then swap via rename (stage -> rename), so a failure never leaves
 *    the project without a _byan.
 *  - BUG1 : a usable-template failure reports whether the package could not be
 *    resolved at all vs. the template dir being present but empty, with the
 *    probed paths, instead of a flat "not found in npm package".
 *
 * Pure module: no commander, no inquirer, no spinners, no network. The bin
 * wires UI/version/backup/customization-preservation around it.
 */

const fs = require('fs');
const path = require('path');

/** True when p is a directory that contains at least one entry. */
function isNonEmptyDir(p) {
  try {
    if (!fs.statSync(p).isDirectory()) return false;
    return fs.readdirSync(p).length > 0;
  } catch {
    return false;
  }
}

/** Recursively copy a directory tree (files + dirs), creating dest as needed. */
function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
    // symlinks / specials are intentionally skipped (template ships none)
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/**
 * Resolve the create-byan-agent package root that holds install/templates.
 * Preference order:
 *  1. the running package itself (the bin lives at <pkg>/update-byan-agent/bin)
 *  2. node_modules/create-byan-agent under the install path (legacy fallback)
 *
 * @param {object} opts
 * @param {string} opts.installPath  project root being updated
 * @param {string} opts.binDir       __dirname of the running bin
 * @returns {{ pkgRoot: string, source: 'running-package'|'node_modules' }}
 * @throws {Error} BUG1 diagnostic when no package root carries a template dir
 */
function resolvePackageRoot({ installPath, binDir }) {
  const runningPkg = path.resolve(binDir, '..', '..');
  const nodeModulesPkg = path.join(installPath, 'node_modules', 'create-byan-agent');
  const candidates = [
    { pkgRoot: runningPkg, source: 'running-package' },
    { pkgRoot: nodeModulesPkg, source: 'node_modules' },
  ];

  const probed = [];
  for (const c of candidates) {
    const tplDir = path.join(c.pkgRoot, 'install', 'templates');
    const byanTpl = path.join(tplDir, '_byan');
    probed.push(byanTpl);
    if (isNonEmptyDir(byanTpl)) return c;
    // Distinguish "present but empty" (real package defect) from "absent".
    if (fs.existsSync(byanTpl)) {
      throw new Error(
        `create-byan-agent template is present but EMPTY at ${byanTpl}. ` +
        `The package is malformed for this version; do not delete _byan. ` +
        `Reinstall the package or republish.`
      );
    }
  }

  throw new Error(
    `Could not resolve the create-byan-agent package template. Probed:\n` +
    probed.map((p) => `  - ${p}`).join('\n') +
    `\nThis means the running package layout is unexpected (not a template ` +
    `absence in a healthy package). Re-run via ` +
    `'npx -p create-byan-agent@latest update-byan-agent update'.`
  );
}

/**
 * Replace a destination dir with a freshly staged copy of `src`, never leaving
 * the destination missing for more than two atomic renames. The replacement
 * source is fully staged (and validated non-empty) before the live dir is moved
 * aside, so an interrupted/failed stage cannot destroy the existing content.
 *
 * @param {string} src   validated, non-empty source dir
 * @param {string} dest  live dir to replace
 * @param {string} label for error messages
 * @returns {number} number of top-level entries staged
 */
function stageAndSwap(src, dest, label) {
  if (!isNonEmptyDir(src)) {
    throw new Error(`Refusing to replace ${label}: source ${src} is missing or empty.`);
  }

  const staging = `${dest}.staging`;
  const prev = `${dest}.prev`;
  // Clean any residue from a prior interrupted run. The replacement is always
  // rebuilt from the validated `src`, so a stale `${dest}.prev` is debris, not
  // data to recover (the bin's separate _byan.backup is the crash net).
  rmrf(staging);
  rmrf(prev);

  // 1. Stage the new content beside the destination. If this throws, the live
  //    dest is still untouched.
  copyRecursive(src, staging);
  if (!isNonEmptyDir(staging)) {
    rmrf(staging);
    throw new Error(`Staging ${label} produced no files (source ${src}).`);
  }

  // 2. Swap. Move the live dir aside (atomic), move staging into place
  //    (atomic), then drop the old one. On a swap failure, restore and leave no
  //    .staging debris behind.
  const destExists = fs.existsSync(dest);
  try {
    if (destExists) fs.renameSync(dest, prev);
    fs.renameSync(staging, dest);
  } catch (err) {
    if (destExists && !fs.existsSync(dest) && fs.existsSync(prev)) {
      try { fs.renameSync(prev, dest); } catch { /* leave prev for manual recovery */ }
    }
    rmrf(staging);
    throw err;
  }

  // The swap is committed. A failure to drop the old copy must NOT fail the
  // update (e.g. transient EBUSY on a locked file); a stale .prev is cleaned by
  // the next run's top-of-function rmrf.
  try { rmrf(prev); } catch { /* best-effort */ }

  return fs.readdirSync(dest).length;
}

/**
 * Apply the file-system part of an update: rebuild _byan and refresh the
 * Copilot stubs from the resolved package template.
 *
 * Caller is responsible for preserving/restoring user customizations around
 * this call (config.yaml, memory, _byan-output, etc.).
 *
 * @param {object} opts
 * @param {string} opts.installPath project root being updated
 * @param {string} opts.pkgRoot     resolved create-byan-agent package root
 * @returns {{ byanEntries: number, githubAgentsEntries: number|null, templateRoot: string }}
 */
function applyUpdate({ installPath, pkgRoot }) {
  const templateRoot = path.join(pkgRoot, 'install', 'templates');
  const byanSrc = path.join(templateRoot, '_byan');

  // Validate BEFORE any destruction (BUG2). resolvePackageRoot already vetted
  // this, but applyUpdate may be called directly, so re-check.
  if (!isNonEmptyDir(byanSrc)) {
    throw new Error(
      `Template _byan is missing or empty at ${byanSrc}. ` +
      `Aborting update without deleting the existing _byan.`
    );
  }

  const byanDir = path.join(installPath, '_byan');
  const byanEntries = stageAndSwap(byanSrc, byanDir, '_byan');

  // Refresh Copilot stubs (.github/agents) from the template, same discipline.
  // Optional: only when the template ships them.
  let githubAgentsEntries = null;
  const ghSrc = path.join(templateRoot, '.github', 'agents');
  if (isNonEmptyDir(ghSrc)) {
    const ghDst = path.join(installPath, '.github', 'agents');
    fs.mkdirSync(path.dirname(ghDst), { recursive: true });
    githubAgentsEntries = stageAndSwap(ghSrc, ghDst, '.github/agents');
  }

  return { byanEntries, githubAgentsEntries, templateRoot };
}

module.exports = {
  applyUpdate,
  resolvePackageRoot,
  stageAndSwap,
  isNonEmptyDir,
  copyRecursive,
};
