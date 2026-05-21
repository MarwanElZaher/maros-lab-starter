FROM mcr.microsoft.com/playwright:v1.48.0-noble AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.48.0-noble AS runner

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

# Install only chromium (skip firefox/webkit to keep image lean)
RUN npx playwright install chromium --with-deps

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
