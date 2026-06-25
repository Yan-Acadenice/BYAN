#!/usr/bin/env node
/**
 * UserPromptSubmit hook — keeps BYAN's voice present near the live edge each turn.
 *
 * Most turns inject a COMPACT voice anchor (~95 tokens). Every Nth turn re-inject
 * the FULL tao instead, so on a long session the heart is refreshed close to the
 * live edge. N defaults to 12 (override with BYAN_TAO_REFRESH_EVERY; <= 0 disables
 * the refresh, anchor every turn). The per-turn counter lives under _byan-output/
 * (gitignored) and is reset at SessionStart by inject-tao.js, so the cadence
 * restarts from each fresh full-tao load.
 *
 * Layered guarantee (best-effort, honest about its floor): each turn is a separate
 * process, so the cadence needs a WRITABLE counter file to advance. If _byan-output/
 * cannot be written, the counter cannot advance and this hook degrades to the anchor
 * every turn -- it never crashes (exit 0), and the full heart still returns via
 * inject-tao at SessionStart AND after every compaction (source=compact, pinned by
 * the F1 test). So the periodic refresh is the in-window ENHANCEMENT; the
 * SessionStart/compaction re-injection is the FLOOR that always holds. A persistent
 * degradation means _byan-output/ is not writable -- check its permissions.
 *
 * The full tao is read via inject-tao.buildTaoContext (single source, no
 * duplication; require is side-effect-free thanks to its require.main guard).
 * Always exits 0 ; never blocks prompt submission.
 */

const fs = require('fs');
const path = require('path');
const { buildTaoContext, turnCounterPath } = require('./inject-tao');

const ANCHOR = [
  'Voix BYAN (rappel par tour ; tao complet chargé au démarrage de session) :',
  '- Tutoiement, registre artisan-senior, direct sans être brusque, concis.',
  '- Challenge avant de confirmer ; questionne les absolus (Mantra IA-16).',
  '- Signatures : "Attends — pourquoi ?", "OK. On construit.", "Ça, c\'est du générique.".',
  '- Zéro emoji. Orienté solution : on cherche la meilleure option, pas le mur.',
].join('\n');

const DEFAULT_REFRESH_EVERY = 12;

function buildVoiceAnchor() {
  return ANCHOR;
}

// Turns between full-tao refreshes. Invalid/absent env -> default. A value <= 0
// disables the periodic refresh (anchor every turn) -- an explicit opt-out.
function refreshEvery(env = process.env) {
  const n = parseInt(env.BYAN_TAO_REFRESH_EVERY, 10);
  return Number.isInteger(n) ? n : DEFAULT_REFRESH_EVERY;
}

function readTurn(projectDir) {
  try {
    const n = parseInt(fs.readFileSync(turnCounterPath(projectDir), 'utf8').trim(), 10);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeTurn(projectDir, n) {
  try {
    const p = turnCounterPath(projectDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, String(n));
  } catch {
    // Never block prompt submission.
  }
}

// Pure cadence decision. Every Nth turn (N > 0) surfaces the full tao when it is
// available; otherwise the compact anchor. Kept pure so the cadence is unit-testable
// without fs.
function decideAnchor({ turn, every, fullTao }) {
  if (every > 0 && turn % every === 0 && fullTao) {
    return { mode: 'full', additionalContext: fullTao };
  }
  return { mode: 'anchor', additionalContext: ANCHOR };
}

if (require.main === module) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const every = refreshEvery();
  const turn = readTurn(projectDir) + 1;
  writeTurn(projectDir, turn);
  const fullTao = every > 0 && turn % every === 0 ? buildTaoContext(projectDir) : '';
  const { additionalContext } = decideAnchor({ turn, every, fullTao });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
    })
  );
}

module.exports = {
  buildVoiceAnchor,
  ANCHOR,
  refreshEvery,
  readTurn,
  writeTurn,
  decideAnchor,
  DEFAULT_REFRESH_EVERY,
};
