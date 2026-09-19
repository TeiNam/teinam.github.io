---
date: 2019-08-20 21:43:43 +0900
title: "갈레라 클러스터 (Galera Cluster): Multi Master Replication"
category: mysql
excerpt: "갈레라 클러스터는 코더십이 만든 동기 다중 마스터 복제 방식입니다. MariaDB Server 에 함께 배포되며, 인증 기반 복제로 노드 사이의 데이터 일관성을 유지합니다."
updated: 2026-09-20
---

갈레라 클러스터는 코더십(Codership)이 만든 동기 다중 마스터 복제 방식입니다. MariaDB Server 에 함께 배포되며, 인증(certification) 기반 복제로 노드 사이의 데이터 일관성을 유지합니다.

> **NOTE** — MariaDB 는 10.4.2 에서 번들 갈레라를 Galera 3 에서 Galera 4(wsrep 프로바이더 26.4.x)로 올렸습니다. 10.4·10.5·10.6 은 커뮤니티 유지보수 기간이 끝났고, 지금 유지되는 LTS 계열은 10.11·11.4·11.8·12.3 입니다. 그래서 새로 구성하는 클러스터는 모두 Galera 4 입니다.

## Galera Cluster 동작 원리

- Multi Master: 모든 노드에서 읽기 쓰기가 가능합니다.
- 동기적 복제: 슬레이브 지연이 없고 노드 충돌 시에 데이터 손실이 없습니다.
- 일관적인 데이터: 모든 노드는 같은 상태를 유지합니다.
- 적용 스레드 다중화: `wsrep_slave_threads` 로 쓰기 집합을 병렬로 적용합니다.
- Hot standby: 장애 복구 시 down-time이 없습니다.
- read/write split이 필요 없습니다.
- WAN 복제 지원

갈레라 클러스터가 동작하기 위해서는 적어도 3개의 노드가 필요합니다. 두 개의 노드 클러스터로 작업할 수 있지만, arbiter가 필요합니다(이 경우도 어차피 3노드). 가능한 arbiter는 갈레라 클러스터와 같은 대역에 있어야 합니다.

복제는 InnoDB 에서만 동작합니다. 다른 엔진의 테이블에 쓴 내용은 노드 사이에 전파되지 않습니다. MyISAM 은 실험적 지원이고, MariaDB 10.6 부터는 `wsrep_mode=REPLICATE_MYISAM,REPLICATE_ARIA` 로 켭니다.

## Galera Cluster 복제 메커니즘

- 트랜잭션 재배열: 다른 노드와 트랜잭션 완료 전에 트랜잭션을 재배열합니다. 이로써 성공적인 트랜잭션 인증 테스트의 숫자를 증가시킬 수 있습니다.
- Write Set: 너무 많은 Node coordination을 피하기 위해 단일 기록 집합을 작성하여 노드 간의 작업 수를 줄입니다.
- 데이터베이스 상태 장치: 읽기 트랜잭션은 로컬 노드에서 처리합니다. 쓰기 트랜잭션은 로컬에서 Shadow copy로 수행되어 인증과 커밋을 위해 다른 노드에 읽기 집합으로 브로드캐스트합니다.
- Group Communication: 일관성을 보장하면서 노드 간의 통신을 위한 높은 단계의 gcomm 또는 spread
- 갈레라 클러스터 자체적인 GTID 사용: MariaDB GTID 복제 메커니즘은 사용하지 않습니다.

### Galera 4 에서 달라진 것

- 스트리밍 복제: 트랜잭션을 실행하는 중에 작은 조각(fragment)으로 나눠 복제하므로 크기 제한 없이 트랜잭션을 복제할 수 있습니다. `wsrep_trx_fragment_unit` 으로 단위(bytes, rows, statements)를 정하고, `wsrep_trx_fragment_size` 로 조각을 만들 기준값을 정합니다.
- `mysql` 데이터베이스에 `wsrep_cluster`, `wsrep_cluster_members`, `wsrep_streaming_log` 테이블이 생겼습니다. 사용자는 읽을 수만 있고 수정할 수 없습니다.
- 갈레라가 복제하는 트랜잭션도 MariaDB 의 그룹 커밋 로직으로 커밋 단계를 처리합니다.

## Galera Cluster 제한사항

