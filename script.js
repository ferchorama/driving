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
    } else {
        currentQuiz = [...questions.quiz2].sort(() => 0.5 - Math.random()).slice(0, num);
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
    const imageDesc = document.getElementById('image-desc');
    if (q.imageDesc) {
        imageDesc.textContent = q.imageDesc;
        imageDesc.style.display = 'block';
    } else {
        imageDesc.style.display = 'none';
    }
    const optionsDiv = document.getElementById('options');
    optionsDiv.innerHTML = '';
    q.options.forEach(opt => {
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
document.getElementById('next-btn').onclick = nextQuestion;
document.getElementById('restart-btn').onclick = () => {
    document.getElementById('end-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'block';
    document.getElementById('quiz2-options').style.display = 'none';
};

loadQuestions();