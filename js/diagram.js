// Flow diagram and floor plan for a solve() result.
// Layout functions are pure (tested in Node); render functions return SVG strings.

// Approximate machine footprints in metres: [width along the manifold, depth].
// Taken from the in-game build sizes; port positions are not modelled.
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
};
const FOUNDATION = 8;
const LANE = 2; // belt lane depth on each side of a row
const GAP = 1; // walkway / pole gap between machines
const MAX_PER_ROW = 8;

// ---------- shared graph ----------
export function graphOf(res) {
  const cut = new Set(res.cycles.map((c) => `${c.item}>${c.ingredient}`));
  const nodes = new Map();
  const edges = [];
  for (const n of res.nodes) nodes.set(n.item, { id: n.item, kind: 'step', node: n });
  for (const [id, rate] of Object.entries(res.raw)) nodes.set(id, { id, kind: 'raw', rate });
  for (const [id, rate] of Object.entries(res.unavailable)) nodes.set(id, { id, kind: 'missing', rate });
  for (const [id, rate] of Object.entries(res.loopInputs)) {
    if (!nodes.has(id)) nodes.set(id, { id, kind: 'loop', rate });
  }
  for (const n of res.nodes) {
    for (const [ing, rate] of n.inputs) {
      if (rate <= 1e-9) continue;
      const from = cut.has(`${n.item}>${ing}`) ? `loop:${ing}` : ing;
      if (from.startsWith('loop:') && !nodes.has(from)) nodes.set(from, { id: from, item: ing, kind: 'loop', rate: 0 });
      if (from.startsWith('loop:')) nodes.get(from).rate += rate;
      edges.push({ from, to: n.item, item: ing, rate, loop: from.startsWith('loop:') });
    }
  }
  // Level = longest path from a source, so every edge points to a higher level.
  const incoming = new Map();
  for (const e of edges) (incoming.get(e.to) || incoming.set(e.to, []).get(e.to)).push(e);
  const level = new Map();
  const lv = (id, seen = new Set()) => {
    if (level.has(id)) return level.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const ins = incoming.get(id) || [];
    const l = ins.length ? 1 + Math.max(...ins.map((e) => lv(e.from, seen))) : 0;
    level.set(id, l);
    return l;
  };
  for (const id of nodes.keys()) lv(id);
  for (const [id, n] of nodes) n.level = level.get(id);
  return { nodes, edges };
}

// ---------- flow diagram layout ----------
export const BOX = { w: 200, h: 66, gx: 36, gy: 90, pad: 24, dummy: 28 };

