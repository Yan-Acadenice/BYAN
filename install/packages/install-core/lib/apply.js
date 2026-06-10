'use strict';

// apply.js — the ONLY mutator in install-core. Executes plan.steps in order
// against opts.cwd via a type dispatch, and is the single audited surface where
// disk writes and process spawns happen. detect()/plan() stay pure; everything
// with a side-effect lives here.
//
// Contract: apply(plan, opts) -> Promise<ApplyResult>
//   opts: {
//     cwd            : string                 (target project root)
//     runInstalls?   : boolean = false        (true => actually spawn npm -g)
//     dryRun?        : boolean = false         (true => write nothing, record intent)
//     continueOnError?: boolean = false        (true => a failed step is recorded, not thrown)
//     run?           : (file, args, opts) => result   (INJECTED spawn runner; tests mock it)
//     secrets?       : Record<string,string>  (secret VALUES; resolved at apply-time only)
//     logger?        : (msg) => void
//   }
//   Returns { results: StepResult[], manifestPath, authHandoffs, deferredInstalls }.
//
// Idempotence: re-running converges. mkdir->ensureDir, copy->overwrite,
// render/write delegate to platform-config's READ-MERGE-WRITE adapters, manifest
// is regenerated.
//
// Security: AUTH steps are NEVER spawned or faked (I50) — emitted as 'deferred'
// with a handoff command for the human. cli-install is per-user npm -g, NEVER
// sudo (C11). Secret values come from opts.secrets via the '@secret:KEY'
// reference convention and are never written into the plan or the result.

const path = require('path');
const childProcess = require('child_process');
const fs = require('fs-extra');

const envWriter = require('./env-writer');
const mcpRenderer = require('./mcp-renderer');
const { sha256File } = require('./hash-util');

class ApplyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApplyError';
  }
}

// Reference convention for secret values: a plan carries '@secret:KEY' and apply
// swaps it for opts.secrets[KEY]. WHY: the plan object (cacheable, diffable,
// loggable) must never serialize a raw token; the value is injected only here.
const SECRET_REF_PREFIX = '@secret:';

function resolveSecret(value, secrets) {
  if (typeof value === 'string' && value.indexOf(SECRET_REF_PREFIX) === 0) {
    const key = value.slice(SECRET_REF_PREFIX.length);
    return secrets && Object.prototype.hasOwnProperty.call(secrets, key) ? secrets[key] : '';
  }
  return value;
}

function resolveVars(vars, secrets) {
  const out = {};
  Object.keys(vars || {}).forEach((k) => {
    out[k] = resolveSecret(vars[k], secrets);
  });
  return out;
}

async function apply(plan, opts) {
  if (!plan || typeof plan !== 'object') {
    throw new ApplyError('apply(plan, opts): plan must be an object');
  }
  if (!Array.isArray(plan.steps)) {
    throw new ApplyError('apply(plan, opts): plan.steps must be an array');
  }
  const o = opts || {};
  const ctx = {
    cwd: o.cwd || process.cwd(),
    runInstalls: o.runInstalls === true,
    dryRun: o.dryRun === true,
    continueOnError: o.continueOnError === true,
    // Default to the read-only execFileSync runner; tests inject a fake so no
    // real spawn ever happens. Signature: (file, args, runOpts) => result.
    run:
      typeof o.run === 'function'
        ? o.run
        : (file, args, runOpts) => childProcess.execFileSync(file, args, runOpts),
    secrets: o.secrets || {},
    logger: typeof o.logger === 'function' ? o.logger : function () {},
  };

  const results = [];
  const authHandoffs = [];
  const deferredInstalls = [];
  // Track every file we wrote so the manifest step can hash exactly those.
  const writtenFiles = [];

  // The manifest step always runs LAST regardless of position, so it ledgers
  // every artifact the prior steps produced. Split it out.
  const ordinary = plan.steps.filter((s) => s.type !== 'manifest');
  const manifestStep = plan.steps.find((s) => s.type === 'manifest');

  for (let i = 0; i < ordinary.length; i++) {
    const step = ordinary[i];
    const res = await runStep(step, ctx, { authHandoffs, deferredInstalls, writtenFiles });
    results.push(res);
    if (res.status === 'failed' && !ctx.continueOnError) {
      throw new ApplyError('apply: step "' + step.id + '" failed: ' + res.detail);
    }
  }

  let manifestPath = null;
  if (manifestStep) {
    const res = await runManifest(manifestStep, ctx, writtenFiles);
    results.push(res);
    manifestPath = res.path || null;
  }

  return {
    results: results,
    manifestPath: manifestPath,
    authHandoffs: authHandoffs,
    deferredInstalls: deferredInstalls,
  };
}

