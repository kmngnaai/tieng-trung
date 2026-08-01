#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

printf '%s\n' '[1/26] Kiểm tra cú pháp Listening'
node --check modules/listening/core.js
node --check modules/listening/source-adapters.js
node --check modules/listening/activity-builders.js
node --check modules/listening/app.js
node --check modules/listening/library-store.js
node --check modules/shared/import-core.js
node --check modules/shared/ai-prompt-templates.js
node --check modules/shared/matching-engine.js
node --check modules/hanzi-stroke/app.js
node --check modules/ldsn14/app.js

printf '%s\n' '[2/26] Python regression tests'
python3 -m unittest discover -s tests -p 'test_*.py'

printf '%s\n' '[3/26] LDSN1-4 runtime cũ'
node tests/test_ldsn14_runtime.js

printf '%s\n' '[4/26] Lookup navigation regression'
node tests/test_lookup_navigation_context_runtime.js

printf '%s\n' '[5/26] LDSN1-4 common schema và builders'
node tests/test_listening_ldsn_schema.js

printf '%s\n' '[6/26] LDSN1-4 app integration contract'
node tests/test_listening_ldsn_app_contract.js

printf '%s\n' '[7/26] New HSK Bài 2 schema và builders'
node tests/test_listening_new_hsk_sample.js

printf '%s\n' '[8/26] New HSK 1 mở rộng đủ 15 bài'
node tests/test_listening_new_hsk_expansion.js

printf '%s\n' '[9/26] New HSK app integration contract'
node tests/test_listening_new_hsk_app_contract.js

printf '%s\n' '[10/26] Learning UX contracts'
node tests/test_listening_learning_ux_contract.js

printf '%s\n' '[11/26] Kiểm tra kiến trúc Listening thống nhất'
node tests/test_listening_architecture_contract.js

printf '%s\n' '[12/26] Import core, migration và curriculum contracts'
node tests/test_import_core_contract.js

printf '%s\n' '[13/26] AI paste parser, prompt quality và import adapters'
node tests/test_ai_paste_import.js

printf '%s\n' '[14/26] Kiểm tra toàn bộ JSON structure New HSK'
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const dir = path.join('modules', 'listening', 'data', 'structures', 'new-hsk');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
for (const unit of manifest.units) {
  JSON.parse(fs.readFileSync(path.join(dir, unit.structureFile), 'utf8'));
}
console.log(`Validated ${manifest.units.length} New HSK structure files.`);
NODE

printf '%s\n' '[15/26] Browser test audio controls và thanh nổi'
python3 scripts/test-listening-layout-browser.py

printf '%s\n' '[16/26] Browser test chép nguyên và sửa con trỏ'
python3 scripts/test-listening-full-dictation-browser.py

printf '%s\n' '[17/26] Browser test LDSN schema chung, resume và New HSK 15 bài'
python3 scripts/test-listening-sources-browser.py

printf '%s\n' '[18/26] Browser test nhập JSON, XLSX, CSV và TXT'
python3 scripts/test-import-core-browser.py

printf '%s\n' '[19/26] Browser test 课 – HSK & Giáo trình trong tab Thẻ'
python3 scripts/test-flashcard-curriculum-browser.py

printf '%s\n' '[20/26] Browser test Thẻ theo bài, AI Prompt Builder và Chép nhiều câu'
python3 scripts/test-patch2abc-browser.py

printf '%s\n' '[21/26] Browser test Dán kết quả AI trên mobile'
python3 scripts/test-ai-paste-browser.py

printf '%s\n' '[22/26] Shared Matching engine, Nối chữ và chạm để nghe'
node tests/test_matching_engine.js

printf '%s\n' '[23/26] Browser test Nối chữ mobile cho Nghe và Thẻ'
python3 scripts/test-matching-browser.py

printf '%s\n' '[24/26] Browser test Nối chữ mobile cho LDSN1-4'
python3 scripts/test-ldsn-matching-browser.py

printf '%s\n' '[25/26] Browser test bố cục Nối chữ thích ứng 360/390/430'
python3 scripts/test-matching-adaptive-browser.py

printf '%s\n' '[26/26] Hoàn tất'
printf '%s\n' 'PASS: Listening, import library, curriculum browser, AI paste and shared Matching engine automated test list'
