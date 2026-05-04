# BYAN Desktop App — Design Brief (Stitch / Claude Design)

> Copy-paste this prompt into Stitch (https://stitch.withgoogle.com) or Claude Design.
> Target: high-fidelity desktop UI mockups for all screens listed below.

---

## Prompt (copy from here)

You are designing a desktop application called **BYAN** ("Builder of YAN") — an AI agent orchestration platform that lives as an Electron app on Linux and Windows. Generate high-fidelity desktop UI mockups for every screen listed at the end. Output a coherent, production-ready design system.

### Brand identity

- Name: BYAN
- Tagline: Builder of YAN
- Logo: a rounded square (radius 22%) filled `#0a0f1e` with a single capital "B" centered, set in Inter 700, the letter painted with a linear gradient from `#5c7cfa` (top-left) to `#06b6d4` (bottom-right).
- Personality: technical, opinionated, direct. Reads like a senior craftsman, not a marketing brochure.

### Design language

Style direction: **modern, minimal, tech**. Avoid glass-morphism. Avoid ambient gradient orbs everywhere. Think Linear, Raycast, Cron, Cursor IDE, Vercel v0, GitHub Primer, Stripe Dashboard, Notion. Geometry-first. Generous whitespace. Confident typography. Motion stays subtle and functional rather than decorative.

Principles:
- **Clarity over decoration.** Every element earns its place.
- **Density when it matters.** Lists and tables can be dense; hero areas breathe.
- **Mono accents.** Use JetBrains Mono for paths, code, IDs, keyboard shortcuts.
- **Structure first.** 8px base grid. Components align to it consistently.
- **Dark mode is default.** A light variant can wait — design the dark surface confidently.
- **Skip emoji in the UI.** Use line icons (Lucide, Phosphor, or Heroicons style) instead.

### Color tokens (CSS variables)

```
--ink-950: #070b17    /* page background */
--ink-900: #0a0f1e    /* card surface */
--ink-850: #0f172a    /* elevated surface */
--ink-800: #111827    /* hover surface */
--ink-700: #1e293b    /* border subtle */
--ink-600: #273246    /* border default */
--ink-500: #334155    /* text muted */
--ink-400: #64748b    /* text secondary */
--ink-300: #94a3b8    /* text tertiary */
--ink-200: #cbd5e1    /* text primary muted */
--ink-100: #e2e8f0    /* text primary */
--white:   #ffffff    /* text strong */

--byan-300: #91a7ff   /* accent light */
--byan-400: #748ffc   /* accent */
--byan-500: #5c7cfa   /* accent primary */
--byan-600: #4c6ef5   /* accent strong */
--byan-700: #4263eb   /* accent press */

--cyan:    #06b6d4    /* secondary accent (gradients only) */
--emerald: #34d399    /* success */
--amber:   #fbbf24    /* warning */
--red:     #f87171    /* error */
```

Usage rules:
- Primary surface: `--ink-900`. Page background: `--ink-950`.
- Borders: 1px solid `rgba(255,255,255,0.06)` for default, `rgba(255,255,255,0.1)` for elevated.
- Text on dark: `--ink-100` for body, `--white` for titles, `--ink-400` for secondary, `--ink-500` for tertiary.
- One accent at a time. Avoid painting everything `--byan-500`.
- Gradients reserved for: the logo, hero titles, primary CTA fill (`linear-gradient(135deg, var(--byan-500), var(--byan-700))`).

### Typography

- **Sans:** Inter (300, 400, 500, 600, 700). Default UI font.
- **Mono:** JetBrains Mono (400, 500). Paths, code, IDs, kbd shortcuts.
- Hierarchy:
  - Display: 32px / 40px line-height / weight 600 / tracking -0.02em
  - H1: 24px / 32 / 600 / -0.01em
  - H2: 18px / 28 / 600
  - H3: 14px / 20 / 600
  - Body: 14px / 20 / 400
  - Body-sm: 13px / 18 / 400
  - Caption: 12px / 16 / 500 / tracking 0.02em
  - Label: 11px / 16 / 600 / uppercase / tracking 0.18em / color `--ink-400`

### Layout & spacing

- Base unit: 4px. All paddings and gaps are multiples of 4: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Card radius: 12px standard, 16px hero, 8px small.
- Border radius for inputs and buttons: 10px.
- Container max width: 1280px. Side gutters: 24px.
- Window assumes a default 1280×832 Electron window.

### Motion

- Default transition: 150ms ease-out.
- Hover lift: translate -1px + subtle shadow. Avoid bounce.
- Focus ring: 2px `var(--byan-500)` at 30% alpha, 1px offset.
- Loading: spinner 16px, `--byan-500`, 1s linear rotation.
- Progress: solid bar `--byan-500`, optional shimmer overlay 2.4s linear.
- Reserve glow for active selection or success confirmation, kept brief. Skip glow on idle elements.

### Iconography

Line icons, 1.5px stroke, square caps, rounded joins. Sizes: 14, 16, 20, 24px. Use Lucide icon names where applicable. Examples used in screens:
- `terminal` for Claude Code
- `code-2` for OpenAI Codex
- `git-branch` for GitHub Copilot
- `folder` for project picker
- `key` for token field
- `eye` / `eye-off` for show/hide password
- `arrow-right` for primary CTA
- `check` for success
- `alert-circle` for error
- `loader-2` for spinner
- `settings` for settings nav
- `zap` for actions
- `external-link` for outbound

### Component library to design

1. **Button**: variants = primary (gradient fill), secondary (outline), ghost (no border), destructive (red 15% bg). Sizes = sm (28px), md (36px), lg (44px). With/without leading or trailing icon.
2. **Input**: text, password (with eye toggle), search (with leading icon), select. States = default, focus, error, disabled.
3. **Tabs / segmented control**: pill segments, active = filled `--byan-500/15` + 1px border `--byan-500/30`.
4. **Card**: base, elevated, interactive (hover lift). Optional header with title + actions slot.
5. **Stepper (horizontal)**: 5 nodes connected by 1px line. Active = filled circle 24px with thin glow `--byan-500`. Done = checkmark `--emerald`. Future = empty circle `--ink-600`. Label below, 12px, active = `--white`, others = `--ink-400`.
6. **Status badge**: caption text + colored dot. success / warning / error / neutral.
7. **Toast / banner**: 1 line, leading icon, dismissable.
8. **Dialog / modal**: overlay `rgba(0,0,0,0.6)` blur 4px, card max-width 480px.
9. **Empty state**: centered icon 48px `--ink-500`, title 16px, body 14px `--ink-400`, optional CTA.
10. **Sidebar nav**: 240px wide, items 36px tall, leading icon 16px, label 14px. Active = bg `rgba(255,255,255,0.04)` + 2px left bar `--byan-500`.
11. **Topbar**: 48px tall, logo on left, breadcrumb middle, action cluster right.
12. **Code/path block**: mono 13px on `--ink-850` bg, 8px padding, 1px border `--ink-700`, copy button trailing.
13. **List row**: 56px tall by default, primary text + secondary text + trailing chevron or actions, hover bg `rgba(255,255,255,0.02)`.

### Screens to design (desktop, 1280×832 unless noted)

Each screen needs: full canvas mockup + 3–5 callouts naming components reused.

#### A. App shell (template)
- Sidebar 240px (collapsible to 64px) on the left.
- Topbar 48px with logo, current breadcrumb, search (cmd+k), profile menu.
- Content area scrollable.
- Bottom status strip 28px: connection mode (cloud/local), version, latency, link to logs.

#### B. Onboarding — first run, no sidebar, centered, max 720px wide

1. **Welcome**
   - Logo top-center.
   - Display title: "Set up BYAN".
   - Subtitle: "Detect your AI tools, preview every change, and we only write what you confirm."
   - Field: project folder picker (input + Browse button + recent folders dropdown).
   - Footer: secondary "Skip for now" + primary "Continue" (with `arrow-right`).

2. **Detection**
   - H1: "Platforms detected".
   - Three tiles in a row:
     - Claude Code — `terminal` icon, badge "Detected" green or "Not found" muted, mono path if found, checkbox.
     - OpenAI Codex — `code-2` icon, same pattern.
     - GitHub Copilot — `git-branch` icon, same pattern.
   - Footer: "Back" ghost, "Continue" primary.

3. **Preview**
   - H1: "Files to write".
   - Accordion grouped by platform; each row shows file path (mono), action badge (CREATE / UPDATE / SKIP), expand reveals first 12 lines of the file with a code block component.
   - Sticky summary chip top-right: "9 to create · 2 to update · 0 conflicts".
   - Footer: "Back" ghost, "Apply changes" primary.

4. **Apply**
   - Centered progress bar + step count "3 of 11".
   - Live log stream (mono, monitor-style), max-height 240px with auto-scroll.
   - Cancel button (ghost, only visible while running).

5. **Done**
   - Big success check 64px `--emerald` with one-shot glow.
   - H1: "You're all set."
   - Stat row, three columns separated by 1px `--ink-700`: Files written / Files skipped / Errors.
   - Primary CTA: "Open BYAN".

#### C. Login — three modes
Centered card max 480px wide, no sidebar yet.
- Logo + "Connect to BYAN".
- Segmented control: Cloud / Local / Custom.
- Cloud: read-only URL chip, password input for token (show/hide eye), "Connect" primary, "Get a token" link to external dashboard.
- Local: paragraph copy, "Start local server" secondary that flips to chip "Server running on port 47291" `--emerald`, then "Connect to local" primary.
- Custom: URL input + token input + "Connect" primary.
- Inline error region above CTA when relevant.

#### D. Dashboard (post-login home)
- Sidebar with nav items: Dashboard / Projects / Agents / Memory / Knowledge / Sessions / MCP / Settings.
- Topbar with breadcrumb "Dashboard".
- Hero greeting: "Welcome back, Yan." display title + small caption "Last session 2 hours ago".
- Three KPI cards in a row: "Active projects 4", "Sessions today 12", "MCP servers 3 / 4 online".
- Two-column section:
  - Left: "Recent sessions" — list rows with project name, agent, duration, time ago.
  - Right: "Quick actions" — vertical list of buttons: New session, Import project, Open last project, Browse memory.

#### E. Projects (list)
- Topbar: search input "Search projects" + filter "All / Recent / Pinned" + "New project" primary.
- Table: name, slug (mono), agent count, last activity, actions (open / pin / archive).
- Empty state if zero results.

#### F. Project detail
- Topbar with breadcrumb "Projects / {name}".
- Tabs: Overview / Agents / Memory / Knowledge / Sessions / Settings.
- Overview tab: description, stats, recent sessions, knowledge entries count.

#### G. Agents
- Two-pane layout. Left: list of agents (name, persona, version). Right: agent detail with a card per concern (Persona / Tools / Memory / Versions).

#### H. Memory
- Topbar: search input + filter chips (project / agent / tag).
- Table: timestamp (mono), source, snippet, confidence, actions.

#### I. Knowledge
- Card grid 3 columns. Each card: title, source domain, last updated, tags.

#### J. Sessions
- Table: started_at (mono ISO), project, agent, duration, status badge, actions (resume / view / archive).

#### K. MCP servers
- List rows: name, status dot (running / stopped / error), command (mono code block), ports, actions (start / stop / restart / edit).
- "Add MCP server" primary CTA top right.

#### L. Settings
- Vertical sub-nav: Account / Connection / Appearance / Shortcuts / About.
- Account: name, email, avatar.
- Connection: current mode chip + "Switch login mode" secondary.
- Appearance: theme toggle (Dark default, Light coming soon, System), font size selector.
- Shortcuts: kbd rows for common actions.
- About: version, build, GitHub link, license.

#### M. Empty / error states
- 404 page (when deep link unknown): centered icon, "Nothing here", "Back home" primary.
- Crash recovery: "BYAN ran into a problem", details collapsible, "Restart" primary, "Open logs" ghost.

### Deliverables expected from the design tool

1. A page-by-page Figma-style flat mockup for screens A through M.
2. A components page showing the library (Button, Input, Stepper, Tabs, Card, Badge, Toast, Dialog, Empty state, Sidebar, Topbar, Code block, List row).
3. A typography page (the hierarchy table, in actual Inter and JetBrains Mono).
4. A color page (every token in a swatch).
5. A motion notes page (durations, easings, where glow is allowed).
6. Light theme is OUT OF SCOPE for now. Design dark only and confidently.

### Hard constraints

- Desktop only. Min width 960px. Default 1280×832.
- Skip emoji on screens.
- Avoid glass-morphism. Avoid ambient gradient orbs. Avoid frosted blur backgrounds. Surfaces stay solid `--ink-900`.
- Avoid skeuomorphism, 3D, neon overload. Subtle accents only.
- One typeface family (Inter + JetBrains Mono). Skip display fonts.
- Two accent colors max per screen (`--byan-500` and one of cyan/emerald/amber/red).
- The product feels closer to Linear and Cron than to a SaaS landing page.

### Mood references

- Linear app — sidebar density, list rows, command palette feel.
- Cron / Notion Calendar — calmness of typography.
- Raycast — segmented controls, kbd shortcuts visible.
- Cursor IDE — settings panels.
- Vercel v0 — empty states, dialog modals.
- GitHub Primer — list and table density.
- Stripe Dashboard — KPI cards.

### What I do NOT want

- "Beautiful AI dashboard" generic stock look.
- Pastel gradients, purple bokeh backgrounds.
- Glass cards stacked over a colorful blur.
- Inflated heroes the size of half the screen.
- Round avatars with halos. Round dots are fine; avatars 24px square with 4px radius.
- Cute illustrations. Use icons.
- Marketing copy. Every label is short, declarative, lowercase except proper nouns and the H titles which are sentence case.

End of brief. Generate the screens.
