---
date: 2019-02-24 15:51:10 +0900
title: "PostgreSQL DB 생성 및 삭제"
category: postgresql
excerpt: "PostgreSQL에서 데이터베이스를 생성·삭제하는 방법입니다. SQL 명령(CREATE DATABASE, DROP DATABASE)과 셸 명령(createdb, dropdb)을 모두 사용할 수 있습니다."
updated: 2026-09-20
---

PostgreSQL을 관리하는 방법은 크게 두 가지입니다.

- 터미널 명령줄 (`psql`, `createdb`, `dropdb`)
- GUI 도구 (pgAdmin, DBeaver 등)

## 데이터베이스 생성

### SQL 구문

```sql
CREATE DATABASE name
    [ WITH ] [ OWNER [=] user_name ]
           [ TEMPLATE [=] template ]
           [ ENCODING [=] encoding ]
           [ STRATEGY [=] strategy ]
           [ LOCALE [=] locale ]
           [ LC_COLLATE [=] lc_collate ]
           [ LC_CTYPE [=] lc_ctype ]
           [ BUILTIN_LOCALE [=] builtin_locale ]
           [ ICU_LOCALE [=] icu_locale ]
           [ ICU_RULES [=] icu_rules ]
           [ LOCALE_PROVIDER [=] locale_provider ]
           [ COLLATION_VERSION = collation_version ]
           [ TABLESPACE [=] tablespace_name ]
           [ ALLOW_CONNECTIONS [=] allowconn ]
           [ CONNECTION LIMIT [=] connlimit ]
           [ IS_TEMPLATE [=] istemplate ]
           [ OID [=] oid ]
```

주요 옵션:

| 옵션 | 설명 |
|---|---|
| `OWNER` | 데이터베이스 소유자 (기본값: 현재 사용자) |
| `TEMPLATE` | 복사할 템플릿 데이터베이스 (기본값: `template1`) |
| `ENCODING` | 문자 인코딩 (예: `UTF8`) |
| `LOCALE` | 기본 로케일 설정 |
| `TABLESPACE` | 데이터 파일을 저장할 테이블스페이스 |
| `CONNECTION LIMIT` | 최대 동시 접속 수 (`-1`은 무제한) |
| `STRATEGY` | 복사 전략 (`WAL_LOG` 또는 `FILE_COPY`) |

### 셸 명령으로 생성

```bash
$ createdb mydb
```

`createdb`는 `CREATE DATABASE`를 감싸는 편의 명령입니다. 데이터베이스를 생성한 뒤 `psql`로 접속할 수 있습니다.

```bash
$ psql mydb
Type "help" for help.

mydb=#
```

데이터베이스에서 빠져나가려면 `\q`를 입력합니다.

### SQL 명령으로 생성

`psql`에서 직접 SQL 명령을 실행할 수도 있습니다.

```sql
postgres=# CREATE DATABASE mydb2;
CREATE DATABASE

postgres=# CREATE DATABASE sales 
           OWNER salesapp 
           ENCODING 'UTF8' 
           LOCALE 'en_US.UTF-8';
CREATE DATABASE
```

## 데이터베이스 삭제

### SQL 구문

```sql
DROP DATABASE [ IF EXISTS ] name [ [ WITH ] ( FORCE ) ]
```

- **IF EXISTS**: 데이터베이스가 없어도 오류를 발생시키지 않고 NOTICE만 출력합니다.
- **FORCE**: 해당 데이터베이스에 연결된 모든 세션을 강제 종료한 뒤 삭제합니다 (PostgreSQL 13+).

> **WARNING** — `DROP DATABASE`는 되돌릴 수 없습니다. 데이터 디렉토리와 카탈로그가 모두 삭제됩니다.

### 셸 명령으로 삭제

```bash
$ dropdb mydb
```

### SQL 명령으로 삭제

```sql
-- 기본 삭제 (다른 세션이 연결돼 있으면 실패)
DROP DATABASE mydb2;

-- 없어도 오류 없이 진행
DROP DATABASE IF EXISTS mydb2;

-- 연결된 세션을 강제 종료하고 삭제
DROP DATABASE mydb WITH (FORCE);
```

> **NOTE** — 삭제하려는 데이터베이스에 접속한 상태에서는 삭제할 수 없습니다. `postgres` 데이터베이스나 다른 데이터베이스로 전환한 뒤 삭제하세요.

## Database 목록 확인

`\l` 명령으로 데이터베이스 리스트를 확인할 수 있습니다.

```bash
postgres-# \l
                                  List of databases
   Name    |  Owner   | Encoding |   Collate   |    Ctype    |   Access privileges   
-----------+----------+----------+-------------+-------------+-----------------------
 mydb      | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 | 
 postgres  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 | 
 template0 | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 | =c/postgres          +
           |          |          |             |             | postgres=CTc/postgres
 template1 | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 | =c/postgres          +
           |          |          |             |             | postgres=CTc/postgres
(4 rows)
```
