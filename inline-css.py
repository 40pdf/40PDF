"""Re-inline style.css into every page.  Run after you edit style.css:   python inline-css.py
(Google's URL-Inspection tool sometimes fails to load external CSS, so the CSS lives inside each page.)"""
import re, glob
css = open('style.css', encoding='utf-8').read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css = re.sub(r'\s+', ' ', css)
css = re.sub(r'\s*([{};])\s*', r'\1', css).strip()
block = '<style id="inline-css">' + css + '</style>'
pat = re.compile(r'<style id="inline-css">.*?</style>', re.S)
n = 0
for p in glob.glob('*.html') + glob.glob('blog/*.html'):
    h = open(p, encoding='utf-8').read()
    new = pat.sub(lambda m: block, h)
    if new != h:
        open(p, 'w', encoding='utf-8').write(new); n += 1
print('updated', n, 'pages')
