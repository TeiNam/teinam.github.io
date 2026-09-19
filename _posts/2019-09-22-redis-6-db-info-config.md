---
date: 2019-09-22 22:52:10 +0900
title: "Redis #.6 Redis DB 정보 조회 및 환경설정"
category: redis
excerpt: "Redis 8.10 기준으로 INFO 섹션과 CONFIG GET·CONFIG SET 사용법, redis.conf 의 주요 설정 기본값을 정리합니다."
updated: 2026-09-20
---

## INFO 명령으로 서버 상태 조회

Redis 서버와 데이터베이스의 상태를 확인해야 할 때가 있습니다. `INFO` 명령으로 서버·메모리·복제·클러스터 정보를 조회할 수 있습니다.

```bash
127.0.0.1:6379> INFO
```

Redis 8.10 기준으로 지정할 수 있는 섹션은 다음과 같습니다.

| 섹션 | 내용 |
|---|---|
| `server` | Redis 버전, OS, 프로세스 ID, 가동 시간 등 일반 서버 정보 |
| `clients` | 클라이언트 연결 수, 블록된 클라이언트 수 |
| `memory` | 메모리 사용량, RSS, 피크, 할당자, 단편화 비율 |
| `persistence` | RDB·AOF 상태, 마지막 저장 시각, 백그라운드 저장 진행 여부 |
| `threads` | I/O 스레드별 담당 클라이언트 수, 처리한 읽기·쓰기 이벤트 수 (Redis 8.0+) |
| `stats` | 명령 처리 수, 키스페이스 히트·미스, 만료·축출 키 수 |
| `replication` | master/replica 역할, 연결된 복제본, 복제 오프셋 |
| `cpu` | 서버와 백그라운드 프로세스 CPU 사용량 |
| `commandstats` | 명령별 통계 (호출 수, 평균 소요 시간) |
| `latencystats` | 명령별 레이턴시 퍼센타일 분포 |
| `sentinel` | Sentinel 정보 (Sentinel 인스턴스에서만) |
| `cluster` | Redis Cluster 상태 |
| `modules` | 로드된 모듈 정보 |
| `keyspace` | DB별 키 개수, TTL 통계 |
| `keysizes` | 타입별 키 크기 분포를 2의 거듭제곱 구간 히스토그램으로 보고 (Redis 8.0+) |
| `errorstats` | 에러 통계 |
| `hotkeys` | 핫키 추적 정보 (Redis 8.6+) |

특정 섹션만 조회하려면 `INFO <section>` 형식으로 지정합니다. 여러 섹션을 동시에 지정할 수도 있습니다.

```bash
127.0.0.1:6379> INFO memory
127.0.0.1:6379> INFO memory stats
```

`INFO all`은 모듈 생성 섹션을 제외한 전체를 출력하고, `INFO everything`은 모듈 섹션까지 포함합니다. 인자 없이 `INFO`를 실행하면 기본 집합(`default`)이 출력됩니다. 기본 집합에는 `commandstats`와 `latencystats`가 빠져 있으므로, 명령별 통계를 보려면 섹션 이름을 직접 지정하거나 `all`을 씁니다. 실험적 지표를 담은 `debug` 섹션은 `INFO`나 `INFO all`에 포함되지 않고 `INFO debug`로만 조회됩니다.

`server` 섹션의 `redis_version`만 보고 서버 종류를 판단하면 안 됩니다. 2026년 9월 현재 Redis Open Source 최신 계열은 8.10이고 라이선스는 RSALv2·SSPLv1·AGPLv3 중 하나를 고르는 방식인데, Redis OSS 7.2.4에서 갈라진 Valkey는 `INFO`에서 여전히 `redis_version:7.2.4`를 보고합니다.

## Redis의 기본 구동 옵션

