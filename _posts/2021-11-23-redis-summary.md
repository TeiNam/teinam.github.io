---
date: 2021-11-23 14:54:56 +0900
title: "Redis 요약 정리"
category: redis
excerpt: "Redis 시리즈를 마무리하며 핵심 내용을 정리합니다. Sentinel과 Cluster의 차이, 데이터 영속성 메커니즘, 그리고 운영 시 주의할 포인트들을 빠르게 훑을 수 있도록 구성했습니다. Redis Sentinel은 고가용성(HA)에 집중한 솔루션입니다. 단일 primary를 여…"
updated: 2026-09-17
---

> **다시 씀 (2026-09)** — 2021년에 쓴 글을 2026년 9월 기준으로 새로 썼습니다. 버전·명령·기본값을 현재 Redis 문서에 맞췄습니다.

Redis 시리즈를 마무리하며 핵심 내용을 정리합니다. Sentinel과 Cluster의 차이, 데이터 영속성 메커니즘, 그리고 운영 시 주의할 포인트들을 빠르게 훑을 수 있도록 구성했습니다.

## Redis Cluster와 Sentinel의 차이점

### Sentinel

Redis Sentinel은 **고가용성(HA)에 집중한 솔루션**입니다. 단일 primary를 여러 개의 replica로 복제하고, primary 장애 시 자동으로 replica를 승격시킵니다.

**특징**

- Redis 본체와 **별도 프로세스**로 동작합니다 (기본 포트 **26379**)
- **최소 3개 이상의 Sentinel 인스턴스**가 필요합니다 (quorum 확보를 위해)
- Sentinel을 통해 접근하며, 클라이언트 라이브러리의 Sentinel 지원이 필요합니다
- 단일 인스턴스와 마찬가지로 Redis의 모든 기능(0~15번 DB, 전체 명령)을 사용할 수 있습니다

**Failover 동작 방식**

1. **SDOWN (Subjectively Down)** — 개별 Sentinel이 primary로부터 30초(`down-after-milliseconds` 기본값 30000ms) 동안 `PING`/`INFO` 응답을 받지 못하면 "주관적 다운"으로 판단합니다
2. **ODOWN (Objectively Down)** — 설정한 quorum 이상의 Sentinel이 동시에 다운을 인지하면 "객관적 다운"으로 인정합니다. 실제 failover 개시에는 Sentinel 과반의 투표가 추가로 필요합니다
3. Sentinel **과반(majority)**의 투표로 failover 리더를 선출합니다
4. 리더가 replica 중 하나를 primary로 승격시키고, 기존 primary는 replica로 강등합니다
5. 다른 replica들은 새 primary로부터 데이터를 받도록 재구성됩니다

> 과반수가 필요한 이유: 네트워크 파티션 상황에서 소수 파티션이 독단적으로 failover를 하지 못하도록 방지합니다. 예를 들어 Sentinel 5개 중 2개만 격리되면, 격리된 쪽은 과반을 확보하지 못해 failover를 시도할 수 없습니다.

**주의사항**

| 상황 | 문제 | 해결책 |
|---|---|---|
| Failover 중 쓰기 실패 | Failover Timeout 만큼 쓰기 요청이 실패합니다 | 데이터량에 따라 최적의 timeout 값을 찾고 `sentinel.conf`에 적용 |
| Replica → Primary 승격 실패 | Replica 다운 → Primary 다운 → Replica 재시작 순서일 때, 재시작된 서버는 여전히 `redis.conf`에 `replicaof` 설정을 갖고 있어 Primary로 전환되지 않음 | 재시작 전 `replicaof` 설정을 삭제하거나, 수동으로 `REPLICAOF NO ONE` 실행 |
| Master 정보 조회 오류 | Primary/Replica 모두 다운 후 `get-master-addr-by-name`으로 조회하면 다운된 서버 정보를 반환 | `INFO sentinel` 명령으로 마스터 status를 직접 확인 |

**단점**

- Single primary 구조이므로 데이터가 커지면 **수직 확장(scale-up)**이 필요합니다
- 샤딩을 제공하지 않습니다

### Cluster

Redis Cluster는 **고가용성(HA)과 샤딩을 동시에 제공**하는 Redis 자체 클러스터링 시스템입니다.

**특징**

- 모든 데이터를 primary 단위로 샤딩하고, replica 단위로 복제합니다
- **최소 3개의 primary 노드**가 필요하며, 배포 권장은 **6노드(primary 3 + replica 3)**입니다
- Primary마다 최소 하나 이상의 replica를 두는 것이 좋습니다

**해시 슬롯(Hash Slot)을 이용한 샤딩**

