# DBlocker for Chromium v1.1.0

Đây là target dành cho Chrome và Edge. Thư mục này là một extension package
độc lập: file `manifest.json` nằm ngay tại thư mục gốc để có thể nạp bằng
**Load unpacked**.

## Cài đặt trên Chrome / Edge

1. Mở `chrome://extensions` hoặc `edge://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**.
4. Chọn đúng thư mục `chromium/` này.

## Cách dùng nhanh

Mở site cần bảo vệ → bấm icon DBlocker → chuyển **Protection** từ **OFF**
sang **ON**.

DBlocker lưu site key nên rule không phụ thuộc riêng vào một TLD. Khi một
player bị giữ lại, hãy mở phần quản lý từ placeholder hoặc popup và chọn
**Always allow** nếu đó là player đáng tin cậy. Persistent ALLOW chỉ được
chỉnh từ giao diện extension.

## Ghi chú

- Đây là bản Chromium; không dùng thư mục này để nạp tạm trên Firefox.
- Chính sách và runtime của bản Firefox nằm riêng trong [`../firefox/`](../firefox/).
- Thông tin giấy phép dùng chung nằm ở [`../LICENSES/`](../LICENSES/) và
  [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
