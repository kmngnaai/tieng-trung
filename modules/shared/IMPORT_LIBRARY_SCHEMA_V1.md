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
