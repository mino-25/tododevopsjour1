const GAME_DURATION = 5;

let score = 0;
let timeLeft = GAME_DURATION;
let gameActive = true;
let timerInterval = null;

function getEls() {
  return {
    scoreEl: document.getElementById('score'),
    timerEl: document.getElementById('timer'),
    clickBtn: document.getElementById('button-clicker'),
    resetBtn: document.getElementById('button-reset'),
  };
}

function updateScoreDisplay() {
  const { scoreEl } = getEls();
  if (scoreEl) scoreEl.textContent = score;
}

function updateTimerDisplay() {
  const { timerEl } = getEls();
  if (timerEl) timerEl.textContent = timeLeft;
}

function endGame() {
  gameActive = false;
  clearInterval(timerInterval);
  const { clickBtn } = getEls();
  if (clickBtn) clickBtn.disabled = true;
}

function tick() {
  timeLeft -= 1;
  updateTimerDisplay();
  if (timeLeft <= 0) {
    endGame();
  }
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function incrementScore() {
  if (!gameActive) return;
  score += 1;
  updateScoreDisplay();
}

function resetGame() {
  clearInterval(timerInterval);
  score = 0;
  timeLeft = GAME_DURATION;
  gameActive = true;
  updateScoreDisplay();
  updateTimerDisplay();
  const { clickBtn } = getEls();
  if (clickBtn) clickBtn.disabled = false;
  startTimer();
}

function handleGameButton() {
  const { clickBtn } = getEls();
  if (clickBtn) clickBtn.addEventListener('click', incrementScore);
}

function handleResetButton() {
  const { resetBtn } = getEls();
  if (resetBtn) resetBtn.addEventListener('click', resetGame);
}

function init() {
  handleGameButton();
  handleResetButton();
  updateScoreDisplay();
  updateTimerDisplay();
  startTimer();
}

// Auto-démarrage uniquement dans un vrai navigateur (pas de `module` CommonJS
// là-bas) : les tests appellent handleGameButton/handleResetButton eux-mêmes
// et pilotent le timer avec des fake timers.
if (typeof document !== 'undefined' && typeof module === 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    incrementScore,
    resetGame,
    handleGameButton,
    handleResetButton,
    startTimer,
  };
}
