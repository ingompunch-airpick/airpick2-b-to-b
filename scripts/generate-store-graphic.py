#!/usr/bin/env python3
"""Play Store 그래픽 이미지(1024x500) 생성기.

앱 아이콘과 같은 3D 골드 로고·배경색을 써서 스토어 등록정보의
'그래픽 이미지' 규격에 맞는 애셋을 만든다.

사용법:  python3 scripts/generate-store-graphic.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public/brand/airpick-logo-3d.png"
OUT = ROOT / "public/brand/airpick-feature-graphic-1024x500.png"

W, H = 1024, 500
BG = (9, 9, 11)
GOLD_LIGHT = (240, 214, 130)
GOLD = (212, 175, 55)  # #D4AF37 프리미엄 골드
GOLD_DEEP = (166, 124, 0)  # #A67C00 딥 골드

FUTURA = "/System/Library/Fonts/Supplemental/Futura.ttc"
SD_GOTHIC = "/System/Library/Fonts/AppleSDGothicNeo.ttc"


def gold_text(size, text, font, tracking=0, top=GOLD_LIGHT, bottom=GOLD_DEEP):
    """세로 골드 그라데이션이 채워진 텍스트 레이어를 만든다."""
    w, h = size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    x = 0
    for ch in text:
        draw.text((x, 0), ch, font=font, fill=255)
        x += draw.textlength(ch, font=font) + tracking

    grad = Image.new("RGB", (w, h))
    gd = ImageDraw.Draw(grad)
    for y in range(h):
        t = y / max(1, h - 1)
        gd.line(
            [(0, y), (w, y)],
            fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )

    layer = grad.convert("RGBA")
    layer.putalpha(mask)
    bbox = mask.getbbox()
    return layer.crop(bbox) if bbox else layer


def text_width(text, font, tracking=0):
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    return sum(d.textlength(c, font=font) + tracking for c in text) - tracking


def main() -> None:
    canvas = Image.new("RGBA", (W, H), BG + (255,))

    # 로고 뒤에 아주 옅은 금색 글로우 — 평면적으로 보이지 않게만 최소한으로
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = 285, H // 2
    for r in range(300, 0, -6):
        a = int(16 * (1 - r / 300) ** 2)
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD_DEEP + (a,))
    canvas.alpha_composite(glow)

    # 로고 — 왼쪽, 세로 중앙
    logo = Image.open(LOGO).convert("RGBA")
    lh = 340
    logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
    canvas.alpha_composite(logo, (cx - logo.width // 2, (H - lh) // 2))

    # 오른쪽 텍스트 블록
    tx = 470
    f_title = ImageFont.truetype(FUTURA, 92, index=2)  # Futura Bold
    f_sub = ImageFont.truetype(FUTURA, 26, index=0)  # Futura Medium
    f_kr = ImageFont.truetype(SD_GOTHIC, 30, index=4)  # SD Gothic SemiBold

    title = gold_text((760, 150), "AIRPICK", f_title, tracking=6)
    canvas.alpha_composite(title, (tx, 150))

    # 구분선 + PARTNERS
    line_y = 150 + title.height + 26
    d = ImageDraw.Draw(canvas)
    sub_text = "PARTNERS"
    sub = gold_text((520, 60), sub_text, f_sub, tracking=9, top=GOLD, bottom=GOLD)
    sub_w = sub.width
    gap = 16
    line_len = 74
    d.line(
        [(tx, line_y + sub.height // 2), (tx + line_len, line_y + sub.height // 2)],
        fill=GOLD_DEEP + (255,),
        width=2,
    )
    canvas.alpha_composite(sub, (tx + line_len + gap, line_y))
    d.line(
        [
            (tx + line_len + gap + sub_w + gap, line_y + sub.height // 2),
            (tx + line_len + gap + sub_w + gap + line_len, line_y + sub.height // 2),
        ],
        fill=GOLD_DEEP + (255,),
        width=2,
    )

    # 한글 설명 한 줄
    kr = "제휴 업장 주차대행 관리"
    kr_layer = gold_text((760, 60), kr, f_kr, top=(228, 228, 231), bottom=(161, 161, 170))
    canvas.alpha_composite(kr_layer, (tx + 2, line_y + sub.height + 30))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUT, "PNG")
    kb = OUT.stat().st_size / 1024
    print(f"{OUT.relative_to(ROOT)}  {W}x{H}  {kb:.1f}KB")
    print(f"제목 폭 {title.width}px / 우측 여백 {W - (tx + title.width)}px")


if __name__ == "__main__":
    main()
