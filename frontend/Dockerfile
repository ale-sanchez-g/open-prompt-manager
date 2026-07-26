# Build stage
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Flagsmith feature flags are compiled into the bundle at build time (Vite bakes
# VITE_* vars). Pass the client-side Environment key (and optional API URL) as
# build args; docker-compose sources them from the repo-root .env. Without an ID
# the app still builds — flags just stay disabled (safe default).
ARG VITE_FLAGSMITH_ENVIRONMENT_ID=""
ARG VITE_FLAGSMITH_API_URL="https://edge.api.flagsmith.com/api/v1/"
ENV VITE_FLAGSMITH_ENVIRONMENT_ID=$VITE_FLAGSMITH_ENVIRONMENT_ID
ENV VITE_FLAGSMITH_API_URL=$VITE_FLAGSMITH_API_URL

RUN DISABLE_ESLINT_PLUGIN=true npm run build

# Production stage
FROM nginx:1-alpine-slim

COPY --from=build /app/build /usr/share/nginx/html
# Use templates/ so nginx's built-in entrypoint runs envsubst, injecting BACKEND_URL at container start
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
