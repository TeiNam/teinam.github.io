---
title: "데이터베이스 선택 가이드"
permalink: /docs/database/choosing-a-database/
breadcrumb: "Docs / Database"
description: "요구를 먼저 정하고 선택지를 고르는 순서. 데이터 모델·일관성·라이선스·분석 계층·로그 저장소. 기준 시점 2026-09"
updated: 2026-09-20
redirect_from:
  - /writing/database-choice/
---

> **INFO** — 이 문서는 제품 목록이 아니라 판단 입력부터 시작한다. 요구를 문장으로 정리한 다음 선택지를 본다. 제품의 버전·라이선스·제약은 2026-09 기준으로 각 제품의 공식 문서, 라이선스 원문, 저장소 릴리스에서 확인한 값이다. 다루지 않는 것이 세 가지 있다 — **가격, 성능 벤치마크, 시장 점유율**. 이 세 축은 공개된 1차 근거로 비교할 수 없고, 벤더가 제시한 수치는 자기 제품에 유리한 조건에서 측정된다. 그래서 이 문서는 "어느 쪽이 더 빠른가"에 답하지 않고 "무엇이 빠르면 되는지"를 먼저 정하게 한다.

데이터베이스 선택이 어긋나는 지점은 제품 지식이 부족한 쪽이 아니다. 요구가 문장으로 정리되지 않은 상태에서 제품 비교를 시작하는 쪽이다.

"속도가 중요하다"는 요구는 그 자체로는 판단에 쓸 수 없다. 단건 조회 레이턴시를 말하는지, 집계 쿼리 처리량을 말하는지, 초당 쓰기 수용량을 말하는지에 따라 답이 반대 방향으로 갈린다. 단건 레이턴시를 원해서 인메모리 저장소를 골랐는데 요구가 실은 집계 처리량이었다면, 선택한 제품은 요구를 하나도 만족시키지 못한다. "트랜잭션이 필요하다"도 마찬가지다. 2026 지형에서 다중 레코드 트랜잭션은 관계형과 비관계형 양쪽에 다 있고, 갈림길은 있냐 없냐가 아니라 **범위·개수·격리 수준의 제약이 내 워크로드에 맞냐**로 옮겨 갔다.

그래서 순서를 뒤집는다. 먼저 요구를 세 문장으로 만들고, 그다음 데이터 모델을 보고, 그다음 라이선스와 운영 부담을 확인한다. 라이선스를 마지막이 아니라 본문에 두는 이유는 하나다 — 2026 현재 주요 데이터베이스 중 여럿이 비-OSI 또는 조건부 라이선스이고, ScyllaDB 와 CockroachDB 는 **라이선스가 기술 규모의 상한을 직접 정한다.**

## 먼저 정할 세 가지

이 세 가지에 답하지 못하면 아래의 어떤 표도 쓸 수 없다. 반대로 세 가지에 답하면 후보가 대개 둘셋으로 줄어든다.

### 원자성 단위

첫 질문은 "트랜잭션이 필요한가"가 아니다. **한꺼번에 성공하거나 한꺼번에 실패해야 하는 데이터 묶음이 레코드 하나로 접히는가**다.

MongoDB 공식 문서는 단일 문서 연산이 원자적이라고 명시한다("In MongoDB, an operation on a single document is atomic"). 그리고 같은 문서가 설계 방향을 직접 권한다 — 임베디드 문서와 배열로 관계를 표현하면 "multi-document transactions are not necessary for many practical use cases". 즉 원자성 단위를 하나의 레코드 안으로 접는 것은 회피가 아니라 권장 설계다.

이 질문을 먼저 두는 이유는 답이 "접힌다"일 때 **트랜잭션 축이 선택에서 사라지기** 때문이다. 주문과 주문 항목을 한 문서에 담을 수 있다면 다중 문서 트랜잭션도, 그 트랜잭션의 리전 제약도, 격리 수준 표도 검토할 필요가 없다. 반대로 결제와 재고처럼 서로 다른 수명주기를 가진 데이터를 한 레코드로 묶으면 갱신 경합과 문서 크기 증가를 대신 떠안는다.

판단을 이렇게 쓴다.

| 원자성 단위 | 다음 질문 |
| --- | --- |
| 레코드 하나로 접힌다 | 트랜잭션 축 종료. 데이터 모델과 조회 패턴으로 넘어간다 |
| 두 레코드 이상이 필요하다 | 일관성 범위를 정한다 |
| 접을 수 있지만 갱신 경합이 심하다 | 쪼갠 뒤 일관성 범위를 정한다 |

### 일관성 범위

원자성 단위가 접히지 않으면 다음은 **어느 경계까지 보장이 필요한지**를 정한다. "강한 일관성이 필요하다"로 물으면 답이 나오지 않는다. 같은 레코드인지, 같은 샤드인지, 같은 리전인지, 리전을 넘는지로 물어야 제품이 답할 수 있다.

확인된 경계는 이렇다.

| 필요한 범위 | 확인된 보장 | 제품 |
| --- | --- | --- |
| 단일 레코드 | 원자적 | MongoDB 단일 문서, DynamoDB 단일 아이템 |
| 여러 컬렉션·여러 샤드 | ACID 지원, read/write concern 설정에 따름 | MongoDB |
| 단일 리전 안의 여러 아이템 | 최대 100 아이템·4 MB | DynamoDB `TransactWriteItems` |
| 리전을 넘는 트랜잭션 | 지원하지 않음 | DynamoDB 글로벌 테이블 |
| 분산 SQL 의 격리 수준 | snapshot isolation | Amazon Aurora DSQL |

DynamoDB 문서는 글로벌 테이블의 한계를 문장으로 못박는다 — 트랜잭션의 ACID 보장은 "only within the AWS Region where the write API was invoked" 이고 글로벌 테이블에서 리전 간 트랜잭션은 지원되지 않는다. 멀티 리전 쓰기를 전제한 설계에서 트랜잭션에 기대고 있었다면, 이 한 문장이 아키텍처를 되돌린다.

한 단계가 더 있다. 트랜잭션 자체의 격리 수준만 보면 부족하다. **그 트랜잭션과 동시에 도는 다른 종류의 연산**, 그것의 격리 수준까지 봐야 한다. 실제 사고는 거기서 난다. DynamoDB 는 연산별로 격리 수준이 다르고, 그중 하나는 Serializable 이 아니다. 자세한 표는 아래 "DynamoDB 의 트랜잭션 제약"에 둔다.

### 성장하는 축

세 번째는 **무엇이 커지는가**다. 읽기 요청, 쓰기 요청, 누적 데이터량 중 어느 것이 커지는지에 따라 같은 워크로드가 다른 제품으로 간다.

절대 임계값("몇 TB 를 넘으면 무엇으로 간다")은 공개된 1차 근거로 제시할 수 없다. 대신 제품이 스스로 밝힌 하한과 상한이 있고, 그것들은 근거로 쓸 수 있다.

