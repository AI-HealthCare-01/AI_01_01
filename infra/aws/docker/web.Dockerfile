# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/domain/package*.json ./packages/domain/

RUN npm install

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build --workspace @mindsight/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
COPY package*.json ./
COPY packages ./packages

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@mindsight/web"]
