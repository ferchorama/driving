// script.js — Opciones del quiz2 con oraciones literales extraídas de 2.pdf (law_sentences.json)
// Mantiene: carga desde JSON, eliminación “DETERMINE…”, banco de señales, sin panel explicativo.

// ===================== Estado global =====================
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

// ===================== Utilidades básicas =====================
const normalizePath = (p) => (p || '').replace(/\\/g, '/').replace(/^\.?\//, '');

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ===================== Señales: distractores =====================
function generateWrongOptions(correctAnswer, pool) {
  const set = new Set();
  while (set.size < 3 && pool.length) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    const candidate = r.nombre_visible;
    if (candidate && candidate !== correctAnswer) set.add(candidate);
  }
  // Fallbacks si el inventario es pequeño
  const fallbacks = [
    'Cruce escolar','Zona escolar','Curva peligrosa','Vía cerrada',
    'Obras en la vía','Prohibido girar a la izquierda','Siga de frente',
    'Doble calzada','Reductor de velocidad'
  ];
  for (const f of fallbacks) {
    if (set.size >= 3) break;
    if (f !== correctAnswer) set.add(f);
  }
  return Array.from(set);
}

// ===================== Limpieza de sufijos legales en opciones (si los hubiera) =====================
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
    let idx = q.options.findIndex(o => o === cleanedCorrect);
    if (idx === -1) {
      const target = collapse(cleanedCorrect.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      idx = q.options.findIndex(o =>
        collapse(String(o).normalize('NFD').replace(/[\u0300-\u036f]/g, '')) === target
      );
    }
    if (idx === -1) q.options = [cleanedCorrect, ...q.options.filter(o => o !== cleanedCorrect)];
    q.correct = cleanedCorrect;
  });
}

// ===================== Remover cualquier recuadro explicativo residual =====================
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

// ===================== Reemplazo “DETERMINE QUE INDICA CADA SEÑAL” (40–49) =====================
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

