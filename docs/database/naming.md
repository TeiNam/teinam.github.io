---
title: "데이터베이스 네이밍 규칙"
permalink: /docs/database/naming/
breadcrumb: "Docs / Database"
description: "MySQL 8.4·9.7 과 PostgreSQL 18 기준 식별자·제약·인덱스 네이밍 규칙과 데이터 타입 정의"
updated: 2026-09-20
guide: naming
order: 0
nav_title: "개요"
redirect_from:
  - /writing/why-snake-case-in-database/
---

> **INFO** — 적용 범위
>
> 이 규칙집은 **MySQL 8.4 LTS · 9.7 LTS** 와 **PostgreSQL 18** 을 공통 타깃으로 한다. MySQL 8.0 은 2026-04-21 부로 Sustaining Support 로 넘어갔으므로 기준선에서 제외한다. 본문(0~6장)은 **두 엔진 모두에 이식 가능한 규칙**만 담고, 엔진 고유의 타입·옵션은 **부록(A: MySQL / B: PostgreSQL)** 으로 분리한다.
>
> 규칙마다 근거의 무게가 다르다. 엔진 문서가 규정하는 사실, 표준 SQL 이 규정하는 사실, 이 팀이 선택한 컨벤션을 문장에서 구분해 적었다.

## 이 가이드의 구성

1. [케이스 폴딩](/docs/database/naming/case-folding/) — 엔진별 폴딩 방향과 따옴표를 쓰지 않는 근거
2. [공통 규칙](/docs/database/naming/common-rules/) — snake_case, 시각 컬럼, 예약어, 길이, 문자 집합
3. [테이블](/docs/database/naming/tables/) — 접두사 금지, 단수형, 조인 테이블, 룩업 테이블
4. [컬럼](/docs/database/naming/columns/) — 타입별 접두·접미사
5. [제약·인덱스](/docs/database/naming/constraints-indexes/) — 명명 규칙, 길이 한계, 이름의 유일성 범위, 자동 생성 이름
6. [데이터 타입](/docs/database/naming/data-types/) — Boolean·문자열·금액·PK·NULL·콜레이션·시각
7. [약어 정의서](/docs/database/naming/abbreviations/) — 팀 컨벤션으로 정한 약어 목록
8. [부록 A. MySQL](/docs/database/naming/appendix-mysql/) — MySQL 고유 타입·옵션
9. [부록 B. PostgreSQL](/docs/database/naming/appendix-postgresql/) — PostgreSQL 고유 타입·옵션·시퀀스
