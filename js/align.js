// Pronunciation Lab — lógica de comparación de fonemas (sin dependencias).
// Funciona en el navegador y en Node (para pruebas).

// Fonemas de espeak en-us (incluye combinaciones que espeak emite como una sola unidad).
const EN_INVENTORY = [
  "aɪɚ", "aɪə", "ɑːɹ", "ɔːɹ", "oːɹ",
  "tʃ", "dʒ", "iː", "uː", "ɑː", "ɔː", "ɜː", "oː", "eɪ", "aɪ", "ɔɪ", "aʊ", "oʊ", "əʊ",
  "ɪɹ", "ɛɹ", "ʊɹ", "əl", "iə", "n̩", "l̩",
  "p", "b", "t", "d", "k", "ɡ", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "x",
  "m", "n", "ŋ", "l", "ɹ", "r", "j", "w", "ɾ", "ʔ",
  "ɪ", "ɛ", "æ", "ʌ", "ʊ", "ə", "ɐ", "ᵻ", "i", "u", "ɑ", "ɔ", "o", "e", "a", "ɜ", "ɚ", "ɒ",
];

// Combinaciones que se separan en sus partes para comparar siempre al mismo nivel.
const SPLIT = {
  "aɪɚ": ["aɪ", "ɚ"], "aɪə": ["aɪ", "ə"], "ɑːɹ": ["ɑː", "ɹ"], "ɔːɹ": ["ɔː", "ɹ"], "oːɹ": ["oː", "ɹ"],
  "ɪɹ": ["ɪ", "ɹ"], "ɛɹ": ["ɛ", "ɹ"], "ʊɹ": ["ʊ", "ɹ"], "əl": ["ə", "l"], "iə": ["i", "ə"],
  "ts": ["t", "s"], "n̩": ["n"], "l̩": ["l"], "ɫ": ["l"], "g": ["ɡ"], "əʊ": ["oʊ"],
};

// Pares que se consideran variantes aceptables (no errores): reducciones, flap americano, etc.
const NEAR_PAIRS = [
  ["ə", "ɐ"], ["ə", "ᵻ"], ["ɪ", "ᵻ"], ["ɐ", "ʌ"], ["ɾ", "t"], ["ɾ", "d"], ["i", "iː"],
  ["ɔ", "ɑː"], ["ɔ", "ɑ"], ["ɑ", "ɑː"], ["ɔ", "ɔː"], ["ɚ", "ɜː"], ["ɚ", "ɜ"], ["ɜ", "ɜː"],
  ["oʊ", "o"], ["oː", "oʊ"], ["oː", "ɔː"], ["u", "uː"], ["ʔ", "t"], ["ə", "ʌ"],
];
// Variantes aceptables solo en una dirección: [esperado, oído].
// i final átona (happy) dicha /ɪ/; formas fuertes de palabras funcionales (to, and, the).
const NEAR_ONE_WAY = [["i", "ɪ"], ["ə", "uː"], ["ə", "u"], ["ə", "æ"], ["ə", "i"], ["ə", "ɪ"]];
const NEAR = new Set([
  ...NEAR_PAIRS.flatMap(([a, b]) => [a + "|" + b, b + "|" + a]),
  ...NEAR_ONE_WAY.map(([a, b]) => a + "|" + b),
]);
const SCHWAS = new Set(["ə", "ɐ", "ᵻ"]);

