// 1. SUPABASE SETTINGS
const SB_URL = "https://mnailfqtpdfrtosobhzg.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uYWlsZnF0cGRmcnRvc29iaHpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjEwOTEsImV4cCI6MjA4OTM5NzA5MX0.6NzjrUByJaYGROi5eAnw-uxgXHjG1C5FWxhw0Qr0KNk";

const { createClient } = supabase;
const _supabase = createClient(SB_URL, SB_KEY);

let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let answerResults = [];

// 2. Render units (Main screen)
async function renderUnits() {
    const grid = document.getElementById('unitGrid');
    if (!grid) return;

    grid.innerHTML = '<p class="loading-text" style="grid-column: 1/-1; text-align:center;">Loading...</p>';

    const { data, error } = await _supabase
        .from('vocabulary')
        .select('unit_number');

    if (error) {
        grid.innerHTML = '<p class="loading-text" style="grid-column: 1/-1; text-align:center;">Failed to load units.</p>';
        return;
    }

    const counts = {};
    let maxUnit = 0;
    if (data) {
        data.forEach(item => {
            const unit = Number(item.unit_number);
            if (!Number.isFinite(unit) || unit < 1) return;
            counts[unit] = (counts[unit] || 0) + 1;
            if (unit > maxUnit) maxUnit = unit;
        });
    }

    grid.innerHTML = '';
    const totalUnitsToRender = Math.max(15, maxUnit);
    for (let i = 1; i <= totalUnitsToRender; i++) {
        const wordCount = counts[i] || 0;
        const btn = document.createElement('button');

        // If there are words, add has-words class (for CSS)
        btn.className = wordCount > 0 ? 'unit-btn has-words' : 'unit-btn empty-unit';

        btn.innerHTML = `
            <span>Unit ${i}</span>
            <span class="unit-count">${wordCount} words</span>
        `;

        if (wordCount > 0) {
            btn.onclick = () => loadUnitData(i);
        }
        grid.appendChild(btn);
    }
}

// 3. Load data
async function loadUnitData(unitNum) {
    showScreen('loadingScreen');
    const { data, error } = await _supabase
        .from('vocabulary')
        .select('*')
        .eq('unit_number', unitNum);

    if (error || !data || data.length === 0) {
        alert("Error: No words were found in this unit!");
        showScreen('unitScreen');
        return;
    }

    currentQuestions = data.sort(() => Math.random() - 0.5);
    currentIndex = 0;
    score = 0;
    answerResults = [];
    
    showScreen('quizScreen');
    document.getElementById('quizPartTitle').innerText = `Unit ${unitNum}`;
    
    // CLEAR DOTS AND INITIAL RENDER
    const container = document.getElementById('stepsContainer');
    container.innerHTML = ''; 
    container.scrollLeft = 0; // Reset scroll to start

    showQuestion();
}

// 4. Show question
function showQuestion() {
    const q = currentQuestions[currentIndex];

    document.getElementById('definitionText').innerText = q.definition;

    const input = document.getElementById('answerInput');
    input.value = '';
    input.disabled = false;

    const feedback = document.getElementById('feedback');
    feedback.classList.add('hidden');
    feedback.className = "feedback-box hidden";

    document.getElementById('submitBtn').innerText = "Check";

    updateProgress(); // Update progress

    setTimeout(() => {
        input.focus();
    }, 100);
}

// 5. UPDATE PROGRESS
function updateProgress() {
    const total = currentQuestions.length;
    const current = currentIndex + 1;
    const percent = Math.round((currentIndex / total) * 100);

    // Update using new IDs
    const percEl = document.getElementById('progressPercent');
    const countEl = document.getElementById('questionCounter');

    if (percEl) percEl.innerText = percent + "%";
    if (countEl) countEl.innerText = `${current}/${total}`;
    updatePerformanceMetrics();

    renderSmartSteps(total, currentIndex);
}

function updatePerformanceMetrics() {
    const total = currentQuestions.length;
    const answered = answerResults.filter(result => result === true || result === false).length;
    const correctCount = answerResults.filter(result => result === true).length;
    const wrongCount = answerResults.filter(result => result === false).length;
    const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;

    const correctEl = document.getElementById('correctCounter');
    const wrongEl = document.getElementById('wrongCounter');
    const accuracyEl = document.getElementById('accuracyCounter');
    const correctFill = document.getElementById('correctFill');
    const wrongFill = document.getElementById('wrongFill');
    const track = document.getElementById('performanceTrack');

    if (correctEl) correctEl.innerText = `Correct: ${correctCount}`;
    if (wrongEl) wrongEl.innerText = `Wrong: ${wrongCount}`;
    if (accuracyEl) accuracyEl.innerText = `Accuracy: ${accuracy}%`;

    const correctRatio = answered > 0 ? (correctCount / answered) * 100 : 0;
    const wrongRatio = answered > 0 ? (wrongCount / answered) * 100 : 0;

    if (correctFill) correctFill.style.width = `${correctRatio}%`;
    if (wrongFill) wrongFill.style.width = `${wrongRatio}%`;
    if (track) {
        track.classList.toggle('is-empty', answered === 0 || total === 0);
    }
}

