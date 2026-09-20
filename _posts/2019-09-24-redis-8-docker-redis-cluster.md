---
date: 2019-09-24 23:01:29 +0900
title: "Redis #.8 Docker를 이용한 Redis cluster 구축 (ver. 8.10.1-trixie)"
category: redis
excerpt: "Docker로 노드 3대에 컨테이너 6개(마스터 3 + 레플리카 3)를 띄워 Redis 클러스터를 만들고, redis-cli --cluster 로 생성·점검·리샤딩까지 진행하는 실습 절차입니다."
last_modified_at: 2026-09-20
---

패키지로 Redis 클러스터를 세우는 절차는 세 단계입니다. 각 노드에 Redis를 설치하고, 설정에서 클러스터 파라미터를 켠 뒤, `redis-cli --cluster create` 명령으로 클러스터를 생성합니다. 이 글에서는 Docker를 사용해 노드 3대에 컨테이너 6개(마스터 3 + 레플리카 3)로 구성된 클러스터를 구축합니다.

공식 문서는 정상 동작하는 최소 클러스터가 마스터 3개라고 못박고, 배포용으로는 마스터 3 + 레플리카 3의 6노드 구성을 강하게 권고합니다. 마스터는 해시 슬롯을 나눠 가지고, 레플리카는 마스터 장애 시 자동 Failover 대상이 됩니다.

> **NOTE** — 이 글의 예제는 Docker Hub 공식 `redis` 이미지의 `8.10.1` 태그를 고정해서 씁니다. `8.10.1` 과 `8.10.1-trixie` 는 같은 이미지를 가리키는 Debian trixie 기반 태그입니다. Redis 8.0 부터 라이선스가 RSALv2·SSPLv1·AGPLv3 중 하나를 고르는 방식으로 바뀌었고, 7.x 계열도 보안 패치를 받아 7.2.16 과 7.4.11 이 2026-08-17 에 배포됐습니다. 다른 버전으로 실습하려면 Docker Hub의 태그 목록에서 현행 태그를 확인한 뒤 명령의 태그만 바꿉니다.

## 전제조건

각 노드에 Docker가 설치되어 있어야 합니다. 클러스터 모드에서는 노드당 TCP 포트 2개가 필요합니다.

- **클라이언트 포트**(예: 6379) — 클라이언트와 노드 간 통신
- **클러스터 버스 포트**(기본값은 클라이언트 포트 + 10000, 즉 16379) — 노드 간 장애 감지·구성 교환에 사용하며 `cluster-port` 설정으로 바꿀 수 있습니다

방화벽에서 두 포트를 모두 열어야 합니다. 클라이언트 포트는 클라이언트뿐 아니라 다른 클러스터 노드에서도 접근 가능해야 합니다. 키 마이그레이션이 클라이언트 포트를 사용하기 때문입니다.

### 기본 사용자에 비밀번호를 설정합니다

노드를 여러 대에 나눠 띄우는 구성에서는 비밀번호 설정이 선택 사항이 아닙니다. Redis는 `protected-mode`가 켜져 있고 기본 사용자에 비밀번호가 없으면 **루프백이 아닌 모든 접속을 `-DENIED` 로 거절합니다.** 이 판정은 `bind` 설정과 무관합니다. `--bind 0.0.0.0` 을 줬더라도 다른 노드에서 들어오는 접속은 막힙니다. 이 상태로는 `redis-cli --cluster create` 가 원격 노드에 붙지 못해 클러스터 생성 자체가 실패합니다.

거절 메시지는 해결책 네 가지를 함께 안내하고, 그중 하나는 "기본 사용자에 인증 비밀번호를 설정하라"입니다. 아래 예제는 이 방법을 택해 모든 노드에 `requirepass` 와 `masterauth` 를 같은 값으로 설정합니다. Failover로 역할이 바뀌어도 동작하도록 레플리카뿐 아니라 마스터에도 `masterauth` 를 넣습니다.

