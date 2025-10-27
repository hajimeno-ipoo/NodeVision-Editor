#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function main() {
  const workspace = process.cwd();
  const stylesPath = join(workspace, 'src/renderer/styles.css');
  const stylesContent = await readFile(stylesPath, 'utf-8');

  const selectors = [
    '.app-toast',
    '.app-toast span',
    '.app-toast button',
    '.app-toast--success',
    '.app-toast--error',
    '.app-toast--info'
  ];

  const extractedStyles = selectors
    .map((selector) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\}`, 'g');
      const match = stylesContent.match(pattern);
      return match ? match.join('\n') : '';
    })
    .filter(Boolean)
    .join('\n\n');

  const baseStyles = `body { margin: 32px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1115; color: #f7f7ff; }
button { border: none; border-radius: 8px; padding: 10px 16px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(129, 140, 248, 0.8)); color: white; font-weight: 600; cursor: pointer; margin-right: 12px; }
button:hover { filter: brightness(1.05); }
.demo-toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
`;

  const html = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>Toast Preview</title>
    <style>
${baseStyles}
${extractedStyles}
    </style>
  </head>
  <body>
    <h1>保存トースト プレビュー</h1>
    <p>ボタンを押して、それぞれのトーンに応じたトースト通知を確認できます。</p>
    <div class="demo-toolbar">
      <button data-tone="success">成功トースト</button>
      <button data-tone="error">エラートースト</button>
      <button data-tone="info">情報トースト</button>
    </div>
    <script type="module">
      const palette = {
        success: { message: '保存が完了しました。', tone: 'success' },
        error: { message: '保存に失敗しました。', tone: 'error' },
        info: { message: '保存処理を開始しました…', tone: 'info' }
      };

      function showToast({ message, tone }) {
        const toast = document.createElement('div');
        toast.className = 'app-toast app-toast--' + tone;
        toast.innerHTML = '<span>' + message + '</span><button aria-label="閉じる">×</button>';
        toast.querySelector('button').addEventListener('click', () => toast.remove());
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
      }

      document.querySelectorAll('button[data-tone]').forEach((button) => {
        button.addEventListener('click', (event) => {
          const tone = event.currentTarget.getAttribute('data-tone');
          showToast(palette[tone]);
        });
      });
    </script>
  </body>
</html>`;

  const docsDir = join(workspace, 'docs', 'ui');
  await mkdir(docsDir, { recursive: true });
  const outputPath = join(docsDir, 'toast-preview.html');
  await writeFile(outputPath, html, 'utf-8');
  console.log(`[toast-preview] 生成完了: ${outputPath}`);
}

main().catch((error) => {
  console.error('[toast-preview] 生成に失敗しました:', error);
  process.exit(1);
});
