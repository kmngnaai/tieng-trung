$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo

$JsFiles = @(
  "modules/pinyin/app.js"
) + (Get-ChildItem "modules/pinyin/core" -Filter "*.js" | ForEach-Object FullName) + (Get-ChildItem "modules/pinyin/screens" -Filter "*.js" | ForEach-Object FullName)

foreach ($File in $JsFiles) {
  node --check $File
  if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax failed: $File" }
}

node tests/test_pinyin_refactor_contract.js
if ($LASTEXITCODE -ne 0) { throw "Refactor contract test failed" }

node tests/test_pinyin_content_chart_v2_contract.js
if ($LASTEXITCODE -ne 0) { throw "Content & Chart V2 contract test failed" }

node tests/test_pinyin_audio_scroll_fix_contract.js
if ($LASTEXITCODE -ne 0) { throw "Audio + scroll contract test failed" }

python scripts/audit-pinyin-audio.py
if ($LASTEXITCODE -ne 0) { throw "Audio audit failed" }

python scripts/test-pinyin-refactor-browser.py
if ($LASTEXITCODE -ne 0) { throw "Browser test failed" }

python -m unittest discover -s tests -p "test_*.py"
if ($LASTEXITCODE -ne 0) { throw "Regression tests failed" }

Write-Host "Pinyin Audio + Scroll Fix V1: ALL PASS" -ForegroundColor Green
