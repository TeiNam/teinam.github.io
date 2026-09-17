---
date: 2019-05-21 14:24:34 +0900
title: "PostgreSQL Replication을 이용한 다중화 구성"
category: postgresql
excerpt: "PostgreSQL Replication을 이용한 다중화 구성 PostgreSQL은 자체적으로 미러링을 해서 Slave를 만드는 다중화 구성 기능이 있습니다. Wal 파일을 이용해 실시간 스트리밍으로 Slave 노드에 데이터를 쌓아, 운영중인 Master 노드와 동일한 데이터를 보…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — standby 설정을 recovery.conf(standby_mode, trigger_file)로 하는데, 12 에서 recovery.conf 가 제거돼 파일이 있으면 서버가 아예 기동하지 않는다. 지금은 postgresql.conf + standby.signal 을 쓴다. wal_keep_segments 는 13 에서 wal_keep_size 로, vacuum_defer_cleanup_age·promote_trigger_file 은 16 에서 제거됐다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## PostgreSQL Replication을 이용한 다중화 구성

PostgreSQL은 자체적으로 미러링을 해서 Slave를 만드는 다중화 구성 기능이 있습니다. WAL 파일을 이용해 실시간 스트리밍으로 Slave 노드에 데이터를 쌓아, 운영 중인 Master 노드와 동일한 데이터를 보유하고, 장애 시 Slave를 바로 Master로 승급시키면서 서비스 장애 시간을 최소화하는 기능입니다.

가상 IP(VIP)를 이용해 Master-Slave 간의 접속을 유동적으로 구축하고, Slave가 Master로 승격되어도 같은 IP로 서비스를 유지할 수 있게 합니다.

PostgreSQL의 다중화 구성은 Master-Slave-Slave 삼중화 구성을 권장하고 있습니다. 2대의 노드로 이중화 구성 시 하나의 Slave가 Master로 승격이 되면 기존의 Master는 사용할 수 없고, Slave로 재구축을 해야하며, 재구축하는 동안 Slave가 없는 상태로 존재하기 때문입니다.

## Master 노드에서 설정해야 하는 것

### postgresql.conf

```conf
wal_level = replica
max_wal_senders = 10
wal_keep_segments = 8
archive_mode = on
archive_command = 'true'
```

`wal_level`, `max_wal_senders`, `wal_keep_segments`, `archive_mode`, `archive_command` 5개 파라미터는 반드시 설정되어야 하는 값입니다. 주요 파라미터가 갖는 의미를 알아보고 추가적으로 Replication 동작에 연관이 있는 파라미터를 알아보도록 합시다.

### wal_level

WAL (Write Ahead Log)에 기록되는 정보의 양을 결정한다. 9.4 이하 버전에서는 archive 이상, 9.6 이상 버전에서는 replica 이상으로 설정한다.

- minimal: 기본값은 충돌 또는 즉시 셧다운으로부터 복구하기 위해 필요한 정보만 기록한다.
- archive: WAL 아카이브에 필요한 로깅만 추가한다. (9.6 버전부터는 hot_standby와 archive 모두 replica로 대체되었다.)
- replica: 9.4 버전까지는 hot_standby였다. 9.6 버전부터는 replica라는 값으로 대체되었고, Slave 노드에서 읽기 전용 쿼리에 필요한 정보를 좀 더 추가한다.
- logical: 논리적 디코딩을 지원하는데 필요한 정보를 추가한다.

wal_level을 logical까지 올리면 replica에서 사용하는 정보뿐만 아니라 WAL로부터 논리적 변경세트를 사용하는데 필요한 정보도 로깅되기 때문에, WAL의 볼륨이 증가한다.

### max_wal_senders

스트리밍 기반의 백업 클라이언트로부터의 동시 연결 최대 수를 지정한다. 기본값은 복제를 하지 않는 0이며, WAL Sender 프로세서는 max_connections보다 큰 값을 설정할 수 없다. 스트리밍 클라이언트의 연결이 갑작스럽게 끊어지면 타임아웃이 될 때까지 orphan slot이 생기기 때문에, 예상되는 클라이언트의 최대 수보다 약간 크게 설정해야 한다. 그래서 일반적으로 slave의 수+1로 많이 설정을 한다.

### wal_keep_segments

Slave 노드가 스트리밍 복제를 위해 예전 로그 파일을 가져와야 하는 경우 pg_xlog 디렉토리에 저장되는 과거 로그 파일 세그먼트의 최소 수를 지정한다. 각 WAL segment의 사이즈는 16MB이다. WAL segment가 너무 빨리 갱신되어 빠른 속도로 사라지게 되고, Slave 노드에 기록되는 WAL segment가 Master 노드의 WAL의 갱신 속도를 따라가지 못한다면, replication이 중단되며, Downstream 연결 역시 실패한다. Maximum 수가 지정되어 있지 않기 때문에 서버의 디스크 공간, 그리고 DB 트랜잭션에 따른 WAL의 갱신 속도를 고려해서 설정값을 찾아야 한다.

