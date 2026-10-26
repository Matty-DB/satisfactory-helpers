# Plan: Satisfactory Helper Page (production calculator + quick reference)

**Status:** approved and built (2026-10-26). Hosting: GitHub Pages + custom domain
**Date:** 2026-10-26
**Mode:** interview → plan

## Requirements Summary

An interactive HTML/CSS/JS page to keep open beside a PS5 while playing Satisfactory (1.x).

From the interview:
| Decision | Answer |
|---|---|
| Core job | Production calculator **and** quick reference |
| Viewing device | Mix of phone, tablet, laptop, so the layout has to be responsive and phone-first |
| Game coverage | All tiers (0–9), filterable by the tier you have reached |
| Alternate recipes | Supported, with a toggle for each recipe so you can tick the ones you have unlocked |
| Quick reference | Milestone/tier costs (checklist), machine and power stats, best alt recipes, PS5 controller tips |

Constraints I assumed (none were stated):
- **No build step and no framework.** Plain HTML, CSS, and vanilla JS (ES modules are fine). It has to work when opened straight from disk (`file://`), so the game data ships as a `.js` file, not JSON loaded with `fetch()`.
- **Offline once loaded.** No external API calls.
- **Per-player state goes in `localStorage`** (your tier, unlocked alts, milestone ticks, last calculation). Every read and write is wrapped in try/catch, and the page still works without storage.
- The project directory is empty right now. No git repo and no existing code.

## Proposed File Layout

```
satisfactory-helpers/
├── index.html          # shell: tabs (Calculator · Reference), settings drawer
├── css/styles.css      # tokens on :root, light/dark, mobile-first breakpoints
├── js/
│   ├── data.js         # generated: items, recipes (std + alt), machines, milestones
│   ├── calc.js         # pure solver, no DOM (testable in Node)
│   ├── state.js        # localStorage wrapper (tier, alts, checklist)
│   ├── ui-calc.js      # calculator UI + result tree/table rendering
│   └── ui-ref.js       # reference tabs rendering
├── tools/build-data.mjs  # converts upstream game data → js/data.js
└── tests/calc.test.mjs   # node --test, no deps
```

## Implementation Steps

### 1. Game data pipeline (`tools/build-data.mjs` → `js/data.js`)
- Source: the community-extracted 1.x game data from SatisfactoryTools (`greeny/SatisfactoryTools`, `data/data1.0.json`) or an equivalent extract of the game's `Docs.json`. **Pin the commit hash** in a comment at the top of `data.js`.
- Keep only what the page needs: item (id, name, form solid/fluid, sink points), recipe (id, name, alternate flag, machine, duration, ingredients, products, unlock tier/milestone), machine (id, name, power MW, Mk belt/pipe limits), milestones (tier, name, cost).
- Fluids are stored in m³ (the upstream data uses liters ×1000, so divide).
- Exclude equipment, building-only recipes, and hand-crafting-only recipes from the calculator dataset. Building recipes stay in the milestone data where they are needed.

### 2. Solver (`js/calc.js`, pure functions)
- `solve(targets, { recipeChoice, unlockedAlts, maxTier }) → { nodes, rawInputs, byproducts, powerMW }`
- Algorithm: recursive demand expansion. Each item resolves to exactly one chosen recipe, and the default is the standard recipe. Demand for the same item from different branches is summed. Per node: `machines = rate / (productAmount × 60 / duration)`, kept fractional, plus a `ceil` count for building.
- Raw resources (ore, water, crude oil, nitrogen, and so on) are leaves.
- Byproducts (e.g. Heavy Oil Residue, Polymer Resin) go into a **surplus list**. They are not fed back into the chain in v1, and the UI says so.
- **Cycle guard:** some alternates loop (Recycled Plastic/Rubber). A visited-set on the current path detects a cycle, stops expanding, and puts a visible warning on that node instead of recursing forever.
- Power = Σ machines × machine MW at 100% clock. Overclocking is shown in the reference section, not solved for in v1.

### 3. State (`js/state.js`)
- Keys: `sf.tier`, `sf.alts` (array of recipe ids), `sf.recipeChoice`, `sf.milestonesDone`, `sf.lastTargets`.
- Settings drawer: tier selector, alt-recipe checklist (searchable, grouped by product), plus export/import of settings as JSON text so you can move them between phone and laptop.

### 4. Calculator UI (`js/ui-calc.js`)
- Target picker: searchable item list filtered to `maxTier`, with an amount per minute. Multiple targets allowed.
- Recipe selector for each item, shown only when more than one unlocked recipe exists.
- Output views, switchable:
  - **Build list:** a table of machine × count (fractional and rounded up), recipe, inputs/outputs per minute, and MW.
  - **Tree:** a collapsible chain from target down to raw resources.
  - **Summary:** raw ore per minute, total MW, byproducts, and the belt/pipe Mk needed for the largest flow.
