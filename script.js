// script.js — Mejoras:
// 1) "Código Nacional" usa SIEMPRE todas las preguntas y ahora fusiona questions_extra.json (si existe) con respuestas más contextuales.
// 2) Normaliza nombres de señales (SR-xx, SP-xx) en el quiz de Señales.
// 3) En el quiz Teórico, si la pregunta alude a señales, intenta añadir imagen desde inventario.csv; si no hay, añade descripción textual.

let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0; // total de señales (inventario.csv)

// -------- Utilidades generales --------
const normalizePath = (p) => (p || '').replace(/\\/g, '/').replace(/^\.?\//, '');
const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
  .replace(/[^a-z0-9]+/g, ' ')                       // limpia símbolos
  .trim();

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// -------- Mapa oficial de nombres y descripciones (subset frecuente) --------
// Basado en listados SR/SP del Manual de Señalización y compendios públicos.
// Códigos -> { name, desc, aliases: [sinónimos comunes] }
const OFFICIAL_SIGNALS = {
  // Reglamentarias (SR)
  'SR-01': { name: 'PARE', desc: 'Detener completamente el vehículo y reanudar la marcha solo cuando sea seguro.', aliases: ['pare'] },
  'SR-02': { name: 'CEDA EL PASO', desc: 'Ceder la prioridad a los vehículos de la vía principal.', aliases: ['ceda', 'ceda el paso'] },
  'SR-03': { name: 'SIGA DE FRENTE', desc: 'Circulación obligatoria de frente.', aliases: ['siga de frente', 'solo de frente'] },
  'SR-04': { name: 'NO PASE', desc: 'Prohibición de ingresar a una zona restringida.', aliases: ['no pase', 'prohibido el paso', 'entrada prohibida'] },
  'SR-05': { name: 'GIRO SOLAMENTE A LA IZQUIERDA', desc: 'Único movimiento permitido: girar a la izquierda.', aliases: ['solo giro izquierda', 'giro solo izquierda'] },
  'SR-07': { name: 'GIRO SOLAMENTE A LA DERECHA', desc: 'Único movimiento permitido: girar a la derecha.', aliases: ['solo giro derecha', 'giro solo derecha'] },
  'SR-06': { name: 'PROHIBIDO GIRAR A LA IZQUIERDA', desc: 'Prohibición de girar a la izquierda.', aliases: ['no girar izquierda', 'prohibido virar izquierda'] },
  'SR-08': { name: 'PROHIBIDO GIRAR A LA DERECHA', desc: 'Prohibición de girar a la derecha.', aliases: ['no girar derecha', 'prohibido virar derecha'] },
  'SR-10': { name: 'PROHIBIDO GIRAR EN U', desc: 'Prohibición de realizar giro en U.', aliases: ['no u', 'no girar en u', 'no retorno'] },
  'SR-28': { name: 'PROHIBIDO PARQUEAR', desc: 'Prohibición de estacionar en el tramo señalado.', aliases: ['no parquear', 'prohibido estacionar'] },
  'SR-28A': { name: 'NO PARQUEAR NI DETENERSE', desc: 'Prohibición de parquear o detenerse.', aliases: ['no estacionar ni detenerse'] },
  'SR-30': { name: 'VELOCIDAD MÁXIMA', desc: 'Indica el límite máximo de velocidad permitido.', aliases: ['velocidad maxima', 'limite de velocidad'] },
  'SR-38': { name: 'SENTIDO ÚNICO DE CIRCULACIÓN', desc: 'Vía de un solo sentido.', aliases: ['sentido unico', 'una via'] },
  'SR-39': { name: 'SENTIDO DE CIRCULACIÓN DOBLE', desc: 'Vía con doble sentido de circulación.', aliases: ['doble via', 'doble sentido'] },

  // Preventivas (SP)
  'SP-20': { name: 'GLORIETA', desc: 'Aproximación a intersección tipo rotonda.', aliases: ['glorieta', 'rotatoria', 'rotonda'] },
  'SP-23': { name: 'SEMÁFORO', desc: 'Intersección controlada por semáforos.', aliases: ['semaforo'] },
  'SP-25': { name: 'RESALTO', desc: 'Protuberancia transversal en la vía.', aliases: ['resalto', 'lomo de burro', 'reductor'] },
  'SP-01': { name: 'CURVA PELIGROSA A LA IZQUIERDA', desc: 'Curva pronunciada a la izquierda.', aliases: ['curva izq peligrosa'] },
  'SP-02': { name: 'CURVA PELIGROSA A LA DERECHA', desc: 'Curva pronunciada a la derecha.', aliases: ['curva der peligrosa'] }
};

// Índice rápido por alias (texto normalizado) -> código
const ALIAS_TO_CODE = (() => {
  const map = new Map();
  Object.entries(OFFICIAL_SIGNALS).forEach(([code, obj]) => {
    map.set(norm(code), code);
    map.set(norm(obj.name), code);
    (obj.aliases || []).forEach(a => map.set(norm(a), code));
  });
  return map;
})();

// Descripción breve por código (para fallback textual en Quiz Teórico)
function codeToShortDesc(code) {
  const o = OFFICIAL_SIGNALS[code];
  return o ? `${o.name}: ${o.desc}` : '';
}

// -------- Señales: generar distractores (para inventario.csv) --------
function generateWrongOptions(correctAnswer, pool) {
  const set = new Set();
  while (set.size < 3 && set.size < Math.max(0, pool.length - 1)) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    const candidate = r?.nombre_visible;
    if (candidate && candidate !== correctAnswer) set.add(candidate);
  }
  return Array.from(set);
}

