#Requires -Version 7.0
<#
.SYNOPSIS
    OMC Session Manager Windows 설정 스크립트
.DESCRIPTION
    대화형으로 의존성을 확인하고, 크레덴셜을 등록하며,
    프로젝트 초기 설정을 수행합니다.
#>

$ErrorActionPreference = 'Stop'

# ANSI 색상
$Green  = "`e[32m"
$Red    = "`e[31m"
$Yellow = "`e[33m"
$Cyan   = "`e[36m"
$Bold   = "`e[1m"
$Reset  = "`e[0m"

$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host "${Cyan}[STEP]${Reset} $Message"
}

function Write-OK {
    param([string]$Message)
    Write-Host "  ${Green}v${Reset} $Message"
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  ${Red}x${Reset} $Message"
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ${Yellow}!${Reset} $Message"
}

# ── 1. PowerShell 7+ 확인 ──

Write-Host ""
Write-Host "${Bold}${Cyan}══════════════════════════════════════════════${Reset}"
Write-Host "${Bold}${Cyan}  OMC Session Manager - Windows Setup${Reset}"
Write-Host "${Bold}${Cyan}══════════════════════════════════════════════${Reset}"
Write-Host ""

Write-Step "PowerShell 버전 확인"
if ($PSVersionTable.PSVersion.Major -ge 7) {
    Write-OK "PowerShell $($PSVersionTable.PSVersion) 감지"
}
else {
    Write-Fail "PowerShell 7 이상이 필요합니다. (현재: $($PSVersionTable.PSVersion))"
    Write-Host "  설치: https://learn.microsoft.com/ko-kr/powershell/scripting/install/installing-powershell-on-windows"
    exit 1
}

# ── 2. Python 3.11+ 확인 ──

Write-Step "Python 설치 확인"
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pyVersion = python --version 2>&1
    Write-OK "$pyVersion 감지"
}
else {
    Write-Fail "Python이 설치되어 있지 않습니다."
    Write-Host "  설치: https://www.python.org/downloads/"
    exit 1
}

# ── 3. Bun 설치 확인 ──

Write-Step "Bun 설치 확인"
if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunVersion = bun --version 2>$null
    Write-OK "Bun $bunVersion 감지"
}
else {
    Write-Fail "Bun이 설치되어 있지 않습니다."
    Write-Host "  설치: powershell -c 'irm bun.sh/install.ps1 | iex'"
    exit 1
}

# ── 4. Claude CLI 설치 확인 ──

Write-Step "Claude CLI 설치 확인"
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-OK "Claude CLI 감지"
}
else {
    Write-Fail "Claude CLI가 설치되어 있지 않습니다."
    Write-Host "  설치: npm install -g @anthropic-ai/claude-code"
    exit 1
}

# ── 5. claude-code-telegram 설치 확인 ──

Write-Step "claude-code-telegram 설치 확인"
if (Get-Command claude-telegram-bot -ErrorAction SilentlyContinue) {
    Write-OK "claude-telegram-bot 감지"
}
else {
    $pipCheck = pip show claude-code-telegram 2>$null
    if ($pipCheck) {
        Write-Warn "claude-code-telegram 패키지는 있지만 claude-telegram-bot이 PATH에 없습니다."
        Write-Host "  Python Scripts 디렉토리가 PATH에 포함되어 있는지 확인하세요."
    }
    else {
        Write-Fail "claude-code-telegram이 설치되어 있지 않습니다."
        Write-Host "  설치: pip install claude-code-telegram"
        exit 1
    }
}

# ── 6. CredentialManager 모듈 확인 ──

Write-Step "CredentialManager 모듈 확인"
if (Get-Module -ListAvailable -Name CredentialManager) {
    Write-OK "CredentialManager 모듈 감지"
}
else {
    Write-Warn "CredentialManager 모듈이 없습니다. (선택 사항)"
    Write-Host "  설치하려면: Install-Module -Name CredentialManager -Scope CurrentUser"
}

# ── 7. config/sessions.json 확인 ──

Write-Step "설정 파일 확인"
$configPath = Join-Path $ProjectRoot 'config' 'sessions.json'
$examplePath = Join-Path $ProjectRoot 'config' 'sessions.example.json'

if (Test-Path $configPath) {
    Write-OK "config/sessions.json 이미 존재합니다."
}
elseif (Test-Path $examplePath) {
    Copy-Item -Path $examplePath -Destination $configPath
    Write-OK "sessions.example.json -> sessions.json 복사 완료"
    Write-Warn "config/sessions.json 을 환경에 맞게 수정하세요."
}
else {
    Write-Fail "config/sessions.example.json 파일을 찾을 수 없습니다."
    exit 1
}

