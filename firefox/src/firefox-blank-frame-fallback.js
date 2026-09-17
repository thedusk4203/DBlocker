(() => {
  'use strict';

  if (globalThis.__DBLOCKER_CONTROLLER_BOOTSTRAPPED__) return;
  let href = '';
  try { href = String(location.href || ''); } catch (_) {}
  if (href !== 'about:blank' && href !== 'about:srcdoc') return;

  (async () => {
    if (!globalThis.DBlockerShared && !globalThis.AdsControlShared) {
      await import(browser.runtime.getURL('src/shared.js'));
    }
    if (!globalThis.__DBLOCKER_CONTROLLER_BOOTSTRAPPED__) {
      await import(browser.runtime.getURL('src/controller.js'));
    }
  })().catch(() => {});
})();
