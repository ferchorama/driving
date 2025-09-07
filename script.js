// script.js — Lógica del juego con extracción dinámica para el Código Nacional de Tránsito
// - Se mantiene la interfaz y el resto de funcionalidades.
// - Quiz 2 (Código Nacional): ahora se genera dinámicamente desde ./law_index.json con
//   muestreo estratificado por secciones y opciones LITERALES (oraciones completas).
// - Fallback: si no se logra cargar el law_index.json, se usa el banco existente (si lo hay).

/* ===========================
   RUTAS Y ESTADO GLOBAL
   =========================== */
const PATHS = {
  base: 'questions.json',
  extra: 'questions_extra.json',
  inventoryCSV: 'inventario.csv',
  lawIndex: 'law_index.json'      // NUEVO: JSON estructurado del Código (en la raíz)
};

let questions = { quiz1: [], quiz2: [], signals: [] };
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

const LOADED = {
  base: false,
  extra: false,
  inventory: false,
  lawIndex: false
};

// Contendrá el índice legal cargado (TÍTULO→CAPÍTULO→ARTÍCULO→oraciones)
let LAW_INDEX = null;

/* ===========================
   UTILIDADES
   =========================== */
function stableId(str) {
  const s = String(str || '');
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  return 'q_' + (hash >>> 0).toString(16);
}
function withTimeout(promise, ms, label = 'operación') {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`Timeout ${ms}ms en ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
async function fetchText(url, { retries = 1, timeout = 10000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await withTimeout(fetch(url, { cache: 'no-store' }), timeout, `fetch ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      console.warn(`[fetchText] intento ${i + 1} falló para ${url}:`, err);
    }
  }
  throw lastErr;
}
async function fetchJson(url, opts) {
  const txt = await fetchText(url, opts);
  try { return JSON.parse(txt); } catch (err) {
    console.error(`[fetchJson] JSON inválido en ${url}:`, err);
    throw err;
  }
}
const normalizePath = (p) => (p || '').replace(/\\/g, '/').replace(/^\.?\//, '');
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
function sampleDistinct(arr, k, excludeIndex = -1) {
  const n = arr.length;
  if (k <= 0 || n === 0) return [];
  const idxs = new Set();
  while (idxs.size < Math.min(k, n - (excludeIndex >= 0 ? 1 : 0))) {
    const r = Math.floor(Math.random() * n);
    if (r === excludeIndex) continue;
    idxs.add(r);
  }
  return Array.from(idxs).map(i => arr[i]);
}

/* ===========================
   PARSER CSV ROBUSTO (señales)
   =========================== */
function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      } else { field += ch; i++; continue; }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { pushField(); i++; continue; }
      if (ch === '\n') { pushField(); pushRow(); i++; continue; }
      if (ch === '\r') { if (text[i + 1] === '\n') i++; pushField(); pushRow(); i++; continue; }
      field += ch; i++; continue;
    }
  }
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) pushRow();
  return rows;
}

/* ===========================
   LIMPIEZAS Y UI AUXILIARES
   =========================== */
function removeExplanationBoxes() {
  const exp = document.getElementById('explanation');
  if (exp && exp.parentNode) exp.parentNode.removeChild(exp);
  const PHRASES = [
    'Cumplir las normas de tránsito protege la vida y la movilidad segura de todos los actores viales'
  ];
  const all = document.querySelectorAll('div, p, section, aside, article');
  all.forEach(el => {
    const txt = (el.textContent || '').trim();
    for (const ph of PHRASES) {
      if (txt && txt.indexOf(ph) !== -1) {
        if (el.childElementCount === 0 || /^explan|info|ayuda|nota$/i.test(el.id || '')) el.remove();
        else el.style.display = 'none';
        break;
      }
    }
  });
}

/* ===========================
   NORMALIZADORES
   =========================== */
const NORM = s =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/* ===========================
   OVERRIDES DE IMAGEN PARA SEÑALES (se mantiene)
   =========================== */
const FIXED_SIGNAL_IMAGE_MAP = new Map([
  ['circulacion prohibida peatones', 'Reglamentarias/Circulación prohibida de peatones.png']
]);

/* ===========================
   TEÓRICO: #40–#49 (se mantiene)
   =========================== */
