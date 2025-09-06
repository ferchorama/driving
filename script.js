// script.js (reemplazo completo)
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0; // nuevo: para guardar total de señales

// Utilidad: normaliza rutas locales tipo "Carpeta\\archivo.png" -> "Carpeta/archivo.png"
const normalizePath = (p) => (p || '').replace(/\\/g, '/').replace(/^\.?\//, '');

// Fisher-Yates in-place
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Genera 3 opciones erróneas (todas distintas y ≠ correcta)
function generateWrongOptions(correctAnswer, pool) {
  const set = new Set();
  while (set.size < 3) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    const candidate = r.nombre_visible;
    if (candidate && candidate !== correctAnswer) set.add(candidate);
  }
  return Array.from(set);
}

// Carga JSON + CSV de señales
async function loadQuestions() {
  // Banco teórico (quiz1/quiz2)
  const response = await fetch('questions.json');
  questions = await response.json();

  // CSV de señales
  const csvResponse = await fetch('inventario.csv');
  const csvText = await csvResponse.text();

  // Parse CSV
  const rows = csvText.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (row[i] || '').trim());
    return obj;
  });

  // Crea preguntas de señales
  questions.signals = data.map(item => {
    const localPath = normalizePath(item.archivo);
    const imageSrc = item.url && item.url.startsWith('http') ? item.url : localPath;

    const correct = item.nombre_visible;
    const wrongs = generateWrongOptions(correct, data);
    const options = [correct, ...wrongs];

    return {
      question: '¿Cuál es el nombre de esta señal?',
      image: imageSrc,
      options,
      correct
    };
  });

  // Guardar el máximo de señales y actualizar input en HTML
  maxSignals = questions.signals.length;
  const maxSpan = document.getElementById('max-signals');
  if (maxSpan) maxSpan.textContent = maxSignals;

  const inputSignals = document.getElementById('num-questions-3');
  if (inputSignals) inputSignals.max = maxSignals;
}

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

    // Aseguramos que num sea válido
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

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quiz2-options').style.display = 'none';
  document.getElementById('quiz3-options').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';

  showQuestion();
  updateScore();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) {
    endQuiz();
    return;
  }

  document.getElementById('question').textContent = q.question;

  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  // Opciones: clonar → barajar → pintar
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
    }
    if (btn.textContent === String(selected) && selected !== correct) {
      btn.style.backgroundColor = '#cf6679'; // errada
    }
  });

  if (selected === correct) {
    score++;
  } else {
    wrongAnswers.push({
      question: currentQuiz[currentIndex].question,
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
  document.getElementById('final-score').textContent = `Tu puntaje final: ${score} / ${currentQuiz.length || 0}`;

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

// Listeners
document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');

document.getElementById('quiz2-btn').onclick = () => {
  document.getElementById('quiz2-options').style.display = 'block';
};
document.getElementById('start-quiz2').onclick = () => {
  const num = parseInt(document.getElementById('num-questions').value, 10);
  startQuiz('quiz2', num);
};

document.getElementById('quiz3-btn').onclick = () => {
  document.getElementById('quiz3-options').style.display = 'block';
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

// Cargar bancos
loadQuestions();
