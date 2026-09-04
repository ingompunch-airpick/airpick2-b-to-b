#!/usr/bin/env python3
"""에어픽 파트너 앱 아이콘·스플래시 생성기.

public/brand/airpick-logo-3d.png (투명 배경 3D 골드 캐리어)를 브랜드
배경색 위에 올려 Android 런처 아이콘·스플래시·PWA 아이콘을 만든다.

사용법:  python3 scripts/generate-app-icons.py

로고를 더 높은 해상도로 교체하려면 LOGO 파일만 바꾸면 되고,
색·여백을 바꾸려면 BG / *_RATIO 상수만 수정하면 된다.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public/brand/airpick-logo-3d.png"
RES = ROOT / "android/app/src/main/res"

# 브랜드 시트의 앱 아이콘과 동일한 배경 — 앱 테마(#09090B)와도 일치해
# 시스템 스플래시 → Capacitor 스플래시 → 앱 화면 사이에 색이 튀지 않는다.
BG = (9, 9, 11)  # #09090B

# 밀도별 (런처 아이콘 px, adaptive foreground 캔버스 px)
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# 런처 아이콘에서 로고가 차지할 비율
LAUNCHER_LOGO_RATIO = 0.66
# adaptive icon 안전 영역(66/108) 안에 들어가도록
FOREGROUND_LOGO_RATIO = 0.55
# 스플래시에서 화면 짧은 변 대비 로고 비율
SPLASH_LOGO_RATIO = 0.28

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


def load_logo() -> Image.Image:
    if not LOGO.exists():
        raise SystemExit(f"로고 파일이 없습니다: {LOGO}")
    logo = Image.open(LOGO).convert("RGBA")
    bbox = logo.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    return logo.crop(bbox) if bbox else logo


def fit(logo: Image.Image, target_px: int) -> Image.Image:
    """긴 변이 target_px 가 되도록 비율 유지 리사이즈."""
    lw, lh = logo.size
    scale = target_px / max(lw, lh)
    return logo.resize(
        (max(1, round(lw * scale)), max(1, round(lh * scale))), Image.LANCZOS
    )


def compose(logo: Image.Image, size, logo_px: int, bg) -> Image.Image:
    w, h = (size, size) if isinstance(size, int) else size
    canvas = Image.new("RGBA", (w, h), bg)
    placed = fit(logo, logo_px)
    canvas.alpha_composite(placed, ((w - placed.size[0]) // 2, (h - placed.size[1]) // 2))
    return canvas


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


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"  {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}")


def main() -> None:
    logo = load_logo()
    print(f"원본 로고: {logo.size[0]}x{logo.size[1]}\n")

    print("Android 런처 아이콘")
    for density, (launcher_px, fg_px) in DENSITIES.items():
        # 4배로 그린 뒤 축소해 계단 현상을 줄인다.
        big = launcher_px * 4
        base = compose(logo, big, int(big * LAUNCHER_LOGO_RATIO), BG + (255,)).resize(
            (launcher_px, launcher_px), Image.LANCZOS
        )

        square = base.copy()
        square.putalpha(rounded_mask(launcher_px, 0.22))
        save(square, RES / f"mipmap-{density}/ic_launcher.png")

        rounded = base.copy()
        rounded.putalpha(circle_mask(launcher_px))
        save(rounded, RES / f"mipmap-{density}/ic_launcher_round.png")

        # adaptive foreground — 배경은 @color/ic_launcher_background 가 담당
        save(
            compose(logo, fg_px, int(fg_px * FOREGROUND_LOGO_RATIO), (0, 0, 0, 0)),
            RES / f"mipmap-{density}/ic_launcher_foreground.png",
        )

    print("Capacitor 스플래시")
    for folder, (sw, sh) in SPLASH_TARGETS.items():
        save(
            compose(logo, (sw, sh), int(min(sw, sh) * SPLASH_LOGO_RATIO), BG + (255,)),
            RES / folder / "splash.png",
        )

    print("Play Store / PWA 아이콘")
    # Play Store 등록용은 투명도 없는 512 정사각형
    store = compose(logo, 1024, int(1024 * LAUNCHER_LOGO_RATIO), BG + (255,)).resize(
        (512, 512), Image.LANCZOS
    )
    save(store, ROOT / "public/brand/airpick-store-icon-512.png")

    for size in (192, 512):
        icon = compose(
            logo, size * 2, int(size * 2 * LAUNCHER_LOGO_RATIO), BG + (255,)
        ).resize((size, size), Image.LANCZOS)
        icon.putalpha(rounded_mask(size, 0.22))
        save(icon, ROOT / f"public/icon-{size}-v2.png")

    print(
        f"\n완료. values/ic_launcher_background.xml 배경색이 "
        f"#{BG[0]:02X}{BG[1]:02X}{BG[2]:02X} 인지 확인하세요."
    )


if __name__ == "__main__":
    main()
