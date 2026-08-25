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
  // 헤더 검색 — 글이 적어 색인 라이브러리 없이 부분 문자열 매칭으로 충분하다
  // ponytail: 글이 수백 편이 되면 그때 lunr 같은 색인으로 교체
  var searchBox = document.querySelector('[data-search]');
  if (searchBox) {
    var SEARCH_LIMIT = 8;
    var input = searchBox.querySelector('input');
    var panel = searchBox.querySelector('.search-results');
    var docs = null;
    var pending = null;

    function setOpen(isOpen) {
      panel.hidden = !isOpen;
      input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function showNote(text) {
      panel.textContent = '';
      var d = document.createElement('div');
      d.className = 'search-note';
      d.textContent = text;
      panel.appendChild(d);
      setOpen(true);
    }

    function loadIndex() {
      if (docs) return Promise.resolve(docs);
      if (!pending) {
        pending = fetch(searchBox.dataset.search)
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (json) { docs = json; return docs; })
          .catch(function (err) {
            pending = null;
            console.error('검색 색인 로드 실패:', err);
            throw err;
          });
      }
      return pending;
    }

    // 제목·본문 요약·태그를 textContent 로만 넣는다. 색인 값을 innerHTML 로 쓰면 XSS 경로가 열린다
    function render(list) {
      if (!list.length) { showNote('결과 없음'); return; }
      panel.textContent = '';
      list.forEach(function (d) {
        var a = document.createElement('a');
        a.href = d.url;
        a.setAttribute('role', 'option');
        var title = document.createElement('span');
        title.className = 'r-title';
        title.textContent = d.title;
        var meta = document.createElement('span');
        meta.className = 'r-meta';
        meta.textContent = [d.date, d.category].filter(Boolean).join(' · ');
        a.appendChild(title);
        a.appendChild(meta);
        panel.appendChild(a);
      });
      setOpen(true);
    }

    function runSearch() {
      var q = input.value.trim().toLowerCase();
      if (!q) { setOpen(false); return; }
      loadIndex().then(function (all) {
        render(all.filter(function (d) {
          return (d.title + ' ' + d.excerpt + ' ' + d.tags + ' ' + d.category).toLowerCase().indexOf(q) !== -1;
        }).slice(0, SEARCH_LIMIT));
      }).catch(function () {
        showNote('검색을 불러오지 못했습니다');
      });
    }

    input.addEventListener('input', runSearch);
    input.addEventListener('focus', runSearch);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; setOpen(false); input.blur(); }
    });
    document.addEventListener('click', function (e) {
      if (!searchBox.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }
})();
