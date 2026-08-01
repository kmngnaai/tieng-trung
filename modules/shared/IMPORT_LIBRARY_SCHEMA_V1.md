# Import Library Schema V1

Hạ tầng nhập dùng chung cho tab **Nghe** và **Thẻ**.

## Định dạng hỗ trợ

- JSON UTF-8
- XLSX đọc hoàn toàn cục bộ bằng thư viện trong repo
- CSV UTF-8
- TXT UTF-8 phân cách bằng tab

CSV/TXT/XLSX đều được chuẩn hóa thành một danh sách dòng trước khi chuyển sang adapter Nghe hoặc Thẻ.

## Quy tắc an toàn

- Nhập nội dung mới không ghi đè âm thầm. ID trùng với thư viện hiện tại được đổi sang ID khả dụng mới.
- Khôi phục backup là luồng riêng và chỉ nhận đúng định dạng backup của ứng dụng.
- Mọi file đều có bước xem trước, thống kê, cảnh báo và lỗi trước khi lưu.

## Cột chung

| Cột | Ý nghĩa |
|---|---|
| `row_type` | Loại dòng |
| `library_group_id` | ID nhóm thư viện |
| `library_group_name` | Tên nhóm thư viện |
| `deck_id` | ID bộ |
| `deck_name` | Tên bộ |
| `deck_description` | Mô tả bộ |
| `hanzi` | Hán tự, từ hoặc câu |
| `pinyin` | Pinyin |
| `meaning` | Nghĩa tiếng Việt |
| `enabled` | `1` dùng để học, `0` tạm tắt |

## Nghe

Các `row_type` được hỗ trợ:

- `group`
- `deck`
- `word`
- `sentence`
- `dialogue_turn`
- `passage_sentence`

Cột bổ sung:

| Cột | Ý nghĩa |
|---|---|
| `content_group_id` | ID hội thoại hoặc đoạn văn |
| `content_group_title` | Tên hội thoại hoặc đoạn văn |
| `order` | Thứ tự lượt thoại hoặc câu trong đoạn |
| `speaker` | Người nói trong hội thoại |
| `word_type` | Loại từ |
| `tokens` | Cụm xếp câu, phân cách bằng `|` |
| `tags` | Nhãn câu |
| `sentence_type` | Nhóm câu để mở rộng bộ lọc |

Quy tắc:

- Các dòng cùng `deck_id` tạo một Listening Dataset V1 hoàn chỉnh.
- Khác `deck_id` tạo các bộ riêng.
- Các bộ cùng `library_group_id` nằm trong một nhóm thư viện.
- Nút **Học toàn nhóm** tạo dataset tạm thời từ các bộ trong nhóm, không sửa dữ liệu gốc.
- Hội thoại và đoạn văn cần ít nhất hai dòng. Dòng đơn vẫn được giữ như câu.
- Phiên bản đầu không có sheet Ngữ pháp riêng; dùng `tags` hoặc `sentence_type`.
- Dữ liệu Nghe cũ được migration thành câu, không tự suy đoán thành từ.

## Thẻ

Các `row_type` được hỗ trợ:

- `group`
- `deck`
- `card`

Một file có thể tạo:

- một thẻ;
- một bộ chứa nhiều thẻ;
- một nhóm chứa nhiều bộ.

## XLSX mẫu

### Nghe

- `00_HUONG_DAN`
- `01_BO_TONG_HOP`
- `02_CHI_TU_VUNG`
- `03_CHI_CAU`
- `04_CHI_HOI_THOAI`
- `05_CHI_DOAN_VAN`
- `06_NHOM_NHIEU_BO`

### Thẻ

- `00_HUONG_DAN`
- `01_MOT_THE`
- `02_MOT_BO_NHIEU_THE`
- `03_MOT_NHOM_NHIEU_BO`

## Dán kết quả AI V1

Giao diện **Dán kết quả AI** dùng cùng parser trong `modules/shared/import-core.js` cho tab Thẻ và Nghe.

### Dữ liệu đầu vào được chấp nhận

- Một JSON thuần.
- JSON nằm trong khối Markdown như ```` ```json ````.
- Nhiều JSON đặt liên tiếp.
- Toàn bộ đoạn trò chuyện có văn bản giải thích xen giữa các JSON.
- Một gói có các khóa `vocabulary`, `sentences`, `grammar`, `dialogues`, `passages` để nhập một bộ đầy đủ. Prompt tạo gói đầy đủ chưa thuộc phiên bản này.

### Hai chế độ

- **Nhập nhanh từng loại:** người dùng chọn trước Từ vựng, Câu, Ngữ pháp, Hội thoại hoặc Đoạn văn.
- **Nhập một bộ đầy đủ:** tự nhận diện tất cả loại có trong nội dung đã dán.

### Hợp đồng kết quả AI khuyến nghị

```json
{
  "format": "tieng-trung-ai-result-v1",
  "type": "sentence",
  "level": "HSK 1",
  "topic": "Giới thiệu gia đình",
  "extra_words": [],
  "quality_notes": [],
  "items": []
}
```

`type` nhận một trong:

- `vocabulary`
- `sentence`
- `grammar`
- `dialogue`
- `passage`

### Kiểm tra trước khi nhập

- Lỗi thiếu chữ Hán, thiếu `speaker`, trùng ID hoặc JSON hỏng sẽ được báo trước khi lưu.
- Thiếu pinyin, nghĩa, tokens, tokens không khớp hoặc token quá dài là cảnh báo.
- Từ ngoài nguồn trong `extra_words` được hiển thị thành cảnh báo.
- `source_word_ids` và `grammar_ids` được đối chiếu với các khối đã dán khi có dữ liệu nguồn tương ứng.
- Tokens giữ nguyên thứ tự và số lần lặp; không loại bỏ token lặp trong câu.
- Người dùng có thể bỏ chọn từng khối nội dung trước khi nhập.

### Đích nhập

Từ tab Thẻ, người dùng có thể:

- tạo bộ Thẻ mới;
- thêm vào bộ Thẻ có sẵn;
- đặt bộ mới vào nhóm có sẵn;
- tạo bộ Nghe mới;
- thêm vào bộ Nghe có sẵn;
- tạo đồng thời cả Thẻ và Nghe.

Từ tab Nghe, người dùng có thể tạo bộ Nghe mới, thêm vào bộ có sẵn hoặc đặt bộ mới trong nhóm thư viện.

ID bộ mới bị trùng sẽ được đổi sang ID khả dụng. Khi thêm vào bộ có sẵn, mục trùng hoàn toàn được bỏ qua thay vì ghi đè âm thầm.

## Nhập một bộ đầy đủ: nhóm và các bộ riêng

Khi dùng chế độ **Nhập một bộ đầy đủ**, ứng dụng không gom mọi loại nội dung vào một deck.

Ứng dụng tạo một nhóm theo tên chủ đề và tối đa năm bộ con:

- `<Chủ đề> · Từ vựng`
- `<Chủ đề> · Câu`
- `<Chủ đề> · Ngữ pháp`
- `<Chủ đề> · Hội thoại`
- `<Chủ đề> · Đoạn văn`

Chỉ loại có dữ liệu và đang được chọn mới được tạo. Cùng quy tắc được áp dụng cho thư viện Thẻ và thư viện Nghe.

Trong tab Nghe, bộ Ngữ pháp chứa các câu ví dụ ngữ pháp dưới dạng câu nghe. Trong chế độ **Nhập nhanh từng loại**, người dùng vẫn có thể tạo một bộ riêng hoặc thêm vào bộ có sẵn như trước.