- **분석 데이터량의 하한** — ClickHouse 문서는 데이터가 "under ~150 GiB and not growing" 이면 다른 선택지를 보라고 자기 제품의 부적합 조건에 적어 두었다.
- **데이터량의 상한이 라이선스로 정해지는 경우** — ScyllaDB 의 무료 사용은 전체 배치 합산 스토리지 10TB, 50 vCPU 상한 안에서만 허용된다.
- **동시성의 상한이 라이선스로 정해지는 경우** — CockroachDB 는 라이선스 키 없이 운영하면 유예 기간 후 동시 오픈 SQL 트랜잭션이 5개로 스로틀된다.
- **쓰기 수평 확장** — MySQL 계열은 Vitess, PostgreSQL 계열은 PlanetScale Neki 가 이 축을 맡는다. Neki 의 공식 설명은 "Horizontal sharding for Postgres: data topology, query routing, online schema changes" 다.
- **확장을 서비스에 맡김** — Aurora DSQL 은 인프라 관리 없이 컴퓨트·I/O·스토리지를 워크로드에 맞춰 조정한다고 문서에 적는다.
- **읽기 확장과 내구성의 트레이드오프** — Redis 는 `replica-read-only yes` 가 기본이고, 쓰기 가능 복제본은 공식 문서에서 "exist only for historical reasons" 로 설명되며 권장되지 않는다.
- **분석 워크로드가 트랜잭션을 침범하지 않게** — TiDB 는 열 저장소 TiFlash 를 행 저장소 TiKV 와 **다른 노드**에 배치하라고 권고한다.

마지막 두 항목은 순수한 기술 제약이 아니라 라이선스 조항이다. 규모 계획을 세우기 전에 라이선스를 읽어야 하는 이유이고, 아래 "라이선스가 규모 상한을 정하는 경우"에서 다시 다룬다.

## 요구에서 선택지로

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

## 데이터 모델별 선택지

요구가 정리됐으면 데이터 모델을 본다. 이 절의 표는 **2026-09 기준으로 릴리스와 라이선스 상태를 확인한 제품만** 담았다. 확인되지 않은 제품을 후보로 나열하면 3년 넘게 릴리스가 없는 제품을 권하는 사고가 난다.

![데이터베이스 유형별 비교 — RDBMS, Key Value, Document, Graph, Wide Column 의 대표 제품과 용도](/assets/img/database-selection-matrix.png)

### 관계형

테이블과 행·열 구조로 저장하고, ACID 로 트랜잭션 무결성을 보장하며, 스키마를 엄격히 정의해 무결성을 유지하고, JOIN 으로 관계를 탐색한다. 표준 SQL 로 정의·조작·제어를 수행한다. 이 모델은 2026 에도 기본값이다 — 요구가 특별히 다른 방향을 가리키지 않으면 여기서 출발한다.

| 제품 | 확인 버전 | 라이선스 |
| --- | --- | --- |
| PostgreSQL | 18.6 | PostgreSQL License |
| MySQL | 9.7 LTS (9.7.3), 8.4 LTS (8.4.11) | GPLv2 + 상업 라이선스 이중 |
| SQLite | — | 퍼블릭 도메인 |

Oracle 과 SQL Server 도 같은 모델의 상업 제품이다.

버전 선택에서 확인해 둘 것이 있다.

- PostgreSQL 은 14부터 18까지 지원하고 메이저 버전당 5년이다. 19 는 2026-09-18 기준 베타이고 정식 출시(GA) 일자는 정해지지 않았다.
- MySQL 8.0 은 2026-04-21 부로 Sustaining Support 로 넘어갔다. 신규 구축의 선택지에서 제외한다.
- MySQL 은 26.7 부터 캘린더 버저닝으로 바뀌었다. 26.10.0 은 Early Access 단계다.
- SQLite 는 퍼블릭 도메인이고, 상업·비상업 구분 없이 복사·수정·판매·배포가 허용된다. 다만 공식 문서가 "SQLite is open-source ... But SQLite is not open-contribution" 이라고 적는다 — 패치를 보내는 경로는 열려 있지 않다.

라이선스 축에서 PostgreSQL 은 예외적인 위치에 있다. 공식 라이선스 페이지가 유지 의사를 문장으로 박아 두었다 — 개발 그룹이 PostgreSQL 을 자유·오픈소스 소프트웨어로 제공하는 데 "in perpetuity" 로 전념하며 라이선스를 바꾸거나 다른 라이선스로 배포할 "no plans" 라고 명시한다. 주요 데이터베이스 중에서 이런 문장을 공식 문서에 두고 있는 사실상 유일한 사례이고, 장기 기준 시스템을 고를 때 실질적인 판단 근거가 된다.

### 분산 SQL 과 HTAP

관계형을 유지하면서 수평 확장을 맡는 계층이다. "대규모 분산 처리가 필요하면 비관계형" 이라는 이분법이 성립하지 않는 이유가 이 계층이다.

| 제품 | 확인 버전 | 날짜 | 라이선스 |
| --- | --- | --- | --- |
| TiDB | v8.5.8 | 2026-08-27 | 원문 미확인 |
| YugabyteDB | v2026.1.1.2 | 2026-09-10 | 코어 Apache 2.0 |
| Vitess | v24.0.3 | 2026-09-03 | 원문 미확인 |
| CockroachDB | — | — | CockroachDB Software License |
| Amazon Aurora DSQL | 관리형 | — | 해당 없음 |

제품별로 판단에 직결되는 사실은 이렇다.

- **TiDB** — v8.5.8 이 릴리스된 것 중 최고 버전이고 v9.0.0-beta.1 이 존재한다. 7.5 계열은 LTS 유지 패치로 v7.5.8 이 2026-09-17 에 나왔다.
- **YugabyteDB** — stable 트랙이 v2026.1.1.2, preview 트랙이 v2.25.2.0 으로 분리돼 있다. 코어는 Apache 2.0 이고 공식 FAQ 가 "100% open source. It is licensed under Apache 2.0" 이라고 적는다.
- **Vitess** — MySQL 호환 워크로드의 수평 샤딩을 맡는다.
- **CockroachDB** — 라이선스가 선택을 바꾸는 사례다. 아래 라이선스 절에서 따로 다룬다.
- **Aurora DSQL** — PostgreSQL 16 과 호환되고, 강한 일관성과 **snapshot isolation** 으로 ACID 트랜잭션을 제공하며 AZ 간·리전 간 내구성을 갖는다고 문서에 명시한다. 가용 리전은 20개다. 제약이 하나 있다 — "Aurora DSQL currently doesn't support cross-continent multi-Region clusters". 대륙을 넘는 멀티 리전 클러스터를 전제했다면 여기서 걸린다.
- **PlanetScale** — 이제 클러스터 종류가 세 가지다. **Vitess**(MySQL 호환 워크로드의 수평 샤딩), **Neki**(Postgres 의 수평 샤딩 — 데이터 토폴로지, 쿼리 라우팅, 온라인 스키마 변경), **Postgres**(완전 관리형 PostgreSQL). "Vitess 기반 MySQL 호스팅" 이라는 한 줄 설명은 더 이상 정확하지 않다.

HTAP 은 이 계층에서 갈라져 나온 성격이다. TiDB 의 열 저장소 확장 TiFlash 가 1차 근거를 제공한다. 공식 문서는 TiFlash 를 "the key component that makes TiDB essentially a Hybrid Transactional/Analytical Processing (HTAP) database" 로 규정하고, 구조를 이렇게 설명한다.

- **쓰기 경로가 한쪽뿐이다.** 데이터를 TiFlash 에 직접 쓸 수 없고, TiKV 에 쓴 뒤 복제한다.
- **복제는 비동기이지만 읽기는 최신을 본다.** 열 복제본은 **Raft Learner** 합의 알고리즘으로 비동기 복제되는데, 읽을 때마다 Leader 에 경량 RPC 로 진행도를 검증하고 MVCC 를 적용해 TiKV 와 같은 **Snapshot Isolation** 수준을 제공하며 최신 데이터 읽기를 보장한다.
- **격리가 설계 목표다.** TiKV 의 쓰기를 막지 않는 낮은 비용으로 동작하며, 워크로드 격리를 위해 TiKV 와 다른 노드에 배치하라고 권고한다.
- **기본값은 복제하지 않는 것이다.** 복제는 테이블 단위로 지원되고, 배포 직후에는 어떤 데이터도 복제되지 않는다. 대상 테이블을 직접 지정해 켠다.
- **선택은 옵티마이저가 한다.** TiDB 는 읽기 비용 통계를 근거로 TiFlash(열 단위)와 TiKV(행 단위) 중 하나를 고르거나 한 쿼리에서 둘을 함께 쓴다.

