$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot ".local-postgres\\data"
$logFile = Join-Path $repoRoot ".local-postgres\\postgres.log"
$pgCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"

if (!(Test-Path $dataDir)) {
  throw "Local postgres data dir is missing. Run scripts/local-db-init.ps1 first."
}

& $pgCtl -D $dataDir -l $logFile start
