import { loadManifold } from './wasm.js';
import { compute } from './compute.js';

const wasmUrl = new URL('../node_modules/manifold-3d/manifold.wasm', import.meta.url).href;
const ready = loadManifold((p) => (p.endsWith('.wasm') ? wasmUrl : p));

self.onmessage = async (e) => {
  const { id, version, fine, state } = e.data;
  try {
    const wasm = await ready;
    const r = compute(wasm, state, { fine });
    self.postMessage({ id, version, fine, ok: true, ...r }, [r.positions.buffer, r.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, version, fine, ok: false, error: String(err?.message || err) });
  }
};
