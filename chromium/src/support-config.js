(() => {
  'use strict';

  // Voluntary support channels owned by the DBlocker developer.
  // External links are HTTPS-only. Bank details/QR are static display-only data.
  const links = Object.freeze([
    Object.freeze({ id: 'paypal', label: 'PayPal', url: 'https://paypal.me/dusk4203' }),
  ]);

  const bankAccounts = Object.freeze([
    Object.freeze({
      id: 'tpbank',
      bank: 'TPBank',
      accountNumber: '04784561801',
      qrAsset: 'assets/support/tpbank-qr.png',
    }),
  ]);

  globalThis.DBlockerSupport = Object.freeze({ links, bankAccounts });
})();
