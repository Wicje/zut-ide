// Zut landing interactions: mobile nav, theme, reveal-on-scroll, year, and
// account creation (the door to the IDE).
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

  // Accounts are the door. Creating one here signs you in (or asks for an
  // email confirmation first) and drops you straight into the IDE.
  var SB_URL = 'https://tmajgvivaizcjpysggod.supabase.co';
  var SB_KEY = 'sb_publishable_mjeMCS-80ht6EV04Zdc7hA_VWiyssbs';
  // supabase-js reads the session from this exact key; storing it here is
  // what lets the IDE open already signed-in after a signup on this page.
  var AUTH_TOKEN_KEY = 'sb-tmajgvivaizcjpysggod-auth-token';
  function storeSession(session) {
    try { localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(session)); } catch (e) {}
  }
  document.querySelectorAll('[data-signup]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var emailInput = form.querySelector('input[type="email"]');
      var passInput = form.querySelector('input[type="password"]');
      var btn = form.querySelector('[data-signup-btn]');
      var scope = form.closest('.hero, .cta') || document;
      var msg = scope.querySelector('[data-signup-msg]');
      var email = (emailInput.value || '').trim().toLowerCase();
      var password = passInput.value || '';
      function say(text, cls) {
        if (msg) msg.textContent = text;
        if (msg) msg.className = 'wait-msg ' + (cls || '');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        say('Enter a valid email.', 'err');
        emailInput.focus();
        return;
      }
      if (password.length < 8) {
        say('Passwords need at least 8 characters.', 'err');
        passInput.focus();
        return;
      }
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = 'Creating…';
      var headers = { 'Content-Type': 'application/json', apikey: SB_KEY };
      fetch(SB_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ email: email, password: password }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { status: res.status, data: data }; });
        })
        .then(function (r) {
          if (r.status !== 200) {
            btn.disabled = false;
            btn.textContent = original;
            var text = r.data && r.data.msg ? r.data.msg.toLowerCase() : '';
            if (text.indexOf('already registered') !== -1) {
              say('You already have an account — open Zut and sign in.');
            } else {
              say((r.data && r.data.msg) || 'Could not create the account — please try again.', 'err');
            }
            return null;
          }
          if (r.data && r.data.session) {
            storeSession(r.data.session);
            btn.textContent = 'Welcome…';
            window.location.href = '/app';
            return null;
          }
          // Email confirmation is on for this project: try a plain sign-in
          // anyway, then fall back to asking for the inbox.
          return fetch(SB_URL + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ email: email, password: password }),
          })
            .then(function (res) {
              return res.json().then(function (data) { return { status: res.status, data: data }; });
            })
            .then(function (r2) {
              if (r2.status === 200 && r2.data && r2.data.access_token) {
                storeSession(r2.data);
                btn.textContent = 'Welcome…';
                window.location.href = '/app';
                return null;
              }
              say('Account created — check your email to confirm, then sign in.', 'ok');
              btn.disabled = false;
              btn.textContent = original;
              return null;
            });
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