Redis의 환경 설정 파일은 `redis.conf`입니다. 패키지로 설치하면 `/etc/redis/redis.conf`에, 소스 빌드는 소스 디렉토리에 위치합니다. Docker 공식 이미지는 컨테이너 내부의 설정 파일로 기동하므로, 직접 만든 `redis.conf`를 `/usr/local/etc/redis/redis.conf`로 마운트하고 그 경로를 `redis-server`의 인자로 넘깁니다. 이때 마운트한 디렉터리는 쓰기 가능해야 합니다. Redis가 설정 파일을 새로 만들거나 다시 쓰는 경우가 있기 때문입니다. 파일 위치를 모르면 `find` 명령으로 찾아봅니다.

Redis 8.0부터 8.8.x까지는 설정 파일이 두 개였습니다. 서버 설정만 담은 `redis.conf`와, 번들 컴포넌트(Search·Time Series·확률형 자료구조)의 `loadmodule` 지시자까지 포함한 `redis-full.conf`입니다. Redis 8.10부터는 `redis.conf` 하나만 사용합니다. 설정 파일 없이 내장 기본값으로도 기동되지만, 공식 문서는 이 방식을 테스트·개발 용도로만 권합니다.

주요 구동 옵션은 다음과 같습니다.

- **daemonize**: Redis는 기본적으로 foreground 구동을 원칙으로 합니다. 환경 설정 파일의 `daemonize`의 기본값이 `no`이기 때문입니다. `daemonize yes`로 바꾸면 백그라운드에서 실행됩니다.
- **port**: Redis의 기본 포트는 `6379`입니다. 원하는 포트로 변경해 사용할 수 있습니다.
- **loglevel**: 기본값은 `notice`입니다. 실무에서는 `notice` 또는 `warning`으로 설정하고 사용합니다. `verbose`는 개발 환경에서만 사용합니다.
- **logfile**: 기본값은 빈 문자열(표준 출력)입니다. foreground로 Redis가 실행될 때는 콘솔에 로그를 출력하지만, `daemonize yes`로 백그라운드 상태로 전환해서 운영할 때는 파일 경로를 지정하는 것이 좋습니다.
- **databases**: 사용할 데이터베이스 개수를 지정합니다. 기본값은 `16`으로, 0번부터 15번까지 총 16개의 데이터베이스를 사용할 수 있습니다. 0번이 기본 데이터베이스입니다.

> **NOTE** — Redis Cluster는 데이터베이스 0번만 지원하고 `SELECT` 명령을 허용하지 않습니다. 클러스터에서는 데이터베이스 번호로 데이터를 나눠 담을 수 없습니다.

## CONFIG 명령으로 설정 조회 및 변경

`redis.conf` 파일을 직접 수정하지 않고도 런타임에 설정을 조회하고 변경할 수 있습니다. Redis 7.0부터 `CONFIG GET`과 `CONFIG SET`은 여러 파라미터를 한 번의 호출로, 원자적으로 처리합니다.

### CONFIG GET

설정값을 조회할 때 사용합니다. 인자는 glob 패턴을 지원하며, 여러 패턴을 동시에 지정할 수 있습니다.

```bash
127.0.0.1:6379> CONFIG GET maxmemory
1) "maxmemory"
2) "0"

127.0.0.1:6379> CONFIG GET max*
1) "maxmemory"
2) "0"
3) "maxclients"
4) "10000"
5) "maxmemory-policy"
6) "noeviction"
7) "maxmemory-samples"
8) "5"
# ... (maxmemory-eviction-tenacity 등 추가 항목 생략)

127.0.0.1:6379> CONFIG GET *
```

`CONFIG GET *`로 전체 설정을 조회할 수 있습니다. RESP3 프로토콜에서는 Map 형식으로 반환됩니다.

### CONFIG SET

설정값을 런타임에 변경할 때 사용합니다. 여러 쌍을 동시에 설정할 수 있으며, 즉시 적용됩니다.

