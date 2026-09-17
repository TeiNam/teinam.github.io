---
date: 2019-03-03 00:50:32 +0900
title: "PostgreSQL 시간 조회"
category: postgresql
excerpt: "현재 시간 조회 postgres=# select now(); 현재 타임존 조회 postgres=# show timezone; 타임존 변경 방법 postgres=# SET TIME ZONE ‘Asia/Seoul’; 시스템 일자 postgres=# select current_date,…"
updated: 2026-09-17
---

PostgreSQL의 날짜·시간 관련 함수와 타임존 설정 방법을 정리했다. 각 예제는 `psql` 클라이언트에서 바로 실행할 수 있다.

## 현재 시간 조회

```sql
postgres=# select now();
```

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
postgres=# select extract('doy' from timestamp '2013-07-30 20:38:40');
```
