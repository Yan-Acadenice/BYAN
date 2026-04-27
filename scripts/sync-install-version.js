#!/usr/bin/env node
/**
 * Sync install/package.json version with the root package.json.
 *
 * Invoked automatically by `npm version` via the `version` script hook in the
 * root package.json. Runs after npm bumps the root version and before npm
 * commits, so the synced install/package.json lands in the same commit.
 *
 * Why: install/package.json shipped duplicate metadata for the create-byan-agent
 * package and used to drift (root at 2.14.0 while install/ stayed at 2.11.0),
 * which made the bin print the stale version and incorrectly trip the
 * KNOWN_BAD_VERSION_FLOOR guard on freshly installed users.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rootPkgPath = path.join(root, 'package.json');
const installPkgPath = path.join(root, 'install', 'package.json');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const installPkg = JSON.parse(fs.readFileSync(installPkgPath, 'utf8'));

if (installPkg.version === rootPkg.version) {
  console.log(`[sync-install-version] already in sync at ${rootPkg.version}`);
  process.exit(0);
}

const previous = installPkg.version;
installPkg.version = rootPkg.version;
fs.writeFileSync(installPkgPath, JSON.stringify(installPkg, null, 2) + '\n');
console.log(`[sync-install-version] install/package.json: ${previous} -> ${rootPkg.version}`);
