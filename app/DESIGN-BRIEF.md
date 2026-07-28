# BYAN Desktop App — Design Brief (AcadéNice)

> Two jobs, one document. It is the prompt to paste into a design tool for
> high-fidelity mockups, and it is the repo's design reference — the thing to
> check a pull request against.
>
> Source: `docs/design-handoff/PASSATION-UI.md` and
> `docs/design-handoff/THEMES-ET-MATIERE.md`. Every contrast figure below is
> measured there, not estimated here.
>
> The previous version of this file forbade glass in as many words, three times,
> and called the light theme "coming soon" / "out of scope". Both were true when
> it was written and both are false now: the app has two themes, and it has
> glass, deliberately scoped. Values here override any older copy.

---

## Prompt (copy from here)

You are designing a desktop application called **BYAN** ("Builder of YAN") — an AI
agent orchestration platform that lives as an Electron app on Linux and Windows.
Generate high-fidelity desktop UI mockups for every screen listed at the end.
Output a coherent, production-ready design system, **in both themes**.

### Brand identity

- Name: BYAN
- Tagline: Builder of YAN
- Owner: the AcadéNice CFA in Nice. The product carries the AcadéNice design
  system; BYAN is not its own brand with its own palette.
- Logo: a rounded square (radius 22%) filled `#131E1D` with a single capital "B"
  centred, set in Josefin Sans 700, the letter painted with a **mono-hue** teal
  gradient from `#6ADDD0` (top-left) to `#1E8E7E` (bottom-right). One brand
  colour, no second tint — a two-temperature logo on a dark ground is a bet, and
  a logo is not where bets get taken.
- Personality: technical, opinionated, direct. Reads like a senior craftsman, not
  a marketing brochure.

### Design language

Style direction: **modern, minimal, tech, with one real material**. Think Linear,
Raycast, Cron, Cursor IDE, Vercel v0, GitHub Primer, Stripe Dashboard, Notion.
Geometry-first. Generous whitespace. Confident typography. Motion stays subtle and
functional rather than decorative.

Principles:

- **Clarity over decoration.** Every element earns its place.
- **Density when it matters.** Lists and tables can be dense; hero areas breathe.
- **Two themes, one layer.** Dark ships by default and light is a first-class
  peer. Neither is a filter over the other — see "The two ramps".
- **Glass floats, content does not.** Translucency belongs to the layers above the
  content. Anything carrying information sits on an opaque surface. See "The
  material".
- **Mono for machine text.** JetBrains Mono for paths, code, IDs, counters,
  keyboard shortcuts.
- **Structure first.** 4px base unit. Components align to it consistently.
- **No pure grey.** Every neutral is teal-tinted, down to the separators.
- **Skip emoji in the UI.** Line icons (Lucide) instead.

### The two ramps

AcadéNice is a light system. Dark is an **extension** of it: two steps added below
`--neutral-950`, in the same hue (about 176 degrees), continuing the existing
progression rather than invented next to it.

```
--neutral-50:   #F7FAFA
--neutral-100:  #EEF3F3
--neutral-200:  #DCE8E7
--neutral-300:  #BDD0CF
--neutral-400:  #94B0AF
--neutral-500:  #6B9190
--neutral-600:  #527472
--neutral-700:  #425E5D
--neutral-800:  #334847
--neutral-900:  #2A3D3C
--neutral-950:  #1A2827
--neutral-975:  #131E1D   /* added for dark */
--neutral-1000: #0C1312   /* added for dark */
```

Per role, with the measured contrast against that theme's card surface:

