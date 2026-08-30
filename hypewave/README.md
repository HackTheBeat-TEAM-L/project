# HYPEWAVE (앱)

군중 반응형 오토 DJ. 마이크 **dB 스파이크**(직전 10초 평균 대비 +10)로 관중 함성을
감지해, **LLM 추천 → Spotify 검색 검증 → 자체 큐**로 다음 곡을 끊김 없이 이어 튼다.
부스 노트북(크롬) 한 대용 단일 웹앱. (전체 소개는 저장소 루트 [README](../README.md) 참고)

## 스택
- Next.js (App Router, TS). API 라우트가 시크릿 백엔드(Spotify 토큰 교환 + LLM 프록시).
  클라이언트는 Web Audio dB 측정 + Spotify Web Playback SDK 재생.
- 시크릿은 루트 `.env`에만(= `hypewave/.env.local` 심링크). 브라우저엔 유저 토큰만.

## 셋업
1. 루트 `.env`(gitignore됨)를 채운다:
   ```env
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
   LLM_PROVIDER=groq              # 또는 gemini
   LLM_API_KEY=gsk_...
   LLM_MODEL=openai/gpt-oss-20b   # 생략 시 프로바이더 기본값
   ```
   Spotify 대시보드에 **정확히** `http://127.0.0.1:5173/callback`를 등록
   (Web API + Web Playback SDK). 호스트 계정은 정식 **Premium**.
2. 설치 & 실행:
   ```bash
   npm install
   npm run dev            # http://127.0.0.1:5173  (localhost 아님!)
   ```

## 두 가지 모드
- **Live (Spotify)**: Premium 로그인 → 실제 마이크 + 브라우저 실제 재생.
- **Mock / 데모**: 로그인 없이 전체 루프 체험. 합성 dB 또는 실제 마이크 선택,
  `HYPE 스파이크 주입`·`다음 곡 재생(스킵)` 버튼 제공.

두 모드 모두 **🔮 다음 곡 추천 / ⏭ 다음 곡 재생(스킵)** 수동 컨트롤 지원.

## 테스트
```bash
npm test          # vitest: dB엔진·워밍업·쿨다운·중복방지·폴백·풀루프 통합
npm run build     # 프로덕션 빌드 + 타입체크
```

## 설정값 (하드코딩 아님 — `src/lib/config.ts`)
`spikeThresholdDb=10`, `rollingWindowSec=5`, `warmupSec=5`, `cooldownSec=30`,
`recommendCount=2`, `dedupeLastN=5`. 현장에서 실제 함성 dB를 재보고 임계값 보정.

## 함정 / 메모
- Spotify `/recommendations`는 폐지 → 추천은 LLM, 존재 검증은 Search.
- 현재 곡은 재생 상태에서 읽음(오디오 인식 X).
- `add-to-queue` 대신 자체 큐 → 현재 곡 종료 시 선정 URI로 직접 play.
- Gemini는 `gemini-3.6-flash` 사용(2.5-flash는 신규 키에 막힘). Groq는 `openai/gpt-oss-20b`.
- 반드시 **127.0.0.1**로 접속(콜백 쿠키 호스트 일치). localhost로 열면 세션이 안 잡힘.
