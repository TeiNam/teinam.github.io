---
layout: docs
title: API keys
breadcrumb: Guides / Authentication / API keys
prev: { name: Installation, url: /docs/installation/ }
next: { name: Rate limits, url: /docs/rate-limits/ }
---

키는 워크스페이스 단위로 발급되며, 스코프는 발급 시점에 고정됩니다.

> **CAUTION** — 키를 클라이언트 번들에 포함하지 마세요. 노출 시 즉시 폐기됩니다.

## Request

```http
POST /v2/keys
Authorization: Bearer $ADMIN_TOKEN

{ "scopes": ["docs:read"], "ttl_days": 90 }
```

## Parameters

| 파라미터 | 타입 | 설명 |
| --- | --- | --- |
| scopes | array | 허용 범위. 발급 후 변경 불가 |
| ttl_days | integer | 1–365, 기본 90 |
| label | string | 대시보드 표시 이름 |
