---
date: 2019-07-09 13:49:58 +0900
title: "PostgreSQL Cache Hit Rate"
category: postgresql
excerpt: "PostgreSQL 공유 버퍼 캐시 히트율을 조회하는 방법입니다. 이 지표는 PostgreSQL 공유 버퍼의 효율만 측정하며, OS 페이지 캐시는 포함하지 않습니다."
updated: 2026-09-20
---

PostgreSQL 캐시 히트율은 공유 버퍼(shared buffer)에서 데이터를 찾은 비율을 나타냅니다.

## 조회 방법

```sql
SELECT datname,
       blks_hit,
       blks_read,
       ROUND(blks_hit::numeric * 100 / NULLIF(blks_hit + blks_read, 0), 2) AS cache_hit_ratio,
       stats_reset
FROM pg_stat_database
WHERE datname IS NOT NULL;
```

또는 전체 데이터베이스의 평균 히트율:

```sql
SELECT ROUND(SUM(blks_hit) * 100 / SUM(blks_hit + blks_read), 2) AS "Buffer Cache Hit Ratio"
FROM pg_stat_database;
```

일반적으로 90% 이상이 권장되지만, 이것은 관행일 뿐 공식 기준은 아닙니다.

## 이 지표의 한계

`blks_hit`과 `blks_read`는 **PostgreSQL 공유 버퍼**만 측정합니다. PostgreSQL 매뉴얼은 다음과 같이 명시합니다.

> `blks_hit`: Number of times disk blocks were found already in the buffer cache, so that a read was not necessary (**this only includes hits in the PostgreSQL buffer cache, not the operating system's file system cache**)

즉:

- `blks_hit`는 PostgreSQL 공유 버퍼에서 찾은 경우만 세고, **OS 페이지 캐시는 세지 않습니다**
- `blks_read`는 PostgreSQL이 커널에 읽기를 요청한 횟수이므로, **실제 디스크 I/O와 OS 캐시 히트를 구분하지 못합니다**

따라서 이 히트율이 낮아 보여도 실제 디스크 I/O는 적을 수 있습니다. PostgreSQL 문서는 "OS 유틸리티와 함께 사용하여 I/O 성능의 전체 그림을 파악하라"고 권장합니다.

## pg_stat_io (PostgreSQL 16+)

PostgreSQL 16부터 `pg_stat_io` 뷰가 추가되어 더 세분화된 I/O 통계를 제공합니다. 백엔드 타입(client backend, checkpointer 등), I/O 객체(relation, WAL 등), 컨텍스트(normal, bulkread, vacuum 등)별로 `hits`, `reads`, `evictions` 등을 확인할 수 있습니다.

```sql
SELECT backend_type, object, context, 
       hits, reads, evictions,
       ROUND(hits::numeric * 100 / NULLIF(hits + reads, 0), 2) AS hit_ratio
FROM pg_stat_io
WHERE hits IS NOT NULL OR reads IS NOT NULL
ORDER BY backend_type, object, context;
```
