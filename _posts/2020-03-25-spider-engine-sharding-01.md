---
date: 2020-03-25 18:00:40 +0900
title: "SPIDER 엔진을 이용한 샤딩 환경 구축 #01"
category: mysql
excerpt: "Spider 는 샤딩 기능이 내장된 MariaDB 스토리지 엔진입니다. Spider 노드 1대와 데이터 노드 2대로 샤딩 환경을 만들고 일반 테이블과 성능을 비교합니다."
updated: 2026-09-20
---

> **전제:** sysbench 1.0.19, 루트 또는 관리자 권한

## Spider 엔진?

Spider 스토리지 엔진은 샤딩 기능이 내장된 스토리지 엔진입니다. 파티셔닝과 XA 트랜잭션을 지원하고, 다른 MariaDB 인스턴스의 테이블을 같은 인스턴스에 있는 것처럼 다룹니다.

Spider 엔진으로 테이블을 만들면 그 테이블은 원격 서버의 테이블에 연결됩니다. 원격 테이블은 Spider 엔진만 제외하고 MariaDB 가 지원하는 어떤 스토리지 엔진이든 쓸 수 있습니다.

Spider 노드와 데이터 노드의 연결은 로컬 MariaDB 노드에서 원격 MariaDB 노드로 향하는 연결 설정으로 완성됩니다. 이 연결은 같은 트랜잭션에 묶인 모든 테이블이 공유합니다.

