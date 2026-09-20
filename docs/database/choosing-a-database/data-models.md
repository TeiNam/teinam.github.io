---
title: "데이터 모델별 선택지"
permalink: /docs/database/choosing-a-database/data-models/
breadcrumb: "Docs / Database / 데이터베이스 선택 가이드"
description: "DB 선택 — 데이터 모델별 선택지"
last_modified_at: 2026-09-20
guide: choosing-a-database
order: 3
nav_title: "데이터 모델"
---

요구가 정리됐으면 데이터 모델을 본다. 이 절의 표는 **2026-09 기준으로 릴리스와 라이선스 상태를 확인한 제품만** 담았다. 확인되지 않은 제품을 후보로 나열하면 3년 넘게 릴리스가 없는 제품을 권하는 사고가 난다.

| 데이터 모델 | 확인한 대표 제품 | 이런 요구에 쓴다 |
| --- | --- | --- |
| 관계형 | PostgreSQL, MySQL, SQLite | 트랜잭션 무결성, 스키마로 지키는 제약, JOIN 으로 하는 관계 탐색 |
| 분산 SQL·HTAP | TiDB, YugabyteDB, Vitess, CockroachDB | 관계형을 유지한 수평 확장 |
| 문서 | MongoDB, Couchbase Server | 유연한 필드 스키마, 속성이 제각각인 데이터, 원자성 단위가 레코드 하나인 경우 |
| 키-값 | Redis Open Source, Valkey | 데이터 캐싱, 세션 스토어, 짧은 단건 조회 경로 |
| 와이드 칼럼 | Apache Cassandra, Apache HBase, ScyllaDB | 대량의 쓰기, 지리적으로 분산된 데이터센터 |
| 그래프 | Neo4j, OrientDB | 여러 홉에 걸친 관계 탐색, 최단 경로, 패턴 매칭 |
| 검색 | Elasticsearch, OpenSearch | 전문 검색, 검색 기반 분석 |

각 절에 확인 버전과 라이선스를 적었다. 라이선스가 선택을 바꾸는 제품이 여럿 있으므로 제품 이름만 보고 후보를 확정하면 안 된다.

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
