/** In-page section jumps + external link escape for sandboxed srcdoc iframes.
 *  Hash links otherwise load the embedder URL. Facebook/Instagram refuse framing
 *  ("refused to connect"), so http(s) must open outside the preview. */
export const INPAGE_NAV_SCRIPT = `(function () {
  var btn = document.querySelector('.dpl-nav-toggle');
  var nav = document.querySelector('.dpl-nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  function openExternal(href) {
    try {
      var w = window.open(href, '_blank', 'noopener,noreferrer');
      if (w) return true;
    } catch (e) {}
    try {
      window.top.location.href = href;
      return true;
    } catch (e2) {}
    return false;
  }
  document.addEventListener('click', function (event) {
    var a = event.target.closest && event.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href === '#') return;

    if (href.charAt(0) === '#') {
      if (href.length < 2) return;
      var id = decodeURIComponent(href.slice(1));
      var target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      if (nav) nav.classList.remove('is-open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (/^(https?:|\\/\\/)/i.test(href)) {
      event.preventDefault();
      if (nav) nav.classList.remove('is-open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      openExternal(href);
    }
  });
})();`;
