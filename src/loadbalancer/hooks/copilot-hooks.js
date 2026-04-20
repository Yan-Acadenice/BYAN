/**
 * Copilot Hooks — Rate Limit Detection for GitHub Copilot SDK
 *
 * Intercepts Copilot SDK session events and HTTP responses
 * to detect 429 errors and X-RateLimit headers.
 */

/**
 * Attach rate limit detection to a Copilot SDK session.
 * @param {object} session - Copilot SDK session object
 * @param {import('../rate-limit-tracker').RateLimitTracker} tracker
 */
function attachCopilotHooks(session, tracker) {
  if (!session || !session.on) return;

  session.on('error', (err) => {
    const is429 = err.status === 429 || err.statusCode === 429 ||
      (err.message && err.message.includes('rate limit'));

    if (is429) {
      const headers = err.headers || err.response?.headers || {};
      tracker.record429({
        source: 'copilot-event',
        headers: {
          'x-ratelimit-remaining': headers['x-ratelimit-remaining'],
          'x-ratelimit-reset': headers['x-ratelimit-reset'],
          'retry-after': headers['retry-after'],
        },
      });
    }
  });

  session.on('response', (res) => {
    const headers = res.headers || {};
    if (headers['x-ratelimit-remaining'] || headers['retry-after']) {
      tracker.recordHeaders(headers);
    }
    if (!res.rateLimited) {
      tracker.recordSuccess();
    }
  });
}

/**
 * Wrap a Copilot SDK sendAndWait call with rate limit detection.
 * @param {Function} sendFn - Original sendAndWait function
 * @param {import('../rate-limit-tracker').RateLimitTracker} tracker
 * @returns {Function} Wrapped function
 */
function wrapCopilotSend(sendFn, tracker) {
  return async function wrappedSend(...args) {
    try {
      const result = await sendFn.apply(this, args);
      tracker.recordSuccess();
      return result;
    } catch (err) {
      const is429 = err.status === 429 || err.statusCode === 429 ||
        (err.message && err.message.includes('rate limit'));

      if (is429) {
        const headers = err.headers || err.response?.headers || {};
        tracker.record429({
          source: 'copilot-send',
          headers,
        });
        tracker.recordHeaders(headers);
      }

      throw err;
    }
  };
}

module.exports = { attachCopilotHooks, wrapCopilotSend };
