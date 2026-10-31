/* 40PDF tool engine. Every tool page sets window.TOOL (its options) and loads this file. */
(function () {
  'use strict';
  var tool = window.TOOL;
  if (!tool) return;
  var minFiles = tool.minFiles || 1;
  function handoffOK() { try { var t = +sessionStorage.getItem('40pdf-h'); sessionStorage.removeItem('40pdf-h'); return !!t && Date.now() - t < 120000; } catch (e) { return false; } }

  /* ---------- helpers ---------- */
  var $ = function (s, el) { return (el || document).querySelector(s); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtSize(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB'; }
  function baseName(f) { return f.name.replace(/\.[^.]+$/, ''); }
  function pdfBlob(bytes) { return new Blob([bytes], { type: 'application/pdf' }); }
  function one(name, blob, note) { return { files: [{ name: name, blob: blob }], note: note || '' }; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------- load helper libraries from a CDN, only when needed ---------- */
  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
  var LIBS = {
    pdflib: CDN + 'pdf-lib/1.17.1/pdf-lib.min.js',
    pdfjs: CDN + 'pdf.js/3.11.174/pdf.min.js',
    jszip: CDN + 'jszip/3.10.1/jszip.min.js',
    jspdf: CDN + 'jspdf/2.5.1/jspdf.umd.min.js',
    html2canvas: CDN + 'html2canvas/1.4.1/html2canvas.min.js',
    xlsx: CDN + 'xlsx/0.18.5/xlsx.full.min.js'
  };
  var loaded = {};
  function loadScript(key) {
    if (!loaded[key]) {
      loaded[key] = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = LIBS[key];
        s.onload = res;
        s.onerror = function () { delete loaded[key]; rej(new Error('Could not load a helper file. Please check your internet connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return loaded[key];
  }
  async function PDFLIB() { await loadScript('pdflib'); return window.PDFLib; }
  async function PDFJS() {
    await loadScript('pdfjs');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.js/3.11.174/pdf.worker.min.js';
    return window.pdfjsLib;
  }
  async function JSZIP() { await loadScript('jszip'); return window.JSZip; }

  async function loadDoc(file, opts) {
    var L = await PDFLIB();
    var bytes = await file.arrayBuffer();
    try { return await L.PDFDocument.load(bytes, opts || {}); }
    catch (e) {
      if (/encrypt/i.test(e.message)) throw new Error('"' + file.name + '" is password-protected. Remove the protection first with the Unlock PDF tool.');
      throw new Error('Could not read "' + file.name + '". The file may be damaged. You can try the Repair PDF tool.');
    }
  }

  /* "1, 3, 5-8" -> [0,2,4,5,6,7]  (checks every number and gives a friendly error) */
  function parseRanges(str, total) {
    var out = [], seen = {};
    var parts = String(str || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) throw new Error('Please type at least one page number.');
    parts.forEach(function (p) {
      var m = p.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!m) throw new Error('"' + p + '" is not a valid page or range. Use something like 1, 3, 5-8.');
      var a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b) { var t = a; a = b; b = t; }
      if (a < 1 || b > total) throw new Error('Page ' + (a < 1 ? a : b) + ' does not exist. This PDF has ' + plural(total, 'page') + '.');
      for (var i = a; i <= b; i++) if (!seen[i]) { seen[i] = 1; out.push(i - 1); }
    });
    return out;
  }

  function pageRender(canvas, page, scale, fillWhite) {
    var vp = page.getViewport({ scale: scale });
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    var ctx = canvas.getContext('2d');
    if (fillWhite) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    return page.render({ canvasContext: ctx, viewport: vp }).promise;
  }
  function toBlob(canvas, type, q) {
    return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(new Error('Could not create the image. The page may be too large.')); }, type, q); });
  }
  function dataUrlToBytes(u) {
    var bin = atob(u.split(',')[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('Could not open the image "' + file.name + '".')); };
      im.src = u;
    });
  }
  /* put a tall canvas onto as many jsPDF pages as needed */
  function addCanvasPaged(pdf, canvas, margin, state) {
    var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    var w = pw - margin * 2, scale = w / canvas.width;
    var sliceH = Math.floor((ph - margin * 2) / scale), y = 0;
    while (y < canvas.height) {
      var h = Math.min(sliceH, canvas.height - y);
      var c = document.createElement('canvas'); c.width = canvas.width; c.height = h;
      var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, h);
      cx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (state.started) pdf.addPage();
      state.started = true;
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, w, h * scale);
      y += h;
    }
  }

  /* =====================================================================
     2) ENG: the PDF engines. Each one gets (files, values, ctx)
        and returns { files: [{name, blob}], note: 'optional message' }
     ===================================================================== */
  var ENG = {};

  ENG.merge = async function (files, v, ctx) {
    var L = await PDFLIB(), out = await L.PDFDocument.create();
    for (var i = 0; i < files.length; i++) {
      ctx.status('Adding file ' + (i + 1) + ' of ' + files.length + '…');
      var d = await loadDoc(files[i]);
      (await out.copyPages(d, d.getPageIndices())).forEach(function (p) { out.addPage(p); });
    }
    return one('merged.pdf', pdfBlob(await out.save()), 'Merged ' + plural(files.length, 'file') + ' into one PDF with ' + plural(out.getPageCount(), 'page') + '.');
  };

  ENG.split = async function (files, v, ctx) {
    var L = await PDFLIB(), f = files[0], src = await loadDoc(f), total = src.getPageCount(), outs = [];
    var groups = v.mode === 'ranges'
      ? String(v.ranges || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (g) { return parseRanges(g, total); })
      : src.getPageIndices().map(function (i) { return [i]; });
    if (!groups.length) throw new Error('Please type at least one page range, like 1-3, 4-6.');
    for (var g = 0; g < groups.length; g++) {
      ctx.status('Creating file ' + (g + 1) + ' of ' + groups.length + '…');
      var d = await L.PDFDocument.create();
      (await d.copyPages(src, groups[g])).forEach(function (p) { d.addPage(p); });
      var label = groups[g].length === 1 ? 'page-' + (groups[g][0] + 1) : 'pages-' + (groups[g][0] + 1) + '-to-' + (groups[g][groups[g].length - 1] + 1);
      outs.push({ name: baseName(f) + '-' + label + '.pdf', blob: pdfBlob(await d.save()) });
    }
    return { files: outs, zipName: baseName(f) + '-split.zip', note: 'Created ' + plural(outs.length, 'PDF') + '.' };
  };

  ENG.remove = async function (files, v) {
    var d = await loadDoc(files[0]), total = d.getPageCount(), del = parseRanges(v.pages, total);
    if (del.length >= total) throw new Error('You cannot remove every page. At least one must stay.');
    del.sort(function (a, b) { return b - a; }).forEach(function (i) { d.removePage(i); });
    return one(baseName(files[0]) + '-pages-removed.pdf', pdfBlob(await d.save()), 'Removed ' + plural(del.length, 'page') + '. The new PDF has ' + plural(d.getPageCount(), 'page') + '.');
  };

  ENG.extract = async function (files, v) {
    var L = await PDFLIB(), src = await loadDoc(files[0]), idx = parseRanges(v.pages, src.getPageCount());
    var d = await L.PDFDocument.create();
    (await d.copyPages(src, idx)).forEach(function (p) { d.addPage(p); });
    return one(baseName(files[0]) + '-selected-pages.pdf', pdfBlob(await d.save()), 'Your new PDF has ' + plural(idx.length, 'page') + '.');
  };

  ENG.rotate = async function (files, v) {
    var L = await PDFLIB(), d = await loadDoc(files[0]), total = d.getPageCount();
    var all = /^\s*(all)?\s*$/i.test(v.pages || '');
    var idx = all ? d.getPageIndices() : parseRanges(v.pages, total);
    idx.forEach(function (i) {
      var pg = d.getPage(i);
      pg.setRotation(L.degrees((((pg.getRotation().angle + (+v.angle)) % 360) + 360) % 360));
    });
    return one(baseName(files[0]) + '-rotated.pdf', pdfBlob(await d.save()), 'Rotated ' + plural(idx.length, 'page') + '.');
  };

  ENG.organize = async function (files, v) {
    var L = await PDFLIB(), src = await loadDoc(files[0]), total = src.getPageCount();
    var nums = String(v.order || '').split(/[\s,]+/).filter(Boolean).map(Number);
    var seen = {};
    nums.forEach(function (n) {
      if (!(n >= 1 && n <= total && n % 1 === 0)) throw new Error('"' + n + '" is not a page of this PDF (it has ' + plural(total, 'page') + ').');
      if (seen[n]) throw new Error('Page ' + n + ' appears more than once. List each page exactly once.');
      seen[n] = 1;
    });
    if (nums.length !== total) throw new Error('Please list all ' + total + ' pages. You listed ' + nums.length + '.');
    var d = await L.PDFDocument.create();
    (await d.copyPages(src, nums.map(function (n) { return n - 1; }))).forEach(function (p) { d.addPage(p); });
    return one(baseName(files[0]) + '-reordered.pdf', pdfBlob(await d.save()), 'Pages reordered.');
  };

  ENG.reverse = async function (files) {
    var L = await PDFLIB(), src = await loadDoc(files[0]), d = await L.PDFDocument.create();
    (await d.copyPages(src, src.getPageIndices().reverse())).forEach(function (p) { d.addPage(p); });
    return one(baseName(files[0]) + '-reversed.pdf', pdfBlob(await d.save()), 'Page order reversed.');
  };

  ENG.duplicate = async function (files, v) {
    var L = await PDFLIB(), src = await loadDoc(files[0]), idx = parseRanges(v.pages, src.getPageCount());
    var d = await L.PDFDocument.create();
    (await d.copyPages(src, src.getPageIndices().concat(idx))).forEach(function (p) { d.addPage(p); });
    return one(baseName(files[0]) + '-duplicated.pdf', pdfBlob(await d.save()), 'Added ' + plural(idx.length, 'copy') + ' at the end.');
  };

  ENG.blank = async function (files, v) {
    var d = await loadDoc(files[0]), total = d.getPageCount(), at = Math.floor(+v.after);
    if (!(at >= 0 && at <= total)) throw new Error('Type a number from 0 to ' + total + '.');
    var ref = d.getPage(at > 0 ? at - 1 : 0).getSize();
    d.insertPage(at, [ref.width, ref.height]);
    return one(baseName(files[0]) + '-with-blank-page.pdf', pdfBlob(await d.save()), 'Blank page added.');
  };

  ENG.img2pdf = async function (files, v, ctx) {
    var L = await PDFLIB(), d = await L.PDFDocument.create(), m = +v.margin || 0;
    for (var i = 0; i < files.length; i++) {
      ctx.status('Adding image ' + (i + 1) + ' of ' + files.length + '…');
      var im = await loadImg(files[i]);
      var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, 4000 / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
      var isPng = files[i].type === 'image/png';
      var bytes = await (await toBlob(c, isPng ? 'image/png' : 'image/jpeg', 0.92)).arrayBuffer();
      var img = isPng ? await d.embedPng(bytes) : await d.embedJpg(bytes);
      var pw, ph;
      if (v.size === 'image') { pw = w * 0.75 + m * 2; ph = h * 0.75 + m * 2; }
      else { var land = w > h; pw = land ? 841.89 : 595.28; ph = land ? 595.28 : 841.89; }
      var s = v.size === 'image' ? 0.75 : Math.min((pw - m * 2) / w, (ph - m * 2) / h);
      var dw = w * s, dh = h * s;
      d.addPage([pw, ph]).drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    }
    return one('images.pdf', pdfBlob(await d.save()), plural(files.length, 'image') + ' added.');
  };

  ENG.xls2pdf = async function (files, v, ctx) {
    await Promise.all([loadScript('xlsx'), loadScript('jspdf'), loadScript('html2canvas')]);
    var wb = window.XLSX.read(await files[0].arrayBuffer(), { type: 'array' });
    var pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }), state = { started: false };
    for (var i = 0; i < wb.SheetNames.length; i++) {
      ctx.status('Converting sheet ' + (i + 1) + ' of ' + wb.SheetNames.length + '…');
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;padding:16px;color:#000;font:12px Arial,sans-serif';
      box.innerHTML = '<style>table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 8px;white-space:nowrap}h3{margin:0 0 8px;font-size:14px}</style><h3>' + esc(wb.SheetNames[i]) + '</h3>' + window.XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[i]]).replace(/^[\s\S]*?<table/i, '<table').replace(/<\/table>[\s\S]*$/i, '</table>');
      document.body.appendChild(box);
      try { var canvas = await window.html2canvas(box, { backgroundColor: '#fff', scale: 2 }); }
      catch (e) { throw new Error('This sheet is too large to convert here. Try splitting it into smaller sheets.'); }
      finally { box.remove(); }
      addCanvasPaged(pdf, canvas, 24, state);
    }
    return one(baseName(files[0]) + '.pdf', pdf.output('blob'), 'Simple table layout. Charts, images and special styling are not included.');
  };

  ENG.html2pdf = async function (files, v, ctx) {
    await Promise.all([loadScript('jspdf'), loadScript('html2canvas')]);
    var land = v.orientation === 'landscape', letter = v.size === 'letter';
    var W = land ? (letter ? 1056 : 1123) : (letter ? 816 : 794);
    ctx.status('Drawing the page…');
    var fr = document.createElement('iframe');
    fr.setAttribute('sandbox', 'allow-same-origin');
    fr.style.cssText = 'position:fixed;left:-99999px;top:0;border:0;width:' + W + 'px;height:900px';
    fr.srcdoc = await files[0].text();
    document.body.appendChild(fr);
    await new Promise(function (r) { fr.onload = r; });
    await new Promise(function (r) { setTimeout(r, 500); });
    var doc = fr.contentDocument, H = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 200);
    fr.style.height = H + 'px';
    var canvas;
    try { canvas = await window.html2canvas(doc.documentElement, { backgroundColor: '#fff', scale: 2, useCORS: true, width: W, height: H, windowWidth: W, windowHeight: H }); }
    finally { fr.remove(); }
    var pdf = new window.jspdf.jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'pt', format: letter ? 'letter' : 'a4' });
    addCanvasPaged(pdf, canvas, 0, { started: false });
    return one(baseName(files[0]) + '.pdf', pdf.output('blob'), 'Styles and images stored in other files are not loaded. Put your CSS inside the HTML file.');
  };

  async function pdfToImages(files, v, ctx, fmt) {
    var pdfjs = await PDFJS(), pdf;
    try { pdf = await pdfjs.getDocument({ data: await files[0].arrayBuffer() }).promise; }
    catch (e) { throw new Error('Could not open this PDF. It may be damaged or password-protected.'); }
    var outs = [], ext = fmt === 'png' ? 'png' : 'jpg', scale = +v.scale || 2;
    for (var i = 1; i <= pdf.numPages; i++) {
      ctx.status('Converting page ' + i + ' of ' + pdf.numPages + '…');
      var page = await pdf.getPage(i), c = document.createElement('canvas');
      await pageRender(c, page, scale, true);
      outs.push({ name: baseName(files[0]) + '-page-' + i + '.' + ext, blob: await toBlob(c, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92) });
      c.width = c.height = 0; page.cleanup();
    }
    return { files: outs, zipName: baseName(files[0]) + '-images.zip', note: plural(outs.length, 'image') + ' created.' };
  }
  ENG.pdf2jpg = function (f, v, c) { return pdfToImages(f, v, c, 'jpeg'); };
  ENG.pdf2png = function (f, v, c) { return pdfToImages(f, v, c, 'png'); };

  ENG.pdf2txt = async function (files, v, ctx) {
    var pdfjs = await PDFJS(), pdf;
    try { pdf = await pdfjs.getDocument({ data: await files[0].arrayBuffer() }).promise; }
    catch (e) { throw new Error('Could not open this PDF. It may be damaged or password-protected.'); }
    var text = '', chars = 0;
    for (var i = 1; i <= pdf.numPages; i++) {
      ctx.status('Reading page ' + i + ' of ' + pdf.numPages + '…');
      var tc = await (await pdf.getPage(i)).getTextContent(), lines = [], cur = '', lastY = null;
      tc.items.forEach(function (it) {
        if (!('str' in it)) return;
        var y = it.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(cur); cur = ''; }
        cur += it.str; lastY = y;
        if (it.hasEOL) { lines.push(cur); cur = ''; lastY = null; }
      });
      if (cur) lines.push(cur);
      var pageText = lines.join('\n').trim(); chars += pageText.length;
      text += '--- Page ' + i + ' ---\n' + pageText + '\n\n';
    }
    if (!chars) throw new Error('No text was found. This PDF is probably a scan (a picture of a page). Scans need OCR, which this tool does not do.');
    return one(baseName(files[0]) + '.txt', new Blob([text], { type: 'text/plain;charset=utf-8' }), 'Text from ' + plural(pdf.numPages, 'page') + ' extracted.');
  };

  ENG.info = async function (files) {
    var f = files[0], d = await loadDoc(f, { ignoreEncryption: true, updateMetadata: false }), p = d.getPage(0).getSize();
    var rows = [['File', f.name], ['Pages', d.getPageCount()], ['File size', fmtSize(f.size)],
      ['First page size', Math.round(p.width / 72 * 25.4) + ' × ' + Math.round(p.height / 72 * 25.4) + ' mm'],
      ['Title', d.getTitle() || '(none)'], ['Author', d.getAuthor() || '(none)'], ['Subject', d.getSubject() || '(none)'],
      ['Created with', d.getCreator() || '(none)'], ['PDF producer', d.getProducer() || '(none)'],
      ['Created on', d.getCreationDate() ? d.getCreationDate().toLocaleString() : '(unknown)'],
      ['Last changed', d.getModificationDate() ? d.getModificationDate().toLocaleString() : '(unknown)']];
    var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
    return one(baseName(f) + '-info.txt', new Blob([text], { type: 'text/plain' }), text);
  };

  ENG.compress = async function (files, v, ctx) {
    var f = files[0], before = f.size, level = v.level, blob;
    if (level === 'light') {
      var d = await loadDoc(f, { updateMetadata: false });
      ['Title', 'Author', 'Subject', 'Producer', 'Creator'].forEach(function (k) { d['set' + k](''); });
      d.setKeywords([]);
      blob = pdfBlob(await d.save({ useObjectStreams: true }));
    } else {
      var L = await PDFLIB(), pdfjs = await PDFJS(), src;
      try { src = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise; }
      catch (e) { throw new Error('Could not open this PDF. It may be damaged or password-protected.'); }
      var scale = level === 'extreme' ? 1.0 : 1.5, q = level === 'extreme' ? 0.45 : 0.62;
      var out = await L.PDFDocument.create();
      for (var i = 1; i <= src.numPages; i++) {
        ctx.status('Compressing page ' + i + ' of ' + src.numPages + '…');
        var page = await src.getPage(i), base = page.getViewport({ scale: 1 }), c = document.createElement('canvas');
        await pageRender(c, page, scale, true);
        var img = await out.embedJpg(await (await toBlob(c, 'image/jpeg', q)).arrayBuffer());
        out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        c.width = c.height = 0; page.cleanup();
      }
      blob = pdfBlob(await out.save());
    }
    if (blob.size >= before * 0.99) return one(f.name, f, 'This level could not make your PDF noticeably smaller, so we kept the original (' + fmtSize(before) + '). Try a stronger level.');
    var saved = Math.round((1 - blob.size / before) * 100);
    return one(baseName(f) + '-compressed.pdf', blob, 'Before: ' + fmtSize(before) + '\nAfter: ' + fmtSize(blob.size) + '  (' + saved + '% smaller)');
  };

  ENG.addtext = async function (files, v) {
    var L = await PDFLIB(), d = await loadDoc(files[0]), total = d.getPageCount(), n = Math.floor(+v.page);
    if (!(n >= 1 && n <= total)) throw new Error('Page number must be between 1 and ' + total + '.');
    var font = await d.embedFont(L.StandardFonts.Helvetica), size = +v.size || 16, pg = d.getPage(n - 1), s = pg.getSize(), tw, x, y, M = 36;
    try { tw = font.widthOfTextAtSize(v.text, size); } catch (e) { throw new Error('This text has characters that the PDF font cannot show. Please use standard English letters, numbers and symbols.'); }
    var pos = v.pos;
    x = /left/.test(pos) ? M : /right/.test(pos) ? s.width - tw - M : (s.width - tw) / 2;
    y = /top/.test(pos) ? s.height - M - size : pos === 'middle' ? s.height / 2 : M;
    pg.drawText(v.text, { x: x, y: y, size: size, font: font, color: L.rgb(0, 0, 0) });
    return one(baseName(files[0]) + '-edited.pdf', pdfBlob(await d.save()), 'Text added on page ' + n + '.');
  };

  ENG.sign = async function (files, v) {
    if (!v.sig) throw new Error('Please draw your signature in the box first.');
    var L = await PDFLIB(), d = await loadDoc(files[0]), png = await d.embedPng(dataUrlToBytes(v.sig));
    var total = d.getPageCount(), idx = v.page === 'first' ? [0] : v.page === 'all' ? d.getPageIndices() : [total - 1];
    var w = +v.width, h = w * png.height / png.width, M = 36;
    idx.forEach(function (i) {
      var pg = d.getPage(i), s = pg.getSize();
      var x = v.pos === 'bottom-left' ? M : v.pos === 'bottom-center' ? (s.width - w) / 2 : s.width - w - M;
      pg.drawImage(png, { x: x, y: M, width: w, height: h });
    });
    return one(baseName(files[0]) + '-signed.pdf', pdfBlob(await d.save()), 'Signature added.');
  };

  ENG.watermark = async function (files, v) {
    var L = await PDFLIB(), d = await loadDoc(files[0]), font = await d.embedFont(L.StandardFonts.HelveticaBold), text = v.text.trim();
    var ang = +v.angle, rad = ang * Math.PI / 180, w1;
    try { w1 = font.widthOfTextAtSize(text, 1); } catch (e) { throw new Error('This text has characters that the PDF font cannot show. Please use standard English letters and numbers.'); }
    d.getPages().forEach(function (pg) {
      var s = pg.getSize(), maxW = ang === 0 ? s.width * 0.8 : Math.hypot(s.width, s.height) * 0.6;
      var size = Math.min(90, maxW / w1), tw = w1 * size, hh = size * 0.35;
      var x = s.width / 2 - (tw / 2 * Math.cos(rad) - hh * Math.sin(rad));
      var y = s.height / 2 - (tw / 2 * Math.sin(rad) + hh * Math.cos(rad));
      pg.drawText(text, { x: x, y: y, size: size, font: font, color: L.rgb(0.45, 0.45, 0.45), opacity: +v.opacity, rotate: L.degrees(ang) });
    });
    return one(baseName(files[0]) + '-watermarked.pdf', pdfBlob(await d.save()), 'Watermark added to ' + plural(d.getPageCount(), 'page') + '.');
  };

  ENG.numbers = async function (files, v) {
    var L = await PDFLIB(), d = await loadDoc(files[0]), font = await d.embedFont(L.StandardFonts.Helvetica), start = Math.floor(+v.start) || 1, total = d.getPageCount();
    d.getPages().forEach(function (pg, i) {
      var n = i + start, label = v.format === 'page' ? 'Page ' + n : v.format === 'of' ? 'Page ' + n + ' of ' + (total + start - 1) : String(n);
      var s = pg.getSize(), tw = font.widthOfTextAtSize(label, 11);
      var x = v.pos === 'bottom-left' ? 40 : v.pos === 'bottom-right' ? s.width - tw - 40 : (s.width - tw) / 2;
      pg.drawText(label, { x: x, y: 24, size: 11, font: font, color: L.rgb(0.2, 0.2, 0.2) });
    });
    return one(baseName(files[0]) + '-numbered.pdf', pdfBlob(await d.save()), 'Page numbers added.');
  };

  ENG.crop = async function (files, v) {
    var d = await loadDoc(files[0]), k = 72 / 25.4;
    var t = (+v.top || 0) * k, b = (+v.bottom || 0) * k, l = (+v.left || 0) * k, r = (+v.right || 0) * k;
    if ([t, b, l, r].some(function (n) { return n < 0; })) throw new Error('Please use zero or positive numbers.');
    if (!(t + b + l + r)) throw new Error('Type how many millimetres to trim from at least one side.');
    d.getPages().forEach(function (pg) {
      var m = pg.getMediaBox();
      if (m.width - l - r < 20 || m.height - t - b < 20) throw new Error('You are trimming too much. Nothing would be left of the page.');
      pg.setCropBox(m.x + l, m.y + b, m.width - l - r, m.height - t - b);
    });
    return one(baseName(files[0]) + '-cropped.pdf', pdfBlob(await d.save()), 'Margins trimmed on every page.');
  };

  /* Unlock: PDF.js can open files that only have editing/printing limits. We redraw each page into a new, unrestricted PDF. */
  ENG.unlock = async function (files, v, ctx) {
    var pdfjs = await PDFJS(), L = await PDFLIB(), src;
    try { src = await pdfjs.getDocument({ data: await files[0].arrayBuffer() }).promise; }
    catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('This PDF needs a password just to open it. We cannot remove that. This tool only removes editing and printing limits.');
      throw new Error('Could not open this PDF. It may be damaged.');
    }
    var out = await L.PDFDocument.create();
    for (var i = 1; i <= src.numPages; i++) {
      ctx.status('Unlocking page ' + i + ' of ' + src.numPages + '…');
      var page = await src.getPage(i), base = page.getViewport({ scale: 1 }), c = document.createElement('canvas');
      await pageRender(c, page, 2, true);
      var img = await out.embedJpg(await (await toBlob(c, 'image/jpeg', 0.9)).arrayBuffer());
      out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      c.width = c.height = 0; page.cleanup();
    }
    return one(baseName(files[0]) + '-unlocked.pdf', pdfBlob(await out.save()), 'Done. The pages are now saved as sharp images, so the new file has no restrictions. Text in it can no longer be selected.');
  };

  ENG.blanks = async function (files, v, ctx) {
    var pdfjs = await PDFJS(), bytes = await files[0].arrayBuffer(), d = await loadDoc(files[0]);
    var pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise, blanks = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      ctx.status('Checking page ' + i + ' of ' + pdf.numPages + '…');
      var page = await pdf.getPage(i), tc = await page.getTextContent();
      if (tc.items.some(function (it) { return it.str && it.str.trim(); })) continue;
      var c = document.createElement('canvas'); await pageRender(c, page, 0.3, true);
      var px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, ink = 0;
      for (var p = 0; p < px.length; p += 4) if (px[p] < 245 || px[p + 1] < 245 || px[p + 2] < 245) ink++;
      if (ink / (px.length / 4) < 0.005) blanks.push(i - 1);
    }
    if (!blanks.length) throw new Error('No blank pages were found in this PDF.');
    if (blanks.length >= d.getPageCount()) throw new Error('Every page looks blank, so nothing was removed.');
    blanks.sort(function (a, b) { return b - a; }).forEach(function (i) { d.removePage(i); });
    return one(baseName(files[0]) + '-cleaned.pdf', pdfBlob(await d.save()), 'Removed ' + plural(blanks.length, 'blank page') + '.');
  };

  ENG.stripmeta = async function (files) {
    var L = await PDFLIB(), d = await loadDoc(files[0], { updateMetadata: false });
    ['Title', 'Author', 'Subject', 'Producer', 'Creator'].forEach(function (k) { d['set' + k](''); });
    d.setKeywords([]);
    d.catalog.delete(L.PDFName.of('Metadata'));
    ['CreationDate', 'ModDate', 'Trapped'].forEach(function (k) { d.getInfoDict().delete(L.PDFName.of(k)); });
    return one(baseName(files[0]) + '-clean.pdf', pdfBlob(await d.save()), 'Title, author, subject, keywords, software details, dates and the extra metadata block were cleared.');
  };

  ENG.repair = async function (files, v, ctx) {
    var L = await PDFLIB(), src;
    try { src = await L.PDFDocument.load(await files[0].arrayBuffer(), { throwOnInvalidObject: false, updateMetadata: false }); }
    catch (e) { throw new Error('This file is too damaged for us to read. Sorry, we could not repair it.'); }
    var out = await L.PDFDocument.create(), ok = 0, bad = 0;
    for (var i = 0; i < src.getPageCount(); i++) {
      try { var cp = await out.copyPages(src, [i]); out.addPage(cp[0]); ok++; } catch (e) { bad++; }
    }
    if (!ok) throw new Error('None of the pages could be rescued from this file.');
    return one(baseName(files[0]) + '-repaired.pdf', pdfBlob(await out.save()), 'Rebuilt ' + plural(ok, 'page') + (bad ? '. ' + plural(bad, 'page') + ' could not be saved.' : '. Open the new file to check it.'));
  };


  /* ----- options ----- */
  var optsBox = $('#opts'), sigCanvas = null, sigInk = false;
  tool.opts.forEach(function (o) {
    var f = document.createElement('div');
    f.className = 'field'; f.dataset.id = o.id;
    var html = '<label for="o_' + o.id + '">' + esc(o.label) + '</label>';
    if (o.type === 'select') {
      html += '<select id="o_' + o.id + '">' + o.choices.map(function (c) { return '<option value="' + esc(c[0]) + '"' + (c[0] === o.default ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select>';
    } else if (o.type === 'signature') {
      html += '<canvas class="sigpad" id="sigpad"></canvas><div class="hint">Use your mouse, finger or stylus. <a href="#" id="sigClear">Clear</a></div>';
    } else {
      html += '<input id="o_' + o.id + '" type="' + (o.type === 'number' ? 'number' : 'text') + '" value="' + esc(o.default) + '" placeholder="' + esc(o.placeholder || '') + '"' + (o.type === 'number' ? ' step="any"' : '') + '>';
    }
    if (o.hint && o.type !== 'signature') html += '<div class="hint">' + esc(o.hint) + '</div>';
    f.innerHTML = html;
    optsBox.appendChild(f);
  });

  function optValue(id) { var el = $('#o_' + id); return el ? el.value : ''; }
  function updateVisibility() {
    tool.opts.forEach(function (o) {
      if (!o.showIf) return;
      var show = Object.keys(o.showIf).every(function (k) { return optValue(k) === o.showIf[k]; });
      $('.field[data-id="' + o.id + '"]').hidden = !show;
    });
  }
  optsBox.addEventListener('change', updateVisibility);
  updateVisibility();

  /* signature pad */
  if (tool.opts.some(function (o) { return o.type === 'signature'; })) {
    sigCanvas = $('#sigpad');
    var ratio = window.devicePixelRatio || 1, drawing = false, sctx;
    var setupSig = function () {
      var r = sigCanvas.getBoundingClientRect();
      sigCanvas.width = Math.max(300, r.width * ratio); sigCanvas.height = r.height * ratio;
      sctx = sigCanvas.getContext('2d'); sctx.lineWidth = 3 * ratio; sctx.lineCap = 'round'; sctx.lineJoin = 'round'; sctx.strokeStyle = '#0b2a6f';
    };
    var pt = function (e) { var r = sigCanvas.getBoundingClientRect(); return [(e.clientX - r.left) * sigCanvas.width / r.width, (e.clientY - r.top) * sigCanvas.height / r.height]; };
    sigCanvas.addEventListener('pointerdown', function (e) { if (!sctx) setupSig(); drawing = true; sigCanvas.setPointerCapture(e.pointerId); var p = pt(e); sctx.beginPath(); sctx.moveTo(p[0], p[1]); sctx.lineTo(p[0] + .1, p[1] + .1); sctx.stroke(); sigInk = true; });
    sigCanvas.addEventListener('pointermove', function (e) { if (!drawing) return; var p = pt(e); sctx.lineTo(p[0], p[1]); sctx.stroke(); });
    ['pointerup', 'pointercancel'].forEach(function (n) { sigCanvas.addEventListener(n, function () { drawing = false; }); });
    $('#sigClear').addEventListener('click', function (e) { e.preventDefault(); if (sctx) sctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height); sigInk = false; });
  }
  function signatureData() {
    if (!sigInk || !sigCanvas) return '';
    var w = sigCanvas.width, h = sigCanvas.height, d = sigCanvas.getContext('2d').getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) return '';
    var pad = 6, c = document.createElement('canvas'); c.width = x1 - x0 + pad * 2; c.height = y1 - y0 + pad * 2;
    c.getContext('2d').drawImage(sigCanvas, x0, y0, x1 - x0, y1 - y0, pad, pad, x1 - x0, y1 - y0);
    return c.toDataURL('image/png');
  }

  /* ----- files ----- */
  var files = [], zone = $('#zone'), input = $('#fileInput'), list = $('#fileList'), work = $('#work'), goBtn = $('#goBtn'), statusEl = $('#status');
  function setStatus(msg, isErr, busy) {
    statusEl.className = 'status' + (isErr ? ' err' : '');
    statusEl.innerHTML = (busy ? '<span class="spin"></span>' : '') + esc(msg || '');
  }
  function accepted(f) {
    return tool.accept.split(',').some(function (a) {
      a = a.trim().toLowerCase();
      if (a.slice(-2) === '/*') return f.type.indexOf(a.slice(0, -1)) === 0;
      if (a.charAt(0) === '.') return f.name.toLowerCase().slice(-a.length) === a;
      return f.type === a;
    });
  }
  function renderFiles() {
    list.innerHTML = '';
    files.forEach(function (f, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="nm">' + esc(f.name) + '</span><span class="sz">' + (f.pages ? plural(f.pages, 'page') + ' · ' : '') + fmtSize(f.size) + '</span>' +
        (tool.multi ? '<button type="button" data-a="up" title="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-a="down" title="Move down"' + (i === files.length - 1 ? ' disabled' : '') + '>↓</button>' : '') +
        '<button type="button" data-a="del" title="Remove">✕</button>';
      li.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-a');
        if (!a) return;
        if (a === 'del') files.splice(i, 1);
        if (a === 'up') files.splice(i - 1, 0, files.splice(i, 1)[0]);
        if (a === 'down') files.splice(i + 1, 0, files.splice(i, 1)[0]);
        renderFiles();
      });
      list.appendChild(li);
    });
    work.hidden = !files.length;
    zone.querySelector('b').textContent = files.length && tool.multi ? 'Add more files' : (tool.multi ? 'Choose files or drop them here' : 'Choose a file or drop it here');
    var need = minFiles - files.length;
    goBtn.disabled = need > 0;
    $('#needMore').textContent = need > 0 ? 'Add ' + plural(need, 'more file') + ' to continue.' : '';
  }
  async function readPageCount(f) {
    if (!/\.pdf$/i.test(f.name) || tool.multi) return;
    try {
      var L = await PDFLIB(), d = await L.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      f.pages = d.getPageCount();
      renderFiles();
      var ord = $('#o_order');
      if (ord) { var a = []; for (var i = 1; i <= f.pages; i++) a.push(i); ord.value = a.join(', '); }
    } catch (e) { /* the real error is shown when you press the button */ }
  }
  function addFiles(fl) {
    var arr = Array.prototype.slice.call(fl), bad = arr.filter(function (f) { return !accepted(f); });
    arr = arr.filter(accepted);
    setStatus(bad.length ? '"' + bad[0].name + '" is not a supported file type here, so it was skipped.' : '', !!bad.length);
    if (!arr.length) return;
    if (tool.multi) files = files.concat(arr); else files = [arr[0]];
    renderFiles();
    if (!tool.multi) readPageCount(files[0]);
    $('#stepResult').hidden = true; $('#stepWork').hidden = false;
  }
  input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.remove('drag'); }); });
  zone.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
  renderFiles();
  if (handoffOK() && window.take40) window.take40().then(function (fs) { if (fs && fs.length) addFiles(fs); });

  /* ----- run ----- */
  function collect() {
    var v = {};
    tool.opts.forEach(function (o) {
      if (o.type === 'signature') v[o.id] = signatureData();
      else v[o.id] = optValue(o.id);
    });
    return v;
  }
  var lastUrl = null;
  goBtn.addEventListener('click', async function () {
    var v = collect();
    for (var i = 0; i < tool.opts.length; i++) {
      var o = tool.opts[i];
      var hidden = o.showIf && !Object.keys(o.showIf).every(function (k) { return v[k] === o.showIf[k]; });
      if (o.required && !hidden && !String(v[o.id]).trim()) { setStatus('Please fill in: ' + o.label + '.', true); return; }
    }
    goBtn.disabled = true;
    setStatus('Working on it…', false, true);
    try {
      var out = await ENG[tool.engine](files.slice(), v, { status: function (m) { setStatus(m, false, true); } });
      var blob, name;
      if (out.files.length === 1) { blob = out.files[0].blob; name = out.files[0].name; }
      else {
        var Z = await JSZIP(), z = new Z();
        out.files.forEach(function (f) { z.file(f.name, f.blob); });
        blob = await z.generateAsync({ type: 'blob' }); name = out.zipName || '40pdf-files.zip';
      }
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      var res = $('#stepResult');
      var isTxt = /\.txt$/.test(name);
      res.innerHTML = '<div class="ok">✅</div><h2>Your file is ready</h2>' +
        '<p class="muted"><b>' + esc(name) + '</b> · ' + fmtSize(blob.size) + '</p>' +
        (out.note ? '<div class="note">' + esc(out.note) + '</div>' : '') +
        '<a class="btn big" id="dl" download="' + esc(name) + '" href="' + lastUrl + '">⬇ Download' + (isTxt ? ' text file' : '') + '</a> ' +
        '<button class="btn ghost big" id="again" type="button">Start over</button>';
      $('#stepWork').hidden = true; res.hidden = false;
      $('#again').addEventListener('click', function () { files = []; renderFiles(); setStatus(''); res.hidden = true; $('#stepWork').hidden = false; });
      res.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      console.error(e);
      setStatus(e && e.message ? e.message : 'Something went wrong. Please try again.', true);
    } finally {
      goBtn.disabled = files.length < minFiles;
    }
  });

})();
