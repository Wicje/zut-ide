# Starts every Zut local service in hidden windows (one command after reboot).
# Tokens come from .env.local (VITE_* halves); matching server halves are
# passed as process env. Secrets are NEVER written here.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
#
# Optional: set ZUT_MUDBASE_API_KEY / ZUT_MUDBASE_PROJECT_ID in this shell
# before running to enable the runtime's Mudbase proxy. Without them the
# proxy starts unconfigured (Mudbase tab explains itself).
#
# Logs: $env:LOCALAPPDATA\..\Temp\opencode\*.log (use any name you like).

$repo = 'C:\Users\Vathos\chisom_ide'
$logDir = Join-Path $env:LOCALAPPDATA '..\Temp\opencode'
$envFile = Join-Path $repo '.env.local'

function Get-DotEnvValue([string]$name) {
  $line = Select-String -Path $envFile -Pattern "^$name=(.*)$" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($line) { return $line.Matches[0].Groups[1].Value.Trim() }
  return ''
}

function Start-Hidden([string]$exe, [string[]]$argv, [string]$dir, [string]$log) {
  $p = Start-Process -FilePath $exe -ArgumentList $argv -WorkingDirectory $dir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "$log.log") `
    -RedirectStandardError (Join-Path $logDir "$log.log.err") -PassThru
  return $p.Id
}

function Port-Open([int]$port) {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $r = $c.BeginConnect('127.0.0.1', $port, $null, $null)
    if ($r.AsyncWaitHandle.WaitOne(1200)) { $c.EndConnect($r); return $true }
    return $false
  } catch { return $false } finally { $c.Close() }
}

$node = 'C:\Program Files\nodejs\node.exe'
$workspace = Join-Path $env:USERPROFILE '.zut-projects\default'
New-Item -ItemType Directory -Path $workspace -Force | Out-Null

# 1. Broker :8787 (dev anon allowed, matches .env.local wiring).
$env:ZUT_BROKER_DEV_ALLOW_ANON = '1'
$brokerId = Start-Hidden $node @('broker/server.mjs') $repo 'broker'

# 2. Runtime :8788 (Mudbase key only if present in this shell).
if ($env:ZUT_MUDBASE_API_KEY) { $mbKey = $env:ZUT_MUDBASE_API_KEY } else { $mbKey = '' }
if ($env:ZUT_MUDBASE_PROJECT_ID) { $mbProject = $env:ZUT_MUDBASE_PROJECT_ID } else { $mbProject = '' }
$env:ZUT_MUDBASE_API_KEY = $mbKey
$env:ZUT_MUDBASE_PROJECT_ID = $mbProject
$env:PORT = '8788'
$env:HOST = '127.0.0.1'
$env:ZUT_RUNTIME_TOKEN = Get-DotEnvValue 'VITE_RUNTIME_TOKEN'
$runtimeId = Start-Hidden $node @('runtime/server.mjs') $repo 'runtime'

# 3. File bridge :4331 (token from .env.local).
$env:ZUT_BRIDGE_TOKEN = Get-DotEnvValue 'VITE_OPENCODE_BRIDGE_TOKEN'
$bridgeId = Start-Hidden $node @('scripts/file-bridge.mjs') $repo 'bridge'

# 4. opencode serve :4096 (provider auth comes from `opencode auth login`).
$opencodeExe = 'C:\Users\Vathos\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe'
$opencodeId = Start-Hidden $opencodeExe @('serve', '--port', '4096', '--hostname', '127.0.0.1') $workspace 'opencode'

# 5. Vite dev :5173 (reads .env.local at boot).
$viteId = Start-Hidden $node @('C:\Users\Vathos\chisom_ide\node_modules\vite\bin\vite.js', '--host', 'localhost', '--port', '5173', '--strictPort') $repo 'vite'

Start-Sleep -Seconds 10
"broker :8787 pid $brokerId open=$(Port-Open 8787)"
"runtime :8788 pid $runtimeId open=$(Port-Open 8788)"
"bridge  :4331 pid $bridgeId open=$(Port-Open 4331)"
"opencode:4096 pid $opencodeId open=$(Port-Open 4096)"
"vite    :5173 pid $viteId open=$(Port-Open 5173)"
if (-not $mbKey) { 'NOTE: ZUT_MUDBASE_API_KEY was empty — Mudbase proxy runs unconfigured.' }
