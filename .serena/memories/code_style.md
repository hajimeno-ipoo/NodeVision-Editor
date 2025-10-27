# コーディングスタイル
- TypeScript は `strict` かつ NodeNext モジュール形式。ファイル拡張子は `.ts` でもインポートには `.js` を明示 (`esModuleInterop` 前提)。
- React コンポーネントは関数型・フック中心。状態/副作用は `useState`・`useEffect` 等で細分化し、`useCallback` でハンドラをメモ化する傾向。
- 型は `type`/`interface` を積極活用し、IPC などのチャンネル名は `project:*` など文字列リテラルで統一。`Record`, `Array<...>` のように明示的な型注釈。
- 文字列メッセージは日本語 UI 文言が多い。エラー文は例外メッセージとしても表示されるため可読性を意識。
- Python(FastAPI) は Pydantic モデルを定義し型でバリデーション。`typing` の Union や `NamedTuple` を用いて返却値を明示。
- Linter 設定は現状なし。既存コードに合わせて Prettier 互換の 2 スペース / セミコロン有りスタイルを維持。