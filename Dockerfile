# Campaign Tracker – production image (SQLite + local file storage on a volume)
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL="file:/data/campaign-tracker.db" \
    STORAGE_DIR="/data/uploads"
# Full node_modules: the start script needs the Prisma CLI and tsx for the first-run seed.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/src/lib ./src/lib
COPY deploy/start.sh ./start.sh
VOLUME /data
EXPOSE 3000
CMD ["sh", "./start.sh"]