```bash
127.0.0.1:6379> CONFIG SET maxmemory 2gb
OK

127.0.0.1:6379> CONFIG SET maxmemory 2gb maxmemory-policy allkeys-lru
OK
```

`CONFIG SET appendonly yes`처럼 RDB와 AOF 간 전환도 가능합니다. 다만 런타임 `CONFIG SET`은 설정 파일을 바꾸지 않으므로 재시작하면 되돌아갑니다.

### CONFIG REWRITE

현재 메모리 내 설정을, 서버가 기동할 때 사용한 `redis.conf` 파일에 반영합니다. 파일을 스캔해 현재 값과 다른 필드만 갱신하며, 기본값인 항목은 추가하지 않습니다. 주석과 원래 줄 위치는 보존되고, 더 이상 쓰이지 않는 줄은 공백으로 지워집니다. 예를 들어 `save` 지시자가 여러 줄 있었는데 스냅샷을 껐다면 그 줄들이 모두 비워집니다.

```bash
127.0.0.1:6379> CONFIG REWRITE
OK
```

`CONFIG SET`으로 변경한 설정을 영구적으로 저장하고 싶다면 `CONFIG REWRITE`를 실행합니다. 서버를 설정 파일 없이 기동했다면 이 명령은 에러를 반환합니다.

커맨드라인에서도 설정을 전달할 수 있습니다.

```bash
./redis-server --port 6380 --replicaof 127.0.0.1 6379
```

키워드에 `--` 접두어를 붙여 전달하면 내부적으로 임시 in-memory 설정 파일이 생성됩니다.

## Redis 데이터의 지속성 (RDB 설정)

Redis는 메모리에 상주하지만, 디스크에 스냅샷을 저장해 데이터를 보존할 수 있습니다. 캐시로만 사용한다면 디스크 쓰기가 불필요할 수 있지만, 데이터베이스로 사용한다면 지속성이 필요합니다.

지속성을 위해 디스크에 기록하면 지연시간이 증가하므로, Redis의 가장 큰 장점인 빠른 속도와 트레이드오프 관계에 있습니다. 하지만 데이터를 보존해야 한다면 RDB 또는 AOF를 사용합니다.

### RDB 스냅샷 옵션

- **save**: 스냅샷을 생성하는 조건을 지정합니다. 기본값은 `3600 1 300 100 60 10000`입니다 (주석 상태).

  ```ini
  save 60 10000
  save 900 1
  ```

  첫 번째 옵션은 60초 동안 10000개 이상의 키가 변경되면 저장하라는 의미입니다. 두 번째는 900초(15분) 동안 1개 이상의 키가 변경되면 저장하라는 뜻입니다. 여러 줄을 설정하면 그 중 하나라도 만족하면 스냅샷 이벤트가 동작합니다. `save ""`로 빈 문자열을 설정하면 스냅샷을 사용하지 않습니다.

- **stop-writes-on-bgsave-error**: 스냅샷 저장 중 쓰기 오류가 발생했을 때 쓰기 요청을 계속 받을지 여부를 결정합니다. 기본값은 `yes`로, 오류 발생 시 쓰기를 중단합니다. `no`로 설정하면 쓰기 오류가 발생해도 계속 받지만, 오류를 감지할 수 없으므로 `yes`로 사용하는 것이 좋습니다.

- **rdbcompression**: 스냅샷 파일을 압축해서 저장할지 결정합니다. 기본값은 `yes`입니다. 압축하면 파일 크기는 줄어들지만, CPU 사용률은 높아집니다.

- **rdbchecksum**: 스냅샷 파일의 체크섬을 사용할지 결정합니다. 기본값은 `yes`입니다. 이 값을 `yes`로 하면 스냅샷 파일을 만들거나 읽을 때 약 10% 정도의 성능 하락이 있지만, 파일 정합성을 검증할 수 있습니다.

- **dir**: Redis의 작업 디렉토리를 지정합니다. RDB 파일, AOF 파일, 로그 파일 등이 저장되는 기본 위치입니다.

