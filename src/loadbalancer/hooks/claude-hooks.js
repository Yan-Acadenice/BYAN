/**
 * Claude Hooks — Rate Limit Detection for Claude Agent SDK
 *
 * Integrates with Claude Agent SDK hooks (PostToolUseFailure, Stop)
 * to detect rate limit errors and feed them to RateLimitTracker.
 */

/**
 * Create Claude hook handlers that report rate limits to the tracker.
 * @param {import('../rate-limit-tracker').RateLimitTracker} tracker
 * @returns {object} Hook configuration for Claude Agent SDK
 */
function createClaudeHooks(tracker) {
  return {
    PostToolUseFailure: [
      {
        matcher: { toolName: '*' },
        callback: (event) => {
          const error = event.error || {};
          const isRateLimit =
            error.name === 'RateLimitError' ||
            error.status === 429 ||
            (error.message && error.message.includes('rate_limit'));

          if (isRateLimit) {
            const retryAfter = error.headers?.['retry-after'] || error.retryAfter;
            tracker.record429({
              source: 'claude-hook',
              toolName: event.toolName,
              retryAfter,
            });
          }
        },
      },
    ],

    Stop: [
      {
        matcher: {},
        callback: (event) => {
          const reason = event.reason || '';
          if (reason.includes('rate_limit') || reason.includes('overloaded')) {
            tracker.record429({ source: 'claude-stop', reason });
          } else {
            tracker.recordSuccess();
          }
        },
      },
    ],
  };
}

module.exports = { createClaudeHooks };
