// Zut landing interactions: mobile nav, reveal-on-scroll, footer year.
// Launch buttons point at the local dev server when it is reachable,
// otherwise they scroll back to the top CTA.
(function () {
  'use strict';

  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Reveal sections on scroll; IntersectionObserver with a no-op fallback.
  var revealEls = document.querySelectorAll('.section, .cta, .strip');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    revealEls.forEach(function (el) {
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  // Point launch CTAs at the running IDE when reachable (same host, :5173).
  var DEV_PORT = '5173';
  function wireLaunch(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var url = window.location.protocol + '//' + window.location.hostname + ':' + DEV_PORT + '/';
      fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(1500) })
        .then(function () {
          window.location.href = url;
        })
        .catch(function () {
          document.getElementById('top').scrollIntoView({ behavior: 'smooth' });
        });
    });
  }
  ['launchBtn', 'heroLaunch', 'ctaLaunch'].forEach(wireLaunch);
})();
