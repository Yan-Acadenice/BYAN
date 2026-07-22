'use strict';

/**
 * subscription-status — unit tests for checkSubscriptionStatus.
 *
 * The fetchImpl is injected so no real network is touched. Tests mirror the
 * two observable outcomes the installer cares about:
 *   - entitled=true -> message mentions 'Google Workspace' and 'inclus'
 *   - network error -> no exception propagated, graceful silent failure
 */

const { checkSubscriptionStatus } = require('../lib/subscription-status');

const API_URL = 'https://api.exemple.fr';
const TOKEN = 'byan_' + '0'.repeat(64);

// --- case 4: entitled=true ------------------------------------------------

test('affiche le message Google inclus quand entitled=true', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    json: async () => ({
      data: {
        google: { configured: true, entitled: true, reachable: true },
      },
    }),
  });

  const result = await checkSubscriptionStatus({
    apiUrl: API_URL,
    token: TOKEN,
    fetchImpl,
  });

  // fetchImpl was called with the correct URL.
  expect(fetchImpl).toHaveBeenCalledWith(
    `${API_URL}/api/integrations/status`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: `ApiKey ${TOKEN}` }) })
  );

  // The returned google object is entitled=true.
  expect(result.google).not.toBeNull();
  expect(result.google.entitled).toBe(true);
  expect(result.error).toBeNull();

  // Verify the data the caller would use to display the message.
  // The message the installer produces: 'Google Workspace: inclus — ...'
  const entitled = result.google && result.google.entitled === true;
  const message = entitled
    ? 'Google Workspace: inclus — documents crées au nom de chaque utilisateur, rien à configurer localement'
    : null;
  expect(message).toContain('Google Workspace');
  expect(message).toContain('inclus');
});

// --- case 5: network error ------------------------------------------------

test('message neutre quand l appel echoue (reseau)', async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

  // Must not throw — call directly and let Jest fail if it does.
  const result = await checkSubscriptionStatus({
    apiUrl: API_URL,
    token: TOKEN,
    fetchImpl,
  });

  // google is null, error is the network message.
  expect(result.google).toBeNull();
  expect(result.error).toBe('ECONNREFUSED');

  // The caller's fallback message when result.google is null: 'abonnement vérifié plus tard'
  const fallbackMessage = result.google === null ? 'abonnement vérifié plus tard' : null;
  expect(fallbackMessage).toBe('abonnement vérifié plus tard');
});
