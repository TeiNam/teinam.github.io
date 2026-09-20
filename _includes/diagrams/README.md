# 다이어그램

`*.lifecycle.json` 같은 소스와 렌더된 `*.svg` 를 같이 둔다. `_includes/` 는 Jekyll 이
출력하지 않으므로 소스를 넣어도 사이트에 노출되지 않는다.

## 다시 렌더하기

```bash
ARCHIFY=~/.claude/skills/archify
node $ARCHIFY/bin/archify.mjs render lifecycle \
  _includes/diagrams/xa-states.lifecycle.json /tmp/xa-states.html
node $ARCHIFY/bin/archify.mjs check /tmp/xa-states.html
```

그다음 `/tmp/xa-states.html` 에서 `<svg>…</svg>` 만 떼어 `xa-states.svg` 로 덮어쓴다.
떼어낼 때 두 가지를 반드시 처리한다.

1. **`id` 에 접두어를 붙인다.** archify 는 `arrowhead`·`grid` 같은 고정 id 를 쓴다.
   한 페이지에 다이어그램이 둘 이상 오면 충돌해 화살촉이 엉킨다. `id="x"` 와
   `url(#x)` 를 같이 바꿔야 한다.
2. **`font-family` 속성을 지운다.** archify 는 JetBrains Mono 를 루트에 박는다.
   지우면 `main.css` 의 `.diagram svg { font-family: var(--mono) }` 가 사이트 글꼴을 준다.

## 손대지 말 것

- **SVG 안의 색을 직접 칠하지 않는다.** archify 는 색을 CSS 변수로만 칠하고,
  `main.css` 의 `.diagram` 블록이 그 변수를 사이트 변수(`--ink`·`--accent`·`--warn-*`)에
  이어 준다. 그래서 사이트의 다크 모드 토글이 다이어그램까지 그대로 끌고 간다.
  직접 칠하면 그 연결이 끊긴다.
- **`viewBox` 를 넓히지 않는다.** 본문 칼럼이 672px 이라 viewBox 가 넓어질수록 SVG 안의
  7~10px 글자가 그만큼 작아진다. 810px 이 지금 레이아웃에서 읽히는 상한이다.
