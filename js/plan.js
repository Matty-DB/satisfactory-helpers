// Build plans: rows of machines on manifolds with splitters, mergers, pipe junctions,
// sources (miners, extractors) and sinks (storage, AWESOME Sink), plus a parts list.
// layoutPlan is pure (tested in Node); renderPlan returns an SVG string.
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
          from = { kind: 'row', label: es.map((x) => label(x.from)).join(' + '), merged: es.length > 1 };
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
          for (const e of edges.filter((x) => x.from === key)) lane.to.push({ kind: 'row', label: label(e.to), rate: e.rate * share });
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
        kind: 'step', item: n.item, title: label(key), recipe: n.recipe, machine: n.recipe.m, count, clock, w, d, width,
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
          ? { kind: 'row', label: fuelRows.map((f) => label(keyOf(f))).join(' + '), merged: fuelRows.length > 1 }
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
        kind: 'gen', item: power.fuelId, machine: gen.id, name: gen.n, count, clock: 100, w, d, width,
        part: c, parts: chunks, inputs, outputs: [], mw: gen.mw * count,
        fx: Math.ceil(width / 8), fy: Math.ceil((d + 4 * inputs.length) / 8),
      });
    }
  }

  const foundations = rows.reduce((s, r) => s + r.fx * r.fy, 0);
  return { rows, sources, parts, foundations };
}

// ---------- rendering ----------
const fmt = (n) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '') || '0';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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