export function layoutFlow(res) {
  const { nodes, edges } = graphOf(res);
  // Long edges get a spacer node on every level they cross, so they never run under a box.
  const levels = [];
  for (const n of nodes.values()) (levels[n.level] ||= []).push(n);
  const segs = [];
  edges.forEach((e, ei) => {
    const a = nodes.get(e.from).level, b = nodes.get(e.to).level;
    let prev = e.from;
    for (let l = a + 1; l < b; l++) {
      const id = `dummy:${ei}:${l}`;
      const d = { id, kind: 'dummy', level: l };
      nodes.set(id, d);
      (levels[l] ||= []).push(d);
      segs.push({ from: prev, to: id, edge: e });
      prev = id;
    }
    segs.push({ from: prev, to: e.to, edge: e });
  });
  const pos = new Map();
  levels.forEach((row) => row.forEach((n, i) => pos.set(n.id, i)));
  const bary = (n, dir) => {
    const ns = segs.filter((g) => (dir === 'down' ? g.to === n.id : g.from === n.id)).map((g) => pos.get(dir === 'down' ? g.from : g.to));
    return ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : pos.get(n.id);
  };
  // Barycentre sweeps to reduce edge crossings.
  for (let pass = 0; pass < 6; pass++) {
    const dir = pass % 2 ? 'up' : 'down';
    const order = dir === 'down' ? [...levels.keys()] : [...levels.keys()].reverse();
    for (const l of order) {
      const row = levels[l];
      if (!row) continue;
      const score = new Map(row.map((n) => [n.id, bary(n, dir)]));
      row.sort((x, y) => score.get(x.id) - score.get(y.id));
      row.forEach((n, i) => pos.set(n.id, i));
    }
  }
  const wOf = (n) => (n.kind === 'dummy' ? BOX.dummy : BOX.w);
  const rowW = (row) => row.reduce((t, n) => t + wOf(n), 0) + (row.length - 1) * BOX.gx;
  const width = BOX.pad * 2 + Math.max(...levels.map((r) => (r ? rowW(r) : 0)));
  const height = BOX.pad * 2 + levels.length * BOX.h + (levels.length - 1) * BOX.gy;
  const place = new Map();
  levels.forEach((row, l) => {
    let x = (width - rowW(row)) / 2;
    for (const n of row) {
      place.set(n.id, { ...n, x, y: BOX.pad + l * (BOX.h + BOX.gy) });
      x += wOf(n) + BOX.gx;
    }
  });
  // Spread ports along each real box, ordered by where the neighbouring segment goes.
  const portX = new Map();
  for (const [id, b] of place) {
    if (b.kind === 'dummy') continue;
    for (const side of ['out', 'in']) {
      const list = segs.filter((g) => (side === 'out' ? g.from : g.to) === id);
      list.sort((g1, g2) => place.get(side === 'out' ? g1.to : g1.from).x - place.get(side === 'out' ? g2.to : g2.from).x);
      list.forEach((g, i) => portX.set(`${side}:${g.edge === undefined ? '' : edges.indexOf(g.edge)}:${id}`, b.x + (BOX.w * (i + 1)) / (list.length + 1)));
    }
  }
  const pt = (id, side, ei) => {
    const b = place.get(id);
    if (b.kind === 'dummy') return [b.x + BOX.dummy / 2, side === 'out' ? b.y + BOX.h : b.y, b.y];
    return [portX.get(`${side}:${ei}:${id}`), side === 'out' ? b.y + BOX.h : b.y];
  };
  for (const [ei, e] of edges.entries()) {
    const chain = segs.filter((g) => g.edge === e);
    // Points: source bottom, then each spacer's top and bottom, then target top.
    const points = [pt(chain[0].from, 'out', ei)];
    for (const g of chain.slice(0, -1)) {
      const d = place.get(g.to);
      points.push([d.x + BOX.dummy / 2, d.y], [d.x + BOX.dummy / 2, d.y + BOX.h]);
    }
    points.push(pt(e.to, 'in', ei));
    e.points = points.map(([x, y]) => [x, y]);
    [e.sx, e.sy] = e.points[0];
    [e.tx, e.ty] = e.points.at(-1);
  }
  return { width, height, boxes: [...place.values()].filter((b) => b.kind !== 'dummy'), edges };
}

// ---------- floor plan layout ----------
export function layoutFloor(res) {
  const { nodes, edges } = graphOf(res);
  const steps = res.nodes
    .map((n) => ({ n, level: nodes.get(n.item).level }))
    .sort((a, b) => a.level - b.level);
  const rows = [];
  for (const { n } of steps) {
    const count = Math.ceil(n.machines - 1e-9);
    const clock = (n.machines / count) * 100;
    const [w, d] = FOOTPRINT[n.recipe.m] || [10, 10];
    const feeds = [...new Set(edges.filter((e) => e.from === n.item).map((e) => e.to))];
    for (let start = 0, part = 0; start < count; start += MAX_PER_ROW, part++) {
      const k = Math.min(MAX_PER_ROW, count - start);
      const width = k * (w + GAP) + GAP;
      const depth = LANE + d + LANE;
      rows.push({
        step: n, part, parts: Math.ceil(count / MAX_PER_ROW), machines: k, clock, w, d, feeds,
        width, depth,
        fx: Math.ceil(width / FOUNDATION), fy: Math.ceil(depth / FOUNDATION),
        share: k / count, // fraction of the step's flow on this row
      });
    }
  }
  const foundations = rows.reduce((s, r) => s + r.fx * r.fy, 0);
  return { rows, foundations };
}

