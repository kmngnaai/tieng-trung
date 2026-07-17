# Báo cáo tổng quan repo `tieng-trung` và kế hoạch hợp nhất điều hướng

> **Mục đích tài liệu**  
> Tài liệu này là hồ sơ ngữ cảnh kỹ thuật hiện tại của dự án, dùng làm căn cứ trước khi tiếp tục NAV.0–NAV.7. Nội dung tổng hợp từ: repo GitHub đang triển khai, gói nền `modules(1).zip`, chuỗi patch C2A/FC-TYPE mới nhất, audit Flashcard, audit Navigation và các quy tắc đã chốt trong quá trình phát triển.

---

## 0. Kết luận điều hành

Repo hiện không còn là một tập hợp vài trang học rời rạc. Nó đã phát triển thành một **ứng dụng học tiếng Trung đa mô-đun**, trong đó `modules/hanzi-stroke/` đang gánh phần lớn nghiệp vụ: tra cứu chữ/từ, luyện viết, HSK/giáo trình, bộ thủ, ngữ pháp, Flashcard, thư viện Thẻ, thống kê và Gõ Pinyin.

Vấn đề lớn nhất hiện tại không nằm ở thiếu chức năng mà nằm ở **kiến trúc điều hướng và cấu trúc giao diện không còn theo kịp kiến trúc chức năng**:

- mỗi module tự có header, tab và bottom navigation riêng;
- cùng một khái niệm được đặt tên khác nhau giữa các trang;
- nút `☰` ở một số trang chỉ là phần tử giao diện, không có hành vi;
- route 301 đang phụ thuộc hash của trang chủ;
- tab Tra mới tồn tại dưới prototype riêng, trong khi HSK/Bộ thủ/Thẻ vẫn nằm trong `hanzi-stroke` chính;
- cài đặt nằm rải rác ở nhiều `localStorage` key và IndexedDB;
- các patch mới thường phải sửa riêng từng nơi, làm tăng nguy cơ lệch phiên bản.

Do đó, hướng đúng là:

1. **không tiếp tục vá từng nút menu riêng lẻ**;
2. xây một **app shell dùng chung** cho toàn repo;
3. chuẩn hóa điều hướng cấp ứng dụng thành:

```text
Trang chủ | Tra | Học | Menu
```

4. đưa `301` vào nhóm chức năng Học, đặt sau `Thẻ` trong menu/tab cấp hai;
5. giữ các engine hiện có, chỉ thống nhất shell, route và settings trước;
6. tiến hành theo từng giai đoạn có audit, migration và QA mobile.

---

# PHẦN I — TỔNG QUAN REPO HIỆN TẠI

## 1. Repo là gì

Repo `kmngnaai/tieng-trung` là một ứng dụng web tĩnh phục vụ tự học tiếng Trung, triển khai trên GitHub Pages. Công nghệ chủ đạo hiện tại là:

- HTML;
- CSS;
- JavaScript thuần;
- JSON local;
- `localStorage`;
- IndexedDB;
- Hanzi Writer;
- Web Speech API/TTS của trình duyệt;
- GitHub Pages làm môi trường phát hành.

Ứng dụng không có backend bắt buộc. Phần lớn dữ liệu được build trước thành JSON rồi tải trực tiếp trên trình duyệt.

## 2. Mục tiêu sản phẩm đã hình thành

Mục tiêu thực tế của repo hiện nay gồm năm nhóm lớn:

1. **Tra cứu**
   - chữ Hán;
   - từ nhiều chữ;
   - pinyin;
   - nghĩa Việt;
   - Hán Việt;
   - bộ thủ;
   - số nét;
   - từ/câu/ngữ pháp liên quan.

2. **Học theo chương trình**
   - New HSK 9 cấp;
   - HSK 6 cấp;
   - YCT;
   - Boya;
   - bài học;
   - chủ đề;
   - từ vựng;
   - ngữ pháp.

3. **Luyện kỹ năng**
   - Pinyin;
   - nghe;
   - quiz;
   - viết chữ;
   - thứ tự nét;
   - luyện không viền;
   - Gõ Pinyin tuần tự.

4. **Ôn tập cá nhân hóa**
   - Flashcard;
   - Đảo ngược;
   - Nghe;
   - Gõ Pinyin;
   - Hỗn hợp;
   - Dễ/Ôn/Khó;
   - khôi phục phiên;
   - thống kê;
   - bộ thẻ tự tạo.

5. **Nội dung 301 đàm thoại**
   - danh sách bài;
   - hội thoại/câu mẫu;
   - từ vựng;
   - route hiện tại dựa trên `#dialogue301`.

## 3. Cấu trúc cấp cao đang tồn tại

