function Restart-OmcSession {
    <#
    .SYNOPSIS
        Claude Code 세션을 재시작합니다.
    .DESCRIPTION
        세션을 중지한 후 2초 대기 후 다시 시작합니다.
    .PARAMETER Id
        재시작할 세션 ID (1-5).
    .PARAMETER Mode
        재시작 시 사용할 모드 (선택). 생략 시 세션 설정의 defaultMode 사용.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateRange(1, 5)]
        [int]$Id,

        [Parameter()]
        [ValidateSet('yolo', 'normal', 'plan')]
        [string]$Mode
    )

    Write-Host "세션 $Id 재시작 중..." -ForegroundColor Cyan

    # 세션 중지
    Stop-OmcSession -Id $Id

    # 2초 대기
    Start-Sleep -Seconds 2

    # 세션 시작
    $startParams = @{ Id = $Id }
    if ($Mode) { $startParams['Mode'] = $Mode }

    Start-OmcSession @startParams
}
