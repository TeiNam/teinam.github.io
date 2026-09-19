---
date: 2019-03-03 00:50:32 +0900
title: "PostgreSQL 시간 조회"
category: postgresql
excerpt: "PostgreSQL의 날짜·시간 함수와 타임존 설정 방법입니다. now()는 트랜잭션 시작 시각을, clock_timestamp()는 실제 호출 시각을 반환합니다."
updated: 2026-09-20
---

PostgreSQL의 날짜·시간 관련 함수와 타임존 설정 방법입니다. 각 예제는 `psql` 클라이언트에서 바로 실행할 수 있습니다.

## 현재 시간 조회

```sql
SELECT now();               -- 트랜잭션 시작 시각 (timestamptz)
SELECT current_timestamp;   -- now()와 동일
SELECT clock_timestamp();   -- 실제 호출 시각 (매 호출마다 변함)
SELECT statement_timestamp(); -- 현재 SQL 명령 시작 시각
```

`now()`와 `current_timestamp`는 트랜잭션 시작 시각을 반환하므로, 같은 트랜잭션 안에서 여러 번 호출해도 같은 값을 반환합니다. 실제 현재 시각이 필요하면 `clock_timestamp()`를 사용합니다.

## 현재 타임존 조회

```sql
postgres=# show timezone;
```

## 타임존 변경 방법

```sql
postgres=# SET TIME ZONE 'Asia/Seoul';
```

## 시스템 일자

```sql
postgres=# select current_date, current_time, timeofday(); 
postgres=# select now(), current_timestamp, timestamp 'now';
```

## 년도 추출

```sql
postgres=# select date_part('year', current_timestamp);
```

## 월 추출

```sql
postgres=# select date_part('month', current_timestamp);
```

## 일 추출

```sql
postgres=# select date_part('day', current_timestamp);
```

## 분 추출

```sql
postgres=# select date_part('minute', current_timestamp);
```

## 초 추출

```sql
postgres=# select date_part('second', current_timestamp);
```

## 요일/일차 추출

```sql
postgres=# select extract('dow' from timestamp '2013-07-30 20:38:40');    -- 일요일(0), 토요일(6)
result: 5

postgres=# select extract('isodow' from timestamp '2013-07-30 20:38:40'); -- 월요일(1), 일요일(7)
result: 5
```

```sql
SELECT EXTRACT('doy' FROM TIMESTAMP '2013-07-30 20:38:40');
```

## extract vs date_part

원문에서 `date_part()`와 `EXTRACT()`를 혼용했는데, 기능은 같지만 `EXTRACT()`가 권장됩니다. `date_part()`는 `double precision`을 반환하므로 정밀도가 떨어질 수 있고, `EXTRACT()`는 SQL 표준이며 `numeric`을 반환합니다.

```sql
-- 권장
SELECT EXTRACT(SECOND FROM TIME '17:12:28.5');  -- 28.500000 (numeric)

-- 비권장 (호환성 목적으로만)
SELECT date_part('second', TIME '17:12:28.5');  -- 28.5 (float8)
```

## timestamp vs timestamptz

PostgreSQL은 두 가지 타임스탬프 타입을 제공합니다.

- `timestamp` (= `timestamp without time zone`) — 타임존 정보가 없는 "날짜와 시각" 그 자체
- `timestamptz` (= `timestamp with time zone`) — UTC로 저장하고 세션 타임존에 맞춰 표시

실무에서는 **`timestamptz`를 기본**으로 사용합니다. `timestamp`는 타임존을 무시하므로 서머타임이나 타임존 변환이 필요한 경우 문제가 발생합니다.

```sql
-- timestamptz는 UTC로 저장하고 세션 타임존으로 표시
SELECT '2024-01-01 12:00:00+09'::timestamptz;  -- 2024-01-01 12:00:00+09

-- timestamp는 타임존 정보를 무시
SELECT '2024-01-01 12:00:00+09'::timestamp;    -- 2024-01-01 12:00:00
```

변환은 `AT TIME ZONE`으로 합니다.

```sql
-- timestamp → timestamptz (해당 타임존에 있는 것으로 해석)
SELECT TIMESTAMP '2024-01-01 12:00:00' AT TIME ZONE 'Asia/Seoul';

-- timestamptz → timestamp (해당 타임존의 벽시계 시각으로 변환)
SELECT TIMESTAMPTZ '2024-01-01 12:00:00+09' AT TIME ZONE 'UTC';

-- timestamptz → timestamp (세션 타임존으로 변환, PostgreSQL 17+)
SELECT TIMESTAMPTZ '2024-01-01 12:00:00+09' AT LOCAL;
```
