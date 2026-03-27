# Patch claude-code-telegram for:
# 1. OMC support (load user CLAUDE.md)
# 2. /sessions and /resume commands for session switching
#
# Run this after every `pip install/upgrade claude-code-telegram`

$sitePackages = "$env:APPDATA\Python\Python312\site-packages"
$sdkFile = "$sitePackages\src\claude\sdk_integration.py"
$orchFile = "$sitePackages\src\bot\orchestrator.py"

$errors = @()

# ============================================================
# Patch 1: OMC support
# ============================================================
if (Test-Path $sdkFile) {
    $content = Get-Content $sdkFile -Raw
    if ($content -match 'setting_sources=\["user", "project"\]') {
        Write-Host "[Patch 1] OMC: Already patched." -ForegroundColor Green
    } else {
        $patched = $content -replace 'setting_sources=\["project"\]', 'setting_sources=["user", "project"]'
        if ($patched -ne $content) {
            Set-Content $sdkFile -Value $patched -NoNewline
            Write-Host "[Patch 1] OMC: Patched." -ForegroundColor Green
        } else {
            $errors += "Could not find setting_sources pattern in sdk_integration.py"
        }
    }
} else {
    $errors += "sdk_integration.py not found"
}

# ============================================================
# Patch 2: /sessions and /resume in orchestrator.py
# ============================================================
if (Test-Path $orchFile) {
    $content = Get-Content $orchFile -Raw

    if ($content -match 'agentic_sessions') {
        Write-Host "[Patch 2] sessions/resume: Already patched." -ForegroundColor Green
    } else {
        # 2a: Add handler registrations
        $content = $content.Replace(
            '("repo", self.agentic_repo),',
            @"
("repo", self.agentic_repo),
            ("sessions", self.agentic_sessions),
            ("resume", self.agentic_resume),
"@)

        # 2b: Add BotCommand entries (agentic mode block)
        $content = $content.Replace(
            'BotCommand("repo", "List repos / switch workspace"),',
            @"
BotCommand("repo", "List repos / switch workspace"),
                BotCommand("sessions", "List recent sessions"),
                BotCommand("resume", "Resume a session: /resume <id>"),
"@)

        # 2c: Add handler methods after agentic_new
        $newMethods = @'

    async def agentic_sessions(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        """List recent Claude Code sessions for the current project."""
        import json as _json
        from pathlib import Path as _P
        from os import path as _osp
        import datetime as _dt

        current_dir = context.user_data.get(
            "current_directory", self.settings.approved_directory
        )
        claude_dir = _P.home() / ".claude" / "projects"
        dir_str = str(current_dir).replace(":", "-").replace("\\", "-").replace("/", "-")
        project_dir = claude_dir / dir_str

        if not project_dir.exists():
            await update.message.reply_text("No sessions found for this project.")
            return

        sessions = []
        for f in sorted(project_dir.glob("*.jsonl"), key=_osp.getmtime, reverse=True):
            sid = f.stem
            try:
                first_prompt = ""
                with open(f, encoding="utf-8") as fh:
                    for line in fh:
                        try:
                            d = _json.loads(line)
                            if not first_prompt and d.get("type") == "user":
                                msg = d.get("message", {})
                                if isinstance(msg, dict):
                                    c = msg.get("content", "")
                                    if isinstance(c, list):
                                        for item in c:
                                            if isinstance(item, dict) and item.get("type") == "text":
                                                txt = item["text"].strip()
                                                if txt and not txt.startswith("<"):
                                                    first_prompt = txt[:50]
                                                    break
                                    elif isinstance(c, str) and not c.startswith("<"):
                                        first_prompt = c[:50]
                                if first_prompt:
                                    break
                        except Exception:
                            pass
                mtime = _osp.getmtime(str(f))
                last_time = _dt.datetime.fromtimestamp(mtime).strftime("%m/%d %H:%M")
                label = first_prompt if first_prompt else "(empty)"
                sessions.append((sid[:8], sid, last_time, label))
            except Exception:
                pass
            if len(sessions) >= 10:
                break

        if not sessions:
            await update.message.reply_text("No sessions found.")
            return

        current_sid = context.user_data.get("claude_session_id", "")
        lines = []
        for i, (short_id, full_id, ts, prompt) in enumerate(sessions):
            marker = " *" if current_sid and current_sid.startswith(short_id) else ""
            num = f"{i+1}."
            lines.append(f"{num:3s} <code>{short_id}</code>  {ts}{marker}\n    {escape_html(prompt)}")
        text = "<b>Sessions</b>\n\n" + "\n\n".join(lines) + "\n\n/resume &lt;id&gt;"
        await update.message.reply_text(text, parse_mode="HTML")

    async def agentic_resume(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        """Resume a specific Claude Code session by ID prefix."""
        from pathlib import Path as _P

        text = update.message.text or ""
        parts = text.strip().split()
        if len(parts) < 2:
            await update.message.reply_text("Usage: /resume <session-id>\nUse /sessions to list.")
            return

        target = parts[1].strip()
        current_dir = context.user_data.get(
            "current_directory", self.settings.approved_directory
        )
        claude_dir = _P.home() / ".claude" / "projects"
        dir_str = str(current_dir).replace(":", "-").replace("\\", "-").replace("/", "-")
        project_dir = claude_dir / dir_str

        matches = []
        if project_dir.exists():
            for f in project_dir.glob("*.jsonl"):
                if f.stem.startswith(target):
                    matches.append(f.stem)

        if len(matches) == 0:
            await update.message.reply_text(f"Session not found: {target}\nUse /sessions to list.")
            return

        if len(matches) > 1:
            lines = [f"'{target}' matches {len(matches)} sessions. Be more specific:\n"]
            for m in matches[:5]:
                lines.append(f"  {m[:12]}...")
            await update.message.reply_text("\n".join(lines))
            return

        matched = matches[0]
        context.user_data["claude_session_id"] = matched
        context.user_data["force_new_session"] = False
        await update.message.reply_text(f"Resumed: {matched[:8]}...\nSend a message to continue.")

'@
        $anchor = '        await update.message.reply_text("Session reset. What' + "'" + 's next?")'
        $content = $content.Replace($anchor, $anchor + "`n" + $newMethods)

        Set-Content $orchFile -Value $content -NoNewline
        Write-Host "[Patch 2] sessions/resume: Patched." -ForegroundColor Green
    }
} else {
    $errors += "orchestrator.py not found"
}

# ============================================================
if ($errors.Count -gt 0) {
    Write-Host "`nErrors:" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Red }
    exit 1
} else {
    Write-Host "`nAll patches applied." -ForegroundColor Green
}
