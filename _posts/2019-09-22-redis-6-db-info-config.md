---
date: 2019-09-22 22:52:10 +0900
title: "Redis #.6 Redis DB 정보 조회 및 환경설정"
category: redis
excerpt: "Redis DB 정보 조회 Database에 대한 정보를 조회할 필요가 있을 때가 있습니다. INFO 명령을 이용하면 Redis 서버에 대한 정보 조회를 할 수가 있습니다. 127.0.0.1:6379> info # Server redis_version:5.0.5 redis_git_…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 현재 `redis.conf` 기본값과 여러 항목이 어긋납니다: loglevel 기본값은 verbose 가 아니라 `notice`, `databases 16` 은 0~15 총 16개(17개가 아님), maxclients 기본값은 1024 가 아니라 10000, maxmemory-policy 기본값은 volatile-lru 가 아니라 `noeviction` 이며 LFU(4.0)·LRM(8.6) 정책이 추가되었습니다. 또한 `slaveof`/`slave-serve-stale-data`/`slave-read-only`/`repl-ping-slave-period` 는 Redis 5.0 부터 `replicaof`/`replica-*` 로 바뀌었고, `rename-command` 는 redis.conf 에서 DEPRECATED 로 표시되어 Redis 6 이후 ACL(`ACL SETUSER`)로, `requirepass` 단독 인증도 ACL 사용자로 대체하는 것이 권장됩니다. INFO 출력 예시도 5.0.5 기준이라 8.x 필드와 다릅니다.

![Redis 로고](/assets/img/wp/2019/09/redis.png)

## Redis DB 정보 조회

Database에 대한 정보를 조회해야 할 때가 있습니다.

INFO 명령으로 Redis 서버에 대한 정보를 조회합니다.

```text
127.0.0.1:6379> info
# Server
redis_version:5.0.5
redis_git_sha1:00000000
redis_git_dirty:0
redis_build_id:281ad9c0dbce71d8
redis_mode:standalone
os:Linux 3.10.0-862.14.4.el7.x86_64 x86_64
arch_bits:64
multiplexing_api:epoll
atomicvar_api:atomic-builtin
gcc_version:4.8.5
process_id:1455
run_id:b503d0370d0654023a4787539a0f66de8ca6f0e1
tcp_port:6379
uptime_in_seconds:284205
uptime_in_days:3
hz:10
configured_hz:10
lru_clock:8877332
executable:/root/redis-5.0.5/src/redis-server
config_file:

# Clients
connected_clients:2
client_recent_max_input_buffer:2
client_recent_max_output_buffer:0
blocked_clients:0

# Memory
used_memory:877296
used_memory_human:856.73K
used_memory_rss:10346496
used_memory_rss_human:9.87M
used_memory_peak:4953920
used_memory_peak_human:4.72M
used_memory_peak_perc:17.71%
used_memory_overhead:858592
used_memory_startup:791248
used_memory_dataset:18704
used_memory_dataset_perc:21.74%
allocator_allocated:1096584
allocator_active:1310720
allocator_resident:5218304
total_system_memory:8201920512
total_system_memory_human:7.64G
used_memory_lua:37888
used_memory_lua_human:37.00K
used_memory_scripts:0
used_memory_scripts_human:0B
number_of_cached_scripts:0
maxmemory:0
maxmemory_human:0B
maxmemory_policy:noeviction
allocator_frag_ratio:1.20
allocator_frag_bytes:214136
allocator_rss_ratio:3.98
allocator_rss_bytes:3907584
rss_overhead_ratio:1.98
rss_overhead_bytes:5128192
mem_fragmentation_ratio:12.39
mem_fragmentation_bytes:9511184
mem_not_counted_for_evict:0
mem_replication_backlog:0
mem_clients_slaves:0
mem_clients_normal:66616
mem_aof_buffer:0
mem_allocator:jemalloc-5.1.0
active_defrag_running:0
lazyfree_pending_objects:0

# Persistence
loading:0
rdb_changes_since_last_save:2
rdb_bgsave_in_progress:0
rdb_last_save_time:1569157728
rdb_last_bgsave_status:ok
rdb_last_bgsave_time_sec:0
rdb_current_bgsave_time_sec:-1
rdb_last_cow_size:2437120
aof_enabled:0
aof_rewrite_in_progress:0
aof_rewrite_scheduled:0
aof_last_rewrite_time_sec:-1
aof_current_rewrite_time_sec:-1
aof_last_bgrewrite_status:ok
aof_last_write_status:ok
aof_last_cow_size:0

# Stats
total_connections_received:7
total_commands_processed:128
instantaneous_ops_per_sec:0
total_net_input_bytes:5069
total_net_output_bytes:86484
instantaneous_input_kbps:0.00
instantaneous_output_kbps:0.00
rejected_connections:0
sync_full:0
sync_partial_ok:0
sync_partial_err:0
expired_keys:3
expired_stale_perc:0.00
expired_time_cap_reached_count:0
evicted_keys:0
keyspace_hits:63
keyspace_misses:16
pubsub_channels:1
pubsub_patterns:0
latest_fork_usec:781
migrate_cached_sockets:0
slave_expires_tracked_keys:0
active_defrag_hits:0
active_defrag_misses:0
active_defrag_key_hits:0
active_defrag_key_misses:0

# Replication
role:master
connected_slaves:0
master_replid:ee72bf1b029ad376440a5b7b7e6ce86db7ee7ca2
master_replid2:0000000000000000000000000000000000000000
master_repl_offset:0
second_repl_offset:-1
repl_backlog_active:0
repl_backlog_size:1048576
repl_backlog_first_byte_offset:0
repl_backlog_histlen:0

# CPU
used_cpu_sys:166.394164
used_cpu_user:195.776503
used_cpu_sys_children:0.025689
used_cpu_user_children:0.002484

# Cluster
cluster_enabled:0

# Keyspace
db0:keys=15,expires=0,avg_ttl=0
```