```text
tieng-trung-web/
├── index.html
├── app.js
├── style.css
├── modules/
│   ├── hanzi-stroke/
│   ├── pinyin/
│   ├── bo-thu-50/
│   └── shared/                 # xuất hiện trong nhánh NAV gần đây
├── lessons-301/
└── ... dữ liệu/tài liệu khác
```

### Nhận xét

- `modules/pinyin/` vẫn là module độc lập.
- `modules/bo-thu-50/` là module Bộ thủ đời cũ, vẫn có giá trị tham khảo và dữ liệu.
- `lessons-301/` là khu nội dung 301, nhưng routing hiện chưa được chuẩn hóa.
- `modules/hanzi-stroke/` đã phát triển vượt xa vai trò “bút thuận”. Đây hiện là **module nghiệp vụ trung tâm**.

---

# PHẦN II — PHÂN TÍCH TỪNG KHỐI CHỨC NĂNG

## 4. Trang chủ

### 4.1 Vai trò hiện tại

Trang chủ là cổng vào ứng dụng và từng được thiết kế theo kiến trúc V1 với các mục ngang cấp như:

```text
Trang chủ
Pinyin
Bút thuận
301 Đàm thoại
```

### 4.2 Vấn đề

- bottom navigation cũ không phản ánh các chức năng mới như Tra, HSK, Bộ thủ, Thẻ;
- một số module từng được gắn nhãn chưa sẵn sàng;
- `☰` có thể chỉ là button giao diện, không có drawer hoặc listener;
- route 301 vẫn dùng hash tại trang chủ;
- Trang chủ chưa đóng vai trò dashboard thực sự.

### 4.3 Vai trò nên chuyển thành

Trang chủ nên là dashboard nhẹ, chỉ hiển thị dữ liệu thực sự có thể đọc từ storage:

```text
Tiếp tục học
Thẻ cần Ôn/Khó
Bài học gần đây
Truy cập nhanh
Tiến độ tổng quan
```

Không tạo chỉ số giả. Mục nào chưa có dữ liệu thì ẩn hoặc ghi rõ chưa sẵn sàng.

---

## 5. Module `modules/hanzi-stroke/`

## 5.1 Vai trò ban đầu và vai trò hiện tại

Tên thư mục cho thấy vai trò ban đầu là bút thuận, nhưng source hiện tại đã trở thành nơi chứa:

- Tra/luyện viết;
- HSK và nhiều giáo trình;
- Bộ thủ;
- Ngữ pháp;
- Flashcard bài học;
- Thư viện Thẻ độc lập;
- bộ thẻ tự tạo;
- nhập/xuất JSON;
- thống kê Dễ/Ôn/Khó;
- Gõ Pinyin.

Vì vậy, `hanzi-stroke` trên thực tế đang là **Learning Core** của repo.

## 5.2 File trung tâm

```text
modules/hanzi-stroke/index.html
modules/hanzi-stroke/app.js
modules/hanzi-stroke/style.css
```

`app.js` rất lớn và quản lý nhiều miền nghiệp vụ trong cùng một file. Đây là một rủi ro kỹ thuật lớn vì thay đổi navigation hoặc Flashcard có thể ảnh hưởng HSK, Bộ thủ, popup từ và Hanzi Writer.

## 5.3 Tab/nhánh chính đã tồn tại

Các tab tĩnh/động đã được xác nhận trong các audit trước:

```text
lookup       — Tra/Bút thuận cũ
hsk          — HSK & giáo trình
radicals     — Bộ thủ
flashcards   — Thẻ, được thêm động bằng JavaScript
```

Trong nhánh NAV mới, 301 được chèn sau `Thẻ`, nhưng đây mới là lớp navigation, chưa phải hợp nhất engine 301.

## 5.4 Tra và luyện viết

### Chức năng

- nhập một chữ hoặc từ;
- tra thông tin ký tự;
- xem pinyin, nghĩa, Hán Việt;
- nhận diện bộ thủ/số nét khi dữ liệu có;
- phát âm;
- luyện viết bằng Hanzi Writer;
- bật/tắt lưới, nét, thứ tự;
- xử lý từ nhiều chữ;
- mở từ/câu liên quan.

### Dữ liệu

```text
modules/hanzi-stroke/data/char-index.json
modules/hanzi-stroke/data/chars/<HEX>.json
```

Ngoài ra tab Tra mới dùng kho unified:

```text
modules/hanzi-stroke/data/learning/unified-lookup/all-sources/
├── unified-target-index.json
├── search-index.json
├── catalog-index.json
└── records/00.json ... FF.json
```

### Trạng thái hiện tại

Kho unified đã được mở rộng để tra toàn bộ inventory local, nhưng chất lượng record được chia theo dữ liệu thật. Các section không có dữ liệu phải được ẩn, không bịa nội dung.

