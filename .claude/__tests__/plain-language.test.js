'use strict';

// Tests for the "parler reel" plain-language guard (Mantra IA-26):
// the core scanner, the slip flag, the Stop-hook detector, the voice-anchor
// pickup, and the cross-file wiring (repo + npm template parity).

const fs = require('fs');
const os = require('os');
const path = require('path');

const pl = require('../hooks/lib/plain-language');
const stopHook = require('../hooks/plain-language-check');
const voiceAnchor = require('../hooks/inject-voice-anchor');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-plainlang-'));
  fs.mkdirSync(path.join(dir, '_byan-output'), { recursive: true });
  return dir;
}

// --- scanText: known offenders -------------------------------------------

describe('scanText detects known repeat-offenders with plain replacements', () => {
  test('flags English borrowings that have a French equivalent', () => {
    const hits = pl.scanText('Je le fais inline puis un cutoff du service.');
    const bad = hits.map((h) => h.bad);
    expect(bad).toContain('inline');
    expect(bad).toContain('cutoff');
    for (const h of hits) expect(typeof h.good).toBe('string');
  });

  test('flags the misused "forger un token" metaphor', () => {
    const hits = pl.scanText('On va forger un token pour la session.');
    expect(hits.map((h) => h.bad)).toContain('forger un token');
  });

  test('clean French prose yields no hit', () => {
    const hits = pl.scanText('Je redémarre le conteneur puis je relance les tests.');
    expect(hits).toEqual([]);
  });

  test('each offender is reported at most once', () => {
    const hits = pl.scanText('inline inline inline encore inline');
    expect(hits.filter((h) => h.bad === 'inline')).toHaveLength(1);
  });
});

// --- scanText: false-positive guards -------------------------------------

describe('scanText does not fire on look-alikes', () => {
  test('French words ending in "tier" are not mistaken for the jargon "tier"', () => {
    // metier, chantier, quartier, entier all contain the substring "tier".
    const hits = pl.scanText('Le metier du chantier dans ce quartier est entier.');
    expect(hits.map((h) => h.bad)).not.toContain('tier');
  });

  test('offenders quoted inside a code span are ignored (prose only)', () => {
    // The offenders appear ONLY inside backticks (identifiers), never in prose.
    const hits = pl.scanText('Le module `native-tiers.js` expose `tier` et `gate` comme identifiants.');
    expect(hits.map((h) => h.bad)).not.toContain('tier');
    expect(hits.map((h) => h.bad)).not.toContain('gate');
  });

  test('offenders inside a fenced code block are ignored', () => {
    const text = 'Voici le code :\n```js\nconst gate = "inline";\n```\nEt voila.';
    expect(pl.scanText(text)).toEqual([]);
  });
});

// --- slip flag roundtrip -------------------------------------------------

describe('slip flag write/read/clear', () => {
  test('write then read returns the hits, clear removes it', () => {
    const dir = tmpProject();
    const hits = [{ bad: 'inline', good: 'directement' }];
    expect(pl.writeSlip(dir, hits)).toBe(true);
    expect(pl.readSlip(dir)).toEqual(hits);
    pl.clearSlip(dir);
    expect(pl.readSlip(dir)).toBeNull();
  });

  test('reading an absent flag yields null (no crash)', () => {
    expect(pl.readSlip(tmpProject())).toBeNull();
  });
});

// --- formatReminder ------------------------------------------------------

describe('formatReminder', () => {
  test('names both the bad word and its replacement, and cites IA-26', () => {
    const r = pl.formatReminder([{ bad: 'cutoff', good: 'redemarrer' }]);
    expect(r).toContain('cutoff');
    expect(r).toContain('redemarrer');
    expect(r).toContain('IA-26');
  });

  test('empty hits -> empty string (no reminder on a clean turn)', () => {
    expect(pl.formatReminder([])).toBe('');
    expect(pl.formatReminder(null)).toBe('');
  });

  test('is bounded even when many offenders slipped', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ bad: `w${i}`, good: 'x' }));
    const r = pl.formatReminder(many);
    expect(r.split('->').length).toBeLessThanOrEqual(8); // a few shown, not all 20
  });
});

