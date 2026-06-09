#!/usr/bin/env node
// drain-advisory.js — Stop hook. At the end of each assistant turn, drain the
// outcome buffer into BYAN's ADVISORY ledgers (ELO trust, suitability). This is the
// automatic half of the closed learning loop: outcomes logged during the turn (via
// byan_outcome_log) are recorded with NO agent action. Behavior surfaces (routing /
// personas / mantras) are never touched — only advisory data is written.
//
// STRICTLY non-blocking. All work is wrapped in try/catch; the hook ALWAYS emits
// {continue:true} and exits 0, and never throws or exits 2. An advisory feed must
// never break a turn (the stage-to-byan.js contract: "staging must never break the
// session"). Idempotent via a line cursor, so a re-fired Stop (stop_hook_active)
// records nothing new.
//
// ESM/CJS: this hook is CommonJS. The ELO engine is CJS (require). The pure libs and
// the suitability store are ESM under a type:module package, reached via dynamic
// import() with a file:// URL.

const path = require('path');
const { pathToFileURL } = require('url');

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function done() {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

(async () => {
  try {
    await readStdin(); // the Stop payload is not needed — we drain disk state
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const esm = (rel) => import(pathToFileURL(path.join(root, rel)).href);

    const af = await esm('_byan/mcp/byan-mcp-server/lib/advisory-autofeed.js');
    const buf = await esm('_byan/mcp/byan-mcp-server/lib/outcome-buffer.js');

    const outcomes = af.parseOutcomes(buf.readBuffer({ rootDir: root }));
    const cursor = buf.readCursor({ rootDir: root });
    const { pending, newCursor } = af.planDrain(outcomes, cursor);
    if (!pending.length) return done();

    let eloEngine = null;
    let suitability = null;
    for (const o of pending) {
      const rec = af.classifyOutcome(o);
      if (!rec) continue;
      try {
        if (rec.kind === 'elo') {
          if (!eloEngine) {
            const EloEngine = require(path.join(root, 'src', 'byan-v2', 'elo', 'index.js'));
            eloEngine = new EloEngine({
              storagePath: path.join(root, '_byan', 'memoire', 'elo-profile.json'),
            });
          }
          eloEngine.recordResult(rec.domain, rec.result);
        } else if (rec.kind === 'suitability') {
          if (!suitability) {
            suitability = await esm('_byan/mcp/byan-mcp-server/lib/suitability-store.js');
          }
          suitability.record({
            model: rec.model,
            leafId: rec.leafId,
            success: rec.success,
            source: 'autofeed',
            projectRoot: root,
          });
        }
      } catch {
        // one bad record must not abort the drain or block the turn
      }
    }
    buf.writeCursor(newCursor, { rootDir: root });
  } catch {
    // any failure degrades silently — the feed is housekeeping, never a blocker
  }
  done();
})();
