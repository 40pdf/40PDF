import os
import glob
import re
import html

BASE = "https://www.40pdf.com"
SKIP = {"404.html", "tool.html"}

os.chdir(os.path.dirname(os.path.abspath(__file__)))

pages = [
    p for p in glob.glob("*.html") if p not in SKIP
] + glob.glob("blog/*.html")

pages = sorted(set(pages), key=lambda p: (
    0 if p == "index.html" else
    1 if p == "tools.html" else
    2 if p.startswith("blog") else 3,
    p
))

out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
]

count = 0

for page in pages:
    with open(page, encoding="utf-8") as f:
        content = f.read()

    if re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'][^"\']*noindex', content, re.I):
        continue

    path = page.replace("\\", "/")
    url = BASE + "/" if path == "index.html" else BASE + "/" + path[:-5]

    out.extend([
        "  <url>",
        f"    <loc>{html.escape(url)}</loc>",
        "    <changefreq>daily</changefreq>",
        "  </url>"
    ])
    count += 1

out.append("</urlset>")

with open("sitemap.xml", "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")

print(f"Simple sitemap generated: {count} URLs")
