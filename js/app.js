import { DATA } from './data.js';
import { makeIndex, solve, buildTree, recipeOptions, perMin, beltFor, BELTS, PIPES } from './calc.js';
import { renderFlow, renderFloor } from './diagram.js';
import { powerPlan } from './power.js';
import { buildInputs } from './builds.js';
import { state, save, exportSettings, importSettings } from './state.js';
import { BEST_ALTS, SPACE_ELEVATOR, EXTRACTORS, PS5_TIPS, RESEARCH_PICKS, BUILDS } from './ref-content.js';

const index = makeIndex(DATA);
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '') || '0';
const itemName = (id) => DATA.items[id]?.n ?? id;
const isFluid = (id) => !!DATA.items[id]?.f;
const unit = (id) => (isFluid(id) ? 'm³/min' : '/min');
const machineName = (id) => DATA.machines[id]?.n ?? id;
const itemByName = Object.fromEntries(Object.entries(DATA.items).map(([id, it]) => [it.n, id]));
const opts = () => ({ maxTier: state.tier, alts: new Set(state.alts), choice: state.choice });
const ioList = (pairs) => pairs.map(([id, a]) => `${a} ${esc(itemName(id))}`).join(' + ');

// ---------- shell: tier, theme, tabs ----------
const tierSelect = $('#tier-select');
tierSelect.innerHTML = Array.from({ length: 10 }, (_, t) => `<option value="${t}">${t}</option>`).join('');
tierSelect.value = state.tier;
tierSelect.addEventListener('change', () => {
  state.tier = Number(tierSelect.value);
  save();
  recalc();
  renderMilestones();
  if (rendered.builds) renderBuilds();
});

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('meta[name="theme-color"]').content = state.theme === 'dark' ? '#16181d' : '#f4f2ee';
}
$('#theme-toggle').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  save();
  applyTheme();
});
applyTheme();

const rendered = {};
const tabRenderers = { builds: renderBuilds, milestones: renderMilestones, research: renderResearch, machines: renderMachines, alts: renderBestAlts, tips: renderTips };
function showTab(name) {
  for (const b of document.querySelectorAll('[role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `tab-${name}`;
  if (tabRenderers[name] && !rendered[name]) { tabRenderers[name](); rendered[name] = true; }
  try { sessionStorage.setItem('sf.tab', name); } catch { /* ignore */ }
}
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[role="tab"]');
  if (b) showTab(b.dataset.tab);
});

// ---------- calculator: targets ----------
function craftableItems() {
  const o = opts();
  return Object.entries(DATA.items)
    .filter(([id, it]) => !it.raw && recipeOptions(index, id, o).length)
    .map(([id, it]) => ({ id, n: it.n, tier: it.tier }))
    .sort((a, b) => a.n.localeCompare(b.n));
}

function renderTargets() {
  const box = $('#targets');
  box.innerHTML = state.targets.map((t, i) => `
    <div class="target-row" data-i="${i}">
      <div class="item-picker">
        <input type="text" class="item-input" value="${esc(t.item ? itemName(t.item) : '')}" placeholder="Search items…" autocomplete="off" aria-label="Item">
        <ul hidden></ul>
      </div>
      <input type="number" class="rate-input num" min="0" step="any" inputmode="decimal" value="${t.rate}" aria-label="Rate per minute">
      <button type="button" class="btn icon-btn remove" aria-label="Remove">✕</button>
    </div>`).join('');
}

const targetsBox = $('#targets');
targetsBox.addEventListener('input', (e) => {
  const row = e.target.closest('.target-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  if (e.target.classList.contains('rate-input')) {
    state.targets[i].rate = Math.max(0, Number(e.target.value) || 0);
    save();
    recalc();
  } else if (e.target.classList.contains('item-input')) {
    showPicker(row, e.target.value);
  }
});
targetsBox.addEventListener('focusin', (e) => {
  if (e.target.classList.contains('item-input')) {
    e.target.select();
    showPicker(e.target.closest('.target-row'), '');
  }
});
targetsBox.addEventListener('focusout', (e) => {
  const row = e.target.closest('.target-row');
  setTimeout(() => {
    if (!row || row.contains(document.activeElement)) return;
    const ul = $('ul', row);
    if (ul) ul.hidden = true;
    const t = state.targets[Number(row.dataset.i)];
    const input = $('.item-input', row);
    if (t && input) input.value = t.item ? itemName(t.item) : '';
  }, 150);
});
targetsBox.addEventListener('click', (e) => {
  const row = e.target.closest('.target-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  const pick = e.target.closest('[data-item]');
  if (pick) {
    state.targets[i].item = pick.dataset.item;
    save();
    renderTargets();
    recalc();
    $(`.target-row[data-i="${i}"] .rate-input`)?.focus();
  } else if (e.target.closest('.remove')) {
    state.targets.splice(i, 1);
    save();
    renderTargets();
    recalc();
  }
});
targetsBox.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('item-input')) return;
  const ul = $('ul', e.target.closest('.target-row'));
  const buttons = [...ul.querySelectorAll('button')];
  if (!buttons.length) return;
  let at = buttons.findIndex((b) => b.classList.contains('active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    buttons[at]?.classList.remove('active');
    at = (at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[at].classList.add('active');
    buttons[at].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    (buttons[at] || buttons[0]).click();
  } else if (e.key === 'Escape') {
    ul.hidden = true;
  }
});

