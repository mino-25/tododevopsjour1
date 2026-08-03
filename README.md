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
