const { resetGame, handleGameButton, handleResetButton } = require('./script');

function renderDom() {
  document.body.innerHTML = `
    <div id="score">0</div>
    <div id="timer">5</div>
    <button id="button-clicker">Click me!</button>
    <button id="button-reset">Reset</button>
  `;
}

describe('ClickFast - compteur de clics', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    renderDom();
    resetGame();
    handleGameButton();
    handleResetButton();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('le score demarre a 0', () => {
    expect(document.getElementById('score').textContent).toBe('0');
  });

  test('un clic sur le bouton incremente le score', () => {
    document.getElementById('button-clicker').click();
    expect(document.getElementById('score').textContent).toBe('1');

    document.getElementById('button-clicker').click();
    expect(document.getElementById('score').textContent).toBe('2');
  });

  test('le timer decompte correctement', () => {
    expect(document.getElementById('timer').textContent).toBe('5');
    jest.advanceTimersByTime(3000);
    expect(document.getElementById('timer').textContent).toBe('2');
  });

  test('le score ne s\'incremente plus une fois le timer a 0', () => {
    document.getElementById('button-clicker').click();
    expect(document.getElementById('score').textContent).toBe('1');

    jest.advanceTimersByTime(5000);
    expect(document.getElementById('timer').textContent).toBe('0');
    expect(document.getElementById('button-clicker').disabled).toBe(true);

    document.getElementById('button-clicker').click();
    expect(document.getElementById('score').textContent).toBe('1');
  });

  test('le bouton reset remet le score et le timer a zero/cinq', () => {
    document.getElementById('button-clicker').click();
    document.getElementById('button-clicker').click();
    expect(document.getElementById('score').textContent).toBe('2');

    jest.advanceTimersByTime(2000);
    expect(document.getElementById('timer').textContent).toBe('3');

    document.getElementById('button-reset').click();
    expect(document.getElementById('score').textContent).toBe('0');
    expect(document.getElementById('timer').textContent).toBe('5');
    expect(document.getElementById('button-clicker').disabled).toBe(false);
  });
});
