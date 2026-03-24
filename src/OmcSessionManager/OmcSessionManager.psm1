# OmcSessionManager.psm1
# Claude Code 세션 관리 PowerShell 모듈

# 프로젝트 루트 경로 (src/OmcSessionManager 에서 2단계 상위)
$script:ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# 상태 파일 경로 (읽기 전용 - 마스터 봇만 쓰기 가능)
$script:StateFilePath = Join-Path $script:ProjectRoot 'state' 'sessions.state.json'

# 설정 파일 경로
$script:ConfigFilePath = Join-Path $script:ProjectRoot 'config' 'sessions.json'

# Private 함수 로드
$privatePath = Join-Path $PSScriptRoot 'Private'
if (Test-Path $privatePath) {
    Get-ChildItem -Path $privatePath -Filter '*.ps1' -Recurse | ForEach-Object {
        . $_.FullName
    }
}

# Public 함수 로드
$publicPath = Join-Path $PSScriptRoot 'Public'
if (Test-Path $publicPath) {
    Get-ChildItem -Path $publicPath -Filter '*.ps1' -Recurse | ForEach-Object {
        . $_.FullName
    }
}
