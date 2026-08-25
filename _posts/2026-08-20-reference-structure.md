---
layout: post
title: 레퍼런스를 읽히게 만드는 다섯 가지 구조
category: guides
tags: [api-docs, information-architecture, docs-as-code]
excerpt: 파라미터 표를 늘리는 대신, 독자가 실제로 따라가는 경로를 먼저 설계한다.
updated: 2026-08-24
series: Docs-as-Code 12주
series_index: 04 / 12 · next 08-31
---

파라미터가 200개인 레퍼런스에서 독자가 찾는 것은 대개 세 개뿐입니다. 문제는 분량이 아니라, 그 세 개에 도달하는 경로가 구조에 드러나지 않는다는 점입니다.

## 1. Task 단위로 먼저 자른다

엔드포인트 순서가 아니라 독자의 작업 순서로 목차를 만듭니다. "인증 → 첫 요청 → 오류 처리"가 `/auth, /batch, /webhooks`보다 항상 이깁니다.

> **NOTE** — 작업 목차와 레퍼런스 목차를 하나로 합치지 마세요. 두 독자층의 탐색 방식이 다릅니다.

## 2. 예시는 복사 가능한 최소 형태로

```bash
curl https://api.example.com/v2/docs \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"locale":"ko-KR","depth":2}'
```

## 3. 마이그레이션은 스텝으로

1. 기존 목차를 작업 단위로 재분류합니다.
2. URL이 바뀌는 페이지는 예외 없이 301 맵에 올립니다.
3. 검색 색인을 재구성하고 스니펫 길이를 조정합니다.

## 비교: 문서 사이트 생성기

| Tool | Build | i18n | 적합한 팀 |
| --- | --- | --- | --- |
| Docusaurus | Node | 내장 | 제품 문서 + 블로그를 함께 두는 팀 |
| MkDocs | Python | 플러그인 | 파이썬 스택, 빠른 셋업 |
| Jekyll | Ruby | 플러그인 | GitHub Pages에 그대로 올리는 개인 사이트 |
