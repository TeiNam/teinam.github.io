---
date: 2019-04-15 18:11:22 +0900
title: "PostgreSQL 아카이브 모드"
category: postgresql
excerpt: "PostgreSQL 아카이브 모드 (Archive Mode) – PostgreSQL에서 아카이브 모드를 이해하기전에 WAL을 자세히 알고 넘어가야 할 필요가 있습니다. – WAL (Write-Ahead Logging)은 데이터 무결성을 보장하는 표준 방법입니다. – WAL의 중심개…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — wal_level 값을 minimal/archive/hot_standby 로 설명하고 기본값을 minimal 이라 한다. 9.6 부터 archive·hot_standby 는 replica 로 통합(별칭만 허용)되고 10 부터 기본값이 replica 다. 예제의 pg_switch_xlog·pg_xlogfile_name·pg_current_xlog_location 은 10 에서 pg_switch_wal 계열로 개명됐고, 현재는 archive_command 대신 archive_library(아카이브 모듈)도 쓸 수 있다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## PostgreSQL 아카이브 모드 (Archive Mode)

아카이브 모드를 이해하려면 먼저 WAL을 알아야 합니다.

WAL (Write-Ahead Logging)은 데이터 무결성을 보장하는 표준 방법입니다.

WAL의 중심 개념은 변경 내용을 설명하는 로그 레코드를 영구적 저장소에 먼저 기록한 후 데이터 파일을 변경하는 것입니다. (오라클의 redo-archive와 비슷한 역할)

충돌 발생 시 로그를 사용하여 데이터베이스를 복구할 수 있으므로 트랜잭션 커밋마다 데이터 페이지를 디스크에 쓸 필요가 없습니다. 데이터 페이지에 적용되지 않은 변경 내용은 로그 레코드에서 실행 취소가 가능합니다. (이것은 roll-forward 복구이며, REDO라고도 합니다.)

로그 파일은 순차적으로 작성되며, 로그 파일 동기화 비용은 데이터 페이지 쓰기 비용보다 훨씬 적습니다.

서버가 소규모 트랜잭션을 다수 처리하는 경우 로그 파일의 fsync 하나로 여러 트랜잭션을 커밋할 수 있습니다.

온라인 백업 및 PIT(point-in-time) 복구를 지원합니다.

> **참고:** $PGDATA 밑에 있는 postgresql.conf 파일 안의 파라미터 값을 수정하여 설정합니다.

### wal_level (enum)

wal_level은 WAL에 기록되는 정보의 양을 결정합니다. 기본값은 충돌 또는 즉시 셧다운으로부터 복구하기 위해 필요한 정보만 기록하는 minimal입니다.

- **minimal**: 기본값
- **archive**: WAL 아카이브에 필요한 로깅만 추가
- **hot_standby**: 대기 서버에서 읽기 전용 쿼리에 필요한 정보를 추가

### archive_mode (boolean)

archive_mode를 on으로 설정하면 완료된 WAL 세그먼트가 archive_command 설정에 따라 아카이브 저장소로 전달됩니다. archive_mode 및 archive_command는 별개의 변수이므로 아카이빙 모드를 해지하지 않고도 archive_command를 변경할 수 있습니다. 이 매개변수는 서버 시작 시 설정됩니다. wal_level이 minimal로 설정된 경우 archive_mode를 사용할 수 없습니다.

### archive_command (string)

완료된 WAL 파일 세그먼트를 아카이브하기 위해 실행하는 로컬 쉘 명령입니다.

- `%p` 아카이브할 파일의 경로명으로 대체
- `%f` 파일명으로만 대체

### archive_timeout (integer)

archive_command는 완료된 WAL 세그먼트를 실행합니다. 그러므로 서버에 WAL 트래픽이 거의 발생하지 않으면 트랜잭션이 완료되는 시간과 아카이브 저장소에 안전하게 기록되는 사이에 긴 지연 시간이 발생할 수 있습니다. 데이터가 아카이브되지 않은 채로 방치되지 않게 하기 위해 서버가 새 WAL 세그먼트 파일로 주기적으로 전환되도록 archive_timeout을 설정할 수 있습니다.

archive_timeout을 매우 짧게 설정하는 것은 저장소를 부풀게 하므로 현명하지 못하며, 1~2분 정도로 설정하는 것이 좋습니다.

## 아카이브 적용

> **참고:** 실제로 설정해보기

```bash
$ vi postgresql.conf

wal_level = archive
archive_mode = on
archive_command = 'cp %p /data/pgsql/archive/arch_%f.arc'
archvie_timeout = 120

:wq!

postgres@psql-db01:/usr/local/pgsql/data]$ pg_ctl stop
waiting for server to shut down.... done
server stopped
[1]+ Done postgres -D /usr/local/pgsql/data > /var/postgresql/log/postgresql.log 2>&1 (wd: /var/postgresql/log)
(wd now: /usr/local/pgsql/data)
postgres@psql-db01:/usr/local/pgsql/data]$ postgres -D /usr/local/pgsql/data >/var/postgresql/log/postgresql.log 2>&1 &
[1] 52044
$
```

> **참고:** 아카이브 모드 확인하기

```sql
postgres=# select * from pg_settings
where name in ('archive_mode', 'archive_command', 'archive_timeout', 'wal_level');
postgres=# show wal_level;
postgres=# show archive_mode;
postgres=# show archive_command;
```

## 로그 스위치

PostgreSQL은 세 가지 로그 관련 함수를 제공합니다.

- **pg_switch_xlog()**: 현재 사용 중인 로그 파일을 아카이빙하고 새로운 파일로 스위칭합니다. (10 이상 버전에서는 `pg_switch_wal`로 변경되었습니다. 참고: <https://wiki.postgresql.org/wiki/New_in_postgres_10>)

```sql
postgres=# select pg_switch_xlog();
 pg_switch_xlog 
----------------
 0/70000B0
(1 row)
```

- **pg_xlogfile_name / pg_xlogfile_name_offset**: 아카이빙된 파일명을 출력합니다.

```sql
postgres=# select pg_xlogfile_name('0/3000078'), pg_xlogfile_name_offset('0/3000078');
     pg_xlogfile_name     |    pg_xlogfile_name_offset     
--------------------------+--------------------------------
 000000010000000000000003 | (000000010000000000000003,120)
(1 row)
```

## 현재 사용 중인 로그 확인

**pg_current_xlog_location()**: 현재 사용 중인 로그를 출력합니다.

```sql
postgres=# select pg_current_xlog_location();
 pg_current_xlog_location 
--------------------------
 0/41000060
(1 row)
```
