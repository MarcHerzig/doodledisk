import { readDxf } from './dxf.js';
import { buildContours, simplifyContours } from './contours.js';
import { fitContours, clampState } from './disk.js';
import { createStore } from './state.js';
import { createPreview } from './preview.js';
import { stlBuffer, downloadStl } from './export.js';
import { needsContours, exportName, fitLimit, rimRadius, shrinkSkalierung, readFieldValue, formatFieldValue, SET_MAX_D } from './setui.js';

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
const MAX_FAILS = 3;
let failures = 0;
function restartWorker() {
  if (worker) worker.terminate();
  worker = null;
  const inflightPart = flightPart;
  inflight = false;
  lastFine = {};
  wanted.clear();
  failures++;
  if (failures >= MAX_FAILS) {
    pending = [];
    $('#busy').hidden = true;
    result = { warnings: [{ level: 'rot', text: 'Die Berechnung kann in diesem Browser nicht gestartet werden. Bitte Seite neu laden oder einen aktuellen Browser nutzen.' }], stats: null };
    for (const p of ['schablone', 'abdeckung', 'halter']) results[p] = result;
    renderMessages();
    updateExport();
    return; // kein weiterer Worker, bis eine neue Anfrage kommt
  }
  worker = makeWorker();
  // Der Absturz gehört zu dem Teil, der gerade berechnet wurde, nicht zur Schablone.
  if (inflightPart && (!needsContours(inflightPart, modus()) || store.get().contours.length)) {
    results[inflightPart] = { warnings: [{ level: 'rot', text: 'Berechnung abgebrochen, bitte erneut versuchen.' }], stats: null };
    if (inflightPart === shownPart()) result = results[inflightPart];
  }
  renderMessages();
  updateExport();
  if (pending.length) pump();
  else $('#busy').hidden = true;
}

function onDrag(dx, dy) {
  if (shownPart() !== 'schablone') return;
  const s = store.get();
  const base = (v) => (Number.isFinite(v) ? v : 0);
  store.set({ offsetX: base(s.offsetX) + dx, offsetY: base(s.offsetY) + dy });
}
const preview = createPreview($('#view'), { onDrag });

let version = 0;
let seq = 0;
let inflight = false;
let flightPart = null; // Teil der laufenden Anfrage
let baseSkalierung = store.get().skalierung; // vom Nutzer gewählte Skalierung, unabhängig vom Einpassen
let fitNote = null;
let pending = []; // wartende Anfragen { fine, part }, höchstens eine pro (part, fine)
let timers = [];
let inputMessages = [];
const results = {}; // Meldungen und Kennzahlen der letzten aktuellen Feinberechnung pro Teil
let result = { warnings: [], stats: null }; // Anzeige für das Teil in der Vorschau
let lastFine = {}; // part -> { version, positions, indices }, wird bei jeder Zustandsänderung geleert
let previewPart = 'schablone';
const wanted = new Set(); // Teile, deren Export auf das aktuelle Feinergebnis wartet
const rotIn = (list) => list.some((w) => w.level === 'rot');
const modus = () => clampState(store.get()).modus;
const shownPart = () => (modus() === 'set' ? previewPart : 'schablone');
const hasContours = () => store.get().contours.length > 0;

function syncInputs(state, skip) {
  for (const el of document.querySelectorAll('[data-key]')) {
    if (el === skip) continue;
    const k = el.dataset.key;
    el.value = formatFieldValue(k, state[k]);
  }
}

