# Stage 1: compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json .
COPY src/ ./src/
RUN npm run build


# Stage 2: lean runtime — compiled JS + production deps only
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist/

EXPOSE 3001
CMD ["node", "dist/index.js"]
