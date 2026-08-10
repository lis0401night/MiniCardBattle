import React from 'react';
import ReactDOM from 'react-dom/client';
import CharaAssetMaker from './CharaAssetMaker';

/**
 * キャラアセット書き出しツール用のReactエントリーポイント
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CharaAssetMaker />
  </React.StrictMode>
);
