// script.js
let questions = {};
let currentQuiz = [];
let currentIndex = 0;
let score = 0;
let quizType = '';
let wrongAnswers = [];

async function loadQuestions() {
    const response = await fetch('questions.json');
    questions = await response.json();

    // Cargar datos del CSV de señales (versión corregida y robusta)
    const csvResponse = await fetch('inventario.csv');
    const csvText = await csvResponse.text();
    const rows = csvText.trim().split(/\r?\n/); // Divide por líneas, compatible con Windows/Mac/Linux
    const headers = rows.shift().split(',').map(h => h.trim());

    const data = rows.map(rowStr => {
        const row = rowStr.split(',');
        let obj = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] ? row[index].trim() : '';
        });
        return obj;
    }).filter(item => item.nombre_visible); // Filtra cualquier fila vacía

    // Crear preguntas basadas en las señales
    questions.signals = data.map(item => ({
        question: `¿Cuál es el nombre de esta señal?`,
        image: item.archivo.replace(/\\/g, '/'), // Corrige la ruta de la imagen
        options: [item.nombre_visible, ...generateWrongOptions(item.nombre_visible, data)],
        correct: item.nombre_visible
    }));
}


function generateWrongOptions(correctAnswer, data) {
    let wrongOptions = new Set();
    while (wrongOptions.size < 3) {
        const randomItem = data[Math.floor(Math.random() * data.length)];
        if (randomItem.nombre_visible !== correctAnswer) {
            wrongOptions.add(randomItem.nombre_visible);
        }
    }
    return Array.from(wrongOptions);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function startQuiz(type, num = null) {
    quizType = type;
    if (type === 'quiz1') {
        currentQuiz = [...questions.quiz1];
        shuffle(currentQuiz);
    } else if (type === 'quiz2') {
        currentQuiz = [...questions.quiz2].sort(() => 0.5 - Math.random()).slice(0, num);
    } else if (type === 'signals') {
        currentQuiz = [...questions.signals].sort(() => 0.5 - Math.random()).slice(0, num);
    }
    currentIndex = 0;
    score = 0;
    wrongAnswers = [];
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('quiz-screen').style.display = 'block';
    showQuestion();
    updateScore();
}

function showQuestion() {
    const q = currentQuiz[currentIndex];
    document.getElementById('question').textContent = q.question;
    const imageElement = document.getElementById('question-image');
    if (q.image) {
        imageElement.src = q.image;
        imageElement.style.display = 'block';
    } else {
        imageElement.style.display = 'none';
    }
    const imageDesc = document.getElementById('image-desc');
    if (q.imageDesc) {
        imageDesc.textContent = q.imageDesc;
        imageDesc.style.display = 'block';
    } else {
        imageDesc.style.display = 'none';
    }
    const optionsDiv = document.getElementById('options');
    optionsDiv.innerHTML = '';
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
            btn.style.backgroundColor = '#03dac6';
        }
        if (btn.textContent === selected && selected !== correct) {
            btn.style.backgroundColor = '#cf6679';
        }
    });
    if (selected === correct) score++;
    else {
        wrongAnswers.push({ question: currentQuiz[currentIndex].question, correct: correct });
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
    wrongAnswers = []; // Clear for next game
}

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

loadQuestions();