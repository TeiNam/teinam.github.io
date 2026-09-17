---
date: 2019-09-22 23:12:44 +0900
title: "Redis #.7 HA구성하기 (Master-Slave)"
category: redis
excerpt: "HA구성하기 (Master-Slave) Redis도 다른 Database와 마찬가지로 replication 기능을 지원합니다. redis.conf 파일에 slaveof 파일에 Master 서버의 IP와 Port를 입력해준뒤 구동만 해주면 됩니다. vi /root/redis-5.0.…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Redis 5 부터 `slaveof` 는 폐기되고 `replicaof` 로 대체되었으며 공식 문서 용어도 master/slave 에서 primary/replica 로 바뀌었으므로 설정 예시(`slaveof <master ip> <port>`)를 `replicaof` 로 읽어야 합니다. 또한 이 글의 구성은 복제만 걸어둔 상태라 자동 페일오버가 없으며, 비클러스터 Redis 의 HA 에는 Sentinel 인스턴스 3대 이상이 별도로 필요합니다.

![](/assets/img/wp/2019/09/redis.png)

**HA구성하기 (Master-Slave)**

Redis도 다른 Database와 마찬가지로 replication 기능을 지원합니다.

redis.conf 파일에

```bash
vi /root/redis-5.0.5/redis.conf

slaveof <master ip> <port>
```

slaveof 설정에 Master 서버의 IP와 Port를 입력한 뒤 구동하기만 하면 됩니다.

추가하고 구동하면

```bash
root@testdb01:~/redis-5.0.5]# src/redis-server redis-s1.conf 
16524:C 22 Sep 2019 14:08:08.264 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo
16524:C 22 Sep 2019 14:08:08.264 # Redis version=5.0.5, bits=64, commit=00000000, modified=0, pid=16524, just started
16524:C 22 Sep 2019 14:08:08.264 # Configuration loaded
                _._                                                  
           _.-``__ ''-._                                             
      _.-``    `.  `_.  ''-._           Redis 5.0.5 (00000000/0) 64 bit
  .-`` .-```.  ```\/    _.,_ ''-._                                   
 (    '      ,       .-`  | `,    )     Running in standalone mode
 |`-._`-...-` __...-.``-._|'` _.-'|     Port: 6380
 |    `-._   `._    /     _.-'    |     PID: 16524
  `-._    `-._  `-./  _.-'    _.-'                                   
 |`-._`-._    `-.__.-'    _.-'_.-'|                                  
 |    `-._`-._        _.-'_.-'    |           http://redis.io        
  `-._    `-._`-.__.-'_.-'    _.-'                                   
 |`-._`-._    `-.__.-'    _.-'_.-'|                                  
 |    `-._`-._        _.-'_.-'    |                                  
  `-._    `-._`-.__.-'_.-'    _.-'                                   
      `-._    `-.__.-'    _.-'                                       
          `-._        _.-'                                           
              `-.__.-'                                               

16524:S 22 Sep 2019 14:08:08.266 # Server initialized
16524:S 22 Sep 2019 14:08:08.266 # WARNING overcommit_memory is set to 0! Background save may fail under low memory condition. To fix this issue add 'vm.overcommit_memory = 1' to /etc/sysctl.conf and then reboot or run the command 'sysctl vm.overcommit_memory=1' for this to take effect.
16524:S 22 Sep 2019 14:08:08.266 # WARNING you have Transparent Huge Pages (THP) support enabled in your kernel. This will create latency and memory usage issues with Redis. To fix this issue run the command 'echo never > /sys/kernel/mm/transparent_hugepage/enabled' as root, and add it to your /etc/rc.local in order to retain the setting after a reboot. Redis must be restarted after THP is disabled.
16524:S 22 Sep 2019 14:08:08.267 * DB loaded from disk: 0.000 seconds
16524:S 22 Sep 2019 14:08:08.267 * Ready to accept connections
16524:S 22 Sep 2019 14:08:08.267 * Connecting to MASTER 127.0.0.1:6379
16524:S 22 Sep 2019 14:08:08.267 * MASTER <-> REPLICA sync started
16524:S 22 Sep 2019 14:08:08.267 * Non blocking connect for SYNC fired the event.
16524:S 22 Sep 2019 14:08:08.267 * Master replied to PING, replication can continue...
16524:S 22 Sep 2019 14:08:08.267 * Partial resynchronization not possible (no cached master)
16524:S 22 Sep 2019 14:08:08.269 * Full resync from master: c98bf814629d01e8a4d4e61aca11ad13dd221dbe:0
16524:S 22 Sep 2019 14:08:08.338 * MASTER <-> REPLICA sync: receiving 704 bytes from master
16524:S 22 Sep 2019 14:08:08.338 * MASTER <-> REPLICA sync: Flushing old data
16524:S 22 Sep 2019 14:08:08.338 * MASTER <-> REPLICA sync: Loading DB in memory
16524:S 22 Sep 2019 14:08:08.339 * MASTER <-> REPLICA sync: Finished with success
```

이런 식으로 Replica에 대한 정보가 구동할 때 보입니다.

Master에 키 값을 업데이트하면, Slave에서도 조회가 가능합니다.
