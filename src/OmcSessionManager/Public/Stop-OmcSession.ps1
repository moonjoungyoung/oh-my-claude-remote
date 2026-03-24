function Stop-OmcSession {
    <#
    .SYNOPSIS
        실행 중인 Claude Code 세션을 중지합니다.
    .DESCRIPTION
        상태 파일에서 세션의 PID를 조회한 후 프로세스를 종료합니다.
        Force 스위치 사용 시 즉시 강제 종료합니다.
    .PARAMETER Id
        중지할 세션 ID (1-5).
    .PARAMETER Force
        강제 종료 여부.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateRange(1, 5)]
        [int]$Id,

        [Parameter()]
        [switch]$Force
    )

    # 상태 파일에서 PID 조회
    if (-not (Test-Path $script:StateFilePath)) {
        Write-Warning "상태 파일이 없습니다: $($script:StateFilePath)"
        return
    }

    $state = Get-Content -Path $script:StateFilePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $sessionState = $state.sessions."$Id"

    if (-not $sessionState) {
        Write-Warning "세션 ID $Id 의 상태 정보를 찾을 수 없습니다."
        return
    }

    $pid_value = $sessionState.pid
    if (-not $pid_value -or $pid_value -eq 0) {
        Write-Warning "세션 $Id 에 연결된 PID가 없습니다."
        return
    }

    # 프로세스 존재 확인
    if (-not (Test-ProcessAlive -ProcessId $pid_value)) {
        Write-Host "세션 $Id (PID: $pid_value) 프로세스가 이미 종료되었습니다." -ForegroundColor Yellow
        return
    }

    Write-Host "세션 $Id (PID: $pid_value) 중지 중..." -ForegroundColor Cyan

    try {
        if ($Force) {
            # 즉시 강제 종료
            Stop-Process -Id $pid_value -Force -ErrorAction Stop
            Write-Host "세션 $Id (PID: $pid_value) 강제 종료 완료." -ForegroundColor Green
        }
        else {
            # 정상 종료 시도
            Stop-Process -Id $pid_value -ErrorAction Stop

            # 5초 대기 후 여전히 실행 중이면 강제 종료
            $waited = 0
            while ($waited -lt 5 -and (Test-ProcessAlive -ProcessId $pid_value)) {
                Start-Sleep -Seconds 1
                $waited++
            }

            if (Test-ProcessAlive -ProcessId $pid_value) {
                Write-Warning "정상 종료 실패. 강제 종료합니다..."
                Stop-Process -Id $pid_value -Force -ErrorAction Stop
                Write-Host "세션 $Id (PID: $pid_value) 강제 종료 완료." -ForegroundColor Yellow
            }
            else {
                Write-Host "세션 $Id (PID: $pid_value) 정상 종료 완료." -ForegroundColor Green
            }
        }
    }
    catch {
        Write-Error "세션 $Id (PID: $pid_value) 종료 실패: $_"
    }
}