- **dbfilename**: 스냅샷 파일의 파일명을 지정합니다. 기본값은 `dump.rdb`입니다. 서비스 포트나 노드 이름을 포함한 형식(예: `6379.rdb`)으로 사용할 수도 있습니다.

## AOF 설정

Redis에는 append-only 옵션이 있습니다. 입력되는 모든 쓰기 명령을 파일에 순차적으로 기록해 데이터를 지속적으로 보관합니다. RDB보다 데이터 유실 위험이 적지만, 파일 크기가 커지고 성능이 떨어질 수 있습니다.

데이터 지속성이 중요하다면 `redis.conf` 파일에 `appendonly yes` 옵션을 추가합니다.

```ini
appendonly yes
```

> **NOTE** — AOF를 켜면 쓰기 명령마다 파일 기록과 `fsync()` 부담이 더해집니다. 유실된 데이터를 원본에서 다시 채울 수 있는 순수 캐시 용도라면 켜지 않아도 됩니다.

### AOF 관련 옵션

- **appendonly**: AOF를 사용할지 여부를 결정합니다. 기본값은 `no`입니다.

- **appendfsync**: 데이터를 AOF 파일에 쓸 때 `fsync()` 함수를 호출하는 시점을 결정합니다. 기본값은 `everysec`입니다.

  - **no**: `fsync()`를 호출하지 않고 운영체제에 맡깁니다. 가장 빠르지만, 운영체제 장애 시 데이터 유실 위험이 있습니다.
  - **always**: 각 쓰기 명령마다 `fsync()`를 호출합니다. 가장 안전하지만 가장 느립니다.
  - **everysec**: 매 1초마다 `fsync()`를 호출합니다. 성능과 안정성의 균형점이며, Redis의 기본 설정입니다. 장애 발생 시 최대 1초의 데이터만 유실될 수 있습니다.

- **appendfilename**: AOF 파일명을 지정합니다. 기본값은 `"appendonly.aof"`입니다.

- **appenddirname**: AOF 디렉토리명을 지정합니다. 기본값은 `"appendonlydir"`입니다.

- **no-appendfsync-on-rewrite**: `appendfsync`가 `always`나 `everysec`일 때, 대량의 AOF 또는 스냅샷 쓰기 중에는 `fsync()`를 호출하지 않도록 할 수 있습니다. 기본값은 `no`로, 기존대로 `fsync()`를 호출합니다. `yes`로 설정하면 대량 쓰기 중에는 `fsync()`를 사용하지 않아 성능이 향상되지만, 장애 시 데이터 유실 위험이 커집니다.

## Replication 설정

Redis는 master-replica 복제를 지원합니다. master 노드에서는 `requirepass`만 설정하고, 아래 설정들은 replica에서 설정합니다.

Redis 5.0부터 복제 관련 명령어와 설정 이름이 변경되었습니다. `SLAVEOF` 명령은 `REPLICAOF`로, `slave-*` 설정은 `replica-*`로 바뀌었습니다. 구 명령과 설정은 하위 호환을 위해 alias로 남아 있지만, 새 프로젝트에서는 새 이름을 사용합니다. 다만 프로토콜에 박힌 이름은 그대로라서, `INFO replication`은 여전히 `role:slave`·`connected_slaves`·`slave0` 같은 필드를 보고합니다.

- **replicaof**: master 노드의 네트워크 위치를 지정합니다. 형식은 `replicaof <master IP> <master port>`입니다. 런타임에는 `REPLICAOF` 명령으로 변경할 수 있습니다.

  ```bash
  127.0.0.1:6379> REPLICAOF 127.0.0.1 6379
  OK
  127.0.0.1:6379> REPLICAOF NO ONE
  OK
  ```

  `REPLICAOF NO ONE`으로 복제를 중단하고 master로 승격할 수 있습니다.