| Role | Dark | Light |
|---|---|---|
| Page background | `#0C1312` neutral-1000 | `#F7FAFA` neutral-50 |
| Card surface | `#131E1D` neutral-975 | `#FFFFFF` |
| Raised surface (modal, menu) | `#1A2827` neutral-950 | `#FFFFFF` + shadow |
| Hover surface | `#2A3D3C` neutral-900 | `#EEF3F3` neutral-100 |
| Border, subtle | `rgba(208,245,240,.07)` | `#DCE8E7` neutral-200 |
| Border, crisp | `rgba(208,245,240,.12)` | `#BDD0CF` neutral-300 |
| Title, strong | `#FFFFFF` — 17.4:1 | `#0A2E2A` teal-950 — 15.8:1 |
| Body text | `#DCE8E7` neutral-200 — 13.6:1 | `#1A2827` neutral-950 — 14.5:1 |
| Secondary text | `#94B0AF` neutral-400 — 7.4:1 | `#425E5D` neutral-700 — 8.7:1 |
| **Tertiary text (the floor)** | `#6B9190` neutral-500 — 4.95:1 | `#527472` neutral-600 — 4.88:1 |
| **The unmeasured dash** | `#527472` neutral-600 — 3.34:1 | `#6B9190` neutral-500 — 3.29:1 |

**The rule that catches people: neutral-500 and neutral-600 swap roles between
themes.** Light is not dark with the values flipped one for one; it is the same
ramp read from the other end. In dark, fading out means going DOWN toward the
background. In light it means going UP toward it. So the two steps nearest the
floor exchange.

Wire "tertiary = neutral-500" without a per-theme distinction and light loses a
point of contrast across its entire muted tier while the dash falls out of the
ramp from below. That is not hypothetical: it was built that way once and measured
2.31:1 where 3.3:1 was intended, and it survived a re-read of the CSS.

Two consequences to design to:

- **The readability floor is hard.** Below it lives the dash of an unmeasured
  value and pure decoration — not a sentence anyone has to read.
- **`#94B0AF` carries no text in light.** In dark it is the secondary tier; in
  light it is a border or an icon value and nothing else.

### The four role colours

Each says one thing and nothing else. Amber deserves a note: the AcadéNice brand
rule reserves it for conversion CTAs ("Réserver", "Gratuit"). BYAN Desktop
converts nobody, so that role has no object here and amber is **reassigned to
change and waiting** — a deliberate, documented departure, consistent with the
amber update badges the app already had.

| Colour | Dark | Light | Means, and nothing else |
|---|---|---|---|
| **Teal** | `#4CCCB8` — 8.7:1 | `#1C7269` teal-700 — 5.5:1 | The main action. The active state. The confirmed selection. Focus. Links. Local mode. |
| **Amber** | `#FDA100` — 8.4:1 | `#9E5200` amber-700 — 5.4:1 | Change and waiting. The "update" badge. A deferred setting that diverges. A warning. An available app update. |
| **Red** | `#EF4444` — 4.6:1 | `#991B1B` — 7.9:1 | Failure alone, and destructive conflict — the hand-edited file about to be overwritten. Not a mere warning: that is amber's job. |
| **Green** | `#22C55E` — 7.5:1 | `#065F46` — 7.4:1 | The end-of-run summary, and a tool server that is running. Nothing more. |

Each colour loses roughly four points of contrast on a light ground, which is why
each steps down one rung there rather than being reused. Red in dark sits just
above the AA threshold, so it takes short text and not a paragraph.

Soft grounds, for light: teal `#EDFAF8`, amber `#FFF8E6`, red `#FEE2E2`, green
`#D1FAE5`.

**Structural difference between the themes.** In dark, a state card keeps a
neutral ground and only its border carries the colour. In light the tinted ground
becomes necessary: on white, an amber border and a red border read almost the same
from a step back. The colour's role does not change; its surface of application
does.

**Watch amber against red.** They touch in the file preview — a conflict counter
beside an update counter. At brand values on a light ground they merged. At the
values above the gap holds. This is the first pair to re-measure if either moves.

**Two accent colours maximum per screen.** Teal, plus one other.

### The button rule, identical in both themes

The AcadéNice `.btn-primary` is white on teal, which is **1.97:1**. That is a
defect in the design system rather than in either theme — it fails in both. One
rule corrects it:

