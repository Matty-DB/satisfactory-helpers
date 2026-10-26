// Connected factory floor plan in a "main bus" layout.
//   • Rows of machines stacked in build order (raw resources first).
//   • Raw inputs come in from source buildings on the left.
//   • Every made item gets one vertical bus line on the right. A row's output joins its line,
//     and every row that uses the item branches off it into the end of its input belt.
//   • Where a branch crosses another bus line it hops over it (a stacked belt in game).
// layoutFactory is pure geometry (tested in Node); renderFactory turns it into SVG.
import { beltFor } from './calc.js';

export const S = 6; // px per metre
const GAP_M = 2; // metres between machines
const PAD = 24;
const SRC_W = 150; // source column
const SRC_GAP = 56; // belt run from sources to the machines
const TITLE = 54; // title + summary line, clear of the first belt label
const LANE = 20;
const ROW_GAP = 44;
const BUS_GAP = 56; // from the row ends to the first bus line
const CHANNEL = 18; // between bus lines
const STORE = 36; // room under a row for storage / sinks
const STORE_W = 118;

export function layoutFactory(data, plan) {
  const isFluid = (id) => !!data.items[id]?.f;
  const x0 = PAD + SRC_W + SRC_GAP;
  const rowW = (r) => r.count * (r.w + GAP_M) * S + GAP_M * S;
  const maxRowW = Math.max(200, ...plan.rows.map(rowW));
  const rowEnd = x0 + maxRowW + 24; // every belt starts or ends on this line

  const rows = [];
  const machines = [];
  const lanes = [];
  const connectors = [];
  const sources = [];
  const stores = [];
  let y = PAD;
  plan.rows.forEach((r, ri) => {
    const mw = r.w * S, md = r.d * S, gap = GAP_M * S;
    const top = y;
    const laneTop = top + TITLE;
    const inY = r.inputs.map((_, j) => laneTop + j * LANE);
    const machY = laneTop + r.inputs.length * LANE + 10;
    const outY = r.outputs.map((_, j) => machY + md + 16 + j * LANE);
    const hasStore = r.outputs.some((l) => l.to.some((t) => t.kind === 'storage' || t.kind === 'sink'));
    const bottom = (outY.at(-1) ?? machY + md) + (hasStore ? STORE : 10);
    const portX = (i, j, k) => x0 + gap + i * (mw + gap) + (mw * (j + 1)) / (k + 1);
    rows.push({ index: ri, row: r, top, bottom, inY, outY, machY });

    for (let i = 0; i < r.count; i++) {
      machines.push({ row: ri, x: x0 + gap + i * (mw + gap), y: machY, w: mw, h: md, kind: r.kind, clock: r.clock });
    }

    // Input belts. Raw ones are fed from the left, so the far-right machine takes the belt end;
    // bus-fed ones come in from the right, so the far-left machine takes the end.
    r.inputs.forEach((l, j) => {
      const yy = inY[j];
      const fluid = l.fluid;
      const fromLeft = l.from.kind !== 'row';
      const ports = Array.from({ length: r.count }, (_, i) => portX(i, j, r.inputs.length));
      const end = fromLeft ? ports.at(-1) : ports[0];
      const start = fromLeft ? x0 - SRC_GAP + 6 : rowEnd;
      lanes.push({ row: ri, dir: 'in', item: l.item, fluid, rate: l.rate, x1: start, x2: end, y: yy, ports, stacked: j < r.inputs.length - 1, dropTo: machY });
      ports.forEach((px, i) => {
        const isEnd = fromLeft ? i === r.count - 1 : i === 0;
        if (!isEnd) connectors.push({ kind: fluid ? 'junction' : 'splitter', x: px, y: yy, item: l.item });
      });
      if (fromLeft) {
        if (l.from.kind === 'source') sources.push({ row: ri, x: PAD, y: yy - 11, w: SRC_W, h: 22, item: l.item, rate: l.rate, source: l.from.source, fluid });
        else sources.push({ row: ri, x: PAD, y: yy - 11, w: SRC_W, h: 22, item: l.item, rate: l.rate, source: { kind: 'loop', building: 'Loop input', count: 1 }, fluid });
      }
    });

    // Output belts run left to right and meet the row end.
    r.outputs.forEach((l, j) => {
      const yy = outY[j];
      const ports = Array.from({ length: r.count }, (_, i) => portX(i, j, r.outputs.length));
      lanes.push({ row: ri, dir: 'out', item: l.item, fluid: l.fluid, rate: l.rate, x1: ports[0], x2: rowEnd, y: yy, ports, stacked: j > 0, dropFrom: machY + md });
      ports.forEach((px, i) => { if (i > 0) connectors.push({ kind: l.fluid ? 'junction' : 'merger', x: px, y: yy, item: l.item }); });
      const toBus = l.to.some((t) => t.kind === 'row' || t.kind === 'gen');
      for (const t of l.to) {
        if (t.kind !== 'storage' && t.kind !== 'sink') continue;
        // Storage sits under the belt just inside the row end, so it never covers the bus.
        // If the belt also goes on to the bus, a splitter sends part of it down.
        const sx = rowEnd - 10;
        if (toBus) connectors.push({ kind: l.fluid ? 'junction' : 'splitter', x: sx, y: yy, item: l.item });
        stores.push({ row: ri, kind: t.kind, x: sx - STORE_W + 14, y: yy + 12, item: l.item, rate: t.rate ?? null, link: { x: sx, y1: yy, y2: yy + 12 } });
      }
    });
    y = bottom + ROW_GAP;
  });

  // ---- bus lines: one per producing row key ----
  const byKey = new Map();
  const channelFor = (key, item, fluid) => {
    if (!byKey.has(key)) byKey.set(key, { key, item, fluid, joins: [], branches: [] });
    return byKey.get(key);
  };
  rows.forEach(({ row: r, outY, index }) => {
    r.outputs.forEach((l, j) => {
      if (l.item !== r.item || !l.to.some((t) => t.kind === 'row' || t.kind === 'gen')) return;
      channelFor(r.key, l.item, l.fluid).joins.push({ row: index, y: outY[j] });
    });
  });
  rows.forEach(({ row: r, inY, index }) => {
    r.inputs.forEach((l, j) => {
      if (l.from.kind !== 'row') return;
      for (const k of l.from.keys) channelFor(k, l.item, l.fluid).branches.push({ row: index, y: inY[j], merged: l.from.keys.length > 1 });
    });
  });
  const channels = [...byKey.values()]
    .filter((c) => c.joins.length && c.branches.length)
    .sort((a, b) => Math.min(...a.joins.map((p) => p.y)) - Math.min(...b.joins.map((p) => p.y)));
  const busX = rowEnd + BUS_GAP;
  channels.forEach((c, i) => {
    c.x = busX + i * CHANNEL;
    const ys = [...c.joins, ...c.branches].map((p) => p.y);
    c.y1 = Math.min(...ys);
    c.y2 = Math.max(...ys);
    // Mergers where a later row output joins; splitters where a branch leaves and the line goes on.
    const joins = [...c.joins].sort((a, b) => a.y - b.y);
    const branches = [...c.branches].sort((a, b) => a.y - b.y);
    joins.slice(1).forEach((p) => connectors.push({ kind: c.fluid ? 'junction' : 'merger', x: c.x, y: p.y, item: c.item }));
    branches.slice(0, -1).forEach((p) => connectors.push({ kind: c.fluid ? 'junction' : 'splitter', x: c.x, y: p.y, item: c.item }));
  });

  // Horizontal links between the row ends and the bus, with hops over bus lines they cross.
  const links = [];
  for (const c of channels) {
    for (const p of c.joins) links.push({ kind: 'join', item: c.item, fluid: c.fluid, x1: rowEnd, x2: c.x, y: p.y });
    for (const p of c.branches) links.push({ kind: 'branch', item: c.item, fluid: c.fluid, x1: c.x, x2: rowEnd, y: p.y, merged: p.merged });
  }
  for (const l of links) {
    const lo = Math.min(l.x1, l.x2), hi = Math.max(l.x1, l.x2);
    l.hops = channels.filter((c) => c.x > lo + 1 && c.x < hi - 1 && c.y1 < l.y - 1 && c.y2 > l.y + 1).map((c) => c.x).sort((a, b) => a - b);
  }
  // Two bus lines feeding one belt meet at a merger just outside the row end.
  const mergedAt = new Set();
  for (const l of links) {
    if (l.kind === 'branch' && l.merged && !mergedAt.has(l.y)) {
      mergedAt.add(l.y);
      connectors.push({ kind: l.fluid ? 'junction' : 'merger', x: rowEnd + 10, y: l.y, item: l.item });
    }
  }

  const width = Math.max(busX + channels.length * CHANNEL + PAD, rowEnd + 140);
  const height = y - ROW_GAP + PAD;
  return { width, height, x0, rowEnd, busX, rows, machines, lanes, connectors, sources, stores, channels, links };
}