// --- Stop-hook detector (non-blocking, writes the flag) ------------------

describe('plain-language-check Stop hook detector', () => {
  test('a slipped reply writes the flag; a clean reply does not', () => {
    const dir = tmpProject();
    const hits = stopHook.detectAndFlag({ last_assistant_message: 'je le fais inline' }, dir);
    expect(hits.map((h) => h.bad)).toContain('inline');
    expect(pl.readSlip(dir)).not.toBeNull();

    const dir2 = tmpProject();
    stopHook.detectAndFlag({ last_assistant_message: 'je redemarre le conteneur' }, dir2);
    expect(pl.readSlip(dir2)).toBeNull();
  });

  test('reads the assistant text from a transcript_path JSONL', () => {
    const dir = tmpProject();
    const tp = path.join(dir, 't.jsonl');
    fs.writeFileSync(
      tp,
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'un petit housekeeping' } }) + '\n'
    );
    const hits = stopHook.detectAndFlag({ transcript_path: tp }, dir);
    expect(hits.map((h) => h.bad)).toContain('housekeeping');
  });
});

// --- voice-anchor pickup -------------------------------------------------

describe('inject-voice-anchor slip pickup', () => {
  test('withSlipReminder appends the reminder when the previous turn slipped', () => {
    const out = voiceAnchor.withSlipReminder('BASE', [{ bad: 'inline', good: 'directement' }]);
    expect(out.startsWith('BASE')).toBe(true);
    expect(out).toContain('inline');
    expect(out).toContain('IA-26');
  });

  test('withSlipReminder leaves the context untouched on a clean turn', () => {
    expect(voiceAnchor.withSlipReminder('BASE', [])).toBe('BASE');
    expect(voiceAnchor.withSlipReminder('BASE', null)).toBe('BASE');
  });

  test('the anchor carries the IA-26 plain-language line and stays compact', () => {
    expect(voiceAnchor.ANCHOR).toContain('IA-26');
    expect(voiceAnchor.ANCHOR.toLowerCase()).toContain('cutoff');
    expect(voiceAnchor.ANCHOR.length).toBeLessThan(800); // still not the full tao
  });
});

// --- wiring parity (repo + npm template) ---------------------------------

describe('IA-26 wiring is present and mirrored to the npm template', () => {
  const ROOT = path.join(__dirname, '..', '..');
  const settingsFiles = [
    path.join(ROOT, '.claude', 'settings.json'),
    path.join(ROOT, 'install', 'templates', '.claude', 'settings.json'),
  ];
  const ruleFiles = [
    path.join(ROOT, '.claude', 'rules', 'plain-language.md'),
    path.join(ROOT, 'install', 'templates', '.claude', 'rules', 'plain-language.md'),
  ];
  const mantraFiles = [
    path.join(ROOT, '_byan', 'workflow', 'simple', 'byan', 'data', 'mantras.yaml'),
    path.join(ROOT, 'install', 'templates', '_byan', 'workflow', 'simple', 'byan', 'data', 'mantras.yaml'),
  ];

  test.each(settingsFiles)('%s registers plain-language-check under Stop', (file) => {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const stop = cfg.hooks.Stop;
    expect(Array.isArray(stop)).toBe(true);
    const wired = stop.some((g) => (g.hooks || []).some((h) => /plain-language-check\.js/.test(h.command)));
    expect(wired).toBe(true);
  });

  test.each(ruleFiles)('%s exists and states the rule', (file) => {
    expect(fs.existsSync(file)).toBe(true);
    const body = fs.readFileSync(file, 'utf8');
    expect(body).toContain('IA-26');
  });

  test.each(mantraFiles)('%s declares the IA-26 mantra', (file) => {
    expect(fs.readFileSync(file, 'utf8')).toContain('IA-26');
  });
});
