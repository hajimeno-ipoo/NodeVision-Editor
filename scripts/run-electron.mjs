import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';

async function resolveBackendUrl() {
  const defaultUrl = env.BACKEND_URL ?? 'http://127.0.0.1:8000';
  const portFile = join(process.cwd(), 'tmp', 'backend-port.json');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const content = await readFile(portFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.port === 'number') {
        return `http://${parsed.host ?? '127.0.0.1'}:${parsed.port}`;
      }
    } catch {
      // ファイルがまだ存在しない場合は短く待ってリトライ
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
  }

  return defaultUrl;
}

async function runElectron() {
  const sanitizedEnv = { ...env };
  delete sanitizedEnv.ELECTRON_RUN_AS_NODE;

  const backendUrl = await resolveBackendUrl();
  sanitizedEnv.BACKEND_URL = backendUrl;
  console.log(`[scripts/run-electron] BACKEND_URL=${backendUrl}`);

  const child = spawn('electron', ['.'], {
    stdio: 'inherit',
    env: sanitizedEnv
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 0;
  });

  child.on('error', (error) => {
    console.error('[scripts/run-electron] Failed to launch Electron:', error);
    process.exit(1);
  });
}

runElectron().catch((error) => {
  console.error('[scripts/run-electron] Unexpected failure:', error);
  process.exit(1);
});
