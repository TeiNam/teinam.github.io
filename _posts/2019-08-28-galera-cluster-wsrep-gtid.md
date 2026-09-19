---
date: 2019-08-28 13:15:12 +0900
title: "갈레라 클러스터 WSREP GTID"
category: mysql
excerpt: "Galera Cluster는 인증 기반 리플리케이션을 사용하며, wsrep_gtid_mode로 클러스터 전체의 GTID 일관성을 개선할 수 있습니다. 필수 설정과 제약 사항을 다룹니다."
updated: 2026-09-20
---

> **전제조건:** MariaDB 11.4 LTS 이상 권장 (현행 LTS: 10.6, 10.11, 11.4, 11.8, 12.3). wsrep_gtid_mode는 MariaDB 10.1에서 도입되었으며 Galera 4는 MariaDB 10.4 시리즈부터 지원되지만, 10.1~10.4 버전은 2020~2024년에 커뮤니티 지원이 종료되었습니다.

Galera Cluster는 MariaDB의 리플리케이션과는 상당히 다른 인증 기반의 리플리케이션 방식을 사용합니다. Galera의 GTID(Global Transaction ID)가 각 노드에 대해서만 일관성을 가지지 않고 전체 노드에 유니크한 값을 가진 쓰기 세트로 Galera Cluster에 연동된다면 충분히 Galera GTID 사용의 이점이 있겠지만, 현재는 그렇지 않습니다.

Galera Cluster는 MariaDB의 오리지널 GTID를 지원하지 않고, 슬레이브 SQL 스레드 단에서 트랜잭션을 할 경우에만 일관성을 유지합니다. 각 노드가 가진 GTID 정보는 다른 노드로 전송되지 않습니다.

### WSREP GTID 모드

MariaDB 10.1 이상에는 wsrep GTID 모드라는 기능이 있습니다. 이 모드를 활성화하면 MariaDB는 내부 메커니즘을 통해 모든 Galera Cluster 노드에 각 노드의 쓰기 세트와 일치하는 유니크한 GTID 값을 연동하려고 합니다. 이 메커니즘은 경우에 따라 작동하지만 GTID는 여전히 클러스터 노드 간에 데이터 정합성을 완벽하게 동기화하지는 않습니다.

### 필수 설정

| 설정 항목 | 필요한 값 | 기본값 | 설명 |
|---|---|---|---|
| `wsrep_gtid_mode` | `ON` | `OFF` | 클러스터의 모든 노드에서 활성화해야 합니다. |
| `wsrep_gtid_domain_id` | 동일한 값 | `0` | Galera Cluster의 쓰기 세트에 GTID를 할당할 때 각 클러스터 노드가 동일한 도메인을 사용하도록 특정 클러스터의 모든 노드에서 동일한 값으로 설정해야 합니다. 두 클러스터 간에 리플리케이션할 때 각 클러스터는 이 값을 다른 값으로 설정해야 합니다. |
| `log_slave_updates` | `ON` | `OFF` | 클러스터의 모든 노드에서 활성화해야 합니다. |
| `log_bin` | 활성화 | — | 클러스터의 모든 노드에서 동일한 경로로 설정해야 합니다. |

### 추가 안전 조치

`gtid_domain_id`는 지정된 클러스터의 모든 노드에서 서로 다른 값으로 설정되어야 하며, 이러한 각 값은 구성된 `wsrep_gtid_domain_id` 값과 달라야 합니다. 이는 `wsrep_OSU_method = RSU`(Rolling Schema Upgrade)로 실행된 DDL(Data Definition Language), 또는 `wsrep_on = OFF`로 실행된 DML(Data Manipulation Language)과 같이 비 Galera 트랜잭션에 GTID를 할당할 때 노드가 Galera Cluster의 쓰기 세트에 사용된 동일한 도메인을 사용하지 못하도록 합니다.

`server_id` 설정에 대한 자세한 내용은 MariaDB Galera Cluster에서 MariaDB 리플리케이션을 사용할 때 클러스터 노드의 server_id 설정 관련 공식 문서를 참조하시기 바랍니다.

## 제약 사항

WSREP GTID 모드는 MariaDB의 GTID가 MariaDB Galera Cluster와 완벽하게 작동하도록 하는 완벽한 방식이 아닙니다. 클러스터 노드에서 GTID가 일치하지 않는 경우가 있을 수 있습니다.

과거 보고된 이슈로는 임시 테이블의 암묵적 삭제 시 GTID 불일치([MDEV-14153](https://jira.mariadb.org/browse/MDEV-14153), 2019년 Closed)가 있었습니다. 새로운 문제가 발견되면 MariaDB JIRA에 버그를 보고해 주시기 바랍니다.

## Galera 4 업데이트

MariaDB 10.4 시리즈에서 Galera 4가 도입되었습니다. Galera 4는 다음 주요 기능을 제공합니다.

- **Streaming replication**: 트랜잭션이 계속 진행되는 동안 노드가 트랜잭션을 조각으로 나누고 모든 보조 노드에서 리플리케이션하고 인증하기 때문에 대규모 트랜잭션 지원이 크게 향상되었습니다. 스트리밍 리플리케이션에 대한 전용 설명서와 스트리밍 리플리케이션 사용에 대한 가이드를 참조하십시오(먼저 활성화해야 합니다).
- **Galera system tables**: mysql 데이터베이스에 `wsrep_cluster`, `wsrep_cluster_members`, `wsrep_streaming_log`의 세 가지 새로운 테이블이 추가되었습니다. 데이터베이스 관리자는 클러스터 활동을 볼 수 있습니다. 스트리밍 리플리케이션을 설정하지 않으면 `wsrep_streaming_log`에 아무것도 표시되지 않습니다.
- **Synchronisation functions**: 이 SQL 함수들은 마지막 쓰기 또는 마지막 트랜잭션의 GTID를 기준으로 특정 GTID가 모든 노드에 리플리케이션되고 적용될 때까지 대기한 후 다음 트랜잭션을 실행합니다.
