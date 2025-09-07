// script.js — Reemplazo de placeholders "DETERMINE QUE INDICA CADA SEÑAL"
// en el QUIZ TEÓRICO por preguntas con imagen (estilo Quiz 3) y 4 opciones.
// Fix puntuales:
//   #40 -> "Reglamentarias/Prohibida Bicicletas.png"
//   #41 -> "Reglamentarias/Prohibido Girar En U.png"
//   #49 -> "Reglamentarias/Prohibido fumar.webp"
// Además mantiene: Código Nacional usa todas las preguntas, señales desde inventario, etc.

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

/* ============== Distractores ============== */
function generateWrongOptionsFromInventory(correct, inventory, need = 3) {
  const pool = inventory.map(it => it.nombre_visible).filter(Boolean);
  shuffle(pool);
  const set = new Set();
  for (const name of pool) {
    if (set.size >= need) break;
    if (name && name !== correct) set.add(name);
  }
  // Si el inventario no alcanza, rellena con señuelos genéricos no repetidos
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

/* ============== Búsqueda en inventario ============== */
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

    // bonus por coincidencia de palabra "clave"
    const keys = ['prohibido','ceda','velocidad','bocina','pitar','parquear','detenerse','bicicleta','fum','derecha','u','pesado','camion'];
    keys.forEach(k => { if (cand.includes(k) && target.includes(k)) score += 1; });

    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

/* ============== Mapeo #40–#49 solicitado ============== */
/* Nota: fixedImage fuerza usar esa ruta exacta ignorando el inventario. */
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

/* Construye una pregunta estilo “Señales” a partir del inventario */
function buildSignalQuestionFromInventory(item, inventory) {
  // 1) Imagen: si hay override (fixedImage), úsalo SIEMPRE
  let imageSrc;
  if (item.fixedImage) {
    imageSrc = normalizePath(item.fixedImage);
  } else {
    // buscar primero por correct, luego por sinónimos
    let imgRecord = findInventoryByNameLike(item.correct, inventory) || null;
    if (!imgRecord) {
      for (const s of item.synonyms || []) {
        imgRecord = findInventoryByNameLike(s, inventory);
        if (imgRecord) break;
      }
    }
    if (imgRecord) {
      imageSrc = (imgRecord.url && imgRecord.url.startsWith('http'))
        ? imgRecord.url
        : normalizePath(imgRecord.archivo);
    }
  }

  // 2) Opciones
  const wrongs = generateWrongOptionsFromInventory(item.correct, inventory, 3);
  const options = Array.from(new Set([item.correct, ...wrongs])); // evita repetidos

  // 3) Enunciado con referencia al número original
  const questionText = `(#${item.num}) ¿Cuál es el nombre de esta señal?`;

  return {
    question: questionText,
    image: imageSrc, // si no hay, queda undefined y <img> no se muestra
    options,
    correct: item.correct
  };
}

/* Elimina placeholders y añade las nuevas preguntas al quiz1 */
function replaceDeterminePlaceholders(inventory) {
  if (!Array.isArray(questions.quiz1)) questions.quiz1 = [];

  // 1) Filtra TODO lo que empiece con "DETERMINE QUE INDICA CADA SEÑAL"
  const re = /^\s*determine que indica cada se(ñ|n)al/i;
  questions.quiz1 = questions.quiz1.filter(q => !(q && typeof q.question === 'string' && re.test(q.question)));

  // 2) Construye las 10 preguntas y añádelas
  const newOnes = THEORETICAL_REPLACEMENTS.map(entry => buildSignalQuestionFromInventory(entry, inventory));
  questions.quiz1.push(...newOnes);
}

/* ============== Carga de bancos ============== */
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
        const map = new Map();
        (questions.quiz2 || []).forEach(q => map.set(q.question?.trim(), q));
        extra.quiz2.forEach(q => { if (q?.question && !map.has(q.question.trim())) map.set(q.question.trim(), q); });
        questions.quiz2 = Array.from(map.values());
      }
    }
  } catch (_) {
    // Ignora si no existe
  }

  // 3) Inventario de señales
  const csv = await fetch('inventario.csv', { cache: 'no-store' }).then(r => r.text());
  const rows = csv.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());
  const inventory = rows.slice(1).map(row => {
    const o = {}; headers.forEach((h, i) => (o[h] = (row[i] || '').trim())); return o;
  }).filter(o => o?.nombre_visible);

  // 4) Crear banco "Señales" completo desde inventario (se mantiene)
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

  // 5) **Reemplazar** los placeholders del teórico por preguntas con imagen (40–49)
  replaceDeterminePlaceholders(inventory);

  // 6) Datos dependientes de UI
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
    const pool = [...(questions.quiz2 || [])]; shuffle(pool); currentQuiz = pool; // TODAS
  } else if (type === 'signals') {
    const pool = [...(questions.signals || [])]; shuffle(pool);
    const total = pool.length;
    let n = parseInt(num, 10);
    if (isNaN(n) || n <= 0 || n > total) n = total;
    currentQuiz = pool.slice(0, n);
  } else {
    currentQuiz = [];
  }

  currentIndex = 0;
  score = 0;
  wrongAnswers = [];

  document.getElementById('start-screen').style.display = 'none';
  const cfg = document.getElementById('quiz3-options');
  if (cfg) cfg.style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';

  showQuestion();
  updateScore();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) { endQuiz(); return; }

  document.getElementById('question').textContent = q.question || '';

  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.alt = 'Imagen de la señal';
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  const optionsDiv = document.getElementById('options');
  optionsDiv.innerHTML = '';
  const opts = [...(q.options || [])];
  shuffle(opts);

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
  if (currentIndex < currentQuiz.length) showQuestion();
  else endQuiz();
}

function updateProgress() {
  const progress = (currentIndex / (currentQuiz.length || 1)) * 100;
  document.getElementById('progress').style.width = `${progress}%`;
}

function updateScore() {
  document.getElementById('score').textContent = `Puntaje: ${score} / ${currentQuiz.length || 0}`;
}

function endQuiz() {
  document.getElementById('quiz-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'block';
  document.getElementById('final-score').textContent =
    `Tu puntaje final: ${score} / ${currentQuiz.length || 0}`;

  if (wrongAnswers.length > 0) {
    let summary = "Resumen de preguntas erradas:\n";
    wrongAnswers.forEach((item, i) => {
      summary += `${i + 1}. Pregunta: ${item.question}\n   Respuesta correcta: ${item.correct}\n`;
    });
    alert(summary);
  } else {
    alert("¡Felicidades! No tuviste errores.");
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
  const box = document.getElementById('quiz3-options');
  if (box) box.style.display = 'none';
};

/* ============== Inicio ============== */
loadQuestions();
