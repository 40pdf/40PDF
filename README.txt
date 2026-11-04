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
  Code is formatted with Prettier (.prettierrc.json, 2 spaces). Edit the .html files directly (the old build scripts are not part of this package, do not regenerate over these files).
  Colors: style.css, top of the file (:root). The CSS is INLINED in every page (so Google always sees it).
  After editing style.css run:   python inline-css.py   (the inline <style> is kept on one line on purpose: <!-- prettier-ignore -->)

HOST: www.40pdf.com is the one official address. 40pdf.com 301-redirects to it.
If you use Vercel/Netlify/Cloudflare, ALSO set the domain redirect in the dashboard (non-www -> www).
Search Console: add a Domain property for 40pdf.com, submit https://www.40pdf.com/sitemap.xml
CONTACT EMAIL: 40pdftools@gmail.com

SITEMAP (auto)
  After you add or edit any page, run:   python update-sitemap.py
  It rebuilds a simple sitemap.xml (loc + changefreq daily), then upload sitemap.xml.

ICONS / LOGO (clean URLs, no ?v= query strings)
  /favicon.ico  /favicon.png (48px)  /favicon-16x16.png  /favicon-32x32.png  /favicon-48x48.png  /favicon-96x96.png
  /apple-touch-icon.png (180px)  /apple-touch-icon-precomposed.png
  /android-chrome-192x192.png  /android-chrome-512x512.png  /maskable-icon-512x512.png  (listed in /site.webmanifest)
  /mstile-150x150.png + /browserconfig.xml (Windows tiles)
  /logo.png (512px, used as the logo in Organization / BlogPosting schema)
  icon-192.webp = header logo.  To change the logo later, keep the same file names and re-upload; icons are cached 7 days.
  JS/CSS are cached 1 day (must-revalidate) because the files no longer carry ?v=.
  social-image.jpg = link-preview image (1200x630) with the logo