## 5.5 Prototype Tra mới

```text
modules/hanzi-stroke/prototypes/lookup-c1-2/
```

### Chức năng đã có

- Tra chữ/từ/pinyin;
- Tra theo cấp độ & giáo trình;
- Tra theo Bộ thủ;
- Tra theo số nét;
- nhóm Khác;
- danh sách theo catalog;
- lọc chữ đơn/từ nhiều chữ;
- tìm trong danh sách;
- lazy render;
- quay lại đúng vị trí;
- chi tiết chữ/từ;
- ngữ pháp dạng modal;
- ẩn metadata kiểm duyệt khỏi giao diện công khai.

### Vấn đề kiến trúc

Prototype Tra mới chưa được hợp nhất hoàn toàn với shell của app chính. Đây là lý do route và navigation có nguy cơ lệch so với `modules/hanzi-stroke/index.html`.

## 5.6 HSK và giáo trình

### Nguồn hỗ trợ

```text
New HSK 9 cấp
HSK 6 cấp
YCT
Boya
```

### Chức năng

- chọn nguồn;
- chọn cấp;
- bài học;
- chủ đề;
- từ vựng;
- ngữ pháp;
- popup từ;
- Flashcard theo bài/chủ đề;
- tìm kiếm;
- grid/list;
- ghi nhớ mode/tab cuối.

### Data path

```text
modules/hanzi-stroke/data/learning/hsk/
modules/hanzi-stroke/data/learning/grammar/
```

### Logic quan trọng

- nguồn/cấp/bài/chủ đề phải lấy từ JSON đã build;
- không giả lập cấp dữ liệu không có;
- New HSK 7–9 có thể đang tồn tại dưới nhóm gộp;
- tab mặc định cần ổn định và ghi nhớ lựa chọn người dùng;
- popup từ và popup ngữ pháp không được hiển thị nguồn file công khai.

## 5.7 Bộ thủ

### Data path

```text
modules/hanzi-stroke/data/learning/radicals/
├── radical_learning_notes.json
├── radical_alias_index.json
├── radical_learning_summary.json
└── radical_groups.json
```

### Chức năng

- danh sách bộ thủ;
- nhóm theo nét;
- tìm kiếm;
- alias/biến thể;
- popup chi tiết;
- nghĩa, gợi nhớ, hình ảnh mô tả nếu có;
- chữ/từ/câu liên quan;
- mở chữ/từ từ popup Bộ thủ;
- quay lại đúng context.

### Hai lớp Bộ thủ đang tồn tại

1. Bộ thủ mới tích hợp trong `hanzi-stroke`;
2. module cũ `modules/bo-thu-50/`.

Hướng xử lý đúng là giữ module cũ làm nguồn tham khảo/data, nhưng navigation chính phải trỏ vào Bộ thủ mới.

## 5.8 Ngữ pháp

### Data path

```text
modules/hanzi-stroke/data/learning/grammar/
```

### Dữ liệu thực tế

Grammar source dùng các field như:

```text
grammar_syntax
grammar_explanation
grammar_tips
grammar_attentions
example
```

### Rule liên kết đã chốt

Chỉ liên kết target khi chữ/từ xuất hiện trực tiếp trong `topic` hoặc `syntax`. Ví dụ chỉ chứa target không được dùng để tạo grammar link, tránh false positive.

### UI hiện tại

- card ngữ pháp;
- modal chi tiết;
- cấu trúc;
- giải thích;
- mẹo;
- lưu ý;
- ví dụ;
- loa cùng hàng câu tiếng Trung;
- không hiện metadata nguồn công khai.

## 5.9 Flashcard và tab Thẻ

### Hai entry point, một engine

- Flashcard từ bài học/chủ đề;
- tab Thẻ độc lập.

Audit trước đã xác nhận hai luồng dùng chung engine và cùng quy về card runtime:

```json
{
  "id": "...",
  "word": "学习",
  "pinyin": "xuéxí",
  "meaningVi": "học tập"
}
```

### Chế độ

```text
Flashcard
Đảo ngược
Nghe
Gõ Pinyin
Hỗn hợp
```

### Thư viện Thẻ

- bộ thẻ tự tạo;
- tạo/sửa/xóa thẻ;
- nhập nhanh từ tiếng Trung;
- lưu IndexedDB;
- thùng rác;
- Xuất/Nhập JSON;
- danh sách Ôn/Khó;
- thống kê.

### Storage

#### localStorage

```text
hanziStroke.hskFlashcardSettings.v1
hanziStroke.hskFlashcardResults.v1
hanziStroke.hskFlashcardActiveSession.v1
hanziStroke.flashcardLibrarySort.v1
```

