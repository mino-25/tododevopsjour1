const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP reçues',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// Métrique métier : le nombre de tâches créées depuis le démarrage du
// process, la seule mesure de ce dashboard que personne d'autre ne peut
// deviner, propre à la Todo API.
const tasksCreatedTotal = new client.Counter({
  name: 'todo_tasks_created_total',
  help: 'Nombre total de tâches créées depuis le démarrage',
  registers: [register],
});

function metricsMiddleware(req, res, next) {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
  });
  next();
}

module.exports = { register, metricsMiddleware, tasksCreatedTotal };
