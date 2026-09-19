---
date: 2019-02-24 16:02:05 +0900
title: "PostgreSQL Tablespace 생성"
category: postgresql
excerpt: "PostgreSQL의 테이블스페이스는 테이블·인덱스를 저장할 파일시스템 경로를 지정하는 기능으로, 디스크 용량·성능 관리를 위해 오브젝트를 분산 배치할 수 있습니다."
updated: 2026-09-20
---

## Tablespace 개념

데이터베이스에서 테이블스페이스(Tablespace)는 테이블·인덱스 같은 데이터베이스 오브젝트를 저장할 위치를 파일시스템 경로로 지정하는 기능입니다. PostgreSQL을 비롯해 Oracle, MySQL InnoDB, DB2 등 주요 RDBMS가 지원합니다.

테이블스페이스를 사용하면 스키마별·용도별로 오브젝트를 다른 디스크에 분산 배치할 수 있어 용량 관리와 성능 관리에 효과적입니다.

## 기본 테이블스페이스 확인

PostgreSQL 클러스터를 초기화(`initdb`)하면 두 개의 시스템 테이블스페이스가 자동으로 생성됩니다.

```sql
postgres=# \db
       List of tablespaces
    Name    |  Owner   | Location 
------------+----------+----------
 pg_default | postgres | 
 pg_global  | postgres | 
(2 rows)
```

```sql
postgres=# \db+
                                  List of tablespaces
    Name    |  Owner   | Location | Access privileges | Options |  Size  | Description 
------------+----------+----------+-------------------+---------+--------+-------------
 pg_default | postgres |          |                   |         | 29 MB  | 
 pg_global  | postgres |          |                   |         | 497 kB | 
(2 rows)
```

- **pg\_default**: 사용자가 별도로 테이블스페이스를 지정하지 않으면 이 테이블스페이스를 사용합니다.
- **pg\_global**: 클러스터 전체에서 공유하는 시스템 카탈로그(예: `pg_database`)를 저장합니다.

`pg_tablespace` 카탈로그를 직접 조회할 수도 있습니다.

```sql
postgres=# select * from pg_tablespace;
  spcname   | spcowner | spcacl | spcoptions 
------------+----------+--------+------------
 pg_default |       10 |        | 
 pg_global  |       10 |        | 
(2 rows)
```

## 테이블스페이스 생성

### 구문

```sql
CREATE TABLESPACE tablespace_name
    [ OWNER { new_owner | CURRENT_ROLE | CURRENT_USER | SESSION_USER } ]
    LOCATION 'directory'
    [ WITH ( tablespace_option = value [, ... ] ) ]
```

- **tablespace\_name**: 생성할 테이블스페이스 이름 (`pg_` 로 시작하면 안 됩니다)
- **OWNER**: 테이블스페이스 소유자 (생략하면 생성하는 사용자)
- **LOCATION**: 데이터 파일을 저장할 디렉토리 절대 경로
- **WITH**: 플래너 비용 파라미터와 I/O 동시성 설정

#### WITH 절 옵션

| 옵션 | 설명 |
|---|---|
| `seq_page_cost` | 순차 페이지 읽기 비용 추정치 (기본값보다 빠른 디스크면 낮게) |
| `random_page_cost` | 랜덤 페이지 읽기 비용 추정치 (SSD면 낮게 설정) |
| `effective_io_concurrency` | 동시 I/O 요청 수 (병렬 처리 성능) |
| `maintenance_io_concurrency` | VACUUM 등 유지보수 작업 시 동시 I/O 수 |

### 디렉토리 요구사항

테이블스페이스를 생성하기 전에 디렉토리를 준비해야 합니다.

- **존재하는 빈 디렉토리**여야 합니다 (CREATE TABLESPACE는 디렉토리를 생성하지 않습니다)
- **PostgreSQL 시스템 유저(보통 postgres)가 소유**해야 합니다
- **절대 경로**를 지정해야 합니다

```bash
mkdir /postgresql/tbs
chown postgres:postgres /postgresql/tbs
chmod 700 /postgresql/tbs
```

> **NOTE** — 테이블스페이스 생성은 슈퍼유저만 실행할 수 있습니다. 생성 후 일반 사용자에게 `CREATE` 권한을 부여하면 해당 테이블스페이스에 테이블·인덱스를 생성할 수 있습니다.

### 생성 예제

```bash
postgres@pgsqldb:~]$ psql -d postgres -U postgres
postgres=# CREATE TABLESPACE mydb01 LOCATION '/postgresql/tbs';
CREATE TABLESPACE
postgres=#
```

## 생성된 테이블스페이스 확인

```sql
postgres=# \db
           List of tablespaces
    Name    |  Owner   |    Location     
------------+----------+-----------------
 mydb01     | postgres | /postgresql/tbs
 pg_default | postgres | 
 pg_global  | postgres | 
(3 rows)
```

```sql
postgres=# select * from pg_tablespace;
  spcname   | spcowner | spcacl | spcoptions 
------------+----------+--------+------------
 pg_default |       10 |        | 
 pg_global  |       10 |        | 
 mydb01     |       10 |        | 
(3 rows)
```

### 파일 시스템 레이아웃

테이블스페이스를 생성하면 지정한 디렉토리 밑에 PostgreSQL 버전별 서브디렉토리가 생성됩니다.

```bash
postgres=# \q
postgres@pgsqldb:~]$ ls -l /postgresql/tbs/
total 0
drwx------ 2 postgres postgres 6 Dec 27 14:03 PG_9.6_201608131
```

`$PGDATA/pg_tblspc` 디렉토리에는 테이블스페이스의 OID를 이름으로 하는 심볼릭 링크가 생성됩니다.

```bash
postgres@pgsqldb:~]$ ls -l $PGDATA/pg_tblspc
total 0
lrwxrwxrwx 1 postgres postgres 15 Dec 27 14:03 16392 -> /postgresql/tbs
```

이 구조 덕분에 PostgreSQL은 클러스터 데이터 디렉토리 밖에 있는 테이블스페이스를 관리할 수 있습니다. 실제 데이터 파일은 `/postgresql/tbs`에 저장되지만, 클러스터는 `pg_tblspc/16392` 링크를 통해 접근합니다.

> **WARNING** — 테이블스페이스는 클러스터에 종속적입니다. 서버 실행 중에 `pg_tblspc` 디렉토리의 심볼릭 링크를 수동으로 변경하면 안 됩니다. 또한 테이블스페이스가 손실되면(디스크 장애 등) 전체 클러스터가 시작하지 못하거나 데이터베이스를 읽을 수 없게 됩니다.

## 테이블스페이스 변경

### 이름 변경

```sql
ALTER TABLESPACE mydb RENAME TO mydb01;
```

### 소유자 변경

```sql
ALTER TABLESPACE mydb01 OWNER TO new_owner;
-- 또는
ALTER TABLESPACE mydb01 OWNER TO CURRENT_ROLE;
```

### 옵션 설정

```sql
-- SSD에 있는 테이블스페이스의 랜덤 페이지 비용 낮추기
ALTER TABLESPACE ssd_space SET (random_page_cost = 1.1);

-- 옵션 제거
ALTER TABLESPACE ssd_space RESET (random_page_cost);
```
