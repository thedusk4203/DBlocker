const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(require('path').join(__dirname, '../src/shared.js'), 'utf8');
vm.runInThisContext(code, { filename: 'shared.js' });
const S = globalThis.AdsControlShared;

assert(S, 'AdsControlShared missing');
assert(globalThis.DBlockerShared, 'DBlockerShared missing');

// Site key detection tests
assert.equal(S.getSiteKey('motchillzs.cc'), 'motchillzs');
assert.equal(S.getSiteKey('www.motchillzs.xyz'), 'motchillzs');
assert.equal(S.getSiteKey('sub.motchillzs.com.vn'), 'motchillzs');
assert.equal(S.getSiteKey('motchillzs.id.vn'), 'motchillzs');
assert.equal(S.getSiteKey('motchillzs.io.vn'), 'motchillzs');
assert.equal(S.getSiteKey('fake-motchillzs.xyz'), 'fake-motchillzs');
assert.equal(S.getSiteKey('notmotchillzs.com'), 'notmotchillzs');

assert.equal(S.siteKeyMatchesHostname('motchillzs', 'motchillzs.cc'), true);
assert.equal(S.siteKeyMatchesHostname('motchillzs', 'www.motchillzs.xyz'), true);
assert.equal(S.siteKeyMatchesHostname('motchillzs', 'sub.motchillzs.id.vn'), true);
assert.equal(S.siteKeyMatchesHostname('motchillzs', 'fake-motchillzs.xyz'), false);
assert.equal(S.siteKeyMatchesHostname('motchillzs', 'notmotchillzs.com'), false);

assert.deepEqual(S.parseRuleKey('iframe|https://player.example'), {
  type: 'iframe', origin: 'https://player.example'
});

// =========================================================
// i18n Tests
// =========================================================

// Supported languages and defaults
assert.deepEqual(S.SUPPORTED_LANGUAGES, ['vi', 'en', 'zh']);
assert.equal(S.DEFAULT_SETTINGS.language, 'en');
assert.equal(S.DEFAULT_SETTINGS.smartPlayerMode, 'compatible');
assert.deepEqual(S.DEFAULT_ENABLED_SITES, []);
assert.equal(S.LANGUAGE_LABELS.vi, 'Tiếng Việt');
assert.equal(S.LANGUAGE_LABELS.en, 'English');
assert.equal(S.LANGUAGE_LABELS.zh, '中文');

// Key parity between dictionaries
const viKeys = Object.keys(S.I18N.vi).sort();
const enKeys = Object.keys(S.I18N.en).sort();
const zhKeys = Object.keys(S.I18N.zh).sort();

assert.deepEqual(enKeys, viKeys, 'Missing or extra keys in English translation');
assert.deepEqual(zhKeys, viKeys, 'Missing or extra keys in Chinese translation');

// Translation function tests
assert.equal(S.t('app_title', 'vi'), 'DBlocker');
assert.equal(S.t('status_active', 'vi'), 'Đang bảo vệ');
assert.equal(S.t('status_active', 'en'), 'Protected');
assert.equal(S.t('status_active', 'zh'), '保护中');
assert.equal(S.t('tab_sites', 'vi'), 'Danh sách chặn');
assert.equal(S.t('tab_sites', 'en'), 'Block list');
assert.equal(S.t('tab_sites', 'zh'), '屏蔽列表');
assert.equal(S.t('always_allow', 'vi'), 'Luôn cho phép');
assert.equal(S.t('always_allow', 'en'), 'Always allow');
assert.equal(S.t('always_allow', 'zh'), '始终允许');
assert.equal(S.EVENTS.allowRule, '__adscontrol_ext_allow_rule_v1');

// Interpolation tests
assert.equal(
  S.t('hint_site_active', 'vi', { site: 'motchillzs' }),
  'Site: motchillzs'
);
assert.equal(
  S.t('loaded_once_status', 'en', { host: 'player.xyz' }),
  'Loaded once: player.xyz'
);
assert.equal(
  S.t('protection_on_status', 'zh', { site: 'google' }),
  '已开启保护: google'
);

// Fallback behavior
assert.equal(S.t('status_active', 'fr'), 'Protected'); // unsupported lang falls back to 'en'
assert.equal(S.t('unknown_nonexistent_key', 'en'), 'unknown_nonexistent_key'); // missing key falls back to key itself

// Type label localization
assert.equal(S.getTypeLabel('iframe', 'vi'), 'Iframe');
assert.equal(S.getTypeLabel('popup', 'vi'), 'Popup');
assert.equal(S.getTypeLabel('popup', 'zh'), '弹窗');
assert.equal(S.getTypeLabel('external-link', 'en'), 'External link');
assert.equal(S.getTypeLabel('redirect', 'zh'), '重定向');

console.log('shared.test.js: ALL PASS (including i18n & allow rules)');
