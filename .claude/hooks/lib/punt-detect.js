// Pure detector for the BYAN punt-guard (F3).
//
// A "punt" is the laziness pattern the user fights: the agent ends its turn by
// telling the human to run a command and paste the output back, when the agent
// could have run it itself this turn. The signal is a CO-OCCURRENCE in the
// finished turn:
//   1. an imperative addressed to the user ("lance", "execute", "colle la
//      sortie", "run this", "paste", "donne-moi le ssh"), AND
//   2. a runnable command (a backticked command, or a `node `/`npm `/`git `/
//      `which `/`curl localhost` invocation), AND
//   3. NO Bash tool-call for that command this turn (the agent did not actually
//      run it — it handed it off).
//
// Carve-out (creds): `git push` and `npm publish` need credentials the server
// running Claude Code does not have. Asking the user to run THOSE is legitimate,
// not a punt — documented in MEMORY (server cannot push). So a command whose
// runnable token is a push/publish is never flagged.
//
// This module is pure decide() — no fs, no stdin — so it is exhaustively
// unit-testable. The hook wires it to the transcript and the arm flag.

'use strict';

// Imperatives addressed to the user that, paired with a runnable command, mean
// "you run it". FR + EN. Matched case-insensitively as loose phrases.
const PUNT_IMPERATIVES = [
  'lance',
  'execute',
  'exécute',
  'colle la sortie',
  'colle le resultat',
  'colle le résultat',
  'run this',
  'run it',
  'paste',
  'donne-moi le ssh',
  'donne moi le ssh',
  'peux-tu lancer',
  'peux tu lancer',
  'lance la commande',
];

// Commands that need creds the server lacks. Asking the user to run these is
// legitimate (not a punt). Order matters only for reporting the matched token.
const CREDS_CARVEOUT = ['git push', 'npm publish'];

// Loose runnable-command detectors. A backticked span, or a bare invocation of
// a common runner at a word boundary. `curl localhost` is included because the
// dev API runs on localhost and the agent can hit it itself.
const RUNNABLE_PATTERNS = [
  /`([^`]+)`/g, // any backticked span
  /\bnode\s+\S+/gi,
  /\bnpm\s+\S+/gi,
  /\bgit\s+\S+/gi,
  /\bwhich\s+\S+/gi,
  /\bcurl\s+localhost\S*/gi,
];

function hasImperativeToUser(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PUNT_IMPERATIVES.some((p) => lower.includes(p));
}

// Returns the first runnable command found in the text, or null. Backticked
// spans win (they are the explicit "here is the command" form); else the first
// bare invocation. The returned string is the matched command text.
function findRunnableCommand(text) {
  if (!text) return null;
  for (const re of RUNNABLE_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      // Backtick pattern captures group 1 (the inner command); the bare-runner
      // patterns have no capture group, so use the full match.
      return (m[1] !== undefined ? m[1] : m[0]).trim();
    }
  }
  return null;
}

// True when the command is a creds-gated push/publish (legitimate to delegate).
function isCredsCarveOut(cmd) {
  if (!cmd) return false;
  const lower = cmd.toLowerCase();
  return CREDS_CARVEOUT.some((c) => lower.includes(c));
}

// True when a Bash tool-call this turn actually ran (something matching) the
// command. We match on the meaningful head token of the command (e.g. "npm
// test" -> we require the Bash command to include "npm test"), so a Bash call
// that ran a DIFFERENT command does not falsely clear the punt. toolCalls is an
// array of { name, command } where command is the Bash tool's command string.
function bashRanCommand(toolCalls, cmd) {
  if (!Array.isArray(toolCalls) || !cmd) return false;
  // Compare on a normalized, whitespace-collapsed head so minor formatting
  // (extra spaces, trailing flags in the prose) does not break the match.
  const needle = cmd.toLowerCase().replace(/\s+/g, ' ').trim();
  const headTokens = needle.split(' ').slice(0, 2).join(' '); // e.g. "npm test"
  return toolCalls.some((tc) => {
    if (!tc || typeof tc.name !== 'string') return false;
    if (!/bash/i.test(tc.name)) return false;
    const ran = String(tc.command || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!ran) return false;
    return ran.includes(needle) || (headTokens.length > 0 && ran.includes(headTokens));
  });
}

// Pure decision. Returns { punt, reason, cmd }.
//   punt  : true IFF imperative-to-user + runnable command + NOT a creds
//           carve-out + NO Bash tool-call ran that command this turn.
//   reason: a short human-readable explanation (or why it is not a punt).
//   cmd   : the runnable command detected (or null).
function decide({ lastAssistantText, toolCallsThisTurn } = {}) {
  const text = lastAssistantText || '';
  const imperative = hasImperativeToUser(text);
  const cmd = findRunnableCommand(text);

  if (!imperative || !cmd) {
    return { punt: false, reason: 'no imperative-to-user + runnable command co-occurrence', cmd: cmd || null };
  }
  if (isCredsCarveOut(cmd)) {
    return { punt: false, reason: `creds carve-out: "${cmd}" needs credentials the server lacks`, cmd };
  }
  if (bashRanCommand(toolCallsThisTurn, cmd)) {
    return { punt: false, reason: `agent ran the command via Bash this turn: "${cmd}"`, cmd };
  }
  return {
    punt: true,
    reason: `punt detected: asked the user to run "${cmd}" without running it via Bash this turn`,
    cmd,
  };
}

module.exports = {
  PUNT_IMPERATIVES,
  CREDS_CARVEOUT,
  hasImperativeToUser,
  findRunnableCommand,
  isCredsCarveOut,
  bashRanCommand,
  decide,
};
