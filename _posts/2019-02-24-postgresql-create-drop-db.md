---
date: 2019-02-24 15:51:10 +0900
title: "PostgreSQL DB 생성 및 삭제"
category: postgresql
excerpt: "PostgreSQL을 관리하거나 운영하는 방법은 크게 두가지로 분류 할 수 있습니다. – 터미널을 이용한 커맨드라인 사용 – pgadmin을 이용한 GUI 사용 DB생성 Synopsis : CREATE DATABASE name [ [ WITH ] [ OWNER [=] user_na…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — createdb/dropdb 와 CREATE DATABASE 기본 구문은 그대로 유효하다. 다만 예제 프롬프트가 9.6(2021-11 EOL)이고, 현재 구문에는 STRATEGY·LOCALE_PROVIDER·BUILTIN_LOCALE·ICU_LOCALE·OID 옵션이 추가돼 있다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

PostgreSQL을 관리하거나 운영하는 방법은 크게 두 가지로 분류할 수 있습니다.

- 터미널을 이용한 커맨드라인 사용  
- pgAdmin을 이용한 GUI 사용

## DB 생성

Synopsis:

```sql
CREATE DATABASE name
[ [ WITH ] [ OWNER [=] user_name ]
[ TEMPLATE [=] template ]
[ ENCODING [=] encoding ]
[ LC_COLLATE [=] lc_collate ]
[ LC_CTYPE [=] lc_ctype ]
[ TABLESPACE [=] tablespace_name ]
[ ALLOW_CONNECTIONS [=] allowconn ]
[ CONNECTION LIMIT [=] connlimit ] ]
[ IS_TEMPLATE [=] istemplate ]
```

터미널에서 `su – postgres` 계정 접속 후:

```bash
$ createdb mydb
```

이렇게 DB를 만들 수 있습니다.  
`psql` 명령으로 접속할 수 있습니다.

```bash
$ psql mydb
psql (9.6.11)
Type "help" for help.

mydb=#
```

이렇게 나오면 DB에 접속된 것입니다.

DB에서 빠져나가려면 `\q`를 입력하면 OS로 돌아갑니다.

이 방법 외에도 postgres DB에 접속해서 생성하는 방법이 있습니다.

```bash
$ psql -d postgres -U postgres
psql (9.6.11)
Type "help" for help.

postgres=# create database mydb2;
CREATE DATABASE
postgres=#
```

오라클에 비하면 간단한 DB 생성 방법입니다.

반대로 DB를 삭제하려면:

```bash
$ dropdb mydb
```

또는

```sql
postgres=# drop database mydb2;
```

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