MySQL 에서 샤딩은 DB 안이 아니라 DB 앞단에서 처리합니다. 샤드 키를 modulo 로 나누기도 하고, 키 값의 range 로 나누기도 합니다. 카카오테크에 참고할 자료가 있습니다 ([ADT 활용 예제1](https://tech.kakao.com/posts/325)).

MariaDB 는 Spider 엔진을 탑재하면서 이 분할을 DB 안에서 처리할 수 있게 했습니다.

> **NOTE** — Spider 는 지금도 MariaDB 서버와 함께 설치되는 엔진이고, 공식 문서의 버전 표는 Spider 3.3.15(MariaDB 10.5.7)를 Stable 로 적습니다. 다만 Spider 자체의 고가용성 기능은 MariaDB 10.7.5 부터 deprecated 되어 삭제됐으므로(MDEV-28479) 복제나 Galera Cluster 로 대체해야 합니다. 조건 푸시다운(condition pushdown)은 아직 구현되지 않아, 샤드로 흩어지는 질의는 네트워크 왕복이 쌓이는 만큼 느려집니다. 커뮤니티 지원이 남아 있는 LTS 는 10.11 · 11.4 · 11.8 · 12.3 이고, 최신 LTS 는 2026년 5월에 나온 12.3 입니다.

{% include diagram.html src="spider-architecture.svg" caption="Spider 엔진의 동작 원리: 로컬 Spider 테이블이 원격 서버의 테이블에 연결" %}

## Spider 엔진으로 샤딩 구현 실습

Spider 노드 1대와 데이터 노드 2대로 구성했습니다.

{% include diagram.html src="spider-sharding.svg" caption="Spider 샤딩 구성: Spider 노드 1대와 데이터 노드 2대" %}

### 데이터 노드 구성

두 데이터 노드에 모두 만들어 줍니다.

#### DB 및 테이블 생성

```sql
CREATE DATABASE backend;
CREATE TABLE backend.sbtest1 (
  id int(10) unsigned NOT NULL AUTO_INCREMENT,
  k int(10) unsigned NOT NULL DEFAULT '0',
  c char(120) NOT NULL DEFAULT '',
  pad char(60) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY k (k)
) ENGINE=InnoDB;
```

#### DB user 생성

```sql
create user 's_user'@'%' identified by '<PASSWORD>';
grant all privileges on *.* to 's_user'@'%' identified by '<PASSWORD>';
flush privileges;
```

### Spider 노드 구성

#### Spider 엔진 설치

Debian · Ubuntu 계열은 플러그인 패키지를 따로 설치합니다. 나머지 배포판에서는 Spider 가 서버 패키지에 함께 들어 있습니다.

```bash
sudo apt install mariadb-plugin-spider   # Debian, Ubuntu
sudo yum install MariaDB-spider-engine   # CentOS, RHEL 계열
```

플러그인은 재시작 없이 적재할 수 있습니다.

```sql
INSTALL SONAME 'ha_spider';
```

설정 파일에 적어 두면 다음 기동 때 자동으로 올라옵니다.

```ini
[mariadb]
plugin_load_add = "ha_spider"
```

예전에는 `install_spider.sql` 스크립트를 실행해 부속 테이블을 만들었습니다. 지금 배포 패키지에는 이 스크립트가 들어 있지 않고, 플러그인을 적재하면 Spider 가 `mysql` 데이터베이스에 `spider_tables` · `spider_xa` · `spider_link_mon_servers` 같은 테이블을 직접 만듭니다.

#### 엔진 조회

```sql
SELECT engine, support, transactions, xa
FROM information_schema.engines;

+--------------------+---------+--------------+------+
| engine             | support | transactions | xa   |
+--------------------+---------+--------------+------+
| SPIDER             | YES     | YES          | NO   |
| MRG_MyISAM         | YES     | NO           | NO   |
| MEMORY             | YES     | NO           | NO   |
| Aria               | YES     | NO           | NO   |
| MyISAM             | YES     | NO           | NO   |
| SEQUENCE           | YES     | YES          | NO   |
| InnoDB             | DEFAULT | YES          | YES  |
| PERFORMANCE_SCHEMA | YES     | NO           | NO   |
| CSV                | YES     | NO           | NO   |
+--------------------+---------+--------------+------+
9 rows in set (0.001 sec)
```

`SPIDER` 행의 `support` 가 `YES` 면 적재된 것입니다. 플러그인이 올라오지 않았다면 이 행 자체가 나오지 않습니다.

#### 데이터 노드의 정보 등록

```sql
CREATE SERVER backend1
  FOREIGN DATA WRAPPER mysql 
OPTIONS( 
  HOST '172.16.68.3', 
  DATABASE 'backend',
  USER 's_user',
  PASSWORD '<PASSWORD>',
  PORT 3306
);

CREATE SERVER backend2
  FOREIGN DATA WRAPPER mysql 
OPTIONS( 
  HOST '172.16.68.4', 
  DATABASE 'backend',
  USER 's_user',
  PASSWORD '<PASSWORD>',
  PORT 3306
);
```

서버 정의를 나중에 바꿨다면 `FLUSH TABLES` 로 새로 읽게 해야 합니다.

#### Spider 테이블 생성

```sql
CREATE DATABASE IF NOT EXISTS backend;
CREATE  TABLE backend.sbtest1
(
  id int(10) unsigned NOT NULL AUTO_INCREMENT,
  k int(10) unsigned NOT NULL DEFAULT '0',
  c char(120) NOT NULL DEFAULT '',
  pad char(60) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY k (k)
) ENGINE=spider COMMENT='wrapper "mysql", table "sbtest1"'
 PARTITION BY KEY (id) 
(
 PARTITION pt1 COMMENT = 'srv "backend1"',
 PARTITION pt2 COMMENT = 'srv "backend2"' 
) ;
```

MariaDB 10.8.1 부터는 연결 대상을 `COMMENT` 문자열에 담는 대신 `REMOTE_SERVER` · `REMOTE_TABLE` 테이블 옵션으로도 지정할 수 있습니다.

비교 대상이 필요하니 Spider 노드의 `test` 데이터베이스에 sysbench 로 일반 테이블을 만들고 데이터를 채웁니다.

#### 계정 생성

```sql
create user 's_test'@'%' identified by '<PASSWORD>';
grant all privileges on *.* to 's_test'@'localhost' identified by '<PASSWORD>';
flush privileges;
```

#### 시스벤치를 이용한 데이터 넣기

```bash
sysbench /usr/share/sysbench/oltp_read_only.lua --db-driver=mysql --threads=16 --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test  --mysql-user=s_test --mysql-password='<PASSWORD>' --mysql-port=3306 --table-size=10000000 prepare
```

sysbench 설치와 사용법은 [별도 글](/writing/sysbench-benchmark-tool/)에서 다뤘습니다.

```bash
root@master:~]# sysbench /usr/share/sysbench/oltp_read_only.lua --db-driver=mysql --threads=16 --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test  --mysql-user=s_test --mysql-password='<PASSWORD>' --mysql-port=3306 --table-size=10000000 prepare
sysbench 1.0.19 (using bundled LuaJIT 2.1.0-beta2)

Initializing worker threads...

Creating table 'sbtest1'...
Inserting 10000000 records into 'sbtest1'
Creating a secondary index on 'sbtest1'...
```

천만 건이 들어갔습니다. Spider 노드의 `test` 데이터베이스에서 세어 보면

```sql
MariaDB [test]> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
| 10000000 |
+----------+
1 row in set (3.128 sec)
```

천만 건이 그대로 나옵니다. 이 데이터를 `backend` 데이터베이스에 만들어 둔 Spider 테이블로 복사합니다.

```sql
insert into backend.sbtest1 select * from test.sbtest1;
```

복사가 끝나면 노드별로 건수를 세어 봅니다.

#### Spider 노드 조회

```sql
MariaDB [(none)]> select count(*) from backend.sbtest1;
+----------+
| count(*) |
+----------+
| 10000000 |
+----------+
1 row in set (3.280 sec)
```

#### 데이터 노드 backend1 조회

```sql
MariaDB [backend]> select count(*) from backend.sbtest1;
+----------+
| count(*) |
+----------+
|  6206684 |
+----------+
1 row in set (1.914 sec)
```

#### 데이터 노드 backend2 조회

```sql
MariaDB [(none)]> select count(*) from backend.sbtest1;
+----------+
| count(*) |
+----------+
|  3793316 |
+----------+
1 row in set (1.257 sec)
```

Spider 노드에서는 천만 건이 그대로 보이고, 데이터 노드에는 나뉘어 담긴 건수가 보입니다. 샤딩이 동작해 데이터가 두 노드로 갈라진 것입니다.

## 일반 테이블과 Spider 테이블의 벤치마크 성능

일반 테이블의 벤치마크

```bash
sysbench /usr/share/sysbench/oltp_read_only.lua --db-driver=mysql --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test  --mysql-user=s_test --mysql-password='<PASSWORD>' --mysql-port=3306 --threads=4 --events=10000000 run

sysbench 1.0.19 (using bundled LuaJIT 2.1.0-beta2)

Running the test with following options:
Number of threads: 4
Initializing random number generator from current time


Initializing worker threads...

Threads started!

SQL statistics:
    queries performed:
        read:                            119546
        write:                           0
        other:                           17078
        total:                           136624
    transactions:                        8539   (853.32 per sec.)
    queries:                             136624 (13653.20 per sec.)
    ignored errors:                      0      (0.00 per sec.)
    reconnects:                          0      (0.00 per sec.)

General statistics:
    total time:                          10.0044s
    total number of events:              8539

Latency (ms):
         min:                                    2.33
         avg:                                    4.68
         max:                                   32.96
         95th percentile:                        5.47
         sum:                                39986.42

Threads fairness:
    events (avg/stddev):           2134.7500/27.27
    execution time (avg/stddev):   9.9966/0.00
```

Spider 테이블의 벤치마크

```bash
sysbench /usr/share/sysbench/oltp_read_only.lua --db-driver=mysql --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=backend  --mysql-user=s_test --mysql-password='<PASSWORD>' --mysql-port=3306 --threads=4 --events=10000000 run

sysbench 1.0.19 (using bundled LuaJIT 2.1.0-beta2)

Running the test with following options:
Number of threads: 4
Initializing random number generator from current time


Initializing worker threads...

Threads started!

SQL statistics:
    queries performed:
        read:                            17878
        write:                           0
        other:                           2554
        total:                           20432
    transactions:                        1277   (127.36 per sec.)
    queries:                             20432  (2037.72 per sec.)
    ignored errors:                      0      (0.00 per sec.)
    reconnects:                          0      (0.00 per sec.)

General statistics:
    total time:                          10.0220s
    total number of events:              1277

Latency (ms):
         min:                                   23.92
         avg:                                   31.35
         max:                                   64.70
         95th percentile:                       37.56
         sum:                                40031.27

Threads fairness:
    events (avg/stddev):           319.2500/1.48
    execution time (avg/stddev):   10.0078/0.01
```

같은 10초를 돌렸는데 초당 트랜잭션은 853.32 에서 127.36 으로, 약 15% 수준까지 떨어졌습니다. 평균 지연도 4.68ms 에서 31.35ms 로 6.7배 늘었습니다. 공식 문서는 이런 격차의 원인으로 질의마다 네트워크 왕복이 여러 번 생기는 점과 조건 푸시다운이 아직 구현되지 않은 점을 듭니다.

샤드 하나가 멈춰도 서비스가 버티게 하려면 데이터 노드마다 이중화를 따로 붙여야 합니다. Spider 가 직접 제공하던 고가용성 기능은 삭제됐으니, 데이터 노드를 복제나 Galera Cluster 로 묶는 방식을 씁니다.
