// Build plans: rows of machines on manifolds with splitters, mergers, pipe junctions,
// sources (miners, extractors) and sinks (storage, AWESOME Sink), plus a parts list.
// layoutPlan is pure (tested in Node); factory.js draws it.
import { graphOf } from './diagram.js';
import { beltFor } from './calc.js';

// Approximate footprints in metres: [width along the manifold, depth]. Port positions are not modelled.
export const FOOTPRINT = {
  Desc_SmelterMk1_C: [6, 9],
  Desc_ConstructorMk1_C: [8, 10],
  Desc_AssemblerMk1_C: [10, 15],
  Desc_FoundryMk1_C: [10, 9],
  Desc_ManufacturerMk1_C: [18, 20],
  Desc_OilRefinery_C: [10, 20],
  Desc_Packager_C: [8, 8],
  Desc_Blender_C: [18, 16],
  Desc_HadronCollider_C: [24, 38],
  Desc_Converter_C: [16, 16],
  Desc_QuantumEncoder_C: [22, 48],
  Desc_GeneratorBiomass_Automated_C: [8, 8],
  Desc_GeneratorCoal_C: [10, 26],
  Desc_GeneratorFuel_C: [20, 20],
  Desc_GeneratorNuclear_C: [36, 43],
};
export const MAX_PER_ROW = 8;
export const MAX_GENERATORS_PER_ROW = 16; // one long manifold you can keep extending
const GAP = 2; // walkway between machines, room for a splitter
const LANE_LINK = 10; // metres of belt allowed for each link between rows or to a source

// Where a raw resource comes from, and the building that collects it.
function sourceFor(data, item, rate) {
  const it = data.items[item];
  if (item === 'Desc_Water_C') return { kind: 'extractor', building: 'Water Extractor', per: 120, count: Math.ceil(rate / 120 - 1e-9) };
  if (item === 'Desc_LiquidOil_C') return { kind: 'extractor', building: 'Oil Extractor', per: 120, count: Math.ceil(rate / 120 - 1e-9) };
  if (item === 'Desc_NitrogenGas_C') return { kind: 'well', building: 'Resource Well', count: 1 };
  const minable = ['Desc_OreIron_C', 'Desc_OreCopper_C', 'Desc_Stone_C', 'Desc_Coal_C', 'Desc_OreGold_C', 'Desc_RawQuartz_C',
    'Desc_Sulfur_C', 'Desc_OreBauxite_C', 'Desc_OreUranium_C', 'Desc_SAM_C'];
  if (minable.includes(item)) return { kind: 'miner', building: 'Miner Mk.1', per: 60, count: Math.ceil(rate / 60 - 1e-9) };
  return { kind: 'hand', building: 'Storage Container', count: 1, note: it?.raw ? 'fill by hand' : 'bring in' };
}

const emptyParts = () => ({
  splitters: 0, mergers: 0, junctions: 0, containers: 0, sinks: 0,
  miners: 0, waterExtractors: 0, oilExtractors: 0, belt: {}, pipe: {},
});

/**
 * res: a solve() result. power (optional): a powerPlan() result, drawn as a generator row
 * fed by the fuel the production rows make (or by miners if the fuel is raw).
 */
