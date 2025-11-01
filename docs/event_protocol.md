# NodeVision Editor イベント / エラーコード仕様 v1.0

最終更新日: 2025-10-25

## 1. WebSocket イベント一覧

| イベント名 | 発火条件 | ペイロード例 | 備考 |
| --- | --- | --- | --- |
| `graph:queued` | ノードが実行キューへ登録されたとき | `{ "nodeId": "n5" }` | 依存関係解決後に送信 |
| `graph:progress` | 実行中の進捗更新 | `{ "nodeId": "n5", "progress": 42, "etaSec": 12 }` | `progress` は 0-100 の整数 |
| `graph:completed` | ノード処理が正常終了 | `{ "nodeId": "n5", "outputs": ["Cache/n5/result.png"] }` | `outputs` にファイルパスやメモリキーを返す |
| `graph:failed` | ノード処理が失敗 | `{ "nodeId": "n5", "code": "E-FFMPEG-01", "message": "Unsupported codec", "cause": "ffmpeg" }` | `code` はエラーコード表を参照 |
| `graph:cancelled` | ノード実行がキャンセルされた | `{ "nodeId": "n5", "requestedBy": "user" }` | `requestedBy` は `user` / `system` |
| `graph:log` | ノードがログを出力 | `{ "nodeId": "n5", "level": "warn", "message": "Fallback to proxy" }` | level は `info` / `warn` / `error` |
| `cache:invalidated` | キャッシュが無効化された | `{ "nodeId": "n3", "reason": "paramChanged" }` | `reason` は `paramChanged` など |
| `session:heartbeat` | バックエンド生存確認 | `{ "timestamp": "2025-10-25T09:00:00Z" }` | 30 秒間隔 |

## 2. REST API エンドポイント（抜粋）

| メソッド | パス | 用途 | リクエスト例 | レスポンス例 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/graph/execute` | グラフ実行要求 | `{ "graph": { ... } }` | `{ "executionId": "exec-123" }` |
| POST | `/api/v1/graph/cancel` | 実行中断 | `{ "executionId": "exec-123", "nodeId": "n5" }` | `{ "status": "accepted" }` |
| GET | `/api/v1/assets` | アセット一覧取得 | `-` | `{ "items": [ { "id": "a1", "path": "Assets/clip01.mp4" } ] }` |

### 2.1 ノードカタログ API 更新（2025-11-01）

- エンドポイント: `GET /nodes/catalog`
- 追加フィールド:
  - `description` — ノードの概要テキスト（UI でツールチップ表示に利用）
  - `defaultParams` — 推奨パラメータ辞書
  - `defaultInputs` — 初期接続先を示すハンドルマップ（未接続の場合は `null`）
  - `defaultOutputs` — ノードが生成する代表的な出力ハンドル
- 追加ノード: `Resize`, `Crop`, `Blend`（いずれも静止画処理用。`MediaInput` から受け取った画像を Pillow で加工し `PreviewDisplay` へ渡す）

## 3. エラーコード詳細

| コード | 種別 | 説明 | 対応策 |
| --- | --- | --- | --- |
| `E-INPUT-01` | 入力 | 入力ファイルが見つからない | パス再指定、ディスクマウント確認 |
| `E-INPUT-02` | 入力 | メディアフォーマット不正 | プロキシ作成や対応コーデックに変換 |
| `E-FFMPEG-01` | 処理 | FFmpeg が未対応コーデックを検出 | 事前チェックし代替パスを提示 |
| `E-FFMPEG-02` | 処理 | エンコード終了コードが異常 | ログ添付。再試行または設定変更 |
| `E-NODE-VALIDATION` | ノード | パラメータ検証失敗 | UI で該当フィールドを警告表示 |
| `E-ENGINE-CANCELLED` | システム | ユーザーまたはシステムが中断 | 状態を `cancelled` とし、再開オプションを表示 |
| `E-INTERNAL-01` | システム | 未捕捉例外 | エラーレポート送信、ログ採取 |

## 4. ログレベルと保持ポリシー

- ログレベルは `TRACE` / `DEBUG` / `INFO` / `WARN` / `ERROR` を採用。
- デフォルト保持期間は 14 日、最大ファイルサイズは 20MB でローテーション。
- 機密情報（ファイルパス以外の個人情報）は出力しないこと。

## 5. 将来更新予定

- `graph:batchCompleted`（複数ノード同時完了通知）を Phase 5 以降で検討。
- 自動更新導入時に `app:updateAvailable` / `app:updateProgress` を追加予定。
