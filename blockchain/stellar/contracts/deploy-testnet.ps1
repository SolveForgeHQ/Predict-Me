#Requires -Version 5.1
<#
.SYNOPSIS
  Build + deploy the Soroban prediction-market contract to Stellar Testnet.
.DESCRIPTION
  Uses the Stellar CLI (stellar-cli). Your deployer secret key is NEVER printed
  and NEVER committed:
    - Preferred: import once into the CLI keychain: stellar keys import deployer
    - Or set $env:STELLAR_SOURCE_SECRET for this session only (this script
      imports it into the keychain, then clears the env var).
  After deploy, prints the new contract ID and the files to update.
.EXAMPLE
  $env:STELLAR_SOURCE_SECRET = "S..."   # paste key in YOUR shell, not in chat
  .\deploy-testnet.ps1
.EXAMPLE
  # If the `deployer` identity already exists in the keychain:
  .\deploy-testnet.ps1
#>

[CmdletBinding()]
param(
  [string]$Identity = "deployer",
  [string]$Network = "testnet",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Resolve-Stellar {
  try {
    $cmd = Get-Command stellar -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  } catch { }
  $fallback = "C:\Program Files (x86)\Stellar CLI\stellar.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "stellar CLI not found. Install: winget install Stellar.StellarCLI (see output of previous step)."
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$stellar = Resolve-Stellar
Write-Host "Using stellar: $stellar"
& $stellar --version

# 1. Ensure the deployer identity exists (secret never echoed)
$identityExists = $false
try {
  & $stellar keys address $Identity 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $identityExists = $true }
} catch { $identityExists = $false }

if (-not $identityExists) {
  $secret = $env:STELLAR_SOURCE_SECRET
  if ([string]::IsNullOrWhiteSpace($secret)) {
    throw "Identity '$Identity' not found. Either run 'stellar keys import $Identity' yourself, or set `$env:STELLAR_SOURCE_SECRET in YOUR shell and re-run (it is cleared after import)."
  }
  Write-Host "Importing identity '$Identity' into the CLI keychain..."
  # Pipe via stdin so the secret never appears in process args / logs.
  $secret | & $stellar keys import $Identity
  if ($LASTEXITCODE -ne 0) { throw "stellar keys import failed." }
  Remove-Item Env:STELLAR_SOURCE_SECRET -ErrorAction SilentlyContinue
  Write-Host "Imported. Env var cleared from this session."
}

$deployerAddress = (& $stellar keys address $Identity).Trim()
Write-Host "Deployer G-address: $deployerAddress"

# 2. Build the WASM (needs wasm32v1-none target: rustup target add wasm32v1-none)
if (-not $SkipBuild) {
  Write-Host "Building contract WASM..."
  & $stellar contract build
  if ($LASTEXITCODE -ne 0) { throw "stellar contract build failed." }
}

$wasm = Join-Path $ScriptDir "target\wasm32v1-none\release\predict_me.wasm"
if (-not (Test-Path $wasm)) {
  throw "WASM not found at $wasm. Build failed or package name changed."
}
Write-Host "WASM: $wasm"

# 3. Deploy
Write-Host "Deploying to Stellar testnet (spends test XLM for fees)..."
$contractId = (& $stellar contract deploy --wasm $wasm --source $Identity --network $Network).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($contractId)) {
  throw "stellar contract deploy failed."
}

Write-Host ""
Write-Host "Deployment successful!"
Write-Host "New contract ID: $contractId"
Write-Host ""
Write-Host "Wire it up (new deploy = fresh empty market list):"
Write-Host "  1. apps/web/.env.local: NEXT_PUBLIC_MARKET_CONTRACT_ID=$contractId"
Write-Host "     NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS=$deployerAddress"
Write-Host "  2. backend/wrangler.toml: MARKET_CONTRACT_ID = `"$contractId`""
Write-Host "  3. Restart frontend + backend."