const THEORETICAL_ITEMS_40_49 = [
  { num: 40, correct: 'Prohibido circular en bicicleta', synonyms: ['prohibido bicicleta', 'prohibido el paso de bicicletas', 'bicicletas'], fixedImage: 'Reglamentarias/Prohibida Bicicletas.png' },
  { num: 41, correct: 'Prohibido girar en U', synonyms: ['no u', 'no retorno', 'prohibido girar en u'], fixedImage: 'Reglamentarias/Prohibido Girar En U.png' },
  { num: 42, correct: 'Prohibido girar a la derecha', synonyms: ['no girar a la derecha', 'prohibido giro derecha'] },
  { num: 43, correct: 'Vehículos pesados a la derecha', synonyms: ['vehiculos pesados a la derecha', 'camiones a la derecha', 'camion carril derecho'], fixedImage: 'Reglamentarias/Vehiculos Pesados Derecha.png' },
  { num: 44, correct: 'Ceda el paso', synonyms: ['ceda el paso', 'ceda'] },
  { num: 45, correct: 'Velocidad Máxima', synonyms: ['velocidad maxima', 'límite de velocidad'] },
  { num: 46, correct: 'prohibido usar la bocina', synonyms: ['prohibido pitar', 'prohibido bocina', 'no pitar'] },
  { num: 47, correct: 'Prohibido parquear', synonyms: ['prohibido estacionar', 'no estacionar'] },
  { num: 48, correct: 'Prohibido parquear y prohibido parar o detenerse', synonyms: ['no parquear ni detenerse', 'prohibido parar y estacionar'], fixedImage: 'Reglamentarias/No Parquear Ni Detenerse.png' },
  { num: 49, correct: 'Prohibido fumar', synonyms: ['no fumar', 'prohibido fumar'], fixedImage: 'Reglamentarias/Prohibido fumar.webp' }
];

/* ===========================
   FUNCIONES QUIZ DE SEÑALES (se mantiene)
   =========================== */
function findInventoryByNameLike(label, inventory) {
  if (!Array.isArray(inventory) || !inventory.length) return null;
  const target = NORM(label);
  let best = null, bestScore = -1;
  for (const it of inventory) {
    const cand = NORM(it.nombre_visible);
    if (!cand) continue;
    let s = 0;
    if (cand === target) s += 5;
    if (cand.includes(target)) s += 3;
    for (const w of target.split(' ')) { if (w && cand.includes(w)) s += 1; }
    if (s > bestScore) { bestScore = s; best = it; }
  }
  return best;
}
function generateWrongOptions(correctAnswer, inventory) {
  const names = inventory.map(p => p.nombre_visible).filter(Boolean);
  const unique = Array.from(new Set(names)).filter(n => n !== correctAnswer);
  shuffle(unique);
  const pick = unique.slice(0, 3);
  const fallbacks = [
    'Cruce escolar','Zona escolar','Curva peligrosa','Vía cerrada',
    'Obras en la vía','Prohibido girar a la izquierda','Siga de frente',
    'Doble calzada','Reductor de velocidad'
  ];
  while (pick.length < 3) {
    const f = fallbacks[pick.length];
    if (f && f !== correctAnswer && !pick.includes(f)) pick.push(f);
    else break;
  }
  return pick;
}
function ensureTheoreticalSignalQuestions(inventory) {
  if (!Array.isArray(questions.quiz1)) questions.quiz1 = [];
  const isDetermine = q => typeof q?.question === 'string' &&
    /^\s*determine que indica cada se(ñ|n)al/i.test(q.question);
  questions.quiz1 = questions.quiz1.filter(q => !isDetermine(q));
  const numberRegexes = THEORETICAL_ITEMS_40_49.map(it => new RegExp(`\\(#${it.num}\\)`));
  questions.quiz1 = questions.quiz1.filter(q => {
    const text = String(q?.question || '');
    return !numberRegexes.some(re => re.test(text));
  });
  const built = [];
  for (const item of THEORETICAL_ITEMS_40_49) {
    let imageSrc = null;
    if (item.fixedImage) imageSrc = normalizePath(item.fixedImage);
    const wrongs = generateWrongOptions(item.correct, inventory);
    const q = {
      id: stableId(`teorico-${item.num}-${item.correct}`),
      question: `(#${item.num}) ¿Cuál es el nombre de esta señal?`,
      image: imageSrc || undefined,
      options: [item.correct, ...wrongs],
      correct: item.correct
    };
    built.push(q);
  }
  questions.quiz1 = [...questions.quiz1, ...built];
}

