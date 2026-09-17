---
date: 2019-11-08 17:10:51 +0900
title: "MariaDB Replication"
category: mysql
excerpt: "Replication? MariaDB 또는 MySQL에서 Replication은 단어 그대로 복제를 의미합니다. 일반적으로 Replication은 읽기 부하 분산 또는 HA를 위해서 구축합니다. Replication을 사용하는 이유는 다양합니다. 데이터 분산: DR 구축이나 사본을…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — MySQL 5.6/5.7 기준 서술이고 master/slave 용어와 CHANGE MASTER TO, master_info_repository=TABLE 을 그대로 쓴다. MySQL 8.0.22/8.0.23 에서 SHOW SLAVE STATUS·CHANGE MASTER TO 등이 deprecated 되고 8.4.0 에서 제거되어 SHOW REPLICA STATUS·CHANGE REPLICATION SOURCE TO(SOURCE_* 절)로 대체되었으며, MariaDB 도 10.5.1 부터 REPLICA 계열 구문을 지원한다.

![](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

**Replication?**

MariaDB 또는 MySQL에서 Replication은 단어 그대로 복제를 의미합니다. 일반적으로 Replication은 읽기 부하 분산 또는 고가용성(HA, High Availability)을 위해서 구축합니다. Replication을 사용하는 이유는 다양합니다.

- 데이터 분산: DR(Disaster Recovery) 구축이나 사본을 저장하기 위한 설정
- 부하 분산:  Read가 많은 시스템에서 유용
- 백업
- 고가용성(HA) 및 장애 복구
- 업그레이드 테스트

MySQL 5.6까지의 Replication은 각 슬레이브 하나가 하나의 마스터만 둘수 있었습니다. MySQL 5.7, MariaDB 10.0 버전부터는 이러한 제한이 사라지고, 1:N이나 다단 구성, 멀티마스터 구성 등 다양한 형태로 구성할 수 있게 되었습니다. 그렇게 발전해 온 현재의 Replication은 하나의 마스터 DB에서 하나 이상의 슬레이브 DB로 데이터를 비동기(asynchronous)적으로 복제하는 기능입니다.  마스터 DB에서 데이터를 변경하는 트랜잭션이 발생하면 Replication 연결이 되어 있는 Slave에도 동일한 작업이 실행이 되지만, 실행 완료에 대해서는 보장되지 않습니다. 동기화 방식이라면 슬레이브 DB에서 최종적으로 트랜잭션이 완료되었다라는 응답을 마스터 DB가 받아야지만 최종적으로 트랜잭션이 완료됩니다. MySQL의 Replication 동작 방식을 이해하기 위해서는 우선 binlog를 알아야 합니다.

**바이너리 로그 (Binary log  줄여서 binlog)**

binlog는 MySQL, MariaDB에서 발생한 모든 변경을 직렬화하여 기록한 파일입니다. 기본적으로 MySQL의 데이터 디렉토리에 저장이 되며, log\_bin 옵션에 지정한 파일명을 접두어로 하여, 6자리의 일련번호를 덧붙인 이름의 파일로 저장됩니다. binlog에는 기록하는 방식에는 세가지 포맷이 있습니다.

- statement: DB에서 실행된 SQL 자체를 기록하고, 용량이 적고 기록이 빠르다는 장점이 있다. 반면, DML이 복제 되지 않는 경우도 있고, Limit 절이나 System function 사용시 노드간의 값이 다른 경우가 있음.
- row: DB의 모든 동작이 문자값으로 기록이 되면 Row lock이 발생. 바이너리 고르 용량이 크다.
- MIXED: statement + row 방식의 장점을 취합하여 사용. 기본적으로 statement로 기록을 하다가, 비결정성 SQL의 경우 row로 기록을 한다.

statement 사용시 노드간 결과 값이 다를수있는 경우

- - 비결정의 UDF 또는 저장 프로그램을 포함한 SQL문
  - order by 구문이 없는 LIMIT구가 사용된 UPDATE, DELETE
  - 다음과 같은 시스템 함수를 이용했을 경우
    - LOAD\_FILE()
    - UUID() / UUID\_SHORT()
    - USER()
    - FOUND\_ROWS()
    - SYSDATE()
    - GET\_LOCK()
    - IS\_FREE\_LOCK()
    - IS\_USED\_LOCK()
    - MASTER\_POS\_WAIT()
    - RAND()
    - RELEASE\_LOCK()
    - SLEEP()
    - VERSION()

**Replication 동작 방식**

MySQL의 Replication은 Master가 서버고, Slave가 클라이언트 입니다. 슬레이브가 Replication를 하기 위해 Master에 접속하는 구조로 되어 있습니다.

Master Thread

Slave의 수에  따라 Master Thread(binlog dump thread라도고 합니다)를 생성하는데, binlog를 읽어 슬레이브에 전송하는 단 하나의 역할을 합니다. Slave가 Master에 binlog의 송신을 의뢰하는 명령어는 두가지 입니다.

- `COM_BINLOG_DUMP`
- `COM_BINLOG_DUMP_GTID`

둘다 프로토콜 레벨의 명령어로 SQL과는 동작 방식이 다르고, 둘의 차이점은 GTID를 사용하느냐, 사용하지 않느냐 차이 입니다.

![](/assets/img/wp/2019/11/Untitled-Diagram.png)

<Single Thread에서 Replication 동작 방식>

Slave I/O Thread

I/O Thread는 마스터에 접속해서 binlog의 내용을 relay log에 똑같이 복사합니다.

Slave SQL Thread

relay log에 기록된 내용을 읽어들여서 슬레이브에 저장할 때 사용합니다.

**GTID란?**

Global Transaction ID의 약자로, binlog에 기록된 각각의 트랜잭션에 고유한 ID를 분여주는 기능을 말합니다.  MySQL 5.6에서 GTID가 추가 되었지만, 5.7 버전에 올라와서야 실무에 적용할 수 있게 발전했습니다.  GTID의 포맷은 MySQL Server ID : Transaction ID 형식으로 생성됩니다. MySQL서버의 ID는 UUID로 생성하며, UUID는 서버를 최초로 기동한 시점에 결정되며, 데이터 디렉토리 안에 auto.cnf라는 파일로 저장됩니다. 트랜잭션 ID는 1부터 시작해서 단순 증가하는 연속 번호입니다.

GTID는 1:N 형식의 Replication 구조에서 슬레이브의 자동 승격에 이용됩니다. 어떤 문제로 마스터를 이용할 수 없게된 경우, 운영중인 슬레이브를 승격시켜 새로운 마스터로 사용하게 됩니다. 슬레이브를 마스터로 승격 시키기 위해서는 두 가지 요소를 필요로 합니다.

1. 애플리케이션에서 변경할 대상의 서버 주소를 변경.
2. 새로 승격된 마스터로부터 다른 슬레이브가 Replication을 위해 변경 내용을 받는다.

GTID가 없던 시절에는 미래에 승격될 가능성이 있는 슬레이브에 log-bin, log\_slave\_upadtes 옵션을 사용하여 binlog를 출력하도록 설정하였습니다. 하지만 슬레이브 안의 binlog를 봐도 이것이 어떤 내용인지 쉽게 확인할 수 없었기 때문에, 마스터의 어떤 이벤트에 대응하는지 알기 힘들고, 마스터와 슬레이브 binlog 사이의 관계 정보가 없기 때문에 binlog의 진행 차이를 쉽게 알수가 없는 경우도 있습니다. 반면 GTID가 있는 경우에는 트랙잭션의 식별이 쉽게 가능하기 때문에 그런 문제가 발생하지 않습니다.

**Semi-sync Replication (준동기)**

기본적인 Replication 방식이 비동기 방식이라면, Semi-Sync는 완전한 동기화 방식은 아닙니다. 2-Phase commit을 이용하는 것인데, Commit을 PREPARE와 COMMIT 두 단계로 나눈 것을 말합니다. 마스터에서 트랜잭션이 실행되면 COMMIT을 완료하기전에 슬레이브로 binlog의 전송이 완료되고, 마스터에서는 슬레이브로 부터 ACK가 반환되길 기다립니다. 슬레이브에서 변경이 적용되면 슬레이브는 ACK를 마스터로 반환하고,  마스터는 클라이언트에 COMMIT이 되었다고 전달합니다.

**Multi-Source Replication**

하나의 슬레이브가 여러개의 마스터를 바라볼수 있습니다.  (N:1 형태)

멀티 소스 Replication은 다음과 같은 경우 유용합니다.

- 분석을 위해 여러개의 애플리케이션에서 데이터를 집약할 때
- 여러개의 애플리케이션으로 공통의 마스터 데이터를 배포할 때
- 샤딩(sharding)에 의해 분할된 데이터를 재통합할 때

여러개의 마스터를 지정하기 위해서는 채널을 구성해야 합니다. 이 채널의 개념은 마스터와 통신을 하는것인데, CHANGE MASTER 명령어로 채널을 구체적으로 지정할 수 있습니다. 여러개의 채널을 사용하려면 슬레이브에서 옵션을 조정해야 하는데, Replication 정보를 저장하는 Repository를 Table화 하면 됩니다.

```ini
[mysqld]
master_info_repository = TABLE
relay_log_info_repository = TABLE
```

슬레이브에서 이 것을 설정하는 것이 최소한의 요건이며, GTID를 이용하거나 Semi-sync, MTS의 Worker Thread 수에는 영향이 없습니다.

**binlog Group Commit**

![](/assets/img/wp/2019/11/groupcommit.png)

< Group Commit >

binlog의 그룹 커밋 기능은 MySQL 5.0 시절부터 Binary log 쓰기 성능 향상을 위해서 계속 이슈가 되어 왔던 기능입니다. 물론 MySQL 5.6 버전도 가지고 있는 기능이지만, 이 기능이 MySQL 5.6이나 MariaDB 10.0에서 처음 구현된 기능은 아니며, 예전부터 추가되었다가 다른 제약때문에 제거되었다가 다시 구현된 기능입니다. 그룹 커밋은 여러 개의 아이템 (binlog 이벤트나 트랜잭션 등..)을 한번에 모아서 처리하는 기능을 의미할 때 자주 선택되는 용어이기도 한데, MariaDB의 binlog의 그룹 커밋 기능은 단순히 이벤트를 binlog 파일에 모아서 기록하는 수준이 아니라, 실제 트랜잭션의 커밋 처리까지 모아서 수행하는 것을 의미합니다. 즉, binlog 이벤트의 그룹 커밋을 효율적으로 모아서 처리하기 위해서는 트랜잭션의 Commit 성능을 조금 포기해야 할 수도 있다는 것을 의미합니다. 어떤 트랜잭션들이 얼마나 모아서 그룹 커밋 처리되었는지는 binlog 파일의 내용을 살펴보면 알 수 있습니다.

쿼리가 처리되면, 각 트랜잭션은 최대 5 milli-seconds를 기다렸다가 커밋을 수행하게 되는데, 이때 같이 커밋된 binlog 이벤트(binlog 파일에 기록된 트랜잭션)은 동일한 "COMMIT ID"를 가지게 됩니다. mysqlbinlog나 show binlog events 명령의 결과로 decoding된 binlog 파일에서 "cid"라는 값으로 표시됩니다.

Replication Slave의 Coordinator는 binlog에서 그룹 커밋된 트랜잭션을 모두 모아서(cid 기반), SQL Thread에게 동시에 나눠서 처리하도록 합니다.

이렇게 Parallel 처리가 가능한 이유는, 하나의 그룹 커밋내에 있던 모든 트랜잭션은 서로 충돌 (동일 Row에 대한 Exclusive lock을 필요로 하는)이 없다는 것이 이미 Master에서 증명되었기 때문입니다. 결론적으로 마스터에서 하나의 그룹 커밋내에 포함된 트랜잭션이 많으면 많을수록 Multi-threaded slave의 parallelism이 높아지게 되는 것입니다.

또한, MariaDB 10.0의 Multi-threaded slave에서는 그룹 커밋에 소속되지 않은 트랜잭션이라 하더라도, 각 트랜잭션의 일부분에 대해서는 Parallel하게 처리할 수 있도록 지원합니다. 즉, 2개의 트랜잭션이 슬레이브에서 실행되어야 하는 상태에서, Slave의 Coordinator는 첫번째 트랜잭션을 읽어서 1번 SQL thread에게 넘겨주고 1번 쓰레드가 Commit을 시작하는 시점까지 기다리다가 1번 쓰레드가 Commit을 실행하는 시점에 Coordinator는 두번째 트랜잭션을 2번 SQL Thread에게 넘겨주게 됩니다. 즉, 그룹 커밋에 포함되지 않은 트랜잭션이라 하더라도 최소한 COMMIT 작업은 Multi-threading이 가능하도록 설계한 것입니다.

MySQL 5.7 에서는 바이너리 이벤트의 그룹 커밋을 위해서는 아래와 같은 2개의 시스템 변수를 지원하고 있습니다.

- `binlog_group_commit_sync_delay`
- `binlog_group_commit_sync_no_delay_count`

MariaDB 10.0에서는 바이너리 이벤트의 그룹 커밋을 위해서는 아래와 같은 2개의 시스템 변수를 지원하고 있습니다.

- `binlog_commit_wait_usec`
- `binlog_commit_wait_count`

둘다 기능은 같습니다. 이름만 다를뿐. .

binlog_group_commit_sync_delay, binlog_commit_wait_usec

짧은 간격을 두고 여러 클라이언트에서 트랜잭션이 커밋된다. 이때 binlog 이벤트를 모아서 한번에 binlog 파일로 기록한다. 이 때 순수하게 동시점에 수행된 트랜잭션만 그룹 커밋 대상으로 선정할 수도 있지만, MariaDB 서버가 그룹 커밋의 효율을 높이기 위해서 일정 시간을 기다리면서 커밋되는 트랜잭션을 모아서 그룹 커밋으로 처리하도록 할 수도 있습니다. 이때 MariaDB 서버가 최대 얼마만큼의 시간을 기다리도록 할지를 설정하는 시스템 변수입니다. binlog_commit_wait_usec 시스템 변수는 Milli-seconds 단위로 설정하므로, 만약 최대 10 밀리 초 이내에는 커밋이 수행되도록 하고자 한다면 binlog_commit_wait_usec을 10000로 설정하면 됩니다. MySQL의 binlog_group_commit_sync_delay는 Micro-seconds가 기본 단위입니다.

binlog_group_commit_sync_no_delay_count, binlog_commit_wait_count

MariaDB 서버가 그룹 커밋의 효율을 높이기 위해서 조금은 기다리면서 일정 개수 이상의 이벤트가 커밋되면 이들을 모아서 그룹 커밋으로 처리하게 됩니다. 이때 MariaDB 서버가 최대 몇 개까지의 커밋을 기다릴지를 설정하는 시스템 변수입니다. 이때 개수의 대상의 binlog의 이벤트 개수나 쿼리의 수가 아니라 트랜잭션의 개수를 의미합니다.

**Parallel Thread (Multi-Threaded Slave, MTS)**

MySQL 5.6, MariaDB 10.0 버전부터 Multi-Threaded Slave(MTS) 기능 지원하기 시작하였고, 5.6 버전의 병렬 복제 기능은 schema 단위로 개별적인 복제 처리를 하다보니, schema 단위의 트랜잭션 정합성을 맞출 수 없다는 구조적인 문제가 있었으며, schema 개수가 많지 않거나 schema 간 쓰기 부하가 균일하지 않으면 병렬 처리의 장점을 활용할 수 없었습니다. 5.7 버전부터는 기존의 병력 복제의 단점을 보완한 LOGICAL\_CLOCK 방식의 병렬 복제를 지원하기 시작했습니다. `slave_parallel_type`, `slave_preserve_commit_order`라는 두개의 옵션이 추가되면서  LOGICAL\_CLOCK 모드를 MTS에서 사용할 수 있게 되었습니다.

**Multi-Threaded Slave, MTS에서 Replication 동작 방식**

![](/assets/img/wp/2019/11/mts2.png)

< MTS 동작방식 >

LOGICAL\_CLOCK 방식을 사용하는 경우, 동일 schema 내의 변경도 병렬 처리가 가능하며, 쓰기 부하가 균일하지 않아도 병렬 처리의 장점을 활용할 수 있습니다. 병렬 복제 구조 자체는 동일하지만, Coordinator 역할을 하는 SQL Thread가 worker thread에 작업을 할당하는 방식이 단순히 "작업 대상 스키마"를 기준으로 하던 것에서 "Master의 Binlog Group Commit 단위"로 동시 수행 가능 여부를 판단하는 것으로 변경되었습니다. LOGICAL\_CLOCK 방식은 릴레이 로그를 여러 Thread로 나눠 기록하다보니 마스터 DB의 근접한 처리량을 보여줍니다.

- **IO Thread :** master db의 변경 내용을 받아와서 relay log에 저장
- **SQL Thread :** relay log의 내용을 읽어서 worker thread에 할당
  - DATABASE 방식 (5.6 지원, Default) : relay log 이벤트의 적용 대상 schema 기준으로 개별 worker thread에게 할당
  - LOGICAL\_CLOCK 방식 (5.7 지원) : master에서의 prepare commit timestamp 기준으로 relay log 이벤트들을 worker thread에게 할당
- **Worker Thread :** SQL Thread가 전달한 변경 내용을 slave db에 반영

마스터의 작업량이 많지 않아 오버랩된 트랜잭션이 없어 병렬처리를 할 필요가 없는 경우에는 굳이 LOGICAL\_CLOCK 모드를 사용할 이유가 없습니다.

LOGICAL\_CLOCK 모드에서 MTS를 사용하려면, binlog에서 last\_commited와 sequence\_number 두 가지 정보를 가져와야 합니다. 그래서 마스터와 슬레이브의 버전이 MySQL 5.7 이상, MariaDB 10 이상으로 서로 동일하게 맞쳐주는 것이 좋습니다.

**설정 방법**

```sql
set global slave-parallel-type = LOGICAL_CLOCK; 
set global slave_parallel_workers = worker thread 32;
stop slave;
start slave;
```

또는

```ini
[mysqld]
slave_parallel_workers = 32
slave_parallel_type = LOGICAL_CLOCK
slave_preserve_commit_order = 1
log_bin = mysql-log
log_slave_updates = 1
```
