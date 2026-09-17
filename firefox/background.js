const S = globalThis.DBlockerShared || globalThis.AdsControlShared;
const MAIN_ENGINE = globalThis.DBlockerMainEngine;
const { STORAGE_KEYS, DEFAULT_ENABLED_SITES, DEFAULT_SETTINGS, ruleKey } = S;

const FRAME_PREFIX = 'dblocker_frame_v2_';
const TAB_PREFIX = 'adscontrol_tab_state_';
const POPUP_GUARD_PREFIX = 'dblocker_popup_guard_v1_';
const MAX_BLOCK_ITEMS = 250;
const TAB_FLUSH_DELAY_MS = 100;

const tabQueues = new Map();
const frameQueues = new Map();
const aesKeyCache = new Map();
const tabStateCache = new Map();
const tabFlushTimers = new Map();
const overlayPopunderQuarantine = new Map();
const popupRedirectGuards = new Map();
const recentChildTabsByOpener = new Map();
const allowedFormNewContextIntents = new Map();
const OVERLAY_POPUNDER_QUARANTINE_MS = 1800;
const FORM_NEW_CONTEXT_INTENT_MS = 2500;
const QUARANTINE_CLOSE_DELAY_MS = 800;
let allowRulesCache = new Set();
let defaultsReadyPromise = null;
let defaultsReady = false;

function tabStateStorageKey(tabId) {
  return `${TAB_PREFIX}${tabId}`;
}

function frameStorageKey(tabId, documentId, frameId) {
  return `${FRAME_PREFIX}${tabId}_${documentId || `frame-${frameId}`}`;
}

function popupGuardStorageKey(tabId) {
  return `${POPUP_GUARD_PREFIX}${tabId}`;
}