> **WARNING** — 명령줄로 넘긴 비밀번호는 `ps` 와 `docker inspect` 에 그대로 노출됩니다. 아래 예제는 실습용이고, 운영에서는 설정 파일을 컨테이너에 마운트하거나 ACL 사용자 파일을 쓰는 편이 안전합니다.

## Docker로 Redis 설치

각 노드에서 아래 명령으로 컨테이너를 실행합니다. 이미지 태그는 `redis:8.10.1` 또는 `redis:8.10.1-trixie` 를 사용합니다. 세 노드 모두 같은 비밀번호를 쓰므로 먼저 셸 변수로 잡아 둡니다.

**Node #1**

```bash
REDIS_PASSWORD='change-me'

docker run -d --name redis-master01 --network host \
  -v /redis/master01:/data \
  redis:8.10.1 redis-server \
  --port 6379 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes \
  --requirepass "$REDIS_PASSWORD" \
  --masterauth "$REDIS_PASSWORD"

docker run -d --name redis-replica03 --network host \
  -v /redis/replica03:/data \
  redis:8.10.1 redis-server \
  --port 6381 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes \
  --requirepass "$REDIS_PASSWORD" \
  --masterauth "$REDIS_PASSWORD"
```

**Node #2**

```bash
REDIS_PASSWORD='change-me'

docker run -d --name redis-master02 --network host \
  -v /redis/master02:/data \
  redis:8.10.1 redis-server \
  --port 6380 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes \
  --requirepass "$REDIS_PASSWORD" \
  --masterauth "$REDIS_PASSWORD"

docker run -d --name redis-replica01 --network host \
  -v /redis/replica01:/data \
  redis:8.10.1 redis-server \
  --port 6379 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes \
  --requirepass "$REDIS_PASSWORD" \
  --masterauth "$REDIS_PASSWORD"
```

**Node #3**

```bash
REDIS_PASSWORD='change-me'

docker run -d --name redis-master03 --network host \
  -v /redis/master03:/data \
  redis:8.10.1 redis-server \
  --port 6381 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes \
  --requirepass "$REDIS_PASSWORD" \
  --masterauth "$REDIS_PASSWORD"

docker run -d --name redis-replica02 --network host \
  -v /redis/replica02:/data \
  redis:8.10.1 redis-server \
  --port 6380 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --bind 0.0.0.0 \
  --appendonly yes \
  --requirepass "$REDIS_PASSWORD" \
  --masterauth "$REDIS_PASSWORD"
```

### 설정 파라미터 설명

파라미터 이름은 2019년과 같습니다. `cluster-enabled`·`cluster-config-file`·`cluster-node-timeout` 은 현행 `redis.conf` 와 공식 클러스터 문서에 동일한 이름으로 남아 있습니다.

- `--cluster-enabled yes` — 클러스터 모드 활성화. `yes` 면 standalone이 아니라 클러스터 노드로 기동합니다.
- `--cluster-config-file nodes.conf` — 노드가 클러스터 상태(다른 노드 목록, 슬롯 할당, 영속 변수)를 변경마다 자동 저장하고 재기동 때 다시 읽는 파일입니다. **이름과 달리 사람이 편집하는 설정 파일이 아닙니다.** 노드마다 다른 파일을 써야 합니다.
- `--cluster-node-timeout 5000` — 노드가 무응답으로 간주되기까지의 밀리초(ms) 한계입니다. 마스터가 이 시간 이상 도달 불가면 레플리카가 Failover를 수행합니다. 과반 마스터에 도달하지 못한 노드는 이 시간이 지나면 쿼리 수용을 중단합니다.
- `--bind 0.0.0.0` — 모든 인터페이스에서 접속을 수용합니다. 위에서 설명한 대로 이 설정만으로는 원격 접속이 열리지 않고, 비밀번호나 ACL 설정이 함께 필요합니다.
- `--appendonly yes` — AOF(Append Only File) 활성화. 공식 문서의 클러스터 최소 설정 예시가 `appendonly yes` 를 포함하고, 마스터와 레플리카 모두 영속성을 켜라고 권고합니다.

