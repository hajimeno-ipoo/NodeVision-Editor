import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { cwd, exit, platform } from 'node:process';

const START_PORT = 8000;
const MAX_ATTEMPTS = 5;
const HOST = '127.0.0.1';
const PORT_FILE = join(cwd(), 'tmp', 'backend-port.json');

async function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function findAvailablePort() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const port = START_PORT + attempt;
    // eslint-disable-next-line no-await-in-loop
    const available = await checkPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`ポート ${START_PORT} から ${START_PORT + MAX_ATTEMPTS - 1} までが全て使用中です。`);
}

async function persistPort(port) {
  await mkdir(join(cwd(), 'tmp'), { recursive: true });
  const payload = {
    host: HOST,
    port,
    updatedAt: new Date().toISOString()
  };
  await writeFile(PORT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

async function cleanupPortFile() {
  try {
    await rm(PORT_FILE, { force: true });
  } catch {
    // ignore
  }
}

async function resolveUvicornCommand() {
  const baseDir = cwd();
  const candidates = platform === 'win32'
    ? [join(baseDir, '.venv', 'Scripts', 'uvicorn.exe'), join(baseDir, '.venv', 'Scripts', 'uvicorn')]
    : [join(baseDir, '.venv', 'bin', 'uvicorn')];

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('uvicorn 実行ファイルが見つかりませんでした。`.venv` を作成し、依存関係をインストールしてください。');
}

async function main() {
  const port = await findAvailablePort();
  await persistPort(port);
  console.log(`[run-backend] ポート ${port} で FastAPI を起動します。`);

  const command = await resolveUvicornCommand();
  const args = ['backend.app.main:app', '--host', HOST, '--port', String(port), '--reload'];

  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env
  });

  const handleExit = async (code) => {
    await cleanupPortFile();
    exit(code ?? 0);
  };

  child.on('exit', async (code, signal) => {
    if (signal) {
      await cleanupPortFile();
      process.kill(process.pid, signal);
      return;
    }
    await handleExit(code);
  });

  child.on('error', async (error) => {
    await cleanupPortFile();
    console.error('[run-backend] FastAPI の起動に失敗しました:', error);
    exit(1);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await cleanupPortFile();
      process.kill(child.pid, signal);
    });
  }
}

main().catch(async (error) => {
  console.error('[run-backend] 初期化に失敗しました:', error instanceof Error ? error.message : error);
  await cleanupPortFile();
  exit(1);
});