function randomBytesBase64(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

function randomHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function rememberRecentChildTab(openerTabId, tabId, initialUrl = '') {
  if (!Number.isInteger(openerTabId) || !Number.isInteger(tabId)) return;
  const now = Date.now();
  const list = (recentChildTabsByOpener.get(openerTabId) || [])
    .filter((entry) => now - entry.at <= OVERLAY_POPUNDER_QUARANTINE_MS && entry.tabId !== tabId);
  list.push({ tabId, at: now, initialUrl: String(initialUrl || '').slice(0, 2048) });
  recentChildTabsByOpener.set(openerTabId, list.slice(-8));
}

function consumeRecentChildTabs(openerTabId) {
  const now = Date.now();
  const list = (recentChildTabsByOpener.get(openerTabId) || [])
    .filter((entry) => now - entry.at <= OVERLAY_POPUNDER_QUARANTINE_MS);
  recentChildTabsByOpener.delete(openerTabId);
  return list;
}

function armOverlayPopunderQuarantine(tabId) {
  if (!Number.isInteger(tabId)) return;
  overlayPopunderQuarantine.set(tabId, Date.now() + OVERLAY_POPUNDER_QUARANTINE_MS);

  // Race fallback: a hostile window/document capture listener may create the
  // child tab a few milliseconds before authenticated activation telemetry reaches
  // the worker. Close recently-created children retroactively for this opener.
  for (const entry of consumeRecentChildTabs(tabId)) {
    closeQuarantinedChild(tabId, entry.tabId, entry.initialUrl).catch(() => {});
  }
}

function urlOrigin(rawUrl) {
  return S.normalizeHttpOrigin(rawUrl);
}

function isPopupAllowedOrigin(origin) {
  return !!(origin && allowRulesCache.has(ruleKey('popup', origin)));
}

function isRedirectAllowedOrigin(origin) {
  return !!(origin && allowRulesCache.has(ruleKey('redirect', origin)));
}

function isFormAllowedOrigin(origin) {
  return !!(origin && allowRulesCache.has(ruleKey('form', origin)));
}

function allowedPopupOriginFor(rawUrl, fallbackUrl = '') {
  const origin = urlOrigin(rawUrl) || urlOrigin(fallbackUrl);
  return isPopupAllowedOrigin(origin) ? origin : '';
}

function shouldPreservePopupNavigation(initialUrl, candidateUrl, openerUrl = '') {
  const initialText = String(initialUrl || '').trim();
  const initialOrigin = allowedPopupOriginFor(
    initialText && initialText !== 'about:blank' ? initialText : '',
    (!initialText || initialText === 'about:blank') ? openerUrl : '',
  );
  const candidateOrigin = urlOrigin(candidateUrl);

  // If we have a concrete final destination, it governs the decision. An ALLOW
  // for the initial popup origin does not implicitly allow a later cross-origin
  // server/client redirect. That final origin needs popup|origin or redirect|origin.
  if (candidateOrigin) {
    if (isPopupAllowedOrigin(candidateOrigin)) return true;
    if (initialOrigin && candidateOrigin === initialOrigin) return true;
    if (initialOrigin && isRedirectAllowedOrigin(candidateOrigin)) return true;
    return false;
  }

  // Blank-first popups may be preserved temporarily, but are guarded until their
  // first committed HTTP(S) destination is observed.
  return !!initialOrigin;
}

function shouldPreserveFormNavigation(allowedOrigin, candidateUrl) {
  const candidateOrigin = urlOrigin(candidateUrl);
  if (!candidateOrigin) return !!allowedOrigin;
  if (candidateOrigin === allowedOrigin) return true;
  return isRedirectAllowedOrigin(candidateOrigin);
}

function registerPopupRedirectGuard(childTabId, openerTabId, allowedOrigin, sourceType = 'popup') {
  if (!Number.isInteger(childTabId) || !Number.isInteger(openerTabId) || !allowedOrigin) return;
  const kind = sourceType === 'form' ? 'form' : 'popup';
  const guard = {
    openerTabId,
    allowedOrigin,
    sourceType: kind,
    createdAt: Date.now(),
  };
  popupRedirectGuards.set(childTabId, guard);
  browser.storage.session.set({ [popupGuardStorageKey(childTabId)]: guard }).catch(() => {});
}

async function getPopupRedirectGuard(childTabId) {
  if (!Number.isInteger(childTabId)) return null;
  const cached = popupRedirectGuards.get(childTabId);
  if (cached) return cached;
  try {
    const key = popupGuardStorageKey(childTabId);
    const data = await browser.storage.session.get(key);
    const raw = data[key];
    const openerTabId = Number(raw?.openerTabId);
    const allowedOrigin = urlOrigin(raw?.allowedOrigin);
    const sourceType = raw?.sourceType === 'form' ? 'form' : raw?.sourceType === 'popup' ? 'popup' : '';
    if (!Number.isInteger(openerTabId) || !allowedOrigin || !sourceType) {
      if (raw) await browser.storage.session.remove(key).catch(() => {});
      return null;
    }
    const guard = {
      openerTabId,
      allowedOrigin,
      sourceType,
      createdAt: Number(raw?.createdAt) || Date.now(),
    };
    popupRedirectGuards.set(childTabId, guard);
    return guard;
  } catch (_) {
    return null;
  }
}

function updatePopupRedirectGuard(childTabId, guard) {
  if (!Number.isInteger(childTabId) || !guard) return;
  popupRedirectGuards.set(childTabId, guard);
  browser.storage.session.set({ [popupGuardStorageKey(childTabId)]: guard }).catch(() => {});
}

function clearPopupRedirectGuard(childTabId) {
  if (!Number.isInteger(childTabId)) return;
  popupRedirectGuards.delete(childTabId);
  browser.storage.session.remove(popupGuardStorageKey(childTabId)).catch(() => {});
}

function pruneAllowedFormIntents(openerTabId, now = Date.now()) {
  const list = (allowedFormNewContextIntents.get(openerTabId) || [])
    .filter((entry) => now - Number(entry.at || 0) <= FORM_NEW_CONTEXT_INTENT_MS);
  if (list.length) allowedFormNewContextIntents.set(openerTabId, list);
  else allowedFormNewContextIntents.delete(openerTabId);
  return list;
}

function rememberAllowedFormIntent(openerTabId, origin, at = Date.now()) {
  const normalizedOrigin = urlOrigin(origin);
  const now = Date.now();
  const eventAt = Number(at);
  if (!Number.isInteger(openerTabId) || !normalizedOrigin || !isFormAllowedOrigin(normalizedOrigin)) return false;
  if (!Number.isFinite(eventAt) || eventAt > now + 1000 || now - eventAt > FORM_NEW_CONTEXT_INTENT_MS) return false;
  const list = pruneAllowedFormIntents(openerTabId, now)
    .filter((entry) => entry.origin !== normalizedOrigin);
  list.push({ origin: normalizedOrigin, at: eventAt });
  allowedFormNewContextIntents.set(openerTabId, list.slice(-8));
  return true;
}

function hasAllowedFormIntent(openerTabId, origin, now = Date.now()) {
  const normalizedOrigin = urlOrigin(origin);
  if (!normalizedOrigin || !isFormAllowedOrigin(normalizedOrigin)) return false;
  return pruneAllowedFormIntents(openerTabId, now).some((entry) => entry.origin === normalizedOrigin);
}

function consumeAllowedFormIntent(openerTabId, origin, allowRedirectMatch = false) {
  const normalizedOrigin = urlOrigin(origin);
  if (!normalizedOrigin) return '';
  const list = pruneAllowedFormIntents(openerTabId);
  let index = list.findIndex((entry) => entry.origin === normalizedOrigin && isFormAllowedOrigin(entry.origin));
  if (index < 0 && allowRedirectMatch && isRedirectAllowedOrigin(normalizedOrigin)) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (isFormAllowedOrigin(list[i].origin)) { index = i; break; }
    }
  }
  if (index < 0) return '';
  const [entry] = list.splice(index, 1);
  if (list.length) allowedFormNewContextIntents.set(openerTabId, list);
  else allowedFormNewContextIntents.delete(openerTabId);
  return entry.origin;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function getChildCandidateUrl(childTabId) {
  if (!Number.isInteger(childTabId)) return '';
  // Let pendingUrl/URL settle so a same-origin trampoline cannot win validation
  // merely because tabs.onCreated fired before the first navigation committed.
  await sleep(QUARANTINE_CLOSE_DELAY_MS);
  try {
    const tab = await browser.tabs.get(childTabId);
    return String(tab?.pendingUrl || tab?.url || '').slice(0, 2048);
  } catch (_) {
    return '';
  }
}

async function getOpenerUrl(openerTabId) {
  try {
    const opener = await browser.tabs.get(openerTabId);
    return opener?.pendingUrl || opener?.url || '';
  } catch (_) {
    return '';
  }
}

async function validateAllowedPopupChild(openerTabId, childTabId, initialUrl = '') {
  const openerUrl = await getOpenerUrl(openerTabId);
  const initialText = String(initialUrl || '').trim();
  const allowedOrigin = allowedPopupOriginFor(
    initialText && initialText !== 'about:blank' ? initialText : '',
    (!initialText || initialText === 'about:blank') ? openerUrl : '',
  );
  if (!allowedOrigin) return false;

  // Arm before waiting so onCommitted can catch even a very fast server redirect.
  registerPopupRedirectGuard(childTabId, openerTabId, allowedOrigin, 'popup');
  const candidate = await getChildCandidateUrl(childTabId);
  if (!shouldPreservePopupNavigation(initialUrl, candidate, openerUrl)) {
    clearPopupRedirectGuard(childTabId);
    await browser.tabs.remove(childTabId).catch(() => {});
    return true;
  }
  return false;
}

