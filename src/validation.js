const MAX_DESCRIPTION_LENGTH = 5000;
const VALID_STATUSES = ['todo', 'in_progress', 'done'];

function validateTaskInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') {
    return 'Corps de requête JSON attendu';
  }

  const { description, status } = body;

  if (!partial || description !== undefined) {
    if (typeof description !== 'string' || description.trim().length === 0) {
      return 'description doit être une chaîne non vide';
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return `description dépasse la longueur maximale de ${MAX_DESCRIPTION_LENGTH} caractères`;
    }
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return `status doit être l'une des valeurs suivantes : ${VALID_STATUSES.join(', ')}`;
  }

  return null;
}

module.exports = { validateTaskInput, MAX_DESCRIPTION_LENGTH, VALID_STATUSES };
