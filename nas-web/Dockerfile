# linux/arm64, no Chromium, no FFmpeg, no npm install.
# Freeze still works without FFmpeg (move into Freezer/). Encode is optional if
# ffmpeg is later added to PATH or FFMPEG_PATH; do not bake it into this image.
# Chrome TLS (curl-impersonate) is required because Tornado/Cloudflare
# resets Node's built-in HTTPS. ~9 MB musl binary, still tiny vs Chromium.
FROM --platform=linux/arm64 node:18-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tar bash \
  && curl -fsSL -o /tmp/ci.tgz \
    https://github.com/lexiforest/curl-impersonate/releases/download/v1.5.6/curl-impersonate-v1.5.6.aarch64-linux-musl.tar.gz \
  && mkdir -p /opt/curl-impersonate \
  && tar -xzf /tmp/ci.tgz -C /opt/curl-impersonate \
  && if [ ! -f /opt/curl-impersonate/curl-impersonate ]; then \
       found="$(find /opt/curl-impersonate -type f -name 'curl-impersonate' | head -n 1)"; \
       [ -n "$found" ] && cp "$found" /opt/curl-impersonate/curl-impersonate; \
     fi \
  && chmod +x /opt/curl-impersonate/curl-impersonate /opt/curl-impersonate/curl_chrome* 2>/dev/null || true \
  && test -f /opt/curl-impersonate/curl-impersonate \
  && rm /tmp/ci.tgz \
  && rm -rf /var/lib/apt/lists/*

# Bundled Node server (PIN session routes live here, not in a separate lib/ copy).
# Do not COPY .env — PIN is runtime env from compose (env_file + /app/.env mount).
COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8787
ENV VIDEO_ROOT=/data/videos
ENV DATA_ROOT=/data/app
ENV NODE_OPTIONS=--max-old-space-size=192
ENV CURL_IMPERSONATE_BIN=/opt/curl-impersonate/curl-impersonate

EXPOSE 8787
CMD ["node", "server.js"]
