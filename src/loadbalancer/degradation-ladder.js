/**
 * degradation-ladder — the 4-rung switch policy that answers the 5h pain.
 *
 * Driven by the subscription-window tracker (F2), NOT by 429s: it moves work to
 * the secondary pool as the primary's rolling 5h budget heats up, BEFORE the wall
 * — the whole point ("j'en ai marre de reach ma limite 5h"). It obeys the red
 * line (F4, switch-tolerance): only delegable work crosses to Codex; BYAN's
 * judgment/identity work stays on the primary, and queues rather than denatures
 * when the primary is truly spent.
 *
 * Pure: takes a snapshot { primary, secondaries, pools: { name: poolState } } and
 * a task nature; returns a routing decision. poolState is
 * { windowProximity (0-1|null), pressureRecommendation ('ok'|'caution'|'switch_now'),
 *   canAccept (bool), usable (bool) }. No clocks, no I/O — the caller assembles the
 * snapshot from LoadBalancerLive.getWindowStates() + tracker states.
 */

const { isDelegable } = require('./switch-tolerance');

const RUNGS = Object.freeze({
  HEALTHY: 'HEALTHY',
  PRIMARY_HOT: 'PRIMARY_HOT',
  PRIMARY_EXHAUSTED: 'PRIMARY_EXHAUSTED',
  ALL_EXHAUSTED: 'ALL_EXHAUSTED',
});

const CAUTION = 0.5;
const SWITCH_NOW = 0.8;

function poolExhausted(p) {
  if (!p) return true;
  if (p.canAccept === false) return true;
  if (p.pressureRecommendation === 'switch_now') return true;
  if (typeof p.windowProximity === 'number' && p.windowProximity >= SWITCH_NOW) return true;
  return false;
}

function poolHot(p) {
  if (!p || poolExhausted(p)) return false;
  if (p.pressureRecommendation === 'caution') return true;
  if (typeof p.windowProximity === 'number' && p.windowProximity >= CAUTION) return true;
  return false;
}

function poolUsable(p) {
  return !!p && p.usable !== false && p.canAccept !== false && !poolExhausted(p);
}

function firstUsableSecondary(snapshot) {
  for (const name of snapshot.secondaries || []) {
    if (poolUsable(snapshot.pools[name])) return name;
  }
  return null;
}

// System-level rung (independent of the task nature).
function computeRung(snapshot) {
  const primary = snapshot.pools[snapshot.primary];
  const usableSecondary = firstUsableSecondary(snapshot);

  if (poolExhausted(primary)) {
    return {
      rung: usableSecondary ? RUNGS.PRIMARY_EXHAUSTED : RUNGS.ALL_EXHAUSTED,
      usableSecondary,
    };
  }
  if (poolHot(primary)) return { rung: RUNGS.PRIMARY_HOT, usableSecondary };
  return { rung: RUNGS.HEALTHY, usableSecondary };
}

// Routing decision for ONE task, given its nature. Returns
// { action: 'route'|'queue', target: providerName|null, rung, delegable, reason }.
function decideRoute(snapshot, nature) {
  const { rung, usableSecondary } = computeRung(snapshot);
  const primary = snapshot.primary;
  const primaryPool = snapshot.pools[primary];
  const delegable = isDelegable(nature);

  // Red line: primary-only work (judgment/identity) never crosses to a secondary.
  if (!delegable) {
    if (primaryPool && primaryPool.canAccept !== false) {
      return {
        action: 'route',
        target: primary,
        rung,
        delegable: false,
        reason: `primary-only nature '${nature}' stays on ${primary} (red line: no denaturing), even at rung ${rung}`,
      };
    }
    return {
      action: 'queue',
      target: null,
      rung,
      delegable: false,
      reason: `primary '${primary}' cannot accept and nature '${nature}' is primary-only — queue rather than denature by crossing to a secondary`,
    };
  }

  // Delegable work follows the pressure.
  if (rung === RUNGS.HEALTHY) {
    return { action: 'route', target: primary, rung, delegable: true, reason: `primary ${primary} healthy — no switch needed` };
  }

  if (usableSecondary) {
    return {
      action: 'route',
      target: usableSecondary,
      rung,
      delegable: true,
      reason: `primary ${primary} at rung ${rung} — delegable '${nature}' offloaded to ${usableSecondary}`,
    };
  }

  // No usable secondary. Ride the primary while it still accepts, else queue.
  if (primaryPool && primaryPool.canAccept !== false) {
    return { action: 'route', target: primary, rung, delegable: true, reason: `no usable secondary at rung ${rung} — riding ${primary} (degraded)` };
  }
  return { action: 'queue', target: null, rung, delegable: true, reason: `all pools exhausted at rung ${rung} — queue with backoff` };
}

module.exports = { computeRung, decideRoute, RUNGS, poolExhausted, poolHot, poolUsable, CAUTION, SWITCH_NOW };
