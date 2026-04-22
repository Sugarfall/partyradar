FROM node:20-bookworm-slim

# Prisma's binary query engine links against OpenSSL at runtime.
# Bookworm ships openssl 3.0.x — same version as the npm binary Prisma downloads
# for the "debian-openssl-3.0.x" / "native" target on this image, so the binary
# works without any platform-mismatch crashes.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy repository files (node_modules and dist are excluded via .dockerignore)
COPY . .

# Install dependencies
RUN npm install --prefer-offline

# Generate Prisma client — downloads the binary query engine for the current
# platform (debian-openssl-3.0.x on bookworm) into node_modules/.prisma/client/
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Compile TypeScript packages in dependency order
RUN npm run build -w packages/shared && \
    npm run build -w packages/db && \
    npm run build -w packages/api

EXPOSE 4000

CMD ["node", "packages/api/dist/index.js"]
