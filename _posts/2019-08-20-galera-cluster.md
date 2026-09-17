---
date: 2019-08-20 21:43:43 +0900
title: "갈레라 클러스터 (Galera Cluster): Multi Master Replication"
category: mysql
excerpt: "Galera Cluster: 다중 마스터 복제 갈레라 클러스터는 코더십이 만든 동기적 다중 마스터 방법입니다. MariaDB의 공식적인 클러스터 입니다. 갈레라 클러스터는 인증 기반 복제를 제공합니다. 데이터 완전성에 대해서는 자동으로 관리합니다. Galera Cluster 동작…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — 인증 기반 복제·SST(rsync/xtrabackup/mariabackup) 설명은 현재도 유효하며 Galera 4 이후 mariabackup 사용 주의문도 이미 반영돼 있다. 다만 TokuDB 지원 예정 언급은 무효(TokuDB 는 이후 MariaDB 에서 제거됨 — 문서 원문 확인 불가)이고, MySQL 용 Galera Cluster 는 2026-09-30 로 유지보수 종료가 공지되어 MariaDB 계열로의 이전이 권고된다.

## Galera Cluster: 다중 마스터 복제

갈레라 클러스터는 코더십이 만든 동기적 다중 마스터 방법입니다. MariaDB의 공식 클러스터입니다. 갈레라 클러스터는 인증 기반 복제를 제공합니다. 데이터 완전성은 자동으로 관리합니다.

## Galera Cluster 동작 원리

- Multi Master: 모든 노드에서 읽기 쓰기가 가능합니다.
- 동기적 복제: 슬레이브 지연이 없고 노드 충돌 시에 데이터 손실이 없습니다.
- 일관적인 데이터: 모든 노드는 같은 상태를 유지합니다.
- Multi-thread Slave: 어떠한 워크로드에서도 더 나은 성능을 가능하게 합니다.
- Hot standby: 장애 복구 시 down-time이 없습니다.
- read/write split이 필요 없습니다.
- WAN 복제 지원

갈레라 클러스터가 동작하기 위해서는 적어도 3개의 노드가 필요합니다. 두 개의 노드 클러스터로 작업할 수 있지만, arbiter가 필요합니다(이 경우도 어차피 3노드). 가능한 arbiter는 갈레라 클러스터와 같은 대역에 있어야 합니다. Multi Master 기능은 InnoDB를 위해 설계되었습니다. Percona의 XtraDB에서도 가능하지만, MariaDB 10.3 이상 버전에서는 더 이상 XtraDB 엔진을 fork하지 않기로 결정했습니다. 다른 엔진에서도 사용할 수는 있지만, 조건이 까다롭고 복제가 완벽하지 않으며, 충돌 관리가 지원되지 않을 수 있습니다.

## Galera Cluster 복제 메커니즘

- 트랜잭션 재배열: 다른 노드와 트랜잭션 완료 전에 트랜잭션을 재배열합니다. 이로써 성공적인 트랜잭션 인증 테스트의 숫자를 증가시킬 수 있습니다.
- Write Set: 너무 많은 Node coordination을 피하기 위해 단일 기록 집합을 작성하여 노드 간의 작업 수를 줄입니다.
- 데이터베이스 상태 장치: 읽기 트랜잭션은 로컬 노드에서 처리합니다. 쓰기 트랜잭션은 로컬에서 Shadow copy로 수행되어 인증과 커밋을 위해 다른 노드에 읽기 집합으로 브로드캐스트합니다.
- Group Communication: 일관성을 보장하면서 노드 간의 통신을 위한 높은 단계의 gcomm 또는 spread
- 갈레라 클러스터 자체적인 GTID 사용: MariaDB GTID 복제 메커니즘은 사용하지 않습니다.

## Galera Cluster 제한사항

