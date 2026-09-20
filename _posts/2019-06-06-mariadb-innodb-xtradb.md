---
date: 2019-06-06 23:22:31 +0900
title: "MariaDB의 InnoDB 엔진, XtraDB엔진"
category: mysql
excerpt: "MariaDB 는 10.1 까지 XtraDB 를 기본 엔진으로 썼고 10.2 부터 InnoDB 로 돌아왔습니다. 그 배경과 InnoDB 설정들이 현행 MariaDB 에서 어떻게 바뀌었는지 정리합니다."
last_modified_at: 2026-09-20
---

MariaDB 는 5.5 부터 10.1 까지 Percona 의 XtraDB 를 기본 스토리지 엔진으로 썼고, 10.2 부터 다시 InnoDB 로 돌아왔습니다. 지금은 XtraDB 가 표준 배포에 포함되지 않습니다. 이 글은 InnoDB 가 MySQL 5.5 에서 5.6 으로 넘어가며 얻은 기능들을 정리하고, 그 기능들이 현행 MariaDB 에서 어떤 설정으로 남았는지, XtraDB 가 왜 물러났는지를 짚습니다.

## InnoDB의 기능

MySQL 5.5 에서 5.6 으로 올라가면서 InnoDB 스토리지 엔진에는 통계 정보 관리, 플러시 스레드, 페이지 크기 등 여러 변화가 있었습니다. 여기서 소개하는 설정 이름 중 일부는 이후 버전에서 폐기되거나 제거됐으므로, 각 항목에 현행 기준을 함께 적었습니다.

### 통계 정보

MySQL 5.6 의 InnoDB 는 각 테이블의 통계 정보를 테이블로 관리하도록 보완되었습니다. 테이블의 전체 레코드 수나 인덱스별 Cardinality 정보를 `mysql` 데이터베이스의 `innodb_index_stats`, `innodb_table_stats` 테이블에 담습니다. 이 정보를 자동으로 다시 계산할지 사용자가 정할 수 있도록 `innodb_stats_auto_recalc` 파라미터도 추가되었습니다. 다만 통계 정보가 메모리에서 디스크 기반 테이블로 옮겨간 것이지, 통계 자체가 정교해진 것은 아닙니다.

MariaDB 는 10 버전부터 스토리지 엔진이 아니라 서버 차원에서 통계를 관리합니다. 공식 문서는 이를 엔진 독립 통계(engine-independent table statistics)라고 부르며, 통계는 `mysql.table_stats`, `mysql.column_stats`, `mysql.index_stats` 세 테이블에 저장됩니다. 인덱스가 걸리지 않은 칼럼의 값 분포와 히스토그램도 여기서 다룹니다. 단, BLOB·TEXT 칼럼의 통계는 수집하지 않습니다.

`use_stat_tables` 의 기본값은 `preferably_for_queries` 입니다. 통계가 수집되어 있으면 옵티마이저가 그것을 우선 쓰지만, 수집 자체는 기본으로 일어나지 않습니다. 쓰려면 `ANALYZE TABLE` 로 직접 채워야 합니다.

### 데이터 읽기 최적화

MySQL 5.6 은 Index Condition Pushdown(ICP) 과 Multi Range Read(MRR) 를 위해 서버의 핸들러 API 를 손봤습니다. 이 기능들이 동작하려면 스토리지 엔진이 해당 핸들러 API 를 구현해야 합니다. InnoDB 와 MyISAM 은 ICP·MRR API 를 구현하고 있어 두 최적화를 쓸 수 있습니다. 다른 엔진이 ICP·MRR 을 쓸 수 있는지는 공식 매뉴얼에서 엔진별로 확인해야 합니다.

### 커널 뮤텍스

InnoDB 는 버퍼 풀의 각 블록, redo 로그처럼 공유 메모리 객체를 많이 들고 있습니다. 여러 클라이언트 커넥션이 이 객체들을 서로 경쟁하며 점유하고 해제하면서 쿼리를 처리하므로, 동시에 점유하지 못하도록 동기화 잠금이 필요합니다. 잠금은 뮤텍스(상호 배제)나 세마포어(자원 카운팅)로 구현됩니다.

