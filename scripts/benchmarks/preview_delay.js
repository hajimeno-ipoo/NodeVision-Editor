#!/usr/bin/env node

// Preview delay benchmark aggregator.
// Electron 側の metrics:previewLog IPC から出力されたログファイルを解析し、
// プロファイル別の遅延／プロキシ運用状況を Markdown に整形する。

import fs from 'node:fs';
import path from 'node:path';

const LOG_PATH = process.env.BENCH_LOG ?? path.resolve('tmp', 'preview_bench.log');

if (!fs.existsSync(LOG_PATH)) {
  console.error(`ログファイルが見つかりません: ${LOG_PATH}`);
  console.error('Electron 側でベンチマークログを出力し、BENCH_LOG 環境変数でパスを指定してください。');
  process.exit(1);
}

const rawLines = fs.readFileSync(LOG_PATH, 'utf-8')
  .trim()
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0);

const proxyReasonLabels = {
  client_force_on: 'レンダラー強制 ON',
  client_force_off: 'レンダラー強制 OFF',
  project_metadata_on: 'プロジェクト設定で有効',
  project_metadata_off: 'プロジェクト設定で無効',
  resolution_4k: '自動判定: 4K 以上',
  resolution_qhd: '自動判定: 1440p 以上',
  historical_delay: '自動判定: 遅延が閾値超過',
  auto: '自動判定: ベースライン'
};

function ensureProfile(map, profile) {
  if (!map.has(profile)) {
    map.set(profile, {
      delays: [],
      proxyEnabled: null,
      proxyScale: null,
      proxyReason: null,
      delayTarget: null,
      backendAverage: null
    });
  }
  return map.get(profile);
}

const profileStats = new Map();
const cpuUsage = [];
const memUsage = [];
let delaySamples = 0;

for (const rawLine of rawLines) {
  const [tag, profile, rawValue] = rawLine.split(',');
  if (!tag || !profile) {
    continue;
  }
  const stats = ensureProfile(profileStats, profile);
  const value = rawValue ?? '';

  switch (tag) {
    case 'PREVIEW_DELAY': {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        stats.delays.push(numeric);
        delaySamples += 1;
      }
      break;
    }
    case 'PROXY_ENABLED':
      stats.proxyEnabled = value === '1';
      break;
    case 'PROXY_SCALE': {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        stats.proxyScale = numeric;
      }
      break;
    }
    case 'PROXY_REASON':
      stats.proxyReason = value;
      break;
    case 'DELAY_TARGET': {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        stats.delayTarget = numeric;
      }
      break;
    }
    case 'DELAY_SNAPSHOT': {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        stats.backendAverage = numeric;
      }
      break;
    }
    case 'CPU_USAGE': {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        cpuUsage.push({ profile, value: numeric });
      }
      break;
    }
    case 'MEM_USAGE': {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        memUsage.push({ profile, value: numeric });
      }
      break;
    }
    default:
      break;
  }
}

if (delaySamples === 0) {
  console.error('PREVIEW_DELAY ログが見つかりませんでした。');
  process.exit(2);
}

function summarize(values) {
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    avg,
    max: Math.max(...values),
    min: Math.min(...values),
    samples: values.length
  };
}

console.log('=== Preview Delay Benchmark ===');
const previewSummary = new Map();

for (const [profile, stats] of profileStats.entries()) {
  if (stats.delays.length === 0) {
    continue;
  }
  const summary = summarize(stats.delays);
  const scale = Number.isFinite(stats.proxyScale) ? stats.proxyScale : 1.0;
  let proxyEnabled = stats.proxyEnabled;
  if (proxyEnabled === null && Number.isFinite(stats.proxyScale)) {
    proxyEnabled = stats.proxyScale < 0.999;
  }
  const reasonLabel = stats.proxyReason
    ? proxyReasonLabels[stats.proxyReason] ?? stats.proxyReason
    : null;
  const delayTarget = Number.isFinite(stats.delayTarget) ? stats.delayTarget : null;
  const backendAverage = Number.isFinite(stats.backendAverage) ? stats.backendAverage : null;

  const proxyStatusText =
    proxyEnabled === null ? 'n/a' : proxyEnabled ? `ON (${scale.toFixed(2)}x)` : `OFF (${scale.toFixed(2)}x)`;
  const reasonText = reasonLabel ?? 'n/a';
  const targetText = delayTarget != null ? `${delayTarget.toFixed(1)}ms` : 'n/a';

  console.log(
    `${profile}: avg=${summary.avg.toFixed(1)}ms, min=${summary.min.toFixed(1)}ms, max=${summary.max.toFixed(1)}ms, samples=${summary.samples}, proxy=${proxyStatusText}, reason=${reasonText}, target=${targetText}`
  );

  previewSummary.set(profile, {
    summary,
    proxyEnabled,
    proxyScale: scale,
    reasonLabel,
    reasonCode: stats.proxyReason,
    delayTarget,
    backendAverage
  });
}

