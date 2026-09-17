---
date: 2019-09-20 02:24:24 +0900
title: "Redis #.4 Database namespace & Expiry"
category: redis
excerpt: "Namespace Redis의 네임스페이스란 Database를 말합니다. 쉽게 말해서 PostgreSQL는 하나의 클러스터 안에 여러개의 Database를 생성하여 용도를 나눠 사용할 수 있듯이 Redis는 네임스페이스를 나눠서 Database를 구분합니다. 네임스페이스는 숫자로…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — SELECT·MOVE·EXPIRE·SETEX·TTL·PERSIST·EXPIREAT·FLUSHDB/FLUSHALL 은 현재도 유효하며 SETEX 는 폐기되지 않았습니다(`SET key value EX seconds` 와 동일). 단 "Redis 의 MRU(Most Recently Used) 캐싱 알고리즘"은 사실이 아니고 축출 정책은 근사 LRU/LFU(4.0 이후)와 LRM(8.6 신규)이며, Redis Cluster 는 0번 DB만 지원하므로 SELECT/MOVE 로 네임스페이스를 나누는 방식은 클러스터에서 쓸 수 없습니다. "200GB 넘으면 장애"는 근거를 확인할 수 없습니다.

![Redis 로고](/assets/img/wp/2019/09/redis.png)

## Namespace

Redis의 네임스페이스란 Database를 말합니다. 쉽게 말해서 PostgreSQL은 하나의 클러스터 안에 여러 개의 Database를 생성하여 용도를 나눠 사용할 수 있듯이 Redis는 네임스페이스를 나눠서 Database를 구분합니다. 네임스페이스는 숫자로 구분되며, 0이 설치되면 접속해서 사용할 수 있는 디폴트 네임스페이스입니다.

```redis-cli
127.0.0.1:6379> get gog
"https://google.co.kr"
127.0.0.1:6379> select 1
OK
127.0.0.1:6379[1]> get gog
(nil)
127.0.0.1:6379[1]>
```

`SELECT` 명령으로 네임스페이스를 선택할 수 있으며, Prompt 끝에 `[1]`로 표시가 됩니다.

디폴트 네임스페이스에서 작업했던 key 값들은 1번 네임스페이스에서 보이지 않습니다.

`MOVE` 명령으로 key 값을 다른 네임스페이스로 이동시킬 수 있습니다.

```redis-cli
127.0.0.1:6379> move gog 1
(integer) 1
127.0.0.1:6379> select 1
OK
127.0.0.1:6379[1]> get gog
"https://google.co.kr"
127.0.0.1:6379[1]>
```

하나의 Redis 서버에서 동시에 다른 여러 애플리케이션들을 실행할 때 유용합니다.

## Expiry

Redis는 빠른 액세스가 필요한 데이터 캐시에 많이 사용하기 때문에, 특정 시간이 경과되면 만료된 key-value 데이터를 Redis가 자동으로 삭제하여 전체 key set이 무한히 커지는 것을 방지합니다. 200GB가 넘어가면 장애가 난다는 이야기도 있습니다.

특정 key에 만료 시간을 표시할 때는 `EXPIRE` 명령을 사용하며, 현존하는 key와 key의 생존 시간(초)을 지정해줍니다.

```redis-cli
127.0.0.1:6379[1]> SET gog google.co.kr
OK
127.0.0.1:6379[1]> EXPIRE gog 10
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 1
127.0.0.1:6379[1]> EXISTS gog
(integer) 0
127.0.0.1:6379[1]>
```

10초가 지나면 key가 삭제되면서 0(false)을 반환합니다.

key 설정과 만료는 자주 사용되기 때문에 Redis에서 `SETEX`라는 명령으로 두 가지를 한 번에 사용할 수 있습니다.

```redis-cli
127.0.0.1:6379[1]> SETEX gog 10 "google.co.kr"
OK
127.0.0.1:6379[1]> TTL gog
(integer) 7
127.0.0.1:6379[1]> TTL gog
(integer) 6
127.0.0.1:6379[1]> TTL gog
(integer) 5
127.0.0.1:6379[1]> TTL gog
(integer) 4
127.0.0.1:6379[1]> TTL gog
(integer) 3
127.0.0.1:6379[1]> TTL gog
(integer) 3
127.0.0.1:6379[1]> TTL gog
(integer) 2
127.0.0.1:6379[1]> TTL gog
(integer) 1
127.0.0.1:6379[1]> TTL gog
(integer) 0
127.0.0.1:6379[1]>
```

`TTL` 명령으로 key 값의 생존 시간을 조회할 수 있습니다.

key가 만료되기 전에 `PERSIST` 명령으로 타임아웃을 해제할 수 있습니다.

특정 시간에 만료를 표시할 때는 `EXPIREAT` 명령을 사용합니다. OS의 시간을 사용한 절대적인 타임아웃이며, `EXPIRE`는 남은 시간을 초로 지정하는 상대적인 타임아웃입니다.

가장 최근에 사용된 key들만 유지하는 좋은 방법은 값을 읽을 때마다 만료 시간을 변경하는 것입니다. Redis의 MRU(Most Recently Used) 캐싱 알고리즘이 이것에 해당합니다. 사용되지 않는 key들은 만료 처리됩니다.

## 그 밖에 명령어

- **RENAME**: key의 이름을 변경
- **TYPE**: key의 타입을 판단
- **DEL**: key-value를 삭제
- **FLUSHDB**: 현재 네임스페이스의 모든 key를 삭제
- **FLUSHALL**: 현재 Redis 안의 모든 key를 삭제
