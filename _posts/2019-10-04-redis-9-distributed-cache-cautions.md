---
date: 2019-10-04 21:34:46 +0900
title: "Redis #.9 분산캐시와 사용시 주의사항"
category: redis
excerpt: "Redis 분산 캐시 시리즈의 마지막 편입니다. 이번 글에서는 Redis를 분산 캐시로 운영할 때 실무에서 마주치는 주의사항들을 정리합니다. 2026년 9월 기준 Redis 8.10 환경을 전제로 작성했습니다. 캐시는 이미 요청됐거나 나중에 요청될 결과를 메모리에 미리 저장해 두었다가…"
updated: 2026-09-17
---

> **다시 씀 (2026-09)** — 2019년에 쓴 글을 2026년 9월 기준으로 새로 썼습니다. 버전·명령·기본값을 현재 Redis 문서에 맞췄습니다.

![](/assets/img/wp/2019/09/redis.png)

Redis 분산 캐시 시리즈의 마지막 편입니다. 이번 글에서는 Redis를 분산 캐시로 운영할 때 실무에서 마주치는 주의사항들을 정리합니다. 2026년 9월 기준 Redis 8.10 환경을 전제로 작성했습니다.

캐시는 이미 요청됐거나 나중에 요청될 결과를 메모리에 미리 저장해 두었다가 빠르게 서비스하는 장치입니다. 디스크보다 빠른 메모리 I/O를 활용하는 대신, 용량에 제한이 있습니다. 단일 서버로 처리할 수 없는 용량이 필요하다면 클러스터링으로 부하를 분산할 수 있지만, 그만큼 주의해야 할 지점도 늘어납니다.

현재 Redis는 8.10.1(2026년 8월 배포)까지 버전업되었고, 7.x 계열도 여전히 보안 패치를 받고 있습니다. 8.0 이후 RediSearch, RedisJSON, RedisTimeSeries 같은 모듈이 본체에 통합되었으며, I/O 스레딩 구현이 재작성되어 멀티코어 환경에서 처리량이 크게 개선되었습니다. 라이선스는 RSALv2 또는 SSPLv1 또는 AGPLv3 중 택일하는 tri-license 체제입니다. 한편 라이선스 변경에 반발해 Linux Foundation 주도로 포크된 Valkey는 BSD를 유지하며 9.1.2까지 배포되었습니다.

## `KEYS` 대신 `SCAN` 사용

`KEYS pattern` 명령은 전체 키 공간을 O(N)으로 순회합니다. 문서 예시 기준 entry level laptop에서 100만 키 DB를 40ms에 스캔할 수 있을 정도로 상수 계수는 낮지만, 문제는 단일 스레드를 그만큼 점유한다는 것입니다. 공식 문서는 **"Don't use `KEYS` in your regular application code"**라고 명시하며, 디버깅과 특수 작업 외에는 사용을 금지합니다.

대신 `SCAN` 기반 도구를 사용합니다.

```bash
redis-cli --scan --pattern '*:12345*' --count 100
redis-cli --bigkeys    # 요소 수가 많은 키
redis-cli --memkeys    # 메모리를 많이 쓰는 키
redis-cli --keystats   # 통합 분포
redis-cli --hotkeys    # LFU 기반 핫키 (maxmemory-policy가 *lfu일 때만)
```

`-i 0.01` 옵션으로 100 사이클마다 10ms 슬립을 넣으면 서버 부하를 무시할 수준까지 낮출 수 있습니다. 클러스터 환경에서는 `--bigkeys`, `--memkeys`가 레플리카에서도 동작하므로 프라이머리 부하 없이 진단할 수 있습니다.

클러스터에서 패턴이 단일 슬롯을 함의하면 해당 슬롯만 순회하므로, 해시 태그를 패턴에 넣는 것이 유효한 최적화입니다. 예를 들어 `{a}h*llo`는 슬롯 15495만 순회합니다.

## 빅키와 핫키 진단

