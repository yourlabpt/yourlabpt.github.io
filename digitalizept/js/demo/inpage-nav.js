/** In-page section jumps. Hash links inside a sandboxed srcdoc iframe otherwise
 *  load the embedder URL (/digitalizept/ — the login) instead of scrolling. */
export const INPAGE_NAV_SCRIPT = `(function () {
  var btn = document.querySelector('.dpl-nav-toggle');
  var nav = document.querySelector('.dpl-nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function (event) {
    var a = event.target.closest && event.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.length < 2) return;
    var id = decodeURIComponent(href.slice(1));
    var target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    if (nav) nav.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();`;
