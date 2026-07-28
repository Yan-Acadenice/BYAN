// What we wrote, so we can tell it apart from what the user changed.
//
// See the test file for the defect this exists to close: 'update' used to cover
// both "the template moved" and "the user hand-edited the file we wrote", and
// applyPlans overwrote both silently.
//
// The record is a content hash per destination path, written at apply time. It
// lives outside the user's project (see install-fingerprints.ts) because it
// describes THIS installation's history, not the project's content.

import { createHash } from 'crypto';
import type { FileWriteAction } from '../../shared/ipc-contract';

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface ClassifyInput {
  destExists: boolean;
  // Null when the file is absent, or unreadable for any reason.
  destContent: string | null;
  templateContent: string;
  // What we recorded writing there last time. Null when we have no record:
  // a fresh machine, a file that predates the feature, or a wiped record.
  recordedHash: string | null;
}

export function classifyAction(input: ClassifyInput): FileWriteAction {
  const { destExists, destContent, templateContent, recordedHash } = input;

  // Nothing on disk: nothing of the user's to lose, whatever we may have written
  // there in the past.
  if (!destExists || destContent === null) return 'create';

  // Already what the template says. True even if the user typed it themselves —
  // there is no divergence left to resolve, so flagging it would be noise.
  if (destContent === templateContent) return 'skip';

  // No record: we genuinely cannot tell a hand edit from a stale copy. Claiming a
  // conflict we cannot prove would cry wolf on every pre-existing file, so this
  // degrades to the behaviour the app had before the fingerprint existed.
  if (!recordedHash) return 'update';

  // The file is byte-for-byte as we left it, so the difference is the template's.
  if (hashContent(destContent) === recordedHash) return 'update';

  // The file moved away from what we wrote. Somebody edited it, and that edit is
  // exactly what an overwrite would destroy.
  return 'conflict';
}