- **masterauth**: master 노드가 `requirepass`로 비밀번호 인증을 사용할 때, replica 노드에서 설정하는 비밀번호입니다. master의 `requirepass`와 동일한 값을 지정합니다.

- **replica-serve-stale-data**: replica가 master와 연결이 끊어졌거나 전체 데이터를 복제하는 중일 때 들어오는 요청을 어떻게 처리할지 결정합니다. 기본값은 `yes`로, 오래된 데이터라도 읽기 요청에 계속 응답합니다(쓰기는 `replica-read-only yes` 기본값 때문에 거부됨). `no`로 설정하면 데이터 접근 명령에 `MASTERDOWN Link with MASTER is down and replica-serve-stale-data is set to 'no'` 에러를 반환하지만, INFO·REPLICAOF·AUTH·SHUTDOWN·CONFIG·PUBSUB 관련 명령 등은 예외로 허용됩니다.

- **replica-read-only**: replica를 읽기 전용으로 운영합니다. 기본값은 `yes`입니다. 쓰기 명령은 에러가 발생하지만, `REPLICAOF`나 `CONFIG` 같은 관리 명령은 여전히 사용할 수 있습니다.

## 보안

> **NOTE** — 기본 설정인 `bind 127.0.0.1 -::1`과 `protected-mode yes`는 기본 사용자에 비밀번호가 없을 때 로컬 연결만 받습니다. 다른 호스트에서 접속해야 한다면 인증을 먼저 설정하고 방화벽 정책도 함께 사용합니다.

- **rename-command**: Redis는 일반 명령어를 다른 이름으로 변경하는 기능을 제공합니다. 전체 삭제 명령인 `FLUSHALL`을 사용하지 못하게 하고 싶다면 다음과 같이 변경합니다.

  ```ini
  rename-command FLUSHALL ""
  ```

  빈 문자열로 rename 하면 명령을 비활성화합니다. 긴 무작위 문자열로 바꿔 일부 관리자만 사용하도록 할 수도 있습니다.

  ```ini
  rename-command FLUSHALL cz231masdm23adlasdmafsfww221
  ```

  이렇게 변경하면 `FLUSHALL` 명령은 없는 명령으로 표시되고, `cz231masdm23adlasdmafsfww221`로만 호출할 수 있습니다.

  > **WARNING** — Redis 8.10의 `redis.conf`는 `rename-command`를 DEPRECATED로 표시하고, 기본 사용자에서 위험한 명령을 빼고 관리용 사용자에게만 허용하는 ACL 방식을 권합니다. Redis 6부터 쓸 수 있는 `ACL SETUSER`로 대체합니다.

- **requirepass**: Redis 서버에 접속하기 위한 비밀번호를 설정합니다. 클라이언트는 `AUTH` 명령으로 인증한 후에 Redis 명령을 사용할 수 있습니다.

  ```ini
  requirepass foobared
  ```

  ```bash
  127.0.0.1:6379> AUTH foobared
  OK
  ```

  > **NOTE** — `requirepass` 하나로 모든 클라이언트가 같은 권한을 갖게 됩니다. 명령·키 범위를 나눠야 한다면 ACL 사용자 기반 인증으로 옮깁니다.

## 제한 설정

Redis 서버가 사용할 수 있는 최대 메모리와 클라이언트 수를 제한하는 설정입니다. 복제나 스냅샷 사용 시 추가 메모리가 필요하므로 주의해야 합니다.

- **maxclients**: Redis 인스턴스에 접속할 수 있는 클라이언트 수를 제한합니다. 기본값은 `10000`입니다. 운영체제의 `ulimit` 값과도 연관이 있으므로 `/etc/security/limits.conf`에서 파일 디스크립터 제한도 함께 확인해야 합니다.