> **IMPORTANT** — 2026-09-17 에 배포된 8.2.10·8.4.7·8.6.7·8.8.3·8.10.2 부터 `cluster-bus-port-protected-mode` 설정이 추가됐고 기본값이 켜짐입니다. 클러스터 버스 프로토콜에는 자체 인증이 없어서, 이 설정이 켜진 상태에서 `tls-cluster` 가 꺼져 있으면 노드가 버스 포트를 인증 없이 열지 않으려고 **기동을 거부합니다.** 해결책은 두 가지입니다. `tls-cluster yes` 로 버스 피어에 인증서를 요구하거나, 방화벽으로 버스 포트를 막았다는 전제를 인정하는 `cluster-bus-port-protected-mode no` 를 설정합니다. 위 예제가 고정한 `redis:8.10.1` 에는 이 설정이 없으므로, 이 버전에 두 플래그를 넣으면 모르는 지시어로 기동이 실패합니다.

### Docker 네트워크 주의사항

Redis 공식 문서는 클러스터 모드에서 NAT 환경과 IP·포트가 리매핑되는 환경을 지원하지 않는다고 적습니다. Docker의 포트 매핑이 바로 그 리매핑이라서, 공식 문서는 Docker에서 클러스터를 쓰려면 host 네트워킹 모드를 사용하라고 안내합니다.

```bash
# 권장 네트워크 모드
--network host
```

host 네트워킹을 쓸 수 없다면 다른 경로가 있습니다. `redis.conf` 의 CLUSTER DOCKER/NAT support 절은 주소 탐색이 깨지는 원인을 NAT과 포트 포워딩으로 지목하면서, 각 노드가 자기 공개 주소를 정적으로 알고 있는 설정이 필요하다고 설명합니다. 컨테이너가 보는 포트와 외부에서 접속하는 포트가 다르기 때문에, 노드가 광고할 주소를 직접 알려 주지 않으면 다른 노드와 클라이언트가 잘못된 주소를 받습니다. 그래서 다음 4개 지시어로 주소와 포트를 고정합니다.

- `cluster-announce-ip <IP>`
- `cluster-announce-port <port>`
- `cluster-announce-tls-port <port>`
- `cluster-announce-bus-port <port>`

예를 들어 Docker 브리지 네트워크에 포트 매핑을 쓴다면 다음처럼 추가합니다.

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
  --cluster-announce-bus-port 16379 \
  --requirepass "$REDIS_PASSWORD" \
  --masterauth "$REDIS_PASSWORD"
```

두 접근 모두 공식 문서에 근거가 있고, 선택은 인프라 환경에 따릅니다.

## redis-cli로 클러스터 생성

Redis 5.0 부터 클러스터 생성·관리 명령이 `redis-trib.rb` 에서 `redis-cli --cluster` 로 옮겨졌습니다. `redis-trib.rb` 파일은 소스 트리에 남아 있지만 기능이 없습니다. 실행하면 모든 명령과 기능이 `redis-cli` 로 옮겨졌다는 안내와 함께, 입력한 인자를 `--cluster` 형태로 바꿔 놓은 명령 예시를 출력하고 종료 코드 1로 끝냅니다. 그래서 2019년 원문 시점 이후로 실습에 쓸 수 있는 도구는 `redis-cli --cluster` 하나입니다.

`--cluster create` 는 16384개 해시 슬롯을 노드에 자동 분배합니다. 명령을 실행하면 슬롯 배치 계획을 보여주고 승인을 요청하며, `yes` 를 입력하면 클러스터가 구성됩니다. 비밀번호는 `-a` 로도 넘길 수 있지만 `redis-cli` 자체 도움말이 `REDISCLI_AUTH` 환경변수가 더 안전하다고 안내하므로 환경변수를 씁니다.

```bash
docker run -i --rm --network host -e REDISCLI_AUTH="$REDIS_PASSWORD" \
  redis:8.10.1 redis-cli --cluster create \
  192.168.160.25:6379 192.168.160.22:6380 192.168.160.29:6381 \
  192.168.160.25:6381 192.168.160.22:6379 192.168.160.29:6380 \
  --cluster-replicas 1