// ---------- rendering ----------
const fmt = (n) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '') || '0';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function hopPath(l) {
  // Left-to-right path with a small arc over each crossing.
  const dir = l.x2 >= l.x1 ? 1 : -1;
  const r = 5;
  const hops = dir > 0 ? l.hops : [...l.hops].reverse();
  let d = `M${l.x1},${l.y}`;
  for (const hx of hops) d += ` L${hx - dir * r},${l.y} A${r},${r} 0 0 ${dir > 0 ? 1 : 0} ${hx + dir * r},${l.y}`;
  return `${d} L${l.x2},${l.y}`;
}

export function renderFactory(data, plan, ctx, opts = {}) {
  const L = layoutFactory(data, plan);
  const { itemName, machineName } = ctx;
  const cls = (fluid) => (fluid ? 'pipe' : 'belt');
  const tag = (item, rate) => {
    const fluid = !!data.items[item]?.f;
    const b = beltFor(rate, fluid);
    return `${fluid ? 'Pipe' : 'Belt'} Mk.${b.mk}${b.lines > 1 ? `×${b.lines}` : ''}`;
  };
  const g = [];

  // Foundation grid behind everything (8 m squares).
  const F = 8 * S;
  const grid = [];
  for (let x = 0; x <= L.width; x += F) grid.push(`M${x},0V${L.height}`);
  for (let y = 0; y <= L.height; y += F) grid.push(`M0,${y}H${L.width}`);
  g.push(`<path class="fgrid" d="${grid.join('')}"/>`);

  // Row titles.
  for (const { row: r, top } of L.rows) {
    const title = r.kind === 'gen'
      ? `${r.count}× ${r.name} — ${fmt(r.mw)} MW`
      : `${r.title} — ${r.count}× ${machineName(r.machine)} at ${r.clock.toFixed(r.clock < 99.95 ? 1 : 0)}%`;
    const part = r.parts > 1 ? ` (row ${r.part + 1} of ${r.parts})` : '';
    const io = [...r.inputs.map((l) => `in ${itemName(l.item)} ${fmt(l.rate)}`), ...r.outputs.map((l) => `out ${itemName(l.item)} ${fmt(l.rate)}`)].join(' · ');
    g.push(`<text class="fp-title" x="${L.x0}" y="${top + 14}">${esc(title + part)}</text>`);
    g.push(`<text class="fp-sub" x="${L.x0}" y="${top + 29}">${esc(io)} /min</text>`);
  }

  // Bus lines and their labels.
  for (const c of L.channels) {
    g.push(`<line class="${cls(c.fluid)} bus" x1="${c.x}" y1="${c.y1}" x2="${c.x}" y2="${c.y2}"/>`);
  }
  // Links (drawn after bus lines so their hops sit on top).
  for (const l of L.links) {
    g.push(`<path class="${cls(l.fluid)} link" d="${hopPath(l)}"${l.kind === 'branch' ? ' marker-end="url(#fp-arrow)"' : ''}/>`);
  }

  // Belts along the rows, with drops into / out of every machine.
  for (const ln of L.lanes) {
    const c = cls(ln.fluid);
    g.push(`<line class="${c} lane" x1="${ln.x1}" y1="${ln.y}" x2="${ln.x2}" y2="${ln.y}"/>`);
    for (const px of ln.ports) {
      if (ln.dir === 'in') g.push(`<line class="${c} drop${ln.stacked ? ' lift' : ''}" x1="${px}" y1="${ln.y}" x2="${px}" y2="${ln.dropTo}" marker-end="url(#fp-arrow)"/>`);
      else g.push(`<line class="${c} drop${ln.stacked ? ' lift' : ''}" x1="${px}" y1="${ln.dropFrom}" x2="${px}" y2="${ln.y}"/>`);
    }
    const rate = `${itemName(ln.item)} ${fmt(ln.rate)} · ${tag(ln.item, ln.rate)}`;
    // Label near where the belt comes in: left end for source-fed belts, right end otherwise.
    const fromLeft = ln.dir === 'in' && ln.x1 < ln.x2;
    g.push(`<text class="fp-lane" x="${fromLeft ? ln.x1 + 4 : L.rowEnd - 4}" y="${ln.y - 5}" text-anchor="${fromLeft ? 'start' : 'end'}">${esc(rate)}</text>`);
  }

  // Sources on the left with a belt into the row.
  for (const s of L.sources) {
    const src = s.source;
    const text = src.kind === 'hand' ? `Storage · ${src.note}` : src.kind === 'loop' ? 'Loop input' : `${src.count}× ${src.building}`;
    g.push(`<g class="fp-source"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="5"/>
      <text x="${s.x + 8}" y="${s.y + 15}">${esc(text)}</text></g>`);
    g.push(`<line class="${cls(s.fluid)} lane" x1="${s.x + s.w}" y1="${s.y + s.h / 2}" x2="${L.x0 - SRC_GAP + 6}" y2="${s.y + s.h / 2}"/>`);
  }

  // Storage and sinks.
  for (const st of L.stores) {
    g.push(`<line class="${data.items[st.item]?.f ? 'pipe' : 'belt'} drop" x1="${st.link.x}" y1="${st.link.y1}" x2="${st.link.x}" y2="${st.link.y2}"/>`);
    const label = st.kind === 'sink' ? `Sink · ${itemName(st.item)}` : `Storage · ${fmt(st.rate)}/min`;
    g.push(`<g class="fp-store ${st.kind}"><rect x="${st.x}" y="${st.y}" width="${STORE_W}" height="20" rx="4"/>
      <text x="${st.x + 7}" y="${st.y + 14}">${esc(label)}</text></g>`);
  }

  // Machines (on top of belts), with tap info.
  for (const m of L.machines) {
    const r = L.rows[m.row].row;
    const info = r.kind === 'gen'
      ? { title: r.name, lines: [`${fmt(r.mw / r.count)} MW each`, ...r.inputs.map((l) => `in ${itemName(l.item)} ${fmt(l.rate / r.count)}/min each`)] }
      : {
        title: `${machineName(r.machine)} — ${r.title}`,
        lines: [
          `Recipe: ${r.recipe.n}`,
          `Clock: ${r.clock.toFixed(1)}%`,
          ...r.inputs.map((l) => `in ${itemName(l.item)} ${fmt(l.rate / r.count)}/min`),
          ...r.outputs.map((l) => `out ${itemName(l.item)} ${fmt(l.rate / r.count)}/min`),
        ],
      };
    g.push(`<g class="fp-machine ${m.kind}" data-info="${esc(JSON.stringify(info))}" tabindex="0">
      <rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="4"/>
      <text x="${m.x + m.w / 2}" y="${m.y + m.h / 2 + 4}">${m.kind === 'gen' ? '⚡' : `${m.clock.toFixed(0)}%`}</text>
      <title>${esc(`${info.title}\n${info.lines.join('\n')}`)}</title></g>`);
  }

  // Splitters, mergers, junctions on top.
  for (const c of L.connectors) {
    if (c.kind === 'junction') g.push(`<circle class="fp-junction" cx="${c.x}" cy="${c.y}" r="5.5"/>`);
    else g.push(`<rect class="fp-${c.kind}" x="${c.x - 6.5}" y="${c.y - 6.5}" width="13" height="13" rx="2"/>`);
  }

  // Bus labels run down beside the top of each line, in the gap before the next one.
  for (const c of L.channels) {
    g.push(`<text class="fp-bus" transform="translate(${c.x + 4},${c.y1 + 8}) rotate(90)">${esc(itemName(c.item))}</text>`);
  }
  for (const { row: r, machY } of L.rows) {
    if (r.kind === 'gen') g.push(`<text class="fp-lane" x="${L.rowEnd + 8}" y="${machY + 16}">→ power grid</text>`);
  }

  const size = opts.fit ? `width="100%"` : `width="${L.width}" height="${L.height}"`;
  return `<svg class="fp" viewBox="0 0 ${L.width} ${L.height}" ${size} role="img" aria-label="Factory floor plan" data-w="${L.width}" data-h="${L.height}">
    <defs><marker id="fp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
    ${g.join('')}</svg>`;
}
