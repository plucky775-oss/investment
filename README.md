# Gemma 4 주식 멘토

Gemma 4를 이용해 사용자가 입력한 종목 데이터를 분석하는 Vercel용 웹앱/PWA입니다.

## 핵심 기능

- 종목명/티커, 현재가, 52주 고저가, PER, PBR, ROE, 성장률, 부채비율, 배당수익률 입력
- 투자 성향별 점수화: 안정형 / 중립형 / 공격형
- Gemma 4 AI 분석 리포트 생성
- API 키가 없으면 내장 기본 점수화로 임시 분석
- 관심종목 저장, 리포트 복사
- PWA 설치 가능

## Vercel 배포 방법

1. 이 폴더 전체를 GitHub 저장소에 업로드합니다.
2. Vercel에서 New Project로 해당 저장소를 연결합니다.
3. Settings → Environment Variables에 아래 값을 추가합니다.

```
GEMINI_API_KEY=구글 AI Studio API 키
GEMMA_MODEL=gemma-4-26b-a4b-it
```

`GEMMA_MODEL`은 선택입니다. 기본값은 `gemma-4-26b-a4b-it`입니다.

4. Deploy를 누릅니다.

## 주의

이 앱은 투자 판단 보조용이며, 매수/매도 추천을 보장하지 않습니다. 실시간 시세와 최신 뉴스는 사용자가 입력한 정보만 기준으로 분석합니다.