여기서 읽어야 하는 것은 "한 엔진이 OLTP 와 OLAP 을 다 한다" 가 아니다. **같은 클러스터 안에 행 저장소와 열 저장소를 분리해 두고 옵티마이저가 고르는 구조**다. 분석과 트랜잭션을 분리하라는 원칙은 여전히 대부분의 경우에 유효하고, HTAP 은 그 분리를 클러스터 경계 안으로 옮긴 형태다.

### 문서

JSON·BSON·XML 같은 문서 단위로 저장하며 문서 내부에 다양한 구조를 허용한다. 유연한 필드 스키마, 복합 쿼리, 자동 인덱싱으로 문서 지향 작업에 맞춰져 있다. 원자성 단위를 레코드 하나로 접을 수 있을 때 가장 잘 맞는다.

| 제품 | 확인 버전 | 라이선스 |
| --- | --- | --- |
| MongoDB | 8.3 | Community 는 SSPL v1 |
| Couchbase Server | 8.0 | BSL 1.1 (Change Date 2029-03-01) |

- MongoDB 8.3 은 2026-05 릴리스이고 EOL 은 2029-10-31 이다. 8.0(2029-10-31)과 7.0(2027-08-31)도 지원 중이고, 8.2 는 2026-07-31 로 EOL 이 지났다.
- Couchbase Server 8.0 은 BSL 1.1 대상이다. Change Date 는 2029-03-01, Change License 는 Apache 2.0 이다. 그날까지는 오픈소스가 아니므로 "오픈소스 대안" 으로 읽히면 안 된다.

### 키-값

키와 값의 쌍으로 저장하는 단순 구조다. 단건 조회 경로가 짧아 캐시와 세션 스토어에 자주 쓴다. 이 모델을 고를 때는 RAM 상주 성격과 내구성 설정을 같이 봐야 한다 — 인메모리라는 성격 자체가 독립 분류가 아니라 이 모델의 내구성 설정 문제로 나타난다.

| 제품 | 확인 버전 | 날짜 | 라이선스 |
| --- | --- | --- | --- |
| Redis Open Source | 8.10.1 | 2026-08-17 | RSALv2 / SSPLv1 / AGPLv3 택1 |
| Valkey | 9.1.2 | 2026-08-31 | BSD |
| Amazon DynamoDB | 관리형 | — | 해당 없음 |

Memcached 도 같은 모델의 캐시 제품이다.

**Redis 의 내구성은 설정이 결정한다.** 기본값이 `appendonly no` 이고, 저장소 원본 `redis.conf` 의 `save` 포인트도 주석 처리되어 있다. 이 상태로 배포하면 프로세스가 죽는 순간 데이터가 남지 않는다. 캐시로 쓸 때는 이 기본값이 맞지만, 원본 저장소로 쓸 생각이라면 영속성 설정이 선택의 전제 조건이다.

**복제도 비동기다.** `WAIT` 명령은 N개 복제본의 ack 를 확인해 주는 것이고, 그것으로 CP 성격의 강한 일관성이 되지는 않는다. 쓰기 확인이 필요한 요구에 Redis 복제를 근거로 쓸 수 없다.

버전 유지 폭은 넓다. Redis Open Source 는 8.10.1 외에 8.8.2, 8.6.6, 8.4.6, 8.2.9, 7.4.11, 7.2.16, 6.2.24 를 함께 유지한다. Valkey 는 9.1.2 외에 9.0.6, 8.1.10, 8.0.11, 7.2.14 를 유지한다.

**Valkey 로 옮기는 것은 업그레이드가 아니다.** Valkey 는 Redis OSS 7.2.4 의 포크이고, 공식 마이그레이션 문서가 데이터 파일이 호환되지 않는다고 적는다("Data files are not compatible with Valkey") — Redis CE 7.4 이상에서 온 데이터 파일은 그대로 읽히지 않는다. 프로토콜과 클라이언트 호환은 유지되어 기존 Redis 클라이언트가 코드 변경 없이 접속하고 `redis-cli` 도 양방향으로 동작하지만, 그것과 데이터 파일 호환은 별개다. Valkey 가 `INFO` 에서 여전히 `redis_version:7.2.4` 를 보고하는 것도 같은 맥락이다 — 이 값을 버전 판단에 쓰면 안 된다.

### 와이드 칼럼

컬럼 패밀리(Column Family) 구조를 쓰고 Bigtable 스타일을 따른다. 행별로 가변적인 컬럼을 가질 수 있어 대규모 분산 처리와 수평 확장에 강하다.

| 제품 | 확인 버전 | 라이선스 |
| --- | --- | --- |
| Apache Cassandra | 5.0.9 | Apache 2.0 |
| Apache HBase | — | Apache 2.0 |
| ScyllaDB | — | ScyllaDB Software License Agreement v1.1 |

- Cassandra 5.0.9 는 2026-08-07 릴리스이고 공식 다운로드 페이지가 "Maintained until 8.0 release" 로 유지 범위를 적는다. 4.1.12 와 4.0.21 도 함께 유지된다.
- **ScyllaDB 를 "Cassandra 호환 오픈소스 대안" 으로 고르던 판단은 2026-09 현재 성립하지 않는다.** 저장소 루트의 라이선스 파일명 자체가 `LICENSE-ScyllaDB-Source-Available.md` 이고, 내용은 ScyllaDB Software License Agreement v1.1(2026-04-12)이다. 사용 자격이 **Never Customers** 로 한정되고(직전 12개월간 유상·상업적 관계가 없던 주체), SaaS 나 상업적 dBaaS 로 제공할 수 없고, Licensor 의 현재·미래 제품과 경쟁하는 용도로 쓸 수 없다. 전체 배치 합산 스토리지 상한은 10TB, vCPU 상한은 50 이다. 무료 티어와 유상 유닛을 섞는 "Hybrid" 사용도 금지되며, 위반하면 라이선스가 *ab initio* 로 무효가 되고 정가 소급 청구가 가능하다. 수정본의 소유권은 Licensor 에 귀속된다.

### 그래프

노드(Node)와 엣지(Edge)로 구성된 그래프 구조를 쓴다. 최단 경로나 패턴 매칭처럼 관계 자체를 여러 홉 탐색하는 질의에 맞춰져 있어 소셜 네트워크나 추천 시스템에 쓴다.

| 제품 | 확인 버전 | 날짜 | 라이선스 |
| --- | --- | --- | --- |
| Neo4j | 태그 `2026.08.1` | 2026-08 | Community 는 GPL v3 |
| OrientDB | 3.2.56 | 2026-09-02 | — |

Neo4j 는 버전 체계가 캘린더 버저닝으로 바뀌었다. 그리고 버전을 확인하는 경로에 함정이 있다 — GitHub Releases 가 2017년 항목에서 멈춰 있어 릴리스 API 로는 현재 버전을 알 수 없고, 실제 버전은 태그에 있다. 이 종류의 함정은 아래 "버전과 현황을 확인하는 경로" 에 모아 두었다.

### 검색

