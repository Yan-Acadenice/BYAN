#!/usr/bin/env node
/**
 * UserPromptSubmit hook — BYAN Strict Mode context injector.
 *
 * Two behaviors :
 *   - When a strict session is engaged, inject the strict banner plus a live
 *     status line (passes done / required, locked scope hash) so the agent
 *     stays anchored to the contract on every turn.
 *   - When no session is engaged but the user's prompt contains an activation
 *     keyword (prod, production, client, contrat, ...), inject a suggestion to
 *     lock strict mode before building. It suggests, it does not auto-lock.
 *
 * Emits empty context on any error.
 */

const {
  loadConfig,
  loadState,
  isEngaged,
  passCount,
  lastVerdict,
  readStdin,
  parseJson,
} = require('./lib/strict-runtime');

function findKeyword(prompt, keywords) {
  if (!prompt || !Array.isArray(keywords)) return null;
  const lower = prompt.toLowerCase();
  for (const k of keywords) {
    const kw = String(k).toLowerCase();
    if (/^[a-z]+$/.test(kw)) {
      if (new RegExp(`\\b${kw}\\b`).test(lower)) return k;
    } else if (lower.includes(kw)) {
      return k;
    }
  }
  return null;
}

// Pure : returns the additionalContext string (possibly empty).
function buildContext({ state, config, prompt }) {
  if (isEngaged(state)) {
    const minPasses = (config && config.min_passes) || 3;
    const banner = (config && config.banners && config.banners.context) || '[STRICT MODE ACTIVE]';
    const done = passCount(state);
    const hash = state.scope_lock ? state.scope_lock.scope_hash : 'unknown';
    return (
      `${banner}\n` +
      `Locked scope: ${hash} | self-verify ${done}/${minPasses} | last verdict ${lastVerdict(state) || 'none'}.\n` +
      `Stay inside the locked scope. Do not declare done before byan_strict_complete returns an audit token.`
    );
  }

  const keyword = findKeyword(prompt, config && config.auto_keywords);
  if (keyword) {
    return (
      `[STRICT MODE SUGGESTED]\n` +
      `The request mentions "${keyword}", which signals a production-grade deliverable. ` +
      `Before building, consider locking strict mode with byan_strict_lock_scope ` +
      `(verbatim scope + testable acceptance criteria). Strict mode enforces ` +
      `>= ${(config && config.min_passes) || 3} self-verify passes and a 95% confidence floor on hard claims. ` +
      `Confirm with the user, then lock.`
    );
  }

  return '';
}

if (require.main === module) {
  (async () => {
    const state = loadState();
    const config = loadConfig();
    const payload = parseJson(await readStdin());
    const prompt = payload.prompt || payload.user_prompt || payload.userPrompt || '';

    const additionalContext = buildContext({ state, config, prompt });
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
      })
    );
    process.exit(0);
  })();
}

module.exports = { buildContext, findKeyword };
