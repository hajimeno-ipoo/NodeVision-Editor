"""
Quality metrics benchmark skeleton.

使い方:
    python scripts/benchmarks/quality_metrics.py --reference path/to/ref.mp4 --test path/to/out.mp4

依存ライブラリ:
    pip install numpy opencv-python scikit-image

本スクリプトは、規定の映像/画像サンプルを比較し、SSIM と PSNR を出力します。
仕様書で定義した閾値 (SSIM >= 0.92, PSNR >= 32dB) を下回る場合は終了コード 1 を返します。
"""

import argparse
import sys

import cv2
import numpy as np
from skimage.metrics import peak_signal_noise_ratio, structural_similarity


def parse_args():
    parser = argparse.ArgumentParser(description="NodeVision quality benchmark")
    parser.add_argument("--reference", required=True, help="参照メディアパス")
    parser.add_argument("--test", required=True, help="評価対象メディアパス")
    parser.add_argument("--frames", type=int, default=30, help="比較する先頭フレーム数")
    return parser.parse_args()


def load_video(path, frames):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"動画を開けません: {path}")
    data = []
    for _ in range(frames):
        ok, frame = cap.read()
        if not ok:
            break
        data.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    cap.release()
    if not data:
        raise RuntimeError(f"フレームが読み込めません: {path}")
    return np.stack(data)


def main():
    args = parse_args()
    ref = load_video(args.reference, args.frames)
    test = load_video(args.test, args.frames)

    if ref.shape != test.shape:
        print("参照と評価対象の解像度/フレーム数が一致しません", file=sys.stderr)
        sys.exit(2)

    ssim_scores = []
    psnr_scores = []
    for idx in range(ref.shape[0]):
        ssim = structural_similarity(ref[idx], test[idx], channel_axis=-1, data_range=255)
        psnr = peak_signal_noise_ratio(ref[idx], test[idx], data_range=255)
        ssim_scores.append(ssim)
        psnr_scores.append(psnr)

    avg_ssim = float(np.mean(ssim_scores))
    avg_psnr = float(np.mean(psnr_scores))

    print("=== Quality Benchmark ===")
    print(f"SSIM (avg): {avg_ssim:.4f}")
    print(f"PSNR (avg): {avg_psnr:.2f} dB")

    if avg_ssim < 0.92 or avg_psnr < 32:
        print("品質基準を下回っています", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
