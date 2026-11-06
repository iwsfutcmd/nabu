# syntax=docker/dockerfile:1.7
# The API (apps/api). Node runs its TypeScript, and the workspace packages' (ADR 0013), as source,
# and refuses TypeScript inside node_modules: so the image keeps the workspace's layout, where
# pnpm links the packages from outside node_modules.
#
#   docker build -f deploy/api.Dockerfile -t nabu-api .
#
# Behind a TLS-inspecting proxy, pass its CA as a build secret: --secret id=ca,src=<pem>.
FROM node:22.23-slim
ENV CI=1 NODE_ENV=production
WORKDIR /srv/nabu
RUN corepack enable
COPY . .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --prod --filter "@nabu/api..." \
    && rm -rf /root/.cache /root/.local/share/pnpm/store
USER node
EXPOSE 8787
# Migrations run on start (apps/api/src/db/index.ts).
CMD ["node", "apps/api/src/main.ts"]