- 복제는 InnoDB 테이블에서만 동작합니다. `CREATE USER` 처럼 `mysql.*` 을 암묵적으로 바꾸는 DDL 은 복제됩니다.
- 모든 테이블에 기본 키가 있어야 합니다. 여러 칼럼을 묶은 기본 키도 됩니다. 기본 키가 없으면 노드마다 행 순서가 달라질 수 있고, 기본 키가 없는 테이블에서는 `DELETE` 를 지원하지 않습니다.
- 명시적 락은 지원하지 않습니다. `LOCK TABLES`, 테이블 목록을 지정한 `FLUSH TABLES ... WITH READ LOCK`, `GET_LOCK()`, `RELEASE_LOCK()` 가 해당합니다. 목록 없이 쓰는 `FLUSH TABLES WITH READ LOCK` 은 클러스터 전체 락이라 지원합니다.
- XA 트랜잭션은 지원하지 않습니다.
- 일반 쿼리 로그와 슬로우 쿼리 로그를 테이블에 기록할 수 없습니다. `log_output=FILE` 로 파일에 남깁니다.
- 오토인크리먼트 값이 연속이라고 가정하면 안 됩니다. 갈레라는 오토인크리먼트 증가폭으로 노드별 고유 값을 만들기 때문에 각 노드의 값에 구멍이 생깁니다.
- DDL 이 끼면 락이 느슨해집니다. 같은 테이블에 DDL 을 동시에 던지면 메타데이터 락을 기다리지 않고 바로 실행되므로, DDL 을 병렬로 실행하지 않는 편이 안전합니다.

## Galera Cluster 동기화 방식

### SST (State Snapshot Transfers)

새 노드가 클러스터에 참여하면 클러스터의 데이터를 요청합니다. 제공자(donor)로 알려진 한 노드는 SST(State Snapshot Transfer) 메서드로 Joiner라고 하는 새 노드에 전체 데이터 사본을 제공합니다.

`wsrep_sst_donor` 매개 변수로 어떤 노드를 donor로 지정해야 하는지 미리 지정할 수 있습니다. 기본값은 비어 있고, donor 노드를 설정하지 않으면 그룹 통신 모듈이 노드 상태 정보를 기반으로 donor를 선택합니다.

하나의 노드는 SYNCED 상태일 때 donor 역할을 할 수 있습니다. Joiner 노드는 동기화된 노드 중에 사용 가능한 노드에서 donor를 선택합니다. 동일한 gmcast.segment wsrep Provider 옵션을 가진 동기화된 노드에 우선 순위를 표시하거나 인덱스에서 첫 번째를 선택합니다. donor 노드가 선택되면 상태가 즉시 DONOR로 변경됩니다.

SST 백엔드는 두 갈래입니다. 데이터베이스 서버와 클라이언트를 거치는 Logical State Snapshot, 그리고 노드에서 노드로 데이터 파일을 직접 복사하는 Physical State Snapshot 입니다.

| 방식 | 유형 | donor 차단 | 인증 |
| --- | --- | --- | --- |
| rsync (기본값) | 물리 | 차단합니다 | 필요 없음 |
| mariabackup | 물리 | 차단하지 않습니다 | 필요 |
| xtrabackup-v2 | 물리 | 차단하지 않습니다 | 필요 |
| mysqldump | 논리 | 차단합니다 | 필요 |

물리 방식은 서버 기동 시점에만 쓸 수 있습니다. mysqldump 는 조인 노드가 접속을 받을 수 있는 상태여야 하고, 문서는 이 방식을 가장 느린 SST 로 설명합니다. GTID 와 저장 데이터 암호화는 rsync 와 mariabackup 이 지원하고 xtrabackup 계열은 지원하지 않습니다. donor 와 Joiner 는 같은 방식을 써야 하므로 `wsrep_sst_method` 는 클러스터 전체에 같은 값으로 두는 편이 좋습니다. 전송 포트는 mysqldump 만 3306 이고 나머지는 4444 를 씁니다.

### rsync

유닉스의 rsync는 서로 다른 노드 간의 파일을 동기화시키기 위한 툴로, 변경된 부분만 전송합니다. 이 덕분에 scp나 rcp보다 빠르고, 주로 서버 미러링이나 백업에 많이 이용합니다.

갈레라의 기본 SST 방식이 rsync 입니다. 바이너리 데이터를 그대로 복사하므로 데이터셋이 클 때 가장 빠르고, 데이터베이스 설정이나 인증 정보가 필요 없어 구성이 가장 단순합니다. 대신 전송하는 동안 donor 노드에 읽기 락이 걸립니다.

