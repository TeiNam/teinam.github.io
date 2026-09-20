---
date: 2019-03-03 00:56:49 +0900
title: "PostgreSQL 테이블스페이스 및 오브젝트 사용량 확인"
category: postgresql
excerpt: "PostgreSQL에서 테이블스페이스·데이터베이스·테이블·인덱스의 디스크 사용량을 조회하는 시스템 함수를 정리합니다."
last_modified_at: 2026-09-20
---

PostgreSQL은 데이터베이스 오브젝트의 디스크 사용량을 조회하는 시스템 함수를 제공합니다. 모든 함수는 바이트 단위로 반환하며, `pg_size_pretty()`로 사람이 읽기 쉬운 형식(KB, MB, GB)으로 변환할 수 있습니다.

## 테이블스페이스 사용량

```sql
SELECT spcname, pg_size_pretty(pg_tablespace_size(spcname)) 
FROM pg_tablespace;
```

`pg_tablespace_size()`는 지정한 테이블스페이스에 저장된 모든 데이터의 총 크기를 반환합니다.

## 데이터베이스 사용량

```sql
SELECT pg_size_pretty(pg_database_size('mydb'));
```

`pg_database_size()`는 데이터베이스 전체의 디스크 사용량을 반환합니다.

## 테이블 사용량

PostgreSQL은 테이블 크기를 측정하는 여러 함수를 제공합니다.

| 함수 | 포함 범위 |
|---|---|
| `pg_relation_size()` | 테이블의 main data fork만 (TOAST·FSM·VM 제외) |
| `pg_table_size()` | 테이블 + TOAST + FSM + VM (인덱스 제외) |
| `pg_indexes_size()` | 테이블에 속한 모든 인덱스 |
| `pg_total_relation_size()` | 테이블 + 인덱스 + TOAST + FSM + VM (전체) |

### 테이블 본체 크기 (TOAST 제외)

```sql
SELECT pg_size_pretty(pg_relation_size('table_name'));
```

### 테이블 전체 크기 (인덱스 제외)

```sql
SELECT pg_size_pretty(pg_table_size('table_name'));
```

### 인덱스 전체 크기

```sql
SELECT pg_size_pretty(pg_indexes_size('table_name'));
```

### 테이블 + 인덱스 전체 크기

```sql
SELECT pg_size_pretty(pg_total_relation_size('table_name'));
```

이 함수는 테이블의 데이터·TOAST·인덱스를 모두 포함한 전체 디스크 사용량을 반환합니다.

## 개별 인덱스 크기

```sql
SELECT pg_size_pretty(pg_relation_size('index_name'));
```

## 단위 변환

모든 크기 함수는 바이트 단위(`bigint`)로 반환합니다. `pg_size_pretty()`로 변환하면 적절한 단위가 자동으로 선택됩니다.

```sql
SELECT pg_size_pretty(1024::bigint);  -- "1024 bytes"
SELECT pg_size_pretty(1048576);       -- "1024 kB" (1 MB = 1024² bytes)
```

> **NOTE** — PostgreSQL의 크기 단위는 2의 거듭제곱입니다. 1 kB = 1024 bytes, 1 MB = 1024² bytes, 1 GB = 1024³ bytes입니다.
