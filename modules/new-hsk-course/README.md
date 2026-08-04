# New 3.0 Course

Module giáo trình **New 3.0**, tách khỏi dữ liệu từ vựng của `hanzi-stroke` nhưng liên kết hai chiều với Flashcard, Listening, Tra cứu, Bộ thủ và Bút thuận đang có trong repo.

## Phạm vi hiện tại

- HSK 1 Bài 1.
- Một JSON runtime: `data/hsk1/lesson-01.json`.
- Hai cách xem dùng chung dữ liệu:
  - **Bài học:** theo `views.bookFlow`, đúng thứ tự sách.
  - **Nội dung:** theo `views.groupedIndex`, gom theo từng phần; thanh chip giữ vị trí khi đổi nhóm.
- Hội thoại và bài vè đọc theo các lớp Hán / Pinyin / Việt; dữ liệu từng lượt vẫn được giữ để nhập vai, nghe, nối, sắp xếp và luyện gõ.
- Tab **Luyện tập** ôn lại từ vựng, danh từ riêng, câu, hội thoại, đoạn/bài vè và ngữ pháp bằng 10 hoạt động.
- `practicePlan` chỉ tham chiếu entity ID; dữ liệu bài tập biên soạn nằm trong `source/hsk1/practice/HSK1_Bai_01_practice.json`.
- `Cấu tạo & Bộ thủ` có học cấu tạo, xếp chữ vào thành phần, ghép thành phần và mở đúng chữ/bộ thủ trong `hanzi-stroke`.

## Chạy local

```powershell
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1&view=book
```

Hoặc từ `Học → New 3.0 → HSK 1 → Bài 1`, nhấn **Học toàn bộ bài theo sách**.

## Build và kiểm tra dữ liệu

```powershell
python scripts/new-hsk-course/build_course_data.py --markdown modules/new-hsk-course/source/hsk1/HSK1_Bai_01.md --dialogues modules/new-hsk-course/source/hsk1/dialogues/HSK1_Bai_01_dialogues.json --practice modules/new-hsk-course/source/hsk1/practice/HSK1_Bai_01_practice.json --output modules/new-hsk-course/data/hsk1/lesson-01.json
python scripts/new-hsk-course/validate_course_data.py modules/new-hsk-course/data/hsk1/lesson-01.json --report modules/new-hsk-course/data/hsk1/lesson-01.validation.json
python -m unittest discover -s tests/new-hsk-course -p "test_*.py"
python scripts/test-new-hsk-course-browser.py
```
