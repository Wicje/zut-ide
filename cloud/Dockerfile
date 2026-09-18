FROM node:22-bookworm-slim

# opencode binary (Debian build) + tini for signal handling.
# Installed as root, then copied somewhere the unprivileged runtime user
# can execute — the agent must never run as root (it executes model-driven
# shell commands with --auto).
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://opencode.ai/install.sh | bash \
  && cp /root/.opencode/bin/opencode /usr/local/bin/opencode \
  && chmod +x /usr/local/bin/opencode \
  && opencode --version || true

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY cloud/server.mjs ./cloud/server.mjs

RUN useradd -m -u 10001 appuser \
  && mkdir -p /data \
  && chown -R appuser:appuser /app /data /home/appuser

ENV PORT=8787 HOST=0.0.0.0 DATA_ROOT=/data HOME=/home/appuser
VOLUME /data
EXPOSE 8787

USER appuser
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "cloud/server.mjs"]
