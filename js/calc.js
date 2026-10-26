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
    // Unpacking is never a real source: the packaged item is made from this one.
    .filter(({ r }) => isAvailable(r, opts) && !r.n.startsWith('Unpackage '))
    .sort((a, b) => score(a) - score(b))
    .map(({ r }) => r);
}

// choice[item] is a recipe id, or [{ id, share }] to split an item between recipes.
export function chosenMix(index, item, opts) {
  if (index.data.items[item]?.raw) return [];
  const options = recipeOptions(index, item, opts);
  const picked = opts.choice?.[item];
  if (Array.isArray(picked)) {
    const mix = picked.map(({ id, share }) => ({ r: options.find((o) => o.id === id), share })).filter((m) => m.r && m.share > 0);
    const total = mix.reduce((t, m) => t + m.share, 0);
    if (mix.length) return mix.map((m) => ({ r: m.r, share: m.share / total }));
  }
  const r = options.find((o) => o.id === picked) || options[0];
  return r ? [{ r, share: 1 }] : [];
}

export function chosenRecipe(index, item, opts) {
  return chosenMix(index, item, opts)[0]?.r ?? null;
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
 * opts: { maxTier, alts: Set<recipeId>, choice: { [itemId]: recipeId | [{ id, share }] } }
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
    const mix = chosenMix(index, item, opts);
    recipeOf[item] = mix;
    for (const { r } of mix) {
      for (const [ing] of r.in) {
        if (state[ing] === 'open') {
          if (!cutEdges.has(`${item}>${ing}`)) cycles.push({ item, ingredient: ing });
          cutEdges.add(`${item}>${ing}`);
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
  const hand = {};
  const loopInputs = {};
  const byproducts = {};
  let power = 0;

  for (const item of order) {
    const total = demand[item] || 0;
    if (total <= 1e-9) continue;
    const mix = recipeOf[item];
    if (!mix.length) {
      (items[item]?.raw ? raw : items[item]?.hand ? hand : unavailable)[item] = total;
      continue;
    }
    for (const { r, share } of mix) {
      const rate = total * share;
      // Split items get one node per recipe, told apart by key.
      const key = mix.length > 1 ? `${item}@${r.id}` : item;
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
      nodes.push({ item, key, share, recipe: r, rate, machines, power: machines * mw, inputs, outputs });
    }
  }

  let maxSolid = 0, maxFluid = 0;
  for (const [item, rate] of Object.entries(demand)) {
    if (items[item]?.f) maxFluid = Math.max(maxFluid, rate);
    else maxSolid = Math.max(maxSolid, rate);
  }

  return {
    nodes, raw, hand, unavailable, loopInputs, byproducts, cycles, power, demand,
    belt: maxSolid ? { rate: maxSolid, ...beltFor(maxSolid, false) } : null,
    pipe: maxFluid ? { rate: maxFluid, ...beltFor(maxFluid, true) } : null,
  };
}

// Proportional tree for display: each branch shows its share of the chain.
// A split item becomes a node whose children are one branch per recipe.
export function buildTree(index, item, rate, opts, path = new Set(), depth = 0, forced = null) {
  const mix = forced ? [{ r: forced, share: 1 }] : chosenMix(index, item, opts);
  if (!mix.length) return { item, rate, recipe: null, children: [] };
  if (path.has(item) || depth > 40) return { item, rate, recipe: null, cycle: true, children: [] };
  if (mix.length > 1) {
    return { item, rate, recipe: null, split: true, children: mix.map(({ r, share }) => buildTree(index, item, rate * share, opts, path, depth, r)) };
  }
  const r = mix[0].r;
  const node = { item, rate, recipe: r, via: forced ? r.n : null, children: [] };
  const machines = rate / perMin(r, outAmount(r, item));
  node.machines = machines;
  const next = new Set(path).add(item);
  node.children = r.in.map(([ing, amt]) => buildTree(index, ing, machines * perMin(r, amt), opts, next, depth + 1));
  return node;
}
