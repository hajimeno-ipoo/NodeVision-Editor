# NodeVision Editor
- Electron + React 製のノードベース画像・動画編集デスクトップアプリ。ComfyUI の UX を意識したプロトタイプ。
- `/src` に Electron メインプロセス（`main/`）、プレビュー用プレロード（`preload/`）、レンダラー React アプリ（`renderer/`）、共有型定義（`shared/`）がまとまる。
- `/backend` は FastAPI ベースの補助サーバー試作。Electron からの疎通検証やノードカタログ提供、プレビュー生成を想定。
- `docs/` と `NodeVision_Editor_技術仕様書_v1.1.md` に仕様とイベント/エラー定義、プロジェクトスキーマ、ロードマップが記載。
- `tests/` には Vitest テスト、`scripts/` に Electron 起動やベンチマーク、UI ツール生成、セキュリティ検証などの補助スクリプトがある。
- `samples/` には `.nveproj` サンプルが入り、アプリ初期読み込み用。