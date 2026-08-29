# HYPEWAVE 진행 상황

랄프 루프 규율(한 반복=한 작업, 검증 후 커밋)로 진행. 앱은 `hypewave/` (Next.js).
표기: [x] 완료·검증, [~] 구현 완료·호스트 로그인 필요(솔로 검증 불가), [ ] 미착수.

- [x] 프로젝트 초기화 + localhost 개발 서버
  - Next.js(App Router, TS) `hypewave/`, `npm run dev`가 127.0.0.1:5173(=redirect URI)에서 구동. 127.0.0.1은 secure-context라 마이크·SDK 사용 가능.
- [~] Spotify OAuth(호스트 Premium) + Web Playback SDK 플레이어
  - 서버 주도 OAuth(`/api/auth/login`→`/callback` code교환, refresh는 httpOnly 쿠키). SDK 플레이어 훅 구현. **실제 재생 확인은 호스트 Premium 로그인 필요.**
- [x] 장르 입력 → LLM 첫 곡 → Search로 URI → 재생(시작 플로우)
  - mock 모드에서 E2E 검증. 실 LLM(Gemini)로 첫 곡 추천 동작.
- [x] 현재 재생 곡 읽기 표시
  - NOW PLAYING 카드. live는 player_state, mock은 컨트롤러 상태.
- [~] 마이크 dB 미터(Web Audio) + 직전 10초 평균 + 표시
  - `useMicDbMeter`(RMS→dB) 구현 + 실시간 미터/베이스라인 UI. **실 마이크는 로컬 디바이스 필요**, mock 주입은 검증됨.
- [x] 트리거(+10, 설정값) + 30초 쿨다운 + 가짜 dB 주입 모드
  - 단위테스트 + mock 주입 버튼으로 검증. 값은 config(하드코딩 아님).
- [x] 트리거 시 LLM 추천 2곡(JSON)
  - `/api/llm`(Groq/Gemini) + zod 파싱. 실 Gemini 응답 curl로 검증(gemini-3.6-flash).
- [x] 폴백 체인(1번→2번→장르 재추천→장르 키워드)
  - 단위테스트로 각 분기 검증(1번 없음→2번 채택 포함).
- [x] 자체 큐 + 곡 종료 시 자동 재생 (★E2E 데모 지점)
  - 통합테스트 + mock 모드에서 곡 종료→다음 곡 전환 검증.
- [x] 중복 방지(현재 곡·직전 N곡 제외)
  - `queue.ts` + 단위테스트.
- [x] UI 정리: dB 미터/HYPE/현재·다음 곡/로그
  - 다크 레이브 디자인 시스템(globals.css). 반응형.
- [x] README에 실행/데모 방법
  - `hypewave/README.md`.
