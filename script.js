// script.js — versión optimizada (lógica y robustez) SIN cambios de interfaz
// - Carga modular con caché y lazy-load de definiciones (ART. 2°) al abrir quiz de Código
// - Manejo de errores: retry, timeout, validación suave de datos, logs descriptivos
// - Parser CSV robusto (comillas, comas), desduplicación y limpieza de sufijos legales
// - Mantiene toda la funcionalidad y la misma UI

/* ===========================
   ESTADO GLOBAL Y CONSTANTES
   =========================== */
const PATHS = {
  base: 'questions.json',
  extra: 'questions_extra.json',
  inventoryCSV: 'inventario.csv',
  article2: 'article2_definitions.json'
};

let questions = { quiz1: [], quiz2: [], signals: [] };
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

// Caché de carga
const LOADED = {
  base: false,
  extra: false,
  inventory: false,
  article2: false
};

// Utilidad simple para IDs estables de pregunta (enunciado+imagen)
function stableId(str) {
  const s = String(str || '');
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  return 'q_' + (hash >>> 0).toString(16);
}

/* ===========================
   UTILIDADES BÁSICAS
   =========================== */
// Timeout de fetch
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
  try {
    return JSON.parse(txt);
  } catch (err) {
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
   PARSER CSV ROBUSTO
   =========================== */
function parseCSV(text) {
  // Soporta campos entre comillas con comas internas y dobles comillas escapadas
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // doble comilla -> literal
        inQuotes = false; i++; continue;
      } else {
        field += ch; i++; continue;
      }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { pushField(); i++; continue; }
      if (ch === '\n') { pushField(); pushRow(); i++; continue; }
      if (ch === '\r') { // CRLF
        if (text[i + 1] === '\n') i++;
        pushField(); pushRow(); i++; continue;
      }
      field += ch; i++; continue;
    }
  }
  // último campo/fila
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) pushRow();
  return rows;
}

/* ===========================
   LIMPIEZA DE SUFIJOS LEGALES
   =========================== */