// -------- Fusión segura de preguntas (quiz2) --------
function mergeQuiz2(base = [], extra = []) {
  const map = new Map();
  base.forEach(q => { if (q?.question) map.set(q.question.trim(), q); });
  extra.forEach(q => {
    if (q?.question) {
      const key = q.question.trim();
      if (!map.has(key)) map.set(key, q);
    }
  });
  return Array.from(map.values());
}

// -------- Post-proceso: normalizar nombres de señales para el quiz de Señales --------
function standardizeSignalName(rawName = '') {
  const key = norm(rawName);
  const code = ALIAS_TO_CODE.get(key);
  if (code) return `${code} ${OFFICIAL_SIGNALS[code].name}`;
  // Heurísticas comunes
  if (/^pare$/.test(key)) return 'SR-01 PARE';
  if (/^ceda( el paso)?$/.test(key)) return 'SR-02 CEDA EL PASO';
  if (/velocidad maxima?/.test(key)) return 'SR-30 VELOCIDAD MÁXIMA';
  if (/prohibido .*u/.test(key)) return 'SR-10 PROHIBIDO GIRAR EN U';
  if (/gloriet/.test(key)) return 'SP-20 GLORIETA';
  if (/semafor/.test(key)) return 'SP-23 SEMÁFORO';
  return rawName; // si no sabemos, no tocamos
}

// Busca un ítem de inventario por nombre oficial (robusto a acentos/sinónimos)
function findInventoryByOfficialName(officialName, inventory) {
  const n = norm(officialName);
  let best = null;
  let bestScore = 0;

  for (const it of inventory) {
    const label = norm(it.nombre_visible);
    // coincidencia exacta
    if (label === n) return it;
    // coincidencias parciales ponderadas
    let score = 0;
    if (label.includes(n)) score += 2;
    // palabras clave de la oficial
    for (const w of n.split(' ')) {
      if (w.length > 2 && label.includes(w)) score += 1;
    }
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return best;
}

// Intenta anexar imagen/descripcion a preguntas del quiz teórico que mencionen señales
function enhanceTheoreticalSignalQuestions(quiz1 = [], inventory = []) {
  if (!Array.isArray(quiz1) || !quiz1.length) return;

  // patrones típicos: SR-xx, SP-xx, "señal ..." con nombre corto
  const codeRe = /\bS[RP]-\d{2,3}\b/i;

  quiz1.forEach(q => {
    if (!q || !q.question) return;
    let text = q.question;
    let codeMatch = text.match(codeRe);
    let code = codeMatch ? codeMatch[0].toUpperCase() : null;

    // Si no hay código explícito, intenta por nombre dentro del texto
    if (!code) {
      // buscar alias en el texto
      const words = norm(text).split(' ');
      for (let i = 0; i < words.length; i++) {
        const w = words.slice(i, i + 4).join(' '); // n-gram sencillo
        const maybe = ALIAS_TO_CODE.get(w);
        if (maybe) { code = maybe; break; }
      }
      if (!code) {
        // intenta por cada alias conocido
        for (const [aliasKey, c] of ALIAS_TO_CODE.entries()) {
          if (norm(text).includes(aliasKey)) { code = c; break; }
        }
      }
    }

    if (code && OFFICIAL_SIGNALS[code]) {
      // Buscar imagen en inventario por nombre oficial
      const officialLabel = `${code} ${OFFICIAL_SIGNALS[code].name}`;
      const candidate = findInventoryByOfficialName(officialLabel, inventory) ||
                       findInventoryByOfficialName(OFFICIAL_SIGNALS[code].name, inventory);
      if (candidate) {
        q.image = candidate.url && candidate.url.startsWith('http')
          ? candidate.url
          : normalizePath(candidate.archivo);
      } else {
        // Sin imagen: añadir descripción corta al enunciado (evita el "número" crudo)
        const desc = codeToShortDesc(code);
        if (desc && !text.toLowerCase().includes(desc.toLowerCase())) {
          q.question = `${text} — Descripción: ${desc}`;
        }
      }
    } else {
      // Si la pregunta contiene algo como "señal 01" sin contexto, intenta suavizar con descripción genérica
      if (/\bse(ñ|n)al\b.*\b\d+\b/i.test(text)) {
        q.question = `${text} — Recuerda interpretar la figura: prioriza forma, color y símbolo.`;
      }
    }
  });
}

// -------- Carga de bancos --------
async function loadQuestions() {
  // 1) Banco base (quiz1/quiz2)
  const response = await fetch('questions.json', { cache: 'no-store' });
  questions = await response.json();

  // 2) Banco extra (quiz2) con respuestas más contextuales (opcional)
  try {
    const extraRes = await fetch('questions_extra.json', { cache: 'no-store' });
    if (extraRes.ok) {
      const extraData = await extraRes.json();
      const extraQuiz2 = Array.isArray(extraData?.quiz2) ? extraData.quiz2 : [];
      questions.quiz2 = mergeQuiz2(questions.quiz2 || [], extraQuiz2);
    }
  } catch (e) {
    console.warn('questions_extra.json no disponible (se continúa con banco base).');
  }

  // 3) CSV de señales
  const csvResponse = await fetch('inventario.csv', { cache: 'no-store' });
  const csvText = await csvResponse.text();

  const rows = csvText.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());
  const inventory = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (row[i] || '').trim()));
    return obj;
  });

  // 4) Construir preguntas de Señales con nombres normalizados
  const inventoryClean = inventory.filter(it => it?.nombre_visible);
  const signals = inventoryClean.map(it => {
    const localPath = normalizePath(it.archivo);
    const imageSrc = it.url && it.url.startsWith('http') ? it.url : localPath;

    // Nombre visible corregido (si aplica)
    const official = standardizeSignalName(it.nombre_visible);
    const correct = official;

    // Distractores desde inventario (se usan nombres tal cual; luego normalizamos visibles)
    const wrongs = generateWrongOptions(it.nombre_visible, inventoryClean)
      .map(w => standardizeSignalName(w));

    const options = [correct, ...wrongs];

    return {
      question: '¿Cuál es el nombre de esta señal?',
      image: imageSrc,
      options: Array.from(new Set(options)), // evita duplicados
      correct
    };
  });

  questions.signals = signals;
  maxSignals = questions.signals.length;

  // 5) Mejorar preguntas del quiz teórico con imágenes/descripcion de señales
  enhanceTheoreticalSignalQuestions(questions.quiz1, inventoryClean);

  // 6) UI inicial dependiente de datos
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

