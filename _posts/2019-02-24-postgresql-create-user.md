---
date: 2019-02-24 16:10:42 +0900
title: "PostgreSQL 유저 생성"
category: postgresql
excerpt: "유저 생성 DATABASE에서 USER는 DATABASE를 사용하는 주체로서 OS를 운영하는 USER와는 분리되어 있습니다. USER는 소유하고 있는 DATABASE안에 있는 OBJECT의 권한을 변경하고 제어할 수 있습니다. 유저를 생성하기 위해서는 먼저 DATABASE에서 SU…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — CREATEUSER/NOCREATEUSER 와 UNENCRYPTED PASSWORD 는 현재 CREATE ROLE/CREATE USER 구문에서 받지 않는다. 대체 속성은 SUPERUSER, CREATEROLE 이고 ENCRYPTED 는 하위호환용 무동작 키워드다. BYPASSRLS·VALID UNTIL 등 현재 옵션도 누락돼 있다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## 유저 생성

DATABASE에서 USER는 DATABASE를 사용하는 주체로서 OS를 운영하는 USER와 분리되어 있습니다.

USER는 소유한 DATABASE 안 OBJECT의 권한을 변경하고 제어할 수 있습니다.

유저를 생성하려면 먼저 DATABASE에서 SUPERUSER 권한을 가지고 있어야 합니다.

PostgreSQL에서 SUPERUSER의 기본 계정은 postgres입니다.

## 유저 조회

```sql
postgres=# SELECT * FROM PG_SHADOW;
```

or

```sql
postgres=# \du
```

`\du`를 입력하면 USER들이 가진 ROLE을 확인할 수 있습니다.

SUPERUSER인 postgres는 SUPERUSER, CREATE ROLE, CREATE DB, REPLICATION 기능을 가지고 있습니다.

**SUPERUSER**: USER를 생성하고 권한을 부여하는 USER  
**CREATE ROLE**: USER가 새로운 ROLE을 정의하는 기능  
**CREATE DB**: USER가 DB를 생성하는 권한  
**REPLICATION**: USER가 DB를 실시간으로 복사하는 기능

## Synopsis

```
CREATE USER username [[ WITH ] option [ … ]]
```

where option can be:

**SUPERUSER | NOSUPERUSER** – USER에게 SUPERUSER 권한을 줍니다. 따로 지정하지 않으면 기본값으로 NOSUPERUSER가 됩니다.

**CREATEDB | NOCREATEDB** – DATABASE를 생성하는 권한을 정의합니다. CREATEDB를 선택하면 USER는 DATABASE를 생성할 권한이 부여됩니다. NOCREATEDB를 선택하면 USER는 DATABASE를 생성할 권한이 거부됩니다. 따로 정의하지 않으면 NOCREATEDB 값이 기본 설정됩니다.

**CREATEUSER | NOCREATEUSER** – 스스로 새로운 유저를 생성하는 권한을 부여합니다. CREATEUSER를 선택하면 USER를 생성할 권한이 부여됩니다. NOCREATEUSER를 선택하면 USER를 생성할 권한이 거부됩니다.

**INHERIT | NOINHERIT** – DATABASE의 권한을 다른 구성원에게 상속하는 역할을 합니다. 따로 정의하지 않으면 INHERIT 값이 기본값으로 설정됩니다.

**LOGIN | NOLOGIN** – USER가 로그인하는 권한을 부여합니다.

**CONNECTION LIMIT connlimit** – 로그인 시 동시 연결을 지원하는 기능으로 기본값은 -1(제한 없음)입니다.

**[ENCRYPTED | UNENCRYPTED ] PASSWORD 'password'** – 'password'를 입력합니다. 인증이 필요 없으면 옵션을 생략할 수 있습니다.

## 생성 예제

```sql
postgres=# create user TEST_USER with password 'test01';
```
