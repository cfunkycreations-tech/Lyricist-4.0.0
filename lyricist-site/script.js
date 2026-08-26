/* ============================================================================
   Lyricist site. Vanilla, no dependencies.

   READ THIS BEFORE CHANGING ANYTHING: the page is fully usable with JavaScript
   switched off. Every download link is a real href in the HTML and every
   version number is real text in the HTML. This file only keeps those values in
   sync with the RELEASE block after a script rewrites it, and adds polish.
   Nothing here is allowed to become the only way something works.
   ========================================================================= */
(function () {
  'use strict';

  /* ==========================================================================
     THE MAILING LIST ENDPOINT. This is the one line to change.

     Leave it empty and the signup button opens the visitor's own mail app,
     addressed to Chris, with the subject filled in. That works the day the site
     goes up, costs nothing, and needs no account, but every subscriber gets
     added by hand.

     Paste a form endpoint from a mail provider here and the form posts straight
     to it instead, no page reload. Whatever provider you pick, the endpoint is
     the "form action" URL it gives you.
     ====================================================================== */
  var NEWSLETTER_ENDPOINT = '';
  var CONTACT_EMAIL = 'cfunkycreations@gmail.com';

  /* ---- 1. Release data ---------------------------------------------- */
  var data = null;
  try {
    var el = document.getElementById('release-data');
    if (el) data = JSON.parse(el.textContent);
  } catch (e) {
    // A malformed block must not take the page down. The hard coded HTML
    // values stay on screen and everything still works.
    data = null;
  }

  if (data) {
    document.querySelectorAll('[data-release]').forEach(function (n) {
      var v = data[n.getAttribute('data-release')];
      if (typeof v === 'string' && v) n.textContent = v;
    });
    document.querySelectorAll('[data-release-href]').forEach(function (n) {
      var v = data[n.getAttribute('data-release-href')];
      if (typeof v === 'string' && v) n.setAttribute('href', v);
    });
    var copyBtn = document.getElementById('copyLink');
    if (copyBtn && data.installerUrl) copyBtn.dataset.url = data.installerUrl;
  }

  /* ---- 2. Copy the download link, for people on a phone -------------- */
  var btn = document.getElementById('copyLink');
  var say = document.getElementById('copied');
  if (btn) {
    btn.addEventListener('click', function () {
      var url = btn.dataset.url || '';
      var done = function () { if (say) say.textContent = 'Copied. Send it to your computer.'; };
      var failed = function () { if (say) say.textContent = 'Could not copy. Press and hold the link below instead.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, failed);
      } else {
        // Older phone browsers have no clipboard API at all.
        try {
          var t = document.createElement('textarea');
          t.value = url; t.setAttribute('readonly', '');
          t.style.position = 'absolute'; t.style.left = '-9999px';
          document.body.appendChild(t); t.select();
          document.execCommand('copy'); document.body.removeChild(t);
          done();
        } catch (e) { failed(); }
      }
    });
  }

  /* ---- 3. The proof video ------------------------------------------
     It is a 9 MB file. Loading that the moment the page opens spends a
     phone user's data before they have decided they care, so nothing is
     fetched until the video is actually near the screen, and it pauses
     again when it scrolls away.                                          */
  var vid = document.getElementById('proofVideo');
  if (vid) {
    var started = false;
    var reduceMo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ('IntersectionObserver' in window) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            if (!started) { started = true; vid.preload = 'auto'; vid.load(); }
            if (!reduceMo) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
          } else if (!vid.paused) {
            vid.pause();
          }
        });
      }, { rootMargin: '200px 0px', threshold: 0.15 });
      vio.observe(vid);
    } else {
      vid.preload = 'auto';
      vid.load();
    }
  }

  /* ---- 4. Hide social links that have nowhere to go yet -------------- */
  var social = document.getElementById('social');
  if (social) {
    var live = 0;
    social.querySelectorAll('a').forEach(function (a) {
      var h = a.getAttribute('href');
      if (!h || h === '#') a.remove(); else live++;
    });
    if (!live) social.remove();
  }

  /* ---- 5. The updates signup ----------------------------------------
     There are two of these forms on the page: one in the Updates section, and
     one that appears the moment a download is clicked. Same behaviour, so the
     code binds by CLASS, never by id. Adding a third form anywhere needs no
     change here.                                                            */
  function bindSignup(form) {
    var said = form.parentNode.querySelector('.signup-said');
    var input = form.querySelector('input[type="email"]');
    var btn = form.querySelector('button[type="submit"]');
    var tell = function (msg, ok) {
      if (!said) return;
      said.textContent = msg;
      said.className = 'signup-said' + (ok ? ' good' : ' bad');
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var addr = (input.value || '').trim();

      // Deliberately loose. Turning away a real address because it has an
      // unusual shape is worse than accepting one bad one.
      if (addr.indexOf('@') < 1 || addr.lastIndexOf('.') < addr.indexOf('@')) {
        tell('That does not look like an email address. Have another go.', false);
        input.focus();
        return;
      }

      btn.disabled = true;

      // Two possible destinations. A real mailing service if one is configured,
      // otherwise Web3Forms, which just emails the address to Chris so he can
      // add it by hand. Either way the person gets the same answer.
      var toService = !!NEWSLETTER_ENDPOINT;
      var req = toService
        ? fetch(NEWSLETTER_ENDPOINT, {
            method: 'POST',
            body: (function () { var b = new FormData(); b.append('email', addr); return b; })(),
            headers: { Accept: 'application/json' }
          }).then(function (r) { if (!r.ok) throw new Error(r.status); return {}; })
        : fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              access_key: WEB3FORMS_KEY,
              subject: 'Lyricist updates signup: ' + addr,
              from_name: 'Lyricist website',
              email: addr
            })
          }).then(function (r) { return r.json(); })
            .then(function (o) { if (!o || !o.success) throw new Error('rejected'); return o; });

      req
        .then(function () {
          form.reset();
          tell('You are on the list. One message when a new version ships, nothing else.', true);
          remember();
        })
        .catch(function () {
          // Never lose the address just because a service is down.
          tell('That did not go through. Email ' + CONTACT_EMAIL + ' and you will be added by hand.', false);
        })
        .then(function () { btn.disabled = false; });
    });
  }

  function remember() {
    try { localStorage.setItem('lyricist-asked', '1'); } catch (e) { /* private mode */ }
  }
  function alreadyAsked() {
    try { return localStorage.getItem('lyricist-asked') === '1'; } catch (e) { return false; }
  }

  document.querySelectorAll('.signup').forEach(bindSignup);

  /* ---- 5b. Ask AFTER the download, never before ----------------------
     The download link is a plain href and fires on its own. All this does is
     reveal the ask next to it. If the person already gave an address, or said
     no thanks, they are not asked again.                                    */
  var postdl = document.getElementById('postdl');
  if (postdl) {
    var no = document.getElementById('postdlNo');
    if (no) {
      no.addEventListener('click', function () { postdl.hidden = true; remember(); });
    }
    document.querySelectorAll('.hero-body [data-release-href], .lastcall [data-release-href]')
      .forEach(function (link) {
        link.addEventListener('click', function () {
          if (alreadyAsked()) return;
          postdl.hidden = false;
          var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          postdl.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
        });
      });
  }

  /* ---- 5c. Chime. It has no public pay link, so hand over the cashtag ---
     The old site used a browser alert for this. Same information, shown in
     the page instead, because an alert box on a phone is a wall.            */
  var chime = document.getElementById('chimeBtn');
  var chimeSaid = document.getElementById('chimeSaid');
  if (chime) {
    chime.addEventListener('click', function () {
      var tag = '$Christopher-Funk-21';
      var msg = 'Chime cashtag copied: ' + tag
        + '  —  open the Chime app, tap Pay Anyone, and paste it. Chime has no web link, the app is the only way.';
      var fallback = 'Chime cashtag: ' + tag
        + '  —  open the Chime app, tap Pay Anyone, and enter it.';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tag).then(
          function () { if (chimeSaid) chimeSaid.textContent = msg; },
          function () { if (chimeSaid) chimeSaid.textContent = fallback; }
        );
      } else if (chimeSaid) {
        chimeSaid.textContent = fallback;
      }
    });
  }

  /* ---- 5d. Reviews -------------------------------------------------
     Two halves that never touch each other:
       READING  - reviews.json, which only ever contains what Chris approved.
       WRITING  - the form, which goes to his inbox and nowhere near the page.
     That separation is the whole design. Nothing a stranger types can appear
     on this site without a person putting it there.

     TO SWITCH ON REAL DELIVERY: go to web3forms.com, put in
     cfunkycreations@gmail.com, and they email you an access key. Paste it
     below. Until then the form hands the review to the visitor's mail app,
     which works but makes them press send themselves.                      */
  var WEB3FORMS_KEY = 'ea49af3c-63b0-4eee-8820-6da9be5b2a70';
  var NL = String.fromCharCode(10);

  function starRow(n) {
    var full = '★', empty = '☆', out = '';
    for (var i = 1; i <= 5; i++) out += (i <= Math.round(n) ? full : empty);
    return out;
  }

  var list = document.getElementById('reviewList');
  if (list) {
    fetch('reviews.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var rows = (data && Array.isArray(data.reviews)) ? data.reviews : [];
        if (!rows.length) return;              // the empty message stays

        list.innerHTML = '';
        rows.forEach(function (rv) {
          var stars = Math.max(1, Math.min(5, Number(rv.stars) || 5));
          var card = document.createElement('article');
          card.className = 'review';
          var head = document.createElement('div');
          head.className = 'review-head';
          var st = document.createElement('span');
          st.className = 'review-stars';
          st.textContent = starRow(stars);
          st.setAttribute('aria-label', stars + ' out of 5');
          var who = document.createElement('span');
          who.className = 'review-who';
          who.textContent = rv.name || 'Anonymous';
          head.appendChild(st); head.appendChild(who);
          if (rv.date) {
            var when = document.createElement('span');
            when.className = 'review-when';
            when.textContent = rv.date;
            head.appendChild(when);
          }
          var body = document.createElement('p');
          body.className = 'review-body';
          // textContent, never innerHTML: a review is somebody else's words.
          body.textContent = rv.text || '';
          card.appendChild(head); card.appendChild(body);
          list.appendChild(card);
        });

        var avg = rows.reduce(function (t, r) { return t + (Number(r.stars) || 0); }, 0) / rows.length;
        var sum = document.getElementById('ratingSummary');
        if (sum) {
          document.getElementById('ratingStars').textContent = starRow(avg);
          document.getElementById('ratingNum').textContent = avg.toFixed(1);
          document.getElementById('ratingCount').textContent =
            rows.length === 1 ? 'from 1 review' : 'from ' + rows.length + ' reviews';
          sum.hidden = false;
        }
      })
      .catch(function () { /* no reviews file yet, the empty message stays */ });
  }

  var revForm = document.getElementById('reviewForm');
  var revSaid = document.getElementById('reviewSaid');
  if (revForm) {
    revForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var starEl = revForm.querySelector('input[name="stars"]:checked');
      var name = revForm.querySelector('#revName').value.trim();
      var text = revForm.querySelector('#revText').value.trim();
      var tell = function (m, ok) {
        revSaid.textContent = m;
        revSaid.className = 'review-said' + (ok ? ' good' : ' bad');
      };

      if (!starEl) { tell('Pick a star rating first.', false); return; }
      if (!name)   { tell('Put a name on it, even a first name.', false); return; }
      if (text.length < 4) { tell('Say a little more than that.', false); return; }

      var stars = starEl.value;
      if (!WEB3FORMS_KEY) {
        window.location.href = 'mailto:' + CONTACT_EMAIL
          + '?subject=' + encodeURIComponent('Lyricist review: ' + stars + ' stars from ' + name)
          + '&body=' + encodeURIComponent(stars + ' out of 5' + NL + NL + text + NL + NL + '- ' + name);
        tell('Opening your email app. Send that message and it reaches Chris.', true);
        return;
      }

      var btn = revForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: 'Lyricist review: ' + stars + ' stars from ' + name,
          from_name: 'Lyricist website',
          name: name, stars: stars, review: text
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (out) {
          if (!out || !out.success) throw new Error('rejected');
          revForm.reset();
          tell('Sent. Thanks for taking the time, it means a lot.', true);
        })
        .catch(function () {
          tell('That did not go through. Email ' + CONTACT_EMAIL + ' instead and it will get read.', false);
        })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---- 5e. The photo of Chris and Craig ------------------------------
     Shown only once the file is actually there, so a missing photo leaves
     no broken frame in the middle of the story.                          */
  var bros = document.getElementById('brothers');
  if (bros) {
    // Visible by default, hidden only if the file is missing. The other way
    // round deadlocks: a hidden figure never loads its image, so the load
    // event that was supposed to reveal it never fires.
    bros.querySelector('img').addEventListener('error', function () { bros.hidden = true; });
  }

  /* ---- 6. Reveal on scroll, off entirely for reduced motion ---------- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.section, .hero-body');
    targets.forEach(function (t) { t.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    targets.forEach(function (t) { io.observe(t); });
  }
})();
