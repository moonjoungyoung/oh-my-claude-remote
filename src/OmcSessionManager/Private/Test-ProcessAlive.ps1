function Test-ProcessAlive {
    <#
    .SYNOPSIS
        PID로 프로세스가 실행 중인지 확인합니다.
    .PARAMETER ProcessId
        확인할 프로세스 ID.
    .OUTPUTS
        [bool] 프로세스가 존재하면 $true, 아니면 $false.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [int]$ProcessId
    )

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    return ($null -ne $process)
}