#### IndexedDB

```text
Database: hanziStrokeFlashcards
Version: 2
Stores:
- decks
- trash
```

### Rủi ro

- settings/session/results và deck dùng hai cơ chế lưu khác nhau;
- chưa có settings store cấp app;
- serializer phải tương thích ngược;
- không được reset/xóa key cũ khi làm navigation/settings chung.

## 5.10 Gõ Pinyin — FC-TYPE.1 đến FC-TYPE.5.2

### Engine

```text
modules/hanzi-stroke/pinyin-typing-engine.js
modules/hanzi-stroke/pinyin-typing-state-machine.js
```

### Chức năng đã xác nhận

- chuẩn hóa pinyin;
- bỏ dấu thanh;
- bỏ khoảng trắng;
- nhập tuần tự từng vị trí;
- sai ở đâu khóa ở đó;
- ký tự sai màu đỏ;
- sai 5 lần gợi ý đúng một ký tự;
- bóng đèn xem đáp án;
- thống kê Thời gian/Chính xác/Lỗi;
- dùng chung cho tab Thẻ và bài học/chủ đề;
- kết quả đúng hiện chữ Hán, pinyin, nghĩa Việt;
- giữ bàn phím mobile bằng patch DOM thay vì full render;
- timer chuyển thẻ theo số chữ Hán:
  - 0–5 chữ Hán: 30 giây;
  - trên 5 chữ Hán: 120 giây;
- chạm đầu khi input còn focus chỉ đóng bàn phím;
- chạm khối kết quả sau đó mới chuyển;
- nút Tiếp tục chuyển ngay.

### Điểm cần bảo vệ khi làm navigation

- drawer/menu không được ăn sự kiện click/touch của overlay;
- bottom nav không được nằm trên Flashcard overlay;
- app shell không được full render hoặc thay input trong lúc đang gõ;
- route change phải hủy timer completion;
- settings chung không được đổi rule 30/120 giây trong phiên bản đầu.

---

## 6. Module Pinyin

### File

```text
modules/pinyin/index.html
modules/pinyin/app.js
modules/pinyin/style.css
modules/pinyin/data/
modules/pinyin/audio/
modules/pinyin/source-reference/
```

### Tab/chức năng

```text
Học
Nghe
Quiz
Ôn
Tiến độ
Bảng tổng
Quy tắc
```

### Storage

```text
tiengtrung_pinyin_v12_state
```

### Vấn đề navigation

- module render header/navigation riêng;
- có top navigation đời cũ;
- cần app shell nhưng vẫn phải giữ tab nội bộ;
- khi đang ở Pinyin, primary active tab phải là `Học`.

---

## 7. Module Bộ thủ cũ `bo-thu-50`

### Chức năng đã có

```text
Tổng quan
Cách viết
Chữ ví dụ
Từ vựng
Mẫu câu
Bài tập
Kiểm tra
```

### Storage

```text
boThuFavs
boThuLearned
boThuTheme
```

### Hướng xử lý

- không xóa ngay;
- không tiếp tục dùng làm route Bộ thủ chính;
- thêm shell/chỉ dẫn sang Bộ thủ mới;
- giữ data và logic làm nguồn tham khảo;
- migration theme/favorite/learned chỉ làm sau khi audit schema.

---

## 8. 301 đàm thoại

### Trạng thái routing

Route có căn cứ hiện tại:

```text
../../index.html#dialogue301
```

### Vấn đề

- chưa có router chung;
- source nội bộ của `lessons-301/` chưa được audit sâu trong nhánh navigation gần nhất;
- 301 đang được hiểu là mục ngang cấp ở một số UI cũ và là submenu Học ở thiết kế mới.

### Quyết định đã chốt

- bottom navigation cấp app chỉ có:

```text
Trang chủ | Tra | Học | Menu
```

- trong Học/menu cấp hai, thứ tự:

```text
Pinyin | Bút thuận | HSK | Bộ thủ | Thẻ | 301
```

- 301 phải đứng sau Thẻ;
- chưa di chuyển engine 301 cho đến khi audit file/route hoàn tất.

---

# PHẦN III — DỮ LIỆU VÀ PIPELINE

## 9. Kho dữ liệu ký tự

```text
modules/hanzi-stroke/data/char-index.json
modules/hanzi-stroke/data/chars/<HEX>.json
```

Inventory local từng được xác định khoảng 10.880 hồ sơ ký tự. Không phải mọi record đều đầy đủ nghĩa Việt, Hán Việt, bộ thủ, từ và câu.

Nguyên tắc hiển thị hiện tại:

- chỉ hiển thị dữ liệu có thật;
- mục không có nghĩa Việt có thể bị loại khỏi danh sách Tra công khai;
- section rỗng phải ẩn;
- không tự sinh nội dung.

