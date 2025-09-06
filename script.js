// script.js — UI clásica/robusta + lógica estable
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];
let maxSignals = 0;

// Fallback ultra simple: si el CSS no se carga, aseguro que no quede "en crudo"
(function cssFallback(){
  document.addEventListener('DOMContentLoaded', () => {
    const test = getComputedStyle(document.body).backgroundColor;
    if (!test) {
      const s = document.createElement('style');
      s.textContent = `
        body{background:#0e1117;color:#e6eaf2;font:16px/1.5 system-ui;margin:0}
        .container{max-width:960px;margin:0 auto;padding:16px}
        .screen{padding:16px 0}
        .section{padding:12px;border:1px solid #2a2f3a;border-radius:8px;background:#141922;margin:12px 0}
        .btn{padding:10px 14px;border-radius:8px;border:1px solid #2a2f3a;background:#1b2130;color:#fff}
        .btn-primary{background:#1fbfa8;color:#08110f;border-color:#0c6b5e}
        .progress{height:10px;background:#1b2130;border:1px solid #2a2f3a;border-radius:8px;overflow:hidden}
        .progress-bar{height:100%;background:#1fbfa8;width:0%}
        .options{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
        .options button{padding:10px;border-radius:8px;background:#1b2130;border:1px solid #2a2f3a;color:#fff}
      `;
      document.head.appendChild(s);
    }
  });
})();

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

    // Parse CSV (simple)
    const rows = csvText.trim().split('\n').map(r => r.split(','));
    const headers = rows[0].map(h => h.trim());
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (row[i] || '').trim()));
      return obj;
    });

    // Armar preguntas de señales
    questions.signals = data
      .filter(item => item?.nombre_visible)
      .map(item => {
        const localPath = normalizePath(item.archivo); // ej: "Reglamentarias/Pare.png"
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

    // Máximo de señales disponibles
    maxSignals = questions.signals.length;
    document.getElementById('max-signals').textContent = maxSignals;
    const inputSignals = document.getElementById('num-questions-3');
    inputSignals.max = maxSignals;
    if (!inputSignals.value || Number(inputSignals.value) > maxSignals) {
      inputSignals.value = maxSignals;
    }

    // Año en footer
    document.getElementById('year').textContent = new Date().getFullYear();

  } catch (err) {
    console.error('Error cargando bancos:', err);
    alert('No se pudieron cargar las preguntas. Revisa questions.json e inventario.csv en el hosting.');
  }
}

/* ============== Flujo principal ============== */

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
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';
  document.getElementById('end-screen').style.display = 'none';

  showQuestion();
  updateScore();
  updateProgress();
}

function showQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) { endQuiz(); return; }

  // Enunciado
  document.getElementById('question').textContent = q.question || '';

  // Imagen (opcional)
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
    const txt = btn.textContent;
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

  // (Opcional) Mostrar resumen por alert para no alterar estructura inicial
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

/* ============== Enlaces de UI ============== */

document.getElementById('quiz1-btn').onclick = () => startQuiz('quiz1');

document.getElementById('quiz2-btn').onclick = () => {
  const box = document.getElementById('quiz2-options');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
};
document.getElementById('start-quiz2').onclick = () => {
  const num = parseInt(document.getElementById('num-questions').value, 10);
  startQuiz('quiz2', num);
};

document.getElementById('quiz3-btn').onclick = () => {
  const box = document.getElementById('quiz3-options');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
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
