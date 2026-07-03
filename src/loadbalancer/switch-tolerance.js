/**
 * switch-tolerance — WHICH task natures may cross to a secondary provider pool.
 *
 * The load-balancer's model tier answers "which model" (native-tiers). THIS
 * answers the orthogonal, identity-critical axis the user drew as the red line:
 * "reduce tokens WITHOUT denaturing BYAN". Degradation (F5) may offload only
 * DELEGABLE work to a secondary pool (Codex): mechanical checks (machine-
 * verifiable output), exploration (read/scan), and implementation (where tests
 * are the objective arbiter, provider-independent). Everything that carries
 * BYAN's judgment or identity — verification (adversarial/semantic), analysis,
 * and anything soul/identity/review/gate — stays on the primary (Claude) whatever
 * the subscription pressure. This module is the single source of that line.
 *
 * Pure and dependency-light: an optional CapabilityMatrix filters secondaries by
 * required capability, but the tolerance decision itself is a static classification.
 */

const DELEGABLE_NATURES = Object.freeze(['exploration', 'mechanical', 'implementation']);
const PRIMARY_ONLY_NATURES = Object.freeze([
  'verification', // adversarial / semantic review = BYAN judgment
  'analysis', // design / risk / evaluation = BYAN judgment
  'soul', // identity
  'identity',
  'review', // the adversarial second pair of eyes stays on the primary
  'gate', // phase / strict gates
]);

const SWITCH_TOLERANCE = Object.freeze({
  ...Object.fromEntries(DELEGABLE_NATURES.map((n) => [n, 'delegable'])),
  ...Object.fromEntries(PRIMARY_ONLY_NATURES.map((n) => [n, 'primary-only'])),
});

// Conservative: only an explicitly-delegable nature is delegable. Unknown /
// missing nature => primary-only (never delegate on a guess — the red line).
function isDelegable(nature) {
  return SWITCH_TOLERANCE[nature] === 'delegable';
}

// eligibleProviders(nature, { primary, secondaries, capabilityMatrix, required })
// -> ordered provider list, primary first. A primary-only nature returns only the
// primary. A delegable nature returns primary + secondaries that satisfy the
// required capabilities (when a matrix + required list are supplied).
function eligibleProviders(nature, opts = {}) {
  const { primary, secondaries = [], capabilityMatrix = null, required = [] } = opts;
  if (!primary) return [];
  if (!isDelegable(nature)) return [primary];

  let allowed = secondaries;
  if (capabilityMatrix && required.length > 0) {
    allowed = secondaries.filter((name) =>
      required.every((cap) => capabilityMatrix.supports(name, cap))
    );
  }
  return [primary, ...allowed.filter((n) => n !== primary)];
}

module.exports = {
  SWITCH_TOLERANCE,
  DELEGABLE_NATURES,
  PRIMARY_ONLY_NATURES,
  isDelegable,
  eligibleProviders,
};