```
Dark text on teal, in both themes.
  dark  : fill #4CCCB8, text #0C1312  ->  9.6:1
  light : fill #4CCCB8, text #0A2E2A  ->  7.4:1
```

Same for amber as a flat fill: dark text, not white (white on amber is 2.04:1).

### The material

Glass is real here, and it is scoped. This is the part that separates liquid glass
from decorative glass, and it is also what keeps the contrasts honest — on a
translucent ground a contrast stops being a value and becomes a range.

**It goes on the layers that float above content:** header, identity bar, input
bar, menus, action footer.

**Two recipes, exact:**

```
/* Dark */
background: rgba(19,30,29,.85);
backdrop-filter: blur(24px) saturate(160%);
border: 1px solid rgba(208,245,240,.10);
box-shadow: inset 0 1px 0 rgba(208,245,240,.14),
            0 10px 34px rgba(0,0,0,.32);

/* Light */
background: rgba(255,255,255,.72);
backdrop-filter: blur(24px) saturate(180%);
border: 1px solid rgba(26,40,39,.09);
box-shadow: inset 0 1px 0 rgba(255,255,255,.95),
            0 10px 30px rgba(26,40,39,.07);
```

Two details carry the whole effect, and neither is the blur:

- **The inner light edge** (`inset 0 1px 0`). Without it this is a
  semi-transparent panel. With it, a cut edge.
- **The saturation difference**, 160% dark against 180% light. Without the extra
  twenty points the blur washes the colours toward grey and the teal turns muddy.

**Opacity is a contrast budget, not an aesthetic dial.** The dark glass was first
laid at `.62`; at 38% transmission the text buried behind it stayed *readable* and
collided with the labels in front — the background talking over the foreground. At
`.85` it becomes texture, which is its job. If the dark ground ever drops below
`.85`, the muted tier sitting on it moves up a rung to compensate.

**Three limits, all load-bearing:**

1. **No glass under data.** A measured number, a file path, a code block, a long
   text: opaque surface. The unmeasured dash was already at the edge of legible on
   a solid ground; on a translucent one it disappears.
2. **Glass only means something if something passes behind it.** The sidebar has
   nothing behind it, so it stays solid and keeps only the edge. Glass over
   nothing is one more tint, not a material.
3. **The cost is to be measured, not supposed.** Three recomputing
   `backdrop-filter` layers, in Electron, on a Linux box with no GPU compositor,
   cannot be costed without the target machine. Until it is, there are two ways
   out: the OS reduced-transparency preference, and a root class the main process
   can set beside its existing GPU switch. Both collapse the glass to the opaque
   surface and keep the edge.

**Geometry, so the glass proves itself.** The tuck — content overrunning under the
glass layer — is not cosmetic; without it the glass is unprovable. Exactly one
unit (one bubble, one file row) crosses each glass edge. No unit fully buried
behind it, none fully outside, none clipped by the container. The visible overrun
clears about 20px on a 35px unit or nothing troubles to the eye. The trap, hit
twice: **adding rows does not change the tuck depth** — rows have a fixed pitch,
so the crossing is invariant modulo that pitch. The lever is the stack's offset,
not its element count.

### Typography

- **Titles and buttons:** Josefin Sans (400, 600, 700). Brand rule — buttons are
  set in Josefin. **It stops at 700**, so no title carries weight 900.
- **Running text:** Inter (300, 400, 500, 600, 700).
- **Machine text:** JetBrains Mono (400, 500). A documented departure from
  AcadéNice's `Courier New`, which does not survive a developer tool that shows
  file paths, binary names, identifiers and aligned counters all day.
- Fonts are **bundled**, not fetched. An app whose whole point is "no cloud" does
  not go to the network for its own letters.
- Hierarchy (the scale is good and stays):
  - Display: 32px / 40 / 600 / tracking -0.02em
  - H1: 24px / 32 / 600 / -0.01em
  - H2: 18px / 28 / 600
  - H3: 14px / 20 / 600
  - Body: 14px / 20 / 400
  - Body-sm: 13px / 18 / 400
  - Caption: 12px / 16 / 500 / tracking 0.02em
  - Label: 11px / 16 / 600 / uppercase / tracking 0.18em, at the tertiary tier