let cpuSummary;
if (cpuUsage.length) {
  cpuSummary = summarize(cpuUsage.map((entry) => entry.value));
  console.log(
    `CPU Usage: avg=${cpuSummary.avg.toFixed(1)}%, min=${cpuSummary.min.toFixed(1)}%, max=${cpuSummary.max.toFixed(1)}%, samples=${cpuSummary.samples}`
  );
} else {
  console.log('CPU Usage: ログ無し (CPU_USAGE 行を追加してください)');
}

let memSummary;
if (memUsage.length) {
  memSummary = summarize(memUsage.map((entry) => entry.value));
  console.log(
    `Memory Usage: avg=${memSummary.avg.toFixed(0)}MB, min=${memSummary.min.toFixed(0)}MB, max=${memSummary.max.toFixed(0)}MB, samples=${memSummary.samples}`
  );
} else {
  console.log('Memory Usage: ログ無し (MEM_USAGE 行を追加してください)');
}

const docsPath = path.resolve('docs', 'benchmarks', 'latest.md');
const now = new Date().toISOString();
const linesOut = [
  '# Preview Benchmark 最新結果',
  '',
  `ログファイル: ${LOG_PATH}`,
  '',
  `実行日時: ${now}`,
  '',
  '## プロファイル別プレビュー遅延',
  '',
  '| プロファイル | 平均 [ms] | 最小 [ms] | 最大 [ms] | サンプル数 | プロキシ | 理由 | 遅延目標 [ms] | バックエンド平均 [ms] |',
  '| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |'
];

const orderedProfiles = Array.from(previewSummary.entries()).sort((a, b) => a[0].localeCompare(b[0], 'en'));

for (const [profile, entry] of orderedProfiles) {
  const { summary, proxyEnabled, proxyScale, reasonLabel, delayTarget, backendAverage } = entry;
  const proxyCell = proxyEnabled === null ? '不明' : `${proxyEnabled ? '有効' : '無効'} (${proxyScale.toFixed(2)}x)`;
  const reasonCell = reasonLabel ?? '-';
  const targetCell = delayTarget != null ? delayTarget.toFixed(1) : '-';
  const backendCell = backendAverage != null ? backendAverage.toFixed(1) : '-';
  linesOut.push(
    `| ${profile} | ${summary.avg.toFixed(1)} | ${summary.min.toFixed(1)} | ${summary.max.toFixed(1)} | ${summary.samples} | ${proxyCell} | ${reasonCell} | ${targetCell} | ${backendCell} |`
  );
}

linesOut.push('');
linesOut.push('## システムリソース推移');
linesOut.push('');
if (cpuSummary) {
  linesOut.push(
    `- CPU 使用率: 平均 ${cpuSummary.avg.toFixed(1)}%、最小 ${cpuSummary.min.toFixed(1)}%、最大 ${cpuSummary.max.toFixed(1)}%、サンプル数 ${cpuSummary.samples}`
  );
}
if (memSummary) {
  linesOut.push(
    `- メモリ使用量: 平均 ${memSummary.avg.toFixed(0)}MB、最小 ${memSummary.min.toFixed(0)}MB、最大 ${memSummary.max.toFixed(0)}MB、サンプル数 ${memSummary.samples}`
  );
}

fs.mkdirSync(path.dirname(docsPath), { recursive: true });
fs.writeFileSync(docsPath, `${linesOut.join('\n')}
`);
console.log(`\nMarkdown レポートを更新しました: ${docsPath}`);
