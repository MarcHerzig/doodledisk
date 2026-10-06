import { DEFAULTS } from './disk.js';

const KEY = 'doodledisk.settings.v1';
const PERSIST = ['durchmesser', 'dicke', 'fasenTiefe', 'fasenAufweitung', 'fasenOben'];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = {};
    for (const k of PERSIST) {
      if (k === 'fasenOben' ? typeof raw[k] === 'boolean' : Number.isFinite(raw[k])) out[k] = raw[k];
    }
    return out;
  } catch {
    return {};
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, state[k]]))));
  } catch {
    /* Speicher gesperrt: egal */
  }
}

export function createStore() {
  let state = { ...DEFAULTS, contours: [], fileName: '', ...load() };
  const subs = new Set();
  return {
    get: () => state,
    set(patch, meta = {}) {
      state = { ...state, ...patch };
      save(state);
      subs.forEach((fn) => fn(state, meta));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
