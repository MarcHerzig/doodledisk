import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state.js';

function stub(initial) {
  const mem = new Map(initial ? [['doodledisk.settings.v1', JSON.stringify(initial)]] : []);
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  return mem;
}

describe('state persistenz', () => {
  beforeEach(() => stub());
  it('seite unten und modus set überleben Speichern und Laden', () => {
    const mem = stub();
    createStore().set({ seite: 'unten', modus: 'set', zahlen: 7, blockdicke: 5.5 });
    const again = createStore().get();
    expect(again.seite).toBe('unten');
    expect(again.modus).toBe('set');
    expect(again.zahlen).toBe(7);
    expect(again.blockdicke).toBe(5.5);
    expect(JSON.parse(mem.get('doodledisk.settings.v1')).seite).toBe('unten');
  });
  it('ungültige Werte werden verworfen', () => {
    stub({ seite: null, modus: 'x', zahlen: 'a', blockdicke: NaN });
    const s = createStore().get();
    expect(s.seite).toBe('links');
    expect(s.modus).toBe('einzel');
  });
});
