# Flashcard Pinyin — nhập theo từng chữ + tô chữ Hán đang nhập

## Đã sửa

### 1) Ô nhập pinyin
- Căn giữa nội dung trong ô nhập.
- Giữ placeholder `Nhập pinyin không dấu`.
- Chỉ hiển thị phần đang nhập cho **chữ hiện tại**, không giữ toàn bộ chuỗi pinyin của cả câu.

### 2) Logic nhập sai
- Nếu nhập sai, chỉ bỏ ký tự sai cuối cùng.
- Không xóa toàn bộ phần đã nhập đúng trước đó.
- Ví dụ: `你好` / `ni hao`
  - gõ `n` → giữ `n`
  - gõ tiếp `o` → sai, tự bỏ `o`, còn `n`
  - gõ tiếp `i` → hoàn thành `ni`

### 3) Tự chuyển sang chữ kế tiếp
- Khi nhập xong một âm tiết đúng, ô nhập sẽ xóa phần đó và chuyển sang chữ tiếp theo.
- Ví dụ `我今天去学校`:
  - `wo` xong → ô nhập trống lại
  - chuyển sang `jin`
  - rồi `tian`
  - rồi `qu`
  - rồi `xue`
  - rồi `xiao`

### 4) Tô nền chữ Hán đang nhập
- Câu/chữ Hán vẫn hiển thị đầy đủ.
- Chữ đang nhập được tô nền nổi bật.
- Chữ đã xong được tô trạng thái hoàn thành nhẹ.

## File đã sửa
- `modules/hanzi-stroke/app.js`
- `modules/hanzi-stroke/style.css`

## Gợi ý test nhanh
1. Mở Flashcard → chế độ **Gõ Pinyin**.
2. Chọn kiểu **Chữ Trung → Pinyin** hoặc **Chữ Trung + Nghĩa Việt → Pinyin**.
3. Test các case:
   - `你好` → nhập `n`, `o` (sai), rồi `i`, tiếp `hao`.
   - `我是学生` → xem highlight chạy lần lượt theo từng chữ.
   - `我今天去学校` → xem ô nhập chỉ giữ phần hiện tại, không giữ cả câu.
4. Kiểm tra mobile:
   - ô nhập căn giữa
   - không lệch trái
   - chữ Hán đang nhập được tô nền
   - nhập sai chỉ mất ký tự sai cuối cùng
