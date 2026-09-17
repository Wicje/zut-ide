FROM node:22-bookworm-slim

# opencode binary (Debian build) + tini for signal handling
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://opencode.ai/install.sh | bash \
  && ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode \
  && opencode --version || true

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY cloud/server.mjs ./cloud/server.mjs

ENV PORT=8787 HOST=0.0.0.0 DATA_ROOT=/data
VOLUME /data
EXPOSE 8787

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "cloud/server.mjs"]
