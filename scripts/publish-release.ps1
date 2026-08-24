param(
  [string]$Version = '1.2.1',
  [string]$Repository = 'pedro1577e8e7ee/Jarvis'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$installerPath = Join-Path $projectRoot ('release-v8\Jarvis AI Setup ' + $Version + '.exe')

if (-not (Test-Path -LiteralPath $installerPath)) {
  throw "Instalador nao encontrado: $installerPath"
}

$gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path -LiteralPath $gh)) { throw 'GitHub CLI nao instalado.' }
& $gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Autentique o GitHub CLI antes de publicar.' }

& $gh release create ('v' + $Version) $installerPath --repo $Repository --title ('Jarvis ' + $Version) --notes ('Instalador Windows do Jarvis ' + $Version)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar a Release no GitHub.' }
