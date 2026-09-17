(() => {
  'use strict';

  if (globalThis.__DBLOCKER_CONTROLLER_BOOTSTRAPPED__) return;
  globalThis.__DBLOCKER_CONTROLLER_BOOTSTRAPPED__ = true;

  const S = globalThis.DBlockerShared || globalThis.AdsControlShared;
  if (!S) return;

  let channelId = '';
  let bridgeSecret = '';
  let telemetryEventName = '';
  let hmacKey = null;
  let lastTelemetrySeq = 0;
  let telemetryListener = null;
  let telemetryQueue = Promise.resolve();
  let telemetryWindowStartedAt = 0;
  let telemetryWindowCount = 0;
  let rawTelemetryWindowStartedAt = 0;
  let rawTelemetryWindowCount = 0;

  const isTopFrame = (() => {
    try { return window.top === window; } catch (_) { return false; }
  })();

  function getAncestorHostnames() {
    if (isTopFrame) return [];
    const hosts = [];
    try {
      const origins = location.ancestorOrigins;
      if (origins && typeof origins.length === 'number') {
        for (let i = 0; i < origins.length; i++) {
          try {
            const host = new URL(origins[i]).hostname.toLowerCase();
            if (host) hosts.push(host);
          } catch (_) {}
        }
      }
    } catch (_) {}
    try {
      if (document.referrer) {
        const host = new URL(document.referrer).hostname.toLowerCase();
        if (host) hosts.push(host);
      }
    } catch (_) {}
    return Array.from(new Set(hosts)).slice(0, 16);
  }

  function base64ToBytes(value) {
    try {
      const raw = atob(String(value || ''));
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    } catch (_) {
      return new Uint8Array();
    }
  }

  function base64ToBuffer(value) {
    return base64ToBytes(value).buffer;
  }

  function minimizeHttpUrl(value, fallback = location.origin) {
    try {
      const parsed = new URL(String(value || fallback), location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return String(fallback || '').slice(0, 2048);
      return `${parsed.origin}${parsed.pathname || '/'}`.slice(0, 2048);
    } catch (_) {
      return String(fallback || '').slice(0, 2048);
    }
  }

  async function shouldBootstrapProtectedContext() {
    // Fast local exit: a fresh/default install with no enabled sites should not
    // contact the background context with browsing context at all.
    const stored = await browser.storage.local.get(S.STORAGE_KEYS.enabledSites);
    const enabledSites = S.sanitizeArray(
      stored[S.STORAGE_KEYS.enabledSites] ?? S.DEFAULT_ENABLED_SITES,
      S.normalizeSiteKeyInput,
      S.MAX_ENABLED_SITES,
    );
    if (!enabledSites.length) return false;

    // Authoritative matching stays in the background context because it loads the
    // bundled Public Suffix List. Only hostnames are sent during this preflight;
    // full page URLs/paths are not sent for unprotected contexts.
    const response = await browser.runtime.sendMessage({
      type: 'ADS_FRAME_POLICY_CHECK',
      context: {
        hostname: location.hostname,
        topFrame: isTopFrame,
        ancestorHostnames: getAncestorHostnames(),
      },
    });
    return response?.ok === true && response.protectionEnabled === true;
  }

  async function importHmacKey(secret) {
    const bytes = base64ToBytes(secret);
    if (!bytes.length || !crypto?.subtle) return null;
    return crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  }

  async function verifyEnvelope(envelope) {
    if (!hmacKey || !envelope || typeof envelope !== 'object') return null;
    const seq = Number(envelope.seq);
    const type = String(envelope.type || '');
    const body = String(envelope.body || '');
    const mac = String(envelope.mac || '');

    if (!Number.isSafeInteger(seq) || seq <= lastTelemetrySeq || seq > Number.MAX_SAFE_INTEGER) return null;
    if (!['blocked', 'openPopup', 'overlayActivation', 'allowedNewContext'].includes(type)) return null;
    if (!body || body.length > 32768 || !mac || mac.length > 256) return null;

    const message = `${seq}\n${type}\n${body}`;
    let ok = false;
    try {
      ok = await crypto.subtle.verify(
        'HMAC',
        hmacKey,
        base64ToBuffer(mac),
        new TextEncoder().encode(message),
      );
    } catch (_) {
      ok = false;
    }
    if (!ok) return null;

    let payload;
    try { payload = JSON.parse(body); } catch (_) { return null; }
    lastTelemetrySeq = seq;
    return { type, payload };
  }

  function sanitizeBlockedItem(item) {
    if (!item || typeof item !== 'object') return null;
    const type = String(item.type || '');
    if (!S.ALLOWED_RULE_TYPES.includes(type)) return null;

    let origin = '';
    if (type === 'tab-under') {
      origin = S.normalizeHttpOrigin(item.origin) || location.origin;
    } else {
      origin = S.normalizeHttpOrigin(item.origin);
    }
    if (!origin) return null;

    const rawClassification = String(item.classification || '').slice(0, 96);
    const classification = /^(?:ad|player|unknown|fullscreen-overlay|dontfoid(?:-aclib)?)(?::[a-z0-9-]+)?$/i.test(rawClassification)
      ? rawClassification
      : null;
    const score = Number(item.classificationScore);

    return {
      type,
      origin,
      host: S.displayHost(origin).slice(0, 255),
      url: minimizeHttpUrl(item.url || origin, origin),
      classification,
      classificationScore: Number.isFinite(score) ? Math.max(-100, Math.min(100, score)) : null,
      at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now(),
    };
  }

  async function handleTelemetryDetail(detail) {
    let envelope;
    try { envelope = JSON.parse(String(detail || '')); } catch (_) { return; }
    const verified = await verifyEnvelope(envelope);
    if (!verified) return;

    const now = Date.now();
    if (!telemetryWindowStartedAt || now - telemetryWindowStartedAt >= 5000) {
      telemetryWindowStartedAt = now;
      telemetryWindowCount = 0;
    }
    if (++telemetryWindowCount > 120) return;

    if (verified.type === 'blocked') {
      const item = sanitizeBlockedItem(verified.payload);
      if (!item) return;
      browser.runtime.sendMessage({ type: 'ADS_BLOCK_EVENT', item }).catch(() => {});
      return;
    }

    if (verified.type === 'overlayActivation') {
      const origin = S.normalizeHttpOrigin(verified.payload?.origin);
      const eventType = String(verified.payload?.eventType || '').slice(0, 32);
      const at = Number(verified.payload?.at);
      if (!origin || !/^(?:pointerdown|mousedown|touchstart|pointerup|mouseup|touchend|click|auxclick|contextmenu)$/.test(eventType)) return;
      browser.runtime.sendMessage({
        type: 'ADS_OVERLAY_ACTIVATION',
        activation: { origin, eventType, at: Number.isFinite(at) ? at : Date.now() },
      }).catch(() => {});
      return;
    }

    if (verified.type === 'allowedNewContext') {
      const kind = String(verified.payload?.kind || '');
      const origin = S.normalizeHttpOrigin(verified.payload?.origin);
      const at = Number(verified.payload?.at);
      if (kind !== 'form' || !origin || !Number.isFinite(at)) return;
      browser.runtime.sendMessage({
        type: 'ADS_ALLOWED_NEW_CONTEXT',
        intent: { kind, origin, at },
      }).catch(() => {});
      return;
    }


    if (verified.type === 'openPopup') {
      const focusOrigin = S.normalizeHttpOrigin(verified.payload?.focusOrigin);
      const focusType = S.ALLOWED_RULE_TYPES.includes(String(verified.payload?.focusType || ''))
        ? String(verified.payload.focusType)
        : '';
      browser.runtime.sendMessage({
        type: 'ADS_OPEN_POPUP',
        focus: focusOrigin && focusType ? { type: focusType, origin: focusOrigin } : null,
      }).catch(() => {});
    }
  }

  async function bootstrapOnce() {
    const response = await browser.runtime.sendMessage({
      type: 'ADS_FRAME_PREPARE',
      page: {
        url: minimizeHttpUrl(location.href),
        hostname: location.hostname,
        topFrame: isTopFrame,
        ancestorHostnames: getAncestorHostnames(),
      },
    });

    if (!response?.ok || !response.channelId || !response.secret) return false;

    channelId = String(response.channelId);
    bridgeSecret = String(response.secret);
    telemetryEventName = `__dblocker_telemetry_${channelId}`;
    hmacKey = await importHmacKey(bridgeSecret);
    if (!hmacKey) return false;

    telemetryListener = (event) => {
      const detail = String(event?.detail || '');
      if (!detail || detail.length > 65536) return;

      // Drop raw DOM-event floods before doing JSON parsing/HMAC verification.
      // A hostile page may discover the randomized event name by monkey-patching
      // MAIN-world APIs; it still must not be able to turn that into crypto/I/O DoS.
      const now = Date.now();
      if (!rawTelemetryWindowStartedAt || now - rawTelemetryWindowStartedAt >= 5000) {
        rawTelemetryWindowStartedAt = now;
        rawTelemetryWindowCount = 0;
      }
      if (++rawTelemetryWindowCount > 300) return;

      telemetryQueue = telemetryQueue
        .then(() => handleTelemetryDetail(detail))
        .catch(() => {});
    };
    document.addEventListener(telemetryEventName, telemetryListener, true);

    const start = await browser.runtime.sendMessage({
      type: 'ADS_FRAME_START',
      channelId,
    });
    if (!start?.ok) {
      document.removeEventListener(telemetryEventName, telemetryListener, true);
      telemetryListener = null;
      return false;
    }
    return true;
  }

  async function bootstrap() {
    if (!(await shouldBootstrapProtectedContext())) return false;

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (await bootstrapOnce()) return true;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
    if (lastError) throw lastError;
    return false;
  }

  bootstrap().catch((error) => {
    console.warn('[DBlocker] secure frame bootstrap failed:', error);
  });
})();
