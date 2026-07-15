import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  KINDS,
  BROADCAST,
  makeEntry,
  entriesForAgent,
  pendingQuestions,
  renderForAgent,
  blackboardPath,
  appendEntry,
  readEntries,
} from '../lib/dispatch-blackboard.js';

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-bb-'));
}

// --- makeEntry ------------------------------------------------------------

test('makeEntry normalizes turn, kind, and trims content; unknown kind -> note', () => {
  const e = makeEntry({ turn: 3, from: ' arch ', to: ' dev ', kind: 'design', content: '  hello  ' });
  assert.deepEqual(e, { turn: 3, from: 'arch', to: 'dev', kind: 'design', content: 'hello' });
  assert.equal(makeEntry({ kind: 'bogus' }).kind, KINDS.NOTE);
  assert.equal(makeEntry({ turn: -5 }).turn, 0);
  assert.equal(makeEntry({}).to, BROADCAST);
});

// --- entriesForAgent ------------------------------------------------------

test('entriesForAgent returns broadcasts, messages to me, and my own', () => {
  const entries = [
    makeEntry({ turn: 1, from: 'arch', to: BROADCAST, content: 'hi all' }),
    makeEntry({ turn: 2, from: 'arch', to: 'dev', content: 'for dev' }),
    makeEntry({ turn: 3, from: 'other', to: 'someone-else', content: 'not for dev' }),
    makeEntry({ turn: 4, from: 'dev', to: 'arch', content: 'devs own msg' }),
  ];
  const forDev = entriesForAgent(entries, 'dev');
  assert.equal(forDev.length, 3);
  assert.ok(!forDev.some((e) => e.content === 'not for dev'));
});

// --- pendingQuestions -----------------------------------------------------

test('pendingQuestions: a question is pending until a later answer to its asker', () => {
  const entries = [
    makeEntry({ turn: 1, from: 'dev', to: 'arch', kind: KINDS.QUESTION, content: 'which db?' }),
  ];
  assert.equal(pendingQuestions(entries).length, 1);
  entries.push(makeEntry({ turn: 2, from: 'arch', to: 'dev', kind: KINDS.ANSWER, content: 'postgres' }));
  assert.equal(pendingQuestions(entries).length, 0);
});

test('pendingQuestions: an answer BEFORE the question does not count', () => {
  const entries = [
    makeEntry({ turn: 1, from: 'arch', to: 'dev', kind: KINDS.ANSWER, content: 'early' }),
    makeEntry({ turn: 2, from: 'dev', to: 'arch', kind: KINDS.QUESTION, content: 'later q' }),
  ];
  assert.equal(pendingQuestions(entries).length, 1);
});

// --- renderForAgent -------------------------------------------------------

test('renderForAgent shows an ordered, directional transcript; empty when nothing', () => {
  assert.match(renderForAgent([], 'arch'), /vide/);
  const entries = [
    makeEntry({ turn: 1, from: 'arch', to: 'dev', kind: KINDS.DESIGN, content: 'use ports' }),
    makeEntry({ turn: 2, from: 'dev', to: 'arch', kind: KINDS.QUESTION, content: 'which port lib?' }),
  ];
  const r = renderForAgent(entries, 'dev');
  assert.match(r, /t1 arch -> dev\] design: use ports/);
  assert.match(r, /t2 dev -> arch\] question: which port lib\?/);
});

// --- I/O roundtrip --------------------------------------------------------

test('blackboardPath sanitizes the session id', () => {
  const p = blackboardPath('/proj', 'a/b c:d');
  assert.match(p, /dispatch\/a_b_c_d\/blackboard\.jsonl$/);
});

test('appendEntry then readEntries roundtrips through the JSONL sidecar', () => {
  const dir = tmpProject();
  const sid = '20260715-x';
  assert.equal(readEntries(dir, sid).length, 0); // missing file -> []
  appendEntry(dir, sid, { turn: 1, from: 'arch', to: 'dev', kind: KINDS.DESIGN, content: 'plan' });
  appendEntry(dir, sid, { turn: 2, from: 'dev', to: 'arch', kind: KINDS.RESULT, content: 'done' });
  const back = readEntries(dir, sid);
  assert.equal(back.length, 2);
  assert.equal(back[0].content, 'plan');
  assert.equal(back[1].kind, KINDS.RESULT);
});

test('readEntries skips malformed lines instead of throwing', () => {
  const dir = tmpProject();
  const sid = 's';
  const p = blackboardPath(dir, sid);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{"turn":1,"from":"a","to":"*","kind":"note","content":"ok"}\nGARBAGE\n');
  const back = readEntries(dir, sid);
  assert.equal(back.length, 1);
  assert.equal(back[0].content, 'ok');
});
