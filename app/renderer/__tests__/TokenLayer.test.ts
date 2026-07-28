// The token layer, asserted against the COMPILED output rather than the source.
//
// Reading index.css proves only that someone typed the right values. The light
// theme is applied by a class that JavaScript puts on <html> at runtime, so it
// appears in no scanned file — and Tailwind purges `@layer base` rules whose
// selector is an undetected class candidate. The entire `.light { ... }` half was
// therefore being tree-shaken out of the bundle while looking perfectly correct
// in the source. That is the failure mode this whole one-layer design exists to
// prevent: measurable, and invisible to a re-read.
//
// So these tests BUILD the CSS, most of them against an EMPTY content set — the
// exact condition that exposed it.

/* eslint-disable no-restricted-imports --
   The renderer lockdown forbids Node modules because the SPA runs sandboxed and
   must go through window.byanApi. This file is not SPA runtime: it is a
   BUILD-TIME test that compiles index.css through postcss, in the same category
   as renderer/vite.config.ts and renderer/tailwind.config.js, which the lockdown
   already lists under `ignores`. It is never bundled. The tidier fix is to add
   renderer build tests to that same `ignores` list in eslint.config.mjs, which is
   not owned here. */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import rawConfig from '../tailwind.config.js';

// A narrow view of the config, so no assertion goes through `as any` (which the
// renderer lockdown forbids, for good reason).
type ColorGroup = Record<string, string>;
const config = rawConfig as {
  safelist?: string[];
  theme?: { extend?: { colors?: Record<string, string | ColorGroup> } };
};
const COLORS: Record<string, string | ColorGroup> = config.theme?.extend?.colors ?? {};
const colorGroup = (name: string): ColorGroup => COLORS[name] as ColorGroup;

// Resolved from the vitest root (app/) rather than from import.meta.url: under
// the jsdom transform the module URL is not a file: URL.
function fromApp(rel: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(dir, rel);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(`cannot locate ${rel} from ${process.cwd()}`);
}

const CSS_PATH = fromApp('renderer/index.css');
const SETTINGS_PATH = fromApp('renderer/pages/Settings.tsx');
const source = fs.readFileSync(CSS_PATH, 'utf8');

/** Build index.css against a content set we control. */
async function build(rawContent = ''): Promise<string> {
  const result = await postcss([
    tailwindcss({ ...rawConfig, content: [{ raw: rawContent, extension: 'html' }] }),
  ]).process(source, { from: CSS_PATH });
  return result.css;
}

function norm(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim();
}

/** Every declaration of every top-level rule matching `selector`, flattened. */
function declsOf(css: string, selector: string, opts: { inAtRule?: string } = {}): string {
  const out: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (norm(rule.selector) !== selector) return;
    const parent = rule.parent;
    if (opts.inAtRule) {
      if (!parent || parent.type !== 'atrule') return;
      if (!norm(String(parent.params)).includes(opts.inAtRule)) return;
    } else if (parent && parent.type === 'atrule') {
      return;
    }
    rule.nodes.forEach((n) => {
      if (n.type === 'decl') out.push(`${n.prop}: ${n.value}`);
    });
  });
  return out.join(' | ');
}

function selectors(css: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    found.push(norm(rule.selector));
  });
  return found;
}

// --------------------------------------------------------------------------
// The regression that motivated this file
// --------------------------------------------------------------------------

describe('the light half of the layer actually ships', () => {
  it('emits every light value with NOTHING in the content referencing the class', async () => {
    const css = await build('');
    const light = declsOf(css, '.light');

    expect(light).toContain('color-scheme: light');
    expect(light).toContain('--surface-page: #F7FAFA');
    expect(light).toContain('--surface-card: #FFFFFF');
    expect(light).toContain('--text-strong: #0A2E2A');
    expect(light).toContain('--accent-action: #1C7269');
  });

  it('keeps the runtime root classes safelisted, since no markup writes them', () => {
    expect(config.safelist).toContain('light');
    expect(config.safelist).toContain('no-blur');
  });
});

// --------------------------------------------------------------------------
// The two ramps
// --------------------------------------------------------------------------

