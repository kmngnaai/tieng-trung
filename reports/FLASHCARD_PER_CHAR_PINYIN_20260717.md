# FLASHCARD_PER_CHAR_PINYIN_20260717

## Mục tiêu
Đổi logic gõ pinyin từ kiểu ghép theo cụm/từ sang kiểu **từng chữ Hán một**.

## Đã sửa
- Tách pinyin đáp án thành từng âm tiết để map theo từng chữ Hán.
- `学生 / xuésheng` giờ sẽ thành:
  - 学 → xue
  - 生 → sheng
- `我们都是学生 / wǒmen dōu shì xuésheng` giờ sẽ thành:
  - 我 → wo
  - 们 → men
  - 都 → dou
  - 是 → shi
  - 学 → xue
  - 生 → sheng
- Highlight chữ Hán đang nhập cũng đổi sang **mỗi lần chỉ tô đúng 1 chữ**.
- Các chữ đã xong vẫn giữ trạng thái hoàn thành như cũ.

## Phạm vi file
- `modules/hanzi-stroke/app.js`

## Kiểm tra nhanh
1. `学生` → nhập `xue`, highlight chuyển từ `学` sang `生`; nhập `sheng` thì hoàn tất.
2. `我们都是学生` → highlight lần lượt `我 → 们 → 都 → 是 → 学 → 生`.
3. `你好` → nhập `ni` xong mới chuyển sang `好`; không tô cả 2 chữ cùng lúc.
4. Nếu nhập sai ở bước hiện tại, chỉ xử lý lỗi ở âm tiết/chữ hiện tại.

## Ghi chú
Patch này giữ nguyên các cải tiến trước đó về:
- live input pinyin
- xóa sai theo logic mới
- breadcrumb / tra / bộ thủ / recent lookup

Patch này chỉ đổi trọng tâm của phần **gõ pinyin từng chữ**.
