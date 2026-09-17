---
date: 2021-10-13 23:57:59 +0900
title: "Galera cluster for MySQL 8 – #.3 동기화 성능"
category: mysql
excerpt: "Galera cluster for MySQL 8 동기화 성능 Galera 매니저를 테스트 해보려고 했는데, 온프렘에서는 잘 안되더군요. 기존의 클러스터가 추가가 안되서 설치만하고 등록이 잘 안됐습니다. AWS에서는 Galera 매니저를 맨처음에 설치하고 매니저에서 Galera +…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — MySQL 8.0.25-wsrep + Galera 4.9, 2vCPU/4GB 환경의 sysbench 측정 기록이라 수치는 그 조합에서만 의미가 있다. 현재 MySQL 용 Galera 는 8.4.11-26.28 이고 2026-09-30 유지보수 종료가 공지되어 동일 조건 재현이 불가하다.

![MySQL 로고](/assets/img/wp/2019/04/mysql_PNG19.png)

## Galera cluster for MySQL 8 동기화 성능

> **전제:** 각 노드 2 vCPU, 4GB RAM

Galera 매니저를 테스트 해보려고 했는데, 온프렘에서는 잘 안되더군요. 기존의 클러스터가 추가가 안되서 설치만하고 등록이 잘 안됐습니다. AWS에서는 Galera 매니저를 맨처음에 설치하고 매니저에서 Galera + wrsep MySQL8 버전을 EC2로 배포가 가능한 것 같았습니다.

그럼 인스턴스당 30$로 잡아도, 매니저 포함 4대 구성에 120$를 내야하니… 돈이 흠… 그래서 매니저는 패스하고 Galera 클러스터를 이용한 양쪽 노드 동시 쓰기 테스트를 해봤습니다.

툴은 sysbench를 이용했구요.

- 각각 노드의 사양은 2 vCPU, RAM 4GB로 모두 동일
- SST Method = clone (State Snapshot Transfer)

### 1번, 3번 노드에서 Insert Test

1. 아무 노드 하나에서 한 번만 수행: sysbench 스키마 생성
2. sysbench 유저 생성 및 권한 부여
3. 유저 정보가 동기화될 때까지 대기 (다소 시간이 소요됨)

```sql
mysql> create database sysbench;
Query OK, 1 row affected (0.00 sec)

mysql> SET GLOBAL validate_password.policy=LOW;
Query OK, 0 rows affected (0.00 sec)

mysql> create user sysbench@'%' identified by 'sysbench';
Query OK, 0 rows affected (0.01 sec)

mysql> grant all on sysbench.* to sysbench@'%';
Query OK, 0 rows affected (0.01 sec)

mysql> ALTER USER sysbench@'%' IDENTIFIED WITH mysql_native_password BY 'sysbench';
Query OK, 0 rows affected (0.01 sec)

mysql> flush privileges;
Query OK, 0 rows affected (0.00 sec)
```

그리고 sysbench를 이용해 데이터 1개짜리 테이블 6개를 준비합니다.

```bash
$ sysbench --db-driver=mysql --mysql-host=192.168.254.145 --mysql-user=sysbench --mysql-password=sysbench --mysql-db=sysbench /usr/share/sysbench/oltp_insert.lua --table-size=1 --tables=6  --threads=128 prepare
```

테스트 내내 Threads는 128로 동일하게 줬습니다.

```bash
$ sysbench --db-driver=mysql --mysql-host=192.168.254.145 --mysql-user=sysbench --mysql-password=sysbench --mysql-db=sysbench /usr/share/sysbench/oltp_insert.lua --tables=6  --threads=128 --events=100000 --time=600 --report-interval=3 run
sysbench 1.0.20 (using bundled LuaJIT 2.1.0-beta2)

Running the test with following options:
Number of threads: 128
Report intermediate results every 3 second(s)
Initializing random number generator from current time


Initializing worker threads...

Threads started!

SQL statistics:
    queries performed:
        read:                            0
        write:                           100000
        other:                           0
        total:                           100000
    transactions:                        100000 (2103.44 per sec.)
    queries:                             100000 (2103.44 per sec.)
    ignored errors:                      0      (0.00 per sec.)
    reconnects:                          0      (0.00 per sec.)

General statistics:
    total time:                          47.5404s
    total number of events:              100000

Latency (ms):
         min:                                    2.57
         avg:                                   60.80
         max:                                  392.31
         95th percentile:                       99.33
         sum:                              6080447.29

Threads fairness:
    events (avg/stddev):           781.2500/4.68
    execution time (avg/stddev):   47.5035/0.02
```