Redis의 서버·메모리·복제·클러스터 정보를 확인할 수 있습니다. 지속성(Durability), master-slave, 클러스터 정보 등 위 정보가 담겨 있습니다.

## Redis의 기본 구동 옵션

패키지로 설치하면 Redis의 환경 설정파일(redis.conf)은 /root/redis-5.0.5/redis.conf에 위치합니다. Docker는 /etc/redis 밑에 있을수 있습니다. 없다면 `find` 명령으로 찾아봅니다.

- **deamonize** : Redis는 기본적으로 Foregraound 구동을 원칙으로 합니다. 환경 설정 파일의 daemonize 의 Default 값이 no 이기 때문입니다. daemonize 설정을 YES로 바꿔주면 기본적으로 백그라운드에서 실행하게 됩니다.
- **port :** Redisdml 기본 port 값은 6379 입니다. 원하는 Port로 변경하여 사용이 가능합니다.
- **loglevel :** loglevel의 Default 값은 verbose입니다. 실무에서는 notice 또는 warning으로 설정하고 사용하는 편입니다.
- **logfile** : 기본값은 stdout 입니다. 이것은 Foreground로 Redis가 실행 되었을 때, 콘솔에 화면에 log를 출력합니다. daemonize값을 yes로 설정하여 백그라운드 상태로 전환해서 운영하게 되면 파일로 내보내는 것이 좋습니다.
- **database :** 사용할 만큼의 Database 개수를 지정해줍니다. Redis의 Database는 즉, Namespace와 동일하다고 했습니다. 하나의 서버에서 사용할 Namespace의 갯수를 지정해주는 옵션입니다. 16으로 되어 있으면 0~16까지 17개의 Namespace를 사용할 수 있습니다. 0은 Default 네임 스페이스입니다.

## Redis 데이터의 지속성 (RDB 설정)

Redis는 메인 메모리에 상주를 하지만, Memcached와 가장 큰 차이가 바로 데이터를 디스크에 기록할 수 있다는 점입니다. 물론 Redis를 캐시로만 사용한다면 디스크에 기록하는 것이 별로 필요 없을수도 있습니다. 왜냐하면 지속성을 위해 디스크에 기록을 하게되면, 지연시간이 증가하기 때문입니다. 즉, Redis의 가장 큰 장점인 빠르다를 포기하는 것입니다. 하지만 NoSQL DB로 데이터를 저장하길 원한다면 SAVE 명령으로 디스크에 기록을 할 수 있습니다.