rsync 스크립트는 donor 및 Joiner 노드에서 실행됩니다. Joiner에서 서버 모드로 rsync를 시작하고 donor와의 연결을 기다립니다. donor는 클라이언트 모드에서 rsync를 시작하고 데이터 디렉토리의 내용을 결합 노드로 보냅니다.

느린 회선에는 델타 전송을 쓰는 `rsync_wan` 변형이 있습니다. 다만 I/O 를 많이 쓰므로 네트워크 처리량이 병목인 구간에서만 이득이 있습니다.

rsync 에는 두 가지 주의점이 있습니다. `DATA DIRECTORY` 나 `INDEX DIRECTORY` 를 지정한 테이블은 지원하지 않고, `innodb_use_native_aio` 와 함께 쓰면 데이터가 손상될 수 있습니다.

### mariabackup

MariaDB 는 Percona XtraBackup 을 지원하지 않습니다. 그래서 MariaDB 클러스터에서 물리 백업 기반 SST 를 쓸 때는 mariabackup 을 씁니다. MariaDB-backup 패키지를 설치하고 `wsrep_sst_method = mariabackup` 으로 설정합니다.

```ini
[mariadb]
wsrep_sst_method = mariabackup
wsrep_sst_auth = mariadbbackup:mypassword
```

명령줄 도구 이름은 `mariadb-backup` 으로 바뀌었지만 SST 방식 이름은 `mariabackup` 그대로입니다.

mariabackup 은 전송 중에 donor 를 차단하지 않으므로, SST 를 받는 동안에도 donor 에서 쿼리를 처리해야 할 때 쓰는 방식입니다. 대신 donor 와 Joiner 양쪽에 `socat` 이 필요하고, `wsrep_sst_auth` 로 계정을 넘겨야 합니다. 이 계정에는 `RELOAD`, `PROCESS`, `LOCK TABLES`, `BINLOG MONITOR` 권한이 필요합니다.

```sql
CREATE USER 'mariadbbackup'@'localhost' IDENTIFIED BY 'mypassword';
GRANT RELOAD, PROCESS, LOCK TABLES, BINLOG MONITOR ON *.* TO 'mariadbbackup'@'localhost';
```

donor 와 Joiner 역할은 언제든 바뀌므로 이 권한은 모든 노드에 부여합니다.

> **WARNING** — SST 는 기본적으로 암호화되지 않습니다(`encrypt=0`). 복제 트래픽의 TLS 설정과는 별개이므로 `[sst]` 섹션에서 따로 켜야 합니다. 또 InnoDB 리두 로그 포맷이 10.5 와 10.8 에서 바뀌었기 때문에 이 구간을 넘는 메이저 업그레이드에는 mariabackup 을 쓸 수 없습니다. 이때는 `wsrep_sst_method = rsync` 를 씁니다.

## 갈레라 설정 파라미터

일반적으로 /etc/my.cnf 파일 안에 [galera] 밑에 세팅하면 되지만, /etc/my.cnf.d/galera.cnf에 갈레라 설정만 분리해서 설정해두기도 합니다.

- `wsrep_on`: 기본값이 OFF 입니다. 켜야 갈레라 복제가 동작합니다.
- `wsrep_provider`: 갈레라 플러그인이 있는 위치. 구동 시 갈레라를 로딩합니다.
- `wsrep_cluster_name`: 클러스터의 이름을 지정. 일반적으로 같은 네트워크 서브넷에 여러 개의 서버가 있을 때 사용합니다. 원치 않는 노드가 잘못된 클러스터로 들어가는 것을 방지합니다.
- `wsrep_node_name`: 현재 노드의 고유한 이름입니다.
- `wsrep_node_address`: 현재 노드의 IP를 넣습니다.
- `wsrep_cluster_address`: 클러스터의 멤버 리스트입니다. 마스터를 포함한 모든 노드의 IP를 기입합니다.
- `wsrep_provider_options`: 갈레라 프로바이더에 넘기는 추가 옵션입니다. 자주 쓰는 것은 아래와 같습니다.
  - `gcache.size`: 쓰기 집합을 캐시할 링 버퍼 크기입니다. 기본값은 128M 입니다. 트래픽이 높을 때도 노드를 계속 동기화 상태로 두고 싶다면 이 값을 키웁니다.
  - `gcache.name`: 링 버퍼 파일의 위치와 이름입니다. 기본값은 `./galera.cache` 이고, 작업 디렉터리 밖으로 옮기면 디스크 I/O 를 줄일 수 있습니다.
  - `gcache.page_size`: 페이지 스토리지에 있는 페이지 파일의 크기입니다. 기본값은 128M 입니다.
  - `gcache.recover`: 기본값은 no 입니다. 켜 두면 재시작한 노드가 다른 조인 노드에 IST 를 제공할 수 있습니다.
