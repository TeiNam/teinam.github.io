---
date: 2019-06-06 23:22:31 +0900
title: "MariaDB의 InnoDB 엔진, XtraDB엔진"
category: mysql
excerpt: "MariaDB의 InnoDB 엔진, XtraDB엔진 InnoDB의 기능들 MySQL 5.5 에서 5.6으로 업그레이되면서 InnoDB 스토리지 엔진에 많은 변화가 있었습니다. 통계정보 MySQL 5.6의 InnoDB에서는 각 테이블의 통계정보를 테이블로 관리하도록 보완 되었습니다.…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — MariaDB 10.2 부터 XtraDB 대신 InnoDB 를 쓴다는 서술은 지금도 맞고 역사적 설명으로 유효하다. 다만 MySQL 5.5/5.6 기준으로 소개한 innodb_undo_logs, innodb_log_files_in_group 등은 MySQL 8.0 계열에서 제거·대체(innodb_redo_log_capacity)되었으므로 8.0/8.4 에는 그대로 적용되지 않는다.

![MariaDB 로고](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

## MariaDB의 InnoDB 엔진, XtraDB 엔진

## InnoDB의 기능

MySQL 5.5에서 5.6으로 업그레이되면서 InnoDB 스토리지 엔진에 통계정보 관리, 플러시 스레드, 페이지 사이즈 등 여러 변화가 있었습니다.

## 통계정보

MySQL 5.6의 InnoDB에서는 각 테이블의 통계정보를 테이블로 관리하도록 보완 되었습니다. 테이블의 전체 레코드 수나 인덱스별로 Cardinality 정보를 MySQL 데이터베이스의 innodb\_index\_stats와 innodb\_table\_stats 테이블로 관리하도록 개선되었습니다. 또한 이 정보가 자동으로 업데이트 되는것을 허용할 것인지, 말것인지를 사용자가 결정할 수 있도록 `innodb_stats_auto_recalc` 파라미터가 적용되었습니다. 테이블 기반 통계정보 관리는 충분한 개선은 아니며, 메모리에서 디스크 기반 테이블로 변경된 것일 뿐입니다. MariaDB 10.0 버전부터는  스토리지 엔진 레벨이 아닌 서버 차원에서 통계정보를 mysql 데이터베이스 안에 table\_stats와 index\_stats 그리고 column\_stats 테이블로 관리하고 있습니다. 또, 인덱스되지 않은 칼럼에 대해서도 통계정보를 관리하고 있으며, 히스토그램 역시 관리할 수 있습니다.

## 데이터 읽기 최적화

MySQL 5.6의 Index Condition Pushdown (ICP)와 Multi Range Read (MRR) 최적화를 위해서 MySQL 서버의 핸들러 API가 개선되었는데, 이 기능들이 제대로 작동하기 위해서는 각 스토리지 엔진에서 이 핸들러 API를 모두 구현해야 합니다. InnoDB엔진과 MyISAM엔진은 ICP와 MRR API를 기본적으로 구현하고 있으므로 ICP와 MRR을 사용할 수 있습니다. 다른 스토리지 엔진들이 ICP와 MRR을 이용할 수 있는지는 공홈의 메뉴얼을 통해 확인해 보시기 바랍니다.

## 커널 뮤텍스 (Kernel mutex)

InnoDB는 많은 공유 메모리 객체를 내포하고 있으며, 가장 대표적으로 버퍼 풀의 각 Block들과 Redo 로그 등을 예로 들수 있습니다. 공유된 메모리 객체들은 수많은 클라이언트 커넥션들이 서로 경쟁하면서 점유했다가 다시 점유를 해지하면서 실제로 쿼리를 처리합니다. 각 클라이언트 커넥션이 서로 동시에 점유하지 못하도록 동기화 처리를 해야 하는데, 이런 목적으로 동기화 잠금(Lock)이 사용됩니다. Lock은 Mutex(상호배제)나 Semaphore(자원 카운팅)로 구현됩니다. 모든 공유 메모리 객체가 Lock을 가지는 것은 아닙니다. 개별적으로 Lock을 처리한다면 Lock의 관리가 복잡해질 수 있고, 경합이 매우 많이 발생하는 부분에서 하나의 Lock으로 여러 메모리 구조체에 대한 동기화를 처리해 버림으로써 불필요하게 Lock wait가 발생하는 경우도 많았습니다. 대표적으로 Kernel\_mutex가 있는데, 이 것은  무엇때문에 Lock이 발생했는지 쉽게 정의할 수 없었고, Kernel_mutex는 공통 뮤텍스였습니다. MySQL 소스코드에서 용도에 맞는 Mutex나 Semaphore가 없을 때 사용되었기 때문에 InnoDB 성능에서 병목과 확장성 저해를 일으키는 가장 큰 원인이었습니다. MySQL 5.6 버전 부터는 각 용도별로 더 세분화 해서 Lock을 관리하도록 하였고, 트랜잭션의 동시성 제어와 MVCC 등의 메모리 구조체는 모두 개별적인 Read Write Lock으로 제어되도록 개선되었습니다.

## Multi threaded purge

InnoDB는 다중 버전 동시성 제어(MVCC)와 Rollback을 위해 Undo space를 별도로 관리하고 있으며, Update구문을 사용한다고 했을 경우, Commit과 Rollback을 수행하기 전에 변경전 데이터를 백업해 둡니다. Undo 데이터는 새로운 작업을 하기 위해 오래된 데이터를 지우고, 새로운 Undo 로그를 쌓는데, 이 Undo 로그를 삭제하는 작업을 Undo purge라고 합니다. Undo purge를 하기 위해 MySQL 5.5버전까지는 단 하나의 thread만을 사용했었는데, 5.6 버전부터는  innodb\_purge\_threads 파라미터 값을 설정하여 Undo purge에 멀티스레드를 구현할 수 있습니다. Update가많은 DB에서는 이 값을 조정해 멀티스레드를 사용하도록 개선되었습니다.

## 독립된 플러시 스레드

사용자가 DML(데이터 조작 언어: INSERT/UPDATE/DELETE) 문장을 실행하면 변경된 데이터는 먼저 Redo 로그에 기록되면서 디스크에 영구적으로 남게 됩니다. 그리고 InnoDB 엔진은 실제 테이블의 데이터를 InnoDB 버퍼 풀상에서만 변경합니다. 여기까지 완료가 되면 MySQL은 사용자에게 쿼리가 완료되었다고 리턴을 합니다. 하지만 실제로는 InnoDB buffer Pool 상에서만 변경되어 있고, 이 데이터를 언제가는 디스크에 기록하게 됩니다. 이때, InnoDB 버퍼 풀에 변경된 데이터를 "Dirty"라고 하며, 더티 데이터를 디스크에 기록하는 작업을 "Flush"라고 합니다. InnoDB 버퍼 풀 관리 사이즈(page size)는 일반적으로 16KB입니다. 다른 작업의 지연으로 인해 더티 페이지가 디스크로 플러시되지 못한다면 큰 문제가 될수 있습니다. 그래서 MySQL 5.6버전 부터는 플러시를 위한 전용 스레드를 도입하였습니다.

## 가변 페이지 사이즈

MySQL 5.5 버전까지의 InnoDB 페이지 사이즈는 16KB였는데, 이는 작은 row값은 2~3건씩 빈번하게 읽어가는 쿼리가 자주 실행 되는 DB에서는 매우 큰 값일 수 있습니다.  실제로 16KB를 빈번히 플러시하는 일은 많은 I/O를 발생합니다. 5.6 버전부터는 4KB나 8KB로 조정이 가능합니다. 이를 위해 MySQL를 다시 컴파일 했어야 했습니다. HDD에서는 헤더가 움직이는 시간이 오래 걸리지만, 헤더가 돌고 나서 특정 위치부터 연속적으로 데이터를 읽어나가는 방식에서는 4KB와 16KB의 성능 차이가 크지 않았습니다. 하지만 SSD 같이 헤더가 없고, 데이터 위치를 찾는데 시간이 거의 걸리지 않는 시스템에서는 데이터를 읽고 전송하는데 있어, 성능 차이가 있습니다. SSD의 경우 4KB로 설정하면 성능이 개선됩니다.

## 독립된 Undo 스페이스

MySQL 5.5 버전 까지의 InnoDB에서 Undo space는 system tablespace의 일부 영역을 사용하였습니다. Undo 영역은 주로 Random I/O 기반으로 작동을 하는데, 반면 시퀀셜 I/O를 기반으로 디스크에 기록하는 Insert Buffer 와 DoubleWrite Buffer등의 데이터들도 동시에 시스템 테이블스페이스를 사용하고 있었습니다. 그래서 MySQL 5.6 버전부터는 Undo 영역을 별도의 공간으로 저장할 수 있도로 파라미터 값이 생성되었습니다.

- `innodb_undo_directory`: Undo 로그가 저장되는 디렉토리를 지정한다. 기본값은 "."인데, 시스템테이블스페이스를 지정한다.
- innodb\_undo\_tablespaces: Undo 영역을 여러개의 테이블스페이스로 분리 할 수 있다. Undo 테이블스페이스는 최대 126개까지 설정할 수 있는데, 설정 값만큼 Undo 테이블스페이스 파일을 생성한다.
- innodb\_undo\_logs: Undo 세그먼트의 개수를 지정하는 설정으로 InnoDB에서는 1023개의 쓰기 트랜잭션이 하나의 Undo 세그먼트를 공유 하면서 사용할 수 있다. 이 값은 최대 128개까지 설정할 수 있고, 20으로 설정한다면 동시에 최대 1023×20= 20460 개의 쓰기 트랜잭션이 실행될 수 있다. 처음부터 크게 잡기보다는 사용하면서 늘리는 것을 권장.

Undo 영역은 최대한 빠른 속도를 가진 디스크 볼륨에 설정하는 것이 좋습니다.

## 버퍼 풀 dump & Loading

MariaDB는 5.5 버전과 PerconaServer 5.5버전부터는 MySQL 5.6부터 탑재된 버퍼 풀 워밍업 기능이 이미 포함되어 있었습니다. DB가 재구동 될때, 버퍼 풀이 비워지기 때문에 자주 쓰는데이터들을 다시 버퍼에 올리는 작업을 해야하는데, 용량이 큰 MySQL 5.5 이하 버전에서는 이 기능이 없어 재구동후 DB의 동작이 크게 느리거나, 심각한 경우 서비스 시작을 못하는 상황도 발생했습니다. MariaDB는 XtraDB 적용 이후에 DB 종료시 버퍼 풀의 있는 내용을 모두 파일로 덤프 해두고, 재구동시 해당 파일을 읽어 자주 쓰는 데이터를 버퍼 풀로 읽어들이는 작업을 자동으로 수행합니다.  또, 필요한 시점에 수동으로 SQL 명령을 통해 버퍼 풀에 있는 내용을 덤프하거나 가져올수 있습니다. 버퍼 풀이 100GB라고 해서 덤프가 100GB가 되지는 않습니다. 버퍼 풀에 캐싱된 space\_id와 page\_no 값만을 모아서 순서대로 정렬하여 덤프에 기록합니다. 정렬을 하는 이유는 해당 테이블의 데이터 페이지를 읽을때 랜덤 I/O가 아닌 시퀀셜I/O 방식으로 한번에 많은 데이터를 빠르게 로딩하기 위함입니다. space\_id는 테이블스페이스를 식별하며, page\_no는 특정 페이지(Block)를 식별하는 값입니다. 덤프된 데이터가 버퍼 풀에 로딩하는 도중에 쿼리가 들어오면 로딩이 느려지거나 쿼리가 느려질 수 있습니다. innodb\_blocking\_buffer\_pool\_resotre 파라미터를 ON으로 설정하면 버퍼 풀 로딩중에 쿼리 실행을 막을수 있습니다. 기본값은 OFF입니다.

MariaDB에서 수동으로 버퍼 풀 덤프하기

```sql
MariaDB> select * from information_schema.XTRADB_ADMIN_COMMAND /*!XTRA_LRU_DUMP*/;
```

수동으로 덤프를 로딩하여 버퍼 풀에 가져오기

```sql
MariaDB> select * from information_schema.XTRADB_ADMIN_COMMAND /*!XTRA_LRU_RESTORE*/;
```

MySQL 5.6 에서 버퍼 풀 덤프&로딩 방식은 MariaDB와 약간 다릅니다. SQL 명령이 아니 파라미터 값을 적용해서 덤프하거나 로딩을 할 수 있습니다.

- innodb\_buffer\_pool\_dump\_now = ON/OFF : 파라미터를 ON으로 변경하면 즉시 덤프를 한다.
- innodb\_buffer\_pool\_load\_now = ON/OFF : 파라미터를 ON으로 변경하면 덤프를 즉시 적재하며, 적재가 완료 되면 다시 OFF로 변경된다.
- innodb\_buffer\_pool\_dump\_at\_shutdown = ON/OFF : ON으로 설정되어 있으면 종료시 자동으로 버퍼 풀을 덤프한다.
- innodb\_buffer\_pool\_load\_at\_startup = ON/OFF : ON으로 설정하면 구동시 자동으로 버퍼 풀에 덤프를 로딩한다.

오라클도 비슷한 기능이 있습니다. Keep Buffer를 이용하는 것인데 자주 이용하는 테이블을 Buffer에 적재하는 것으로 지정하는 방법입니다. 메모리 기반의 DB인 Altibase의 경우 데이터가 이런식으로 동작하지만 시작과 종료가 매우 오래걸리는 편입니다.

## Redo 로그 크기

InnoDB는 서버 Crash에 대한 데이터 안정성을 보장하면서 성능을 향상시키기 위해 커밋된 트랜잭션 내용을 로그파일로 먼저 기록하고 실제 데이터 파일의 변경은 나중에 모아서 배치형태로 처리합니다. 이때 사용하는 로그를 Redo 로그라고 하며 PostgreSQL 처럼 WAL(Write Ahead Log) 이라고도 합니다. Redo 로그는 여러개의 파일이 순환하면서 사용되는데, 오라클과 비슷하다고 보시면 됩니다. Redo 로그에 관련된 파라미터는 3개가 있습니다.

- innodb\_log\_file\_size: 로그 파일의 크기를 설정한다. 크기를 변경하기 위해서는 Redo의 내용을 비워야 하기 때문에 clean shutdown 후에만 가능하다.
- innodb\_log\_files\_in\_group: 로그 파일의 개수를 설정하는 파라미터.
- innodb\_log\_group\_home\_dir: Redo 로그를 설정하는 시스템 변수이며, 이 값이 명시되지 않으면 MySQL 데이터 디렉토리에 생성한다.

> **참고:** Bin 로그와 InnoDB Redo 로그를 혼동하는 경우가 종종 있습니다. InnoDB 역시 Redo 로그가 오라클의 Redo 로그와 더 비슷한 기능을 하고, Bin 로그의 경우 MySQL 서버의 유니크한 기능인 복제를 위한 로그라고 봐야 하며, Redo 로그와 달리 성능을 위해 비동기 형태로 디스크에 기록되도록 설정하는 경우가 많습니다.

MySQL 5.5 이하에서는 4GB가 최대 용량이었지만, MySQL 5.6이상 부터는 로그 파일 하나당 512GB까지 설정 할 수 있습니다. 버퍼 풀이 큰 DB에서도 더티 페이지가 쓰기 버퍼링 역할을 더 효율적으로 할 수 있게 되었습니다.

## Deadlock 이력 조회 기능

MySQL 5.5 이하 버전의 InnoDB에서는 데드락이 발생해도 "show engine innodb status" 명령으로 데드락 섹션에서만 볼수 있었는데, 데드락이 여러번 발생하면 앞의 이력은 사라지고 마지막 이력만이 출력 되었습니다. MySQL 5.6 버전부터는 `innodb_print_all_deadlocks` 파라미터를 이용해 서버 에러 로그에 기록할 수 있습니다.

이 밖에도 InnoDB에는 많은 기능이 있습니다.  설명이 너무 길어지는거 같아서 다른 부분에 대해서는 새로운 포스팅으로 기록해 보겠습니다.

## XtraDB

XtraDB는 Percona에서 InnoDB 소스코드를 보완해서 만든 스토리지 엔진입니다. Percona는 MySQL을 개발하던 직원들이 나와서 2006년부터 MySQL의 부족함을 개선한 Percona Server를 오픈소스로 제공하고 있으며, MySQL를 개량한 Percona Server에 대한 컨설팅이나 유지보수를 하는 업체입니다. XtraDB는 MySQL에는 포함되지 않으며, Percona Server 와 MariaDB에서만 사용할 수 있습니다. InnoDB의 소스코드를 변환한 것이기 때문에 InnoDB의 데이터 파일을 그대로 사용할 수 있을정도로 호환성이 보장됩니다. 기존 InnoDB의 견고함과 트랜잭션 지원 그리고 MVCC 아키텍처를 그대로 유지 하면서 더 높은 확장성과 상세한 튜닝 및 모니터링이 가능하도록 XtraDB를 개선 했습니다. MariaDB의 XtraDB는 Percona Server의 XtraDB와 조금씩 버전별 차이점이 있을 수 있으며, Percona Server의 XtraDB가 가진 기능중에 몇가지는 MariaDB로 가져오지 못하는 경우도 있습니다. Percona의 XtraDB는 Xtrabackup 같은 스트리밍 백업 유틸리티 등도 제공하고 있으며, MariaDB도 이용이 가능한 툴중 하나입니다. Galera cluster에도 동기화 방식에 rsync와 더불어 xtrabackup을 지원합니다.

MariaDB는 5.5 버전부터 10.1까지의 버전에서 Percona Server의 XtarDB 엔진을 차용 했었습니다. 10.1 이하 버전에서

```sql
show plugins soname;
```

으로 조회 해보면 InnoDB가 두가지 타입으로 나오고, 하나는 Null값을 하나는 ha\_xtradb.so 라이브러리를 가지고 있습니다. my.conf 파일에 plugin을 ha\_xtradb.so으로 설정해주면 XtraDB 엔진을 InnoDB라는 이름으로 사용할 수 있었습니다. XtraDB는 MySQL의 InnoDB의 성능 향상 포크이며, 이 XtraDB 엔진은 MySQL이 5.1에서 5.5 버전으로 릴리즈 되는 동안 엄청나게 많은 발전사항을 포함하고 있었기 때문에, 성능적으로나 기능적으로 InnoDB를 사용한 것보다 성능이 더 좋았습니다.

10.2 버전 부터는 XtraDB를 기본적으로 사용하지 않고 다시 InnoDB를 사용하기 시작했습니다.

> **MariaDB 공식 설명:**
> Keeping InnoDB (or XtraDB) up to date with MySQL (Percona) is a complex task. It took us more than half a year to migrate from InnoDB-5.6 to InnoDB-5.7 in 10.2. Doing it again for XtraDB would probably have required only slightly less than this. For us to embark on such project, it must bring significant benefits to our users.  XtraDB had many great improvements over InnoDB in 5.1 and 5.5. But over time, MySQL has implemented almost all of them. InnoDB has caught up and XtraDB is only marginally better. Not enough to justify a multi-month merge that would delay 10.2-GA for everyone.  In particular, the only real improvement that XtraDB 5.7 seems to have is for a write-intensive I/O-bound workload, where `innodb_thread_concurrency` control is disabled.  With a proper `innodb_thread_concurrency`, XtraDB is only marginally better. We didn't want to delay 10.2-GA by up to half a year for the sake of those few users who have write-intensive I/O-bound InnoDB workload and don't know how to configure `innodb_thread_concurrency`.  Note, we still consider incorporating XtraDB optimizations, but as patches, rather than XtraDB as a whole, which no longer has numerous all-over-the-code improvements.

MariaDB의 공홈은 10.2버전부터 XtraDB를 사용하지 않는 이유를 이렇게 설명 합니다.

InnoDB의 성능이 XtraDB를 많이 따라잡았고, 더 이상 XtraDB의 개선점이 많지 않다. XtraDB를 개량하는데는 오랜 시간이 필요하며, InnoDB를 사용하는 것보다 XtraDB를 쓰는것이 이용자에 많은 이득을 가져다 주는 것이 아니기 때문에 라는 결정입니다.

특히, XtraDB 5.7의 유일한 개선점은 쓰기가 많은 I / O 바인딩 작업 부하 (innodb\_thread\_concurrency 컨트롤이 비활성화 된 경우)에 대한 것입니다.

적절한 innodb\_thread\_concurrency를 사용하면 XtraDB의 성능이 약간 향상됩니다. 쓰기가 많은 I / O 바인딩 InnoDB 작업 부하가 있고 innodb\_thread\_concurrency를 구성하는 방법을 모르는 소수의 사용자를 위해 10.2-GA버전의 릴리즈를 반년 넘게 지연시킬 마음이 없기 때문이라고 합니다.

그만큼 XtraDB를 버전업 하는것이 InnoDB를 릴리즈 하는것 보다 오래 걸리는것 같습니다.

현재 10.3 버전 이상의 MariaDB는 MariaDB만의 독립적인 릴리즈 단계에 접어들었다고 볼수 있습니다. MariaDB의 공식 홈페이지는 이렇게 설명하고 있습니다.

> **MariaDB 공식 홈페이지 설명:**
> In MariaDB 10.3.7 and later, the InnoDB implementation has diverged substantially from the InnoDB in MySQL. Therefore, in these versions, the InnoDB version is no longer associated with a MySQL release version.

무슨 뜻이냐면, MariaDB 10.3.7 이상의 버전에서의 InnoDB구현은 MySQL의 InnoDB 구현과 상당히 다르고, 따라서 앞으로의 InnoDB버전은 MySQL의 릴리즈 버전과 연관이 없음을 말하고 있습니다.

예전에는 MySQL을 할 줄 알면 MariaDB도 당연히 할 줄 아는것이라고 여겨졌지만, MySQL을 오라클이 인수한 후부터는 서로 조금은 다른 노선을 걷기 시작했고, 몇년후에는 두 DB의 차이가 훨씬 더 많이 벌어져서, MySQL을 할줄 안다고 MariaDB도 할 수 있다라고 말할 수 없는 시대가 올지도 모릅니다.
