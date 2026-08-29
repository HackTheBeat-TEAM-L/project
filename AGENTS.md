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
