#!/usr/bin/env bash
# Build script for Railway — compiles TypeScript to JS so the API runs
# with plain `node` (no tsx runtime loader = no event-loop interference
# with Prisma's native binary initialisation).
set -euo pipefail

echo "=== [1/5] Installing dependencies ==="
npm install --prefer-offline

echo "=== [2/5] Generating Prisma client ==="
npx prisma generate --schema=packages/db/prisma/schema.prisma

echo "=== [3/5] Compiling @partyradar/shared ==="
npx tsc --project packages/shared/tsconfig.json
# Point main → compiled JS so Node can require it at runtime
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('packages/shared/package.json', 'utf8'));
  p.main = './dist/index.js';
  fs.writeFileSync('packages/shared/package.json', JSON.stringify(p, null, 2) + '\n');
  console.log('[build] packages/shared main ->', p.main);
"

echo "=== [4/5] Compiling @partyradar/db ==="
npx tsc --project packages/db/tsconfig.json
# Point main → compiled JS so Node can require it at runtime
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('packages/db/package.json', 'utf8'));
  p.main = './dist/index.js';
  fs.writeFileSync('packages/db/package.json', JSON.stringify(p, null, 2) + '\n');
  console.log('[build] packages/db main ->', p.main);
"

echo "=== [5/5] Compiling @partyradar/api ==="
npx tsc --project packages/api/tsconfig.json

echo ""
echo "=== Build complete ==="
ls -la packages/api/dist/
