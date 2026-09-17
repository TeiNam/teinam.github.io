---
date: 2019-09-19 15:29:08 +0900
title: "Redis #.1 소개 및 설치"
category: redis
excerpt: "Redis 란? Redis가 주목 받는 이유는 빠른 처리 속도와 검증된 소프트웨어 안정성에 있습니다. 모든 데이터를 메모리에 상주시켜 처리하고 이벤트 기반의 네트워크 비동기 입출력 처리를 해서, 한 Redis 서버는 초당 수만 건 이상의 요청을 처리할..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 글이 전제한 "현재 stable 5.0.5"는 2026년 9월 기준 Redis 8.10.1(2026-08-17 릴리즈)로 바뀌었고, 소스 빌드도 `cd deps && make hiredis jemalloc linenoise lua` 없이 최상위에서 `make` 만 실행하면 됩니다. 또한 2024년 3월 라이선스가 BSD-3에서 RSALv2/SSPLv1로 변경되었고 Redis 8.0부터 AGPLv3가 세 번째 선택지로 추가되었으며, 그 대응으로 Linux Foundation 산하 Valkey 포크가 2024년 4월 등장했으므로 "오픈소스 Redis"라는 전제는 그대로 쓰기 어렵습니다.

![](/assets/img/wp/2019/09/redis.png)

**Redis 란?**

Redis가 주목 받는 이유는 빠른 처리 속도와 검증된 소프트웨어 안정성에 있습니다. 모든 데이터를 메모리에 상주시켜 처리하고 이벤트 기반의 네트워크 비동기 입출력 처리를 해서, 한 Redis 서버는 초당 수만 건 이상의 요청을 처리할 수 있습니다. 또한 데이터의 가용성과 영속성을 위해 복제 및 RDB(Redis DB), AOF(Append Only File) 기능을 제공합니다.

정의하면 InMemory NoSQL 입니다. Key-value Store 방식의 NoSQL 데이터베이스인데, 메모리에 상주하며 빠른 읽기/쓰기 속도를 자랑합니다. 이러한 특성 때문에 많은 회사에서 RDBMS의 캐시 솔루션으로 사용하기도 합니다.

Line 시스템이 MariaDB innoDB 샤딩에 사용한 nbase 같은 솔루션도 Redis를 개량해 자체 개발한 RDBMS 캐시용 솔루션이라고 생각이 드네요. Redis의 일부 벤치마킹 테스트에 의하면 초당 100,000만개의 이상의 set 연산을 처리한다고 합니다.

Message Queue, Shared Memory, Remote Dictionary 용도로 사용할 수 있습니다. 많은 회사들이 데이터 저장소보다는 remote dictionary로서 캐시용으로 더 많이 사용하고 있습니다. Redis는 Document 타입의 데이터베이스 만큼은 아니지만 수준 높은 데이터구조를 지원합니다. Set 기반의 쿼리 연산을 지원하는 것을 의미합니다.  Redis의 최고 장점은 **빠르다**는 점입니다. 그러면 왜 캐시 용도로 Redis를 사용하는가? 에 대한 질문은 DB에 캐시에 도달하기 위해서는 Parsing 단계를 거쳐야 하는데, Redis를 이용하면 Parsing 단계를 건너뛸 수 있다고 합니다. DB용 CDN 서비스같은 개념으로 사용할 수 있고, 자주 사용하는 메타데이터 정보나 설정 정보등을 트랜잭션 없이 빠르게 읽어 와야할 때, 사용할 수 있습니다.

Redis는 Blockong Queue 또는 Stack이 될 수도 있고, Publish-Subscribe 시스템이 될 수도 있습니다. 광범위한 클라이언트 라이브러리를 갖추고 있어 많은 프로그래밍 언어를 지원합니다. Redis는 거대한 맵(Map) 데이터 저장소입니다. Key와 value가 매핑된 단순한 맵 데이터 저장소로서 데이터를 Redis에 쉽고 편하게 읽고 쓸 수 있습니다. 장점은 익히기 쉽고 직관적인 데 있고 단점은 Key-value 형태로 저장된 데이터를 레디스 자체내에서 처리하는 것이 어렵다는 점입니다.

Redis는 메모리에 상주하지만, 데이터를 디스크에 쓰는것도 가능합니다.

2019.0919 현재 stable 버전은 5.0.5 버전이며 Docker 컨테이너로도 제공이됩니다.

**Redis 설치**

1. Docker를 이용

Host 파티션에 데이터 저장소를 두고 싶을 경우

```bash
$ docker run --name <some-redis> -d -v </your/dir>:/data redis redis-server --appendonly yes
```

데이터 컨테이너에 저장소를 두고 싶은 경우

```bash
$ docker run --name <some-redis> -d --volumes-from <some-volume-container> redis redis-server --appendonly yes
```

appendonly yes 옵션은 AOF방식으로 데이터를 저장(참고:[Redis Persistence Introduction](https://redis.io/topics/persistence))하겠다는 의미입니다. 데이터는 기본적으로 /data에 저장되며 외부에서 해당 폴더를 공유함으로써 해당 컨테이너를 지우고 새로 만들어도 해당 volume을 참고하게 하면 동일한 데이터를 유지 할 수 있습니다.

Docker에서 cli로 접근하기

```bash
docker run -it --link some-redis:redis --rm redis redis-cli -h redis -p 6379
```

2. 패키지 설치

Redis 공홈에서 내려받아 설치 합니다.

```bash
$ yum install -y gcc
$ wget http://download.redis.io/releases/redis-5.0.5.tar.gz
$ tar xzf redis-5.0.5.tar.gz
$ cd redis-5.0.5
$ cd deps
$ make hiredis jemalloc linenoise lua
$ cd ..
$ make
```

redis 실행

```bash
root@testdb01:~/redis-5.0.5]# src/redis-server
```

기본적으로 Redis는 백그라운드에서 실행되지 않습니다… 백그라운드에서 실행하거나, 다른 창을 이용해 접속해 봅니다.

```bash
root@testdb01:~/redis-5.0.5]# src/redis-server&
[1] 1455

root@testdb01:~/redis-5.0.5]# ps -ef | grep redis
root      1455 30483  0 06:23 pts/1    00:00:00 src/redis-server *:6379
```

접속해서 잘 되나 실행 봅니다.

```bash
root@testdb01:~/redis-5.0.5]# src/redis-cli
127.0.0.1:6379> ping
pong
127.0.0.1:6379> set foo bar
OK
127.0.0.1:6379> get foo
"bar"
127.0.0.1:6379>
```

정상 구동이 되어 있으면 ping 이라고 쳤을때 pong이 출력됩니다.
