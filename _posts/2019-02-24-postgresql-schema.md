---
date: 2019-02-24 16:05:35 +0900
title: "PostgreSQL 스키마"
category: postgresql
excerpt: "PostgreSQL 스키마는 테이블·뷰·시퀀스·함수 등 데이터베이스 오브젝트를 논리적으로 그룹화하는 네임스페이스입니다. 여러 사용자가 이름 충돌 없이 작업할 수 있도록 합니다."
updated: 2026-09-20
---

## 스키마 개념

스키마(Schema)는 데이터베이스 오브젝트를 논리적으로 그룹화하는 네임스페이스입니다.

스키마 안에는 테이블(TABLE), 뷰(VIEW), 시퀀스(SEQUENCE), 도메인(DOMAIN), 함수(FUNCTION), 인덱스(INDEX) 등을 생성할 수 있습니다.

스키마를 사용하면 오브젝트를 논리적 단위로 관리할 수 있고, 여러 사용자가 이름 충돌 없이 같은 데이터베이스에서 작업할 수 있습니다. 예를 들어 `sales.orders`와 `accounting.orders`는 서로 다른 테이블입니다.

> **NOTE** — Oracle에서는 스키마와 사용자가 1:1 대응하지만, PostgreSQL에서는 한 사용자가 여러 스키마를 소유할 수 있고, 하나의 스키마 안에 여러 사용자가 오브젝트를 만들 수 있습니다.

## 스키마 생성

### 구문

```sql
CREATE SCHEMA schema_name [ AUTHORIZATION role_specification ] [ schema_element [ ... ] ]
CREATE SCHEMA AUTHORIZATION role_specification [ schema_element [ ... ] ]
CREATE SCHEMA IF NOT EXISTS schema_name [ AUTHORIZATION role_specification ]
CREATE SCHEMA IF NOT EXISTS AUTHORIZATION role_specification
```

`role_specification`은 다음 중 하나입니다:

```text
user_name | CURRENT_ROLE | CURRENT_USER | SESSION_USER
```

### 파라미터

- **schema\_name**: 생성할 스키마 이름 (`pg_`로 시작하면 안 됩니다)
- **AUTHORIZATION role\_specification**: 스키마 소유자 (생략하면 현재 사용자)
- **schema\_element**: 스키마 생성과 동시에 실행할 DDL 문 (CREATE TABLE, CREATE VIEW, CREATE INDEX, CREATE SEQUENCE, CREATE TRIGGER, GRANT만 가능)
- **IF NOT EXISTS**: 같은 이름의 스키마가 이미 존재하면 오류 대신 NOTICE를 출력합니다

> **NOTE** — IF NOT EXISTS를 사용하면 `schema_element`를 함께 쓸 수 없습니다. 오브젝트는 스키마 생성 후 별도 명령으로 만들어야 합니다.

### 생성 예제

```sql
-- 기본: 현재 사용자 소유로 스키마 생성
CREATE SCHEMA myschema;

-- 다른 사용자 소유로 생성
CREATE SCHEMA test01 AUTHORIZATION test_user;

-- 오브젝트와 함께 생성
CREATE SCHEMA hollywood
    CREATE TABLE films (title text, release date)
    CREATE VIEW winners AS
        SELECT title, release FROM films WHERE release > '2020-01-01';

-- 이미 존재하면 건너뛰기
CREATE SCHEMA IF NOT EXISTS test01;
```

### 스키마 권한

스키마를 사용하려면 두 가지 권한이 필요합니다.

| 권한 | 의미 |
|---|---|
| `USAGE` | 스키마 안의 오브젝트에 접근 |
| `CREATE` | 스키마 안에 새 오브젝트 생성 |

```sql
-- 특정 사용자에게 스키마 사용 권한 부여
GRANT USAGE ON SCHEMA test01 TO test_user;

-- 특정 사용자가 스키마에 테이블 생성할 수 있게 허용
GRANT CREATE ON SCHEMA test01 TO test_user;

-- 모든 권한 부여
GRANT ALL ON SCHEMA test01 TO test_user;
```

## public 스키마

모든 데이터베이스는 기본적으로 `public` 스키마를 가지고 있습니다. 스키마를 명시하지 않고 테이블을 생성하면 `public` 스키마에 만들어집니다.

```sql
CREATE TABLE products (...);        -- public.products와 동일
CREATE TABLE public.products (...); -- 명시적 지정
```

> **IMPORTANT** — PostgreSQL 15부터 `public` 스키마에 대한 `CREATE` 권한이 모든 사용자(`PUBLIC`)에게서 회수됐습니다. 이전 버전에서 업그레이드한 데이터베이스는 기존 권한이 유지되므로, 보안을 강화하려면 다음 명령을 실행하세요.

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

이렇게 하면 일반 사용자는 `public` 스키마에 테이블을 만들 수 없고, 각자 자신의 스키마를 사용해야 합니다.

## SCHEMA Size 확인

```sql
SELECT schema_name, 
    pg_size_pretty(sum(table_size)::bigint) as "disk space",
    (sum(table_size) / pg_database_size(current_database())) * 100
        as "percent"
FROM (
     SELECT pg_catalog.pg_namespace.nspname as schema_name,
         pg_relation_size(pg_catalog.pg_class.oid) as table_size
     FROM   pg_catalog.pg_class
         JOIN pg_catalog.pg_namespace 
             ON relnamespace = pg_catalog.pg_namespace.oid
) t
GROUP BY schema_name
ORDER BY schema_name;
```

## 스키마 복제

`pg_dump`와 `sed`, `psql`을 파이프로 연결하면 백업 파일을 만들지 않고 스키마를 복제할 수 있습니다.

### 같은 데이터베이스 내에서 스키마 복제

```bash
pg_dump -U test_user01 -n test_schema01 testdb \
  | sed 's/test_schema01/test_schema02/g' \
  | psql -U test_user01 -d testdb
```

이 명령은 `test_schema01`의 DDL을 추출해서 모든 스키마 이름을 `test_schema02`로 치환한 뒤 다시 실행합니다.

### 스키마 소유자 변경

```sql
ALTER SCHEMA test_schema02 OWNER TO new_user;
```

> **NOTE** — 함수·트리거 같은 오브젝트는 생성 권한이 필요하므로, 다른 사용자 소유로 바로 복제하면 일부 오브젝트가 생성되지 않을 수 있습니다. 같은 계정으로 복제한 뒤 소유자를 변경하는 것이 안전합니다.
