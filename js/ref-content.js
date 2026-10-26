// Hand-written reference content. Recipe numbers are never typed here; the UI reads them from data.js.

// Names must match an alternate recipe in data.js (checked by tests/content.test.mjs).
export const BEST_ALTS = [
  { group: 'Ingots & basics', picks: [
    ['Pure Iron Ingot', 'About 1.9× the iron ingots per ore. Worth the Refinery and water once you have Tier 5.'],
    ['Pure Copper Ingot', 'About 2.5× the copper ingots per ore, using water.'],
    ['Pure Caterium Ingot', '1.5× the caterium ingots per ore, using water.'],
    ['Iron Alloy Ingot', 'Foundry recipe that mixes a little copper into iron for more ingots per ore.'],
    ['Copper Alloy Ingot', 'Foundry recipe that mixes iron into copper for a big boost to copper output.'],
    ['Solid Steel Ingot', 'Steel from iron ingots + coal. Lets you reuse existing iron smelting lines.'],
    ['Coke Steel Ingot', 'Steel using Petroleum Coke instead of coal, so an oil base can feed steel.'],
    ['Wet Concrete', 'Twice the concrete per limestone. You will build a lot of concrete.'],
  ] },
  { group: 'Early parts', picks: [
    ['Cast Screw', 'Screws straight from ingots, skipping the rod step. One less machine in every screw line.'],
    ['Steel Screw', 'A single Steel Beam makes a big stack of screws. Good when you have spare steel.'],
    ['Stitched Iron Plate', 'Reinforced Iron Plate from plates + wire, with no screws at all.'],
    ['Bolted Iron Plate', 'Higher-throughput Reinforced Iron Plate if you have screws to spare.'],
    ['Iron Wire', 'Wire from iron when copper is scarce near your base.'],
    ['Fused Wire', 'Copper + caterium wire with high output per machine.'],
    ['Caterium Wire', 'Lots of wire per caterium ingot.'],
    ['Insulated Cable', 'Cable from wire + rubber, much faster than the standard recipe.'],
  ] },
  { group: 'Frames, rotors & motors', picks: [
    ['Steeled Frame', 'Modular Frames from steel pipe + Reinforced Iron Plates, no rods needed.'],
    ['Bolted Frame', 'Faster Modular Frames using screws.'],
    ['Steel Rotor', 'Rotors from steel pipe + wire. Removes screws and rods.'],
    ['Copper Rotor', 'Rotors from copper sheets + screws. Useful on a copper-heavy base.'],
    ['Encased Industrial Pipe', 'Encased Industrial Beams from steel pipe + concrete. Simpler steel logistics.'],
    ['Heavy Encased Frame', 'Nearly 2× the Heavy Modular Frames per Modular Frame, and no screws at all.'],
    ['Rigor Motor', 'Twice the motors per rotor and stator, for one Crystal Oscillator per batch.'],
  ] },
  { group: 'Oil & plastics', picks: [
    ['Heavy Oil Residue', 'Turns crude into Heavy Oil Residue for Fuel/Petroleum Coke chains.'],
    ['Diluted Fuel', 'Blender recipe that makes much more Fuel from Heavy Oil Residue + water.'],
    ['Recycled Plastic', 'Plastic from rubber + fuel. Pair it with Recycled Rubber for a very oil-efficient loop.'],
    ['Recycled Rubber', 'Rubber from plastic + fuel. The other half of the recycling loop.'],
    ['Polyester Fabric', 'Fabric from Polymer Resin + water, so you do not need Mycelia.'],
  ] },
  { group: 'Space Elevator parts', picks: [
    ['Plastic Smart Plating', 'Twice the Smart Plating per Reinforced Iron Plate and Rotor, for a little plastic.'],
    ['Flexible Framework', 'Versatile Framework from rubber + steel. Faster.'],
    ['Automated Speed Wiring', 'Automated Wiring from wire + high-speed connectors. Much higher output.'],
    ['Silicon Circuit Board', 'Circuit boards from copper sheets + silica. Uses no plastic.'],
    ['Caterium Circuit Board', 'Circuit boards using quickwire, cutting plastic demand.'],
  ] },
  { group: 'Aluminum & late game', picks: [
    ['Sloppy Alumina', 'More Alumina Solution per bauxite with no Silica byproduct to deal with.'],
    ['Electrode Aluminum Scrap', 'More scrap per alumina, using Petroleum Coke.'],
    ['Pure Aluminum Ingot', 'Ingots from scrap alone, with no silica input.'],
    ['Pure Quartz Crystal', 'More quartz crystals per raw quartz using water.'],
    ['Heavy Flexible Frame', 'Almost twice as fast per Manufacturer, swapping steel pipe for rubber.'],
  ] },
];

