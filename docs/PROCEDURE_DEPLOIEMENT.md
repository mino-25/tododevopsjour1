# Procédure de déploiement — Todo API

> Mise à jour Jour 4 : la cible n'est plus la machine `vm-prod` (SSH + `docker
> compose`), c'est le cluster `todo-cluster` (kubectl). Le principe du
> document ne change pas — une commande exacte, un critère de vérification
> précis, jamais une phrase vague — seul ce que ces commandes ciblent a
> changé. La version Jour 3 (vm-prod) reste valable pour la branche `jour3`,
> dont le déploiement continue de fonctionner ; ce fichier documente
> désormais la cible actuelle, le cluster.

## Prérequis et accès

- `kubectl` configuré sur le contexte `k3d-todo-cluster`, namespace `todo`.
- Le cluster tourne en local via `k3d` : `k3d cluster create todo-cluster -p "8080:80@loadbalancer"` (déjà fait, cluster persistant tant qu'il n'est pas supprimé).
- Un compte Docker Hub avec les identifiants dans les secrets GitHub `DOCKERHUB_USER` / `DOCKERHUB_TOKEN`.
- Le runner self-hosted (`todo-local-runner`, `~/actions-runner-todo/run.sh`) doit tourner : c'est lui qui exécute le job `deploy-k8s`, sur la même machine que le cluster.
- Le Secret `todo-secret` doit exister dans le namespace `todo` (voir `k8s/todo-secret.example.yaml` pour le modèle, jamais la version réelle committée).

## Déploiement normal (via la pipeline)

1. `git push` sur `jour4`.
2. La pipeline enchaîne `test` → `test-integration` → `build` (image multi-arch amd64+arm64) → `deploy-k8s`.
3. `deploy-k8s` exécute `kubectl set image deployment/todo-api todo-api=<image>:<sha> -n todo` puis `kubectl rollout status deployment/todo-api -n todo --timeout=120s` : le job échoue si le rollout ne converge pas dans ce délai.

Durée normale observée : 45-60 secondes du push à la convergence complète (dominée par le job `build`).

## Déploiement manuel d'urgence (si la pipeline est en panne)

1. Vérifier le contexte : `kubectl config current-context` doit répondre `k3d-todo-cluster`.
2. Mettre à jour l'image :
   ```bash
   kubectl set image deployment/todo-api todo-api=minoo25/todo-api:<sha> -n todo
   ```
   Vérification : `kubectl get pods -n todo -l app=todo-api` montre un nouveau nom de pod.
3. Attendre la convergence :
   ```bash
   kubectl rollout status deployment/todo-api -n todo --timeout=120s
   ```
   Vérification : le message final est `deployment "todo-api" successfully rolled out`.
4. Vérifier la santé réelle :
   ```bash
   curl -s -H "Host: todo.localhost" http://localhost:8080/health
   ```
   Vérification : `{"status":"ok",...}`.

**Attention** : ne jamais modifier le cluster avec `kubectl apply -f k8s/todo-api.yaml` après un déploiement fait via `kubectl set image` sans avoir d'abord mis à jour le tag d'image dans le fichier — le fichier versionné doit rester une photographie fidèle de ce qui tourne, sinon un `apply` ultérieur ramène silencieusement une ancienne version (le **drift** documenté au chapitre 2 du cours, rencontré pour de vrai pendant la Phase 12 de ce projet).

## Retour arrière

**Commande exacte** :
```bash
kubectl rollout undo deployment/todo-api -n todo
kubectl rollout status deployment/todo-api -n todo --timeout=60s
```
Pour cibler une révision précise : `kubectl rollout history deployment/todo-api -n todo` puis `kubectl rollout undo deployment/todo-api -n todo --to-revision=N`.

**Critère de déclenchement** : le job `deploy-k8s` time out (rollout qui ne converge pas), ou un `curl /health` via l'Ingress échoue alors qu'un déploiement vient de partir.

**Qui décide** : la personne d'astreinte, sans validation supplémentaire — `maxUnavailable: 0` garantit que les anciens pods sains continuent de servir le trafic tant que les nouveaux ne sont pas prêts, donc un rollback ne coupe jamais un service qui tournait.

**Temps mesuré en conditions réelles** : **0.34 seconde** entre `kubectl rollout undo` et la convergence complète — quasi instantané parce que l'ancien ReplicaSet n'avait jamais été supprimé (il restait à 3/3 pendant que le nouveau échouait sa readiness probe).

## Pannes connues

| État | Signification | Où regarder | Remède |
|---|---|---|---|
| `Pending` | Le pod existe mais aucun node ne peut l'accueillir | `kubectl describe pod`, section Events | Baisser `requests`, ou libérer des ressources |
| `ImagePullBackOff` | Le kubelet n'arrive pas à récupérer l'image | Le tag existe-t-il sur Docker Hub ? | Vérifier le tag, `kubectl rollout undo` en attendant |
| `CrashLoopBackOff` | Le conteneur démarre puis plante en boucle | `kubectl logs <pod> --previous` | Presque toujours une variable manquante ou une dépendance injoignable |
| `OOMKilled` | Le conteneur a dépassé sa `limits.memory` | `kubectl describe pod`, `Last State: Terminated, Reason: OOMKilled` | Remonter la `limits.memory` (mesurée en Phase 12 : plancher observé 16-20Mi, valeur retenue 64Mi) |
| `Evicted` | Le node manquait de ressources, a expulsé le pod | `kubectl describe node` | Regarder l'ensemble des pods du node, pas seulement le coupable apparent |

## Cinq pannes rejouées pour de vrai (Phase 10)

| Panne | Signature `get pods` | Signature `describe`/logs | Se répare seule ? | Remède |
|---|---|---|---|---|
| Pod supprimé (`kubectl delete pod`) | Le pod disparaît puis un nouveau apparaît en ~3s | Event `Scheduled` sur le nouveau pod | **Oui** | Aucun — la boucle de réconciliation recrée le pod |
| Process tué dans le conteneur (`kill -9 1` depuis `kubectl exec`) | Aucun changement visible, `RESTARTS` reste à 0 | Aucun | **N/A** | Sans effet : PID 1 dans un namespace Linux est immunisé aux signaux non gérés envoyés depuis l'intérieur du même namespace, y compris `SIGKILL` (`pid_namespaces(7)`) |
| Tag d'image inexistant (`kubectl set image ... :ce-tag-n-existe-pas`) | Nouveau pod bloqué en `ErrImagePull`/`ImagePullBackOff`, anciens pods toujours `Running` | Event `Failed: ... not found` | **Non** | `kubectl rollout undo` |
| Clé du Secret supprimée (`DB_PASSWORD`) + `rollout restart` | Nouveau pod en `CrashLoopBackOff`, anciens pods toujours `Running` | `kubectl logs --previous` : `Variable d'environnement manquante : DB_PASSWORD` | **Non** | Restaurer la clé dans le Secret, `rollout restart` |
| `limits.memory` trop basse (8-16Mi) | Nouveau pod en `CrashLoopBackOff` | `Last State: Terminated, Reason: OOMKilled`, exit code 137 | **Non** | Remonter `limits.memory` |

Dans les cinq cas, `maxUnavailable: 0` a protégé le service : les anciens pods sains n'ont jamais été retirés tant que les nouveaux n'étaient pas prêts, donc aucune panne testée n'a coupé le trafic réel — seul un `kubectl get pods` attentif révèle qu'un déploiement est bloqué.

## Limite connue

`/health` vérifie seulement que le serveur HTTP répond, pas que la base de données est joignable. Une base coupée fait échouer les vraies routes (`/api/tasks`) en 500 tout en laissant les sondes readiness/liveness passer — les pods restent "sains" aux yeux du cluster pendant que l'application ne rend plus le service. Un `/health` qui interrogerait la base à chaque appel corrigerait ce mensonge, au prix d'une cascade de sondes en échec si la base ralentit seulement un peu (compromis documenté au chapitre 5 du cours).

## Durée estimée

Déploiement complet (push → pipeline → cluster à jour) : 45-60 secondes. Rolling update sous charge continue, mesuré : **0 requête perdue sur 663** (`maxSurge: 1`, `maxUnavailable: 0`). Retour arrière : 0.34 seconde.