빅키는 두 가지 관점으로 나뉩니다. 요소 수(예: 10만 개의 list)와 메모리 크기(예: 10MB string)입니다. 요소 수는 `--bigkeys`로, 메모리 크기는 `--memkeys`로 탐지하며, `--keystats`는 둘을 통합하고 타입별 분포를 제공합니다.

핫키는 `--hotkeys` 옵션으로 탐지하지만, **`maxmemory-policy`가 `*lfu` 계열일 때만 동작**합니다. LFU(Least Frequently Used) 카운터를 읽기 때문입니다. 서버 측에서는 `INFO keysizes`, `INFO hotkeys`, `MEMORY USAGE key [SAMPLES n]` 명령으로 확인할 수 있습니다. `MEMORY USAGE`는 데이터와 관리 오버헤드를 합산한 바이트를 반환하며, Redis 8.10부터는 compact hash 인코딩 해시의 공유 템플릿 메모리 지분까지 포함합니다.

빅키를 방치하면 단일 명령이 길게 블로킹되고, 핫키는 해당 키가 속한 슬롯을 소유한 노드 한 대로 요청이 집중되어 특정 노드에 부하가 몰립니다. 정기 진단으로 조기 발견하는 것이 중요합니다.

## `maxmemory-policy` 선택 기준

Redis는 `maxmemory`에 도달하면 축출 정책에 따라 키를 삭제합니다. 기본값은 `noeviction`으로, 새 데이터를 쓰는 명령에 에러를 반환하고 읽기는 정상 동작합니다.

현재 제공되는 정책은 다음과 같습니다.

| 정책 | 동작 |
|---|---|
| `noeviction` | 기본값. 쓰기 에러 반환 |
| `allkeys-lru` | 최근 사용이 가장 오래된 키 축출 |
| `allkeys-lrm` | Least Recently Modified — 쓰기 시점만 타임스탬프 갱신 (읽기는 갱신 안 함, Redis 8.6 신규) |
| `allkeys-lfu` | 최소 빈도 사용 키 축출 (4.0+) |
| `allkeys-random` | 무작위 |
| `volatile-lru` / `volatile-lrm` / `volatile-lfu` / `volatile-random` / `volatile-ttl` | TTL이 설정된 키만 대상. TTL 키가 없으면 `noeviction`처럼 동작 |

공식 문서의 rule of thumb:
- 일부 키가 나머지보다 훨씬 자주 접근됨(파레토 분포) → **`allkeys-lru`**. "선호할 이유가 없다면 좋은 기본값"
- 읽기는 많지만 갱신 여부로 신선도를 판단하고 싶다 → **`allkeys-lrm`** (stale 데이터만 축출)
- 모든 키가 대략 균등 접근(반복 순회) → **`allkeys-random`**
- 어떤 키가 축출 후보인지 앱이 알고 짧은 TTL을 줄 수 있다 → **`volatile-ttl`**

TTL 값 자체가 메모리를 먹으므로 `allkeys-lru`가 메모리 효율이 더 좋습니다. 튜닝 파라미터는 `maxmemory-samples 5`(10으로 올리면 진짜 LRU에 근접하지만 CPU 비용 증가), `lfu-log-factor 10`, `lfu-decay-time 1` 등이 있습니다.

주의할 점은 복제/AOF 버퍼는 `maxmemory` 집계에 포함되지 않으므로, RAM 여유를 남겨야 합니다. `INFO memory`의 `mem_not_counted_for_evict` 필드로 추정할 수 있습니다. 32비트 시스템은 `maxmemory` 미설정 시 암묵적 **3GB** 한도가 적용됩니다.

## 클러스터 멀티키 제약과 Sharded Pub/Sub

Redis 클러스터는 키를 CRC16 해시로 16384개 슬롯에 분산합니다. 멀티키 연산(`MGET`, `MSET`, `SINTER`, `ZUNION` 등)은 모든 키가 단일 슬롯에 있어야 합니다. 파이프라인, `MULTI`-`EXEC` 블록, `EVAL` 스크립트의 키도 동일 제약을 받습니다.

