---
title: Docs
permalink: /docs/
breadcrumb: Docs
---

한 편짜리 글로 흩어지면 찾기 어려운 것들 — 설정 절차, 레퍼런스, 체크리스트 — 을 여기에 모읍니다.

<!-- 문서를 추가하면 아래 문단을 지우세요. -->

아직 올린 문서가 없습니다. 새 글은 [Writing]({{ '/writing/' | relative_url }}) 에 있습니다.

## 문서 추가하기

1. `docs/` 아래에 `.md` 파일을 만듭니다. `_config.yml` 의 defaults 가 `layout: docs` 를 자동으로 붙입니다.
2. front matter 에 `title` 과 `permalink` 을 넣습니다.
3. 왼쪽 목록에 띄우려면 `_data/docs_nav.yml` 에 경로를 추가합니다.

```yaml
# _data/docs_nav.yml
- group: 시작하기
  items:
    - { name: 설치, url: /docs/install/ }
```