- **save:**

  
```ini
save 60 10000 

save 900 1
```

  첫번째 옵션은 10000개의 키가 변경이 되면, 60초 이내에 save를 하라는 의미입니다. 두번째 옵션은 어떤 키값이 1개라도 변경이 된다면, 15분 이내에 save하라는 뜻입니다. save 라인은 원하는대로 변경해서 사용할 수가 있습니다. save "" 이런 식으로 빈 문자열을 설정하면 스냅샷 이벤트를 사용하지 않습니다. save 300 10   save 900 1 이런 식으로 여러개 설정 시에는 그 중 하나라도 만족하면 스냅샷 이벤트가 동작합니다.
- **stop-writes-on-bgsave-error** : 스냅샷 요청에 의해서 dump.rdb에 내용을 저장하는 중에 쓰기 오류가 발생해도, 쓰기 요청을 에러 없이 처리 하고 싶다면 이 파라미터를 NO로 설정하면 됩니다.  No로 설정 할 경우 쓰기 오류가 발생 하는것을 감지 할 수 없으므로 yes로 사용하는 것이 좋습니다.
- **rdbcompression** : 스냅샷 파일을 저장할때 파일의 압축 여부를 설정합니다. 압축을 하게 되면 dump.rdb 파일의 크기는 주어 들지만, 작업시에 CPU 사용률은 높아 집니다.
- **rdbchecksum** : 스냅 샷 파일을 저장할때 파일의 정합성을 검증하기 위한 체크섬의 사용 여부를 설정합니다. 이 값을 yes로 할 경우 스냅샷 파일을 만들거나, 읽을 때 10% 정도의 성능 하락이 있습니다.
- **dir** : Redis의 작업 디렉토리를 지정합니다. Redis가 생성하는 파일의 기본 위치 사용 되며,. dump.rdb, aof 파일, 로그파일 등이 저장됩니다.
- **dbfilename** : 스냅샷 파일의 파일명을 지정하는 설정입니다.. 기본은 dump.rdb로 되어 있으나, <서비스포트 또는 노드이름>.rdb 같은 형식으로 사용을 하고자 할 경우 지정해 주면 됩니다.

## AOF 설정

Redis에는 append-only 라는 옵션이 존재 합니다. HBase의 WAL과 같은 기능을 하는데, appendonly.conf 파일을 통해 입력되는 모든 키값이 디스크에 쓰기 명령으로 저장되어 기록을 유지합니다. 즉, NoSQL 서버로, 데이터를 지속적으로 보관하기를 원한다면 redis.conf 파일에 appendonly yes 옵션을 추가해야 합니다.

- appendonly : 기본값은 No 입니다.

  
```ini
appendonly yes
```

> **주의:** appendonly 옵션을 쓰면 Redis 자체가 느려지기 때문에 특별히 사용하지 않는것이 좋습니다.

- **appendfsync** : 데이터를 dump.rdb 또는 AOF 파일에 쓸 때, fsync() 함수를 이용해서 버퍼의 내용을 디스크에 즉시 기록하도록 할지 여부를 결정합니다. 쓰기가 필요할 때마다 fsync()함수가 호출되면 데이터를 유실 할 위험은 줄어 들지만, 상대적으로 파일 기록 성능이 저하 될 수 있습니다. appendfsync의 값을 주고 사용하느니 아예 Append-Only 옵션을 사용하지 않는 것이 좋습니다.
  - **no** : fsync() 함수를 호출 하지 않습니다. OS로 쓰기 명령을 전달하고, O/S에서 알아서 파일에 저장하도록 한다. 가장 빠른 성능을 제공하지만 , O/S에 쓰기 명령을 전달하고 다 쓰기 전에 서버에 문제가 생기면 쓰여지지 않은 부분에 대한 손실이 발생 할 수 있습니다.
  - **always** : 각 명령어를 AOF 파일에 기록하고 나서 항상 fsync()함수를 호출합니다. 가장 느린 성능을 제공하지만 데이터 안정성 측면에서는 가장 좋습니다.
  - **everysec** : 매 1초마다 fsync() 함수를 호출합니다. 성능과 안정성의 타협점으로 볼 수 있으며, Redis의 기본 설정입니다. 속도는 조금 빠르지만, 장애 발생시 마지막 1초의 데이터를 유실할 수 있습니다.
