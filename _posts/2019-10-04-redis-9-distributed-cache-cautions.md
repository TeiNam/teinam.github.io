---
date: 2019-10-04 21:34:46 +0900
title: "Redis #.9 분산캐시와 사용시 주의사항"
category: redis
excerpt: "Redis를 분산 캐시로 운영할 때 마주치는 주의사항을 2026년 9월 기준 Redis 8.10 문서에 맞춰 정리했습니다."
last_modified_at: 2026-09-20
---

Redis 분산 캐시 시리즈의 마지막 편입니다. Redis를 분산 캐시로 운영할 때 마주치는 주의사항을 2026년 9월 기준 Redis 8.10 문서에 맞춰 정리했습니다.

캐시는 이미 요청됐거나 앞으로 요청될 결과를 메모리에 미리 담아 두고 빠르게 돌려주는 장치입니다. 디스크보다 빠른 메모리 I/O를 쓰는 대신 용량에 제한이 있습니다. 단일 서버로 감당할 수 없는 용량이 필요하면 클러스터링으로 부하를 나눌 수 있지만, 그만큼 주의할 지점도 늘어납니다.

Redis Open Source는 8.10.1(2026년 8월 배포)까지 올라왔습니다. 8.0부터 RediSearch, RedisJSON, RedisTimeSeries 같은 모듈이 본체에 통합되었고 I/O 스레딩 구현이 다시 작성되었습니다. 라이선스는 RSALv2·SSPLv1·AGPLv3 중 하나를 고르는 tri-license 체제입니다. 라이선스 변경에 반발해 Linux Foundation 산하로 포크된 Valkey는 BSD 3-Clause를 유지하며 9.1.2(2026년 9월 배포)까지 나왔습니다.

## `KEYS` 대신 `SCAN` 사용

`KEYS pattern` 명령은 전체 키 공간을 O(N)으로 순회합니다. 문서 예시 기준으로 entry level laptop에서 100만 키 DB를 40ms에 스캔할 정도로 상수 계수는 낮지만, 문제는 그 시간만큼 단일 스레드를 점유한다는 것입니다. 공식 문서는 **"Don't use `KEYS` in your regular application code"**라고 못 박고, 디버깅과 키 공간 구조 변경 같은 특수 작업에만 쓰라고 안내합니다.

대신 `SCAN` 기반 도구를 사용합니다.

```bash
redis-cli --scan --pattern '*:12345*' --count 100
redis-cli --bigkeys    # 요소 수가 많은 키
redis-cli --memkeys    # 메모리를 많이 쓰는 키
redis-cli --keystats   # 통합 분포
redis-cli --hotkeys    # LFU 기반 핫키 (maxmemory-policy가 *lfu일 때만)
```

`SCAN`이 제공하는 보장을 정확히 알아야 합니다. 순회 시작부터 끝까지 계속 존재한 요소는 한 번의 완전한 순회에서 반드시 반환되고, 순회 전에 지워져 다시 들어오지 않은 요소는 절대 반환되지 않습니다. 대신 커서 하나 말고는 상태를 두지 않기 때문에 **같은 요소가 여러 번 반환될 수 있습니다.** 중복 처리는 애플리케이션 몫이고, 순회 중에 추가되거나 삭제된 요소가 나올지는 정의되어 있지 않습니다. `COUNT`는 호출당 작업량에 대한 힌트일 뿐 반환 개수를 보장하지 않으며 기본값은 10입니다. 반환 커서가 0이 되기 전에는 순회가 끝나지 않았다고 봐야 합니다.

`-i 0.01` 옵션은 100 사이클마다 10ms 슬립을 넣습니다. 실행은 느려지지만 서버 부하는 무시할 수준으로 떨어집니다. `--bigkeys`와 `--memkeys`는 클러스터 레플리카에서도 동작하므로 프라이머리에 부하를 주지 않고 진단할 수 있습니다.

클러스터에서 패턴이 단일 슬롯을 함의하면 해당 슬롯만 순회하므로, 해시 태그를 패턴에 넣는 것이 유효한 최적화입니다. 예를 들어 `{a}h*llo`는 해시 태그 `{a}`가 가리키는 슬롯 15495만 순회합니다.

