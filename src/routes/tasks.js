const express = require('express');
const {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} = require('../models/task');
const { validateTaskInput } = require('../validation');
const { tasksCreatedTotal } = require('../metrics');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const error = validateTaskInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    const task = await createTask(req.body);
    tasksCreatedTotal.inc();
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
