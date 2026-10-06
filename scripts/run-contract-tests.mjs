import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const contractScripts = Object.keys(packageJson.scripts)
  .filter((name) => name.endsWith('-contracts'))
  .sort();

if (contractScripts.length === 0) {
  throw new Error('No contract-test scripts were found.');
}

for (const script of contractScripts) {
  const result = spawnSync('npm', ['run', script], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`All ${contractScripts.length} contract suites passed.`);
