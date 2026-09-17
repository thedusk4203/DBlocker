globalThis.DBlockerMainEngine = function DBlockerMainEngine(bootstrap) {
  'use strict';

  const currentOrigin = location.origin;
  const isTopFrame = (() => {
    try { return top === window; } catch (_) { return false; }
  })();

  let allowRules = [];
  let allowRuleSet = new Set();
  let settings = { smartPlayerMode: 'compatible', showPageToasts: true, language: 'vi' };
  let protectionEnabled = false;

  const ENGINE_I18N = Object.freeze({
    vi: Object.freeze({
      player_title: '🛡️ DBlocker: Video Player',
      unknown_title: '🛡️ DBlocker: Iframe chưa rõ',
      player_desc: 'Tạm giữ để ngăn popup. Mở Cài đặt và chọn Luôn cho phép để tải lại trang và phát video.',
      unknown_desc: 'Iframe nguồn ngoài chưa xác định. Chọn Tải 1 lần để mở.',
      load_once: 'Tải 1 lần',
      btn_manage: '⚙ Cài đặt',
      toast_hold_player: 'Tạm chặn player: {host}',
      toast_unknown_iframe: 'Iframe cần quyết định: {host}',
      toast_block_ad_iframe: 'Chặn iframe quảng cáo: {host}',
      toast_meta_refresh: 'Chặn meta refresh: {host}',
      toast_tab_under: 'Chặn tab-under cùng origin',
      toast_popup: 'Chặn popup: {host}',
      toast_redirect_tab_under: 'Chặn redirect sau tab-under: {host}',
      toast_redirect_prog: 'Chặn programmatic redirect: {host}',
      toast_js_link: 'Chặn javascript link',
      toast_link_tab_under: 'Chặn link tab-under cùng origin',
      toast_external_link: 'Chặn external link: {host}',
      toast_history_redirect: 'Chặn history redirect: {host}',
      toast_redirect: 'Chặn redirect: {host}',
      toast_form: 'Chặn form: {host}',
      toast_load_once: 'Đã tải 1 lần: {host}',
      toast_click_overlay: 'Đã vô hiệu lớp bắt click quảng cáo đã nhận diện',
    }),
    en: Object.freeze({
      player_title: '🛡️ DBlocker: Video Player',
      unknown_title: '🛡️ DBlocker: Unknown Iframe',
      player_desc: 'Held to prevent popups. Open Settings and choose Always allow; the page will reload to play the video.',
      unknown_desc: 'External iframe source. Click Allow once to open.',
      load_once: 'Allow once',
      btn_manage: '⚙ Settings',
      toast_hold_player: 'Player held: {host}',
      toast_unknown_iframe: 'Iframe pending review: {host}',
      toast_block_ad_iframe: 'Blocked ad iframe: {host}',
      toast_meta_refresh: 'Blocked meta refresh: {host}',
      toast_tab_under: 'Blocked same-origin tab-under',
      toast_popup: 'Blocked popup: {host}',
      toast_redirect_tab_under: 'Blocked redirect after tab-under: {host}',
      toast_redirect_prog: 'Blocked programmatic redirect: {host}',
      toast_js_link: 'Blocked javascript link',
      toast_link_tab_under: 'Blocked same-origin tab-under link',
      toast_external_link: 'Blocked external link: {host}',
      toast_history_redirect: 'Blocked history redirect: {host}',
      toast_redirect: 'Blocked redirect: {host}',
      toast_form: 'Blocked form: {host}',
      toast_load_once: 'Loaded once: {host}',
      toast_click_overlay: 'Blocked known click-capture overlay',
    }),
    zh: Object.freeze({
      player_title: '🛡️ DBlocker: 视频播放器',
      unknown_title: '🛡️ DBlocker: 未知框架',
      player_desc: '暂留以防止弹窗。打开设置并选择“始终允许”，页面将重新加载以播放视频。',
      unknown_desc: '外部未知来源框架。点击“单次允许”以打开。',
      load_once: '单次允许',
      btn_manage: '⚙ 设置',
      toast_hold_player: '已暂留播放器: {host}',
      toast_unknown_iframe: '框架待决定: {host}',
      toast_block_ad_iframe: '已拦截广告框架: {host}',
      toast_meta_refresh: '已拦截 Meta 刷新: {host}',
      toast_tab_under: '已拦截同源后台标签页',
      toast_popup: '已拦截弹窗: {host}',
      toast_redirect_tab_under: '已拦截后台标签页后重定向: {host}',
      toast_redirect_prog: '已拦截程序重定向: {host}',
      toast_js_link: '已拦截 javascript 链接',
      toast_link_tab_under: '已拦截同源后台标签页链接',
      toast_external_link: '已拦截外部链接: {host}',
      toast_history_redirect: '已拦截历史重定向: {host}',
      toast_redirect: '已拦截重定向: {host}',
      toast_form: '已拦截表单提交: {host}',
      toast_load_once: '已单次允许: {host}',
      toast_click_overlay: '已拦截已识别的点击捕获遮罩',
    }),
  });

  function trEngine(key, params = {}) {
    const lang = settings.language || 'vi';
    let text = ENGINE_I18N[lang]?.[key] ?? ENGINE_I18N.en?.[key] ?? key;
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }

  const channelId = typeof bootstrap?.channelId === 'string' ? bootstrap.channelId : '';
  const bridgeSecret = typeof bootstrap?.secret === 'string' ? bootstrap.secret : '';
  const telemetryEventName = channelId ? `__dblocker_telemetry_${channelId}` : '';
  const controlEventName = channelId ? `__dblocker_control_${channelId}` : '';
  let telemetrySeq = 0;
  let lastControlSeq = 0;
  let controlQueue = Promise.resolve();
  let telemetryQueue = Promise.resolve();
  let rawControlWindowStartedAt = 0;
  let rawControlWindowCount = 0;

  function base64ToBytes(value) {
    try {
      const raw = atob(typeof value === 'string' ? value : '');
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    } catch (_) { return new Uint8Array(); }
  }

  function bytesToBase64(bytes) {
    let raw = '';
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) raw += String.fromCharCode(view[i]);
    return btoa(raw);
  }

  const hmacKeyPromise = (async () => {
    if (!bridgeSecret || !crypto?.subtle) return null;
    try {
      return await crypto.subtle.importKey(
        'raw',
        base64ToBytes(bridgeSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
    } catch (_) { return null; }
  })();

  const aesKeyPromise = (async () => {
    if (!bridgeSecret || !crypto?.subtle) return null;
    try {
      const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(bridgeSecret));
      return await crypto.subtle.importKey(
        'raw',
        digest,
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );
    } catch (_) { return null; }
  })();

  function emitTelemetry(type, payload = null) {
    if (!telemetryEventName) return;
    telemetryQueue = telemetryQueue.then(async () => {
      const key = await hmacKeyPromise;
      if (!key) return;
      const seq = ++telemetrySeq;
      const body = JSON.stringify(payload == null ? {} : payload);
      const message = `${seq}\n${String(type || '')}\n${body}`;
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(message),
      );
      const detail = JSON.stringify({
        seq,
        type: String(type || ''),
        body,
        mac: bytesToBase64(signature),
      });
      document.dispatchEvent(new CustomEvent(telemetryEventName, { detail }));
    }).catch(() => {});
  }


  function toURL(url) {
    try { return new URL(url, location.href); } catch (_) { return null; }
  }

  function getOrigin(url, fallback = currentOrigin) {
    const parsed = toURL(url);
    return parsed ? parsed.origin : fallback;
  }

  function displayHost(origin) {
    try { return new URL(origin).hostname || origin; } catch (_) { return String(origin || '(unknown)'); }
  }

  function isSameOrigin(url) {
    const parsed = toURL(url);
    return !!parsed && parsed.origin === currentOrigin;
  }

  function isCrossOrigin(url) {
    const parsed = toURL(url);
    return !!parsed && parsed.origin !== currentOrigin;
  }

  function ruleKey(type, origin) {
    return `${type}|${origin}`;
  }

  function isRuleAllowed(type, urlOrOrigin) {
    const text = String(urlOrOrigin || '');
    const origin = /^https?:\/\//i.test(text) ? getOrigin(text, text) : (text || currentOrigin);
    return allowRuleSet.has(ruleKey(type, origin));
  }

  function isHarmlessJavascriptUrl(url) {
    if (typeof url !== 'string') return false;
    return /^javascript:\s*(?:void\s*\(\s*0\s*\)|;?)\s*;?\s*$/i.test(url.trim());
  }

  function isPassThroughLinkUrl(url) {
    if (url == null) return true;
    const raw = String(url).trim();
    if (!raw || raw === '#') return true;
    if (isHarmlessJavascriptUrl(raw)) return true;
    const parsed = toURL(raw);
    const protocol = parsed ? parsed.protocol.toLowerCase() : '';
    return ['mailto:', 'tel:', 'sms:', 'blob:', 'data:', 'intent:', 'market:', 'magnet:'].includes(protocol);
  }

  function isAllowedSameOriginNavigation(url) {
    try {
      if (url == null || url === '' || url === '#') return true;
      if (typeof url === 'string' && /^javascript:/i.test(url.trim())) return isHarmlessJavascriptUrl(url);
      return new URL(url, location.href).origin === currentOrigin;
    } catch (_) {
      return false;
    }
  }

  const toastCooldown = new Map();
  function showToast(message, type = 'block') {
    if (!settings.showPageToasts || !isTopFrame) return;
    const key = `${type}|${message}`;
    const now = Date.now();
    if (now - (toastCooldown.get(key) || 0) < 3000) return;
    toastCooldown.set(key, now);

    const render = () => {
      if (!document.body) return;
      const toast = document.createElement('div');
      toast.setAttribute('data-dblocker-toast', '1');
      const icon = document.createElement('span');
      icon.textContent = '🛡';
      icon.style.setProperty('flex-shrink', '0');
      icon.style.setProperty('color', type === 'info' ? '#38bdf8' : '#fb7185');
      const text = document.createElement('span');
      text.textContent = String(message || '');
      text.style.setProperty('overflow', 'hidden');
      text.style.setProperty('text-overflow', 'ellipsis');
      text.style.setProperty('white-space', 'nowrap');
      toast.append(icon, text);
      Object.assign(toast.style, {
        position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483646',
        maxWidth: '380px', padding: '9px 14px', borderRadius: '9px',
        background: '#0a101d', color: '#f8fafc',
        border: type === 'info' ? '1px solid rgba(14, 165, 233, 0.35)' : '1px solid rgba(244, 63, 94, 0.35)',
        font: "500 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        boxShadow: '0 8px 24px rgba(0,0,0,.45)', opacity: '0', transform: 'translateY(10px)',
        transition: 'opacity .2s ease, transform .2s ease', pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: '8px',
      });
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 220);
      }, 2500);
    };

    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
  }

  function recordBlocked(type, url, options = {}) {
    const origin = options.origin || getOrigin(url, currentOrigin);
    emitTelemetry('blocked', {
      type,
      origin,
      url: String(url || origin || ''),
      host: displayHost(origin),
      classification: options.classification || null,
      classificationScore: Number.isFinite(options.classificationScore) ? options.classificationScore : null,
      pageOrigin: currentOrigin,
      pageUrl: location.href,
      topFrame: isTopFrame,
      at: Date.now(),
    });
  }

  // =========================================================
  // SMART IFRAME / PLAYER
  // =========================================================

  const PLAYER_SCORE_THRESHOLD = 5;
  const AD_SCORE_THRESHOLD = -3;
  const STRONG_AD_URL_RE = /(?:^|[.\/_?&=-])(?:ads?|advert(?:ising|isement)?|doubleclick|googlesyndication|adservice|adserver|adnxs|taboola|outbrain|popads|popcash|propellerads|clickadu|exoclick|trafficjunky|banner|sponsor(?:ed)?|tracking|tracker)(?:[.\/_?&=-]|$)/i;
  const PLAYER_URL_RE = /(?:^|[\/_?&=.-])(?:embed|player|watch|video|stream|movie|film|episode|play|hls)(?:[\/_?&=.-]|$)/i;
  const PLAYER_CONTEXT_RE = /(?:^|[\s_-])(?:video|player|watch|stream|embed|movie|film)(?:$|[\s_-])/i;
  const AD_CONTEXT_RE = /(?:^|[\s_-])(?:ad|ads|advert|advertisement|banner|sponsor|sponsored|promo)(?:$|[\s_-])/i;

  const iframeLastFingerprint = new WeakMap();
  const blockedIframeState = new WeakMap();
  const blockedIframeInstances = new Map();
  const iframeAllowOnce = new WeakMap();
  let iframeObserver = null;

  function getIframeSrc(iframe) {
    const raw = iframe.getAttribute('src');
    if (!raw || raw === 'about:blank' || raw === 'about:srcdoc') return raw || '';
    try { return new URL(raw, location.href).href; } catch (_) { return raw; }
  }

  function getIframeFingerprint(iframe) {
    const src = getIframeSrc(iframe);
    const srcdoc = iframe.getAttribute('srcdoc') || '';
    return `${src}\n${srcdoc.length}:${srcdoc.slice(0, 128)}`;
  }

  function parseDimension(value) {
    const n = parseFloat(String(value || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function getIframeMetrics(iframe) {
    let rect = { width: 0, height: 0 };
    try { rect = iframe.getBoundingClientRect(); } catch (_) {}
    const attrWidth = parseDimension(iframe.getAttribute('width'));
    const attrHeight = parseDimension(iframe.getAttribute('height'));
    const width = rect.width || attrWidth || parseDimension(iframe.style.width);
    const height = rect.height || attrHeight || parseDimension(iframe.style.height);
    return { width, height, ratio: width > 0 && height > 0 ? width / height : 0 };
  }

  function isNearStandardAdSize(width, height) {
    if (!width || !height) return false;
    const standards = [[300,250],[336,280],[728,90],[970,90],[970,250],[320,50],[320,100],[468,60],[160,600],[300,600],[250,250],[200,200]];
    return standards.some(([w, h]) => Math.abs(width - w) <= 18 && Math.abs(height - h) <= 18);
  }

  function getIframeContextSignal(iframe) {
    let positive = false;
    let negative = false;
    let node = iframe.parentElement;
    let depth = 0;
    while (node && depth < 4) {
      const cls = typeof node.className === 'string' ? node.className : '';
      const signal = `${node.id || ''} ${cls}`.trim();
      if (signal) {
        if (PLAYER_CONTEXT_RE.test(signal)) positive = true;
        if (AD_CONTEXT_RE.test(signal)) negative = true;
      }
      if (node === document.body || node === document.documentElement) break;
      node = node.parentElement;
      depth++;
    }
    return { positive, negative };
  }

  function classifyIframe(iframe, src) {
    let score = 0;
    const reasons = [];
    const urlText = String(src || '');
    const allow = String(iframe.getAttribute('allow') || '').toLowerCase();
    const metrics = getIframeMetrics(iframe);
    const context = getIframeContextSignal(iframe);

    if (STRONG_AD_URL_RE.test(urlText)) { score -= 9; reasons.push('ad-url'); }
    if (PLAYER_URL_RE.test(urlText)) { score += 2; reasons.push('player-url'); }
    if (iframe.hasAttribute('allowfullscreen') || iframe.allowFullscreen) { score += 4; reasons.push('allowfullscreen'); }
    if (allow.includes('fullscreen')) { score += 2; reasons.push('fullscreen'); }
    if (allow.includes('autoplay')) { score += 2; reasons.push('autoplay'); }
    if (allow.includes('picture-in-picture')) { score += 2; reasons.push('pip'); }
    if (allow.includes('encrypted-media')) { score += 1; reasons.push('encrypted-media'); }
    if (metrics.width >= 480) { score += 2; reasons.push('wide'); }
    if (metrics.height >= 240) { score += 2; reasons.push('tall'); }
    if (metrics.ratio >= 1.3 && metrics.ratio <= 2.15) { score += 2; reasons.push('video-ratio'); }
    if (metrics.width > 0 && metrics.height > 0 && metrics.width <= 40 && metrics.height <= 40) { score -= 8; reasons.push('tiny-frame'); }
    else if (metrics.width > 0 && metrics.height > 0 && metrics.width <= 160 && metrics.height <= 100) { score -= 4; reasons.push('small-frame'); }
    if (isNearStandardAdSize(metrics.width, metrics.height)) { score -= 5; reasons.push('ad-size'); }
    if (context.positive) { score += 3; reasons.push('player-context'); }
    if (context.negative) { score -= 5; reasons.push('ad-context'); }

    let kind = 'unknown';
    if (score >= PLAYER_SCORE_THRESHOLD) kind = 'player';
    else if (score <= AD_SCORE_THRESHOLD) kind = 'ad';
    return { kind, score, reasons, metrics };
  }

  function iframeSetKey(origin) { return `iframe|${origin}`; }

  function registerBlockedIframe(origin, iframe) {
    const key = iframeSetKey(origin);
    let set = blockedIframeInstances.get(key);
    if (!set) blockedIframeInstances.set(key, (set = new Set()));
    set.add(iframe);
  }

  function unregisterBlockedIframe(origin, iframe) {
    const key = iframeSetKey(origin);
    const set = blockedIframeInstances.get(key);
    if (!set) return;
    set.delete(iframe);
    if (!set.size) blockedIframeInstances.delete(key);
  }

  function removePlaceholder(state) {
    const host = state?.placeholderHost;
    if (host?.isConnected) {
      try { host.remove(); } catch (_) {}
    }
    if (state) state.placeholderHost = null;
  }

  function clearBlockedIframeState(iframe) {
    const state = blockedIframeState.get(iframe);
    if (!state) return null;
    removePlaceholder(state);
    if (state.prevDisplay) iframe.style.setProperty('display', state.prevDisplay, state.prevDisplayPriority || '');
    else iframe.style.removeProperty('display');
    iframe.removeAttribute('data-adscontrol-blocked');
    iframe.removeAttribute('data-adscontrol-classification');
    blockedIframeState.delete(iframe);
    unregisterBlockedIframe(state.origin, iframe);
    return state;
  }

  function restoreIframe(iframe) {
    if (!iframe?.isConnected) return false;
    const state = clearBlockedIframeState(iframe);
    if (!state) return false;
    iframeLastFingerprint.delete(iframe);
    try {
      if (state.hadSrcdoc) {
        iframe.setAttribute('srcdoc', state.srcdoc);
        if (state.rawSrc) iframe.setAttribute('src', state.rawSrc); else iframe.removeAttribute('src');
      } else {
        iframe.removeAttribute('srcdoc');
        if (state.rawSrc) iframe.setAttribute('src', state.rawSrc); else iframe.removeAttribute('src');
      }
    } catch (_) {}
    return true;
  }

  function restoreBlockedIframesForOrigin(origin) {
    const key = iframeSetKey(origin);
    const set = blockedIframeInstances.get(key);
    if (!set) return;
    for (const iframe of Array.from(set)) restoreIframe(iframe);
    blockedIframeInstances.delete(key);
  }

  function restoreAllBlockedIframes() {
    for (const set of Array.from(blockedIframeInstances.values())) {
      for (const iframe of Array.from(set)) restoreIframe(iframe);
    }
    blockedIframeInstances.clear();
  }

  function allowIframeOnce(iframe, origin) {
    if (!iframe?.isConnected) return;
    iframeAllowOnce.set(iframe, origin);
    restoreIframe(iframe);
    showToast(trEngine('toast_load_once', { host: displayHost(origin) }), 'info');
  }

  function allowBlockedIframesOnce(origin) {
    const set = blockedIframeInstances.get(iframeSetKey(origin));
    if (!set) return;
    for (const iframe of Array.from(set)) {
      if (!iframe?.isConnected) continue;
      iframeAllowOnce.set(iframe, origin);
      restoreIframe(iframe);
    }
  }

  function requestManageIframe(origin) {
    if (!origin) return;
    emitTelemetry('openPopup', { focusType: 'iframe', focusOrigin: origin });
  }

  function makePlayerPlaceholder(iframe, state, classification) {
    if (!iframe?.parentNode || classification.kind === 'ad') return null;
    const host = document.createElement('div');
    host.setAttribute('data-adscontrol-player-placeholder', '1');
    host.style.setProperty('display', 'block', 'important');
    host.style.setProperty('box-sizing', 'border-box', 'important');
    host.style.setProperty('width', '100%', 'important');
    host.style.setProperty('max-width', '100%', 'important');
    host.style.setProperty('position', 'relative', 'important');
    host.style.setProperty('z-index', '1', 'important');

    const { width, height, ratio } = classification.metrics || {};
    if (height >= 140) host.style.setProperty('min-height', `${Math.min(Math.max(Math.round(height), 160), 720)}px`, 'important');
    else if (ratio >= 1.3 && ratio <= 2.15) {
      host.style.setProperty('aspect-ratio', `${ratio}`, 'important');
      host.style.setProperty('min-height', '180px', 'important');
    } else host.style.setProperty('min-height', classification.kind === 'player' ? '220px' : '150px', 'important');
    if (width > 0 && width < 1200) host.style.setProperty('max-width', `${Math.round(width)}px`, 'important');

    let root = host;
    try { root = host.attachShadow({ mode: 'closed' }); } catch (_) {}

    const box = document.createElement('div');
    box.style.cssText = "all:initial;box-sizing:border-box;width:100%;height:100%;min-height:inherit;display:flex;align-items:center;justify-content:center;padding:24px 20px;border:1px solid rgba(0,210,255,0.22);border-radius:14px;background:#0b111e;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
    const card = document.createElement('div');
    card.style.cssText = "all:initial;display:flex;flex-direction:column;align-items:center;gap:9px;max-width:520px;text-align:center;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

    const title = document.createElement('div');
    title.style.cssText = "all:initial;color:#fff;font:700 15px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    title.textContent = classification.kind === 'player' ? trEngine('player_title') : trEngine('unknown_title');

    const domain = document.createElement('div');
    domain.style.cssText = 'all:initial;color:#38bdf8;font:600 12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;background:rgba(14,165,233,0.1);padding:2px 8px;border-radius:5px;border:1px solid rgba(14,165,233,0.2);';
    domain.textContent = displayHost(state.origin);

    const detail = document.createElement('div');
    detail.style.cssText = "all:initial;color:#94a3b8;font:400 11.5px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    detail.textContent = classification.kind === 'player'
      ? trEngine('player_desc')
      : trEngine('unknown_desc');

    const actions = document.createElement('div');
    actions.style.cssText = 'all:initial;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px;';

    let once = null;
    if (classification.kind !== 'player') {
      once = document.createElement('button');
      once.type = 'button';
      once.textContent = '▶ ' + trEngine('load_once');
      once.style.cssText = "all:initial;box-sizing:border-box;padding:8px 14px;border-radius:8px;background:#0284c7;color:white;font:600 11.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;transition:background .15s;";
      once.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        allowIframeOnce(iframe, state.origin);
      });
    }

    const always = document.createElement('button');
    always.type = 'button';
    always.textContent = trEngine('btn_manage');
    always.style.cssText = "all:initial;box-sizing:border-box;padding:8px 14px;border-radius:8px;background:#059669;color:white;font:600 11.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;transition:background .15s;";
    always.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      requestManageIframe(state.origin);
    });

    if (once) actions.appendChild(once);
    actions.appendChild(always);
    card.append(title, domain, detail, actions);
    box.appendChild(card);
    root.appendChild(box);
    try { iframe.parentNode.insertBefore(host, iframe); } catch (_) { return null; }
    return host;
  }

  function blockIframe(iframe, blockedSrc, classification = null, suppressPlaceholder = false) {
    if (!iframe?.isConnected) return;
    const origin = getOrigin(blockedSrc, currentOrigin);
    if (isRuleAllowed('iframe', origin)) {
      if (blockedIframeState.has(iframe)) restoreIframe(iframe);
      return;
    }

    const info = classification || classifyIframe(iframe, blockedSrc);
    const oldState = blockedIframeState.get(iframe);
    if (oldState) removePlaceholder(oldState);

    const state = {
      origin,
      blockedSrc,
      rawSrc: iframe.getAttribute('src') || '',
      hadSrcdoc: iframe.hasAttribute('srcdoc'),
      srcdoc: iframe.getAttribute('srcdoc') || '',
      prevDisplay: oldState ? oldState.prevDisplay : (iframe.style.display || ''),
      prevDisplayPriority: oldState ? oldState.prevDisplayPriority : (iframe.style.getPropertyPriority('display') || ''),
      classification: info.kind,
      classificationScore: info.score,
      placeholderHost: null,
    };

    if (oldState && oldState.origin !== origin) unregisterBlockedIframe(oldState.origin, iframe);
    blockedIframeState.set(iframe, state);
    registerBlockedIframe(origin, iframe);
    iframe.setAttribute('data-adscontrol-blocked', '1');
    iframe.setAttribute('data-adscontrol-classification', info.kind);
    iframe.style.setProperty('display', 'none', 'important');

    try {
      iframe.removeAttribute('srcdoc');
      if (iframe.getAttribute('src') !== 'about:blank') iframe.setAttribute('src', 'about:blank');
    } catch (_) {}

    if (!suppressPlaceholder && info.kind !== 'ad') state.placeholderHost = makePlayerPlaceholder(iframe, state, info);

    recordBlocked('iframe', blockedSrc, {
      origin,
      classification: info.kind,
      classificationScore: info.score,
    });

    if (info.kind === 'player') showToast(trEngine('toast_hold_player', { host: displayHost(origin) }));
    else if (info.kind === 'unknown') showToast(trEngine('toast_unknown_iframe', { host: displayHost(origin) }));
    else showToast(trEngine('toast_block_ad_iframe', { host: displayHost(origin) }));
  }

  function inspectIframe(iframe) {
    if (!protectionEnabled || !iframe || iframe.nodeType !== 1 || iframe.tagName !== 'IFRAME') return;
    const fingerprint = getIframeFingerprint(iframe);
    if (iframeLastFingerprint.get(iframe) === fingerprint) return;
    iframeLastFingerprint.set(iframe, fingerprint);

    const src = getIframeSrc(iframe);
    const blockedState = blockedIframeState.get(iframe);
    if (blockedState && (src === '' || src === 'about:blank' || src === 'about:srcdoc')) return;

    const origin = getOrigin(src, currentOrigin);
    const sameOrigin = !src || src === 'about:blank' || src === 'about:srcdoc' || isSameOrigin(src);
    const allowOnceOrigin = iframeAllowOnce.get(iframe);
    if (allowOnceOrigin && allowOnceOrigin !== origin) iframeAllowOnce.delete(iframe);
    const allowed = sameOrigin || iframeAllowOnce.get(iframe) === origin || isRuleAllowed('iframe', origin);

    if (allowed) {
      if (blockedState) restoreIframe(iframe);
      return;
    }

    const classification = classifyIframe(iframe, src);

    if (settings.smartPlayerMode === 'compatible' && classification.kind === 'player') {
      iframeAllowOnce.set(iframe, origin);
      return;
    }

    if (settings.smartPlayerMode === 'strict') {
      // STRICT blocks every cross-origin iframe without player-specific UI.
      blockIframe(iframe, src, classification, true);
      return;
    }

    // SMART: ads are hard-blocked; likely players/unknown frames get a placeholder.
    blockIframe(iframe, src, classification);
  }

  function inspectIframesInNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'IFRAME') { inspectIframe(node); return; }
    if (typeof node.querySelectorAll === 'function') node.querySelectorAll('iframe').forEach(inspectIframe);
  }

  function cleanupRemovedIframe(iframe) {
    if (!iframe || iframe.isConnected) return;
    const state = blockedIframeState.get(iframe);
    if (state) {
      removePlaceholder(state);
      unregisterBlockedIframe(state.origin, iframe);
      blockedIframeState.delete(iframe);
    }
    iframeAllowOnce.delete(iframe);
    iframeLastFingerprint.delete(iframe);
  }

  function cleanupIframesInRemovedNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'IFRAME') cleanupRemovedIframe(node);
    if (typeof node.querySelectorAll === 'function') node.querySelectorAll('iframe').forEach(cleanupRemovedIframe);
  }

  function rescanIframes() {
    if (!protectionEnabled) return;
    document.querySelectorAll('iframe').forEach((iframe) => {
      iframeLastFingerprint.delete(iframe);
      inspectIframe(iframe);
    });
  }

  function resetIframeSessionState() {
    document.querySelectorAll('iframe').forEach((iframe) => {
      iframeAllowOnce.delete(iframe);
      iframeLastFingerprint.delete(iframe);
    });
  }

  function setupIframeControl() {
    if (!protectionEnabled || iframeObserver) return;
    rescanIframes();
    iframeObserver = new MutationObserver((mutations) => {
      if (!protectionEnabled) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.removedNodes) cleanupIframesInRemovedNode(node);
          for (const node of mutation.addedNodes) inspectIframesInNode(node);
        } else if (mutation.type === 'attributes' && mutation.target?.tagName === 'IFRAME') {
          inspectIframe(mutation.target);
        }
      }
    });
    iframeObserver.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcdoc'],
    });
    document.addEventListener('load', iframeLoadHandler, true);
  }

  function iframeLoadHandler(e) {
    if (e.target?.tagName === 'IFRAME') inspectIframe(e.target);
  }

  function stopIframeControl() {
    if (iframeObserver) { iframeObserver.disconnect(); iframeObserver = null; }
    document.removeEventListener('load', iframeLoadHandler, true);
  }

  // =========================================================
  // META REFRESH
  // =========================================================

  let metaObserver = null;
  const blockedMetaState = new WeakMap();
  const blockedMetaElements = new Set();

  function restoreMetaRefresh(meta) {
    const state = blockedMetaState.get(meta);
    if (!state || !meta?.isConnected) {
      blockedMetaElements.delete(meta);
      if (meta) blockedMetaState.delete(meta);
      return false;
    }

    try {
      if (state.hadHttpEquiv) meta.setAttribute('http-equiv', state.httpEquiv);
      else meta.removeAttribute('http-equiv');
      if (state.hadContent) meta.setAttribute('content', state.content);
      else meta.removeAttribute('content');
      meta.removeAttribute('data-dblocker-meta-refresh');
    } catch (_) {}

    blockedMetaState.delete(meta);
    blockedMetaElements.delete(meta);
    return true;
  }

  function restoreAllBlockedMetaRefreshes() {
    for (const meta of Array.from(blockedMetaElements)) restoreMetaRefresh(meta);
    blockedMetaElements.clear();
  }

  function restoreBlockedMetaRefreshesForOrigin(origin) {
    for (const meta of Array.from(blockedMetaElements)) {
      const state = blockedMetaState.get(meta);
      if (state?.origin === origin) restoreMetaRefresh(meta);
    }
  }

  function neutralizeMetaRefresh(meta, url, origin) {
    const existing = blockedMetaState.get(meta);
    if (!existing) {
      blockedMetaState.set(meta, {
        origin,
        url,
        hadHttpEquiv: meta.hasAttribute('http-equiv'),
        httpEquiv: meta.getAttribute('http-equiv') || 'refresh',
        hadContent: meta.hasAttribute('content'),
        content: meta.getAttribute('content') || '',
      });
      blockedMetaElements.add(meta);
    } else {
      // If the page deliberately rewrites a neutralized meta tag and tries to
      // arm refresh again, remember the latest intended state so Protection OFF
      // restores what the page most recently requested, not stale attributes.
      existing.origin = origin;
      existing.url = url;
      existing.hadHttpEquiv = meta.hasAttribute('http-equiv');
      existing.httpEquiv = meta.getAttribute('http-equiv') || 'refresh';
      existing.hadContent = meta.hasAttribute('content');
      existing.content = meta.getAttribute('content') || '';
    }

    // Keep the node in DOM instead of remove(). Some ad scripts recreate removed
    // nodes in a tight loop. A non-refresh http-equiv value neutralizes the
    // navigation while preserving a reversible DOM state.
    meta.setAttribute('data-dblocker-meta-refresh', '1');
    meta.setAttribute('http-equiv', 'x-dblocker-refresh');
    recordBlocked('meta-refresh', url, { origin });
    showToast(trEngine('toast_meta_refresh', { host: displayHost(origin) }));
  }

  function inspectMetaRefresh(meta) {
    if (!protectionEnabled || !meta || meta.nodeType !== 1 || meta.tagName !== 'META') return;
    if (String(meta.getAttribute('http-equiv') || '').trim().toLowerCase() !== 'refresh') return;
    const content = meta.getAttribute('content');
    if (!content) return;
    const match = content.match(/url\s*=\s*['"]?([^'">\s]+)/i);
    if (!match) return;
    const url = match[1].trim();
    if (!isCrossOrigin(url)) return;
    const origin = getOrigin(url, currentOrigin);
    if (isRuleAllowed('meta-refresh', origin)) return;
    neutralizeMetaRefresh(meta, url, origin);
  }

  function inspectMetaInNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'META') { inspectMetaRefresh(node); return; }
    if (typeof node.querySelectorAll === 'function') node.querySelectorAll('meta[http-equiv]').forEach(inspectMetaRefresh);
  }

  function cleanupRemovedMeta(meta) {
    if (!meta || meta.isConnected) return;
    blockedMetaElements.delete(meta);
    blockedMetaState.delete(meta);
  }

  function cleanupMetaInRemovedNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'META') cleanupRemovedMeta(node);
    if (typeof node.querySelectorAll === 'function') node.querySelectorAll('meta').forEach(cleanupRemovedMeta);
  }

  function rescanMetaRefreshes() {
    if (!protectionEnabled) return;
    for (const meta of Array.from(blockedMetaElements)) {
      if (!meta?.isConnected) {
        blockedMetaElements.delete(meta);
        blockedMetaState.delete(meta);
      }
    }
    document.querySelectorAll('meta[http-equiv]').forEach(inspectMetaRefresh);
  }

  function setupMetaControl() {
    if (!protectionEnabled || metaObserver) return;
    rescanMetaRefreshes();
    metaObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.removedNodes) cleanupMetaInRemovedNode(node);
          for (const node of mutation.addedNodes) inspectMetaInNode(node);
        } else if (mutation.type === 'attributes' && mutation.target?.tagName === 'META') inspectMetaRefresh(mutation.target);
      }
    });
    metaObserver.observe(document.documentElement || document, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['http-equiv', 'content'],
    });
  }

  function stopMetaControl() {
    if (metaObserver) { metaObserver.disconnect(); metaObserver = null; }
  }

  // =========================================================
  // TARGETED CLICK-CAPTURE OVERLAY GUARD
  // =========================================================

  // Compatibility rule: DBlocker no longer classifies arbitrary full-screen,
  // transparent, fixed-position elements as ad overlays. Real video players and
  // fullscreen UIs frequently use exactly those primitives. The overlay guard is
  // therefore restricted to the verified #dontfoid/aclib signature that motivated
  // this protection in the first place.
  const KNOWN_CLICK_OVERLAY_IDS = new Set(['dontfoid']);
  const KNOWN_CLICK_OVERLAY_VENDOR_RE = /(?:^|\.)acscdn\.com$/i;
  const KNOWN_CLICK_OVERLAY_SCRIPT_RE = /\/(?:script\/)?(?:aclib|suv5)\.js(?:[?#]|$)/i;
  const blockedOverlayState = new WeakMap();
  const blockedOverlayElements = new Set();
  let overlayObserver = null;
  let overlayScanTimer = null;
  let overlayAttackPersistent = false;
  let lastOverlayActivationTelemetryAt = 0;
  const OVERLAY_ACTIVATION_TELEMETRY_DEBOUNCE_MS = 320;
  let knownOverlayVendorEvidence = false;
  let lastOverlayVendorScanAt = 0;

  // Known acscdn/aclib capture listeners that register after MAIN-engine startup
  // are wrapped. Listeners that registered before injection are handled by the
  // authenticated per-activation background quarantine once #dontfoid is verified.
  const KNOWN_VENDOR_CAPTURE_TYPES = new Set([
    'pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup',
    'touchend', 'click', 'auxclick', 'contextmenu',
  ]);
  const knownVendorListenerWrappers = new WeakMap();
  let knownVendorListenerGuardInstalled = false;

  function captureOptionEnabled(options) {
    return options === true || !!(options && typeof options === 'object' && options.capture);
  }

  function knownVendorRegistrationEvidence() {
    let currentScriptSrc = '';
    try { currentScriptSrc = String(document.currentScript?.src || ''); } catch (_) {}
    if (currentScriptSrc) {
      const parsed = toURL(currentScriptSrc);
      if (parsed && KNOWN_CLICK_OVERLAY_VENDOR_RE.test(parsed.hostname)
          && KNOWN_CLICK_OVERLAY_SCRIPT_RE.test(`${parsed.pathname}${parsed.search}`)) return true;
    }
    try {
      const stack = String(new Error().stack || '');
      return /acscdn\.com[\s\S]*(?:aclib|suv5)\.js|(?:aclib|suv5)\.js[\s\S]*acscdn\.com/i.test(stack);
    } catch (_) {
      return false;
    }
  }

  function listenerWrapperKey(target, type, capture) {
    return `${target === window ? 'w' : 'd'}|${String(type)}|${capture ? 1 : 0}`;
  }

  function installKnownVendorCaptureListenerGuard() {
    if (knownVendorListenerGuardInstalled) return;
    knownVendorListenerGuardInstalled = true;

    for (const target of [window, document]) {
      let originalAdd;
      let originalRemove;
      try {
        originalAdd = target.addEventListener;
        originalRemove = target.removeEventListener;
      } catch (_) { continue; }
      if (typeof originalAdd !== 'function' || typeof originalRemove !== 'function') continue;

      try {
        target.addEventListener = function(type, listener, options) {
          const capture = captureOptionEnabled(options);
          const wrappable = listener && (typeof listener === 'function' || typeof listener === 'object');
          if (!capture || !KNOWN_VENDOR_CAPTURE_TYPES.has(String(type)) || !wrappable || !knownVendorRegistrationEvidence()) {
            return originalAdd.call(this, type, listener, options);
          }

          const key = listenerWrapperKey(target, type, capture);
          let entries = knownVendorListenerWrappers.get(listener);
          if (!entries) {
            entries = new Map();
            knownVendorListenerWrappers.set(listener, entries);
          }
          let wrapped = entries.get(key);
          if (!wrapped) {
            wrapped = function(event) {
              if (protectionEnabled && overlayAttackPersistent && !isRuleAllowed('click-overlay', currentOrigin)) {
                return undefined;
              }
              if (typeof listener === 'function') return listener.call(this, event);
              if (listener && typeof listener.handleEvent === 'function') return listener.handleEvent.call(listener, event);
              return undefined;
            };
            entries.set(key, wrapped);
          }
          return originalAdd.call(this, type, wrapped, options);
        };

        target.removeEventListener = function(type, listener, options) {
          const capture = captureOptionEnabled(options);
          const key = listenerWrapperKey(target, type, capture);
          const wrapped = listener && knownVendorListenerWrappers.get(listener)?.get(key);
          return originalRemove.call(this, type, wrapped || listener, options);
        };
      } catch (_) {}
    }
  }

  installKnownVendorCaptureListenerGuard();

  function colorAlpha(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text || text === 'transparent') return 0;
    const rgba = text.match(/^rgba?\(\s*[\d.]+\s*[, ]+\s*[\d.]+\s*[, ]+\s*[\d.]+(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (!rgba) return 1;
    if (rgba[1] == null) return 1;
    return rgba[1].endsWith('%') ? Math.max(0, Math.min(1, parseFloat(rgba[1]) / 100)) : Math.max(0, Math.min(1, parseFloat(rgba[1])));
  }

  function hasMeaningfulOverlayContent(el) {
    try {
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 8) return true;
      if (el.querySelector('video,canvas,iframe,img[src],svg,button,input,textarea,select,[role="dialog"],[aria-modal="true"]')) return true;
    } catch (_) {}
    return false;
  }

  function hasKnownOverlayVendorScript() {
    if (knownOverlayVendorEvidence) return true;
    const now = Date.now();
    if (now - lastOverlayVendorScanAt < 1500) return false;
    lastOverlayVendorScanAt = now;
    try {
      for (const script of document.scripts || []) {
        const raw = script?.src || '';
        if (!raw) continue;
        const parsed = toURL(raw);
        if (!parsed) continue;
        if (KNOWN_CLICK_OVERLAY_VENDOR_RE.test(parsed.hostname) && KNOWN_CLICK_OVERLAY_SCRIPT_RE.test(`${parsed.pathname}${parsed.search}`)) {
          knownOverlayVendorEvidence = true;
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function overlayCandidateScore(el) {
    if (!el || el.nodeType !== 1 || el === document.documentElement || el === document.body) return null;
    if (el.closest?.('[data-dblocker-placeholder="1"]')) return null;

    // IMPORTANT: exact known signature first. No generic full-screen element can
    // enter this path, regardless of size, z-index, opacity, or player state.
    const exactId = KNOWN_CLICK_OVERLAY_IDS.has(String(el.id || '').toLowerCase());
    if (!exactId) return null;

    let rect;
    let style;
    try {
      rect = el.getBoundingClientRect();
      style = getComputedStyle(el);
    } catch (_) { return null; }

    const vw = Math.max(1, innerWidth || document.documentElement.clientWidth || 1);
    const vh = Math.max(1, innerHeight || document.documentElement.clientHeight || 1);
    const widthRatio = rect.width / vw;
    const heightRatio = rect.height / vh;
    if (widthRatio < 0.95 || heightRatio < 0.95) return null;
    if (!['fixed', 'absolute'].includes(style.position)) return null;
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return null;

    const nearViewport = rect.left <= vw * 0.08 && rect.top <= vh * 0.08
      && rect.right >= vw * 0.92 && rect.bottom >= vh * 0.92;
    if (!nearViewport) return null;

    const z = Number.parseInt(style.zIndex, 10);
    const veryHighZ = Number.isFinite(z) && z >= 9999;
    const extremeZ = Number.isFinite(z) && z >= 2147480000;
    const opacity = Number.parseFloat(style.opacity || '1');
    const backgroundAlpha = colorAlpha(style.backgroundColor);
    const transparent = (Number.isFinite(opacity) && opacity <= 0.08)
      || (backgroundAlpha <= 0.08 && (!style.backgroundImage || style.backgroundImage === 'none'));
    const lowContent = !hasMeaningfulOverlayContent(el);
    const vendorEvidence = hasKnownOverlayVendorScript();

    // #dontfoid alone is not enough. It must still look like the verified
    // transparent click-catcher, which prevents accidental blocking of an
    // unrelated element that happens to reuse the same id.
    const knownStrong = style.pointerEvents !== 'none'
      && transparent
      && lowContent
      && (extremeZ || veryHighZ || vendorEvidence);
    if (!knownStrong) return null;

    return {
      el,
      score: 100,
      rect,
      z,
      transparent,
      hinted: false,
      exactId: true,
      vendorEvidence,
      classification: vendorEvidence ? 'dontfoid-aclib' : 'dontfoid',
    };
  }

  function findSuspiciousOverlay(start) {
    let node = start?.nodeType === 1 ? start : start?.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const candidate = overlayCandidateScore(node);
      if (candidate) return candidate;
    }
    return null;
  }

  function findSuspiciousOverlayFromEvent(event) {
    try {
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
      for (let i = 0; i < Math.min(path.length, 10); i += 1) {
        const candidate = findSuspiciousOverlay(path[i]);
        if (candidate) return candidate;
      }
    } catch (_) {}

    const fromTarget = findSuspiciousOverlay(event?.target);
    if (fromTarget) return fromTarget;

    try {
      const known = document.getElementById('dontfoid');
      const candidate = overlayCandidateScore(known);
      if (candidate) return candidate;
    } catch (_) {}
    return null;
  }

  function restoreClickOverlay(el) {
    const state = blockedOverlayState.get(el);
    if (!state) return false;
    try {
      if (state.hadDisplay) el.style.setProperty('display', state.display, state.displayPriority || '');
      else el.style.removeProperty('display');
      if (state.hadPointerEvents) el.style.setProperty('pointer-events', state.pointerEvents, state.pointerEventsPriority || '');
      else el.style.removeProperty('pointer-events');
    } catch (_) {}
    blockedOverlayState.delete(el);
    blockedOverlayElements.delete(el);
    return true;
  }

  function restoreAllClickOverlays() {
    for (const el of Array.from(blockedOverlayElements)) restoreClickOverlay(el);
    blockedOverlayElements.clear();
  }

  function cleanupDetachedClickOverlays() {
    for (const el of Array.from(blockedOverlayElements)) {
      if (el?.isConnected) continue;
      blockedOverlayElements.delete(el);
      try { blockedOverlayState.delete(el); } catch (_) {}
    }
  }

  function enforceBlockedClickOverlays() {
    cleanupDetachedClickOverlays();
    for (const el of blockedOverlayElements) {
      if (!el?.isConnected) continue;
      try { el.style.setProperty('pointer-events', 'none', 'important'); } catch (_) {}
      try { el.style.setProperty('display', 'none', 'important'); } catch (_) {}
    }
  }

  function ensureKnownOverlayWatchTimer() {
    if (overlayScanTimer) return;
    overlayScanTimer = setInterval(() => {
      if (!protectionEnabled) return;
      enforceBlockedClickOverlays();
      let known = null;
      try { known = document.getElementById('dontfoid'); } catch (_) {}
      if (known) {
        const candidate = overlayCandidateScore(known);
        if (candidate) neutralizeClickOverlay(candidate.el, 'known-watch');
        return;
      }
      if (!blockedOverlayElements.size && overlayScanTimer) {
        clearInterval(overlayScanTimer);
        overlayScanTimer = null;
      }
    }, 1000);
  }

  function neutralizeClickOverlay(el, reason = 'detected') {
    if (!protectionEnabled || !el?.isConnected) return false;
    const origin = currentOrigin;
    if (isRuleAllowed('click-overlay', origin)) return false;

    const existingState = blockedOverlayState.get(el);
    if (existingState) {
      try { el.style.setProperty('pointer-events', 'none', 'important'); } catch (_) {}
      try { el.style.setProperty('display', 'none', 'important'); } catch (_) {}
      overlayAttackPersistent = true;
      ensureKnownOverlayWatchTimer();
      return true;
    }

    const candidate = overlayCandidateScore(el);
    if (!candidate) return false;

    const state = {
      hadDisplay: el.style.getPropertyValue('display') !== '',
      display: el.style.getPropertyValue('display') || '',
      displayPriority: el.style.getPropertyPriority('display') || '',
      hadPointerEvents: el.style.getPropertyValue('pointer-events') !== '',
      pointerEvents: el.style.getPropertyValue('pointer-events') || '',
      pointerEventsPriority: el.style.getPropertyPriority('pointer-events') || '',
    };
    blockedOverlayState.set(el, state);
    blockedOverlayElements.add(el);

    try { el.style.setProperty('pointer-events', 'none', 'important'); } catch (_) {}
    try { el.style.setProperty('display', 'none', 'important'); } catch (_) {}

    overlayAttackPersistent = true;
    ensureKnownOverlayWatchTimer();
    const classification = candidate.classification || reason;
    recordBlocked('click-overlay', location.href, {
      origin,
      classification: reason && reason !== 'detected' ? `${classification}:${reason}` : classification,
    });
    showToast(trEngine('toast_click_overlay'));
    return true;
  }

  function inspectKnownClickOverlay(reason = 'known-signature') {
    let known = null;
    try { known = document.getElementById('dontfoid'); } catch (_) {}
    if (!known) return false;
    ensureKnownOverlayWatchTimer();
    const candidate = overlayCandidateScore(known);
    return !!(candidate && neutralizeClickOverlay(candidate.el, reason));
  }

  function stopOverlayActivationEvent(event) {
    try { if (event.cancelable) event.preventDefault(); } catch (_) {}
    try { event.stopImmediatePropagation(); } catch (_) {
      try { event.stopPropagation(); } catch (_) {}
    }
  }

  function emitPersistentOverlayActivation(event) {
    if (!overlayAttackPersistent || !protectionEnabled || isRuleAllowed('click-overlay', currentOrigin)) return;
    if (event?.isTrusted !== true) return;
    const now = Date.now();
    if (now - lastOverlayActivationTelemetryAt < OVERLAY_ACTIVATION_TELEMETRY_DEBOUNCE_MS) return;
    lastOverlayActivationTelemetryAt = now;
    emitTelemetry('overlayActivation', {
      origin: currentOrigin,
      eventType: String(event?.type || '').slice(0, 32),
      at: now,
      topFrame: isTopFrame,
    });
  }

  function overlayActivationCaptureHandler(event) {
    if (!protectionEnabled) return;

    // Only the verified #dontfoid signature can cause click suppression now.
    // Generic fullscreen/player/control layers never enter this path.
    const candidate = findSuspiciousOverlayFromEvent(event);
    if (candidate) {
      if (!neutralizeClickOverlay(candidate.el, `capture-${event.type}`)) return;
      emitPersistentOverlayActivation(event);
      stopOverlayActivationEvent(event);
      return;
    }

    // After a verified attack, do not swallow ordinary clicks. Send a signed
    // heartbeat instead so background can quarantine popunder tabs while native
    // page/player interactions (including fullscreen buttons) continue normally.
    emitPersistentOverlayActivation(event);
  }

  function inspectAddedOverlayNode(node) {
    if (!node || node.nodeType !== 1) return false;
    let known = null;
    try { known = node.id === 'dontfoid' ? node : node.querySelector?.('#dontfoid'); } catch (_) {}
    if (!known) return false;
    ensureKnownOverlayWatchTimer();
    const candidate = overlayCandidateScore(known);
    return !!(candidate && neutralizeClickOverlay(candidate.el, 'mutation-known'));
  }

  const OVERLAY_CAPTURE_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click', 'auxclick', 'contextmenu'];

  function setupClickOverlayGuard() {
    if (!protectionEnabled || overlayObserver) return;

    for (const type of OVERLAY_CAPTURE_EVENTS) {
      window.addEventListener(type, overlayActivationCaptureHandler, { capture: true, passive: false });
    }

    overlayObserver = new MutationObserver((mutations) => {
      if (!protectionEnabled) return;
      cleanupDetachedClickOverlays();
      for (const mutation of mutations) {
        if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue;
        for (const node of mutation.addedNodes) inspectAddedOverlayNode(node);
      }
    });
    overlayObserver.observe(document.documentElement || document, { childList: true, subtree: true });

    // One targeted startup check catches a #dontfoid node inserted before the
    // MAIN engine. No viewport hit-testing or generic fullscreen polling remains.
    inspectKnownClickOverlay('startup-known');
  }

  function stopClickOverlayGuard() {
    if (overlayObserver) { overlayObserver.disconnect(); overlayObserver = null; }
    if (overlayScanTimer) { clearInterval(overlayScanTimer); overlayScanTimer = null; }
    overlayAttackPersistent = false;
    lastOverlayActivationTelemetryAt = 0;
    knownOverlayVendorEvidence = false;
    lastOverlayVendorScanAt = 0;
    for (const type of OVERLAY_CAPTURE_EVENTS) {
      window.removeEventListener(type, overlayActivationCaptureHandler, true);
    }
  }

  // =========================================================
  // TAB-UNDER / POPUP / LINKS / REDIRECT
  // =========================================================

  const TAB_UNDER_GUARD_MS = 2500;
  let tabUnderGuardUntil = 0;
  let tabUnderGuardReason = '';
  function armTabUnderGuard(reason) { tabUnderGuardUntil = Date.now() + TAB_UNDER_GUARD_MS; tabUnderGuardReason = reason || 'same-origin clone'; }
  function isTabUnderGuardActive() { return Date.now() < tabUnderGuardUntil; }

  function isSuspiciousSameOriginPopup(url) {
    const target = toURL(url);
    const current = toURL(location.href);
    if (!target || !current || target.origin !== current.origin) return false;
    return target.href === current.href || target.pathname === current.pathname;
  }

  const originalWindowOpen = window.open;
  window.open = function(url, name, features) {
    if (!protectionEnabled) return originalWindowOpen.call(window, url, name, features);

    const rawPopupUrl = url == null ? '' : String(url).trim();
    const targetName = String(name || '').trim().toLowerCase();
    const navigationTarget = targetName === '_self' || targetName === '_top' || targetName === '_parent';

    // window.open(..., '_self/_top/_parent') behaves like navigation, not a new popup.
    if (navigationTarget) {
      if (isAllowedSameOriginNavigation(url)) {
        return originalWindowOpen.call(window, url, name, features);
      }
      const origin = getOrigin(url, currentOrigin);
      if (isRuleAllowed('redirect', origin)) {
        return originalWindowOpen.call(window, url, name, features);
      }
      recordBlocked('redirect', url, { origin });
      showToast(trEngine('toast_redirect', { host: displayHost(origin) }));
      return null;
    }

    if (!rawPopupUrl || rawPopupUrl === 'about:blank') {
      const origin = currentOrigin;
      if (isRuleAllowed('popup', origin)) return originalWindowOpen.call(window, url, name, features);
      recordBlocked('popup', rawPopupUrl || 'about:blank', { origin });
      showToast(trEngine('toast_popup', { host: displayHost(origin) }));
      return null;
    }

    // Same-origin clone remains a dedicated tab-under signal.
    if (isAllowedSameOriginNavigation(url) && isSuspiciousSameOriginPopup(url)) {
      if (isRuleAllowed('tab-under', currentOrigin)) return originalWindowOpen.call(window, url, name, features);
      recordBlocked('tab-under', url || location.href, { origin: currentOrigin });
      armTabUnderGuard('window.open same-origin clone');
      showToast(trEngine('toast_tab_under'));
      return null;
    }

    // IMPORTANT: a programmatic popup is still a popup even when its first URL is
    // same-origin. Ad sites commonly open /go or another internal URL and let the
    // server HTTP-redirect that new tab to an ad network. Once that HTTP redirect
    // begins, page-level JS hooks cannot reliably stop it. Therefore every
    // non-navigation window.open() is governed by the popup rule, regardless of
    // whether the initial URL is same-origin or cross-origin.
    const origin = getOrigin(url, currentOrigin);
    if (isRuleAllowed('popup', origin)) return originalWindowOpen.call(window, url, name, features);
    recordBlocked('popup', url, { origin });
    showToast(trEngine('toast_popup', { host: displayHost(origin) }));
    return null;
  };

  // Firefox exposes the Navigation API from Firefox 147 onward. Unlike attempts
  // to overwrite Location.prototype (whose navigation members are unforgeable),
  // the native `navigate` event is fired for legacy programmatic navigations such
  // as location.assign(), location.replace(), and location.href assignments.
  function handleNavigationApiRedirect(event) {
    if (!protectionEnabled) return false;
    const destinationUrl = event?.destination?.url;
    if (!destinationUrl || !isCrossOrigin(destinationUrl)) return false;
    const origin = getOrigin(destinationUrl, currentOrigin);
    if (isRuleAllowed('redirect', origin)) return false;

    const guarded = isTabUnderGuardActive();
    const programmatic = event?.userInitiated === false;
    if (!guarded && !programmatic) return false;

    // Cross-origin navigations cannot be `intercept()`-ed, but NavigateEvent is
    // cancelable for ordinary location-driven navigations. preventDefault() is
    // the supported way to stop the navigation completely.
    if (event?.cancelable !== true || typeof event.preventDefault !== 'function') return false;
    event.preventDefault();
    recordBlocked('redirect', destinationUrl, { origin });
    showToast(guarded
      ? trEngine('toast_redirect_tab_under', { host: displayHost(origin) })
      : trEngine('toast_redirect_prog', { host: displayHost(origin) }));
    console.warn('[AdsControl] Navigation API blocked:', destinationUrl, guarded ? tabUnderGuardReason : 'programmatic');
    return true;
  }

  try {
    const navigationApi = window.navigation;
    if (navigationApi?.addEventListener) {
      navigationApi.addEventListener('navigate', handleNavigationApiRedirect);
    }
  } catch (_) {}

  const DISMISS_CONTROL_HINT_RE = /(?:^|[\s._\-:/])(?:close|dismiss|hide|remove|skip(?:\s*ad)?|đóng|dong|tắt|tat)(?:$|[\s._\-:/])/i;
  const DISMISS_CONTROL_SYMBOL_RE = /(?:^|[\s._\-:/])(?:x|×|✕|✖|✗|╳)(?:$|[\s._\-:/])/i;
  const DISMISS_CONTROL_TEXT_RE = /^(?:[x×✕✖✗╳]|close|dismiss|hide|remove|skip(?:\s*ad)?|đóng|dong|tắt|tat)$/i;

  function isLikelyDismissControl(target) {
    let node = target?.nodeType === 1 ? target : target?.parentElement;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      try {
        const tag = String(node.tagName || '').toLowerCase();
        const role = String(node.getAttribute?.('role') || '').toLowerCase();
        const type = String(node.getAttribute?.('type') || '').toLowerCase();
        const explicitDismiss = node.hasAttribute?.('data-dismiss')
          || node.hasAttribute?.('data-bs-dismiss')
          || node.hasAttribute?.('data-close');
        const interactive = explicitDismiss
          || tag === 'button'
          || tag === 'a'
          || role === 'button'
          || (tag === 'input' && ['button', 'submit', 'reset'].includes(type))
          || typeof node.onclick === 'function'
          || node.hasAttribute?.('onclick')
          || node.hasAttribute?.('tabindex');
        if (!interactive) continue;

        const attrs = [
          node.id,
          typeof node.className === 'string' ? node.className : String(node.className || ''),
          node.name,
          node.getAttribute?.('name'),
          node.getAttribute?.('aria-label'),
          node.getAttribute?.('title'),
          node.getAttribute?.('data-action'),
          node.getAttribute?.('data-dismiss'),
          node.getAttribute?.('data-bs-dismiss'),
          node.getAttribute?.('data-close'),
          node.getAttribute?.('onclick'),
          node.value,
          node.getAttribute?.('value'),
        ].filter(Boolean).join(' ');
        const text = String(node.textContent || node.getAttribute?.('value') || node.value || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80);

        if (explicitDismiss
            || DISMISS_CONTROL_HINT_RE.test(attrs)
            || DISMISS_CONTROL_SYMBOL_RE.test(attrs)
            || DISMISS_CONTROL_HINT_RE.test(text)
            || DISMISS_CONTROL_SYMBOL_RE.test(text)
            || DISMISS_CONTROL_TEXT_RE.test(text)) return true;
      } catch (_) {}
    }
    return false;
  }

  function findClosestAnchor(target) {
    if (!target || target.nodeType !== 1 || typeof target.closest !== 'function') return null;
    return target.closest('a');
  }

  function isNewContextTarget(target) {
    const t = String(target || '').trim().toLowerCase();
    return t === '_blank' || (t && t !== '_self' && t !== '_top' && t !== '_parent');
  }

  function handleAnchorEvent(e) {
    if (!protectionEnabled) return;
    const anchor = findClosestAnchor(e.target);
    if (!anchor) return;
    const rawHref = anchor.getAttribute('href') || '';
    const resolvedHref = anchor.href || rawHref;
    if (isPassThroughLinkUrl(rawHref)) return;

    if (/^javascript:/i.test(rawHref.trim())) {
      if (e.isTrusted === true && isLikelyDismissControl(anchor)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      recordBlocked('external-link', rawHref, { origin: 'javascript:' });
      showToast(trEngine('toast_js_link'));
      return false;
    }

    if (!resolvedHref) return;
    const newContext = isNewContextTarget(anchor.getAttribute('target'));
    if (newContext && isSuspiciousSameOriginPopup(resolvedHref)) {
      if (isRuleAllowed('tab-under', currentOrigin)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      recordBlocked('tab-under', resolvedHref, { origin: currentOrigin });
      armTabUnderGuard('same-origin target clone');
      showToast(trEngine('toast_link_tab_under'));
      return false;
    }

    // A target=_blank or named browsing-context link is still a popup even when
    // its initial URL is same-origin. Same-origin /go links can server-redirect
    // the newly opened tab to an ad network before page-level hooks can react.
    if (newContext) {
      const origin = getOrigin(resolvedHref, currentOrigin);
      if (isRuleAllowed('popup', origin)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      recordBlocked('popup', resolvedHref, { origin });
      showToast(trEngine('toast_popup', { host: displayHost(origin) }));
      return false;
    }

    if (isCrossOrigin(resolvedHref)) {
      const origin = getOrigin(resolvedHref, currentOrigin);
      if (isRuleAllowed('external-link', origin)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      recordBlocked('external-link', resolvedHref, { origin });
      showToast(trEngine('toast_external_link', { host: displayHost(origin) }));
      return false;
    }
  }

  document.addEventListener('click', handleAnchorEvent, true);
  document.addEventListener('auxclick', handleAnchorEvent, true);

  if (window.history) {
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = function(state, title, url) {
      if (!protectionEnabled || url == null || isAllowedSameOriginNavigation(url)) return originalPushState(state, title, url);
      const origin = getOrigin(url, currentOrigin);
      if (isRuleAllowed('redirect', origin)) return originalPushState(state, title, url);
      recordBlocked('redirect', url, { origin });
      showToast(trEngine('toast_history_redirect', { host: displayHost(origin) }));
    };
    history.replaceState = function(state, title, url) {
      if (!protectionEnabled || url == null || isAllowedSameOriginNavigation(url)) return originalReplaceState(state, title, url);
      const origin = getOrigin(url, currentOrigin);
      if (isRuleAllowed('redirect', origin)) return originalReplaceState(state, title, url);
      recordBlocked('redirect', url, { origin });
      showToast(trEngine('toast_history_redirect', { host: displayHost(origin) }));
    };
  }

  document.addEventListener('submit', (e) => {
    if (!protectionEnabled) return;
    const form = e.target;
    if (!form?.action) return;
    const target = String(form.getAttribute('target') || '').trim().toLowerCase();
    const newContext = target === '_blank' || (target && target !== '_self' && target !== '_top' && target !== '_parent');
    if (!newContext && !isCrossOrigin(form.action)) return;
    const origin = getOrigin(form.action, currentOrigin);
    if (isRuleAllowed('form', origin)) {
      // A form rule is type-specific. When a real user submission opens a new
      // browsing context, send a signed short-lived intent so background
      // quarantine can distinguish it from a popup to the same origin.
      if (newContext && e.isTrusted === true) {
        emitTelemetry('allowedNewContext', { kind: 'form', origin, at: Date.now() });
      }
      return;
    }
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    recordBlocked('form', form.action, { origin });
    showToast(trEngine('toast_form', { host: displayHost(origin) }));
    return false;
  }, true);

  // =========================================================
  // CONFIG / LIFECYCLE
  // =========================================================

  function startProtection() {
    setupIframeControl();
    setupMetaControl();
    setupClickOverlayGuard();
  }

  function stopProtection() {
    tabUnderGuardUntil = 0;
    stopIframeControl();
    stopMetaControl();
    stopClickOverlayGuard();
    restoreAllBlockedIframes();
    restoreAllBlockedMetaRefreshes();
    restoreAllClickOverlays();
    resetIframeSessionState();
  }

  function iframeRulesChanged(before, after) {
    const a = before.filter((key) => typeof key === 'string' && key.startsWith('iframe|')).sort();
    const b = after.filter((key) => typeof key === 'string' && key.startsWith('iframe|')).sort();
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }

  function metaRulesChanged(before, after) {
    const a = before.filter((key) => typeof key === 'string' && key.startsWith('meta-refresh|')).sort();
    const b = after.filter((key) => typeof key === 'string' && key.startsWith('meta-refresh|')).sort();
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }

  function clickOverlayRulesChanged(before, after) {
    const a = before.filter((key) => typeof key === 'string' && key.startsWith('click-overlay|')).sort();
    const b = after.filter((key) => typeof key === 'string' && key.startsWith('click-overlay|')).sort();
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }

  function applyConfig(config) {
    const oldProtection = protectionEnabled;
    const oldAllow = allowRules;
    const oldAllowSet = allowRuleSet;
    const oldMode = settings.smartPlayerMode;

    allowRules = Array.isArray(config.allowRules) ? config.allowRules.filter((value) => typeof value === 'string').slice() : [];
    allowRuleSet = new Set(allowRules);
    settings = {
      smartPlayerMode: ['smart', 'strict', 'compatible'].includes(config.settings?.smartPlayerMode)
        ? config.settings.smartPlayerMode
        : 'compatible',
      showPageToasts: config.settings?.showPageToasts !== false,
      language: ['vi', 'en', 'zh'].includes(config.settings?.language) ? config.settings.language : 'vi',
    };
    protectionEnabled = config.protectionEnabled === true;

    if (protectionEnabled && !oldProtection) {
      startProtection();
      return;
    }

    if (!protectionEnabled && oldProtection) {
      stopProtection();
      return;
    }

    if (!protectionEnabled) return;

    for (const key of allowRules) {
      if (oldAllowSet.has(key)) continue;
      if (key.startsWith('iframe|')) restoreBlockedIframesForOrigin(key.slice('iframe|'.length));
      if (key.startsWith('meta-refresh|')) restoreBlockedMetaRefreshesForOrigin(key.slice('meta-refresh|'.length));
      if (key === `click-overlay|${currentOrigin}`) {
        restoreAllClickOverlays();
        overlayAttackPersistent = false;
        lastOverlayActivationTelemetryAt = 0;
      }
    }

    const iframePolicyChanged = iframeRulesChanged(oldAllow, allowRules);
    const metaPolicyChanged = metaRulesChanged(oldAllow, allowRules);
    const overlayPolicyChanged = clickOverlayRulesChanged(oldAllow, allowRules);
    if (oldMode !== settings.smartPlayerMode || iframePolicyChanged) rescanIframes();
    if (metaPolicyChanged) rescanMetaRefreshes();
    if (overlayPolicyChanged && !isRuleAllowed('click-overlay', currentOrigin)) inspectKnownClickOverlay('policy-change');
  }

  function applyControlCommand(command) {
    if (!command || typeof command !== 'object') return false;

    if (command.type === 'applyConfig') {
      applyConfig(command.config || {});
      return true;
    }

    if (command.type === 'allowOnce') {
      const origin = String(command.origin || '');
      if (origin) allowBlockedIframesOnce(origin);
      return true;
    }

    if (command.type === 'rescan') {
      rescanIframes();
      rescanMetaRefreshes();
      return true;
    }

    return false;
  }

  function handleEncryptedControlEvent(event) {
    const rawDetail = String(event?.detail || '');
    if (!rawDetail || rawDetail.length > 65536) return;
    const now = Date.now();
    if (!rawControlWindowStartedAt || now - rawControlWindowStartedAt >= 5000) {
      rawControlWindowStartedAt = now;
      rawControlWindowCount = 0;
    }
    if (++rawControlWindowCount > 180) return;

    controlQueue = controlQueue.then(async () => {
      let envelope;
      try { envelope = JSON.parse(rawDetail); } catch (_) { return; }
      const seq = Number(envelope?.seq);
      const iv = base64ToBytes(envelope?.iv);
      const ciphertext = base64ToBytes(envelope?.ciphertext);
      if (!Number.isSafeInteger(seq) || seq <= lastControlSeq || iv.length !== 12 || !ciphertext.length) return;

      const key = await aesKeyPromise;
      if (!key) return;

      let plaintext;
      try {
        plaintext = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv,
            additionalData: new TextEncoder().encode(String(seq)),
            tagLength: 128,
          },
          key,
          ciphertext,
        );
      } catch (_) {
        return;
      }

      let command;
      try { command = JSON.parse(new TextDecoder().decode(plaintext)); } catch (_) { return; }
      lastControlSeq = seq;
      applyControlCommand(command);
    }).catch(() => {});
  }

  if (!channelId || !bridgeSecret || !controlEventName) return;
  document.addEventListener(controlEventName, handleEncryptedControlEvent, true);
  applyConfig(bootstrap?.config || {});
};
