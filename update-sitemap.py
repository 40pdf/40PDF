#!/usr/bin/env python3
"""Rebuild the 40PDF XML sitemap from indexable HTML pages."""
import os, re, glob
from datetime import datetime

BASE = "https://www.40pdf.com"
SKIP = {"404.html", "tool.html"}
SMALL = {"about", "contact", "privacy", "terms"}
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def indexable(path):
    with open(path, encoding="utf-8") as f:
        html = f.read()
    return not re.search(r'<meta[^>]+name="robots"[^>]+content="[^"]*noindex', html, re.I)

def lastmod(path):
    return datetime.fromtimestamp(os.path.getmtime(path)).date().isoformat()

pages = [p for p in glob.glob("*.html") if p not in SKIP and indexable(p)]
blog_pages = [p for p in glob.glob("blog/*.html") if indexable(p)]

def page_url(path):
    return BASE + "/" if path == "index.html" else BASE + "/" + path[:-5]

ordered = [p for p in ("index.html", "tools.html", "blog.html") if p in pages]
ordered += sorted(blog_pages)
ordered += sorted(p for p in pages if p not in {"index.html", "tools.html", "blog.html"})

entries = []
for path in ordered:
    if path == "index.html":
        freq, priority = "weekly", "1.0"
    elif path == "tools.html":
        freq, priority = "weekly", "0.9"
    elif path == "blog.html":
        freq, priority = "weekly", "0.7"
    elif path.startswith("blog/"):
        freq, priority = "monthly", "0.6"
    elif path[:-5] in SMALL:
        freq, priority = "yearly", "0.3"
    else:
        freq, priority = "monthly", "0.9"
    entries.append((page_url(path), lastmod(path), freq, priority))

out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for url, modified, freq, priority in entries:
    out += ["  <url>", f"    <loc>{url}</loc>", f"    <lastmod>{modified}</lastmod>",
            f"    <changefreq>{freq}</changefreq>", f"    <priority>{priority}</priority>", "  </url>"]
out.append("</urlset>")
with open("sitemap.xml", "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(out) + "\n")
print("sitemap.xml updated:", len(entries), "URLs")
