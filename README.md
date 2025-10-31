# NodeVision Editor

Electron + React で構築された、ComfyUI 風のノードベース画像・動画編集デスクトップアプリ。直感的なノードグラフでワークフローを可視化しながら、バックエンドの FastAPI プロトタイプと連携してプレビュー生成やノードカタログ同期を行います。

> 開発オペレーションの詳細は、必ず [AGENTS.md](./AGENTS.md) を参照してください。

## 主な特徴
- React Flow を活用したノードエディタ UI。
- Electron メイン/プリロード/レンダラーでの IPC 分離とセキュリティ強化。
- FastAPI ベースの補助バックエンドでノードカタログとプロジェクト保存を提供。
- Vitest による単体テストと `scripts/` 配下のベンチ/セキュリティツール群。

## セットアップ
```bash
# 依存関係インストール
npm install

# （任意）バックエンド用 Python 仮想環境
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 開発フロー
- `npm run dev` — FastAPI プロトタイプと Electron を並行起動。
- `npm run start` — ビルド後に Electron を単体起動。
- `npm run build` — TypeScript + Vite の本番ビルドをまとめて実行。
- `npm test` — Vitest による単体テスト。カバレッジ 100% 維持を目標に更新してください。
- `npm run verify:security` — Electron 起動フラグの検証。リリース前に必須。

## ディレクトリ構成
- `src/main/` — Electron メインプロセス（TypeScript、`tsconfig.main.json`）。
- `preload/` — プリロードスクリプト。`contextIsolation` 有効。
- `src/renderer/` — React 18 + Vite レンダラー。
- `src/shared/` — メイン/レンダラー共有の型やユーティリティ。
- `backend/` — FastAPI プロトタイプと関連テスト。
- `tests/` — Vitest スイートとメディアフィクスチャ。
- `docs/` — イベントプロトコル、スキーマ、UI ドキュメントなど補足資料。
- `samples/` — `.nveproj` サンプルプロジェクト。

## ドキュメント
- [AGENTS.md](./AGENTS.md) — エージェント向けオペレーションガイド。
- [NodeVision_Editor_技術仕様書_v1.1.md](./NodeVision_Editor_技術仕様書_v1.1.md) — 仕様書・ロードマップ。
- `docs/event_protocol.md` — IPC イベントとエラーカタログ。
- `docs/project_schema_v1.json` — プロジェクトファイルスキーマ。

## コントリビュート方法
1. [AGENTS.md](./AGENTS.md) を読んで計画 → 実装 → テスト → レビューのループを徹底。
2. 変更に応じて `npm test` や関連ツールを実行し、結果を報告。
3. ドキュメントやサンプルに影響する変更は忘れず更新。

質問や提案があれば Issue やディスカッションに残してください。Happy hacking!