- 갈레라 클러스터는 InnoDB 테이블만 완벽히 지원합니다. TokuDB는 지원 계획이 있지만, 아직 사용할 수 없고, MyISAM은 부분적으로 지원합니다.
- 모든 노드 간의 서로 다른 쿼리 실행 순서를 피하기 위해 모든 테이블에서 기본 키를 사용합니다. 사용자가 직접 만들지 않으면 갈레라가 직접 생성합니다. 기본 키가 없는 삭제 작업은 지원하지 않습니다.
- 테이블에 Lock을 걸고, Unlock하는 기능은 지원하지 않습니다. 사용해도 무시됩니다.
- XA 트랜잭션은 지원하지 않습니다.
- 쿼리 로그는 테이블에 기록될 수 없고, 파일로만 기록 가능합니다.

## Galera Cluster 동기화 방식 — rsync와 xtrabackup 차이점

### SST (State Snapshot Transfers)

새 노드가 클러스터에 참여하면 클러스터의 데이터를 요청합니다. 제공자(donor)로 알려진 한 노드는 SST(State Snapshot Transfer) 메서드로 Joiner라고 하는 새 노드에 전체 데이터 사본을 제공합니다.

wsrep\_sst\_donor 매개 변수로 어떤 노드를 donor로 지정해야 하는지 미리 지정할 수 있습니다. donor 노드를 설정하지 않으면 그룹 통신 모듈은 노드 상태 정보를 기반으로 donor를 선택합니다.

하나의 노드는 SYNCED 상태일 때 donor 역할을 할 수 있습니다. Joiner 노드는 동기화된 노드 중에 사용 가능한 노드에서 donor를 선택합니다. 동일한 gmcast.segment wsrep Provider 옵션을 가진 동기화된 노드에 우선 순위를 표시하거나 인덱스에서 첫 번째를 선택합니다. donor 노드가 선택되면 상태가 즉시 DONOR로 변경됩니다.

Galera는 상태 스냅샷 전송에 사용할 여러 백엔드 방법을 지원합니다. 두 가지 유형이 있습니다. 데이터베이스 서버와 클라이언트로 인터페이스하는 Logical State Snapshots 및 노드에서 노드로 직접 데이터 파일을 복사하는 Physical State Snapshots가 있습니다.

| Method | Speed | Blocks Donor | Available on Live Node | Type | DB Root Access |
| --- | --- | --- | --- | --- | --- |
| mysqldump | Slow | Blocks | Available | Logical | Donor and Joiner |
| rsync | Fastest | Blocks | Unavailable | Physical | None |
| xtrabackup | Fast | Briefly | Unavailable | Physical | Donor only |

### rsync란?

원래 유닉스에서 rsync의 개념은 서로 다른 노드 간의 파일을 동기화시키기 위한 툴로, byte-to-byte 방식으로 변경된 부분만 업데이트를 해주는 방식을 취하고 있습니다.

변경된 부분만 전송하기 때문에 scp나 rcp보다 빠른 속도를 자랑하고, 이러한 장점 덕분에 주로 서버 미러링이나 백업에 많이 이용합니다.

rsync는 pipelining을 지원하는데 이것은 여러 개의 연산 장치를 설치하여 명령 실행을 개시한 후에 계속해서 다음 명령의 실행을 중복시키는 것으로 파일 전송 중에 발생할 수 있는 손실을 줄이기 위한 방법입니다.

### 그럼 Galera에서의 rsync는?

상태 스냅샷 전송을 위한 가장 빠른 백엔드 방법은 rsync입니다. 실제 스냅샷 전송의 장점과 단점을 모두 가지고 있습니다.

전송 도중 donor 노드를 차단하지만 rsync에는 데이터베이스 구성이나 루트 액세스가 필요하지 않으므로 구성이 더 쉽습니다.

테라 바이트급 데이터베이스를 사용할 때 rsync는 xtrabackup보다 상당히 빠릅니다(1.5~2배 빠름). 이는 전송 시간이 몇 시간 단축되는 결과를 낳습니다.

또한 rsync에는 rsync 델타 전송 알고리즘을 사용하는 rsync-wan 수정 기능이 있습니다. 그러나 이로 인해 I/O가 집중적으로 발생하기 때문에 네트워크 처리량이 병목 현상이 없을 때만 사용해야 합니다. 일반적으로 WAN 배포의 경우입니다.

