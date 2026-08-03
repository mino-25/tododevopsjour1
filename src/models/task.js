const { pool } = require('../db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listTasks() {
  const { rows } = await pool.query(
    'SELECT id, description, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM tasks ORDER BY created_at'
  );
  return rows;
}

async function getTask(id) {
  if (!UUID_RE.test(id)) return undefined;
  const { rows } = await pool.query(
    'SELECT id, description, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM tasks WHERE id = $1',
    [id]
  );
  return rows[0];
}

async function createTask({ description, status = 'todo' }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (description, status)
     VALUES ($1, $2)
     RETURNING id, description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [description, status]
  );
  return rows[0];
}

async function updateTask(id, { description, status }) {
  if (!UUID_RE.test(id)) return undefined;
  const { rows } = await pool.query(
    `UPDATE tasks
     SET description = COALESCE($2, description),
         status = COALESCE($3, status),
         updated_at = now()
     WHERE id = $1
     RETURNING id, description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, description, status]
  );
  return rows[0];
}

async function deleteTask(id) {
  if (!UUID_RE.test(id)) return false;
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask };
