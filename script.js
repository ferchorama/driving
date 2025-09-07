// script.js — Mejora de preguntas del teórico (#40–#49) con formato “Quiz 3”.
// - Mantiene la lógica previa (quiz2 usa todas las preguntas, señales normalizadas, etc.).
// - Inserta 10 preguntas nuevas en quiz1 con imagen buscada en inventario.csv.
// - Respeta tus textos como respuesta correcta, pero usa nombres/códigos oficiales
//   para buscar imágenes y generar distractores.

/* ==================== Estado ==================== */
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

/* ==================== Utilidades ==================== */
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

/* Distractores desde inventario (por nombre_visible) */
function generateWrongOptionsFromInventory(correct, inventory) {
  const pool = inventory.map(it => it.nombre_visible).filter(Boolean);
  shuffle(pool);
  const set = new Set();
  for (const name of pool) {
    if (set.size >= 3) break;
    if (name && name !== correct) set.add(name);
  }
  return Array.from(set);
}

/* ==================== Nombres oficiales (subset) ==================== */
/* Fuentes: Manual de Señalización Vial (MinTransporte) + listados didácticos SR/SP.
   SR-02 CEDA EL PASO, SR-08 PROHIBIDO GIRAR A LA DERECHA, SR-10 PROHIBIDO GIRAR EN U,
   SR-28 PROHIBIDO PARQUEAR, SR-28A NO PARQUEAR NI DETENERSE, SR-29 PROHIBIDO PITAR,
   SR-30 VELOCIDAD MÁXIMA. */
const OFFICIAL = {
  'SR-02': { name: 'CEDA EL PASO', aliases: ['ceda el paso', 'ceda'] },
  'SR-08': { name: 'PROHIBIDO GIRAR A LA DERECHA', aliases: ['no girar a la derecha', 'prohibido giro derecha'] },
  'SR-10': { name: 'PROHIBIDO GIRAR EN U', aliases: ['no u', 'no girar en u', 'prohibido girar en u', 'no retorno'] },
  'SR-28': { name: 'PROHIBIDO PARQUEAR', aliases: ['prohibido parquear', 'no estacionar'] },
  'SR-28A': { name: 'NO PARQUEAR NI DETENERSE', aliases: ['prohibido parquear y detenerse', 'no parquear ni detenerse', 'prohibido parar y estacionar'] },
  'SR-29': { name: 'PROHIBIDO PITAR', aliases: ['prohibido pitar', 'prohibido usar la bocina', 'prohibido bocina'] },
  'SR-30': { name: 'VELOCIDAD MÁXIMA', aliases: ['velocidad maxima', 'limite de velocidad'] }
};

/* Índice alias → código */
const ALIAS_TO_CODE = (() => {
  const map = new Map();
  Object.entries(OFFICIAL).forEach(([code, obj]) => {
    map.set(norm(code), code);
    map.set(norm(obj.name), code);
    (obj.aliases || []).forEach(a => map.set(norm(a), code));
  });
  return map;
})();