모든 공유 메모리 객체가 각자 잠금을 갖지는 않습니다. 개별로 관리하면 잠금 관리가 복잡해지므로, 경합이 심한 구간에서 하나의 잠금으로 여러 메모리 구조체를 함께 묶는 경우가 있었습니다. 그 대가로 필요 없는 lock wait 가 생겼습니다. 대표적인 예가 `kernel_mutex` 입니다. 이 뮤텍스는 무엇 때문에 잠금이 걸렸는지 구분하기 어려운 공통 뮤텍스였고, 용도에 맞는 뮤텍스나 세마포어가 없을 때 두루 쓰였기 때문에 InnoDB 의 병목과 확장성 저해를 일으키는 큰 원인이었습니다. MySQL 5.6 부터는 용도별로 잠금을 세분화했고, 트랜잭션 동시성 제어와 MVCC 관련 메모리 구조체는 각각의 Read Write Lock 으로 제어하도록 바뀌었습니다.

### 멀티스레드 purge

InnoDB 는 다중 버전 동시성 제어(MVCC) 와 롤백을 위해 undo 공간을 따로 관리합니다. UPDATE 를 실행하면 커밋이나 롤백을 수행하기 전에 변경 전 데이터를 여기에 남겨 둡니다. 새 undo 로그를 쌓으려면 더 이상 필요 없는 오래된 undo 데이터를 지워야 하는데, 이 작업을 undo purge 라고 합니다.

MySQL 5.5 까지는 undo purge 에 스레드 하나만 썼습니다. 5.6 부터는 `innodb_purge_threads` 로 purge 스레드 수를 지정해 여러 스레드로 처리할 수 있습니다. UPDATE 가 많은 데이터베이스라면 이 값을 조정할 여지가 있습니다.

### 독립된 플러시 스레드

사용자가 DML(INSERT·UPDATE·DELETE) 을 실행하면 변경 내용이 먼저 redo 로그에 기록되어 디스크에 남습니다. 실제 테이블 데이터는 InnoDB 버퍼 풀에서만 변경됩니다. 여기까지 끝나면 서버는 사용자에게 쿼리가 완료되었다고 응답합니다. 버퍼 풀에서만 바뀐 이 데이터는 언젠가 디스크에 기록해야 합니다. 이때 버퍼 풀에서 변경된 페이지를 더티 페이지라고 하고, 더티 페이지를 디스크에 기록하는 작업을 플러시라고 합니다.

InnoDB 가 버퍼 풀에서 다루는 단위는 페이지이며 기본 크기는 16KB 입니다. 다른 작업이 밀려 더티 페이지가 제때 플러시되지 못하면 문제가 커집니다. 그래서 MySQL 5.6 부터는 플러시 전용 스레드를 따로 두었습니다.

### 가변 페이지 크기

페이지 크기는 `innodb_page_size` 로 지정하고 기본값은 16KB 입니다. MariaDB 공식 문서는 4KB 부터 64KB 까지의 페이지 크기를 다룹니다. 작은 레코드를 두세 건씩 빈번히 읽는 워크로드라면 16KB 가 과한 단위일 수 있습니다. 한 번에 읽고 쓰는 양이 페이지 크기만큼이기 때문입니다. HDD 는 헤드가 움직이는 시간이 길고 일단 위치를 잡으면 연속된 데이터를 이어서 읽으므로 페이지 크기의 영향이 작습니다. 탐색 시간이 거의 없는 SSD 에서는 페이지 크기가 곧 전송량이라 영향이 더 직접적입니다.

다만 특정 값이 항상 빠르다고 단정할 근거는 없습니다. 공식 문서가 명시하는 제약은 두 가지입니다. 4KB 나 8KB 페이지에서는 인덱스 키의 최대 길이가 그만큼 줄어듭니다. 그리고 페이지 크기가 다른 인스턴스끼리는 데이터 파일과 로그 파일을 공유할 수 없습니다. 한 번 정하면 되돌리기 어려운 값이므로 워크로드를 측정해 결정해야 합니다.