### archive_mode

아카이브 모드가 사용되는 것으로 설정되면, archive_command 설정이 WAL segment를 아카이브 저장소로 전달한다. pg_xlog에 생성되는 WAL segment를 별도 archive 디렉토리로 전달하는 것이다. pg_xlog에 생성되는 WAL segment들은 wal_keep_segments에 의해 지정된 숫자를 넘기면 삭제되기 때문에, 지나간 WAL segment를 아카이브로 저장하는 것이다. wal_level이 minimal인 경우는 아카이브 모드를 사용할 수 없다.

### archive_command

로컬 쉘 명령으로, 완료된 WAL segment를 아카이브하기 위해 실행한다. %p는 아카이브할 파일의 경로명으로 대체되고, %f는 파일명으로 대체된다 (%문자를 명령에 포함하려면 %%으로 사용).

- ex) archive_command = 'cp %p /var/lib/edb/as9.6/archive/%f' 이렇게 설정하면 pg_xlog에 있는 WAL segment를 var/lib/edb/as9.6/archive/ 밑에 파일로 복사하라는 것이 된다.
- archive_command = 'true'로 설정하면 WAL segment는 계속 만들어지지만, 아카이빙은 되지 않기 때문에 복구에 필요한 WAL 파일의 체인이 단절되는 현상이 발생한다. 지나간 WAL 파일을 사용할 수 없다는 이야기다.

### pg_hba.conf

```conf
# replication privilege.
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host    replication     replica_user    192.168.10.0/24         trust
```

replication privilege 부분을 설정해 줘야 합니다.

pg_hba.conf는 DB의 접속 제한을 관리하는데, 이곳에 replication 용도로 사용할 유저, 호스트, IP 등을 설정해 줘야 해당 Slave 노드의 클라이언트가 Master 노드로 접속할 수 있습니다. 클라이언트 서버의 PostgreSQL Master 노드로의 인증 방식에 대한 설정은 [pg_hba.conf 포스팅](/writing/pg-hba-conf/)을 참고하면 됩니다.

### User 생성

일반적으로 superuser인 postgres 계정을 사용해도 되나, 보안에 치명적인 문제가 있기 때문에, replication 전용 유저를 생성해주는 편이 좋습니다.

```sql
postgres=# CREATE USER replica_user WITH PASSWORD '<REPLICA_PASSWORD>' replication;
```

해당 유저로는 replication을 위한 접속만 가능하며, 다른 기능엔 제한이 있습니다.

## Slave 노드에서 설정해야 하는 것

### postgresql.conf

```conf
hot_standby = on
```

### hot_standby

DB가 Standby 상태로 스트리밍 복제가 이루어지는 Slave 노드에는 반드시 on으로 설정되어 있어야 한다.

### recovery.conf

```conf
recovery_target_timeline = 'latest'
standby_mode = on
primary_conninfo = 'host=Master IP port=5432 user=replica_user'
trigger_file =
restore_command = 'cp /var/lib/edb/as9.6/archive/%f %p'
```

### primary_conninfo

Master 노드의 정보를 입력한다. md5 인증을 쓴다면 password를 설정해 줘야 하고, replication에 사용할 유저 정보를 입력한다.

### recovery_target_timeline

복구할 특정 타임라인의 번호를 지정하는 것인데, 'latest'로 설정을 해야 가장 마지막 내용까지 복제를 한다.

### standby_mode

스탠바이 모드를 on으로 해야 PostgreSQL DB가 구동될 때, Standby 모드로 올라온다.

### trigger_file

9.2 이상 버전에서는 사용하지는 않는다고 하는데, 9.6에서도 사용은 가능하다. trigger로 지정한 파일이 없으면 standby 모드로 유지하고, 해당 파일이 생성되면 DB가 Master로 승격된다. pg_basebackup 등으로 복원할 때 트리거 파일이 존재하면, Standby 모드로 올라오긴 하는데 wal receiver 프로세서가 구동되질 않는다.

### restore_command

아카이브를 가지고 DB를 복원할 때 사용한다.

## 추가적인 PostgreSQL Replication 관련 파라미터