// ---------- rendering ----------
const fmt = (n) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '') || '0';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function renderFlow(res, ctx) {
  const L = layoutFlow(res);
  const { itemName, machineName, isFluid } = ctx;
  const curve = (pts) => {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (x0 === x1) { d += ` L${x1},${y1}`; continue; }
      const my = (y0 + y1) / 2;
      d += ` C${x0},${my} ${x1},${my} ${x1},${y1}`;
    }
    return d;
  };
  const edgeSvg = L.edges.map((e) => {
    // Label sits in the gap just above the target, where incoming edges are already spread out.
    const [px, py] = e.points.at(-2), [tx, ty] = e.points.at(-1);
    const mx = (px + tx) / 2, my = (py + ty) / 2;
    const label = `${short(itemName(e.item), 14)} ${fmt(e.rate)}`;
    const lw = label.length * 6.4 + 10;
    return `<g class="edge${isFluid(e.item) ? ' fluid' : ''}${e.loop ? ' loop' : ''}">
      <path d="${curve(e.points)}" marker-end="url(#arrow)"/>
      <rect x="${mx - lw / 2}" y="${my - 9}" width="${lw}" height="18" rx="4"/>
      <text x="${mx}" y="${my + 4}">${esc(label)}</text></g>`;
  }).join('');
  const boxSvg = L.boxes.map((b) => {
    const name = b.kind === 'loop' ? itemName(b.item || b.id) : itemName(b.id);
    const sub = b.kind === 'step'
      ? `${fmt(b.node.machines)}× ${machineName(b.node.recipe.m)}`
      : b.kind === 'raw' ? 'raw resource' : b.kind === 'loop' ? 'loop input' : 'not craftable yet';
    const rate = b.kind === 'step' ? b.node.rate : b.rate;
    const unitTxt = isFluid(b.item || b.id) ? 'm³/min' : '/min';
    return `<g class="box ${b.kind}" transform="translate(${b.x},${b.y})">
      <rect width="${BOX.w}" height="${BOX.h}" rx="8"/>
      <text class="t1" x="10" y="20">${esc(short(name, 25))}</text>
      <text class="t2" x="10" y="39">${esc(short(sub, 25))}</text>
      <text class="t3" x="10" y="57">${b.kind === 'step' ? 'makes ' : ''}${fmt(rate)} ${unitTxt}</text>
    </g>`;
  }).join('');
  return `<div class="diagram-wrap"><svg class="flow" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" role="img" aria-label="Production flow diagram">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
    ${edgeSvg}${boxSvg}</svg></div>
    <p class="hint">Raw resources at the top flow down to your targets. Arrow labels are items per minute (fluids in m³/min). Swipe or scroll inside the chart to see all of it.</p>`;
}