// -------- Flujo del juego (sin cambios mayores) --------
function startQuiz(type, num = null) {
  quizType = type;

  if (type === 'quiz1') {
    currentQuiz = [...(questions.quiz1 || [])];
    shuffle(currentQuiz);
  } else if (type === 'quiz2') {
    // SIEMPRE todas las preguntas de Código Nacional (ya fusionadas si existía questions_extra.json)
    const pool = [...(questions.quiz2 || [])];
    shuffle(pool);
    currentQuiz = pool;
  } else if (type === 'signals') {
    const pool = [...(questions.signals || [])];
    shuffle(pool);
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
  document.getElementById('quiz3-options').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';

  showQuestion();
  updateScore();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) { endQuiz(); return; }

  document.getElementById('question').textContent = q.question;

  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.alt = 'Imagen relacionada con la pregunta';
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  // Opciones (UI con botones)
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
    if (btn.textContent === correct) {
      btn.style.backgroundColor = '#03dac6'; // correcta
      btn.style.color = '#000';
    }
    if (btn.textContent === String(selected) && selected !== correct) {
      btn.style.backgroundColor = '#cf6679'; // errada
    }
  });

  if (selected === correct) {
    score++;
  } else {
    wrongAnswers.push({
      question: currentQuiz[currentIndex]?.question || '',
      correct
    });
  }

  document.getElementById('next-btn').disabled = false;
  updateScore();
}

function nextQuestion() {
  currentIndex++;
  if (currentIndex < currentQuiz.length) {
    showQuestion();
  } else {
    endQuiz();
  }
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

// -------- Interacción --------
document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');
document.getElementById('quiz2-btn').onclick = () => startQuiz('quiz2'); // inicia directo con todas las preguntas

// Señales: panel opcional
document.getElementById('quiz3-btn').onclick = () => {
  const box = document.getElementById('quiz3-options');
  box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
};
document.getElementById('start-quiz3').onclick = () => {
  const num = parseInt(document.getElementById('num-questions-3').value, 10);
  startQuiz('signals', num);
};

// Navegación
document.getElementById('next-btn').onclick = nextQuestion;
document.getElementById('restart-btn').onclick = () => {
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('quiz3-options').style.display = 'none';
};

// Atajos (1–9 selecciona, Enter avanza)
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

// Cargar bancos
loadQuestions();
