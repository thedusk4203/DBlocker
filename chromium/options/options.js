(() => {
  'use strict';

  const S = globalThis.DBlockerShared || globalThis.AdsControlShared;
  const SUPPORT = globalThis.DBlockerSupport || { links: [], bankAccounts: [] };
  const extensionApi = globalThis.browser || globalThis.chrome;
  const { parseRuleKey, displayHost, t, getTypeLabel } = S;

  const els = {
    pageTitle: document.getElementById('pageTitle'),
    heroDesc: document.getElementById('heroDesc'),
    settingsEyebrow: document.getElementById('settingsEyebrow'),
    settingsHeading: document.getElementById('settingsHeading'),
    extensionActiveText: document.getElementById('extensionActiveText'),
    navGeneral: document.getElementById('navGeneral'),
    navProtection: document.getElementById('navProtection'),
    navLists: document.getElementById('navLists'),
    navBackup: document.getElementById('navBackup'),
    langSectionDesc: document.getElementById('langSectionDesc'),
    behaviorSectionDesc: document.getElementById('behaviorSectionDesc'),
    listsSectionDesc: document.getElementById('listsSectionDesc'),
    backupSectionDesc: document.getElementById('backupSectionDesc'),
    langSectionTitle: document.getElementById('langSectionTitle'),
    languageRadios: document.querySelectorAll('input[name="languageRadio"]'),
    langBadgeVi: document.getElementById('langBadgeVi'),
    langBadgeEn: document.getElementById('langBadgeEn'),
    langBadgeZh: document.getElementById('langBadgeZh'),
    behaviorSectionTitle: document.getElementById('behaviorSectionTitle'),
    smartModeTitle: document.getElementById('smartModeTitle'),
    smartModeDesc: document.getElementById('smartModeDesc'),
    smartBadge: document.getElementById('smartBadge'),
    smartDetail: document.getElementById('smartDetail'),
    strictBadge: document.getElementById('strictBadge'),
    strictDetail: document.getElementById('strictDetail'),
    compatBadge: document.getElementById('compatBadge'),
    compatDetail: document.getElementById('compatDetail'),
    smartMode: document.getElementById('smartMode'),
    smartModeRadios: document.querySelectorAll('input[name="smartModeRadio"]'),
    toastsTitle: document.getElementById('toastsTitle'),
    toastsDesc: document.getElementById('toastsDesc'),
    showToasts: document.getElementById('showToasts'),
    listsSectionTitle: document.getElementById('listsSectionTitle'),
    tabSitesTitle: document.getElementById('tabSitesTitle'),
    tabAllowTitle: document.getElementById('tabAllowTitle'),
    sitesCount: document.getElementById('sitesCount'),
    allowCount: document.getElementById('allowCount'),
    siteInput: document.getElementById('siteInput'),
    addSiteBtn: document.getElementById('addSiteBtn'),
    addSiteText: document.getElementById('addSiteText'),
    tipSitesText: document.getElementById('tipSitesText'),
    tipAllowText: document.getElementById('tipAllowText'),
    sitesList: document.getElementById('sitesList'),
    allowList: document.getElementById('allowList'),
    sitesPanel: document.getElementById('sitesPanel'),
    allowPanel: document.getElementById('allowPanel'),
    supportSection: document.getElementById('support'),
    supportSectionTitle: document.getElementById('supportSectionTitle'),
    supportLinks: document.getElementById('supportLinks'),
    supportBanks: document.getElementById('supportBanks'),
    supportUnconfigured: document.getElementById('supportUnconfigured'),
    backupSectionTitle: document.getElementById('backupSectionTitle'),
    exportBtn: document.getElementById('exportBtn'),
    exportText: document.getElementById('exportText'),
    importInput: document.getElementById('importInput'),
    importText: document.getElementById('importText'),
    resetBtn: document.getElementById('resetBtn'),
    resetText: document.getElementById('resetText'),
    toastNotification: document.getElementById('toastNotification'),
  };

  let config = { enabledSites: [], allowRules: [], settings: {} };
  let toastTimeout = null;

  function currentLang() {
    return config.settings?.language || 'vi';
  }

  function tr(key, params) {
    return t(key, currentLang(), params);
  }

  function showToast(message, isError = false) {
    if (!els.toastNotification) return;
    els.toastNotification.textContent = message;
    els.toastNotification.classList.toggle('error', isError);
    els.toastNotification.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      els.toastNotification.classList.remove('show');
    }, 2800);
  }

  function getSupportLinks() {
    const input = Array.isArray(SUPPORT.links) ? SUPPORT.links : [];
    const out = [];
    for (const item of input.slice(0, 6)) {
      const label = String(item?.label || '').trim().slice(0, 40);
      const rawUrl = String(item?.url || '').trim();
      if (!label || !rawUrl) continue;
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:') continue;
        out.push({ label, url: parsed.href });
      } catch (_) {}
    }
    return out;
  }

  function getBankAccounts() {
    const input = Array.isArray(SUPPORT.bankAccounts) ? SUPPORT.bankAccounts : [];
    const out = [];
    for (const item of input.slice(0, 4)) {
      const bank = String(item?.bank || '').trim().slice(0, 40);
      const accountNumber = String(item?.accountNumber || '').replace(/\s+/g, '').trim();
      const qrAsset = String(item?.qrAsset || '').trim();
      if (!bank || !/^\d{6,24}$/.test(accountNumber)) continue;
      const safeQrAsset = /^assets\/[A-Za-z0-9_\/-]+\.png$/.test(qrAsset) && !qrAsset.includes('..')
        ? qrAsset
        : '';
      out.push({ bank, accountNumber, qrAsset: safeQrAsset });
    }
    return out;
  }

  async function copySupportText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createSupportIcon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const iconAttrs = kind === 'tpbank'
      ? { class: 'channel-svg tpbank-svg', viewBox: '0 0 28 28', width: '24', height: '24', fill: 'none' }
      : kind === 'paypal'
        ? { class: 'channel-svg paypal-svg', viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none' }
        : { viewBox: '0 0 24 24', width: '12', height: '12', stroke: 'currentColor', 'stroke-width': kind === 'check' ? '2.5' : '2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    iconAttrs['aria-hidden'] = 'true';
    for (const [name, value] of Object.entries(iconAttrs)) svg.setAttribute(name, value);
    const add = (tag, attrs) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      svg.appendChild(node);
    };
    if (kind === 'tpbank') {
      add('path', { d: 'M14 2.5L25.5 22.5H2.5L14 2.5Z', fill: '#582580' });
      add('path', { d: 'M14 2.5L2.5 22.5L14 15.5L14 2.5Z', fill: '#F58220' });
      add('path', { d: 'M14 15.5L2.5 22.5H25.5L14 15.5Z', fill: '#752B92' });
      add('path', { d: 'M14 2.5L25.5 22.5L14 15.5L14 2.5Z', fill: '#501878' });
    } else if (kind === 'paypal') {
      add('path', { d: 'M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.784.784 0 0 1 .773-.655h6.398c3.09 0 5.485 1.576 4.964 5.378-.474 3.468-2.61 5.385-5.617 5.385H8.92a.785.785 0 0 0-.775.657l-1.069 6.852z', fill: '#003087' });
      add('path', { d: 'M18.91 7.228c-.52 3.802-2.924 5.72-5.931 5.72H10.44a.785.785 0 0 0-.775.657l-1.47 9.42a.534.534 0 0 0 .528.618h3.916a.715.715 0 0 0 .705-.6l.72-4.57a.785.785 0 0 1 .775-.658h1.23c3.007 0 5.412-1.917 5.932-5.72.433-3.17-1.12-4.867-3.07-4.867z', fill: '#0079C1' });
      add('path', { d: 'M12.979 12.948c.474-3.468 2.61-5.385 5.617-5.385h.314a4.912 4.912 0 0 0-3.11-1.185H9.402a.784.784 0 0 0-.775.657l-1.069 6.852h1.47a.785.785 0 0 1 .775-.657l1.069-6.852h1.75c1.78 0 3.22.68 3.957 2.07-.63.95-1.57 2.05-3.599 4.5z', fill: '#002069', opacity: '0.4' });
    } else if (kind === 'copy') {
      add('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' });
      add('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' });
    } else {
      add('polyline', { points: '20 6 9 17 4 12' });
    }
    return svg;
  }

  function renderSupport() {
    if (!els.supportSection) return;
    if (els.supportSectionTitle) els.supportSectionTitle.textContent = tr('section_support');

    const links = getSupportLinks();
    if (els.supportLinks) {
      els.supportLinks.replaceChildren();
      for (const link of links) {
        const card = document.createElement('div');
        card.className = 'support-paypal-card';
        const left = makeElement('div', 'support-paypal-left');
        const iconWrap = makeElement('div', 'support-channel-icon-wrap paypal-icon-wrap');
        iconWrap.appendChild(createSupportIcon('paypal'));
        const info = makeElement('div', 'support-paypal-info');
        info.append(
          makeElement('div', 'support-paypal-title', link.label),
          makeElement('div', 'support-paypal-sub', 'paypal.me/dusk4203'),
        );
        left.append(iconWrap, info);
        card.appendChild(left);

        const openPaypal = () => {
          showToast(tr('support_open_status', { provider: link.label }));
          chrome.tabs.create({ url: link.url });
        };

        card.setAttribute('role', 'link');
        card.tabIndex = 0;
        card.addEventListener('click', openPaypal);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPaypal();
          }
        });

        els.supportLinks.appendChild(card);
      }
    }

    const banks = getBankAccounts();
    if (els.supportBanks) {
      els.supportBanks.replaceChildren();
      for (const bank of banks) {
        const card = document.createElement('div');
        card.className = 'support-bank-card';
        const header = makeElement('div', 'support-bank-header');
        const brand = makeElement('div', 'support-bank-brand');
        const bankIconWrap = makeElement('div', 'support-channel-icon-wrap tpbank-icon-wrap');
        bankIconWrap.appendChild(createSupportIcon('tpbank'));
        const names = makeElement('div', 'support-bank-names');
        names.append(
          makeElement('span', 'support-bank-title', bank.bank),
          makeElement('span', 'support-bank-sub', 'TPBank'),
        );
        brand.append(bankIconWrap, names);
        header.append(brand, makeElement('span', 'support-bank-badge', tr('support_transfer')));
        const accountBlock = makeElement('div', 'support-bank-account-block');
        const accountRow = makeElement('div', 'support-bank-account-row');
        const copyBtn = makeElement('button', 'support-copy-btn');
        copyBtn.type = 'button';
        copyBtn.title = tr('support_copy_account');
        const copyIcon = makeElement('span', 'copy-btn-icon');
        copyIcon.appendChild(createSupportIcon('copy'));
        const copyText = makeElement('span', 'copy-btn-text', tr('support_copy_account'));
        copyBtn.append(copyIcon, copyText);
        accountRow.append(makeElement('code', 'support-bank-account', bank.accountNumber), copyBtn);
        accountBlock.append(makeElement('div', 'support-bank-label', tr('support_bank_account')), accountRow);
        card.append(header, accountBlock);
        if (bank.qrAsset) {
          const qrWrap = makeElement('div', 'support-qr-wrap');
          const qrFrame = makeElement('div', 'support-qr-frame');
          const qr = makeElement('img', 'support-qr');
          qr.src = extensionApi.runtime.getURL(bank.qrAsset);
          qr.alt = tr('support_qr_alt', { bank: bank.bank });
          qr.loading = 'lazy';
          qrFrame.appendChild(qr);
          qrWrap.appendChild(qrFrame);
          card.appendChild(qrWrap);
        }

        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const copied = await copySupportText(bank.accountNumber);
          if (copied) {
            copyBtn.classList.add('copied');
            copyIcon.replaceChildren(createSupportIcon('check'));
            copyText.textContent = tr('support_copied_short');
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyIcon.replaceChildren(createSupportIcon('copy'));
              copyText.textContent = tr('support_copy_account');
            }, 2200);
            showToast(tr('support_copied_account', { account: bank.accountNumber }));
          } else {
            showToast(tr('support_copy_failed'), true);
          }
        });

        els.supportBanks.appendChild(card);
      }
    }

    if (els.supportUnconfigured) {
      els.supportUnconfigured.textContent = tr('support_unconfigured');
      els.supportUnconfigured.hidden = links.length > 0 || banks.length > 0;
    }
  }

  async function load() {
    config = await S.getConfig();
    render();
  }

  function renderSites() {
    els.sitesList.replaceChildren();
    els.sitesCount.textContent = String(config.enabledSites.length);
    const sites = [...config.enabledSites].sort();

    if (!sites.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-box';
      empty.textContent = tr('empty_opt_sites');
      els.sitesList.appendChild(empty);
      return;
    }

    for (const site of sites) {
      const row = document.createElement('div');
      row.className = 'item-row';

      const info = document.createElement('div');
      info.className = 'item-info';

      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = site;

      const sub = document.createElement('div');
      sub.className = 'item-subtitle';
      sub.textContent = tr('opt_site_subtitle');

      info.append(title, sub);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-sm-danger';
      removeBtn.textContent = tr('remove');
      removeBtn.addEventListener('click', async () => {
        config.enabledSites = await S.setEnabledSites(config.enabledSites.filter((x) => x !== site));
        showToast(tr('removed_site_status', { site }));
        renderSites();
      });

      row.append(info, removeBtn);
      els.sitesList.appendChild(row);
    }
  }

  function renderAllow() {
    els.allowList.replaceChildren();
    const rules = config.allowRules.map(parseRuleKey).filter(Boolean).sort((a, b) => {
      const h = displayHost(a.origin).localeCompare(displayHost(b.origin));
      return h || a.type.localeCompare(b.type);
    });

    els.allowCount.textContent = String(rules.length);

    if (!rules.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-box';
      empty.textContent = tr('empty_opt_allow');
      els.allowList.appendChild(empty);
      return;
    }

    for (const rule of rules) {
      const key = `${rule.type}|${rule.origin}`;
      const row = document.createElement('div');
      row.className = 'item-row';

      const info = document.createElement('div');
      info.className = 'item-info';

      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = displayHost(rule.origin);

      const sub = document.createElement('div');
      sub.className = 'item-subtitle';
      sub.textContent = rule.origin;

      info.append(title, sub);

      const tag = document.createElement('span');
      const typeKey = String(rule.type || '').toLowerCase();
      tag.className = `item-tag ${typeKey}`;
      tag.textContent = getTypeLabel(rule.type, currentLang());

      const blockBtn = document.createElement('button');
      blockBtn.className = 'btn-sm-danger';
      blockBtn.textContent = tr('block_again');
      blockBtn.addEventListener('click', async () => {
        config.allowRules = await S.setAllowRules(config.allowRules.filter((x) => x !== key));
        showToast(tr('unallowed_status', { host: displayHost(rule.origin) }));
        renderAllow();
      });

      row.append(info, tag, blockBtn);
      els.allowList.appendChild(row);
    }
  }

  function render() {
    const lang = currentLang();
    document.documentElement.lang = lang;

    if (els.pageTitle) els.pageTitle.textContent = tr('options_title');
    if (els.heroDesc) els.heroDesc.textContent = tr('options_hero_desc');
    if (els.settingsEyebrow) els.settingsEyebrow.textContent = tr('settings_eyebrow');
    if (els.settingsHeading) els.settingsHeading.textContent = tr('settings_heading');
    if (els.extensionActiveText) els.extensionActiveText.textContent = tr('extension_active');
    if (els.navGeneral) els.navGeneral.textContent = tr('nav_general');
    if (els.navProtection) els.navProtection.textContent = tr('nav_protection');
    if (els.navLists) els.navLists.textContent = tr('nav_lists');
    if (els.navBackup) els.navBackup.textContent = tr('nav_backup');

    // Language Section
    if (els.langSectionTitle) els.langSectionTitle.textContent = tr('section_language');
    if (els.langSectionDesc) els.langSectionDesc.textContent = tr('section_language_desc');
    if (els.langBadgeVi) els.langBadgeVi.textContent = 'VI';
    if (els.langBadgeEn) els.langBadgeEn.textContent = 'EN';
    if (els.langBadgeZh) els.langBadgeZh.textContent = 'ZH';

    els.languageRadios.forEach((radio) => {
      radio.checked = radio.value === lang;
    });

    // Behavior Section
    if (els.behaviorSectionTitle) els.behaviorSectionTitle.textContent = tr('section_behavior');
    if (els.behaviorSectionDesc) els.behaviorSectionDesc.textContent = tr('section_behavior_desc');
    if (els.smartModeTitle) els.smartModeTitle.textContent = tr('setting_player_mode');
    if (els.smartModeDesc) els.smartModeDesc.textContent = tr('setting_player_desc');
    if (els.smartBadge) els.smartBadge.textContent = tr('mode_smart_badge');
    if (els.smartDetail) els.smartDetail.textContent = tr('mode_smart_detail');
    if (els.strictBadge) els.strictBadge.textContent = tr('mode_strict_badge');
    if (els.strictDetail) els.strictDetail.textContent = tr('mode_strict_detail');
    if (els.compatBadge) els.compatBadge.textContent = tr('mode_compatible_badge');
    if (els.compatDetail) els.compatDetail.textContent = tr('mode_compatible_detail');

    if (els.toastsTitle) els.toastsTitle.textContent = tr('setting_toasts_title');
    if (els.toastsDesc) els.toastsDesc.textContent = tr('setting_toasts_desc');

    const currentMode = config.settings.smartPlayerMode || 'compatible';
    els.smartMode.value = currentMode;
    els.smartModeRadios.forEach((radio) => {
      radio.checked = radio.value === currentMode;
    });

    els.showToasts.checked = config.settings.showPageToasts !== false;

    // Lists Section
    if (els.listsSectionTitle) els.listsSectionTitle.textContent = tr('section_lists');
    if (els.listsSectionDesc) els.listsSectionDesc.textContent = tr('section_lists_desc');
    if (els.tabSitesTitle) els.tabSitesTitle.textContent = tr('tab_opt_sites');
    if (els.tabAllowTitle) els.tabAllowTitle.textContent = tr('tab_opt_allow');
    if (els.siteInput) els.siteInput.placeholder = tr('opt_site_placeholder');
    if (els.addSiteText) els.addSiteText.textContent = tr('btn_add_site');
    if (els.tipSitesText) els.tipSitesText.textContent = tr('tip_sites');
    if (els.tipAllowText) els.tipAllowText.textContent = tr('tip_allow');

    // Support Section
    renderSupport();

    // Backup Section
    if (els.backupSectionTitle) els.backupSectionTitle.textContent = tr('section_backup');
    if (els.backupSectionDesc) els.backupSectionDesc.textContent = tr('section_backup_desc');
    if (els.exportText) els.exportText.textContent = tr('btn_export');
    if (els.importText) els.importText.textContent = tr('btn_import');
    if (els.resetText) els.resetText.textContent = tr('btn_reset');

    renderSites();
    renderAllow();
  }

  async function saveSettings() {
    config.settings = {
      ...S.DEFAULT_SETTINGS,
      ...config.settings,
      smartPlayerMode: els.smartMode.value,
      showPageToasts: els.showToasts.checked,
    };
    config.settings = await S.setSettings(config.settings);
    showToast(tr('toast_saved'));
  }

  // Language Radio change
  els.languageRadios.forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (radio.checked) {
        config.settings = {
          ...S.DEFAULT_SETTINGS,
          ...config.settings,
          language: radio.value,
        };
        config.settings = await S.setSettings(config.settings);
        render();
        showToast(tr('toast_saved'));
      }
    });
  });

  // Smart Mode Radio change
  els.smartModeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        els.smartMode.value = radio.value;
        saveSettings();
      }
    });
  });

  els.showToasts.addEventListener('change', saveSettings);

  // Add site
  const handleAddSite = async () => {
    const key = S.normalizeSiteKeyInput(els.siteInput.value);
    if (!key) {
      showToast(tr('invalid_domain_status'), true);
      return;
    }
    if (config.enabledSites.includes(key)) {
      showToast(tr('site_exists_status'), true);
      return;
    }
    config.enabledSites = await S.setEnabledSites([...config.enabledSites, key]);
    els.siteInput.value = '';
    showToast(tr('added_site_status', { site: key }));
    renderSites();
  };

  els.addSiteBtn.addEventListener('click', handleAddSite);
  els.siteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSite();
  });

  // Settings sidebar navigation
  const navLinks = [...document.querySelectorAll('.nav-link')];
  const setActiveNav = (hash) => {
    const target = hash || '#general';
    navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === target));
  };
  navLinks.forEach((link) => {
    link.addEventListener('click', () => setActiveNav(link.getAttribute('href')));
  });
  window.addEventListener('hashchange', () => setActiveNav(location.hash));

  // Options tabs
  for (const tab of document.querySelectorAll('.opt-tab')) {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.opt-tab').forEach((el) => el.classList.toggle('active', el === tab));
      const target = tab.dataset.tab;
      els.sitesPanel.classList.toggle('active', target === 'sites');
      els.allowPanel.classList.toggle('active', target === 'allow');
    });
  }

  // Export JSON
  els.exportBtn.addEventListener('click', async () => {
    const payload = {
      format: 'DBlockerConfig',
      version: 1,
      exportedAt: new Date().toISOString(),
      enabledSites: config.enabledSites,
      allowRules: config.allowRules,
      settings: config.settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dblocker-config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(tr('toast_exported'));
  });

  // Import JSON
  els.importInput.addEventListener('change', async () => {
    const file = els.importInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error(tr('toast_file_too_large'));
      const data = JSON.parse(await file.text());
      if (data.format !== 'DBlockerConfig' && data.format !== 'AdsControlConfig') {
        throw new Error(tr('toast_invalid_format'));
      }
      config.enabledSites = await S.setEnabledSites(data.enabledSites || []);
      config.allowRules = await S.setAllowRules(data.allowRules || []);
      config.settings = { ...S.DEFAULT_SETTINGS, ...(data.settings || {}) };
      config.settings = await S.setSettings(config.settings);
      showToast(tr('toast_imported'));
      render();
    } catch (error) {
      showToast(tr('toast_import_error', { error: error.message || error }), true);
    } finally {
      els.importInput.value = '';
    }
  });

  // Reset defaults
  els.resetBtn.addEventListener('click', async () => {
    if (!confirm(tr('confirm_reset'))) {
      return;
    }
    config.enabledSites = await S.setEnabledSites(S.DEFAULT_ENABLED_SITES);
    config.allowRules = await S.setAllowRules([]);
    config.settings = { ...S.DEFAULT_SETTINGS };
    config.settings = await S.setSettings(config.settings);
    showToast(tr('toast_reset'));
    render();
  });

  chrome.storage.onChanged.addListener(() => load().catch(() => {}));
  load().then(() => {
    setActiveNav(location.hash || '#general');
    if (location.hash === '#support' && els.supportSection) {
      requestAnimationFrame(() => els.supportSection.classList.add('support-focus'));
      setTimeout(() => els.supportSection.classList.remove('support-focus'), 1800);
    }
  }).catch((error) => showToast(String(error?.message || error), true));
})();
