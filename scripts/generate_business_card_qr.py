#!/usr/bin/env python3
"""명함용 추적 URL → QR PNG 일괄 생성.

Usage:
  pip3 install qrcode pillow
  python3 scripts/generate_business_card_qr.py
  python3 scripts/generate_business_card_qr.py --csv scripts/business-card-qr/links.csv
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

try:
    import qrcode
except ImportError as e:
    raise SystemExit('qrcode 가 필요합니다: pip3 install qrcode pillow') from e

ROOT = Path(__file__).resolve().parent
DEFAULT_OUT = ROOT / 'business-card-qr'

# 기본 입점 업체 (필요 시 수정)
DEFAULT_PARTNERS = [
    ('wawa', '와와발렛'),
    ('gayu', '가유'),
    ('hi', '안녕주차대행'),
    ('season', '시즌주차대행'),
]


def booking_url(company_id: str) -> str:
    cid = company_id.strip().lower()
    return f'https://airpick-reservation.web.app/h/{cid}?src=business_card'


def safe_filename(name: str, company_id: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', '_', name).strip() or company_id
    return f'{company_id}_{cleaned}'


def make_qr(url: str, path: Path, box_size: int = 12) -> None:
    img = qrcode.make(url, box_size=box_size, border=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def load_from_csv(csv_path: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    with csv_path.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = (row.get('companyId') or row.get('id') or '').strip()
            name = (row.get('name') or cid).strip()
            if cid:
                rows.append((cid, name))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description='명함 QR PNG 일괄 생성')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help='출력 폴더')
    parser.add_argument('--csv', type=Path, help='companyId,name 컬럼 CSV (선택)')
    parser.add_argument('--box-size', type=int, default=12, help='QR 모듈 크기 (기본 12 ≈ 고해상도)')
    args = parser.parse_args()

    partners = load_from_csv(args.csv) if args.csv else list(DEFAULT_PARTNERS)
    if not partners:
        raise SystemExit('생성할 업체가 없습니다.')

    args.out.mkdir(parents=True, exist_ok=True)
    manifest = args.out / 'links.csv'
    with manifest.open('w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['companyId', 'name', 'url', 'file'])
        for company_id, name in partners:
            url = booking_url(company_id)
            filename = f'{safe_filename(name, company_id)}.png'
            path = args.out / filename
            make_qr(url, path, box_size=args.box_size)
            writer.writerow([company_id, name, url, filename])
            print(f'✓ {filename}')
            print(f'  {url}')

    print(f'\n완료: {args.out}')
    print(f'목록: {manifest}')


if __name__ == '__main__':
    main()