### 독립된 undo 스페이스

MySQL 5.5 까지 InnoDB 의 undo 공간은 시스템 테이블스페이스의 일부였습니다. undo 영역은 주로 랜덤 I/O 로 동작하는데, 순차 I/O 로 기록하는 Insert Buffer 와 DoubleWrite Buffer 가 같은 시스템 테이블스페이스를 함께 쓰고 있었습니다. MySQL 5.6 부터는 undo 영역을 별도 공간으로 분리하는 파라미터가 생겼습니다.

- `innodb_undo_directory`: undo 테이블스페이스 파일을 둘 디렉터리입니다. 지정하지 않으면 데이터 디렉터리를 씁니다.
- `innodb_undo_tablespaces`: undo 를 몇 개의 테이블스페이스로 나눌지 정합니다. 각 테이블스페이스는 10MB 로 시작해 필요한 만큼 커집니다. MariaDB 11.0 부터는 기본값이 3 이라 여러 undo 테이블스페이스가 처음부터 켜져 있습니다.
- `innodb_undo_logs`: 롤백 세그먼트 개수를 기본 128 개보다 줄여 동시 쓰기 트랜잭션 수를 제한하는 설정이었습니다. MariaDB 10.5 에서 폐기되어 무시되고, 10.6 에서 제거됐습니다. 롤백 세그먼트는 언제나 최대 개수를 쓰는 것이 낫다는 판단입니다. 현행 MariaDB 는 항상 128 개를 씁니다.

undo 영역은 가장 빠른 디스크 볼륨에 두는 것이 좋습니다.

### 버퍼 풀 덤프와 적재

데이터베이스를 재구동하면 버퍼 풀이 비워집니다. 자주 쓰는 데이터를 다시 버퍼에 올리기 전까지는 동작이 느려지고, 버퍼 풀이 큰 서버에서는 서비스 개시 자체가 지연되기도 합니다. MySQL 5.6 이 버퍼 풀 워밍업 기능을 탑재하기 전에, MariaDB 5.5 와 Percona Server 5.5 는 XtraDB 를 통해 이미 같은 기능을 제공하고 있었습니다. 종료할 때 버퍼 풀 내용을 파일로 덤프해 두고, 재구동할 때 그 파일을 읽어 자동으로 버퍼 풀을 채우는 방식입니다.

버퍼 풀이 100GB 라고 덤프가 100GB 가 되지는 않습니다. 버퍼 풀에 올라와 있던 페이지의 번호만 모아 순서대로 정렬해 기록합니다. 정렬하는 이유는 재구동 시 해당 데이터 페이지를 랜덤 I/O 가 아니라 순차 I/O 로 한 번에 읽어 들이기 위함입니다.

XtraDB 시절의 MariaDB 에서는 수동 덤프와 적재를 다음과 같은 SQL 로 실행했습니다.

```sql
select * from information_schema.XTRADB_ADMIN_COMMAND /*!XTRA_LRU_DUMP*/;
select * from information_schema.XTRADB_ADMIN_COMMAND /*!XTRA_LRU_RESTORE*/;
```

이 명령은 XtraDB 가 제공하던 인터페이스라 XtraDB 를 쓰던 10.1 이하에서만 동작합니다. 현행 MariaDB 와 MySQL 은 SQL 명령이 아니라 시스템 변수로 덤프와 적재를 제어합니다.

```sql
SET GLOBAL innodb_buffer_pool_dump_now = ON;
SET GLOBAL innodb_buffer_pool_load_now = ON;
```

- `innodb_buffer_pool_dump_now`: ON 으로 바꾸면 즉시 덤프합니다. 조회하면 값은 항상 OFF 입니다.
- `innodb_buffer_pool_load_now`: ON 으로 바꾸면 즉시 덤프를 적재합니다.
- `innodb_buffer_pool_dump_at_shutdown`: 서버를 종료할 때 자동으로 덤프합니다.
- `innodb_buffer_pool_load_at_startup`: 서버를 구동할 때 자동으로 덤프를 적재합니다.
- `innodb_buffer_pool_load_abort`: ON 으로 바꾸면 진행 중인 적재를 중단합니다.
- `innodb_buffer_pool_filename`: 덤프 파일 이름을 지정합니다.

