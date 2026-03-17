$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot ".local-postgres\\data"
$logDir = Join-Path $repoRoot ".local-postgres"
$logFile = Join-Path $logDir "postgres.log"
$envFile = Join-Path $repoRoot ".env"

$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$initdb = Join-Path $pgBin "initdb.exe"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"
$createdb = Join-Path $pgBin "createdb.exe"

if (!(Test-Path $initdb)) {
  throw "initdb.exe not found at $initdb"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (!(Test-Path $dataDir)) {
  & $initdb -D $dataDir -U fanglaw_local -A trust --encoding=UTF8 --locale-provider=libc
}

$configPath = Join-Path $dataDir "postgresql.conf"
if (!(Test-Path $configPath)) {
  throw "postgresql.conf not found at $configPath"
}

$config = Get-Content $configPath -Raw
$config = [regex]::Replace($config, "(?m)^#?port\s*=.*$", "port = 55432")
$config = [regex]::Replace($config, "(?m)^#?listen_addresses\s*=.*$", "listen_addresses = '127.0.0.1'")
[System.IO.File]::WriteAllText(
  $configPath,
  $config,
  [System.Text.UTF8Encoding]::new($false)
)

& $pgCtl -D $dataDir -l $logFile start
Start-Sleep -Seconds 2

& $createdb -h 127.0.0.1 -p 55432 -U fanglaw_local fanglaw_local 2>$null

$envContent = @"
PORT=2567
PUBLIC_URL=http://localhost:2567
WORLD_ROOM_NAME=cats
WORLD_KEY=main_world
DATABASE_URL=postgresql://fanglaw_local@127.0.0.1:55432/fanglaw_local
DATABASE_SSL=false
"@

[System.IO.File]::WriteAllText(
  $envFile,
  $envContent,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Local PostgreSQL is ready at postgresql://fanglaw_local@127.0.0.1:55432/fanglaw_local"
