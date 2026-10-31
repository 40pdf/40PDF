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
  1. Search Console > Sitemaps > submit https://40pdf.com/sitemap.xml
  2. URL Inspection > request indexing for /, /tools, /merge-pdf, /compress-pdf
  3. Old links (tool.html?t=..., blog.html?p=...) 301-redirect to the new URLs.

EDITING
  Text for each tool/blog lives in the build folder (c_*.py, b_part*.py). Run: python3 build.py && python3 make_images.py
  Colors: style.css, top of the file (:root).