// Pistas en español para las confusiones típicas de hispanohablantes. Clave: "esperado>oído".
const HINTS = {
  "ɪ>iː": "Vocal corta /ɪ/ dicha larga como /iː/ (ship → sheep). Relaja la boca, más corta.",
  "ɪ>i": "Vocal corta /ɪ/ dicha como la i española. Relaja la boca, más corta.",
  "iː>ɪ": "Vocal larga /iː/ dicha corta (sheep → ship). Estira los labios y alárgala.",
  "ʊ>uː": "Vocal corta /ʊ/ dicha larga (full → fool).",
  "ʊ>u": "Vocal corta /ʊ/ dicha como la u española. Más relajada y corta.",
  "uː>ʊ": "Vocal larga /uː/ dicha corta (fool → full).",
  "æ>a": "/æ/ dicha como la a española. Abre más la boca hacia una e (cat).",
  "æ>ɛ": "/æ/ dicha como /ɛ/ (bad → bed). Abre más la mandíbula.",
  "æ>ʌ": "/æ/ dicha como /ʌ/ (cat → cut).",
  "ʌ>a": "/ʌ/ dicha como la a española. Más corta y central (cut).",
  "ʌ>ɑː": "/ʌ/ dicha como /ɑː/ (cut → cot).",
  "ʌ>æ": "/ʌ/ dicha como /æ/ (cut → cat).",
  "ɑː>a": "/ɑː/ dicha como la a española. Más atrás y abierta (job).",
  "eɪ>e": "Diptongo /eɪ/ dicho como e simple. Termina deslizando hacia i (day).",
  "oʊ>o": "Diptongo /oʊ/ dicho como o simple. Termina deslizando hacia u (go).",
  "v>b": "/v/ dicha como /b/. Apoya los dientes de arriba en el labio inferior y deja vibrar.",
  "b>v": "/b/ dicha como /v/. Cierra los dos labios.",
  "v>β": "/v/ dicha como la b suave del español. Dientes superiores sobre el labio inferior.",
  "b>β": "/b/ suavizada como en español. Cierra completamente los labios.",
  "θ>t": "/θ/ dicha como /t/ (think → tink). Lengua entre los dientes y sopla.",
  "θ>s": "/θ/ dicha como /s/ (think → sink). Lengua entre los dientes.",
  "θ>f": "/θ/ dicha como /f/. Lengua entre los dientes, no el labio.",
  "ð>d": "/ð/ dicha como /d/ (this → dis). Lengua entre los dientes y vibra.",
  "ð>β": "/ð/ suavizada. Lengua entre los dientes y vibra.",
  "z>s": "Falta vibración en /z/ (zoo, easy, is). Debe zumbar como una abeja.",
  "ʃ>tʃ": "/ʃ/ dicha como /tʃ/ (share → chair). Sonido continuo, sin golpe inicial.",
  "tʃ>ʃ": "/tʃ/ dicha como /ʃ/ (chair → share). Empieza con un golpe de t.",
  "dʒ>j": "/dʒ/ dicha como /j/ (jet → yet). Empieza con un golpe de d.",
  "dʒ>ʝ": "/dʒ/ dicha como la y española. Empieza con un golpe de d.",
  "j>dʒ": "/j/ dicha como /dʒ/ (yet → jet). Sin golpe, más suave.",
  "j>ʝ": "/j/ dicha como la y rioplatense/fuerte. Más suave, como una i rápida.",
  "h>x": "/h/ dicha como la j española. Solo aire, sin raspar la garganta.",
  "ɹ>r": "r española (vibrante) en vez de /ɹ/ inglesa. No toques el paladar; curva la lengua.",
  "ɹ>ɾ": "r española (tap) en vez de /ɹ/ inglesa. No toques el paladar; curva la lengua.",
  "ŋ>n": "/ŋ/ final dicha como /n/ (sing → sin). Cierra con la parte de atrás de la lengua.",
  "ŋ>ŋɡ": "Se agregó una g después de /ŋ/.",
  "ʒ>ʃ": "Falta vibración en /ʒ/ (usual, vision).",
  "s>z": "/s/ dicha sonora como /z/.",
};

