# oh-my-claude-remote

## 패치 필수사항

`claude-code-telegram` 패키지를 설치/업그레이드한 후 반드시 패치 스크립트를 실행해야 OMC가 적용된다:

```powershell
.\scripts\patch-claude-telegram.ps1
```

## 실행

```powershell
cd src\controller
bun run src/index.ts
```

## 토큰 재등록

```powershell
cmdkey /generic:omc-session-N-token /user:omc /pass:<TOKEN>
```