```

`--cluster-replicas 1` 은 마스터 하나당 레플리카 1개를 배정하라는 뜻입니다. 노드 목록 순서대로 앞의 3개가 마스터, 뒤의 3개가 레플리카가 됩니다. 해시 슬롯 16384개는 마스터 3개에 균등 분배됩니다(0-5460 / 5461-10922 / 10923-16383).

## 클러스터 정보 조회

클러스터가 정상 동작하는지 확인합니다.

```bash
docker run -i --rm --network host -e REDISCLI_AUTH="$REDIS_PASSWORD" \
  redis:8.10.1 redis-cli --cluster info localhost:6381
```

출력 예시:

```text
192.168.160.29:6381 (c9d966fa...) -> 0 keys | 5461 slots | 1 slaves.
192.168.160.25:6379 (a3ca7212...) -> 0 keys | 5461 slots | 1 slaves.
192.168.160.22:6380 (fc343bf4...) -> 0 keys | 5462 slots | 1 slaves.
[OK] 0 keys in 3 masters.
0.00 keys per slot on average.
```

각 마스터가 슬롯을 몇 개 소유하고 있는지, 레플리카가 몇 개 붙어 있는지 확인할 수 있습니다. 출력 문구는 여전히 `slaves` 입니다. 이 글은 설명에서 레플리카로 적고, 도구가 그대로 찍는 문자열과 옵션 이름은 원문 그대로 옮깁니다.

클러스터 상태를 점검하려면 다음 명령을 사용합니다.

```bash
docker run -i --rm --network host -e REDISCLI_AUTH="$REDIS_PASSWORD" \
  redis:8.10.1 redis-cli --cluster check 127.0.0.1:6379
```

슬롯 누락, 마스터 이상, 레플리카 연결 문제를 진단합니다.

## redis-cli --cluster 명령어

`redis-cli --cluster` 는 클러스터 생성 외에 노드 추가·삭제, 슬롯 재분배(reshard), 백업, 타임아웃 변경 등 관리 작업을 지원합니다.

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
| 전체 노드에 명령 실행 | `--cluster call <host:port> <command>` |

### 노드 추가 예시

새 마스터를 추가합니다.

```bash
redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7000
```

- 첫 번째 인자는 추가할 새 노드, 두 번째 인자는 기존 클러스터의 임의 노드입니다.
- 내부적으로 `CLUSTER MEET` 명령이 전송됩니다.
- 새 마스터에는 슬롯이 없으므로, 슬롯을 받으려면 뒤에 나오는 리샤딩을 별도로 실행해야 합니다.

레플리카를 추가합니다.

```bash
redis-cli --cluster add-node 127.0.0.1:7007 127.0.0.1:7000 --cluster-slave
```

레플리카는 레플리카 수가 가장 적은 마스터에 자동 배정됩니다. 특정 마스터를 지정하려면 `--cluster-master-id <node-id>` 를 추가합니다. 옵션 이름에는 `slave` 가 남아 있습니다. 공식 문서는 Redis 5 이후 프로젝트가 `slave` 라는 단어를 쓰지 않지만 이 옵션에서는 단어가 프로토콜의 일부라서 그대로 두었다고 밝힙니다.

### 리샤딩(슬롯 재분배)

슬롯을 재분배하려면 `--cluster reshard` 명령을 사용합니다.

대화형 모드:

```bash
redis-cli --cluster reshard 127.0.0.1:7000
```

- "How many slots do you want to move (from 1 to 16384)?" 질문에 이동할 슬롯 수를 입력합니다.
- 대상 노드 ID와 출처 노드 ID(또는 `all`)를 지정합니다.

비대화형 모드(자동화 스크립트용):

```bash
redis-cli --cluster reshard 127.0.0.1:7000 \
  --cluster-from <source-node-id> \
  --cluster-to <target-node-id> \
  --cluster-slots 1000 \
  --cluster-yes
