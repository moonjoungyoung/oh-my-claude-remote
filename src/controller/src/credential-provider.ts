import type { Platform } from './types';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- Interface ---

export interface CredentialProvider {
  getToken(credentialKey: string): Promise<string>;
  setToken(credentialKey: string, token: string): Promise<void>;
  deleteToken(credentialKey: string): Promise<void>;
}

// --- Windows Implementation ---

class WindowsCredentialProvider implements CredentialProvider {
  async getToken(credentialKey: string): Promise<string> {
    // Try Get-StoredCredential first, fallback to Win32 API P/Invoke
    try {
      return await this.getTokenViaStoredCredential(credentialKey);
    } catch {
      return await this.getTokenViaWin32Api(credentialKey);
    }
  }

  private async getTokenViaStoredCredential(credentialKey: string): Promise<string> {
    const command = `
      $cred = Get-StoredCredential -Target $env:CRED_KEY
      if ($cred) {
        [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
          [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred.Password)
        )
      } else {
        Write-Error 'NOT_FOUND'; exit 1
      }
    `;

    const proc = Bun.spawn(['pwsh', '-NoProfile', '-Command', command], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { CRED_KEY: credentialKey, SYSTEMROOT: process.env.SYSTEMROOT ?? '', PATH: process.env.PATH ?? '' },
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Get-StoredCredential failed for key '${credentialKey}'`);
    }

    const stdout = await new Response(proc.stdout).text();
    return stdout.trim();
  }

  private async getTokenViaWin32Api(credentialKey: string): Promise<string> {
    const command = `
      Add-Type -Namespace 'CredManager' -Name 'NativeMethods' -MemberDefinition @'
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);

        [DllImport("advapi32.dll", SetLastError = true)]
        public static extern bool CredFree(IntPtr credential);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct CREDENTIAL {
          public int Flags;
          public int Type;
          public string TargetName;
          public string Comment;
          public long LastWritten;
          public int CredentialBlobSize;
          public IntPtr CredentialBlob;
          public int Persist;
          public int AttributeCount;
          public IntPtr Attributes;
          public string TargetAlias;
          public string UserName;
        }
'@

      $credPtr = [IntPtr]::Zero
      $success = [CredManager.NativeMethods]::CredRead($env:CRED_KEY, 1, 0, [ref]$credPtr)
      if (-not $success) {
        Write-Error 'NOT_FOUND'; exit 1
      }
      try {
        $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [Type][CredManager.NativeMethods+CREDENTIAL])
        if ($cred.CredentialBlobSize -gt 0) {
          [System.Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, $cred.CredentialBlobSize / 2)
        } else {
          Write-Error 'EMPTY_CREDENTIAL'; exit 1
        }
      } finally {
        [CredManager.NativeMethods]::CredFree($credPtr) | Out-Null
      }
    `;

    const proc = Bun.spawn(['pwsh', '-NoProfile', '-Command', command], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { CRED_KEY: credentialKey, SYSTEMROOT: process.env.SYSTEMROOT ?? '', PATH: process.env.PATH ?? '' },
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(
        `Token not found in Windows Credential Manager for key '${credentialKey}'. ` +
          `Please store it using: cmdkey /generic:${credentialKey} /user:omc /pass:<your-token>`
      );
    }

    const stdout = await new Response(proc.stdout).text();
    return stdout.trim();
  }

  async setToken(credentialKey: string, token: string): Promise<void> {
    const command = `cmdkey /generic:$env:CRED_KEY /user:omc /pass:$env:CRED_TOKEN`;
    const proc = Bun.spawn(['pwsh', '-NoProfile', '-Command', command], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { CRED_KEY: credentialKey, CRED_TOKEN: token, SYSTEMROOT: process.env.SYSTEMROOT ?? '', PATH: process.env.PATH ?? '' },
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Failed to store token for key '${credentialKey}': ${stderr.trim()}`);
    }
  }

  async deleteToken(credentialKey: string): Promise<void> {
    const command = `cmdkey /delete:$env:CRED_KEY`;
    const proc = Bun.spawn(['pwsh', '-NoProfile', '-Command', command], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { CRED_KEY: credentialKey, SYSTEMROOT: process.env.SYSTEMROOT ?? '', PATH: process.env.PATH ?? '' },
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Failed to delete token for key '${credentialKey}': ${stderr.trim()}`);
    }
  }
}

// --- Linux Implementation ---

class LinuxCredentialProvider implements CredentialProvider {
  private readonly tokenDir: string;
  private readonly tokenFile: string;

  constructor() {
    this.tokenDir = path.join(os.homedir(), '.config', 'omc-sessions');
    this.tokenFile = path.join(this.tokenDir, 'tokens.env');
  }

  async getToken(credentialKey: string): Promise<string> {
    this.ensureFileExists();

    const content = fs.readFileSync(this.tokenFile, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex);
      const value = trimmed.substring(eqIndex + 1);

      if (key === credentialKey) {
        return value;
      }
    }

    throw new Error(
      `Token not found for key '${credentialKey}'. ` +
        `Please add it to ${this.tokenFile} in the format: ${credentialKey}=<your-token>`
    );
  }

  async setToken(credentialKey: string, token: string): Promise<void> {
    this.ensureFileExists();

    const content = fs.readFileSync(this.tokenFile, 'utf-8');
    const lines = content.split('\n');
    let found = false;
    const newLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        newLines.push(line);
        continue;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        newLines.push(line);
        continue;
      }

      const key = trimmed.substring(0, eqIndex);
      if (key === credentialKey) {
        newLines.push(`${credentialKey}=${token}`);
        found = true;
      } else {
        newLines.push(line);
      }
    }

    if (!found) {
      newLines.push(`${credentialKey}=${token}`);
    }

    fs.writeFileSync(this.tokenFile, newLines.join('\n'), { mode: 0o600 });
  }

  async deleteToken(credentialKey: string): Promise<void> {
    this.ensureFileExists();

    const content = fs.readFileSync(this.tokenFile, 'utf-8');
    const lines = content.split('\n');
    const newLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        newLines.push(line);
        continue;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        newLines.push(line);
        continue;
      }

      const key = trimmed.substring(0, eqIndex);
      if (key !== credentialKey) {
        newLines.push(line);
      }
    }

    fs.writeFileSync(this.tokenFile, newLines.join('\n'), { mode: 0o600 });
  }

  private ensureFileExists(): void {
    if (!fs.existsSync(this.tokenDir)) {
      fs.mkdirSync(this.tokenDir, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(this.tokenFile)) {
      fs.writeFileSync(this.tokenFile, '', { mode: 0o600 });
    }
  }
}

// --- Factory ---

export function createCredentialProvider(platform: Platform): CredentialProvider {
  switch (platform) {
    case 'windows':
      return new WindowsCredentialProvider();
    case 'linux':
      return new LinuxCredentialProvider();
  }
}
