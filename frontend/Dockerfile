# Stage 1: Build the React/Vite app with Node 22 (LTS)
FROM node:22-alpine AS build

WORKDIR /app

# Optional: Allow injecting the backend API URL during build
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build

# Stage 2: Serve using Nginx
FROM nginx:alpine

# Copy custom Nginx SPA routing config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled production assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]