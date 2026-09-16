# DBlocker Extension v1.0.0

Extension bảo vệ và chặn quảng cáo hiện đại dành cho Chrome / Edge (Manifest V3), phát triển từ **Ads Navigation Control v2.6.3 Smart Player Protected**.

## Tính năng

- Giao diện **DBlocker** hoàn toàn mới: Hiện đại, tối giản cao cấp, phẳng tinh tế, thân thiện với người dùng và đồng bộ nhận diện thương hiệu.
- Protection theo **site key** không phụ thuộc TLD:
  - `motchillzs.cc`, `motchillzs.xyz`, `abc.motchillzs.id.vn` đều match key `motchillzs`.
  - `fake-motchillzs.xyz` không match `motchillzs`.
- Global ALLOW theo `type|origin`:
  - Allow `iframe|https://player.example` chỉ cho iframe đó load.
  - Popup / redirect / external-link của cùng origin vẫn bị block nếu chưa có rule tương ứng.
- Smart Player classifier thông minh:
  - iframe rõ là ads: block.
  - iframe có vẻ là player / chưa chắc: khung giữ chỗ với nút `▶ Tải 1 lần (Phát video)` + nút mở nhanh popup quản lý.
- Player iframe **inherit Protection** từ site cha đã bật.
- Chặn toàn diện:
  - popup / `window.open`
  - external links
  - tab-under / pop-under pattern
  - programmatic redirect (Navigation API + best-effort Location hooks)
  - cross-origin history redirects
  - cross-origin form submit
  - meta refresh
  - iframe cross-origin theo Smart Player
- Popup extension với 3 tab: **BLOCK / ALLOW / SITES** kèm bộ đếm thời gian thực và công tắc bảo vệ trực quan.
- Badge trên icon hiển thị số loại block hiện tại của tab.
- Options page dạng Dashboard hiện đại: quản lý toàn bộ SITES / ALLOW, Smart Player mode (SMART / STRICT / COMPATIBLE), xuất / nhập cấu hình JSON.

## Cài đặt trên Chrome / Edge

1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển).
3. Bấm chọn **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục `DBlocker` (thư mục chứa file `manifest.json`).
5. Ghim DBlocker lên thanh công cụ (Toolbar) để sử dụng thuận tiện.

## Cài trên Edge

1. Mở `edge://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**.
4. Chọn thư mục extension.

## Cách dùng

### Bật site

Mở site cần bảo vệ → bấm icon AdsControl → **Protection OFF → ON**.

AdsControl lưu site key, ví dụ `motchillzs`, nên site vẫn match nếu chuyển từ `.cc` sang `.xyz`, `.net`, `.id.vn`, v.v.

### Khi player bị chặn

Trong trang có thể hiện placeholder:

- **Load once**: chỉ chạy iframe đó trong document hiện tại.
- **Manage / Always allow**: mở popup. Trong tab BLOCK chọn **Always allow**.

Persistent ALLOW chỉ được sửa từ extension UI, không cho website tự ghi whitelist.

### Global ALLOW

Ví dụ:

- `iframe|https://player.example` → player iframe được load trên mọi protected site.
- Không tự tạo `popup|https://player.example` hay `redirect|https://player.example`.

## Kiến trúc

- `src/page-engine.js` — chạy `MAIN` world ở `document_start`, hook API của website.
- `src/controller.js` — chạy `ISOLATED` world, đọc `chrome.storage`, relay event và runtime message.
- `background.js` — MV3 service worker, registry BLOCK theo tab, badge, relay `Load once`.
- `popup/*` — UI nhanh BLOCK / ALLOW / SITES.
- `options/*` — quản lý global config và backup/restore.

## Lưu ý kỹ thuật

- AdsControl không dùng DNR/network-level blocking trong v1.0.0. Đây là chủ đích để không block nhầm CDN/player trước khi có ad-host rules đáng tin cậy.
- `Location` là native browser object; một số hook có thể bị Chromium từ chối. Navigation API và các capture handlers là lớp fallback.
- MAIN-world engine có thể bị một website rất hostile quan sát/can thiệp. Storage/config đặc quyền vẫn nằm ở isolated/extension contexts.
- Chrome internal pages (`chrome://...`), Web Store và một số restricted pages không cho content scripts chạy.

## Baseline

Core behavior được port từ userscript **v2.6.3**, không lấy Cosmetic Cleanup của v2.7.
