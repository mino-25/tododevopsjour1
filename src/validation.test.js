const { validateTaskInput } = require('./validation');

describe('validateTaskInput', () => {
  test('accepte une description valide', () => {
    expect(validateTaskInput({ description: 'Ecrire le rapport' })).toBeNull();
  });

  test('refuse une description vide', () => {
    expect(validateTaskInput({ description: '' })).toMatch(/chaîne non vide/);
  });

  test('refuse une description trop longue', () => {
    expect(validateTaskInput({ description: 'a'.repeat(50000) })).toMatch(/longueur maximale/);
  });

  test('refuse un status inconnu', () => {
    expect(validateTaskInput({ description: 'ok', status: 'archived' })).toMatch(/status doit être/);
  });

  test('en mode partiel, une description absente est acceptée', () => {
    expect(validateTaskInput({ status: 'done' }, { partial: true })).toBeNull();
  });

  test('refuse un corps de requête absent', () => {
    expect(validateTaskInput(null)).toMatch(/JSON attendu/);
  });
});
