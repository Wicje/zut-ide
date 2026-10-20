#!/usr/bin/env node
// Thin wrapper so `zut-term` works from a checkout. The real launcher is
// TypeScript and lives in dist/ — build it with `npm --prefix terminal run build`.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, '..', 'dist', 'launcher.js');

if (!existsSync(entry)) {
  console.error(
    'zut-term: not built yet — run `npm --prefix terminal install && npm --prefix terminal run build`.',
  );
  process.exit(1);
}

const { main } = await import(entry);
process.exitCode = await main(process.argv.slice(2));
