import { env, AutoFeatureExtractor, AutoModelForCTC } from "../vendor/transformers.min.js";
import { phonemize } from "../vendor/phonemizer.js";
import * as A from "./align.js";
import { PACKS } from "./packs.js";

const LOCAL_ID = new URLSearchParams(location.search).get("local");
const MODEL_ID = LOCAL_ID || "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
const VOCAB_URL = LOCAL_ID
  ? new URL(`../models/${LOCAL_ID}/vocab.json`, import.meta.url).href
  : `https://huggingface.co/${MODEL_ID}/resolve/main/vocab.json`;
const MODES = {
  fast: { dtype: "q8", device: "wasm", label: "Rápido · 318 MB (CPU)" },
  precise: { dtype: "fp32", device: "wasm", label: "Preciso · 1,26 GB (CPU)" },
  gpu: { dtype: "fp16", device: "webgpu", label: "GPU · 632 MB (WebGPU, experimental)" },
};

env.allowLocalModels = false;
// Runtime de ONNX servido desde esta misma carpeta (evita problemas de CDN y permite multihilo).
env.backends.onnx.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
// Modo de prueba local (solo para desarrollo): ?local=<carpeta> usa un modelo en ./models/
if (LOCAL_ID) { env.allowLocalModels = true; env.allowRemoteModels = false; env.localModelPath = new URL("../models/", import.meta.url).href; }
try {
  if (self.crossOriginIsolated) env.backends.onnx.wasm.numThreads = Math.min(8, navigator.hardwareConcurrency || 4);
} catch {}

const $ = (s) => document.querySelector(s);
const state = {
  fe: null, model: null, id2tok: null, modeKey: null,
  pack: null, idx: 0, results: {}, // itemId -> {attempts:[result...]}
  recording: false, recorder: null, chunks: [], timer: null, lastBlobUrl: null,
};

// ---------- utilidades ----------
function setStatus(msg, kind = "") {
  const el = $("#status");
  el.textContent = msg;
  el.className = "status " + kind;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pct(x) { return Math.round(x * 100) + "%"; }
function halfToFloat(h) {
  const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1f) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

// ---------- modelo ----------
async function loadModel() {
  const key = $("#mode").value;
  const mode = MODES[key];
  if (state.model && state.modeKey === key) return;
  if (mode.device === "webgpu" && !navigator.gpu) {
    setStatus("Tu navegador no tiene WebGPU. Usa el modo Rápido.", "warn");
    return;
  }
  $("#load").disabled = true;
  const files = {};
  const progress = (p) => {
    if (p.status === "progress" && p.total) {
      files[p.file] = [p.loaded, p.total];
      const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
      setStatus(`Descargando modelo… ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB (solo la primera vez)`);
    }
  };
  try {
    setStatus("Cargando vocabulario…");
    const vocab = await (await fetch(VOCAB_URL)).json();
    state.id2tok = [];
    for (const [tok, id] of Object.entries(vocab)) state.id2tok[id] = tok;
    setStatus("Cargando extractor de audio…");
    state.fe = await AutoFeatureExtractor.from_pretrained(MODEL_ID);
    state.model = await AutoModelForCTC.from_pretrained(MODEL_ID, {
      dtype: mode.dtype, device: mode.device, progress_callback: progress,
    });
    state.modeKey = key;
    setStatus(`Modelo listo · ${mode.label}${self.crossOriginIsolated ? " · multihilo" : ""}`, "ok");
    $("#rec").disabled = false;
    $("#upload-label").classList.remove("disabled");
  } catch (err) {
    console.error(err);
    setStatus("No se pudo cargar el modelo: " + (err?.message || err) + ". Revisa la conexión o prueba otro modo.", "err");
  } finally {
    $("#load").disabled = false;
  }
}

async function recognize(audio16k) {
  const inputs = await state.fe(audio16k);
  const out = await state.model(inputs);
  const logits = out.logits;
  const [, T, V] = logits.dims;
  let data = logits.data;
  if (logits.type === "float16" && data instanceof Uint16Array) data = Float32Array.from(data, halfToFloat);
  const ids = new Int32Array(T), probs = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    let best = 0, max = -Infinity;
    const off = t * V;
    for (let v = 0; v < V; v++) { const x = data[off + v]; if (x > max) { max = x; best = v; } }
    let sum = 0;
    for (let v = 0; v < V; v++) sum += Math.exp(data[off + v] - max);
    ids[t] = best; probs[t] = 1 / sum;
  }
  return A.ctcGreedy(ids, probs, state.id2tok);
}

