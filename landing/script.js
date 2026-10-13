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

  // Light / dark mode: stored choice wins, OS preference is the default.
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function paintTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('zut-theme', t); } catch (e) {}
    if (themeMeta) themeMeta.setAttribute('content', t === 'light' ? '#fafaf9' : '#0c0c0e');
    var btn = document.getElementById('themeToggle');
    if (btn) {
      var light = t === 'light';
      btn.setAttribute('aria-pressed', light ? 'true' : 'false');
      btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    }
  }
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    paintTheme(document.documentElement.dataset.theme || 'dark');
    themeBtn.addEventListener('click', function () {
      paintTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    });
  }

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

  // Closed waitlist: no links to /app anywhere. The nav CTA scrolls to
  // the join form; success messages never offer a launch link.
  var WAIT_KEY = 'zut:waitlist-joined';
  function markJoined(email) {
    try { localStorage.setItem(WAIT_KEY, JSON.stringify({ email: email, at: Date.now() })); } catch (e) {}
  }

  // Waitlist capture: plain PostgREST insert, no SDK needed.
  // Requires the `waitlist` table + anon-insert policy (see supabase/waitlist.sql).
  var SB_URL = 'https://tmajgvivaizcjpysggod.supabase.co';
  var SB_KEY = 'sb_publishable_mjeMCS-80ht6EV04Zdc7hA_VWiyssbs';
  document.querySelectorAll('[data-waitlist]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var btn = form.querySelector('[data-wait-btn]');
      var scope = form.closest('.hero, .cta') || document;
      var msg = scope.querySelector('[data-wait-msg]');
      var email = (input.value || '').trim().toLowerCase();
      function say(text, cls) {
        if (msg) msg.textContent = text;
        if (msg) msg.className = 'wait-msg ' + (cls || '');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        say('Enter a valid email to join.', 'err');
        input.focus();
        return;
      }
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = 'Joining…';
      fetch(SB_URL + '/rest/v1/waitlist', {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ email: email }),
      })
        .then(function (res) {
          btn.disabled = false;
          btn.textContent = original;
          if (res.status === 201 || res.status === 204) {
            form.reset();
            markJoined(email);
            say('You are on the list. Watch your inbox.', 'ok');
          } else if (res.status === 409) {
            markJoined(email);
            say('You are already on the list. Watch your inbox.', 'ok');
          } else {
            say('Could not join right now — please try again.', 'err');
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = original;
          say('Network hiccup — please try again.', 'err');
        });
    });
  });

  // Staggered card entrances: each card pops in slightly after its sibling.
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var popEls = document.querySelectorAll('.feat, .steps li, .quote, .grid3 .card, .grid4 .mini, .price-grid .card, .team');
  popEls.forEach(function (el) { el.classList.add('pop'); });
  if ('IntersectionObserver' in window && !reduceMotion) {
    var so = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var sibs = Array.prototype.slice.call(en.target.parentElement.children);
          var delay = Math.min(sibs.indexOf(en.target) * 80, 400);
          en.target.style.transitionDelay = delay + 'ms';
          en.target.classList.add('in');
          so.unobserve(en.target);
          setTimeout(function () { en.target.style.transitionDelay = ''; }, delay + 700);
        });
      },
      { threshold: 0.12 },
    );
    popEls.forEach(function (el) { so.observe(el); });
  } else {
    popEls.forEach(function (el) { el.classList.add('in'); });
  }

  // Pointer-only delights: spotlight glow on cards + gentle 3D tilt on hero.
  if (window.matchMedia('(pointer: fine)').matches && !reduceMotion) {
    document.querySelectorAll('.feat, .card, .quote, .mini, .steps li').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', e.clientX - r.left + 'px');
        card.style.setProperty('--my', e.clientY - r.top + 'px');
      });
    });

    var hv = document.querySelector('.hero-visual');
    if (hv) {
      var raf = null;
      hv.classList.add('tilting');
      hv.addEventListener('pointermove', function (e) {
        var r = hv.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          hv.style.transform =
            'perspective(1200px) rotateY(' + (x * 5).toFixed(2) + 'deg) rotateX(' + (-y * 5).toFixed(2) + 'deg)';
        });
      });
      hv.addEventListener('pointerleave', function () {
        if (raf) cancelAnimationFrame(raf);
        hv.style.transform = '';
      });
    }
  }

  // Scroll progress bar.
  var bar = document.createElement('div');
  bar.className = 'progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);
  var ticking = false;
  function paintBar() {
    ticking = false;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(window.scrollY / h, 1) : 0) + ')';
  }
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paintBar);
      }
    },
    { passive: true },
  );
  paintBar();
})();