async function validateAllowedFormChild(openerTabId, childTabId, initialUrl = '') {
  const initialOrigin = urlOrigin(initialUrl);
  let allowedOrigin = initialOrigin && hasAllowedFormIntent(openerTabId, initialOrigin)
    ? consumeAllowedFormIntent(openerTabId, initialOrigin)
    : '';

  if (allowedOrigin) registerPopupRedirectGuard(childTabId, openerTabId, allowedOrigin, 'form');
  const candidate = await getChildCandidateUrl(childTabId);
  const candidateOrigin = urlOrigin(candidate);

  if (!allowedOrigin && candidateOrigin) {
    allowedOrigin = consumeAllowedFormIntent(openerTabId, candidateOrigin, true);
    if (allowedOrigin) registerPopupRedirectGuard(childTabId, openerTabId, allowedOrigin, 'form');
  }
  if (!allowedOrigin) return false;

  if (!shouldPreserveFormNavigation(allowedOrigin, candidate)) {
    clearPopupRedirectGuard(childTabId);
    await browser.tabs.remove(childTabId).catch(() => {});
    return true;
  }
  return false;
}

async function closeQuarantinedChild(openerTabId, childTabId, initialUrl = '') {
  try {
    const openerUrl = await getOpenerUrl(openerTabId);
    const initialText = String(initialUrl || '').trim();
    const popupAllowedOrigin = allowedPopupOriginFor(
      initialText && initialText !== 'about:blank' ? initialText : '',
      (!initialText || initialText === 'about:blank') ? openerUrl : '',
    );

    // Register a provisional guard before waiting for the candidate URL so a
    // fast HTTP redirect cannot race ahead of background validation.
    if (popupAllowedOrigin) registerPopupRedirectGuard(childTabId, openerTabId, popupAllowedOrigin, 'popup');
    let provisionalFormOrigin = '';
    if (!popupAllowedOrigin && initialText && initialText !== 'about:blank' && hasAllowedFormIntent(openerTabId, initialText)) {
      provisionalFormOrigin = consumeAllowedFormIntent(openerTabId, initialText);
      if (provisionalFormOrigin) registerPopupRedirectGuard(childTabId, openerTabId, provisionalFormOrigin, 'form');
    }

    const candidate = await getChildCandidateUrl(childTabId);
    const candidateOrigin = urlOrigin(candidate);

    // A user-trusted form submission is a distinct ALLOW type. Preserve it only
    // when the signed MAIN->ISOLATED bridge observed a real trusted submit event
    // for an origin that still has form|origin ALLOW. This prevents a popup from
    // borrowing a form rule while avoiding quarantine false positives.
    if (!popupAllowedOrigin) {
      const formAllowedOrigin = provisionalFormOrigin || (candidateOrigin
        ? consumeAllowedFormIntent(openerTabId, candidateOrigin, true)
        : '');
      if (formAllowedOrigin) {
        registerPopupRedirectGuard(childTabId, openerTabId, formAllowedOrigin, 'form');
        if (shouldPreserveFormNavigation(formAllowedOrigin, candidate)) return false;
        clearPopupRedirectGuard(childTabId);
        await browser.tabs.remove(childTabId).catch(() => {});
        return true;
      }
    }

    if (shouldPreservePopupNavigation(initialUrl, candidate, openerUrl)) {
      const candidateAllowedOrigin = allowedPopupOriginFor(candidate);
      const guardOrigin = popupAllowedOrigin || candidateAllowedOrigin;
      if (guardOrigin) registerPopupRedirectGuard(childTabId, openerTabId, guardOrigin, 'popup');
      return false;
    }

    await browser.tabs.remove(childTabId).catch(() => {});
    clearPopupRedirectGuard(childTabId);
    return true;
  } catch (_) {
    return false;
  }
}

const childValidationInFlight = new Set();

function isWindowActive(map, tabId, now = Date.now()) {
  const until = map.get(tabId) || 0;
  if (!until) return false;
  if (now <= until) return true;
  map.delete(tabId);
  return false;
}

function handleCreatedChildTab(openerTabId, childTabId, initialUrl = '') {
  if (!Number.isInteger(openerTabId) || !Number.isInteger(childTabId)) return;
  if (!defaultsReady) {
    ensureDefaultsReady()
      .then(() => handleCreatedChildTab(openerTabId, childTabId, initialUrl))
      .catch(() => {});
    return;
  }
  rememberRecentChildTab(openerTabId, childTabId, initialUrl);

  const now = Date.now();
  const quarantineActive = isWindowActive(overlayPopunderQuarantine, openerTabId, now);
  const initialOrigin = urlOrigin(initialUrl);
  const initialOriginAllowed = isPopupAllowedOrigin(initialOrigin);
  const formIntentActive = !!(initialOrigin && hasAllowedFormIntent(openerTabId, initialOrigin));
  const blankFirst = !String(initialUrl || '').trim() || String(initialUrl || '').trim() === 'about:blank';
  if (!quarantineActive && !initialOriginAllowed && !formIntentActive && !blankFirst) return;
  if (initialOriginAllowed) registerPopupRedirectGuard(childTabId, openerTabId, initialOrigin, 'popup');

  // tabs.onCreated often reports a blank URL before webNavigation reports the
  // real target. Do not let that blank notification monopolize the per-child
  // validation slot, otherwise the later concrete target could miss its guard.
  if (!quarantineActive && blankFirst && !initialOriginAllowed) {
    validateAllowedPopupChild(openerTabId, childTabId, initialUrl).catch(() => {});
    return;
  }

  // Both tabs.onCreated and webNavigation.onCreatedNavigationTarget may report
  // the same concrete child. Validate it only once. Allowed popup origins are
  // guarded for cross-origin redirects so popup|origin never becomes redirect|*.
  const key = `${openerTabId}:${childTabId}`;
  if (childValidationInFlight.has(key)) return;
  childValidationInFlight.add(key);
  const task = quarantineActive
    ? closeQuarantinedChild(openerTabId, childTabId, initialUrl)
    : (formIntentActive
      ? validateAllowedFormChild(openerTabId, childTabId, initialUrl)
      : validateAllowedPopupChild(openerTabId, childTabId, initialUrl));
  Promise.resolve(task)
    .catch(() => {})
    .finally(() => childValidationInFlight.delete(key));
}

