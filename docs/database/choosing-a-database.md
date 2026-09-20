---
title: "데이터베이스 선택 가이드"
permalink: /docs/database/choosing-a-database/
breadcrumb: "Docs / Database"
description: "요구를 먼저 정하고 선택지를 고르는 순서. 데이터 모델·일관성·라이선스·분석 계층·로그 저장소. 기준 시점 2026-09"
last_modified_at: 2026-09-20
guide: choosing-a-database
order: 0
nav_title: "개요"
redirect_from:
  - /writing/database-choice/
---

> **INFO** — 이 문서는 제품 목록이 아니라 판단 입력부터 시작한다. 요구를 문장으로 정리한 다음 선택지를 본다. 제품의 버전·라이선스·제약은 2026-09 기준으로 각 제품의 공식 문서, 라이선스 원문, 저장소 릴리스에서 확인한 값이다. 다루지 않는 것이 세 가지 있다 — **가격, 성능 벤치마크, 시장 점유율**. 이 세 축은 공개된 1차 근거로 비교할 수 없고, 벤더가 제시한 수치는 자기 제품에 유리한 조건에서 측정된다. 그래서 이 문서는 "어느 쪽이 더 빠른가"에 답하지 않고 "무엇이 빠르면 되는지"를 먼저 정하게 한다.

데이터베이스 선택이 어긋나는 지점은 제품 지식이 부족한 쪽이 아니다. 요구가 문장으로 정리되지 않은 상태에서 제품 비교를 시작하는 쪽이다.

"속도가 중요하다"는 요구는 그 자체로는 판단에 쓸 수 없다. 단건 조회 레이턴시를 말하는지, 집계 쿼리 처리량을 말하는지, 초당 쓰기 수용량을 말하는지에 따라 답이 반대 방향으로 갈린다. 단건 레이턴시를 원해서 인메모리 저장소를 골랐는데 요구가 실은 집계 처리량이었다면, 선택한 제품은 요구를 하나도 만족시키지 못한다. "트랜잭션이 필요하다"도 마찬가지다. 2026 지형에서 다중 레코드 트랜잭션은 관계형과 비관계형 양쪽에 다 있고, 갈림길은 있냐 없냐가 아니라 **범위·개수·격리 수준의 제약이 내 워크로드에 맞냐**로 옮겨 갔다.

그래서 순서를 뒤집는다. 먼저 요구를 세 문장으로 만들고, 그다음 데이터 모델을 보고, 그다음 라이선스와 운영 부담을 확인한다. 라이선스를 마지막이 아니라 본문에 두는 이유는 하나다 — 2026 현재 주요 데이터베이스 중 여럿이 비-OSI 또는 조건부 라이선스이고, ScyllaDB 와 CockroachDB 는 **라이선스가 기술 규모의 상한을 직접 정한다.**

## 이 가이드의 구성

1. [먼저 정할 세 가지](/docs/database/choosing-a-database/decide-first/) — 원자성 단위·일관성 범위·성장하는 축
2. [요구에서 선택지로](/docs/database/choosing-a-database/requirements-to-options/) — 요구별 선택 표와 라이선스
3. [데이터 모델](/docs/database/choosing-a-database/data-models/) — 관계형·분산 SQL·문서·키값·와이드칼럼·그래프·검색
4. [트랜잭션과 일관성](/docs/database/choosing-a-database/transactions/) — 문서 DB 의 트랜잭션과 DynamoDB 격리 수준 제약
5. [라이선스](/docs/database/choosing-a-database/licensing/) — 규모 상한을 정하는 라이선스와 포크 두 사례
6. [분석 계층](/docs/database/choosing-a-database/analytics/) — OLTP·OLAP 분리, 레이크하우스, 오픈 테이블 포맷, CDC
7. [로그 저장소](/docs/database/choosing-a-database/log-storage/) — 조회 패턴으로 고르기, 시계열과의 경계
8. [운영 부담](/docs/database/choosing-a-database/operations/) — 관리형과 자체 운영의 갈림
9. [현황 확인 경로](/docs/database/choosing-a-database/checking-versions/) — 릴리스가 멈춘 제품과 폐기를 판별하는 방법
