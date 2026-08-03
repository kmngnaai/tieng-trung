# Test local — New HSK 3.0 · HSK 1 Bài 1

## 1. Chạy web local

Tại thư mục gốc của repo:

```powershell
python -m http.server 8000
```

## 2. Mở trực tiếp bài thử nghiệm

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1&view=book
```

Kiểm tra:

- Tab **Bài học** đi theo đúng thứ tự sách.
- Tab **Nội dung** gom theo Từ vựng, Hội thoại, Ghi chú, Bài vè, Hoạt động và Mở rộng.
- Hội thoại có ba lớp liên tục, không có tiêu đề `Lượt`.
- Nút **拼** ẩn/hiện toàn bộ pinyin mà không làm trang nhảy lên đầu.
- Bấm chữ Hán trong từ vựng mở trang Tra.
- Breadcrumb hiển thị `Học → Giáo trình → New HSK 3.0 → HSK 1 → Bài 1`.

## 3. Mở từ New HSK hiện tại

```text
http://localhost:8000/modules/hanzi-stroke/index.html?study=hsk&curriculum=new_hsk&level=1&section=new_hsk__1__lesson__1__bai-1-hello-ai-xiaoyu&sectionMode=lessons
```

Trong danh sách từ của Bài 1, nhấn **Học toàn bộ bài theo sách**.

## 4. Chạy kiểm tra dữ liệu

```powershell
python -m unittest discover -s tests/new-hsk-course -p "test_*.py"
python scripts/test-new-hsk-course-browser.py
python tests/test_ui_upgrade.py
node tests/test_header_breadcrumb_runtime.js
```