function enqueueTab(tabId, task) {
  const previous = tabQueues.get(tabId) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  tabQueues.set(tabId, next);
  return next.finally(() => {
    if (tabQueues.get(tabId) === next) tabQueues.delete(tabId);
  });
}

function enqueueFrame(key, task) {
  const previous = frameQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  frameQueues.set(key, next);
  return next.finally(() => {
    if (frameQueues.get(key) === next) frameQueues.delete(key);
  });
}

function base64ToBytes(value) {
  const raw = atob(String(value || ''));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  let raw = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) raw += String.fromCharCode(view[i]);
  return btoa(raw);
}

async function getAesKey(secret) {
  if (aesKeyCache.has(secret)) return aesKeyCache.get(secret);
  const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(secret));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt']);
  aesKeyCache.set(secret, key);
  return key;
}

async function ensureDefaults() {
  const raw = await browser.storage.local.get([
    STORAGE_KEYS.enabledSites,
    STORAGE_KEYS.allowRules,
    STORAGE_KEYS.settings,
  ]);

  const config = await S.getConfig();
  const patch = {};

  if (JSON.stringify(raw[STORAGE_KEYS.enabledSites]) !== JSON.stringify(config.enabledSites)) {
    patch[STORAGE_KEYS.enabledSites] = config.enabledSites.length
      ? config.enabledSites
      : (Array.isArray(raw[STORAGE_KEYS.enabledSites]) ? config.enabledSites : [...DEFAULT_ENABLED_SITES]);
  }
  if (JSON.stringify(raw[STORAGE_KEYS.allowRules]) !== JSON.stringify(config.allowRules)) {
    patch[STORAGE_KEYS.allowRules] = config.allowRules;
  }
  if (JSON.stringify(raw[STORAGE_KEYS.settings]) !== JSON.stringify(config.settings)) {
    patch[STORAGE_KEYS.settings] = { ...DEFAULT_SETTINGS, ...config.settings };
  }

  if (Object.keys(patch).length) await browser.storage.local.set(patch);
  allowRulesCache = new Set(config.allowRules);
}

function ensureDefaultsReady() {
  if (!defaultsReadyPromise) {
    defaultsReadyPromise = ensureDefaults()
      .then(() => { defaultsReady = true; })
      .catch((error) => {
        defaultsReady = false;
        defaultsReadyPromise = null;
        throw error;
      });
  }
  return defaultsReadyPromise;
}

async function getTabState(tabId) {
  if (tabStateCache.has(tabId)) return tabStateCache.get(tabId);
  const key = tabStateStorageKey(tabId);
  const data = await browser.storage.session.get(key);
  const state = data[key] || { items: {}, page: null, updatedAt: Date.now() };
  tabStateCache.set(tabId, state);
  return state;
}

function scheduleTabFlush(tabId) {
  if (tabFlushTimers.has(tabId)) return;
  const timer = setTimeout(async () => {
    tabFlushTimers.delete(tabId);
    const state = tabStateCache.get(tabId);
    if (!state) return;
    try {
      await browser.storage.session.set({ [tabStateStorageKey(tabId)]: state });
    } catch (_) {}
  }, TAB_FLUSH_DELAY_MS);
  tabFlushTimers.set(tabId, timer);
}


async function clearTabState(tabId) {
  const timer = tabFlushTimers.get(tabId);
  if (timer) clearTimeout(timer);
  tabFlushTimers.delete(tabId);
  tabStateCache.delete(tabId);
  await browser.storage.session.remove(tabStateStorageKey(tabId));
  try { await browser.action.setBadgeText({ tabId, text: '' }); } catch (_) {}
}

function sanitizeBlockedItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = String(item.type || '');
  if (!S.ALLOWED_RULE_TYPES.includes(type)) return null;
  const origin = S.normalizeHttpOrigin(item.origin);
  if (!origin) return null;

  let lastUrl = origin;
  try {
    const parsed = new URL(String(item.url || origin));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      lastUrl = `${parsed.origin}${parsed.pathname || '/'}`.slice(0, 2048);
    }
  } catch (_) {}

  const rawClassification = String(item.classification || '').slice(0, 96);
  const classification = /^(?:ad|player|unknown|fullscreen-overlay|dontfoid(?:-aclib)?)(?::[a-z0-9-]+)?$/i.test(rawClassification)
    ? rawClassification
    : null;
  const score = Number(item.classificationScore);

  return {
    type,
    origin,
    host: S.displayHost(origin).slice(0, 255),
    lastUrl,
    classification,
    classificationScore: Number.isFinite(score) ? Math.max(-100, Math.min(100, score)) : null,
    at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now(),
  };
}

