FROM public.ecr.aws/lambda/nodejs:16

RUN yum update -y && \
    yum install -y amazon-linux-extras && \
    yum install -y tar gzip nfs-utils && \
    yum install -y clamav clamav-update && \
    yum clean all && \
    rm -rf /var/cache/yum

RUN mkdir -p /mnt/efs/clam && \
    chmod -R 755 /mnt/efs/clam && \
    sed -i 's|^#DatabaseDirectory .*|DatabaseDirectory /mnt/efs/clam|' /etc/clamd.conf && \
    sed -i 's|^#DatabaseDirectory .*|DatabaseDirectory /mnt/efs/clam|' /etc/freshclam.conf

ENV AWS_LAMBDA_RUNTIME_API=localhost:9002

COPY lib/ /var/task/lib/
RUN chmod 755 -R /var/task/lib/

CMD [ "lib/functions/index.handler" ]
