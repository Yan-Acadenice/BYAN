// Line-oriented UTF-8 accumulator for a CLI's JSONL stdout.
//
// Two stream realities are handled here so every engine gets them for free:
//   - a multi-byte UTF-8 char (accented French, emoji) split across two data
//     chunks must not be mangled -> StringDecoder carries the partial bytes;
//   - the last event can arrive WITHOUT a closing newline -> flush() drains
//     the decoder tail + the trailing partial line at stream end / exit.

import { StringDecoder } from 'string_decoder';

export class LineAccumulator {
  private buffer = '';
  private decoder = new StringDecoder('utf8');

  // Feed a chunk; get back the COMPLETE non-empty lines it closed.
  push(chunk: Buffer): string[] {
    this.buffer += this.decoder.write(chunk);
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    return lines.map((l) => l.trim()).filter((l) => l.length > 0);
  }

  // Drain the tail once (stream end / process exit). Null when nothing is left.
  flush(): string | null {
    this.buffer += this.decoder.end();
    const line = this.buffer.trim();
    this.buffer = '';
    return line.length > 0 ? line : null;
  }
}
