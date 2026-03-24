function Get-OmcSessionStatus {
    <#
    .SYNOPSIS
        세션 상태를 조회합니다.
    .DESCRIPTION
        상태 파일(읽기 전용)을 읽어 세션 상태를 PSCustomObject 배열로 반환합니다.
        PID 유효성을 실시간으로 검증합니다.
    .PARAMETER Id
        조회할 세션 ID (선택). 생략 시 전체 세션 조회.
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [ValidateRange(1, 5)]
        [int]$Id
    )

    # 상태 파일 읽기
    if (-not (Test-Path $script:StateFilePath)) {
        Write-Warning "상태 파일이 없습니다: $($script:StateFilePath)"
        Write-Warning "마스터 봇이 아직 시작되지 않았거나 상태 파일이 생성되지 않았습니다."
        return
    }

    $state = Get-Content -Path $script:StateFilePath -Raw -Encoding UTF8 | ConvertFrom-Json

    if (-not $state.sessions) {
        Write-Warning "상태 파일에 세션 정보가 없습니다."
        return
    }

    # 설정 파일도 로드하여 세션 이름 매핑
    $config = $null
    try {
        $config = Get-SessionConfig
    }
    catch {
        # 설정 파일 없어도 상태 조회는 가능
    }

    $results = @()

    if ($Id) {
        $s = $state.sessions."$Id"
        if (-not $s) {
            Write-Warning "세션 ID $Id 의 상태 정보를 찾을 수 없습니다."
            return
        }
        $sessionList = @($s)
    }
    else {
        $sessionList = @()
        foreach ($prop in $state.sessions.PSObject.Properties) {
            $sessionList += $prop.Value
        }
    }

    foreach ($s in $sessionList) {
        # 설정에서 세션 이름 조회
        $name = $s.name
        if (-not $name -and $config) {
            $configSession = $config.sessions | Where-Object { $_.id -eq $s.id }
            if ($configSession) { $name = $configSession.name }
        }

        # PID 유효성 실시간 검증
        $processAlive = $false
        if ($s.pid -and $s.pid -ne 0) {
            $processAlive = Test-ProcessAlive -ProcessId $s.pid
        }

        $results += [PSCustomObject]@{
            Id           = $s.id
            Name         = if ($name) { $name } else { "session-$($s.id)" }
            Status       = $s.status
            PID          = if ($s.pid) { $s.pid } else { '-' }
            ProcessAlive = $processAlive
            Mode         = if ($s.mode) { $s.mode } else { '-' }
            StartedAt    = if ($s.startedAt) { $s.startedAt } else { '-' }
            LastHealth   = if ($s.lastHealthCheck) { $s.lastHealthCheck } else { '-' }
        }
    }

    $results | Format-Table -AutoSize
    return $results
}
