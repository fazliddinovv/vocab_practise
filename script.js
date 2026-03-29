// 1. SUPABASE SETTINGS
const SB_URL = "https://mnailfqtpdfrtosobhzg.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uYWlsZnF0cGRmcnRvc29iaHpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjEwOTEsImV4cCI6MjA4OTM5NzA5MX0.6NzjrUByJaYGROi5eAnw-uxgXHjG1C5FWxhw0Qr0KNk";

const { createClient } = supabase;
const _supabase = createClient(SB_URL, SB_KEY);

let unitParts = [];
let currentPartIndex = 0;
const PART_SIZE = 10; // har partda nechta savol
let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let answerResults = [];
const PAGE_SIZE = 1000;
let selectedUnitNumber = null;

function splitIntoParts(words, size) {
    const parts = [];
    for (let i = 0; i < words.length; i += size) {
        parts.push(words.slice(i, i + size));
    }
    return parts;
}

function sortWordsInSequence(rows) {
    const numericKeys = ['id', 'word_order', 'order_number', 'position'];
    for (const key of numericKeys) {
        const hasSortableKey = rows.every(row => row[key] !== undefined && row[key] !== null && Number.isFinite(Number(row[key])));
        if (!hasSortableKey) continue;

        return [...rows].sort((a, b) => Number(a[key]) - Number(b[key]));
    }

    const hasCreatedAt = rows.every(row => typeof row.created_at === 'string' && !Number.isNaN(Date.parse(row.created_at)));
    if (hasCreatedAt) {
        return [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    return rows;
}

function shuffleWords(rows) {
    const shuffled = [...rows];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getSelectedUnitFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const unit = Number(params.get('unit'));
    return Number.isFinite(unit) && unit > 0 ? unit : null;
}

async function fetchAllUnitNumbers() {
    let from = 0;
    const allRows = [];

    while (true) {
        const { data, error } = await _supabase
            .from('vocabulary')
            .select('unit_number')
            .range(from, from + PAGE_SIZE - 1);

        if (error) return { data: null, error };
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return { data: allRows, error: null };
}

async function fetchAllWordsByUnit(unitNum) {
    let from = 0;
    const allRows = [];

    while (true) {
        const { data, error } = await _supabase
            .from('vocabulary')
            .select('*')
            .eq('unit_number', unitNum)
            .range(from, from + PAGE_SIZE - 1);

        if (error) return { data: null, error };
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return { data: allRows, error: null };
}

// 2. Render units (Main screen)
async function renderUnits() {
    const grid = document.getElementById('unitGrid');
    if (!grid) return;

    grid.innerHTML = '<p class="loading-text" style="grid-column: 1/-1; text-align:center;">Loading...</p>';

    const { data, error } = await fetchAllUnitNumbers();

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
            btn.onclick = () => {
                showQuizModeSelector(i);
            };
        }
        grid.appendChild(btn);
    }
}

// 3. Load data
async function loadUnitData(unitNum, mode = 'part') {
    showScreen('loadingScreen');

    const { data, error } = await fetchAllWordsByUnit(unitNum);

    if (error || !data || data.length === 0) {
        alert("Error: No words were found in this unit!");
        return;
    }

    if (mode === 'random') {
        startRandomQuiz(shuffleWords(data), unitNum);
        return;
    }

    const orderedWords = sortWordsInSequence(data);

    // Supabase'dagi ketma-ketlikka yaqin tartibni saqlab, 10 tadan partlarga bo'lamiz
    unitParts = splitIntoParts(orderedWords, PART_SIZE);

    // PART SELECTORGA O‘TAMIZ
    showPartSelector(unitNum, data.length);
}

function showQuizModeSelector(unitNum) {
    selectedUnitNumber = unitNum;
    const subtitle = document.getElementById('modeSubtitle');
    if (subtitle) subtitle.innerText = `How would you like to practice Unit ${unitNum}?`;
    showScreen('modeScreen');
}

function startRandomQuiz(words, unitNum) {
    currentPartIndex = 0;
    currentQuestions = words;
    currentIndex = 0;
    score = 0;
    answerResults = [];

    showScreen('quizScreen');
    document.getElementById('quizPartTitle').innerText = `Unit ${unitNum} - Random`;

    const container = document.getElementById('stepsContainer');
    container.innerHTML = '';
    container.scrollLeft = 0;

    showQuestion();
}

function showPartSelector(unitNum, totalWords) {
    showScreen('partScreen');

    const subtitle = document.getElementById('partSubtitle');
    if (subtitle) subtitle.innerText = `Unit ${unitNum} · ${totalWords} words total`;

    const container = document.getElementById('partGrid');
    container.innerHTML = '';

    unitParts.forEach((part, index) => {
        const btn = document.createElement('button');
        btn.className = 'part-btn';

        btn.innerHTML = `
            <span>Part ${index + 1}</span>
            <span>${part.length} words</span>
        `;

        btn.onclick = () => startPart(index, unitNum);
        container.appendChild(btn);
    });
}

function startPart(partIndex, unitNum) {
    currentPartIndex = partIndex;

    currentQuestions = unitParts[partIndex];
    currentIndex = 0;
    score = 0;
    answerResults = [];

    showScreen('quizScreen');
    document.getElementById('quizPartTitle').innerText = `Unit ${unitNum} - Part ${partIndex + 1}`;

    const container = document.getElementById('stepsContainer');
    container.innerHTML = '';
    container.scrollLeft = 0;

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

    // Update using new IDs
    const countEl = document.getElementById('questionCounter');

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
    container.style.setProperty('--dot-count', String(Math.min(total, 10)));

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
    container.style.setProperty('--dot-count', String(Math.min(total, 10)));
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'step-dot';
        container.appendChild(dot);
    }
}

// 6. Check answer function
const submitBtn = document.getElementById('submitBtn');
if (submitBtn) {
    submitBtn.onclick = function () {
        const input = document.getElementById('answerInput');
        const feedback = document.getElementById('feedback');
        const btn = this;

        if (btn.innerText === "Next" || btn.innerText === "View result") {
            currentIndex++;
            if (currentIndex < currentQuestions.length) {
                showQuestion();
            } else {
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
}

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

function backToUnits() {
    showScreen('unitScreen');
    selectedUnitNumber = null;
    unitParts = [];
    currentQuestions = [];
    currentIndex = 0;
    score = 0;
    answerResults = [];
    window.history.replaceState({}, '', window.location.pathname);
}

function showScreen(screenId) {
    ['unitScreen', 'modeScreen', 'loadingScreen', 'quizScreen', 'resultScreen', 'partScreen']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
}

async function initApp() {
    const backBtn = document.getElementById('backToUnitsBtn');
    if (backBtn) {
        backBtn.onclick = backToUnits;
    }

    const quizBackBtn = document.getElementById('quizBackToUnitsBtn');
    if (quizBackBtn) {
        quizBackBtn.onclick = backToUnits;
    }

    const modePartBtn = document.getElementById('modePartBtn');
    if (modePartBtn) {
        modePartBtn.onclick = () => {
            if (selectedUnitNumber === null) return;
            loadUnitData(selectedUnitNumber, 'part');
        };
    }

    const modeRandomBtn = document.getElementById('modeRandomBtn');
    if (modeRandomBtn) {
        modeRandomBtn.onclick = () => {
            if (selectedUnitNumber === null) return;
            loadUnitData(selectedUnitNumber, 'random');
        };
    }

    const modeBackBtn = document.getElementById('modeBackBtn');
    if (modeBackBtn) {
        modeBackBtn.onclick = backToUnits;
    }

    // AGAR unitGrid BOR BO‘LSA → index.html
    if (document.getElementById('unitGrid')) {
        await renderUnits();
        // SPA rejimda har doim bosh sahifadan boshlaymiz
        window.history.replaceState({}, '', window.location.pathname);
        return;
    }

    // AGAR quizScreen BOR BO‘LSA → quiz.html
    if (document.getElementById('quizScreen')) {
        const selectedUnit = getSelectedUnitFromUrl();
        if (selectedUnit !== null) {
            loadUnitData(selectedUnit);
        }
    }
}

// Initial load
window.onload = initApp;

// Handle Enter key
const answerInput = document.getElementById('answerInput');
if (answerInput) {
    answerInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            const btn = document.getElementById('submitBtn');
            if (btn) btn.click();
        }
    });
}