위와 같은 설정을 해놓고 pg_ctl 등의 구동 명령으로 DB를 구동하면, Slave에는 wal receiver, Master에는 wal sender 프로세스가 활성화되면서 replication이 이루어집니다. (ps -ef | grep wal) 위에 나열한 파라미터 값은 replication을 위한 최소 파라미터 설정입니다. 그 밖에 replication에 사용할 수 있는 파라미터 값을 알아봅시다.

### max_replication_slots

서버가 지원할 수 있는 복제 슬롯의 최대 수를 지정한다. 기본값은 0. 현재 존재하는 복제 슬롯 수보다 작은 값으로 설정하면 서버가 시작되지 않는다.

### wal_sender_timeout

지정된 밀리초 이상 작동되지 않은 복제 연결을 중단한다. 이 파라미터는 Master 노드가 Slave 노드와 충돌했는지, 네트워크가 중단되었는지 검출할 때 유용하다. 기본값은 60초이고, 0은 타임아웃 매커니즘을 비활성화한다.

### synchronous_standby_names

스트리밍 복제 standby 서버를 쉼표로 구분된 목록으로 저장한다. Slave의 wal receiver의 이름을 지정하는 것이라고 생각하면 쉽습니다. 만약 이 파라미터가 설정되어 있는데, 해당 이름을 가진 Slave가 없다면, 다른 서버에서 복제 스트리밍을 정상적으로 요청해도 복제 작업이 이루어지지 않는다.

### vacuum_defer_cleanup_age

VACUUM 및 Hot 업데이트가 dead row 버전 클린업을 연기하는 트랜잭션 수를 지정한다. 기본값은 0개의 트랜잭션. Master의 WAL segment 트랜잭션이 standby에 기록되기 전이라 클린업의 조건에 도달하여도 WAL segment가 사라지는 것을 막고, 유예 기간을 줘서 Slave에서 트랜잭션이 완료하기까지의 시간을 대기한다. 이것은 Master 노드의 트랜잭션을 기준으로 삼고 동작을 하기 때문에 Standby 노드에서 트랜잭션 기록이 얼마나 걸리는지, 유예 시간이 얼마인지 예측이 어렵다. 따라서 Master에서 이 파라미터를 설정하기보다는 standby에서 hot_standby_feedback을 설정하는 편이 좋다.

### max_standby_archive_delay

핫 스탠바이가 작동 중이면, 적용 직전의 WAL 항목과 충돌하는 standby 노드의 쿼리가 취소되기 전에 standby 노드가 기다려야 하는 시간을 결정한다. WAL 데이터를 아카이브에서 읽어오는 경우 max_standby_archive_delay가 적용된다. 기본값은 30초. 지정되지 않으면 단위는 밀리초이다. -1 값은 쿼리 충돌이 완료될 때까지 Standby 노드가 무한정 대기한다.

### max_standby_streaming_delay

핫 스탠바이가 작동 중이면, 적용 직전의 WAL 항목과 충돌하는 standby 노드의 쿼리가 취소되기 전에 standby 노드가 기다려야 하는 시간을 결정한다. WAL 데이터를 스트리밍 복제를 통해 수신하는 경우 max_standby_streaming_delay가 적용된다. 기본값은 30초. 지정되지 않으면 단위는 밀리초이다. -1 값은 쿼리 충돌이 완료될 때까지 Standby 노드가 무한정 대기한다.

### wal_receiver_status_interval

Standby 노드의 wal receiver 프로세스가 sender 프로세스에 대한 정보를 운영 서버 또는 업스트림 standby로 전송하는 최소 빈도를 지정한다. 이것은 pg_stat_replication 뷰를 사용하여 볼 수 있다. Standby 노드는 작성된 마지막 트랜잭션 로그의 위치 및 디스크에 기록한 마지막 위치, 적용된 마지막 위치를 알려준다.

### hot_standby_feedback

핫 스탠바이가 standby 노드에서 현재 실행 중인 쿼리에 대해 Master 노드 혹은 업스트림 Standby로 피드백을 전송할 것인지를 지정한다. 클린업 레코드가 야기하는 쿼리 취소를 없애는데 사용할 수 있지만, 일부 작업의 경우 부하가 생겨 Master 노드의 DB 팽창을 초래할 수 있다.

### wal_receiver_timeout

지정된 밀리초 이상 작동되지 않은 replication을 중지시킨다. 이것은 Standby 노드가 운영 서버 충돌 또는 네트워크 중단을 검출할 때 유용하다. 0은 시스템 타임아웃 메커니즘을 비활성한다.

## Replication 순서

1. Master 노드의 replication 설정: postgresql.conf, pg_hba.conf, replication 유저 설정.

- show archive_mode; -> on이어야 Replication 가능
- show archive_command; -> archive 경로 or true
- show wal_level; -> replica여야 Replication 가능
- show max_wal_senders; -> 2 이상이어야 Replication 가능
- show hot_standby; -> on이어야 Replication 가능

