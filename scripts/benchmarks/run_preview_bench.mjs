#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const workspace = process.cwd();
const logPath = process.env.BENCH_LOG ?? join(workspace, 'tmp', 'preview_bench.log');
const backendPortFile = join(workspace, 'tmp', 'backend-port.json');

async function waitForFile(filePath, attempts = 60, intervalMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await access(filePath, fsConstants.F_OK);
      return;
    } catch {
      await delay(intervalMs);
    }
  }
  throw new Error(`必要なファイルを検出できませんでした: ${filePath}`);
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (typeof signal === 'string' && signal.length) {
        reject(new Error(`${command} がシグナル ${signal} で終了しました。`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}

async function main() {
  await rm(logPath, { force: true }).catch(() => {});

  const backendEnv = { ...process.env };
  const backend = spawn(process.execPath, ['scripts/run-backend.mjs'], {
    stdio: 'inherit',
    env: backendEnv
  });

  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) {
      return;
    }
    cleaning = true;
    if (!backend.killed) {
      backend.kill('SIGINT');
      await delay(500);
      backend.kill('SIGTERM');
    }
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(143);
  });

  try {
    await Promise.race([
      waitForFile(backendPortFile, 60, 500),
      new Promise((_, reject) => {
        backend.once('exit', (code) => {
          reject(new Error(`バックエンドが予期せず終了しました (exit code ${code ?? 0})`));
        });
      })
    ]);

    const electronEnv = {
      ...process.env,
      NODEVISION_BENCH: 'preview',
      BENCH_LOG: logPath
    };

    const electronCode = await runCommand(process.execPath, ['scripts/run-electron.mjs'], {
      stdio: 'inherit',
      env: electronEnv
    });

    if (electronCode !== 0) {
      throw new Error(`Electron ベンチ起動が異常終了しました (exit code ${electronCode})`);
    }

    const aggregatorEnv = {
      ...process.env,
      BENCH_LOG: logPath
    };

    const aggregatorCode = await runCommand(process.execPath, ['scripts/benchmarks/preview_delay.js'], {
      stdio: 'inherit',
      env: aggregatorEnv
    });

    if (aggregatorCode !== 0) {
      throw new Error(`プレビュー遅延集計に失敗しました (exit code ${aggregatorCode})`);
    }

    try {
      const historyDir = join(workspace, 'docs', 'benchmarks', 'history');
      await mkdir(historyDir, { recursive: true });
      const latestPath = join(workspace, 'docs', 'benchmarks', 'latest.md');
      const latestContent = await readFile(latestPath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
      const historyPath = join(historyDir, `${timestamp}.md`);
      await writeFile(historyPath, latestContent, 'utf-8');
      console.log(`[bench-runner] 履歴を記録しました: ${historyPath}`);
      const summaryEnv = { ...process.env };
      const summaryCode = await runCommand(process.execPath, ['scripts/benchmarks/summarize_history.mjs'], {
        stdio: 'inherit',
        env: summaryEnv
      });
      if (summaryCode !== 0) {
        console.warn('[bench-runner] 履歴サマリーの更新に失敗しました。');
      }
    } catch (historyError) {
      console.warn('[bench-runner] ベンチマーク履歴の保存に失敗しました:', historyError);
    }

    console.log(`[bench-runner] 完了: ${logPath} を更新しました。`);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('[bench-runner] エラーが発生しました:', error);
  process.exit(1);
});