// ---------- audio ----------
async function toMono16k(arrayBuffer) {
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(arrayBuffer);
  ctx.close();
  const len = Math.ceil(buf.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    setStatus("No hay acceso al micrófono: " + err.message, "err");
    return;
  }
  state.chunks = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(state.chunks, { type: rec.mimeType });
    await analyzeBlob(blob);
  };
  rec.start();
  state.recorder = rec; state.recording = true;
  const item = currentItem();
  const maxS = item.type === "word" ? 4 : 10;
  let left = maxS;
  $("#rec").textContent = `■ Detener (${left}s)`;
  $("#rec").classList.add("live");
  state.timer = setInterval(() => {
    left--;
    $("#rec").textContent = `■ Detener (${left}s)`;
    if (left <= 0) stopRecording();
  }, 1000);
}
function stopRecording() {
  if (!state.recording) return;
  clearInterval(state.timer);
  state.recording = false;
  $("#rec").textContent = "● Grabar";
  $("#rec").classList.remove("live");
  state.recorder.stop();
}

async function analyzeBlob(blob) {
  if (!state.model) { setStatus("Primero carga el modelo.", "warn"); return; }
  const item = currentItem();
  try {
    setStatus("Analizando…");
    if (state.lastBlobUrl) URL.revokeObjectURL(state.lastBlobUrl);
    state.lastBlobUrl = URL.createObjectURL(blob);
    const audio = await toMono16k(await blob.arrayBuffer());
    const seconds = audio.length / 16000;
    const t0 = performance.now();
    const heard = await recognize(audio);
    const ms = performance.now() - t0;
    const expected = await expectedFor(item);
    const ops = A.align(expected.seq, heard);
    const sc = A.score(ops, expected.words);
    const lowConf = heard.filter((h) => h.prob < 0.5).map((h) => h.p);
    const result = {
      at: new Date().toISOString(), seconds: +seconds.toFixed(1), ms: Math.round(ms),
      expected: expected.seq.map((x) => x.p).join(" "), heard: heard.map((h) => h.p).join(" "),
      accuracy: sc.accuracy, ok: sc.ok, near: sc.near, n: sc.expectedCount, insertions: sc.insertions,
      errors: sc.errors.map((e) => ({ type: e.type, exp: e.exp, got: e.got, word: e.word, hint: e.hint })),
      perWord: sc.perWord, lowConfidence: lowConf, audioUrl: state.lastBlobUrl,
    };
    if (!heard.length) result.empty = true;
    (state.results[item.id] ??= { attempts: [] }).attempts.push(result);
    renderResult(item, result);
    renderSummary();
    setStatus(`Listo · ${seconds.toFixed(1)} s de audio analizados en ${(ms / 1000).toFixed(1)} s`, "ok");
  } catch (err) {
    console.error(err);
    setStatus("Error al analizar: " + (err?.message || err), "err");
  }
}

// ---------- fonemas esperados ----------
const expectedCache = new Map();
async function expectedFor(item) {
  const key = item.text + "|" + (item.ipa || "");
  if (expectedCache.has(key)) return expectedCache.get(key);
  const words = A.splitTextWords(item.text);
  let pw;
  if (item.ipa) pw = item.ipa.trim().split(/\s+/);
  else pw = (await phonemize(item.text, "en-us")).join(" ").split(/\s+/).filter(Boolean);
  if (pw.length !== words.length) {
    pw = [];
    for (const w of words) pw.push((await phonemize(w, "en-us")).join(""));
  }
  const res = A.buildExpected(pw, words);
  expectedCache.set(key, res);
  return res;
}