export function renderPlan(data, res, power, ctx) {
  const plan = layoutPlan(data, res, power);
  const { itemName, machineName } = ctx;
  const S = 6; // px per metre
  const LEFT = 170, RIGHT = 190, PAD = 14, LANE = 20, HEAD = 70;
  const lane = (fluid) => (fluid ? 'pipe' : 'belt');
  const tag = (item, rate) => {
    const fluid = !!data.items[item]?.f;
    const b = beltFor(rate, fluid);
    return `${fluid ? 'Pipe' : 'Belt'} Mk.${b.mk}${b.lines > 1 ? `×${b.lines}` : ''}`;
  };
  let y = PAD;
  let maxW = 360;
  const svgRows = plan.rows.map((r) => {
    const mw = r.w * S, md = r.d * S, gap = GAP * S;
    const x0 = PAD + LEFT;
    const rowTop = y;
    const rowW = r.count * (mw + gap) + gap;
    maxW = Math.max(maxW, x0 + rowW + RIGHT + PAD);
    const top = y + HEAD;
    const inY = r.inputs.map((_, j) => top + j * LANE + 8);
    const machY = top + r.inputs.length * LANE + 14;
    const outY = r.outputs.map((_, j) => machY + md + 16 + j * LANE);
    const bottom = (outY.at(-1) ?? machY + md) + 18;
    y = bottom + 22;
    const portX = (i, j, k) => x0 + gap + i * (mw + gap) + (mw * (j + 1)) / (k + 1);
    const g = [];
    // header
    const title = r.kind === 'gen'
      ? `${r.count}× ${r.name} — ${fmt(r.mw)} MW${r.parts > 1 ? ` (row ${r.part + 1}/${r.parts})` : ''}`
      : `${r.title} — ${r.count}× ${machineName(r.machine)} at ${r.clock.toFixed(r.clock < 99.95 ? 1 : 0)}%${r.parts > 1 ? ` (row ${r.part + 1}/${r.parts})` : ''}`;
    const conn = (l, kind) => {
      const word = l.fluid ? 'junction' : kind;
      const n = r.count - 1;
      return n ? `${n} ${word}${n > 1 ? 's' : ''}` : `no ${word}s`;
    };
    const sub = [
      ...r.inputs.map((l) => `in ${itemName(l.item)} ${fmt(l.rate)}/min · ${tag(l.item, l.rate)} · ${conn(l, 'splitter')}`),
      ...r.outputs.map((l) => `out ${itemName(l.item)} ${fmt(l.rate)}/min · ${tag(l.item, l.rate)} · ${conn(l, 'merger')}`),
    ];
    g.push(`<text class="row-title" x="${PAD}" y="${rowTop + 16}">${esc(title)}</text>`);
    // detail lines: up to 3, extra ones joined onto the last
    const subTop = rowTop + 32;
    const lines = sub.length > 3 ? [...sub.slice(0, 2), sub.slice(2).join(' · ')] : sub;
    lines.forEach((t, i) => g.push(`<text class="row-sub" x="${PAD}" y="${subTop + i * 14}">${esc(t)}</text>`));
    maxW = Math.max(maxW, PAD * 2 + Math.max(...lines.map((t) => t.length)) * 6.3);

    // input lanes with splitters / junctions
    r.inputs.forEach((l, j) => {
      const yy = inY[j];
      const cls = lane(l.fluid);
      const lastX = portX(r.count - 1, j, r.inputs.length);
      g.push(`<line class="${cls}" x1="${x0 - 30}" y1="${yy}" x2="${lastX}" y2="${yy}"/>`);
      for (let i = 0; i < r.count; i++) {
        const px = portX(i, j, r.inputs.length);
        const crossing = j < r.inputs.length - 1;
        g.push(`<line class="${cls} drop${crossing ? ' lift' : ''}" x1="${px}" y1="${yy}" x2="${px}" y2="${machY}" marker-end="url(#plan-arrow)"/>`);
        if (i < r.count - 1) g.push(l.fluid ? `<circle class="junction" cx="${px}" cy="${yy}" r="5"/>` : `<rect class="splitter" x="${px - 6}" y="${yy - 6}" width="12" height="12" rx="2"/>`);
      }
      // where the lane comes from
      const f = l.from;
      let label = '';
      if (f.kind === 'row') label = `from ${f.label} row${f.merged ? 's, merged' : ''}`;
      else if (f.kind === 'loop') label = 'loop input';
      else if (f.kind === 'source') {
        const s = f.source;
        label = s.kind === 'hand' ? `Storage (${s.note})`
          : `${s.count}× ${s.building}${s.count > 1 ? (l.fluid ? ', joined' : ', merged') : ''}`;
        const bx = PAD, bw = LEFT - 26;
        g.push(`<rect class="source" x="${bx}" y="${yy - 10}" width="${bw}" height="20" rx="4"/>`);
      }
      // Source names sit in their box; "from …" labels sit just above the belt so long ones never cover it.
      g.push(f.kind === 'source'
        ? `<text class="lane-label on-source" x="${PAD + 6}" y="${yy + 4}">${esc(label)}</text>`
        : `<text class="lane-label" x="${PAD}" y="${yy - 6}">${esc(label)}</text>`);
      maxW = Math.max(maxW, PAD * 2 + label.length * 6.3);
    });

    // machines
    for (let i = 0; i < r.count; i++) {
      const mx = x0 + gap + i * (mw + gap);
      g.push(`<g class="machine ${r.kind}"><rect x="${mx}" y="${machY}" width="${mw}" height="${md}" rx="3"/>
        <text x="${mx + mw / 2}" y="${machY + md / 2 + 4}">${r.kind === 'gen' ? '⚡' : `${r.clock.toFixed(0)}%`}</text></g>`);
    }

    // output lanes with mergers, then where they go
    r.outputs.forEach((l, j) => {
      const yy = outY[j];
      const cls = lane(l.fluid);
      const firstX = portX(0, j, r.outputs.length);
      const endX = x0 + rowW + 30;
      for (let i = 0; i < r.count; i++) {
        const px = portX(i, j, r.outputs.length);
        g.push(`<line class="${cls} drop${j > 0 ? ' lift' : ''}" x1="${px}" y1="${machY + md}" x2="${px}" y2="${yy}"/>`);
        if (i > 0) g.push(l.fluid ? `<circle class="junction" cx="${px}" cy="${yy}" r="5"/>` : `<rect class="merger" x="${px - 6}" y="${yy - 6}" width="12" height="12" rx="2"/>`);
      }
      g.push(`<line class="${cls}" x1="${firstX}" y1="${yy}" x2="${endX}" y2="${yy}" marker-end="url(#plan-arrow)"/>`);
      const dests = l.to.map((t) => (t.kind === 'row' ? `${t.label} row ${fmt(t.rate)}`
        : t.kind === 'gen' ? `generators ${fmt(t.rate)}`
        : t.kind === 'storage' ? `Storage ${fmt(t.rate)}` : 'Sink / storage'));
      if (dests.length > 1) {
        g.push(l.fluid ? `<circle class="junction" cx="${endX - 14}" cy="${yy}" r="5"/>` : `<rect class="splitter" x="${endX - 20}" y="${yy - 6}" width="12" height="12" rx="2"/>`);
      }
      g.push(`<text class="lane-label" x="${endX + 8}" y="${yy + 4}">→ ${esc(dests.join(' + '))}</text>`);
      maxW = Math.max(maxW, endX + 16 + dests.join(' + ').length * 6.3 + PAD);
    });
    if (r.kind === 'gen') g.push(`<text class="lane-label" x="${x0 + rowW + 8}" y="${machY + md / 2 + 4}">→ power grid</text>`);
    return `<g class="plan-row">${g.join('')}</g>`;
  }).join('');

  const height = y + PAD;
  const legend = `<div class="plan-legend">
    <span><i class="lg belt"></i>belt</span><span><i class="lg pipe"></i>pipe</span>
    <span><i class="lg splitter"></i>splitter</span><span><i class="lg merger"></i>merger</span>
    <span><i class="lg junction"></i>pipe junction</span><span><i class="lg lift"></i>lift / stacked belt</span></div>`;
  const shopping = partsList(plan);
  return `<div class="plan-summary">
      <p class="hint" style="margin-top:0">Rows run from raw resources down to the finished product. Each input belt passes every machine with a splitter in front of each one; the last machine takes the end of the belt. Outputs join with mergers. About <strong>${plan.foundations} foundations</strong> in total. Sizes are approximate and port positions vary, so leave some room.</p>
      <details class="shopping"><summary><strong>Shopping list</strong>&nbsp;(logistics only)</summary><ul>${shopping.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>
      ${legend}
    </div>
    <div class="diagram-wrap"><svg class="plan" viewBox="0 0 ${Math.ceil(maxW)} ${height}" width="${Math.ceil(maxW)}" height="${height}" role="img" aria-label="Build plan">
      <defs><marker id="plan-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
      ${svgRows}</svg></div>`;
}
