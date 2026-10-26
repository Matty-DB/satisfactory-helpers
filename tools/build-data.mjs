// Converts the community-extracted Satisfactory 1.x game data into js/data.js.
// Usage: node tools/build-data.mjs [path/to/data1.0.json]
// Without a path it downloads the pinned upstream file.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM_COMMIT = 'fb43f813c03eb306b0e8d0047a8c53ae010044e0';
const UPSTREAM_URL = `https://raw.githubusercontent.com/greeny/SatisfactoryTools/${UPSTREAM_COMMIT}/data/data1.0.json`;

async function loadSource() {
  const arg = process.argv[2];
  const local = arg || join(ROOT, 'vendor-src', 'data1.0.json');
  if (existsSync(local)) return JSON.parse(readFileSync(local, 'utf8'));
  const res = await fetch(UPSTREAM_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const text = await res.text();
  mkdirSync(dirname(local), { recursive: true });
  writeFileSync(local, text);
  return JSON.parse(text);
}

const src = await loadSource();
const S = src.schematics, R = src.recipes, I = src.items, B = src.buildings;

// Items that are always gathered rather than crafted in the calculator.
const RAW = new Set([
  ...Object.keys(src.resources),
  'Desc_Wood_C', 'Desc_Leaves_C', 'Desc_Mycelia_C', 'Desc_HogParts_C', 'Desc_SpitterParts_C',
  'Desc_StingerParts_C', 'Desc_HatcheryParts_C', 'Desc_WAT1_C', 'Desc_WAT2_C', 'Desc_Crystal_C',
  'Desc_Crystal_mk2_C', 'Desc_Crystal_mk3_C',
]);
// Water, oil and nitrogen need their extractor before they can be used.
const RAW_EXTRACTOR = {
  Desc_Water_C: 'Desc_WaterPump_C',
  Desc_LiquidOil_C: 'Desc_OilPump_C',
  Desc_NitrogenGas_C: 'Desc_FrackingSmasher_C',
};

// --- schematic tiers -------------------------------------------------------
const schTierMemo = {};
function schematicTier(cls, seen = new Set()) {
  if (cls in schTierMemo) return schTierMemo[cls];
  const s = S[cls];
  if (!s || seen.has(cls)) return 0;
  seen.add(cls);
  let t = s.type === 'EST_Milestone' ? s.tier : 0;
  for (const req of s.requiredSchematics || []) t = Math.max(t, schematicTier(req, seen));
  return (schTierMemo[cls] = t);
}

const recipeUnlockTier = {};
const recipeSchematicType = {};
for (const s of Object.values(S)) {
  if (!['EST_Milestone', 'EST_Tutorial', 'EST_MAM', 'EST_Alternate'].includes(s.type)) continue;
  const t = schematicTier(s.className);
  for (const r of s.unlock.recipes) {
    if (!(r in recipeUnlockTier) || t < recipeUnlockTier[r]) {
      recipeUnlockTier[r] = t;
      recipeSchematicType[r] = s.type;
    }
  }
}

// Tier at which each building becomes available (via its build recipe).
const buildingTier = {};
for (const r of Object.values(R)) {
  if (!r.forBuilding) continue;
  const t = recipeUnlockTier[r.className];
  if (t === undefined) continue;
  for (const p of r.products) {
    if (!(p.item in buildingTier) || t < buildingTier[p.item]) buildingTier[p.item] = t;
  }
}

// --- recipes ---------------------------------------------------------------
const machineRecipes = Object.values(R).filter(
  (r) => r.inMachine && !r.forBuilding && r.producedIn.length && B[r.producedIn[0]]
);

const usedMachines = new Set(machineRecipes.map((r) => r.producedIn[0]));
const usedItems = new Set();
for (const r of machineRecipes) for (const x of [...r.ingredients, ...r.products]) usedItems.add(x.item);

// Fixpoint: recipe tier = max(unlock, machine, ingredients); item tier = min over its recipes.
const itemTier = {};
for (const id of usedItems) {
  if (RAW.has(id)) itemTier[id] = RAW_EXTRACTOR[id] ? buildingTier[RAW_EXTRACTOR[id]] ?? 0 : 0;
}
const recipeTier = {};
for (let pass = 0, changed = true; changed && pass < 50; pass++) {
  changed = false;
  for (const r of machineRecipes) {
    let t = Math.max(recipeUnlockTier[r.className] ?? 0, buildingTier[r.producedIn[0]] ?? 0);
    let ok = true;
    for (const ing of r.ingredients) {
      if (itemTier[ing.item] === undefined) { ok = false; break; }
      t = Math.max(t, itemTier[ing.item]);
    }
    if (!ok || recipeTier[r.className] === t) continue;
    recipeTier[r.className] = t;
    changed = true;
    for (const p of r.products) {
      if (RAW.has(p.item)) continue;
      if (itemTier[p.item] === undefined || t < itemTier[p.item]) itemTier[p.item] = t;
    }
  }
}

const round = (n) => Math.round(n * 1e6) / 1e6;
const recipes = machineRecipes
  .filter((r) => recipeTier[r.className] !== undefined)
  .map((r) => {
    const o = {
      id: r.className,
      n: r.name.replace(/^Alternate: /, ''),
      alt: r.alternate,
      m: r.producedIn[0],
      t: r.time,
      tier: recipeTier[r.className],
      in: r.ingredients.map((x) => [x.item, round(x.amount)]),
      out: r.products.map((x) => [x.item, round(x.amount)]),
    };
    if (r.isVariablePower) o.pw = (r.minPower + r.maxPower) / 2;
    if (recipeSchematicType[r.className] === 'EST_MAM') o.mam = true;
    return o;
  });

// --- items, machines -------------------------------------------------------
const items = {};
for (const id of [...usedItems].sort()) {
  const it = I[id];
  if (!it) continue;
  items[id] = { n: it.name, tier: itemTier[id] ?? 9 };
  if (it.liquid) items[id].f = 1;
  if (RAW.has(id)) items[id].raw = 1;
}

const machines = {};
for (const id of usedMachines) {
  machines[id] = { n: B[id].name, mw: B[id].metadata.powerConsumption ?? 0, tier: buildingTier[id] ?? 0 };
}

// --- milestones ------------------------------------------------------------
const recipeName = (cls) => R[cls]?.name.replace(/^Alternate: /, '');
const milestones = Object.values(S)
  .filter((s) => s.type === 'EST_Milestone' || s.type === 'EST_Tutorial')
  .map((s) => ({
    id: s.className,
    n: s.name,
    tier: s.tier,
    cost: s.cost.map((c) => [c.item, c.amount]),
    unlocks: s.unlock.recipes.map(recipeName).filter(Boolean),
  }))
  .sort((a, b) => a.tier - b.tier || (a.tier === 0 ? a.n.localeCompare(b.n) : 0));

for (const m of milestones) for (const [id] of m.cost) if (!items[id] && I[id]) items[id] = { n: I[id].name, tier: 9 };

const generators = Object.values(src.generators).map((g) => ({
  n: B[g.className]?.name ?? g.className,
  mw: g.powerProduction,
  fuel: g.fuel.map((f) => I[f]?.name ?? f),
}));

const data = {
  version: `SatisfactoryTools data1.0.json @ ${UPSTREAM_COMMIT.slice(0, 7)}`,
  items, recipes, machines, milestones, generators,
};

const out = `// Generated by tools/build-data.mjs — do not edit by hand.
// Source: ${UPSTREAM_URL}
export const DATA = ${JSON.stringify(data)};
`;
writeFileSync(join(ROOT, 'js', 'data.js'), out);
console.log(`items ${Object.keys(items).length}, recipes ${recipes.length} (alt ${recipes.filter((r) => r.alt).length}), machines ${Object.keys(machines).length}, milestones ${milestones.length}, ${(out.length / 1024).toFixed(0)} KB`);
