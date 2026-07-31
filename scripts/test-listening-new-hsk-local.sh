#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

printf '%s\n' '[1/11] Kiểm tra cú pháp Listening'
node --check modules/listening/core.js
node --check modules/listening/source-adapters.js
node --check modules/listening/activity-builders.js
node --check modules/listening/app.js

printf '%s\n' '[2/11] Python regression tests'
python3 -m unittest discover -s tests -p 'test_*.py'

printf '%s\n' '[3/11] LDSN14 regression'
node tests/test_ldsn14_runtime.js

printf '%s\n' '[4/11] Lookup navigation regression'
node tests/test_lookup_navigation_context_runtime.js

printf '%s\n' '[5/11] New HSK schema và activity builders'
node tests/test_listening_new_hsk_sample.js

printf '%s\n' '[6/11] New HSK app integration contract'
node tests/test_listening_new_hsk_app_contract.js

printf '%s\n' '[7/11] Learning UX contracts'
node tests/test_listening_learning_ux_contract.js

printf '%s\n' '[8/11] Kiểm tra kiến trúc Listening thống nhất'
node tests/test_listening_architecture_contract.js

printf '%s\n' '[9/11] Kiểm tra file dữ liệu JSON'
node -e "JSON.parse(require('fs').readFileSync('modules/listening/data/structures/new-hsk/manifest.json')); JSON.parse(require('fs').readFileSync('modules/listening/data/structures/new-hsk/new-hsk-1-lesson-02.json'));"

printf '%s\n' '[10/11] Browser test thanh audio nổi theo ngữ cảnh'
python3 scripts/test-listening-layout-browser.py

printf '%s\n' '[11/11] Hoàn tất'
printf '%s\n' 'PASS: Listening New HSK local automated test list'