Redis Cluster는 CRC-16 해시 함수를 이용해 키를 정수로 변환하고, 그 값을 **16384**로 모듈 연산합니다. 16384개의 슬롯을 primary 노드 수만큼 균등하게 분할합니다.

```bash
slot = CRC16(key) mod 16384
```

예를 들어 primary 3개라면:
- 노드 A: 슬롯 0~5460
- 노드 B: 슬롯 5461~10922
- 노드 C: 슬롯 10923~16383

**클러스터 HA 동작**

- Primary 노드가 shutdown되면 **gossip protocol**로 상태를 확인하고, replica 중 하나를 primary로 승격시킵니다
- Gossip은 Redis 노드 간 직접 연결로 동작하며, **클라이언트 포트 + 10000** 포트를 사용합니다 (예: 클라이언트 포트 6379 → 버스 포트 16379)
- 기존 primary가 재시작되면 자동으로 승격된 replica의 새 replica로 구성됩니다
- **마스터 과반에 도달하지 못한 파티션은 쿼리 수용을 중단합니다** (`cluster-node-timeout` 경과 후)

**클러스터 관리**

Redis 8.x에서는 `redis-cli --cluster` 명령으로 클러스터를 관리합니다. 기존의 `redis-trib.rb`는 deprecation stub으로 대체되었습니다.

```bash
# 클러스터 생성 (6노드, replica 1개씩)
redis-cli --cluster create 127.0.0.1:7000 ... 127.0.0.1:7005 \
  --cluster-replicas 1

# 노드 추가
redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7000

# 리샤딩
redis-cli --cluster reshard 127.0.0.1:7000

# 상태 점검
redis-cli --cluster check 127.0.0.1:7000
```

**주의사항**

| 항목 | 제약 / 이유 |
|---|---|
| 멀티 DB 불가 | 클러스터 모드에서는 **0번 DB만** 사용 가능합니다. `SELECT` 명령을 실행할 수 없습니다 |
| 멀티키 연산 제약 | `MGET`, `MSET`, `SUNION` 등 여러 키를 다루는 명령은 **모든 키가 같은 슬롯**에 있어야 합니다. 해시 태그 `{user}:profile`, `{user}:account` 형태로 같은 슬롯을 보장할 수 있습니다 |
| 클라이언트 리다이렉션 | 쿼리를 받은 노드가 해당 키를 갖고 있지 않으면 `MOVED` 에러와 함께 올바른 노드 정보를 반환합니다. 클라이언트는 다시 요청해야 합니다 |
| 메모리 오버헤드 | 슬롯 테이블을 메모리에 유지하므로 키가 많아질수록 오버헤드가 증가합니다 |
| Failover 중 슬롯 접근 불가 | Primary 장애 시 replica가 승격될 때까지 해당 슬롯의 키는 사용할 수 없습니다 |

**Docker / NAT 환경**

Redis 공식 문서는 **`--net=host` 모드**를 권장합니다. NAT나 포트 포워딩을 사용해야 한다면 `redis.conf`에서 다음 4가지 값을 정적으로 설정할 수 있습니다:

```conf
cluster-announce-ip 10.1.1.5
cluster-announce-port 6379
cluster-announce-tls-port 6380
cluster-announce-bus-port 16379
```

### Redis 샤딩 (직접 구현)

클러스터 기능을 사용하지 않고 직접 샤딩을 구현할 수도 있습니다. 일반적으로 **Consistent Hashing** 아키텍처를 사용합니다.

**일반 모듈러 해싱 vs Consistent Hashing**

| 방식 | 동작 | 서버 추가/장애 시 |
|---|---|---|
| 모듈러 해싱 | `hash(key) mod N` | 서버 수가 바뀌면 대부분의 키가 다른 서버로 이동 (리밸런싱 비용 큼) |
| Consistent Hashing | 해시 링에서 자기보다 큰 가장 가까운 서버로 매핑 | 전체의 1/N만 이동 (영향 범위 제한) |

**샤딩 전략**

- **Range** — 특정 범위(예: A-M, N-Z)를 정의해 저장. 데이터가 특정 범위에 몰리거나 비어있을 수 있습니다
- **Modular** — 하나씩 추가하면 리밸런싱이 빈번하므로, **2배씩 늘려** 규칙적으로 데이터를 이동시킵니다
- **Indexed** — 키가 저장될 위치를 관리 서버가 따로 보관. 인덱스 서버가 SPOF가 됩니다

Consistent Hashing도 완벽하게 균등하지는 않으므로, virtual node를 둔 Adaptive Consistent Hashing을 고려할 수 있습니다.

## Data Persistence (데이터 영속성)

Redis는 인메모리 DB이지만 디스크에 데이터를 기록하는 두 가지 방식을 제공합니다.

### RDB (Redis Database)

주기적으로 **point-in-time 스냅샷**을 생성합니다.