```

`--cluster-yes` 는 확인 프롬프트에 자동으로 `yes` 를 답합니다. 환경변수 `REDISCLI_CLUSTER_YES` 로도 같은 효과를 낼 수 있습니다.

### 노드 제거

레플리카는 슬롯이 없으므로 바로 제거할 수 있습니다.

```bash
redis-cli --cluster del-node 127.0.0.1:7000 <node-id>
```

마스터를 제거하려면 먼저 다른 마스터들로 슬롯을 모두 옮겨 비워야 합니다.

노드가 죽어서 접속이 불가능한 경우에는 `del-node` 를 쓰지 않습니다. 이 명령이 모든 노드에 접속을 시도하기 때문에 connection refused 에러를 만납니다. 이럴 때는 모든 노드에 `CLUSTER FORGET` 을 보냅니다.

```bash
redis-cli --cluster call 127.0.0.1:7000 cluster forget <dead-node-id>
```

## Redis 클러스터를 사용하는 이유

### 1. 자동 Failover

Redis 클러스터는 3.0(2015)부터 자체적으로 모든 노드를 감시하고 장애 시 Failover를 실행합니다. Sentinel은 클러스터로 대체된 것이 아니라, **비클러스터 Redis 구성의 HA 수단**으로 지금도 쓰입니다.

**클러스터 버스**

클러스터 버스(Cluster Bus)는 노드 간 장애 감지·구성 갱신·Failover 승인에 쓰이는 바이너리 프로토콜입니다. 기본 포트는 클라이언트 포트 + 10000 입니다(예: 6379 → 16379). 클라이언트는 이 포트에 접속하지 않지만, 노드끼리 통신하려면 방화벽에서 열려 있어야 합니다.

공식 문서는 클러스터 버스가 대역폭과 처리 시간을 적게 쓰도록 설계됐다고 설명합니다. 각 노드는 버스로 다른 노드의 상태를 주기적으로 확인하고, 무응답 노드를 감지하면 과반 마스터와 합의해 Failover를 진행합니다.

**마스터 장애 시**

마스터가 `cluster-node-timeout` 밀리초 이상 도달 불가 상태가 되면, 과반 마스터가 해당 노드를 장애로 판정하고 레플리카 중 하나를 새 마스터로 승격시킵니다. 레플리카가 없으면 그 마스터가 가진 슬롯 범위는 서비스 불가 상태가 됩니다.

**파티션 시 동작**

클러스터가 네트워크 파티션으로 나뉘면 과반 마스터를 포함하는 파티션만 쓰기를 수용합니다. 소수 파티션에 있는 마스터는 `cluster-node-timeout` 이 지나면 쿼리 수용을 중단합니다. 쓰기 유실 윈도를 제한하기 위한 설계입니다.

### 2. 자동 샤딩(Auto Sharding)

Redis 클러스터는 일관된 해싱(consistent hashing)이 아니라 해시 슬롯 방식을 씁니다. 슬롯은 16384개이고, 키가 어느 슬롯에 속하는지는 다음 식으로 결정됩니다.

```text
슬롯 = CRC16(key) mod 16384
```

마스터 3개 구성이라면:

- 슬롯 0 ~ 5460 → 1번 마스터
- 슬롯 5461 ~ 10922 → 2번 마스터
- 슬롯 10923 ~ 16383 → 3번 마스터

**해시 태그**

여러 키를 같은 슬롯에 두어야 한다면 해시 태그를 사용합니다. 키 이름에 중괄호로 감싼 부분이 있으면 그 안쪽 문자열만 해시 계산에 쓰입니다.

예시:

```text
user:{123}:profile
user:{123}:account
```

공식 문서는 이 두 키가 같은 해시 태그를 공유하므로 같은 해시 슬롯에 있음이 보장되고, 따라서 하나의 멀티키 연산으로 함께 다룰 수 있다고 적습니다.

**클러스터 모드에서 멀티키 연산 제약**

클러스터 모드에서는 여러 키를 다루는 명령(예: `MGET`, `MSET`, `SINTER`, `ZUNIONSTORE`)이 **모든 키가 같은 슬롯에 있어야** 실행됩니다. 키가 서로 다른 슬롯에 걸치면 `-CROSSSLOT Keys in request don't hash to the same slot` 에러가 돌아옵니다.