## 빅키와 핫키 진단

빅키는 두 가지 관점으로 나뉩니다. 요소 수(예: 10만 개의 list)와 메모리 크기(예: 10MB string)입니다. 요소 수는 `--bigkeys`로, 메모리 크기는 `--memkeys`로 탐지하며, `--keystats`는 둘을 합치고 타입별 분포까지 보여줍니다.

`redis-cli --hotkeys`는 **`maxmemory-policy`가 `*lfu` 계열일 때만 동작**합니다. LFU(Least Frequently Used) 카운터를 읽기 때문입니다. Redis 8.6에는 서버 측 `HOTKEYS` 명령이 추가되었습니다. `HOTKEYS START`로 추적을 시작하고 `HOTKEYS GET`으로 상위 키를 받은 뒤 `HOTKEYS STOP`, `HOTKEYS RESET`으로 정리합니다. 추적 기간 동안 키가 차지한 CPU 시간 비율과 네트워크 입출력 바이트 비율을 확률적 자료구조에 기록하는 방식이라 LFU 정책을 전제하지 않고, 진행 상태는 `INFO hotkeys`로 확인합니다.

키 크기 분포는 `INFO keysizes`(타입별 base-2 로그 히스토그램)와 `MEMORY USAGE key [SAMPLES n]`으로 봅니다. `MEMORY USAGE`는 데이터와 관리 오버헤드를 합산한 바이트를 반환하며, Redis 8.10부터 compact hash 인코딩 해시의 공유 템플릿 메모리 지분까지 포함합니다. 중첩 자료형은 `SAMPLES`로 표본 수를 정하고 기본값은 5, `SAMPLES 0`이면 전부 표본으로 씁니다.

빅키를 방치하면 단일 명령이 길게 블로킹되고, 핫키는 해당 키가 속한 슬롯을 소유한 노드 한 대로 요청이 집중됩니다. 정기 진단으로 조기에 발견하는 것이 중요합니다.

## `maxmemory-policy` 선택 기준

Redis는 `maxmemory`에 도달하면 축출 정책에 따라 키를 삭제합니다. 기본값은 `noeviction`으로, 새 데이터를 쓰는 명령에 에러를 반환하고 읽기는 정상 동작합니다.

현재 제공되는 정책은 다음과 같습니다.

| 정책 | 동작 |
|---|---|
| `noeviction` | 기본값. 쓰기 명령에 에러 반환 |
| `allkeys-lru` | 최근 사용이 가장 오래된 키 축출 |
| `allkeys-lrm` | Least Recently Modified — 쓰기 시점만 타임스탬프 갱신 (Redis 8.6 신규) |
| `allkeys-lfu` | 접근 빈도가 가장 낮은 키 축출 (4.0+) |
| `allkeys-random` | 무작위 |
| `volatile-lru` / `volatile-lrm` / `volatile-lfu` / `volatile-random` / `volatile-ttl` | TTL이 설정된 키만 대상. TTL 키가 없으면 `noeviction`처럼 동작 |

공식 문서의 rule of thumb은 이렇습니다.

- 일부 키가 나머지보다 훨씬 자주 접근됨(파레토 분포) → **`allkeys-lru`**. "선호할 이유가 없다면 좋은 기본값"
- 자주 읽히는 데이터는 남기고 갱신이 끊긴 데이터를 버리고 싶다 → **`allkeys-lrm`**
- 모든 키가 대략 균등 접근(반복 순회) → **`allkeys-random`**
- 어떤 키가 축출 후보인지 앱이 알고 짧은 TTL을 줄 수 있다 → **`volatile-ttl`**

TTL을 설정하는 것 자체가 메모리를 쓰므로 `allkeys-lru`가 메모리 효율이 더 좋습니다. LRU와 LRM은 무작위 표본에서 후보를 고르는 근사 알고리즘이고, 표본 수는 `maxmemory-samples 5`가 기본입니다. 10으로 올리면 진짜 LRU에 가까워지지만 CPU를 더 씁니다. LFU 쪽 파라미터는 `lfu-log-factor 10`, `lfu-decay-time 1`이 기본값입니다.

