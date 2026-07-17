# Flashcard Gõ Pinyin — hiển thị toàn bộ chuỗi đang nhập

## Mục tiêu

- Giữ nguyên toàn bộ chữ Trung hoặc câu Trung ở phía trên thẻ.
- Ô nhập luôn có placeholder `Nhập pinyin không dấu`.
- Khi người học gõ, ô nhập giữ toàn bộ chuỗi đã nhập: `wo` → `wo jin` → `wo jintian`.
- Khi chuỗi dài hơn chiều rộng ô, ô tự cuộn ngang sang phải và giữ phần mới nhất cùng con trỏ trong vùng nhìn thấy. Dữ liệu phía trước chỉ bị khuất, không bị xóa.
- Nếu chuỗi nhập không còn là tiền tố đúng của đáp án, toàn bộ ô chuyển đỏ trong 450 ms rồi tự xóa để nhập lại. Bàn phím và focus được giữ.

## Thay đổi giao diện và logic

### 1. Ô nhập Pinyin trực tiếp

Bỏ cơ chế cũ xóa `input.value` sau mỗi sự kiện nhập. Trạng thái mới lưu `typedValue` và đồng bộ lại đúng chuỗi người học đang gõ.

Ví dụ đáp án `wǒ jīntiān qù xuéxiào` chấp nhận tuần tự:

- `w`
- `wo`
- `wo jin`
- `wo jintian`
- `wo jintian qu`
- `wo jintian qu xuexiao`

### 2. Cuộn ngang về phần mới nhất

Sau mỗi lần cập nhật hợp lệ:

- đặt con trỏ ở cuối;
- đặt `scrollLeft = scrollWidth`;
- input một dòng, không xuống hàng;
- không dùng dấu ba chấm làm thay đổi dữ liệu thật.

### 3. Sai thì đỏ rồi xóa

Khi chuỗi không còn khớp tiền tố đáp án:

- thêm class `is-wrong`;
- viền, nền và chữ chuyển đỏ;
- hiện `Chưa đúng, nhập lại`;
- giữ chuỗi sai 450 ms;
- xóa toàn bộ chuỗi;
- đưa focus trở lại ô nhập.

### 4. Thêm kiểu câu hỏi riêng

Bốn lựa chọn hiện có trong Thiết lập Gõ Pinyin:

1. `Chữ Trung → Pinyin`: chỉ hiện chữ/câu Trung.
2. `Chữ Trung + Nghĩa Việt → Pinyin`: hiện chữ/câu Trung và nghĩa Việt.
3. `Nghĩa Việt → Pinyin`: chỉ hiện nghĩa Việt.
4. `Hỗn hợp ba kiểu`: luân phiên ba kiểu với thẻ có đủ nghĩa.

Lựa chọn được lưu cùng cài đặt Flashcard như trước.

### 5. Tương thích phiên đang học

- `typedValue` được lưu trong phiên Flashcard.
- Reload giữa lúc nhập sẽ khôi phục chuỗi đã nhập.
- Phiên cũ chưa có `typedValue` được chuyển đổi từ dữ liệu ký tự đã ghi nhận.
- Trạng thái báo sai dang dở không làm phiên bị kẹt sau reload.

## File thay đổi

- `modules/hanzi-stroke/app.js`
- `modules/hanzi-stroke/style.css`
- `modules/hanzi-stroke/index.html`
- `tests/test_ui_upgrade.py`
