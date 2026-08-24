param(
  [string]$Version = '1.2.1',
  [string]$Repository = 'pedro1577e8e7ee/Jarvis'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$zipPath = Join-Path $projectRoot ('release-v6\Jarvis-AI-local-v' + $Version + '-final.zip')

if (-not (Test-Path -LiteralPath $zipPath)) {
  throw "Pacote nao encontrado: $zipPath"
}

$gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path -LiteralPath $gh)) { throw 'GitHub CLI nao instalado.' }
& $gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Autentique o GitHub CLI antes de publicar.' }

& $gh release create ('v' + $Version) $zipPath --repo $Repository --title ('Jarvis ' + $Version) --notes ('Release local do Jarvis ' + $Version)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar a Release no GitHub.' }
