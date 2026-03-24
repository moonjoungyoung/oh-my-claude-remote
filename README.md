# oh-my-claude-remote

Telegram 봇으로 여러 개의 Claude Code 세션을 원격 관리하는 도구. 작업 과정이 Telegram에서 실시간으로 스트리밍된다.

## 주요 기능

- **Telegram 실시간 스트리밍** — Claude가 작업하는 과정이 Telegram 채팅에서 실시간으로 보임
- **다중 세션** — 마스터 봇 1개로 워커 봇 N개를 관리. 각 워커에 Telegram으로 직접 작업 지시
- **OMC(oh-my-claudecode) 지원** — CLAUDE.md, hooks, skills 등 OMC 설정이 그대로 적용됨
- **보안** — Windows Credential Manager / Linux env 파일로 토큰 관리, 사용자 화이트리스트
- **세션 모드** — `yolo` (무제한) / `normal` (표준) / `plan` (읽기 전용)

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Telegram                                               │
│                                                         │
│  @master_bot ─── /run, /kill, /status 등 세션 관리      │
│  @worker_1_bot ── 워커 1에 직접 작업 지시 (실시간 응답)  │
│  @worker_2_bot ── 워커 2에 직접 작업 지시 (실시간 응답)  │
│  ...                                                    │
└───────────┬─────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────┐
│  Master Bot (Bun + grammY)                              │
│  세션 시작/중지/상태 관리                                │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ claude-      │ │ claude-      │ │ claude-      │    │
│  │ telegram-bot │ │ telegram-bot │ │ telegram-bot │    │
│  │ (Session 1)  │ │ (Session 2)  │ │ (Session 3)  │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│  각 세션 = 독립 Python 프로세스 + 전용 Telegram 봇      │
└─────────────────────────────────────────────────────────┘
```

## 사전 요구사항

- [Python 3.11+](https://www.python.org/)
- [Bun v1.0+](https://bun.sh)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (claude.ai 로그인 필요)
- Telegram 봇 토큰 (BotFather에서 생성)

## 빠른 시작

### 1. Telegram 봇 생성

[@BotFather](https://t.me/BotFather)에서 `/newbot`으로 봇을 만든다.

- **마스터 봇** 1개 — 세션 관리용 (예: `my_omc_master_bot`)
- **워커 봇** N개 — 각 세션의 Claude Code 인터페이스 (예: `my_omc_w1_bot`, `my_omc_w2_bot`, ...)

각 봇의 토큰을 복사해 둔다.

### 2. 프로젝트 설치

```bash
git clone https://github.com/moonjoungyoung/oh-my-claude-remote.git
cd oh-my-claude-remote
```

### 3. claude-code-telegram 설치

```bash
pip install claude-code-telegram>=1.5.0
```

OMC를 사용한다면 패치를 적용한다:

```powershell
.\scripts\patch-claude-telegram.ps1
```

### 4. 봇 토큰 등록

#### Windows

```powershell
.\scripts\Setup-Windows.ps1
```

스크립트가 대화형으로 토큰을 등록한다. 수동 등록도 가능:

```powershell
cmdkey /generic:omc-master-bot-token /user:omc /pass:<마스터봇토큰>
cmdkey /generic:omc-session-1-token /user:omc /pass:<워커1토큰>
cmdkey /generic:omc-session-2-token /user:omc /pass:<워커2토큰>
```

#### Linux / macOS

```bash
chmod +x scripts/setup-linux.sh
./scripts/setup-linux.sh
```

### 5. 설정 파일 작성

```bash
cp config/sessions.example.json config/sessions.json
```

`config/sessions.json`을 편집한다:

```json
{
  "version": 1,
  "authorizedUsers": [내_텔레그램_ID],
  "master": {
    "credentialKey": "omc-master-bot-token",
    "notifyChatId": "내_텔레그램_ID"
  },
  "sessions": [
    {
      "id": 1,
      "name": "worker-1",
      "credentialKey": "omc-session-1-token",
      "botUsername": "my_omc_w1_bot",
      "defaultMode": "yolo",
      "workingDirectory": "C:\\my\\project",
      "autoStart": false,
      "autoRestart": false,
      "maxRestarts": 3
    }
  ],
  "healthCheck": {
    "intervalSeconds": 30,
    "unresponsiveThreshold": 300
  }
}
```

본인의 Telegram ID는 [@userinfobot](https://t.me/userinfobot)에서 확인할 수 있다.

### 6. 마스터 봇 컨트롤러 의존성 설치

```bash
cd src/controller
bun install
```

### 7. 실행

```bash
cd src/controller
bun run src/index.ts
```

### 8. 사용

1. Telegram에서 마스터 봇에 `/run 1` 전송 → 워커 1 세션이 시작됨
2. 워커 1 봇 (`@my_omc_w1_bot`)에 작업을 지시하면 실시간으로 응답이 옴
3. 마스터 봇에 `/status`로 전체 세션 상태 확인
4. `/killall`로 전체 세션 종료

## Telegram 커맨드

마스터 봇에서 사용하는 커맨드:

| 커맨드 | 설명 |
|--------|------|
| `/run N` | 세션 N 시작 |
| `/kill N` | 세션 N 종료 |
| `/restart N` | 세션 N 재시작 |
| `/runall` | 전체 세션 시작 |
| `/killall` | 전체 세션 종료 |
| `/status` | 전체 상태 확인 |
| `/mode N yolo\|normal\|plan` | 세션 모드 변경 |
| `/help` | 도움말 |

### 모드

| 모드 | 설명 |
|------|------|
| `yolo` | 무제한 접근 (`bypassPermissions`). 변경 시 `/mode N yolo confirm` 필요 |
| `normal` | 표준 권한 |
| `plan` | 읽기 전용 |

## 설정 필드

| 필드 | 설명 |
|------|------|
| `authorizedUsers` | 마스터 봇 커맨드를 실행할 수 있는 Telegram 사용자 ID 목록 |
| `master.credentialKey` | 마스터 봇 토큰이 저장된 크레덴셜 키 이름 |
| `master.notifyChatId` | 알림을 받을 Telegram 채팅 ID |
| `sessions[].id` | 세션 번호 |
| `sessions[].name` | 세션 이름 (status 표시용) |
| `sessions[].credentialKey` | 워커 봇 토큰이 저장된 크레덴셜 키 이름 |
| `sessions[].botUsername` | 워커 봇의 Telegram username (`@` 제외) |
| `sessions[].defaultMode` | 기본 실행 모드 |
| `sessions[].workingDirectory` | Claude Code 작업 디렉토리 |
| `sessions[].autoStart` | 마스터 봇 시작 시 자동 실행 여부 |
| `sessions[].autoRestart` | 비정상 종료 시 자동 재시작 여부 |

## 보안

- **토큰 저장**: Windows는 Credential Manager, Linux는 `~/.config/omc-sessions/tokens.env` (권한 600)
- **사용자 인증**: `authorizedUsers`에 등록된 Telegram 사용자만 마스터 봇 커맨드 실행 가능
- **gitignore**: `config/sessions.json`, `state/`, `*.env` 등 민감 파일은 커밋에서 제외됨

## OMC (oh-my-claudecode) 적용

`claude-code-telegram`은 기본적으로 사용자 레벨 CLAUDE.md를 로드하지 않는다. OMC를 사용하려면 패치가 필요하다:

```powershell
.\scripts\patch-claude-telegram.ps1
```

이 패치는 `claude-code-telegram` 업그레이드 시마다 다시 적용해야 한다.

## 프로젝트 구조

```
oh-my-claude-remote/
├── config/
│   ├── sessions.example.json     # 설정 예시
│   └── sessions.schema.json      # 설정 JSON Schema
├── scripts/
│   ├── Setup-Windows.ps1         # Windows 초기 설정
│   ├── setup-linux.sh            # Linux 초기 설정
│   └── patch-claude-telegram.ps1 # OMC 패치
├── src/
│   └── controller/               # 마스터 봇 (Bun + grammY)
│       ├── src/
│       │   ├── index.ts          # 엔트리포인트
│       │   ├── bot.ts            # Telegram 봇 초기화
│       │   ├── session-manager.ts # 세션 상태 관리
│       │   ├── process-manager.ts # claude-telegram-bot 프로세스 관리
│       │   ├── config.ts         # 설정 로드/검증
│       │   ├── credential-provider.ts # 토큰 조회 (Win/Linux)
│       │   ├── health-monitor.ts # 프로세스 헬스 체크
│       │   └── commands/         # Telegram 커맨드 핸들러
│       └── package.json
├── state/                        # 런타임 상태 (gitignore)
├── CLAUDE.md
└── README.md
```

## 라이선스

MIT