async function updateBadge(tabId, state = null) {
  try {
    const current = state || await getTabState(tabId);
    const visible = Object.values(current.items || {}).filter(
      (item) => !allowRulesCache.has(ruleKey(item.type, item.origin)),
    );
    const count = visible.length;
    await browser.action.setBadgeText({ tabId, text: count ? String(Math.min(count, 99)) : '' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' });
  } catch (_) {}
}

async function recordBlocked(sender, rawItem) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) return;
  const item = sanitizeBlockedItem(rawItem);
  if (!item) return;

  if (item.type === 'click-overlay' && /:capture-/i.test(String(item.classification || ''))) {
    // First activation of a detected overlay. Later activations are handled by the
    // dedicated signed ADS_OVERLAY_ACTIVATION heartbeat without inflating BLOCK
    // counters on every normal page click.
    armOverlayPopunderQuarantine(tabId);
  }

  await enqueueTab(tabId, async () => {
    const frameId = Number.isInteger(sender.frameId) ? sender.frameId : 0;
    const state = await getTabState(tabId);
    const key = ruleKey(item.type, item.origin);
    const previous = state.items[key];
    const frameIds = new Set(previous?.frameIds || []);
    frameIds.add(frameId);

    state.items[key] = {
      key,
      type: item.type,
      origin: item.origin,
      host: item.host,
      count: Math.min((previous?.count || 0) + 1, 1_000_000),
      lastUrl: item.lastUrl,
      lastBlockedAt: item.at,
      classification: item.classification || previous?.classification || null,
      classificationScore: item.classificationScore ?? previous?.classificationScore ?? null,
      frameIds: Array.from(frameIds).slice(0, 64),
    };

    const entries = Object.values(state.items);
    if (entries.length > MAX_BLOCK_ITEMS) {
      entries.sort((a, b) => (b.lastBlockedAt || 0) - (a.lastBlockedAt || 0));
      state.items = Object.fromEntries(entries.slice(0, MAX_BLOCK_ITEMS).map((entry) => [entry.key, entry]));
    }

    state.updatedAt = Date.now();
    tabStateCache.set(tabId, state);
    scheduleTabFlush(tabId);
    await updateBadge(tabId, state);
  });
}

async function getFrameRecords(tabId = null) {
  const all = await browser.storage.session.get(null);
  const out = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(FRAME_PREFIX) || !value || typeof value !== 'object') continue;
    if (tabId != null && value.tabId !== tabId) continue;
    out.push({ storageKey: key, ...value });
  }
  return out;
}

async function removeFrameRecordsForTab(tabId) {
  const records = await getFrameRecords(tabId);
  if (records.length) await browser.storage.session.remove(records.map((r) => r.storageKey));
}

async function removeOlderFrameRecordsForTab(tabId, createdAt, keepStorageKey) {
  const records = await getFrameRecords(tabId);
  const stale = records
    .filter((record) => record.storageKey !== keepStorageKey && Number(record.createdAt || 0) < Number(createdAt || 0))
    .map((record) => record.storageKey);
  if (stale.length) await browser.storage.session.remove(stale);
}

async function removeSupersededFrameRecords(tabId, frameId, documentId, keepStorageKey) {
  const records = await getFrameRecords(tabId);
  const stale = records
    .filter((record) =>
      record.storageKey !== keepStorageKey
      && Number(record.frameId) === Number(frameId)
      && String(record.documentId || '') !== String(documentId || ''))
    .map((record) => record.storageKey);
  if (stale.length) await browser.storage.session.remove(stale);
}

function dispatchEncryptedControl(eventName, detail) {
  document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

async function executeControl(record, command) {
  return enqueueFrame(record.storageKey || frameStorageKey(record.tabId, record.documentId, record.frameId), async () => {
    const storageKey = record.storageKey || frameStorageKey(record.tabId, record.documentId, record.frameId);
    const currentData = await browser.storage.session.get(storageKey);
    const current = currentData[storageKey];
    if (!current || !current.started || !current.secret || !current.channelId) return false;

    const seq = Number(current.controlSeq || 0) + 1;
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const key = await getAesKey(current.secret);
    const plaintext = new TextEncoder().encode(JSON.stringify(command || {}));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(String(seq)),
        tagLength: 128,
      },
      key,
      plaintext,
    );

    const detail = JSON.stringify({
      seq,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
    });
    const eventName = `__dblocker_control_${current.channelId}`;
    const target = current.documentId
      ? { tabId: current.tabId, documentIds: [current.documentId] }
      : { tabId: current.tabId, frameIds: [current.frameId] };

    // Persist the monotonic sequence before dispatch. If the worker is terminated
    // after this write, a later command may skip a number but will never replay it.
    current.controlSeq = seq;
    current.lastControlAt = Date.now();
    await browser.storage.session.set({ [storageKey]: current });

    try {
      await browser.scripting.executeScript({
        target,
        world: 'MAIN',
        injectImmediately: true,
        func: dispatchEncryptedControl,
        args: [eventName, detail],
      });
    } catch (_) {
      return false;
    }
    return true;
  });
}

function normalizePolicyContext(context, sender = null) {
  const hostname = String(context?.hostname || '').slice(0, 255).toLowerCase();
  const topFrame = (Number.isInteger(sender?.frameId) ? sender.frameId === 0 : false) || context?.topFrame === true;
  const ancestorHostnames = Array.isArray(context?.ancestorHostnames)
    ? context.ancestorHostnames
      .map((host) => String(host || '').slice(0, 255).toLowerCase())
      .filter(Boolean)
      .slice(0, 16)
    : [];
  return { hostname, topFrame, ancestorHostnames };
}

function hostnameFromNavigationUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return String(parsed.hostname || '').slice(0, 255).toLowerCase();
  } catch (_) {
    return '';
  }
}

