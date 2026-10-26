// Turns a BUILDS entry (names) into solver inputs (ids). Shared by the page and the tests.
// n: how many units (e.g. burners) for a build with `scale`; targets and generators scale with it.
export function buildInputs(data, build, n = build.scale?.value) {
  const factor = build.scale ? n / build.scale.value : 1;
  const itemId = Object.fromEntries(Object.entries(data.items).map(([id, it]) => [it.n, id]));
  const recipe = (name, alt) => data.recipes.find((r) => r.n === name && (alt === undefined || r.alt === alt));
  const alts = new Set((build.alts || []).map((name) => recipe(name, true).id));
  const choice = {};
  for (const [i, r] of Object.entries(build.choice || {})) choice[itemId[i]] = recipe(r).id;
  // mix: { item name: [[recipe name, share], ...] } splits one item between recipes.
  for (const [i, list] of Object.entries(build.mix || {})) choice[itemId[i]] = list.map(([r, share]) => ({ id: recipe(r).id, share }));
  for (const id of alts) {
    const r = data.recipes.find((x) => x.id === id);
    choice[r.out[0][0]] = id;
  }
  const targets = (build.targets || []).map(([name, rate]) => ({ item: itemId[name], rate: rate * factor }));
  let power = null;
  if (build.power) {
    const [gName, fName, count] = build.power;
    const gen = data.generators.find((g) => g.n === gName);
    power = { genId: gen.id, fuelId: itemId[fName], count: build.scale ? n : count };
  }
  return { targets, opts: { maxTier: 9, alts, choice }, power };
}
