(() => {
  'use strict';

  const S = globalThis.DBlockerShared || globalThis.AdsControlShared;
  const { ruleKey, parseRuleKey, displayHost, t, getTypeLabel } = S;

  const els = {
    langSelect: document.getElementById('langSelect'),
    currentHost: document.getElementById('currentHost'),
    copyHostBtn: document.getElementById('copyHostBtn'),
    protectionCard: document.getElementById('protectionCard'),
    protectionStateText: document.getElementById('protectionStateText'),
    siteKeyHint: document.getElementById('siteKeyHint'),
    protectionSwitch: document.getElementById('protectionSwitch'),
    tabBlock: document.getElementById('tabBlock'),
    tabAllow: document.getElementById('tabAllow'),
    tabSites: document.getElementById('tabSites'),
    tabBlockCount: document.getElementById('tabBlockCount'),
    tabAllowCount: document.getElementById('tabAllowCount'),
    tabSitesCount: document.getElementById('tabSitesCount'),
    tabBlockLabel: document.querySelector('#tabBlock .tab-label'),
    tabAllowLabel: document.querySelector('#tabAllow .tab-label'),
    tabSitesLabel: document.querySelector('#tabSites .tab-label'),
    list: document.getElementById('list'),
    clearBtn: document.getElementById('clearBtn'),
    clearBtnText: document.querySelector('#clearBtn span'),
    supportBtn: document.getElementById('supportBtn'),
    optionsBtn: document.getElementById('optionsBtn'),
    reloadTabBtn: document.getElementById('reloadTabBtn'),
    status: document.getElementById('status'),
    blockedTotal: document.getElementById('blockedTotal'),
    blockedTotalLabel: document.getElementById('blockedTotalLabel'),
    blockedSummary: document.getElementById('blockedSummary'),
    currentSiteEyebrow: document.getElementById('currentSiteEyebrow'),
  };

  let activeTab = 'block';
  let browserTab = null;
  let config = { enabledSites: [], allowRules: [], settings: {} };
  let tabState = { items: {}, page: null };
  let hostname = '';
  let currentSiteKey = '';
  let statusTimer = null;
  let pendingFocus = null;
  let pendingFocusLoaded = false;

  function currentLang() {
    return config.settings?.language || 'vi';
  }

  function tr(key, params) {
    return t(key, currentLang(), params);
  }

  function setStatus(text, duration = 3000) {
    if (!els.status) return;
    els.status.textContent = text || tr('status_ready');
    if (statusTimer) clearTimeout(statusTimer);
    if (text) {
      statusTimer = setTimeout(() => {
        if (els.status) els.status.textContent = tr('status_ready');
      }, duration);
    }
  }

  function currentMatchingKeys() {
    return S.matchingEnabledSiteKeys(config.enabledSites, hostname);
  }

  function isProtectionOn() {
    return currentMatchingKeys().length > 0;
  }

  async function saveEnabledSites(next) {
    config.enabledSites = await S.setEnabledSites(next);
  }

  async function saveAllowRules(next) {
    config.allowRules = await S.setAllowRules(next);
  }

  async function refresh() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    browserTab = tabs[0] || null;
    config = await S.getConfig();

    try {
      const url = browserTab?.url ? new URL(browserTab.url) : null;
      hostname = url && /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase() : '';
    } catch (_) {
      hostname = '';
    }
    currentSiteKey = hostname ? S.getSiteKey(hostname) : '';

    if (browserTab?.id != null) {
      const response = await chrome.runtime.sendMessage({ type: 'ADS_GET_TAB_STATE', tabId: browserTab.id });
      tabState = response?.state || { items: {}, page: null };
      if (!pendingFocusLoaded) {
        pendingFocusLoaded = true;
        const focusResponse = await chrome.runtime.sendMessage({ type: 'ADS_GET_PENDING_FOCUS', tabId: browserTab.id });
        pendingFocus = focusResponse?.focus || null;
        if (pendingFocus?.type && pendingFocus?.origin) activeTab = 'block';
      }
    } else {
      tabState = { items: {}, page: null };
    }

    render();
  }

  function visibleBlockedItems() {
    const allowed = new Set(config.allowRules);
    return Object.values(tabState.items || {})
      .filter((item) => !allowed.has(ruleKey(item.type, item.origin)))
      .sort((a, b) => {
        const aFocus = pendingFocus && a.type === pendingFocus.type && a.origin === pendingFocus.origin ? 1 : 0;
        const bFocus = pendingFocus && b.type === pendingFocus.type && b.origin === pendingFocus.origin ? 1 : 0;
        return bFocus - aFocus || (b.lastBlockedAt || 0) - (a.lastBlockedAt || 0);
      });
  }

  function allowItems() {
    return config.allowRules.map(parseRuleKey).filter(Boolean).sort((a, b) => {
      const host = displayHost(a.origin).localeCompare(displayHost(b.origin));
      return host || a.type.localeCompare(b.type);
    });
  }

  function renderHeader() {
    const lang = currentLang();
    if (els.currentSiteEyebrow) els.currentSiteEyebrow.textContent = lang === 'vi' ? 'Trang web hiện tại' : lang === 'zh' ? '当前网站' : 'Current website';
    if (els.langSelect) {
      els.langSelect.value = currentLang();
    }
    els.reloadTabBtn.title = tr('reload_tooltip');
    if (els.supportBtn) {
      els.supportBtn.title = tr('support_tooltip');
      els.supportBtn.setAttribute('aria-label', tr('support_tooltip'));
    }
    els.optionsBtn.title = tr('options_tooltip');
    els.copyHostBtn.title = tr('copy_tooltip');
    els.protectionCard.querySelector('.switch')?.setAttribute('title', tr('switch_tooltip'));

    if (hostname) {
      els.currentHost.textContent = hostname;
      const on = isProtectionOn();
      els.protectionSwitch.disabled = false;
      els.protectionSwitch.checked = on;

      if (on) {
        els.protectionCard.className = 'protection-card active';
        els.protectionStateText.textContent = tr('status_active');
        els.siteKeyHint.textContent = tr('hint_site_active', { site: currentSiteKey });
      } else {
        els.protectionCard.className = 'protection-card inactive';
        els.protectionStateText.textContent = tr('status_inactive');
        els.siteKeyHint.textContent = tr('hint_site_enable', { site: currentSiteKey });
      }
    } else {
      els.currentHost.textContent = tr('internal_page');
      els.protectionCard.className = 'protection-card';
      els.protectionStateText.textContent = tr('status_unsupported');
      els.siteKeyHint.textContent = tr('hint_system_page');
      els.protectionSwitch.checked = false;
      els.protectionSwitch.disabled = true;
    }
  }

  function renderSummary(blocked) {
    if (!els.blockedTotal || !els.blockedSummary) return;
    const total = blocked.reduce((sum, item) => sum + Math.max(1, Number(item.count) || 1), 0);
    els.blockedTotal.textContent = String(total);
    const lang = currentLang();
    if (els.blockedTotalLabel) {
      els.blockedTotalLabel.textContent = lang === 'vi' ? 'đã chặn trên trang này' : lang === 'zh' ? '已在此页面拦截' : 'blocked on this page';
    }
    if (!blocked.length) {
      els.blockedSummary.textContent = lang === 'vi' ? 'Chưa phát hiện hoạt động bị chặn' : lang === 'zh' ? '尚未检测到拦截活动' : 'No blocked activity detected';
      return;
    }
    const grouped = new Map();
    for (const item of blocked) {
      const type = item.type || 'other';
      grouped.set(type, (grouped.get(type) || 0) + Math.max(1, Number(item.count) || 1));
    }
    els.blockedSummary.textContent = [...grouped.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${count} ${getTypeLabel(type, lang)}`)
      .join(' · ');
  }

  function renderTabs(blockCount, allowCount) {
    if (els.tabBlockLabel) els.tabBlockLabel.textContent = tr('tab_blocked');
    if (els.tabAllowLabel) els.tabAllowLabel.textContent = tr('tab_allowed');
    if (els.tabSitesLabel) els.tabSitesLabel.textContent = tr('tab_sites');
    if (els.clearBtnText) els.clearBtnText.textContent = tr('btn_clear_log');
    if (els.clearBtn) els.clearBtn.title = tr('btn_clear_log');

    els.tabBlockCount.textContent = String(blockCount);
    els.tabAllowCount.textContent = String(allowCount);
    els.tabSitesCount.textContent = String(config.enabledSites.length);

    els.tabBlock.classList.toggle('active', activeTab === 'block');
    els.tabAllow.classList.toggle('active', activeTab === 'allow');
    els.tabSites.classList.toggle('active', activeTab === 'sites');

    els.clearBtn.classList.toggle('visibility-hidden', activeTab !== 'block');
  }

  function createSvgIcon(kind, size = 11) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const strokeWidth = kind === 'empty' ? '1.8' : '2.5';
    for (const [name, value] of Object.entries({
      viewBox: '0 0 24 24', width: String(size), height: String(size),
      stroke: 'currentColor', 'stroke-width': strokeWidth, fill: 'none',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    })) svg.setAttribute(name, value);

    const add = (tag, attrs) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      svg.appendChild(node);
    };

    if (kind === 'empty') {
      add('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' });
      add('path', { d: 'm9 12 2 2 4-4' });
    } else if (kind === 'play') {
      add('polygon', { points: '5 3 19 12 5 21 5 3' });
    } else if (kind === 'check') {
      add('polyline', { points: '20 6 9 17 4 12' });
    } else if (kind === 'close') {
      add('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
      add('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
    } else if (kind === 'trash') {
      add('polyline', { points: '3 6 5 6 21 6' });
      add('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' });
    }
    return svg;
  }

  function appendButtonContent(button, iconKind, label) {
    const text = document.createElement('span');
    text.textContent = label;
    button.append(createSvgIcon(iconKind), text);
  }

  function createEmptyState(title, desc) {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.appendChild(createSvgIcon('empty', 24));
    const titleEl = document.createElement('div');
    titleEl.className = 'empty-title';
    titleEl.textContent = title;
    const descEl = document.createElement('div');
    descEl.className = 'empty-desc';
    descEl.textContent = desc;
    wrap.append(icon, titleEl, descEl);
    return wrap;
  }

  function makeBlockedRow(item) {
    const card = document.createElement('div');
    card.className = 'item-card';
    if (pendingFocus && item.type === pendingFocus.type && item.origin === pendingFocus.origin) {
      card.classList.add('focused-item');
    }

    const top = document.createElement('div');
    top.className = 'item-top';

    const main = document.createElement('div');
    main.className = 'item-main';

    const host = document.createElement('div');
    host.className = 'item-host';
    host.textContent = item.host || displayHost(item.origin);
    host.title = item.host || displayHost(item.origin);

    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.append(document.createTextNode(`${tr('blocked_meta')} `));
    const countChip = document.createElement('span');
    countChip.className = 'item-count-chip';
    countChip.textContent = `×${Number.isFinite(Number(item.count)) ? Math.max(1, Number(item.count)) : 1}`;
    meta.appendChild(countChip);
    if (item.type === 'iframe' && item.classification) {
      const classification = String(item.classification).slice(0, 32);
      const score = Number.isFinite(item.classificationScore) ? ` (${item.classificationScore})` : '';
      meta.append(document.createTextNode(` · ${classification}${score}`));
    }

    main.append(host, meta);

    const typePill = document.createElement('span');
    const typeKey = String(item.type || '').toLowerCase();
    typePill.className = `type-pill ${typeKey}`;
    typePill.textContent = getTypeLabel(item.type, currentLang());

    top.append(main, typePill);
    card.appendChild(top);

    if (item.lastUrl && item.lastUrl !== item.origin) {
      const url = document.createElement('div');
      url.className = 'item-url';
      url.title = item.lastUrl;
      url.textContent = item.lastUrl;
      card.appendChild(url);
    }

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const isVideoPlayer = item.type === 'iframe' && item.classification === 'player';

    if (item.type === 'iframe' && !isVideoPlayer) {
      const loadOnceBtn = document.createElement('button');
      loadOnceBtn.className = 'btn-chip primary';
      appendButtonContent(loadOnceBtn, 'play', tr('load_once'));
      loadOnceBtn.addEventListener('click', async () => {
        if (browserTab?.id == null) return;
        await chrome.runtime.sendMessage({ type: 'ADS_ALLOW_ONCE', tabId: browserTab.id, origin: item.origin });
        setStatus(tr('loaded_once_status', { host: item.host || displayHost(item.origin) }));
      });
      actions.appendChild(loadOnceBtn);
    }

    const allowBtn = document.createElement('button');
    allowBtn.className = 'btn-chip allow';
    appendButtonContent(allowBtn, 'check', isVideoPlayer ? tr('always_allow') : tr('allow'));
    allowBtn.addEventListener('click', async () => {
      const key = ruleKey(item.type, item.origin);
      await saveAllowRules([...config.allowRules, key]);
      setStatus(tr('allowed_status', { host: item.host || displayHost(item.origin) }));

      // Video player: persistent allow should take effect from a clean page load.
      // Reloading avoids restoring a half-initialized player that was previously held.
      if (isVideoPlayer && browserTab?.id != null) {
        try {
          await chrome.tabs.reload(browserTab.id);
          window.close();
        } catch (_) {
          await refresh();
        }
        return;
      }

      await refresh();
    });
    actions.appendChild(allowBtn);

    card.appendChild(actions);
    return card;
  }

  function makeAllowRow(rule) {
    const card = document.createElement('div');
    card.className = 'item-card';

    const top = document.createElement('div');
    top.className = 'item-top';

    const main = document.createElement('div');
    main.className = 'item-main';

    const host = document.createElement('div');
    host.className = 'item-host';
    host.textContent = displayHost(rule.origin);
    host.title = rule.origin;

    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = tr('global_rule');

    main.append(host, meta);

    const typePill = document.createElement('span');
    const typeKey = String(rule.type || '').toLowerCase();
    typePill.className = `type-pill ${typeKey}`;
    typePill.textContent = getTypeLabel(rule.type, currentLang());

    top.append(main, typePill);
    card.appendChild(top);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const blockBtn = document.createElement('button');
    blockBtn.className = 'btn-chip danger';
    appendButtonContent(blockBtn, 'close', tr('block_again'));
    blockBtn.addEventListener('click', async () => {
      const key = ruleKey(rule.type, rule.origin);
      await saveAllowRules(config.allowRules.filter((entry) => entry !== key));
      setStatus(tr('unallowed_status', { host: displayHost(rule.origin) }));
      await refresh();
    });
    actions.appendChild(blockBtn);

    card.appendChild(actions);
    return card;
  }

  function makeSiteRow(siteKey) {
    const card = document.createElement('div');
    card.className = 'item-card';

    const top = document.createElement('div');
    top.className = 'item-top';

    const main = document.createElement('div');
    main.className = 'item-main';

    const host = document.createElement('div');
    const isCurrent = hostname && S.siteKeyMatchesHostname(siteKey, hostname);
    host.className = `item-host ${isCurrent ? 'current-site' : ''}`;
    host.textContent = siteKey;

    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = isCurrent ? tr('site_meta_current') : tr('site_meta_tld');

    main.append(host, meta);

    const typePill = document.createElement('span');
    typePill.className = 'type-pill';
    typePill.textContent = isCurrent ? tr('site_pill_active') : tr('site_pill_site');
    top.append(main, typePill);
    card.appendChild(top);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-chip danger';
    appendButtonContent(removeBtn, 'trash', tr('remove'));
    removeBtn.addEventListener('click', async () => {
      await saveEnabledSites(config.enabledSites.filter((key) => key !== siteKey));
      setStatus(tr('removed_site_status', { site: siteKey }));
      await refresh();
    });
    actions.appendChild(removeBtn);

    card.appendChild(actions);
    return card;
  }

  function renderSites() {
    const addWrap = document.createElement('div');
    addWrap.className = 'site-add-box';

    const input = document.createElement('input');
    input.className = 'site-input';
    input.placeholder = tr('site_input_placeholder');

    const addBtn = document.createElement('button');
    addBtn.className = 'site-add-btn';
    addBtn.textContent = tr('add_site');

    const handleAdd = async () => {
      const key = S.normalizeSiteKeyInput(input.value);
      if (!key) {
        setStatus(tr('invalid_domain_status'));
        return;
      }
      if (config.enabledSites.includes(key)) {
        setStatus(tr('site_exists_status'));
        return;
      }
      await saveEnabledSites([...config.enabledSites, key]);
      input.value = '';
      if (hostname && S.siteKeyMatchesHostname(key, hostname) && browserTab?.id != null) {
        setStatus(tr('reloading_tab_status'));
        await chrome.tabs.reload(browserTab.id);
        window.close();
        return;
      }
      setStatus(tr('added_site_status', { site: key }));
      await refresh();
    };

    addBtn.addEventListener('click', handleAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdd();
    });

    addWrap.append(input, addBtn);
    els.list.appendChild(addWrap);

    const sorted = [...config.enabledSites].sort();
    if (!sorted.length) {
      els.list.appendChild(createEmptyState(tr('empty_sites_title'), tr('empty_sites_desc')));
      return;
    }

    for (const key of sorted) {
      els.list.appendChild(makeSiteRow(key));
    }
  }

  function render() {
    renderHeader();
    const blocked = visibleBlockedItems();
    const allowed = allowItems();
    renderTabs(blocked.length, allowed.length);
    renderSummary(blocked);

    els.list.replaceChildren();

    if (activeTab === 'block') {
      if (!blocked.length) {
        els.list.appendChild(createEmptyState(tr('empty_blocked_title'), tr('empty_blocked_desc')));
      } else {
        for (const item of blocked) {
          els.list.appendChild(makeBlockedRow(item));
        }
      }
    } else if (activeTab === 'allow') {
      if (!allowed.length) {
        els.list.appendChild(createEmptyState(tr('empty_allowed_title'), tr('empty_allowed_desc')));
      } else {
        for (const rule of allowed) {
          els.list.appendChild(makeAllowRow(rule));
        }
      }
    } else {
      renderSites();
    }
  }

  // Event Listeners
  if (els.langSelect) {
    els.langSelect.addEventListener('change', async () => {
      const lang = els.langSelect.value;
      config.settings = { ...config.settings, language: lang };
      config.settings = await S.setSettings(config.settings);
      render();
      setStatus(tr('status_ready'));
    });
  }

  els.protectionSwitch.addEventListener('change', async () => {
    if (!hostname || !currentSiteKey) return;
    const shouldEnable = els.protectionSwitch.checked;

    if (shouldEnable) {
      await saveEnabledSites([...config.enabledSites, currentSiteKey]);
      setStatus(tr('reloading_tab_status'));
      if (browserTab?.id != null) {
        await chrome.tabs.reload(browserTab.id);
        window.close();
        return;
      }
      setStatus(tr('protection_on_status', { site: currentSiteKey }));
    } else {
      const matching = new Set(currentMatchingKeys());
      await saveEnabledSites(config.enabledSites.filter((key) => !matching.has(key)));
      setStatus(tr('protection_off_status', { host: hostname }));
    }
    await refresh();
  });

  for (const [name, el] of [['block', els.tabBlock], ['allow', els.tabAllow], ['sites', els.tabSites]]) {
    el.addEventListener('click', () => {
      activeTab = name;
      render();
    });
  }

  els.clearBtn.addEventListener('click', async () => {
    if (browserTab?.id == null) return;
    await chrome.runtime.sendMessage({ type: 'ADS_CLEAR_TAB_STATE', tabId: browserTab.id });
    tabState = { items: {}, page: null };
    setStatus(tr('cleared_log_status'));
    render();
  });

  els.copyHostBtn.addEventListener('click', async () => {
    if (!hostname) return;
    try {
      await navigator.clipboard.writeText(hostname);
      setStatus(tr('copied_status', { text: hostname }));
    } catch (_) {
      setStatus(tr('cannot_copy_status'));
    }
  });

  els.reloadTabBtn.addEventListener('click', async () => {
    if (els.reloadTabBtn.disabled) return;
    els.reloadTabBtn.disabled = true;
    setStatus(tr('reloading_tab_status'));

    try {
      // Resolve the active tab again at click time instead of relying on the
      // snapshot captured when the popup first opened, and await the reload
      // so browser errors are not silently lost.
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTab = tabs[0] || browserTab;
      if (targetTab?.id == null) throw new Error('No active tab to reload');

      browserTab = targetTab;
      await chrome.tabs.reload(targetTab.id);
      window.close();
    } catch (error) {
      console.warn('[DBlocker] Could not reload active tab:', error);
      els.reloadTabBtn.disabled = false;
      setStatus(tr('reload_failed_status'));
    }
  });

  if (els.supportBtn) {
    els.supportBtn.addEventListener('click', () => {
      const url = chrome.runtime.getURL('options/options.html#support');
      chrome.tabs.create({ url });
      window.close();
    });
  }

  els.optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener(() => refresh().catch(() => {}));
  refresh().catch((error) => setStatus(String(error?.message || error)));
})();
