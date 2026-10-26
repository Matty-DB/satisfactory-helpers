// Turns a BUILDS entry (names) into solver inputs (ids). Shared by the page and the tests.
export function buildInputs(data, build) {
  const itemId = Object.fromEntries(Object.entries(data.items).map(([id, it]) => [it.n, id]));
  const recipe = (name, alt) => data.recipes.find((r) => r.n === name && (alt === undefined || r.alt === alt));
  const alts = new Set((build.alts || []).map((n) => recipe(n, true).id));
  const choice = {};
  for (const [i, r] of Object.entries(build.choice || {})) choice[itemId[i]] = recipe(r).id;
  for (const id of alts) {
    const r = data.recipes.find((x) => x.id === id);
    choice[r.out[0][0]] = id;
  }
  const targets = (build.targets || []).map(([n, rate]) => ({ item: itemId[n], rate }));
  let power = null;
  if (build.power) {
    const [gName, fName, count] = build.power;
    const gen = data.generators.find((g) => g.n === gName);
    power = { genId: gen.id, fuelId: itemId[fName], count };
  }
  return { targets, opts: { maxTier: 9, alts, choice }, power };
}