## 10. Unified lookup

### Mục tiêu

Một kho runtime duy nhất để phục vụ Tra, thay vì tải/merge nhiều nguồn raw trong trình duyệt.

### Cấu trúc

```text
unified-target-index.json
search-index.json
catalog-index.json
records/00.json ... FF.json
```

### Nguồn hợp nhất

- local chars;
- HSK/New HSK;
- YCT;
- Boya;
- grammar;
- radicals;
- reviewed data.

### Rule dữ liệu

- bộ thủ chỉ resolve khi có căn cứ;
- related words phải chứa đúng target;
- sentence phải chứa đúng target;
- grammar chỉ link theo topic/syntax;
- metadata nguồn/kiểm duyệt giữ trong file báo cáo, không show công khai.

## 11. Catalog Tra

```text
catalog-index.json
```

Phân loại:

```text
New HSK
HSK 6 cấp
Boya
YCT
Bộ thủ
Số nét
Khác
```

Runtime dùng catalog để mở danh sách, lọc, tìm và lazy render.

## 12. Pipeline build và validator

Repo đã có nhiều script build/validate theo từng giai đoạn. Nguyên tắc cần duy trì:

- builder làm công việc merge/enrich;
- runtime chỉ đọc file đã build;
- validator kiểm tra target tồn tại;
- không commit output rác;
- không dùng `git add .`;
- report và script phải được tách khỏi data runtime khi không cần deploy.

---

# PHẦN IV — KIẾN TRÚC ĐIỀU HƯỚNG HIỆN TẠI

## 13. Điều hướng đang phân mảnh

Hiện có ít nhất các lớp navigation độc lập:

1. root Trang chủ;
2. `hanzi-stroke` chính;
3. prototype Tra;
4. Pinyin;
5. Bộ thủ cũ;
6. 301/hash route;
7. overlay Flashcard/popup chi tiết.

Mỗi lớp có thể dùng:

- anchor;
- button;
- tab button;
- query string;
- hash;
- state JS;
- localStorage.

Không có một registry chung làm nguồn sự thật.

## 14. Kết quả NAV.0/NAV.1 trước đây

Audit trước đã xác nhận:

- `☰` của Hanzi từng không có listener;
- Pinyin và Bộ thủ không có menu app chung ổn định;
- Hanzi có tab tĩnh và tab Thẻ động;
- query đã được thêm để mở tab sẵn có;
- shared navigation từng được thêm dưới `modules/shared/`;
- theme/cỡ chữ của shell dùng key riêng;
- root Trang chủ và prototype Tra chưa được gắn đồng bộ hoàn toàn;
- 301 chưa audit sâu;
- hub Học chưa hoàn chỉnh.

### Vấn đề của bản NAV.1 cũ

Có lúc bottom nav được dựng thành 5 mục có `Cài đặt`, sau đó yêu cầu đã đổi thành 4 mục:

```text
Trang chủ | Tra | Học | Menu
```

Do đó mọi tài liệu/manifest cũ còn `Cài đặt` hoặc `301` ở bottom nav đều phải được xem là obsolete.

---

# PHẦN V — KIẾN TRÚC ĐÍCH ĐÃ CHỐT

## 15. Primary navigation cấp ứng dụng

```text
Trang chủ | Tra | Học | Menu
```

### Ý nghĩa

- **Trang chủ**: dashboard và resume;
- **Tra**: lookup/catalog, không trộn tiến độ học;
- **Học**: hub chứa các module học;
- **Menu**: drawer chứa toàn bộ chức năng, settings và dữ liệu cá nhân.

## 16. Cấu trúc Học cấp hai

Thứ tự chốt:

```text
Pinyin
Bút thuận
HSK & Giáo trình
Bộ thủ
Thẻ
301
```

### HSK cấp ba

```text
Bài học
Chủ đề
Từ vựng
Ngữ pháp
Flashcard bài/chủ đề
```

### Thẻ cấp ba

```text
Bộ thẻ của tôi
Tạo bộ thẻ
Nhập nhanh
Ôn
Khó
Thống kê
Xuất/Nhập
```

## 17. Menu drawer

```text
Menu
├── Trang chủ
├── Tra
├── Học
│   ├── Pinyin
│   ├── Bút thuận
│   ├── HSK & Giáo trình
│   ├── Bộ thủ
│   ├── Thẻ
│   └── 301
├── Cài đặt
├── Dữ liệu của tôi
├── Trợ giúp
└── Giới thiệu
```

### Quy tắc mobile

- drawer bên phải hoặc bottom sheet;
- vùng bấm tối thiểu 44px;
- focus trap;
- Escape đóng desktop;
- Back đóng drawer trước;
- khóa scroll nền;
- safe-area iPhone;
- không che Flashcard overlay;
- không chuyển trang khi chỉ đóng drawer.

