// LocalStorage 難読化モンキーパッチ
//
// 【セキュリティ仕様】
// このモジュールは localStorage の値を XOR + Base64 で「難読化」する。
// 固定キーとアルゴリズムがクライアントに同梱されており、認証タグも持たないため、
// DevTools 等でソースを解析すれば復元・改ざんは可能である。
// したがって、本モジュールが提供するのは「カジュアルな閲覧・改ざんの抑止」であり、
// 暗号学的な機密性・完全性の保証ではない。
//
// ESMのインポート順序バグを防ぐため、他のどのインポートよりも先にロードされる必要があります。

(function () {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const origGetItem = localStorage.getItem.bind(localStorage);
  const origSetItem = localStorage.setItem.bind(localStorage);

  // 難読化済みデータの識別プレフィックス
  // XMLでも安全かつ、キーボード入力からは入力されないゼロ幅特殊文字を使用
  // ※ 変数名は ENCRYPTION_ だが、実態は難読化である（API互換性のため名称維持）
  const ENCRYPTION_PREFIX = '\u200B\u200C\u200D_';

  // 難読化用の固定キー（クライアント同梱のため秘密ではない）
  const BASE_XOR_KEY = 'arakia_card_battle_secret_key_2026';

  // バックアップXML出力・インポート用に、オリジナルの(フック前の)関数を公開
  window.__origGetItem = origGetItem;
  window.__origSetItem = origSetItem;

  // キー名をソルトに混ぜて動的XORキーでスクランブルをかける
  function xorScramble(text, key) {
    let salt = 0;
    for (let i = 0; i < key.length; i++) {
      salt = (salt << 5) - salt + key.charCodeAt(i);
      salt |= 0;
    }
    salt = Math.abs(salt);

    const dynamicKey = BASE_XOR_KEY + key;
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode =
        text.charCodeAt(i) ^
        dynamicKey.charCodeAt((i + salt) % dynamicKey.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  }

  // 難読化エンコード: encodeURIComponent → XORスクランブル → Base64 → プレフィックス付与
  function encrypt(text, key) {
    try {
      const scrambled = xorScramble(encodeURIComponent(text), key);
      return ENCRYPTION_PREFIX + btoa(scrambled);
    } catch (_e) {
      return text;
    }
  }

  // 難読化デコード: プレフィックス除去 → Base64デコード → XORスクランブル → decodeURIComponent
  // デコード失敗時はnullを返す（呼び出し元のデフォルト値フォールバックでプレイ続行可能にする）
  function decrypt(encryptedText, key) {
    if (!encryptedText || typeof encryptedText !== 'string')
      return encryptedText;
    if (!encryptedText.startsWith(ENCRYPTION_PREFIX)) return encryptedText;

    try {
      const cipher = encryptedText.substring(ENCRYPTION_PREFIX.length);
      return decodeURIComponent(xorScramble(atob(cipher), key));
    } catch (_e) {
      console.error(
        `[Storage] 難読化データのデコードに失敗しました (key: ${key})`,
        _e
      );
      return null;
    }
  }

  localStorage.getItem = function (key) {
    const raw = origGetItem(key);
    if (raw === null) return null;
    const decrypted = decrypt(raw, key);

    // 【自動マイグレーション】平文データを検出したら難読化する
    if (raw && !raw.startsWith(ENCRYPTION_PREFIX)) {
      try {
        origSetItem(key, encrypt(decrypted, key));
      } catch (_e) {
        console.warn(`[Storage] Failed to auto-migrate key: ${key}`, _e);
      }
    }
    return decrypted;
  };

  localStorage.setItem = function (key, value) {
    const textValue = typeof value === 'string' ? value : String(value);

    // 既に難読化済みのデータはそのまま格納（二重エンコード防止）
    if (textValue.startsWith(ENCRYPTION_PREFIX)) {
      origSetItem(key, textValue);
    } else {
      origSetItem(key, encrypt(textValue, key));
    }
  };

  // 【起動時マイグレーション】
  // まだ難読化されていない平文のゲームデータキーを一括変換する
  try {
    const keysToMigrate = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mini_card_battle_')) {
        const raw = origGetItem(key);
        if (raw && !raw.startsWith(ENCRYPTION_PREFIX)) {
          keysToMigrate.push({ key, raw });
        }
      }
    }

    for (const item of keysToMigrate) {
      const decrypted = decrypt(item.raw, item.key);
      origSetItem(item.key, encrypt(decrypted, item.key));
    }
  } catch (e) {
    console.warn('[Storage] Failed to run eager startup migration', e);
  }
})();
