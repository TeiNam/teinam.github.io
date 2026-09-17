---
date: 2019-09-22 22:17:59 +0900
title: "Redis #.5 Publish & Subscribe"
category: redis
excerpt: "Publish & Subscribe 유투브 같은 사이트에서 내가 누군가의 영상을 구독했을때, 새 영상이 올라오면 유투브는 자동으로 구독자들에게 발행자의 업데이트 소식을 알려줍니다. 레디스로 이런 기능 구현이 가능합니다. 구독자에게 SUBSCRIBE 설정을 하면, 레디스는 구독자의…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — SUBSCRIBE/PUBLISH/UNSUBSCRIBE 동작과 CLI 블로킹 설명은 2026년 9월 기준으로도 그대로 맞습니다. 다만 Redis 7.0 부터 클러스터 환경용 샤디드 Pub/Sub(`SSUBSCRIBE`/`SPUBLISH`/`SUNSUBSCRIBE`)이 추가되었고, 기존 Pub/Sub 은 메시지를 보관하지 않으므로 알림 유실이 곤란한 경우에는 Stream(5.0 이후)을 함께 검토해야 합니다.

![Redis 로고](/assets/img/wp/2019/09/redis.png)

**Publish & Subscribe**

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

구독자의 클라이언트에서 UNSUBSCRIBE 명령을 사용하면 클라이언트에서의 구독 채널이 해지됩니다. 채널을 주지않고 UNSUBSCRIBE 명령을 이용하면 모든 채널이 끊어집니다. Redis의 CLI 안에서는 Ctrl-C 명령으로 끊을 수 있습니다.