적재 도중에 쿼리가 들어오면 적재와 쿼리가 서로 느려질 수 있습니다. XtraDB 는 적재 중 쿼리 실행을 막는 `innodb_blocking_buffer_pool_restore` 를 제공했지만, XtraDB 와 함께 사라졌습니다. 현행 MariaDB 에서 쓸 수 있는 통제 수단은 적재를 중단시키는 `innodb_buffer_pool_load_abort` 입니다.

오라클에도 자주 쓰는 테이블을 버퍼에 상주시키는 KEEP 버퍼 풀 기능이 있습니다. 목적은 비슷하지만, 덤프와 적재는 재구동 시점의 워밍업을 자동화하는 쪽에 가깝습니다.

### redo 로그 크기

InnoDB 는 서버가 비정상 종료해도 데이터를 지키면서 성능을 내기 위해, 커밋된 트랜잭션 내용을 먼저 로그 파일에 기록하고 실제 데이터 파일 변경은 나중에 모아서 처리합니다. 이때 쓰는 로그가 redo 로그이고, PostgreSQL 에서 부르는 WAL(Write Ahead Log) 과 같은 개념입니다.

현행 MariaDB 의 redo 로그는 `ib_logfile0` 파일 하나입니다. 10.5 이전에는 `ib_logfileN` 여러 파일에 나뉘어 있었습니다. 관련된 설정은 다음과 같습니다.

- `innodb_log_file_size`: redo 로그 용량을 정합니다. 파일이 하나이므로 이 값 하나로 용량이 결정됩니다. MariaDB 10.9 부터는 동적 변수라 서버를 재시작하지 않고 크기를 조정할 수 있습니다. 다음 기동에도 유지하려면 설정 파일에 함께 적어야 합니다.
- `innodb_log_files_in_group`: 로그 파일 개수를 정하던 설정입니다. MariaDB 10.5.2 에서 폐기되어 무시되고, 10.6.0 에서 제거됐습니다.
- `innodb_log_group_home_dir`: redo 로그를 둘 디렉터리입니다. 지정하지 않으면 데이터 디렉터리에 만듭니다.

헤더와 체크포인트 영역 12288 바이트, 그리고 10% 의 여유분이 빠지므로 실제로 쓸 수 있는 용량은 `(innodb_log_file_size - 12288) * 0.9` 입니다. 유효한 `ib_logfile0` 의 최소 크기는 12304 바이트이고, 그보다 작으면 서버가 `File ./ib_logfile0 is too small` 을 내고 기동하지 못합니다.

MySQL 쪽은 다른 길로 갔습니다. MySQL 8.4 는 redo 로그 총량을 `innodb_redo_log_capacity` 로 지정하고, `innodb_log_file_size` 와 `innodb_log_files_in_group` 은 이 값이 설정되지 않았을 때 용량을 계산하는 보조 수단으로만 쓰입니다. InnoDB 는 총량의 1/32 크기인 파일 32 개를 유지하려고 합니다. 같은 이름의 설정이 두 제품에서 다른 의미를 갖게 된 셈입니다.

> **NOTE** — bin 로그와 InnoDB redo 로그를 혼동하는 경우가 있습니다. InnoDB 의 redo 로그가 오라클의 redo 로그에 대응하는 쪽이고, bin 로그는 복제를 위한 로그입니다. bin 로그는 redo 로그와 달리 성능을 위해 비동기로 디스크에 기록하도록 설정하는 경우가 많습니다.

### 데드락 이력 조회

MySQL 5.5 이하의 InnoDB 에서는 데드락이 발생해도 `SHOW ENGINE INNODB STATUS` 의 데드락 섹션에서만 볼 수 있었습니다. 데드락이 여러 번 발생하면 앞의 이력은 사라지고 마지막 것만 남았습니다. MySQL 5.6 부터는 `innodb_print_all_deadlocks` 로 모든 데드락을 서버 에러 로그에 기록할 수 있습니다.

