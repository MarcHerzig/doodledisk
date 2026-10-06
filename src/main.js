import { readDxf } from './dxf.js';
import { buildContours, simplifyContours } from './contours.js';
import { fitContours, clampState } from './disk.js';
import { createStore } from './state.js';
import { createPreview } from './preview.js';
import { stlBuffer, downloadStl } from './export.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore();
let worker = null;
function makeWorker() {
  const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  w.onmessage = onWorkerMessage;
  w.onerror = (e) => {
    e.preventDefault?.();
    restartWorker();
  };
  w.onmessageerror = restartWorker;
  return w;
}
const TRAP = /RuntimeError|memory access|unreachable|abort/i;
function restartWorker() {
  if (worker) worker.terminate();
  worker = makeWorker();
  inflight = false;
  lastFine = null;
  if (store.get().contours.length) {
    result = { warnings: [{ level: 'rot', text: 'Berechnung abgebrochen, bitte erneut versuchen.' }], stats: null };
  }
  renderMessages();
  updateExport();
  if (pending) pump();
  else $('#busy').hidden = true;
}

function onDrag(dx, dy) {
  const s = store.get();
  const base = (v) => (Number.isFinite(v) ? v : 0);
  store.set({ offsetX: base(s.offsetX) + dx, offsetY: base(s.offsetY) + dy });
}
const preview = createPreview($('#view'), { onDrag });

let version = 0;
let seq = 0;
let inflight = false;
let pending = null;
let timers = [];
let inputMessages = [];
let result = { warnings: [], stats: null };
let lastFine = null;

const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '');

function syncInputs(state, skip) {
  for (const el of document.querySelectorAll('[data-key]')) {
    if (el === skip) continue;
    const k = el.dataset.key;
    el.value = k === 'fasenOben' ? (state.fasenOben ? '1' : '0') : String(round(state[k]));
  }
}

function renderMessages() {
  const all = [...inputMessages, ...result.warnings];
  const ul = $('#messages');
  ul.replaceChildren();
  const items = all.length ? all : [{ level: 'gruen', text: store.get().contours.length ? 'Alles in Ordnung.' : 'Noch keine Datei geladen.' }];
  for (const m of items) {
    const li = document.createElement('li');
    li.className = m.level;
    li.textContent = m.text;
    ul.append(li);
  }
  preview.setRim(all.some((m) => m.rim));
  const st = result.stats;
  $('#stats').textContent = st ? `${st.ausschnitte} Ausschnitt(e) · ${st.volumeCm3.toFixed(1)} cm³ · ca. ${st.minutes} min Druckzeit (Schätzung)` : '';
}

function updateExport() {
  $('#export').disabled = !(lastFine && !result.warnings.some((w) => w.level === 'rot') && !inputMessages.some((m) => m.level === 'rot'));
}

function request(fine) {
  pending = { fine };
  pump();
}

function pump() {
  if (inflight || !pending) return;
  const { fine } = pending;
  pending = null;
  inflight = true;
  $('#busy').hidden = false;
  worker.postMessage({ id: ++seq, version, fine, state: store.get() });
}

function onWorkerMessage(e) {
  const m = e.data;
  if (!m.ok && TRAP.test(m.error || '')) {
    restartWorker();
    return;
  }
  inflight = false;
  if (!pending) $('#busy').hidden = true;
  const current = m.version === version;
  if (!store.get().contours.length) {
    pump();
    return;
  }
  if (!m.ok) {
    if (current) {
      result = { warnings: [{ level: 'rot', text: m.error }], stats: null };
      lastFine = null;
      renderMessages();
      updateExport();
    }
  } else {
    preview.setMesh(m.positions, m.indices);
    if (m.fine && current) {
      result = { warnings: m.warnings, stats: m.stats };
      lastFine = { positions: m.positions, indices: m.indices };
      renderMessages();
      updateExport();
    }
  }
  pump();
}

function schedule() {
  version++;
  timers.forEach(clearTimeout);
  lastFine = null;
  updateExport();
  if (!store.get().contours.length) return;
  timers = [setTimeout(() => request(false), 30), setTimeout(() => request(true), 350)];
}

store.subscribe((state, meta) => {
  syncInputs(state, meta.from);
  const c = clampState(state);
  preview.setDisk(c.durchmesser, c.dicke);
  schedule();
});

document.addEventListener('input', (e) => {
  const el = e.target.closest?.('[data-key]');
  if (!el) return;
  const k = el.dataset.key;
  store.set({ [k]: k === 'fasenOben' ? el.value === '1' : parseFloat(el.value) }, { from: el });
});

$('#center').addEventListener('click', () => store.set({ offsetX: 0, offsetY: 0 }));

const DROP_TEXT = 'DXF hierher ziehen oder klicken';

// Ein fehlgeschlagenes Laden leert Modell und Dateinamen; die rote Meldung bleibt stehen.
function failLoad(messages) {
  inputMessages = messages;
  result = { warnings: [], stats: null };
  lastFine = null;
  $('#dropText').textContent = DROP_TEXT;
  store.set({ contours: [], fileName: '' });
  renderMessages();
  updateExport();
}

async function loadFile(file) {
  if (!file) return;
  inputMessages = [];
  try {
    const { polylines, ignored, unitFactor } = readDxf(await file.text());
    const built = buildContours(polylines);
    const gaps = built.gaps;
    const contours = simplifyContours(built.contours);
    if (gaps.length) {
      inputMessages = gaps.slice(0, 6).map((g) => ({ level: 'rot', text: `Kontur nicht geschlossen bei x=${g.x.toFixed(2)}, y=${g.y.toFixed(2)}.` }));
      failLoad(inputMessages);
      preview.showDraft(polylines, gaps);
      return;
    }
    if (!contours.length) throw new Error('Keine geschlossene Kontur gefunden.');
    const fit = fitContours(contours, clampState(store.get()).durchmesser);
    const skipped = Object.entries(ignored).map(([t, n]) => `${t} ×${n}`).join(', ');
    if (skipped) inputMessages.push({ level: 'gelb', text: `Ignorierte Elemente: ${skipped}.` });
    if (unitFactor !== 1) inputMessages.push({ level: 'gelb', text: `Einheiten umgerechnet (Faktor ${unitFactor} nach mm).` });
    if (fit.skalierung < 1) inputMessages.push({ level: 'gelb', text: `Motiv war zu gross und wurde auf ${(fit.skalierung * 100).toFixed(0)} % eingepasst.` });
    preview.clearDraft();
    $('#dropText').textContent = file.name;
    store.set({ contours: fit.contours, skalierung: fit.skalierung, winkel: 0, offsetX: 0, offsetY: 0, fileName: file.name.replace(/\.dxf$/i, '') });
    renderMessages();
  } catch (err) {
    preview.clearDraft();
    preview.hideMesh();
    failLoad([{ level: 'rot', text: String(err.message || err) }]);
  }
}

const drop = $('#drop');
const fileInput = $('#file');
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  fileInput.value = '';
  loadFile(f);
});
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); loadFile(e.dataTransfer.files[0]); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

$('#export').addEventListener('click', () => {
  if (!lastFine) return;
  const s = clampState(store.get());
  downloadStl(`${store.get().fileName || 'doodledisk'}-${s.durchmesser}x${s.dicke}.stl`, stlBuffer(lastFine.positions, lastFine.indices));
});

syncInputs(store.get());
{
  const c = clampState(store.get());
  preview.setDisk(c.durchmesser, c.dicke);
}
renderMessages();

worker = makeWorker();
