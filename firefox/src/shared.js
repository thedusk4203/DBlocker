(() => {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    enabledSites: 'adscontrol_enabled_sites_v1',
    allowRules: 'adscontrol_allow_rules_v2',
    settings: 'adscontrol_settings_v1',
  });

  const DEFAULT_ENABLED_SITES = Object.freeze([]);

  const DEFAULT_SETTINGS = Object.freeze({
    smartPlayerMode: 'compatible',
    showPageToasts: true,
    language: 'vi',
  });

  const MAX_ENABLED_SITES = 5000;
  const MAX_ALLOW_RULES = 10000;

  const SUPPORTED_LANGUAGES = Object.freeze(['vi', 'en', 'zh']);

  const LANGUAGE_LABELS = Object.freeze({
    vi: 'Tiếng Việt',
    en: 'English',
    zh: '中文',
  });

  const TYPE_LABELS_BY_LANG = Object.freeze({
    vi: Object.freeze({
      iframe: 'Iframe',
      popup: 'Popup',
      'external-link': 'Liên kết ngoài',
      redirect: 'Chuyển hướng',
      'tab-under': 'Tab-under',
      form: 'Biểu mẫu',
      'meta-refresh': 'Meta refresh',
      'click-overlay': 'Lớp click',
    }),
    en: Object.freeze({
      iframe: 'Iframe',
      popup: 'Popup',
      'external-link': 'External link',
      redirect: 'Redirect',
      'tab-under': 'Tab-under',
      form: 'Form',
      'meta-refresh': 'Meta refresh',
      'click-overlay': 'Click overlay',
    }),
    zh: Object.freeze({
      iframe: 'Iframe',
      popup: '弹窗',
      'external-link': '外部链接',
      redirect: '重定向',
      'tab-under': '后台标签页',
      form: '表单',
      'meta-refresh': 'Meta刷新',
      'click-overlay': '点击遮罩',
    }),
  });

  const TYPE_LABELS = TYPE_LABELS_BY_LANG.vi;

  const I18N = Object.freeze({
    vi: Object.freeze({
      app_title: 'DBlocker',
      reload_tooltip: 'Tải lại trang web',
      options_tooltip: 'Cài đặt tùy chọn',
      support_tooltip: 'Ủng hộ DBlocker',
      detecting_page: 'Đang nhận diện trang…',
      internal_page: 'Trang nội bộ',
      copy_tooltip: 'Sao chép tên miền',
      switch_tooltip: 'Bật / Tắt tự động chặn cho trang web này',
      status_checking: 'Đang kiểm tra...',
      status_active: 'Đang tự động chặn',
      status_inactive: 'Tự động chặn đang TẮT',
      status_unsupported: 'Không hỗ trợ',
      hint_site_active: 'Site: {site}',
      hint_site_enable: 'Bật cho: {site}',
      hint_system_page: 'Trang hệ thống',
      tab_blocked: 'Đã chặn',
      tab_allowed: 'Cho phép',
      tab_sites: 'Danh sách chặn',
      btn_clear_log: 'Xóa log',
      status_ready: 'Sẵn sàng',
      empty_blocked_title: 'Không có mục bị chặn',
      empty_blocked_desc: 'Không có mục nào bị chặn trên trang này.',
      empty_allowed_title: 'Chưa có ngoại lệ',
      empty_allowed_desc: 'Chưa có mục nào được cho phép.',
      empty_sites_title: 'Chưa có trang nào',
      empty_sites_desc: 'Nhập tên miền ở trên để bật.',
      blocked_meta: 'Đã chặn',
      load_once: 'Tải 1 lần',
      allow: 'Cho phép',
      block_again: 'Chặn lại',
      remove: 'Xóa',
      add_site: '+ Thêm',
      site_input_placeholder: 'Nhập domain (vd: motchillzs)...',
      site_meta_current: 'Khớp trang hiện tại',
      site_meta_tld: 'Tự khớp khi đổi TLD',
      global_rule: 'Cho phép toàn cục',
      site_pill_active: 'ĐANG BẬT',
      site_pill_site: 'TRANG',

      // Popup Status Toasts
      loaded_once_status: 'Đã tải tạm 1 lần: {host}',
      allowed_status: 'Đã cho phép: {host}',
      unallowed_status: 'Đã hủy cho phép: {host}',
      removed_site_status: 'Đã xóa: {site}',
      invalid_domain_status: 'Tên miền không hợp lệ!',
      site_exists_status: 'Trang đã có trong danh sách!',
      added_site_status: 'Đã thêm: {site}',
      protection_on_status: 'Đã BẬT tự động chặn cho: {site}',
      protection_off_status: 'Đã TẮT tự động chặn cho: {host}',
      cleared_log_status: 'Đã làm sạch nhật ký chặn trên tab',
      copied_status: 'Đã sao chép: {text}',
      cannot_copy_status: 'Không thể sao chép',
      reloading_tab_status: 'Đang tải lại tab...',
      reload_failed_status: 'Không thể tải lại tab này',

      // Options Page
      options_title: 'DBlocker — Cài đặt',
      options_hero_desc: 'Cài đặt bộ lọc và danh sách trang.',
      settings_eyebrow: 'Cài đặt DBlocker',
      settings_heading: 'Tùy chọn bảo vệ',
      extension_active: 'Tiện ích đang hoạt động',
      nav_general: 'Chung',
      nav_protection: 'Bảo vệ',
      nav_lists: 'Danh sách',
      nav_backup: 'Sao lưu',
      section_language_desc: 'Chọn ngôn ngữ hiển thị cho popup và trang cài đặt.',
      section_behavior_desc: 'Điều chỉnh cách DBlocker xử lý video player nhúng và thông báo trên trang.',
      section_lists_desc: 'Quản lý website được bảo vệ và các quy tắc cho phép toàn cục.',
      section_backup_desc: 'Xuất hoặc khôi phục cấu hình ngay trên thiết bị.',
      section_language: 'Ngôn ngữ',
      section_behavior: 'Smart Player & Thông báo',
      setting_player_mode: 'Chế độ lọc Video Player',
      setting_player_desc: 'Cách xử lý khung phát video trên các trang web.',
      mode_smart_badge: 'Cân bằng',
      mode_smart_detail: 'Tự động nhận diện. Tạm giữ video nghi vấn cho đến khi bạn chọn Luôn cho phép.',
      mode_strict_badge: 'Nghiêm ngặt',
      mode_strict_detail: 'Chặn mọi iframe cho đến khi bạn cho phép thủ công.',
      mode_compatible_badge: 'Mặc định',
      mode_compatible_detail: 'Tự động cho phép các player có độ tin cậy cao phát ngay.',
      setting_toasts_title: 'Thông báo trên web (Toasts)',
      setting_toasts_desc: 'Hiện thông báo góc màn hình khi DBlocker chặn popup hoặc chuyển hướng.',
      section_lists: 'Danh sách quản lý',
      tab_opt_sites: 'Danh sách chặn (SITES)',
      tab_opt_allow: 'Luôn cho phép (ALLOW)',
      opt_site_placeholder: 'Nhập domain (vd: motchillzs hoặc https://motchillzs.xyz)...',
      btn_add_site: 'Thêm trang',
      tip_sites: 'Tự động chặn kể cả khi website đổi đuôi tên miền (từ .xyz sang .cc, .net...).',
      tip_allow: 'Quy tắc cho phép có hiệu lực toàn cục theo loại mục và tên miền.',
      empty_opt_sites: 'Chưa có trang web nào trong danh sách chặn.',
      empty_opt_allow: 'Chưa có quy tắc nào trong danh sách luôn cho phép.',
      opt_site_subtitle: 'Tự động chặn khi site đổi đuôi TLD.',
      section_support: 'Ủng hộ DBlocker',
      support_subtitle: 'Tự nguyện',
      support_description: '',
      support_unconfigured: 'Kênh ủng hộ chưa được cấu hình trong bản build này.',
      support_bank_account: 'Số tài khoản (TPBank)',
      support_copy_account: 'Sao chép STK',
      support_copied_account: 'Đã sao chép STK: {account}',
      support_copied_short: 'Đã chép',
      support_copy_failed: 'Không thể sao chép số tài khoản.',
      support_qr_alt: 'Mã QR chuyển khoản {bank}',
      support_qr_hint: '',
      support_privacy_note: '',
      support_action: 'Ủng hộ',
      support_transfer: 'Chuyển khoản',
      support_open_status: 'Đang mở {provider}…',
      section_backup: 'Sao lưu & Khôi phục',
      btn_export: 'Xuất JSON',
      btn_import: 'Nhập JSON',
      btn_reset: 'Đặt lại mặc định',
      confirm_reset: 'Đặt lại toàn bộ cài đặt về mặc định?',
      toast_saved: 'Đã lưu cài đặt thành công.',
      toast_exported: 'Đã xuất file JSON.',
      toast_imported: 'Đã nhập cấu hình thành công.',
      toast_import_error: 'Lỗi nhập: {error}',
      toast_invalid_format: 'File cấu hình không đúng định dạng',
      toast_file_too_large: 'File cấu hình quá lớn (tối đa 5 MB)',
      toast_reset: 'Đã đặt lại mặc định.',

      // In-page Engine & Player
      player_title: '🛡️ DBlocker: Video Player',
      unknown_title: '🛡️ DBlocker: Iframe chưa rõ',
      player_desc: 'Tạm giữ để ngăn popup. Mở Cài đặt và chọn Luôn cho phép để tải lại trang và phát video.',
      unknown_desc: 'Iframe nguồn ngoài chưa xác định. Chọn Tải 1 lần để mở.',
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
      always_allow: 'Luôn cho phép',
      toast_allowed_always: 'Đã luôn cho phép: {host}',
    }),

    en: Object.freeze({
      app_title: 'DBlocker',
      reload_tooltip: 'Reload page',
      options_tooltip: 'Settings',
      support_tooltip: 'Support DBlocker',
      detecting_page: 'Detecting page…',
      internal_page: 'Internal page',
      copy_tooltip: 'Copy domain',
      switch_tooltip: 'Toggle protection for this site',
      status_checking: 'Checking...',
      status_active: 'Protected',
      status_inactive: 'Protection is OFF',
      status_unsupported: 'Not supported',
      hint_site_active: 'Site: {site}',
      hint_site_enable: 'Enable for: {site}',
      hint_system_page: 'System page',
      tab_blocked: 'Blocked',
      tab_allowed: 'Allowed',
      tab_sites: 'Block list',
      btn_clear_log: 'Clear log',
      status_ready: 'Ready',
      empty_blocked_title: 'No blocked items',
      empty_blocked_desc: 'No blocked items detected on this page.',
      empty_allowed_title: 'No exceptions',
      empty_allowed_desc: 'No allowed rules added yet.',
      empty_sites_title: 'No sites added',
      empty_sites_desc: 'Enter a domain above to enable protection.',
      blocked_meta: 'Blocked',
      load_once: 'Allow once',
      allow: 'Allow',
      block_again: 'Block',
      remove: 'Remove',
      add_site: '+ Add',
      site_input_placeholder: 'Enter domain (e.g. motchillzs)...',
      site_meta_current: 'Matches current site',
      site_meta_tld: 'Auto-matches on TLD change',
      global_rule: 'Global rule',
      site_pill_active: 'ACTIVE',
      site_pill_site: 'SITE',

      // Popup Status Toasts
      loaded_once_status: 'Loaded once: {host}',
      allowed_status: 'Allowed: {host}',
      unallowed_status: 'Removed allowance: {host}',
      removed_site_status: 'Removed: {site}',
      invalid_domain_status: 'Invalid domain!',
      site_exists_status: 'Site already in list!',
      added_site_status: 'Added: {site}',
      protection_on_status: 'Protection ON for: {site}',
      protection_off_status: 'Protection OFF for: {host}',
      cleared_log_status: 'Cleared blocked log for this tab',
      copied_status: 'Copied: {text}',
      cannot_copy_status: 'Cannot copy',
      reloading_tab_status: 'Reloading tab...',
      reload_failed_status: 'Could not reload this tab',

      // Options Page
      options_title: 'DBlocker — Settings',
      options_hero_desc: 'Filter settings and managed site lists.',
      settings_eyebrow: 'DBlocker settings',
      settings_heading: 'Protection preferences',
      extension_active: 'Extension active',
      nav_general: 'General',
      nav_protection: 'Protection',
      nav_lists: 'Lists',
      nav_backup: 'Backup',
      section_language_desc: 'Choose how DBlocker appears across the popup and settings.',
      section_behavior_desc: 'Control how DBlocker handles embedded video players and in-page notifications.',
      section_lists_desc: 'Manage protected websites and global allow rules.',
      section_backup_desc: 'Export or restore your configuration locally.',
      section_language: 'Language',
      section_behavior: 'Smart Player & Notifications',
      setting_player_mode: 'Video Player Filter Mode',
      setting_player_desc: 'How to handle video player frames on websites.',
      mode_smart_badge: 'Balanced',
      mode_smart_detail: 'Auto-detection. Suspicious players are held until you choose Always allow.',
      mode_strict_badge: 'Strict',
      mode_strict_detail: 'Blocks all iframes until manually allowed.',
      mode_compatible_badge: 'Default',
      mode_compatible_detail: 'Automatically allows trusted high-confidence players immediately.',
      setting_toasts_title: 'In-Page Notifications (Toasts)',
      setting_toasts_desc: 'Show corner notification when DBlocker blocks popups or redirects.',
      section_lists: 'Managed Lists',
      tab_opt_sites: 'Block list (SITES)',
      tab_opt_allow: 'Always Allowed (ALLOW)',
      opt_site_placeholder: 'Enter domain (e.g. motchillzs or https://motchillzs.xyz)...',
      btn_add_site: 'Add site',
      tip_sites: 'Automatically protects even if the website changes its domain extension (e.g. .xyz to .cc, .net...).',
      tip_allow: 'Allow rules apply globally by item type and domain.',
      empty_opt_sites: 'No websites in the protected list.',
      empty_opt_allow: 'No rules in the always-allowed list.',
      opt_site_subtitle: 'Auto-protects when site changes TLD.',
      section_support: 'Support DBlocker',
      support_subtitle: 'Voluntary',
      support_description: '',
      support_unconfigured: 'Donation channels are not configured in this build yet.',
      support_bank_account: 'Account number',
      support_copy_account: 'Copy account',
      support_copied_account: 'Copied {account}.',
      support_copied_short: 'Copied',
      support_copy_failed: 'Could not copy the account number.',
      support_qr_alt: '{bank} bank-transfer QR code',
      support_qr_hint: '',
      support_privacy_note: '',
      support_action: 'Support',
      support_transfer: 'Bank transfer',
      support_open_status: 'Opening {provider}…',
      section_backup: 'Backup & Restore',
      btn_export: 'Export JSON',
      btn_import: 'Import JSON',
      btn_reset: 'Reset to Defaults',
      confirm_reset: 'Reset all settings to defaults?',
      toast_saved: 'Settings saved successfully.',
      toast_exported: 'Exported JSON file.',
      toast_imported: 'Configuration imported successfully.',
      toast_import_error: 'Import error: {error}',
      toast_invalid_format: 'Invalid configuration file format',
      toast_file_too_large: 'Configuration file is too large (max 5 MB)',
      toast_reset: 'Reset to defaults successfully.',

      // In-page Engine & Player
      player_title: '🛡️ DBlocker: Video Player',
      unknown_title: '🛡️ DBlocker: Unknown Iframe',
      player_desc: 'Held to prevent popups. Open Settings and choose Always allow; the page will reload to play the video.',
      unknown_desc: 'External iframe source. Click Load once to open.',
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
      always_allow: 'Always allow',
      toast_allowed_always: 'Always allowed: {host}',
    }),

    zh: Object.freeze({
      app_title: 'DBlocker',
      reload_tooltip: '重新加载页面',
      options_tooltip: '设置选项',
      support_tooltip: '支持 DBlocker',
      detecting_page: '正在识别页面…',
      internal_page: '内置页面',
      copy_tooltip: '复制域名',
      switch_tooltip: '开启/关闭此网站保护',
      status_checking: '检查中...',
      status_active: '保护中',
      status_inactive: '保护已关闭',
      status_unsupported: '不支持',
      hint_site_active: '网站: {site}',
      hint_site_enable: '启用于: {site}',
      hint_system_page: '系统页面',
      tab_blocked: '已拦截',
      tab_allowed: '已允许',
      tab_sites: '屏蔽列表',
      btn_clear_log: '清空日志',
      status_ready: '就绪',
      empty_blocked_title: '没有已拦截项目',
      empty_blocked_desc: '此页面未检测到已拦截项目。',
      empty_allowed_title: '暂无例外规则',
      empty_allowed_desc: '尚未添加任何允许规则。',
      empty_sites_title: '暂无已启用网站',
      empty_sites_desc: '在上方输入域名以开启保护。',
      blocked_meta: '已拦截',
      load_once: '单次允许',
      allow: '允许',
      block_again: '重新拦截',
      remove: '删除',
      add_site: '+ 添加',
      site_input_placeholder: '输入域名 (如: motchillzs)...',
      site_meta_current: '匹配当前网站',
      site_meta_tld: '顶级域名变更时自动匹配',
      global_rule: '全局允许',
      site_pill_active: '已启用',
      site_pill_site: '网站',

      // Popup Status Toasts
      loaded_once_status: '已单次加载: {host}',
      allowed_status: '已允许: {host}',
      unallowed_status: '已取消允许: {host}',
      removed_site_status: '已删除: {site}',
      invalid_domain_status: '域名无效！',
      site_exists_status: '网站已在列表中！',
      added_site_status: '已添加: {site}',
      protection_on_status: '已开启保护: {site}',
      protection_off_status: '已关闭保护: {host}',
      cleared_log_status: '已清空此标签页拦截日志',
      copied_status: '已复制: {text}',
      cannot_copy_status: '无法复制',
      reloading_tab_status: '正在重新加载标签页...',
      reload_failed_status: '无法重新加载此标签页',

      // Options Page
      options_title: 'DBlocker — 设置',
      options_hero_desc: '过滤器设置与网站列表管理。',
      settings_eyebrow: 'DBlocker 设置',
      settings_heading: '保护偏好',
      extension_active: '扩展正在运行',
      nav_general: '通用',
      nav_protection: '保护',
      nav_lists: '列表',
      nav_backup: '备份',
      section_language_desc: '选择 DBlocker 弹窗和设置页面的显示语言。',
      section_behavior_desc: '控制 DBlocker 如何处理嵌入式视频播放器和网页内通知。',
      section_lists_desc: '管理受保护网站和全局允许规则。',
      section_backup_desc: '在本地导出或恢复配置。',
      section_language: '语言',
      section_behavior: '智能播放器与通知',
      setting_player_mode: '视频播放器过滤模式',
      setting_player_desc: '处理网页中视频播放器框架的方式。',
      mode_smart_badge: '平衡',
      mode_smart_detail: '自动识别。可疑播放器会保持暂停，直到您选择“始终允许”。',
      mode_strict_badge: '严格',
      mode_strict_detail: '拦截所有内嵌框架，直到手动允许。',
      mode_compatible_badge: '默认',
      mode_compatible_detail: '高可信度播放器自动允许直接播放。',
      setting_toasts_title: '网页内浮窗通知 (Toasts)',
      setting_toasts_desc: '当 DBlocker 拦截弹窗或重定向时在屏幕角落显示通知。',
      section_lists: '管理列表',
      tab_opt_sites: '屏蔽列表 (SITES)',
      tab_opt_allow: '始终允许 (ALLOW)',
      opt_site_placeholder: '输入域名 (如: motchillzs 或 https://motchillzs.xyz)...',
      btn_add_site: '添加网站',
      tip_sites: '即使网站更改顶级域名后缀（如从 .xyz 变为 .cc、.net…）也会自动保持保护。',
      tip_allow: '允许规则按项目类型和域名全局生效。',
      empty_opt_sites: '保护列表中暂无网站。',
      empty_opt_allow: '始终允许列表中暂无规则。',
      opt_site_subtitle: '网站更换顶级域名时自动保护。',
      section_support: '支持 DBlocker',
      support_subtitle: '自愿支持',
      support_description: '如果 DBlocker 对你有帮助，可以支持项目。',
      support_unconfigured: '此版本尚未配置捐赠渠道。',
      support_bank_account: '银行账号',
      support_copy_account: '复制账号',
      support_copied_account: '已复制 {account}。',
      support_copied_short: '已复制',
      support_copy_failed: '无法复制银行账号。',
      support_qr_alt: '{bank} 银行转账二维码',
      support_qr_hint: '使用银行应用扫码转账。',
      support_privacy_note: '',
      support_action: '支持',
      support_transfer: '银行转账',
      support_open_status: '正在打开 {provider}…',
      section_backup: '备份与恢复',
      btn_export: '导出 JSON',
      btn_import: '导入 JSON',
      btn_reset: '恢复默认设置',
      confirm_reset: '确定将所有设置恢复为默认值？',
      toast_saved: '设置保存成功。',
      toast_exported: '已导出 JSON 文件。',
      toast_imported: '配置导入成功。',
      toast_import_error: '导入错误: {error}',
      toast_invalid_format: '配置文件格式不正确',
      toast_file_too_large: '配置文件过大（最大 5 MB）',
      toast_reset: '已恢复默认设置。',

      // In-page Engine & Player
      player_title: '🛡️ DBlocker: 视频播放器',
      unknown_title: '🛡️ DBlocker: 未知框架',
      player_desc: '暂留以防止弹窗。打开设置并选择“始终允许”，页面将重新加载以播放视频。',
      unknown_desc: '外部未知来源框架。点击“加载一次”以打开。',
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
      always_allow: '始终允许',
      toast_allowed_always: '已始终允许: {host}',
    }),
  });

  function t(key, lang = 'vi', params = {}) {
    const activeLang = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'vi';
    let text = I18N[activeLang]?.[key] ?? I18N.vi?.[key] ?? key;
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }

  function getTypeLabel(type, lang = 'vi') {
    const activeLang = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'vi';
    return TYPE_LABELS_BY_LANG[activeLang]?.[type] || TYPE_LABELS[type] || type;
  }

  const ALLOWED_RULE_TYPES = Object.freeze([
    'iframe',
    'popup',
    'external-link',
    'redirect',
    'tab-under',
    'form',
    'meta-refresh',
    'click-overlay',
  ]);
  const ALLOWED_RULE_TYPE_SET = new Set(ALLOWED_RULE_TYPES);
  const RESERVED_SITE_KEYS = new Set([
    'www', 'm', 'mobile', 'web',
    'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'co', 'ac', 'or', 'ne',
  ]);


  const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
    'ac', 'co', 'com', 'edu', 'gov', 'net', 'ne', 'or', 'org', 'id', 'io',
  ]);

  function normalizeHostname(hostname) {
    return String(hostname || '')
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/^\.+|\.+$/g, '');
  }

  function hostnameLabels(hostname) {
    const host = normalizeHostname(hostname);
    if (!host) return [];
    return host.split('.').filter(Boolean);
  }

  function getSiteKey(hostname) {
    const host = normalizeHostname(hostname);
    if (!host) return '';
    if (host === 'localhost') return host;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host;

    // Extension pages/background load src/psl.js before shared.js. Content
    // controllers intentionally do not load the PSL snapshot to keep every-frame
    // overhead small; they don't make authoritative site-policy decisions.
    try {
      const pslKey = globalThis.DBlockerPSL?.getSiteKey?.(host);
      if (pslKey) return pslKey;
    } catch (_) {}

    // Lightweight fallback for contexts where PSL is intentionally not loaded.
    const parts = hostnameLabels(host);
    if (parts.length <= 1) return parts[0] || '';

    while (parts.length > 2 && ['www', 'm', 'mobile', 'app', 'web'].includes(parts[0])) {
      parts.shift();
    }

    if (parts.length <= 2) return parts[0] || '';

    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    if (
      last.length === 2 &&
      (secondLast.length <= 3 || COMMON_SECOND_LEVEL_SUFFIXES.has(secondLast)) &&
      parts.length >= 3
    ) {
      return parts[parts.length - 3];
    }

    return parts[parts.length - 2];
  }

  function normalizeSiteKeyInput(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';

    let key = '';
    if (/^[a-z0-9-]+$/i.test(raw)) {
      key = raw.replace(/^-+|-+$/g, '');
    } else {
      try {
        const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
          ? new URL(raw)
          : new URL(`http://${raw}`);
        if (candidate.hostname) key = getSiteKey(candidate.hostname);
      } catch (_) {
        key = getSiteKey(raw.split('/')[0]);
      }
    }

    if (!key || key.length < 2 || RESERVED_SITE_KEYS.has(key)) return '';
    return key;
  }

  function siteKeyMatchesHostname(siteKey, hostname) {
    const key = normalizeSiteKeyInput(siteKey);
    const host = normalizeHostname(hostname);
    if (!key || !host) return false;

    if (key === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(key)) {
      return host === key;
    }

    return getSiteKey(host) === key;
  }

  function matchingEnabledSiteKeys(enabledSites, hostname) {
    return Array.from(enabledSites || [])
      .map(normalizeSiteKeyInput)
      .filter(Boolean)
      .filter((key) => siteKeyMatchesHostname(key, hostname))
      .sort((a, b) => b.length - a.length || a.localeCompare(b));
  }

  function isProtectedBrowsingContext(enabledSites, hostname, ancestorHostnames = [], topFrame = false) {
    const direct = matchingEnabledSiteKeys(enabledSites, hostname).length > 0;
    if (direct || topFrame) return direct;
    return Array.from(ancestorHostnames || []).some(
      (host) => matchingEnabledSiteKeys(enabledSites, host).length > 0,
    );
  }

  function ruleKey(type, origin) {
    return `${type}|${origin}`;
  }

  function parseRuleKey(key) {
    const value = String(key || '');
    const sep = value.indexOf('|');
    if (sep < 1) return null;
    return { type: value.slice(0, sep), origin: value.slice(sep + 1) };
  }

  function normalizeHttpOrigin(value) {
    try {
      const parsed = new URL(String(value || ''));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.origin;
    } catch (_) {
      return '';
    }
  }

  function normalizeAllowRule(value) {
    const parsed = parseRuleKey(value);
    if (!parsed || !ALLOWED_RULE_TYPE_SET.has(parsed.type)) return '';
    const origin = normalizeHttpOrigin(parsed.origin);
    return origin ? ruleKey(parsed.type, origin) : '';
  }

  function sanitizeSettings(value) {
    const input = value && typeof value === 'object' ? value : {};
    const smartPlayerMode = ['smart', 'strict', 'compatible'].includes(input.smartPlayerMode)
      ? input.smartPlayerMode
      : DEFAULT_SETTINGS.smartPlayerMode;
    const language = SUPPORTED_LANGUAGES.includes(input.language)
      ? input.language
      : DEFAULT_SETTINGS.language;
    return {
      smartPlayerMode,
      showPageToasts: input.showPageToasts !== false,
      language,
    };
  }

  function safeUrl(value, base) {
    try {
      return new URL(value, base);
    } catch (_) {
      return null;
    }
  }

  function displayHost(originOrUrl) {
    const parsed = safeUrl(originOrUrl);
    if (parsed) return parsed.hostname || parsed.origin || originOrUrl;
    return String(originOrUrl || '(unknown)');
  }

  function sanitizeArray(value, normalizer = (v) => v, maxItems = Number.POSITIVE_INFINITY) {
    if (!Array.isArray(value)) return [];
    const out = [];
    const seen = new Set();
    const limit = Number.isFinite(maxItems) ? Math.max(0, Math.floor(maxItems)) : Number.POSITIVE_INFINITY;
    for (const item of value) {
      const normalized = normalizer(item);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
      if (out.length >= limit) break;
    }
    return out;
  }

  async function getConfig() {
    const data = await browser.storage.local.get([
      STORAGE_KEYS.enabledSites,
      STORAGE_KEYS.allowRules,
      STORAGE_KEYS.settings,
    ]);

    const enabledSites = sanitizeArray(
      data[STORAGE_KEYS.enabledSites] ?? DEFAULT_ENABLED_SITES,
      normalizeSiteKeyInput,
      MAX_ENABLED_SITES,
    );
    const allowRules = sanitizeArray(data[STORAGE_KEYS.allowRules] ?? [], normalizeAllowRule, MAX_ALLOW_RULES);
    const settings = sanitizeSettings(data[STORAGE_KEYS.settings]);

    return { enabledSites, allowRules, settings };
  }

  async function setEnabledSites(enabledSites) {
    const cleaned = sanitizeArray(enabledSites, normalizeSiteKeyInput, MAX_ENABLED_SITES).sort();
    await browser.storage.local.set({ [STORAGE_KEYS.enabledSites]: cleaned });
    return cleaned;
  }

  async function setAllowRules(allowRules) {
    const cleaned = sanitizeArray(allowRules, normalizeAllowRule, MAX_ALLOW_RULES).sort();
    await browser.storage.local.set({ [STORAGE_KEYS.allowRules]: cleaned });
    return cleaned;
  }

  async function setSettings(settings) {
    const cleaned = sanitizeSettings(settings);
    await browser.storage.local.set({ [STORAGE_KEYS.settings]: cleaned });
    return cleaned;
  }

  globalThis.AdsControlShared = Object.freeze({
    STORAGE_KEYS,
    DEFAULT_ENABLED_SITES,
    DEFAULT_SETTINGS,
    MAX_ENABLED_SITES,
    MAX_ALLOW_RULES,
    SUPPORTED_LANGUAGES,
    LANGUAGE_LABELS,
    TYPE_LABELS_BY_LANG,
    TYPE_LABELS,
    ALLOWED_RULE_TYPES,
    I18N,
    t,
    getTypeLabel,
    normalizeHostname,
    hostnameLabels,
    getSiteKey,
    normalizeSiteKeyInput,
    siteKeyMatchesHostname,
    matchingEnabledSiteKeys,
    isProtectedBrowsingContext,
    ruleKey,
    parseRuleKey,
    normalizeHttpOrigin,
    normalizeAllowRule,
    sanitizeSettings,
    safeUrl,
    displayHost,
    sanitizeArray,
    getConfig,
    setEnabledSites,
    setAllowRules,
    setSettings,
  });
  globalThis.DBlockerShared = globalThis.AdsControlShared;
})();
