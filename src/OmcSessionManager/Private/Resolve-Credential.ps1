function Resolve-Credential {
    <#
    .SYNOPSIS
        크레덴셜 키로 저장된 토큰을 조회합니다.
    .DESCRIPTION
        Windows에서는 Windows Credential Manager를, Linux에서는 tokens.env 파일을 사용합니다.
    .PARAMETER CredentialKey
        조회할 크레덴셜 키 이름.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$CredentialKey
    )

    if ($IsWindows -or ($env:OS -eq 'Windows_NT')) {
        # Windows: Windows Credential Manager에서 조회
        try {
            $cred = Get-StoredCredential -Target $CredentialKey
            if (-not $cred) {
                throw "Credential not found"
            }
            return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred.Password)
            )
        }
        catch {
            Write-Error "Credential '$CredentialKey' not found. Run Setup-Windows.ps1 first."
            return $null
        }
    }
    else {
        # Linux: ~/.config/omc-sessions/tokens.env에서 KEY=value 파싱
        $tokensPath = Join-Path $HOME '.config' 'omc-sessions' 'tokens.env'
        if (-not (Test-Path $tokensPath)) {
            Write-Error "토큰 파일을 찾을 수 없습니다: $tokensPath"
            return $null
        }

        $lines = Get-Content -Path $tokensPath -Encoding UTF8
        foreach ($line in $lines) {
            $line = $line.Trim()
            # 빈 줄이나 주석 건너뛰기
            if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
                continue
            }
            $parts = $line -split '=', 2
            if ($parts.Count -eq 2 -and $parts[0].Trim() -eq $CredentialKey) {
                return $parts[1].Trim()
            }
        }

        Write-Error "Credential '$CredentialKey' not found in $tokensPath"
        return $null
    }
}
