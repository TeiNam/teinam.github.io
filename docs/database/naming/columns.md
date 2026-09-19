---
title: "3. 컬럼 네이밍 규칙"
permalink: /docs/database/naming/columns/
breadcrumb: "Docs / Database / 데이터베이스 네이밍 규칙"
description: "네이밍 규칙 — 컬럼 명명"
updated: 2026-09-20
guide: naming
order: 4
nav_title: "컬럼"
---

3장의 접두·접미사 체계는 **팀 컨벤션**이다. 엔진 문서와 표준 SQL 에 대응 규정이 없으므로 지키지 않아도 DDL 은 통과한다.

### 3-1. 타입별 접두/접미사

| 용도 | 규칙 | 예시 |
| --- | --- | --- |
| PK 컬럼 | `<테이블명>_id` | `member_id` |
| FK 컬럼 | `<부모 테이블명>_id` | `member_id` |
| 날짜 (DATE) | `<목적>_date` | `open_date` |
| 날짜+시간 | `<목적>_at` | `publish_at` |
| 코드 | `<목적>_code` | `member_code` |
| 숫자(일련·번호) | `<목적>_no` | `order_no` |
| **Boolean** | **`is_` / `has_` 접두사** | `is_active`, `is_deleted`, `has_coupon` |

생성·수정·삭제 시각은 1-3 에 따라 `created_at`·`updated_at`·`deleted_at` 을 쓴다.

> **IMPORTANT** — Boolean 컬럼 정책
>
> **`is_`/`has_` 접두사 + 네이티브 불리언**을 표준으로 한다. `CHAR(1)` 에 `'Y'`/`'N'` 을 넣는 `use_yn` 형태는 쓰지 않는다.
>
> - 이름: `use_yn` → `is_used`, `del_yn` → `is_deleted`
> - 타입: 선언은 `BOOLEAN`, 값 도메인 보강은 5-1 참고
> - Y/N 데이터가 이미 크게 깔려 있고 앱 코드 의존이 강한 테이블은 마이그레이션 비용을 고려해 기존 방식 유지를 허용하되, **신규 설계는 반드시 표준을 따른다.**

### 3-2. 접미사에 타입을 억지로 끼워넣지 않는다

`_yn` 처럼 타입을 인코딩한 접미사는 쓰지 않는다. 이름은 의미(도메인) 중심으로 짓고 타입은 5장과 부록에서 정한다.

---
