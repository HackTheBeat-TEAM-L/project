# AGENTS.md - 규칙 및 함정 공유

## 개발 환경 및 명령어
- 설치: `npm install`
- 개발 서버: `npm run dev` (반드시 HTTPS/localhost 환경 구성 필요)
- 스모크테스트: (모킹 포함된 테스트 스크립트 실행)

## 반드시 지켜야 할 규칙 (함정)
1. Spotify `/recommendations` API, 연관 아티스트, 오디오 피처는 폐지되어 사용 불가하므로 **추천은 무조건 LLM**을 통한다.
2. 현재 곡은 인식/샤잠하지 않고, Spotify 재생 상태(player state)에서 직접 읽는다.
3. dB는 절대값이 아닌 **직전 10초 롤링 평균 대비 상대적 스파이크(+10)**로 트리거한다.
4. Spotify `add-to-queue`는 재생 목록 맨 뒤에 붙으므로 바로 다음 재생을 보장하지 못함. **앱 자체적으로 큐를 관리**하고 곡 종료 이벤트 발생 시 직접 `play` 한다.
5. `SPOTIFY_CLIENT_SECRET` 및 `LLM_API_KEY` 같은 시크릿은 반드시 `.env`에서만 관리하고 프론트엔드 코드에 노출하지 않는다. (`.gitignore`에 포함 확인)

## 배운 것 / 트러블슈팅
(매 반복 종료 시 새로 배운 것이나 마주친 함정을 여기에 한 줄씩 추가할 것)

## 배운 것 / 트러블슈팅 (구현 세션)
- **stack**: Next.js(App Router)로 확정 — API Route가 곧 시크릿 백엔드(토큰교환+LLM 프록시), Vercel 배포·HTTPS 일치. `next dev -p 5173 -H 127.0.0.1`로 기존 redirect URI 유지.
- **env 단일화**: `hypewave/.env.local` → 루트 `../.env` 심링크. Next가 네이티브 로드, 시크릿은 서버에만.
- **Gemini 모델**: `gemini-2.5-flash`는 신규 키에 404("no longer available to new users") → **`gemini-3.6-flash`** 사용(curl 검증 완료).
- **Gemini 키 형식**: 신규 AI Studio 키는 `AIza…`가 아니라 **`AQ.…`** 로 시작할 수 있음(정상). 모델 목록/generateContent 200 확인.
- **npm 캐시 권한**: `~/.npm` 권한 오류 시 `--cache <임시경로>`로 우회(sudo 불필요).
- **시크릿 경계**: 유저 access_token만 브라우저로(SDK 필수), client secret·LLM 키는 서버 전용. OAuth는 서버 주도(state 쿠키 CSRF, refresh는 httpOnly).
- **track-end 감지**: 단일 uri로 play하면 종료 시 Spotify가 position 0에서 pause → (was playing && paused && position 0)로 곡 종료 판정(휴리스틱, 2초 가드).
- **검증은 mock 우선**: 실 Spotify 재생/마이크는 호스트 환경 필요 → mock 플레이어+가짜 dB 주입+mock Search로 전체 루프를 로그인 없이 검증.

## 배운 것 / 트러블슈팅 (운영·배포 세션)
- **LLM 프로바이더**: 지연·무료한도 때문에 **Groq 권장**(Gemini 무료는 하루 20회 → 소진되면 429). Groq 모델은 계정별로 다름 — `llama-3.3-70b`는 없을 수 있고 **`openai/gpt-oss-20b`** 사용(응답 ~1초). `LLM_MODEL` env로 교체 가능.
- **LLM JSON 안정화**: gpt-oss는 가끔 산문/추론을 섞음 → **JSON 모드 강제**(Groq `response_format: json_object` + JSON-only 시스템 메시지, Gemini `responseMimeType: application/json`) + 파서가 배열/객체 모두 수용. "No JSON array found" 오류 제거.
- **OAuth 호스트**: Next가 콜백의 `req.url` host를 `localhost`로 정규화 → 쿠키는 `127.0.0.1`에 심겼는데 리다이렉트는 localhost로 가서 미연결. **콜백 리다이렉트를 redirect_uri 오리진(127.0.0.1)으로 고정**해 해결. 로그인·앱 접속 모두 반드시 127.0.0.1.
- **streaming 스코프**: 과거 좁은 스코프로 승인돼 있으면 재발급 토큰에 `streaming`이 빠져 SDK가 "Invalid token scopes" → **`show_dialog=true`로 강제 재동의** 1회 후 정상. (StrictMode로 SDK 이중 초기화 시 잔상 에러가 뜰 수 있으나 실제 재생엔 무관 — 기기 등록·재생 성공으로 확인)
- **HYPE 워밍업**: baseline이 샘플 1~2개만으로도 계산돼 시작 직후 오발 → **`warmupSec`(기본 10초) 전엔 트리거 금지**. 미터에 "워밍업" 표시.
- **Vercel**: `hypewave/`를 루트로 링크, env는 대시보드 설정. 프로덕션 `SPOTIFY_REDIRECT_URI`는 `https://<도메인>/callback`이고 그 URL을 Spotify 대시보드에도 등록해야 로그인 가능. 자동배포 미연결 시 `npx vercel --prod`로 수동 배포.
