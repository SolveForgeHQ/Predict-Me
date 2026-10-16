#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy PredictionMarket to Avalanche Fuji with Foundry (no Hardhat needed).
.DESCRIPTION
  Reads deploy secrets from blockchain/avalanche/contracts/.env (never printed
  or committed) and broadcasts DeployPredictionMarket.s.sol via forge script.
  Create .env from .env.example first and fill in PRIVATE_KEY there.
.EXAMPLE
  # Dry run (no gas spent)
  .\deploy-fuji.ps1 -NoBroadcast
.EXAMPLE
  # Live deploy to Fuji
  .\deploy-fuji.ps1
#>

[CmdletBinding()]
param(
  [switch]$NoBroadcast
)

$ErrorActionPreference = "Stop"

function Resolve-Forge {
  $candidates = @()
  try {
    $cmd = Get-Command forge -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += $cmd.Source }
  } catch { }
  $candidates += "$env:USERPROFILE\.foundry\bin\forge.exe"
  $candidates += "$env:TEMP\foundry\forge.exe"
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  throw "forge.exe not found. Install Foundry: irm https://foundry.paradigm.xyz | iex (see docs/avalanche.md Step 1)."
}

function Import-DotEnv {
  param([string]$Path)
  $values = @{}
  if (-not (Test-Path $Path)) { return $values }
  foreach ($line in (Get-Content $Path)) {
    $t = $line.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $idx = $t.IndexOf("=")
    if ($idx -lt 1) { continue }
    $k = $t.Substring(0, $idx).Trim()
    $v = $t.Substring($idx + 1).Trim().Trim('"').Trim("'")
    $values[$k] = $v
  }
  return $values
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$forge = Resolve-Forge
Write-Host "Using forge: $forge"
& $forge --version

$envFile = Join-Path $ScriptDir ".env"
if (-not (Test-Path $envFile)) {
  throw "Missing .env. Copy .env.example to .env and set PRIVATE_KEY (see docs/avalanche.md Step 3)."
}
$envVars = Import-DotEnv $envFile

$privateKey = $envVars["PRIVATE_KEY"]
if ([string]::IsNullOrWhiteSpace($privateKey)) { $privateKey = $envVars["DEPLOYER_PRIVATE_KEY"] }
if ([string]::IsNullOrWhiteSpace($privateKey) -or $privateKey -eq "your_private_key_here") {
  throw "PRIVATE_KEY is not set in .env. Paste your Fuji throwaway wallet key there (never commit it)."
}
$rpcUrl = $envVars["FUJI_RPC_URL"]
if ([string]::IsNullOrWhiteSpace($rpcUrl)) { $rpcUrl = "https://api.avax-test.network/ext/bc/C/rpc" }

Write-Host "Running forge tests first..."
& $forge test
if ($LASTEXITCODE -ne 0) { throw "forge test failed. Fix tests before deploying." }

$scriptArgs = @(
  "script", "script/DeployPredictionMarket.s.sol:DeployPredictionMarket",
  "--rpc-url", $rpcUrl,
  "-vvvv"
)
if (-not $NoBroadcast) {
  Write-Host "Broadcasting deploy to Fuji (spends test AVAX)..."
} else {
  Write-Host "Dry run only (no broadcast, no gas spent)..."
}

# Pass the key via env var so it never appears in logs; the Deploy script
# reads PRIVATE_KEY / DEPLOYER_PRIVATE_KEY itself.
$env:PRIVATE_KEY = $privateKey
try {
  if ($NoBroadcast) {
    & $forge @scriptArgs
  } else {
    & $forge @scriptArgs --broadcast
  }
  if ($LASTEXITCODE -ne 0) { throw "forge script failed with exit code $LASTEXITCODE." }
} finally {
  Remove-Item Env:PRIVATE_KEY -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done. Copy the Contract Address from the output above, then wire it up:"
Write-Host "  1. apps/web/.env.local: NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS=<address>"
Write-Host "  2. backend/wrangler.toml: AVALANCHE_CONTRACT_ADDRESS = `"<address>`""
Write-Host "  3. Restart frontend + backend (env vars are read at startup)."
