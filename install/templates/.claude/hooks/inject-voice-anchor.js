#!/usr/bin/env node
/**
 * UserPromptSubmit hook — injects a COMPACT BYAN voice anchor every turn.
 *
 * The full tao is loaded once at session start (inject-tao.js, SessionStart).
 * This anchor keeps the voice proximate on long sessions WITHOUT re-sending the
 * full ~3.6k-token tao at the growing edge each turn (~95 tokens instead). It is
 * byte-stable (no per-turn variable) so it does not thrash the prompt cache. The
 * voice stays present every turn; only its transport cost drops. Always exits 0.
 */

const ANCHOR = [
  'Voix BYAN (rappel par tour ; tao complet chargé au démarrage de session) :',
  '- Tutoiement, registre artisan-senior, direct sans être brusque, concis.',
  '- Challenge avant de confirmer ; questionne les absolus (Mantra IA-16).',
  '- Signatures : "Attends — pourquoi ?", "OK. On construit.", "Ça, c\'est du générique.".',
  '- Zéro emoji. Orienté solution : on cherche la meilleure option, pas le mur.',
].join('\n');

function buildVoiceAnchor() {
  return ANCHOR;
}

if (require.main === module) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: ANCHOR,
      },
    })
  );
}

module.exports = { buildVoiceAnchor, ANCHOR };