### Layout, spacing, radii

- Base unit: 4px. Paddings and gaps are multiples of it: 4, 8, 12, 16, 24, 32, 48.
- **Buttons and badges: pill (999px).** Brand rule, not a preference. It is the
  single most visible change in the app and the one that reads as AcadéNice at a
  glance.
- Card radius: 14px or 16px. Inputs: 10px.
- Container max width: 1280px. Side gutters: 24px.
- Window assumes a default 1280x832 Electron window.

### Motion

- Default transition: 150ms ease-out.
- Hover: 1px lift, or a surface that moves toward the foreground. No bounce.
- Focus ring: 2px teal at about 30% alpha, per theme, 1px offset.
- Loading: 16px spinner, teal, 1s linear.
- Progress: solid teal bar, optional shimmer overlay 2.4s linear.
- **Glow is reserved and brief:** active selection, or a success confirmation. Not
  at rest, and not on a loop. An idle indicator that glows forever has spent the
  one effect that was meant to say "something just happened".

### Iconography

Line icons, 1.5px stroke, square caps, rounded joins. Sizes 14, 16, 20, 24px.
Lucide names where applicable: `terminal`, `code-2`, `git-branch`, `folder`, `key`,
`eye` / `eye-off`, `arrow-right`, `check`, `alert-circle`, `alert-triangle`,
`loader-2`, `settings`, `palette`, `zap`, `external-link`.

### Component library to design

Design every one in **both themes**.

1. **Button**: primary (teal fill, dark text), secondary (subtle fill + crisp
   border), ghost (no border), destructive (red wash + red border + red text —
   outlined rather than filled: a filled red button reads as the default, and the
   default here is to stay put). Sizes sm / md / lg, with and without a leading
   icon. Pill in every case.
2. **Input**: text, password (eye toggle), search (leading icon), select. States
   default / focus / error / disabled.
3. **Segmented control**: pill segments, active = teal wash + teal border.
4. **Card**: base, raised, interactive. Opaque — a card carries content.
5. **Glass layers**: header, identity bar, input bar, menu, action footer. Show
   each with content tucked under one edge, or the material is not demonstrated.
6. **Stepper (horizontal)**: 5 nodes on a 1px line. Active = filled 24px circle,
   teal, no pulse. Done = check, green. Future = empty circle at the border value.
   Label below, 12px; active at the strong tier, others at secondary.
7. **Status badge**: caption + coloured dot. success / warning / error / neutral.
8. **Toast / banner**: one line, leading icon, dismissable.
9. **Consequence dialog**: names what is about to change before it changes — which
   folder, what stops, what is kept, what is lost. Not a generic "are you sure?",
   which carries none of that and trains people to click through. Outlined danger
   action, a cancel present in every case, and the cancel takes focus on open.
10. **Empty state, in two distinct forms**: nothing yet (with the action that
    creates the first thing) and nothing found (with the action that clears the
    filter). Two screens with two exits, not one screen.
11. **Sidebar nav**: 240px, 36px items, 16px icon, 14px label. Active = subtle
    fill + 2px teal left bar. Solid surface with the inner edge, not glass.
12. **Topbar**: 48px, logo left, breadcrumb centre, action cluster right. Glass.
13. **Code / path block**: opaque mono 13px on the raised surface, 8px padding, 1px
    border, trailing copy button.
14. **List row**: 56px default, primary + secondary text, trailing chevron or
    actions, hover fill.
15. **Theme selector**: three states, side by side — see below.

### The theme selector

Three choices, not two: **sombre / clair / système**. It lives in Settings ->
Appearance, and Appearance is the only screen in the app where the two themes
meet, which makes it the only place a side-by-side preview at the moment of
choosing has any meaning. Design the three previews as a row.

