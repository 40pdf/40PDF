#!/usr/bin/env python3
"""Rebuild sitemap.xml (simple format: <loc> + <changefreq>daily</changefreq> only).

Usage (run inside the site folder):   python update-sitemap.py
Order: home, tools, blog, blog posts (A-Z), then all other pages (A-Z).
404.html, tool.html and any page with a noindex tag are skipped.
"""
import os, re, glob

BASE = "https://www.40pdf.com"
SKIP = {"404.html", "tool.html"}
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def indexable(path):
    html = open(path, encoding="utf-8").read()
    return not re.search(r'<meta[^>]+name="robots"[^>]+noindex', html, re.I)

pages = [p for p in glob.glob("*.html") if p not in SKIP and indexable(p)]
slugs = sorted(p[:-5] for p in pages)
posts = sorted("blog/" + os.path.basename(p)[:-5] for p in glob.glob("blog/*.html") if indexable(p))
head = ["", "tools", "blog"]
rest = [s for s in slugs if s not in ("index", "tools", "blog")]
urls = [f"{BASE}/{s}" if s else f"{BASE}/" for s in head] + [f"{BASE}/{s}" for s in posts + rest]

out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    out += ["<url>", f"<loc>{u}</loc>", "<changefreq>daily</changefreq>", "</url>"]
out.append("</urlset>")
open("sitemap.xml", "w", encoding="utf-8").write("\n".join(out) + "\n")
print("sitemap.xml updated:", len(urls), "URLs")
