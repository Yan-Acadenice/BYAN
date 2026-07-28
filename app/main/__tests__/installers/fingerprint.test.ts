// Telling "the template moved" apart from "the user edited our file".
//
// planOne used to answer three ways: same content -> skip, absent -> create,
// different -> update. That last one hides two opposite situations:
//
//   the TEMPLATE changed since we wrote the file  -> overwriting is the point
//   the USER changed the file after we wrote it   -> overwriting destroys work
//
// Both were 'update', and applyPlans overwrote both without a word. Separating
// them needs one extra fact: what the content was WHEN WE WROTE IT. That is the
// fingerprint, and this module is the decision that consumes it.

import { describe, expect, it } from 'vitest';
import { classifyAction, hashContent } from '../../installers/fingerprint';

const TEMPLATE = 'template v2\n';
const AS_WE_WROTE_IT = 'template v1\n';
const HAND_EDITED = 'template v1\n+ my own line\n';

describe('hashContent', () => {
  it('is stable for the same content', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
  });

  it('differs for different content', () => {
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });

  it('notices a change of only whitespace', () => {
    // A trailing newline added by an editor IS a hand edit; the point of the
    // fingerprint is to be told, not to guess what matters.
    expect(hashContent('abc')).not.toBe(hashContent('abc\n'));
  });
});

describe('classifyAction', () => {
  it('creates when the file is absent', () => {
    expect(classifyAction({
      destExists: false, destContent: null, templateContent: TEMPLATE, recordedHash: null,
    })).toBe('create');
  });

  it('skips when the file already matches the template', () => {
    expect(classifyAction({
      destExists: true, destContent: TEMPLATE, templateContent: TEMPLATE, recordedHash: null,
    })).toBe('skip');
  });

  it('updates when the file is exactly as we left it and the template moved', () => {
    // We wrote v1, the file is still v1, the template is now v2. Overwriting is
    // the whole purpose of the operation.
    expect(classifyAction({
      destExists: true,
      destContent: AS_WE_WROTE_IT,
      templateContent: TEMPLATE,
      recordedHash: hashContent(AS_WE_WROTE_IT),
    })).toBe('update');
  });

  it('reports a CONFLICT when the file changed after we wrote it', () => {
    // We wrote v1, the file is no longer v1, so somebody edited it. This is the
    // case that used to be silently overwritten.
    expect(classifyAction({
      destExists: true,
      destContent: HAND_EDITED,
      templateContent: TEMPLATE,
      recordedHash: hashContent(AS_WE_WROTE_IT),
    })).toBe('conflict');
  });

  it('reports a conflict even when the template did not move', () => {
    // We wrote v1, the template is still v1, the file is not v1. The user's edit
    // is the only difference, and it is exactly what must not be lost.
    expect(classifyAction({
      destExists: true,
      destContent: HAND_EDITED,
      templateContent: AS_WE_WROTE_IT,
      recordedHash: hashContent(AS_WE_WROTE_IT),
    })).toBe('conflict');
  });

  it('falls back to update when nothing was ever recorded', () => {
    // No record means we cannot tell the two apart, and claiming a conflict we
    // cannot prove would cry wolf on every pre-existing file. 'update' keeps the
    // previous behaviour for that case, and it degrades honestly: a machine with
    // no history behaves exactly as the app did before.
    expect(classifyAction({
      destExists: true, destContent: HAND_EDITED, templateContent: TEMPLATE, recordedHash: null,
    })).toBe('update');
  });

  it('a recorded hash of an absent file still creates', () => {
    // The user deleted a file we had written. Recreating it is not a conflict:
    // there is nothing of theirs left to lose.
    expect(classifyAction({
      destExists: false,
      destContent: null,
      templateContent: TEMPLATE,
      recordedHash: hashContent(AS_WE_WROTE_IT),
    })).toBe('create');
  });

  it('a hand edit that happens to equal the new template is a skip, not a conflict', () => {
    // The user typed exactly what the template now says. There is no divergence
    // left to resolve, so flagging it would be noise.
    expect(classifyAction({
      destExists: true,
      destContent: TEMPLATE,
      templateContent: TEMPLATE,
      recordedHash: hashContent(AS_WE_WROTE_IT),
    })).toBe('skip');
  });
});
