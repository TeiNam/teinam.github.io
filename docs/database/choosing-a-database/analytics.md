---
title: "분석 계층"
permalink: /docs/database/choosing-a-database/analytics/
breadcrumb: "Docs / Database / 데이터베이스 선택 가이드"
description: "DB 선택 — 분석 계층과 오픈 테이블 포맷"
last_modified_at: 2026-09-20
guide: choosing-a-database
order: 6
nav_title: "분석 계층"
---

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