전문 검색과 검색 기반 분석을 맡는 계층이다. 두 제품이 같은 뿌리에서 갈라져 나왔고 라이선스와 거버넌스가 선택 축이 된다.

| 제품 | 확인 버전 | 날짜 | 라이선스 |
| --- | --- | --- | --- |
| Elasticsearch | 9.5.4 | 2026-09-15 | SSPL 1.0 / AGPLv3 / ELv2 택1 |
| OpenSearch | 3.8.0 | 2026-08-05 | Apache 2.0 |

- Elastic 은 Elasticsearch 를 "distributed search and analytics engine, scalable document store, and vector database" 로 규정한다. Lucene 기반이다.
- 로그처럼 타임스탬프가 붙은 append-only 데이터에는 Elasticsearch 공식 문서가 **data stream** 을 권한다 — "The recommended approach for timestamped, append-only data like logs, events, and metrics". 일반 인덱스로 로그를 받고 있다면 이 권고가 먼저다.
- OpenSearch 는 프로젝트 전체가 Apache 2.0 이고 CLA 가 없다("It's all Apache 2.0. There's no Contributor License Agreement"). 거버넌스는 **OpenSearch Software Foundation** 이 맡으며 The Linux Foundation 의 프로젝트로 조직됐다. Governing Board 는 예산을 보되 기술 감독에는 관여하지 않는다("is not involved in technical oversight"). Premier 멤버는 AWS, IBM, SAP SE, Uber 다.

선택 축은 라이선스와 거버넌스다. Elasticsearch 는 AGPLv3 옵션이 있어 "오픈소스가 아니다" 라는 단정은 맞지 않고, OpenSearch 는 단일 라이선스에 재단 거버넌스라는 점이 다르다. 두 제품의 기능 범위 비교는 이 문서의 범위 밖이다.

## 트랜잭션과 일관성

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

## 라이선스가 선택을 뒤집을 때

라이선스를 각주로 두면 안 되는 이유는 두 가지다. 첫째, 2026 현재 주요 데이터베이스 중 여럿이 비-OSI 또는 조건부 라이선스다. 둘째, ScyllaDB 와 CockroachDB 에서는 **라이선스 조항이 기술 규모의 상한을 직접 정한다.** 기술 사양처럼 읽히지 않으므로 규모 계획 단계에서 놓치기 쉽다.

### 현재 라이선스 지형

| 제품 | 라이선스 (2026-09) | OSI 오픈소스 |
| --- | --- | --- |
| PostgreSQL | PostgreSQL License | 예 |
| MySQL | GPLv2 + 상업 라이선스 이중 | GPLv2 쪽은 예 |
| SQLite | 퍼블릭 도메인 | 해당 없음 |
| Redis Open Source | RSALv2 / SSPLv1 / AGPLv3 택1 | AGPLv3 만 |
| Valkey | BSD | 예 |
| MongoDB Community | SSPL v1 | 아니오 |
| Elasticsearch · Kibana (소스) | SSPL 1.0 / AGPLv3 / ELv2 택1 | AGPLv3 만 |
| OpenSearch | Apache 2.0 | 예 |
| Apache Cassandra | Apache 2.0 | 예 |
| ScyllaDB | ScyllaDB Software License Agreement v1.1 | 아니오 |
| Couchbase Server 8.0 | BSL 1.1 (→ 2029-03-01 Apache 2.0) | 아니오 |
| Neo4j Community | GPL v3 | 예 |
| CockroachDB | CockroachDB Software License (CSL) | 아니오 |
| YugabyteDB (코어) | Apache 2.0 | 예 |
| ClickHouse | Apache 2.0 | 예 |
| DuckDB | MIT | 예 |
| Grafana Loki | AGPLv3 | 예 |
| VictoriaMetrics | Apache 2.0 | 예 |
| TimescaleDB | Apache 2.0 + Timescale License 분할 | 부분적 |
| Apache Iceberg · Druid · HBase · Hudi | Apache 2.0 | 예 |

세 가지를 따로 읽어야 한다.

**MongoDB 는 SSPL v1 을 유지하고 있다.** 2018-10-16 이후 릴리스 전부와 그 이전 버전의 패치까지 SSPL v1 대상이고, 그 이전 버전은 AGPL v3.0 이다. Redis 나 Elastic 처럼 AGPL 을 선택지로 추가한 것이 아니다.

SSPL §13 의 핵심은 프로그램의 기능을 서비스로 제3자에게 제공하면 **Service Source Code** 를 누구에게나 무료로 네트워크 다운로드할 수 있게 공개해야 한다는 조항이다. 그 범위에 관리 소프트웨어, 사용자 인터페이스, API, 자동화·모니터링·백업·스토리지·호스팅 소프트웨어가 포함된다. 사내 사용과 서비스 제공의 경계가 여기서 갈린다.

드라이버는 Apache 2.0, 문서는 Creative Commons 이고 상표는 코드 라이선스와 별개다. §14 에 주의할 조항이 하나 더 있다 — 프로그램이 라이선스 버전 번호를 명시하지 않으면 MongoDB, Inc. 가 발행한 아무 버전이나 선택할 수 있다.

**TimescaleDB 는 디렉터리로 라이선스가 갈린다.** `tsl/` 밖은 Apache 2.0, `tsl/` 안은 Timescale License 다. 이름에 `-tsl` 이 들어간 공유 오브젝트 바이너리가 TSL 대상이다. "TimescaleDB 는 오픈소스" 라는 한 문장으로 끝낼 수 없고, 쓰려는 기능이 어느 쪽에 있는지 확인해야 한다.

**라이선스 리스크가 낮다고 1차 근거로 말할 수 있는 것도 있다.** PostgreSQL 은 유지 의사를 공식 문서에 문장으로 남겼다. SQLite 는 퍼블릭 도메인이다. OpenSearch 는 Apache 2.0 에 CLA 가 없고 Linux Foundation 거버넌스 아래 있다. Valkey 는 BSD 를 유지하며 같은 재단에 있다. 장기 기준 시스템이라면 이 네 항목이 실질적인 차이를 만든다.

### 라이선스가 규모 상한을 정하는 경우

> **WARNING** — 다음 두 제약은 성능 한계나 기술 사양이 아니라 **라이선스 조항**이다. 아키텍처 문서나 용량 산정 표에는 나타나지 않으므로, 규모 계획을 세우기 전에 라이선스 원문을 읽어야 한다.
>
> **ScyllaDB** — 무료 사용 자격이 Never Customers 로 한정되고, 전체 배치 합산 스토리지 **10TB**, **50 vCPU**(하이퍼스레드 기준)를 넘을 수 없다. SaaS·상업적 dBaaS 제공과 경쟁 제품 용도는 금지된다. 무료와 유상을 섞는 사용도 금지이며, 위반 시 라이선스가 *ab initio* 무효가 되고 정가 소급 청구가 가능하다.
>
> **CockroachDB** — 24.3.0 릴리스 이후 전 버전과 23.1~24.2 의 패치가 CockroachDB Software License 대상이다. Free 라이선스는 **연매출 1천만 달러 미만** 사업체에만 해당하고(모회사·계열사 합산, 정부기관 제외), 기능은 Enterprise 와 같다. 라이선스 키 없이 운영하면 7일 유예 후 **동시 오픈 SQL 트랜잭션이 5개로 스로틀**된다. Free 와 Trial 은 텔레메트리가 필수이고, 중단하면 같은 7일 유예 후 스로틀된다. 단일 노드 개발 용도(`start-single-node`, `demo`)는 키가 필요 없고 스로틀도 없다. Cloud 배포는 자동으로 Enterprise 다.

