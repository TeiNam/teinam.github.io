---
date: 2019-09-22 23:12:44 +0900
title: "Redis #.7 HA구성하기 (Master-Slave)"
category: redis
excerpt: "Redis를 단일 인스턴스로 운영하면 그 인스턴스가 죽는 순간 서비스 전체가 멈춥니다. Redis 8.10 기준으로 복제를 설정하고 Sentinel로 자동 페일오버까지 구성하는 방법을 정리합니다."
updated: 2026-09-20
---

## 복제가 필요한 이유

Redis를 단일 인스턴스로 운영하면 그 인스턴스가 죽는 순간 서비스 전체가 멈춥니다. 장애에 대비하려면 데이터를 복사해 둔 복제본(replica)이 필요합니다. 복제본은 읽기 부하를 분산하거나, primary 장애 시 수동 또는 자동으로 승격시켜 가용성을 확보하는 데 씁니다.

이 글에서는 Redis 8.10 기준으로 복제를 설정하고, Sentinel을 이용한 자동 페일오버까지 구성하는 방법을 다룹니다.

## SLAVEOF 대신 REPLICAOF

Redis 5.0.0부터 `SLAVEOF` 명령은 deprecated되었고 `REPLICAOF`가 정식 명령입니다. 공식 문서는 `SLAVEOF`가 하위 호환을 위해 계속 동작한다고 적습니다. 새로 쓰는 코드와 설정에는 `REPLICAOF`를 씁니다.

설정 파일도 마찬가지입니다. 현행 `redis.conf` 예제는 `replicaof`, `replica-read-only`, `replica-serve-stale-data` 표기를 씁니다.

다만 `INFO replication` 출력 필드는 여전히 `role:master`, `connected_slaves`, `slave0` 같은 예전 이름을 그대로 내보냅니다. 명령과 설정 지시어는 replica 표기로 정리되었지만 출력 필드 이름까지 바뀐 것은 아니므로, 모니터링 스크립트에서 응답을 파싱할 때는 예전 필드 이름을 써야 합니다.

## 복제 설정하기

복제 설정은 한 줄로 끝납니다. replica가 될 인스턴스의 `redis.conf` 파일에 다음 한 줄을 추가하면 됩니다.

```conf
replicaof <primary-ip> <primary-port>
```

예를 들어 primary가 `127.0.0.1:6379`에 있다면 다음과 같이 씁니다.

```conf
replicaof 127.0.0.1 6379
```

설정 파일을 저장하고 Redis를 시작하면, 해당 인스턴스는 자동으로 primary에 접속해 데이터를 복제하기 시작합니다.

```bash
./src/redis-server redis.conf
```

primary가 `requirepass`로 비밀번호를 설정했다면, replica 쪽에 `masterauth`를 함께 추가해야 합니다.

```conf
replicaof 127.0.0.1 6379
masterauth yourpassword
```

런타임에 복제를 설정하려면 `REPLICAOF` 명령을 씁니다.

```bash
redis-cli -p 6380
127.0.0.1:6380> REPLICAOF 127.0.0.1 6379
OK
```

복제를 해제하려면 다음과 같이 실행합니다.

```bash
127.0.0.1:6380> REPLICAOF NO ONE
OK
```

런타임으로 변경한 설정은 재시작하면 사라지므로, 영구 적용하려면 `CONFIG SET`으로 바꾼 뒤 `CONFIG REWRITE`를 실행해 파일에 기록해야 합니다.

```bash
CONFIG SET masterauth yourpassword
CONFIG REWRITE
```

## 복제 확인하기

복제가 제대로 연결되었는지 확인하려면 `INFO replication` 명령을 씁니다.

**primary에서 실행:**

```bash
redis-cli -p 6379 INFO replication
```

출력에 `role:master`와 연결된 replica 목록이 보입니다.

```text
# Replication
role:master
connected_slaves:1
slave0:ip=127.0.0.1,port=6380,state=online,offset=1234,lag=0
```

**replica에서 실행:**

```bash
redis-cli -p 6380 INFO replication
```

출력에 `role:slave`와 primary 정보가 보입니다.

```text
# Replication
role:slave
master_host:127.0.0.1
master_port:6379
master_link_status:up
```

`master_link_status:up`이면 복제 연결이 정상입니다.

간단한 데이터 복제 테스트를 해보겠습니다.

```bash
# primary에 키 추가
redis-cli -p 6379 SET mykey "hello"
OK

# replica에서 조회
redis-cli -p 6380 GET mykey
"hello"
```

primary에 쓴 키가 replica에서도 즉시 조회됩니다.

기본적으로 replica는 읽기 전용입니다(`replica-read-only yes`). replica에 쓰기 명령을 보내면 에러가 반환됩니다.