처음에는 1번 노드에만 Insert를 진행합니다. 10만건을 처리하는데 약 47초, TPS(Transactions Per Second, 초당 트랜잭션 수)는 2103.44입니다. Threads 128에서 평균 초당 2103건의 Insert 작업을 처리할 수 있는 사양입니다.

그 다음에 1,3번 노드에서 Insert를 하고 2번 노드에서 데이터 카운트를 해봅니다.

1번 노드 sysbench에서는 60만건을 600초 동안 넣는 작업을 했습니다.

```bash
$ sysbench --db-driver=mysql --mysql-host=192.168.254.145 --mysql-user=sysbench --mysql-password=sysbench --mysql-db=sysbench /usr/share/sysbench/oltp_insert.lua --tables=6  --threads=128 --events=600000 --time=600 --report-interval=3 run
sysbench 1.0.20 (using bundled LuaJIT 2.1.0-beta2)

Running the test with following options:
Number of threads: 128
Report intermediate results every 3 second(s)
Initializing random number generator from current time


Initializing worker threads...

Threads started!

SQL statistics:
    queries performed:
        read:                            0
        write:                           585346
        other:                           0
        total:                           585346
    transactions:                        585346 (975.52 per sec.)
    queries:                             585346 (975.52 per sec.)
    ignored errors:                      0      (0.00 per sec.)
    reconnects:                          0      (0.00 per sec.)

General statistics:
    total time:                          600.0371s
    total number of events:              585346

Latency (ms):
         min:                                    8.90
         avg:                                  131.20
         max:                                 1780.14
         95th percentile:                      282.25
         sum:                             76799974.71

Threads fairness:
    events (avg/stddev):           4573.0156/8.86
    execution time (avg/stddev):   599.9998/0.01
```

600초 동안 585346건 밖에 처리를 못했으며, 테이블 6개에 58만건이 골고루 나눠져서 들어갔습니다.

3번 노드 sysbench 동시에 10만건을 밀어넣었고 190초 정도가 걸렸습니다.

```bash
$ sysbench --db-driver=mysql --mysql-host=192.168.254.147 --mysql-user=sysbench --mysql-password=sysbench --mysql-db=sysbench /usr/share/sysbench/oltp_insert.lua --tables=6  --threads=128 --events=100000 --time=600 --report-interval=3 run
sysbench 1.0.20 (using bundled LuaJIT 2.1.0-beta2)

Running the test with following options:
Number of threads: 128
Report intermediate results every 3 second(s)
Initializing random number generator from current time


Initializing worker threads...

Threads started!


SQL statistics:
    queries performed:
        read:                            0
        write:                           100000
        other:                           0
        total:                           100000
    transactions:                        100000 (524.30 per sec.)
    queries:                             100000 (524.30 per sec.)
    ignored errors:                      0      (0.00 per sec.)
    reconnects:                          0      (0.00 per sec.)

General statistics:
    total time:                          190.7281s
    total number of events:              100000

Latency (ms):
         min:                                    2.70
         avg:                                  244.08
         max:                                12086.91
         95th percentile:                     1618.78
         sum:                             24407843.37

Threads fairness:
    events (avg/stddev):           781.2500/5.49
    execution time (avg/stddev):   190.6863/0.02
```

하나의 노드에서만 Insert할 때에 비해 TPS가 절반 이상 떨어졌습니다. 60만건을 처리한 1번 노드는 절반 가량 줄었고, 10만건을 처리한 3번 노드는 1/4수준으로 떨어졌습니다. 각각의 노드에 변경사항을 전파하는 동기화 작업이 동시에 이루어지기 때문에 그런것 같습니다.

```sql
mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|    99201 |
+----------+
1 row in set (0.01 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|    99601 |
+----------+
1 row in set (0.01 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|    99962 |
+----------+
1 row in set (0.01 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   100367 |
+----------+
1 row in set (0.03 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   100860 |
+----------+
1 row in set (0.02 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   126752 |
+----------+
1 row in set (0.02 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   130235 |
+----------+
1 row in set (0.01 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   133997 |
+----------+
1 row in set (0.01 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   136961 |
+----------+
1 row in set (0.01 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   138057 |
+----------+
1 row in set (0.01 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   139174 |
+----------+
1 row in set (0.02 sec)

mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   145670 |
+----------+
1 row in set (0.01 sec)
```

1,3번 노드에서 Insert를 하고 있지만 2번 노드에서도 데이터 올라가는게 실시간으로 보입니다.

그리고 끝날때 쯤에 3개의 노드에서 동시에 count 집계를 해보았습니다.

1번 노드

```sql
mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   151621 |
+----------+
1 row in set (0.01 sec)
```

2번 노드

```sql
mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   150274 |
+----------+
1 row in set (0.01 sec)
```

3번 노드

