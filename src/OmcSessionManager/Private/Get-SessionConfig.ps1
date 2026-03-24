function Get-SessionConfig {
    <#
    .SYNOPSIS
        sessions.json 설정 파일을 로드하고 반환합니다.
    .DESCRIPTION
        설정 파일을 읽어 파싱한 후 필수 필드를 검증합니다.
    .PARAMETER ConfigPath
        설정 파일 경로. 기본값은 $script:ConfigFilePath.
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$ConfigPath = $script:ConfigFilePath
    )

    if (-not (Test-Path $ConfigPath)) {
        throw "설정 파일을 찾을 수 없습니다: $ConfigPath`nconfig/sessions.example.json을 복사하여 config/sessions.json을 생성하세요."
    }

    $raw = Get-Content -Path $ConfigPath -Raw -Encoding UTF8
    $config = $raw | ConvertFrom-Json

    # 필수 필드 검증
    if (-not $config.version) {
        throw "설정 파일에 'version' 필드가 없습니다: $ConfigPath"
    }
    if (-not $config.sessions) {
        throw "설정 파일에 'sessions' 필드가 없습니다: $ConfigPath"
    }
    if (-not $config.master) {
        throw "설정 파일에 'master' 필드가 없습니다: $ConfigPath"
    }

    return $config
}
