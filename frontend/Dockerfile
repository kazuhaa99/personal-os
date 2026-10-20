FROM node:22-alpine AS build
# Path prefix the app is served under, e.g. /personalos/ (default: the site root).
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ARG VITE_BASE=/
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Under a prefix, strip it here, so the same URLs work through the host's reverse proxy
# (which passes /prefix/... through unchanged) and directly on the published port.
RUN set -eu; b="$(printf '%s' "$VITE_BASE" | sed -E 's#^/+##; s#/+$##')"; \
    [ -z "$b" ] || printf '%s\n' "$b" | grep -qE '^[A-Za-z0-9._/-]+$' || { echo "bad VITE_BASE: $VITE_BASE" >&2; exit 1; }; \
    if [ -n "$b" ]; then \
      printf 'location = /%s { return 301 /%s/; }\nlocation ^~ /%s/ { rewrite ^/%s/(.*)$ /$1 last; }\n' "$b" "$b" "$b" "$b" > /etc/nginx/pos-base.conf; \
    else echo "# served at the site root" > /etc/nginx/pos-base.conf; fi; \
    cat /etc/nginx/pos-base.conf
EXPOSE 80