export function renderFloor(res, ctx) {
  const { rows, foundations } = layoutFloor(res);
  const { itemName, machineName, isFluid, beltFor } = ctx;
  const S = 7; // px per metre
  const labelH = 74;
  const pad = 16;
  let width = Math.max(360, ...rows.map((r) => r.fx * FOUNDATION * S)) + pad * 2;
  let y = pad;
  let maxText = 0;
  const parts = rows.map((r) => {
    const n = r.step;
    const gw = r.fx * FOUNDATION * S, gh = r.fy * FOUNDATION * S;
    const top = y + labelH;
    y = top + gh + 26;
    const grid = [];
    for (let i = 0; i <= r.fx; i++) grid.push(`<line x1="${pad + i * FOUNDATION * S}" y1="${top}" x2="${pad + i * FOUNDATION * S}" y2="${top + gh}"/>`);
    for (let j = 0; j <= r.fy; j++) grid.push(`<line x1="${pad}" y1="${top + j * FOUNDATION * S}" x2="${pad + gw}" y2="${top + j * FOUNDATION * S}"/>`);
    const ox = pad + ((r.fx * FOUNDATION - r.width) / 2) * S;
    const oy = top + ((r.fy * FOUNDATION - r.depth) / 2) * S;
    const machines = Array.from({ length: r.machines }, (_, i) => {
      const mx = ox + (GAP + i * (r.w + GAP)) * S, my = oy + LANE * S;
      return `<g class="machine"><rect x="${mx}" y="${my}" width="${r.w * S}" height="${r.d * S}" rx="3"/>
        <text x="${mx + (r.w * S) / 2}" y="${my + (r.d * S) / 2 + 4}">${r.clock.toFixed(0)}%</text></g>`;
    }).join('');
    const beltTag = (item, rate) => {
      const fluid = isFluid(item);
      const b = beltFor(rate, fluid);
      return `${fluid ? 'pipe' : 'belt'} Mk.${b.mk}${b.lines > 1 ? `×${b.lines}` : ''}`;
    };
    const lane = (yy, item, out) => `<g class="lane${isFluid(item) ? ' fluid' : ''}">
      <line x1="${ox}" y1="${yy}" x2="${ox + r.width * S}" y2="${yy}"${out ? ' marker-end="url(#lane-arrow)"' : ''}/></g>`;
    // Inputs share the top lane, the output runs along the bottom one.
    const ins = n.inputs.filter(([, rt]) => rt > 1e-9);
    const inLane = ins.length ? lane(oy + LANE * S * 0.5, ins[0][0], false) : '';
    const outLane = lane(oy + (LANE + r.d + LANE * 0.5) * S, n.item, true);
    const inTxt = ins.map(([id, rt]) => `${itemName(id)} ${fmt(rt * r.share)} (${beltTag(id, rt * r.share)})`).join(' + ');
    const outTxt = `${itemName(n.item)} ${fmt(n.rate * r.share)} (${beltTag(n.item, n.rate * r.share)})`;
    const title = `${itemName(n.item)} — ${r.machines}× ${machineName(n.recipe.m)}${r.parts > 1 ? ` (row ${r.part + 1}/${r.parts})` : ''}`;
    const inLine = `in:  ${inTxt || 'nothing'}`;
    const outLine = `out: ${outTxt}`;
    const sub = [
      r.feeds.length ? `feeds: ${r.feeds.map(itemName).join(', ')}` : 'final output',
      `${r.fx}×${r.fy} foundations`,
      `all at ${r.clock.toFixed(r.clock < 99.9 ? 1 : 0)}%`,
    ].join(' · ');
    maxText = Math.max(maxText, inLine.length, outLine.length, sub.length);
    return `<g class="row">
      <text class="row-title" x="${pad}" y="${top - 56}">${esc(title)}</text>
      <text class="row-flow" x="${pad}" y="${top - 40}">${esc(inLine)}</text>
      <text class="row-flow" x="${pad}" y="${top - 25}">${esc(outLine)}</text>
      <text class="row-sub" x="${pad}" y="${top - 9}">${esc(sub)}</text>
      <g class="grid">${grid.join('')}</g>${inLane}${machines}${outLane}</g>`;
  }).join('');
  const height = y + pad;
  width = Math.max(width, maxText * 7 + pad * 2);
  return `<p class="hint">Each step is one row of machines on 8 m foundations: input belt along the top, output along the bottom. Rows are in build order from raw resources down to your targets. <strong>About ${foundations} foundations</strong> if you build every row separately. Footprints are approximate and port positions vary, so leave some room.</p>
    <div class="diagram-wrap"><svg class="floor" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Floor plan"><defs><marker id="lane-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${parts}</svg></div>`;
}