두 제약의 성격이 다르다는 점도 판단에 들어간다. ScyllaDB 의 상한은 **데이터가 자라면** 닿고, CockroachDB 의 스로틀은 **트래픽이 자라면** 닿는다. 프로토타입 단계에서는 둘 다 걸리지 않으므로, 검증 환경에서 문제가 없었다는 사실이 근거가 되지 못한다.

### 포크가 생긴 두 사례

라이선스 변경이 프로젝트를 둘로 갈라놓은 사례가 두 건 있다. 두 사례 모두 지금은 원본과 포크가 함께 릴리스되고 있어서, 선택은 "어느 쪽이 살아남는가" 가 아니라 "내 배포 형태에 어느 라이선스가 맞는가" 다.

**Redis 와 Valkey.** Valkey 는 Redis OSS 7.2.4 의 포크이고 BSD 를 유지한다. Redis 는 8.0 부터 AGPLv3 를 선택지에 추가해 세 라이선스 중 하나를 고르는 형태가 됐고, 그중 AGPLv3 만 OSI 승인 라이선스다. 즉 "Redis 에는 오픈소스 옵션이 없다" 는 2024~2025년의 판단은 더 이상 맞지 않다. 다만 AGPL 에는 네트워크 조항이 있어 별도 검토가 필요하고, 데이터 파일 비호환 때문에 Redis 8.x 에서 Valkey 로 가는 경로는 업그레이드가 아니다.

**Elasticsearch 와 OpenSearch.** Elasticsearch 소스는 SSPL 1.0, AGPLv3, Elastic License v2 셋 중 이용자가 고른다. AGPL 추가는 2024-08-29 에 발표됐고 8.16 릴리스가 일반 공개되기 전에 적용하는 것으로 예고됐다 — **8.16 이 경계**다. 소스와 배포본은 별개라는 점도 확인해야 한다. 배포본과 릴리스는 Elastic License 로 계속 제공된다. 클라이언트 라이브러리는 Apache 2.0 을 유지하고, 라이선스 변경 대상은 Elasticsearch 와 Kibana 뿐이다. 그 이전 이력은 Apache 2.0 에서 SSPL + ELv2 로 옮긴 시점이 7.11 릴리스 직전이었다. OpenSearch 는 이 과정에서 갈라져 나와 Apache 2.0 단일 라이선스와 재단 거버넌스를 유지하고 있다.

판단 축을 정리하면 이렇다. **관리형 서비스를 쓴다면** 라이선스가 선택에 미치는 영향이 작다. **직접 재배포하거나 서비스로 제공한다면** RSALv2 의 매니지드 제공 금지, SSPL 의 서비스 소스 공개 의무, AGPL 의 네트워크 조항이 모두 검토 대상이 된다.

## 분석 계층

통계와 전처리된 데이터를 담는 저장소는 서비스 데이터베이스와 별개 영역으로 둔다. 2026 기준으로 이 결정에서 먼저 정할 것은 "어느 엔진" 이 아니라 **"데이터를 어느 포맷으로 어디에 둘 것인가"** 다. 오브젝트 스토리지 위의 오픈 테이블 포맷과 엔진 내부 스토리지 중 무엇을 고르는지에 따라 이후 선택지 전체가 달라진다.

### OLTP 와 OLAP 을 분리하는 기준

분리의 근거는 "데이터가 많아서" 가 아니다. 저장 구조와 격리 요구가 다르기 때문이다.

**저장 구조가 다르다.** ClickHouse 문서는 열 지향 저장의 성격을 이렇게 설명한다 — 값이 정렬된 상태로 저장되는 열 지향 구조라서 압축이 매우 잘 되고, 선형 스캔이 고도로 병렬화되어 머신의 모든 코어를 쓴다. 그리고 대안 기술이 역색인에 의존하는 방식과 대비시킨다 — 역색인 접근은 결국 높은 디스크·리소스 사용으로 이어진다는 것이다. ClickHouse 자신은 역색인을 "an additional optional index type" 으로만 두고 기본은 병렬 선형 스캔이다. 단건 레코드를 키로 꺼내는 경로가 목적인 OLTP 엔진과는 설계 목표가 겹치지 않는다.

**한 엔진에 둘을 넣으면 격리를 따로 설계해야 한다.** 이 점의 반대 방향 증거가 TiDB 다. TiDB 는 열 저장소를 별도 노드로 떼어 Raft Learner 로 복제하고, 워크로드 격리를 위해 TiKV 와 다른 노드에 배치하라고 권고한다. 즉 한 클러스터 안에서 두 워크로드를 돌리는 제품조차 **물리적 분리를 권고한다.** 같은 노드에서 분석 쿼리와 트랜잭션을 함께 돌리는 구성은 두 워크로드가 서로의 응답 시간을 흔든다.

그래서 기본값은 분리다. 다만 "항상 별개" 라고 단정할 수는 없게 됐다 — HTAP 이 그 분리를 클러스터 경계 안으로 옮긴 형태로 존재하기 때문이다.

### 레이크하우스와 오픈 테이블 포맷

오브젝트 스토리지에 둔 파일 위에 테이블 의미를 부여하는 계층이다. 스키마 진화, 행 수준 삭제, 스냅숏, time travel 같은 기능이 이 포맷 수준에서 정의된다.

Apache Iceberg 스펙의 현재 상태는 공식 스펙 문서에 적혀 있다 — 버전 1, 2, 3 은 완료되어 커뮤니티에 채택됐고, **버전 4 는 활발히 개발 중이며 아직 공식 채택되지 않았다.**

| 스펙 버전 | 제목 | 내용 |
| --- | --- | --- |
| v1 | Analytic Data Tables | 불변 Parquet·Avro·ORC 파일 위의 대규모 분석 테이블 |
| v2 | Row-level Deletes | delete file 로 데이터 파일 재작성 없이 행 삭제·치환 |
| v3 | Extended Types and Capabilities | 나노초 timestamp, unknown·variant·geometry·geography 타입, 컬럼 기본값, 다인자 transform, row lineage, deletion vector, 암호화 키 |
| v4 | Metadata Structure and Representation | 메타데이터 구조 재편, 메타데이터의 상대 경로 지원 |

폐기된 스펙 버전은 없다. v1 로 쓴 파일은 테이블을 v2 로 올린 뒤에도 유효하며, 스펙 부록이 v1 메타데이터를 읽을 때 v2 필드의 기본값을 어떻게 처리할지 규정한다. Java 구현의 확인된 최신 버전은 1.11.0(2026-05-20)이다.

이 포맷이 사실상의 기준선으로 수렴하는 중이라고 말할 근거는 **경쟁 관계인 벤더들이 각자 Iceberg 경로를 공식 문서에 담았다**는 사실이다. 확인된 네 곳은 이렇다.

