# タスク完了時の確認
- 変更箇所に応じて `npm test` で Vitest を実行し、Electron や共有ロジックを触った場合は関連テストケースの追加を検討。
- Electron/レンダラーを改修した際は `npm run build` か `npm run build:renderer` でビルドエラーが無いか確認。
- バックエンド変更時は仮想環境で `uvicorn backend.app.main:app --reload` を起動し、主要エンドポイント（`/health`, `/info` 等）をチェック。
- セキュリティ設定に影響する変更後は `npm run verify:security` を再実行。
- 仕様書や API と乖離がある場合は `NodeVision_Editor_技術仕様書_v1.1.md` や `docs/` 内ノートを更新し、変更理由を記録。