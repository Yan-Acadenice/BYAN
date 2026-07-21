import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateContract, stripMetaLiteral } from '../lib/workflows-lint.js';
import { classifyLeaf, isDowngradeModel, LEAF_TYPES } from '../lib/native-tiers.js';

// Integration guard for the model-routing feature (F4). It asserts the SHIPPED
// native scripts honour the contract end-to-end, so a future edit that downgrades
// a protected leaf (or uses an unknown model) fails the suite, not just the
// pre-commit gate. This is the durable value of the chantier: the invariant is
// pinned by a test, not only by author discipline.

const WORKFLOWS_DIR = path.resolve(import.meta.dirname, '../../../../.claude/workflows');
const MODEL_RE = /\bmodel:\s*(['"`])([^'"`]*)\1/g;
const LABEL_RE = /\blabel:\s*(['"`])([^'"`]*)\1/g;

function scriptFiles() {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(WORKFLOWS_DIR, f));
}

test('the .claude/workflows directory exists and holds native scripts', () => {
  const files = scriptFiles();
  assert.ok(files.length >= 1, 'expected at least one native workflow script');
});

test('every shipped native script passes the full contract (incl. model-routing)', () => {
  for (const file of scriptFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const violations = validateContract(src);
    assert.deepEqual(
      violations,
      [],
      `${path.basename(file)} has contract violations: ${JSON.stringify(violations)}`,
    );
  }
});

test('every model: downgrade in a shipped script sits on its matching leaf class', () => {
  let haikuDowngrades = 0;
  let sonnetDowngrades = 0;
  for (const file of scriptFiles()) {
    // meta.phases entries may carry a legit unlabelled model (display field)
    const src = stripMetaLiteral(fs.readFileSync(file, 'utf8'));
    MODEL_RE.lastIndex = 0;
    let m;
    while ((m = MODEL_RE.exec(src))) {
      if (!isDowngradeModel(m[2])) continue;
      // nearest preceding label in the same opts object
      const before = src.slice(0, m.index);
      let lbl = null;
      let lm;
      LABEL_RE.lastIndex = 0;
      while ((lm = LABEL_RE.exec(before))) lbl = { value: lm[2], end: lm.index + lm[0].length };
      assert.ok(lbl && !before.slice(lbl.end).includes('}'), `${path.basename(file)}: downgrade without an in-object label`);
      const cls = classifyLeaf({ label: lbl.value });
      // Shipped-set discipline is TIGHTER than the linter floor: haiku sits on
      // exploration only, sonnet on explicit mech- leaves or ANALYSIS leaves
      // (sonnet is the analysis tier — byan-auto-dispatch:analyse-decoupage is
      // the first shipped use; the linter also tolerates sonnet-on-exploration,
      // no shipped script uses it).
      if (m[2] === 'haiku') {
        haikuDowngrades += 1;
        assert.equal(cls, LEAF_TYPES.EXPLORATION,
          `${path.basename(file)}: leaf '${lbl.value}' carries haiku but is not exploration`);
      } else {
        sonnetDowngrades += 1;
        assert.ok(cls === LEAF_TYPES.MECHANICAL || cls === LEAF_TYPES.ANALYSIS,
          `${path.basename(file)}: leaf '${lbl.value}' carries sonnet but is neither mech- nor analysis`);
      }
    }
  }
  // The feature must actually be applied, not silently a no-op. The floor tracks
  // the known downgraded set: 5 original (dev-story:load-story + 4 excalidraw
  // load-resources) + 6 from widen-safe-downgrades (document-project scan-existing-docs
  // & source-tree, plus the 4 excalidraw context-read leaves) = 11 haiku, plus the
  // 2 mech- conversions from the F5 tier audit (sprint-planning
  // mech-validate-status, testarch-trace mech-gate-decision) = 2 sonnet. A revert
  // that drops below either floor is a deliberate edit and must move it here.
  assert.ok(haikuDowngrades >= 11, `expected the 11 known exploration downgrades, found ${haikuDowngrades}`);
  assert.ok(sonnetDowngrades >= 2, `expected the 2 known mechanical downgrades, found ${sonnetDowngrades}`);
});
