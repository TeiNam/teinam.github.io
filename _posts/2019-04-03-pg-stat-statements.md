---
date: 2019-04-03 16:14:10 +0900
title: "pg_stat_statements"
category: postgresql
excerpt: "pg_stat_statements 란? pg_stat_statements 모듈은 서버에서 실행 되었던 쿼리들에 대한 실행 통계 정보를 보여줍니다. pg_stat_statements 모듈이 로드되면, 이 때부터 해당 서버의 모든 데이터베이스에서 일어나는 쿼리 통계가 수집됩니다. 하지…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 컬럼 표가 구버전(1.4)이다. 13 부터 total_time·min_time·max_time·mean_time·stddev_time 은 total_exec_time 계열로 바뀌고 plans·total_plan_time 계열과 wal_records/wal_bytes 가 추가됐으며, blk_read_time/blk_write_time 은 shared_blk_read_time 등으로 분리됐다. 설치 절차도 9.6 yum repo(EL7) 기준이다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## pg_stat_statements란?

- pg_stat_statements 모듈은 서버에서 실행되었던 쿼리의 실행 통계 정보를 보여줍니다.
- pg_stat_statements 모듈이 로드되면, 이 때부터 해당 서버의 모든 데이터베이스에서 일어나는 쿼리 통계가 수집됩니다. 하지만, 이 통계를 보는 pg_stat_statements view, 통계를 비우는 pg_stat_statements_reset function, 통계를 보는 pg_stat_statements function들은 각 데이터베이스 별로 지정해야 합니다.
- 주 용도는 튜닝 대상 쿼리를 수집하는데 있습니다.

## pg_stat_statements 설치

기존에 PostgreSQL 9.6을 공홈의 repo를 가지고 설치를 했다면, 그대로 그 repo를 이용하면 됩니다.

```bash
yum -y install https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-centos96-9.6-3.noarch.rpm
```

먼저, postgresql96-contrib를 설치해 줍니다.

```bash
yum -y install postgresql96-contrib
```

해당 패키지를 설치하면, pgsql이 사용하는 $libdir 밑에 pg_stat_statements.so 파일이 설치 됩니다.

```bash
postgres@db:~]$ pg_config --pkglibdir
/usr/lib64/pgsql
postgres@db:~]$ ls -l /usr/lib64/pgsql/pg_stat_statements.so
-rwxr-xr-x 1 root root 28328 Aug 24  2018 /usr/lib64/pgsql/pg_stat_statements.so
```

모듈을 로드 하기 위해서는 $PGDATA 밑의 postgresql.conf 파일을 수정해줘야 합니다.

```bash
vi postgresql.conf

shared_preload_libraries = 'pg_stat_statements'         # (change requires restart)
pg_stat_statements.max = 10000
pg_stat_statements.track = all
```

> **주의:** 이 설정 변경은 클러스터 재구동이 필요합니다.

```bash
pg_ctl restart -D $PGDATA
```

psql 로 DB에 접속한 후, create extension pg_stat_statements; 명령으로 모듈을 설치 하면 됩니다.

```sql
$ psql
postgres=# \c template1 
psql (9.2.24, server 9.6.12)
WARNING: psql version 9.2, server version 9.6.
         Some psql features might not work.
You are now connected to database "template1" as user "postgres".
template1=#
template1=# create extension pg_stat_statements;
template1=# \dx
                                     List of installed extensions
        Name        | Version |   Schema   |                        Description                        
--------------------+---------+------------+-----------------------------------------------------------
 pg_stat_statements | 1.4     | public     | track execution statistics of all SQL statements executed
 plpgsql            | 1.0     | pg_catalog | PL/pgSQL procedural language
(2 rows)
```

template1 에다 설치해놓고 새로운 DB를 생성 할때 마다 template1을 참조해서 생성한다면 신규DB에도 pg_stat_statements extention이 설치 됩니다.

기존에 설치된 DB에는 create extension pg_stat_statements; 명령으로 설치를 따로 해줘야 합니다.

## pg_stat_statements view의 칼럼들

| 칼럼명 | 자료형 | 참조 | 설명 |
| --- | --- | --- | --- |
| userid | oid | pg_authid.oid | 해당 쿼리를 실행했던 사용자의 OID |
| dbid | oid | pg_database.oid | 해당 쿼리를 실행했던 데이터베이스 OID |
| query | text |  | 해당 쿼리 내용(track_activity_query_size 값으로 지정한 크기만큼만 저장됨) |
| calls | bigint |  | 실행 회수 |
| total_time | double precision |  | 밀리세컨드 단위 총 실행 시간 |
| min_time | double precision |  | 해당 구문 최소 실행 시간, 밀리초 |
| max_time | double precision |  | 해당 구문 최대 실행 시간, 밀리초 |
| mean_time | double precision |  | 해당 구문 평균 실행 시간, 밀리초 |
| stddev_time | double precision |  | 해당 구문 실행 시간의 표준 편차, 밀리초 |
| rows | bigint |  | 해당 쿼리로 출력한 또는 영향 받는 총 로우 개수 |
| shared_blks_hit | bigint |  | Total number of shared block cache hits by the statement |
| shared_blks_read | bigint |  | Total number of shared blocks read by the statement |
| shared_blks_dirtied | bigint |  | Total number of shared blocks dirtied by the statement |
| shared_blks_written | bigint |  | Total number of shared blocks written by the statement |
| local_blks_hit | bigint |  | Total number of local block cache hits by the statement |
| local_blks_read | bigint |  | Total number of local blocks read by the statement |
| local_blks_dirtied | bigint |  | Total number of local blocks dirtied by the statement |
| local_blks_written | bigint |  | Total number of local blocks written by the statement |
| temp_blks_read | bigint |  | Total number of temp blocks read by the statement |
| temp_blks_written | bigint |  | Total number of temp blocks written by the statement |
| blk_read_time | double precision |  | 블록을 디스크에서 읽는데 소비한 총 시간, 밀리세컨드 (track_io_timing 값이 on 상태여야 함, 그렇지 않으면, 0) |
| blk_write_time | double precision |  | 블록을 디스크로 쓰는데 소비한 총 시간, 밀리세컨드 (track_io_timing 값이 on 상태여야 함, 그렇지 않으면, 0) |
