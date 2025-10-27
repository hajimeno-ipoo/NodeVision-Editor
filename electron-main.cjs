async function bootstrap() {
  const module = await import('./dist/main/main.js');
const initializeMainProcess = module.initializeMainProcess ?? module.default;

if (typeof initializeMainProcess !== 'function') {
  throw new Error('initializeMainProcess exportが見つかりませんでした。ビルド設定を確認してください。');
}

await initializeMainProcess();
}

bootstrap().catch((error) => {
  console.error('[electron-main] Failed to bootstrap main process:', error);
  process.exit(1);
});