rsync 스크립트는 donor 및 Joiner 노드에서 실행됩니다. Joiner에서 서버 모드로 rsync를 시작하고 donor와의 연결을 기다립니다. donor는 클라이언트 모드에서 rsync를 시작하고 데이터 디렉토리의 내용을 결합 노드로 보냅니다.

rsync는 donor와 Joiner 노드의 DB 버전이 다른 경우 사용할 수 없습니다.

### XtraBackup이란?

XtraBackup은 percona에서 만든 백업 툴을 이용한 백업 방식입니다.

State Snapshot Transfers에 가장 많이 사용되는 백엔드 방법은 xtrabackup입니다. 물리적 상태 스냅샷의 모든 장점과 단점을 지니고 있습니다.

innodb에서는 XtraBackup 중에 doner 노드가 차단되지 않습니다.

XtraBackup이 가능한 한 가장 짧은 시간에 많은 양의 데이터를 복사하면 doner의 성능이 현저하게 저하될 수 있습니다.

XtraBackup은 rsync처럼 작동하지만 포괄적인 도구입니다. 모든 InnoDB 데이터와 테이블 스페이스의 복사를 시작할 수 있습니다. 내부적으로 체크포인트를 생성하고 완벽한 시점 복구를 위해 InnoDB 크래시 복구를 수행할 수 있습니다.

XtraBackup에는 증분 백업을 생성할 수 있는 추가 기능이 있습니다.

또 다른 추가 기능은 In-place crash recovery에 의해 구축된 InnoDB 로그 파일의 생성입니다.

또한 MyISAM 테이블의 고정된 복사를 제공하는 래퍼 소프트웨어가 있습니다.

XtraBackup은 초기 복제의 대부분에 InnoDB 트랜잭션 기능을 구현합니다. Xtrabackup은 기존의 MySQL 인프라에 포함될 수 있는 파일을 생성합니다. 말하자면, XtraBackup은 계측 백업 및 구체화되고 매우 유용한 InnoDB 파일을 제공합니다.

XtraBackup은 mysqld와 독립적으로 작동합니다. 사실, XtraBackup은 wrapper 소프트웨어로 MyISAM 테이블을 다룰 때를 제외하고는 mysqld와 전혀 상호 작용하지 않습니다.

XtraBackup은 mysqld와는 별개의 InnoDB 스토리지 엔진 작업을 사용하여 완벽한 기능의 InnoDB 데이터 및 로그 파일을 구축하려고 합니다.

XtraBackup을 사용하려면 구성 파일에 특정 옵션을 설정해야 합니다. 즉, donor 서버에 로컬 루트 액세스 권한이 있어야 합니다.

percona 레포지토리에서 xtrabackup을 받아 설치해야만 사용할 수 있습니다.

> **주의:** 10.4 버전 이후 Galera 4 버전부터는 xtrabackup을 사용하지 않고, mariabackup을 사용합니다. `wsrep_sst_method = mariabackup`으로 설정합니다. MariaDB-backup 패키지를 받아 설치해야 사용이 가능합니다.

## 갈레라 설정 파라미터

일반적으로 /etc/my.cnf 파일 안에 [galera] 밑에 세팅하면 되지만, /etc/my.cnf.d/galera.cnf에 갈레라 설정만 분리해서 설정해두기도 합니다.

