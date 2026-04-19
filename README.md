# 🔬 SEMI-TERMINAL

> **Real-time Semiconductor Sector Dashboard**
> Bloomberg-style terminal for tracking NVDA · TSM · AVGO · AMD · MU and 15+ semi stocks in real-time.

![Tech Stack](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![Supabase](https://img.shields.io/badge/Supabase-Seoul-green)
![Vercel](https://img.shields.io/badge/Vercel-Pro-black)

---

## ✨ 주요 기능

| 기능 | 기술 | 설명 |
|------|------|------|
| **실시간 시세** | Supabase Realtime + 15초 폴링 | 가격 변동 즉시 화면 반영 (flash 애니메이션) |
| **히트맵** | Custom React + CSS Grid | 시가총액 기반 크기 + 변화율 색상 |
| **과거 차트** | Recharts | 1H / 24H / 7D / 1M 전환 |
| **뉴스 피드** | Finnhub News API | 15분마다 자동 수집, 종목별 필터링 |
| **가격 알림** | Supabase + Vercel Cron | 가격 이상/이하, 변화율 도달 감지 |
| **하이브리드 소스** | Finnhub + Alpha Vantage | Rate limit 회피용 백업 |

---

## 🏗️ 아키텍처

```
┌──────────────────────────────────────────────────┐
│  Browser (Next.js 15 App Router + React 19)     │
│  └─ Supabase Realtime WebSocket                 │
│  └─ SWR 15초 폴링 (백업)                          │
└──────────────┬───────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────┐
│  Vercel Edge                                     │
│  ├─ API Routes (/api/*)                          │
│  └─ Cron Jobs                                    │
│     ├─ fetch-prices (1분)                        │
│     ├─ fetch-news (15분)                         │
│     └─ check-alerts (5분)                        │
└──────────────┬───────────────────────────────────┘
               │
     ┌─────────┴──────────┐
     ▼                    ▼
┌──────────┐       ┌──────────────┐
│ Finnhub  │       │   Supabase   │
│  Quote   │       │  (ap-ne-2)   │
│  News    │       │   tickers    │
│          │       │   quotes     │
└──────────┘       │   price_hist │
                   │   news       │
┌──────────┐       │   alerts     │
│ Alpha V. │──────▶│              │
│  Daily   │       └──────────────┘
└──────────┘
```

---

## 🚀 빠른 시작

### 1. 저장소 준비

```bash
# Clone
git clone https://github.com/changgi/semi-dashboard.git
cd semi-dashboard

# Install
npm install
```

### 2. API 키 발급 (모두 무료)

| 서비스 | URL | 무료 한도 |
|--------|-----|-----------|
| Supabase | https://supabase.com | 500MB + Realtime |
| Finnhub | https://finnhub.io | 60 req/min |
| Alpha Vantage | https://www.alphavantage.co | 25 req/day |

### 3. 환경변수 설정

```bash
cp .env.example .env.local
# .env.local 편집
```

### 4. Supabase 스키마 생성

**옵션 A: Supabase CLI**
```bash
npm install -g supabase
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**옵션 B: SQL Editor에서 수동 실행**
Supabase Dashboard → SQL Editor → 다음 순서로 실행:
1. `supabase/migrations/20260416000001_init.sql`
2. `supabase/migrations/20260416000002_seed.sql`
3. `supabase/migrations/20260416000003_news_alerts.sql`

### 5. 시드 실행 (선택)

Migration에 이미 포함되어 있지만, 추가로 종목을 넣고 싶으면:

```bash
# TypeScript 버전
npm run seed

# 또는 Python 버전
pip install supabase python-dotenv
python scripts/seed.py
```

### 6. 로컬 실행

```bash
npm run dev
# http://localhost:3000 열기
```

### 7. 초기 데이터 수집

처음 실행 시 quotes 테이블이 비어있음. 수동 트리거:

```bash
# 개발 환경
curl http://localhost:3000/api/cron/fetch-prices

# 또는 브라우저에서
# http://localhost:3000/api/cron/fetch-prices
```

---

## ☁️ Vercel 배포

### 원클릭 배포

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR/semi-dashboard)

### 수동 배포

```bash
npm install -g vercel
vercel login
vercel link
vercel --prod
```

**Vercel Dashboard에서 환경변수 설정**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FINNHUB_API_KEY`
- `ALPHA_VANTAGE_API_KEY` (선택)
- `CRON_SECRET` (랜덤 문자열, 아래 명령으로 생성)

```bash
openssl rand -base64 32
```

### GitHub Actions 자동 배포

리포지토리 Secrets 설정:
- `VERCEL_TOKEN` (https://vercel.com/account/tokens)
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

`.github/workflows/deploy.yml`이 자동으로:
- PR 생성 시: 프리뷰 배포 + PR에 코멘트
- main 푸시 시: 프로덕션 배포
- 마이그레이션 푸시 시: Supabase DB 동기화

---

## 📂 프로젝트 구조

```
semi-dashboard/
├── app/
│   ├── api/
│   │   ├── quotes/route.ts        # 실시간 시세 조회
│   │   ├── history/route.ts       # 과거 차트
│   │   ├── news/route.ts          # 뉴스 목록
│   │   ├── alerts/route.ts        # 알림 CRUD
│   │   └── cron/
│   │       ├── fetch-prices/      # 1분 가격 수집
│   │       ├── fetch-news/        # 15분 뉴스 수집
│   │       └── check-alerts/      # 5분 알림 체크
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                   # 메인 대시보드
├── components/
│   ├── TopBar.tsx
│   ├── LiveTicker.tsx
│   ├── Heatmap.tsx
│   ├── ChangeRanking.tsx
│   ├── SegmentStats.tsx
│   ├── PriceChart.tsx
│   ├── NewsFeed.tsx
│   ├── StockDrawer.tsx
│   └── AlertModal.tsx
├── lib/
│   ├── supabase.ts                # 브라우저/서버/어드민 클라이언트
│   ├── finnhub.ts                 # Finnhub API 래퍼
│   ├── alphavantage.ts            # Alpha Vantage 래퍼
│   ├── format.ts                  # 포맷터
│   └── types.ts                   # TypeScript 타입
├── supabase/migrations/           # DB 스키마
├── scripts/
│   ├── seed.ts                    # TS 시드
│   └── seed.py                    # Python 시드
├── .github/workflows/
│   ├── deploy.yml                 # Vercel 배포
│   └── migrate.yml                # DB 마이그레이션
├── .env.example
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
└── vercel.json                    # Cron 설정
```

---

## 🎨 디자인 시스템

**컬러 팔레트** (Bloomberg Terminal 오마주):
- `--amber` `#ffb000` - 브랜드 포인트
- `--green` `#00ff88` - 상승 / 긍정
- `--red` `#ff3860` - 하락 / 경고
- `--cyan` `#00d4ff` - 정보 / 액센트

**폰트**:
- JetBrains Mono — 기본 UI (숫자 등폭)
- Fraunces — 헤드라인 세리프
- Noto Sans KR — 한글

---

## 🔧 개발 팁

### 수동 데이터 수집

```bash
# 가격 수집
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://your-domain.vercel.app/api/cron/fetch-prices

# 뉴스 수집
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://your-domain.vercel.app/api/cron/fetch-news

# 알림 체크
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://your-domain.vercel.app/api/cron/check-alerts
```

### 로그 확인

```sql
-- Supabase SQL Editor
select * from fetch_log
order by fetched_at desc
limit 20;
```

### Realtime 테스트

```sql
-- quotes 수동 업데이트 → 브라우저 자동 반영 확인
update quotes set price = price * 1.01 where symbol = 'NVDA';
```

---

## ⚠️ 제한사항

- Finnhub Free tier는 미국 주식만 지원 (대만 상장 2330.TW 등은 불가)
- Vercel Hobby plan은 cron 하루 2회 제한 → Pro 필요
- Supabase Free는 7일 비활성 시 일시정지 → Pro 권장 ($25/월)
- 실제 거래 대금/포지션은 Finnhub Free tier에 미포함

---

## 📜 면책

본 프로젝트는 **정보 제공 목적**이며 투자 권유가 아닙니다.
데이터의 정확성이나 실시간성은 보장되지 않습니다.

---

## 📄 License

MIT © 2026 Kyle