- **AWS S3 Tables** — table bucket 이라는 별도 버킷 타입이 있고, 이 버킷은 테이블을 Apache Iceberg 형식으로 저장한다. 자동 유지관리로 compaction, snapshot management, unreferenced file removal 을 수행하고 Glue Data Catalog 와 통합된다. 쿼리는 Iceberg 를 지원하는 엔진으로 하며 문서가 Amazon Athena, Amazon Redshift, Apache Spark 를 든다. IAM 네임스페이스가 `s3tables` 로 따로 있다.
- **Snowflake** — Iceberg 스펙 v1, v2, v3 을 지원하고 row-level equality deletes 는 제외된다. 파일 포맷은 Parquet 만이다. 두 유형으로 갈린다 — Snowflake 를 카탈로그로 쓰면 읽기·쓰기가 모두 되고 compaction 같은 수명주기 유지관리를 Snowflake 가 맡는다. 외부 카탈로그를 쓰면 플랫폼 지원이 제한되고 테이블의 수명주기 관리를 Snowflake 가 담당하지 않는다. Iceberg 테이블은 모든 계정, 모든 클라우드, 모든 리전에서 사용할 수 있다.
- **Google BigQuery** — "Apache Iceberg managed tables" 로 제공되며, 문서가 이전 명칭이 "BigLake tables for Apache Iceberg in BigQuery" 였다고 적는다. BigQuery 가 테이블을 관리하지만 데이터는 사용자의 Cloud Storage 버킷에 있다. GoogleSQL DML, Storage Write API 스트리밍, Iceberg V2 스냅숏 내보내기와 자동 갱신, 스키마 진화, time travel, 컬럼 수준 보안, 다중 문장 트랜잭션을 지원한다. 자동 최적화는 Data Compute Unit 으로 과금된다.
- **Databricks** — UniForm 으로 Iceberg 메타데이터를 자동 생성해서, 파일을 재작성하지 않고 Iceberg 클라이언트가 Delta Lake 데이터를 읽게 한다. 문서 표현은 "A single copy of the data files supports both Delta and Iceberg clients" 다. DBR 14.3 LTS 이상이 필요하고 Unity Catalog 를 Iceberg 카탈로그로 노출할 수 있다. Delta Sharing 수신자가 Iceberg REST Catalog API 로 읽는 경로는 Public Preview 단계다.

> **IMPORTANT** — "포맷을 Iceberg 로 정하면 엔진 종속이 사라진다" 는 결론으로 가면 안 된다. **엔진마다 지원하는 스펙 버전과 쓰기 가능 범위가 다르다.**
>
> | 엔진 | 확인된 지원 범위 |
> | --- | --- |
> | Snowflake | 스펙 v1, v2, v3 (row-level equality deletes 제외) |
> | AWS Athena | Iceberg v2 테이블만 생성·조작, 라이브러리 버전 1.4.2 |
> | AWS S3 Tables | Iceberg 형식 저장, 문서에 Iceberg V3 항목 존재 |
> | Databricks UniForm | Iceberg 클라이언트는 읽기 전용, 쓰기 미지원 |
>
> Athena 는 AWS Glue 카탈로그만 지원하고 Glue 의 optimistic locking 만 쓴다. Databricks 문서는 Iceberg 클라이언트 지원이 읽기 전용이며 쓰기는 지원하지 않는다고 명시한다. 즉 **읽기 경로는 여러 엔진으로 열리지만 쓰기 경로는 여전히 한 엔진에 묶인다.**

Delta Lake 와 Apache Hudi 도 살아 있다. Delta Lake 의 확인된 최신 버전은 4.4.0(2026-08-20), Apache Hudi 는 1.2.0(2026-05-23)이다. AWS Athena 문서는 세 포맷을 "TransactionTable Formats (TTFs) like Apache Iceberg, Apache Hudi, and Linux Foundation Delta Lake" 로 묶어 함께 다룬다. 비대칭이 하나 있다 — Databricks 조차 Delta 테이블을 Iceberg 로 **읽히게** 만드는 방향으로 상호운용성을 제공하고, 반대 방향의 동등한 기능은 해당 문서에서 확인되지 않는다.

### 관리형 데이터 웨어하우스

분석 계층은 배치 형태가 세 가지로 갈린다. 같은 워크로드가 형태에 따라 완전히 다른 운영 부담을 만든다.

| 배치 형태 | 제품 | 확인 버전 |
| --- | --- | --- |
| 인프로세스 (서버 없음) | DuckDB | 1.5.5 |
| 자체 운영 서버 | ClickHouse, Apache Druid | 26.8.8.8-lts, 37.0.0 |
| 관리형 서비스 | Snowflake, BigQuery, Amazon Redshift, Databricks | 해당 없음 |

- **DuckDB** 는 인프로세스 엔진이라 별도 서버가 없다. MIT 라이선스이고 확인된 최신 버전은 1.5.5(2026-07-22)다. 분석 대상이 한 프로세스 안에서 처리 가능한 규모면 클러스터를 세울 이유가 사라진다.
- **ClickHouse** 는 LTS 와 stable 채널을 병행한다. 확인된 값은 26.8.8.8-lts 와 26.7.12.6-stable 이고 둘 다 2026-09-19 기준이다. Apache 2.0 이다.
- **Apache Druid** 의 확인된 최신 버전은 37.0.0(2026-05-08)이고 ASF 프로젝트다.
- **관리형 네 곳**은 앞 절에서 본 것처럼 각자 Iceberg 경로를 문서화했다. Amazon Redshift 는 S3 Tables 의 쿼리 엔진 중 하나로 AWS 문서에 명시된다.

### CDC — 원본에서 분석 계층으로

원본 데이터베이스의 변경을 분석 계층으로 흘리는 경로다. 대표적인 오픈소스 구현은 Debezium 이고, 확인된 최신 final 릴리스는 3.6.3.Final 이다. 3.7.0 은 Beta2 단계다.

> **WARNING** — **CDC 스트림은 원본의 트랜잭션 경계를 보존하지 않는다.** DynamoDB 문서는 이 점을 명시적으로 경고한다 — 같은 트랜잭션에서 나온 스트림 레코드가 서로 다른 시점에 나타날 수 있고 다른 트랜잭션의 레코드와 섞일 수 있으므로, 스트림 소비자는 트랜잭션 원자성이나 순서 보장을 가정하면 안 된다.
>
> 다운스트림에서 원본 트랜잭션을 재구성할 수 있다고 가정한 파이프라인은 정합성 사고를 만든다. 원자성이 필요한 집계는 스트림 소비 측에서 다시 정의하거나, 원본에서 이미 원자적인 단위(단일 레코드)로 만들어 보내야 한다.

이 경고는 특정 제품의 문제가 아니라 CDC 라는 방식의 성격이다. 앞의 "먼저 정할 세 가지" 에서 원자성 단위를 레코드 하나로 접었다면 이 문제도 같이 사라진다는 점에서, 세 질문의 효과가 분석 계층까지 이어진다.

## 로그 저장소

### 데이터베이스에서 분리하는 이유

세 가지가 흔히 근거로 꼽히고, 두 가지가 더 있다.

1. **저장·조회 구조가 다르다.** 로그는 쌓이는 속도가 빠르지만 더 정확한 근거는 속도가 아니라 구조다. 로그 조회는 시간 범위 스캔과 전문 검색이 지배적이고, OLTP 엔진의 인덱스 구조는 그 목적이 아니다. Loki 는 "expensively indexing every line of your logs" 를 피하는 것을 설계 목표로 명시한다.
2. **서비스 장애 때도 쌓여야 한다.** 로그 적재 경로가 서비스 데이터베이스와 분리되어 있으면 데이터베이스가 죽은 상황의 원인도 로그로 남는다. 장애 원인을 찾아야 하는 순간에 로그 경로가 같이 죽는 구성은 그 자체가 장애를 길게 만든다.
3. **조회 요구가 서비스 레벨까지 올라올 수 있다.** 이 경우 저장소 선택이 어려워지므로 조회 패턴을 먼저 정의해야 한다 — 다음 절의 내용이다.
4. **보존 기간과 스토리지 계층화가 다르다.** Loki 는 오브젝트 스토리지를 유일한 저장 수단으로 삼고 S3, GCS, Azure Blob 을 쓴다(개발용으로 로컬 파일시스템). AWS S3 Tables 는 Intelligent-Tiering 을 이용한 비용 최적화를 별도 문서 항목으로 둔다. 즉 로그 저장소는 계층화와 수명주기를 전제로 설계돼 있고, OLTP 데이터베이스에는 그 기능이 없다.
5. **압축 특성이 다르다.** 열 지향 저장은 정렬된 값을 모아 두어 압축률을 얻는다. 같은 데이터를 행 지향 OLTP 테이블에 넣으면 같은 압축 효과를 기대할 수 없다.

