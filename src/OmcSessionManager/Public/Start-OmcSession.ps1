function Start-OmcSession {
    <#
    .SYNOPSIS
        Claude Code 세션을 시작합니다.
    .DESCRIPTION
        설정 파일에서 세션 정보를 읽어 크레덴셜을 조회한 후,
        새 창에서 claude 프로세스를 시작합니다.
    .PARAMETER Id
        시작할 세션 ID (1-5).
    .PARAMETER Mode
        실행 모드. yolo, normal, plan 중 선택. 기본값은 세션 설정의 defaultMode.
    .PARAMETER ConfigPath
        설정 파일 경로 (선택).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateRange(1, 5)]
        [int]$Id,

        [Parameter()]
        [ValidateSet('yolo', 'normal', 'plan')]
        [string]$Mode,

        [Parameter()]
        [string]$ConfigPath
    )

    # 설정 로드
    $configParams = @{}
    if ($ConfigPath) { $configParams['ConfigPath'] = $ConfigPath }
    $config = Get-SessionConfig @configParams

    # 세션 ID 검증
    $session = $config.sessions | Where-Object { $_.id -eq $Id }
    if (-not $session) {
        Write-Error "세션 ID $Id 를 설정에서 찾을 수 없습니다."
        return
    }

    # 모드 결정 (파라미터 > 세션 기본값 > yolo)
    if (-not $Mode) {
        $Mode = if ($session.defaultMode) { $session.defaultMode } else { 'yolo' }
    }

    # 크레덴셜 조회
    $token = Resolve-Credential -CredentialKey $session.credentialKey
    if (-not $token) {
        return
    }

    # 작업 디렉토리
    $workDir = if ($session.workingDirectory) { $session.workingDirectory } else { 'C:\dev' }

    # claude 명령 인자 구성
    $claudeArgs = @()
    switch ($Mode) {
        'yolo' {
            $claudeArgs += '--dangerously-skip-permissions'
        }
        'plan' {
            $claudeArgs += '--permission-mode'
            $claudeArgs += 'plan'
        }
        'normal' {
            # 기본 모드, 추가 인자 없음
        }
    }

    # 환경 변수 설정 후 새 창에서 claude 실행
    $envSetCmd = "set ANTHROPIC_API_KEY=$token"
    $claudeCmd = "claude $($claudeArgs -join ' ')"
    $fullCmd = "$envSetCmd && cd /d `"$workDir`" && $claudeCmd"

    Write-Host "세션 $Id ('$($session.name)') 시작 중... [모드: $Mode]" -ForegroundColor Cyan

    if ($IsWindows -or ($env:OS -eq 'Windows_NT')) {
        $process = Start-Process -FilePath 'cmd.exe' `
            -ArgumentList "/k `"$fullCmd`"" `
            -PassThru `
            -WorkingDirectory $workDir
    }
    else {
        # Linux/macOS
        $envSetCmd = "export ANTHROPIC_API_KEY='$token'"
        $fullCmd = "$envSetCmd && cd '$workDir' && $claudeCmd"
        $process = Start-Process -FilePath '/bin/bash' `
            -ArgumentList "-c", "`"$fullCmd`"" `
            -PassThru `
            -WorkingDirectory $workDir
    }

    Write-Host "세션 $Id 시작 완료. PID: $($process.Id)" -ForegroundColor Green
    return $process.Id
}