/* ===========================
   CARGA DE SEÑALES (CSV)  — se mantiene
   =========================== */
async function loadInventorySignals() {
  if (LOADED.inventory) return;
  try {
    const txt = await fetchText(PATHS.inventoryCSV, { retries: 1 });
    const rows = parseCSV(txt.replace(/^\uFEFF/, ''));
    const headers = rows[0]?.map(h => (h || '').trim()) || [];
    const idxNombre = headers.findIndex(h => /nombre_visible/i.test(h));
    const idxArchivo = headers.findIndex(h => /archivo/i.test(h));
    const idxUrl = headers.findIndex(h => /^url$/i.test(h));
    const inventory = rows.slice(1).map(r => ({
      nombre_visible: (r[idxNombre] || '').trim(),
      archivo: (r[idxArchivo] || '').trim(),
      url: (r[idxUrl] || '').trim()
    })).filter(o => o.nombre_visible);
    const builtSignals = inventory.map(r => {
      const correcta = r.nombre_visible;
      let imagen = r.url && r.url.startsWith('http') ? r.url : normalizePath(r.archivo);
      const key = NORM(correcta);
      if (FIXED_SIGNAL_IMAGE_MAP.has(key)) imagen = normalizePath(FIXED_SIGNAL_IMAGE_MAP.get(key));
      const err = generateWrongOptions(correcta, inventory);
      return normalizeQuestion({
        id: stableId(`signal-${correcta}-${imagen}`),
        question: '¿Cuál es el nombre de esta señal?',
        image: imagen,
        options: [correcta, ...err],
        correct: correcta
      });
    }).filter(Boolean);
    questions.signals = mergeUniqueQuestions([], builtSignals);
    maxSignals = questions.signals.length;
    const maxSpan = document.getElementById('max-signals');
    if (maxSpan) maxSpan.textContent = maxSignals;
    const inputSignals = document.getElementById('num-questions-3');
    if (inputSignals) {
      inputSignals.max = maxSignals;
      if (!inputSignals.value || Number(inputSignals.value) > maxSignals) inputSignals.value = maxSignals;
    }
    ensureTheoreticalSignalQuestions(inventory);
  } catch (err) {
    console.warn('[loadInventorySignals] Error:', err);
  }
  LOADED.inventory = true;
}

/* ===========================
   CARGA BASE Y EXTRA (se mantiene)
   =========================== */
async function loadBaseQuestions() {
  if (LOADED.base) return;
  const base = await fetchJson(PATHS.base, { retries: 1 });
  questions.quiz1 = mergeUniqueQuestions([], Array.isArray(base.quiz1) ? base.quiz1 : []);
  questions.quiz2 = mergeUniqueQuestions([], Array.isArray(base.quiz2) ? base.quiz2 : []);
  LOADED.base = true;
}
async function loadExtraQuestions() {
  if (LOADED.extra) return;
  try {
    const extra = await fetchJson(PATHS.extra, { retries: 1 });
    if (Array.isArray(extra.quiz1)) questions.quiz1 = mergeUniqueQuestions(questions.quiz1, extra.quiz1);
    if (Array.isArray(extra.quiz2)) questions.quiz2 = mergeUniqueQuestions(questions.quiz2, extra.quiz2);
  } catch (err) {
    console.warn('[loadExtraQuestions] opcional no disponible:', err?.message || err);
  }
  LOADED.extra = true;
}

/* ===========================
   NORMALIZACIÓN Y MERGE
   =========================== */
function normalizeQuestion(q) {
  if (!q) return null;
  const nq = { ...q };
  nq.id = q.id || stableId(`${q.question}|${q.image || ''}`);
  if (!Array.isArray(nq.options)) nq.options = [];
  const seen = new Set();
  nq.options = nq.options
    .map(o => (o == null ? '' : String(o).trim()))
    .filter(o => o.length > 0 && (seen.has(o) ? false : (seen.add(o), true)));
  const corr = (q.correct == null ? '' : String(q.correct).trim());
  if (!nq.options.includes(corr) && corr) nq.options.unshift(corr);
  if (nq.options.length < 2) return null;
  nq.correct = corr || nq.options[0];
  return nq;
}
function mergeUniqueQuestions(dstArr, srcArr) {
  const map = new Map();
  dstArr.forEach(q => map.set(q.id || stableId(`${q.question}|${q.image || ''}`), q));
  srcArr.forEach(q => {
    const n = normalizeQuestion(q);
    if (!n) return;
    if (!map.has(n.id)) map.set(n.id, n);
  });
  return Array.from(map.values());
}