/* Intentar encontrar un registro del inventario por nombre (robusto) */
function findInventoryByNameLike(label, inventory) {
  const target = norm(label);
  let best = null, bestScore = 0;

  for (const it of inventory) {
    const cand = norm(it.nombre_visible);
    if (!cand) continue;

    // Match exacto
    if (cand === target) return it;

    // Ponderación por coincidencias parciales
    let score = 0;
    if (cand.includes(target)) score += 3;

    const words = target.split(' ').filter(w => w.length > 2);
    words.forEach(w => { if (cand.includes(w)) score += 1; });

    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

/* ==================== NUEVO: Construcción de preguntas #40–#49 ==================== */
/* Entradas del usuario (texto correcto = debe ser la opción correcta mostrada) */
const THEORETICAL_SIGNALS_INPUT = [
  { id: 40, correctLabel: 'Prohibido circular en bicicleta', synonyms: ['prohibido bicicleta', 'prohibido el paso de bicicletas', 'bicicletas'] },
  { id: 41, correctLabel: 'Prohibido girar en U', synonyms: ['no u', 'no retorno', 'prohibido girar en u'], official: 'SR-10' },
  { id: 42, correctLabel: 'Prohibido girar a la derecha', synonyms: ['no girar a la derecha', 'prohibido giro derecha'], official: 'SR-08' },
  { id: 43, correctLabel: 'Vehículos pesados a la derecha', synonyms: ['camión derecha', 'vehiculo pesado derecha', 'camion carril derecho', 'prohibido adelantar'] },
  { id: 44, correctLabel: 'Ceda el paso', synonyms: ['ceda el paso', 'ceda'], official: 'SR-02' },
  { id: 45, correctLabel: 'Velocidad Máxima', synonyms: ['velocidad maxima', 'límite de velocidad', 'sr-30', 'velocidad 90'], official: 'SR-30' },
  { id: 46, correctLabel: 'prohibido usar la bocina', synonyms: ['prohibido pitar', 'prohibido bocina', 'sr-29'], official: 'SR-29' },
  { id: 47, correctLabel: 'Prohibido parquear', synonyms: ['no estacionar', 'sr-28'], official: 'SR-28' },
  { id: 48, correctLabel: 'Prohibido parquear y prohibido parar o detenerse', synonyms: ['no parquear ni detenerse', 'prohibido parar y estacionar', 'sr-28a'], official: 'SR-28A' },
  { id: 49, correctLabel: 'Prohibido fumar', synonyms: ['no fumar', 'prohibido fumar'] }
];

/* A partir del inventario, crear objetos tipo pregunta con imagen y 4 opciones */
function buildSignalLikeQuestion(entry, inventory) {
  // 1) Imagen desde inventario (por sinónimos y/o por oficial)
  let imgRecord = null;

  // Búsqueda por oficial si lo conocemos
  if (entry.official && OFFICIAL[entry.official]) {
    const officialName = `${entry.official} ${OFFICIAL[entry.official].name}`;
    imgRecord = findInventoryByNameLike(officialName, inventory) ||
                findInventoryByNameLike(OFFICIAL[entry.official].name, inventory);
  }

  // Búsqueda por sinónimos y por la propia etiqueta correcta
  if (!imgRecord) {
    for (const key of [entry.correctLabel, ...(entry.synonyms || [])]) {
      imgRecord = findInventoryByNameLike(key, inventory);
      if (imgRecord) break;
    }
  }

  // 2) Ruta de imagen
  let imageSrc = null;
  if (imgRecord) {
    imageSrc = (imgRecord.url && imgRecord.url.startsWith('http'))
      ? imgRecord.url
      : normalizePath(imgRecord.archivo);
  }

  // 3) Opciones: correcta = EXACTAMENTE el texto entregado por el usuario.
  //    Distractores = 3 nombres del inventario diferentes.
  let options = [entry.correctLabel];
  const wrongs = generateWrongOptionsFromInventory(entry.correctLabel, inventory);
  options.push(...wrongs);

  // Evitar duplicados y barajar después en showQuestion()
  options = Array.from(new Set(options));

  // 4) Enunciado + fallback de descripción cuando no hay imagen
  let questionText = '¿Cuál es el nombre de esta señal?';
  if (!imageSrc) {
    // Construir descripción a partir del oficial si lo tenemos
    if (entry.official && OFFICIAL[entry.official]) {
      const of = OFFICIAL[entry.official];
      questionText = `Identifica la señal (sin imagen disponible). Descripción: ${of.name}.`;
    } else {
      questionText = `Identifica la señal (sin imagen disponible).`;
    }
  }

  return {
    question: questionText,
    image: imageSrc || undefined,
    options,
    correct: entry.correctLabel
  };
}

/* Inserta las 10 preguntas en quiz1 y elimina los placeholders defectuosos */
function injectTheoreticalSignalQuestions(inventory) {
  if (!Array.isArray(questions.quiz1)) questions.quiz1 = [];

  // 1) Eliminar placeholders del estilo “DETERMINE QUE INDICA CADA SEÑAL”
  questions.quiz1 = questions.quiz1.filter(q => !/determine que indica cada se(ñ|n)al/i.test(q?.question || ''));

  // 2) Construir e insertar nuevas preguntas
  const newOnes = THEORETICAL_SIGNALS_INPUT.map(e => buildSignalLikeQuestion(e, inventory));

  questions.quiz1.push(...newOnes);
}

/* ==================== Carga de bancos ==================== */
async function loadQuestions() {
  // 1) Banco base
  const base = await fetch('questions.json', { cache: 'no-store' }).then(r => r.json());
  questions = base;

  // 2) Banco extra (Código Nacional) opcional
  try {
    const extraRes = await fetch('questions_extra.json', { cache: 'no-store' });
    if (extraRes.ok) {
      const extra = await extraRes.json();
      if (Array.isArray(extra?.quiz2)) {
        // Fusiona evitando duplicado por enunciado exacto
        const map = new Map();
        (questions.quiz2 || []).forEach(q => map.set(q.question?.trim(), q));
        extra.quiz2.forEach(q => { if (q?.question && !map.has(q.question.trim())) map.set(q.question.trim(), q); });
        questions.quiz2 = Array.from(map.values());
      }
    }
  } catch (e) {
    console.warn('questions_extra.json no disponible (se continúa con banco base).');
  }

  // 3) Inventario de señales (para imágenes y distractores)
  const csv = await fetch('inventario.csv', { cache: 'no-store' }).then(r => r.text());
  const rows = csv.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());
  const inventory = rows.slice(1).map(row => {
    const o = {}; headers.forEach((h, i) => (o[h] = (row[i] || '').trim())); return o;
  }).filter(o => o?.nombre_visible);

  // 4) Construir “quiz de Señales” a partir del inventario (se mantiene)
  questions.signals = inventory.map(it => {
    const img = it.url && it.url.startsWith('http') ? it.url : normalizePath(it.archivo);
    // Mantén el nombre original del inventario (ya que puede tener SR-xx o alias)
    const correct = it.nombre_visible;
    const wrongs = generateWrongOptionsFromInventory(correct, inventory);
    return {
      question: '¿Cuál es el nombre de esta señal?',
      image: img,
      options: Array.from(new Set([correct, ...wrongs])),
      correct
    };
  });

  // 5) NUEVO: inyectar preguntas del teórico #40–#49 con formato de señales
  injectTheoreticalSignalQuestions(inventory);

  // 6) UI dependiente de datos
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

/* ==================== Flujo de juego (igual que antes) ==================== */
function startQuiz(type, num = null) {
  quizType = type;

  if (type === 'quiz1') {
    currentQuiz = [...(questions.quiz1 || [])];
    shuffle(currentQuiz);
  } else if (type === 'quiz2') {
    const pool = [...(questions.quiz2 || [])]; shuffle(pool); currentQuiz = pool; // todas
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
  document.getElementById('quiz3-options').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';
  showQuestion(); updateScore();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) return endQuiz();

  document.getElementById('question').textContent = q.question || '';
  const imgEl = document.getElementById('question-image');

  if (q.image) {
    imgEl.src = q.image; imgEl.alt = 'Imagen relacionada con la pregunta'; imgEl.style.display = 'block';
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

function nextQuestion() { currentIndex++; (currentIndex < currentQuiz.length) ? showQuestion() : endQuiz(); }
function updateProgress() { const p = (currentIndex / (currentQuiz.length || 1)) * 100; document.getElementById('progress').style.width = `${p}%`; }
function updateScore() { document.getElementById('score').textContent = `Puntaje: ${score} / ${currentQuiz.length || 0}`; }

function endQuiz() {
  document.getElementById('quiz-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'block';
  document.getElementById('final-score').textContent = `Tu puntaje final: ${score} / ${currentQuiz.length || 0}`;

  if (wrongAnswers.length) {
    let s = 'Resumen de preguntas erradas:\n';
    wrongAnswers.forEach((w,i)=>{ s += `${i+1}. ${w.question}\n   Correcta: ${w.correct}\n`; });
    alert(s);
  } else {
    alert('¡Felicidades! No tuviste errores.');
  }
  wrongAnswers = [];
}

/* ==================== Listeners y carga ==================== */
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
  document.getElementById('quiz3-options').style.display = 'none';
};
document.addEventListener('keydown', (e) => {
  const inQuiz = document.getElementById('quiz-screen').style.display === 'block';
  if (!inQuiz) return;
  if (/^[1-9]$/.test(e.key)) {
    const idx = parseInt(e.key, 10) - 1;
    const btn = document.querySelector(`#options button:nth-of-type(${idx + 1})`);
    if (btn && !btn.disabled) btn.click();
  }
  if (e.key === 'Enter') {
    const next = document.getElementById('next-btn');
    if (!next.disabled) next.click();
  }
});

loadQuestions();
