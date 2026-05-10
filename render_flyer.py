from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output" / "govai-ai-camps-flyer.png"
W, H = 1080, 1920

INK = (23, 23, 23)
PAPER = (247, 243, 234)
LINE = (216, 208, 193)
MUTED = (91, 97, 104)
WHITE = (255, 250, 240)
RED = (215, 68, 62)
BLUE = (36, 106, 143)
GREEN = (59, 122, 87)
GOLD = (179, 117, 33)

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
REG = FONT_DIR / "Arial.ttf"
BOLD = FONT_DIR / "Arial Bold.ttf"
BLACK = FONT_DIR / "Arial Black.ttf"


def font(path, size):
    return ImageFont.truetype(str(path), size)


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw, text, fnt, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if text_size(draw, trial, fnt)[0] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def multiline(draw, xy, text, fnt, fill, max_width, leading=1.12):
    x, y = xy
    for line in wrap(draw, text, fnt, max_width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += int(fnt.size * leading)
    return y


def cover_crop(path, size, focus_y=0.28):
    img = Image.open(path).convert("RGB")
    target_w, target_h = size
    scale = max(target_w / img.width, target_h / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - target_w) // 2)
    top = int(max(0, min(resized.height - target_h, resized.height * focus_y - target_h * 0.35)))
    return resized.crop((left, top, left + target_w, top + target_h))


def rect(draw, box, fill, outline=INK, width=3):
    draw.rectangle(box, fill=fill, outline=outline, width=width)


def draw_tag(draw, x, y, text):
    f = font(BLACK, 22)
    tw, th = text_size(draw, text, f)
    rect(draw, (x, y, x + tw + 30, y + 42), fill=INK, outline=INK, width=0)
    draw.text((x + 15, y + 8), text, font=f, fill=(255, 255, 255))


def draw_card(base, x, y, img_name, name, tag, thesis, body, accent, focus):
    draw = ImageDraw.Draw(base)
    cw, ch = 456, 520
    draw.rectangle((x + 10, y + 10, x + cw + 10, y + ch + 10), fill=(23, 23, 23, 40))
    rect(draw, (x, y, x + cw, y + ch), fill=WHITE)

    photo_h = 282
    photo = cover_crop(ROOT / "assets" / img_name, (cw - 6, photo_h - 3), focus)
    photo = ImageOps.grayscale(photo).convert("RGB")
    photo = ImageOps.autocontrast(photo, cutoff=1)
    base.paste(photo, (x + 3, y + 3))
    draw.line((x, y + photo_h, x + cw, y + photo_h), fill=INK, width=3)
    draw_tag(draw, x + 18, y + photo_h - 58, tag)

    name_f = font(BLACK, 36)
    thesis_f = font(BLACK, 31)
    body_f = font(BOLD, 22)
    tx = x + 24
    ty = y + photo_h + 24
    draw.text((tx, ty), name, font=name_f, fill=INK)
    ty += 52
    ty = multiline(draw, (tx, ty), thesis, thesis_f, accent, cw - 48, leading=1.04) + 8
    multiline(draw, (tx, ty), body, body_f, MUTED, cw - 48, leading=1.17)


def main():
    base = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(base)

    for gx in range(0, W, 54):
        draw.line((gx, 0, gx, H), fill=(232, 225, 211), width=1)
    for gy in range(0, H, 54):
        draw.line((0, gy, W, gy), fill=(232, 225, 211), width=1)

    x0 = 64
    top_y = 68
    rect(draw, (x0, top_y, x0 + 42, top_y + 42), fill=(255, 255, 255), width=3)
    draw.text((x0 + 10, top_y + 4), "G", font=font(BLACK, 22), fill=INK)
    draw.text((x0 + 56, top_y + 6), "GovAI.fm", font=font(BLACK, 26), fill=INK)
    ws = "WEB SUMMIT"
    draw.text((W - 64 - text_size(draw, ws, font(BLACK, 26))[0], top_y + 6), ws, font=font(BLACK, 26), fill=INK)
    draw.line((64, 132, W - 64, 132), fill=INK, width=3)

    h1 = font(BLACK, 94)
    y = 194
    for line in ["WHICH AI CAMP", "ARE YOU IN?"]:
        draw.text((64, y), line, font=h1, fill=INK)
        y += 88

    sub = "Is the revolution already here, mostly hype, waiting for a new architecture, or risky enough to slow down?"
    multiline(draw, (64, 392), sub, font(BOLD, 38), (43, 43, 43), 900, leading=1.16)

    cards = [
        ("dario.jpg", "Dario", "DIFFUSION", "The tech is basically here.", "The bottleneck is whether institutions, markets, and governments absorb it fast enough.", RED, 0.24),
        ("gary.jpg", "Gary", "OVERHYPE", "LLMs hit a ceiling.", "Useful for coding and demos, but brittle without reasoning, world models, or neuro-symbolic systems.", BLUE, 0.23),
        ("yann.jpg", "Yann", "ARCHITECTURE", "LLMs are not the endgame.", "Better neural systems, world models, and JEPA-style architectures are the path to real intelligence.", GREEN, 0.18),
        ("hinton.jpg", "Hinton", "RISK", "Capabilities are real enough to scare us.", "The issue is not just productivity. It is control, misuse, and whether we should slow the race.", GOLD, 0.28),
    ]

    draw_card(base, 64, 560, *cards[0])
    draw_card(base, 560, 560, *cards[1])
    draw_card(base, 64, 1104, *cards[2])
    draw_card(base, 560, 1104, *cards[3])

    closer_y = 1676
    rect(draw, (64, closer_y, W - 64, closer_y + 150), fill=INK, outline=INK, width=3)
    close_f = font(BLACK, 36)
    side_f = font(BOLD, 22)
    multiline(draw, (98, closer_y + 32), "Pick one. Then tell me: what would make you switch camps?", close_f, (255, 255, 255), 650, leading=1.04)
    multiline(draw, (778, closer_y + 34), "A GovAI.fm field question for builders, regulators, investors, and skeptics.", side_f, (244, 221, 174), 228, leading=1.12)

    draw.line((64, 1852, W - 64, 1852), fill=LINE, width=2)
    credits = (
        "Shorthand based on Anthropic/Dario Amodei, Gary Marcus, Meta AI/Yann LeCun JEPA work, and Geoffrey Hinton AI risk commentary. "
        "Portraits: TechCrunch, Web Summit, DATAIA, Nobel Prize Outreach via Wikimedia Commons."
    )
    multiline(draw, (64, 1870), credits, font(BOLD, 17), (111, 103, 90), 952, leading=1.18)

    OUT.parent.mkdir(exist_ok=True)
    base.save(OUT, quality=95)
    print(OUT)


if __name__ == "__main__":
    main()
