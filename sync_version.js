import fs from 'fs';
import path from 'path';

// package.json のパス
const packageJsonPath = path.resolve('./package.json');
// 各ターゲットファイルのパス
const swPath = path.resolve('./public/service-worker.js');
const versionJsonPath = path.resolve('./public/version.json');
const configJsPath = path.resolve('./src/utils/constants/config.js');

try {
  // package.jsonからバージョンを取得
  const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageData.version;
  console.log(`[SyncVersion] package.json version: ${version}`);

  // 1. service-worker.js の更新
  if (fs.existsSync(swPath)) {
    let swContent = fs.readFileSync(swPath, 'utf8');
    swContent = swContent.replace(
      /const CACHE_NAME = 'mini-card-battle-v[^']+';/,
      `const CACHE_NAME = 'mini-card-battle-v${version}';`
    );
    fs.writeFileSync(swPath, swContent);
    console.log(`[SyncVersion] Updated service-worker.js to v${version}`);
  }

  // 2. version.json の更新
  if (fs.existsSync(versionJsonPath)) {
    const versionJsonContent = JSON.stringify({ version }, null, 2);
    fs.writeFileSync(versionJsonPath, versionJsonContent);
    console.log(`[SyncVersion] Updated version.json to v${version}`);
  }

  // 3. config.js の更新
  if (fs.existsSync(configJsPath)) {
    let configContent = fs.readFileSync(configJsPath, 'utf8');
    configContent = configContent.replace(
      /export const GAME_VERSION = '[^']+';/,
      `export const GAME_VERSION = '${version}';`
    );
    fs.writeFileSync(configJsPath, configContent);
    console.log(`[SyncVersion] Updated config.js to v${version}`);
  }

  console.log('[SyncVersion] Successfully synchronized all version strings.');
} catch (error) {
  console.error('[SyncVersion] Error updating versions:', error);
  process.exit(1);
}