```bash
redis-cli -p 6380 SET anotherkey "world"
(error) READONLY You can't write against a read only replica.
```

`replica-read-only no`로 바꿀 수는 있지만 공식 문서는 쓰기 가능 replica를 권장하지 않습니다. primary와 replica의 데이터가 어긋날 수 있기 때문입니다. 예전에 쓰기 가능 replica가 필요했던 용도는 Redis 7.0부터 읽기 전용 명령으로 대체되었습니다. `SUNIONSTORE`·`ZINTERSTORE` 대신 `SUNION`·`ZINTER`를, `SORT` 대신 `SORT_RO`를, `EVAL`·`EVALSHA` 대신 `EVAL_RO`·`EVALSHA_RO`를 쓰면 읽기 전용 replica에서도 같은 결과를 얻습니다.

## 재연결과 부분 재동기화

primary는 데이터 이력을 구분하는 replication ID를 가지고, 복제 스트림으로 내보낸 바이트 수만큼 오프셋을 올립니다. replication ID와 오프셋 한 쌍이 그 시점의 데이터셋을 가리킵니다.

복제 링크가 끊긴 replica는 재접속할 때 `PSYNC`로 이전 primary의 replication ID와 자신이 처리한 오프셋을 보냅니다. primary의 백로그에 그 구간이 남아 있으면 밀린 명령만 받아 따라잡습니다. 백로그가 모자라거나 replica가 보낸 replication ID를 primary가 더 이상 알지 못하면 전체 재동기화로 떨어져 RDB 스냅숏을 처음부터 다시 받습니다. 백로그가 클수록 더 긴 단절도 부분 재동기화로 복구할 수 있습니다.

Redis 4.0부터는 페일오버로 승격된 replica가 이전 primary의 replication ID와 오프셋을 기억합니다. 그래서 옛 primary를 따르던 다른 replica들도 새 primary에 부분 재동기화로 붙을 수 있습니다.

복제 동작을 조정하는 설정은 다음과 같습니다. 기본값은 배포본에 함께 오는 `redis.conf` 기준입니다.

| 설정 | 기본값 | 의미 |
| --- | --- | --- |
| `replica-read-only` | `yes` | replica의 쓰기 명령을 거부합니다 |
| `replica-serve-stale-data` | `yes` | 복제가 끊겨도 가진 데이터로 읽기에 응답합니다 |
| `repl-diskless-sync` | `yes` | RDB를 디스크에 쓰지 않고 소켓으로 바로 보냅니다 |
| `repl-diskless-load` | `disabled` | 받은 RDB를 디스크에 쓴 뒤 적재합니다 |
| `repl-backlog-size` | `1mb` | 부분 재동기화에 쓰는 백로그 버퍼 크기입니다 |
| `min-replicas-to-write` | `0` | 쓰기를 받기 위한 최소 replica 수이고, 0이면 비활성입니다 |
| `min-replicas-max-lag` | `10` | 위 조건에서 replica로 세는 최대 지연 시간(초)입니다 |

`min-replicas-to-write`와 `min-replicas-max-lag`를 함께 걸면, 조건을 만족하는 replica가 없을 때 primary가 쓰기를 에러로 거부합니다. 다만 복제가 비동기이므로 이 설정도 유실 가능성을 없애지는 못하고, 유실 구간을 지정한 초 안으로 제한하는 수준입니다.

## Sentinel을 이용한 자동 페일오버

지금까지 구성한 복제는 primary가 죽으면 수동으로 replica를 승격시켜야 합니다. 자동 페일오버를 원한다면 **Sentinel**을 써야 합니다.

Sentinel은 Redis 2.8부터 안정 버전(Sentinel 2)으로 제공되는 HA 솔루션입니다. Sentinel 인스턴스들이 primary와 replica를 모니터링하다가, primary가 일정 시간 이상 응답하지 않으면 과반 투표로 리더를 선출해 자동으로 replica를 승격시킵니다.

> **IMPORTANT** — 견고한 배포에는 최소 3개의 Sentinel 인스턴스가 필요합니다. 2개로는 부족합니다. 3개는 서로 독립적으로 실패하는 머신이나 가용영역에 배치해야 합니다.

Sentinel의 기본 포트는 **26379**입니다. Sentinel 인스턴스들끼리 통신하므로 이 포트가 방화벽에서 열려 있어야 합니다.

Sentinel은 `redis-sentinel` 명령으로 실행합니다.

```bash
redis-sentinel /path/to/sentinel.conf
```

또는 `redis-server --sentinel` 형태로도 실행할 수 있습니다. 둘은 동일합니다.

```bash
redis-server /path/to/sentinel.conf --sentinel
```