- `wsrep_provider`: 갈레라 플러그인이 있는 위치. 구동 시 갈레라를 로딩합니다.
- `wsrep_cluster_name`: 클러스터의 이름을 지정. 일반적으로 같은 네트워크 서브넷에 여러 개의 서버가 있을 때 사용합니다. 원치 않는 노드가 잘못된 클러스터로 들어가는 것을 방지합니다.
- `wsrep_node_name`: 현재 노드의 고유한 이름입니다.
- `wsrep_node_address`: 현재 노드의 IP를 넣습니다.
- `wsrep_cluster_address`: 클러스터의 멤버 리스트입니다. 마스터를 포함한 모든 노드의 IP를 기입합니다.
- `wsrep_provider_option`: 추가적인 옵션을 활성화합니다. 추가 옵션은 아래와 같습니다.
  - `gcache.size`: 갈레라를 위한 전용 캐시입니다. 디스크 캐시에 버퍼되며 데이터베이스 크기보다 작아야 합니다. 복제 요청이 들어오고 적용하는 등의 작업을 할 때 저장하기 위해 사용합니다. 높은 트래픽 부하에서도 항상 모든 노드를 동기화하고 싶다면 이 값을 키워야 합니다.
  - `gcache.name`: gcache가 저장될 위치와 이름입니다. SSD를 이용하면 더 좋은 성능을 얻을 수 있습니다.
  - `gcache.page_size`: 페이지 스토리지에 있는 페이지 파일의 크기입니다.
- `wsrep_retry_autocommit`: 충돌이 발견되면 실패 이전에 재시도 횟수를 설정할 수 있습니다.
- `wsrep_sst_method`: 노드 간 전송 방법입니다. rsync, xtrabackup(MariaDB 10.4 이상 버전부터는 mariabackup으로 대체)가 있습니다.
- `wsrep_sst_auth`: rsync를 사용할 때 인증할 유저 계정과 패스워드를 입력합니다.
- `wsrep_slave_threads`: 슬레이브 기록 집합을 적용하기 위해 얼마나 많은 스레드를 사용할지 정의합니다.
- `wsrep_replication_myisam`: MyISAM 복제를 활성화시킵니다. 하지만 MyISAM에 관한 트랜잭션이 없으므로 무시해도 됩니다.
- `wsrep_sst_receive_address`: IP를 지정할 수 있으며 일반적으로 VIP를 이용하여 다른 서버에 접근할 때 원격 서버 입장에서 지금 서버가 정확한 IP 주소로 오는지 알 수 없을 때 사용합니다.
- `wsrep_notify_cmd`: 매번 갈레라 이벤트 발생 시 스크립트를 실행합니다. 노드가 더는 클러스터 멤버가 아닐 때 사용할 수 있습니다. 스크립트를 실행해서 알림 메일을 발송할 수도 있습니다.

## 오버라이드 옵션

갈레라가 설정되면 다음과 같은 MariaDB 옵션들이 오버라이드되어야 합니다.

- `binlog_format`: 로그 형식을 정의합니다. STATEMENT, ROW, MIX
- `innodb_autoinc_lock_mode`: 어떻게 락 메커니즘을 사용할 것인지 설정합니다.
- `innodb_flush_log_at_trx_commit`: 이 옵션으로 성능을 최적화할 수는 있지만, 전체 갈레라 클러스터에 전원이 나가는 경우 데이터를 잃게 될 수도 있습니다.
- `query_cache_size`: 쿼리 캐시를 비활성화합니다. 갈레라는 query cache 관련된 설정을 무시합니다.

## 갈레라 설정 예제

```bash
[galera] 
# Mandatory settings 
wsrep_on = ON 
wsrep_provider = /usr/lib64/galera/libgalera_smm.so 
wsrep_cluster_address = "gcomm://192.168.10.181,192.168.10.182,192.168.10.183" 
binlog_format = row 
default_storage_engine = InnoDB 
innodb_autoinc_lock_mode = 2 
wsrep_cluster_name = 'mariadb-cluster' 
wsrep_node_address = '192.168.10.181' 
wsrep_node_name = 'mariadb01' 
wsrep_sst_method = rsync 
wsrep_sst_auth = root:password 
wsrep_provider_options = "gcache.size = 512M; gcache.name = /tmp/galera.cache; gcache.page_size = 100m; gcache.rcover=yes"
#wsrep_sst_receive_address = 192.168.10.181
#wsrep_replication_myisam = 1
#wsrep_notify_cmd = "script.sh"
```

## 갈레라 설치 실습

링크를 참고하세요 ([MariaDB Galera를 이용한 다중화 구성](/writing/mariadb-galera-ha/ "MariaDB Galera를 이용한 다중화 구성"))