2. pg_basebackup tool 등을 가지고 streaming 복제를 한다.

```bash
pg_basebackup -h <MasterIP> -U replica_user -D $PGDATA --xlogdir /var/lib/edb/as9.6/xlog -X stream -P -T MasterTBS경로=/var/lib/edb/as9.6/data/tbs/NEW_TBS1
```

- -h: Master 노드의 IP
- -U: replication에 사용할 유저 계정
- -D: $PGDATA, Master 노드의 init 명령을 클러스터가 생성된 위치
- --xlog: pg_xlog의 경로를 지정
- -X: replication 옵션을 지정. stream은 실시간 스트리밍 복제
- -P: 복제 시간 동안 변경된 부분을 반영한다.
- -T: 테이블 스페이스를 지정한다. 이 옵션을 이용해 테이블 스페이스의 위치를 옮길 수도 있다.

3. Slave 노드의 설정: postgresql.conf, recovery.conf 설정

- Slave의 $PGDATA, tablespace, pg_xlog 영역은 아무런 파일도 존재함 없이 비어 있어야 한다.
- recovery.conf에는 Master IP와 replication 유저 정보가 정확히 기입되어 있어야 한다.
- pg_basebackup은 $PGDATA 내의 내용을 있는 그대로 복사하기 때문에 트리거 파일이 해당 경로에 존재할 경우 삭제해 줘야 한다.

4. Standby 노드의 DB를 구동

- pg_ctl start -D $PGDATA -w
- ps -ef | grep wal을 리눅스 shell 프롬프트에서 입력했을 때, Master 노드 wal sender, Slave 노드 wal receiver 프로세서가 떠 있으면 성공

PostgreSQL의 다중화 작업이 완료되면, Failover 구성을 할 수 있는데, Community 버전인 PostgreSQL은 pg_pool을 이용하고, 상용 버전인 EDB는 EFM 모듈을 이용하여 구성합니다. EFM 모듈을 통해 Failover를 구성하면 witness라는 감시 노드가 추가됩니다. 어느 노드가 현재 Master인지를 파악하고, 장애 시 Slave를 Master로 승격하는 기능을 합니다. witness 노드는 efm 모듈만 올라가고 DB는 설치되지 않습니다.

## Replication 동작 확인 Query

Sender Node

```sql
postgres=# select pid, usesysid, usename, application_name, client_addr, backend_start, state, sent_lsn, write_lsn, flush_lsn, replay_lsn, sync_state from pg_stat_replication;
 pid  | usesysid |   usename    | application_name |  client_addr   |         backend_start         |   state   | sent_lsn  | write_lsn | flush_lsn | replay_lsn | sync_state 
------+----------+--------------+------------------+----------------+-------------------------------+-----------+-----------+-----------+-----------+------------+------------
 9174 |    16384 | replica_user | walreceiver      | 192.168.10.242 | 2019-06-19 22:39:31.018265+09 | streaming | 0/50001B0 | 0/50001B0 | 0/50001B0 | 0/50001B0  | async
 9178 |    16384 | replica_user | walreceiver      | 192.168.10.243 | 2019-06-19 22:40:17.431336+09 | streaming | 0/50001B0 | 0/50001B0 | 0/50001B0 | 0/50001B0  | async
(2 rows)
```

Receiver Node

```sql
postgres=# select pid, sender_host, status, receive_start_lsn, received_lsn, last_msg_send_time, last_msg_receipt_time, latest_end_lsn, latest_end_time from pg_stat_wal_receiver;
 pid  |  sender_host   |  status   | receive_start_lsn | received_lsn |      last_msg_send_time      |     last_msg_receipt_time     | latest_end_lsn |        latest_end_time        
------+----------------+-----------+-------------------+--------------+------------------------------+-------------------------------+----------------+-------------------------------
 9147 | 192.168.10.241 | streaming | 0/4000000         | 0/50001B0    | 2019-06-19 22:51:01.77302+09 | 2019-06-19 22:51:01.773807+09 | 0/50001B0      | 2019-06-19 22:44:01.009053+09
(1 row)
```

## recovery stat 조회

Sender Node

```sql
postgres=# select pg_is_in_recovery();   
 pg_is_in_recovery 
-------------------
 f
(1 row)
```

Receiver Node

```sql
postgres=# select pg_is_in_recovery();   
 pg_is_in_recovery 
-------------------
 t
(1 row)
```

일반적인 노드에서 pg_is_in_recovery(); 함수를 조회하면 f 값이 나오지만, 스탠바이 노드에서는 t가 출력됩니다.
