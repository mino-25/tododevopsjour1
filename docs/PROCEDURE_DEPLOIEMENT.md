# Procédure de déploiement — Todo API

## Prérequis et accès

- Accès SSH à la machine cible avec la clé `deploy_key` (stockée en secret GitHub `DEPLOY_SSH_KEY`, jamais dans le dépôt).
- Machine cible : `${DEPLOY_HOST}:${DEPLOY_PORT}` (secrets GitHub), utilisateur `${DEPLOY_USER}`.
- Fichiers vivant sur la machine cible, dans `/srv/todo/` : `compose.yml` (envoyé par la pipeline à chaque déploiement) et `.env` (copié une fois à la main, contient les mots de passe, ne sort jamais du dépôt).
- Un compte Docker Hub avec les identifiants dans les secrets `DOCKERHUB_USER` / `DOCKERHUB_TOKEN`.

## Versions concernées

- L'image en cours de production est taguée avec le sha du commit déployé : `docker exec todo-api printenv | grep npm_package_version` ne suffit pas, la vraie source de vérité est `docker inspect todo-api --format '{{.Config.Image}}'` sur la machine cible.

## Déploiement normal (via la pipeline)

1. `git push` sur `main` (ou `jour3` pendant le développement du projet).
2. La pipeline GitHub Actions enchaîne `test` → `test-integration` → `build` → `deploy`.
3. Vérification : le job `deploy` échoue si `curl http://localhost:3000/health` ne répond pas 200 dans les 30 secondes.

Durée normale observée : le déploiement lui-même (SSH + `docker compose up -d` + vérification) prend entre 5 et 15 secondes une fois l'image déjà présente sur la machine cible.

## Déploiement manuel d'urgence (si la pipeline est en panne)

1. Se connecter à la machine cible :
   ```bash
   ssh -i deploy_key -p ${DEPLOY_PORT} ${DEPLOY_USER}@${DEPLOY_HOST}
   ```
   Vérification : le prompt doit afficher le hostname de la machine cible, pas le vôtre.
2. Sur la machine cible, lancer le déploiement avec le tag voulu :
   ```bash
   cd /srv/todo && DOCKERHUB_USER=mino-25 TAG=<sha_du_commit> docker compose up -d
   ```
   Vérification : `docker compose ps` affiche `todo-api` en `Up`.
3. Vérifier la santé de l'application :
   ```bash
   curl -s http://localhost:3000/health
   ```
   Vérification : la réponse doit être `{"status":"ok",...}`.

## Retour arrière

**Commande exacte** (depuis la machine cible, dans `/srv/todo`) :
```bash
DOCKERHUB_USER=mino-25 TAG=<sha_precedent> docker compose up -d
```

**Critère de déclenchement** : le taux d'erreur HTTP observé dans Grafana dépasse un seuil visible pendant plus d'une minute, ou `/health` répond autre chose que 200.

**Qui décide** : la personne d'astreinte, sans attendre de validation supplémentaire si le signal est un `/health` qui répond en erreur — c'est un cas sans ambiguïté.

**Temps mesuré en conditions réelles** (voir Journal de bord du README) : environ 11 secondes entre le constat de la régression et le rétablissement du service, sha à sha, sans rebuild.

## Pannes connues

| Panne | Signature | Diagnostic | Remède |
|---|---|---|---|
| `ImagePullBackOff` (registry) / image absente localement | `docker compose up -d` échoue avec `pull access denied` ou `manifest unknown` | Vérifier le tag exact sur Docker Hub | Vérifier `DOCKERHUB_USER`/`TAG`, republier l'image si besoin |
| `todo-api` ne répond pas mais `todo-db` tourne | `curl /health` timeout ou connexion refusée | `docker logs todo-api` sur la machine cible | Vérifier les variables `DB_*` dans `/srv/todo/.env`, redémarrer le conteneur |
| `todo-db` down, `todo-api` up | `/health` répond 500, Grafana montre `up=1` mais un taux d'erreur élevé | `docker logs todo-db` | `docker compose up -d todo-db` |
| Port 3000 déjà occupé sur la machine cible | `docker compose up -d` échoue avec `port is already allocated` | `docker ps` sur la machine cible | Identifier et arrêter le conteneur qui occupe le port avant de redéployer |
| Secret GitHub mal orthographié | Le job `deploy` échoue à la connexion SSH, `Permission denied (publickey)` | Relire le log du job (la clé n'y apparaît jamais) | Corriger le secret dans `Settings > Secrets and variables > Actions` |

## Limite connue

`/health` vérifie seulement que le serveur HTTP répond, pas que la base de données est joignable pour de vrai. Un `todo-db` coupé produit un `/health` qui répond 500 (parce que le code applicatif touche la base ailleurs), mais un `/health` qui ne ferait aucune vérification réelle donnerait une fausse tranquillité — voir la section Prometheus du Journal de bord pour la distinction entre "le serveur répond" et "l'application rend le service".

## Durée estimée

Déploiement complet (push → pipeline → application à jour) : 2 à 4 minutes, dominées par le job `build` (build + push de l'image). Le déploiement à proprement parler (SSH + `docker compose up -d`) est de l'ordre de 10 secondes.
