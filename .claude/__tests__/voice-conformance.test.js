'use strict';

// WI-2 — voice-conformance reactive net (soul/tao).
// Pure scanVoice (emoji, vouvoiement cluster), slip roundtrip, the Stop-hook
// detect(), and the voice-anchor relay. Emoji is built from a code point so no
// literal emoji lands in the source (which the zero-emoji guards would flag).

const fs = require('fs');
const os = require('os');
const path = require('path');

const voice = require('../hooks/lib/voice-conformance');
const hook = require('../hooks/voice-conformance-check');
const voiceAnchor = require('../hooks/inject-voice-anchor');

const EMOJI = String.fromCodePoint(0x1F600); // a pictographic emoji, no literal in source
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-voice-')); }

describe('scanVoice', () => {
  test('flags an emoji in the reply (IA-23)', () => {
    const hits = voice.scanVoice(`Bon travail ${EMOJI} on avance`);
    expect(hits.some((h) => h.kind === 'emoji')).toBe(true);
  });
  test('flags a vouvoiement CLUSTER (>= 2), not a single quoted vous', () => {
    expect(voice.scanVoice('Vous devez ouvrir votre fichier').some((h) => h.kind === 'vouvoiement')).toBe(true);
    // a single "vous" (e.g. quoting) does not trip it
    expect(voice.scanVoice('il a dit "vous" une fois').some((h) => h.kind === 'vouvoiement')).toBe(false);
  });
  test('clean BYAN voice (tutoiement, no emoji) -> no hits', () => {
    expect(voice.scanVoice('OK. On construit, tu valides et je lance.')).toEqual([]);
  });
  test('emoji inside a code span is not policed', () => {
    expect(voice.scanVoice(`voici le code \`x = "${EMOJI}"\` a garder`).some((h) => h.kind === 'emoji')).toBe(false);
  });
});

describe('slip flag + reminder', () => {
  test('write/read/clear roundtrip', () => {
    const dir = tmpDir();
    expect(voice.readSlip(dir)).toBe(null);
    voice.writeSlip(dir, [{ kind: 'emoji', good: 'x' }]);
    expect(voice.readSlip(dir).length).toBe(1);
    voice.clearSlip(dir);
    expect(voice.readSlip(dir)).toBe(null);
  });
  test('formatReminder names the tao voice, empty without hits', () => {
    expect(voice.formatReminder([])).toBe('');
    expect(voice.formatReminder([{ kind: 'emoji', good: 'zero emoji' }])).toMatch(/voix|tao/i);
  });
  test('voice-anchor relay appends on a slip, untouched otherwise', () => {
    expect(voiceAnchor.withVoiceReminder('base', null)).toBe('base');
    expect(voiceAnchor.withVoiceReminder('base', [{ kind: 'emoji', good: 'x' }])).toMatch(/base\n/);
  });
});

describe('Stop-hook detect()', () => {
  test('a reply with an emoji writes a slip', () => {
    const dir = tmpDir();
    hook.detect({ last_assistant_message: `fini ${EMOJI}` }, dir);
    expect(voice.readSlip(dir)).not.toBe(null);
  });
  test('a clean reply writes nothing', () => {
    const dir = tmpDir();
    hook.detect({ last_assistant_message: 'OK. On construit.' }, dir);
    expect(voice.readSlip(dir)).toBe(null);
  });
});
