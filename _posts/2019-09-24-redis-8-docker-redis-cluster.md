---
date: 2019-09-24 23:01:29 +0900
title: "Redis #.8 Docker를 이용한 Redis cluster 구축 (ver. 8.10.1-trixie)"
category: redis
excerpt: "패키지를 이용한 Redis 클러스터 구축은 각 노드에 Redis를 설치하고, 설정 파일에서 클러스터 파라미터를 활성화한 뒤, redis-cli --cluster create 명령으로 클러스터를 생성하는 단계로 진행됩니다. 이 글에서는 Docker를 사용해 3개 노드에 6개 컨테이너(마…"
updated: 2026-09-17
---

> **다시 씀 (2026-09)** — 2019년에 쓴 글을 2026년 9월 기준으로 새로 썼습니다. 버전·명령·기본값을 현재 Redis 문서에 맞췄습니다.

![](/assets/img/wp/2019/09/redis.png)

**Docker를 이용한 Redis cluster 구축**

패키지를 이용한 Redis 클러스터 구축은 각 노드에 Redis를 설치하고, 설정 파일에서 클러스터 파라미터를 활성화한 뒤, `redis-cli --cluster create` 명령으로 클러스터를 생성하는 단계로 진행됩니다. 이 글에서는 Docker를 사용해 3개 노드에 6개 컨테이너(마스터 3 + 레플리카 3)로 구성된 클러스터를 구축합니다.

Redis 클러스터는 마스터 3개가 최소 구성입니다. 각 마스터에 레플리카를 붙인 6노드 구조가 배포 권장 사항입니다. 마스터는 해시 슬롯을 나눠 가지고, 레플리카는 마스터 장애 시 자동 Failover 대상이 됩니다.

> **2026-09 기준 이미지**: 이 글은 2019년 원문을 기준으로 하되, Redis 8.10.1 / Debian trixie 이미지를 사용합니다. Redis 8.0부터 라이선스가 RSALv2/SSPLv1/AGPLv3 트리 라이선스로 바뀌었고, 7.x 계열도 여전히 보안 패치를 받습니다(7.2.16, 7.4.11이 2026-08-17 자로 배포). `redis:latest`는 8.10.1을 가리킵니다.

## 전제조건

각 노드에 Docker가 설치되어 있어야 합니다. 클러스터 모드에서는 노드당 TCP 포트 2개가 필요합니다.

- **클라이언트 포트**(예: 6379) — 클라이언트와 노드 간 통신
- **클러스터 버스 포트**(기본적으로 클라이언트 포트 + 10000 = 16379) — 노드 간 장애 감지·구성 교환에 사용

방화벽에서 두 포트를 모두 열고, 클라이언트 포트는 다른 노드에서도 접근 가능해야 합니다(키 마이그레이션이 클라이언트 포트를 사용합니다).

## Docker로 Redis 설치

각 노드에서 아래 명령으로 컨테이너를 실행합니다. 이미지 태그는 `redis:8.10.1` 또는 `redis:8.10.1-trixie`를 사용합니다.

**Node #1**

```bash
docker run -d --name redis-master01 --network host \
  -v /redis/master01:/data \
  redis:8.10.1 redis-server \
  --port 6379 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes

docker run -d --name redis-slave03 --network host \
  -v /redis/slave03:/data \
  redis:8.10.1 redis-server \
  --port 6381 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes
```

**Node #2**

```bash
docker run -d --name redis-master02 --network host \
  -v /redis/master02:/data \
  redis:8.10.1 redis-server \
  --port 6380 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes

docker run -d --name redis-slave01 --network host \
  -v /redis/slave01:/data \
  redis:8.10.1 redis-server \
  --port 6379 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes
```

**Node #3**

```bash
docker run -d --name redis-master03 --network host \
  -v /redis/master03:/data \
  redis:8.10.1 redis-server \
  --port 6381 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes

docker run -d --name redis-slave02 --network host \
  -v /redis/slave02:/data \
  redis:8.10.1 redis-server \
  --port 6380 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes
```

### 설정 파라미터 설명