- **maxmemory**: Redis 인스턴스가 데이터를 저장하기 위해 사용할 최대 메모리 크기를 지정합니다. 기본값은 `0`(무제한)입니다. 이 값보다 많은 데이터를 저장하면 `maxmemory-policy`에 지정된 정책에 따라 Redis의 동작이 달라집니다. 64비트 시스템에서는 무제한이 기본값이지만, 32비트 시스템에서는 암묵적으로 3GB 한도가 걸리고 정책도 `noeviction`으로 맞춰집니다.

- **maxmemory-policy**: `maxmemory`를 초과했을 때 메모리 정리 정책을 지정합니다. 기본값은 `noeviction`입니다.

  | 정책 | 동작 |
  |---|---|
  | `noeviction` | (기본값) 새 데이터를 쓰는 명령에 에러를 반환합니다. 읽기는 정상 동작합니다. |
  | `allkeys-lru` | 최근 사용이 가장 오래된 키를 축출합니다. |
  | `allkeys-lrm` | Least Recently Modified. 쓰기 시점만 타임스탬프 갱신하고 읽기는 갱신하지 않습니다 (Redis 8.6+). |
  | `allkeys-lfu` | 최소 빈도 사용 키를 축출합니다 (Redis 4.0+). |
  | `allkeys-random` | 무작위로 키를 선택해 축출합니다. |
  | `volatile-lru` | TTL이 설정된 키 중 최근 사용이 가장 오래된 키를 축출합니다. |
  | `volatile-lrm` | TTL이 설정된 키 중 최근 수정이 가장 오래된 키를 축출합니다 (Redis 8.6+). |
  | `volatile-lfu` | TTL이 설정된 키 중 최소 빈도 사용 키를 축출합니다. |
  | `volatile-random` | TTL이 설정된 키 중 무작위로 선택해 축출합니다. |
  | `volatile-ttl` | TTL이 설정된 키 중 만료 시각이 가장 가까운 키를 축출합니다. |

  Redis 8.6에서 추가된 LRM 계열은 읽기가 많은 워크로드에서 오래 갱신되지 않은 키만 골라 축출할 때 사용합니다. 읽기는 타임스탬프를 갱신하지 않으므로, 자주 읽히더라도 갱신이 멈춘 키가 먼저 축출 대상이 됩니다.

  공식 문서는 일부 키가 나머지보다 훨씬 자주 접근된다면 `allkeys-lru`를 기본값으로 권합니다. 모든 키가 대략 균등하게 접근되면 `allkeys-random`을, 앱이 축출 후보를 알고 짧은 TTL을 줄 수 있다면 `volatile-ttl`을 선택합니다. `volatile-*` 정책은 TTL이 설정된 키가 없으면 `noeviction`처럼 동작합니다.

- **maxmemory-samples**: `maxmemory-policy`를 적용할 때 Redis가 샘플링할 키의 개수를 지정합니다. 기본값은 `5`입니다. 전체 키를 읽는 것이 아니라 임의의 키 N개를 샘플링해서 축출 대상을 찾습니다. 이 값을 10으로 올리면 진짜 LRU에 가까워지지만 CPU 비용이 증가합니다. 설정할 수 있는 최대값은 64입니다.

## 스크립트 실행 제한

Redis에서 Lua 스크립트를 수행할 수 있습니다. Redis는 단일 스레드로 동작하므로 Lua 스크립트가 실행되는 동안 다른 명령을 처리할 수 없습니다. 따라서 스크립트 실행 시간을 제어하는 설정이 있습니다.

- **busy-reply-threshold**: Lua 스크립트나 긴 명령이 실행되는 동안 다른 클라이언트 요청에 BUSY 에러를 반환하는 시점을 밀리초 단위로 지정합니다. 기본값은 `5000`(5초)입니다.

  ```ini
  busy-reply-threshold 5000
  ```

  `redis.conf`는 두 이름을 함께 적어 두고 있으며, 옛 이름인 `lua-time-limit`이 alias입니다. `0` 이하로 설정하면 이 동작을 끄고 스크립트를 끝까지 실행합니다. BUSY 상태에서 서버가 받는 명령은 `SCRIPT KILL`·`FUNCTION KILL`·`SHUTDOWN NOSAVE` 정도로 제한됩니다.