```bash
# 에러: CROSSSLOT Keys in request don't hash to the same slot
127.0.0.1:7000> MGET user:123:profile user:456:profile

# 해시 태그로 해결
127.0.0.1:7000> MGET user:{123}:profile user:{123}:account
```

`{}`로 감싼 부분만 해시 대상이 되므로, `user:{123}:profile`과 `user:{123}:account`는 같은 슬롯을 보장합니다. 슬롯 확인은 `CLUSTER KEYSLOT <key>` 명령으로 가능합니다.

`DBSIZE`, `KEYS`, `SCAN`, `FLUSHALL`, `FLUSHDB`는 클러스터에서 **현재 샤드 범위**로만 동작하며, 에러 종류로는 `CROSSSLOT`(같은 슬롯 아님), `MOVED`(리샤딩 중 이동), `TRYAGAIN`(마이그레이션 중 일시 불가)이 있습니다. 클라이언트에 재시도 로직이 필수입니다.

Redis 7.0부터는 **Sharded Pub/Sub**(`SSUBSCRIBE`, `SPUBLISH`)가 추가되었습니다. shard 채널은 키와 같은 알고리즘으로 슬롯에 배정되며, 메시지 전파가 샤드 내로 제한되어 클러스터 버스 트래픽을 줄일 수 있습니다. 일반 Pub/Sub는 여전히 전역이며 DB 번호와 무관하게 동작합니다.

## 단일 스레드 모델과 `io-threads`

공식 문서는 여전히 **"Redis is single threaded"**라고 명시합니다. 코어당 처리량과 레이턴시에는 유리하지만, 키 만료 같은 작업을 다른 클라이언트에 영향 없이 점진적으로 처리해야 한다는 제약이 있습니다.

Redis 6.0에서 도입된 `io-threads`는 8.0에서 재구현되어 멀티코어 환경에서 처리량이 증가했습니다. 하지만 **기본은 비활성**입니다.

```conf
# redis.conf
# io-threads 4
```

문서는 4코어 이상 머신에서 최소 1개 스페어 코어를 남기라고 권고합니다. 4코어면 **3**, 8코어면 **7**을 설정합니다. 스레딩을 켜면 **읽기와 프로토콜 파싱도 스레드화**됩니다. `io-threads 1`은 메인 스레드만 사용하는 것과 동일합니다.