- `--cluster-enabled yes` — 클러스터 모드 활성화. 이 값이 `yes`면 standalone이 아니라 클러스터로 동작합니다.
- `--cluster-config-file nodes.conf` — 노드가 클러스터 상태(다른 노드 목록, 슬롯 할당, 영속 변수)를 자동 저장·재로딩하는 파일입니다. **사람이 수동으로 편집하는 파일이 아닙니다.**
- `--cluster-node-timeout 5000` — 노드가 무응답으로 간주되기까지의 밀리초(ms) 한계입니다. 마스터가 과반 마스터에 도달하지 못한 상태가 이 시간을 넘으면 쿼리 수용을 중단합니다.
- `--bind 0.0.0.0` — 모든 인터페이스에서 접속을 수용합니다. **프로덕션에서는 `requirepass`/`masterauth` 또는 ACL 설정과 방화벽 제한이 필수입니다.** `--bind 0.0.0.0`은 폐쇄망 전용입니다.
- `--appendonly yes` — AOF(Append Only File) 활성화. 공식 클러스터 최소 설정은 **모든 노드에 `appendonly yes`**를 포함합니다. 마스터 영속성을 끄는 것은 자동 재시작 금지가 전제된 예외 구성이며, 공식 문서는 "마스터와 레플리카 모두 영속성을 켜라"고 권고합니다.

### Docker 네트워크 주의사항

Redis 공식 문서는 클러스터 모드에서 NAT/포트 리매핑 환경을 지원하지 않으며, Docker의 host 네트워크 모드(`--net=host`)를 사용하라고 권고합니다.

```bash
# 권장 네트워크 모드
--network host
```

하지만 `redis.conf`의 CLUSTER DOCKER/NAT support 블록에는 NAT 환경을 위한 대안이 문서화되어 있습니다. 각 노드가 공개 주소를 정적으로 광고하도록 다음 4개 지시어를 설정하면 포트 포워딩 환경에서도 동작합니다.

- `cluster-announce-ip <IP>`
- `cluster-announce-port <port>`
- `cluster-announce-tls-port <port>`
- `cluster-announce-bus-port <port>`

예를 들어 Docker 브리지 네트워크나 포트 매핑을 사용한다면 다음처럼 추가합니다.

```bash
docker run -d --name redis-master01 -p 6379:6379 -p 16379:16379 \
  -v /redis/master01:/data \
  redis:8.10.1 redis-server \
  --port 6379 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --cluster-announce-ip 192.168.1.10 \
  --cluster-announce-port 6379 \
  --cluster-announce-bus-port 16379
```

두 접근 모두 공식 문서에 근거가 있으며, 선택은 인프라 환경에 따릅니다.

## redis-cli로 클러스터 생성

Redis 5.0부터 클러스터 생성·관리 명령이 `redis-trib.rb`에서 `redis-cli --cluster`로 옮겨졌습니다. **`redis-trib.rb`는 8.10.1에도 파일로 남아 있지만 deprecation stub으로, 실행하면 `redis-cli --cluster`를 쓰라는 메시지를 출력하고 종료합니다.**

`--cluster create` 명령은 자동으로 16384개 해시 슬롯을 노드에 분배합니다. 명령 실행 시 제안된 슬롯 배치를 보여주고, `yes`로 승인하면 클러스터가 구성됩니다.

```bash
docker run -i --rm --network host redis:8.10.1 redis-cli --cluster create \
  192.168.160.25:6379 192.168.160.22:6380 192.168.160.29:6381 \
  192.168.160.25:6381 192.168.160.22:6379 192.168.160.29:6380 \
  --cluster-replicas 1
```

명령을 실행하면 슬롯 배치 계획을 출력하고 승인을 요청합니다. `yes`를 입력하면 클러스터가 생성됩니다.

`--cluster-replicas 1` 파라미터는 마스터 하나당 레플리카 1개를 배정합니다. 노드 목록 순서대로 앞의 3개가 마스터, 뒤의 3개가 레플리카가 됩니다. 해시 슬롯 16384개는 마스터 3개에 자동으로 균등 분배됩니다(0-5460 / 5461-10922 / 10923-16383).

## 클러스터 정보 조회

클러스터가 정상 동작하는지 확인합니다.

```bash
docker run -i --rm --network host redis:8.10.1 redis-cli --cluster info localhost:6381
```

출력 예시:

```text
192.168.160.29:6381 (c9d966fa...) -> 0 keys | 5461 slots | 1 slaves.
192.168.160.25:6379 (a3ca7212...) -> 0 keys | 5461 slots | 1 slaves.
192.168.160.22:6380 (fc343bf4...) -> 0 keys | 5462 slots | 1 slaves.
[OK] 0 keys in 3 masters.
0.00 keys per slot on average.
```

각 마스터가 슬롯을 몇 개 소유하고 있는지, 레플리카가 몇 개 붙어 있는지 확인할 수 있습니다.

클러스터 상태를 점검하려면 다음 명령을 사용합니다.

```bash
docker run -i --rm --network host redis:8.10.1 redis-cli --cluster check 127.0.0.1:6379
```

