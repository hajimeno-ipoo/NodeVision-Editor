# FastAPI Backend (prototype)

このディレクトリは NodeVision Editor のバックエンド検証用 FastAPI アプリを格納します。Electron からのフェッチ経路をテストするために最小限のエンドポイントのみを提供しています。

## セットアップ

```bash
python3 -m venv .venv
source .venv/bin/activate  # Windows の場合は .venv\\Scripts\\activate
pip install -r requirements.txt
```

## 開発サーバーの起動

```bash
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 提供エンドポイント

- `GET /health` — アプリケーションの稼働確認。Electron メインプロセスからの疎通チェックに利用します。
- `GET /info` — バージョンや依存関係のメタ情報を返却します。
- `GET /nodes/catalog` — ノードカタログ（仮想データ）を返却します。Electron レンダラーでノード定義を同期する想定です。
- `POST /projects/save` — 受け取ったプロジェクト JSON を保存し、要約情報を返却します。

Electron 側では `BACKEND_URL` 環境変数でエンドポイントのベース URL を指定します。デフォルトは `http://127.0.0.1:8000` です。
