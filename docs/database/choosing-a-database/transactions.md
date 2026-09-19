---
title: "트랜잭션과 일관성"
permalink: /docs/database/choosing-a-database/transactions/
breadcrumb: "Docs / Database / 데이터베이스 선택 가이드"
description: "DB 선택 — 트랜잭션 제약과 격리 수준"
updated: 2026-09-20
guide: choosing-a-database
order: 4
nav_title: "트랜잭션과 일관성"
---

"관계형은 ACID 를 보장하고 비관계형은 보장하지 않는다" 는 구도는 2026 지형에서 판단 근거가 되지 못한다. 주요 비관계형 제품에도 다중 레코드 트랜잭션이 있고, 대신 **범위·개수·격리 수준·비용에 제약이 붙는다.** 그래서 질문을 바꿔야 한다 — "트랜잭션이 있는가" 가 아니라 **"제약이 내 워크로드에 맞는가"** 다.

### 문서 데이터베이스의 트랜잭션

MongoDB 공식 문서의 서술은 이렇다.

- 단일 문서 연산은 원자적이다.
- 여러 문서에 걸친 원자성이 필요한 상황을 위해 트랜잭션을 지원하며, 그 범위는 "multiple operations, collections, databases, documents, and shards" 다.
- ACID 보장은 무조건이 아니라 조건부다 — "according to the configured read and write concern settings". read concern 과 write concern 을 어떻게 설정했는지가 실제 보장 수준을 결정한다.

즉 샤드를 넘는 트랜잭션까지 지원되지만, 보장의 강도는 설정에 달려 있다. 트랜잭션을 쓰기로 정했다면 read/write concern 값을 설계 문서에 적어야 한다. 기본값에 맡긴 채 "ACID 를 보장한다" 고 쓰면 검증할 수 없는 문장이 된다.

### DynamoDB 의 트랜잭션 제약

DynamoDB 는 `TransactWriteItems` 와 `TransactGetItems` 를 제공한다. 제약은 문서에 수치로 적혀 있다.

| 항목 | 제약 |
| --- | --- |
| `TransactWriteItems` 개수 | 최대 100개 쓰기 액션, 서로 다른 아이템 |
| `TransactGetItems` 개수 | 최대 100개 `Get` |
| 합산 크기 | 4 MB |
| 범위 | 같은 AWS 계정, 같은 리전 |
| 인덱스 | 인덱스를 대상으로는 트랜잭션 불가 |
| 같은 아이템 중복 | 한 트랜잭션 안에서 같은 아이템을 여러 연산으로 지정 불가 |

격리 수준이 **연산별로 다르고**, 이 차이가 실제 사고 지점이다.

| 동시에 도는 연산 | 트랜잭션과의 격리 수준 |
| --- | --- |
| `PutItem` · `UpdateItem` · `DeleteItem` · `GetItem` | Serializable |
| `BatchGetItem` (단위로서) | Read-committed |
| `BatchWriteItem` (단위로서) | **Serializable 이 아니다** |
| `Query` · `Scan` | Read-committed |
| 다른 트랜잭션 연산 | Serializable |

`BatchWriteItem` 이 Serializable 이 아니라는 사실이 가장 자주 누락된다. 트랜잭션으로 보호한 아이템을 다른 경로에서 배치 쓰기로 갱신하고 있으면, 트랜잭션을 걸어 둔 것과 무관하게 순서가 보장되지 않는다. 대량 적재 경로와 트랜잭션 경로가 같은 테이블을 만지는 설계라면 이 행을 먼저 확인한다.

비용과 리전 제약도 설계에 들어간다.

- **비용이 두 배다.** DynamoDB 는 트랜잭션 안의 모든 아이템에 대해 준비와 커밋으로 각각 한 번씩, 총 두 번의 하부 읽기 또는 쓰기를 수행한다. 취소된 트랜잭션도 이 용량을 소비한다.
- **리전을 넘지 못한다.** 트랜잭션의 ACID 보장은 write API 를 호출한 그 리전 안에서만 유효하고, 글로벌 테이블에서 리전 간 트랜잭션은 지원되지 않는다.

### 임베딩으로 트랜잭션을 없애는 선택

MongoDB 문서는 트랜잭션을 설명하는 같은 페이지에서 트랜잭션을 쓰지 않는 방향을 함께 권한다 — 임베디드 문서와 배열로 관계를 담으면 여러 문서와 컬렉션에 걸쳐 정규화하는 대신 한 문서 안에 넣을 수 있고, 그러면 "multi-document transactions are not necessary for many practical use cases" 다.

이것을 제약 회피로 읽으면 안 된다. 위의 제약 표가 보여 주는 것은 **다중 레코드 트랜잭션에 딸린 검토 항목이 많다**는 사실이다. 개수 상한, 크기 상한, 리전 경계, 연산별 격리 수준, 두 배 비용. 원자성 단위를 레코드 하나로 접으면 이 다섯 가지가 모두 사라진다.

그래서 판단 순서는 이렇게 둔다.

1. 원자성 단위를 하나의 레코드나 문서로 접을 수 있는지 먼저 본다. 접히면 여기서 끝난다.
2. 접히지 않으면 필요한 범위를 정한다 — 같은 샤드인지, 같은 리전인지, 글로벌인지.
3. 그 범위를 제품이 보장하는지 확인한다.
4. 동시에 도는 **다른 종류의 연산**과의 격리 수준까지 확인한다.

4번을 건너뛰는 설계가 가장 자주 사고를 만든다.
