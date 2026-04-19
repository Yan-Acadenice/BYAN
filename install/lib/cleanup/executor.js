/**
 * BYAN cleanup executor.
 *
 * Two removal modes :
 *   - archive(items, archiveDir) : move each item into a timestamped
 *     subdir of archiveDir (reversible).
 *   - deleteHard(items)          : rm -rf each item (irreversible).
 *
 * Both return per-item results so the caller can print a clean summary.
 */

const fs = require('fs');
const path = require('path');

function timestampDir() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function archive(items, { archiveRoot, now = new Date() } = {}) {
  if (!Array.isArray(items) || items.length === 0) return { moved: [], errors: [] };

  const stamp =
    now instanceof Date
      ? (() => {
          const pad = (n) => String(n).padStart(2, '0');
          return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        })()
      : String(now);

  const baseRoot = archiveRoot || path.join('_byan-output', 'archive');
  const dest = path.join(baseRoot, stamp);
  fs.mkdirSync(dest, { recursive: true });

  const moved = [];
  const errors = [];
  for (const item of items) {
    const src = item.path || item;
    const name = path.basename(src);
    const target = path.join(dest, name);
    try {
      fs.renameSync(src, target);
      moved.push({ from: src, to: target });
    } catch (err) {
      errors.push({ path: src, error: err.message });
    }
  }
  return { moved, errors, archiveDir: dest };
}

function deleteHard(items) {
  if (!Array.isArray(items) || items.length === 0) return { deleted: [], errors: [] };
  const deleted = [];
  const errors = [];
  for (const item of items) {
    const src = item.path || item;
    try {
      fs.rmSync(src, { recursive: true, force: true });
      deleted.push(src);
    } catch (err) {
      errors.push({ path: src, error: err.message });
    }
  }
  return { deleted, errors };
}

module.exports = {
  archive,
  deleteHard,
  timestampDir,
};