## Slow query 설정

Redis의 모든 데이터 처리는 명령어 기반입니다. slow query는 실행 시간이 오래 걸리는 명령을 의미하며, 보통 `ZUNIONSTORE`, `ZINTERSTORE`, `ZRANGEBYSCORE` 같은 정렬 연산이 slow query로 나타납니다.

쿼리 수행 시간은 명령어가 인스턴스에 도착한 후부터 결과를 돌려주기까지의 순수 처리 시간을 말하며, 네트워크 지연은 포함하지 않습니다.

- **slowlog-log-slower-than**: slow query로 기록할 수행 시간을 마이크로초(1/1,000,000초) 단위로 지정합니다. 기본값은 `10000`(10밀리초)입니다. `0`으로 설정하면 모든 명령을 기록하고, `-1`로 설정하면 slow log를 사용하지 않습니다.

- **slowlog-max-len**: 메모리에 저장할 slow log의 최대 개수를 지정합니다. 기본값은 `128`입니다. 이 개수를 초과하면 가장 오래된 slow log를 제거하고 새로운 slow log를 추가합니다.

slow log는 메모리에 저장되므로 Redis를 재시작하면 삭제됩니다.

slow log를 조회하는 명령어는 `SLOWLOG`입니다.

```bash
127.0.0.1:6379> SLOWLOG LEN
(integer) 30

127.0.0.1:6379> SLOWLOG GET
1) 1) (integer) 29
   2) (integer) 1513679235
   3) (integer) 109885
   4) 1) "flushall"
   5) "127.0.0.1:50060"
   6) ""
   7) (integer) 1

127.0.0.1:6379> SLOWLOG RESET
OK
```

`SLOWLOG GET`은 기본적으로 최근 10건을 출력하고, 개수를 인자로 받으며 `-1`을 주면 전체를 출력합니다. `SLOWLOG LEN`은 저장된 slow log 개수를, `SLOWLOG RESET`은 slow log를 초기화합니다.

항목 하나는 일곱 개 값으로 이뤄집니다. 순서대로 식별자, 처리 시각(Unix timestamp), 수행 시간(마이크로초), 명령 인자 배열, 클라이언트 주소와 포트, 클라이언트 이름, 명령 이름을 포함한 전체 인자 개수입니다. 마지막 값은 Redis 8.10에서 추가되었습니다. 인자 배열은 `slowlog-max-argc`(기본 `32`)를 넘으면 잘리고 마지막 원소가 생략된 개수를 알리는 문자열로 바뀌지만, 전체 인자 개수는 잘리기 전 값을 그대로 보고합니다.

## 진단 명령

서버 상태는 `redis-cli`의 특수 모드와 서버 측 명령으로 들여다봅니다.

### redis-cli 옵션

**실시간 상태**

```bash
redis-cli --stat
```

1초마다 keys, 메모리, 클라이언트 수, 블록된 클라이언트 수, 누적 요청 수, 누적 연결 수를 한 줄로 출력합니다. 요청 수 뒤 괄호는 직전 줄과의 차이입니다. `-i <interval>`로 주기를 변경할 수 있습니다.

**키 공간 스캔** (모두 `SCAN` 기반)

```bash
redis-cli --bigkeys
redis-cli --memkeys
redis-cli --keystats
redis-cli --hotkeys
```

- `--bigkeys`: 요소 수가 많은 키를 탐색하고 타입별 평균 크기를 출력합니다. 클러스터 replica에서도 동작합니다.
- `--memkeys`: 메모리를 많이 쓰는 키를 탐색합니다. 클러스터 replica에서도 동작합니다.
- `--keystats`: `--bigkeys`와 `--memkeys`를 통합하고 분포를 출력합니다. `--top <n>`(기본 10), `--cursor <n>`(Ctrl-C 후 이어서) 옵션을 지원합니다.
- `--hotkeys`: 핫키를 샘플링합니다. `maxmemory-policy`가 `*lfu` 계열일 때만 동작합니다.