describe('the two ramps live in ONE commutable layer', () => {
  it('carries the dark values on :root, so the app is usable with no class at all', async () => {
    const css = await build('');
    const dark = declsOf(css, ':root');
    expect(dark).toContain('color-scheme: dark');
    expect(dark).toContain('--surface-page: #0C1312');
    expect(dark).toContain('--surface-card: #131E1D');
    expect(dark).toContain('--text-strong: #FFFFFF');
    expect(dark).toContain('--accent-action: #4CCCB8');
  });

  it('swaps neutral-500 and neutral-600 between themes — the one-step drift bug', async () => {
    const css = await build('');
    const dark = declsOf(css, ':root');
    const light = declsOf(css, '.light');

    // In dark, fading out means going DOWN toward the background.
    expect(dark).toContain('--text-tertiary: #6B9190'); // neutral-500 is the FLOOR
    expect(dark).toContain('--text-muted: #527472'); // neutral-600 is the dash

    // In light, fading out means going UP toward it. The two nearest the floor
    // exchange. Wiring "tertiary = neutral-500" for both themes is the bug that
    // measured 2.31:1 where 3.3:1 was intended.
    expect(light).toContain('--text-tertiary: #527472'); // neutral-600 is the FLOOR
    expect(light).toContain('--text-muted: #6B9190'); // neutral-500 is the dash
  });

  it('never lets #94B0AF carry text in light', async () => {
    const css = await build('');
    const light = declsOf(css, '.light');
    // neutral-400 is the secondary in dark; in light it is a border or an icon
    // value and nothing more.
    for (const textToken of ['--text-strong', '--text-body', '--text-secondary', '--text-tertiary']) {
      expect(light).not.toContain(`${textToken}: #94B0AF`);
    }
  });

  it('steps each role colour down one rung for the light ground', async () => {
    const css = await build('');
    const light = declsOf(css, '.light');
    expect(light).toContain('--accent-action: #1C7269'); // teal-700, 5.5:1
    expect(light).toContain('--accent-change: #9E5200'); // amber-700, 5.4:1
    expect(light).toContain('--accent-danger: #991B1B'); // 7.9:1
    expect(light).toContain('--accent-success: #065F46'); // 7.4:1
  });

  it('keeps amber and red apart on the light ground, where they collided', async () => {
    const css = await build('');
    const light = declsOf(css, '.light');
    // A conflict counter and an update counter sit side by side in the file
    // preview; at brand values on white they read almost the same.
    expect(light).toContain('--wash-change: #FFF8E6');
    expect(light).toContain('--wash-danger: #FEE2E2');
    expect(light).not.toContain('--wash-change: #FEE2E2');
  });
});

// --------------------------------------------------------------------------
// The glass
// --------------------------------------------------------------------------

describe('the glass, both recipes exactly as specified', () => {
  it('lays the dark recipe on :root', async () => {
    const dark = declsOf(await build(''), ':root');
    expect(dark).toContain('--glass-bg: rgba(19, 30, 29, 0.85)');
    expect(dark).toContain('--glass-filter: blur(24px) saturate(160%)');
    expect(dark).toContain('--glass-border: rgba(208, 245, 240, 0.10)');
    expect(dark).toContain('--glass-edge: inset 0 1px 0 rgba(208, 245, 240, 0.14)');
    expect(dark).toContain('--glass-drop: 0 10px 34px rgba(0, 0, 0, 0.32)');
  });

  it('lays the light recipe on .light', async () => {
    const light = declsOf(await build(''), '.light');
    expect(light).toContain('--glass-bg: rgba(255, 255, 255, 0.72)');
    expect(light).toContain('--glass-filter: blur(24px) saturate(180%)');
    expect(light).toContain('--glass-border: rgba(26, 40, 39, 0.09)');
    expect(light).toContain('--glass-edge: inset 0 1px 0 rgba(255, 255, 255, 0.95)');
    expect(light).toContain('--glass-drop: 0 10px 30px rgba(26, 40, 39, 0.07)');
  });

  it('carries the inner light edge in BOTH themes — it does more for the material than the blur', async () => {
    const css = await build('glass');
    // Without `inset 0 1px 0` this is a semi-transparent panel. With it, a cut edge.
    expect(declsOf(css, ':root')).toMatch(/--glass-edge: inset 0 1px 0 /);
    expect(declsOf(css, '.light')).toMatch(/--glass-edge: inset 0 1px 0 /);
    // And the rule composes it FIRST, so the arete sits above the drop shadow.
    expect(declsOf(css, '.glass, .glass-header, .glass-bar, .glass-footer, .glass-menu'))
      .toContain('box-shadow: var(--glass-edge), var(--glass-drop)');
  });

  it('saturates higher in light — 180% against 160% — or the teal turns muddy', async () => {
    const css = await build('');
    expect(declsOf(css, ':root')).toContain('saturate(160%)');
    expect(declsOf(css, '.light')).toContain('saturate(180%)');
  });

  it('holds the dark ground at .85: below it the buried text stays readable and talks over the foreground', async () => {
    const dark = declsOf(await build(''), ':root');
    const match = /--glass-bg: rgba\(19, 30, 29, ([0-9.]+)\)/.exec(dark);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(0.85);
  });
});