`volatile-*` 계열은 한 인스턴스에서 캐시와 영구 키를 같이 다룰 때 쓰는 정책인데, 공식 문서는 가능하면 인스턴스를 둘로 분리하라고 권합니다.

복제 버퍼와 AOF 버퍼는 `maxmemory` 집계에 포함되지 않으므로 RAM 여유를 남겨야 합니다. 축출 자체가 다시 버퍼에 쓸 갱신을 만들기 때문에 이렇게 설계돼 있습니다. 버퍼가 쓰는 양은 `INFO memory`의 `mem_not_counted_for_evict` 필드로 추정합니다. 64비트에서 `maxmemory 0`은 무제한이지만, 32비트 시스템은 미설정 시 암묵적 **3GB** 한도가 적용됩니다.

## 만료 키 삭제와 영속성

TTL이 지난 키는 두 경로로 지워집니다. 클라이언트가 그 키에 접근할 때 지우는 수동(passive) 경로와, 만료가 설정된 키 중 일부를 무작위로 골라 검사해 지우는 능동(active) 경로입니다. 능동 경로가 없으면 다시 접근되지 않는 만료 키가 영원히 메모리에 남기 때문에 둘 다 필요합니다.

만료가 일어나면 프라이머리가 `DEL`을 합성해 AOF와 레플리카로 전파합니다. 레플리카는 독자적으로 키를 만료시키지 않고 프라이머리의 `DEL`을 기다리므로, 만료 판단은 프라이머리 한 곳에 모입니다. 레플리카가 프라이머리로 승격되면 그때부터 스스로 만료시킵니다.

삭제는 기본이 블로킹입니다. 작은 값이면 O(1) 명령과 비슷하지만, 수백만 요소를 가진 집계 값이면 서버가 수 초간 멈출 수 있습니다. 사용자 호출에는 `UNLINK`와 `FLUSHALL ASYNC` / `FLUSHDB ASYNC`가 있고, Redis가 스스로 지우는 경로(축출·만료·덮어쓰기·전체 재동기화)는 다음 설정으로 바꿉니다. 여섯 개 모두 기본값이 `no`, 즉 블로킹 삭제입니다.

```conf
lazyfree-lazy-eviction no
lazyfree-lazy-expire no
lazyfree-lazy-server-del no
replica-lazy-flush no
lazyfree-lazy-user-del no
lazyfree-lazy-user-flush no
```

영속성 쪽은 `appendonly no`가 기본값이고, 켜면 `appendfsync everysec`으로 동작합니다. 캐시 전용 인스턴스라면 RDB와 AOF를 모두 끄는 선택이 가능하지만 대가가 있습니다. 재시작이나 failover 직후 캐시가 완전히 비고, 그동안 원본 저장소가 모든 미스를 받아냅니다. 원본이 그 순간을 버티지 못한다면 캐시를 껐다 켜는 일이 장애로 이어집니다. 반대로 영속성을 켜면 복제·AOF 버퍼만큼 RAM을 더 잡아 둬야 하고 디스크 쓰기가 레이턴시에 섞여 듭니다.

## 클러스터 멀티키 제약과 Sharded Pub/Sub

Redis 클러스터는 키를 CRC16 해시로 16384개 슬롯에 분산합니다. 멀티키 연산(`MGET`, `MSET`, `SINTER`, `ZUNION` 등)은 모든 키가 단일 슬롯에 있어야 합니다. 파이프라인, `MULTI`-`EXEC` 블록, `EVAL` 스크립트의 키도 같은 제약을 받습니다.

```bash
# 에러: CROSSSLOT Keys in request don't hash to the same slot
127.0.0.1:7000> MGET user:123:profile user:456:profile

# 해시 태그로 해결
127.0.0.1:7000> MGET user:{123}:profile user:{123}:account
```

