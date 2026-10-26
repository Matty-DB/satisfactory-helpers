# Satisfactory Helper

Production calculator and quick reference for Satisfactory 1.x, made to sit on a phone, tablet or laptop next to a PS5.

- **Calculator:** pick items and a rate per minute. You get machine counts with clock settings, raw resources, power, belt/pipe tier, byproducts, and a tree view. Filters by your tier and uses the alternate recipes you've ticked.
- **Milestones:** HUB tiers and Space Elevator phases with tick-off progress. "Plan" sends a cost straight to the calculator.
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
```

Game data: [SatisfactoryTools](https://github.com/greeny/SatisfactoryTools) `data/data1.0.json`, pinned in `tools/build-data.mjs`.

Fan-made; not affiliated with Coffee Stain Studios.
