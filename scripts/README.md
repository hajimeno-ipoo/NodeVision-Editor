# Scripts Overview

- `benchmarks/preview_delay.js`: Electron ログを解析してプレビュー遅延・CPU・メモリを集計します。`PREVIEW_DELAY,<profile>,<ms>` と併せて `CPU_USAGE,%,<value>`、`MEM_USAGE,MB,<value>` の行をログに出力してください。 `BENCH_LOG` 環境変数でログパスを指定し、`node scripts/benchmarks/preview_delay.js` を実行します。
- `benchmarks/quality_metrics.py`: 参照映像と出力映像の SSIM / PSNR を算出します。`pip install numpy opencv-python scikit-image` を事前に実行してください。
- `verify-security-flags.mjs`: Electron ビルド設定から `nodeIntegration` などのフラグを検証します。`node scripts/verify-security-flags.mjs` で実行できます。

> これらは仕様書 9.3、13 章に記載された運用ルールを実現するための雛形です。必要に応じて CI へ組み込み、`npm run bench:preview` などのスクリプトを package.json に追加してください。
