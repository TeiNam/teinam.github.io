---
date: 2019-09-20 02:24:24 +0900
title: "Redis #.4 Database namespace & Expiry"
category: redis
excerpt: "Redis의 네임스페이스는 하나의 인스턴스 안에 논리적으로 분리된 데이터베이스를 의미합니다. 숫자로 구분되며 기본은 0번입니다. 만료(expiry) 기능으로 키의 생존 시간을 지정해 자동 삭제할 수 있습니다."
updated: 2026-09-20
---

## Namespace

Redis의 네임스페이스는 논리적으로 분리된 데이터베이스를 의미합니다. PostgreSQL이 하나의 클러스터 안에 여러 데이터베이스를 만들어 용도를 나누듯이, Redis는 숫자로 네임스페이스를 구분합니다. 기본 설정(`databases 16`)에서는 0번부터 15번까지 16개 데이터베이스를 사용할 수 있으며, 접속 시 기본은 0번입니다.

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

하나의 Redis 인스턴스에서 다른 여러 애플리케이션을 동시에 실행할 때 유용합니다.

> **WARNING** — Redis Cluster 모드에서는 `SELECT` 명령을 사용할 수 없으며, 0번 데이터베이스만 지원합니다. 클러스터는 슬롯 기반 샤딩 구조이므로 여러 데이터베이스로 키를 나누는 것이 아키텍처와 맞지 않습니다.

## Expiry

Redis는 빠른 액세스가 필요한 데이터 캐시에 많이 사용하므로, 특정 시간이 경과하면 만료된 키를 자동으로 삭제해 메모리를 확보합니다. 만료 시각을 설정하지 않은 키는 명시적으로 삭제하거나 `maxmemory` 한도 도달 시 축출 정책(`maxmemory-policy`)에 따라 제거되기 전까지 남아 있습니다.

키에 만료 시간을 설정할 때는 `EXPIRE` 명령을 사용하며, 키 이름과 생존 시간(초)을 지정합니다. Redis 7.0부터는 `NX`(만료 시각이 없을 때만), `XX`(만료 시각이 있을 때만), `GT`(새 만료 시각이 현재보다 클 때만), `LT`(새 만료 시각이 현재보다 작을 때만) 옵션을 사용할 수 있습니다.

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

특정 시각에 만료를 설정할 때는 `EXPIREAT` 명령을 사용합니다. Unix timestamp(초 단위)로 절대 시각을 지정하며, `EXPIRE`는 남은 시간을 초로 지정하는 상대적 방식입니다.

메모리 한도(`maxmemory`)를 설정한 환경에서 축출 정책이 `allkeys-lru`나 `volatile-lru`일 때, Redis는 가장 최근에 사용되지 않은 키부터 삭제합니다. 정책 기본값은 `noeviction`이며, 이 경우 쓰기 명령에 오류를 반환하고 메모리를 확보하지 않습니다. 정책은 여덟 가지입니다 — `noeviction`, 그리고 전체 키를 대상으로 하는 `allkeys-lru`·`allkeys-lfu`·`allkeys-random`, 만료 시각이 설정된 키만 대상으로 하는 `volatile-lru`·`volatile-lfu`·`volatile-random`·`volatile-ttl`입니다. `lfu`는 사용 빈도, `ttl`은 남은 만료 시간이 짧은 쪽을 먼저 지웁니다.

## 그 밖에 명령어

- **RENAME**: key의 이름을 변경
- **TYPE**: key의 타입을 판단
- **DEL**: key-value를 삭제
- **FLUSHDB**: 현재 네임스페이스의 모든 key를 삭제
- **FLUSHALL**: 현재 Redis 안의 모든 key를 삭제
