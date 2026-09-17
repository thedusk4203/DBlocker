# DBlocker for Firefox v1.1.0

Đây là target Firefox desktop của DBlocker. Firefox được giữ thành một
package riêng vì vòng đời background và một số API extension khác với
Chromium.

## Nạp thử trên Firefox

1. Mở `about:debugging`.
2. Chọn **This Firefox**.
3. Chọn **Load Temporary Add-on**.
4. Mở file `manifest.json` trong thư mục `firefox/` này.

## Phạm vi phát hành

Source của Firefox đã được đặt riêng trong repo, nhưng việc nạp được source
không tự động chứng minh rằng bản này đã qua toàn bộ kiểm thử trên Firefox
thật, đã qua `web-ext lint`, hoặc đã được Mozilla ký. Các bước đó cần được
thực hiện lại trước khi công bố một bản phát hành chính thức.

Không dùng thư mục này để nạp trên Chrome/Edge; target Chromium nằm ở
[`../chromium/`](../chromium/).

Thông tin giấy phép dùng chung nằm ở [`../LICENSES/`](../LICENSES/) và
[`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