describe('glass goes only on the layers that float', () => {
  const FLOATING = ['glass', 'glass-header', 'glass-bar', 'glass-footer', 'glass-menu'];

  it('exposes a class for each floating role and blurs every one of them', async () => {
    const css = await build(FLOATING.join(' '));
    const composed = declsOf(css, FLOATING.map((c) => `.${c}`).join(', '));
    expect(composed).toContain('background: var(--glass-bg)');
    expect(composed).toContain('backdrop-filter: var(--glass-filter)');
  });

  it('leaves the sidebar solid, with only the edge: glass over nothing is one more tint', async () => {
    const css = await build('solid-edge');
    const rail = declsOf(css, '.solid-edge');
    expect(rail).toContain('background: var(--surface-card)');
    expect(rail).toContain('box-shadow: var(--glass-edge)');
    // Nothing passes behind it, so there is nothing to blur.
    expect(rail).not.toContain('backdrop-filter: var(--glass-filter)');
  });

  it('gives data a positive way out of a floating layer', async () => {
    const css = await build('surface-opaque');
    const opaque = declsOf(css, '.surface-opaque');
    // A measured number, a file path, a code block, a long text: opaque.
    expect(opaque).toContain('background: var(--surface-card)');
    expect(opaque).toContain('backdrop-filter: none');
  });

  it('has not brought back the four forbidden classes', async () => {
    const css = await build('glass glass-strong glass-card glass-panel card');
    const all = selectors(css);
    expect(all).not.toContain('.glass-strong');
    expect(all).not.toContain('.glass-card');
    expect(all).not.toContain('.glass-panel');
    expect(all).not.toContain('.card');
  });

  it('keeps a measured escape from the blur, because the cost is unmeasured', async () => {
    const css = await build('');
    // Two ways out: the OS accessibility preference...
    const reduced = declsOf(css, ':root, :root.light', { inAtRule: 'prefers-reduced-transparency' });
    expect(reduced).toContain('--glass-filter: none');
    // ...and a class the main process can set next to its existing GPU switch.
    const noBlur = declsOf(css, ':root.no-blur, :root.no-blur.light');
    expect(noBlur).toContain('--glass-filter: none');
    expect(noBlur).toContain('--glass-bg: var(--surface-card)');
  });

  it('puts no glass on the page that shows tokens and paths', () => {
    // Settings renders a Bearer-token block and an API-key block. Both are
    // path-shaped data, so neither may sit on a translucent ground.
    const settings = fs.readFileSync(SETTINGS_PATH, 'utf8');
    expect(settings).not.toMatch(/className="[^"]*\bglass/);
    expect(settings).not.toMatch(/\bglass-(header|bar|footer|menu)\b/);
  });
});

// --------------------------------------------------------------------------
// The button rule, and the keys that must not move
// --------------------------------------------------------------------------

describe('the button rule is the same in both themes', () => {
  it('puts DARK text on teal, never white', async () => {
    const css = await build('btn-primary');
    expect(declsOf(css, '.btn-primary')).toContain('color: var(--on-accent)');
    // White on teal is 1.97:1 — a design-system defect that fails in BOTH
    // themes, which is why the correction is one rule and not a per-theme patch.
    expect(declsOf(css, ':root')).toContain('--on-accent: #0C1312'); // 9.6:1
    expect(declsOf(css, '.light')).toContain('--on-accent: #0A2E2A'); // 7.4:1
  });
});

describe('the keys other work is pinned to', () => {
  it('keeps acadenice.teal, which a Dashboard test pins as bg-acadenice-teal', () => {
    expect(colorGroup('acadenice').teal).toBe('#4cccb8');
  });

  it('has RETIRED the byan-* and ink-* aliases', () => {
    // This assertion used to say the opposite, and it was right at the time: the
    // two legacy ramps were aliased onto the new values so 820 occurrences could
    // keep compiling while they were renamed one surface at a time. The rename is
    // done — 0 real usages left under renderer/ — so the aliases are gone, and
    // this now guards the other direction: re-adding either one would let the old
    // names creep back in under a colour that looks right.
    expect(colorGroup('byan')).toBeUndefined();
    expect(colorGroup('ink')).toBeUndefined();
  });
});
