/**
 * lib/channel-poll.js — Boucle de poll outbox byan_web pour le channel CC.
 *
 * POURQUOI ce module est séparé de channel-server.js : isoler le réseau
 * permet de le mocker proprement dans les tests sans toucher au serveur MCP.
 *
 * Contrat API (réconcilié avec les routes F2b dans api/routes/sessions-cli.js) :
 *   GET  /api/sessions/outbox
 *        -> { data: [{ id, session_id, content, meta? }] }
 *        Les messages sont scoped au user via le token (RBAC serveur).
 *   POST /api/sessions/:session_id/outbox/:msg_id/ack
 *        -> { ok: true }
 *        Marque le message comme livré ; l'API doit être idempotente.
 *
 * Sécurité / gate sender : le poll utilise le token byan_web du user (scope
 * user). La barrière anti-injection réelle est le RBAC owner côté serveur :
 * seuls les messages des sessions appartenant à ce user sont dans l'outbox.
 * Ce module ne filtre pas davantage : le gate est la vraie barrière.
 */

const DEFAULT_POLL_INTERVAL_MS = 5_000; // 5 s — équilibre réactivité / charge API
const DEFAULT_TIMEOUT_MS = 8_000;        // abort si l'API ne répond pas

/**
 * Crée et démarre une boucle de poll vers l'outbox byan_web.
 *
 * @param {object} opts
 * @param {string}   opts.apiUrl          Base URL byan_web (sans /api final)
 * @param {string}   opts.apiToken        Token byan_web du user (ApiKey scheme)
 * @param {Function} opts.onMessage       Callback async (msg) => void, appelé pour chaque message pending
 * @param {number}   [opts.intervalMs]    Intervalle entre polls (défaut 5 s)
 * @param {object}   [opts.fetchImpl]     Override fetch pour les tests
 * @returns {{ stop: Function }}          Stopper la boucle
 */
export function startPollLoop({ apiUrl, apiToken, onMessage, intervalMs, fetchImpl }) {
  const interval = intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fetchFn  = fetchImpl ?? globalThis.fetch;

  let active = true;
  let timer = null;

  const authHeaders = () => {
    // byan_web exige ApiKey pour les tokens préfixés byan_, Bearer sinon.
    const scheme = apiToken && apiToken.startsWith('byan_') ? 'ApiKey' : 'Bearer';
    return { Authorization: `${scheme} ${apiToken}` };
  };

  async function poll() {
    if (!active) return;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
      let res;
      try {
        res = await fetchFn(`${apiUrl}/api/sessions/outbox`, {
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        // Best-effort : ne pas interrompre la boucle sur une erreur transitoire.
        // 401/403 sont loggés mais pas relancés (le token est fixe dans cette session).
        if (res.status === 401 || res.status === 403) {
          process.stderr.write(`[byan-channel] outbox auth error ${res.status} — vérifier BYAN_API_TOKEN\n`);
        }
        return;
      }

      const body = await res.json();
      const messages = Array.isArray(body?.data) ? body.data : [];

      for (const msg of messages) {
        if (!msg || !msg.id || !msg.session_id) continue;

        // Livrer le message au channel (notification MCP).
        try {
          await onMessage(msg);
        } catch (err) {
          process.stderr.write(`[byan-channel] onMessage error: ${err.message}\n`);
        }

        // Acquitter le message : marque "livré" côté serveur.
        // Contrat F2b : POST /api/sessions/:session_id/outbox/:msg_id/ack
        // Idempotent — si l'ack échoue on retente au prochain poll (le message
        // réapparaît dans l'outbox, ce qui entraîne une double notification).
        // La double notification est préférable à un message perdu.
        try {
          const ackCtrl = new AbortController();
          const ackTimeout = setTimeout(() => ackCtrl.abort(), DEFAULT_TIMEOUT_MS);
          try {
            await fetchFn(
              `${apiUrl}/api/sessions/${encodeURIComponent(msg.session_id)}/outbox/${encodeURIComponent(msg.id)}/ack`,
              { method: 'POST', headers: authHeaders(), signal: ackCtrl.signal }
            );
          } finally {
            clearTimeout(ackTimeout);
          }
        } catch (ackErr) {
          // Ack raté = best-effort ; on ne bloque pas la livraison.
          process.stderr.write(`[byan-channel] ack failed for msg ${msg.id}: ${ackErr.message}\n`);
        }
      }
    } catch (err) {
      // Réseau injoignable : best-effort, on retente au prochain tick.
      if (err.name !== 'AbortError') {
        process.stderr.write(`[byan-channel] poll error: ${err.message}\n`);
      }
    } finally {
      if (active) {
        // Programmer le prochain poll seulement si la boucle est encore active.
        timer = setTimeout(poll, interval);
      }
    }
  }

  // Démarrage immédiat puis périodique.
  timer = setTimeout(poll, 0);

  return {
    stop() {
      active = false;
      if (timer) clearTimeout(timer);
    },
  };
}
