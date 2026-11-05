"""Section headers for the README: a wide strip of asciigraph's own ASCII
output (a different scene per section, strips/*.webp, rendered at 2400x320
with ?width=2400&height=320&focus=...), darkened from the left so the title
reads over it. The strip is embedded, since an SVG shown as an image can't
load anything from outside itself.
Run from the repo root: python3 assets/readme/source/sections.py"""
import base64, pathlib

W, H, R = 1200, 160, 18
SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
here = pathlib.Path(__file__).resolve().parent

def header(strip, num, total, title, sub):
    data = base64.b64encode((here / 'strips' / f'{strip}.webp').read_bytes()).decode()
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">
  <title id="t">{title}</title>
  <desc id="d">{sub}</desc>
  <defs>
    <clipPath id="c"><rect width="{W}" height="{H}" rx="{R}"/></clipPath>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#050b0d" stop-opacity="0.92"/>
      <stop offset="0.32" stop-color="#050b0d" stop-opacity="0.72"/>
      <stop offset="0.62" stop-color="#050b0d" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#050b0d" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#c)">
    <image width="{W}" height="{H}" preserveAspectRatio="xMidYMid slice" href="data:image/webp;base64,{data}"/>
    <rect width="{W}" height="{H}" fill="url(#fade)"/>
  </g>
  <rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="{R - 0.5}" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
  <text x="52" y="52" font-family="{MONO}" font-size="14" letter-spacing="3" fill="#ffffff" fill-opacity="0.62">{num}<tspan fill-opacity="0.38"> / {total}</tspan></text>
  <text x="50" y="100" font-family="{SANS}" font-size="44" font-weight="700" fill="#ffffff">{title}</text>
  <text x="52" y="132" font-family="{SANS}" font-size="19" fill="#ffffff" fill-opacity="0.78">{sub}</text>
</svg>
'''

SECTIONS = {
    'en': [('What it does', 'One photo in, a seamless loop out'),
           ('How it reads a photo', 'Water, sand, sky and grass each move their own way'),
           ('Gallery', 'A few photos, brought to life'),
           ('Get started', 'Run it yourself, or hand it to Claude Code')],
    'zh': [('它做什么', '一张照片进去，一段无缝循环出来'),
           ('它怎么看一张照片', '水、沙、天空、草，各按各的方式动'),
           ('作品', '几张照片，动起来之后'),
           ('开始使用', '自己跑，或者交给 Claude Code')],
}
STRIPS = ['what', 'how', 'gallery', 'start']
root = here.parent
for lang, rows in SECTIONS.items():
    (root / lang).mkdir(exist_ok=True)
    for k, (strip, (title, sub)) in enumerate(zip(STRIPS, rows)):
        (root / lang / f'section-{strip}.svg').write_text(header(strip, f'0{k + 1}', f'0{len(rows)}', title, sub))
print('ok')