### 조회 패턴으로 고르기

선택을 가르는 축은 저장 용량이 아니라 **조회 패턴**이다. 네 가지로 갈린다.

| 조회 패턴 | 선택지 | 라이선스 |
| --- | --- | --- |
| 라벨 + 시간 범위로 좁힌다 | Grafana Loki | AGPLv3 |
| 전문 검색이 필요하다 | OpenSearch, Elasticsearch | Apache 2.0 / 3중 택1 |
| 집계·분석 쿼리를 돌린다 | ClickHouse | Apache 2.0 |
| 저비용 보존 + 간헐 조회 | S3 Tables + Athena | 해당 없음 |

제품별로 확인된 설계 성격은 이렇다.

- **Grafana Loki** — 로그 내용을 색인하지 않고 라벨 집합 형태의 **메타데이터만** 색인한다. 그래서 색인이 다른 로그 집계 도구보다 현저히 작다. Prometheus 에서 영향을 받았지만 메트릭이 아니라 로그에 초점을 두고, pull 이 아니라 **push** 로 수집한다. 저장은 오브젝트 스토리지가 유일한 수단이다. 확인된 최신 버전은 3.7.8(2026-09-17)이다. 라벨로 좁혀지지 않는 임의 문자열 검색이 주된 조회 패턴이면 이 설계가 맞지 않는다.
- **Elasticsearch · OpenSearch** — 전문 검색이 목적이면 여기다. Elasticsearch 는 로그·이벤트·메트릭처럼 타임스탬프가 붙은 append-only 데이터에 **data stream** 을 권한다. OpenSearch 는 Apache 2.0 단일 라이선스다.
- **ClickHouse** — 열 지향 저장과 병렬 선형 스캔으로 집계를 처리한다. 다만 단독 해법이 아니라는 점을 **문서가 스스로 밝힌다** — "ClickHouse alone isn't an out-of-the-box solution for Observability" 이고, 시각화는 Grafana, 수집은 OpenTelemetry 와 조합해야 한다.
- **S3 Tables + Athena** — 보존 비용을 낮추고 조회는 드물게 하는 구성이다. S3 Tables 가 Iceberg 형식 저장과 자동 compaction·snapshot 관리, Glue Data Catalog 통합을 맡고, Athena 가 Iceberg v2 테이블을 읽고 쓴다.

ClickHouse 문서에는 드문 형태의 1차 근거가 하나 더 있다 — **벤더가 자기 제품의 부적합 조건을 직접 적어 두었다.** 아래 셋 중 하나에 해당하면 다른 선택지를 보라고 문서가 권한다.

1. 메트릭 축이 필요하다 — 메트릭 pillar 는 ClickHouse 에서 아직 덜 성숙했고 Prometheus 포맷과 PromQL 지원이 대기 중이다.
2. 데이터가 약 150 GiB 미만이고 늘지 않는다.
3. SQL 을 쓰고 싶지 않거나, 패키지로 묶인 종단 간 관측성 경험을 원한다.

세 조건은 그대로 선택 기준으로 쓸 수 있다. 관측성 저장소를 고를 때 가장 먼저 대조할 목록이다.

### 시계열·메트릭은 로그가 아니다

로그 저장소를 고르면서 메트릭까지 같은 곳에 넣으려는 설계가 자주 나온다. 경계를 정의하는 가장 깔끔한 1차 근거는 Loki 문서가 자신을 Prometheus 와 대비시키는 문장이다 — **메트릭이 아니라 로그**에 초점을 두고, **pull 이 아니라 push** 로 수집한다. 데이터의 성격(이산 이벤트 대 시간축 위의 수치)과 수집 방향(push 대 pull)이 둘 다 다르다.

| 제품 | 확인 버전 | 날짜 | 라이선스 |
| --- | --- | --- | --- |
| Prometheus | 3.14.0 | 2026-08-18 | — |
| VictoriaMetrics | v1.152.0 | 2026-09-14 | Apache 2.0 |
| TimescaleDB | 2.30.1 | 2026-09-17 | Apache 2.0 + TSL 분할 |
| InfluxDB 3 Core | 3.11 | 2026-09-08 | — |

- **TimescaleDB** 는 독립 제품이 아니라 PostgreSQL **확장**이다. PostgreSQL 16, 17, 18 빌드가 제공된다. 라이선스가 디렉터리로 갈리므로(`tsl/` 안이 Timescale License) 쓰려는 기능이 어느 쪽인지 먼저 확인한다.
- **InfluxDB 3** 는 Core 와 Enterprise 의 경계를 공식 문서가 명시한다. Enterprise 가 추가하는 것이 과거 이력 조회 기능과 단일 시리즈 인덱싱, 고가용성, 읽기 복제본이고, 강화된 보안·행 수준 삭제·통합 관리 UI 는 예정 항목으로 표시돼 있다. 장기 이력 조회가 요구에 있으면 이 경계가 선택을 정한다.

"하나의 저장소로 로그·메트릭·트레이스를 모두 덮는다" 는 구성은 2026-09 현재 벤더 스스로도 단정하지 않는다. ClickHouse 가 메트릭 축의 미성숙을 자기 문서에 적은 것이 그 증거다. 세 축을 한 저장소로 통합하려면 그 통합이 제품 문서로 뒷받침되는지 확인하고, 안 되면 축별로 나누는 쪽이 검증 가능하다.

## 운영 부담과 팀 역량

같은 제품이 관리형과 자체 운영에서 전혀 다른 선택지가 된다. 자체 운영을 고를 때 떠안는 항목은 **제품 문서가 직접 요구하는 것**만 모아도 판단에 충분하다.

| 제품 | 자체 운영이 떠안는 것 |
| --- | --- |
| Redis | Sentinel 최소 3 인스턴스, 독립 실패 도메인 분산, 실제 failover 테스트 |
| Redis (소스 빌드) | 버전이 고정된 빌드 의존성 |
| TiDB | 노드 종류 증가, 테이블별 열 복제 수동 활성화 |
| Iceberg 자체 관리 | compaction, snapshot 관리, 미참조 파일 제거 |
| ClickHouse 관측성 | 수집기와 시각화를 따로 붙이기 |
| Loki | 오브젝트 스토리지 운영 |

항목별로 확인된 근거는 이렇다.

