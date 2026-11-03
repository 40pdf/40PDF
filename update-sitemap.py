#!/usr/bin/env python3
"""Rebuild sitemap.xml automatically from the .html files in this folder.

Usage (run inside the site folder, on your PC):
    python update-sitemap.py

- Every page is found automatically (root pages + /blog/*). 404.html, tool.html and
  any page with a noindex tag are skipped.
- <lastmod> = the date the .html file was last edited (so edit a page, run this, upload).
- <image:loc> = the page's own og:image (the logo / social image).
- Add a new page or blog post = just run the script again.
"""
import os, re, glob, datetime

BASE = "https://www.40pdf.com"
SKIP = {"404.html", "tool.html"}
here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

HOME = ["index.html", "tools.html"]
SMALL = {"about.html", "contact.html", "privacy.html", "terms.html"}

def info(path):
    html = open(path, encoding="utf-8").read()
    if re.search(r'<meta[^>]+name="robots"[^>]+noindex', html, re.I):
        return None
    m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    return m.group(1) if m else None

def url_for(path):
    p = path.replace("\\", "/")
    if p == "index.html":
        return BASE + "/"
    return BASE + "/" + p[:-5]

def meta(path):
    p = path.replace("\\", "/")
    if p == "index.html":      return "1.0", "weekly"
    if p in ("tools.html",):   return "0.9", "weekly"
    if p == "blog.html":       return "0.7", "weekly"
    if p.startswith("blog/"):  return "0.6", "monthly"
    if p in SMALL:             return "0.3", "yearly"
    return "0.9", "monthly"

pages = [f for f in glob.glob("*.html") if f not in SKIP] + glob.glob("blog/*.html")
def sort_key(p):
    p = p.replace("\\", "/")
    group = 0 if p in HOME else (2 if p.startswith("blog") else (3 if p in SMALL else 1))
    return (group, HOME.index(p) if p in HOME else 0, p)

out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
n = 0
for p in sorted(pages, key=sort_key):
    img = info(p)
    html = open(p, encoding="utf-8").read()
    if re.search(r'<meta[^>]+name="robots"[^>]+noindex', html, re.I):
        continue
    last = datetime.date.fromtimestamp(os.path.getmtime(p)).isoformat()
    pr, cf = meta(p)
    out.append("  <url>")
    out.append(f"    <loc>{url_for(p)}</loc>")
    out.append(f"    <lastmod>{last}</lastmod>")
    out.append(f"    <changefreq>{cf}</changefreq>")
    out.append(f"    <priority>{pr}</priority>")
    if img:
        out.append(f"    <image:image><image:loc>{img}</image:loc></image:image>")
    out.append("  </url>")
    n += 1
out.append("</urlset>")
open("sitemap.xml", "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"sitemap.xml updated: {n} URLs")