## 18. Header chung

```text
[Icon] Tên màn hình                 ⌂  ◐  ☰
```

- `⌂`: Trang chủ;
- `◐`: theme nhanh;
- `☰`: drawer;
- module có thể giữ action riêng nhưng không được xung đột.

---

# PHẦN VI — CÀI ĐẶT VÀ STORAGE

## 19. Các nhóm settings hiện có

### Hanzi/Bút thuận

```text
hanziStrokeColorSettings.v1
hanziStrokeActivePreset.v1
hanziStrokeTheme.v1
```

### HSK/Flashcard

```text
hanziStroke.hskLastModeBySourceLevel.v1
hanziStroke.hskVocabViewMode.v1
hanziStroke.hskFlashcardSettings.v1
hanziStroke.hskFlashcardResults.v1
hanziStroke.hskFlashcardActiveSession.v1
hanziStroke.flashcardLibrarySort.v1
```

### Pinyin

```text
tiengtrung_pinyin_v12_state
```

### Bộ thủ cũ

```text
boThuFavs
boThuLearned
boThuTheme
```

### Shared Navigation thử nghiệm

```text
tiengTrung.navigation.v1
```

## 20. Settings store đích

```text
tiengTrung.settings.v1
```

Schema đề xuất:

```json
{
  "version": 1,
  "appearance": {},
  "navigation": {},
  "writing": {},
  "flashcard": {},
  "typing": {},
  "audio": {},
  "privacy": {}
}
```

## 21. Nguyên tắc migration

1. không xóa key cũ trong lần phát hành đầu;
2. đọc key mới trước;
3. thiếu key mới thì map từ key cũ;
4. ghi key mới;
5. trong một phiên bản vẫn giữ fallback;
6. chỉ xóa key cũ sau khi có report migration và backup.

## 22. Màn hình Cài đặt

### Giao diện

- theme;
- cỡ chữ;
- reduced motion;
- ghi nhớ màn hình cuối.

### Điều hướng

- trang mặc định;
- mục Học mặc định;
- ghi nhớ tab cuối;
- nhãn bottom nav.

### Bút thuận

- autoplay;
- thứ tự nét;
- lưới;
- kích thước;
- tốc độ;
- delay;
- màu;
- độ dày;
- gợi ý.

### Flashcard

- mode mặc định;
- pinyin;
- tự phát âm;
- shuffle;
- cách viết;
- restore session.

### Gõ Pinyin

- prompt type;
- số lần sai để hint;
- bóng đèn;
- tự chuyển.

Rule 30/120 giây không mở tùy chỉnh ở giai đoạn đầu.

### Âm thanh

- autoplay;
- tốc độ đọc;
- voice khả dụng;
- test voice.

### Dữ liệu

- export/import JSON;
- reset lịch sử;
- reset Flashcard;
- xóa deck;
- restore defaults.

---

# PHẦN VII — KẾ HOẠCH TRIỂN KHAI TỔNG THỂ

## 23. NAV.0R — Audit lại theo source hợp nhất mới nhất

NAV.0 trước đây là audit theo source ở thời điểm cũ. Sau C2A và FC-TYPE.5.2 cần audit lại.

### Deliverables

```text
NAVIGATION_REPO_AUDIT_V2.md
NAVIGATION_ROUTE_MATRIX_V2.xlsx
NAVIGATION_STORAGE_MATRIX.md
```

### Bảng bắt buộc

| Màn hình | File | Route | Chức năng | Cơ chế mở | Hoạt động | Parent | Storage | Ghi chú |
|---|---|---|---|---|---|---|---|---|

### Phạm vi kiểm tra

- anchor;
- button menu;
- bottom nav;
- header icon;
- internal tabs;
- query;
- hash;
- dialog/overlay;
- localStorage;
- IndexedDB;
- timers;
- browser history.

## 24. NAV.1R — Shared app shell ổn định

### Tạo/chuẩn hóa

```text
modules/shared/navigation.js
modules/shared/navigation.css
modules/shared/navigation-manifest.json
```

Hoặc chuyển sang `assets/` sau audit, nhưng chỉ chọn một vị trí.

### Chức năng

- primary nav 4 mục;
- drawer;
- active tab;
- safe-area;
- focus trap;
- backdrop;
- Escape/Back;
- theme bridge;
- route resolver theo `document.baseURI`.

### Không làm trong bước này

- không di chuyển engine;
- không merge Pinyin/Hanzi;
- không xóa navigation cũ trước khi shell mới pass QA.

## 25. NAV.2 — Học Hub

### Mục