function renderSmartSteps(total, currentIdx) {
    const container = document.getElementById('stepsContainer');
    if (!container) return;

    // 1. Create dots if they are not created yet
    if (container.children.length !== total) {
        container.innerHTML = '';
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('div');
            dot.className = 'step-dot';
            container.appendChild(dot);
        }
    }

    // 2. Update dot states (active/completed)
    const dots = container.children;
    for (let i = 0; i < total; i++) {
        dots[i].className = 'step-dot';
        if (answerResults[i] === true) dots[i].classList.add('answered-correct');
        if (answerResults[i] === false) dots[i].classList.add('answered-wrong');
        if (i < currentIdx) dots[i].classList.add('completed');
        if (i === currentIdx) dots[i].classList.add('active');
    }

    // 3. KEEP ACTIVE DOT CENTERED
    const activeDot = dots[currentIdx];
    if (activeDot) {
        // Calculate container center
        const containerWidth = container.offsetWidth;
        const dotLeft = activeDot.offsetLeft;
        const dotWidth = activeDot.offsetWidth;

        // Scroll so active dot stays centered
        container.scrollTo({
            left: dotLeft - (containerWidth / 2) + (dotWidth / 2),
            behavior: 'smooth'
        });
    }
}

// Reset and recreate dots container
function renderInitialSteps(total) {
    const container = document.getElementById('stepsContainer');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'step-dot';
        container.appendChild(dot);
    }
}

// 6. Check answer function
document.getElementById('submitBtn').onclick = function () {
    const input = document.getElementById('answerInput');
    const feedback = document.getElementById('feedback');
    const btn = this;

    if (btn.innerText === "Next" || btn.innerText === "View result") {
        currentIndex++;
        if (currentIndex < currentQuestions.length) {
            showQuestion();
        } else {
            document.getElementById('progressPercent').innerText = "100%";
            setTimeout(showResults, 200);
        }
        return;
    }

    const userAns = input.value.trim().toLowerCase();
    const correctAns = currentQuestions[currentIndex].word.toLowerCase();

    input.disabled = true;
    feedback.classList.remove('hidden');

    if (userAns === correctAns) {
        score++;
        answerResults[currentIndex] = true;
        feedback.innerText = "Correct!";
        feedback.className = "feedback-box correct";
    } else {
        answerResults[currentIndex] = false;
        feedback.innerText = `Wrong! Answer: ${currentQuestions[currentIndex].word}`;
        feedback.className = "feedback-box wrong";
    }

    updatePerformanceMetrics();
    renderSmartSteps(currentQuestions.length, currentIndex);

    btn.innerText = (currentIndex + 1 < currentQuestions.length) ? "Next" : "View result";
};

// 7. Result and screens
function showResults() {
    showScreen('resultScreen');

    const total = currentQuestions.length;
    const correct = score;
    const wrong = Math.max(total - correct, 0);
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

    const scoreEl = document.getElementById('scoreText');
    const percentEl = document.getElementById('scorePercent');
    const correctEl = document.getElementById('resultCorrect');
    const wrongEl = document.getElementById('resultWrong');
    const totalEl = document.getElementById('resultTotal');
    const badgeEl = document.getElementById('resultBadge');
    const msgEl = document.getElementById('resultMessage');
    const resultScreen = document.getElementById('resultScreen');

    if (scoreEl) scoreEl.innerText = `${correct} / ${total}`;
    if (percentEl) percentEl.innerText = `${percent}%`;
    if (correctEl) correctEl.innerText = String(correct);
    if (wrongEl) wrongEl.innerText = String(wrong);
    if (totalEl) totalEl.innerText = String(total);

    let level = 'needs-work';
    let badgeText = "Let's keep going";
    let message = "If you keep practicing, your result will improve quickly.";

    if (percent >= 90) {
        level = 'excellent';
        badgeText = "Excellent result";
        message = "Great! You got almost all of them correct.";
    } else if (percent >= 70) {
        level = 'great';
        badgeText = "Very good";
        message = "Strong result! With a bit more practice, it will improve even more.";
    } else if (percent >= 50) {
        level = 'good';
        badgeText = "Good";
        message = "Good progress, now let's improve accuracy.";
    }

    if (badgeEl) badgeEl.innerText = badgeText;
    if (msgEl) msgEl.innerText = message;
    if (resultScreen) resultScreen.setAttribute('data-level', level);
}

function showScreen(screenId) {
    ['unitScreen', 'loadingScreen', 'quizScreen', 'resultScreen'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

// Initial load
window.onload = renderUnits;

// Handle Enter key
document.getElementById('answerInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        document.getElementById('submitBtn').click();
    }
});

