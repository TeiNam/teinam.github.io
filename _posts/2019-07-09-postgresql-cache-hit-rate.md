---
date: 2019-07-09 13:49:58 +0900
title: "PostgreSQL Cache Hit Rate"
category: postgresql
excerpt: "PostgreSQL의 Cache hit rate가 가지는 의미는 오라클과 비슷합니다. Shared buffer에 올라와 있는 데이터를 가져다 쓰는 비율을 나타내며, 90% 이상의 효율을 유지하는 것이 성능적인 부분에서 유리합니다. PostgreSQL cache hit ratio 조…"
updated: 2026-09-17
---

PostgreSQL의 Cache hit rate가 가지는 의미는 오라클과 비슷합니다.

Shared buffer에 올라와 있는 데이터를 가져다 쓰는 비율을 나타내며, 90% 이상의 효율을 유지하는 것이 성능에 유리합니다.

**PostgreSQL cache hit ratio 조회**

```sql
select round(sum(blks_hit)*100/sum(blks_hit + blks_read),2) as "Buffer Cache Hit Ratio" from pg_stat_database;
```
