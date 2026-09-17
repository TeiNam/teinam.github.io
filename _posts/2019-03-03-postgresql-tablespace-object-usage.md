---
date: 2019-03-03 00:56:49 +0900
title: "PostgreSQL 테이블스페이스 및 오브젝트 사용량 확인"
category: postgresql
excerpt: "PostgreSQL 테이블스페이스 및 오브젝트 사용량 확인 테이블스페이스 총량 postgres=# select spcname, pg_size_pretty(pg_tablespace_size(spcname)) from pg_tablespace; Table Size (Index 미포함)…"
updated: 2026-09-17
---

## PostgreSQL 테이블스페이스 및 오브젝트 사용량 확인

**전제조건:** PostgreSQL 9.0 이상, `psql` 또는 쿼리를 실행할 수 있는 클라이언트 접근 권한

### 테이블스페이스 총량

```sql
postgres=# select spcname, pg_size_pretty(pg_tablespace_size(spcname)) from pg_tablespace;
```

### Table Size (Index 미포함)

```sql
postgres=# select pg_relation_size('TableName');
```

### Table Size (Index 포함)

```sql
postgres=# select pg_total_relation_size('TableName');
```

### Index Size

```sql
postgres=# select pg_relation_size('IndexName');
```

### Total Size (데이터 + 인덱스)

```sql
 postgres=# select pg_total_relation_size('TableName');
```

### 단위 표시

바이트 단위 결과를 사람이 읽을 수 있는 형식으로 변환하려면 `pg_size_pretty()` 함수를 사용한다.

### DB Size

```sql
 postgres=# select pg_size_pretty(pg_database_size('DBName'));
```
