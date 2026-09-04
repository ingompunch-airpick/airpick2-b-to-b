#!/usr/bin/env python3
"""에어픽 파트너 앱 아이콘·스플래시 생성기.

public/brand/airpick-icon-512.png (주황/크림 원본)의 형태를 그대로 쓰고
색만 네이비/골드로 치환해 Android 런처 아이콘·스플래시·PWA 아이콘을 만든다.

사용법:  python3 scripts/generate-app-icons.py
브랜드 색을 바꾸려면 BG / FG / SPLASH_BG 상수만 수정하면 된다.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public/brand/airpick-icon-512.png"
RES = ROOT / "android/app/src/main/res"

# 원본 아트워크의 두 기준색 (배경 크림 / 가방 주황)
SRC_BG = (255, 245, 235)
SRC_FG = (229, 100, 39)

# 목표 브랜드 색 — B2C 로고와 동일
BG = (17, 26, 45)      # #111A2D
FG = (231, 200, 126)   # #E7C87E

# 스플래시 배경은 앱 테마(#09090B)와 맞춰 실행 중 색 튐을 없앤다.
# capacitor.config.ts 의 SplashScreen.backgroundColor 및
# styles.xml 의 windowSplashScreenBackground 와 동일해야 한다.
SPLASH_BG = (9, 9, 11)  # #09090B

# Capacitor SplashScreen 플러그인이 이름으로 찾는 drawable 목록
SPLASH_TARGETS = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}

# 스플래시 로고가 화면 짧은 변에서 차지할 비율
SPLASH_LOGO_RATIO = 0.28

# 밀도별 (런처 아이콘 px, adaptive foreground 캔버스 px)
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# adaptive icon 안전 영역(66/108) 안에 로고를 배치할 비율
FOREGROUND_CONTENT_RATIO = 0.58


def orange_ratio(r: int, g: int, b: int) -> float:
    """픽셀이 크림(0)과 주황(1) 사이 어디에 있는지 — 안티에일리어싱 보존용."""
    axis = [SRC_FG[i] - SRC_BG[i] for i in range(3)]
    denom = sum(c * c for c in axis)
    if denom == 0:
        return 0.0
    t = sum((v - SRC_BG[i]) * axis[i] for i, v in enumerate((r, g, b))) / denom
    return max(0.0, min(1.0, t))


def load_source() -> Image.Image:
    if not SOURCE.exists():
        raise SystemExit(f"원본 아트워크가 없습니다: {SOURCE}")
    return Image.open(SOURCE).convert("RGBA")


def recolor(src: Image.Image, transparent_bg: bool) -> Image.Image:
    """크림→네이비, 주황→골드로 치환.

    transparent_bg=True 면 배경을 투명으로 남긴다(adaptive foreground 용).
    """
    out = Image.new("RGBA", src.size)
    src_px = src.load()
    out_px = out.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = src_px[x, y]
            if a == 0:
                continue
            t = orange_ratio(r, g, b)
            if transparent_bg:
                out_px[x, y] = (FG[0], FG[1], FG[2], int(round(a * t)))
            else:
                col = tuple(int(round(BG[i] + (FG[i] - BG[i]) * t)) for i in range(3))
                out_px[x, y] = (col[0], col[1], col[2], a)
    return out


def logo_bbox(fg: Image.Image) -> tuple[int, int, int, int]:
    """골드 로고의 실제 경계 — 안전 영역에 꽉 채우기 위해."""
    bbox = fg.split()[3].point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox is None:
        raise SystemExit("로고 영역을 찾지 못했습니다.")
    return bbox


def rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    return mask


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def full_bleed(fg_only: Image.Image, bbox, size: int, content_ratio: float) -> Image.Image:
    """네이비 정사각형 위에 골드 로고를 중앙 배치."""
    canvas = Image.new("RGBA", (size, size), BG + (255,))
    logo = fg_only.crop(bbox)
    target = max(1, int(round(size * content_ratio)))
    lw, lh = logo.size
    scale = target / max(lw, lh)
    logo = logo.resize((max(1, round(lw * scale)), max(1, round(lh * scale))), Image.LANCZOS)
    canvas.alpha_composite(logo, ((size - logo.size[0]) // 2, (size - logo.size[1]) // 2))
    return canvas


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"  {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}")


def main() -> None:
    src = load_source()
    fg_only = recolor(src, transparent_bg=True)
    bbox = logo_bbox(fg_only)

    print("Android 런처 아이콘")
    for density, (launcher_px, fg_px) in DENSITIES.items():
        base = full_bleed(fg_only, bbox, launcher_px * 4, 0.62).resize(
            (launcher_px, launcher_px), Image.LANCZOS
        )

        square = base.copy()
        square.putalpha(rounded_mask(launcher_px, 0.22))
        save(square, RES / f"mipmap-{density}/ic_launcher.png")

        rounded = base.copy()
        rounded.putalpha(circle_mask(launcher_px))
        save(rounded, RES / f"mipmap-{density}/ic_launcher_round.png")

        # adaptive foreground — 배경은 @color/ic_launcher_background 가 담당
        canvas = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
        logo = fg_only.crop(bbox)
        target = int(round(fg_px * FOREGROUND_CONTENT_RATIO))
        lw, lh = logo.size
        scale = target / max(lw, lh)
        logo = logo.resize((max(1, round(lw * scale)), max(1, round(lh * scale))), Image.LANCZOS)
        canvas.alpha_composite(
            logo, ((fg_px - logo.size[0]) // 2, (fg_px - logo.size[1]) // 2)
        )
        save(canvas, RES / f"mipmap-{density}/ic_launcher_foreground.png")

    print("Capacitor 스플래시")
    logo_src = fg_only.crop(bbox)
    for folder, (sw, sh) in SPLASH_TARGETS.items():
        canvas = Image.new("RGBA", (sw, sh), SPLASH_BG + (255,))
        target = max(1, int(round(min(sw, sh) * SPLASH_LOGO_RATIO)))
        lw, lh = logo_src.size
        scale = target / max(lw, lh)
        logo = logo_src.resize(
            (max(1, round(lw * scale)), max(1, round(lh * scale))), Image.LANCZOS
        )
        canvas.alpha_composite(
            logo, ((sw - logo.size[0]) // 2, (sh - logo.size[1]) // 2)
        )
        save(canvas, RES / folder / "splash.png")

    print("Play Store / PWA 아이콘")
    # Play Store 등록용은 투명도 없는 512 정사각형
    store = full_bleed(fg_only, bbox, 512, 0.62).convert("RGB")
    save(store.convert("RGBA"), ROOT / "public/brand/airpick-store-icon-512.png")

    for size in (192, 512):
        icon = full_bleed(fg_only, bbox, size * 2, 0.62).resize((size, size), Image.LANCZOS)
        icon.putalpha(rounded_mask(size, 0.22))
        save(icon, ROOT / f"public/icon-{size}-v2.png")

    print("\n완료. android/app/src/main/res/values/ic_launcher_background.xml 의")
    print(f"배경색이 #{BG[0]:02X}{BG[1]:02X}{BG[2]:02X} 인지 확인하세요.")


if __name__ == "__main__":
    main()
