# New HSK Course

Module thử nghiệm giáo trình **New HSK 3.0**, tách khỏi dữ liệu từ vựng của `hanzi-stroke` nhưng liên kết hai chiều với màn hình New HSK hiện có.

## Phạm vi hiện tại

- HSK 1 Bài 1.
- Một JSON runtime: `data/hsk1/lesson-01.json`.
- Hai cách xem dùng chung dữ liệu:
  - **Bài học:** theo `views.bookFlow`, đúng thứ tự sách.
  - **Nội dung:** theo `views.groupedIndex`, gom theo từng phần.
- Hội thoại đọc theo ba lớp; dữ liệu từng lượt vẫn được giữ để phát triển nhập vai, nghe và luyện gõ.

## Chạy local

```powershell
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1
```

Hoặc từ màn hình `Học → Giáo trình → New HSK → HSK 1 → Bài 1`, nhấn **Học toàn bộ bài theo sách**.

## Build và kiểm tra dữ liệu

```powershell
python scripts/new-hsk-course/build_course_data.py --markdown modules/new-hsk-course/source/hsk1/HSK1_Bai_01.md --dialogues modules/new-hsk-course/source/hsk1/dialogues/HSK1_Bai_01_dialogues.json --output modules/new-hsk-course/data/hsk1/lesson-01.json
python scripts/new-hsk-course/validate_course_data.py modules/new-hsk-course/data/hsk1/lesson-01.json --report modules/new-hsk-course/data/hsk1/lesson-01.validation.json
python -m unittest discover -s tests/new-hsk-course -p "test_*.py"
```