- `wsrep_retry_autocommit`: 충돌이 발견되면 실패 이전에 재시도 횟수를 설정할 수 있습니다. 기본값은 1 이고 0 부터 10000 까지 지정합니다. 0 이면 재시도하지 않습니다.
- `wsrep_sst_method`: 노드 간 전송 방법입니다. 기본값은 rsync 입니다.
- `wsrep_sst_auth`: SST 에 쓸 계정을 `user:password` 형식으로 넣습니다. rsync 는 인증이 필요 없고, 그 밖의 방식에서 필요합니다.
- `wsrep_slave_threads`: 쓰기 집합을 적용할 스레드 수입니다. 기본값은 1 이고 512 까지 지정합니다.
- `wsrep_mode`: MariaDB 10.6.0 에서 들어온 변수입니다. `REPLICATE_MYISAM`, `REPLICATE_ARIA`, `STRICT_REPLICATION` 을 지정합니다. 이전에 쓰던 `wsrep_replicate_myisam` 은 10.6.0 에서 deprecated, 10.7.0 에서 제거됐습니다.
- `wsrep_sst_receive_address`: SST 를 받을 주소입니다. 기본값은 AUTO 이고, 이 값이 없으면 `wsrep_node_address`, 그다음 `bind-address` 를 씁니다. VIP 뒤에 있어서 원격 노드가 이 서버의 정확한 주소를 알 수 없을 때 직접 지정합니다.
- `wsrep_notify_cmd`: 갈레라 이벤트가 생길 때마다 실행할 명령입니다. 기본값은 비어 있습니다. 노드가 클러스터 멤버에서 빠질 때 알림 메일을 보내는 식으로 쓸 수 있습니다. 명령줄 옵션 이름은 `--wsrep-notify-command` 로 변수명과 다릅니다.

## 함께 조정하는 MariaDB 옵션

갈레라가 요구하는 필수 설정은 다음과 같습니다.

- `wsrep_on = ON`
- `wsrep_provider`, `wsrep_cluster_address`
- `binlog_format = ROW`
- `default_storage_engine = InnoDB` — MariaDB 의 기본값입니다.
- `innodb_doublewrite = 1` — 기본값이고 바꾸지 않습니다.

필수는 아니지만 성능 때문에 함께 보는 옵션도 있습니다.

- `innodb_autoinc_lock_mode`: 2(interleaved)가 가장 빠르고 확장성이 좋은 락 모드입니다. `binlog_format` 이 ROW 일 때 권장하며, 적용 스레드를 병렬로 돌릴 수 있게 해 줍니다.
- `innodb_flush_log_at_trx_commit`: 0 이나 2 로 내리면 쓰기 성능이 좋아지지만, 클러스터 전체가 동시에 정전되거나 함께 죽는 버그를 만나면 커밋 응답을 받은 트랜잭션도 잃을 수 있습니다. 내구성이 중요하면 기본값 1 을 유지합니다.
- `wsrep_slave_threads`: CPU 코어당 4개를 기준으로 잡되 `wsrep_cert_deps_distance` 를 넘기지 않습니다.

쿼리 캐시는 MariaDB Galera Cluster 5.5.40, 10.0.14, MariaDB 10.1.2 이전 버전에서만 `query_cache_size=0` 으로 껐어야 했습니다. 그 이후 버전에서는 따로 끌 필요가 없습니다.

## 갈레라 설정 예제

```ini
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
wsrep_provider_options = "gcache.size = 512M; gcache.name = /tmp/galera.cache; gcache.page_size = 100M; gcache.recover = yes"
# rsync 는 인증이 필요 없습니다. mariabackup 으로 바꿀 때만 아래 줄이 필요합니다.
#wsrep_sst_auth = mariadbbackup:password
#wsrep_sst_receive_address = 192.168.10.181
#wsrep_mode = REPLICATE_MYISAM
#wsrep_notify_cmd = "script.sh"
```

## 갈레라 설치 실습

링크를 참고하세요 ([MariaDB Galera를 이용한 다중화 구성](/writing/mariadb-galera-ha/ "MariaDB Galera를 이용한 다중화 구성"))