이 밖에도 InnoDB 에는 다룰 기능이 많습니다. 글이 길어지므로 나머지는 다른 글로 남기겠습니다.

## XtraDB

XtraDB 는 Percona 가 InnoDB 소스 코드를 개량해 만든 스토리지 엔진입니다. Percona 는 MySQL 을 개발했던 사람들이 2006년에 만든 회사로, MySQL 의 부족한 점을 보완한 Percona Server 를 오픈소스로 제공하면서 컨설팅과 유지보수를 함께 합니다.

XtraDB 는 MySQL 에는 포함되지 않았고 Percona Server 와 MariaDB 에서만 쓸 수 있었습니다. InnoDB 소스를 고쳐 만든 것이라 온디스크 포맷이 InnoDB 와 동일할 정도로 호환됐습니다. InnoDB 의 트랜잭션 지원과 MVCC 구조를 그대로 유지하면서 확장성과 튜닝·모니터링 지표를 보강한 것이 XtraDB 였습니다. MariaDB 의 XtraDB 와 Percona Server 의 XtraDB 는 버전별로 차이가 있었고, Percona Server 쪽 기능 중 MariaDB 로 넘어오지 못한 것도 있었습니다. 한편 Percona 가 함께 제공하는 스트리밍 백업 도구 Xtrabackup 은 MariaDB 에서도 쓸 수 있는 도구였고, Galera Cluster 도 동기화 방식으로 rsync 와 함께 xtrabackup 을 지원합니다.

MariaDB 공식 문서는 "Until MariaDB 10.1, MariaDB used the XtraDB storage engine as default" 라고 적습니다. 10.1 이하에서 다음 명령으로 조회하면 InnoDB 가 두 종류로 나옵니다. 하나는 라이브러리가 비어 있고, 다른 하나는 `ha_xtradb.so` 를 가리킵니다.

```sql
show plugins soname;
```

설정 파일에서 플러그인을 `ha_xtradb.so` 로 지정하면 XtraDB 엔진을 InnoDB 라는 이름으로 쓸 수 있었습니다. MySQL 이 5.1 에서 5.5 로 넘어가는 동안 XtraDB 가 먼저 많은 개선을 담았기 때문에, 당시에는 XtraDB 를 쓰는 편이 유리했습니다.

10.2 부터 상황이 바뀌었습니다. MariaDB 10.2 는 InnoDB 를 기본 스토리지 엔진으로 되돌렸고, 공식 문서는 "XtraDB in 10.2 is not up to date with the latest features of InnoDB and cannot be used" 라고 적습니다. 온디스크 포맷이 같으므로 업그레이드할 때 데이터 파일은 문제가 되지 않았습니다. MariaDB 공식 문서는 그 판단의 근거를 이렇게 설명했습니다.

> Keeping InnoDB (or XtraDB) up to date with MySQL (Percona) is a complex task. It took us more than half a year to migrate from InnoDB-5.6 to InnoDB-5.7 in 10.2. … XtraDB had many great improvements over InnoDB in 5.1 and 5.5. But over time, MySQL has implemented almost all of them. InnoDB has caught up and XtraDB is only marginally better. Not enough to justify a multi-month merge that would delay 10.2-GA for everyone.

정리하면 InnoDB 가 XtraDB 의 개선점을 대부분 흡수했고, 남은 차이는 XtraDB 병합에 드는 수개월을 정당화할 만큼 크지 않다는 판단입니다. MariaDB 가 지목한 마지막 차이는 `innodb_thread_concurrency` 제어를 끈 상태의 쓰기 집중·I/O 바운드 워크로드였습니다. 이 값을 제대로 설정하면 XtraDB 의 우위는 미미했습니다. 참고로 MariaDB 10.5 는 `innodb_thread_concurrency` 를 제거·폐기 대상 변수 목록에 올렸습니다. 두 엔진의 성능 차이를 가르던 설정 자체가 유지 대상에서 빠진 것입니다.