```text
Pinyin
Bút thuận
HSK
Bộ thủ
Thẻ
301
```

### Rule

- chỉ route đến chức năng tồn tại;
- mục chưa sẵn sàng phải disabled/ẩn;
- active primary = Học;
- 301 đứng sau Thẻ.

## 26. NAV.3 — Tích hợp Tra chính thức

### Mục tiêu

- đưa prototype Tra thành route chính;
- dùng catalog/unified hiện tại;
- gắn shell;
- không trộn HSK học vào Tra;
- bảo toàn navigation stack nội bộ;
- không dùng swipe-back trên iPhone.

## 27. NAV.4 — Settings Store và UI

### Công việc

- inventory key;
- migration;
- settings schema;
- settings screen trong drawer;
- apply runtime;
- reset theo nhóm;
- export/import.

### Tiêu chí

- không mất session;
- không mất deck;
- theme cũ vẫn load;
- setting mới sync giữa module.

## 28. NAV.5 — Chuẩn hóa từng module

### Trang chủ

- app shell;
- dashboard thực;
- resume route.

### Tra

- route chính;
- catalog;
- detail.

### Pinyin

- bỏ top app nav cũ;
- giữ internal tabs.

### Hanzi/Bút thuận/HSK/Bộ thủ/Thẻ

- active Học;
- subnav thống nhất;
- không duplicate bottom nav.

### 301

- audit route;
- gắn shell;
- active Học;
- đặt sau Thẻ.

## 29. NAV.6 — Mobile QA

### Kích thước

```text
360 × 800
390 × 844
430 × 932
```

### Test

- drawer;
- bottom nav;
- active state;
- no overflow;
- safe area;
- history/back;
- popup layer;
- Flashcard overlay;
- bàn phím Gõ Pinyin;
- timer 30/120;
- touch two-step;
- scroll restore;
- route GitHub Pages.

## 30. NAV.7 — Release và báo cáo

```text
NAVIGATION_REPO_AUDIT_V2.md
NAVIGATION_ROUTE_MATRIX_V2.xlsx
NAVIGATION_MOBILE_TEST_REPORT.md
NAVIGATION_TEST_LIST.md
README_NAVIGATION_COMPLETE.md
navigation_release.zip
```

---

# PHẦN VIII — MA TRẬN ROUTE ĐỀ XUẤT

| ID | Nhãn | Parent | Active primary | Route dự kiến | Trạng thái |
|---|---|---|---|---|---|
| home | Trang chủ | root | home | `index.html` | Có |
| lookup | Tra | root | lookup | `modules/hanzi-stroke/prototypes/lookup-c1-2/` | Có, cần promote |
| learn | Học | root | learn | hub mới hoặc `modules/hanzi-stroke/` | Cần chuẩn hóa |
| pinyin | Pinyin | learn | learn | `modules/pinyin/` | Có |
| writing | Bút thuận | learn | learn | `modules/hanzi-stroke/?study=lookup` | Có |
| hsk | HSK | learn | learn | `modules/hanzi-stroke/?study=hsk` | Có |
| radicals | Bộ thủ | learn | learn | `modules/hanzi-stroke/?study=radicals` | Có |
| cards | Thẻ | learn | learn | `modules/hanzi-stroke/?study=flashcards` | Có |
| dialogue301 | 301 | learn | learn | `index.html#dialogue301` hoặc route mới sau audit | Có một phần |
| settings | Cài đặt | menu | none | drawer/settings panel | Chưa hoàn chỉnh |
| data | Dữ liệu của tôi | menu | none | settings/data panel | Có logic rải rác |

---

# PHẦN IX — RỦI RO VÀ NGUYÊN TẮC BẢO VỆ

## 31. Rủi ro chính

### R1 — `app.js` quá lớn

Giảm rủi ro bằng shared shell độc lập, không refactor engine cùng lúc.

### R2 — route tương đối trên GitHub Pages

Không hard-code domain. Dùng `document.baseURI`, URL API hoặc manifest resolver.

### R3 — prototype và module chính lệch phiên bản

Chọn một source of truth cho Tra trước NAV.3.

### R4 — storage migration làm mất dữ liệu

Không xóa key cũ; backup trước migration.

### R5 — overlay bị shell che

Xây z-index contract rõ ràng:

```text
content < bottom nav < drawer backdrop < drawer < dialog < Flashcard overlay
```

### R6 — touch mobile xung đột

Không bắt gesture ngang hệ thống. Giữ button Back nội bộ.

### R7 — bàn phím Gõ Pinyin

Không full render input; shell không được bắt click trong overlay.

### R8 — timer cũ chuyển nhầm thẻ

Route/module cleanup phải hủy timer.

### R9 — 301 chưa audit sâu

Không giả lập menu con chưa có nội dung.

