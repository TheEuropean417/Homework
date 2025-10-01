(() => {
  function s(t){ return (t||'').replace(/\s+/g,' ').trim(); }

  // If it's a PDF viewer (Edge/Chrome), DOM text is not accessible.
  // Heuristics: embed/iframe with type application/pdf; or URL indicates pdf
  const pdfLike = !!document.querySelector('embed[type="application/pdf"],iframe[src*=".pdf"],embed[src*=".pdf"]');
  const url = location.href;
  if(pdfLike || /\.pdf(\?|#|$)/i.test(url)){
    return { isPDF: true, url };
  }

  // Otherwise, return visible text
  const txt = s(document.body && document.body.innerText || '');
  return { text: txt.slice(0, 500000) }; // cap to be safe
})();
