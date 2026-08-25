(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  function label() { if (btn) btn.textContent = root.dataset.theme === 'dark' ? 'light mode' : 'dark mode'; }
  label();
  if (btn) btn.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', root.dataset.theme);
    label();
  });

  // 목차 자동 생성 + 현재 위치 하이라이트
  var rail = document.querySelector('[data-toc] .toc');
  var heads = Array.prototype.slice.call(document.querySelectorAll('.prose h2, .prose h3'));
  if (rail && heads.length) {
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'h-' + i + '-' + (h.textContent || '').trim().toLowerCase().replace(/[^\w가-힣]+/g, '-').slice(0, 40);
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.className = h.tagName === 'H3' ? 'lvl3' : 'lvl2';
      rail.appendChild(a);
    });
    var links = rail.querySelectorAll('a');
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (l) { l.classList.toggle('is-active', l.hash === '#' + e.target.id); });
      });
    }, { rootMargin: '-10% 0px -80% 0px' });
    heads.forEach(function (h) { obs.observe(h); });
  }

  // 읽기 진행 표시
  var bar = document.querySelector('.reading-progress i');
  if (bar) window.addEventListener('scroll', function () {
    var max = document.body.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
  }, { passive: true });

  // 코드 복사
  document.querySelectorAll('.prose div.highlight, .prose pre').forEach(function (block) {
    if (block.querySelector('.copy-code')) return;
    var b = document.createElement('button');
    b.className = 'copy-code'; b.type = 'button'; b.textContent = 'copy';
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(block.innerText.replace(/^copy\n/, ''));
      b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1400);
    });
    block.appendChild(b);
  });

  var cl = document.querySelector('.copy-link');
  if (cl) cl.addEventListener('click', function () {
    navigator.clipboard.writeText(cl.dataset.url);
    cl.textContent = 'copied'; setTimeout(function () { cl.textContent = 'copy link'; }, 1400);
  });

  // 아카이브 필터
  var filters = document.querySelector('[data-filters]');
  if (filters) filters.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    filters.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
    document.querySelectorAll('[data-cards] .post-card').forEach(function (c) {
      c.style.display = (b.dataset.filter === 'all' || c.dataset.category === b.dataset.filter) ? '' : 'none';
    });
  });
})();
