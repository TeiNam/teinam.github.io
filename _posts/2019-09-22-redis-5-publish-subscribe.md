---
date: 2019-09-22 22:17:59 +0900
title: "Redis #.5 Publish & Subscribe"
category: redis
excerpt: "Redis의 Pub/Sub는 채널 기반 메시징 시스템입니다. 구독자가 채널을 구독하면, 발행자가 메시지를 보낼 때마다 실시간으로 받습니다. 메시지는 영속되지 않으므로 알림이나 이벤트 전파에 적합합니다."
updated: 2026-09-20
---

## Publish & Subscribe

유투브 같은 사이트에서 내가 누군가의 영상을 구독했을 때, 새 영상이 올라오면 유투브는 자동으로 구독자들에게 발행자의 업데이트 소식을 알려줍니다. 레디스로 이런 기능 구현이 가능합니다. 구독자에게 SUBSCRIBE 설정을 하면, 레디스는 구독자의 CLI를 블록킹하게 되고, 발행자가 값을 입력했을 때, 구독자의 창에 메시지를 출력합니다. 이 기능으로 다양한 알림 서비스를 만들 수 있습니다.

구독자 #.1

```bash
127.0.0.1:6379> SUBSCRIBE newupdate
Reading messages... (press Ctrl-C to quit)
1) "subscribe"
2) "newupdate"
3) (integer) 1
```

구독자 #.2

```bash
127.0.0.1:6379> SUBSCRIBE newupdate
Reading messages... (press Ctrl-C to quit)
1) "subscribe"
2) "newupdate"
3) (integer) 1
```

세 개의 창을 띄우고 두 개의 창에서 SUBSCRIBE 명령으로 Key를 지정합니다.

발행자

```bash
127.0.0.1:6379> PUBLISH newupdate "new blu-ray update"
(integer) 2
127.0.0.1:6379> PUBLISH newupdate "IRON MAN 3"
(integer) 2
127.0.0.1:6379> PUBLISH newupdate "EXIT"
(integer) 2
127.0.0.1:6379>
```

PUBLISH 명령으로 key값을 업데이트하면, 구독자의 창에서 메시지가 자동으로 출력됩니다.

```bash
127.0.0.1:6379> SUBSCRIBE newupdate
Reading messages... (press Ctrl-C to quit)
1) "subscribe"
2) "newupdate"
3) (integer) 1
1) "message"
2) "newupdate"
3) "new blu-ray update"
1) "message"
2) "newupdate"
3) "IRON MAN 3"
1) "message"
2) "newupdate"
3) "EXIT"
```

여전히 CLI는 블록킹 되어 있지만, 발행자의 메시지를 출력합니다.

구독자 클라이언트에서 `UNSUBSCRIBE` 명령을 사용하면 구독 채널이 해지됩니다. 채널을 지정하지 않고 `UNSUBSCRIBE`를 실행하면 모든 채널이 해지됩니다. Redis CLI에서는 Ctrl-C로 빠져나올 수 있습니다.

## 주의사항

Pub/Sub 메시지는 **영속되지 않습니다**. 발행된 메시지는 현재 구독 중인 클라이언트에게만 전달되며, 그 순간 연결이 끊기거나 구독하지 않은 클라이언트는 메시지를 받을 수 없습니다. 메시지를 저장해 두었다가 나중에 읽어야 한다면 Redis Streams(5.0 이후)를 고려하십시오.

## Sharded Pub/Sub (7.0 이후)

Redis 7.0부터는 클러스터 환경에서 효율적인 **Sharded Pub/Sub**를 지원합니다. `SSUBSCRIBE`/`SPUBLISH`/`SUNSUBSCRIBE` 명령을 사용하며, 채널이 슬롯에 할당되어 해당 슬롯을 담당하는 노드에만 메시지가 전달됩니다. 기존 `SUBSCRIBE`/`PUBLISH`는 클러스터의 모든 노드에 메시지를 전파하므로, 클러스터 규모가 크면 Sharded Pub/Sub가 더 효율적입니다.