- **Redis 의 고가용성은 구성 요소가 늘어난다.** 공식 문서는 견고한 배포에 최소 세 개의 Sentinel 인스턴스가 필요하다고 적고, 이들을 서로 독립적으로 실패하는 머신이나 가용 영역에 분산하라고 요구한다. 그리고 **실제 failover 를 주기적으로 테스트하지 않으면 고가용성 구성이 안전하지 않다.** 영속성을 끈 마스터에 자동 재시작을 붙인 조합은 데이터가 전부 사라질 수 있는 구성이다.
- **Redis 8.x 소스 빌드는 의존성 버전에 민감하다.** LLVM 21, CMake 3.25~3.31.6(4.x 는 실패), Rust 1.94 같은 조건이 걸린다. 빌드 환경을 직접 유지할 계획이면 이 고정값이 운영 항목으로 들어온다.
- **TiDB 는 노드 종류가 늘어난다.** TiFlash 를 TiKV 와 다른 노드에 두라는 권고가 곧 운영해야 하는 노드 종류의 증가다. 그리고 열 복제는 기본적으로 켜지지 않으므로 테이블별로 직접 활성화해야 한다.
- **Iceberg 를 직접 관리하면 관리형이 대신 해 주던 일이 그대로 남는다.** 목록은 벤더 문서가 알려 준다 — S3 Tables 는 compaction, snapshot management, unreferenced file removal 을 자동으로 수행한다고 적고, Snowflake 는 자사 카탈로그로 관리하는 테이블에 대해 compaction 같은 수명주기 유지관리를 전부 담당한다고 적는다. 반대로 외부 카탈로그를 쓰면 Snowflake 가 테이블 수명주기 관리를 담당하지 않는다. 이 문장들이 곧 자체 운영 항목 목록이다.
- **ClickHouse 로 관측성을 구성하면 세 조각이 된다.** 저장은 ClickHouse, 수집은 OpenTelemetry, 시각화는 Grafana 다. 문서가 직접 그렇게 적는다.
- **Loki 의 안정성은 오브젝트 스토리지의 안정성이다.** 문서 표현은 "Loki inherits the reliability and stability of the underlying object store" 다. 뒤집으면 오브젝트 스토리지 운영이 전제 조건이다.

팀 역량 축에서 1차 근거로 말할 수 있는 것은 셋이다.

- **SQL 을 쓸 수 있는지가 실제 갈림길이다.** ClickHouse 가 자기 부적합 조건에 "SQL 을 쓰고 싶지 않다면 다른 걸 보라" 를 직접 넣었다. 분석 계층 선택에서 이 조건이 다른 어떤 기술 지표보다 먼저 걸린다.
- **기존 기술을 재사용할 수 있는지.** Aurora DSQL 은 PostgreSQL 호환이라 익숙한 드라이버, ORM, 프레임워크, SQL 기능을 쓸 수 있다고 문서에 적고 PostgreSQL 16 과 호환된다. Valkey 는 기존 Redis 클라이언트가 코드 변경 없이 접속하고 `redis-cli` 도 양방향으로 동작한다.
- **호환성에는 층이 있다.** Valkey 가 `INFO` 에서 `redis_version:7.2.4` 를 보고하는 것처럼, 프로토콜·클라이언트 호환과 데이터 파일 호환은 별개다. "호환된다" 는 설명을 볼 때 무엇이 호환되는지 층을 나눠 확인한다.

학습 곡선이나 팀 규모에 대한 정량적 기준은 이 문서의 범위 밖이다.

## 버전과 현황을 확인하는 경로

버전 숫자는 몇 달이면 낡는다. **확인 경로**는 그보다 오래 유효하다. 그리고 경로에는 함정이 있어서, 경로를 모르면 틀린 값을 자신 있게 적게 된다.

| 함정 | 실제 확인 경로 |
| --- | --- |
| TiDB 의 `releases/latest` 가 최고 버전이 아니다 | 릴리스 목록 전체를 버전으로 정렬해서 본다 |
| Neo4j 의 GitHub Releases 가 2017년에 멈춰 있다 | 태그 목록을 본다 |
| MySQL 은 9.7 다음이 26.7 이다 | 캘린더 버저닝 전환을 전제로 본다 |
| CockroachDB 는 `releases/latest` 가 응답하지 않는다 | 벤더 문서의 릴리스 페이지를 본다 |

하나씩 보면 이렇다.

- **TiDB** — `releases/latest` 는 v7.5.8(2026-09-17)을 가리키지만 릴리스된 것 중 최고 버전은 v8.5.8(2026-08-27)이다. 7.5 LTS 유지 패치가 8.5 계열보다 **나중에** 배포되기 때문에 "가장 최근 릴리스" 와 "가장 높은 버전" 이 갈린다. LTS 계열을 함께 유지하는 제품은 모두 이 패턴을 보일 수 있다.
- **Neo4j** — GitHub Releases 의 최신 항목이 2017년 `3.2.0-alpha08` 이다. 릴리스 API 를 근거로 쓰면 9년 전 알파 버전을 현재 버전으로 적게 된다. 실제 버전은 태그에 있고 확인된 값은 `2026.08.1` 이다. 버전 체계도 캘린더 버저닝으로 바뀌었다.
- **MySQL** — 9.7 LTS 다음 계열이 26.7 이다. 숫자 크기로 비교하면 건너뛴 것처럼 보이지만 캘린더 버저닝 전환이다. 26.10.0 은 Early Access 단계이므로 "가장 높은 숫자" 를 그대로 최신 안정 버전으로 쓸 수 없다.
- **CockroachDB** — GitHub 의 `releases/latest` 경로로는 버전을 확인할 수 없다. 이 문서도 CockroachDB 의 최신 버전을 적지 않았다.

라이선스와 폐기 여부는 버전과 다른 경로로 확인한다.

- **라이선스는 저장소의 라이선스 파일 자체를 본다.** ScyllaDB 의 경우 저장소 루트의 파일명이 `LICENSE-ScyllaDB-Source-Available.md` 라서 파일 목록만 봐도 성격이 드러난다. 제품 소개 페이지의 "오픈소스" 표현과 라이선스 원문이 다를 수 있으므로 원문을 읽는다.
- **분할 라이선스는 디렉터리 단위로 확인한다.** TimescaleDB 는 `tsl/` 안팎으로 라이선스가 갈린다. 저장소 최상위의 LICENSE 파일 하나만 보면 틀린다.
- **폐기 여부는 벤더의 deprecation 문서에서 확인한다.** Atlas Device SDKs(Realm)가 사례다. MongoDB 공식 문서는 2024년 9월부로 Atlas Device SDKs 가 deprecated 되었고 **2025-09-30 에 end-of-life 에 도달해 제거**된다고 적는다. 함께 종료된 것이 App Services Authentication 과 사용자 관리, Authentication Triggers, Wire Protocol, Data Access Permissions(Rules and Roles)다. 남은 것은 온디바이스 데이터베이스이고, 이것은 오픈소스 프로젝트로 계속 존재한다 — 동기화 기능을 뺀 community 브랜치가 C++, Flutter, Kotlin, .NET, JavaScript, Swift 로 제공된다. 즉 **로컬 데이터베이스로서는 남았지만 관리형 동기화 제품은 사라졌다.** 기기 내부 저장이 요구라면 SQLite 를 기준으로 두고, 동기화가 필요하면 그 계층을 따로 설계한다.
- **지원 종료 시점은 제품의 라이프사이클 표에서 본다.** 이 문서에 적힌 MongoDB 8.3 의 EOL 2029-10-31, MySQL 8.0 의 2026-04-21 Sustaining Support 전환, PostgreSQL 의 메이저당 5년 같은 값이 그 표에서 나온다. 신규 구축이라면 버전 선택 전에 이 표를 먼저 본다.

마지막으로, 릴리스가 멈춘 제품을 후보에서 걸러내는 기준도 같은 경로에서 나온다. Riak 은 GitHub 최신 릴리스가 `riak-3.2.0`(2023-01-01)으로 3년 8개월째 새 릴리스가 없다. 반대로 OrientDB 는 3.2.56(2026-09-02)으로 릴리스가 이어지고 있다. 이름의 친숙함이나 과거 평판이 아니라 **마지막 릴리스 날짜**가 신규 후보 자격을 정한다.
