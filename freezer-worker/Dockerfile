# Encode worker for CinaRip Freezer. Runs on a PC (or any machine with RAM).
# Do not run this on the 1GB NAS.
FROM node:18-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg cifs-utils keyutils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY worker.js ./
COPY lib ./lib
COPY public ./public
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8791
ENV VIDEO_ROOT=/videos
ENV CONFIG_ROOT=/config
ENV NAS_MOUNT_POINT=/mnt/nas
ENV FFMPEG_THREADS=2
ENV FFMPEG_CRF=24
ENV NAS_ORIGIN=https://cinarip.matthewsuess.com

EXPOSE 8791
ENTRYPOINT ["/docker-entrypoint.sh"]