중괄호로 감싼 부분만 해시 대상이 되므로, `user:{123}:profile`과 `user:{123}:account`는 같은 슬롯을 보장합니다. 슬롯 확인은 `CLUSTER KEYSLOT <key>` 명령으로 합니다.

`DBSIZE`, `KEYS`, `SCAN`, `FLUSHALL`, `FLUSHDB`는 클러스터에서 **현재 샤드 범위**로만 동작합니다. 에러 종류로는 `CROSSSLOT`(같은 슬롯 아님), `MOVED`(리샤딩 중 이동), `TRYAGAIN`(마이그레이션 중 일시 불가)이 있어서 클라이언트에 재시도 로직이 필수입니다.

Redis 7.0부터는 **Sharded Pub/Sub**(`SSUBSCRIBE`, `SPUBLISH`)를 쓸 수 있습니다. shard 채널은 키와 같은 알고리즘으로 슬롯에 배정되고 메시지 전파가 샤드 내로 제한되므로 클러스터 버스 트래픽이 줄어듭니다. 일반 Pub/Sub는 여전히 전역이며 DB 번호와 무관하게 동작합니다.

## 단일 스레드 모델과 `io-threads`

`redis.conf`는 Redis를 "mostly single threaded"로 설명합니다. `UNLINK`, 느린 I/O 접근처럼 일부 작업만 보조 스레드로 넘깁니다. 코어당 처리량과 레이턴시에는 유리하지만, 키 만료 같은 작업을 다른 클라이언트에 영향 없이 조금씩 처리해야 한다는 제약이 따라옵니다.

Redis 6.0에서 도입된 `io-threads`는 8.0에서 다시 구현됐습니다. 하지만 **기본은 비활성**입니다.

```conf
# redis.conf
# io-threads 4
```

문서는 4코어 이상 머신에서 최소 1개 스페어 코어를 남기라고 권고합니다. 4코어면 **3**, 8코어면 **7**을 설정합니다. 스레딩을 켜면 쓰기뿐 아니라 **읽기와 프로토콜 파싱도 스레드화**됩니다. `io-threads 1`은 메인 스레드만 쓰는 것과 같습니다. CPU 시간을 상당히 쓰고 있어 실제로 성능 문제를 겪을 때만 켜라는 것이 문서의 권고입니다.

