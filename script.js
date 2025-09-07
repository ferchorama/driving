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

// ============== Eliminación agresiva de recuadros de explicación residuales ==============
function removeExplanationBoxes() {
  // Remueve cualquier elemento con id #explanation
  const exp = document.getElementById('explanation');
  if (exp && exp.parentNode) exp.parentNode.removeChild(exp);

  // Remueve/oculta elementos cuyo texto contenga el mensaje genérico
  const PHRASES = [
    'Cumplir las normas de tránsito protege la vida y la movilidad segura de todos los actores viales'
  ];
  const all = document.querySelectorAll('div, p, section, aside, article');
  all.forEach(el => {
    const txt = (el.textContent || '').trim();
    for (const ph of PHRASES) {
      if (txt && txt.indexOf(ph) !== -1) {
        if (el.childElementCount === 0 || /^explan|info|ayuda|nota$/i.test(el.id || '')) {
          el.remove();
        } else {
          el.style.display = 'none';
        }
        break;
      }
    }
  });
}

/* =========================================================================================
   A PARTIR DE AQUÍ: LÓGICA DEL JUEGO (carga de bancos, reemplazos, señales, etc.)
   ========================================================================================= */

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
  removeExplanationBoxes(); // limpieza inmediata por si existe algo en el DOM

  // Cargar banco base
  const base = await fetch('questions.json', { cache: 'no-store' }).then(r => r.json());
  questions = base;

  // Intentar fusionar extra (quiz1 y quiz2) si existe
  try {
    const extraRes = await fetch('questions_extra.json', { cache: 'no-store' });
    if (extraRes.ok) {
      const extra = await extraRes.json();
      // Fusion quiz1 sin duplicados
      if (Array.isArray(extra?.quiz1)) {
        const map = new Map();
        (questions.quiz1 || []).forEach(q => map.set((q.question || '').trim(), q));
        extra.quiz1.forEach(q => {
          const key = (q?.question || '').trim();
          if (key && !map.has(key)) map.set(key, q);
        });
        questions.quiz1 = Array.from(map.values());
      }
      // Fusion quiz2 sin duplicados
      if (Array.isArray(extra?.quiz2)) {
        const map = new Map();
        (questions.quiz2 || []).forEach(q => map.set((q.question || '').trim(), q));
        extra.quiz2.forEach(q => {
          const key = (q?.question || '').trim();
          if (key && !map.has(key)) map.set(key, q);
        });
        questions.quiz2 = Array.from(map.values());
      }
    }
  } catch (e) {
    // Si no existe questions_extra.json, seguimos sin error
  }

  // Cargar inventario de señales (CSV)
  const csv = await fetch('inventario.csv', { cache: 'no-store' }).then(r => r.text());
  const rows = csv.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());
  const inventory = rows.slice(1).map(row => {
    const o = {}; headers.forEach((h, i) => (o[h] = (row[i] || '').trim())); return o;
  }).filter(o => o?.nombre_visible);

  // Construir banco "Señales" desde inventario
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

  // Reemplazo de placeholders "DETERMINE QUE INDICA CADA SEÑAL" por 40–49
  const replacements = [
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

  const isDetermine = q => typeof q?.question === 'string' &&
    /^\s*determine que indica cada se(ñ|n)al/i.test(q.question);

  const findInv = (label) => {
    const target = label.toLowerCase();
    let best = null, score = 0;
    for (const it of inventory) {
      const cand = (it.nombre_visible || '').toLowerCase();
      let s = 0;
      if (cand === target) s += 3;
      if (cand.includes(target)) s += 2;
      if (s > score) { score = s; best = it; }
    }
    return best;
  };

  // Limpia placeholders existentes
  questions.quiz1 = (questions.quiz1 || []).filter(q => !isDetermine(q));
  // Inserta 40–49 como preguntas con imagen
  for (const r of replacements) {
    let image = r.img || null;
    if (!image) {
      const inv = findInv(r.correct);
      if (inv) image = inv.url && inv.url.startsWith('http') ? inv.url : normalizePath(inv.archivo);
    }
    const wrongs = generateWrongOptions(r.correct, inventory);
    questions.quiz1.push({
      question: `(#${r.num}) ¿Cuál es el nombre de esta señal?`,
      image,
      options: [r.correct, ...wrongs],
      correct: r.correct
    });
  }

  // UI dependiente de cantidad de señales
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

// Inicia un quiz
function startQuiz(type, num = null) {
  quizType = type;

  if (type === 'quiz1') {
    currentQuiz = [...(questions.quiz1 || [])];
    shuffle(currentQuiz);
  } else if (type === 'quiz2') {
    const pool = [...(questions.quiz2 || [])];
    shuffle(pool);
    currentQuiz = pool; // Siempre TODAS
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
  document.getElementById('quiz2-options').style.display = 'none';
  document.getElementById('quiz3-options').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';

  showQuestion();
  updateScore();
}

// Pinta la pregunta actual
function showQuestion() {
  removeExplanationBoxes(); // por si quedara algún recuadro en el DOM

  const q = currentQuiz[currentIndex];
  if (!q) {
    endQuiz();
    return;
  }

  // Pregunta
  const questionEl = document.getElementById('question');
  questionEl.textContent = q.question || '';

  // Imagen (si aplica)
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

  // Botón siguiente bloqueado hasta responder
  document.getElementById('next-btn').disabled = true;

  // Progreso
  const progress = (currentIndex / (currentQuiz.length || 1)) * 100;
  document.getElementById('progress').style.width = `${progress}%`;
}

// Selección de respuesta
function selectAnswer(selected, correct) {
  const buttons = document.querySelectorAll('#options button');
  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === correct) {
      btn.style.backgroundColor = '#03dac6';
      btn.style.color = '#000';
    }
    if (btn.textContent === String(selected) && selected !== correct) {
      btn.style.backgroundColor = '#cf6679';
    }
  });

  if (selected === correct) score++;
  else wrongAnswers.push({ question: currentQuiz[currentIndex]?.question || '', correct });

  document.getElementById('next-btn').disabled = false;
  updateScore();
}

// Siguiente / fin
function nextQuestion() {
  currentIndex++;
  if (currentIndex < currentQuiz.length) {
    showQuestion();
  } else {
    endQuiz();
  }
}

// Puntaje
function updateScore() {
  document.getElementById('score').textContent = `Puntaje: ${score} / ${currentQuiz.length || 0}`;
}

// Fin de quiz
function endQuiz() {
  document.getElementById('quiz-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'block';
  document.getElementById('final-score').textContent = `Tu puntaje final: ${score} / ${currentQuiz.length || 0}`;

  if (wrongAnswers.length > 0) {
    let s = 'Resumen de preguntas erradas:\n';
    wrongAnswers.forEach((w, i) => {
      s += `${i + 1}. ${w.question}\n   Correcta: ${w.correct}\n`;
    });
    alert(s);
  } else {
    alert('¡Felicidades! No tuviste errores.');
  }
  wrongAnswers = [];
}

/* ========================== Listeners ========================== */
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

// Cargar bancos
loadQuestions();
