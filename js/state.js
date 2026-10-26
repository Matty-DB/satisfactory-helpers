// localStorage wrapper. Every access is guarded so the page still works with storage blocked.
const KEY = 'sf.settings.v1';

const defaults = () => ({
  tier: 2,
  alts: [],
  choice: {},
  milestonesDone: [],
  targets: [{ item: 'Desc_IronPlateReinforced_C', rate: 5 }],
  theme: 'dark',
  view: 'list',
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

export const state = read();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

const PORTABLE = ['tier', 'alts', 'choice', 'milestonesDone', 'targets'];

export function exportSettings() {
  return JSON.stringify(Object.fromEntries(PORTABLE.map((k) => [k, state[k]])));
}

export function importSettings(text) {
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not a settings object');
  for (const k of PORTABLE) if (k in parsed) state[k] = parsed[k];
  save();
}
