# DBlocker

DBlocker là browser extension do người dùng điều khiển để giảm popup,
redirect, click overlay, tab-under và các navigation trap gây khó chịu.

Phiên bản Chromium và Firefox nằm trong cùng repository nhưng được giữ thành
hai package độc lập. Lý do là hai nền tảng có khác biệt về vòng đời background
và API extension.

## Cấu trúc repository

| Thư mục | Nền tảng | Cách nạp thử |
| --- | --- | --- |
| [`chromium/`](chromium/) | Chrome / Edge | `chrome://extensions` → **Load unpacked** |
| [`firefox/`](firefox/) | Firefox desktop | `about:debugging` → **Load Temporary Add-on** |
| [`LICENSES/`](LICENSES/) | Giấy phép dùng chung | Không phải thư mục để nạp extension |

Trong mỗi target, `manifest.json` nằm ở ngay thư mục gốc. Vì vậy khi nạp
extension, hãy chọn đúng `chromium/` hoặc `firefox/`, không chọn thư mục
repository bên ngoài.

## Phiên bản hiện tại

- Chromium: `1.1.0` — xem [`chromium/README.md`](chromium/README.md).
- Firefox: `1.1.0` — xem [`firefox/README.md`](firefox/README.md).

Bản Firefox là một port riêng. Source có mặt trong repository không đồng
nghĩa với việc bản đó đã được Mozilla ký, đã phát hành trên AMO, hoặc đã qua
toàn bộ kiểm thử hành vi trên Firefox thật.

## Phát hành

Các file ZIP/XPI tạo ra trong quá trình đóng gói là artifact phát hành, không
nên trộn vào source tree. Khi có bản phát hành chính thức, nên đính kèm chúng
trong mục **GitHub Releases** và ghi rõ target, version, checksum cùng trạng
thái kiểm thử.

## Giấy phép

Xem [MPL-2.0](LICENSES/MPL-2.0.txt) và
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
