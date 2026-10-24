# Запуск Codex для задачи. Пишет промт, лог и отчёт в .agents/runs/<id>/.
# Использование:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-run.ps1 <task-id> <prompt-file> -Mode review|write
# Режимы: review → --sandbox read-only (только находки), write → --sandbox workspace-write.
# Переменные: CODEX_TIMEOUT (сек, по умолчанию 3600), CODEX_ARGS (доп. флаги), CODEX_BIN (по умолчанию codex).
# Промт уходит в codex из файла (stdin через cmd-редирект), не через PowerShell-пайп:
# пайп в PS 5.1 перекодирует текст и дописывает перевод строки.
# Коды выхода: как у codex; 124 — таймаут; 65 — codex вышел с 0, но отчёт пустой; 2 — неверные аргументы.
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Id,
  [Parameter(Mandatory = $true, Position = 1)][string]$Prompt,
  [Parameter(Mandatory = $true)][ValidateSet('review', 'write')][string]$Mode
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

if (-not (Test-Path -LiteralPath $Prompt -PathType Leaf)) { [Console]::Error.WriteLine("prompt file not found: $Prompt"); exit 2 }
$bin = if ($env:CODEX_BIN) { $env:CODEX_BIN } else { 'codex' }
if (-not (Get-Command $bin -ErrorAction SilentlyContinue)) { [Console]::Error.WriteLine("codex CLI not found: $bin"); exit 127 }

$sandbox = @{ review = 'read-only'; write = 'workspace-write' }[$Mode]
$timeoutSec = if ($env:CODEX_TIMEOUT) { [int]$env:CODEX_TIMEOUT } else { 3600 }

$dir = Join-Path '.agents/runs' $Id
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$n = @(Get-ChildItem -LiteralPath $dir -Filter 'prompt-*.md' -File).Count + 1
$promptCopy = Join-Path $dir "prompt-$n.md"
$log = Join-Path $dir "codex-$n.log"
$report = Join-Path $dir "report-$n.md"
Copy-Item -LiteralPath $Prompt -Destination $promptCopy

Write-Output "run $Id #$n ($Mode, sandbox $sandbox) → log: $log (смотреть: Get-Content -Wait -Tail 20 $log)"
# cmd делает побайтовый редирект: промт из файла в stdin, stdout и stderr — в один лог.
$cmdLine = "/d /s /c `"`"$bin`" exec --sandbox $sandbox $($env:CODEX_ARGS) -o `"$report`" - < `"$promptCopy`" > `"$log`" 2>&1`""
$p = Start-Process -FilePath $env:ComSpec -ArgumentList $cmdLine -NoNewWindow -PassThru
$null = $p.Handle  # без этого в PS 5.1 ExitCode приходит пустым
if ($p.WaitForExit($timeoutSec * 1000)) {
  $code = $p.ExitCode
} else {
  & taskkill.exe /PID $p.Id /T /F | Out-Null
  Add-Content -LiteralPath $log -Value "TIMEOUT after ${timeoutSec}s" -Encoding UTF8
  $code = 124
}

Write-Output "exit: $code"
if (-not (Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).Length -eq 0) {
  Write-Output 'NO REPORT. Хвост лога:'
  if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 40 -Encoding UTF8 }
  if ($code -eq 0) { exit 65 } else { exit $code }
}
$text = Get-Content -LiteralPath $report -Raw -Encoding UTF8
if ($text -notmatch '(?m)^## REPORT') { Write-Output 'WARN: отчёт не по формату AGENTS.md' }
Write-Output "report: $report"
Write-Output $text
exit $code
