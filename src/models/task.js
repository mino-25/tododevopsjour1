const { randomUUID } = require('crypto');

let tasks = [];

function listTasks() {
  return tasks;
}

function getTask(id) {
  return tasks.find((task) => task.id === id);
}

function createTask({ description, status = 'todo' }) {
  const now = new Date().toISOString();
  const task = {
    id: randomUUID(),
    description,
    status,
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  return task;
}

function updateTask(id, { description, status }) {
  const task = getTask(id);
  if (!task) return undefined;
  if (description !== undefined) task.description = description;
  if (status !== undefined) task.status = status;
  task.updatedAt = new Date().toISOString();
  return task;
}

function deleteTask(id) {
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return false;
  tasks.splice(index, 1);
  return true;
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask };
