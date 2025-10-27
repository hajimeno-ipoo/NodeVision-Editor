import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = process.env.ELECTRON_CONFIG ?? path.resolve('electron-builder.config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.warn(`Electron ビルド設定が見つかりません: ${CONFIG_PATH}`);
  console.warn('prod ビルド実行前に ELECTRON_CONFIG を設定するか、設定ファイルを生成してください。');
  process.exit(0);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
} catch (error) {
  console.error('設定ファイルの JSON パースに失敗しました。');
  process.exit(1);
}

const prefs = config?.extraMetadata?.mainWindow?.webPreferences ?? {};
const issues = [];

if (prefs.nodeIntegration === true) {
  issues.push('nodeIntegration が有効になっています (prod では false が推奨)');
}

if (prefs.contextIsolation === false || prefs.contextIsolation === undefined) {
  issues.push('contextIsolation が有効になっていません (prod では true が必須)');
}

if (prefs.enableRemoteModule === true) {
  issues.push('enableRemoteModule が有効です (prod では false が推奨)');
}

if (issues.length) {
  console.error('セキュリティチェック NG:');
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  process.exit(2);
}

console.log('セキュリティチェック OK: 設定値は基準を満たしています。');
