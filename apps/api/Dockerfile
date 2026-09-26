# API (NestJS + WebSocket) ka production image.
# IMPORTANT: build context REPO ROOT hona chahiye (monorepo hai), apps/api nahi.
#   docker build -f apps/api/Dockerfile .
# Railway me: Dockerfile Path = apps/api/Dockerfile, Root Directory khaali (= repo root).

FROM node:22-alpine AS build
WORKDIR /repo
# Poora repo copy (npm workspaces ka lockfile sabhi packages ke against valid hona chahiye,
# isliye sirf kuch files copy karna risky hai).
COPY . .
RUN npm ci
RUN npm run build:api
# devDependencies (typescript, @nestjs/cli, vitest...) hata do; sirf runtime deps bachein.
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared-types/package.json packages/shared-types/package.json
COPY --from=build /repo/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /repo/packages/game-engine/package.json packages/game-engine/package.json
COPY --from=build /repo/packages/game-engine/dist packages/game-engine/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/migrations apps/api/migrations

EXPOSE 3000
# Migrations start hote hi apne aap chal jaati hain (DatabaseModule), agar DATABASE_URL set ho.
CMD ["node", "apps/api/dist/main.js"]
