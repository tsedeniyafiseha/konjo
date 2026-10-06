import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Unable to allocate a local smoke-test port.'));
        return;
      }
      probe.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function waitForApi(process: ChildProcess): Promise<void> {
  return new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('Konjo API did not start within 10 seconds.')), 10_000);
    const onExit = (code: number | null) => {
      clearTimeout(timeout);
      reject(new Error(`Konjo API exited before smoke tests started (code ${code ?? 'unknown'}).`));
    };
    process.once('exit', onExit);
    process.stdout?.on('data', (chunk: Buffer) => {
      const output = chunk.toString();
      if (!output.includes('"event":"api_listening"')) return;
      clearTimeout(timeout);
      process.removeListener('exit', onExit);
      resolveReady();
    });
  });
}

function runSmoke(baseUrl: string, databasePath: string): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const smoke = spawn(process.execPath, ['backend/scripts/smoke-test.ts'], {
      cwd: resolve('.'),
      env: { ...processEnv, KONJO_TEST_API_URL: baseUrl, KONJO_TEST_DATABASE_PATH: databasePath },
      stdio: 'inherit',
    });
    smoke.once('error', reject);
    smoke.once('exit', (code) => code === 0
      ? resolveRun()
      : reject(new Error(`Konjo API smoke test failed with exit code ${code ?? 'unknown'}.`)));
  });
}

const processEnv = process.env;
const directory = mkdtempSync(join(tmpdir(), 'konjo-api-smoke-'));
const databasePath = join(directory, 'konjo.db');
const port = await availablePort();
const api = spawn(process.execPath, ['backend/src/server.ts'], {
  cwd: resolve('.'),
  env: {
    ...processEnv,
    // Smoke tests must never use a live provider inherited from the shell.
    KONJO_AUTH_MODE: 'development',
    NODE_ENV: 'test',
    KONJO_CHAPA_SECRET_KEY: '',
    EXPO_ACCESS_TOKEN: '',
    SMSETHIOPIA_API_KEY: '',
    KONJO_SUPABASE_URL: '',
    KONJO_SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    KONJO_IN_PROCESS_JOBS: 'false',
    KONJO_API_HOST: '127.0.0.1',
    KONJO_API_PORT: String(port),
    KONJO_DATABASE_PATH: databasePath,
    KONJO_RATE_LIMIT_PER_MINUTE: '1000',
    KONJO_AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    KONJO_WORKER_TOKEN: 'konjo-smoke-worker-token-at-least-32-characters',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});

try {
  await waitForApi(api);
  await runSmoke(`http://127.0.0.1:${port}`, databasePath);
} finally {
  if (api.exitCode === null) api.kill('SIGTERM');
  await new Promise<void>((resolveExit) => {
    if (api.exitCode !== null) resolveExit();
    else api.once('exit', () => resolveExit());
  });
  rmSync(directory, { recursive: true, force: true });
}
