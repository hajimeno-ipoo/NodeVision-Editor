# MVP 達成条件ベース タスク一覧（初期ドラフト）

> 仕様書の該当箇所：`NodeVision_Editor_技術仕様書_v1.1.md` の 7 章（MVP 再定義・フェーズ完了条件）および 9.3（品質保証）。

作成日: 2025-10-25

## 登録方針
- タスク管理ツール（例: Trello / Jira / Notion）へコピーしやすいよう、`カテゴリ / 内容 / 担当 / 期限 / 備考` の列を維持する。
- 優先度は `High` `Medium` `Low` の 3 段階で記載。

## M1: 静止画パイプライン

| 優先度 | タスク内容 | 担当（案） | 期限目安 | 備考 |
| --- | --- | --- | --- | --- |
| High | Electron + React + FastAPI の最小テンプレート作成 | 開発チーム | +2 週 | リポジトリ初期化とCI整備を含む |
| High | ノードグラフ JSON 入出力の実装 | Backend | +3 週 | `project_schema_v1.json` に準拠 |
| High | 画像補正（露出/コントラスト/彩度）ノード実装 | Backend | +4 週 | 単体テストを併せて作成 |
| Medium | プレビューキャンバス実装（1/2 解像度プロキシ） | Frontend | +5 週 | 遅延計測ロガーを作成 |
| Medium | Undo/Redo + オートセーブ実装 | Frontend | +6 週 | データ損失テストを用意 |
| Medium | クラッシュ復旧フロー（自動保存ファイル読み込み） | QA | +6 週 | 手動検証手順書を作成 |
| Low | ベンチログ出力 (`PREVIEW_DELAY`/`CPU_USAGE`/`MEM_USAGE`) を Node/Electron に組み込む | Backend | +6 週 | `scripts/benchmarks/preview_delay.js` が参照する形式 |

## M2: 動画プレビュー

| 優先度 | タスク内容 | 担当（案） | 期限目安 | 備考 |
| --- | --- | --- | --- | --- |
| High | FFmpeg デコード + WebCodecs 連携でのプレビュー実装 | Backend | +10 週 | 1080p/30fps を基準に遅延測定 |
| High | プロキシ生成パイプライン（1/2 解像度） | Backend | +9 週 | 生成進捗を `graph:progress` で通知 |
| Medium | プレビュー UI に FPS / 遅延表示を追加 | Frontend | +10 週 | NFR 監視のためログと連動 |
| Medium | プロジェクト設定にプレビュー品質オプション追加 | Frontend | +11 週 | `未確定項目リスト` 参照 |

## M3: 単純レンダリング

| 優先度 | タスク内容 | 担当（案） | 期限目安 | 備考 |
| --- | --- | --- | --- | --- |
| High | H.264 1080p エクスポートプリセット実装 | Backend | +14 週 | `medium` と `high` プロファイルを用意 |
| High | レンダリングジョブ管理（キャンセル・再試行） | Backend | +15 週 | `graph:cancelled` イベント発火 |
| Medium | 書き出し設定 UI と進捗ダイアログ | Frontend | +15 週 | 進捗は WebSocket イベントを反映 |
| Medium | 自動テストで出力ファイルの PSNR/SSIM を計測 | QA | +16 週 | 閾値は未確定項目リスト参照 |
| Medium | `quality_metrics.py` を CI へ統合 | QA | +16 週 | 失敗時はタスク作成 |

## 共通タスク

| 優先度 | タスク内容 | 担当（案） | 期限目安 | 備考 |
| --- | --- | --- | --- | --- |
| High | セキュリティ設定の dev/prod 差分をまとめ、ドキュメント化 | Infra | +4 週 | 付録追加を予定 |
| Medium | `verify-security-flags.mjs` をビルド前チェックとして設定 | Infra | +4 週 | CI で `node` で実行 |
| Medium | ログ収集と分析フローの設計 | Infra | +8 週 | `event_protocol.md` を参照 |
| Medium | QA 用サンプルプロジェクト 3 種の作成 | QA | +6 週 | 仕様書付録に追加予定 |
| Low | ユーザードキュメント雛形の作成 | Docs | +12 週 | M3 完了後に拡張 |
