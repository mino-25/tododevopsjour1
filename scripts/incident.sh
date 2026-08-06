#!/bin/sh
# incident.sh : tire une panne au hasard parmi cinq, sur la machine cible.
# A lancer SUR vm-prod : ssh -i deploy_key -p 2222 root@localhost 'sh -s' < scripts/incident.sh
N=$(( $(od -An -N1 -tu1 /dev/urandom) % 5 + 1 ))
echo "$N" | base64 > /root/.incident # la reponse, pour le debriefing seulement
IMAGE=$(docker inspect -f '{{.Config.Image}}' todo-api)

case "$N" in
  1) docker stop todo-api ;; # plus personne ne repond
  2) docker stop todo-db ;; # l'API repond, la base a disparu
  3) NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' todo-api | awk '{print $1}')
     docker network disconnect "$NET" todo-api ;; # la base tourne, mais l'API ne la joint plus
  4) docker rm -f todo-api
     docker run -d --name todo-api -p 3000:3000 "$IMAGE" ;; # relancee sans sa configuration
  5) for i in 1 2 3 4; do
       docker run -d --name "hog-$i" alpine sh -c 'while :; do :; done'
     done ;; # la machine ne respire plus
esac >/dev/null 2>&1