- Phone layout: the table collapses into cards, and tap targets are at least 44px.

### 5. Reference UI (`js/ui-ref.js`)
- **Milestones:** Tier → milestone → cost list, with a tick box per milestone (persisted). Space Elevator phases too.
- **Machines & power:** table of machine MW, belt Mk1–6 and pipe Mk1–2 throughput, and how overclocking scales power (power ∝ clock^1.321) with a small calculator for it, plus Power Shard slots.
- **Best alt recipes:** a curated short list of roughly 20–30 alternates with a one-line reason each (e.g. Wet Concrete, Solid Steel Ingot, Pure Iron Ingot, Steeled Frame, Heavy Encased Frame). The recipe numbers are pulled from `data.js` so they cannot drift from the calculator.
- **PS5 controller tips:** build-mode controls (nudge, zoop, blueprint, dismantle multi-select), plus console quality-of-life settings. **I have to check these against the in-game Controls menu**, because console bindings changed between patches. Any tip I can't confirm gets marked "verify in-game".

### 6. Styling (`css/styles.css`)
- Mobile-first, with breakpoints at 768px (tablet: calculator and results side by side) and 1100px (desktop).
- Colour tokens on `:root`, a dark theme by default (it's easier on the eyes next to a TV), and a light theme option.
- No horizontal scroll at 360px width.

## Acceptance Criteria (all testable)

1. Opening `index.html` from disk (`file://`) in Safari and Chrome loads with **zero console errors** and makes no network requests after load.
2. Target **60 Iron Plate/min**, standard recipes → 3.0 Constructors, 3.0 Smelters, **90 Iron Ore/min**, 24 MW total (3×4 MW Constructor + 3×4 MW Smelter).
3. Target **5 Reinforced Iron Plate/min**, standard → 1.0 Assembler, 30 Iron Plate/min (1.5 Constructors), 60 Screw/min (1.5 Constructors), 15 Iron Rod/min (1.0 Constructor), and **60 Iron Ore/min** total (45 for plates + 15 for rods).
4. Same target with the **Cast Screw** alt ticked and selected (5 Ingot → 20 Screw / 24 s): Iron Rod disappears from the chain, Cast Screw runs at 1.2 Constructors on 15 Iron Ingot/min, and total ore stays at 60/min. The test checks these values.
5. Picking a cyclic alt pair (Recycled Plastic + Recycled Rubber) finishes in under 100 ms and shows a cycle warning. No infinite loop and no frozen page.
6. Byproducts show in the surplus list with their rates (e.g. Heavy Oil Residue from standard Plastic).
7. Setting the tier to 2 hides every item and recipe unlocked above Tier 2 in the calculator picker.
8. Tier, alt ticks, and milestone ticks survive a page reload. With `localStorage` blocked (private mode), the page still works and keeps nothing.
9. Settings export → paste into a fresh browser → import gives identical settings.
10. No horizontal scrollbar at 360×740, 820×1180, and 1440×900 viewports.
11. `node --test tests/` passes, covering criteria 2–6 with expected values written by hand, not copied from the solver.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Recipe data is wrong or outdated (game patches change numbers) | Generate the data from a pinned upstream extract, never hand-type it. Spot-check 10 recipes against the in-game codex. Show the data version in the page footer. |
| PS5 controller tips are wrong | Check each one in-game. Anything unconfirmed is labelled "verify". |
| Alternate-recipe cycles hang the solver | Path-based cycle detection plus a recursion-depth cap, covered by criterion 5. |
| Byproduct handling is simplified, so totals overstate inputs for byproduct-heavy chains (oil) | Say so in the UI. A linear-programming solver is a v2 follow-up. |
| `data.js` gets large and slows the phone | Strip unused fields. Target under 300 KB. Check load time on a phone. |
| The page is awkward to open on a phone from a local file | Decide on hosting (see Open Question 1). |

## Verification Steps

1. `node --test tests/`: all green.
2. Open `index.html` via `file://` and confirm the console is clean and the Network tab shows nothing after load.
3. Walk through criteria 2–7 by hand in the UI.
4. DevTools device mode at 360, 820, and 1440 widths: no horizontal scroll, and tap targets at least 44px.
5. Reload persistence, then repeat in a private window (criterion 8).
6. Spot-check 10 random recipes in `data.js` against the in-game codex or wiki.

## Open Questions (for you to decide before or during execution)

1. **How will you open it on your phone?** Options: (a) host it as a private claude.ai Artifact link (easiest; it would be bundled into one HTML page), (b) GitHub Pages, (c) copy the files to the phone. I suggest (a) for phone and tablet, with the local files kept as the source.
2. Game version: I'm assuming the current 1.x release. Tell me if you're on an older build.

## Out of Scope for v1
- Linear-programming optimiser (feeding byproducts back in, minimising ore)
- Factory layout or blueprint planning
- Reading save files (not practical on PS5)
- Overclock-aware machine counts in the solver
