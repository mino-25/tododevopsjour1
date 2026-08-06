require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const taskRoutes = require('./routes/tasks');
const errorHandler = require('./middleware/errorHandler');
const { initSchema } = require('./db');
const { register, metricsMiddleware } = require('./metrics');

const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Variable d'environnement manquante : ${key}`);
  }
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

app.get('/health', (req, res) => {
  res.status(500).json({ status: 'regression volontaire Jour 4' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/tasks', taskRoutes);

app.use(errorHandler);

const port = process.env.PORT || 3000;

if (require.main === module) {
  initSchema()
    .then(() => {
      app.listen(port, () => {
        console.log(`todo-api listening on http://localhost:${port}`);
      });
    })
    .catch((err) => {
      console.error('Impossible d\'initialiser le schema Postgres', err);
      process.exit(1);
    });
}

module.exports = app;
