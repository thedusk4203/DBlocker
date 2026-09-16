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

Player được nhận diện rõ **không có Allow once**. Mở phần quản lý từ placeholder/popup và chọn **Always allow**. DBlocker lưu rule `iframe|origin` rồi reload tab để player khởi tạo lại sạch. Iframe `unknown` không phải player mới có thể dùng **Load once**.

Persistent ALLOW chỉ được sửa từ extension UI, không cho website tự ghi whitelist.

### Global ALLOW

Ví dụ:

- `iframe|https://player.example` → player iframe được load trên mọi protected site.
- Không tự tạo `popup|https://player.example` hay `redirect|https://player.example`.
- `popup|https://trusted.example` chỉ cho phép popup tại origin đó; nếu child tab tự redirect sang origin khác thì origin cuối phải có ALLOW phù hợp (`popup|...` hoặc `redirect|...`).
- `form|https://forms.example` chỉ áp dụng cho form submit thực sự; background quarantine không coi rule này là popup ALLOW chung.