---

# PHẦN X — QUY TẮC PHÁT TRIỂN VÀ COMMIT

## 32. Quy tắc dữ liệu

- dữ liệu thật;
- không bịa;
- không tự dịch;
- không tự suy pinyin;
- section rỗng ẩn;
- nguồn/kiểm duyệt chỉ ở report.

## 33. Quy tắc patch

- scope nhỏ;
- kế hoạch trước;
- không refactor ngoài phạm vi;
- test syntax;
- test source;
- mobile QA;
- ZIP đầy đủ file đồng bộ.

## 34. Quy tắc Git

Không dùng:

```powershell
git add .
```

Luôn:

```powershell
git status --short
git add "đúng-file"
git diff --cached --stat
git commit -m "..."
git push
```

Không commit report/script/output rác nếu không cần deploy.

---

# PHẦN XI — THỨ TỰ THỰC HIỆN KHUYẾN NGHỊ

## 35. Lộ trình an toàn

```text
1. NAV.0R — audit V2 trên source hợp nhất mới nhất
2. NAV.1R — app shell 4 mục + drawer
3. NAV.2 — Học Hub
4. NAV.3 — promote Tra prototype
5. NAV.4 — settings migration
6. NAV.5 — đồng bộ từng module
7. NAV.6 — mobile QA
8. NAV.7 — release/report
```

## 36. Bước tiếp theo cụ thể

Bước tiếp theo đúng căn cứ không phải sửa menu ngay, mà là tạo **NAVIGATION_ROUTE_MATRIX_V2.xlsx** và kiểm tra trực tiếp các file mới nhất sau khi ghép:

```text
modules(1).zip
+ C2A Tra mới nhất
+ FC-TYPE.5.2
+ NAV shared mới nhất
```

Sau audit này mới khóa:

- route chính của Tra;
- route hub Học;
- route 301;
- vị trí shared shell;
- danh sách key migration;
- file nào giữ/xóa navigation cũ.

---

# PHẦN XII — TIÊU CHÍ NGHIỆM THU TOÀN HỆ THỐNG

## 37. Điều hướng

- mọi trang có cùng primary nav;
- Menu mở cùng drawer;
- active state đúng;
- Back đúng;
- 301 sau Thẻ;
- Cài đặt chỉ trong Menu;
- route đều tồn tại.

## 38. Dữ liệu

- Tra dùng unified/catalog;
- Học dùng nguồn/cấp thật;
- Bộ thủ chỉ resolve có căn cứ;
- grammar không false link;
- không show metadata kiểm duyệt.

## 39. Flashcard

- session cũ restore;
- deck IndexedDB không mất;
- Gõ Pinyin hoạt động ở Thẻ/bài/chủ đề;
- bàn phím không đóng từng ký tự;
- timer 30/120 đúng theo số chữ Hán;
- touch two-step đúng.

## 40. Mobile

- không tràn ngang;
- bottom nav không che nội dung;
- drawer dùng được bằng một tay;
- input không zoom;
- safe-area đúng;
- popup/overlay đúng tầng;
- 360/390/430 px pass.

---

# PHẦN XIII — GHI CHÚ VỀ MỨC ĐỘ XÁC NHẬN

## 41. Đã được xác nhận bằng source/audit/test

- module và file chính;
- tab Hanzi/HSK/Bộ thủ/Thẻ;
- localStorage/IndexedDB Flashcard;
- engine Gõ Pinyin;
- Pinyin tabs;
- module Bộ thủ cũ;
- unified/catalog architecture;
- các giới hạn navigation NAV.1;
- rule timer FC-TYPE.5.2.

## 42. Cần audit lại trước khi sửa

- root `index.html/app.js/style.css` bản deploy mới nhất;
- full tree `lessons-301/`;
- source thực tế sau khi ghép mọi patch;
- route chính thức của Tra;
- shared navigation hiện đang nằm `modules/shared` hay sẽ chuyển `assets`;
- xung đột CSS/z-index toàn repo;
- migration theme giữa các module.

---

# Kết luận cuối

Repo hiện đã có nền tảng chức năng rất mạnh nhưng kiến trúc điều hướng vẫn phản ánh giai đoạn cũ. Việc tiếp tục sửa riêng từng nút sẽ tạo thêm lệch route, duplicate UI và xung đột storage. Giải pháp đúng là xây shared app shell dựa trên audit V2 của source hợp nhất mới nhất, giữ engine nghiệp vụ nguyên trạng, sau đó đồng bộ lần lượt Trang chủ, Tra, Học, Pinyin, Bút thuận, HSK, Bộ thủ, Thẻ và 301.

Tài liệu này phải được dùng như baseline trước khi bắt đầu NAV.0R/NAV.1R.