export function cleanIpa(s) {
  return s.normalize("NFC").replace(/[ˈˌ.,;:!?¡¿"“”()\[\]]/g, "").replace(/g/g, "ɡ").trim();
}

/** Divide un string IPA en fonemas con el inventario de espeak (búsqueda del más largo). */
export function tokenizeWord(word, inventory = EN_INVENTORY) {
  const inv = [...inventory].sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  while (i < word.length) {
    const hit = inv.find((t) => word.startsWith(t, i));
    if (hit) { out.push(hit); i += hit.length; }
    else {
      // carácter desconocido: lo dejamos solo (más su diacrítico si lo tiene)
      let ch = word[i]; i++;
      while (i < word.length && /[̀-ͯʰ-˿]/.test(word[i])) { ch += word[i]; i++; }
      out.push(ch);
    }
  }
  return out;
}

export function canonical(tokens) {
  return tokens.flatMap((t) => SPLIT[t] ?? [t]);
}

/**
 * Convierte la salida del phonemizer en fonemas esperados con índice de palabra.
 * phonemeWords: array de strings IPA (una por palabra), textWords: palabras originales.
 */
export function buildExpected(phonemeWords, textWords) {
  const seq = [];
  phonemeWords.forEach((pw, wi) => {
    canonical(tokenizeWord(cleanIpa(pw))).forEach((p) => seq.push({ p, w: wi }));
  });
  return { seq, words: textWords };
}

export function splitTextWords(text) {
  return text.replace(/[^\p{L}\p{N}'’\s-]/gu, " ").split(/\s+/).filter(Boolean);
}

/** Decodificación CTC voraz: ids por frame → fonemas (colapsa repetidos, quita especiales). */
export function ctcGreedy(frameIds, frameProbs, id2tok, specialIds = new Set([0, 1, 2, 3])) {
  const out = [];
  let prev = -1;
  for (let t = 0; t < frameIds.length; t++) {
    const id = frameIds[t];
    if (id !== prev && !specialIds.has(id)) {
      out.push({ tok: id2tok[id], prob: frameProbs ? frameProbs[t] : 1 });
    } else if (id === prev && out.length && !specialIds.has(id) && frameProbs) {
      const last = out[out.length - 1];
      last.prob = Math.max(last.prob, frameProbs[t]);
    }
    prev = id;
  }
  // separar combinaciones a nivel canónico conservando la probabilidad
  return out.flatMap((o) => canonical([o.tok]).map((p) => ({ p, prob: o.prob })));
}

function subCost(a, b) {
  if (a === b) return 0;
  if (NEAR.has(a + "|" + b)) return 0.3;
  return 1;
}
const gapCost = (p) => (SCHWAS.has(p) ? 0.5 : 1);

/** Alineación tipo Levenshtein con costos fonéticos. expected: [{p,w}], heard: [{p,prob}] */
export function align(expected, heard) {
  const n = expected.length, m = heard.length;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 up(del), 3 left(ins)
  for (let i = 1; i <= n; i++) { D[i][0] = D[i - 1][0] + gapCost(expected[i - 1].p); B[i][0] = 2; }
  for (let j = 1; j <= m; j++) { D[0][j] = D[0][j - 1] + gapCost(heard[j - 1].p); B[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = D[i - 1][j - 1] + subCost(expected[i - 1].p, heard[j - 1].p);
      const u = D[i - 1][j] + gapCost(expected[i - 1].p);
      const l = D[i][j - 1] + gapCost(heard[j - 1].p);
      if (d <= u && d <= l) { D[i][j] = d; B[i][j] = 1; }
      else if (u <= l) { D[i][j] = u; B[i][j] = 2; }
      else { D[i][j] = l; B[i][j] = 3; }
    }
  }
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = B[i][j];
    if (i > 0 && j > 0 && b === 1) {
      const e = expected[i - 1], h = heard[j - 1];
      const type = e.p === h.p ? "ok" : NEAR.has(e.p + "|" + h.p) ? "near" : "sub";
      ops.push({ type, exp: e.p, got: h.p, w: e.w, prob: h.prob });
      i--; j--;
    } else if (i > 0 && (j === 0 || b === 2)) {
      const e = expected[i - 1];
      ops.push({ type: SCHWAS.has(e.p) ? "del-minor" : "del", exp: e.p, got: null, w: e.w });
      i--;
    } else {
      const h = heard[j - 1];
      ops.push({ type: SCHWAS.has(h.p) ? "ins-minor" : "ins", exp: null, got: h.p, w: null, prob: h.prob });
      j--;
    }
  }
  ops.reverse();
  // asignar palabra a las inserciones (la del fonema esperado anterior, o el siguiente)
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].w === null) {
      let w = null;
      for (let a = k - 1; a >= 0 && w === null; a--) if (ops[a].w !== null) w = ops[a].w;
      for (let a = k + 1; a < ops.length && w === null; a++) if (ops[a].w !== null) w = ops[a].w;
      ops[k].w = w ?? 0;
    }
  }
  return ops;
}

export function hintFor(op, ops, idx) {
  if (op.type === "sub") return HINTS[`${op.exp}>${op.got}`] ?? `/${op.exp}/ sonó como /${op.got}/.`;
  if (op.type === "del") {
    const isFinal = !ops.slice(idx + 1).some((o) => o.w === op.w && o.exp);
    return isFinal ? `No se oyó la consonante final /${op.exp}/.` : `No se oyó /${op.exp}/.`;
  }
  if (op.type === "ins") {
    const isFirstOfWord = !ops.slice(0, idx).some((o) => o.w === op.w);
    const next = ops.slice(idx + 1).find((o) => o.exp);
    if (isFirstOfWord && ["e", "ɛ", "ə", "ɪ", "i"].includes(op.got) && next?.exp === "s")
      return "Se agregó una e antes de s + consonante (\"espeak\"). Empieza directo con la s.";
    return `Sonido sobrante /${op.got}/.`;
  }
  return "";
}

/** Resume una alineación en métricas y errores legibles. */
export function score(ops, words) {
  const expectedCount = ops.filter((o) => o.exp).length;
  const ok = ops.filter((o) => o.type === "ok").length;
  const near = ops.filter((o) => o.type === "near").length;
  const errors = [];
  ops.forEach((o, idx) => {
    if (o.type === "sub" || o.type === "del" || o.type === "ins")
      errors.push({ ...o, word: words[o.w] ?? "", hint: hintFor(o, ops, idx) });
  });
  const insertions = ops.filter((o) => o.type === "ins").length;
  const accuracy = expectedCount ? (ok + near) / (expectedCount + insertions) : 0;
  const perWord = words.map((w, wi) => {
    const wo = ops.filter((o) => o.w === wi);
    const exp = wo.filter((o) => o.exp).map((o) => o.exp);
    const got = wo.filter((o) => o.got).map((o) => o.got);
    const bad = wo.some((o) => o.type === "sub" || o.type === "del" || o.type === "ins");
    return { word: w, exp: exp.join(" "), got: got.join(" "), ok: !bad };
  });
  return { expectedCount, ok, near, insertions, accuracy, errors, perWord };
}

export function confusionKey(e) {
  if (e.type === "sub") return `${e.exp} → ${e.got}`;
  if (e.type === "del") return `${e.exp} → (omitido)`;
  return `(sobrante) → ${e.got}`;
}