function showPicker(row, query) {
  const ul = $('ul', row);
  const q = query.trim().toLowerCase();
  const list = craftableItems().filter((it) => !q || it.n.toLowerCase().includes(q)).slice(0, 60);
  ul.innerHTML = list.length
    ? list.map((it) => `<li><button type="button" data-item="${it.id}">${esc(it.n)} <small>T${it.tier}</small></button></li>`).join('')
    : '<li class="hint" style="padding:.6rem">Nothing craftable matches at your tier.</li>';
  ul.hidden = false;
}

$('#add-target').addEventListener('click', () => {
  state.targets.push({ item: null, rate: 10 });
  save();
  renderTargets();
  $(`.target-row[data-i="${state.targets.length - 1}"] .item-input`).focus();
});
$('#clear-targets').addEventListener('click', () => {
  state.targets = [{ item: null, rate: 10 }];
  save();
  renderTargets();
  recalc();
});

// ---------- calculator: results ----------
for (const b of document.querySelectorAll('.view-toggle button')) {
  b.addEventListener('click', () => {
    state.view = b.dataset.view;
    save();
    recalc();
  });
}

function recalc() {
  for (const b of document.querySelectorAll('.view-toggle button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  const targets = state.targets.filter((t) => t.item && t.rate > 0);
  const view = $('#result-view');
  const summary = $('#summary');
  if (!targets.length) {
    summary.innerHTML = '';
    view.innerHTML = '<div class="card hint">Pick an item and a rate to see what to build.</div>';
    return;
  }
  const o = opts();
  const res = solve(index, targets, o);
  summary.innerHTML = renderSummary(res);
  const ctx = { itemName, machineName, isFluid, beltFor };
  const views = {
    tree: () => `<div class="card"><ul class="tree">${targets.map((t) => treeNode(buildTree(index, t.item, t.rate, o), 0)).join('')}</ul></div>`,
    flow: () => `<div class="card">${renderFlow(res, ctx)}</div>`,
    floor: () => `<div class="card">${renderFloor(res, ctx)}</div>`,
    list: () => renderBuildList(res, o, new Set(targets.map((t) => t.item))),
  };
  view.innerHTML = res.nodes.length ? (views[state.view] || views.list)() : '';
}

function renderSummary(res) {
  const buildCount = res.nodes.reduce((s, n) => s + Math.ceil(n.machines - 1e-9), 0);
  const list = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])
    .map(([id, r]) => `<li><span class="${isFluid(id) ? 'fluid' : ''}">${esc(itemName(id))}</span><span class="num">${fmt(r)} ${unit(id)}</span></li>`).join('');
  let html = '';
  if (Object.keys(res.unavailable).length) {
    html += `<div class="notice stat wide">Not craftable at Tier ${state.tier} with your recipes: ${Object.keys(res.unavailable).map((id) => esc(itemName(id))).join(', ')}. Raise your tier or tick an alternate recipe.</div>`;
  }
  if (res.cycles.length) {
    html += `<div class="notice stat wide">Your recipe choices form a loop (${res.cycles.map((c) => `${esc(itemName(c.item))} ↔ ${esc(itemName(c.ingredient))}`).join(', ')}). The loop input is listed separately; feed some of the loop's own output back in to cover it.</div>`;
  }
  html += `
    <div class="stat"><div class="label">Power (at 100%)</div><div class="value">${fmt(res.power)} MW</div></div>
    <div class="stat"><div class="label">Machines to build</div><div class="value">${buildCount}</div></div>
    ${res.belt ? `<div class="stat"><div class="label">Busiest belt · ${fmt(res.belt.rate)}/min</div><div class="value">Mk.${res.belt.mk}${res.belt.lines > 1 ? ` ×${res.belt.lines}` : ''}</div></div>` : ''}
    ${res.pipe ? `<div class="stat"><div class="label">Busiest pipe · ${fmt(res.pipe.rate)} m³/min</div><div class="value">Mk.${res.pipe.mk}${res.pipe.lines > 1 ? ` ×${res.pipe.lines}` : ''}</div></div>` : ''}
    <div class="stat wide"><div class="label">Raw resources</div><ul>${list(res.raw) || '<li>None</li>'}</ul></div>`;
  if (Object.keys(res.hand).length) html += `<div class="stat wide"><div class="label">Craft by hand (Equipment Workshop)</div><ul>${list(res.hand)}</ul></div>`;
  if (Object.keys(res.loopInputs).length) html += `<div class="stat wide"><div class="label">Loop inputs (supply from the loop's own output)</div><ul>${list(res.loopInputs)}</ul></div>`;
  if (Object.keys(res.byproducts).length) html += `<div class="stat wide"><div class="label">Byproducts — sink, store or use them elsewhere</div><ul>${list(res.byproducts)}</ul></div>`;
  return html;
}

