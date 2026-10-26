# Satisfactory Helper

Production calculator and quick reference for Satisfactory 1.x, made to sit on a phone, tablet or laptop next to a PS5.

- **Calculator:** pick items and a rate per minute. You get machine counts with clock settings, raw resources, power, belt/pipe tier, byproducts, a tree view, a flow diagram and a floor plan with splitters, mergers, pipe junctions, miners and a shopping list. Filters by your tier and uses the alternate recipes you've ticked.
- **Builds:** power planner (generators → fuel, water, extractors, miners, net MW) and ready-made setups from Biomass Burners to nuclear, each with computed machine counts, tips, a floor plan and "Open in calculator".
- **Milestones:** HUB tiers and Space Elevator phases with tick-off progress. "Plan" sends a cost straight to the calculator.
- **Research:** all 96 MAM research items by tree, with costs, unlocks and tick-offs, plus a suggested order. "Plan" loads a research cost into the calculator.
- **Machines & power:** overclock calculator, machine MW, belts/pipes, extractor rates, generators.
- **Best alts:** curated alternates, with recipe numbers taken from the game data.
- **PS5 tips:** console quality-of-life tips.

Settings are saved in your browser. Use *Alt recipes → Move settings to another device* to copy them between devices.

## Develop

No build step. Serve the folder (ES modules don't load from `file://`):

```sh
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # solver + content tests (node --test)
npm run build-data            # regenerate js/data.js from the pinned upstream data
npm run stamp                 # refresh cache-busting hashes in index.html (tests fail if stale)
```

Game data: [SatisfactoryTools](https://github.com/greeny/SatisfactoryTools) `data/data1.0.json`, pinned in `tools/build-data.mjs`.

Fan-made; not affiliated with Coffee Stain Studios.