export function layoutPlan(data, res, power = null) {
  const { nodes: gnodes, edges } = graphOf(res);
  const parts = emptyParts();
  const isFluid = (id) => !!data.items[id]?.f;
  const addLength = (item, rate, metres) => {
    const fluid = isFluid(item);
    const { mk, lines } = beltFor(rate, fluid);
    const bag = fluid ? parts.pipe : parts.belt;
    bag[mk] = (bag[mk] || 0) + metres * lines;
  };
  const addConnectors = (item, n, kind) => {
    if (n <= 0) return;
    if (isFluid(item)) parts.junctions += n;
    else parts[kind] += n;
  };
  const sources = [];
  const addSource = (item, rate) => {
    const s = { item, rate, ...sourceFor(data, item, rate) };
    if (s.kind === 'miner') { parts.miners += s.count; addConnectors(item, s.count - 1, 'mergers'); }
    if (s.kind === 'extractor') {
      if (item === 'Desc_Water_C') parts.waterExtractors += s.count; else parts.oilExtractors += s.count;
      parts.junctions += s.count - 1;
    }
    if (s.kind === 'hand') parts.containers += 1;
    addLength(item, rate, LANE_LINK);
    sources.push(s);
    return s;
  };

  const keyOf = (n) => n.key ?? n.item;
  // Split items (one item, several recipes) are labelled by recipe so their rows can be told apart.
  const label = (key) => {
    const g = gnodes.get(key);
    return g.kind === 'step' && keyOf(g.node) !== g.node.item ? g.node.recipe.n : data.items[g.item]?.n ?? g.item;
  };
  const fuelRows = power ? res.nodes.filter((n) => n.item === power.fuelId) : [];
  // What leaves the factory from one row: what it makes minus what other rows and the generators take.
  const leaving = (n) => {
    const used = edges.filter((e) => e.from === keyOf(n)).reduce((t, e) => t + e.rate, 0);
    const burned = power && n.item === power.fuelId ? (power.fuelTotal * n.rate) / res.demand[n.item] : 0;
    return n.rate - used - burned;
  };
  const rows = [];

  const steps = res.nodes.map((n) => ({ n, level: gnodes.get(keyOf(n)).level })).sort((a, b) => a.level - b.level);
  for (const { n } of steps) {
    const key = keyOf(n);
    const total = Math.ceil(n.machines - 1e-9);
    const clock = (n.machines / total) * 100;
    const [w, d] = FOOTPRINT[n.recipe.m] || [10, 10];
    const chunks = Math.ceil(total / MAX_PER_ROW);
    for (let c = 0; c < chunks; c++) {
      const count = Math.min(MAX_PER_ROW, total - c * MAX_PER_ROW);
      const share = count / total;
      const width = count * (w + GAP) + GAP;
      const inputs = n.inputs.filter(([, r]) => r > 1e-9).map(([item, rate]) => {
        const es = edges.filter((x) => x.to === key && x.item === item);
        const fromNode = gnodes.get(es[0].from);
        let from;
        if (fromNode.kind === 'step') {
          from = { kind: 'row', keys: es.map((x) => x.from), label: es.map((x) => label(x.from)).join(' + '), merged: es.length > 1 };
          parts.mergers += es.length - 1; // belts from several rows join before this one
        } else if (fromNode.kind === 'loop') from = { kind: 'loop' };
        else from = { kind: 'source', source: addSource(item, rate * share) };
        addConnectors(item, count - 1, 'splitters');
        if (c === 0) addConnectors(item, chunks - 1, 'splitters'); // divide the feed between rows
        addLength(item, rate * share, width);
        return { item, rate: rate * share, fluid: isFluid(item), from };
      });
      const outputs = n.outputs.filter(([, r]) => r > 1e-9).map(([item, rate]) => {
        const lane = { item, rate: rate * share, fluid: isFluid(item), to: [] };
        if (item === n.item) {
          for (const e of edges.filter((x) => x.from === key)) lane.to.push({ kind: 'row', key: e.to, label: label(e.to), rate: e.rate * share });
          if (power && item === power.fuelId) lane.to.push({ kind: 'gen', rate: ((power.fuelTotal * n.rate) / res.demand[item]) * share });
          const left = leaving(n);
          if (left > 1e-6) { lane.to.push({ kind: 'storage', rate: left * share }); parts.containers += 1; }
        } else {
          lane.to.push({ kind: 'sink' });
          parts.sinks += 1;
        }
        addConnectors(item, count - 1, 'mergers');
        if (c === 0) addConnectors(item, chunks - 1, 'mergers'); // join the rows' outputs
        addConnectors(item, lane.to.length - 1, 'splitters');
        addLength(item, rate * share, width + LANE_LINK * lane.to.length);
        return lane;
      });
      rows.push({
        kind: 'step', key, item: n.item, title: label(key), recipe: n.recipe, machine: n.recipe.m, count, clock, w, d, width,
        part: c, parts: chunks, inputs, outputs,
        fx: Math.ceil(width / 8), fy: Math.ceil((d + 4 * (inputs.length + outputs.length)) / 8),
      });
    }
  }

  if (power) {
    const gen = power.gen;
    const [w, d] = FOOTPRINT[gen.id] || [12, 12];
    const chunks = Math.ceil(power.count / MAX_GENERATORS_PER_ROW);
    for (let c = 0; c < chunks; c++) {
      const count = Math.min(MAX_GENERATORS_PER_ROW, power.count - c * MAX_GENERATORS_PER_ROW);
      const share = count / power.count;
      const width = count * (w + GAP) + GAP;
      const inputs = [];
      const fuelRate = power.fuelTotal * share;
      inputs.push({
        item: power.fuelId, rate: fuelRate, fluid: isFluid(power.fuelId),
        from: fuelRows.length
          ? { kind: 'row', keys: fuelRows.map(keyOf), label: fuelRows.map((f) => label(keyOf(f))).join(' + '), merged: fuelRows.length > 1 }
          : { kind: 'source', source: addSource(power.fuelId, fuelRate) },
      });
      addConnectors(power.fuelId, count - 1, 'splitters');
      if (c === 0) addConnectors(power.fuelId, chunks - 1, 'splitters');
      if (c === 0 && fuelRows.length > 1) addConnectors(power.fuelId, fuelRows.length - 1, 'mergers');
      addLength(power.fuelId, fuelRate, width);
      if (power.waterTotal) {
        const water = power.waterTotal * share;
        inputs.push({ item: 'Desc_Water_C', rate: water, fluid: true, from: { kind: 'source', source: addSource('Desc_Water_C', water) } });
        parts.junctions += count - 1 + (c === 0 ? chunks - 1 : 0);
        addLength('Desc_Water_C', water, width);
      }
      rows.push({
        kind: 'gen', key: `gen:${gen.id}`, item: power.fuelId, machine: gen.id, name: gen.n, count, clock: 100, w, d, width,
        part: c, parts: chunks, inputs, outputs: [], mw: gen.mw * count,
        fx: Math.ceil(width / 8), fy: Math.ceil((d + 4 * inputs.length) / 8),
      });
    }
  }

  const foundations = rows.reduce((s, r) => s + r.fx * r.fy, 0);
  return { rows, sources, parts, foundations };
}


export function partsList(plan) {
  const p = plan.parts;
  const out = [];
  if (p.miners) out.push(`${p.miners}× Miner Mk.1`);
  if (p.waterExtractors) out.push(`${p.waterExtractors}× Water Extractor`);
  if (p.oilExtractors) out.push(`${p.oilExtractors}× Oil Extractor`);
  if (p.splitters) out.push(`${p.splitters}× Conveyor Splitter`);
  if (p.mergers) out.push(`${p.mergers}× Conveyor Merger`);
  if (p.junctions) out.push(`${p.junctions}× Pipeline Junction`);
  if (p.containers) out.push(`${p.containers}× Storage Container`);
  if (p.sinks) out.push(`${p.sinks}× AWESOME Sink (or storage) for byproducts`);
  for (const [mk, m] of Object.entries(p.belt)) out.push(`~${Math.ceil(m / 10) * 10} m Conveyor Belt Mk.${mk}`);
  for (const [mk, m] of Object.entries(p.pipe)) out.push(`~${Math.ceil(m / 10) * 10} m Pipeline Mk.${mk}`);
  return out;
}
