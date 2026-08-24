param(
  [string]$Version = '',
  [string]$Repository = 'pedro1577e8e7ee/Jarvis'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = [string]$package.version }
if ($Version -ne [string]$package.version) {
  throw "Versao da Release ($Version) difere da versao do package.json ($($package.version)). Atualize o package.json antes de publicar."
}

$tag = 'v' + $Version
$remoteTag = & git -C $projectRoot ls-remote --tags origin ('refs/tags/' + $tag)

$installerPath = Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Filter ('Jarvis AI Setup ' + $Version + '.exe') |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
  Select-Object -First 1 -ExpandProperty FullName

if ([string]::IsNullOrWhiteSpace($installerPath) -or -not (Test-Path -LiteralPath $installerPath)) {
  throw "Instalador nao encontrado: $installerPath"
}

$gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path -LiteralPath $gh)) { throw 'GitHub CLI nao instalado.' }
& $gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Autentique o GitHub CLI antes de publicar.' }

if ($remoteTag) {
  $tagCommit = (& git -C $projectRoot rev-list -n 1 $tag).Trim()
  $headCommit = (& git -C $projectRoot rev-parse HEAD).Trim()
  if ($tagCommit -ne $headCommit) {
    throw "A tag $tag ja existe apontando para outro commit. Incremente a versao do package.json antes de publicar."
  }
}

& $gh release view $tag --repo $Repository *> $null
if ($LASTEXITCODE -eq 0) {
  throw "A Release $tag ja existe e e imutavel. Incremente a versao do package.json antes de publicar."
}

& $gh release create $tag $installerPath --repo $Repository --title ('Jarvis ' + $Version) --notes ('Instalador Windows do Jarvis ' + $Version)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar a Release no GitHub.' }