// Space Elevator deliveries in 1.x. Item names are matched to data.js items at runtime.
export const SPACE_ELEVATOR = [
  { phase: 1, unlocks: 'Tiers 3 & 4', cost: [['Smart Plating', 50]] },
  { phase: 2, unlocks: 'Tiers 5 & 6', cost: [['Smart Plating', 1000], ['Versatile Framework', 1000], ['Automated Wiring', 100]] },
  { phase: 3, unlocks: 'Tiers 7 & 8', cost: [['Versatile Framework', 2500], ['Modular Engine', 500], ['Adaptive Control Unit', 100]] },
  { phase: 4, unlocks: 'Tier 9', cost: [['Assembly Director System', 500], ['Magnetic Field Generator', 500], ['Nuclear Pasta', 250], ['Thermal Propulsion Rocket', 100]] },
  { phase: 5, unlocks: 'Project Assembly complete', cost: [['Nuclear Pasta', 1000], ['Biochemical Sculptor', 1000], ['AI Expansion Server', 256], ['Ballistic Warp Drive', 200]] },
];

export const EXTRACTORS = [
  ['Miner Mk.1', 30, 60, 120],
  ['Miner Mk.2', 60, 120, 240],
  ['Miner Mk.3', 120, 240, 480],
  ['Oil Extractor (m³)', 60, 120, 240],
];

// Written by action, not by button. Console layouts differ by patch and settings,
// so each tip says where to find the binding instead of naming a button.
export const PS5_TIPS = [
  { title: 'Find your real bindings first', body: 'Open Options › Controls once and note the buttons for Build menu, Dismantle, Nudge, Zoop and Pick-up/Sample. Everything below is named by action so it stays correct if you remap.' },
  { title: 'Zoop instead of placing one by one', body: 'While holding a foundation, wall or belt support, use Zoop to drag out a whole line in one go. Huge time saver for floors and walls on controller.' },
  { title: 'Use Nudge for fine placement', body: 'Nudge mode locks the hologram and lets you shift it with the d-pad, so lining machines up with belts is much easier than with the analog stick.' },
  { title: 'Sample an existing building', body: 'Point at a placed machine and use Sample (copy) to pick the same building, with its recipe, without opening the build menu.' },
  { title: 'Multi-select dismantle', body: 'In dismantle mode you can mark several pieces before confirming, so tearing down a test build takes seconds.' },
  { title: 'Blueprints from Tier 4', body: 'FICSIT Blueprints (Tier 4) gives you the Blueprint Designer. Build one tidy smelter or constructor module, save it, and stamp copies, which beats aiming every machine by hand on a pad.' },
  { title: 'Pin recipes to your HUD', body: 'Pin a recipe or milestone in the codex/HUB and its cost stays on screen. Use this page for the totals and the in-game pin for the shopping list.' },
  { title: 'Dimensional Depot', body: 'Once unlocked, upload common parts (plates, rods, concrete, wire) into the Dimensional Depot so you can build anywhere without running back to storage.' },
  { title: 'Map stamps for resource nodes', body: 'Drop stamps on the map for pure nodes as you scan them. Finding them again with a controller cursor is slow otherwise.' },
  { title: 'Overclock with Power Shards, not more machines', body: 'On console, every extra machine costs placement time and frame rate. A shard-boosted machine (up to 250%) often beats building another one — see the Machines tab for the power cost.' },
  { title: 'Watch performance in big bases', body: 'Long, tangled belts and lots of tiny factories cost frame rate. Compact production in one area and send results by train, rather than spreading machines everywhere.' },
  { title: 'Save often, keep a few slots', body: 'Check the autosave interval in Options › Gameplay and keep manual saves before big rebuilds. Console saves cannot be edited outside the game.' },
];
