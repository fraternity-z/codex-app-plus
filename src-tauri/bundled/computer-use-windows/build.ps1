$ErrorActionPreference = "Stop"

$ModuleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeRoot = Join-Path $ModuleRoot "runtime"
$PluginRoot = Join-Path $ModuleRoot "plugins\computer-use"
$ManifestPath = Join-Path $PluginRoot ".codex-plugin\plugin.json"
$OutputPath = Join-Path $PluginRoot "open-computer-use.exe"

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$Version = $Manifest.version

Push-Location $RuntimeRoot
try {
  & go build -trimpath -ldflags "-s -w -X main.version=$Version" -o $OutputPath .
} finally {
  Pop-Location
}

Write-Host "Built $OutputPath"
