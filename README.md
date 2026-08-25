# rastalion.dev — Jekyll skin

GitHub Pages(Jekyll)에 그대로 올라가는 스킨입니다. 디자인 화면 01~04에 대응합니다.

## 설치

1. 리포지토리 이름을 `<username>.github.io`로 만들거나, 기존 리포에서 Settings → Pages → Source를 `Deploy from a branch` / `main` / `/ (root)`로 둡니다.
2. 이 폴더의 내용을 리포 루트에 복사합니다.
3. `_config.yml`의 `title`, `author`, `url`, `social`, `adsense` 값을 바꿉니다.
4. `git push` → 1~2분 후 배포됩니다.

로컬 미리보기:

```bash
bundle install
bundle exec jekyll serve
```

## 구조

| 경로 | 역할 |
| --- | --- |
| `_layouts/home.html` | 화면 01 — 홈 |
| `_layouts/post.html` | 화면 02 — 아티클 본문 (고정 TOC, 우측 레일) |
| `_layouts/archive.html` | 화면 03 — 글 목록 |
| `_layouts/docs.html` | 화면 04 — 문서 사이드바 레이아웃 |
| `_data/docs_nav.yml` | 문서 사이드바 트리 |
| `assets/css/main.css` | 토큰 + 라이트/다크 전체 스타일 |
| `assets/js/theme.js` | 다크모드 토글(로컬 저장), 목차 자동 생성·하이라이트, 코드 복사 |

## 글 쓰기

`_posts/2026-08-20-my-post.md`:

```markdown
---
layout: post
title: 레퍼런스를 읽히게 만드는 다섯 가지 구조
category: guides
tags: [api-docs, information-architecture]
excerpt: 파라미터를 늘리는 대신 독자의 경로를 먼저 설계한다.
updated: 2026-08-24
---
```

문서 페이지는 `docs/` 폴더에 `layout: docs`로 둡니다.

## 애드센스

`_config.yml`의 `adsense.client`와 각 슬롯 ID를 채우면 본문 중간 / 사이드바 / 홈 리더보드 슬롯이 활성화됩니다. 비우면 슬롯이 렌더되지 않습니다.
