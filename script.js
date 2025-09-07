// script.js — Integración de nuevas preguntas desde JSON (quiz1/quiz2),
// reemplazo de “DETERMINE…”, banco de señales desde inventario.csv,
// y enriquecimiento de respuestas del Código Nacional con 2.pdf (Ley 769/2002).

/* ============== Estado global ============== */
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

/* ============== Utilidades ============== */
const normalizePath = (p) => (p || '').replace(/\\/g, '/').replace(/^\.?\//, '');
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/* ============== Generación de distractores (señales) ============== */
function generateWrongOptionsFromInventory(correct, inventory, need = 3) {
  const pool = inventory.map(it => it.nombre_visible).filter(Boolean);
  shuffle(pool);
  const set = new Set();
  for (const name of pool) {
    if (set.size >= need) break;
    if (name && name !== correct) set.add(name);
  }
  // Fallbacks si el inventario no alcanza
  const fallbacks = [
    'Cruce escolar', 'Zona escolar', 'Curva peligrosa', 'Vía cerrada',
    'Obras en la vía', 'Prohibido girar a la izquierda', 'Siga de frente',
    'Doble calzada', 'Reductor de velocidad'
  ];
  for (const fb of fallbacks) {
    if (set.size >= need) break;
    if (fb !== correct) set.add(fb);
  }
  return Array.from(set).slice(0, need);
}

/* ============== Búsqueda robusta en inventario ============== */
function findInventoryByNameLike(label, inventory) {
  const target = norm(label);
  let best = null, bestScore = 0;

  for (const it of inventory) {
    const cand = norm(it.nombre_visible);
    if (!cand) continue;

    if (cand === target) return it;

    let score = 0;
    if (cand.includes(target)) score += 3;
    const words = target.split(' ').filter(w => w.length > 2);
    words.forEach(w => { if (cand.includes(w)) score += 1; });

    const keys = ['prohibido','ceda','velocidad','bocina','pitar','parquear','detenerse','bicicleta','fum','derecha','u','pesado','camion'];
    keys.forEach(k => { if (cand.includes(k) && target.includes(k)) score += 1; });

    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

/* ============== Señales del teórico #40–#49 ============== */
/* Overrides de imagen exacta cuando el usuario lo indicó */
const THEORETICAL_REPLACEMENTS = [
  { num: 40, correct: 'Prohibido circular en bicicleta', synonyms: ['prohibido bicicleta','prohibido el paso de bicicletas','bicicletas'], fixedImage: 'Reglamentarias/Prohibida Bicicletas.png' },
  { num: 41, correct: 'Prohibido girar en U', synonyms: ['no u','no retorno','prohibido girar en u'], fixedImage: 'Reglamentarias/Prohibido Girar En U.png' },
  { num: 42, correct: 'Prohibido girar a la derecha', synonyms: ['no girar a la derecha','prohibido giro derecha'] },
  { num: 43, correct: 'Vehículos pesados a la derecha', synonyms: ['camion derecha','vehiculo pesado derecha','pesados derecha','camion carril derecho'] },
  { num: 44, correct: 'Ceda el paso', synonyms: ['ceda el paso','ceda'] },
  { num: 45, correct: 'Velocidad Máxima', synonyms: ['velocidad maxima','límite de velocidad','velocidad 90','sr 30'] },
  { num: 46, correct: 'prohibido usar la bocina', synonyms: ['prohibido pitar','prohibido bocina','no pitar','sr 29'] },
  { num: 47, correct: 'Prohibido parquear', synonyms: ['no estacionar','prohibido estacionar','sr 28'] },
  { num: 48, correct: 'Prohibido parquear y prohibido parar o detenerse', synonyms: ['no parquear ni detenerse','prohibido parar y estacionar','sr 28a'] },
  { num: 49, correct: 'Prohibido fumar', synonyms: ['no fumar','prohibido fumar'], fixedImage: 'Reglamentarias/Prohibido fumar.webp' }
];

function buildSignalQuestionFromInventory(item, inventory) {
  // Imagen (prioriza fixedImage si existe)
  let imageSrc;
  if (item.fixedImage) {
    imageSrc = normalizePath(item.fixedImage);
  } else {
    let imgRecord = findInventoryByNameLike(item.correct, inventory) || null;
    if (!imgRecord) {
      for (const s of item.synonyms || []) {
        imgRecord = findInventoryByNameLike(s, inventory);
        if (imgRecord) break;
      }
    }
    if (imgRecord) {
      imageSrc = (imgRecord.url && imgRecord.url.startsWith('http')) ? imgRecord.url : normalizePath(imgRecord.archivo);
    }
  }

  const wrongs = generateWrongOptionsFromInventory(item.correct, inventory, 3);
  const options = Array.from(new Set([item.correct, ...wrongs]));
  const questionText = `(#${item.num}) ¿Cuál es el nombre de esta señal?`;

  return { question: questionText, image: imageSrc, options, correct: item.correct };
}

function replaceDeterminePlaceholders(inventory) {
  if (!Array.isArray(questions.quiz1)) questions.quiz1 = [];
  const re = /^\s*determine que indica cada se(ñ|n)al/i;
  // Eliminamos todos los placeholders DETERMINE...
  questions.quiz1 = questions.quiz1.filter(q => !(q && typeof q.question === 'string' && re.test(q.question)));
  // Agregamos las 40–49 como preguntas con imagen
  const newOnes = THEORETICAL_REPLACEMENTS.map(entry => buildSignalQuestionFromInventory(entry, inventory));
  questions.quiz1.push(...newOnes);
}

/* ============== Enriquecimiento de respuestas (quiz2) con 2.pdf ============== */
/* Agrega un sufijo breve a la respuesta correcta con referencia legal */
function enrichQuiz2WithPDFContext() {
  if (!Array.isArray(questions.quiz2)) return;

  const rules = [
    {
      test: (q) => /revisi(ó|o)n\s+T[ée]cnico|revisi(ó|o)n de gases|t[ée]cnico-?mec[aá]nica/i.test(q.question || ''),
      suffix: ' — (Arts. 51–54 Ley 769/2002)'
    },
    {
      test: (q) => /licencia|vigencia.*licencia|renovaci(ó|o)n.*licencia/i.test(q.question || ''),
      suffix: ' — (Art. 22 Ley 769/2002)'
    },
    {
      test: (q) => /centro de diagn[oó]stico automotor|cda/i.test(q.question || '') ||
                    /diagn[oó]stico automotor/i.test(q.correct || ''),
      suffix: ' — (Art. 53 Ley 769/2002)'
    },
    {
      test: (q) => /centro de ense(ñ|n)anza.*conductores|instructores/i.test(q.question || ''),
      suffix: ' — (Arts. 18–20 Ley 769/2002)'
    },
    {
      test: (q) => /¿qu[eé]\s+es|que\s+es|definici[óo]n/i.test(q.question || ''),
      suffix: ' — (Título I — Definiciones, Ley 769/2002)'
    }
  ];

  questions.quiz2.forEach(q => {
    const rule = rules.find(r => r.test(q));
    if (!rule) return;
    // Evitar duplicados
    if ((q.correct || '').includes('Ley 769/2002')) return;

    const newCorrect = `${q.correct}${rule.suffix}`;
    // sustituimos en correct y en options la versión vieja por la enriquecida
    const prev = q.correct;
    q.correct = newCorrect;

    if (Array.isArray(q.options)) {
      const iOld = q.options.findIndex(o => o === prev);
      const iExact = q.options.findIndex(o => o === newCorrect);
      if (iExact === -1) {
        if (iOld >= 0) q.options[iOld] = newCorrect;
        else q.options = [newCorrect, ...(q.options || []).filter(o => o !== prev)];
      }
    }
  });
}

/* ============== Carga de bancos ============== */
async function loadQuestions() {
  // 1) Banco base
  const base = await fetch('questions.json', { cache: 'no-store' }).then(r => r.json());
  questions = base;

  // 2) Banco extra (desde JSON). Fusionamos quiz1 y quiz2 sin duplicados por texto de pregunta
  try {
    const extraRes = await fetch('questions_extra.json', { cache: 'no-store' });
    if (extraRes.ok) {
      const extra = await extraRes.json();

      if (Array.isArray(extra?.quiz1)) {
        const map1 = new Map();
        (questions.quiz1 || []).forEach(q => map1.set((q.question || '').trim(), q));
        extra.quiz1.forEach(q => {
          const key = (q?.question || '').trim();
          if (key && !map1.has(key)) map1.set(key, q);
        });
        questions.quiz1 = Array.from(map1.values());
      }

      if (Array.isArray(extra?.quiz2)) {
        const map2 = new Map();
        (questions.quiz2 || []).forEach(q => map2.set((q.question || '').trim(), q));
        extra.quiz2.forEach(q => {
          const key = (q?.question || '').trim();
          if (key && !map2.has(key)) map2.set(key, q);
        });
        questions.quiz2 = Array.from(map2.values());
      }
    }
  } catch {
    // Silencio si no existe
  }

  // 3) Inventario de señales (CSV)
  const csv = await fetch('inventario.csv', { cache: 'no-store' }).then(r => r.text());
  const rows = csv.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());
  const inventory = rows.slice(1).map(row => {
    const o = {}; headers.forEach((h, i) => (o[h] = (row[i] || '').trim())); return o;
  }).filter(o => o?.nombre_visible);

  // 4) Construye banco "Señales" desde inventario
  questions.signals = inventory.map(it => {
    const img = it.url && it.url.startsWith('http') ? it.url : normalizePath(it.archivo);
    const correct = it.nombre_visible;
    const wrongs = generateWrongOptionsFromInventory(correct, inventory, 3);
    return {
      question: '¿Cuál es el nombre de esta señal?',
      image: img,
      options: Array.from(new Set([correct, ...wrongs])),
      correct
    };
  });

  // 5) Reemplaza placeholders del teórico por preguntas con imagen (40–49)
  replaceDeterminePlaceholders(inventory);

  // 6) Enriquecer respuestas del Código Nacional con contexto de 2.pdf (referencias legales)
  enrichQuiz2WithPDFContext();

  // 7) Datos dependientes de UI
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
}

/* ============== Flujo del juego ============== */
function startQuiz(type, num = null) {
  quizType = type;

  if (type === 'quiz1') {
    currentQuiz = [...(questions.quiz1 || [])];
    shuffle(currentQuiz);
  } else if (type === 'quiz2') {
    const pool = [...(questions.quiz2 || [])]; shuffle(pool);
    // Siempre TODAS
    currentQuiz = pool;
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
  const cfg3 = document.getElementById('quiz3-options'); if (cfg3) cfg3.style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';
  showQuestion(); updateScore();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) { endQuiz(); return; }

  document.getElementById('question').textContent = q.question || '';

  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image; imgEl.alt = 'Imagen de la señal'; imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

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
  updateProgress();
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

function updateProgress() {
  const p = (currentIndex / (currentQuiz.length || 1)) * 100;
  document.getElementById('progress').style.width = `${p}%`;
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

/* ============== Listeners ============== */
document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');
document.getElementById('quiz2-btn').onclick = () => startQuiz('quiz2');
document.getElementById('quiz3-btn').onclick = () => {
  const box = document.getElementById('quiz3-options');
  if (box) box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
};
document.getElementById('start-quiz3').onclick = () => {
  const num = parseInt(document.getElementById('num-questions-3').value, 10);
  startQuiz('signals', num);
};
document.getElementById('next-btn').onclick = nextQuestion;
document.getElementById('restart-btn').onclick = () => {
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  const box = document.getElementById('quiz3-options'); if (box) box.style.display = 'none';
};

/* ============== Inicio ============== */
loadQuestions();