주의할 점은 명령 실행 자체가 병렬화된다는 서술은 공식 문서에서 확인되지 않는다는 것입니다. I/O와 프로토콜 파싱의 오프로딩까지가 문서가 명시하는 범위입니다. Redis 8.0-M02 마일스톤 블로그 기준 7.2.5 대비 p50 레이턴시가 9~53% 감소했으며, `ZADD`·`SMEMBERS`·`HGETALL` 레이턴시가 각각 최대 36%, 28%, 10% 감소했습니다 (출처: https://redis.io/blog/redis-8-0-m02-the-fastest-redis-ever/).

`INFO threads` 섹션에서 I/O 스레드 정보를 확인할 수 있습니다.

## 클러스터에서 `SELECT` 금지

Redis 클러스터는 **database zero만 지원**하며, `SELECT` 명령을 사용할 수 없습니다. 공식 문서는 다음과 같이 밝힙니다.

> "When using Redis Cluster, the `SELECT` command cannot be used, since Redis Cluster only supports database zero."

여러 DB는 클러스터 설계와 맞지 않습니다. 단일 DB에 원자적으로 동작하는 명령들이 슬롯 분산 환경에서는 무의미하고 불필요한 복잡성을 만들기 때문입니다.

비클러스터 환경에서도 공식 권고는 **"같은 애플리케이션 내 키 분리에만 쓰고, 서로 무관한 여러 애플리케이션을 단일 Redis 인스턴스로 돌리지 마라"**입니다. 모든 DB는 같은 RDB/AOF 파일에 저장되므로, 애플리케이션별로 인스턴스를 분리하는 것이 운영상 안전합니다.

현재 DB를 조회하는 명령은 없으며, `CLIENT LIST` 출력에서 확인할 수 있습니다. 새 커넥션은 항상 DB 0으로 시작합니다. 기본 DB 개수는 `databases 16`입니다.

## 캐시 스탬피드와 TTL 지터 (관행과 근거)

**중요:** Redis 공식 문서는 "cache stampede", "thundering herd", "TTL jitter"를 다루는 페이지를 제공하지 않습니다. 여기 서술하는 내용은 Redis 공식 권고가 아니라 **널리 쓰이는 관행**이며, 근거는 AWS ElastiCache 문서와 학술 논문입니다.

캐시 스탬피드는 인기 키의 TTL이 만료될 때 동시 다발적인 재계산 요청이 DB를 압도하는 현상입니다. AWS ElastiCache의 e-commerce 캐싱 가이드는 다음을 권고합니다.

- **쓰기 시에는 캐시를 갱신하지 말고 삭제(invalidate)하라.** stale read가 최신 값을 덮어쓰는 레이스를 줄입니다. 다만 좁은 레이스는 여전히 남으며, "엄격한 일관성이 필요하면 분산 락 또는 버전 쓰기를 쓰라"고 명시합니다.
- 캐시 장애 시 DB로 폴백하도록 설계. "캐시를 의존성이 아니라 최적화로 취급"
- 연결 타임아웃 1~2초, 커맨드 타임아웃 100~500ms, 응답이 늦으면 블로킹하지 말고 DB 폴백

확률적 조기 재계산(probabilistic early recomputation, XFetch)은 Andrea Vattani 등의 VLDB 논문 "Optimal Probabilistic Cache Stampede Prevention"(Volume 8, No. 8, p.886)에서 제안된 알고리즘입니다. TTL 만료 전에 확률적으로 미리 재계산 트리거를 걸어 스탬피드 윈도를 분산시킵니다.

TTL 지터(예: TTL에 ±10% 무작위 오프셋)는 관행으로 널리 쓰이지만, Redis 공식 문서 근거는 없으며 특정 지터 비율 수치도 표준이 아닙니다. 필요하다면 애플리케이션 레벨에서 `EXPIRE` 호출 시 무작위 오프셋을 적용하는 방식으로 구현할 수 있습니다.

## 마무리: HA 구성과 테스트

이 글에서는 다루지 않았지만, Redis를 프로덕션에서 안정적으로 운영하려면 고가용성 구성이 필수입니다. Sentinel은 비클러스터 Redis의 공식 HA 수단이며, 여전히 별도 프로세스(`redis-sentinel`, 포트 26379)로 동작합니다. 과거 일부 자료에서 "Redis 5 버전으로 Sentinel 기능이 본체에 흡수되었다"는 잘못된 정보가 유통되었는데, **Sentinel은 지금도 독립적인 프로세스로 최소 3대 구성**이 권장됩니다. 클러스터는 Sentinel 없이 노드 간 gossip과 마스터 투표로 레플리카를 승격하는 별도 메커니즘을 씁니다.

공식 문서는 다음을 강조합니다. **"주기적으로 실제 failover 테스트를 하지 않으면 HA 구성은 안전하지 않다."** 설정만 해두고 장애 시나리오를 검증하지 않으면 막상 장애가 났을 때 동작하지 않습니다. 정기 훈련이 가용성의 전제입니다.

Redis는 비동기 복제이므로 **ack된 쓰기의 보존을 보장하지 않습니다.** `WAIT` 명령으로 N개 복제본의 ack를 받을 수 있지만, 이것이 CP 강일관성을 만들지는 않습니다. failover 시 ack된 쓰기가 여전히 유실될 수 있다는 것을 알고 설계해야 합니다.

9회에 걸친 Redis 시리즈를 여기서 마칩니다. 분산 캐시는 성능 최적화의 핵심이지만, 운영 복잡도를 동반합니다. 이 글이 실무에서 Redis를 안전하고 효율적으로 활용하는 데 도움이 되기를 바랍니다.
