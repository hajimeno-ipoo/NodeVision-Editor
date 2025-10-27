# 技術スタック
- フロントエンド: React 18 + TypeScript + Vite。React Flow でノードエディタ UI。レンダラーは Electron によるデスクトップ配信。
- デスクトップ: Electron 30、プリロードスクリプトで `contextIsolation` 有効、IPC 経由でファイル操作やバックエンド連携。
- 共通ロジック: TypeScript モノレポ構成 (`type: module / NodeNext`)。AJV で JSON スキーマ検証。
- バックエンド(試作): FastAPI 0.115、Pydantic v2、Pillow でプレビュー生成。Uvicorn リロード構成。
- ツール: Vitest で単体テスト、TSX/tsc によるビルド、concurrently で Electron とバックエンドの同時起動。