명령 실행 자체가 병렬화된다는 서술은 공식 문서에 없습니다. 문서가 명시하는 범위는 소켓 읽기·쓰기와 프로토콜 파싱의 오프로딩까지입니다. 개선 폭으로는 Redis가 공개한 [8.0-M02 벤치마크](https://redis.io/blog/redis-8-0-m02-the-fastest-redis-ever/)가 7.2.5 대비 자료형별 p50 레이턴시 9~53% 감소, `ZADD` 최대 36%, `SMEMBERS` 최대 28%, `HGETALL` 최대 10% 감소를 보고했습니다. 벤더가 직접 측정한 결과이며 재현 스크립트를 함께 공개했습니다.

I/O 스레드 상태는 `INFO threads` 섹션에서 확인합니다.

## 클러스터에서 `SELECT` 금지

Redis 클러스터는 **database zero만 지원**하며, `SELECT` 명령을 사용할 수 없습니다. 공식 문서는 다음과 같이 밝힙니다.

> "When using Redis Cluster, the `SELECT` command cannot be used, since Redis Cluster only supports database zero."

여러 DB는 클러스터 설계와 맞지 않습니다. 단일 DB에서 원자적으로 동작하는 명령을 슬롯 분산 환경에서는 그대로 제공할 수 없고, 이점 없이 복잡성만 늘기 때문입니다.

비클러스터 환경에서도 공식 권고는 **"같은 애플리케이션 안에서 키를 나눌 때만 쓰고, 서로 무관한 여러 애플리케이션을 한 Redis 인스턴스로 돌리지 마라"**입니다. 모든 DB가 같은 RDB/AOF 파일에 저장되므로 애플리케이션별로 인스턴스를 분리하는 편이 운영상 안전합니다.

선택된 DB는 커넥션의 속성이라 클라이언트가 스스로 기억하고 재접속할 때 다시 선택해야 합니다. 현재 DB를 물어보는 명령은 없고 `CLIENT LIST` 출력에서 확인합니다. 새 커넥션은 항상 DB 0으로 시작하며, 기본 DB 개수는 `databases 16`입니다.

## 캐시 스탬피드와 TTL 지터

Redis 공식 문서에는 "cache stampede", "thundering herd", "TTL jitter"를 다루는 페이지가 없습니다. 아래 내용은 Redis의 공식 권고가 아니라 널리 쓰이는 관행이며, 근거는 AWS ElastiCache 문서와 학술 논문입니다.

캐시 스탬피드는 인기 키의 TTL이 만료될 때 동시 다발적인 재계산 요청이 DB를 압도하는 현상입니다. AWS ElastiCache의 e-commerce 캐싱 가이드는 다음을 권고합니다.

- **쓰기 시에는 캐시를 갱신하지 말고 삭제(invalidate)하라.** stale read가 최신 값을 덮어쓰는 레이스를 줄입니다. 다만 좁은 레이스는 여전히 남으며, 엄격한 일관성이 필요하면 분산 락이나 버전 쓰기를 쓰라고 명시합니다.
- 캐시 장애 시 DB로 폴백하도록 설계합니다. "캐시를 의존성이 아니라 최적화로 취급"
- 연결 타임아웃 1~2초, 커맨드 타임아웃 100~500ms. 응답이 늦으면 블로킹하지 말고 DB로 폴백합니다.

확률적 조기 재계산(probabilistic early recomputation, XFetch)은 Andrea Vattani 등의 VLDB 논문 "Optimal Probabilistic Cache Stampede Prevention"(Volume 8, No. 8, p.886)에서 제안된 알고리즘입니다. TTL 만료 전에 확률적으로 재계산을 미리 트리거해 스탬피드 윈도를 분산시킵니다.

TTL 지터(예: TTL에 ±10% 무작위 오프셋)도 관행으로 널리 쓰이지만 Redis 공식 문서에 근거가 없고, 특정 지터 비율이 표준으로 정해진 것도 아닙니다. 필요하면 애플리케이션에서 `EXPIRE`를 호출할 때 무작위 오프셋을 더하는 방식으로 구현합니다.

## 마무리: HA 구성과 테스트

이 글에서는 다루지 않았지만, Redis를 프로덕션에서 안정적으로 운영하려면 고가용성 구성이 필수입니다. Sentinel은 비클러스터 Redis의 공식 HA 수단이고 `redis-sentinel` 별도 프로세스로 기동하며 기본 포트는 26379입니다. 공식 문서는 **견고한 배포에 최소 3개의 Sentinel 인스턴스, 그것도 서로 다른 3대의 장비에 배치**하라고 못 박습니다. 클러스터는 Sentinel 없이 노드 간 gossip과 프라이머리 투표로 레플리카를 승격하는 별도 메커니즘을 씁니다.

공식 문서는 테스트를 강조합니다. 개발 환경에서라도, 가능하면 프로덕션에서도 주기적으로 동작을 확인하지 않으면 안전한 HA 구성은 없다는 것입니다. 잘못된 설정은 프라이머리가 멈추는 새벽 3시가 되어서야 드러납니다.

Redis는 비동기 복제이므로 **Sentinel을 붙여도 ack된 쓰기의 보존을 보장하지 않습니다.** 문서는 Redis + Sentinel 전체를 "last failover wins"로 병합되는 최종적 일관성 시스템으로 설명합니다. `WAIT` 명령으로 N개 레플리카의 ack를 받을 수 있지만 그것이 강일관성을 만들어 주지는 않습니다. failover 시점에 ack된 쓰기가 유실될 수 있다는 것을 전제로 설계해야 합니다.

9회에 걸친 Redis 시리즈를 여기서 마칩니다. 분산 캐시는 성능 최적화의 핵심이지만 운영 복잡도를 함께 데려옵니다. 이 글이 실무에서 Redis를 안전하게 쓰는 데 도움이 되기를 바랍니다.
