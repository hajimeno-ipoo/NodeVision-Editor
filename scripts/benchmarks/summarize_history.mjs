#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function toNumber(value, defaultValue = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function formatNumber(value) {
  return Number.parseFloat(value.toFixed ? value.toFixed(1) : value).toFixed(1);
}

async function summarize() {
  const workspace = process.cwd();
  const historyDir = join(workspace, 'docs', 'benchmarks', 'history');
  let files;
  try {
    files = await readdir(historyDir);
  } catch (error) {
    console.error('[bench-history] 履歴ディレクトリを読み取れませんでした:', error);
    process.exit(1);
  }

  const markdownFiles = files
    .filter((name) => name.endsWith('.md') && name !== 'summary.md')
    .sort();

  if (markdownFiles.length === 0) {
    console.warn('[bench-history] 履歴ファイルが存在しません。');
    return;
  }

  const rows = [];

  for (const fileName of markdownFiles) {
    const fullPath = join(historyDir, fileName);
    const content = await readFile(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const timestampLine = lines.find((line) => line.startsWith('実行日時:'));
    const timestamp = timestampLine ? timestampLine.replace('実行日時:', '').trim() : fileName.replace('.md', '');
    const tableStart = lines.findIndex((line) => line.startsWith('| プロファイル'));
    if (tableStart === -1) {
      continue;
    }
    for (let i = tableStart + 2; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.startsWith('|')) {
        break;
      }
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      if (cells.length < 5) {
        continue;
      }
      const [profile, avg, min, max, samples, proxy, reason, target] = [
        cells[0],
        cells[1],
        cells[2],
        cells[3],
        cells[4],
        cells[5] ?? '',
        cells[6] ?? '',
        cells[7] ?? ''
      ];
      rows.push({
        timestamp,
        profile,
        avg,
        min,
        max,
        samples,
        proxy,
        reason,
        target
      });
    }
  }

  if (rows.length === 0) {
    console.warn('[bench-history] 有効なデータが見つかりませんでした。');
    return;
  }

  const sortedRows = rows.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
  const summaryLines = [
    '# プレビュー計測履歴サマリー',
    '',
    '| 実行日時 | プロファイル | 平均 [ms] | 最大 [ms] | プロキシ | 理由 | 遅延目標 [ms] |',
    '| --- | --- | ---: | ---: | --- | --- | ---: |'
  ];
  summaryLines.push(
    ...sortedRows.map(
      (row) =>
        `| ${row.timestamp} | ${row.profile} | ${row.avg} | ${row.max} | ${row.proxy} | ${row.reason} | ${row.target} |`
    )
  );

  const rowsByProfile = new Map();
  for (const row of rows) {
    const entries = rowsByProfile.get(row.profile) ?? [];
    entries.push(row);
    rowsByProfile.set(row.profile, entries);
  }

  const profileStats = Array.from(rowsByProfile.entries()).map(([profile, entries]) => {
    const averages = entries.map((entry) => toNumber(entry.avg));
    const mean = averages.reduce((sum, value) => sum + value, 0) / averages.length;
    const minAvg = Math.min(...averages);
    const maxAvg = Math.max(...averages);
    const variance = averages.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / averages.length;
    const stddev = Math.sqrt(variance);
    const latest = entries.slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
    return {
      profile,
      count: entries.length,
      mean: formatNumber(mean),
      min: formatNumber(minAvg),
      max: formatNumber(maxAvg),
      stddev: formatNumber(stddev),
      latest: latest.timestamp
    };
  });

  const profileSummaryLines = [
    '',
    '## プロファイル別集計',
    '',
    '| プロファイル | 計測回数 | 平均平均 [ms] | 最小平均 [ms] | 最大平均 [ms] | 標準偏差 [ms] | 最新計測 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |'
  ];
  profileSummaryLines.push(
    ...profileStats
      .sort((a, b) => (a.profile > b.profile ? 1 : -1))
      .map(
        (stat) =>
          `| ${stat.profile} | ${stat.count} | ${stat.mean} | ${stat.min} | ${stat.max} | ${stat.stddev} | ${stat.latest} |`
      )
  );

  const summaryPath = join(historyDir, 'summary.md');
  await writeFile(summaryPath, `${[...summaryLines, ...profileSummaryLines].join('\n')}\n`, 'utf-8');
  console.log(`[bench-history] サマリーを更新しました: ${summaryPath}`);

  const chartData = profileStats.map((stat) => ({
    profile: stat.profile,
    points: rowsByProfile
      .get(stat.profile)
      .map((entry) => ({ timestamp: entry.timestamp, avg: toNumber(entry.avg) }))
      .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1))
  }));

  const detailTableRows = sortedRows
    .map(
      (row) =>
        `<tr><td>${row.timestamp}</td><td>${row.profile}</td><td style="text-align:right;">${row.avg}</td><td style="text-align:right;">${row.max}</td><td>${row.proxy}</td><td>${row.reason}</td><td style="text-align:right;">${row.target}</td></tr>`
    )
    .join('\n');

  const summaryTableRows = profileStats
    .map(
      (stat) =>
        `<tr><td>${stat.profile}</td><td style="text-align:right;">${stat.count}</td><td style="text-align:right;">${stat.mean}</td><td style="text-align:right;">${stat.min}</td><td style="text-align:right;">${stat.max}</td><td style="text-align:right;">${stat.stddev}</td><td>${stat.latest}</td></tr>`
    )
    .join('\n');

  const htmlPath = join(historyDir, 'summary.html');
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>プレビュー計測履歴</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1115;color:#f7f7ff;margin:32px;} h1{margin-top:0;} canvas{max-width:960px;margin-bottom:32px;} table{border-collapse:collapse;margin-top:24px;} th,td{padding:6px 12px;border:1px solid rgba(255,255,255,0.12);} th{background:rgba(129,140,248,0.25);} tr:nth-child(even){background:rgba(255,255,255,0.04);} a{color:#9aa8ff;}</style>
</head>
<body>
<h1>プレビュー計測履歴</h1>
<canvas id="benchChart"></canvas>
<script>const chartData=${JSON.stringify(chartData)};const labels=Array.from(new Set(chartData.flatMap(item=>item.points.map(pt=>pt.timestamp)))).sort();const palette=['#a3bffa','#f6ad55','#f687b3','#68d391','#63b3ed','#fbb6ce','#90cdf4'];const datasets=chartData.map((item,idx)=>({label:item.profile,data:labels.map(ts=>{const match=item.points.find(pt=>pt.timestamp===ts);return match?match.avg:null;}),borderColor:palette[idx%palette.length],backgroundColor:palette[idx%palette.length],tension:0.2,spanGaps:true}));const ctx=document.getElementById('benchChart').getContext('2d');new Chart(ctx,{type:'line',data:{labels,datasets},options:{responsive:true,plugins:{title:{display:true,text:'平均遅延の推移 (ms)'},legend:{position:'bottom'}},scales:{y:{beginAtZero:false,suggestedMin:0}}}});</script>
<p>Markdown サマリー: <a href="summary.md">summary.md</a></p>
<h2>計測履歴</h2>
<table><thead><tr><th>実行日時</th><th>プロファイル</th><th>平均 [ms]</th><th>最大 [ms]</th><th>プロキシ</th><th>理由</th><th>遅延目標 [ms]</th></tr></thead><tbody>${detailTableRows}</tbody></table>
<h2>プロファイル別集計</h2>
<table><thead><tr><th>プロファイル</th><th>計測回数</th><th>平均平均 [ms]</th><th>最小平均 [ms]</th><th>最大平均 [ms]</th><th>標準偏差 [ms]</th><th>最新計測</th></tr></thead><tbody>${summaryTableRows}</tbody></table>
</body>
</html>`;

  await writeFile(htmlPath, html, 'utf-8');
  console.log(`[bench-history] HTML サマリーを更新しました: ${htmlPath}`);
}

summarize().catch((error) => {
  console.error('[bench-history] 予期しないエラーが発生しました:', error);
  process.exit(1);
});
