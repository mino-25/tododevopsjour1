# Todo API — Projet fil rouge DevOps, Jour 1

API de gestion de tâches (CRUD), dockerisée, branchée sur PostgreSQL, avec un
second service en Python (`stats-api`) qui expose des compteurs par statut.
Projet réalisé dans le cadre de la formation DevOps/Docker (chapitres 5 à 10 :
Dockerfile de production, PostgreSQL + volumes + networks, Docker Compose,
service polyglotte, publication registry, mesures).

## Lancer le projet

```bash
cp .env.example .env
docker compose up -d --build
```

- API des tâches : http://localhost:3000
- Service de stats : http://localhost:8000
- Adminer (optionnel, profil `dev`) : `docker compose --profile dev up -d` puis http://localhost:8081

Arrêter la stack : `docker compose down` (les données Postgres survivent, elles
sont dans le volume nommé `todo_pgdata`). Pour tout effacer y compris les
données : `docker compose down -v`.

## Configuration

Toute la configuration passe par variables d'environnement, lues depuis `.env`
(non commité, voir `.env.example` pour le modèle) :

| Variable      | Rôle                                              |
|---------------|----------------------------------------------------|
| `PORT`        | Port d'écoute de l'API Node.js                     |
| `DB_HOST`     | Hôte Postgres (`db`, le nom du service Compose)    |
| `DB_PORT`     | Port Postgres                                      |
| `DB_USER`     | Utilisateur Postgres                               |
| `DB_PASSWORD` | Mot de passe Postgres                              |
| `DB_NAME`     | Nom de la base                                     |

Une variable obligatoire manquante fait échouer le démarrage de l'API avec un
message explicite, jamais un plantage silencieux plus loin dans le code.

## Routes de l'API (`todo-api`)

| Méthode | Route             | Description             |
|---------|-------------------|--------------------------|
| POST    | `/api/tasks`      | Créer une tâche          |
| GET     | `/api/tasks`      | Lister les tâches        |
| GET     | `/api/tasks/:id`  | Voir une tâche           |
| PUT     | `/api/tasks/:id`  | Modifier une tâche       |
| DELETE  | `/api/tasks/:id`  | Supprimer une tâche      |
| GET     | `/health`         | Vérification de l'API    |

Une tâche : `{ id, description, status, createdAt, updatedAt }`. `status` vaut
`todo`, `in_progress` ou `done`.

## Routes du service de stats (`stats-api`)

| Méthode | Route      | Description                                  |
|---------|------------|-----------------------------------------------|
| GET     | `/stats`   | Nombre de tâches par statut                   |
| GET     | `/health`  | Vérification du service (indépendante de la DB) |

## Mesures d'image

Mesuré le 2026-08-03, sur la machine locale, après `docker builder prune -af`
pour un build à froid réellement sans cache.

| Image       | Taille | Couches (poids max)          | Build froid | Build chaud | Temps 1re réponse HTTP |
|-------------|--------|-------------------------------|-------------|-------------|--------------------------|
| todo-api    | 240 MB | 17 (max : `npm ci`, 11.5 MB)  | ~2.0 s      | ~0.4 s      | ~0.18 s                  |
| stats-api   | 236 MB | 21 (max : `pip install`, 25.2 MB) | ~5.8 s  | ~0.7 s      | ~0.57 s                  |

Lecture : l'écart froid/chaud mesure directement l'efficacité de l'ordre des
instructions du Dockerfile (dépendances copiées avant le code). Le temps de
1re réponse HTTP capture autre chose — le ressenti utilisateur au démarrage —
et n'est prédit ni par la taille ni par le nombre de couches.

