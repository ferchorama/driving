// script.js — UI moderna + lógica estable (tema oscuro mantenido)
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

// Utilidad: normaliza rutas locales tipo "Carpeta\\archivo.png" -> "Carpeta/archivo.png"
const normalizePath = (p) => (p || '').replace(/\\/g, '/').replace(/^\.?\//, '');

// Fisher–Yates in-place
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Genera 3 opciones erróneas (distintas y ≠ correcta)
function generateWrongOptions(correctAnswer, pool) {
  const set = new Set();
  while (set.size < 3) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    const candidate = r?.nombre_visible;
    if (candidate && candidate !== correctAnswer) set.add(candidate);
  }
  return Array.from(set);
}

// Carga JSON + CSV de señales
async function loadQuestions() {
  try {
    // Banco teórico (quiz1/quiz2)
    const response = await fetch('questions.json');
    questions = await response.json();

    // CSV de señales
    const csvResponse = await fetch('inventario.csv');
    const csvText = await csvResponse.text();

    // Parse CSV (simple, sin comillas con comas internas)
    const rows = csvText.trim().split('\n').map(r => r.split(','));
    const headers = rows[0].map(h => h.trim());
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (row[i] || '').trim()));
      return obj;
    });

    // Crea preguntas de señales; usa URL externa si existe, si no fallback local normalizado
    questions.signals = data
      .filter(item => item?.nombre_visible)
      .map(item => {
        const localPath = normalizePath(item.archivo); // p.ej. "Reglamentarias/Pare.png"
        const imageSrc = item.url && item.url.startsWith('http') ? item.url : localPath;

        const correct = item.nombre_visible;
        const wrongs = generateWrongOptions(correct, data);
        const options = [correct, ...wrongs];

        return {
          question: '¿Cuál es el nombre de esta señal?',
          image: imageSrc,
          // caption/el nombre bajo la imagen removido a propósito
          options,
          correct
        };
      });

    // Guardar el máximo de señales y actualizar input/label en HTML
    maxSignals = questions.signals.length;
    const maxSpan = document.getElementById('max-signals');
    if (maxSpan) maxSpan.textContent = maxSignals;

    const inputSignals = document.getElementById('num-questions-3');
    if (inputSignals) {
      inputSignals.max = maxSignals;
      if (!inputSignals.value || Number(inputSignals.value) > maxSignals) {
        inputSignals.value = maxSignals; // precargar con el máximo
      }
    }
  } catch (err) {
    console.error('Error cargando bancos:', err);
    alert('No se pudieron cargar las preguntas. Verifica el hosting de questions.json e inventario.csv.');
  }
}

/* ---------------- Core flow ---------------- */

function startQuiz(type, num = null) {
  quizType = type;

  if (type === 'quiz1') {
    currentQuiz = [...(questions.quiz1 || [])];
    shuffle(currentQuiz);
  } else if (type === 'quiz2') {
    const pool = [...(questions.quiz2 || [])];
    shuffle(pool);
    currentQuiz = num ? pool.slice(0, num) : pool;
  } else if (type === 'signals') {
    const pool = [...(questions.signals || [])];
    shuffle(pool);

    // Asegurar rango válido
    let total = pool.length;
    let n = parseInt(num, 10);
    if (isNaN(n) || n <= 0 || n > total) n = total;

    currentQuiz = pool.slice(0, n);
  } else {
    currentQuiz = [];
  }

  currentIndex = 0;
  score = 0;
  wrongAnswers = [];

  // Transición de pantallas
  showScreen('quiz');

  showQuestion();
  updateScore();
  updateProgress(); // 0%
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) {
    endQuiz();
    return;
  }

  // Enunciado
  const qEl = document.getElementById('question');
  qEl.textContent = q.question || '';

  // Imagen (si aplica)
  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  // Opciones
  const optionsDiv = document.getElementById('options');
  optionsDiv.innerHTML = '';
  const opts = [...(q.options || [])];
  shuffle(opts);

  // Crear botones con animación progresiva
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.textContent = String(opt);
    btn.setAttribute('data-index', String(i));
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(6px)';
    btn.onclick = () => selectAnswer(opt, q.correct);
    optionsDiv.appendChild(btn);

    requestAnimationFrame(() => {
      setTimeout(() => {
        btn.style.transition = 'opacity 200ms ease, transform 200ms ease';
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0)';
      }, 40 * i);
    });
  });

  document.getElementById('next-btn').disabled = true;
  // Atajo por teclado
  enableKeyShortcuts();
  updateProgress();
}

