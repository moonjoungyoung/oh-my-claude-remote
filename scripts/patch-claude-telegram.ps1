# Patch claude-code-telegram to load user CLAUDE.md (OMC support)
# Run this after every `pip install/upgrade claude-code-telegram`

$sdkFile = "$env:APPDATA\Python\Python312\site-packages\src\claude\sdk_integration.py"

if (-not (Test-Path $sdkFile)) {
    Write-Error "sdk_integration.py not found at: $sdkFile"
    exit 1
}

$content = Get-Content $sdkFile -Raw

if ($content -match 'setting_sources=\["user", "project"\]') {
    Write-Host "Already patched." -ForegroundColor Green
    exit 0
}

$patched = $content -replace 'setting_sources=\["project"\]', 'setting_sources=["user", "project"]'

if ($patched -eq $content) {
    Write-Error "Could not find setting_sources=[`"project`"] to patch."
    exit 1
}

Set-Content $sdkFile -Value $patched -NoNewline
Write-Host "Patched successfully: setting_sources now includes 'user'" -ForegroundColor Green
