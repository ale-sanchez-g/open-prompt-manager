# Build stage
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN DISABLE_ESLINT_PLUGIN=true npm run build

# Production stage
FROM nginx:1-alpine-slim

COPY --from=build /app/build /usr/share/nginx/html
# Use templates/ so nginx's built-in entrypoint runs envsubst, injecting BACKEND_URL at container start
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