설정 파일은 필수입니다. Sentinel은 상태 저장용으로 파일에 쓰기를 하므로, 파일 경로가 없거나 쓰기 권한이 없으면 시작을 거부합니다.

최소 설정 파일 예시는 다음과 같습니다.

```conf
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 60000
sentinel failover-timeout mymaster 180000
sentinel parallel-syncs mymaster 1
```

`sentinel monitor` 문법은 다음과 같습니다.

```conf
sentinel monitor <master-name> <ip> <port> <quorum>
```

- `<master-name>`: 모니터링 그룹의 이름입니다. Sentinel 설정에서 이 이름으로 primary를 구분합니다.
- `<ip> <port>`: primary의 주소입니다.
- `<quorum>`: 장애 감지에 필요한 Sentinel 수입니다.

quorum은 장애 감지 전용입니다. 실제 failover를 수행하려면 Sentinel 과반의 투표로 리더가 선출되어야 합니다. 예를 들어 Sentinel 5개에 quorum 2면, 2개가 동시에 primary 다운을 판단하면 그중 하나가 failover를 시도하고, 총 3개 이상이 도달 가능해야 승인됩니다. 소수 파티션에서는 절대 failover가 일어나지 않습니다.

replica는 자동으로 발견되므로 설정 파일에 명시할 필요가 없습니다. Sentinel은 failover가 일어나거나 새 Sentinel을 발견하면 설정 파일을 자동으로 갱신합니다.

3개의 Sentinel을 띄운다면 포트만 다르게 해서 같은 내용으로 설정합니다.

**sentinel-26379.conf**

```conf
port 26379
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
```

나머지 두 파일은 `port`만 26380, 26381로 바꿉니다. `down-after-milliseconds`가 5000이면 핑 응답이 5초 동안 없을 때 Sentinel이 장애를 의심하기 시작합니다.

설정 파일을 준비한 뒤 3개를 모두 실행합니다.

```bash
redis-sentinel sentinel-26379.conf &
redis-sentinel sentinel-26380.conf &
redis-sentinel sentinel-26381.conf &
```

Sentinel이 정상 동작하는지 확인하려면 Sentinel에 접속해 `SENTINEL masters` 명령을 실행합니다.

```bash
redis-cli -p 26379
127.0.0.1:26379> SENTINEL masters
```

primary 정보와 replica 개수, Sentinel 개수가 출력됩니다.

Sentinel이 failover를 정상 수행하는지 테스트하려면 다음 명령으로 primary를 일시 중단합니다.

```bash
redis-cli -p 6379 DEBUG sleep 30
```

30초 동안 primary가 응답하지 않으면 Sentinel이 장애를 감지하고, 과반이 동의하면 replica를 승격시킵니다. `INFO replication`으로 역할이 바뀐 것을 확인할 수 있습니다.

`SHUTDOWN` 명령으로도 테스트할 수 있지만, primary를 다시 시작할 때 영속성을 끈 상태에서 자동 재시작되면 빈 데이터로 올라와 replica 데이터까지 지워지는 위험이 있습니다. `DEBUG sleep`이 더 안전한 테스트 방법입니다.

> **WARNING** — Redis는 비동기 복제를 쓰므로 ack된 쓰기라도 페일오버에서 유실될 수 있습니다. Sentinel은 가용성을 높여 주지만 강일관성을 보장하지는 않습니다.

클라이언트 라이브러리는 Sentinel을 지원하는 것과 그렇지 않은 것이 있으므로, 사용하는 언어의 Redis 라이브러리가 Sentinel을 지원하는지 확인해야 합니다.

## 정리

Redis 복제는 `replicaof` 한 줄로 설정할 수 있습니다. `INFO replication`과 `ROLE` 명령으로 상태를 확인하고, Sentinel 3개 이상을 띄우면 자동 페일오버까지 구성할 수 있습니다. 재접속한 replica는 `PSYNC`로 밀린 구간만 받아 따라잡고, 백로그가 모자라면 전체 재동기화로 떨어집니다.

명령과 설정 지시어는 `REPLICAOF`, `replica-read-only`, `replica-serve-stale-data`로 정리되었고, `SLAVEOF`는 하위 호환을 위해 계속 동작합니다. 새 구성에서는 `replicaof`를 씁니다.

비클러스터 Redis의 HA 구성에는 Sentinel이 필요하며, 최소 3개를 서로 독립적으로 실패하는 노드에 배치해야 장애 감지와 페일오버가 제대로 동작합니다. Sentinel은 가용성을 높여 주지만 비동기 복제 특성상 ack된 쓰기가 페일오버에서 유실될 수 있습니다. 운영 환경에 투입하기 전에 실제 장애 시나리오로 페일오버를 테스트해야 합니다.