**장점**

- **단일 파일**로 저장되어 백업과 복구가 간편합니다
- 부모 프로세스가 자식 프로세스를 fork해 persist I/O를 처리하므로, 메인 프로세스 성능에 미치는 영향이 적습니다
- **재시작 시간이 짧습니다** (snapshot을 그대로 메모리에 로드)

**단점**

- 스냅샷 간격 사이에 Redis가 멈추면 **데이터 유실 가능성**이 있습니다
- Fork 시 순간적으로 메모리가 2배까지 증가할 수 있습니다 (Copy-on-Write)

**설정**

```conf
# 기본값 (redis.conf 주석)
save 3600 1 300 100 60 10000
# 3600초 동안 1번 이상 변경 or 300초 동안 100번 이상 변경 or 60초 동안 10000번 이상 변경
```

비활성화: `save ""`

### AOF (Append Only File)

모든 쓰기 작업을 **로그로 기록**하고, 재시작 시점에 replay합니다.

**장점**

- RDB보다 **데이터 유실 가능성이 낮습니다**
- 사람이 읽을 수 있는 포맷입니다

**단점**

- 같은 데이터셋에 대해 **RDB보다 파일 크기가 큽니다**
- 쓰기 요청이 많을 때 RDB보다 **반응성이 느릴 수 있습니다**

**AOF Rewrite**

데이터가 많아지면 현재 시점의 데이터셋을 만들어낼 수 있는 **최소한의 로그만 남기고 압축**합니다. 예를 들어 같은 키에 100번의 `SET`이 있었다면 마지막 값 하나만 기록합니다.

**설정**

```conf
appendonly yes
appendfsync everysec   # always | everysec | no
```

| 옵션 | 의미 | 내구성 | 성능 |
|---|---|---|---|
| `always` | 모든 쓰기마다 fsync | 가장 안전 (1개 명령까지만 유실) | 가장 느림 |
| `everysec` | 1초마다 fsync | 1초 분량 유실 가능 | 균형 |
| `no` | OS에 맡김 | 최대 수십 초 유실 가능 | 가장 빠름 |

**권장 설정**

- 영속성이 반드시 필요한 경우 **AOF + `appendfsync everysec`**를 사용합니다
- 캐시로만 사용하거나 데이터 유실을 감수할 수 있다면 RDB/AOF 모두 off해도 됩니다
- Replication 환경에서는 **replica에서만 영속성을 활성화**하는 것이 일반적입니다 (primary 성능 확보)

> **주의:** Primary에서 영속성을 끄고 자동 재시작을 켜두면, 재시작 시 빈 데이터셋이 replica로 전파되어 모든 데이터가 날아갑니다. Sentinel 환경에서도 동일한 위험이 있습니다.

## Redis 사용 시 주의사항

### 1. Collection 크기 제한

**Collection 안에 너무 많은 아이템을 저장하지 마세요.** Hash/Set/Sorted Set은 규격상 2³²-1 요소까지 가능하지만, 큰 컬렉션은 O(N) 명령(예: `HGETALL`)과 메모리 사용으로 문제가 될 수 있습니다. `redis-cli --bigkeys`로 진단하세요.

- Hash, Sorted Set, Set은 메모리를 많이 사용합니다
- Redis 7.0부터는 listpack 기반 인코딩(`hash-max-listpack-entries` 등)을 사용하면 메모리 효율이 개선되지만, 속도는 다소 느려집니다
- Hash는 Redis 7.4부터 `HEXPIRE` 계열 명령으로 필드별 TTL이 가능하고, Set/Sorted Set/List는 여전히 키 단위 TTL만 지원합니다

### 2. 메모리 관리

**메모리 모니터링과 관리가 필수입니다.**

- Redis는 자기가 사용하는 정확한 메모리 양을 모릅니다 (단편화 포함)
- 쓰기가 많은 Redis는 fork 시 메모리를 **최대 2배까지 사용**할 수 있습니다 (Copy-on-Write)
- **작은 인스턴스 여러 개**로 나누는 것이 큰 인스턴스 하나보다 안전합니다

**`maxmemory-policy` 선택**

Redis 8.6 기준 축출 정책은 다음과 같습니다:

| 정책 | 대상 | 동작 |
|---|---|---|
| `noeviction` (기본값) | — | 메모리 초과 시 쓰기 요청에 에러 반환. 읽기는 정상 |
| `allkeys-lru` | 모든 키 | 최근 사용이 가장 오래된 키 축출 |
| `allkeys-lrm` | 모든 키 | **Least Recently Modified** (쓰기 시점만 추적, 8.6 신규) |
| `allkeys-lfu` | 모든 키 | 최소 빈도 사용 키 축출 (4.0+) |
| `allkeys-random` | 모든 키 | 무작위 |
| `volatile-lru` / `lrm` / `lfu` / `random` / `ttl` | TTL 설정된 키만 | TTL 키가 없으면 `noeviction`처럼 동작 |

