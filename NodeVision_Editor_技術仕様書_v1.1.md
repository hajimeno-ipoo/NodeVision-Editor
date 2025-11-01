# NodeVision Editor — ComfyUI風ノードベース画像・動画編集デスクトップアプリ 技術仕様書 v1.1

*作成日：2024年10月*

---

## 改訂履歴

- **2025-10-25（v1.1）**：章番号付与、目次自動生成、主要表をHTML化（列幅指定）、用語表記の統一（例：「AIドリブンコーディング」→「AIドリブンコーディング」ほか）。

---

> **エージェント向け補足資料**：[AGENTS.md](./AGENTS.md) — エージェント運用フローと開発ガイドラインを参照してください。

## 目次
1. [1. プロジェクト概要](#1-プロジェクト概要)
   - [1.1 プロジェクト名](#11-プロジェクト名)
   - [1.2 目的と背景](#12-目的と背景)
   - [1.3 対象ユーザー](#13-対象ユーザー)
   - [1.4 開発方針（AIドリブンコーディング）](#14-開発方針aiドリブンコーディング)
1. [2. 機能要件](#2-機能要件)
   - [2.1 必須機能一覧](#21-必須機能一覧)
   - [2.2 機能詳細仕様（優先度・実装目安）](#22-機能詳細仕様優先度・実装目安)
   - [2.3 非機能要件](#23-非機能要件)
1. [3. 技術スタック](#3-技術スタック)
   - [3.1 デスクトップフレームワーク比較](#31-デスクトップフレームワーク比較)
   - [3.2 フロントエンド](#32-フロントエンド)
   - [3.3 バックエンド](#33-バックエンド)
1. [4. システムアーキテクチャ](#4-システムアーキテクチャ)
   - [4.1 構成図（概略）](#41-構成図概略)
   - [4.2 データフロー](#42-データフロー)
   - [4.3 ノードシステム設計（抜粋）](#43-ノードシステム設計抜粋)
   - [4.4 データ永続化とプロジェクトファイル仕様](#44-データ永続化とプロジェクトファイル仕様)
   - [4.5 ノード実行エンジン契約](#45-ノード実行エンジン契約)
1. [5. 技術選定の根拠](#5-技術選定の根拠)
1. [6. ComfyUIアーキテクチャ分析](#6-comfyuiアーキテクチャ分析)
   - [6.1 ノード定義方式（参考）](#61-ノード定義方式参考)
   - [6.2 フロントエンド／バックエンド分離](#62-フロントエンド／バックエンド分離)
   - [6.3 API 設計](#63-api-設計)
1. [7. 開発ロードマップ（目安）](#7-開発ロードマップ目安)
   - [7.1 MVP 再定義](#71-mvp-再定義)
   - [7.2 フェーズ完了条件](#72-フェーズ完了条件)
1. [8. AIドリブンコーディング戦略](#8-aiドリブンコーディング戦略)
   - [8.1 推奨 AI ツール](#81-推奨-ai-ツール)
   - [8.2 開発フロー](#82-開発フロー)
   - [8.3 学習リソース](#83-学習リソース)
   - [8.4 ベストプラクティス](#84-ベストプラクティス)
1. [9. リスク管理](#9-リスク管理)
   - [9.1 技術的リスク](#91-技術的リスク)
   - [9.2 開発リスク](#92-開発リスク)
   - [9.3 品質保証・テスト戦略](#93-品質保証・テスト戦略)
1. [10. 参考情報](#10-参考情報)
   - [10.1 参考プロジェクト](#101-参考プロジェクト)
   - [10.2 技術ドキュメント](#102-技術ドキュメント)
   - [10.3 コミュニティリソース](#103-コミュニティリソース)
   - [10.4 最終的な成功の鍵](#104-最終的な成功の鍵)
1. [11. IPC セキュリティと権限設計](#11-ipc-セキュリティと権限設計)
1. [12. 配布・更新・ライセンス方針](#12-配布・更新・ライセンス方針)
1. [13. 確定方針（2025-10-25 更新）](#13-確定方針2025-10-25-更新)
1. [付録A：用語スタイルガイド（抜粋）](#付録a用語スタイルガイド抜粋)
   - [付録B：プロジェクト JSON スキーマ（抜粋）](#付録bプロジェクト-json-スキーマ抜粋)
   - [付録C：イベント／エラーコード一覧](#付録cイベント／エラーコード一覧)
   - [付録D：リリース前チェックリスト](#付録dリリース前チェックリスト)
---

## 1. プロジェクト概要

### 1.1 プロジェクト名
**NodeVision Editor — ComfyUI風ノードベース画像・動画編集デスクトップアプリケーション**

### 1.2 目的と背景
ComfyUI の直感的なノードベース UI を参考に、**一般ユーザーでも使いやすい**画像・動画編集アプリを開発する。従来のタイムライン型とは異なり、**ノードの接続で編集ワークフローを可視化**し、学習コストを抑えつつ高度な処理を実現する。

### 1.3 対象ユーザー
- 動画編集に興味のある一般ユーザー
- ノードベースのワークフローを好むクリエイター
- **プログラミング不要**で高度な編集を望むユーザー
- YouTuber、動画コンテンツ制作者

### 1.4 開発方針（AIドリブンコーディング）
**AI 支援開発アプローチ**により、初心者でも段階的に実装を進められる体制を整える。最新の AI コーディング支援ツールを活用し、**継続的な学習と反復改善**で品質を高める。

---

## 2. 機能要件

### 2.1 必須機能一覧
- ノードベースの視覚的編集インターフェース
- 画像・動画ファイルの入力・出力
- リアルタイムプレビュー
- 基本的な動画編集（カット、トリミング、結合）
- 基本的な画像編集（リサイズ、回転、クロップ）
- カラーグレーディング（LUT対応）
- オーディオ処理（音量調整、フェード）
- プロジェクトの保存・読み込み
- Undo/Redo 機能

### 2.2 機能詳細仕様（優先度・実装目安）

<table>
  <colgroup>
    <col style="width:18%">
    <col style="width:52%">
    <col style="width:15%">
    <col style="width:15%">
  </colgroup>
  <thead>
    <tr><th>機能カテゴリ</th><th>具体的機能</th><th>優先度</th><th>実装目安</th></tr>
  </thead>
  <tbody>
    <tr><td>ノードシステム</td><td>ノードの配置（ドラッグ&ドロップ）、接続線の管理</td><td>高</td><td>Phase 2</td></tr>
    <tr><td>画像処理</td><td>明度・コントラスト・彩度、フィルター適用</td><td>高</td><td>Phase 3</td></tr>
    <tr><td>動画処理</td><td>カット編集、トランジション、エンコード出力</td><td>高</td><td>Phase 4</td></tr>
    <tr><td>カラーグレーディング</td><td>RGB/HSL 調整、トーンカーブ、LUT 適用</td><td>中</td><td>Phase 5</td></tr>
    <tr><td>オーディオ</td><td>音量調整、フェードイン/アウト、波形表示</td><td>中</td><td>Phase 6</td></tr>
    <tr><td>プロジェクト管理</td><td>保存・読み込み、プリセット管理</td><td>低</td><td>Phase 6</td></tr>
  </tbody>
</table>

### 2.3 非機能要件

| 項目 | 目標値 / 方針 | 補足 |
| --- | --- | --- |
| プレビュー遅延 | 150ms/フレーム以下（1080p/30fps 時） | GPU を活用した低遅延モードを最優先で設計（※数値は暫定、要レビュー） |
| 対応解像度 | 最大 3840×2160（4K）/30fps プレビュー | それ以上はプロキシ生成を推奨し、UI で注意喚起 |
| 出力レンダリング速度 | 実時間の 0.5～1.0 倍以内（H.264/1080p） | プリセットごとに速度目標を定義し、ベンチマークで監視 |
| メモリ使用量 | 8GB RAM 環境で安定動作（ピーク 6GB 以内） | 大容量処理はストリーミング優先。数値は運用後に再評価 |
| 同時ノード実行数 | 物理コア数に依存（デフォルト上限 4 ワーカー） | プロジェクト設定で変更。試験的に 2～6 を想定 |
| 障害許容性 | 異常終了時に 5 分以内の自動リカバリ | 自動保存間隔 2 分を標準とし、UI で復旧オプション提供 |

---

## 3. 技術スタック

### 3.1 デスクトップフレームワーク比較

<table>
  <colgroup>
    <col style="width:22%">
    <col style="width:39%">
    <col style="width:39%">
  </colgroup>
  <thead>
    <tr><th>項目</th><th>Electron（推奨）</th><th>Tauri</th></tr>
  </thead>
  <tbody>
    <tr><td>メモリ使用量</td><td>200–300MB</td><td>30–40MB</td></tr>
    <tr><td>学習コスト</td><td>低（豊富なリソース）</td><td>中（Rust 知識必要）</td></tr>
    <tr><td>AI 支援度</td><td>高（多数の事例）</td><td>中（比較的新しい）</td></tr>
    <tr><td>エコシステム</td><td>成熟</td><td>発展途上</td></tr>
    <tr><td>起動速度</td><td>普通</td><td>高速</td></tr>
    <tr><td>セキュリティ</td><td>注意が必要</td><td>高</td></tr>
  </tbody>
</table>

**選定理由（Electron）**  
初心者の AI 支援開発において、**学習リソースの豊富さ**と**実装事例の多さ**を重視。メモリ使用量のデメリットよりも、**開発効率と成功確率**を優先する。

### 3.2 フロントエンド
- React 18（UI）
- TypeScript（型安全性）
- ReactFlow（ノードエディタ）
- Fabric.js / Konva.js（Canvas 操作）
- Three.js（WebGL）

### 3.3 バックエンド
- Python 3.11+
- FastAPI（REST / WebSocket）
- FFmpeg + `ffmpeg-python`（動画処理）
- Pillow / OpenCV（画像処理）
- NumPy（数値計算）

---

## 4. システムアーキテクチャ

### 4.1 構成図（概略）
```
┌─────────────────────────────────────────────┐
│         Electron Main Process               │
│  ・ウィンドウ管理                            │
│  ・ファイルシステムアクセス                   │
│  ・Python子プロセス管理                      │
└──────────────┬──────────────────────────────┘
               │ IPC Communication
┌──────────────┴──────────────────────────────┐
│      Electron Renderer Process              │
│  ┌─────────────────────────────────────┐   │
│  │   React Frontend (TypeScript)       │   │
│  │  ・ReactFlow（ノードエディタ）        │   │
│  │  ・Redux Toolkit（状態管理）         │   │
│  │  ・Canvas/WebGL（プレビュー）        │   │
│  │  ・WebCodecs API（動画デコード）     │   │
│  └──────────────┬──────────────────────┘   │
│                 │ WebSocket/HTTP            │
└─────────────────┴──────────────────────────┘
                  │
┌─────────────────┴──────────────────────────┐
│      Python Backend (FastAPI)              │
│  ・ノード処理エンジン                        │
│  ・FFmpeg統合（動画処理）                    │
│  ・PIL/OpenCV（画像処理）                   │
│  ・カラーグレーディング処理                  │
│  ・LUT適用ロジック                          │
└─────────────────────────────────────────────┘
```

![システム構成図（生成手順：`plantuml docs/figures/system_overview.puml`）](docs/figures/system_overview.png)

> 注記：上記 PNG は `docs/figures/system_overview.puml` から生成する。図版を更新した際は同名の PNG を再出力し、仕様書と同期させること。

### 4.2 データフロー
1. **ノードグラフ構築**：ReactFlow UI でユーザーがノードを配置・接続  
2. **グラフ送信**：フロントエンドが JSON 形式で Python バックエンドへ送信  
3. **依存関係解決**：Python がノードの実行順序を決定  
4. **処理実行**：各ノードを順次実行し、中間結果を生成  
5. **プレビュー生成**：リアルタイムでフロントエンドへストリーミング  
6. **表示更新**：WebCodecs / Canvas でレンダリング

### 4.3 ノードシステム設計（抜粋）

**Python 側ノード基底クラス**
```python
class BaseNode:
    def __init__(self, node_id: str):
        self.node_id = node_id
        self.inputs = {}
        self.outputs = {}

    def execute(self, inputs: dict) -> dict:
        # 各ノードの処理ロジック
        pass

    def validate_inputs(self, inputs: dict) -> bool:
        # 入力値検証
        pass
```

**TypeScript 側ノード定義**
```ts
interface NodeData {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
  };
}
```

### 4.4 データ永続化とプロジェクトファイル仕様

- **プロジェクトファイル形式**：`*.nveproj`（JSON テキスト + 付帯メタデータ）
- **構造**：ノードグラフ、アセット参照、設定値、実行履歴を JSON で保持
- **アセット参照方式**：プロジェクトルートからの相対パス + SHA-256 ハッシュで重複排除
- **バージョニング**：`schemaVersion` を必須化（例：`"1.0.0"`）。破壊的変更時はマイグレーションスクリプトを同梱
- **プロキシ管理**：`/Proxies/<assetId>/` に 1/2 解像度のキャッシュを保存。再生成フラグをメタデータに保持
- **自動保存**：90 秒ごとに `.autosave` を生成し、クラッシュ復帰時に復旧オプションを提示

### 4.5 ノード実行エンジン契約

- **決定性**：同一入力で同一出力を保証。乱数利用時はシードをメタデータで管理
- **キャッシュ**：ノード型・パラメータ・依存出力ハッシュからキー生成し、`/Cache/<nodeId>/` に保存
- **並列度**：デフォルト `min(物理コア数, 4)`。プロジェクト設定でユーザーが変更可能
- **キャンセル**：グラフ全体／ノード単位で中断。子プロセスへ `SIGTERM → 5 秒 → SIGKILL` の順で送信
- **進捗イベント**：`queued → running(%) → completed | failed(code, message, cause)` を WebSocket で通知
- **ログ**：ノード単位で INFO / WARN / ERROR を記録し、UI から参照できるよう保存

---

## 5. 技術選定の根拠


<table>
  <colgroup>
    <col style="width:20%">
    <col style="width:28%">
    <col style="width:32%">
    <col style="width:20%">
  </colgroup>
  <thead>
    <tr><th>技術カテゴリ</th><th>選択技術</th><th>選定理由</th><th>代替案</th></tr>
  </thead>
  <tbody>
    <tr><td>ノードエディタ</td><td>ReactFlow</td><td>React 専用・機能豊富・型対応</td><td>Rete.js, D3.js</td></tr>
    <tr><td>動画処理</td><td>FFmpeg</td><td>業界標準・高性能・幅広い対応</td><td>GStreamer, OpenCV</td></tr>
    <tr><td>リアルタイムプレビュー</td><td>WebCodecs API</td><td>ブラウザネイティブ・高速デコード</td><td>Video.js, MediaSource API</td></tr>
    <tr><td>状態管理</td><td>Redux Toolkit</td><td>Undo/Redo・デバッグ容易</td><td>Zustand, Jotai</td></tr>
    <tr><td>カラーグレーディング</td><td>WebGL Shader</td><td>GPU 加速・リアルタイム処理</td><td>Canvas 2D, CSS Filters</td></tr>
  </tbody>
</table>

---

## 6. ComfyUIアーキテクチャ分析

### 6.1 ノード定義方式（参考）

ComfyUI は Python クラスベースでノードを定義し、`define_schema` メソッドで入出力を宣言する。この設計方針を参考に、**型安全性を重視**したノード設計を採用する。

**ComfyUI 風ノード定義例**
```python
class ImageResizeNode(BaseNode):
    @classmethod
    def define_schema(cls):
        return Schema(
            node_id="image_resize",
            display_name="画像リサイズ",
            inputs=[
                ImageInput("image", "入力画像"),
                IntInput("width", "幅", default=1920),
                IntInput("height", "高さ", default=1080)
            ],
            outputs=[
                ImageOutput("result", "出力画像")
            ]
        )

    def execute(self, inputs):
        image = inputs["image"]
        width = inputs["width"]
        height = inputs["height"]
        resized = image.resize((width, height))
        return {"result": resized}
```

### 6.2 フロントエンド／バックエンド分離
- TypeScript/Vue（参考）フロントエンドと Python バックエンドを分離し、**WebSocket API** で通信
- UI の応答性と処理の高速化を両立

### 6.3 API 設計
- **WebSocket**：リアルタイム処理状況の通知
- **REST API**：ノードグラフ送信、ファイル管理
- **ストリーミング**：プレビュー画像／動画の配信

---

## 7. 開発ロードマップ（目安）

- **Phase 1：基本インフラ（1–2ヶ月）**  
  Electron 起動、React+TS 環境、FastAPI サーバ、IPC 通信、CI/CD

- **Phase 2：ノードシステム（2–3ヶ月）**  
  ReactFlow エディタ、基本ノード（入力・出力・変換）、接続、実行基盤

- **Phase 3：画像処理（2ヶ月）**  
  Canvas 統合、プレビュー、基本フィルタ、レイヤー合成、画像変換ノード

- **Phase 4：動画処理（3–4ヶ月）**  
  FFmpeg 統合、デコード/エンコード、タイムライン、動画編集ノード

- **Phase 5：カラーグレーディング（2–3ヶ月）**  
  WebGL Shader、LUT ローダ（.cube）、カラー調整 UI、トーンマッピング

- **Phase 6：オーディオ・統合（2ヶ月）**  
  Web Audio API、波形表示、プロジェクト保存、パフォーマンス最適化

- **Phase 7：リリース準備（1ヶ月）**  
  Windows 対応、インストーラ作成、ドキュメント整備、ベータテスト

**総開発期間の目安：12–18ヶ月**（AI 支援により短縮可能）

### 7.1 MVP 再定義

| ステージ | 目的 | 達成条件 |
| --- | --- | --- |
| M1: 静止画パイプライン | 静止画編集の成立 | 画像入力→補正→リサイズ→PNG/JPEG 保存。プレビュー、Undo/Redo、プロジェクト保存/復元、クラッシュ復帰 |
| M2: 動画プレビュー | 単一動画のリアルタイム確認 | 色補正＋リサイズ、1/2 解像度プロキシ生成、フレーム精度プレビュー（音声なし） |
| M3: 単純レンダリング | 基本的な書き出し | 単一クリップから H.264/1080p を実時間 0.5～1.0 倍で出力。プリセット選択 UI |

> 詳細タスクは `tasks/mvp_phase_tasks.md` を参照し、各ステージの ToDo をタスク管理ツールへ転記すること。

### 7.2 フェーズ完了条件

| フェーズ | 完了チェックリスト |
| --- | --- |
| Phase 1 | Electron 起動テンプレート、React+TS/Redux 基盤、FastAPI サーバ、CI（lint/format）、自動更新 OFF の検証 |
| Phase 2 | ノード作成・接続・削除・Undo/Redo、一括実行、最小 3 種類の基本ノード、JSON 保存/読み込み |
| Phase 3 | 主要静止画フィルタ 5 種、プレビュー HUD、GPU シェーダ適用、キャッシュ無効化テスト |
| Phase 4 | 単一動画の読み込み/書き出し、プロキシ生成、エンコードプリセット、エラー復旧テスト |
| Phase 5 | LUT 読み込み（.cube 33）、リアルタイム調整 UI、色空間設定 |
| Phase 6 | 音量調整・フェード、波形表示、プロジェクト統合、ストレステスト（10 ノード以上） |
| Phase 7 | Windows ビルド & 署名手順、インストーラ検証、βテスト票、リリースノート |

> 各フェーズのチェックリストは `tasks/mvp_phase_tasks.md` の「共通タスク」「M1〜M3 セクション」と同期させ、進捗を二重管理しないようにする。

### 7.3 進行状況（2025-11-01 更新）

- **Phase 2**: ノードカタログ API を拡張し、`description` / `defaultParams` / `defaultInputs` / `defaultOutputs` を提供。Resize / Crop / Blend の静止画処理ノードを追加し、Pillow ベースのプレビュー生成を確認済み。
- **Phase 3（着手中）**: 画像処理ノードを介したプレビュー HUD の改善（ノード数・パイプライン概要表示）、並びにフロントのノード追加フロー改善を完了。保存→再読込の回帰テストを追加。
- **開発環境**: direnv を導入し `.envrc` を整備。プロジェクトに入るだけで `.venv` が自動アクティベートされる運用に移行。

---

## 8. AIドリブンコーディング戦略

### 8.1 推奨 AI ツール

<table>
  <colgroup>
    <col style="width:22%">
    <col style="width:22%">
    <col style="width:28%">
    <col style="width:28%">
  </colgroup>
  <thead>
    <tr><th>ツール</th><th>用途</th><th>特徴</th><th>活用場面</th></tr>
  </thead>
  <tbody>
    <tr><td>GitHub Copilot</td><td>コード補完</td><td>リアルタイム支援</td><td>日常的なコーディング</td></tr>
    <tr><td>Cursor</td><td>プロジェクト理解</td><td>コード全体把握</td><td>リファクタ・大規模変更</td></tr>
    <tr><td>ChatGPT / Claude</td><td>設計相談</td><td>アーキテクチャ提案</td><td>技術選定・デバッグ</td></tr>
    <tr><td>v0.dev</td><td>UI 生成</td><td>React コンポーネント</td><td>インターフェース設計</td></tr>
  </tbody>
</table>

### 8.2 開発フロー
1. **仕様記述**：自然言語で詳細要件を記述  
2. **AI 相談**：アーキテクチャや技術選定を AI と検討  
3. **コード生成**：ボイラープレートや基本実装を生成  
4. **統合テスト**：実行して検証  
5. **改善反復**：問題点を共有しつつ修正  
6. **段階的拡張**：MVP から段階的に機能追加

### 8.3 学習リソース
- 公式ドキュメント：Electron / React / FastAPI
- YouTube：**「Electron React TypeScript」** チュートリアル
- GitHub：類似プロジェクトの参考実装
- AI チャット：技術的疑問の即時解決

### 8.4 ベストプラクティス
- 小さな機能単位で AI に依頼
- 生成コードは**必ず**動作確認
- エラーメッセージを共有して解決策を検討
- 意図を理解してから本番適用
- 定期的に**全体レビュー**を受ける

---

## 9. リスク管理

### 9.1 技術的リスク
- **高リスク：パフォーマンス問題**  
  大容量動画でのメモリ不足・フリーズ  
  **対策**：ストリーミング処理、WebWorker 並列、GPU 加速（WebGL/WebGPU）、メモリ監視

- **中リスク：FFmpeg 統合の複雑さ**  
  フォーマット対応・エンコード設定の難易度  
  **対策**：`ffmpeg-python` ラッパ使用、段階的実装、プリセット提供

- **低リスク：UI の使いやすさ**  
  ノードベース UI の学習コスト  
  **対策**：チュートリアル充実、テンプレート提供、直感的アイコン

### 9.2 開発リスク
- **スコープクリープ**：MVP を明確化し段階追加、各フェーズに完了条件を設定
- **学習曲線**：AI ツール活用で小さな成功体験を積み、コミュニティやメンター支援を受ける

### 9.3 品質保証・テスト戦略
- **自動テスト層**：ユニット（ノード単体）、統合（グラフ全体）、E2E（Electron + FastAPI）を段階追加
- **パフォーマンスベンチマーク**：1080p/30fps 動画で遅延・CPU・メモリを測定し、リグレッションを監視
- **映像品質検証**：サンプルメディアと参照出力を比較し、SSIM / PSNR 指標の下限値を設定（※閾値 TBD）
- **回帰テスト**：Pull Request 毎に簡易ベンチを実行し、閾値超過で警告を表示
- **サンプルプロジェクト**：静止画・単発動画・色調整の 3 種を用意し、QA / 開発が共通参照
- **計測スクリプトの整備**：`scripts/benchmarks/` に遅延測定（プレビュー表示までの ms）、画質評価（SSIM/PSNR 計算）用の Python スクリプトを配置し、`npm run bench:preview` など 1 コマンドで実行可能にする
- **定期測定手順**：週次でベンチマークを実行し、結果を `docs/benchmarks/latest.md` に記録。閾値超過時はタスク管理ツールに自動で課題を登録する運用を採用
- **ログ出力フォーマット**：Electron 側は `PREVIEW_DELAY,<profile>,<ms>` に加え `CPU_USAGE,%,<value>`、`MEM_USAGE,MB,<value>` を記録し、ベンチマークスクリプトが平均値・最大値を集計できるようにする
- **CI 導入メモ**：初期段階ではローカル実行で十分だが、将来的に GitHub Actions 等で `npm run bench:*` と `npm run verify:security` を自動実行できるよう `.github/workflows/ci.yml` テンプレートを用意しておく。Python 依存のインストール手順（`pip install numpy opencv-python scikit-image`）をワークフローに追加すること

---

## 10. 参考情報

### 10.1 参考プロジェクト
- **ComfyUI**（AI 画像生成ノードエディタ）：ノードシステム・UI 設計  
  <https://github.com/comfyanonymous/ComfyUI>
- **Natron**（オープンソース合成ソフト）：ノードベース動画編集  
  <https://natrongithub.github.io/>
- **Etro.js**（TS 動画編集フレームワーク）：Web 技術での動画処理  
  <https://etrojs.dev>
- **Motion Canvas**（アニメーション作成）：Canvas API 活用  
  <https://motioncanvas.io>

### 10.2 技術ドキュメント
- ReactFlow：<https://reactflow.dev/learn>  
- Electron：<https://www.electronjs.org/docs>  
- WebCodecs API：<https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API>  
- FFmpeg：<https://ffmpeg.org/documentation.html>  
- FastAPI：<https://fastapi.tiangolo.com>

### 10.3 コミュニティリソース
- Reddit：r/electronjs, r/reactjs, r/webdev  
- Discord：Electron Community, React Community  
- Stack Overflow  
- YouTube：Electron + React チュートリアル

---

### 10.4 最終的な成功の鍵
AI ツールを効果的に活用し、**動作する最小限（MVP）**から始めて徐々に拡張する。完璧を急がず、**段階的に学習しながら**開発を進めることが重要である。

---

## 11. IPC セキュリティと権限設計

- **Electron 設定**：`contextIsolation: true`、`nodeIntegration: false` を基本に、必要な API のみ preload から `contextBridge` で公開
- **IPC チャネル**：Renderer → Main → Python に単方向ルーティングし、チャネル名とペイロード schema を固定
- **入力検証**：FFmpeg パラメータなど外部コマンドはホワイトリスト生成とし、ユーザー入力はエスケープ
- **ファイルアクセス制御**：`dialog` 経由で選択されたパスのみ許可し、任意パスの直接実行を禁止
- **外部リンク**：`shell.openExternal` は事前登録 URL のみ許可。ユーザー入力 URL は確認ダイアログを表示
- **コンテンツセキュリティポリシー**：`default-src 'self'` を基本とし、必要最小限のドメインのみ例外追加

---

## 12. 配布・更新・ライセンス方針

- **ビルド**：`electron-builder` を利用し、FFmpeg・Python ランタイムをプラットフォーム別に同梱
- **コード署名**：macOS Developer ID / Windows Authenticode を取得し、CI で署名プロセスを自動化
- **自動更新**：初期リリースでは無効化。β以降に `update-electron-app` を段階導入（ユーザーのオプトイン前提）
- **クラッシュレポート**：Electron CrashReporter はオフ。将来的な Sentry 等導入時はプライバシーポリシーに明記
- **ライセンス管理**：同梱 OSS の LICENSE を `/licenses` に集約し、FFmpeg の特許注意点を README に記載

---

## 13. 確定方針（2025-10-25 更新）

| 項目 | 決定内容 | 補足・運用 |
| --- | --- | --- |
| プレビュー遅延目標 | 1080p/30fps で 150ms 以下、4K/30fps で 250ms 以下 | 遅延は `graph:progress` のタイムスタンプとレンダラー計測で算出。週次ベンチマークで記録し、超過時はプロキシ解像度を自動的に 1/4 へ切り替え |
| 4K プレビュー対応 | 推奨 GPU：VRAM 6GB 以上（RTX 2060 / Radeon 5700 以上）。条件を満たさない場合は自動で 1/2 解像度プロキシを生成し、UI に警告を表示 | `settings.performance.forceProxy=true` を既定値とし、ユーザーが手動で解除可能 |
| 出力プリセット | `YouTube-1080p`（H.264 High 20Mbps）、`YouTube-4K`（H.264 High 45Mbps）、`Archival-ProRes422`、`Mobile-Vertical1080`（9:16 8Mbps）を標準搭載 | プリセットは `config/export-presets.json` に定義し、ユーザーは複製してカスタム化可能 |
| 自動更新ポリシー | バージョン 1.0.x までは手動更新（通知のみ）。1.1.0 以降で `update-electron-app` を opt-in とし、デフォルトは通知のみ | アプリ起動時に新バージョンをチェックし、リリースノート URL を表示。自動ダウンロードはユーザー設定で有効化 |
| 開発モード設定 | dev モードでは `contextIsolation=false`・`nodeIntegration=true` を許可するが、`DEV_MODE` フラグ必須。prod ビルドでの無効化を CI で検証 | `scripts/verify-security-flags.mjs` を追加してビルド前にチェックする運用とする |
| 品質指標閾値 | 静止画 SSIM ≥ 0.95、動画 PSNR ≥ 32dB / SSIM ≥ 0.92 を最低基準とする | ベンチマークメディアは `tests/media/` に固定し、CI で閾値未満の場合は失敗扱い |
| JSON スキーマ移行 | `schemaVersion` のメジャー更新時に CLI `nve migrate <file>` で自動変換。旧バージョンは 2 リリース後まで読み込みのみサポート | マイグレーションロジックは `tools/migrate_project.py` に集約し、仕様変更は付録に追記 |
| ベンチマーク実行 | 遅延・画質・セキュリティチェックを `npm run bench:*` コマンドで実行。結果は `docs/benchmarks/latest.md` に自動保存 | タスク管理ツール（Notion）に「ベンチ結果レビュー」テンプレートを用意し、週次で完了チェックを行う。スクリプト本体は `scripts/benchmarks/` および `scripts/verify-security-flags.mjs` を利用 |

---

## 付録A：用語スタイルガイド（抜粋）

- **AIドリブンコーディング**（旧記載：AIバイブコーディング）
- **WebSocket**（複数形表記は避け、機能名として単数形を使用）
- **FFmpeg**（先頭2文字は大文字）
- **Undo/Redo**（スラッシュの前後に空白は入れない）
- **カラーグレーディング**（「カラーグレーディング」に統一）
- **ノードベース**（ハイフンありの片仮名＋英語表記）
- **LUT**（頭字語のため全て大文字）

## 付録B：プロジェクト JSON スキーマ（抜粋）

```json
{
  "schemaVersion": "1.0.0",
  "mediaColorSpace": "Rec.709",
  "projectFps": 30,
  "nodes": [
    {
      "id": "n1",
      "type": "ImageResize",
      "params": { "width": 1920, "height": 1080, "filter": "lanczos3" },
      "inputs": { "image": "n0.output" },
      "outputs": ["result"],
      "cachePolicy": "auto"
    }
  ],
  "edges": [
    { "from": "n0.output", "to": "n1.image" }
  ],
  "assets": [
    { "id": "a1", "path": "Assets/clip01.mp4", "hash": "sha256:..." }
  ],
  "metadata": {
    "createdWith": "NodeVision 1.0",
    "lastSavedAt": "2025-10-25T09:00:00Z"
  }
}
```

## 付録C：イベント／エラーコード一覧

| イベント | 発火タイミング | ペイロード例 |
| --- | --- | --- |
| `graph:queued` | ノード投入直後 | `{ "nodeId": "n5" }` |
| `graph:progress` | 実行中 | `{ "nodeId": "n5", "progress": 42, "etaSec": 12 }` |
| `graph:completed` | 正常終了 | `{ "nodeId": "n5", "outputPath": "Cache/n5/result.png" }` |
| `graph:failed` | 異常終了 | `{ "nodeId": "n5", "code": "E-FFMPEG-01", "message": "Unsupported codec" }` |
| `cache:invalidated` | キャッシュ削除 | `{ "nodeId": "n3", "reason": "paramChanged" }` |

| エラーコード | 意味 | 推奨対応 |
| --- | --- | --- |
| `E-INPUT-01` | 入力ファイルが見つからない | パス再指定・再スキャン |
| `E-FFMPEG-01` | 未対応コーデック | プロキシ変換または対応表に従う |
| `E-NODE-VALIDATION` | パラメータ検証失敗 | UI で赤枠表示＋メッセージ |
| `E-ENGINE-CANCELLED` | ユーザー中断 | 進捗バー停止、再開オプション提示 |

## 付録D：リリース前チェックリスト

| 区分 | 内容 | 備考 |
| --- | --- | --- |
| ビルド確認 | `npm run build`／`electron-builder --mac --win` を成功させ、成果物を Smoke テスト | 成果物は共有フォルダに保管 |
| セキュリティ検証 | `npm run verify:security` を実行し、エラーがないことを確認 | CI で自動化予定 |
| ベンチマーク | `npm run bench:preview`、`python scripts/benchmarks/quality_metrics.py` を実行し、`docs/benchmarks/latest.md` を更新 | 閾値未達の場合はタスク登録 |
| ドキュメント | 仕様書・付録・CHANGELOG を最新化し、バージョンタグを記載 | Notion のリリースノートテンプレートを更新 |
| ライセンス | `/licenses` フォルダと README のライセンス表記を確認 | 新規依存追加時は再チェック |
| 配布準備 | コード署名、インストーラ検証、配布チャネルへのアップロード準備 | 失敗時は差分記録 |
| 連絡・QA | βテスト担当者に配布し、フィードバックフォームを共有 | フォーム URL は Notion に記載 |

## 11. 開発進捗ログ

最新の進行状況や日別メモは `docs/progress/` 配下に保存しています。日付ごとの Markdown（例: `docs/progress/2025-10-26.md`）を参照すると、実装ハイライト・利用コマンド・次回以降の TODO を把握できます。状況確認の際は必ず該当日付のログを確認してください。なお、本プロジェクトでは「進捗ログを残す」指示があった場合、**必ず `docs/progress/` に新しい日付ファイルを作成**して記録する運用とします。