// ---------- TTS ----------
function speak(text) {
  if (!("speechSynthesis" in window)) { setStatus("Tu navegador no tiene síntesis de voz.", "warn"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices().filter((v) => v.lang?.startsWith("en-US"));
  const pref = voices.find((v) => /natural|google|samantha|aria|jenny|guy/i.test(v.name)) || voices[0];
  if (pref) u.voice = pref;
  u.lang = "en-US"; u.rate = Number($("#rate").value);
  speechSynthesis.speak(u);
}

// ---------- UI ----------
function currentItem() { return state.pack.items[state.idx]; }

function fillPackSelect() {
  const sel = $("#pack");
  sel.innerHTML = PACKS.map((p, i) => `<option value="${i}">${esc(p.title)}</option>`).join("") +
    `<option value="free">Práctica libre (escribe tu frase)</option>`;
}

function selectPack(pack) {
  state.pack = pack; state.idx = 0;
  $("#pack-desc").textContent = pack.description || "";
  renderItem();
  renderSummary();
}

async function renderItem() {
  const item = currentItem();
  $("#counter").textContent = `${state.idx + 1} / ${state.pack.items.length}`;
  $("#type").textContent = item.type === "word" ? "Palabra" : "Frase";
  $("#focus").textContent = item.focus ? "Foco: " + item.focus : "";
  $("#text").textContent = item.text;
  $("#ipa").textContent = "";
  try {
    const exp = await expectedFor(item);
    $("#ipa").textContent = "/" + exp.seq.map((x) => x.p).join(" ") + "/";
  } catch (e) { $("#ipa").textContent = "(no se pudo generar el IPA)"; }
  $("#prev").disabled = state.idx === 0;
  $("#next").disabled = state.idx >= state.pack.items.length - 1;
  const r = state.results[item.id]?.attempts.at(-1);
  if (r) renderResult(item, r); else $("#result").innerHTML = `<p class="muted">Escucha el modelo si quieres, luego pulsa <b>Grabar</b> y lee el texto en voz alta.</p>`;
}

function renderResult(item, r) {
  const attempts = state.results[item.id]?.attempts.length || 1;
  if (r.empty) {
    $("#result").innerHTML = `<p class="err">No se reconoció ningún sonido. Revisa el micrófono y habla más cerca.</p>`;
    return;
  }
  const words = r.perWord.map((w) => `<span class="w ${w.ok ? "good" : "bad"}" title="esperado /${esc(w.exp)}/ · oído /${esc(w.got)}/">${esc(w.word)}</span>`).join(" ");
  const rows = r.perWord.map((w) => `<tr class="${w.ok ? "" : "badrow"}"><td>${esc(w.word)}</td><td>/${esc(w.exp)}/</td><td>/${esc(w.got)}/</td></tr>`).join("");
  const MAX = 10;
  const noisy = r.insertions > r.n;
  const shown = r.errors.slice(0, MAX);
  const hints = r.errors.length
    ? `<ul class="hints">${shown.map((e) => `<li><b>${esc(e.word)}</b> · <code>${esc(A.confusionKey(e))}</code> — ${esc(e.hint)}</li>`).join("")}</ul>` +
      (r.errors.length > MAX ? `<p class="muted small">… y ${r.errors.length - MAX} más (todos aparecen en el reporte).</p>` : "")
    : `<p class="good">Sin errores detectados.</p>`;
  const warn = noisy
    ? `<p class="err">Se oyeron muchos más sonidos de los esperados. ¿Leíste el texto correcto, hay ruido de fondo o la grabación incluye otras voces? Repite el intento.</p>`
    : "";
  const cls = r.accuracy >= 0.9 ? "good" : r.accuracy >= 0.7 ? "mid" : "bad";
  $("#result").innerHTML = `
    <div class="scoreline"><span class="score ${cls}">${pct(r.accuracy)}</span>
      <span class="muted">fonemas correctos: ${r.ok + r.near} de ${r.n}${r.insertions ? ` · sobrantes: ${r.insertions}` : ""} · intento ${attempts}</span></div>
    <p class="words">${words}</p>
    ${warn}${hints}
    <details><summary>Detalle por palabra</summary>
      <table class="detail"><thead><tr><th>Palabra</th><th>Esperado</th><th>Oído</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted small">Oído completo: /${esc(r.heard)}/${r.lowConfidence.length ? ` · baja confianza del modelo en: ${esc(r.lowConfidence.join(" "))}` : ""}</p>
    </details>
    <audio controls src="${r.audioUrl}"></audio>`;
}

function lastResults() {
  return state.pack.items.map((it) => ({ it, r: state.results[it.id]?.attempts.at(-1) })).filter((x) => x.r && !x.r.empty);
}

function confusions(list) {
  const c = {};
  for (const { r } of list) for (const e of r.errors) {
    const k = A.confusionKey(e);
    c[k] ??= { n: 0, words: new Set() };
    c[k].n++; c[k].words.add(e.word);
  }
  return Object.entries(c).sort((a, b) => b[1].n - a[1].n);
}

function renderSummary() {
  const list = lastResults();
  if (!list.length) { $("#summary").innerHTML = `<p class="muted">Aún no hay intentos.</p>`; return; }
  const n = list.reduce((a, { r }) => a + r.n + r.insertions, 0);
  const good = list.reduce((a, { r }) => a + r.ok + r.near, 0);
  const conf = confusions(list).slice(0, 8);
  $("#summary").innerHTML = `
    <p><b>${list.length}</b> de ${state.pack.items.length} ítems hechos · precisión global <b>${pct(good / n)}</b></p>
    ${conf.length ? `<p class="muted small">Errores más repetidos:</p><ul class="conf">${conf.map(([k, v]) => `<li><code>${esc(k)}</code> ×${v.n} <span class="muted">(${esc([...v.words].join(", "))})</span></li>`).join("")}</ul>` : ""}`;
}

function buildReport() {
  const list = lastResults();
  const n = list.reduce((a, { r }) => a + r.n + r.insertions, 0);
  const good = list.reduce((a, { r }) => a + r.ok + r.near, 0);
  const mode = MODES[state.modeKey];
  const lines = [];
  lines.push(`PRONUNCIATION LAB REPORT`);
  lines.push(`Pack: ${state.pack.title} | Fecha: ${new Date().toLocaleString()} | Modelo: ${MODEL_ID} (${mode?.dtype}/${mode?.device})`);
  lines.push(`Ítems: ${list.length}/${state.pack.items.length} | Precisión global: ${n ? pct(good / n) : "-"}`);
  lines.push(`Top confusiones: ${confusions(list).slice(0, 10).map(([k, v]) => `${k} ×${v.n}`).join("; ") || "ninguna"}`);
  lines.push("");
  for (const { it, r } of list) {
    const att = state.results[it.id].attempts.length;
    lines.push(`[${it.id}] ${it.type} "${it.text}"${it.focus ? ` (foco ${it.focus})` : ""} | ${pct(r.accuracy)} | intentos ${att} | ${r.seconds}s`);
    lines.push(`  esperado: ${r.expected}`);
    lines.push(`  oído:     ${r.heard}`);
    if (r.errors.length) lines.push(`  errores:  ${r.errors.map((e) => `${e.word}: ${A.confusionKey(e)}`).join("; ")}`);
  }
  return lines.join("\n");
}

async function copyReport() {
  const text = buildReport();
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Reporte copiado. Pégalo en el chat con Claude.", "ok");
  } catch {
    $("#report-box").value = text;
    $("#report-box").hidden = false;
    $("#report-box").select();
    setStatus("No pude copiar automáticamente: selecciona el texto del cuadro y cópialo.", "warn");
  }
}

function downloadJson() {
  const data = {
    app: "pronunciation-lab", model: MODEL_ID, mode: state.modeKey, pack: state.pack.id || "custom",
    exportedAt: new Date().toISOString(),
    items: state.pack.items.map((it) => ({ ...it, attempts: (state.results[it.id]?.attempts || []).map(({ audioUrl, ...rest }) => rest) })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pronunciacion_${data.pack}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

// ---------- eventos ----------
function wire() {
  fillPackSelect();
  $("#pack").addEventListener("change", (e) => {
    const v = e.target.value;
    $("#free").hidden = v !== "free";
    if (v !== "free") selectPack(PACKS[Number(v)]);
  });
  $("#free-go").addEventListener("click", () => {
    const lines = $("#free-text").value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    selectPack({
      id: "libre", title: "Práctica libre", description: "Frases escritas por ti.",
      items: lines.map((t, i) => ({ id: `l${i + 1}`, type: t.includes(" ") ? "sentence" : "word", text: t })),
    });
  });
  $("#pack-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const pack = JSON.parse(await f.text());
      if (!Array.isArray(pack.items) || !pack.items.length) throw new Error("el archivo no tiene 'items'");
      pack.items.forEach((it, i) => { it.id ??= `i${i + 1}`; it.type ??= it.text.includes(" ") ? "sentence" : "word"; });
      PACKS.push(pack);
      fillPackSelect();
      $("#pack").value = String(PACKS.length - 1);
      $("#free").hidden = true;
      selectPack(pack);
      setStatus(`Paquete "${pack.title}" cargado.`, "ok");
    } catch (err) { setStatus("Paquete inválido: " + err.message, "err"); }
    e.target.value = "";
  });
  $("#load").addEventListener("click", loadModel);
  $("#listen").addEventListener("click", () => speak(currentItem().text));
  $("#rec").addEventListener("click", () => (state.recording ? stopRecording() : startRecording()));
  $("#audio-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (f) await analyzeBlob(f);
    e.target.value = "";
  });
  $("#prev").addEventListener("click", () => { if (state.idx > 0) { state.idx--; renderItem(); } });
  $("#next").addEventListener("click", () => { if (state.idx < state.pack.items.length - 1) { state.idx++; renderItem(); } });
  $("#copy").addEventListener("click", copyReport);
  $("#json").addEventListener("click", downloadJson);
  $("#ipa-toggle").addEventListener("change", (e) => { $("#ipa").hidden = !e.target.checked; });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("textarea, input, select")) return;
    if (e.key === "r" || e.key === "R") $("#rec").disabled || $("#rec").click();
    if (e.key === "ArrowRight") $("#next").click();
    if (e.key === "ArrowLeft") $("#prev").click();
    if (e.key === "l" || e.key === "L") $("#listen").click();
  });
  if (location.protocol === "file:") setStatus("Abriste el archivo directamente. Para que el modelo quede guardado y el micrófono funcione bien, usa iniciar.bat / iniciar.command (ver LEEME).", "warn");
  else if (!navigator.gpu) $("#mode").querySelector('[value="gpu"]').disabled = true;
  selectPack(PACKS[0]);
}

wire();
