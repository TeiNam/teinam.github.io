---
title: "요구에서 선택지로"
permalink: /docs/database/choosing-a-database/requirements-to-options/
breadcrumb: "Docs / Database / 데이터베이스 선택 가이드"
description: "DB 선택 — 요구별 선택 표"
updated: 2026-09-20
guide: choosing-a-database
order: 2
nav_title: "요구에서 선택지로"
---

위 세 가지에 답했으면 이 표를 쓴다. 왼쪽 칸은 판단 가능한 형태로 쪼개 두었다 — "속도가 중요하다"는 세 행으로 나뉘고, "쓰기가 많다"는 내구성 요구에 따라 두 행으로 갈린다.

| 요구 | 후보 | 라이선스 주의 |
| --- | --- | --- |
| 여러 레코드를 한 단위로 커밋해야 한다 | MySQL, PostgreSQL, MongoDB | MongoDB 는 SSPL v1 |
| 정규화된 관계를 JOIN 으로 탐색한다 | PostgreSQL, MySQL | — |
| 관계 자체를 여러 홉 탐색한다 | Neo4j | Community 는 GPLv3 |
| **단건 조회 레이턴시**가 지배적이다 | Redis, Valkey, DynamoDB | Redis 는 3중 택1, Valkey 는 BSD |
| **집계·스캔 처리량**이 지배적이다 | ClickHouse, DuckDB | 둘 다 OSI (Apache 2.0 / MIT) |
| **쓰기 수용량**이 크고 유실을 허용하지 않는다 | Apache Cassandra | Apache 2.0 |
| **쓰기 수용량**이 크고 휘발을 감수할 수 있다 | Redis, Valkey | Redis 기본값은 `appendonly no` |
| 지리정보(GIS)를 저장·질의한다 | PostgreSQL + PostGIS, MongoDB | — |
| 기기 안에서 자체 저장한다 | SQLite | 퍼블릭 도메인 |
| 관계형을 유지하며 수평 확장한다 | TiDB, YugabyteDB, Vitess, Aurora DSQL | CockroachDB 는 CSL |
| 비관계형으로 수평 확장한다 | MongoDB, Cassandra | MongoDB 는 SSPL v1 |
| 단순 key:value 저장이 필요하다 | Redis, Valkey, DynamoDB | Redis 는 3중 택1 |
| 전문 검색이 필요하다 | Elasticsearch, OpenSearch | Elasticsearch 는 3중 택1 |

아래 두 묶음은 따로 설명할 값이 있다.

**쓰기가 많다는 요구를 한 칸에 두지 않았다.** Cassandra 와 Redis 를 같은 칸에 묶으면 내구성 요구를 놓친다. Redis 는 기본값이 `appendonly no` 이고, 저장소 원본 `redis.conf` 의 `save` 지시자도 주석 처리되어 있다. 설정을 바꾸지 않으면 프로세스가 죽을 때 데이터가 남지 않는다. 쓰기 처리량이라는 축에서는 같은 방향이지만 내구성 축에서는 정반대다.

**속도는 세 행으로 쪼갰다.** 단건 레이턴시와 집계 처리량은 저장 구조가 서로 반대다. 열 지향 저장소는 정렬된 값을 열 단위로 모아 두어 압축률과 스캔 병렬성을 얻는 대신, 단건 레코드를 꺼내는 경로가 목적이 아니다. 쓰기 수용량은 또 다른 축이어서 내구성 설정과 함께 봐야 한다.

**지리정보의 실체는 확장 이름까지다.** "PostgreSQL" 이 아니라 **PostgreSQL + PostGIS** 로 적어야 재현할 수 있다. PostGIS 는 코어에 포함된 기능이 아니라 별도로 설치하는 확장이므로, 확장 이름이 빠진 선택 기준은 실행 단계에서 막힌다.
