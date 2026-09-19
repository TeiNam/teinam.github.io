---
title: "MySQL for Developers"
permalink: /docs/database/mysql-for-developers/
breadcrumb: "Docs / Database"
description: "MySQL 개발에서 지킬 핵심 원칙과 안티패턴 — 정규화·데이터 타입·콜레이션·인덱스·트랜잭션과 락·드라이버 선택·릴리스 정책"
updated: 2026-09-20
guide: mysql-for-developers
order: 0
nav_title: "개요"
redirect_from:
  - /writing/mysql-for-developers/
  - /writing/mysql-guide-for-developers/
---

> **SUMMARY** — 요약
>
> MySQL 개발 시 알아야 할 핵심 원칙과 안티패턴을 정리한 가이드.
> **정규화 → 데이터 타입 → 문자셋·콜레이션 → 인덱스 → 트랜잭션·락 → 안티패턴 → Stored Program → JDBC → 릴리스 정책** 순으로 구성.
> 버전·드라이버 관련 내용은 **2026-09-19 KST 기준**이다. 실제 적용 전에는 각 벤더의 공식 릴리스 노트와 대상 엔진에서 다시 확인한다.

> **INFO** — 적용 범위
>
> - 기본 대상: **MySQL 8.4 LTS 이상, InnoDB**
> - Aurora MySQL 전용 내용은 별도로 표시
> - 시스템 변수의 기본값은 배포판·벤더·설정 파일에 따라 달라지므로, 문서의 숫자를 믿지 말고 대상 서버에서 실측한다 (`SELECT @@GLOBAL.변수명;`)
> - 버전 의존 기능은 운영 적용 전에 공식 문서와 대상 엔진에서 재검증

## 이 가이드의 구성

1. [정규화](/docs/database/mysql-for-developers/normalization/) — 3NF 까지 지키고, 반정규화는 측정 뒤에
2. [데이터 타입](/docs/database/mysql-for-developers/data-types/) — 가장 작은 타입, 문자열·날짜 선택, 함수로 저장하기
3. [문자셋과 콜레이션](/docs/database/mysql-for-developers/charset-collation/) — coercibility, 콜레이션 충돌 에러, 후행 공백, 한국어 함정
4. [인덱스](/docs/database/mysql-for-developers/indexes/) — 복합 인덱스 순서, 기간 조건, OFFSET 함정, EXPLAIN ANALYZE
5. [트랜잭션과 락](/docs/database/mysql-for-developers/transactions-and-locks/) — 격리 수준, 무엇이 잠기는가, 데드락, SKIP LOCKED, 청크 DML
6. [안티패턴](/docs/database/mysql-for-developers/anti-patterns/) — COUNT(*) 존재 검증, 랜덤 PK, 복합키 PK, FK, JSON 컬럼
7. [Stored Program](/docs/database/mysql-for-developers/stored-programs/) — 세션 단위 캐시라는 구조적 한계와 그 파생 문제
8. [JDBC 드라이버](/docs/database/mysql-for-developers/jdbc-drivers/) — 드라이버 비교, 페일오버 감지, 커넥션 풀과 wait_timeout
9. [릴리스 정책](/docs/database/mysql-for-developers/release-policy/) — LTS 와 Innovation, 캘린더 버저닝 전환, 업그레이드 파손 지점
