# One image: the built frontend and the two consumers that serve it, on one origin.
#
# Node 22 rather than a bundler: the consumers are plain TypeScript run through Node's own type
# stripping, which is how they are tested, so what runs in production is what the tests exercised.
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The dashboard reads the fuzz counter from the repo rather than carrying its own number.
COPY docs/fuzz-counter.json /app/docs/fuzz-counter.json
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY indexer/consumers/package.json ./indexer/consumers/package.json
COPY indexer/consumers/src ./indexer/consumers/src
COPY frontend/api/_lib ./frontend/api/_lib
COPY --from=frontend /app/frontend/dist ./frontend/dist
ENV STATIC_ROOT=/app/frontend/dist
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "indexer/consumers/src/server.ts"]
