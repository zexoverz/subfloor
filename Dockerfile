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

# Vite reads its configuration at build time and bakes it into the bundle, so anything not present
# *here* is absent from the shipped app — not missing at runtime, where it could be noticed, but
# compiled out. Without these the image built and served perfectly while the wallet could not
# connect and every contract address was the empty string: the deployed bundle carried only the
# hardcoded constants and none of the deployment's own addresses.
#
# None of these are secrets. Every one of them ends up in a file the browser downloads — contract
# addresses, a subgraph URL, and a Reown project id that is public by design. The secrets in this
# image are the ones the server reads at runtime, and they stay out of the build.
ARG VITE_REOWN_PROJECT_ID
ARG VITE_CHAIN
ARG VITE_FLOOR_REGISTRY
ARG VITE_FLOOR_ROUTER
ARG VITE_VAULT
ARG VITE_VAULT_FACTORY
ARG VITE_AQUA
ARG VITE_SUBGRAPH_URL
ARG VITE_FAUCET
ENV VITE_REOWN_PROJECT_ID=$VITE_REOWN_PROJECT_ID \
    VITE_CHAIN=$VITE_CHAIN \
    VITE_FLOOR_REGISTRY=$VITE_FLOOR_REGISTRY \
    VITE_FLOOR_ROUTER=$VITE_FLOOR_ROUTER \
    VITE_VAULT=$VITE_VAULT \
    VITE_VAULT_FACTORY=$VITE_VAULT_FACTORY \
    VITE_AQUA=$VITE_AQUA \
    VITE_SUBGRAPH_URL=$VITE_SUBGRAPH_URL \
    VITE_FAUCET=$VITE_FAUCET

RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Dependencies go at the image root, not inside indexer/consumers.
#
# Node resolves from the importing file's directory upward, and the shared library lives at
# /app/frontend/api/_lib — so a node_modules under /app/indexer/consumers is invisible to it. That
# is exactly how this 502'd: `Cannot find package 'viem' imported from /app/frontend/api/_lib/chain.ts`.
# At /app both entry points resolve.
COPY indexer/consumers/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY indexer/consumers/src ./indexer/consumers/src
COPY frontend/api/_lib ./frontend/api/_lib
# The policy loop and the program builder it composes through. Source only, and it shares the
# viem at /app that the consumers already install — the loop holds no key and opens no port,
# so it rides this image and is selected by a start command rather than a second build.
COPY agent/src ./agent/src
COPY sdk/src ./sdk/src
COPY --from=frontend /app/frontend/dist ./frontend/dist
ENV STATIC_ROOT=/app/frontend/dist
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "indexer/consumers/src/server.ts"]
