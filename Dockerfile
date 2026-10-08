FROM node:24-alpine AS build
WORKDIR /workspace
COPY package*.json ./
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-timeout=300000
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/paz-salvo-web/browser /usr/share/nginx/html
EXPOSE 80
