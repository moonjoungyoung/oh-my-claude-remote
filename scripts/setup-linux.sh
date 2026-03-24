#!/usr/bin/env bash
set -euo pipefail

# OMC Session Manager - Linux/macOS 설정 스크립트

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="$HOME/.config/omc-sessions"
TOKENS_FILE="$CONFIG_DIR/tokens.env"

step() { echo -e "${CYAN}[STEP]${RESET} $1"; }
ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }
warn() { echo -e "  ${YELLOW}!${RESET} $1"; }

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}  OMC Session Manager - Linux/macOS Setup${RESET}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════${RESET}"
echo ""

# ── 1. 의존성 확인 ──

step "의존성 확인"

if command -v bun &>/dev/null; then
    ok "Bun $(bun --version 2>/dev/null) 감지"
else
    fail "Bun이 설치되어 있지 않습니다."
    echo "  설치: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

if command -v claude &>/dev/null; then
    ok "Claude CLI 감지"
else
    fail "Claude CLI가 설치되어 있지 않습니다."
    echo "  설치: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

if command -v pwsh &>/dev/null; then
    ok "PowerShell $(pwsh --version 2>/dev/null) 감지"
else
    warn "PowerShell이 설치되어 있지 않습니다. (대시보드 사용 시 필요)"
    echo "  설치: https://learn.microsoft.com/ko-kr/powershell/scripting/install/installing-powershell-on-linux"
fi

# ── 2. 크레덴셜 디렉토리 생성 ──

echo ""
step "크레덴셜 디렉토리 생성"

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
ok "$CONFIG_DIR (권한: 700)"

# ── 3. 토큰 등록 ──

echo ""
step "Telegram Bot 토큰 등록"
echo "  토큰은 $TOKENS_FILE 에 저장됩니다."
echo "  건너뛰려면 빈 값으로 Enter를 누르세요."
echo ""

# 기존 파일이 있으면 백업
if [[ -f "$TOKENS_FILE" ]]; then
    cp "$TOKENS_FILE" "${TOKENS_FILE}.bak"
    warn "기존 tokens.env → tokens.env.bak 백업 완료"
fi

# 새 파일 시작
cat > "$TOKENS_FILE" << 'HEADER'
# OMC Session Manager - Bot Tokens
# 이 파일은 자동 생성되었습니다.
# 권한: 600 (소유자만 읽기/쓰기)
HEADER

# Master bot token
echo -e "  ${BOLD}Master bot token (Bot 6):${RESET}"
read -sp "  Token: " master_token
echo ""

if [[ -n "$master_token" ]]; then
    echo "omc-master-bot-token=$master_token" >> "$TOKENS_FILE"
    ok "마스터 봇 토큰 저장 완료"
else
    echo "# omc-master-bot-token=" >> "$TOKENS_FILE"
    warn "마스터 봇 토큰 건너뜀"
fi

# Session tokens (1-5)
for i in 1 2 3 4 5; do
    echo ""
    echo -e "  ${BOLD}Session $i bot token:${RESET}"
    read -sp "  Token: " session_token
    echo ""

    if [[ -n "$session_token" ]]; then
        echo "omc-session-${i}-token=$session_token" >> "$TOKENS_FILE"
        ok "세션 $i 토큰 저장 완료"
    else
        echo "# omc-session-${i}-token=" >> "$TOKENS_FILE"
        warn "세션 $i 토큰 건너뜀"
    fi
done

chmod 600 "$TOKENS_FILE"
ok "tokens.env 권한 설정 (600)"

# ── 4. config/sessions.json 확인 ──

echo ""
step "설정 파일 확인"

config_path="$PROJECT_ROOT/config/sessions.json"
example_path="$PROJECT_ROOT/config/sessions.example.json"

if [[ -f "$config_path" ]]; then
    ok "config/sessions.json 이미 존재합니다."
elif [[ -f "$example_path" ]]; then
    cp "$example_path" "$config_path"
    ok "sessions.example.json → sessions.json 복사 완료"
    warn "config/sessions.json 을 환경에 맞게 수정하세요."
else
    fail "config/sessions.example.json 파일을 찾을 수 없습니다."
    exit 1
fi

# ── 5. state 디렉토리 생성 ──

echo ""
step "디렉토리 생성"

state_dir="$PROJECT_ROOT/state"
logs_dir="$state_dir/logs"

mkdir -p "$state_dir"
ok "state/ 디렉토리"

mkdir -p "$logs_dir"
ok "state/logs/ 디렉토리"

# ── 6. Bun 의존성 설치 ──

echo ""
step "Controller 의존성 설치 (bun install)"

controller_dir="$PROJECT_ROOT/src/controller"
if [[ -d "$controller_dir" ]]; then
    (cd "$controller_dir" && bun install)
    ok "bun install 완료"
else
    warn "src/controller 디렉토리가 없습니다. 건너뜁니다."
fi

# ── 7. 완료 ──

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  설정 완료!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${RESET}"
echo ""
echo "  사용법:"
echo -e "    ${CYAN}# 대시보드 실행${RESET}"
echo "    pwsh src/dashboard/Start-OmcDashboard.ps1"
echo ""
echo -e "    ${CYAN}# 세션 시작/중지${RESET}"
echo "    pwsh -c 'Import-Module ./src/OmcSessionManager/OmcSessionManager.psm1; Start-OmcSession -Id 1'"
echo ""
echo -e "    ${CYAN}# 상태 확인${RESET}"
echo "    pwsh -c 'Import-Module ./src/OmcSessionManager/OmcSessionManager.psm1; Get-OmcSessionStatus'"
echo ""