- **appendfilename** : AOF파일명을 지정합니다. 필요시 경로까지 설정해 줄 수 있습니다. 해당 위치에 파일이 없거나 생성 실패 시에 AOF 파일이 없다는 오류 메시지를 출력하고 인스턴스 시작이 실패 합니다.
- **no-appendfsync-on-rewrite** : appendfsync 값이 always나 everysec이면, 대량의 AOF 또는 스냅샷을 쓸 때, 디스크의 성능에 따라서 몇 초에서 몇 분이 걸려서 성능 이슈가 발생 할 수 있습니다. 이럴 경우 fsync() 함수 호출을 하지 않게 합니다. NO로 설정하면 기존대로 fsync()함수를 호출하고, YES로 설정해야 fsync()를 사용하지 않습니다.

## Replication 설정

Master 노드에서는 requirepass부분만 설정하고, 아래의 부분은 slave에서 설정합니다.

- **slaveof** : master 노드의 네트워크 위치를 지정합니다. slaveof <master 노드의 IP> <master 노드의 포트>
- **masterauth** : master 노드가 requirepass 설정에 의해서 패스워드로 보호되고 있을 때, slave 노드에서 설정하며, master 노드의 requirepass 설정에 지정된 패스워드를 설정합니다.
- **slave-serve-stale-data** : slave 노드에서 master 노드에 대한 네트워크 연결이 끊어지거나, master 노드의 전체 데이터를 복제 중일 때 slave 노드로 들어오는 요청을 어떻게 처리 할지 결정합니다.
  - yes : slave 노드에서 읽거나 쓰기 요청을 모두 처리 함.
  - no : 에러 메시지를 전달 함.
- **slave-read-only** : slave를 read-only로 운영합니다. 쓰기 명령만 에러가 발생하고, slaveof나 config 같은 관리자 명령은 여전히 사용할 수 있습니다.
- **repl-ping-slave-period** : slave 노드에서 설정 된 간격으로 master 노드에 ping 명령을 수행합니다. 기본 간격은 10초입니다.

## 보안

> **주의:** Redis 자체적인 보안은 그리 좋은 편은 아니기에 좋은 방화벽 정책과, SSH 접속 정책을 제한하는 것이 더 좋습니다.

- **rename-command :** Redis는 일반적인 명령어를 원하는 대로 변경하는 기능이 있습니다. 만약에 Redis 전체를 삭제하는 FLUSHALL 명령어를 사용하지 못하게 하고 싶다면,

  
```ini
rename-command FLUSHALL cz231masdm23adlasdmafsfww221
```

  이렇게 변경할 수 있으며, 변경하고 나면 누군가 FLUSHALL 명령을 사용했을때 없는 명령어라고 표기되며 에러가 발생합니다. cz231masdm23adlasdmafsfww221이라는 명령어로 변경했기 때문입니다. 커맨드 변경을 master에만 적용하면 복제가 실패 할 수도 있으니 slave에도 반드시 적용 해줘야 합니다.
- **requirepass** : Redis 서버에 접속하기 위한 패스워드를 설정합니다. 클라이언트는 requirement에 설정 한 값을 이용하여 인증 한 후에 Redis 명령을 사용 할 수 있습니다. slave가 복제 요청을 할때도 사용됩니다.

## 제한 설정

Redis 서버가 사용할 수 있는 최대값들 설정합니다. 주로 메모리에 관한 설정들이며 복제나 스냅샷 사용 시 주의 해야합니다.

