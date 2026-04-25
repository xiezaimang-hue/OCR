"""Generate simple placeholder icons for the extension."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Main brand color (Google Blue) + accent
BG = (26, 115, 232)  # #1A73E8
FG = (255, 255, 255)
ACCENT = (251, 188, 4)  # #FBBC04


def draw_icon(size: int, path: str):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded-square background
    radius = max(2, int(size * 0.22))
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=BG)

    # Magnifier circle (upper-left area)
    pad = int(size * 0.18)
    circle_d = int(size * 0.46)
    cx0, cy0 = pad, pad
    d.ellipse([(cx0, cy0), (cx0 + circle_d, cy0 + circle_d)],
              outline=FG, width=max(2, int(size * 0.08)))

    # Magnifier handle
    line_w = max(2, int(size * 0.08))
    hx0 = cx0 + int(circle_d * 0.78)
    hy0 = cy0 + int(circle_d * 0.78)
    hx1 = int(size * 0.82)
    hy1 = int(size * 0.82)
    d.line([(hx0, hy0), (hx1, hy1)], fill=FG, width=line_w)

    # Dot inside glass (an "A" text if size allows)
    if size >= 48:
        try:
            font_size = int(circle_d * 0.55)
            try:
                font = ImageFont.truetype(
                    "/System/Library/Fonts/Helvetica.ttc", font_size)
            except Exception:
                font = ImageFont.load_default()
            text = "A"
            bbox = d.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            tx = cx0 + (circle_d - tw) // 2 - bbox[0]
            ty = cy0 + (circle_d - th) // 2 - bbox[1]
            d.text((tx, ty), text, fill=ACCENT, font=font)
        except Exception:
            pass
    else:
        # Small icon: just a dot
        inner = int(circle_d * 0.4)
        ix = cx0 + (circle_d - inner) // 2
        iy = cy0 + (circle_d - inner) // 2
        d.ellipse([(ix, iy), (ix + inner, iy + inner)], fill=ACCENT)

    img.save(path, "PNG")
    print(f"  wrote {path}")


if __name__ == "__main__":
    for size in (16, 32, 48, 128):
        draw_icon(size, os.path.join(OUT_DIR, f"icon{size}.png"))
    print("Done.")