function selectAnswer(selected, correct) {
  // Deshabilitar atajos mientras se colorea
  disableKeyShortcuts();

  const buttons = document.querySelectorAll('#options button');
  buttons.forEach(btn => {
    btn.disabled = true;
    const txt = btn.textContent;
    // estilos visuales
    if (txt === correct) btn.classList.add('correct');
    if (txt === String(selected) && selected !== correct) btn.classList.add('wrong');
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
  const bar = document.getElementById('progress');
  const progress = (currentIndex / (currentQuiz.length || 1)) * 100;
  bar.style.width = `${progress}%`;
}

function updateScore() {
  document.getElementById('score').textContent =
    `Puntaje: ${score} / ${currentQuiz.length || 0}`;
}

function endQuiz() {
  showScreen('end');
  document.getElementById('final-score').textContent =
    `Tu puntaje final: ${score} / ${currentQuiz.length || 0}`;

  if (wrongAnswers.length > 0) {
    let summary = "Resumen de preguntas erradas:\n";
    wrongAnswers.forEach((item, i) => {
      summary += `${i + 1}. Pregunta: ${item.question}\n   Respuesta correcta: ${item.correct}\n`;
    });
    // Nota: mantenemos alert para simplicidad; si prefieres, lo mostramos en pantalla.
    alert(summary);
  } else {
    alert("¡Felicidades! No tuviste errores.");
  }
  wrongAnswers = [];
}

/* ---------------- UI helpers ---------------- */

function showScreen(which) {
  const start = document.getElementById('start-screen');
  const quiz = document.getElementById('quiz-screen');
  const end = document.getElementById('end-screen');

  start.style.display = which === 'start' ? 'block' : 'none';
  quiz.style.display = which === 'quiz' ? 'block' : 'none';
  end.style.display = which === 'end' ? 'block' : 'none';

  // Toggle clase .visible para consistencia con CSS
  start.classList.toggle('visible', which === 'start');
  quiz.classList.toggle('visible', which === 'quiz');
  end.classList.toggle('visible', which === 'end');
}

function toggleDrawer(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'grid' : 'none';
}

/* ---------------- Keyboard shortcuts ---------------- */

let keyHandlerActive = false;

function keyHandler(e) {
  if (!keyHandlerActive) return;
  const code = e.key;

  // 1..9 selecciona opción
  if (/^[1-9]$/.test(code)) {
    const idx = parseInt(code, 10) - 1;
    const btn = document.querySelector(`#options button[data-index="${idx}"]`);
    if (btn && !btn.disabled) {
      btn.click();
    }
  }

  // Enter -> siguiente
  if (code === 'Enter') {
    const next = document.getElementById('next-btn');
    if (!next.disabled) next.click();
  }
}

function enableKeyShortcuts() {
  keyHandlerActive = true;
}

function disableKeyShortcuts() {
  keyHandlerActive = false;
}

/* ---------------- Event wiring ---------------- */

document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');

document.getElementById('quiz2-btn').onclick = () => {
  toggleDrawer('quiz2-options');
};
document.getElementById('start-quiz2').onclick = () => {
  const num = parseInt(document.getElementById('num-questions').value, 10);
  startQuiz('quiz2', num);
};

document.getElementById('quiz3-btn').onclick = () => {
  toggleDrawer('quiz3-options');
};
document.getElementById('start-quiz3').onclick = () => {
  const num = parseInt(document.getElementById('num-questions-3').value, 10);
  startQuiz('signals', num);
};

document.getElementById('next-btn').onclick = nextQuestion;

document.getElementById('restart-btn').onclick = () => {
  showScreen('start');
  // cerrar cajones si quedaron abiertos
  const q2 = document.getElementById('quiz2-options');
  const q3 = document.getElementById('quiz3-options');
  if (q2) q2.style.display = 'none';
  if (q3) q3.style.display = 'none';
};

// Tema: oscuro/claro (opcional, por defecto oscuro)
document.getElementById('theme-btn').onclick = () => {
  document.body.classList.toggle('light');
};

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Atajos globales
document.addEventListener('keydown', keyHandler);

// Cargar bancos al inicio
loadQuestions();