파이프라인, `MULTI`-`EXEC` 트랜잭션, 여러 키를 쓰는 Lua 스크립트에도 같은 제약이 적용됩니다.

**노드 추가 시 슬롯 재배치**

마스터를 추가하면 `--cluster reshard` 로 슬롯을 재분배합니다. 예를 들어 3노드 클러스터에 4번째 마스터를 추가하면, 기존 마스터들에서 슬롯 일부를 가져와 새 마스터에 할당합니다.

리샤딩 중에는 해당 슬롯의 키가 새 노드로 마이그레이션되고, 클라이언트는 `-MOVED` 또는 `-ASK` 리다이렉션 응답을 받습니다. `redis-cli -c` 옵션은 리다이렉션을 자동으로 따라가므로 테스트할 때 편리합니다.

**키 분포를 보는 리밸런싱은 아직 없습니다**

`redis-cli --cluster rebalance` 는 슬롯 개수와 노드별 가중치를 기준으로 슬롯을 옮깁니다. 공식 문서가 아직 없다고 말하는 기능은 그다음 단계입니다. `redis-cli` 가 노드별 키 분포를 스스로 살펴보고 필요한 만큼 슬롯을 옮기는 자동 리밸런싱은 구현돼 있지 않고, 향후 추가할 기능으로 적혀 있습니다.

## 마무리

Docker를 사용하면 로컬 테스트 환경이나 개발 클러스터를 빠르게 구성할 수 있습니다. 프로덕션 배포에서는 다음을 고려해야 합니다.

1. **네트워크 모드**: `--net=host`, 또는 포트 매핑을 쓴다면 `cluster-announce-*` 정적 설정
2. **포트 열기**: 클라이언트 포트와 클러스터 버스 포트(+10000) 모두 방화벽 허용
3. **인증**: 모든 노드에 `requirepass`·`masterauth` 또는 ACL 사용자. 비밀번호 없이는 원격 접속이 막힙니다
4. **버스 포트 보호**: 8.10.2 이후 버전에서는 `tls-cluster yes` 또는 `cluster-bus-port-protected-mode no` 중 하나를 명시
5. **영속성**: 모든 노드에 `--appendonly yes`, 볼륨 마운트로 데이터 보존
6. **최소 구성**: 마스터 3개가 최소, 배포 권장은 6개(마스터 3 + 레플리카 3)
7. **Failover 테스트**: 주기적으로 실제 노드를 죽여 Failover가 정상 동작하는지 확인

Redis 클러스터는 수평 확장과 고가용성을 함께 제공하지만, 멀티키 연산 제약과 파티션 시 쓰기 유실 가능성이라는 트레이드오프가 있습니다. 설계 단계에서 이를 고려해야 합니다.

컨테이너 6개를 한 번에 띄우려면 docker-compose로 묶고, 여러 노드 배포는 Ansible 같은 도구로 자동화할 수 있습니다. 한 대에서 테스트 클러스터를 빨리 만들어 보려면 Redis 소스 저장소의 `utils/create-cluster` 스크립트도 쓸 만합니다.
