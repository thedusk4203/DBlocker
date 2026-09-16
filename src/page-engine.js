globalThis.DBlockerMainEngine = function DBlockerMainEngine(bootstrap) {
  'use strict';

  const currentOrigin = location.origin;
  const isTopFrame = (() => {
    try { return top === window; } catch (_) { return false; }
  })();

  let allowRules = [];
  let allowRuleSet = new Set();
  let settings = { smartPlayerMode: 'smart', showPageToasts: true, language: 'en' };
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
      toast_click_overlay: 'Đã vô hiệu lớp click toàn màn hình',
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
      toast_click_overlay: 'Blocked full-screen click overlay',
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
      toast_click_overlay: '已禁用全屏点击遮罩',
    }),
  });

  function trEngine(key, params = {}) {
    const lang = settings.language || 'en';
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
  // FULL-SCREEN CLICK OVERLAY GUARD
  // =========================================================

  // Some ad scripts wait a few seconds, then place a transparent fixed layer over
  // the entire page. The layer captures the user's next click and opens an ad.
  // It is not necessarily an <a>, and the click handler can live on document in
  // capture phase. Therefore this guard has three layers:
  //   1) identify/neutralize strong overlay signatures,
  //   2) intercept activation events at WINDOW capture before document capture,
  //   3) keep the window.open guard as the final fallback.
  //
  // Known real-world signature: acscdn.com aclib/suv5 creates div#dontfoid with
  // position:fixed, transparent background, max z-index and pointer-events:auto.
  const CLICK_OVERLAY_HINT_RE = /(?:^|[-_\s])(?:ad|ads|advert|overlay|click|pop|under|interstitial|sponsor)(?:$|[-_\s])/i;
  const KNOWN_CLICK_OVERLAY_IDS = new Set(['dontfoid']);
  const KNOWN_CLICK_OVERLAY_VENDOR_RE = /(?:^|\.)acscdn\.com$/i;
  const KNOWN_CLICK_OVERLAY_SCRIPT_RE = /\/(?:script\/)?(?:aclib|suv5)\.js(?:[?#]|$)/i;
  const AUTH_INTENT_RE = /(?:^|[\s_\-/.])(?:login|log[\s_-]?in|signin|sign[\s_-]?in|signup|sign[\s_-]?up|register|registration|account|auth|oauth|đăng\s*nhập|dang\s*nhap|đăng\s*k[ýy]|dang\s*ky|登录|登入|注册)(?:$|[\s_\-/.?&#=])/i;
  const PLAYER_UI_HINT_RE = /(?:^|[\s_-])(?:video|player|jwplayer|jw-|plyr|video-js|vjs|shaka|clappr|controls?|poster|media)(?:$|[\s_-])/i;
  const LEGIT_DIALOG_SELECTOR = 'dialog,[role="dialog"],[aria-modal="true"],[role="alertdialog"],form';
  const blockedOverlayState = new WeakMap();
  const blockedOverlayElements = new Set();
  let overlayObserver = null;
  let overlayScanTimer = null;
  let overlayScanScheduled = false;
  let lastOverlayHoverCheckAt = 0;
  let overlaySuppressionUntil = 0;
  let overlayPendingActivationUntil = 0;
  // Once a verified click-capture overlay has existed in this document, its
  // capture listeners may remain alive even after the DOM layer is hidden. Keep
  // this state for the lifetime of the protected document so every later physical
  // activation can arm the background child-tab quarantine without swallowing
  // legitimate page clicks.
  let overlayAttackPersistent = false;
  let lastOverlayActivationTelemetryAt = 0;
  const OVERLAY_ACTIVATION_TELEMETRY_DEBOUNCE_MS = 320;
  let knownOverlayVendorEvidence = false;
  let lastOverlayVendorScanAt = 0;

  // Known acscdn/aclib listeners are wrapped when they register after MAIN engine
  // startup. They behave normally until a verified overlay attack is observed;
  // afterwards only those vendor capture listeners are suppressed. Existing
  // listeners that registered before MAIN injection are handled by persistent
  // per-activation background quarantine below.
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

  let lastTrustedAuthActivationUntil = 0;
  let lastAuthActivationTelemetryAt = 0;

  function elementIsVisiblyRendered(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') <= 0.02) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    } catch (_) {
      return false;
    }
  }

  function authIntentBlob(el) {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    try {
      for (const value of [
        el.id, typeof el.className === 'string' ? el.className : '',
        el.getAttribute?.('name'), el.getAttribute?.('aria-label'), el.getAttribute?.('title'),
        el.getAttribute?.('href'), el.getAttribute?.('action'), el.getAttribute?.('data-action'),
        el.getAttribute?.('data-testid'), el.getAttribute?.('data-target'), el.getAttribute?.('data-bs-target'),
      ]) {
        if (value) parts.push(String(value).slice(0, 240));
      }
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text.slice(0, 240));
    } catch (_) {}
    return parts.join(' ').toLowerCase();
  }

  function isAuthUiTarget(target) {
    let control = null;
    try {
      control = target?.nodeType === 1
        ? target.closest?.('a,button,input,[role="button"],[role="link"],form')
        : target?.parentElement?.closest?.('a,button,input,[role="button"],[role="link"],form');
    } catch (_) {}
    if (!control) return false;
    const blob = authIntentBlob(control);
    if (AUTH_INTENT_RE.test(blob)) return true;
    try {
      const form = control.tagName === 'FORM' ? control : control.closest?.('form');
      if (form) {
        if (form.querySelector('input[type="password"]')) return true;
        if (AUTH_INTENT_RE.test(authIntentBlob(form))) return true;
      }
    } catch (_) {}
    return false;
  }

  function authUrlLooksLegitimate(url) {
    const parsed = toURL(url);
    if (!parsed) return false;
    const blob = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
    return AUTH_INTENT_RE.test(blob);
  }

  function noteTrustedAuthActivation(event) {
    if (!protectionEnabled || event?.isTrusted !== true) return;
    if (!isAuthUiTarget(event.target)) return;
    const now = Date.now();
    lastTrustedAuthActivationUntil = now + 1800;

    // Notify the trusted extension side early (pointerdown/mousedown happens before
    // the site's click handler can call window.open). Background uses this only to
    // avoid closing a legitimate auth popup that happens to occur while an older
    // overlay quarantine is still armed.
    if (now - lastAuthActivationTelemetryAt >= 250) {
      lastAuthActivationTelemetryAt = now;
      emitTelemetry('authActivation', {
        origin: currentOrigin,
        eventType: String(event?.type || '').slice(0, 32),
        at: now,
      });
    }
  }

  function hasFreshTrustedAuthActivation() {
    return Date.now() < lastTrustedAuthActivationUntil;
  }

  function shouldAllowTrustedAuthNavigation(url, target = null) {
    const directTarget = target && isAuthUiTarget(target);
    if (!directTarget && !hasFreshTrustedAuthActivation()) return false;
    if (url == null || String(url).trim() === '' || String(url).trim().toLowerCase() === 'about:blank') return true;
    return isSameOrigin(url) || authUrlLooksLegitimate(url);
  }

  function visibleDialogOrAuthFormExistsNear(el) {
    if (!el || el.nodeType !== 1) return false;
    const candidates = [];
    try {
      if (el.matches?.(LEGIT_DIALOG_SELECTOR)) candidates.push(el);
      for (const child of el.querySelectorAll?.(LEGIT_DIALOG_SELECTOR) || []) candidates.push(child);
      const parent = el.parentElement;
      if (parent) {
        for (const sibling of parent.querySelectorAll?.(':scope > dialog,:scope > [role="dialog"],:scope > [aria-modal="true"],:scope > [role="alertdialog"],:scope > form') || []) {
          if (sibling !== el) candidates.push(sibling);
        }
      }
    } catch (_) {}

    for (const candidate of candidates.slice(0, 24)) {
      if (!elementIsVisiblyRendered(candidate)) continue;
      try {
        if (candidate.matches?.('dialog,[role="dialog"],[aria-modal="true"],[role="alertdialog"]')) return true;
        if (candidate.querySelector?.('input[type="password"]')) return true;
        if (AUTH_INTENT_RE.test(authIntentBlob(candidate))) return true;
      } catch (_) {}
    }
    return false;
  }

  function isLikelyPlayerVisualLayer(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el.matches?.('video,canvas')) return true;
      let node = el;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        const blob = `${node.id || ''} ${typeof node.className === 'string' ? node.className : ''}`;
        if (!PLAYER_UI_HINT_RE.test(blob)) continue;
        if (node.matches?.('video,canvas') || node.querySelector?.('video,canvas')) return true;
      }
    } catch (_) {}
    return false;
  }

  function isLikelyLegitimateModalLayer(el) {
    if (!el || el.nodeType !== 1) return false;
    const blob = authIntentBlob(el);
    const modalHint = /(?:^|[\s_-])(?:modal|dialog|backdrop|drawer|sheet|login|signin|signup|register|auth)(?:$|[\s_-])/i.test(blob);
    if (visibleDialogOrAuthFormExistsNear(el)) return true;
    if (modalHint) {
      try {
        const globalCandidates = document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"],[role="alertdialog"],form');
        for (const candidate of Array.from(globalCandidates).slice(0, 32)) {
          if (!elementIsVisiblyRendered(candidate)) continue;
          if (candidate.matches?.('dialog[open],[role="dialog"],[aria-modal="true"],[role="alertdialog"]')) return true;
          if (candidate.querySelector?.('input[type="password"]') || AUTH_INTENT_RE.test(authIntentBlob(candidate))) return true;
        }
      } catch (_) {}
    }
    return false;
  }

  // Track a short, trusted auth gesture window before site handlers execute.
  // This lets genuine login/register flows open their own dialog/OAuth window while
  // keeping generic same-origin /go popups blocked.
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click']) {
    window.addEventListener(type, noteTrustedAuthActivation, { capture: true, passive: true });
  }

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
    if (widthRatio < 0.90 || heightRatio < 0.90) return null;
    if (!['fixed', 'absolute', 'sticky'].includes(style.position)) return null;
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return null;

    const nearViewport = rect.left <= vw * 0.08 && rect.top <= vh * 0.08 && rect.right >= vw * 0.92 && rect.bottom >= vh * 0.92;
    if (!nearViewport) return null;

    const z = Number.parseInt(style.zIndex, 10);
    const highZ = Number.isFinite(z) && z >= 999;
    const veryHighZ = Number.isFinite(z) && z >= 9999;
    const extremeZ = Number.isFinite(z) && z >= 2147480000;
    const opacity = Number.parseFloat(style.opacity || '1');
    const backgroundAlpha = colorAlpha(style.backgroundColor);
    const transparent = (Number.isFinite(opacity) && opacity <= 0.08)
      || (backgroundAlpha <= 0.08 && (!style.backgroundImage || style.backgroundImage === 'none'));
    const lowContent = !hasMeaningfulOverlayContent(el);
    const nameBlob = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`;
    const hinted = CLICK_OVERLAY_HINT_RE.test(nameBlob);
    const exactId = KNOWN_CLICK_OVERLAY_IDS.has(String(el.id || '').toLowerCase());
    const vendorEvidence = exactId && hasKnownOverlayVendorScript();
    const defaultCursor = style.cursor === 'auto' || style.cursor === 'default';
    const pointerActive = style.pointerEvents !== 'none';

    let score = 0;
    if (widthRatio >= 0.97 && heightRatio >= 0.97) score += 4;
    else score += 2;
    if (highZ) score += 3;
    if (veryHighZ) score += 2;
    if (extremeZ) score += 3;
    if (transparent) score += 4;
    if (lowContent) score += 3;
    if (hinted) score += 3;
    if (defaultCursor) score += 1;
    if (el.tagName === 'A' || el.hasAttribute('onclick')) score += 2;
    if (exactId) score += 7;
    if (vendorEvidence) score += 4;

    // Known dontfoid/aclib overlays are still required to have the structural
    // fingerprint (near-fullscreen, pointer-active, transparent, empty). The
    // known signature only lowers ambiguity; it is not an unconditional ID block.
    const knownStrong = exactId
      && pointerActive
      && transparent
      && lowContent
      && widthRatio >= 0.95
      && heightRatio >= 0.95
      && (style.position === 'fixed' || style.position === 'absolute')
      && (extremeZ || veryHighZ || vendorEvidence);

    // Generic fullscreen heuristics are intentionally TOP-FRAME ONLY. A video
    // player iframe commonly contains transparent/full-viewport control or render
    // layers; treating those as ad overlays causes the classic "audio but black
    // video" regression. Child frames only use verified #dontfoid/aclib signatures.
    if (!isTopFrame && !knownStrong) return null;

    // Even in the top frame, video players may use transparent full-size control
    // surfaces. If the candidate is structurally tied to an actual video/canvas
    // player, prefer compatibility unless it is the verified hostile signature.
    if (!knownStrong && isLikelyPlayerVisualLayer(el)) return null;

    // Never classify real dialogs/auth UI (or their backdrops) as ad overlays.
    // This preserves login/register modals while keeping the verified vendor
    // signature path available for truly hostile transparent catchers.
    if (!knownStrong && isLikelyLegitimateModalLayer(el)) return null;

    // Generic path deliberately ignores ordinary modal backdrops with visible/dim
    // backgrounds or real dialog content.
    if (!knownStrong && ((!transparent && !hinted) || !lowContent || score < 10)) return null;

    return {
      el,
      score,
      rect,
      z,
      transparent,
      hinted,
      exactId,
      vendorEvidence,
      classification: vendorEvidence ? 'dontfoid-aclib' : exactId ? 'dontfoid' : 'fullscreen-overlay',
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

  function eventClientPoint(event) {
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    const touch = event?.touches?.[0] || event?.changedTouches?.[0];
    if (touch && Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
      return { x: touch.clientX, y: touch.clientY };
    }
    return null;
  }

  function findSuspiciousOverlayFromEvent(event) {
    // Prefer the real event path because event.target can be a child of the layer.
    try {
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
      for (let i = 0; i < Math.min(path.length, 10); i += 1) {
        const candidate = findSuspiciousOverlay(path[i]);
        if (candidate) return candidate;
      }
    } catch (_) {}

    const fromTarget = findSuspiciousOverlay(event?.target);
    if (fromTarget) return fromTarget;

    // Re-check the actual hit-tested node at the pointer position. This catches
    // document-level capture listeners even when the event target/path is unusual.
    const point = eventClientPoint(event);
    if (point) {
      try {
        const hit = document.elementFromPoint(point.x, point.y);
        const candidate = findSuspiciousOverlay(hit);
        if (candidate) return candidate;
      } catch (_) {}
    }

    // Fast path for the verified acscdn/aclib signature. It remains structural:
    // an unrelated #dontfoid that is not a transparent fullscreen catcher is ignored.
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

  function neutralizeClickOverlay(el, reason = 'detected') {
    if (!protectionEnabled || !el?.isConnected) return false;
    const origin = currentOrigin;
    if (isRuleAllowed('click-overlay', origin)) return false;

    const existingState = blockedOverlayState.get(el);
    if (existingState) {
      // The ad script may reuse the same node and rewrite its inline style. Re-apply
      // neutralization without creating duplicate telemetry/state.
      try { el.style.setProperty('pointer-events', 'none', 'important'); } catch (_) {}
      try { el.style.setProperty('display', 'none', 'important'); } catch (_) {}
      overlaySuppressionUntil = Date.now() + 900;
      overlayPendingActivationUntil = Date.now() + 60000;
      overlayAttackPersistent = true;
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

    // pointer-events:none is applied first so the layer stops capturing input even
    // if the site races to rewrite display. display:none then removes the visual/
    // hit-test layer without removing the DOM node (avoids recreate/remove loops).
    try { el.style.setProperty('pointer-events', 'none', 'important'); } catch (_) {}
    try { el.style.setProperty('display', 'none', 'important'); } catch (_) {}

    overlaySuppressionUntil = Date.now() + 900;
    overlayAttackPersistent = true;
    // The overlay can be hidden by the observer before the user clicks, while the
    // ad library's document-capture listener remains registered. Keep a one-shot
    // activation shield armed long enough to swallow the next physical click.
    overlayPendingActivationUntil = Date.now() + 60000;
    const classification = candidate.classification || reason;
    recordBlocked('click-overlay', location.href, {
      origin,
      classification: reason && reason !== 'detected' ? `${classification}:${reason}` : classification,
    });
    showToast(trEngine('toast_click_overlay'));
    return true;
  }

  function scanTopmostClickOverlay() {
    if (!protectionEnabled || !document.documentElement) return false;

    // Verified real-world fast path first.
    try {
      const known = document.getElementById('dontfoid');
      const knownCandidate = overlayCandidateScore(known);
      if (knownCandidate && neutralizeClickOverlay(knownCandidate.el, 'known-signature')) return true;
    } catch (_) {}

    const vw = Math.max(1, innerWidth || document.documentElement.clientWidth || 1);
    const vh = Math.max(1, innerHeight || document.documentElement.clientHeight || 1);
    const points = [
      [0.50, 0.50], [0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92],
    ];
    const hits = new Map();
    for (const [px, py] of points) {
      let target = null;
      try { target = document.elementFromPoint(Math.floor(vw * px), Math.floor(vh * py)); } catch (_) {}
      const candidate = findSuspiciousOverlay(target);
      if (!candidate) continue;
      const count = (hits.get(candidate.el) || 0) + 1;
      hits.set(candidate.el, count);
      if (count >= 3) return neutralizeClickOverlay(candidate.el, 'hit-test');
    }
    return false;
  }

  function scheduleOverlayScan(delay = 24) {
    if (!protectionEnabled || overlayScanScheduled) return;
    overlayScanScheduled = true;
    setTimeout(() => {
      overlayScanScheduled = false;
      scanTopmostClickOverlay();
    }, delay);
  }

  function overlayPointerMoveHandler(event) {
    if (!protectionEnabled) return;
    const now = Date.now();
    if (now - lastOverlayHoverCheckAt < 150) return;
    lastOverlayHoverCheckAt = now;
    const candidate = findSuspiciousOverlayFromEvent(event);
    if (candidate) neutralizeClickOverlay(candidate.el, 'hover');
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
    // Do not arm child-tab quarantine for an explicit login/register gesture.
    // Known acscdn listeners are already suppressed once the attack is verified;
    // quarantining the legitimate auth popup here would close the user's sign-in UI.
    if (isAuthUiTarget(event.target)) return;
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

    // Login/register UI must remain usable even after a previously-detected
    // popunder overlay armed persistent protection for this document. Once the
    // malicious DOM catcher is gone, an explicit auth gesture should not be
    // swallowed or quarantined as an ad activation.
    if (event?.isTrusted === true && isAuthUiTarget(event.target)) {
      lastTrustedAuthActivationUntil = Date.now() + 1800;
      return;
    }

    const now = Date.now();
    const candidate = findSuspiciousOverlayFromEvent(event);
    if (candidate) {
      // WINDOW capture runs before DOCUMENT capture. Neutralize first, then swallow
      // this physical activation so document-level aclib listeners never see it.
      // Respect an explicit global click-overlay ALLOW rule.
      if (!neutralizeClickOverlay(candidate.el, `capture-${event.type}`)) return;
      emitPersistentOverlayActivation(event);
      overlayPendingActivationUntil = 0;
      overlaySuppressionUntil = now + 1500;
      stopOverlayActivationEvent(event);
      return;
    }

    if (now < overlayPendingActivationUntil) {
      // An observer/hover scan may have hidden the overlay seconds before the user
      // actually clicks. The document capture listener can still be armed. Consume
      // the first physical activation, but DO NOT clear persistent attack state:
      // the hostile capture listener can remain alive for the rest of the document.
      emitPersistentOverlayActivation(event);
      overlayPendingActivationUntil = 0;
      overlaySuppressionUntil = now + 1500;
      stopOverlayActivationEvent(event);
      return;
    }

    if (now < overlaySuppressionUntil) {
      // Browsers may still dispatch the rest of an activation sequence after the
      // overlay was hidden during pointerdown/touchstart.
      stopOverlayActivationEvent(event);
      return;
    }

    // The DOM catcher is gone, but the acscdn window/document capture listener can
    // survive indefinitely. Do not swallow normal page clicks here; instead send an
    // authenticated activation heartbeat so background can quarantine any child tab
    // created by the surviving popunder listener. This repeats for every later
    // physical activation until navigation, Protection OFF, or explicit ALLOW.
    emitPersistentOverlayActivation(event);
  }

  function inspectAddedOverlayNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const direct = overlayCandidateScore(node);
    if (direct && neutralizeClickOverlay(direct.el, 'mutation')) return true;
    try {
      const known = node.id === 'dontfoid' ? node : node.querySelector?.('#dontfoid');
      const candidate = overlayCandidateScore(known);
      if (candidate && neutralizeClickOverlay(candidate.el, 'mutation-known')) return true;
    } catch (_) {}
    return false;
  }

  const OVERLAY_CAPTURE_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click', 'auxclick', 'contextmenu'];

  function setupClickOverlayGuard() {
    if (!protectionEnabled || overlayObserver) return;

    // pointermove is only a proactive detector. Activation events are intercepted
    // at window capture with passive:false, before document capture listeners.
    window.addEventListener('pointermove', overlayPointerMoveHandler, { capture: true, passive: true });
    for (const type of OVERLAY_CAPTURE_EVENTS) {
      window.addEventListener(type, overlayActivationCaptureHandler, { capture: true, passive: false });
    }

    overlayObserver = new MutationObserver((mutations) => {
      if (!protectionEnabled) return;
      cleanupDetachedClickOverlays();
      let needsScan = false;
      for (const mutation of mutations) {
        if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue;
        for (const node of mutation.addedNodes) {
          if (inspectAddedOverlayNode(node)) return;
          needsScan = true;
        }
      }
      if (needsScan) scheduleOverlayScan(16);
    });
    overlayObserver.observe(document.documentElement || document, { childList: true, subtree: true });

    overlayScanTimer = setInterval(() => {
      if (!protectionEnabled) return;
      enforceBlockedClickOverlays();
      scanTopmostClickOverlay();
    }, 750);
    scheduleOverlayScan(0);
  }

  function stopClickOverlayGuard() {
    if (overlayObserver) { overlayObserver.disconnect(); overlayObserver = null; }
    if (overlayScanTimer) { clearInterval(overlayScanTimer); overlayScanTimer = null; }
    overlayScanScheduled = false;
    overlaySuppressionUntil = 0;
    overlayPendingActivationUntil = 0;
    overlayAttackPersistent = false;
    lastOverlayActivationTelemetryAt = 0;
    lastTrustedAuthActivationUntil = 0;
    lastAuthActivationTelemetryAt = 0;
    knownOverlayVendorEvidence = false;
    lastOverlayVendorScanAt = 0;
    window.removeEventListener('pointermove', overlayPointerMoveHandler, true);
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

    // A trusted click on an actual login/register control may legitimately open a
    // same-origin dialog window or an OAuth/auth endpoint. Keep this exception
    // gesture-bound and short-lived so generic /go -> ad redirect popups stay blocked.
    if (shouldAllowTrustedAuthNavigation(url)) {
      return originalWindowOpen.call(window, url, name, features);
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

  try {
    const navigationApi = window.navigation;
    if (navigationApi?.addEventListener) {
      navigationApi.addEventListener('navigate', (event) => {
        if (!protectionEnabled) return;
        const destinationUrl = event.destination?.url;
        if (!destinationUrl || !isCrossOrigin(destinationUrl)) return;
        const origin = getOrigin(destinationUrl, currentOrigin);
        if (isRuleAllowed('redirect', origin)) return;
        const guarded = isTabUnderGuardActive();
        const programmatic = event.userInitiated === false;
        if (!guarded && !programmatic) return;
        if (event.cancelable) {
          event.preventDefault();
          recordBlocked('redirect', destinationUrl, { origin });
          showToast(guarded
            ? trEngine('toast_redirect_tab_under', { host: displayHost(origin) })
            : trEngine('toast_redirect_prog', { host: displayHost(origin) }));
          console.warn('[AdsControl] Navigation API blocked:', destinationUrl, guarded ? tabUnderGuardReason : 'programmatic');
        }
      });
    }
  } catch (_) {}

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
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      recordBlocked('external-link', rawHref, { origin: 'javascript:' });
      showToast(trEngine('toast_js_link'));
      return false;
    }

    if (!resolvedHref) return;
    if (shouldAllowTrustedAuthNavigation(resolvedHref, anchor)) return;
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

  function shouldBlockRedirect(url, source) {
    if (!protectionEnabled || !isCrossOrigin(url)) return false;
    const origin = getOrigin(url, currentOrigin);
    if (isRuleAllowed('redirect', origin)) return false;
    recordBlocked('redirect', url, { origin });
    showToast(trEngine('toast_redirect', { host: displayHost(origin) }));
    console.warn('[AdsControl] blocked redirect via', source, url);
    return true;
  }

  let locationProto = null;
  try { locationProto = window.Location?.prototype; } catch (_) {}
  if (locationProto) {
    try {
      const originalAssign = locationProto.assign;
      if (typeof originalAssign === 'function') locationProto.assign = function(url) {
        if (shouldBlockRedirect(url, 'location.assign')) return;
        return originalAssign.call(this, url);
      };
    } catch (_) {}
    try {
      const originalReplace = locationProto.replace;
      if (typeof originalReplace === 'function') locationProto.replace = function(url) {
        if (shouldBlockRedirect(url, 'location.replace')) return;
        return originalReplace.call(this, url);
      };
    } catch (_) {}
    try {
      const desc = Object.getOwnPropertyDescriptor(locationProto, 'href');
      if (desc?.get && desc?.set) {
        const originalSetter = desc.set;
        Object.defineProperty(location, 'href', {
          get: desc.get,
          set(url) {
            if (shouldBlockRedirect(url, 'location.href')) return;
            return originalSetter.call(this, url);
          },
          configurable: true,
        });
      }
    } catch (_) {}
  }

  document.addEventListener('submit', (e) => {
    if (!protectionEnabled) return;
    const form = e.target;
    if (!form?.action) return;
    const target = String(form.getAttribute('target') || '').trim().toLowerCase();
    const newContext = target === '_blank' || (target && target !== '_self' && target !== '_top' && target !== '_parent');
    if (shouldAllowTrustedAuthNavigation(form.action, form)) return;
    if (!newContext && !isCrossOrigin(form.action)) return;
    const origin = getOrigin(form.action, currentOrigin);
    if (isRuleAllowed('form', origin)) return;
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
        : 'smart',
      showPageToasts: config.settings?.showPageToasts !== false,
      language: ['vi', 'en', 'zh'].includes(config.settings?.language) ? config.settings.language : 'en',
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
        overlayPendingActivationUntil = 0;
        overlaySuppressionUntil = 0;
        overlayAttackPersistent = false;
        lastOverlayActivationTelemetryAt = 0;
      }
    }

    const iframePolicyChanged = iframeRulesChanged(oldAllow, allowRules);
    const metaPolicyChanged = metaRulesChanged(oldAllow, allowRules);
    const overlayPolicyChanged = clickOverlayRulesChanged(oldAllow, allowRules);
    if (oldMode !== settings.smartPlayerMode || iframePolicyChanged) rescanIframes();
    if (metaPolicyChanged) rescanMetaRefreshes();
    if (overlayPolicyChanged && !isRuleAllowed('click-overlay', currentOrigin)) scheduleOverlayScan(0);
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