Redis 8.6부터는 서버에 `HOTKEYS` 명령이 있습니다. `HOTKEYS START`로 추적 기간을 시작하고 `HOTKEYS GET`으로 상위 키와 메타데이터를 읽으며, `HOTKEYS STOP`은 데이터를 남긴 채 추적을 멈추고 `HOTKEYS RESET`은 추적에 쓴 자원을 반환합니다. 기준은 추적 기간 동안 키가 차지한 CPU 시간 비중과 네트워크 입출력 바이트 비중입니다.

**레이턴시**

```bash
redis-cli --latency
redis-cli --latency-history
redis-cli --latency-percentiles 50,99,99.9
redis-cli --latency-dist
```

- `--latency`: PING 왕복을 초당 100회 측정해 min/max/avg(ms)를 출력합니다.
- `--latency-history`: 기본 15초 단위로 재샘플링합니다.
- `--latency-percentiles`: 지정한 퍼센타일을 출력합니다 (예: 50,99,99.9). 해상도가 샘플 수에 따라 제한되므로, 높은 퍼센타일을 보려면 `-i`로 측정 구간을 늘립니다.
- `--latency-dist`: 스펙트럼 형식으로 출력합니다 (xterm 256색 필요).

**기타**

```bash
redis-cli --scan --pattern '*:12345*' --count 100
redis-cli --rdb backup.rdb
redis-cli --replica
```

- `--scan`: 패턴에 맞는 키를 `SCAN`으로 나열합니다. `KEYS` 명령과 달리 서버를 블록하지 않습니다.
- `--rdb <file>`: 원격 RDB 백업을 받아 파일로 저장합니다.
- `--replica`: replica로 동작하며 복제 스트림을 관찰합니다.

### 서버 측 명령

**메모리 사용량**

```bash
127.0.0.1:6379> MEMORY USAGE mykey
(integer) 96
```

특정 키가 차지하는 메모리를 바이트 단위로 출력합니다. 중첩 자료형은 `SAMPLES` 옵션으로 샘플링 개수를 조정합니다. 기본값은 `5`이고, `SAMPLES 0`은 중첩 값을 모두 계산합니다.

**레이턴시 모니터링**

```bash
127.0.0.1:6379> CONFIG SET latency-monitor-threshold 100
OK
127.0.0.1:6379> LATENCY LATEST
127.0.0.1:6379> LATENCY HISTORY command
127.0.0.1:6379> LATENCY DOCTOR
```

`latency-monitor-threshold`를 0보다 큰 값으로 설정하면 레이턴시 모니터링이 활성화됩니다. `LATENCY LATEST`는 최신 레이턴시 스파이크를, `LATENCY HISTORY`는 시계열 이력을, `LATENCY DOCTOR`는 진단 리포트를 출력합니다.

**캐시 진단 지표**

```bash
127.0.0.1:6379> INFO stats
```

`keyspace_hits`, `keyspace_misses`(캐시 히트율), `evicted_keys`(축출된 키 수), `expired_keys`(만료된 키 수) 지표를 확인할 수 있습니다. 캐시 히트율은 `hits / (hits + misses) × 100`으로 계산합니다.

---

상태 확인은 `INFO`의 섹션과 `redis-cli`의 진단 옵션으로, 설정 변경은 `CONFIG SET`으로 즉시 적용한 뒤 `CONFIG REWRITE`로 파일에 반영하는 순서가 기본입니다. 8.x 계열에서 생긴 `threads`·`keysizes`·`hotkeys` 섹션과 `HOTKEYS` 명령까지 함께 보면, 재시작 없이 상태를 파악하고 설정을 조정할 수 있습니다.