/* ===========================
   NUEVO — CARGA DEL ÍNDICE LEGAL Y GENERADOR DE QUIZ 2
   =========================== */

// Config: número objetivo de preguntas dinámicas para una sesión (mantiene UX ágil).
const QUIZ2_TARGET_COUNT = 30; // diversidad por secciones; si hay menos, toma las disponibles

async function loadLawIndex() {
  if (LOADED.lawIndex) return;
  try {
    LAW_INDEX = await fetchJson(PATHS.lawIndex, { retries: 1, timeout: 15000 });
    LOADED.lawIndex = true;
  } catch (err) {
    console.warn('[loadLawIndex] No se pudo cargar law_index.json:', err);
    LOADED.lawIndex = false;
    LAW_INDEX = null;
  }
}

/** Recorre Título→Capítulo→Artículo y devuelve una lista plana con metadata */
function flattenArticles(indexJson) {
  const items = [];
  if (!indexJson?.titulos) return items;
  indexJson.titulos.forEach(t => {
    const tLabel = t.label || 'TÍTULO ?';
    (t.capitulos || []).forEach(c => {
      const cLabel = c.label || 'CAPÍTULO ?';
      (c.articulos || []).forEach(a => {
        items.push({
          title: tLabel,
          chapter: cLabel,
          id: a.id,
          articleLabel: a.label || `ARTÍCULO ${a.id}°`,
          articleName: a.name || '',
          first_page: a.first_page,
          last_page: a.last_page,
          sentences: Array.isArray(a.oraciones) ? a.oraciones.filter(Boolean) : []
        });
      });
    });
  });
  return items;
}

function isUsefulSentence(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 40) return false;                     // muy corta
  if (/^\s*(PARÁGRAFO|Parágrafo)/.test(t)) return false; // evita encabezados de parágrafo
  if (/^\s*(Ver\s|Texto subrayado|Declarado EXEQUIBLE|INEXEQUIBLE|CAPITULO|TITULO)/i.test(t)) return false;
  if (/^\d+\.\s/.test(t)) return false;                // itemizado suelto
  return true;
}

function buildDefinitionQuestionsFromArticle2(allArticles) {
  // Encuentra Art. 2 y extrae "Término: Definición..."
  const art2 = allArticles.find(a => a.id === 2);
  if (!art2) return [];
  const pairs = art2.sentences
    .map(s => {
      const m = /^([A-ZÁÉÍÓÚÑ][^:]{2,60}):\s*(.+)$/.exec(s.trim());
      if (!m) return null;
      return { term: m[1].trim(), def: s.trim(), context: {title: 'ARTÍCULO 2°'} };
    })
    .filter(Boolean);

  // Confecciona preguntas: término → definición literal correcta, distractores = otras definiciones
  const built = [];
  const poolDefs = pairs.map(p => p.def);
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const distractors = sampleDistinct(poolDefs, 3, i);
    if (distractors.length < 3) continue;
    built.push(normalizeQuestion({
      id: stableId(`law-def-${p.term}`),
      question: `Según el ARTÍCULO 2° (Definiciones), ¿cuál es la definición de “${p.term}”?`,
      options: [p.def, ...distractors],
      correct: p.def,
      origin: 'law_index'
    }));
  }
  return built.filter(Boolean);
}