지금 기준으로 XtraDB 의 위치는 분명합니다. MariaDB 공식 문서는 XtraDB 가 예전에는 MariaDB 의 기본 InnoDB 대체 엔진이었지만 "no longer included in standard distributions" 라고 적고, "MariaDB now uses InnoDB by default" 라고 못 박습니다. 즉 지금 MariaDB 를 설치하면 선택의 문제가 아니라 InnoDB 만 있습니다. XtraDB 를 다루는 문서는 표준 배포에 XtraDB 가 포함되던 과거 버전을 위한 안내로 남아 있습니다.

## MariaDB 와 MySQL 의 거리

XtraDB 를 기본으로 쓰던 MariaDB 시리즈는 모두 지원이 끝났습니다. 5.5 는 2020년 4월 11일, 10.1 은 2020년 10월 17일에 종료됐습니다. InnoDB 로 돌아온 10.2 도 2022년 5월 23일에 끝났고, 10.3 은 2023년 5월 25일, 10.4 는 2024년 6월 18일, 10.5 는 2025년 6월 24일에 종료됐습니다. 10.6 은 커뮤니티 빌드 기준으로 2026년 7월 6일에 지원 구간이 닫혔습니다.

MariaDB 재단이 공개한 유지보수 정책 기준으로, 커뮤니티 빌드가 유지되는 LTS 시리즈는 다음과 같습니다.

| 시리즈 | GA | 커뮤니티 지원 종료 |
| --- | --- | --- |
| 12.3 LTS | 2026-05-28 | 2029-06-12 |
| 11.8 LTS | 2025-06-04 | 2028-06-04 |
| 11.4 LTS | 2024-05-29 | 2029-05-29 |
| 10.11 LTS | 2023-02-16 | 2028-02-16 |

LTS 사이에는 분기마다 롤링 릴리스가 나오고 지원 기간이 짧습니다. 13.0 은 2026년 5월에 나와 2026년 4분기에 끝나고, 13.1 은 2026년 9월에 나왔습니다. 프로덕션이라면 LTS 시리즈를 쓰는 편이 안전합니다.

버전 지원만 갈라진 것이 아닙니다. InnoDB 구현 자체가 갈라졌습니다. MariaDB 10.3.7 이후로는 InnoDB 버전을 MySQL 릴리스와 짝지어 표기하지 않습니다. 공식 문서의 설명은 이렇습니다.

> The InnoDB implementation has diverged substantially from the InnoDB in MySQL. Therefore, in these versions, the InnoDB version is no longer associated with a MySQL release version.

엔진 밖에서도 차이가 쌓였습니다. JSON 은 MariaDB 가 텍스트로 저장하고 문자열로 비교하는 반면 MySQL 은 패킹된 바이너리 형식을 쓰고 JSON 값으로 비교합니다. 공식 문서는 MariaDB 가 MySQL 5.7 의 패킹된 JSON 객체를 지원하지 않는다고 적습니다. GTID 도 형식과 관련 시스템 변수가 달라 MariaDB 의 GTID 는 MySQL 과 호환되지 않고, MySQL 의 그룹 복제와 MariaDB 의 Galera Cluster 도 서로 호환되지 않습니다. 인증 플러그인 구성도 다릅니다. MariaDB 는 ed25519 와 PARSEC 을 제공하고, MySQL 의 `caching_sha2_password` 는 MySQL 사용자를 비밀번호 그대로 옮겨 오기 위한 마이그레이션 용도로 둡니다. 이 밖에 X 프로토콜, `RENAME INDEX`, InnoDB 용 `CREATE TABLESPACE`, MySQL 5.7 이후 개편된 `performance_schema` 와 `sys` 스키마처럼 MariaDB 에 없는 MySQL 기능이 있고, Spider 나 동적 칼럼처럼 MySQL 에 없는 MariaDB 기능도 있습니다.

MySQL 을 안다고 MariaDB 를 안다고 말할 수 있던 시기는 지났습니다. 두 제품은 이제 버전 체계도, 지원 기간도, 같은 이름을 가진 설정의 의미도 따로 갑니다. 마이그레이션이나 운영 자동화를 설계할 때는 어느 쪽 문서를 보고 있는지부터 확인해야 합니다.