async function getPrivilegedAncestorHostnames(sender) {
  const tabId = sender?.tab?.id;
  const frameId = Number.isInteger(sender?.frameId) ? sender.frameId : 0;
  const documentId = String(sender?.documentId || '');
  if (!Number.isInteger(tabId) || frameId === 0 || !browser.webNavigation?.getFrame) return [];

  let current = null;
  try {
    current = documentId
      ? await browser.webNavigation.getFrame({ documentId })
      : await browser.webNavigation.getFrame({ tabId, frameId });
  } catch (_) {
    current = null;
  }
  if (!current) return [];

  const hosts = [];
  const seen = new Set();
  for (let depth = 0; depth < 16 && current; depth += 1) {
    const parentDocumentId = String(current.parentDocumentId || '');
    const parentFrameId = Number.isInteger(current.parentFrameId) ? current.parentFrameId : -1;
    if (!parentDocumentId && parentFrameId < 0) break;

    const key = parentDocumentId || `${tabId}:${parentFrameId}`;
    if (seen.has(key)) break;
    seen.add(key);

    let parent = null;
    try {
      parent = parentDocumentId
        ? await browser.webNavigation.getFrame({ documentId: parentDocumentId })
        : await browser.webNavigation.getFrame({ tabId, frameId: parentFrameId });
    } catch (_) {
      parent = null;
    }
    if (!parent) break;

    const hostname = hostnameFromNavigationUrl(parent.url);
    if (hostname && !hosts.includes(hostname)) hosts.push(hostname);
    current = parent;
  }
  return hosts;
}

async function evaluateFramePolicy(sender, context) {
  const normalized = normalizePolicyContext(context, sender);
  if (!normalized.topFrame) {
    const privilegedAncestors = await getPrivilegedAncestorHostnames(sender).catch(() => []);
    if (privilegedAncestors.length) normalized.ancestorHostnames = privilegedAncestors;
  }
  const stored = await browser.storage.local.get(STORAGE_KEYS.enabledSites);
  const enabledSites = S.sanitizeArray(
    stored[STORAGE_KEYS.enabledSites] ?? DEFAULT_ENABLED_SITES,
    S.normalizeSiteKeyInput,
    S.MAX_ENABLED_SITES,
  );
  const protectionEnabled = S.isProtectedBrowsingContext(
    enabledSites,
    normalized.hostname,
    normalized.ancestorHostnames,
    normalized.topFrame,
  );
  return { protectionEnabled, context: normalized };
}

function minimizePageUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.origin}${parsed.pathname || '/'}`.slice(0, 2048);
  } catch (_) {
    return '';
  }
}

async function prepareFrame(sender, page) {
  const tabId = sender.tab?.id;
  const frameId = Number.isInteger(sender.frameId) ? sender.frameId : 0;
  const documentId = String(sender.documentId || '');
  if (!Number.isInteger(tabId) || typeof MAIN_ENGINE !== 'function') {
    return { ok: false, error: 'Missing tab or MAIN engine' };
  }

  // Re-check policy at the privileged boundary to close the small race between
  // controller preflight and MAIN-world injection. Unprotected contexts never
  // receive a channel/secret and never create a frame/session record.
  const policy = await evaluateFramePolicy(sender, page);
  if (!policy.protectionEnabled) return { ok: false, dormant: true };

  const storageKey = frameStorageKey(tabId, documentId, frameId);
  // A browser frameId can be reused by a later document in the same long-lived
  // tab. Remove superseded records eagerly so SPA/player iframe churn does not
  // accumulate stale secrets/config in storage.session.
  await removeSupersededFrameRecords(tabId, frameId, documentId, storageKey);
  const existingData = await browser.storage.session.get(storageKey);
  const existing = existingData[storageKey];

  // Bootstrap is idempotent per document. If a START response was lost and the
  // controller retries, reuse the same secret/channel instead of injecting a
  // second MAIN engine and wrapping browser APIs twice.
  if (existing?.channelId && existing?.secret && existing?.tabId === tabId) {
    return {
      ok: true,
      channelId: existing.channelId,
      secret: existing.secret,
      started: existing.started === true,
    };
  }

  const hostname = policy.context.hostname;
  const channelId = randomHex(16);
  const secret = randomBytesBase64(32);
  const record = {
    tabId,
    frameId,
    documentId,
    channelId,
    secret,
    controlSeq: 0,
    page: {
      url: minimizePageUrl(page?.url || sender.tab?.url || ''),
      hostname,
      siteKey: S.getSiteKey(hostname),
      topFrame: policy.context.topFrame,
      ancestorHostnames: policy.context.ancestorHostnames,
    },
    started: false,
    createdAt: Date.now(),
  };
  await browser.storage.session.set({ [storageKey]: record });
  return { ok: true, channelId, secret, started: false };
}

function buildFrameConfig(record, globalConfig) {
  const enabledSites = globalConfig.enabledSites || [];
  return {
    protectionEnabled: S.isProtectedBrowsingContext(
      enabledSites,
      record.page?.hostname || '',
      record.page?.ancestorHostnames || [],
      record.page?.topFrame === true,
    ),
    allowRules: globalConfig.allowRules || [],
    settings: globalConfig.settings || { ...DEFAULT_SETTINGS },
  };
}

async function startPreparedFrame(sender, channelId) {
  const tabId = sender.tab?.id;
  const frameId = Number.isInteger(sender.frameId) ? sender.frameId : 0;
  const documentId = String(sender.documentId || '');
  if (!Number.isInteger(tabId)) return { ok: false, error: 'Missing tab' };

  const storageKey = frameStorageKey(tabId, documentId, frameId);
  const data = await browser.storage.session.get(storageKey);
  const record = data[storageKey];
  if (!record || record.channelId !== String(channelId || '')) {
    return { ok: false, error: 'Bootstrap record mismatch' };
  }

  // A controller retry must not inject/wrap the MAIN engine twice.
  if (record.started) return { ok: true, alreadyStarted: true };

  const globalConfig = await S.getConfig();
  allowRulesCache = new Set(globalConfig.allowRules);
  const config = buildFrameConfig(record, globalConfig);
  const bootstrap = { channelId: record.channelId, secret: record.secret, config };
  const target = documentId
    ? { tabId, documentIds: [documentId] }
    : { tabId, frameIds: [frameId] };

  // Establish the new top-document boundary BEFORE injecting MAIN. The engine
  // can synchronously discover existing iframes and emit telemetry as soon as it
  // starts; resetting state afterwards would race and erase those new events.
  if (record.page?.topFrame) {
    await enqueueTab(tabId, async () => {
      const state = await getTabState(tabId);
      const previousDocumentId = String(state.page?.documentId || '');
      if (previousDocumentId !== documentId) state.items = {};
      state.page = {
        url: record.page.url,
        hostname: record.page.hostname,
        siteKey: record.page.siteKey,
        documentId,
      };
      state.updatedAt = Date.now();
      tabStateCache.set(tabId, state);
      scheduleTabFlush(tabId);
      await updateBadge(tabId, state);
    });

    // Best-effort session cleanup: records created before this top document are
    // stale. New child-frame records are created after the top prepare timestamp
    // and are therefore preserved.
    await removeOlderFrameRecordsForTab(tabId, record.createdAt, storageKey).catch(() => {});
  }

  try {
    await browser.scripting.executeScript({
      target,
      world: 'MAIN',
      injectImmediately: true,
      func: MAIN_ENGINE,
      args: [bootstrap],
    });
  } catch (error) {
    await browser.storage.session.remove(storageKey);
    return { ok: false, error: String(error?.message || error) };
  }

  record.started = true;
  record.startedAt = Date.now();
  await browser.storage.session.set({ [storageKey]: record });
  return { ok: true };
}

async function refreshAllFramesConfig() {
  const globalConfig = await S.getConfig();
  const records = (await getFrameRecords()).filter((record) => record.started);
  const staleKeys = [];

  await Promise.all(records.map(async (record) => {
    try {
      const config = buildFrameConfig(record, globalConfig);
      const ok = await executeControl(record, { type: 'applyConfig', config });
      if (!ok) staleKeys.push(record.storageKey);
    } catch (_) {
      staleKeys.push(record.storageKey);
    }
  }));

  if (staleKeys.length) await browser.storage.session.remove(staleKeys);
}

async function forwardAllowOnce(tabId, origin) {
  const normalizedOrigin = S.normalizeHttpOrigin(origin);
  if (!Number.isInteger(tabId) || !normalizedOrigin) return [];

  const state = await getTabState(tabId);
  const item = state.items[ruleKey('iframe', normalizedOrigin)];
  const wantedFrameIds = new Set(item?.frameIds?.length ? item.frameIds : [0]);
  const records = (await getFrameRecords(tabId)).filter((r) => r.started && wantedFrameIds.has(r.frameId));
  const results = [];

  for (const record of records) {
    try {
      const ok = await executeControl(record, { type: 'allowOnce', origin: normalizedOrigin });
      results.push({ frameId: record.frameId, ok });
    } catch (error) {
      results.push({ frameId: record.frameId, ok: false, error: String(error?.message || error) });
    }
  }
  return results;
}

browser.runtime.onInstalled.addListener(() => ensureDefaultsReady().catch(console.error));
browser.runtime.onStartup.addListener(() => ensureDefaultsReady().catch(console.error));
ensureDefaultsReady().catch(() => {});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  (async () => {
    if (message.type === 'ADS_FRAME_POLICY_CHECK') {
      const policy = await evaluateFramePolicy(sender, message.context || {});
      return { ok: true, protectionEnabled: policy.protectionEnabled };
    }

    if (message.type === 'ADS_FRAME_PREPARE') {
      return prepareFrame(sender, message.page || {});
    }

    if (message.type === 'ADS_FRAME_START') {
      return startPreparedFrame(sender, message.channelId);
    }

    if (message.type === 'ADS_BLOCK_EVENT') {
      await recordBlocked(sender, message.item);
      return { ok: true };
    }

    if (message.type === 'ADS_OVERLAY_ACTIVATION') {
      const tabId = sender.tab?.id;
      if (!Number.isInteger(tabId)) return { ok: false };
      const activation = message.activation;
      const origin = S.normalizeHttpOrigin(activation?.origin);
      const eventType = String(activation?.eventType || '');
      if (!origin || !/^(?:pointerdown|mousedown|touchstart|pointerup|mouseup|touchend|click|auxclick|contextmenu)$/.test(eventType)) {
        return { ok: false };
      }
      armOverlayPopunderQuarantine(tabId);
      return { ok: true };
    }

    if (message.type === 'ADS_ALLOWED_NEW_CONTEXT') {
      const tabId = sender.tab?.id;
      const intent = message.intent;
      const kind = String(intent?.kind || '');
      const origin = S.normalizeHttpOrigin(intent?.origin);
      const at = Number(intent?.at);
      if (!Number.isInteger(tabId) || kind !== 'form' || !origin || !Number.isFinite(at)) return { ok: false };
      return { ok: rememberAllowedFormIntent(tabId, origin, at) };
    }


    if (message.type === 'ADS_GET_TAB_STATE') {
      const tabId = Number(message.tabId);
      return Number.isInteger(tabId)
        ? { ok: true, state: await getTabState(tabId) }
        : { ok: false, state: null };
    }

    if (message.type === 'ADS_CLEAR_TAB_STATE') {
      const tabId = Number(message.tabId);
      if (!Number.isInteger(tabId)) return { ok: false };
      await enqueueTab(tabId, () => clearTabState(tabId));
      return { ok: true };
    }

    if (message.type === 'ADS_ALLOW_ONCE') {
      const tabId = Number(message.tabId);
      const origin = S.normalizeHttpOrigin(message.origin);
      if (!Number.isInteger(tabId) || !origin) return { ok: false };
      return { ok: true, results: await forwardAllowOnce(tabId, origin) };
    }

    if (message.type === 'ADS_OPEN_POPUP') {
      const tabId = sender.tab?.id;
      if (Number.isInteger(tabId) && message.focus?.origin && message.focus?.type) {
        const focusOrigin = S.normalizeHttpOrigin(message.focus.origin);
        const focusType = S.ALLOWED_RULE_TYPES.includes(String(message.focus.type)) ? String(message.focus.type) : '';
        if (focusOrigin && focusType) {
          await browser.storage.session.set({
            [`dblocker_popup_focus_${tabId}`]: { type: focusType, origin: focusOrigin, at: Date.now() },
          });
        }
      }
      try {
        const platform = await browser.runtime.getPlatformInfo();
        if (platform.os === 'android') {
          if (!Number.isInteger(tabId)) return { ok: false };
          await browser.tabs.create({
            url: browser.runtime.getURL('popup/popup.html') + '?tabId=' + tabId,
          });
          return { ok: true };
        }
        await browser.action.openPopup({ windowId: sender.tab?.windowId });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    }

    if (message.type === 'ADS_GET_PENDING_FOCUS') {
      const tabId = Number(message.tabId);
      if (!Number.isInteger(tabId)) return { ok: false, focus: null };
      const key = `dblocker_popup_focus_${tabId}`;
      const data = await browser.storage.session.get(key);
      await browser.storage.session.remove(key);
      return { ok: true, focus: data[key] || null };
    }

    return { ok: false, error: 'Unknown message' };
  })().then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: String(error?.message || error) });
  });

  return true;
});

// Browser-level new-navigation-target fallback. Unlike tabs.onCreated(openerTabId),
// webNavigation provides sourceTabId/sourceFrameId for navigations that create a
// new tab/window, which makes the overlay quarantine resilient to noopener-style
// popunders and other cases where openerTabId is absent or unreliable.
if (browser.webNavigation?.onCreatedNavigationTarget) {
  browser.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    const sourceTabId = details?.sourceTabId;
    const newTabId = details?.tabId;
    if (!Number.isInteger(sourceTabId) || !Number.isInteger(newTabId)) return;
    handleCreatedChildTab(sourceTabId, newTabId, details?.url || '');
  });
}

async function handleGuardedCommittedNavigation(details) {
  const tabId = details?.tabId;
  const frameId = details?.frameId;
  if (!Number.isInteger(tabId) || frameId !== 0) return false;
  const guard = await getPopupRedirectGuard(tabId);
  if (!guard) return false;

  const origin = urlOrigin(details?.url || '');
  if (!origin) return false;

  const sourceAllowsOrigin = guard.sourceType === 'form'
    ? origin === guard.allowedOrigin
    : (origin === guard.allowedOrigin || isPopupAllowedOrigin(origin));
  if (sourceAllowsOrigin || isRedirectAllowedOrigin(origin)) {
    // Follow an explicitly allowed chain and keep guarding later redirects for
    // the lifetime of the child tab. This closes delayed (7s+) client redirects
    // without blocking a later deliberate user navigation.
    guard.allowedOrigin = origin;
    updatePopupRedirectGuard(tabId, guard);
    return false;
  }

  const qualifiers = Array.isArray(details?.transitionQualifiers) ? details.transitionQualifiers : [];
  const redirectLike = qualifiers.includes('server_redirect') || qualifiers.includes('client_redirect');
  if (!redirectLike) {
    // A cross-origin committed navigation with no redirect qualifier is treated
    // as a deliberate navigation inside the child. Stop carrying the original
    // popup/form guard into unrelated browsing.
    clearPopupRedirectGuard(tabId);
    return false;
  }

  clearPopupRedirectGuard(tabId);
  await browser.tabs.remove(tabId).catch(() => {});
  return true;
}

browser.webNavigation?.onCommitted?.addListener((details) => {
  handleGuardedCommittedNavigation(details).catch(() => {});
});

browser.tabs.onCreated.addListener((tab) => {
  const newTabId = tab?.id;
  const openerTabId = tab?.openerTabId;
  if (!Number.isInteger(newTabId) || !Number.isInteger(openerTabId)) return;
  handleCreatedChildTab(openerTabId, newTabId, tab?.pendingUrl || tab?.url || '');
});

browser.tabs.onRemoved.addListener((tabId) => {
  overlayPopunderQuarantine.delete(tabId);
  clearPopupRedirectGuard(tabId);
  recentChildTabsByOpener.delete(tabId);
  allowedFormNewContextIntents.delete(tabId);
  for (const [openerTabId, entries] of recentChildTabsByOpener) {
    const next = entries.filter((entry) => entry.tabId !== tabId);
    if (next.length) recentChildTabsByOpener.set(openerTabId, next);
    else recentChildTabsByOpener.delete(openerTabId);
  }
  enqueueTab(tabId, () => clearTabState(tabId)).catch(() => {});
  removeFrameRecordsForTab(tabId).catch(() => {});
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (
    !changes[STORAGE_KEYS.enabledSites] &&
    !changes[STORAGE_KEYS.allowRules] &&
    !changes[STORAGE_KEYS.settings]
  ) return;

  S.getConfig().then((config) => {
    allowRulesCache = new Set(config.allowRules);
    return Promise.all([
      refreshAllFramesConfig(),
      browser.tabs.query({}).then((tabs) => Promise.all(
        tabs.filter((tab) => Number.isInteger(tab.id)).map((tab) => updateBadge(tab.id).catch(() => {})),
      )),
    ]);
  }).catch(() => {});
});