function buildTrueSentenceQuestions(allArticles) {
  // Para artículos distintos del 2: extrae oraciones útiles y arma MCQ con una verdadera (correcta)
  const perChapter = new Map(); // chapterKey -> array de {meta, sentence}
  allArticles.forEach(a => {
    if (!Array.isArray(a.sentences) || a.sentences.length === 0) return;
    if (a.id === 2) return; // definiciones ya manejadas
    const good = a.sentences.filter(isUsefulSentence);
    good.forEach(s => {
      const k = `${a.title} / ${a.chapter}`;
      if (!perChapter.has(k)) perChapter.set(k, []);
      perChapter.get(k).push({ meta: a, sentence: s });
    });
  });

  // Construye preguntas de manera estratificada por capítulo (round-robin)
  const chapters = Array.from(perChapter.keys());
  shuffle(chapters);

  // Crea un depósito global de distractores (todas las oraciones útiles)
  const globalSentences = [];
  perChapter.forEach(list => list.forEach(it => globalSentences.push(it.sentence)));

  const built = [];
  let exhausted = 0;
  const indices = new Map(chapters.map(k => [k, 0]));

  while (exhausted < chapters.length) {
    exhausted = 0;
    for (const k of chapters) {
      const list = perChapter.get(k) || [];
      const idx = indices.get(k) || 0;
      if (idx >= list.length) { exhausted++; continue; }
      const { meta, sentence } = list[idx];
      indices.set(k, idx + 1);

      // Distractores: oraciones de otros artículos, similar longitud
      const len = sentence.length;
      const candidates = globalSentences.filter(s => s !== sentence && Math.abs(s.length - len) < 80);
      shuffle(candidates);
      const distractors = candidates.slice(0, 3);
      if (distractors.length < 3) continue;

      built.push(normalizeQuestion({
        id: stableId(`law-art${meta.id}-${len}-${idx}`),
        question: `Según ${meta.articleLabel}, ¿cuál de las siguientes oraciones corresponde al Código?`,
        options: [sentence, ...distractors],
        correct: sentence,
        origin: 'law_index'
      }));
    }
    // Límite de protección para no generar miles
    if (built.length > 200) break;
  }
  return built.filter(Boolean);
}

function buildQuiz2FromLawIndex(indexJson) {
  const articles = flattenArticles(indexJson);
  if (!articles.length) return [];

  // 1) Definiciones Art. 2
  let defs = buildDefinitionQuestionsFromArticle2(articles);

  // 2) Enunciados verdaderos del resto de artículos
  let sents = buildTrueSentenceQuestions(articles);

  shuffle(defs);
  shuffle(sents);

  // Estrategia: asegurar mezcla. Tomar 1/3 definiciones y 2/3 enunciados (si hay).
  const target = QUIZ2_TARGET_COUNT;
  const takeDefs = Math.min(Math.ceil(target / 3), defs.length);
  const takeSents = Math.min(target - takeDefs, sents.length);

  const picked = [...defs.slice(0, takeDefs), ...sents.slice(0, takeSents)];
  // Si hay menos de target, completar con lo que haya
  if (picked.length < target) {
    const extra = [...defs.slice(takeDefs), ...sents.slice(takeSents)];
    picked.push(...extra.slice(0, target - picked.length));
  }

  // Si el requerimiento es "usar todas", puedes descomentar la siguiente línea:
  // return normalizeQuestionsArray([...defs, ...sents]);
  return picked.map(normalizeQuestion).filter(Boolean);
}

/* ===========================
   BOOTSTRAP
   =========================== */
async function boot() {
  try {
    removeExplanationBoxes();
    await loadBaseQuestions();
    await loadExtraQuestions();
    await loadInventorySignals();
  } catch (err) {
    console.error('[boot] Error inicial:', err);
    alert('No se pudo cargar el banco de preguntas. Revisa la consola del navegador.');
  }
}

/* ===========================
   FLUJO DE JUEGO (UI)
   =========================== */