// Dispatch a single step to its handler. Each handler returns a StepResult; a
// thrown error is caught here and converted to a 'failed' StepResult so apply
// can honor continueOnError uniformly.
async function runStep(step, ctx, sinks) {
  try {
    switch (step.type) {
      case 'mkdir':
        return await stepMkdir(step, ctx);
      case 'copy-template':
        return await stepCopy(step, ctx, sinks.writtenFiles);
      case 'write-file':
        return await stepWriteFile(step, ctx, sinks.writtenFiles);
      case 'render-mcp':
        return await stepRenderMcp(step, ctx, sinks.writtenFiles);
      case 'write-env':
        return await stepWriteEnv(step, ctx, sinks.writtenFiles);
      case 'write-settings-local':
        return await stepWriteSettingsLocal(step, ctx, sinks.writtenFiles);
      case 'cli-install':
        return await stepCliInstall(step, ctx, sinks.deferredInstalls);
      case 'auth-handoff':
        return stepAuthHandoff(step, sinks.authHandoffs);
      default:
        return result(step, 'skipped', 'unknown step type: ' + step.type);
    }
  } catch (e) {
    return result(step, 'failed', e.message);
  }
}

function result(step, status, detail, extra) {
  return Object.assign({ id: step.id, type: step.type, status: status, detail: detail || '' }, extra || {});
}

async function stepMkdir(step, ctx) {
  const dest = path.join(ctx.cwd, step.dest);
  if (ctx.dryRun) return result(step, 'skipped', 'dry-run: would ensureDir ' + step.dest);
  await fs.ensureDir(dest);
  return result(step, 'done', step.dest);
}

async function stepCopy(step, ctx, writtenFiles) {
  const dest = path.join(ctx.cwd, step.dest);
  if (ctx.dryRun) return result(step, 'skipped', 'dry-run: would copy -> ' + step.dest);
  const src = path.isAbsolute(step.src) ? step.src : path.join(ctx.cwd, step.src);
  if (!(await fs.pathExists(src))) {
    // A copy whose source is absent is a deferred no-op, not a hard failure:
    // the template tree may legitimately not ship every optional subtree.
    return result(step, 'skipped', 'source absent: ' + step.src);
  }
  await fs.copy(src, dest, { overwrite: step.overwrite !== false });
  // If a file-rename map is present (soul steps), apply it after the copy.
  if (Array.isArray(step.files)) {
    await applyRenameMap(dest, step.files);
  }
  await recordTree(dest, ctx.cwd, writtenFiles);
  return result(step, 'done', step.dest);
}

// Soul steps carry a "from->to" rename list. After copying the template dir we
// move each "from" to its "to" name so e.g. byan-soul.md lands as soul.md.
async function applyRenameMap(destDir, files) {
  for (let i = 0; i < files.length; i++) {
    const parts = String(files[i]).split('->');
    if (parts.length !== 2) continue;
    const from = path.join(destDir, parts[0].trim());
    const to = path.join(destDir, parts[1].trim());
    if (from === to) continue;
    if (await fs.pathExists(from)) {
      await fs.move(from, to, { overwrite: true });
    }
  }
}

async function stepWriteFile(step, ctx, writtenFiles) {
  const dest = path.join(ctx.cwd, step.dest);
  if (ctx.dryRun) return result(step, 'skipped', 'dry-run: would write ' + step.dest);
  await fs.ensureDir(path.dirname(dest));
  const body =
    step.format === 'yaml' ? serializeFlatYaml(step.data) : JSON.stringify(step.data, null, 2) + '\n';
  await fs.writeFile(dest, body, 'utf8');
  recordFile(step.dest, writtenFiles);
  return result(step, 'done', step.dest);
}

async function stepRenderMcp(step, ctx, writtenFiles) {
  if (ctx.dryRun) return result(step, 'skipped', 'dry-run: would render .mcp.json');
  // validate-or-die lives in mcp-renderer; a bad url throws and becomes a failed
  // StepResult via runStep's catch.
  const { path: filePath } = await mcpRenderer.renderMcp(ctx.cwd, { apiUrl: step.apiUrl });
  recordFile(path.relative(ctx.cwd, filePath), writtenFiles);
  return result(step, 'done', step.dest || '.mcp.json');
}

async function stepWriteEnv(step, ctx, writtenFiles) {
  if (ctx.dryRun) return result(step, 'skipped', 'dry-run: would write .env');
  const vars = resolveVars(step.vars, ctx.secrets);
  const { path: filePath } = await envWriter.writeProjectEnv(ctx.cwd, vars);
  recordFile(path.relative(ctx.cwd, filePath), writtenFiles);
  // Detail must never carry the secret values — only the key names.
  return result(step, 'done', 'wrote keys: ' + Object.keys(vars).join(','));
}