function replaceDeterminePlaceholders(inventory) {
  if (!Array.isArray(questions.quiz1)) questions.quiz1 = [];
  const isDetermine = q => typeof q?.question === 'string' &&
    /^\s*determine que indica cada se(ñ|n)al/i.test(q.question);
  questions.quiz1 = questions.quiz1.filter(q => !isDetermine(q));

  // Inserta 40–49 como preguntas con imagen
  for (const r of THEORETICAL_REPLACEMENTS) {
    let image = r.img || null;
    if (!image) {
      // buscar mejor coincidencia en inventario
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
    questions.quiz1.push({
      question: `(#${r.num}) ¿Cuál es el nombre de esta señal?`,
      image,
      options: [r.correct, ...wrongs],
      correct: r.correct
    });
  }
}

// ===================== Mapeo de temas para quiz2 -> frases literales =====================
const TOPIC_RULES = [
  { key: 'soat', re: /\bsoat\b|seguro obligatorio/i },
  { key: 'licencia', re: /licencia|vigencia.*licencia|renovaci[oó]n.*licencia/i },
  { key: 'rtm', re: /t[ée]cnico-?mec[aá]nic|revisi[oó]n.*(t[ée]cnico|gases)|cda|diagn[oó]stico automotor/i },
  { key: 'peaton', re: /peat[oó]n|peatonales|peatonal/i },
  { key: 'ciclista', re: /cicli|biciclet/i },
  { key: 'semaforo', re: /sem[aá]foro|luz roja/i },
  { key: 'adelantamiento', re: /adelant/i },
  { key: 'velocidad', re: /velocidad/i },
  { key: 'estacionar', re: /estacionar|parquear|parqueo/i },
  { key: 'alcohol', re: /alcohol|embriaguez/i },
  { key: 'casco', re: /\bcasco\b/i },
  { key: 'motocicleta', re: /motociclet/i },
  { key: 'carga', re: /\bcarga\b|sobresal|estabilidad/i },
  { key: 'prioridad', re: /prelaci[oó]n|prioridad/i },
  { key: 'agente', re: /agente de tr[aá]nsito|autoridad de tr[aá]nsito/i },
  { key: 'comparendo', re: /comparendo/i },
  { key: 'senal', re: /se[ñn]al/i },
  { key: 'interseccion', re: /intersecci/i },
  { key: 'paso', re: /paso peatonal|cebra/i },
  { key: 'vehiculo', re: /veh[ií]culo/i } // comodín
];

// Devuelve clave de tema según el enunciado de la pregunta
function getTopic(questionText) {
  const txt = (questionText || '').toLowerCase();
  for (const r of TOPIC_RULES) {
    if (r.re.test(txt)) return r.key;
  }
  return 'vehiculo'; // fallback
}

// Construye opciones literales: 1 correcta del tema, 3 distractores de otros temas
function buildLiteralOptionsForQuestion(q, lawBank) {
  const topics = Object.keys(lawBank).filter(k => k !== 'misc');
  const t = getTopic(q.question);
  const poolCorrect = (lawBank[t] && lawBank[t].length) ? lawBank[t] : (lawBank.misc || []);
  const correctSentence = poolCorrect[Math.floor(Math.random() * poolCorrect.length)] || 'El tránsito se rige por normas generales de seguridad vial.';

  // Distractores: tomar de temas distintos (y de misc como apoyo)
  const otherTopics = topics.filter(k => k !== t);
  shuffle(otherTopics);
  const distractors = [];
  for (const ot of otherTopics) {
    if (distractors.length >= 3) break;
    const arr = lawBank[ot];
    if (arr && arr.length) {
      distractors.push(arr[Math.floor(Math.random() * arr.length)]);
    }
  }
  while (distractors.length < 3 && (lawBank.misc || []).length) {
    const s = lawBank.misc[Math.floor(Math.random() * lawBank.misc.length)];
    if (!distractors.includes(s) && s !== correctSentence) distractors.push(s);
  }

  const options = [correctSentence, ...distractors.slice(0, 3)];
  q.options = options;
  q.correct = correctSentence;
}

// ===================== Carga principal =====================
async function loadQuestions() {
  removeExplanationBoxes(); // limpieza DOM residual

  // 1) Banco base
  const base = await fetch('questions.json', { cache: 'no-store' }).then(r => r.json());
  questions = base;

  // 2) Extra (si existe): fusiona quiz1 y quiz2 sin duplicados por enunciado
  try {
    const extraRes = await fetch('questions_extra.json', { cache: 'no-store' });
    if (extraRes.ok) {
      const extra = await extraRes.json();

      if (Array.isArray(extra?.quiz1)) {
        const map1 = new Map();
        (questions.quiz1 || []).forEach(q => map1.set((q.question || '').trim(), q));
        extra.quiz1.forEach(q => {
          const k = (q?.question || '').trim();
          if (k && !map1.has(k)) map1.set(k, q);
        });
        questions.quiz1 = Array.from(map1.values());
      }

      if (Array.isArray(extra?.quiz2)) {
        const map2 = new Map();
        (questions.quiz2 || []).forEach(q => map2.set((q.question || '').trim(), q));
        extra.quiz2.forEach(q => {
          const k = (q?.question || '').trim();
          if (k && !map2.has(k)) map2.set(k, q);
        });
        questions.quiz2 = Array.from(map2.values());
      }
    }
  } catch (_) {
    // sin extra
  }

  // 3) Inventario de señales (CSV)
  const csv = await fetch('inventario.csv', { cache: 'no-store' }).then(r => r.text());
  const rows = csv.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());
  const inventory = rows.slice(1).map(row => {
    const o = {}; headers.forEach((h, i) => (o[h] = (row[i] || '').trim())); return o;
  }).filter(o => o?.nombre_visible);

  // 4) Banco "Señales" construido desde inventario
  questions.signals = inventory.map(r => {
    const imagen = r.url && r.url.startsWith('http') ? r.url : normalizePath(r.archivo);
    const correcta = r.nombre_visible;
    const err = generateWrongOptions(correcta, inventory);
    return {
      question: '¿Cuál es el nombre de esta señal?',
      image: imagen,
      options: [correcta, ...err],
      correct: correcta
    };
  });

  // 5) Reemplazo de placeholders “DETERMINE…”
  replaceDeterminePlaceholders(inventory);

  // 6) Limpieza de sufijos legales residuales (si hubiera) en quiz2
  cleanQuiz2LegalTagsAndSyncCorrect();

  // 7) Cargar frases literales de la Ley (2.pdf) desde law_sentences.json
  let lawBank = null;
  try {
    const res = await fetch('law_sentences.json', { cache: 'no-store' });
    if (res.ok) {
      lawBank = await res.json(); // { licencia:[], soat:[], rtm:[], ... , misc:[] }
    }
  } catch (_) {}

  // 8) Para CADA pregunta del quiz2, reemplazar opciones por oraciones literales
  if (lawBank && Array.isArray(questions.quiz2)) {
    questions.quiz2.forEach(q => buildLiteralOptionsForQuestion(q, lawBank));
  }

  // 9) Datos dependientes de UI
  maxSignals = (questions.signals || []).length;
  const maxSpan = document.getElementById('max-signals');
  if (maxSpan) maxSpan.textContent = maxSignals;

  const inputSignals = document.getElementById('num-questions-3');
  if (inputSignals) {
    inputSignals.max = maxSignals;
    if (!inputSignals.value || Number(inputSignals.value) > maxSignals) {
      inputSignals.value = maxSignals;
    }
  }
}

// ===================== Flujo del juego =====================
function startQuiz(type, num = null) {
  quizType = type;

  if (type === 'quiz1') {
    currentQuiz = [...(questions.quiz1 || [])]; shuffle(currentQuiz);
  } else if (type === 'quiz2') {
    const pool = [...(questions.quiz2 || [])]; shuffle(pool);
    currentQuiz = pool; // SIEMPRE todas
  } else if (type === 'signals') {
    const pool = [...(questions.signals || [])]; shuffle(pool);
    const total = pool.length;
    let n = parseInt(num, 10);
    if (isNaN(n) || n <= 0 || n > total) n = total;
    currentQuiz = pool.slice(0, n);
  } else {
    currentQuiz = [];
  }

  currentIndex = 0; score = 0; wrongAnswers = [];
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quiz2-options').style.display = 'none';
  document.getElementById('quiz3-options').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';

  showQuestion(); updateScore();
}

function showQuestion() {
  removeExplanationBoxes();

  const q = currentQuiz[currentIndex];
  if (!q) { endQuiz(); return; }

  document.getElementById('question').textContent = q.question || '';

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

// ===================== Listeners =====================
document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');
document.getElementById('quiz2-btn').onclick = () => startQuiz('quiz2');

document.getElementById('quiz3-btn').onclick = () => {
  const box = document.getElementById('quiz3-options');
  box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
};
document.getElementById('start-quiz3').onclick = () => {
  const num = parseInt(document.getElementById('num-questions-3').value, 10);
  startQuiz('signals', num);
};

document.getElementById('next-btn').onclick = nextQuestion;
document.getElementById('restart-btn').onclick = () => {
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('quiz2-options').style.display = 'none';
  document.getElementById('quiz3-options').style.display = 'none';
};

// ===================== Inicio =====================
loadQuestions();
