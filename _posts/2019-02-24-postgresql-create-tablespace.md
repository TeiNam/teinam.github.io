---
date: 2019-02-24 16:02:05 +0900
title: "PostgreSQL Tablespace 생성"
category: postgresql
excerpt: "Tablespace 데이터베이스에서 Tablespace는 오라클과 PostgreSQL에서만 존재하는 개념입니다. 테이블스페이스가 존재 함으로 각 schema의 오브젝트 관리가 용이해지며, 데이터파일 관리 및 용량 관리에 있어서, 또는 성능 관리에 있어서 효과적인 관리가 가능해 집니…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — CREATE TABLESPACE 구문과 pg_tablespace·\db 조회는 현재도 동일하다. 다만 "테이블스페이스는 오라클과 PostgreSQL에만 존재"라는 서술은 사실이 아니다(DB2, InnoDB 등에도 존재).

**Tablespace**

데이터베이스에서 Tablespace는 오라클과 PostgreSQL에서만 존재하는 개념입니다.

테이블스페이스가 존재하므로 각 스키마의 오브젝트 관리가 용이해지며, 데이터 파일 관리·용량 관리·성능 관리에서 효과적입니다.

**테이블스페이스 확인**

```sql
postgres=# select * from pg_tablespace;
  spcname   | spcowner | spcacl | spcoptions 
------------+----------+--------+------------
 pg_default |       10 |        | 
 pg_global  |       10 |        | 
(2 rows)
```

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

특별히 유저나 스키마에 테이블스페이스를 지정하지 않으면 pg\_default 테이블스페이스를 이용합니다.  
해당 디렉토리는 postgres의 권한을 가지고 있어야 합니다.

**테이블스페이스 생성**

Synopsis:  
CREATE TABLESPACE tablespace\_name  
[ OWNER { new\_owner | CURRENT\_USER | SESSION\_USER } ]  
LOCATION 'directory'  
[ WITH ( tablespace\_option = value [, … ] ) ]

**생성 예제**

```bash
postgres@pgsqldb:~]$ psql -d postgres -U postgres
psql (9.6.11)
Type "help" for help.
postgres=# CREATE TABLESPACE mydb01 LOCATION '/postgresql/tbs';
CREATE TABLESPACE
postgres=#
```

**Tablespace 조회**

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

```bash
postgres=# \q
postgres@pgsqldb:~]$ ls -l /postgresql/tbs/
total 0
drwx------ 2 postgres postgres 6 Dec 27 14:03 PG_9.6_201608131
postgres@pgsqldb:~]$ ls -l $PGDATA/pg_tblspc
total 0
lrwxrwxrwx 1 postgres postgres 15 Dec 27 14:03 16392 -> /postgresql/tbs
postgres@pgsqldb:~]$
```

테이블스페이스 owner를 지정해서 생성할 수도 있습니다.

![](/assets/img/wp/2019/02/99D9C6335C245F5317FFE8.jpg)

경로를 지정하여 테이블스페이스를 생성하면 $PGDATA/pg\_tblspc 밑에 OID로 심볼릭 링크가 생성됩니다.

실제 파일은 경로에 있고, 클러스터 홈 밑의 pg\_tblspc에 링크가 생성되어 DB에 정보를 전달합니다.

**테이블스페이스 이름 변경**

```sql
postgres=# ALTER TABLESPACE mydb RENAME TO mydb01;
```

**테이블스페이스 Owner 변경**

```sql
postgres=# ALTER TABLESPACE mydb01 OWNER TO POSTGRES;
```
