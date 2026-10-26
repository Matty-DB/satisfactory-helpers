// Production solver. Pure functions, no DOM — tested with `node --test tests/`.

export const BELTS = [60, 120, 270, 480, 780, 1200];
export const PIPES = [300, 600];
const NON_DEFAULT_MACHINES = new Set(['Desc_Packager_C', 'Desc_Converter_C']);

export function makeIndex(data) {
  const byId = {};
  const producers = {};
  for (const r of data.recipes) {
    byId[r.id] = r;
    r.out.forEach(([item], i) => {
      (producers[item] ||= []).push({ r, main: i === 0 });
    });
  }
  return { data, byId, producers };
}

export function isAvailable(r, opts) {
  return r.tier <= (opts.maxTier ?? 9) && (!r.alt || opts.alts?.has(r.id));
}

// Recipes the player could use for an item, best default first.
export function recipeOptions(index, item, opts) {
  const name = index.data.items[item]?.n;
  const score = ({ r, main }) =>
    (main ? 0 : 100) + (NON_DEFAULT_MACHINES.has(r.m) ? 50 : 0) + (r.alt ? 10 : 0) + (r.n === name ? 0 : 1);
  return (index.producers[item] || [])
    .filter(({ r }) => isAvailable(r, opts))
    .sort((a, b) => score(a) - score(b))
    .map(({ r }) => r);
}

export function chosenRecipe(index, item, opts) {
  if (index.data.items[item]?.raw) return null;
  const options = recipeOptions(index, item, opts);
  const picked = opts.choice?.[item];
  return options.find((r) => r.id === picked) || options[0] || null;
}

export const perMin = (r, amount) => (amount * 60) / r.t;
const outAmount = (r, item) => r.out.find(([id]) => id === item)[1];

export function beltFor(rate, fluid) {
  const tiers = fluid ? PIPES : BELTS;
  const i = tiers.findIndex((cap) => rate <= cap + 1e-9);
  return i === -1 ? { mk: tiers.length, lines: Math.ceil(rate / tiers.at(-1)) } : { mk: i + 1, lines: 1 };
}

/**
 * targets: [{ item, rate }] (rate per minute)
 * opts: { maxTier, alts: Set<recipeId>, choice: { [itemId]: recipeId } }
 */
export function solve(index, targets, opts = {}) {
  const items = index.data.items;
  const recipeOf = {};
  const order = [];
  const state = {}; // undefined | 'open' | 'done'
  const cutEdges = new Set(); // "consumer>ingredient" edges that close a cycle
  const cycles = [];

  // DFS consumer → ingredient; reverse postorder puts every consumer before its inputs.
  function visit(item) {
    if (state[item] === 'done') return;
    state[item] = 'open';
    const r = chosenRecipe(index, item, opts);
    recipeOf[item] = r;
    if (r) {
      for (const [ing] of r.in) {
        if (state[ing] === 'open') {
          cutEdges.add(`${item}>${ing}`);
          cycles.push({ item, ingredient: ing });
        } else visit(ing);
      }
    }
    state[item] = 'done';
    order.push(item);
  }
  for (const t of targets) visit(t.item);
  order.reverse();

  const demand = {};
  for (const t of targets) demand[t.item] = (demand[t.item] || 0) + t.rate;

  const nodes = [];
  const raw = {};
  const unavailable = {};
  const loopInputs = {};
  const byproducts = {};
  let power = 0;

  for (const item of order) {
    const rate = demand[item] || 0;
    if (rate <= 1e-9) continue;
    const r = recipeOf[item];
    if (!r) {
      (items[item]?.raw ? raw : unavailable)[item] = rate;
      continue;
    }
    const machines = rate / perMin(r, outAmount(r, item));
    const mw = r.pw ?? index.data.machines[r.m]?.mw ?? 0;
    const inputs = r.in.map(([ing, amt]) => {
      const need = machines * perMin(r, amt);
      if (cutEdges.has(`${item}>${ing}`)) loopInputs[ing] = (loopInputs[ing] || 0) + need;
      else demand[ing] = (demand[ing] || 0) + need;
      return [ing, need];
    });
    const outputs = r.out.map(([p, amt]) => {
      const made = machines * perMin(r, amt);
      if (p !== item) byproducts[p] = (byproducts[p] || 0) + made;
      return [p, made];
    });
    power += machines * mw;
    nodes.push({ item, recipe: r, rate, machines, power: machines * mw, inputs, outputs });
  }

  let maxSolid = 0, maxFluid = 0;
  for (const [item, rate] of Object.entries(demand)) {
    if (items[item]?.f) maxFluid = Math.max(maxFluid, rate);
    else maxSolid = Math.max(maxSolid, rate);
  }

  return {
    nodes, raw, unavailable, loopInputs, byproducts, cycles, power, demand,
    belt: maxSolid ? { rate: maxSolid, ...beltFor(maxSolid, false) } : null,
    pipe: maxFluid ? { rate: maxFluid, ...beltFor(maxFluid, true) } : null,
  };
}

// Proportional tree for display: each branch shows its share of the chain.
export function buildTree(index, item, rate, opts, path = new Set(), depth = 0) {
  const r = chosenRecipe(index, item, opts);
  const node = { item, rate, recipe: r, children: [] };
  if (!r) return node;
  if (path.has(item) || depth > 40) return { ...node, cycle: true, recipe: null };
  const machines = rate / perMin(r, outAmount(r, item));
  node.machines = machines;
  const next = new Set(path).add(item);
  node.children = r.in.map(([ing, amt]) => buildTree(index, ing, machines * perMin(r, amt), opts, next, depth + 1));
  return node;
}