function renderBuildList(res, o, targetSet) {
  return `<div class="build-list">${res.nodes.map((n) => {
    const r = n.recipe;
    const built = Math.ceil(n.machines - 1e-9);
    const clock = (n.machines / built) * 100;
    const options = recipeOptions(index, n.item, o);
    const select = options.length > 1
      ? `<select data-choice="${n.item}" aria-label="Recipe for ${esc(itemName(n.item))}">${options.map((x) =>
          `<option value="${x.id}"${x.id === r.id ? ' selected' : ''}>${x.alt ? 'Alt: ' : ''}${esc(x.n)} — ${esc(machineName(x.m))}</option>`).join('')}</select>`
      : '';
    const io = (pairs) => pairs.map(([id, rate]) => `<li><span class="${isFluid(id) ? 'fluid' : ''}">${esc(itemName(id))}</span><span class="num">${fmt(rate)}</span></li>`).join('');
    return `<article class="step">
      <div class="step-head">
        <h3>${esc(itemName(n.item))} ${targetSet.has(n.item) ? '<span class="tag">TARGET</span>' : ''}</h3>
        <span class="machines">${fmt(n.machines)} × ${esc(machineName(r.m))}</span>
      </div>
      <div class="step-io">
        <div><h4>In /min</h4><ul>${io(n.inputs)}</ul></div>
        <div><h4>Out /min</h4><ul>${io(n.outputs)}</ul></div>
      </div>
      <div class="step-meta">${r.alt ? '<span class="tag">ALT</span> ' : ''}${esc(r.n)} · ${fmt(n.power)} MW${
        clock < 99.9 ? ` · build ${built}, set clock to ${clock.toFixed(1)}%` : ` · build ${built}`}</div>
      ${select}
    </article>`;
  }).join('')}</div>`;
}

$('#result-view').addEventListener('change', (e) => {
  const sel = e.target.closest('[data-choice]');
  if (!sel) return;
  state.choice[sel.dataset.choice] = sel.value;
  save();
  recalc();
});

function treeNode(node, depth) {
  const name = `<span class="${isFluid(node.item) ? 'fluid' : ''}">${esc(itemName(node.item))}</span>`;
  const rate = `<span class="rate">${fmt(node.rate)} ${unit(node.item)}</span>`;
  if (node.cycle) return `<li class="leaf">${name} ${rate} <span class="tag">LOOP</span></li>`;
  if (!node.recipe) return `<li class="leaf">${name} ${rate}${DATA.items[node.item]?.raw ? '' : ' <span class="tag">N/A</span>'}</li>`;
  return `<li><details${depth < 2 ? ' open' : ''}><summary>${name} ${rate} <span class="mach">${fmt(node.machines)}× ${esc(machineName(node.recipe.m))}</span></summary>
    <ul>${node.children.map((c) => treeNode(c, depth + 1)).join('')}</ul></details></li>`;
}

// ---------- alt recipe settings ----------
const dialog = $('#settings');
const altSearch = $('#alt-search');
const altHideLocked = $('#alt-hide-locked');
function updateAltCount() { $('#alt-count').textContent = state.alts.length; }

function renderAltList() {
  const q = altSearch.value.trim().toLowerCase();
  const owned = new Set(state.alts);
  const groups = {};
  for (const r of DATA.recipes) {
    if (!r.alt) continue;
    if (altHideLocked.checked && r.tier > state.tier) continue;
    const product = itemName(r.out[0][0]);
    if (q && !r.n.toLowerCase().includes(q) && !product.toLowerCase().includes(q)) continue;
    (groups[product] ||= []).push(r);
  }
  const names = Object.keys(groups).sort();
  $('#alt-list').innerHTML = names.length
    ? names.map((p) => `<h3>${esc(p)}</h3>${groups[p].map((r) => `
        <label class="check-row"><input type="checkbox" data-alt="${r.id}"${owned.has(r.id) ? ' checked' : ''}>
        <span>${esc(r.n)} <small>T${r.tier} · ${esc(machineName(r.m))} · ${ioList(r.in)}</small></span></label>`).join('')}`).join('')
    : '<p class="hint">No alternates match.</p>';
}