"Système" means the theme can change **with no user action at all** — at sunset, in
the middle of a response being written. The behaviour:

- The app follows the OS **immediately**, mid-stream included.
- **One exception:** not while a consequence modal is open. A background that
  changes at the moment someone is reading "this will overwrite three files" is
  the worst possible instant. The change applies on close, and the wait is stated
  rather than left to look like a broken setting.

### Screens to design (desktop, 1280x832 unless noted)

Each screen needs a full canvas mockup plus 3 to 5 callouts naming the components
reused, **and a dark and a light version**.

#### A. App shell (template)
Sidebar 240px (collapsible to 64px), solid. Topbar 48px, glass, with logo,
breadcrumb, search (cmd+k), profile menu. Scrollable content area, with one row
tucked under the topbar's lower edge. Bottom status strip 28px: connection mode
(cloud / local), version, latency if and only if it is measured, link to logs.

#### B. Onboarding — first run, no sidebar, centred, max 720px
1. **Welcome** — logo, display title, subtitle, project folder picker (input +
   Browse + recent folders), footer with a secondary and a primary action.
2. **Detection** — three tiles: Claude Code (`terminal`), OpenAI Codex (`code-2`),
   GitHub Copilot (`git-branch`). Each with a detected / not-found badge, the mono
   path when found, a checkbox. When nothing is found, offer manual path entry: a
   dead end on the second screen is an abandonment.
3. **Preview** — accordion grouped by platform. Four categories, not three:
   create / update / **replace a hand-modified version** / unchanged. The replace
   category leads, outside the list, with a consultable diff and a checkbox that
   can be cleared. Sticky summary chip. Amber counts changes; red counts
   conflicts; keep them apart.
4. **Apply** — progress bar, step count, live mono log with auto-scroll,
   interruptible with a partial summary. No automatic rollback.
5. **Done** — 64px green check with a one-shot glow. Stat row: written / skipped /
   errors, separated by 1px borders. Primary action out.

#### C. Login — three modes
Centred card, max 480px. Logo, segmented control Cloud / Local / Custom. Cloud: a
read-only URL chip and a token field with show/hide. Local: copy plus a connect
action — no server prerequisite. Custom: URL and token. Inline error region above
the action.

#### D. Dashboard
Sidebar nav: Dashboard / Projects / Agents / Memory / Knowledge / Sessions / MCP /
Settings. Hero greeting plus a caption. Three KPI cards. Two columns: recent
sessions as list rows; quick actions as a vertical button stack.

#### E. Projects (list)
Search, filter (All / Recent / Pinned), a primary "New project". Table: name, slug
(mono), agent count, last activity, actions. Both empty states.

#### F. Project detail
Breadcrumb. Tabs Overview / Agents / Memory / Knowledge / Sessions / Settings.

#### G. Agents
Two panes: list left, detail right with a card per concern (Persona / Tools /
Memory / Versions).

#### H. Memory
Search plus filter chips. Table: timestamp (mono), source, snippet, confidence.

#### I. Knowledge
Three-column card grid: title, source domain, last updated, tags.

#### J. Sessions
Table: started_at (mono ISO), project, agent, duration, status badge, actions.

#### K. MCP servers
List rows: name, status dot, command (mono block), ports, start / stop / restart /
edit. Primary "Add MCP server".

#### L. Settings
Sub-nav: Connection / Appearance / Language / API / About.
- Connection: current mode chip plus a switch action.
- **Appearance: the three-state theme selector with its side-by-side previews.**
- Language: locale select.
- API: the two authorization header forms, in opaque mono blocks.
- About: version, build, links.

#### M. Local chat
Identity bar at the top, glass, read-only: what this session IS. Effort and the
per-turn controls at the FOOT, next to the input, glass. A divergence line in amber
when a deferred setting differs from the live session. Message list opaque, with
exactly one bubble tucked under each glass edge.

#### N. Empty and error states
404: centred icon, "Nothing here", primary home. Crash recovery: the problem named,
collapsible details, restart primary, open-logs ghost.

