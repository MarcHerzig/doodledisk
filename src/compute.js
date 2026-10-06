import { buildDisk, clampState } from './disk.js';
import { analyze } from './checks.js';
import { isOk, volumeOf } from './wasm.js';

const FLOW_MM3_PER_S = 5;

export function estimateMinutes(volumeMm3) {
  return Math.round(volumeMm3 / FLOW_MM3_PER_S / 60);
}

export function compute(wasm, rawState, { fine = true } = {}) {
  const state = clampState(rawState);
  const check = fine ? analyze(wasm, state) : null;
  const disk = buildDisk(wasm, state, { fine });
  try {
    if (!isOk(disk)) throw new Error(`Das Modell ist nicht wasserdicht (${disk.status()}).`);
    const mesh = disk.getMesh();
    const stride = mesh.numProp;
    const n = mesh.vertProperties.length / stride;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[3 * i] = mesh.vertProperties[i * stride];
      positions[3 * i + 1] = mesh.vertProperties[i * stride + 1];
      positions[3 * i + 2] = mesh.vertProperties[i * stride + 2];
    }
    const indices = Uint32Array.from(mesh.triVerts);
    const volume = volumeOf(disk);
    return {
      positions,
      indices,
      volume,
      warnings: check ? check.warnings : null,
      stats: check
        ? { ausschnitte: check.stats.ausschnitte, volumeCm3: volume / 1000, minutes: estimateMinutes(volume) }
        : null,
    };
  } finally {
    disk.delete();
  }
}
