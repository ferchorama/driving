// script.js — Rediseño completo con opciones tipo tarjetas (radios) y lógica estable
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

/* ---------- Utilidades ---------- */
const normalizePath = (p) => (p || '').replace(/\\/g, '/').replace(/^\.?\//, '');

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function generateWrongOptions(correctAnswer, pool) {
  const set = new Set();
  while (set.size < 3) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    const candidate = r?.nombre_visible;
    if (candidate && candidate !== correctAnswer) set.add(candidate);
  }
  return Array.from(set);
}

/* ---------- Carga de bancos ---------- */
async function loadQuestions() {
  try {
    const response = await fetch('questions.json');
    questions = await response.json();

    const csvResponse = await fetch('inventario.csv');
    const csvText = await csvResponse.text();

    const rows = csvText.trim().split('\n').map(r => r.split(','));
    const headers = rows[0].map(h => h.trim());
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = (row[i] || '').trim());
      return obj;
    });

    questions.signals = data
      .filter(item => item?.nombre_visible)
      .map(item => {
        const localPath = normalizePath(item.archivo);
        const imageSrc = item.url && item.url.startsWith('http') ? item.url : localPath;
        const correct = item.nombre_visible;
        const wrongs = generateWrongOptions(correct, data);
        return {
          question: '¿Cuál es el nombre de esta señal?',
          image: imageSrc,
          options: [correct, ...wrongs],
          correct
        };
      });

    // Máximo para el input del modo Señales
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

    // Footer
    document.getElementById('year').textContent = new Date().getFullYear();

  } catch (err) {
    console.error('Error cargando preguntas:', err);
    alert('No se pudieron cargar los bancos. Revisa questions.json e inventario.csv.');
  }
}

/* ---------- Flujo principal ---------- */
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

  // Pantallas
  showScreen('quiz');

  showQuestion();
  updateScore();
  updateProgress();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) { endQuiz(); return; }

  // Texto de la pregunta
  document.getElementById('question').textContent = q.question || '';

  // Imagen (si aplica)
  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  // Opciones (radios + labels como tarjetas)
  const optionsForm = document.getElementById('options');
  optionsForm.innerHTML = '';
  const opts = [...(q.options || [])];
  shuffle(opts);

  opts.forEach((opt, i) => {
    const id = `opt-${currentIndex}-${i}`;
    const label = document.createElement('label');
    label.className = 'option-card';
    label.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'answer';
    input.value = String(opt);
    input.id = id;

    const span = document.createElement('span');
    span.className = 'option-text';
    span.textContent = String(opt);

    label.appendChild(input);
    label.appendChild(span);
    optionsForm.appendChild(label);

    input.onchange = () => selectAnswer(opt, q.correct);
  });

  // Control de navegación
  setNextEnabled(false);
  enableKeyShortcuts();
  updateProgress();
}

function selectAnswer(selected, correct) {
  disableKeyShortcuts();

  // Colorear tarjetas y deshabilitar cambios
  const cards = document.querySelectorAll('.option-card');
  cards.forEach(card => {
    const inp = card.querySelector('input[type="radio"]');
    inp.disabled = true;
    card.classList.add('disabled');
    if (inp.value === correct) card.classList.add('correct');
    if (inp.value === String(selected) && selected !== correct) card.classList.add('wrong');
  });

  if (selected === correct) {
    score++;
  } else {
    wrongAnswers.push({
      question: currentQuiz[currentIndex]?.question || '',
      correct
    });
  }

  setNextEnabled(true);
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
  showScreen('end');
  document.getElementById('final-score').textContent =
    `Tu puntaje final: ${score} / ${currentQuiz.length || 0}`;

  // Mantengo alert para no alterar flujo; si quieres lo pasamos a una tabla en pantalla
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

/* ---------- UI helpers ---------- */
function showScreen(which) {
  const start = document.getElementById('start-screen');
  const quiz = document.getElementById('quiz-screen');
  const end = document.getElementById('end-screen');

  start.style.display = which === 'start' ? 'block' : 'none';
  quiz.style.display = which === 'quiz' ? 'block' : 'none';
  end.style.display = which === 'end' ? 'block' : 'none';

  start.classList.toggle('visible', which === 'start');
  quiz.classList.toggle('visible', which === 'quiz');
  end.classList.toggle('visible', which === 'end');
}

function toggleDrawer(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'grid' : 'none';
}

function setNextEnabled(enabled) {
  const a = document.getElementById('next-btn');
  if (enabled) {
    a.classList.remove('disabled');
    a.setAttribute('aria-disabled', 'false');
  } else {
    a.classList.add('disabled');
    a.setAttribute('aria-disabled', 'true');
  }
}

/* ---------- Atajos de teclado ---------- */
let keyHandlerActive = false;

function keyHandler(e) {
  if (!keyHandlerActive) return;
  const code = e.key;

  // 1..9 -> seleccionar opción
  if (/^[1-9]$/.test(code)) {
    const idx = parseInt(code, 10) - 1;
    const input = document.querySelector(`#options input[type="radio"]:not(:disabled):nth-of-type(${idx + 1})`);
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Enter -> siguiente
  if (code === 'Enter') {
    const next = document.getElementById('next-btn');
    if (!next.classList.contains('disabled')) next.click();
  }
}
function enableKeyShortcuts(){ keyHandlerActive = true; }
function disableKeyShortcuts(){ keyHandlerActive = false; }

/* ---------- Wiring ---------- */
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
  document.getElementById('quiz2-options').style.display = 'none';
  document.getElementById('quiz3-options').style.display = 'none';
};

document.addEventListener('keydown', keyHandler);

/* ---------- Inicio ---------- */
loadQuestions();
