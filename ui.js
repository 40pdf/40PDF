/* 40PDF shared UI: Tools menu, mobile menu and the small file hand-off from the home page to a tool. */
(function () {
  function openDB() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('40pdf-handoff', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('f'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  window.put40 = function (files) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('f', 'readwrite');
        tx.objectStore('f').put(Array.prototype.slice.call(files), 'files');
        tx.oncomplete = function () { try { sessionStorage.setItem('40pdf-h', String(Date.now())); } catch (e) {} res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  };
  window.take40 = function () {
    return openDB().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction('f', 'readwrite'), s = tx.objectStore('f'), g = s.get('files');
        g.onsuccess = function () { s.delete('files'); res(g.result || []); };
        g.onerror = function () { res([]); };
      });
    }).catch(function () { return []; });
  };

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.getElementById('nav'), menuBtn = document.getElementById('menuBtn');
    var dd = document.querySelector('.dd'), chev = dd && dd.querySelector('.dd-chev');
    function closeDD() { if (dd) { dd.classList.remove('open'); if (chev) chev.setAttribute('aria-expanded', 'false'); } }
    if (menuBtn) menuBtn.addEventListener('click', function () {
      var o = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', o);
      if (!o) closeDD();
    });
    if (chev) chev.addEventListener('click', function (e) {
      e.stopPropagation();
      var o = dd.classList.toggle('open');
      chev.setAttribute('aria-expanded', o);
    });
    document.addEventListener('click', function (e) { if (dd && !dd.contains(e.target)) closeDD(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDD(); if (nav) nav.classList.remove('open'); } });
    if (dd) dd.querySelectorAll('.dd-menu a').forEach(function (a) { a.addEventListener('click', function () { closeDD(); if (nav) nav.classList.remove('open'); }); });
  });
})();
