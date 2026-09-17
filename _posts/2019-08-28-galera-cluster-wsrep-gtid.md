---
date: 2019-08-28 13:15:12 +0900
title: "갈레라 클러스터 WSREP GTID"
category: mysql
excerpt: "갈레라 클러스터 WSREP GTID 갈레라 클러스터는 마리아DB의 리플리케이션과는 상당히 다른, 인증기반의 리플리케이션 방식을 가지고 있습니다. 갈레라의 GTID가 각각의 노드에 대해서만 일관성을 가지지 않고 전체 노드에 유니크한 값을 가진 쓰기셋으로 갈레라 클러스터에 연동된다면…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — wsrep_gtid_mode 필수 설정(wsrep_gtid_domain_id, log_slave_updates, log_bin)과 Galera 4(10.4.6+) 신규 기능 설명은 개념적으로 유효하다. 단 전제로 삼은 10.1~10.4 는 모두 커뮤니티 지원이 끝났고, 현재 기준으로는 11.4/11.8/12.3 LTS 에서 확인해야 한다.

![갈레라 클러스터 로고](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

## 갈레라 클러스터 WSREP GTID

> **전제조건:** MariaDB 10.1 이상 (Galera 4는 MariaDB 10.4.6부터)

Galera Cluster는 MariaDB의 리플리케이션과는 상당히 다른, 인증 기반의 리플리케이션 방식을 가지고 있습니다. Galera의 GTID(Global Transaction ID)가 각 노드에 대해서만 일관성을 가지지 않고 전체 노드에 유니크한 값을 가진 쓰기 세트로 Galera Cluster에 연동된다면 충분히 Galera GTID 사용의 이점이 있겠지만, 현재는 그렇지 않습니다.

Galera Cluster는 MariaDB의 오리지널 GTID를 지원하지 않고, 슬레이브 SQL 스레드 단에서 트랜잭션을 할 경우에만 일관성을 유지합니다. 각 노드가 가진 GTID 정보가 다른 노드로 전송되지 않습니다.

### WSREP GTID 모드

MariaDB 10.1 이상에는 wsrep GTID 모드라는 기능이 있습니다. 이 모드를 활성화하면 MariaDB는 몇 가지 트릭을 사용하여 모든 Galera Cluster 노드에 각 노드의 쓰기 세트와 일치하는 유니크한 GTID 값을 연동하려고 합니다. 이러한 트릭은 경우에 따라 작동하지만 GTID는 여전히 클러스터 노드 간에 데이터 정합성을 완벽하게 동기화하지는 않습니다.

### 필수 설정

| 설정 항목 | 값 | 설명 |
|---|---|---|
| `wsrep_gtid_mode` | `ON` | 클러스터의 모든 노드에서 활성화해야 합니다. |
| `wsrep_gtid_domain_id` | 동일한 값 | Galera Cluster의 쓰기 세트에 GTID를 할당할 때 각 클러스터 노드가 동일한 도메인을 사용하도록 특정 클러스터의 모든 노드에서 동일한 값으로 설정해야 합니다. 두 클러스터 간에 리플리케이션할 때 각 클러스터는 이 값을 다른 값으로 설정해야 하므로 쓰기 세트에 GTID를 지정할 때 각 클러스터가 다른 도메인을 사용합니다. |
| `log_slave_updates` | 활성화 | 클러스터의 모든 노드에서 활성화해야 합니다. [MDEV-9855](https://jira.mariadb.org/browse/MDEV-9855) 참조. |
| `log_bin` | 동일한 경로 | 클러스터의 모든 노드에서 동일한 경로로 설정해야 합니다. [MDEV-9856](https://jira.mariadb.org/browse/MDEV-9856) 참조. |

### 추가 안전 조치

`gtid_domain_id`는 지정된 클러스터의 모든 노드에서 서로 다른 값으로 설정되어야 하며, 이러한 각 값은 구성된 `wsrep_gtid_domain_id` 값과 달라야 합니다. 이는 `wsrep_sst_method = RSU`(Rolling Schema Upgrade) 세트로 실행된 DDL(Data Definition Language), 또는 `wsrep_on = OFF` 세트로 실행된 DML(Data Manipulation Language)과 같이, 비 Galera 트랜잭션에 GTID를 할당할 때 노드가 Galera Cluster의 쓰기 세트에 사용된 동일한 도메인을 사용하지 못하도록 합니다.

`server_id` 설정에 대한 자세한 내용은 MariaDB Galera Cluster에서 MariaDB 리플리케이션을 사용할 때 클러스터 노드의 server_id 설정 관련 공식 문서를 참조하시기 바랍니다.

## 알려진 문제점

WSREP GTID 모드는 MariaDB의 GTID가 MariaDB Galera Cluster와 완벽하게 작동하도록 하는 완벽한 방식이 아닙니다. 클러스터 노드에서 GTID가 일치하지 않는 경우가 있습니다.

알려진 문제는 다음과 같습니다.

내재적으로 삭제된 임시 테이블은 GTID가 일치하지 않을 수 있습니다. [MDEV-14153](https://jira.mariadb.org/browse/MDEV-14153) 참조.

MDEV-14153은 알려진 문제점의 목록입니다. 이 문제점들은 wsrep GTID 모드가 다른 모든 상황에서 완벽하게 작동하지 않는다는 것을 의미합니다. 다른 문제가 발견되면 MariaDB 측에 버그를 보고해 주시기 바랍니다.

## Galera 4 업데이트 (MariaDB 10.4.6+)

MariaDB 10.4.6 버전이 업데이트되면서 Galera 4 버전이 적용되었습니다.

- **Streaming replication**: 트랜잭션이 계속 진행되는 동안 노드가 트랜잭션을 조각으로 나누고 모든 보조 노드에서 리플리케이션하고 인증하기 때문에 대규모 트랜잭션 지원이 크게 향상되었습니다. 스트리밍 리플리케이션에 대한 전용 설명서와 스트리밍 리플리케이션 사용에 대한 가이드를 참조하십시오(먼저 활성화해야 합니다).
- **Galera system tables**: mysql 데이터베이스에 `wsrep_cluster`, `wsrep_cluster_members`, `wsrep_streaming_log`의 세 가지 새로운 테이블이 추가되었습니다. 데이터베이스 관리자는 클러스터 활동을 볼 수 있습니다. 스트리밍 리플리케이션을 설정하지 않으면 `wsrep_streaming_log`에 아무것도 표시되지 않습니다.
- **Synchronisation functions**: 이 SQL 함수들은 다음 트랜잭션을 사용하기 전에 마지막 쓰기 또는 마지막 트랜잭션을 기반으로 GTID를 가져와서 다음 트랜잭션을 실행하기 전에 특정 GTID가 리플리케이션 및 적용될 때까지 기다리도록 합니다.
