FROM public.ecr.aws/lambda/nodejs:16

# Update and install necessary packages
RUN yum update -y && \
    yum install -y amazon-linux-extras && \
    yum install -y tar gzip nfs-utils && \
    yum install -y clamav clamav-update && \
    yum clean all && \
    rm -rf /var/cache/yum

# Create ClamAV directories
RUN mkdir -p /mnt/efs/clam && \
    chmod -R 755 /mnt/efs/clam

# Check for clamd.conf and freshclam.conf, create if not exists
RUN if [ ! -f /etc/clamd.conf ]; then \
        echo "DatabaseDirectory /mnt/efs/clam" > /etc/clamd.conf; \
    fi; \
    if [ ! -f /etc/freshclam.conf ]; then \
        echo "DatabaseDirectory /mnt/efs/clam" > /etc/freshclam.conf; \
    fi

ENV AWS_LAMBDA_RUNTIME_API=localhost:9002

COPY lib/ /var/task/lib/
RUN chmod 755 -R /var/task/lib/

CMD ["lib/functions/index.handler"]