슬롯 누락, 마스터 이상, 레플리카 연결 문제 등을 진단합니다.

## redis-cli --cluster 명령어

`redis-cli --cluster`는 클러스터 생성 외에도 노드 추가·삭제, 슬롯 재분배(reshard) 등 관리 작업을 지원합니다.

전체 명령 목록:

```bash
docker run -i --rm --network host redis:8.10.1 redis-cli --cluster help
```

주요 명령:

| 작업 | 명령 |
|---|---|
| 클러스터 생성 | `--cluster create <host1:port1> ... <hostN:portN> --cluster-replicas <n>` |
| 마스터 추가 | `--cluster add-node <new:port> <existing:port>` |
| 레플리카 추가 | `--cluster add-node <new:port> <existing:port> --cluster-slave [--cluster-master-id <id>]` |
| 노드 제거 | `--cluster del-node <host:port> <node-id>` |
| 슬롯 재분배 | `--cluster reshard <host:port>` (대화형) |
| 슬롯 리밸런싱 | `--cluster rebalance <host:port>` |
| 클러스터 복구 | `--cluster fix <host:port>` |
| 상태 점검 | `--cluster check <host:port>` |
| 정보 조회 | `--cluster info <host:port>` |
| 전체 명령 실행 | `--cluster call <host:port> <command>` |

### 노드 추가 예시

새 마스터를 추가합니다.

```bash
redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7000
```

- 첫 번째 인자는 추가할 새 노드, 두 번째 인자는 기존 클러스터의 임의 노드입니다.
- 내부적으로 `CLUSTER MEET` 명령이 전송됩니다.

레플리카를 추가합니다.

```bash
redis-cli --cluster add-node 127.0.0.1:7007 127.0.0.1:7000 --cluster-slave
```

레플리카는 자동으로 레플리카 수가 적은 마스터에 배정됩니다. 특정 마스터를 지정하려면 `--cluster-master-id <node-id>` 옵션을 추가합니다.

### 리샤딩(슬롯 재분배)

슬롯을 재분배하려면 `--cluster reshard` 명령을 사용합니다.

대화형 모드:

```bash
redis-cli --cluster reshard 127.0.0.1:7000
```

- "How many slots do you want to move?" 질문에 이동할 슬롯 수를 입력합니다.
- 대상 노드 ID와 출처 노드 ID(또는 `all`)를 지정합니다.

비대화형 모드(자동화 스크립트용):

```bash
redis-cli --cluster reshard 127.0.0.1:7000 \
  --cluster-from <source-node-id> \
  --cluster-to <target-node-id> \
  --cluster-slots 1000 \
  --cluster-yes
```

`--cluster-yes`는 확인 프롬프트를 건너뜁니다. 환경변수 `REDISCLI_CLUSTER_YES=1`로도 설정할 수 있습니다.

### 노드 제거

마스터를 제거하려면 먼저 슬롯을 비워야 합니다.

```bash
redis-cli --cluster del-node 127.0.0.1:7000 <node-id>
```

레플리카는 슬롯이 없으므로 바로 제거 가능합니다.

노드가 죽어서 접속이 불가능한 경우, `del-node`는 모든 노드에 접속을 시도하므로 connection refused 에러가 발생합니다. 이럴 때는 `CLUSTER FORGET` 명령을 각 노드에 수동으로 전송해야 합니다.

```bash
redis-cli --cluster call 127.0.0.1:7000 cluster forget <dead-node-id>
```

## Redis 클러스터를 사용하는 이유

### 1. 자동 Failover

Redis 클러스터는 센티널 없이도 자체적으로 모든 노드를 감시하고, 장애 시 자동으로 Failover를 실행합니다.

Redis 클러스터는 3.0(2015)부터 자체적으로 장애 감지와 Failover 기능을 내장합니다. Sentinel은 클러스터로 대체된 것이 아니라, **비클러스터 Redis 구성의 HA 수단**으로 지금도 사용됩니다.

**클러스터 버스**

클러스터 버스(Cluster Bus)는 노드 간 장애 감지·구성 교환에 사용되는 바이너리 프로토콜입니다. 기본 포트는 클라이언트 포트 + 10000입니다(예: 6379 → 16379). 이 포트도 방화벽에서 열려 있어야 합니다.

클러스터 버스는 대역폭과 처리 시간을 적게 사용하도록 설계되어 노드 간 정보 교환에 효율적입니다. 각 노드는 버스를 통해 다른 노드의 상태를 주기적으로 확인하고, 무응답 노드를 감지하면 과반 마스터와 합의해 Failover를 진행합니다.

**마스터 장애 시**

