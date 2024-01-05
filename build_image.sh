aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 207124830781.dkr.ecr.us-east-2.amazonaws.com

docker build --no-cache -t unipath-clamav .

docker tag unipath-clamav:latest 207124830781.dkr.ecr.us-east-2.amazonaws.com/unipath-clamav:latest

docker push 207124830781.dkr.ecr.us-east-2.amazonaws.com/unipath-clamav:latest

docker ps -aq | xargs -r docker stop && \
docker ps -aq | xargs -r docker rm && \
docker images -aq | xargs -r docker rmi -f && \
docker volume ls -q | xargs -r docker volume rm && \
docker network ls -q | grep -v -e "bridge" -e "host" -e "none" | xargs -r docker network rm
