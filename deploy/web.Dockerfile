# syntax=docker/dockerfile:1.7
# The web app, built once and served by Caddy with the API behind it on the same origin
# (deploy/Caddyfile): VITE_NABU_API=/ means "this origin", so the image fits any domain.
#
#   docker build -f deploy/web.Dockerfile -t nabu-web .
#
# Behind a TLS-inspecting proxy, pass its CA as a build secret: --secret id=ca,src=<pem>.
FROM node:22.23-slim AS build
ENV CI=1
WORKDIR /srv/nabu
RUN corepack enable
COPY . .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --filter "@nabu/web..."
RUN VITE_NABU_API=/ pnpm --filter @nabu/web build

FROM caddy:2.10-alpine
COPY --from=build /srv/nabu/apps/web/dist /srv/www
COPY deploy/Caddyfile /etc/caddy/Caddyfile