function renderMessages() {
  const all = [...inputMessages, ...liveNotes(), ...result.warnings];
  const ul = $('#messages');
  ul.replaceChildren();
  const noFile = needsContours(shownPart(), modus()) && !hasContours();
  const items = all.length ? all : [{ level: 'gruen', text: noFile ? 'Noch keine Datei geladen.' : 'Alles in Ordnung.' }];
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

function liveNotes() {
  const notes = [];
  const s = store.get();
  if (s.modus === 'set' && s.durchmesser > SET_MAX_D) notes.push({ level: 'gelb', text: `Im Set-Modus höchstens ${SET_MAX_D} mm.` });
  if (fitNote) notes.push(fitNote);
  return notes;
}

function showPart(p) {
  previewPart = p;
  syncMode(clampState(store.get()));
  result = results[p] || { warnings: [], stats: null };
  const f = lastFine[p];
  if (f) preview.setMesh(f.positions, f.indices);
  else preview.hideMesh();
  renderMessages();
  requestPreview();
}

function schabloneOk() {
  return !rotIn(results.schablone?.warnings || []) && !rotIn(inputMessages);
}

function updateExport() {
  const set = modus() === 'set';
  $('#export').hidden = set;
  for (const el of document.querySelectorAll('.set-only')) el.hidden = !set;
  $('#export').disabled = !(lastFine.schablone && schabloneOk());
  $('[data-export="schablone"]').disabled = !(hasContours() && schabloneOk());
}

function request(fine, part = shownPart()) {
  if (!needsContours(part, modus()) || hasContours()) {
    pending = pending.filter((p) => !(p.part === part && p.fine === fine));
    pending.push({ fine, part });
  }
  pump();
}

function pump() {
  if (inflight) return;
  const next = pending.shift();
  if (!next) return;
  const { fine, part } = next;
  inflight = true;
  flightPart = part;
  $('#busy').hidden = false;
  if (!worker) {
    failures = MAX_FAILS - 1; // ein weiterer Versuch, danach greift die Obergrenze erneut
    worker = makeWorker();
  }
  worker.postMessage({ id: ++seq, version, fine, part, state: store.get() });
}

function download(part) {
  const f = lastFine[part];
  if (!f) return;
  downloadStl(exportName(part, clampState(store.get()), store.get().fileName), stlBuffer(f.positions, f.indices));
}

function onWorkerMessage(e) {
  const m = e.data;
  if (m.ok) failures = 0;
  else if (m.version === version && TRAP.test(m.error || '')) {
    restartWorker();
    return;
  }
  inflight = false;
  if (!pending.length) $('#busy').hidden = true;
  const current = m.version === version;
  const part = m.part || 'schablone';
  if (needsContours(part, modus()) && !hasContours()) {
    pump();
    return;
  }
  if (!m.ok) {
    if (current) {
      results[part] = { warnings: [{ level: 'rot', text: m.error }], stats: null };
      lastFine[part] = null;
      wanted.delete(part);
      if (part === shownPart()) result = results[part];
      renderMessages();
      updateExport();
    }
  } else {
    if (part === shownPart()) preview.setMesh(m.positions, m.indices);
    if (m.fine && current) {
      results[part] = { warnings: m.warnings, stats: m.stats };
      lastFine[part] = { version: m.version, positions: m.positions, indices: m.indices };
      if (part === shownPart()) result = results[part];
      renderMessages();
      updateExport();
      if (wanted.delete(part)) {
        if (part === 'schablone' && rotIn(m.warnings)) {
          if (shownPart() !== 'schablone') showPart('schablone'); // rote Meldung sichtbar machen
        } else download(part);
      }
    }
  }
  pump();
}

function requestPreview() {
  timers.forEach(clearTimeout);
  const part = shownPart();
  if (needsContours(part, modus()) && !hasContours()) return;
  timers = [setTimeout(() => request(false, part), 30), setTimeout(() => request(true, part), 350)];
}

function schedule() {
  version++;
  pending = [];
  lastFine = {};
  wanted.clear();
  updateExport();
  requestPreview();
}

let fitKey = '';
let lastModus = null;
store.subscribe((state, meta) => {
  syncInputs(state, meta.from);
  const c = clampState(state);
  // Moduswechsel oder anderer Durchmesser: wirksame Skalierung aus der Nutzer-Skalierung neu ableiten
  // (nur verkleinern, nie über den Wert des Nutzers; Zwischenwerte beim Tippen zerstören nichts).
  const key = `${c.modus}|${c.durchmesser}`;
  if (key !== fitKey) {
    fitKey = key;
    const sk = shrinkSkalierung(state.contours, baseSkalierung, fitLimit(c));
    fitNote = sk < baseSkalierung - 1e-9 ? { level: 'gelb', text: 'Motiv wurde auf den Bildradius verkleinert.' } : null;
    if (sk !== state.skalierung) {
      store.set({ skalierung: sk });
      return;
    }
  }
  if (c.modus !== lastModus) {
    lastModus = c.modus;
    result = results[shownPart()] || { warnings: [], stats: null };
    preview.hideMesh();
  }
  const dEl = $('[data-key="durchmesser"]');
  dEl.max = c.modus === 'set' ? SET_MAX_D : 250;
  syncMode(c);
  preview.setDisk(c.durchmesser, c.dicke, rimRadius(c));
  schedule();
  renderMessages();
});

function syncMode(c) {
  for (const r of document.querySelectorAll('input[name="modus"]')) r.checked = r.value === c.modus;
  for (const b of document.querySelectorAll('[data-part]')) b.setAttribute('aria-pressed', String(b.dataset.part === shownPart()));
}

for (const r of document.querySelectorAll('input[name="modus"]')) {
  r.addEventListener('change', () => r.checked && store.set({ modus: r.value }));
}
for (const b of document.querySelectorAll('[data-part]')) b.addEventListener('click', () => showPart(b.dataset.part));

document.addEventListener('input', (e) => {
  const el = e.target.closest?.('[data-key]');
  if (!el) return;
  const k = el.dataset.key;
  const v = readFieldValue(k, el.value);
  if (k === 'skalierung' && Number.isFinite(v)) baseSkalierung = v;
  store.set({ [k]: v }, { from: el });
});

// Nach dem Tippen das geklemmte Feld zeigen (z. B. Durchmesser über dem Set-Maximum).
document.addEventListener('change', (e) => {
  const el = e.target.closest?.('[data-key]');
  if (el) el.value = formatFieldValue(el.dataset.key, clampState(store.get())[el.dataset.key]);
});

$('#center').addEventListener('click', () => store.set({ offsetX: 0, offsetY: 0 }));

const DROP_TEXT = 'DXF hierher ziehen oder klicken';

// Ein fehlgeschlagenes Laden leert Modell und Dateinamen; die rote Meldung bleibt stehen.
function failLoad(messages) {
  inputMessages = messages;
  result = { warnings: [], stats: null };
  results.schablone = result;
  lastFine = {};
  wanted.clear();
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
    const c0 = clampState(store.get());
    const fit = fitContours(contours, c0.durchmesser, fitLimit(c0));
    const skipped = Object.entries(ignored).map(([t, n]) => `${t} ×${n}`).join(', ');
    if (skipped) inputMessages.push({ level: 'gelb', text: `Ignorierte Elemente: ${skipped}.` });
    if (unitFactor !== 1) inputMessages.push({ level: 'gelb', text: `Einheiten umgerechnet (Faktor ${unitFactor} nach mm).` });
    if (fit.skalierung < 1) inputMessages.push({ level: 'gelb', text: `Motiv war zu gross und wurde auf ${(fit.skalierung * 100).toFixed(0)} % eingepasst.` });
    preview.clearDraft();
    $('#dropText').textContent = file.name;
    baseSkalierung = fit.skalierung;
    fitNote = null;
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

$('#export').addEventListener('click', () => download('schablone'));
for (const b of document.querySelectorAll('[data-export]')) {
  b.addEventListener('click', () => {
    const part = b.dataset.export;
    if (part === 'schablone' && !(hasContours() && schabloneOk())) return;
    if (lastFine[part]) {
      download(part);
    } else {
      wanted.add(part);
      request(true, part);
    }
  });
}

syncInputs(store.get());
{
  const c = clampState(store.get());
  fitKey = `${c.modus}|${c.durchmesser}`;
  lastModus = c.modus;
  $('[data-key="durchmesser"]').max = c.modus === 'set' ? SET_MAX_D : 250;
  preview.setDisk(c.durchmesser, c.dicke, rimRadius(c));
  syncMode(c);
}
updateExport();
renderMessages();
if (modus() === 'set') requestPreview();

worker = makeWorker();
