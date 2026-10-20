// `zut-term` launcher. Runs in plain Node (not inside the pixel runtime):
// it makes sure the Zut app is being served, then hands the screen over to
// the pixel app.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { UsageError, parseArgs, usage } from './options.js';
import {
  TERMINAL_DIR,
  ensureAppServer,
  pixelAppEntry,
  pixelEntry,
  type AppServer,
} from './server.js';

export async function main(argv: string[]): Promise<number> {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`zut-term: ${err.message}\n`);
      console.error(usage());
      return 2;
    }
    throw err;
  }

  if (opts.help) {
    console.log(usage());
    return 0;
  }

  if (!existsSync(pixelAppEntry())) {
    console.error(
      'zut-term: the terminal app is not built yet — run `npm --prefix terminal install && npm --prefix terminal run build`.',
    );
    return 1;
  }

  let server: AppServer | null = null;
  if (!opts.url) {
    try {
      server = await ensureAppServer({
        mode: opts.mode,
        port: opts.port,
        rebuild: opts.rebuild,
        log: (message) => console.error(message),
      });
    } catch (err) {
      console.error(`zut-term: ${(err as Error).message}`);
      return 1;
    }
  }

  const url = opts.url ?? server!.url;

  const child = spawn(process.execPath, [pixelEntry(), '.', '--', url], {
    cwd: TERMINAL_DIR,
    stdio: 'inherit',
    env: { ...process.env, ZUT_TERM_URL: url },
  });

  const shutdown = () => {
    server?.stop();
  };
  const onSignal = () => {
    shutdown();
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return await new Promise<number>((resolve) => {
    child.on('error', (err) => {
      console.error(`zut-term: ${(err as Error).message}`);
      shutdown();
      resolve(1);
    });
    child.on('exit', (code, signal) => {
      shutdown();
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}
