FROM node:22-alpine AS build
WORKDIR /app
COPY package.json index.html ./
COPY scripts ./scripts
COPY src ./src
COPY test ./test
RUN npm run lint && npm test && npm run build
FROM nginx:stable-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://backend:8080
EXPOSE 80
