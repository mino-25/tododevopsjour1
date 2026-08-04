![ClickFast CI](https://github.com/mino-25/tododevopsjour1/actions/workflows/clickfast-ci.yml/badge.svg?branch=jour2)

# ClickFast ⏩

Petit jeu de clics : un bouton, 5 secondes, le score s'incrémente à chaque
clic tant que le temps n'est pas écoulé. Projet warm-up CI/CD du Jour 2
(voir Journal de bord à la racine du repo, branche `jour2`).

## Lancer le projet

En local, sans Docker : ouvrir `index.html` dans un navigateur.

Avec Docker :

```bash
docker build -t clickfast .
docker run -d -p 8080:80 clickfast
```

Puis ouvrir http://localhost:8080.

## Tests

```bash
npm install
npm test
```

Tests Jest + jsdom sur `script.js` : le score démarre à 0, un clic
l'incrémente, le compteur ne bouge plus une fois le temps écoulé (bouton
désactivé), et le bouton Reset remet score et timer à leur valeur initiale.

## CI/CD

`.github/workflows/clickfast-ci.yml` (à la racine du repo) : à chaque push,
un job `test` installe les dépendances et lance `npm test` ; un job `build`
ne démarre que si les tests passent (`needs: test`) et construit l'image
Docker. Le badge en haut de ce README reflète l'état de la dernière
exécution.
