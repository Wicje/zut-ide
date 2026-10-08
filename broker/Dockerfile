FROM node:22-bookworm-slim

# Program runners for demo-local mode (no CELLS_API_KEY): python3 + go power
# POST /api/broker/run so phones/<2GB Chromebooks execute code on the server
# instead of locally. With CELLS_API_KEY set, runs go to Cells and these are
# only a fallback. Runs as unprivileged appuser — never root.
RUN apt-get update && apt-get install -y --no-install-recommends tini python3 golang-go \
  && rm -rf /var/lib/apt/lists/* \
  && python3 --version \
  && go version

# No npm deps: the broker is node builtins only (http, spawn, fs).
WORKDIR /app
COPY broker/server.mjs ./broker/server.mjs
COPY broker/cells.mjs ./broker/cells.mjs
COPY broker/lib.mjs ./broker/lib.mjs

RUN useradd -m -u 10001 appuser \
  && mkdir -p /data \
  && chown -R appuser:appuser /app /data /home/appuser

ENV PORT=8787 HOST=0.0.0.0 DATA_ROOT=/data HOME=/home/appuser
VOLUME /data
EXPOSE 8787

USER appuser
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "broker/server.mjs"]
