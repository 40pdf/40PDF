40PDF - updated site
====================
URLs (no .html, no ?query, no #hash)
  /                 home            /tools            all tools
  /merge-pdf  /split-pdf ... (29 tool pages, one real page each)
  /blog             blog list       /blog/how-to-merge-pdf-files ... (14 articles)
  /about /contact /privacy /terms

UPLOAD
  Upload EVERYTHING in this folder to the web root (public_html), including the hidden file .htaccess.
  - Apache / LiteSpeed / cPanel hosting: .htaccess does the clean URLs + 301 redirects from old links.
  - Cloudflare Pages / Netlify: _redirects and _headers are used, clean URLs work automatically.
  - Vercel: vercel.json is used.
  - Nginx: add   location / { try_files $uri $uri.html $uri/ =404; }
  Test on the server. Links start with "/", so double-clicking the files on a PC will not show styles.

AFTER UPLOAD
  1. Search Console > Sitemaps > submit https://www.40pdf.com/sitemap.xml
  2. URL Inspection > request indexing for /, /tools, /merge-pdf, /compress-pdf
  3. Old links (tool.html?t=..., blog.html?p=...) 301-redirect to the new URLs.

EDITING
  Edit the .html files directly (the old build scripts are not part of this package, do not regenerate over these files).
  Colors: style.css, top of the file (:root).

HOST: www.40pdf.com is the one official address. 40pdf.com 301-redirects to it.
If you use Vercel/Netlify/Cloudflare, ALSO set the domain redirect in the dashboard (non-www -> www).
Search Console: add a Domain property for 40pdf.com, submit https://www.40pdf.com/sitemap.xml
CONTACT EMAIL: 40pdftools@gmail.com

SITEMAP (auto)
  After you add or edit any page, run:   python update-sitemap.py
  It rebuilds sitemap.xml from all .html files (dates + images), then upload sitemap.xml.

ICONS / LOGO
  favicon.ico, favicon-48.png, icon-192.png, icon-512.png = round logo (transparent corners)
  apple-touch-icon.png = 180x180 full square, no transparency (no white corners on iPhone)
  social-image.jpg = link-preview image (1200x630) with the logo
