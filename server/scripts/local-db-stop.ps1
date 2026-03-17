$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot ".local-postgres\\data"
$pgCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"

if (!(Test-Path $dataDir)) {
  throw "Local postgres data dir is missing."
}

& $pgCtl -D $dataDir stop