**선택 기준**

- 일부 키가 나머지보다 훨씬 자주 접근된다면 → **`allkeys-lru`** (문서의 "좋은 기본값")
- 읽기는 많지만 갱신 여부로 신선도를 판단하고 싶다면 → **`allkeys-lrm`**
- 모든 키가 대략 균등 접근(반복 순회)한다면 → **`allkeys-random`**
- 가능하면 캐시와 영속 키를 **인스턴스 분리**하세요. `volatile-*`은 한 인스턴스에 섞어 쓰는 경우용이지만 권장하지 않습니다

### 3. 단일 스레드와 `io-threads`

**Redis는 여전히 단일 스레드 아키텍처입니다.** 명령 실행 자체는 한 번에 하나씩 처리됩니다.

Redis 6.0에 도입된 **`io-threads`가 8.0에서 재구현**되어, **I/O와 프로토콜 파싱을 별도 스레드로 오프로딩**할 수 있습니다.

```conf
# redis.conf (기본 비활성)
# io-threads 4   # 4코어 이상이면 3, 8코어 이상이면 7
```

**주의할 명령**

시간이 오래 걸리는 명령은 다른 클라이언트를 블로킹합니다:

- **`KEYS` 패턴** — O(N). 프로덕션에서 절대 사용하지 마세요. 대신 `SCAN` 사용
- **`FLUSHALL` / `FLUSHDB`** — 모든 키 삭제
- **`DEL` Collection** — Collection이 크면 `UNLINK`(비동기 삭제) 사용
- **Get All Collections** — `HGETALL`, `SMEMBERS` 등. 요소가 많으면 `HSCAN`, `SSCAN` 사용
- 큰 컬렉션을 읽을 때는 `HSCAN`, `SSCAN`, `ZSCAN` 커서 순회를 사용하세요

**진단 도구**

```bash
# 빅키 / 메모리 많이 쓰는 키 찾기 (SCAN 기반)
redis-cli --bigkeys
redis-cli --memkeys
redis-cli --keystats

# 핫키 찾기 (maxmemory-policy가 *lfu일 때만 동작)
redis-cli --hotkeys

# 레이턴시 측정
redis-cli --latency
redis-cli --latency-history
```

### 4. Replication 사용 시 주의사항

**비동기 복제 특성**

- Replication은 **비동기 방식**입니다. Primary에서 ack된 쓰기도 failover 시 유실될 수 있습니다
- `WAIT` 명령으로 N개 replica의 ack를 보장할 수 있지만, CP 강일관성이 되지는 않습니다

**설정 지시어**

Redis 5.0부터 **slave 표기가 replica로 바뀌었고**, master/primary 표기는 문서·옵션명에 혼재합니다:

- `REPLICAOF <host> <port>` — replica 설정 (구 명령 `SLAVEOF`는 deprecated이지만 호환성을 위해 동작)
- `replicaof <host> <port>` — 설정 파일 지시어
- `replica-read-only yes` — 기본값. Replica를 읽기 전용으로 유지 (writable replica는 비권장)

**기타 주의사항**

- `redis-cli --rdb` 명령은 메모리 스냅샷을 가져오기 때문에 서버가 죽을 수 있습니다 (운영 환경 주의)
- Replication lag이 일정 이상 발생하면 연결을 끊고 다시 full sync를 시도하므로 부하가 발생할 수 있습니다

### 5. 권장 운영 설정

```conf
# 클라이언트 연결 수
maxclients 10000   # 8.10.1 기본값. 필요에 따라 조정

# 영속성
save ""           # RDB off (캐시용)
appendonly no     # AOF off (캐시용)

# 위험 명령 차단 (ACL 권고, rename-command는 8.10.1에서 deprecated)
# ACL SETUSER default -keys -flushall -flushdb -config

# 보안
requirepass <강력한_비밀번호>
```

`KEYS`와 예기치 않은 `save` 트리거는 대표적인 장애 원인입니다. `KEYS`는 O(N)이라 정규 애플리케이션 코드에서 사용하지 말아야 하고, `save` 설정은 "N초 안에 키가 M개 바뀌면 자동으로 RDB를 dump"하는데, 예상치 못한 시점에 fork가 발생해 메모리를 2배로 소비할 수 있습니다.

---

이상으로 Redis 요약 정리를 마칩니다. Sentinel과 Cluster의 역할 차이, 영속성 메커니즘, 그리고 운영 시 피해야 할 함정들을 숙지하고 계시면 안정적인 Redis 운영에 큰 도움이 될 것입니다.
