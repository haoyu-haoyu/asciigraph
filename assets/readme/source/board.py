"""The 'how it reads a photo' strip: the photo, the regions it finds, the
scene moving, and the ASCII layer. Panels come from the page itself (see the
frame tags below); run from the repo root after capturing them."""
from PIL import Image, ImageDraw, ImageFont
import pathlib

root = pathlib.Path(__file__).resolve().parents[3]
out = root / 'assets' / 'readme'
PW, PH, GAP, CAP = 360, 540, 18, 64
BG, TXT, SUB = (11, 21, 25), (238, 243, 241), (143, 169, 166)
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'

def fit(im):
    # centre-crop to the panel's shape, then scale
    r = PW / PH; w, h = im.size
    if w / h > r: nw = int(h * r); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = int(w / r); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((PW, PH), Image.LANCZOS)

panels = [
    fit(Image.open(root / 'input' / 'coast-sky.png').convert('RGB')),
    fit(Image.open(root / 'out' / 'panel-regions' / 'f_0000.png').convert('RGB')),
    fit(Image.open(root / 'out' / 'panel-flow' / 'f_0000.png').convert('RGB')),
    fit(Image.open(root / 'out' / 'panel-ascii' / 'f_0000.png').convert('RGB')),
]
LABELS = {
    'en': [('The photo', 'one still image'), ('What it sees', 'blue: sky  ·  red: stays still'), ('Moving', 'waves roll in, clouds drift'), ('ASCII', 'every stroke follows the motion')],
    'zh': [('原图', '一张静态照片'), ('它看到的', '蓝色：天空 · 红色：保持不动'), ('动起来', '浪往岸上涌，云在飘'), ('ASCII', '每一笔都顺着运动的方向')],
}
for lang, labels in LABELS.items():
    W = 4 * PW + 5 * GAP; H = GAP + PH + CAP
    sheet = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(sheet)
    big, small = ImageFont.truetype(FONT, 22), ImageFont.truetype(FONT, 16)
    for k, (im, (title, sub)) in enumerate(zip(panels, labels)):
        x = GAP + k * (PW + GAP)
        sheet.paste(im, (x, GAP))
        d.text((x + 2, GAP + PH + 12), title, fill=TXT, font=big)
        d.text((x + 2, GAP + PH + 40), sub, fill=SUB, font=small)
        if k < 3:   # a small chevron in the gap
            cx, cy = x + PW + GAP // 2, GAP + PH // 2
            d.line([(cx - 3, cy - 7), (cx + 3, cy), (cx - 3, cy + 7)], fill=(226, 196, 140), width=2)
    (out / lang).mkdir(exist_ok=True)
    sheet.save(out / lang / 'regions.webp', quality=90, method=6)
print('ok')
