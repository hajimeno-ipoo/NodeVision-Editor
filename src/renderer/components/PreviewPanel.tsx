export interface PreviewData {
  imageSrc: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  proxyEnabled: boolean;
  proxyScale: number;
  proxyReason: string;
  averageDelayMs?: number | null;
  targetDelayMs?: number | null;
  generatedAt: string;
  profile: string;
}

interface PreviewPanelProps {
  preview: PreviewData | null;
  loading: boolean;
  error: string | null;
  onRefresh(): void;
  onImageRendered(preview: PreviewData): void;
  proxyMode: 'auto' | 'on' | 'off';
  onProxyModeChange(mode: 'auto' | 'on' | 'off'): void;
}

export function PreviewPanel({
  preview,
  loading,
  error,
  onRefresh,
  onImageRendered,
  proxyMode,
  onProxyModeChange
}: PreviewPanelProps) {
  const proxyReasonLabels: Record<string, string> = {
    client_force_on: 'レンダラーで強制 ON',
    client_force_off: 'レンダラーで強制 OFF',
    project_metadata_on: 'プロジェクト設定で有効',
    project_metadata_off: 'プロジェクト設定で無効',
    resolution_4k: '自動判定: 4K 以上',
    resolution_qhd: '自動判定: 1440p 以上',
    historical_delay: '自動判定: 遅延が閾値超過',
    auto: '自動判定: ベースライン',
  };

  const reasonLabel = preview ? proxyReasonLabels[preview.proxyReason] ?? preview.proxyReason : '';

  return (
    <section className="app-shell__section preview-panel">
      <header className="preview-panel__header">
        <h2>プレビュー</h2>
        <div className="preview-panel__actions">
          <button type="button" onClick={() => onRefresh()} disabled={loading}>
            再生成
          </button>
          <div className="preview-panel__proxy-toggle" role="group" aria-label="Proxy Mode">
            <button
              type="button"
              className={proxyMode === 'auto' ? 'is-active' : ''}
              onClick={() => onProxyModeChange('auto')}
              disabled={loading}
            >
              自動
            </button>
            <button
              type="button"
              className={proxyMode === 'on' ? 'is-active' : ''}
              onClick={() => onProxyModeChange('on')}
              disabled={loading}
            >
              強制 ON
            </button>
            <button
              type="button"
              className={proxyMode === 'off' ? 'is-active' : ''}
              onClick={() => onProxyModeChange('off')}
              disabled={loading}
            >
              強制 OFF
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="preview-panel__error">プレビュー生成に失敗しました: {error}</p> : null}

      <div className={`preview-panel__viewport${loading ? ' preview-panel__viewport--loading' : ''}`}>
        {preview ? (
          <img
            key={preview.generatedAt}
            src={preview.imageSrc}
            alt="NodeVision Preview"
            width={preview.width}
            height={preview.height}
            onLoad={() => onImageRendered(preview)}
            className="preview-panel__image"
          />
        ) : !loading ? (
          <p className="preview-panel__placeholder">プレビューを生成していません。</p>
        ) : null}
        {loading ? <div className="preview-panel__spinner">生成中…</div> : null}
      </div>

      {preview ? (
        <ul className="preview-panel__meta">
          <li>
            元解像度: {preview.sourceWidth}×{preview.sourceHeight}
          </li>
          <li>
            表示解像度: {preview.width}×{preview.height}
          </li>
          <li>生成時刻: {new Date(preview.generatedAt).toLocaleString('ja-JP')}</li>
          <li>
            プロキシ: {preview.proxyEnabled ? '有効' : '無効'}（スケール {preview.proxyScale.toFixed(2)}x）
          </li>
          <li>判定理由: {reasonLabel}</li>
          {preview.targetDelayMs != null ? (
            <li>遅延目標: {preview.targetDelayMs.toFixed(0)} ms</li>
          ) : null}
          {preview.averageDelayMs != null ? (
            <li>平均遅延: {preview.averageDelayMs.toFixed(1)} ms</li>
          ) : null}
          <li>プロファイル: {preview.profile}</li>
        </ul>
      ) : null}
    </section>
  );
}

export default PreviewPanel;
