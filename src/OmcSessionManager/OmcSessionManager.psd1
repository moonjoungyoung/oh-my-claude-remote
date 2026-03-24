@{
    RootModule        = 'OmcSessionManager.psm1'
    ModuleVersion     = '0.1.0'
    GUID              = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    Author            = 'OMC'
    CompanyName       = 'OMC'
    Copyright         = '(c) 2026 OMC. All rights reserved.'
    Description       = 'OMC Session Manager - Claude Code 세션 관리 모듈'
    PowerShellVersion = '7.0'
    FunctionsToExport = @(
        'Start-OmcSession'
        'Stop-OmcSession'
        'Get-OmcSessionStatus'
        'Restart-OmcSession'
    )
    CmdletsToExport   = @()
    VariablesToExport  = @()
    AliasesToExport    = @()
    PrivateData        = @{
        PSData = @{
            Tags       = @('omc', 'session-manager', 'claude-code')
            ProjectUri = ''
        }
    }
}