$('#open-settings').addEventListener('click', () => {
  renderAltList();
  dialog.showModal();
});
altSearch.addEventListener('input', renderAltList);
altHideLocked.addEventListener('change', renderAltList);
$('#alt-list').addEventListener('change', (e) => {
  const id = e.target.dataset.alt;
  if (!id) return;
  setAlt(id, e.target.checked);
});
dialog.addEventListener('close', () => { if (rendered.alts) renderBestAlts(); });

function setAlt(id, on) {
  const set = new Set(state.alts);
  if (on) set.add(id); else set.delete(id);
  state.alts = [...set];
  save();
  updateAltCount();
  recalc();
}

$('#export-btn').addEventListener('click', async () => {
  const text = exportSettings();
  $('#transfer-text').value = text;
  try {
    await navigator.clipboard.writeText(text);
    $('#transfer-msg').textContent = 'Copied. Paste it into this box on your other device.';
  } catch {
    $('#transfer-text').select();
    $('#transfer-msg').textContent = 'Select the text above and copy it.';
  }
});
$('#import-btn').addEventListener('click', () => {
  try {
    importSettings($('#transfer-text').value);
    tierSelect.value = state.tier;
    updateAltCount();
    renderAltList();
    renderTargets();
    recalc();
    for (const k of Object.keys(rendered)) rendered[k] = false;
    $('#transfer-msg').textContent = 'Imported.';
  } catch {
    $('#transfer-msg').textContent = 'That text is not valid settings.';
  }
});

// ---------- milestones ----------
function planCost(cost, minutes) {
  state.targets = cost.map(([id, amount]) => ({ item: id, rate: Math.round((amount / minutes) * 100) / 100 }));
  save();
  renderTargets();
  recalc();
  showTab('calc');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function costChips(cost) {
  return `<ul class="cost">${cost.map(([id, a]) => `<li>${a.toLocaleString()} × ${esc(itemName(id))}</li>`).join('')}</ul>`;
}

function renderMilestones() {
  const panel = $('#tab-milestones');
  const done = new Set(state.milestonesDone);
  const minutes = Number(panel.querySelector('#plan-minutes')?.value) || 10;
  const byTier = {};
  for (const m of DATA.milestones) (byTier[m.tier] ||= []).push(m);

  const se = SPACE_ELEVATOR.map((p) => {
    const cost = p.cost.map(([n, a]) => [itemByName[n], a]);
    const id = `SE${p.phase}`;
    return `<div class="milestone${done.has(id) ? ' done' : ''}">
      <div class="ms-top">
        <label class="check-row"><input type="checkbox" data-ms="${id}"${done.has(id) ? ' checked' : ''}><span class="ms-name">Phase ${p.phase} → ${esc(p.unlocks)}</span></label>
        <button type="button" class="btn" data-plan='${esc(JSON.stringify(cost))}'>Plan</button>
      </div>${costChips(cost)}</div>`;
  }).join('');

  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b).map((t) => {
    const list = byTier[t];
    const n = list.filter((m) => done.has(m.id)).length;
    return `<details class="card tier-block"${t === state.tier || t === state.tier + 1 ? ' open' : ''}>
      <summary><h2 style="display:inline-flex;width:calc(100% - 1.5rem)">Tier ${t} <span class="hint" style="margin:0">${n}/${list.length}</span>
        <span class="progress"><span style="width:${(n / list.length) * 100}%"></span></span></h2></summary>
      ${list.map((m) => `<div class="milestone${done.has(m.id) ? ' done' : ''}">
        <div class="ms-top">
          <label class="check-row"><input type="checkbox" data-ms="${m.id}"${done.has(m.id) ? ' checked' : ''}><span class="ms-name">${esc(m.n)}</span></label>
          ${m.cost.length ? `<button type="button" class="btn" data-plan='${esc(JSON.stringify(m.cost))}'>Plan</button>` : ''}
        </div>
        ${costChips(m.cost)}
        ${m.unlocks.length ? `<p class="ms-unlocks">Unlocks: ${m.unlocks.slice(0, 8).map(esc).join(', ')}${m.unlocks.length > 8 ? '…' : ''}</p>` : ''}
      </div>`).join('')}
    </details>`;
  }).join('');

  panel.innerHTML = `<div class="ref-grid">
    <div class="card">
      <h2>Space Elevator</h2>
      <p class="hint">"Plan" turns a cost into calculator targets, spread over
        <input id="plan-minutes" type="number" min="1" value="${minutes}" class="num" style="width:5rem;min-height:36px"> minutes of production.
        Phase costs are for 1.x — check them in-game if a patch changed them.</p>
      ${se}
    </div>
    ${tiers}
  </div>`;
}

$('#tab-milestones').addEventListener('change', (e) => {
  const id = e.target.dataset.ms;
  if (!id) return;
  const set = new Set(state.milestonesDone);
  if (e.target.checked) set.add(id); else set.delete(id);
  state.milestonesDone = [...set];
  save();
  renderMilestones();
});
$('#tab-milestones').addEventListener('click', (e) => {
  const b = e.target.closest('[data-plan]');
  if (!b) return;
  planCost(JSON.parse(b.dataset.plan), Number($('#plan-minutes').value) || 10);
});