async function stepWriteSettingsLocal(step, ctx, writtenFiles) {
  if (ctx.dryRun) return result(step, 'skipped', 'dry-run: would write settings.local.json');
  const vars = resolveVars(step.env, ctx.secrets);
  const { path: filePath } = await envWriter.writeSettingsLocalEnv(ctx.cwd, vars);
  recordFile(path.relative(ctx.cwd, filePath), writtenFiles);
  return result(step, 'done', 'wrote keys: ' + Object.keys(vars).join(','));
}

// cli-install: per-user npm -g (or the recipe's command). NEVER sudo (C11). When
// runInstalls is false (or dryRun), the step is DEFERRED with the exact command
// for the human/frontal to run.
async function stepCliInstall(step, ctx, deferredInstalls) {
  const command = Array.isArray(step.command) ? step.command : [];
  assertNoSudo(command);

  if (!ctx.runInstalls || ctx.dryRun) {
    deferredInstalls.push({
      platform: step.platform,
      command: command,
      global: step.global !== false,
      sudo: false,
    });
    return result(step, 'deferred', 'deferred install: ' + command.join(' '));
  }

  const [file, ...args] = command;
  // Read-only-ish spawn through the injected runner; per-user, no privilege.
  ctx.run(file, args, { stdio: 'inherit' });
  return result(step, 'done', 'installed: ' + command.join(' '));
}

// auth-handoff: I50 — never spawn, never fake success. Always deferred, carrying
// the command the human must run. Recorded in authHandoffs for the frontal.
function stepAuthHandoff(step, authHandoffs) {
  authHandoffs.push({ platform: step.platform, command: step.command });
  return result(step, 'deferred', step.command + ' (' + (step.reason || 'manual auth') + ')');
}

// manifest: write the SHA-256 hash ledger LAST so it covers every artifact the
// prior steps produced. Uses the shared hash-util so verify re-hashes identically.
async function runManifest(step, ctx, writtenFiles) {
  if (ctx.dryRun) {
    return result(step, 'skipped', 'dry-run: would write manifest');
  }
  const dest = path.join(ctx.cwd, step.dest);
  await fs.ensureDir(path.dirname(dest));

  const files = {};
  // De-dup the tracked list (a tree copy + a later write may overlap).
  const unique = Array.from(new Set(writtenFiles));
  for (let i = 0; i < unique.length; i++) {
    const rel = unique[i];
    const full = path.join(ctx.cwd, rel);
    // Skip the manifest itself and anything that vanished mid-run.
    if (rel === step.dest) continue;
    if (!(await fs.pathExists(full))) continue;
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    files[rel] = { sha256: await sha256File(full) };
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    files: files,
  };
  await fs.writeJson(dest, manifest, { spaces: 2 });
  return Object.assign(result(step, 'done', step.dest), { path: dest });
}

// --- helpers -----------------------------------------------------------------

function assertNoSudo(command) {
  for (let i = 0; i < command.length; i++) {
    if (/(^|\s)sudo(\s|$)/.test(String(command[i]))) {
      throw new ApplyError('cli-install command must never invoke sudo (C11): ' + command.join(' '));
    }
  }
}

function recordFile(rel, writtenFiles) {
  if (rel && writtenFiles.indexOf(rel) === -1) writtenFiles.push(rel);
}

// Record every FILE under a freshly copied tree (for the manifest ledger).
async function recordTree(absDir, cwd, writtenFiles) {
  const stack = [absDir];
  while (stack.length) {
    const cur = stack.pop();
    const stat = await fs.stat(cur);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(cur);
      for (let i = 0; i < entries.length; i++) stack.push(path.join(cur, entries[i]));
    } else if (stat.isFile()) {
      recordFile(path.relative(cwd, cur), writtenFiles);
    }
  }
}

// Minimal flat-YAML emitter for the config.yaml step. The v2.19 AUTO config is a
// single-level key:value map (user_name, communication_language, platform,
// install_mode, byan_version, soul_mode). WHY hand-rolled and not js-yaml: the
// dependency policy pins exactly byan-platform-config + fs-extra; a flat map does
// not justify a YAML library, and the shape is fully under our control.
function serializeFlatYaml(data) {
  const obj = data || {};
  const lines = Object.keys(obj).map((k) => k + ': ' + yamlScalar(obj[k]));
  return lines.join('\n') + '\n';
}

function yamlScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  // Quote when the scalar could be misread (leading/trailing space, special
  // chars, or a string that looks like another YAML type).
  if (s === '' || /[:#\-?{}\[\],&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s) || /^(true|false|null|~|\d)/i.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

module.exports = {
  apply: apply,
  ApplyError: ApplyError,
};
