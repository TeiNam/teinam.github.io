---
date: 2019-02-24 16:05:35 +0900
title: "PostgreSQL 스키마"
category: postgresql
excerpt: "SCHEMA 생성 SCHEMA는 Object들의 논리적 집합체 입니다. TABLE, VIEW, SEQUENCE, SYNONYM, DOMIAN, FUNCTION 등으로 구성되어 있습니다. SCHEMA를 사용하는 이유는 논리적 집합체를 만들어서 관리의 편의성을 높이고, 여러 USER들…"
updated: 2026-09-17
---

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

> **전제조건:** PostgreSQL 9.3 이상, CREATE SCHEMA 권한 또는 SUPERUSER 권한

## SCHEMA 생성

SCHEMA는 Object의 논리적 집합체입니다.

TABLE, VIEW, SEQUENCE, SYNONYM, DOMAIN, FUNCTION 등으로 구성되어 있습니다.

SCHEMA를 사용하는 이유는 논리적 집합체를 만들어 관리의 편의성을 높이고, 여러 USER 간의 간섭 없이 접속할 수 있게 합니다.

### Synopsis

```sql
CREATE SCHEMA schema_name [ AUTHORIZATION user_name ] [ schema_element [ ... ] ]
CREATE SCHEMA AUTHORIZATION user_name [ schema_element [ ... ] ]
CREATE SCHEMA IF NOT EXISTS schema_name [ AUTHORIZATION user_name ]
CREATE SCHEMA IF NOT EXISTS AUTHORIZATION user_name
```

### 파라미터

1. **schema_name**: 생성할 SCHEMA 이름을 입력합니다. 이름을 입력하지 않으면 USER의 이름이 SCHEMA 이름으로 사용됩니다. (단, `pg_`로 시작하는 이름은 스키마로 사용할 수 없습니다.)

2. **AUTHORIZATION user_name**: 스키마를 소유한 USER의 이름을 입력합니다. 생략하면 접속 중인 USER가 기본값으로 저장되고, SUPERUSER만이 다른 USER가 소유한 SCHEMA를 만들 수 있습니다.

3. **schema_element [ ... ]**: SCHEMA 내에서 객체를 정의하는 SQL문을 작성합니다. CREATE TABLE, CREATE VIEW, CREATE INDEX, CREATE SEQUENCE, CREATE TRIGGER, GRANT 등이 포함될 수 있습니다.

4. **IF NOT EXISTS schema_name**: 특정 이름이 SCHEMA에 없을 경우 그 SCHEMA를 생성합니다.

5. **IF NOT EXISTS AUTHORIZATION user_name**: USER가 소유한 SCHEMA가 존재하지 않을 때 SCHEMA를 생성합니다.

### 생성 예제

```sql
postgres=# CREATE SCHEMA test01 AUTHORIZATION test_user;
postgres=# GRANT ALL ON SCHEMA test01 TO test_user;
```

오라클에서는 SCHEMA = USER의 개념으로 하나의 User가 하나의 Schema를 소유합니다.

하지만 Postgres나 MySQL 같은 DB에서는 User와 Schema가 분리된 개념이며, 하나의 유저가 여러 개의 스키마를 소유할 수도 있습니다.

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

## SCHEMA의 복제

Windows 버전에서는 불가능하지만, Linux 버전이라면 `pg_dump`, `sed`, `psql`을 사용해 백업 파일을 만들지 않고 스키마 복제가 가능합니다.

### 같은 DB 내에 스키마를 복제하는 법 (Owner 동일)

```bash
$ pg_dump -U test_user01 -n test_schema01 testdb | sed 's/test_schema01/test_schema02/g' | psql -U test_user01 -d testdb
```

### 다른 유저에게 복사한 스키마의 권한 주기

```sql
postgres=# ALTER SCHEMA test_schema02 OWNER TO new_user;
```

`pg_dump`, `sed`, `psql`을 사용해 다른 유저의 권한으로 스키마를 복제할 수 있으나, 새로 스키마를 복제한 계정이 같은 멤버로 속해 있지 않거나 SUPERUSER가 아닌 경우 function이나 기타 항목이 생성되지 않을 수 있습니다.

같은 계정에서 생성하고 후에 권한을 넘겨주는 방식으로 진행하는 편이 좋습니다.
