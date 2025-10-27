import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'reactflow/dist/style.css';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('#root コンテナが見つかりません。index.html のテンプレートを確認してください。');
}

const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
