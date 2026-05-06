# 세일즈가이의 식탁 — Claude 작업 가이드

## 프로젝트 개요
비즈니스 식사 / 직장인 점심 / 골프 귀경 맛집 추천 React 앱

## 기술 스택
- React 19 (Create React App)
- Supabase (PostgreSQL) — 서울시 공공 음식점 DB 120,705건
- GitHub → Vercel 자동 배포 (master 브랜치 push 시)
- 배포 URL: https://salesguy-table.vercel.app

## 환경변수 설정 (필수)
`.env.example`을 복사해 `.env`로 만들고 실제 키를 채워야 한다.
```
cp .env.example .env
```
| 변수명 | 설명 |
|---|---|
| `REACT_APP_KAKAO_KEY` | 카카오 JavaScript SDK 키 |
| `REACT_APP_SUPABASE_URL` | Supabase 프로젝트 URL |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase anon (공개) 키 |

> ⚠️ `.env`는 `.gitignore`에 등록돼 있어 GitHub에 올라가지 않는다.
> Vercel 환경변수는 Vercel 대시보드 → Settings → Environment Variables에서 별도 설정 필요.

## 주요 파일
| 파일 | 설명 |
|---|---|
| `src/App.js` | 메인 앱 (탭 3개: 비즈니스/점심/골프) |
| `src/supabaseClient.js` | Supabase 클라이언트 초기화 |
| `public/data/restaurants.json` | 비즈니스 식당 1,100개 (수동 검증) |
| `public/data/lunch.json` | 직장인 점심 421개 (수동 검증) |
| `public/data/golf.json` | 골프장 104개 + 귀경 식당 239개 |
| `public/privacy.html` | 개인정보처리방침 |

## 탭 구조
- **비즈니스**: 접대/업무식사용 고급 식당, 룸 여부·장르·지역 필터
- **점심**: 직장인 점심, 가격대 필터 + Supabase 공공DB 실시간 검색 (2글자↑)
- **골프**: 골프장 선택 → 귀경길 맛집 표시

## 검색 로직
- 지도 검색: 네이버 통합검색 (`search.naver.com`)
- 영문 시작 식당명 → 괄호 안 한글 추출 ex. `Born and Bred (본앤브레드)` → `본앤브레드`
- `mapQuery` 필드 있으면 해당 쿼리 우선 사용

## 개발/배포
```bash
npm start          # 개발 서버
npm run build      # 빌드 (CI=false 적용됨)
git push           # Vercel 자동 배포 트리거
```
