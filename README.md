# DBlocker

[Chrome Web Store — Coming soon](https://chromewebstore.google.com/) · [Firefox Add-ons — Coming soon](https://addons.mozilla.org/firefox/)

DBlocker là browser extension do người dùng điều khiển để giảm popup,
redirect, click overlay, tab-under và các navigation trap gây khó chịu.

Hai liên kết store ở trên là trang chờ. Trong thời gian chưa có listing chính
thức, hãy cài đặt từ artifact trong [GitHub Releases](https://github.com/thedusk4203/DBlocker/releases).

## Cài đặt thủ công từ GitHub Releases

Mở mục [Releases](https://github.com/thedusk4203/DBlocker/releases) và tải
đúng loại file cho trình duyệt bạn đang dùng:

### Chrome / Edge — file `.zip`

1. Tải asset `.zip` của Chromium.
2. Giải nén file ZIP vào một thư mục riêng.
3. Mở `chrome://extensions` hoặc `edge://extensions`.
4. Bật **Developer mode**.
5. Chọn **Load unpacked** và chọn thư mục vừa giải nén, nơi có file
   `manifest.json`.

### Firefox — file `.xpi`

1. Tải asset `.xpi` của Firefox.
2. Mở `about:addons`.
3. Bấm biểu tượng bánh răng → **Install Add-on From File…**.
4. Chọn file `.xpi` vừa tải.

Nếu Firefox không cho cài file XPI do yêu cầu chữ ký, hãy dùng
`about:debugging` → **This Firefox** → **Load Temporary Add-on** để nạp thử
file `manifest.json` từ source Firefox.

## Cách dùng

Mở site cần bảo vệ → bấm icon DBlocker → chuyển **Protection** từ **OFF**
sang **ON**.

DBlocker lưu site key nên rule không phụ thuộc riêng vào một TLD. Khi một
player bị giữ lại, hãy mở phần quản lý từ placeholder hoặc popup và chọn
**Always allow** nếu đó là player đáng tin cậy. Persistent ALLOW chỉ được
chỉnh từ giao diện extension.

## Source trong repository

- [`chromium/`](chromium/) — source target cho Chrome và Edge.
- [`firefox/`](firefox/) — source target cho Firefox desktop.
- [`LICENSES/`](LICENSES/) và [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
  — giấy phép và thông báo bên thứ ba dùng chung.

Trong mỗi target, `manifest.json` nằm ở thư mục gốc của target. Các file ZIP
hoặc XPI phát hành không được trộn vào source tree.
