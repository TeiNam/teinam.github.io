---
title: "운영 부담과 팀 역량"
permalink: /docs/database/choosing-a-database/operations/
breadcrumb: "Docs / Database / 데이터베이스 선택 가이드"
description: "DB 선택 — 운영 부담과 팀 역량"
last_modified_at: 2026-09-20
guide: choosing-a-database
order: 8
nav_title: "운영 부담"
---

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
