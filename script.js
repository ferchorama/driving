// script.js (fixed & improved)
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];

// Utility: Fisher–Yates shuffle (in place)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Build 3 unique wrong options for a given correct answer
function generateWrongOptions(correctAnswer, data) {
  const pool = new Set();
  while (pool.size < 3) {
    const randomItem = data[Math.floor(Math.random() * data.length)];
    if (!randomItem || !randomItem.nombre_visible) continue;
    if (randomItem.nombre_visible !== correctAnswer) {
      pool.add(randomItem.nombre_visible);
    }
  }
  return Array.from(pool);
}

async function loadQuestions() {
  try {
    // 1) Questions from JSON (teórico & código)
    const response = await fetch('questions.json');
    questions = await response.json();

    // 2) Señales from CSV -> dynamic question set
    const csvResponse = await fetch('inventario.csv');
    const csvText = await csvResponse.text();

    // Simple CSV parse (no quoted commas in your file)
    const rows = csvText.trim().split('\n').map(r => r.split(','));
    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });

    // Build Señales questions
    // Prefer local images; normalize backslashes to forward slashes
    questions.signals = data
      .filter(item => item && item.nombre_visible && item.archivo) // guard
      .map(item => {
        const localPath = String(item.archivo).replace(/\\/g, '/'); // e.g. "Reglamentarias/Pare.png"
        const correct = item.nombre_visible;

        const distractors = generateWrongOptions(correct, data);
        const options = shuffle([correct, ...distractors]);

        return {
          question: '¿Cuál es el nombre de esta señal?',
          image: localPath,          // local asset
          // If you prefer remote fallback later: image: item.url || localPath,
          options,
          correct
        };
      });
  } catch (err) {
    console.error('Error cargando datos:', err);
    alert('Ocurrió un problema cargando las preguntas. Revisa que questions.json e inventario.csv estén accesibles.');
  }
}

function startQuiz(type, num = null) {
  quizType = type;

  if (type === 'quiz1') {
    // Teórico (70 preguntas) – usar todas y barajar
    currentQuiz = [...(questions.quiz1 || [])];
    shuffle(currentQuiz);
  } else if (type === 'quiz2') {
    // Código Nacional – tomar N aleatorias
    const base = [...(questions.quiz2 || [])];
    shuffle(base);
    currentQuiz = base.slice(0, Number.isFinite(num) ? num : 10);
  } else if (type === 'signals') {
    // Señales – tomar N aleatorias de las generadas
    const base = [...(questions.signals || [])];
    shuffle(base);
    currentQuiz = base.slice(0, Number.isFinite(num) ? num : 10);
  } else {
    currentQuiz = [];
  }

  currentIndex = 0;
  score = 0;
  wrongAnswers = [];

  // Safety: if no questions, inform and return to start
  if (!currentQuiz.length) {
    alert('No se encontraron preguntas para este modo.');
    return;
  }

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';
  showQuestion();
  updateScore();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) return;

  // Enunciado
  document.getElementById('question').textContent = q.question || '';

  // Imagen (solo si aplica)
  const imageElement = document.getElementById('question-image');
  if (q.image) {
    imageElement.src = q.image;
    imageElement.style.display = 'block';
  } else {
    imageElement.style.display = 'none';
  }

  // Descripción opcional
  const imageDesc = document.getElementById('image-desc');
  if (q.imageDesc) {
    imageDesc.textContent = q.imageDesc;
    imageDesc.style.display = 'block';
  } else {
    imageDesc.style.display = 'none';
  }

  // Respuestas
  const optionsDiv = document.getElementById('options');
  optionsDiv.innerHTML = '';

  // Guard: asegurar 4 opciones
  const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
  if (opts.length < 4 && q.correct) {
    // Si por alguna razón hay menos, completamos con el correct/distractores únicos
    const fallback = new Set(opts);
    fallback.add(q.correct);
    while (fallback.size < 4) {
      const rnd = currentQuiz[Math.floor(Math.random() * currentQuiz.length)];
      if (rnd && Array.isArray(rnd.options)) {
        const candidate = rnd.options[Math.floor(Math.random() * rnd.options.length)];
        if (candidate && candidate !== q.correct) fallback.add(candidate);
      } else {
        break;
      }
    }
    shuffle((q.options = Array.from(fallback).slice(0, 4)));
  }

  shuffle(q.options).forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt;
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
      btn.style.backgroundColor = '#03dac6'; // correcto (verde-agua)
    }
    if (btn.textContent === selected && selected !== correct) {
      btn.style.backgroundColor = '#cf6679'; // incorrecto (rojo)
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
  const progress = (currentIndex / currentQuiz.length) * 100;
  document.getElementById('progress').style.width = `${progress}%`;
}

function updateScore() {
  document.getElementById('score').textContent = `Puntaje: ${score} / ${currentQuiz.length}`;
}

function endQuiz() {
  document.getElementById('quiz-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'block';
  document.getElementById('final-score').textContent = `Tu puntaje final: ${score} / ${currentQuiz.length}`;

  if (wrongAnswers.length > 0) {
    let summary = "Resumen de preguntas erradas:\n";
    wrongAnswers.forEach((item, index) => {
      summary += `${index + 1}. Pregunta: ${item.question}\n   Respuesta correcta: ${item.correct}\n`;
    });
    alert(summary);
  } else {
    alert("¡Felicidades! No tuviste errores.");
  }
  wrongAnswers = []; // limpiar para el próximo juego
}

// Botones / wiring
document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');

document.getElementById('quiz2-btn').onclick = () => {
  document.getElementById('quiz2-options').style.display = 'block';
};
document.getElementById('start-quiz2').onclick = () => {
  const num = parseInt(document.getElementById('num-questions').value);
  startQuiz('quiz2', num);
};

document.getElementById('quiz3-btn').onclick = () => {
  document.getElementById('quiz3-options').style.display = 'block';
};
document.getElementById('start-quiz3').onclick = () => {
  const num = parseInt(document.getElementById('num-questions-3').value);
  startQuiz('signals', num);
};

document.getElementById('next-btn').onclick = nextQuestion;
document.getElementById('restart-btn').onclick = () => {
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('quiz2-options').style.display = 'none';
  document.getElementById('quiz3-options').style.display = 'none';
};

// Kickoff
loadQuestions();
