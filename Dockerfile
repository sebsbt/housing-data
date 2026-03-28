# Build SPA, then run a small Express server that serves /api + static dist.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY data ./data
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/index.mjs"]