Pistes d'optimisation identifiées mais non appliquées cette session : un
multi-stage build apporterait peu ici (pas d'étape de compilation), l'essentiel
du poids vient des images de base (`node:22-alpine` / `python:3.12-slim`) et
des dépendances runtime elles-mêmes.

## Journal de bord

**Le socle — CRUD Todo API en mémoire.** Routes REST (`POST/GET/GET:id/PUT:id/DELETE:id`)
écrites avec stockage en tableau, avant tout branchement base de données. Les
3 cas du cours testés en réel via `npm start` + `curl` : création puis lecture
(id généré présent), 404 propre sur un id inconnu, 400 propre sur description
vide / trop longue (50 000 caractères) et sur JSON malformé — jamais de crash
du process dans aucun des trois cas.

**Dockerfile de production.** Image `node:22-alpine`, dépendances copiées avant
le code (`COPY package*.json` puis `RUN npm ci --omit=dev` puis `COPY . .`),
`USER node`, `HEALTHCHECK`, `CMD` en forme exec. Vérifié réellement : `whoami`
dans le conteneur renvoie `node` (jamais root) ; un rebuild après modification
du seul code applicatif laisse la couche `npm ci` en `CACHED` ; taille finale
240 MB.

**PostgreSQL, volume, network (chapitre 6).** Mission A : Postgres lancé à la
main avec un volume nommé, API connectée via l'IP interne du bridge par
défaut (comme demandé, avant la mission network). Piège rencontré : le pool
`pg` fait planter tout le process Node sur un événement d'erreur idle non géré
(quand Postgres redémarre) — corrigé avec un handler `pool.on('error', ...)`.
Persistance vérifiée deux fois : `docker stop`/`start` du conteneur Postgres,
puis `docker rm` complet suivi d'un tout nouveau conteneur pointé sur le même
volume — les tâches créées avant survivent dans les deux cas. Mission B :
network custom créé, connexion API→DB par nom de conteneur, aucun port
Postgres publié vers l'hôte (vérifié avec `docker port`, qui ne renvoie rien).

**Docker Compose et configuration (chapitre 7).** Mission A : configuration
sortie du code via `dotenv` + `.env`/`.env.example`. Mission B :
`docker-compose.yml` avec `api`, `db` (healthcheck `pg_isready` +
`condition: service_healthy`) et `adminer` (profil `dev`). Testé réellement :
`docker compose up -d` démarre `db` en `healthy` avant que `api` ne démarre ;
en retirant `DB_PASSWORD` du `.env`, l'API entre en boucle de redémarrage avec
l'erreur explicite `Variable d'environnement manquante : DB_PASSWORD` — jamais
un démarrage silencieux avec un mot de passe vide ; en coupant `db` pendant
que l'API tourne, `GET /api/tasks` répond `500` proprement (pas de crash, pas
de timeout infini), et l'API retrouve la base toute seule dès que `db`
redémarre, sans avoir besoin d'être elle-même relancée.

**Service Python stats-api (chapitre 8).** Code FastAPI + psycopg2 du cours,
adapté aux noms retenus aux chapitres précédents (`tasks`, colonne `status`,
variables `DB_*`). Vérifié réellement : `/stats` correspond exactement à un
`SELECT status, COUNT(*) ... GROUP BY status` lancé à la main dans le
conteneur `db` via `psql` ; table vidée → `/stats` répond `200` avec tous les
compteurs à 0 (jamais de 500) ; `db` coupée → `503` avec un message
exploitable, le service `stats-api` reste up et se reconnecte tout seul dès
que `db` revient.

**Publication registry (chapitre 9).** `docker-compose.prod.yml` écrit,
référençant `mino-25/todo-api:1.0.0` et `mino-25/stats-api:1.0.0` à la place
de `build:`. Volontairement pas encore de `docker login`/`docker push` dans
cette session : ça nécessite les identifiants Docker Hub personnels, à lancer
à la main quand le compte est prêt.

**Mesures et optimisation (chapitre 10).** Tableau ci-dessus rempli avec de
vraies mesures (`docker images`, `docker history`, `time docker build
--no-cache` après `docker builder prune -af`, puis un build à chaud juste
après ; boucle `curl` pour le temps de 1re réponse HTTP). Rien d'optimisé plus
loin cette session : les deux images restent proches de leur poids de base
(alpine / slim), la marge de gain restante viendrait surtout d'une réduction
des dépendances plutôt que du Dockerfile lui-même.

**Déploiement automatisé (chapitre Jour 3, Phases 1-4).** La pipeline
déménage sur la Todo API : jobs `test` (unitaires) puis `build` (image taguée
au sha, poussée sur Docker Hub) puis `deploy` (runner self-hosted, agent SSH,
`docker compose up -d` sur la machine cible). La machine cible est une
maquette fidèle : un conteneur `docker:28-dind` avec son propre daemon Docker
et un serveur SSH (`Dockerfile.vm`), isolée du poste de développement —
vérifié en constatant qu'un `docker ps` dedans ne montre aucun des conteneurs
du poste. Connexion refusée sans la bonne clé, acceptée avec.

**Idempotence et retour arrière (Phase 5).** Un redéploiement identique
(même tag) laisse les quatre conteneurs `Running` sans recréation ni erreur.
Une régression volontaire sur `/health` (500 au lieu de 200), déployée puis
constatée, corrigée par un retour arrière vers le tag précédent : **11,19
secondes** entre le constat et le rétablissement, sha à sha, sans rebuild.

**Tests d'intégration (Phase 6).** Job `test-integration` avec un vrai
Postgres en conteneur de service (`services: postgres`), healthcheck
`pg_isready` avant de lancer les tests. Quatre cas couverts : création puis
lecture, 404 sur id inexistant, 400 sur payload invalide, suppression puis
disparition de la liste. Vérifiés en réel contre une base locale avant de
faire confiance à la CI.

**Prometheus et Grafana (Phases 7-8).** Instrumentation avec `prom-client` :
`/metrics`, un counter de requêtes (labels method/route/status_code, jamais
l'id de la tâche pour éviter l'explosion de cardinalité), un histogram de
durée, et une métrique métier `todo_tasks_created_total`. Prometheus scrape
`todo-api:3000` toutes les 5s ; Grafana provisionné automatiquement
(datasource + dashboard JSON versionnés) avec 4 panneaux golden signals.
Vérifié avec du vrai trafic : ~1,36 req/s, p95 à 48ms, compteur de tâches à
15 après 15 créations — les trois requêtes PromQL retournent des valeurs
cohérentes avec ce qui a été envoyé.

**Incident réel (Phase 10).** `scripts/incident.sh` a tiré la panne n°2
(`todo-db` stoppé). Signature observée : `/health` reste à 200 (il ne
vérifie que le serveur HTTP), mais `GET /api/tasks` répond 500 — exactement
la limite documentée dans `docs/PROCEDURE_DEPLOIEMENT.md`. Diagnostic posé
via `docker ps -a` (todo-db `Exited`) avant même de lire les logs. Remède
appliqué (`docker compose up -d todo-db`) : rétablissement en 0,60 seconde.

## Journal de bord — Jour 3

| Moment | up | Requêtes/s | Taux d'erreur | p95 |
|---|---|---|---|---|
| Au repos | 1 | ~0 | 0 % | ~5ms |
| Pendant la boucle de charge (15 requêtes) | 1 | 1.36 | 33 % (1/3 des routes visait un id inexistant, volontairement) | 48ms |
| Pendant l'incident (todo-db coupé) | 1 (le serveur répond) | - | 100 % sur les routes touchant la base | - |

| Déploiement | Constat → rétablissement |
|---|---|
| Retour arrière (régression `/health`) | 11.19s |
| Remède panne #2 (`todo-db` relancé) | 0.60s |

Le runner self-hosted (`todo-local-runner`) tourne en tâche de fond sur la
machine de développement (`~/actions-runner-todo/run.sh`), la machine cible
`vm-prod` tourne en conteneur Docker persistant (volume `vm-prod-data`) :
les deux doivent être en marche pour que le job `deploy` s'exécute.

## Journal de bord — Jour 4 (Kubernetes)

**Cluster et déploiement (Phases 1-5).** `k3d` crée `todo-cluster`
(port 8080 mappé sur le loadbalancer intégré), namespace `todo`. Manifestes
dans `k8s/` : Deployment/Service pour l'API, PVC+Deployment+Service pour
Postgres, ConfigMap/Secret pour la config, Ingress Traefik sur
`todo.localhost`. Vérifié en réel : CRUD complet à travers l'Ingress,
suppression d'un pod API qui revient seul en 3s, suppression du pod Postgres
qui revient avec les données intactes (la tâche créée avant est toujours
là). Le job `deploy-k8s` (`kubectl set image` + `kubectl rollout status
--timeout=120s`) remplace le job SSH du Jour 3 sur cette branche ; les deux
coexistent dans le même workflow, chacun gardé par sa propre branche.

**3 replicas et charge (Phase 6).** `scripts/charge.sh` envoie du trafic
continu via l'Ingress. Vérifié pod par pod via `/metrics` : exactement
35/35/35 requêtes sur les trois pods pour 105 requêtes envoyées — preuve que
le Service répartit vraiment, pas qu'il existe trois pods.

**Sondes (Phase 7).** `readinessProbe`/`livenessProbe` sur `/health`,
`periodSeconds: 5`. Aucun événement `Unhealthy` en fonctionnement normal.

**Rolling update mesuré sous charge (Phase 8).** `maxSurge: 1`,
`maxUnavailable: 0`. Un vrai déploiement (bump de version, image
reconstruite et repoussée par la pipeline) lancé pendant que `charge.sh`
tournait 90 secondes : **663 requêtes, 0 échec**. L'ancien ReplicaSet n'est
jamais descendu sous 3 pods prêts avant que le nouveau ne le soit.

**Retour arrière chronométré (Phase 9).** Une régression volontaire sur
`/health` (500 au lieu de 200) poussée via la pipeline : le job `deploy-k8s`
a **échoué proprement** après 120s de timeout sur `kubectl rollout status`
— et le service n'a jamais cessé de répondre, parce que `maxUnavailable: 0`
a gardé les 3 anciens pods sains actifs pendant que les nouveaux
échouaient leur readiness probe indéfiniment. `kubectl rollout undo` :
**0.34 seconde** jusqu'à convergence complète (l'ancien ReplicaSet n'avait
jamais été supprimé).

**Cinq pannes rejouées (Phase 10).** Voir le tableau complet dans
`docs/PROCEDURE_DEPLOIEMENT.md`. Le résultat le plus intéressant : un
`kill -9 1` envoyé depuis `kubectl exec` n'a aucun effet, parce que PID 1
dans un namespace Linux est immunisé aux signaux non gérés reçus depuis
l'intérieur du même namespace — y compris `SIGKILL` (`pid_namespaces(7)`).
Dans les quatre autres cas (pod supprimé, tag inexistant, secret amputé,
mémoire trop basse), `maxUnavailable: 0` a empêché toute coupure réelle du
service pendant que le diagnostic se faisait.

**Procédure, version cluster (Phase 11).** `docs/PROCEDURE_DEPLOIEMENT.md`
mis à jour en place (pas dupliqué) : `kubectl rollout undo` remplace le
redéploiement SSH, les cinq pannes ci-dessus remplacent
`Permission denied`/`Connection timed out`, la ligne "relancer le service"
a disparu — le cluster l'a déjà fait.

**Tuning des ressources (Phase 12).** `kubectl top` : usage réel au repos
~17-19Mi. Descente progressive de `limits.memory` sous charge continue :
48Mi/32Mi/24Mi propres, **20Mi** a laissé passer 1 requête en échec sur 72,
**16Mi** a produit un `OOMKilled` net et reproductible (exit code 137, deux
pods touchés). Valeur retenue : `requests: 32Mi` / `limits: 64Mi`, validée
ensuite par un nouveau passage de `charge.sh` : 102 requêtes, 0 échec.
Piège rencontré pour de vrai en cours de route : un `kubectl apply -f`
lancé après plusieurs `kubectl set image` manuels a fait régresser
silencieusement l'image vers le tag resté écrit dans le fichier — exactement
le *drift* décrit au chapitre 2 du cours, pas juste une notion théorique.

| Panne | Se répare seule ? |
|---|---|
| Pod supprimé | Oui, ~3s |
| Process tué (`kill -9 1` via exec) | Sans effet (immunité PID 1) |
| Tag d'image inexistant | Non — `kubectl rollout undo` |
| Clé de Secret supprimée | Non — restaurer la clé + `rollout restart` |
| `limits.memory` trop basse | Non — remonter la limite |

| Mesure | Valeur |
|---|---|
| Rolling update sous charge (663 req.) | 0 échec |
| Rollback chronométré | 0.34s |
| Plancher mémoire avant OOMKilled | 16-20Mi |
| Valeur retenue (avec marge) | 32Mi / 64Mi |

Le cluster `todo-cluster` (k3d) et le runner self-hosted doivent tous deux
être en marche pour que `deploy-k8s` s'exécute — comme `vm-prod` au Jour 3,
ce sont des ressources locales à cette machine, pas des services cloud.
