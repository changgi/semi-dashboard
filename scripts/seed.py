#!/usr/bin/env python3
"""
로컬에서 Supabase에 시드 데이터를 삽입하는 스크립트.
사용법:
  pip install supabase python-dotenv
  python scripts/seed.py
"""
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    from supabase import create_client
except ImportError:
    print("Install dependencies: pip install supabase python-dotenv")
    sys.exit(1)

# .env 로드
ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

TICKERS = [
    # === 개별 종목 ===
    ("NVDA", "NVIDIA Corporation", "엔비디아", "fabless", 4800, False, "AI GPU 절대 강자"),
    ("TSM", "Taiwan Semiconductor", "TSMC", "foundry", 1900, False, "세계 최대 파운드리"),
    ("AVGO", "Broadcom Inc.", "브로드컴", "fabless", 1800, False, "커스텀 AI 칩 + VMware"),
    ("AMD", "Advanced Micro Devices", "AMD", "fabless", 420, False, "데이터센터 GPU"),
    ("MU", "Micron Technology", "마이크론", "memory", 510, False, "HBM 수혜 최대"),
    ("ASML", "ASML Holding", "ASML", "equipment", 380, False, "EUV 장비 독점"),
    ("INTC", "Intel Corporation", "인텔", "idm", 280, False, "파운드리 전환 중"),
    ("QCOM", "Qualcomm", "퀄컴", "fabless", 150, False, "스마트폰 모뎀"),
    ("ARM", "Arm Holdings", "ARM", "fabless", 170, False, "CPU IP 라이선스"),
    ("MRVL", "Marvell Technology", "마벨", "fabless", 120, False, "데이터센터 ASIC"),
    ("AMAT", "Applied Materials", "어플라이드", "equipment", 150, False, "반도체 장비"),
    ("LRCX", "Lam Research", "램리서치", "equipment", 95, False, "에칭/증착"),
    ("KLAC", "KLA Corporation", "KLA", "equipment", 85, False, "검사/계측"),
    ("TXN", "Texas Instruments", "TI", "idm", 170, False, "아날로그/임베디드"),
    ("ADI", "Analog Devices", "아날로그디바이시스", "idm", 110, False, "아날로그"),
    # === ETF ===
    ("SMH", "VanEck Semiconductor ETF", "SMH ETF", "etf", 25, True, "미국 상장 25개"),
    ("SOXX", "iShares Semiconductor ETF", "SOXX ETF", "etf", 15, True, "NYSE 30종목"),
    ("SMHX", "Sprott Semiconductor ETF", "SMHX ETF", "etf", 2, True, "팹리스 집중"),
    ("SOXL", "Direxion Semi Bull 3X", "SOXL", "etf", 8, True, "3배 레버리지"),
    ("SOXS", "Direxion Semi Bear 3X", "SOXS", "etf", 1, True, "3배 인버스"),
]

def main():
    print(f"📦 Seeding {len(TICKERS)} tickers to {SUPABASE_URL}...")

    rows = [
        {
            "symbol": t[0],
            "name": t[1],
            "name_kr": t[2],
            "segment": t[3],
            "market_cap_b": t[4],
            "is_etf": t[5],
            "description_kr": t[6],
        }
        for t in TICKERS
    ]

    try:
        result = supabase.table("tickers").upsert(rows, on_conflict="symbol").execute()
        print(f"✅ Upserted {len(result.data)} rows")

        # 확인
        existing = supabase.table("tickers").select("symbol", count="exact").execute()
        print(f"📊 Total tickers in DB: {existing.count}")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
