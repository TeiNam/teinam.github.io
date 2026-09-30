// GoatCounter 공개 카운터로 [data-gc-path] 요소에 조회수를 채운다.
// 경로 "TOTAL" 은 사이트 전체 조회수다. 응답이 없으면 요소를 숨긴 채 둔다.
(function () {
  var base = document.currentScript.dataset.base;
  document.querySelectorAll('[data-gc-path]').forEach(function (el) {
    var url = base + '/counter/' + encodeURIComponent(el.dataset.gcPath) + '.json';
    fetch(url)
      .then(function (r) {
        // 404 는 아직 한 번도 집계되지 않은 경로다
        if (r.status === 404) return { count: '0' };
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        el.querySelector('b').textContent = d.count;
        el.hidden = false;
      })
      .catch(function (e) { console.warn('조회수 불러오기 실패:', url, e); });
  });
})();
