# よく使うコマンド
- `npm install` — Node 依存関係のインストール。
- `npm run dev` — FastAPI バックエンド (`scripts/run-backend.mjs`) と Electron アプリを並行起動。
- `npm run start` — ビルド後に Electron を単体起動。
- `npm run build` / `npm run build:renderer` / `npm run build:main` / `npm run build:lib` — それぞれ Vite レンダラー、Electron メイン、共有ライブラリアウトプットを生成。
- `npm test` / `npm run test:watch` — Vitest による単体テスト実行。
- `npm run verify:security` — Electron 起動時のセキュリティフラグ検証。
- `python3 -m venv .venv && source .venv/bin/activate` — FastAPI バックエンド用仮想環境作成。
- `uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload` — バックエンドのローカル起動。
- 補助: `rg` (ripgrep) で検索、`ls`/`tree` でディレクトリ確認、`open` で macOS ファイル／URL を開く。