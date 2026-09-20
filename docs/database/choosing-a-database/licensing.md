---
title: "라이선스가 선택을 뒤집을 때"
permalink: /docs/database/choosing-a-database/licensing/
breadcrumb: "Docs / Database / 데이터베이스 선택 가이드"
description: "DB 선택 — 라이선스 지형과 규모 상한"
last_modified_at: 2026-09-20
guide: choosing-a-database
order: 5
nav_title: "라이선스"
---

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
