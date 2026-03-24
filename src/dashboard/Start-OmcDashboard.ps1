#Requires -Version 7.0
<#
.SYNOPSIS
    OMC Session Manager TUI 대시보드
.DESCRIPTION
    실시간으로 세션 상태를 모니터링하는 터미널 UI 대시보드입니다.
    세션 시작/중지 토글, 새로고침, 종료 기능을 제공합니다.
#>

# 모듈 로드
$modulePath = Join-Path $PSScriptRoot '..' 'OmcSessionManager' 'OmcSessionManager.psm1'
Import-Module $modulePath -Force

# ANSI 색상 코드
$Green  = "`e[32m"
$Red    = "`e[31m"
$Yellow = "`e[33m"
$Gray   = "`e[90m"
$Cyan   = "`e[36m"
$Bold   = "`e[1m"
$Reset  = "`e[0m"

function Format-Uptime {
    <#
    .SYNOPSIS
        StartedAt 시각으로부터 경과 시간을 사람이 읽기 쉬운 형태로 변환합니다.
    #>
    param([string]$StartedAt)

    if (-not $StartedAt -or $StartedAt -eq '-') { return '-' }

    try {
        $started = [DateTimeOffset]::Parse($StartedAt)
        $elapsed = [DateTimeOffset]::Now - $started
        if ($elapsed.TotalHours -ge 1) {
            return '{0}h {1:D2}m' -f [int][Math]::Floor($elapsed.TotalHours), $elapsed.Minutes
        }
        if ($elapsed.TotalMinutes -ge 1) {
            return '{0}m {1:D2}s' -f [int][Math]::Floor($elapsed.TotalMinutes), $elapsed.Seconds
        }
        return '0m {0:D2}s' -f $elapsed.Seconds
    }
    catch {
        return '-'
    }
}

function Get-StatusDisplay {
    <#
    .SYNOPSIS
        세션 상태 문자열에 해당하는 아이콘과 ANSI 색상을 반환합니다.
    #>
    param([string]$Status)

    switch ($Status.ToLower()) {
        'running'  { return @{ Icon = "$Green🟢 RUN  $Reset";  Color = $Green  } }
        'stopped'  { return @{ Icon = "$Gray🔴 STOP $Reset";   Color = $Gray   } }
        'error'    { return @{ Icon = "$Red⚠️  ERR  $Reset";   Color = $Red    } }
        'starting' { return @{ Icon = "$Yellow🟡 START$Reset";  Color = $Yellow } }
        'stopping' { return @{ Icon = "$Yellow🟡 STOP $Reset";  Color = $Yellow } }
        default    { return @{ Icon = "$Gray?  ???  $Reset";    Color = $Gray   } }
    }
}

function Show-Dashboard {
    <#
    .SYNOPSIS
        대시보드 화면을 한 번 렌더링합니다.
    #>

    [Console]::Clear()

    $now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $divider = "$Gray══════════════════════════════════════════════════════════════$Reset"

    # 헤더
    Write-Host $divider
    Write-Host "  ${Bold}${Cyan}OMC Session Manager Dashboard${Reset}"
    Write-Host "  ${Gray}$now  |  Press Q to quit${Reset}"
    Write-Host $divider
    Write-Host ""

    # 세션 상태 조회
    $sessions = $null
    try {
        $sessions = Get-OmcSessionStatus 6>$null 3>$null
    }
    catch {
        # 무시 - 상태 파일 없을 수 있음
    }

    # 테이블 헤더
    $header = '  {0,-4} {1,-12} {2,-14} {3,-8} {4,-8} {5}' -f '#', 'Name', 'Status', 'PID', 'Mode', 'Uptime'
    $separator = '  {0,-4} {1,-12} {2,-14} {3,-8} {4,-8} {5}' -f '──', '──────────', '────────', '──────', '──────', '──────'
    Write-Host $header
    Write-Host "${Gray}$separator${Reset}"

    if ($sessions) {
        foreach ($s in $sessions) {
            $display = Get-StatusDisplay -Status $s.Status
            $uptime = Format-Uptime -StartedAt $s.StartedAt
            $pid_str = if ($s.PID -and $s.PID -ne '-' -and $s.PID -ne 0) { $s.PID.ToString() } else { '-' }
            $mode_str = if ($s.Mode -and $s.Mode -ne '-') { $s.Mode } else { '-' }

            $line = '  {0,-4} {1,-12} {2}  {3,-8} {4,-8} {5}' -f $s.Id, $s.Name, $display.Icon, $pid_str, $mode_str, $uptime
            Write-Host $line
        }
    }
    else {
        Write-Host "  ${Yellow}상태 파일을 찾을 수 없습니다. 마스터 봇이 실행 중인지 확인하세요.${Reset}"
    }

    Write-Host ""
    Write-Host $divider
    Write-Host "  ${Bold}[Q]${Reset}uit  ${Bold}[R]${Reset}efresh  ${Bold}[1-5]${Reset} Toggle session"
    Write-Host $divider
}

function Start-OmcDashboard {
    <#
    .SYNOPSIS
        대시보드 메인 루프를 시작합니다.
    #>

    [Console]::CursorVisible = $false
    try {
        while ($true) {
            Show-Dashboard

            # 2초 동안 키 입력 대기
            $deadline = [DateTimeOffset]::Now.AddMilliseconds(2000)
            while ([DateTimeOffset]::Now -lt $deadline) {
                if ([Console]::KeyAvailable) {
                    $key = [Console]::ReadKey($true)
                    $char = $key.KeyChar.ToString().ToUpper()

                    switch ($char) {
                        'Q' {
                            [Console]::Clear()
                            Write-Host "${Cyan}대시보드를 종료합니다.${Reset}"
                            return
                        }
                        'R' {
                            # 즉시 새로고침 - 외부 while 루프로 돌아감
                            break
                        }
                        { $_ -in '1','2','3','4','5' } {
                            $sessionId = [int]$char
                            try {
                                $sessions = Get-OmcSessionStatus 6>$null 3>$null
                                $target = $sessions | Where-Object { $_.Id -eq $sessionId }

                                if ($target -and $target.Status -eq 'running') {
                                    Stop-OmcSession -Id $sessionId
                                }
                                elseif ($target -and $target.Status -eq 'stopped') {
                                    Start-OmcSession -Id $sessionId
                                }
                                else {
                                    # starting/stopping/error 상태에서는 무시
                                }
                            }
                            catch {
                                # 토글 실패 시 무시하고 다음 새로고침에서 반영
                            }
                            break
                        }
                    }

                    # R 또는 숫자 입력 후 즉시 새로고침
                    if ($char -ne 'Q') { break }
                }
                Start-Sleep -Milliseconds 100
            }
        }
    }
    finally {
        [Console]::CursorVisible = $true
    }
}

# 스크립트 직접 실행 시 대시보드 시작
Start-OmcDashboard
