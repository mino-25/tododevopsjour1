const express = require('express');
const {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} = require('../models/task');

const router = express.Router();

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

router.post('/', async (req, res, next) => {
  try {
    const error = validateTaskInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    const task = await createTask(req.body);
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    res.json(await listTasks());
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const error = validateTaskInput(req.body, { partial: true });
    if (error) {
      return res.status(400).json({ error });
    }
    const task = await updateTask(req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await deleteTask(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
