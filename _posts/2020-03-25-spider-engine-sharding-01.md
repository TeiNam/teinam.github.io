---
date: 2020-03-25 18:00:40 +0900
title: "SPIDER 엔진을 이용한 샤딩 환경 구축 #01"
category: mysql
excerpt: "Spider 엔진? Spider 스토리지 엔진은 샤딩 기능이 내장 된 스토리지 엔진입니다. 파티셔닝 및 xa 트랜잭션을 지원하며 다른 MariaDB 인스턴스의 테이블을 마치 동일한 인스턴스에있는 것처럼 처리 할 수 있습니다. Spider 스토리지 엔진으로 테이블을 작성하면 테이블이..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — Spider 는 여전히 MariaDB 에 번들되는 Stable 엔진이고 install_spider.sql·CREATE SERVER 절차도 유효하다. 다만 MariaDB 10.7.5 부터 Spider 의 HA 기능은 삭제되어(MDEV-28479) 복제나 Galera 를 쓰라고 안내하며, condition pushdown 미구현으로 샤드 분산 쿼리 성능 제약이 남아 있다.

![Spider 엔진 로고](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

> **전제:** sysbench 1.0.19 사용, 루트 또는 관리자 권한

## Spider 엔진?

Spider 스토리지 엔진은 샤딩 기능이 내장된 스토리지 엔진입니다. 파티셔닝 및 xa 트랜잭션을 지원하며 다른 MariaDB 인스턴스의 테이블을 마치 동일한 인스턴스에 있는 것처럼 처리할 수 있습니다.

Spider 스토리지 엔진으로 테이블을 작성하면 테이블이 원격 서버의 테이블에 링크됩니다. Remote 테이블은 Spider 엔진이 아닌 MariaDB가 지원하는 모든 스토리지 엔진을 사용할 수 있습니다.

Spider 엔진으로 마스터 노드와 Spider 노드의 연결은 Local MariaDB 노드에서 Remote MariaDB 노드로 연결 설정으로 완성됩니다. 이 링크는 동일한 트랜잭션을 가진 모든 테이블에 대해 공유됩니다.

기존의 MySQL의 샤딩은 DB단에서 구현하지 않고, DB 앞단에서 구현을 합니다. 샤드키 기준으로 modulo로도 하고, 아니면 key 값으로 range 로도 구현을 하기도 합니다. 참고할 만한 자료가 카카오테크 페이지에 있습니다. ([ADT 활용 예제1](https://tech.kakao.com/2016/07/01/adt-mysql-shard-rebalancing/))

MariaDB에서는 Spider 엔진을 탑재하면서, DB단에서 샤딩을 구현할 수 있게 되었습니다.

![MariaDB Spider 아키텍처 다이어그램](/assets/img/wp/2020/03/mariadb-pres-at-lemug-10-638.jpg)

## Spider 엔진으로 샤딩 구현 실습

Spider Node 1대, 데이터 노드 2대로 구성했습니다.

![Spider 샤딩 구성도: Spider 노드 1대 + 데이터 노드 2대](/assets/img/wp/2020/03/Spider8.png)

### 데이터 노드 구성

각각의 데이터 노드에서 모두 생성해줍니다.

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

우선 Spider 스토리지 엔진을 설치합니다.

```bash
mysql -uroot -p < /usr/share/mysql/install_spider.sql
```

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

Spider 노드에 일반 테이블과 Spider 테이블의 비교를 위해 일반 테이블을 만들고 데이터를 넣는 작업을 합니다.

일단 테이블은 test 데이터베이스에 sysbench로 생성을 하겠습니다.

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

시스벤치 설치 및 사용법은 여기 ([sysbench](/writing/sysbench-benchmark-tool/))를 참고하세요.

```bash
root@master:~]# sysbench /usr/share/sysbench/oltp_read_only.lua --db-driver=mysql --threads=16 --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test  --mysql-user=s_test --mysql-password='<PASSWORD>' --mysql-port=3306 --table-size=10000000 prepare
sysbench 1.0.19 (using bundled LuaJIT 2.1.0-beta2)

Initializing worker threads...

Creating table 'sbtest1'...
Inserting 10000000 records into 'sbtest1'
Creating a secondary index on 'sbtest1'...
```

천만건의 데이터가 입력 되었습니다.

MariaDB의 test DB에 접속해서 조회해보면

```sql
MariaDB [test]> select count(*) from sbtest1;
+----------+
| count(*) |
+----------+
| 10000000 |
+----------+
1 row in set (3.128 sec)
```

천만건이 조회됩니다.

천만건의 데이터를 backend DB에 만들어놓은 Spider 테이블에 복사합니다.

```sql
insert into backend.sbtest1 select * from test.sbtest1;
```

입력이 끝나면 각각의 노드에서 테이블을 조회 해보겠습니다.

#### Spider 노드

```sql
MariaDB [(none)]> select count(*) from backend.sbtest1;
+----------+
| count(*) |
+----------+
| 10000000 |
+----------+
1 row in set (3.280 sec)
```

#### Backend1 번 노드

```sql
MariaDB [backend]> select count(*) from backend.sbtest1;
+----------+
| count(*) |
+----------+
|  6206684 |
+----------+
1 row in set (1.914 sec)
```

#### Backend2 번 노드

```sql
MariaDB [(none)]> select count(*) from backend.sbtest1;
+----------+
| count(*) |
+----------+
|  3793316 |
+----------+
1 row in set (1.257 sec)
```

메인인 Spider 노드에서는 천만건이 조회되고, 각각의 데이터 노드에 나눠진 값이 조회됩니다. 샤딩 기능으로 데이터 노드에 분할되어 데이터가 입력된 것이죠.

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

실행 시간은 아주 약간 늘었지만, 쿼리 퍼포먼스나 트랜잭션 자체가 크게 줄어든걸 확인할 수 있습니다.

다음 포스트는 샤딩된 테이블에 대한 레플리카 구성을 해보겠습니다.