function startQuiz(type, num = null) {
  quizType = type;

  const ensureQuiz2 = async () => {
    // NUEVO: intenta cargar law_index.json y generar dinámicamente
    await loadLawIndex();
    if (LAW_INDEX) {
      const dyn = buildQuiz2FromLawIndex(LAW_INDEX);
      if (dyn.length > 0) {
        questions.quiz2 = dyn; // remplaza el pool con dinámico
      } else {
        console.warn('[quiz2] No se generaron preguntas dinámicas; usando banco existente (fallback).');
      }
    } else {
      console.warn('[quiz2] law_index.json no disponible; usando banco existente (fallback).');
    }

    // "Usar todas las preguntas" para el quiz 2 (como se solicitó previamente).
    const pool = [...(questions.quiz2 || [])];
    shuffle(pool);
    currentQuiz = pool;
    renderStart();
    showQuestion(); updateScore();
  };

  if (type === 'quiz1') {
    const pool = [...(questions.quiz1 || [])]; shuffle(pool);
    currentQuiz = pool;
    renderStart();
    showQuestion(); updateScore();
  } else if (type === 'quiz2') {
    ensureQuiz2();
    return;
  } else if (type === 'signals') {
    const pool = [...(questions.signals || [])]; shuffle(pool);
    const total = pool.length;
    let n = parseInt(num, 10);
    if (isNaN(n) || n <= 0 || n > total) n = total;
    currentQuiz = pool.slice(0, n);
    renderStart();
    showQuestion(); updateScore();
  } else {
    currentQuiz = [];
    renderStart();
    showQuestion(); updateScore();
  }
}

function renderStart() {
  const start = document.getElementById('start-screen');
  if (start) start.style.display = 'none';
  const q2opt = document.getElementById('quiz2-options');
  if (q2opt) q2opt.style.display = 'none';
  const q3opt = document.getElementById('quiz3-options');
  if (q3opt) q3opt.style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';
}

function showQuestion() {
  removeExplanationBoxes();

  const q = currentQuiz[currentIndex];
  if (!q) { endQuiz(); return; }

  const qEl = document.getElementById('question');
  qEl.textContent = q.question || '';

  const imgEl = document.getElementById('question-image');
  if (q.image) { imgEl.src = q.image; imgEl.style.display = 'block'; }
  else { imgEl.style.display = 'none'; }

  const optionsDiv = document.getElementById('options');
  optionsDiv.innerHTML = '';
  const opts = [...(q.options || [])]; shuffle(opts);

  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = String(opt);
    btn.onclick = () => selectAnswer(opt, q.correct);
    optionsDiv.appendChild(btn);
  });

  document.getElementById('next-btn').disabled = true;
  const progress = (currentIndex / (currentQuiz.length || 1)) * 100;
  document.getElementById('progress').style.width = `${progress}%`;
}

function selectAnswer(selected, correct) {
  const buttons = document.querySelectorAll('#options button');
  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === correct) { btn.style.backgroundColor = '#03dac6'; btn.style.color = '#000'; }
    if (btn.textContent === String(selected) && selected !== correct) { btn.style.backgroundColor = '#cf6679'; }
  });

  if (selected === correct) score++;
  else wrongAnswers.push({ question: currentQuiz[currentIndex]?.question || '', correct });

  document.getElementById('next-btn').disabled = false;
  updateScore();
}

function nextQuestion() {
  currentIndex++;
  (currentIndex < currentQuiz.length) ? showQuestion() : endQuiz();
}

function updateScore() {
  document.getElementById('score').textContent = `Puntaje: ${score} / ${currentQuiz.length || 0}`;
}

function endQuiz() {
  document.getElementById('quiz-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'block';
  document.getElementById('final-score').textContent = `Tu puntaje final: ${score} / ${currentQuiz.length || 0}`;

  if (wrongAnswers.length > 0) {
    let s = 'Resumen de preguntas erradas:\n';
    wrongAnswers.forEach((w,i)=>{ s += `${i+1}. ${w.question}\n   Correcta: ${w.correct}\n`; });
    alert(s);
  } else {
    alert('¡Felicidades! No tuviste errores.');
  }
  wrongAnswers = [];
}

/* ===========================
   EVENTOS
   =========================== */
document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');
document.getElementById('quiz2-btn').onclick = () => startQuiz('quiz2');

const quiz3Btn = document.getElementById('quiz3-btn');
if (quiz3Btn) {
  quiz3Btn.onclick = () => {
    const box = document.getElementById('quiz3-options');
    if (box) box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  };
}
const startQuiz3 = document.getElementById('start-quiz3');
if (startQuiz3) {
  startQuiz3.onclick = () => {
    const num = parseInt(document.getElementById('num-questions-3').value, 10);
    startQuiz('signals', num);
  };
}

document.getElementById('next-btn').onclick = nextQuestion;
document.getElementById('restart-btn').onclick = () => {
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  const q3opt = document.getElementById('quiz3-options');
  if (q3opt) q3opt.style.display = 'none';
};

/* ===========================
   INICIO
   =========================== */
boot();