function stripLegalTags(text) {
  if (typeof text !== 'string') return text;
  let t = text;
  t = t.replace(/\s*—\s*\((?:(?:(?:art|arts?)\.[^)]*)?ley\s*\d{3,4}\/\d{4}[^)]*|t[íi]tulo[^)]*)\)\s*$/i, '');
  t = t.replace(/\s*—\s*(?:(?:art|arts?)\.[^—]*ley\s*\d{3,4}\/\d{4}|t[íi]tulo\s+[ivx]+[^—]*)\s*$/i, '');
  t = t.replace(/\s*—\s*ley\s*76[89]\/2002\s*$/i, '');
  return t.trim();
}
function cleanQuiz2LegalTagsAndSyncCorrect() {
  if (!Array.isArray(questions.quiz2)) return;
  const collapse = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  questions.quiz2.forEach(q => {
    if (!q || !Array.isArray(q.options)) return;
    q.options = q.options.map(stripLegalTags);
    const cleanedCorrect = stripLegalTags(q.correct);
    // Alineación tolerante
    let idx = q.options.findIndex(o => o === cleanedCorrect);
    if (idx === -1) {
      const target = collapse(cleanedCorrect.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      idx = q.options.findIndex(o =>
        collapse(String(o).normalize('NFD').replace(/[\u0300-\u036f]/g, '')) === target
      );
    }
    if (idx === -1) {
      // forzar consistencia si no está incluida
      q.options = [cleanedCorrect, ...q.options.filter(o => o !== cleanedCorrect)];
    }
    q.correct = cleanedCorrect;
  });
}

/* ===========================
   UI: LIMPIEZA DE RECUADROS
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
   SEÑALES Y REEMPLAZOS TEÓRICO
   =========================== */
const THEORETICAL_REPLACEMENTS = [
  { num: 40, correct: 'Prohibido circular en bicicleta', img: 'Reglamentarias/Prohibida Bicicletas.png' },
  { num: 41, correct: 'Prohibido girar en U', img: 'Reglamentarias/Prohibido Girar En U.png' },
  { num: 42, correct: 'Prohibido girar a la derecha' },
  { num: 43, correct: 'Vehículos pesados a la derecha' },
  { num: 44, correct: 'Ceda el paso' },
  { num: 45, correct: 'Velocidad Máxima' },
  { num: 46, correct: 'prohibido usar la bocina' },
  { num: 47, correct: 'Prohibido parquear' },
  { num: 48, correct: 'Prohibido parquear y prohibido parar o detenerse' },
  { num: 49, correct: 'Prohibido fumar', img: 'Reglamentarias/Prohibido fumar.webp' }
];

function generateWrongOptions(correctAnswer, pool) {
  const names = pool.map(p => p.nombre_visible).filter(Boolean);
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

function replaceDeterminePlaceholders(inventory) {
  if (!Array.isArray(questions.quiz1)) questions.quiz1 = [];
  const isDetermine = q => typeof q?.question === 'string' &&
    /^\s*determine que indica cada se(ñ|n)al/i.test(q.question);

  // Limpia placeholders del banco
  questions.quiz1 = questions.quiz1.filter(q => !isDetermine(q));

  // Inserta 40–49 con imagen
  for (const r of THEORETICAL_REPLACEMENTS) {
    let image = r.img || null;
    if (!image) {
      const target = (r.correct || '').toLowerCase();
      let best = null, score = 0;
      for (const it of inventory) {
        const cand = (it.nombre_visible || '').toLowerCase();
        let s = 0;
        if (cand === target) s += 3;
        if (cand.includes(target)) s += 2;
        if (s > score) { score = s; best = it; }
      }
      if (best) image = best.url && best.url.startsWith('http') ? best.url : normalizePath(best.archivo);
    }
    const wrongs = generateWrongOptions(r.correct, inventory);
    const q = {
      id: stableId(`teorico-${r.num}-${r.correct}`),
      question: `(#${r.num}) ¿Cuál es el nombre de esta señal?`,
      image,
      options: [r.correct, ...wrongs],
      correct: r.correct
    };
    questions.quiz1.push(q);
  }
}

/* ===========================
   VALIDACIÓN SUAVE DE BANCOS
   =========================== */
function normalizeQuestion(q) {
  if (!q) return null;
  const nq = { ...q };
  nq.id = q.id || stableId(`${q.question}|${q.image || ''}`);
  if (!Array.isArray(nq.options)) nq.options = [];
  // Elimina falsy, normaliza a strings y desduplica preservando orden
  const seen = new Set();
  nq.options = nq.options
    .map(o => (o == null ? '' : String(o).trim()))
    .filter(o => o.length > 0 && (seen.has(o) ? false : (seen.add(o), true)));
  // Si la correcta no está, intente agregar al inicio
  const corr = (q.correct == null ? '' : String(q.correct).trim());
  if (!nq.options.includes(corr) && corr) nq.options.unshift(corr);
  // Asegurar mínimo 2 opciones
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
   CARGA MODULAR DE BANCOS
   =========================== */
async function loadBaseQuestions() {
  if (LOADED.base) return;
  const base = await fetchJson(PATHS.base, { retries: 1 });
  // Normaliza y asigna
  questions.quiz1 = mergeUniqueQuestions([], Array.isArray(base.quiz1) ? base.quiz1 : []);
  questions.quiz2 = mergeUniqueQuestions([], Array.isArray(base.quiz2) ? base.quiz2 : []);
  LOADED.base = true;
}

async function loadExtraQuestions() {
  if (LOADED.extra) return;
  try {
    const extra = await fetchJson(PATHS.extra, { retries: 1 });
    if (Array.isArray(extra.quiz1)) {
      questions.quiz1 = mergeUniqueQuestions(questions.quiz1, extra.quiz1);
    }
    if (Array.isArray(extra.quiz2)) {
      questions.quiz2 = mergeUniqueQuestions(questions.quiz2, extra.quiz2);
    }
  } catch (err) {
    console.warn('[loadExtraQuestions] opcional no disponible:', err?.message || err);
  }
  LOADED.extra = true;
}

async function loadInventorySignals() {
  if (LOADED.inventory) return;
  const txt = await fetchText(PATHS.inventoryCSV, { retries: 1 });
  const rows = parseCSV(txt.replace(/^\uFEFF/, '')); // quita BOM si existe
  if (!rows.length) {
    console.warn('[loadInventorySignals] CSV vacío');
    LOADED.inventory = true;
    return;
  }
  const headers = rows[0].map(h => (h || '').trim());
  const idxNombre = headers.findIndex(h => /nombre_visible/i.test(h));
  const idxArchivo = headers.findIndex(h => /archivo/i.test(h));
  const idxUrl = headers.findIndex(h => /^url$/i.test(h));

  if (idxNombre === -1 || (idxArchivo === -1 && idxUrl === -1)) {
    console.warn('[loadInventorySignals] CSV sin columnas requeridas (nombre_visible, archivo/url)');
    LOADED.inventory = true;
    return;
  }

  const inventory = rows.slice(1).map(r => ({
    nombre_visible: (r[idxNombre] || '').trim(),
    archivo: (r[idxArchivo] || '').trim(),
    url: (r[idxUrl] || '').trim()
  })).filter(o => o.nombre_visible);

  // Construye banco de señales
  const built = inventory.map(r => {
    const imagen = r.url && r.url.startsWith('http') ? r.url : normalizePath(r.archivo);
    const correcta = r.nombre_visible;
    const err = generateWrongOptions(correcta, inventory);
    return normalizeQuestion({
      id: stableId(`signal-${correcta}-${imagen}`),
      question: '¿Cuál es el nombre de esta señal?',
      image: imagen,
      options: [correcta, ...err],
      correct: correcta
    });
  }).filter(Boolean);

  questions.signals = mergeUniqueQuestions([], built);

  // Actualiza UI dependiente
  maxSignals = questions.signals.length;
  const maxSpan = document.getElementById('max-signals');
  if (maxSpan) maxSpan.textContent = maxSignals;

  const inputSignals = document.getElementById('num-questions-3');
  if (inputSignals) {
    inputSignals.max = maxSignals;
    if (!inputSignals.value || Number(inputSignals.value) > maxSignals) {
      inputSignals.value = maxSignals;
    }
  }

  // Reemplazar placeholders del teórico por 40–49 con imagen
  replaceDeterminePlaceholders(inventory);

  LOADED.inventory = true;
}

async function loadArticle2Definitions() {
  if (LOADED.article2) return;
  try {
    const defs = await fetchJson(PATHS.article2, { retries: 1 });
    const list = Array.isArray(defs?.article2_definitions) ? defs.article2_definitions : [];
    if (!list.length) {
      console.warn('[loadArticle2Definitions] sin definiciones en JSON');
      LOADED.article2 = true;
      return;
    }
    // Generar preguntas a partir de definiciones
    const newQs = [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry?.term || !entry?.definition) continue;
      const distractorDefs = sampleDistinct(list, 3, i).map(e => e.definition).filter(Boolean);
      const q = normalizeQuestion({
        id: stableId(`art2-${entry.term}`),
        question: `Según el ARTÍCULO 2° (Definiciones), ¿qué se entiende por “${entry.term}”?`,
        options: [entry.definition, ...distractorDefs],
        correct: entry.definition
      });
      if (q) newQs.push(q);
    }
    questions.quiz2 = mergeUniqueQuestions(questions.quiz2, newQs);
  } catch (err) {
    console.warn('[loadArticle2Definitions] opcional no disponible:', err?.message || err);
  }
  LOADED.article2 = true;
}

/* ===========================
   CARGA INICIAL (mínima)
   =========================== */
async function boot() {
  try {
    removeExplanationBoxes();
    await loadBaseQuestions();   // banco principal
    await loadExtraQuestions();  // banco extra (opcional)
    await loadInventorySignals(); // señales (para max-signals y quiz3)
    cleanQuiz2LegalTagsAndSyncCorrect();
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

  // Lazy-load de definiciones SOLO si se entra al quiz2
  const ensureQuiz2 = async () => {
    await loadArticle2Definitions();
    // refresca limpieza (por si vinieron sufijos de otra fuente)
    cleanQuiz2LegalTagsAndSyncCorrect();
    const pool = [...(questions.quiz2 || [])]; shuffle(pool);
    currentQuiz = pool; // SIEMPRE TODAS
    renderStart();
  };

  if (type === 'quiz1') {
    currentQuiz = [...(questions.quiz1 || [])]; shuffle(currentQuiz);
    renderStart();
  } else if (type === 'quiz2') {
    ensureQuiz2().then(() => {
      showQuestion(); updateScore();
    });
    return; // renderStart lo hace ensureQuiz2
  } else if (type === 'signals') {
    const pool = [...(questions.signals || [])]; shuffle(pool);
    const total = pool.length;
    let n = parseInt(num, 10);
    if (isNaN(n) || n <= 0 || n > total) n = total;
    currentQuiz = pool.slice(0, n);
    renderStart();
  } else {
    currentQuiz = [];
    renderStart();
  }

  showQuestion(); updateScore();
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
   EVENT LISTENERS
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