```sql
mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   150875 |
+----------+
1 row in set (0.02 sec)
```

동시에 3개의 세션에 카운트를 날리면 엇비슷한 갯수가 나옵니다. 어느 한쪽이 먼저 치고 나가지는 않고, 각각의 노드의 카운트가 엎치락 뒤치락 하면서 올라갑니다.

최종 Insert 작업이 끝나고 3개의 노드에서 동시에 조회를 해보면 모두 값이 같습니다. 최종값이 나오는 시간이 거의 비슷합니다.

```sql
mysql> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
|   220245 |
+----------+
1 row in set (0.01 sec)
```

각각의 노드에 데이터를 전파해 동기화 하는 속도가 예상보다 훨씬 빨라서 놀랐습니다.  이 정도 동기화 속도면 대량의 Insert 작업을 제외하고, 일반적인 web 데이터를 10~20건씩 받는 트랜잭션을 처리하는데 있어서는 크게 문제가 되지 않을것 같습니다.

```sql
mysql> show variables like 'wsrep_local_gtid';
+------------------+----------------------------------------------+
| Variable_name    | Value                                        |
+------------------+----------------------------------------------+
| wsrep_local_gtid | bb73b061-1a12-11ec-bd41-2a985fed7008:1424124 |
+------------------+----------------------------------------------+
```

GTID를 체크해보면 모든 노드에서 동일합니다.

### OLTP 성능 테스트

덤으로 OLTP 성능 테스트도 진행해보았습니다.

시나리오는 테이블 데이터 20만건에 대해 10만건의 이벤트 발생, Threads는 128로 동일합니다.

```bash
sysbench --db-driver=mysql --mysql-host=192.168.254.145 --mysql-user=sysbench --mysql-password=sysbench --mysql-db=sysbench /usr/share/sysbench/oltp_read_write.lua --table-size=200000 --tables=6  --threads=64 --events=100000 --time=600 --report-interval=3 run
sysbench 1.0.20 (using bundled LuaJIT 2.1.0-beta2)

Running the test with following options:
Number of threads: 64
Report intermediate results every 3 second(s)
Initializing random number generator from current time


Initializing worker threads...

Threads started!

SQL statistics:
    queries performed:
        read:                            1400056
        write:                           343121
        other:                           256895
        total:                           2000072
    transactions:                        100000 (662.02 per sec.)
    queries:                             2000072 (13240.84 per sec.)
    ignored errors:                      4      (0.03 per sec.)
    reconnects:                          0      (0.00 per sec.)

General statistics:
    total time:                          151.0526s
    total number of events:              100000

Latency (ms):
         min:                                    7.68
         avg:                                   96.64
         max:                                 2192.39
         95th percentile:                      186.54
         sum:                              9664099.30

Threads fairness:
    events (avg/stddev):           1562.5000/24.06
    execution time (avg/stddev):   151.0016/0.02
```

QPS는 13240.84, TPS는 662.02, 처리시간은 약 151초. VM 환경이지만 저사양에서도 꽤나 괜찮은 성능인 것 같습니다. 트래픽이 엄청 몰리지 않는 DB라고 하면 Galera 클러스터를 이용해 멀티마스터 환경을 구축하는것도 나쁘지 않은것 같습니다.

### 결론

Galera Cluster 쓸만한데!! 라는 생각이 들었습니다. 저사양에서 60만+10만건을 처리하면서도 데이터 밀림 현상이 발생하지 않았습니다.

뭐 환경에 따라 다르긴 하겠지만 전에 MariaDB에서 테스트 했을때보다 MySQL8이 Galera와의 호흡이 더 좋은거 같습니다. InnoDB Cluster Who? 하겠네요.

WP용이나 중소규모 웹이라면 충분히 커버 가능할 것 같습니다. 분산 쓰기와 고가용성을 동시에 해결할 수 있는 좋은 선택이 될 것 같습니다.

Galera cluster for MySQL 8 – #.2 installation

Galera Cluster & MySQL 8 설치 설치환경 CPU: 2 core RAM: 4GB OS: CentOS 7 yum을 이용해 패키지 설치를 진행합니다. CentOS 7버전이 아직까지는 가장 안정적인 버전으로 많이 사용하기 때문에 7로 진행했습니다. 필수 패키지 설치 yum...

Galera cluster for MySQL 8 - #.1 Architecture

Galera cluster Galera cluster는 코더십이 만든 동기식 멀티 마스터 복제 기법입니다. 인증 기반 복제(Certification-Based Replication) 방식을 사용하며, 데이터의 완전성을 자동으로 관리해줍니다. 그리고 현재 Galera cluster는 MySQL, MariaDB 그리고 Percona XtraDB 까지도 클러스터를 구성할 수 있습니다....