### Deliverables expected from the design tool

1. Page-by-page flat mockups for screens A through N, **each in dark and light**.
2. A components page showing the library in both themes.
3. A typography page in real Josefin Sans, Inter and JetBrains Mono.
4. A colour page: every token as a swatch, with its measured contrast against its
   own theme's card surface.
5. A material page: both glass recipes, the inner edge isolated, and a tuck
   diagram.
6. A motion page: durations, easings, and exactly where glow is allowed.

### Hard constraints

- Desktop only. Min width 960px. Default 1280x832.
- Skip emoji on screens.
- **Glass on floating layers only.** No glass under a measured number, a file
  path, a code block or a long text. None on the sidebar.
- Skip ambient gradient orbs, skeuomorphism, 3D, neon overload.
- Skip pure greys. Every neutral is teal-tinted.
- Two accent colours maximum per screen: teal plus one.
- No white text on teal or on amber, in either theme.
- No glow at rest, and no glow on a loop.
- Josefin Sans stops at 700.
- The tertiary floor is hard: `#6B9190` in dark, `#527472` in light. Below it,
  decoration and the unmeasured dash only.
- The product feels closer to Linear and Cron than to a SaaS landing page.

### The three rules that settle everything else

If an implementation decision is not covered above, these decide. They come from
the product.

1. **Do not show a setting that does not exist.** Absent from the DOM, not greyed
   out. A greyed control promises a capability and then withdraws it.
2. **A dash is not a zero.** A value, a dash with the reason for the silence, or a
   "not measured yet". No fourth form, and no total that crosses two units.
3. **No mute command.** Every action leaves a trace: a visible change, or a
   sentence saying why there is none.

Reading corollary that resolves their apparent contradiction: **absence governs
what the app offers, explanation governs what it receives.** A path you do not
offer but the user finds anyway must answer, not go quiet.

### What I do not want

- The generic "beautiful AI dashboard" stock look.
- Pastel gradients, purple bokeh backgrounds.
- **Glass everywhere.** Glass cards stacked over a colourful blur is the failure
  mode this brief guards against — not glass itself. A translucent card under a
  table of numbers is that failure. A translucent header over a scrolling list is
  the material working.
- Heroes the size of half the screen.
- Round avatars with halos. Round dots are fine; avatars are 24px squares with a
  4px radius.
- Cute illustrations. Icons.
- Marketing copy. Every label is short and declarative.

End of brief. Generate the screens, in both themes.

---

## Implementation notes (repo-side, not part of the prompt)

- **One commutable token layer.** `renderer/index.css` carries the dark values on
  `:root` and overrides them on `.light`. Not two hand-written sets — two sets is
  what produced the one-step drift in the muted tier. `renderer/tailwind.config.js`
  maps the role names (`surface-*`, `content-*`, `edge-*`, `accent-*`, `wash-*`,
  `on-wash-*`) onto those variables.
- **The root classes are safelisted.** `light`, `dark` and `no-blur` are put on
  `<html>` by JavaScript and appear in no scanned file, so Tailwind purged the
  whole `.light` block out of the bundle until they were safelisted. If the light
  theme ever stops shipping, look there first.
- **`acadenice.teal` keeps its name.** A Dashboard test pins `bg-acadenice-teal`,
  and renaming it to `primary` would also re-introduce the name the dead Material
  Design tokens just freed.
- **Glass classes:** `.glass`, `.glass-header`, `.glass-bar`, `.glass-footer`,
  `.glass-menu`. Solid sidebar: `.solid-edge`. The way out for data inside a
  floating layer: `.surface-opaque`. Raised opaque surface: `.elevated`.
- **Theme state:** `renderer/context/ThemeContext.tsx`, reached through
  `renderer/hooks/useTheme.ts`. Persisted at `ui.theme`. Any modal that states a
  consequence calls `useConsequenceModal(open)` to hold an OS flip while it is on
  screen.
