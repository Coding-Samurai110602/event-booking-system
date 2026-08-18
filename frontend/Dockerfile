# Stage 1: build the Vite bundle
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Build args are baked into the static bundle at build time by Vite.
# They must be supplied as --build-arg so the compiled JS references the
# correct backend URLs rather than the localhost defaults.
ARG VITE_BOOKING_API_URL=http://localhost:8000
ARG VITE_STATUS_SERVICE_URL=http://localhost:3001
ENV VITE_BOOKING_API_URL=$VITE_BOOKING_API_URL
ENV VITE_STATUS_SERVICE_URL=$VITE_STATUS_SERVICE_URL

RUN npm run build


# Stage 2: serve the built static files with a lightweight HTTP server
FROM node:20-alpine AS runtime

# 'serve' is a zero-config static file server from Vercel — 1 dependency,
# no nginx config to maintain.
RUN npm install -g serve@14

COPY --from=builder /app/dist /app/dist

EXPOSE 5173
CMD ["serve", "-s", "/app/dist", "-l", "5173"]
