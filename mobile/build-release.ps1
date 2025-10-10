# Mind Clear - Android Release Build Script
# This script sets up environment variables and builds a signed AAB for Google Play

param(
    [Parameter(Mandatory=$true)]
    [string]$KeystorePassword,
    
    [Parameter(Mandatory=$true)]
    [string]$KeyPassword,
    
    [string]$KeystorePath = "android/app/mindclear-release-key.keystore",
    [string]$KeyAlias = "mindclear-key-alias"
)

Write-Host "Setting up environment variables for release build..." -ForegroundColor Green

# Set environment variables for the build
$env:KEYSTORE_PATH = $KeystorePath
$env:KEYSTORE_PASSWORD = $KeystorePassword
$env:KEY_ALIAS = $KeyAlias
$env:KEY_PASSWORD = $KeyPassword

Write-Host "Keystore Path: $KeystorePath" -ForegroundColor Cyan
Write-Host "Key Alias: $KeyAlias" -ForegroundColor Cyan

# Verify keystore file exists
if (-not (Test-Path $KeystorePath)) {
    Write-Error "Keystore file not found at: $KeystorePath"
    Write-Host "Please ensure the keystore file exists before running this script." -ForegroundColor Red
    exit 1
}

Write-Host "Keystore file found" -ForegroundColor Green

# Navigate to mobile directory if not already there
if (-not (Test-Path "package.json")) {
    Write-Host "Navigating to mobile directory..." -ForegroundColor Yellow
    Set-Location "mobile"
}

Write-Host "Building Android App Bundle (AAB)..." -ForegroundColor Green
Write-Host "This may take several minutes..." -ForegroundColor Yellow

# Build the AAB
try {
    npm run build:aab
    
    # Check if build was successful
    $aabPath = "android/build/app/outputs/bundle/release/app-release.aab"
    if (Test-Path $aabPath) {
        $fileSize = (Get-Item $aabPath).Length / 1MB
        Write-Host "Build successful!" -ForegroundColor Green
        Write-Host "AAB file created: $aabPath" -ForegroundColor Cyan
        Write-Host "File size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Ready for Google Play Console upload!" -ForegroundColor Green
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Go to Google Play Console" -ForegroundColor White
        Write-Host "2. Navigate to Testing -> Internal testing" -ForegroundColor White
        Write-Host "3. Create a new release" -ForegroundColor White
        Write-Host "4. Upload the AAB file: $aabPath" -ForegroundColor White
    } else {
        Write-Error "Build failed - AAB file not found at expected location"
        exit 1
    }
} catch {
    Write-Error "Build failed with error: $_"
    exit 1
}

Write-Host ""
Write-Host "Security reminder:" -ForegroundColor Red
Write-Host "- Never commit the keystore file or passwords to version control" -ForegroundColor Red
Write-Host "- Store keystore backups in multiple secure locations" -ForegroundColor Red
Write-Host "- Losing the keystore means you cannot update your app on Google Play" -ForegroundColor Red