// ---------- builds & power planner ----------
const planner = { gen: 'Desc_GeneratorCoal_C', fuel: 'Desc_Coal_C', count: 8 };

function powerSummary(p) {
  const fluid = isFluid(p.fuelId);
  const water = p.waterTotal ? beltFor(p.waterTotal, true) : null;
  const rows = [
    ['Power', p.extractorMW ? `${fmt(p.gross)} MW gross · ${fmt(p.net)} MW after water extractors` : `${fmt(p.gross)} MW`],
    ['Fuel', `${fmt(p.fuelTotal)} ${fluid ? 'm³' : ''}/min ${esc(itemName(p.fuelId))} (${fmt(p.fuelPerGen)} each)`],
  ];
  if (p.waterTotal) {
    rows.push(['Water', `${fmt(p.waterTotal)} m³/min → ${p.waterExtractors} Water Extractor${p.waterExtractors > 1 ? 's' : ''} (${p.extractorMW} MW) · pipe Mk.${water.mk}${water.lines > 1 ? ` ×${water.lines}` : ''}`]);
  }
  if (p.miners.length) {
    rows.push(['Miners', p.miners.map((m) => `${m.count}× ${esc(m.n)}`).join(' or ') + ' on normal nodes']);
  }
  return `<table class="kv"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
}

function renderPlanner() {
  const gen = DATA.generators.find((g) => g.id === planner.gen);
  if (!gen.fuels.some(([f]) => f === planner.fuel)) planner.fuel = gen.fuels[0][0];
  const p = powerPlan(DATA, planner.gen, planner.fuel, planner.count);
  const craftable = !DATA.items[planner.fuel]?.raw;
  $('#planner-out').innerHTML = `${powerSummary(p)}
    ${craftable ? `<button type="button" class="btn" id="planner-load">Plan ${fmt(p.fuelTotal)}/min ${esc(itemName(planner.fuel))} in calculator</button>` : ''}`;
  $('#planner-fuel').innerHTML = gen.fuels.map(([f, mj]) => `<option value="${f}"${f === planner.fuel ? ' selected' : ''}>${esc(itemName(f))} (${mj.toLocaleString()} MJ)</option>`).join('');
}

function buildCard(b) {
  const { targets, opts: bo, power } = buildInputs(DATA, b);
  const parts = [];
  if (power) parts.push(powerSummary(powerPlan(DATA, power.genId, power.fuelId, power.count)));
  if (targets.length) {
    const res = solve(index, targets, bo);
    const byMachine = {};
    for (const n of res.nodes) byMachine[n.recipe.m] = (byMachine[n.recipe.m] || 0) + Math.ceil(n.machines - 1e-9);
    const raw = Object.entries(res.raw).map(([id, r]) => `${fmt(r)} ${esc(itemName(id))}`).join(', ');
    const byp = Object.entries(res.byproducts).map(([id, r]) => `${fmt(r)} ${esc(itemName(id))}`).join(', ');
    parts.push(`<table class="kv"><tbody>
      <tr><th>Makes</th><td>${targets.map((t) => `${fmt(t.rate)} ${esc(itemName(t.item))}`).join(', ')} per min</td></tr>
      <tr><th>Build</th><td>${Object.entries(byMachine).map(([m, c]) => `${c}× ${esc(machineName(m))}`).join(', ')}</td></tr>
      <tr><th>Raw</th><td>${raw || '—'} per min</td></tr>
      ${byp ? `<tr><th>Byproduct</th><td>${byp} per min</td></tr>` : ''}
      <tr><th>Uses</th><td>${fmt(res.power)} MW at 100%</td></tr>
    </tbody></table>`);
  }
  const altNote = b.alts?.length ? `<p class="notice" style="margin:.6rem 0 0">Uses ${b.alts.map(esc).join(' + ')} — tick ${b.alts.length > 1 ? 'them' : 'it'} under <em>Alt recipes</em> once unlocked.</p>` : '';
  const locked = b.tier > state.tier ? ` <span class="tag">TIER ${b.tier}</span>` : ` <span class="hint" style="font-size:.8rem">Tier ${b.tier}</span>`;
  return `<article class="card build" id="build-${b.id}">
    <h3>${esc(b.title)}${locked}</h3>
    <p>${esc(b.goal)}</p>
    ${parts.join('')}
    ${altNote}
    <ul class="tips-list">${b.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="target-actions">
      ${targets.length ? `<button type="button" class="btn primary" data-build-calc="${b.id}">Open in calculator</button>` : ''}
      ${power ? `<button type="button" class="btn" data-build-power="${b.id}">Open in power planner</button>` : ''}
    </div>
  </article>`;
}

function renderBuilds() {
  const panel = $('#tab-builds');
  const stages = BUILDS.map((st) => {
    const tiers = st.builds.map((b) => b.tier);
    const open = state.tier >= Math.min(...tiers) && state.tier <= Math.max(...tiers) + 2;
    return `<details class="tier-block build-stage"${open ? ' open' : ''}>
      <summary><h2 style="display:inline">${esc(st.stage)}</h2></summary>
      <div class="build-grid">${st.builds.map(buildCard).join('')}</div>
    </details>`;
  }).join('');
  panel.innerHTML = `<div class="ref-grid">
    <div class="card" id="planner">
      <h2>Power planner</h2>
      <div class="planner-form">
        <label>Generator<select id="planner-gen">${DATA.generators.map((g) => `<option value="${g.id}"${g.id === planner.gen ? ' selected' : ''}>${esc(g.n)} (${g.mw} MW)</option>`).join('')}</select></label>
        <label>Fuel<select id="planner-fuel"></select></label>
        <label>How many<input id="planner-count" type="number" min="1" step="1" value="${planner.count}" class="num"></label>
      </div>
      <div id="planner-out"></div>
      <p class="hint">At 100% clock. Miner counts assume normal-purity nodes; halve them for pure nodes. Miners and pumps also draw power (see Machines &amp; power).</p>
    </div>
    <p class="hint" style="margin:0">Ready-made setups in the order you'll need them. Numbers use standard recipes; open one in the calculator to swap in your alternates or change the rate.</p>
    ${stages}
  </div>`;
  renderPlanner();
}

$('#tab-builds').addEventListener('change', (e) => {
  if (e.target.id === 'planner-gen') { planner.gen = e.target.value; renderPlanner(); }
  if (e.target.id === 'planner-fuel') { planner.fuel = e.target.value; renderPlanner(); }
});
$('#tab-builds').addEventListener('input', (e) => {
  if (e.target.id === 'planner-count') { planner.count = Math.max(1, Math.round(Number(e.target.value) || 1)); renderPlanner(); }
});
$('#tab-builds').addEventListener('click', (e) => {
  const calcBtn = e.target.closest('[data-build-calc]');
  const powerBtn = e.target.closest('[data-build-power]');
  const find = (id) => BUILDS.flatMap((s) => s.builds).find((b) => b.id === id);
  if (calcBtn) {
    const { targets, opts: bo } = buildInputs(DATA, find(calcBtn.dataset.buildCalc));
    state.targets = targets;
    Object.assign(state.choice, bo.choice);
    save();
    renderTargets();
    recalc();
    showTab('calc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (powerBtn) {
    const { power } = buildInputs(DATA, find(powerBtn.dataset.buildPower));
    planner.gen = power.genId;
    planner.fuel = power.fuelId;
    planner.count = power.count;
    $('#planner-gen').value = power.genId;
    $('#planner-count').value = power.count;
    renderPlanner();
    $('#planner').scrollIntoView({ behavior: 'smooth' });
  } else if (e.target.id === 'planner-load') {
    const p = powerPlan(DATA, planner.gen, planner.fuel, planner.count);
    state.targets = [{ item: planner.fuel, rate: Math.round(p.fuelTotal * 100) / 100 }];
    save();
    renderTargets();
    recalc();
    showTab('calc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// ---------- MAM research ----------
const TREE_ORDER = ['Caterium', 'Power Slugs', 'Alien Technology', 'Quartz', 'Sulfur', 'Mycelia', 'Alien Megafauna', 'Nutrients'];
const researchKey = (tree, n) => `${tree}|${n}`;
const researchByKey = Object.fromEntries(DATA.research.map((r) => [researchKey(r.tree, r.n), r]));
const pickWhy = Object.fromEntries(RESEARCH_PICKS.flatMap((s) => s.picks.map(([t, n, why]) => [researchKey(t, n), why])));

function researchItem(r, why) {
  const done = state.researchDone.includes(r.id);
  const unlocks = [...r.unlocks, r.slots ? `+${r.slots} inventory slots` : ''].filter(Boolean);
  return `<div class="milestone${done ? ' done' : ''}">
    <div class="ms-top">
      <label class="check-row"><input type="checkbox" data-research="${r.id}"${done ? ' checked' : ''}><span class="ms-name">${esc(r.n)}</span></label>
      ${r.cost.length ? `<button type="button" class="btn" data-plan='${esc(JSON.stringify(r.cost))}'>Plan</button>` : ''}
    </div>
    ${why ? `<p class="ms-unlocks why">${esc(why)}</p>` : ''}
    ${costChips(r.cost)}
    ${unlocks.length ? `<p class="ms-unlocks">Unlocks: ${unlocks.map(esc).join(', ')}</p>` : ''}
  </div>`;
}

function renderResearch() {
  const panel = $('#tab-research');
  const minutes = Number(panel.querySelector('#research-minutes')?.value) || 10;
  const done = new Set(state.researchDone);
  const picks = RESEARCH_PICKS.map((stage) => {
    const list = stage.picks.map(([t, n]) => researchByKey[researchKey(t, n)]);
    const left = list.filter((r) => !done.has(r.id)).length;
    return `<details class="card tier-block"${left ? ' open' : ''}>
      <summary><h2 style="display:inline-flex;width:calc(100% - 1.5rem)">${esc(stage.stage)} <span class="hint" style="margin:0">${list.length - left}/${list.length}</span>
        <span class="progress"><span style="width:${((list.length - left) / list.length) * 100}%"></span></span></h2></summary>
      ${list.map((r) => researchItem(r, `${r.tree} · ${pickWhy[researchKey(r.tree, r.n)]}`)).join('')}
    </details>`;
  }).join('');
  const trees = {};
  for (const r of DATA.research) (trees[r.tree] ||= []).push(r);
  const treeHtml = TREE_ORDER.filter((t) => trees[t]).map((t) => {
    const list = trees[t].slice().sort((a, b) => (pickWhy[researchKey(t, b.n)] ? 1 : 0) - (pickWhy[researchKey(t, a.n)] ? 1 : 0) || a.n.localeCompare(b.n));
    const n = list.filter((r) => done.has(r.id)).length;
    return `<details class="card tier-block">
      <summary><h2 style="display:inline-flex;width:calc(100% - 1.5rem)">${esc(t)} <span class="hint" style="margin:0">${n}/${list.length}</span>
        <span class="progress"><span style="width:${(n / list.length) * 100}%"></span></span></h2></summary>
      ${list.map((r) => researchItem(r, pickWhy[researchKey(t, r.n)] ? `★ ${pickWhy[researchKey(t, r.n)]}` : '')).join('')}
    </details>`;
  }).join('');
  panel.innerHTML = `<div class="ref-grid">
    <div class="card">
      <h2>MAM research</h2>
      <p class="hint" style="margin-top:0">Build the MAM (Tier 1, Field Research), then research in roughly this order. Tick items off as you finish them.
        "Plan" loads a research cost into the calculator, spread over
        <input id="research-minutes" type="number" min="1" value="${minutes}" class="num" style="width:5rem;min-height:36px"> minutes of production.
        Inside the MAM some research only appears after its neighbours, so do each tree roughly top to bottom.</p>
      <p class="hint">Also research every <strong>Hard Drive</strong> you find. It offers a choice of alternate recipes, and the <em>Best alts</em> tab helps you pick.</p>
    </div>
    ${picks}
    <h2 style="margin:.5rem 0 0">All research by tree</h2>
    <p class="hint" style="margin:0">★ marks the suggested picks.</p>
    ${treeHtml}
  </div>`;
}

$('#tab-research').addEventListener('change', (e) => {
  const id = e.target.dataset.research;
  if (!id) return;
  const set = new Set(state.researchDone);
  if (e.target.checked) set.add(id); else set.delete(id);
  state.researchDone = [...set];
  save();
  const open = [...document.querySelectorAll('#tab-research details')].map((d) => d.open);
  renderResearch();
  document.querySelectorAll('#tab-research details').forEach((d, i) => { if (open[i] !== undefined) d.open = open[i]; });
});
$('#tab-research').addEventListener('click', (e) => {
  const b = e.target.closest('[data-plan]');
  if (!b) return;
  planCost(JSON.parse(b.dataset.plan), Number($('#research-minutes').value) || 10);
});

// ---------- machines & power ----------
function renderMachines() {
  const machines = Object.values(DATA.machines).sort((a, b) => a.tier - b.tier || a.n.localeCompare(b.n));
  $('#tab-machines').innerHTML = `<div class="ref-grid two">
    <div class="card">
      <h2>Overclocking</h2>
      <div class="oc-calc">
        <label>Machine
          <select id="oc-machine">${machines.filter((m) => m.mw).map((m) => `<option value="${m.mw}">${esc(m.n)} (${m.mw} MW)</option>`).join('')}</select></label>
        <label>Clock speed: <strong id="oc-clock-label" class="num">100%</strong>
          <input id="oc-clock" type="range" min="1" max="250" value="100"></label>
        <div class="oc-out">
          <div class="stat"><div class="label">Power</div><div class="value" id="oc-power"></div></div>
          <div class="stat"><div class="label">Output</div><div class="value" id="oc-output"></div></div>
          <div class="stat"><div class="label">Power Shards</div><div class="value" id="oc-shards"></div></div>
        </div>
        <p class="hint">Output scales linearly with clock; power scales by clock<sup>1.32</sup>. So running 2 machines at 50% uses far less power than 1 at 100%, and 1 at 250% costs about 3.4× the power for 2.5× the output. Each Power Shard adds 50% (max 3 shards = 250%). Somersloops in a machine's amplifier slots can double its output, at a big power cost.</p>
      </div>
    </div>
    <div class="card">
      <h2>Machines</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Machine</th><th class="num">MW</th><th class="num">Tier</th></tr></thead>
        <tbody>${machines.map((m) => `<tr><td>${esc(m.n)}</td><td class="num">${m.mw || 'varies'}</td><td class="num">${m.tier}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">"Varies" machines use power that depends on the recipe; the calculator uses each recipe's average.</p>
    </div>
    <div class="card">
      <h2>Belts &amp; pipes</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th>${BELTS.map((_, i) => `<th class="num">Mk.${i + 1}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td>Belt /min</td>${BELTS.map((b) => `<td class="num">${b}</td>`).join('')}</tr>
          <tr><td>Pipe m³/min</td>${BELTS.map((_, i) => `<td class="num">${PIPES[i] ?? '—'}</td>`).join('')}</tr>
        </tbody>
      </table></div>
      <p class="hint">Fluids only climb a short way on their own. A Pipeline Pump Mk.1 adds up to 20 m of lift, a Mk.2 up to 50 m.</p>
    </div>
    <div class="card">
      <h2>Extraction rates (100% clock)</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Extractor</th><th class="num">Impure</th><th class="num">Normal</th><th class="num">Pure</th></tr></thead>
        <tbody>${EXTRACTORS.map(([n, a, b, c]) => `<tr><td>${esc(n)}</td><td class="num">${a}</td><td class="num">${b}</td><td class="num">${c}</td></tr>`).join('')}
          <tr><td>Water Extractor (m³)</td><td class="num" colspan="3">120 anywhere on water</td></tr>
        </tbody>
      </table></div>
      <p class="hint">A Mk.3 miner on a pure node at 250% gives 1200/min, which needs a Mk.6 belt.</p>
    </div>
    <div class="card">
      <h2>Power generators</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Generator</th><th class="num">MW</th><th>Fuel</th></tr></thead>
        <tbody>${DATA.generators.map((g) => `<tr><td>${esc(g.n)}</td><td class="num">${g.mw}</td><td>${g.fuels.map(([f]) => esc(itemName(f))).join(', ')}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
  const update = () => {
    const mw = Number($('#oc-machine').value);
    const clock = Number($('#oc-clock').value);
    $('#oc-clock-label').textContent = `${clock}%`;
    $('#oc-power').textContent = `${fmt(mw * (clock / 100) ** 1.321929)} MW`;
    $('#oc-output').textContent = `${clock / 100}×`;
    $('#oc-shards').textContent = clock <= 100 ? '0' : String(Math.ceil((clock - 100) / 50));
  };
  $('#oc-machine').addEventListener('change', update);
  $('#oc-clock').addEventListener('input', update);
  update();
}

// ---------- best alts ----------
function renderBestAlts() {
  const owned = new Set(state.alts);
  const byName = Object.fromEntries(DATA.recipes.filter((r) => r.alt).map((r) => [r.n, r]));
  $('#tab-alts').innerHTML = `<div class="ref-grid two">${BEST_ALTS.map((g) => `
    <div class="card"><h2>${esc(g.group)}</h2>${g.picks.map(([n, why]) => {
      const r = byName[n];
      const has = owned.has(r.id);
      return `<div class="alt-pick">
        <div class="ms-top"><h3 style="margin:0">${esc(n)} <span class="hint" style="font-size:.8rem">→ ${esc(itemName(r.out[0][0]))} · T${r.tier}</span></h3>
          <button type="button" class="btn${has ? ' primary' : ''}" data-own="${r.id}">${has ? '✓ Unlocked' : 'I have this'}</button></div>
        <p style="margin:.3rem 0 0">${esc(why)}</p>
        <div class="recipe">${esc(machineName(r.m))}: ${ioList(r.in)} → ${ioList(r.out)} every ${r.t}s
          (${r.out.map(([id, a]) => `${fmt(perMin(r, a))} ${esc(itemName(id))}/min`).join(', ')})</div>
      </div>`;
    }).join('')}</div>`).join('')}</div>
    <p class="hint">Alternates come from Hard Drives found in crash sites; research them in the MAM to get a choice of two or three.</p>`;
}
$('#tab-alts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-own]');
  if (!b) return;
  setAlt(b.dataset.own, !state.alts.includes(b.dataset.own));
  renderBestAlts();
});

// ---------- tips ----------
function renderTips() {
  $('#tab-tips').innerHTML = `<div class="tips">${PS5_TIPS.map((t) => `<div class="card"><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p></div>`).join('')}</div>`;
}

// ---------- boot ----------
$('#data-version').textContent = `Data: ${DATA.version}`;
updateAltCount();
renderTargets();
recalc();
let startTab = 'calc';
try { startTab = sessionStorage.getItem('sf.tab') || 'calc'; } catch { /* ignore */ }
showTab(startTab);
