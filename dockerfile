FROM public.ecr.aws/lambda/nodejs:16

RUN yum update -y && \
    yum install -y amazon-linux-extras && \
    yum install -y tar gzip nfs-utils && \
    yum install -y clamav clamav-update && \
    yum clean all && \
    rm -rf /var/cache/yum

RUN mkdir -p /mnt/efs/clam && \
    chmod -R 755 /mnt/efs/clam

COPY clamd.conf /etc/clamd.conf
COPY freshclam.conf /etc/freshclam.conf

ENV AWS_LAMBDA_RUNTIME_API=localhost:9002
ENV NODE_PATH=/mnt/efs/node_modules

COPY lib/ /var/task/lib/
RUN chmod 755 -R /var/task/lib/

CMD ["lib/functions/index.handler"]