마스터가 `cluster-node-timeout` 밀리초 이상 무응답 상태가 되면, 과반 마스터가 해당 노드를 장애로 판정하고 레플리카 중 하나를 새 마스터로 승격시킵니다. 레플리카가 없으면 해당 슬롯 범위는 서비스 불가 상태가 됩니다.

**파티션 시 동작**

클러스터가 네트워크 파티션으로 나뉘면, 과반 마스터를 포함하는 파티션만 쓰기를 수용합니다. 소수 파티션에 있는 마스터는 `cluster-node-timeout`이 지나면 쿼리 수용을 중단합니다. 이는 쓰기 유실 윈도를 제한하기 위한 설계입니다.

### 2. 자동 샤딩(Auto Sharding)

Redis 클러스터는 16384개의 해시 슬롯을 마스터 노드들에 분배합니다. 키가 어느 슬롯에 속하는지는 다음 식으로 결정됩니다.

```
슬롯 = CRC16(key) mod 16384
```

마스터 3개 구성이라면:

- 슬롯 0 ~ 5460 → 1번 마스터
- 슬롯 5461 ~ 10922 → 2번 마스터
- 슬롯 10923 ~ 16383 → 3번 마스터

**해시 태그**

여러 키가 같은 슬롯에 저장되어야 한다면 해시 태그를 사용합니다. 키 이름에 `{}`로 감싼 부분이 있으면, 그 부분만 CRC16 계산에 사용됩니다.

예시:

```
user:{123}:profile
user:{123}:account
```

두 키는 모두 `{123}` 부분만 해시되므로 같은 슬롯에 저장됩니다. 이렇게 하면 `MGET`, `MSET`, `SINTER` 같은 멀티키 명령을 클러스터 모드에서도 사용할 수 있습니다.

**클러스터 모드에서 멀티키 연산 제약**

클러스터 모드에서는 여러 키를 다루는 명령(예: `MGET`, `MSET`, `SINTER`, `ZUNIONSTORE`)이 **모든 키가 단일 슬롯에 있어야** 실행됩니다. 키가 서로 다른 슬롯에 있으면 `CROSSSLOT` 에러가 반환됩니다.

파이프라인·`MULTI`-`EXEC` 트랜잭션·`EVAL` 스크립트도 동일 제약이 적용됩니다.

**노드 추가 시 자동 리밸런싱**

마스터를 추가하면 `--cluster reshard` 명령으로 슬롯을 재분배합니다. 예를 들어 3노드 클러스터에 4번째 마스터를 추가하면, 각 기존 마스터에서 슬롯 일부를 가져와 4번 마스터에 할당합니다.

리샤딩 중에는 해당 슬롯의 키가 새 노드로 마이그레이션되고, 클라이언트는 `-MOVED` 또는 `-ASK` 리다이렉션 응답을 받습니다. `redis-cli -c` 옵션은 자동으로 리다이렉션을 따라가므로 테스트 시 편리합니다.

**참고: 키 분포 기반 리밸런싱은 미구현**

`redis-cli --cluster rebalance` 명령으로 **슬롯 개수 기준 자동 리밸런싱**이 가능합니다. 공식 문서가 "미구현"이라고 한 것은 **키 분포를 보고 지능적으로 슬롯을 재배치하는** 고급 리밸런싱입니다.

## 마무리

Docker를 사용하면 로컬 테스트 환경이나 개발 클러스터를 빠르게 구성할 수 있습니다. 프로덕션 배포에서는 다음 사항을 고려해야 합니다.

1. **네트워크 모드**: `--net=host` 또는 `cluster-announce-*` 정적 설정
2. **포트 열기**: 클라이언트 포트 + 클러스터 버스 포트(+10000) 모두 방화벽 허용
3. **영속성**: 모든 노드에 `--appendonly yes`, 볼륨 마운트로 데이터 보존
4. **최소 구성**: 마스터 3개, 권장 6개(마스터 3 + 레플리카 3)
5. **Failover 테스트**: 주기적으로 실제 노드를 죽여 Failover가 정상 동작하는지 확인

Redis 클러스터는 수평 확장과 고가용성을 동시에 제공하지만, 멀티키 연산 제약·파티션 시 쓰기 유실 가능성 등 트레이드오프가 있습니다. 설계 단계에서 이를 고려해야 합니다.

필요하다면 docker-compose로 6개 컨테이너를 한 번에 띄우고, Ansible로 여러 노드에 배포하는 자동화를 추가할 수 있습니다. 공식 저장소의 `utils/create-cluster` 스크립트도 로컬 테스트 클러스터를 빠르게 만드는 데 유용합니다.
