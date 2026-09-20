# 다이어그램

`*.lifecycle.json` 같은 소스와 렌더된 `*.svg` 를 같이 둔다. `_includes/` 는 Jekyll 이
출력하지 않으므로 소스를 넣어도 사이트에 노출되지 않는다.

archify 2.17 기준이다.

## 다시 렌더하기

```bash
ARCHIFY=~/.claude/skills/archify
SPEC=_includes/diagrams/xa-states.lifecycle.json
OUT=_workspace/diagrams/xa-states.html

# 1. 검증 — showcase 는 검사 9개 전부 통과 + 오류 0 + 경고 0 이어야 한다
node $ARCHIFY/bin/archify.mjs validate lifecycle $SPEC --quality showcase --json

# 2. 최종 승인 — 사양·산출물의 sha256 과 바이트 수를 리시트로 남긴다
node $ARCHIFY/bin/archify.mjs deliver lifecycle $SPEC $OUT --quality showcase --json

# 3. 브라우저 증거 — 1440×900 부터 2048×1320 까지 담김·가독성 측정 + 스크린샷
node $ARCHIFY/bin/archify.mjs visual-check $OUT --json
```

`deliver` 가 0 이 아니면 성공이 아니다. `visual-check` 는 기계 측정이고, 보기 좋은지는
스크린샷(`*.visual-check.*.png`)을 사람이 봐야 한다.

## SVG 떼어내기

`$OUT` 에서 **가장 큰** `<svg>…</svg>` 를 골라 `xa-states.svg` 로 덮어쓴다. 뷰어 아이콘
SVG 가 여러 개 섞여 있어 첫 번째를 집으면 안 된다. 그리고 세 가지를 처리한다.

1. **`id` 에 접두어를 붙인다.** archify 는 `arrowhead`·`grid`·`node-active` 같은 고정 id 를
   쓴다. 한 페이지에 다이어그램이 둘 이상 오면 충돌해 화살촉이 엉킨다. `id="x"` 와
   `url(#x)` 를 같이 바꿔야 한다.
2. **`font-family` 속성을 지운다.** archify 는 자기 mono 글꼴을 루트에 박는다. 지우면
   `main.css` 의 `.diagram svg { font-family: var(--mono) }` 가 사이트 글꼴을 준다.
3. **`>Legend<` 를 `>범례<` 로 바꾼다.** 렌더러가 찍는 유일한 영어 UI 문자열이다.
   `meta.locale` 은 `en` 과 `zh-CN` 만 지원해서 한국어로는 지정할 수 없다. 범례 **항목**은
   `meta.legend.entries.<kind>.label` 로 한국어를 줄 수 있으므로 사양에서 처리한다.

## 손대지 말 것

- **SVG 안의 색을 직접 칠하지 않는다.** archify 는 색을 CSS 변수로만 칠하고,
  `main.css` 의 `.diagram` 블록이 그 변수를 사이트 변수(`--ink`·`--accent`·`--warn-*`)에
  이어 준다. 그래서 사이트의 다크 모드 토글이 다이어그램까지 그대로 끌고 간다.
  직접 칠하면 그 연결이 끊긴다.
- **클래스 정의를 SVG 안에 넣지 않는다.** archify 는 `.c-mask`·`.t-primary`·`.semantic-sigil`
  같은 정의를 생성 HTML 의 `<head>` 에 둔다. SVG 만 떼어 오면 정의가 따라오지 않아 전부
  기본 검정이 된다. 그래서 `main.css` 로 옮겨 두었다. **버전을 올리면 새 클래스가 생기는지
  반드시 확인한다** — 2.10 → 2.17 에서 `semantic-sigil`·`sigil-fill`·`s-*`·`a-dashed`·
  `t-messagebus` 9종이 새로 생겼다.
- **`meta.viewBox` 를 좁히지 않는다.** 폭을 줄이면 종횡비가 세로로 길어져 표준 뷰어가
  1440×900 에서 넘치고 `visual-check` 가 실패한다. 반대로 본문 칼럼(672px)에서는 폭이
  넓을수록 글자가 작아진다. **980×566 이 양쪽을 만족하는 값**이라 찾은 것이다.

## 알려진 제약

- lifecycle 은 밴드 3개를 항상 그린다. 상태가 없는 밴드도 라벨과 구분선이 나온다.
  선언하지 않은 레인은 **영어 기본 라벨**(`Outcomes` 등)을 쓰므로, 비어 있어도 레인을
  선언해 한국어 라벨을 줘야 한다.
- `cards` 는 SVG 밖 HTML 로 렌더되어 추출본에 들어오지 않는다. 표준 뷰어에서만 보이고,
  1440×900 담김을 깨뜨리기도 한다. 내용이 본문 산문과 겹치면 넣지 않는다.
- `states[].tag` 는 박스 안 세 번째 줄에 텍스트로 찍힌다. 2.17 이 추가한 타입별 기호
  (semantic sigil)는 그와 별개로 박스 오른쪽 위에 들어간다 — tag 를 대체하지 않는다.
- 본문 칼럼은 shell 1600 에서 992px 이다. viewBox 폭이 980 이라 콘텐츠(x 769까지)보다
  넓어 오른쪽에 약 150px 빈 격자가 남는다. 이건 viewBox 를 좁혀야 없어지는데, 좁히면
  표준 뷰어가 깨진다(위 참조). 감수하는 쪽을 택했다.
