# Flashcard — cỡ chữ Hán cố định, chỉ xuống hàng sau 10 chữ

## Yêu cầu
- Mọi thẻ gõ pinyin dùng cùng một cỡ chữ Hán.
- Không tự co lớn/nhỏ theo độ dài câu.
- Từ 1 đến 10 chữ Hán giữ trên một dòng.
- Từ 11 chữ Hán trở lên được phép xuống hàng.

## Thay đổi
- Bỏ hàm tự đo và giảm font `fitFlashcardTypingPromptHanzi`.
- Thêm phân loại:
  - `is-hanzi-single-line`: 10 chữ trở xuống.
  - `is-hanzi-wrap`: trên 10 chữ.
- Cỡ chữ Hán cố định: `28px`.
- Khoảng cách giữa các chữ vẫn gọn.
- Giữ nguyên logic tô chữ đang nhập và nhập pinyin từng chữ.
- Đổi cache sang `20260717-pinyinfixedsize1`.

## Test
- 1 chữ: không phóng lớn hơn.
- 4 chữ: cùng cỡ với 1 chữ.
- 9–10 chữ: giữ một dòng.
- 11 chữ trở lên: được xuống hàng.
- Không còn JS tự chỉnh font.