- **maxclient** : Redis 인스턴스에 접속 할 수 있는 클라이언트 수를 지정합니다. -1은 최대값 (4294967295)이 설정 되며, 설정하지 않으면 기본 값으로 1024를 갖습니다. O/S의 ulimit 값과도 연관이 있기 때문에 ulimit 제한도 같이 확인해서 변경해줘야 합니다. (/etc/limits.conf , /etc/security/limits.conf )
- **maxmemory** : Redis 인스턴스가 데이터를 저장하기 위하여 사용할 메모리 크기를 지정합니다. 이 값보다 많은 데이터를 저장하면 maxmemory-policy 설정에 지정된 값에 따라서 Redis의 동작이 달라집니다.
- **maxmemory-policy** : Redis에서 저장한 데이터가 maxmemory를 넘으면, 메모리 정리를 어떻게 할지에 대한 정책을 지정합니다.
  - volatile-lru : (기본값) 만기시각이 설정된 key 들 중에서 LRU algorithm 에 의해 key 를 골라 삭제
  - allkeys-lru : LRU algorithm 에 의해 key 를 골라 삭제
  - volatile-random : 만기시각이 설정된 key 들 중에서 랜덤하게 key 를 골라 삭제
  - allkeys-random : 랜덤하게 key 를 골라 삭제
  - volatile-ttl : 만기시각이 설정된 key 들 중에서 만기시각이 가장 가까운 key 를 골라 삭제
  - noeviction : 어떤 key 도 삭제하지 않고 error on write operations 를 돌려준다.
- **maxmemory-samples** : maxmemory-policy를 적용하기 위해서 Redis가 조회 할 키의 개수를 지정합니다. 전체 키를 읽어서 삭제 policy에 해당하는 키를 찾는게 아니라, 지정한 값 만큼의 임의의 키를 읽어서 그 중에서 삭제 대상인 키가 있는지 확인합니다. 이때 임의로 읽어 들일 키의 개수를 지정합니다.

## Lua 설정

Redis에서 Lua script를 수행 할 수 있는데, Redis는 단일 스레드로 동작 되기 때문에, Lua script가 돌아가는 동안 다른 명령을 처리 할 수 없게 되어(원자적), 다른 클라이언트의 응답시간이 증가 하게 됩니다. 그래서 Redis에서 Lua script에 대해서 설정 할 수 있는 부분은 실행 시간을 제어 하는 부분 뿐입니다. Lua script 수행은 eval 명령을 이용합니다.

## Slow query 설정

Redis의 데이터 처리는 모두 Redis 명령어에 기반을 합니다. 즉, Redis에서의 쿼리는 데이터 처리 명령어와 같습니다. slow query는 느리게 수행되는 명령어를 뜻합니다. 쿼리 수행 시간이란 Redis 명령어가 인스턴스까지 도착 한 후 부터 명령을 처리한 결과를 돌려 주기까지의 시간을 말하는데 순수하게 데이터를 처리한 시간만을 나타냅니다. 보통 sort를 하는 zunionstore, zinterstore, zrangebyscore 같은 명령어들이 주로 slow query에 나타나며, slow query는 해당 명령어의 사용을 다른 명령어로 바꾸거나, 사용 빈도를 줄이도록 권고합니다.

- **slowlog-slower-than** : Logging을 할 slow query 수행 시간을 지정합니다. 마이크로 초(1/1000000) , 0은 사용하지 않음. 기본은 10000. 지정한 시간보다 오래 걸리는 명령들은 slowlog-max-len 설정에 지정된 개수만큼 메모리에 저장되며, Redis가 재기동되면 slowlog는 삭제됩니다. slowlog-max-len값에 지정된 개수보다 많은 slowlog가 생성되면 가장 오래된 slowlog를 제거하고 새로운 slowlog를 추가합니다.
- **slowlog-max-len** : 최대 몇개의 slowlog를 저장할 지 지정합니다. -1이면 4294967295의 값이 지정되고, 기본값은 128입니다.

슬로우 로그를 조회하는 명령어는 `slowlog` 명령을 사용합니다.

```text
27.0.0.1:6379> slowlog len    <-- 슬로우 로그 개수 카운팅
(integer) 30
127.0.0.1:6379> slowlog get    <-- 슬로우 로그 확인
 1) 1) (integer) 29
    2) (integer) 1513679235
    3) (integer) 109885
    4) 1) "flushall"
    5) "127.0.0.1:50060"
    6) ""
127.0.0.1:6379> slowlog reset  <-- 슬로우 로그 초기화
OK
127.0.0.1:6379> slowlog len
(integer) 0
```
