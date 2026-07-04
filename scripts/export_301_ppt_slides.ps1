param(
  [string]$SourceRoot = "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung",
  [string]$WebRoot = "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web",
  [string]$PptZip = "",
  [int]$StartLesson = 1,
  [int]$EndLesson = 40
)

$ErrorActionPreference = "Stop"

function Resolve-PptZip {
  param([string]$SourceRoot, [string]$PptZip)

  if ($PptZip -and (Test-Path -LiteralPath $PptZip)) {
    return (Resolve-Path -LiteralPath $PptZip).Path
  }

  $candidates = @()
  if (Test-Path -LiteralPath $SourceRoot) {
    $candidates = Get-ChildItem -LiteralPath $SourceRoot -File -Filter "*.zip" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "301" -and $_.Name -match "PPT" } |
      Sort-Object Length -Descending
  }

  if ($candidates.Count -gt 0) {
    return $candidates[0].FullName
  }

  $allZip = @()
  if (Test-Path -LiteralPath $SourceRoot) {
    $allZip = Get-ChildItem -LiteralPath $SourceRoot -File -Filter "*.zip" -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName
  }

  $msg = "Cannot find PPT 301 zip. Put the PPT zip in SourceRoot or pass -PptZip with full path. SourceRoot: $SourceRoot"
  if ($allZip.Count -gt 0) {
    $msg += "`nZip files found:`n" + ($allZip -join "`n")
  }
  throw $msg
}

$pptZipPath = Resolve-PptZip -SourceRoot $SourceRoot -PptZip $PptZip
$outRoot = Join-Path $WebRoot "lessons-301-v2"
$tmpRoot = Join-Path $env:TEMP ("ppt301_export_" + [guid]::NewGuid().ToString("N"))
$extractRoot = Join-Path $tmpRoot "ppt"

if (!(Test-Path -LiteralPath $outRoot)) { throw "Cannot find lessons-301-v2: $outRoot" }

New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
Write-Host "Using PPT zip: $pptZipPath"
Write-Host "Extract PPT zip..."
Expand-Archive -LiteralPath $pptZipPath -DestinationPath $extractRoot -Force

$pptFiles = Get-ChildItem -Path $extractRoot -Recurse -File -Include *.pptx,*.ppt | Where-Object {
  $_.BaseName -match '^(\d+)'
} | Sort-Object {[int]([regex]::Match($_.BaseName, '^(\d+)').Groups[1].Value)}

if ($pptFiles.Count -eq 0) {
  throw "No PPT/PPTX files found inside zip, or file names do not start with lesson number."
}

$powerPoint = New-Object -ComObject PowerPoint.Application
$powerPoint.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$ppSaveAsPNG = 18

try {
  foreach($ppt in $pptFiles){
    $lessonNo = [int]([regex]::Match($ppt.BaseName, '^(\d+)').Groups[1].Value)
    if($lessonNo -lt $StartLesson -or $lessonNo -gt $EndLesson){ continue }

    $lessonId = "lesson-{0:D3}" -f $lessonNo
    $lessonDir = Join-Path $outRoot $lessonId
    $dataJson = Join-Path $lessonDir "data.json"
    $slideDir = Join-Path $lessonDir "slides"

    if(!(Test-Path -LiteralPath $lessonDir)){
      Write-Warning "Skip $lessonId because lesson folder does not exist."
      continue
    }

    New-Item -ItemType Directory -Force -Path $slideDir | Out-Null
    Get-ChildItem -Path $slideDir -File -Include *.png,*.jpg,*.jpeg -ErrorAction SilentlyContinue | Remove-Item -Force

    $tmpOut = Join-Path $tmpRoot ("export_{0:D3}" -f $lessonNo)
    New-Item -ItemType Directory -Force -Path $tmpOut | Out-Null

    Write-Host "Export $lessonId from $($ppt.Name)..."
    $presentation = $powerPoint.Presentations.Open($ppt.FullName, $true, $true, $false)
    try {
      $presentation.SaveAs($tmpOut, $ppSaveAsPNG)
    } finally {
      $presentation.Close()
    }

    $exported = Get-ChildItem -Path $tmpOut -Recurse -File -Include *.png,*.PNG | Sort-Object {
      $m = [regex]::Match($_.BaseName, '(\d+)')
      if($m.Success){ [int]$m.Groups[1].Value } else { 9999 }
    }

    $slides = @()
    $i = 1
    foreach($img in $exported){
      $relName = "slides/slide-{0:D3}.png" -f $i
      $dest = Join-Path $lessonDir $relName
      Copy-Item -Path $img.FullName -Destination $dest -Force
      $slides += $relName.Replace('\\','/')
      $i++
    }

    if(Test-Path -LiteralPath $dataJson){
      $json = Get-Content -LiteralPath $dataJson -Raw -Encoding UTF8 | ConvertFrom-Json
      if(-not $json.media){
        $json | Add-Member -MemberType NoteProperty -Name media -Value ([pscustomobject]@{}) -Force
      }
      $json.media | Add-Member -MemberType NoteProperty -Name slides -Value $slides -Force
      $json | Add-Member -MemberType NoteProperty -Name slide_count -Value $slides.Count -Force
      $json | Add-Member -MemberType NoteProperty -Name slide_source -Value (Split-Path -Leaf $pptZipPath) -Force
      $json | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $dataJson -Encoding UTF8
    }

    Write-Host "  -> $($slides.Count) slides"
  }
} finally {
  if ($powerPoint) {
    $powerPoint.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
  }
  Remove-Item -Path $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Done. Slides exported to lessons-301-v2/lesson-xxx/slides and data.json updated."
