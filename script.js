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
            btn.style.backgroundColor = '#cf667