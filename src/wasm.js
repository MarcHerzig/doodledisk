import Module from 'manifold-3d';

let ready;

export function loadManifold(locateFile) {
  ready ??= Module(locateFile ? { locateFile } : undefined)
    .then((wasm) => {
      wasm.setup();
      return wasm;
    })
    .catch((err) => {
      ready = undefined; // fehlgeschlagene Initialisierung nicht zwischenspeichern
      throw err;
    });
  return ready;
}

export function isOk(m) {
  const s = m.status();
  return s === 'NoError' || s === 0;
}

export function volumeOf(m) {
  return typeof m.volume === 'function' ? m.volume() : m.getProperties().volume;
}

export function scope() {
  const items = [];
  return {
    t(x) {
      items.push(x);
      return x;
    },
    done() {
      for (const i of items) {
        try {
          i.delete();
        } catch {
          /* schon gelöscht */
        }
      }
      items.length = 0;
    },
  };
}
