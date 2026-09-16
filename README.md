# DBlocker Extension v1.0.0

## Cài đặt trên Chrome / Edge

1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển).
3. Bấm chọn **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục `DBlocker`.

## Cách dùng

### Bật site

Mở site cần bảo vệ → bấm icon DBlocker → **Protection OFF → ON**.

DBlocker lưu site key, ví dụ `abcde`, nên site vẫn match nếu chuyển từ `.cc` sang `.xyz`, `.net`, `.id.vn`, v.v.

### Khi player bị chặn

Player được nhận diện. Mở phần quản lý từ placeholder/popup và chọn **Always allow**. DBlocker lưu rule `iframe|origin` rồi reload tab để player khởi tạo lại sạch. Iframe `unknown` không phải player mới có thể dùng **Load once**.

Persistent ALLOW chỉ được sửa từ extension UI, không cho website tự ghi whitelist.


