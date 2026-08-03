function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corps de requête JSON malformé' });
  }

  console.error(err);
  res.status(err.status || 500).json({ error: 'Erreur interne du serveur' });
}

module.exports = errorHandler;