# ── 8. 토큰 등록 ──

Write-Host ""
Write-Step "Telegram Bot 토큰 등록"
Write-Host "  토큰은 Windows Credential Manager에 저장됩니다."
Write-Host "  건너뛰려면 빈 값으로 Enter를 누르세요."
Write-Host ""

# Master bot token
Write-Host "  ${Bold}Master bot token:${Reset}"
$masterToken = Read-Host -AsSecureString -Prompt "  Token"
$masterBSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($masterToken)
$masterPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($masterBSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($masterBSTR)

if ($masterPlain) {
    $null = cmdkey /generic:omc-master-bot-token /user:omc /pass:$masterPlain
    Write-OK "마스터 봇 토큰 저장 완료"
}
else {
    Write-Warn "마스터 봇 토큰 건너뜀"
}

# Session tokens (1-4)
for ($i = 1; $i -le 4; $i++) {
    Write-Host ""
    Write-Host "  ${Bold}Session $i bot token:${Reset}"
    $sessionToken = Read-Host -AsSecureString -Prompt "  Token"
    $sessionBSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sessionToken)
    $sessionPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($sessionBSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($sessionBSTR)

    if ($sessionPlain) {
        $null = cmdkey /generic:omc-session-$i-token /user:omc /pass:$sessionPlain
        Write-OK "세션 $i 토큰 저장 완료"
    }
    else {
        Write-Warn "세션 $i 토큰 건너뜀"
    }
}

# ── 9. state 디렉토리 생성 ──

Write-Host ""
Write-Step "디렉토리 생성"

$stateDir = Join-Path $ProjectRoot 'state'
$logsDir = Join-Path $stateDir 'logs'

if (-not (Test-Path $stateDir)) {
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    Write-OK "state/ 디렉토리 생성"
}
else {
    Write-OK "state/ 디렉토리 이미 존재"
}

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Write-OK "state/logs/ 디렉토리 생성"
}
else {
    Write-OK "state/logs/ 디렉토리 이미 존재"
}

# ── 10. Bun 의존성 설치 ──

Write-Host ""
Write-Step "Controller 의존성 설치 (bun install)"

$controllerDir = Join-Path $ProjectRoot 'src' 'controller'
if (Test-Path $controllerDir) {
    Push-Location $controllerDir
    try {
        bun install
        Write-OK "bun install 완료"
    }
    catch {
        Write-Fail "bun install 실패: $_"
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Warn "src/controller 디렉토리가 없습니다. 건너뜁니다."
}

# ── 11. OMC 패치 적용 ──

Write-Host ""
Write-Step "OMC 패치 적용 (claude-code-telegram)"

$patchScript = Join-Path $ProjectRoot 'scripts' 'patch-claude-telegram.ps1'
if (Test-Path $patchScript) {
    try {
        & $patchScript
        Write-OK "OMC 패치 적용 완료"
    }
    catch {
        Write-Warn "OMC 패치 적용 실패: $_"
        Write-Host "  수동으로 실행하세요: .\scripts\patch-claude-telegram.ps1"
    }
}
else {
    Write-Warn "patch-claude-telegram.ps1 파일을 찾을 수 없습니다."
}

# ── 12. 완료 ──

Write-Host ""
Write-Host "${Bold}${Green}══════════════════════════════════════════════${Reset}"
Write-Host "${Bold}${Green}  설정 완료!${Reset}"
Write-Host "${Bold}${Green}══════════════════════════════════════════════${Reset}"
Write-Host ""
Write-Host "  다음 단계:"
Write-Host ""
Write-Host "  ${Cyan}1. config/sessions.json 을 환경에 맞게 수정하세요.${Reset}"
Write-Host "     - authorizedUsers: 본인의 Telegram ID"
Write-Host "     - sessions[].botUsername: 각 워커 봇의 username"
Write-Host "     - sessions[].workingDirectory: 작업 디렉토리"
Write-Host ""
Write-Host "  ${Cyan}2. 마스터 봇을 실행하세요:${Reset}"
Write-Host "     cd src/controller"
Write-Host "     bun run src/index.ts"
Write-Host ""
Write-Host "  ${Cyan}3. Telegram에서 마스터 봇에게 /status 를 보내 동작을 확인하세요.${Reset}"
Write-Host ""
