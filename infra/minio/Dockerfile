# Standalone deploy of the same MinIO image docker-compose.yml runs locally,
# for platforms (Railway) that build a service from a Dockerfile rather than
# accepting a bare image + docker-compose's `command:` override.
FROM minio/minio:latest
EXPOSE 9000 9001
CMD ["server", "/data", "--console-address", ":9001"]
