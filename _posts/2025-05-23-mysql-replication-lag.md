---
date: 2025-05-23 14:53:45 +0900
title: "MySQL 복제지연"
category: mysql
excerpt: "MySQL 8.4 기준으로 복제 지연을 재는 방법과 지연에 영향을 주는 파라미터를 정리합니다."
updated: 2026-09-20
---

MySQL 복제 지연(replication lag)은 주 서버(source)에 반영된 변경이 보조 서버(replica)에 늦게 도착하거나 늦게 적용되는 현상입니다. 읽기 부하를 보조 서버로 분산한 구성에서는 지연이 그대로 오래된 데이터를 읽는 문제로 이어집니다.

이 글의 파라미터 이름과 기본값은 MySQL 8.4 LTS 기준입니다. 8.0 은 2026-04-21 부로 Oracle Sustaining Support 로 넘어갔고, 복제 관련 문장과 변수는 8.0 과 8.4 사이에서 이름과 기본값이 함께 바뀐 것이 많습니다.

## 복제 지연이 발생하는 이유

- 네트워크
- 디스크 I/O
- MySQL 설정(파라미터)

네트워크는 주 서버와 보조 서버 사이의 전송 거리, 회선 품질, 대역폭에 달린 문제입니다. 서버 운영자가 손댈 여지가 적으므로 네트워크 담당자나 클라우드 사업자의 가이드를 따르게 됩니다.

I/O 는 결국 디스크 성능에 좌우됩니다. 스토리지 등급을 올리거나 RAID 구성을 바꾸는 쪽으로 해결합니다.

세 번째인 MySQL 설정은 `my.cnf` 나 AWS RDS 의 파라미터 그룹에서 조정합니다. 이 글의 나머지는 여기에 해당합니다.

## 지연을 먼저 측정합니다

파라미터를 만지기 전에 지연을 재는 지표부터 정해야 합니다. 8.4 에서는 `SHOW SLAVE STATUS` 같은 옛 문장이 문법 오류가 되므로 `SHOW REPLICA STATUS` 를 씁니다. 필드 이름도 `Seconds_Behind_Source` 이고, 옛 이름 `Seconds_Behind_Master` 를 찾는 모니터링 스크립트는 함께 고쳐야 합니다.

```sql
SHOW REPLICA STATUS\G
```

`Seconds_Behind_Source` 는 꺼내 보기 편하지만 그대로 믿을 수 있는 값이 아닙니다. 공식 문서는 이 필드가 본질적으로 적용(applier) 스레드와 수신(receiver) 스레드 사이의 시간 차를 재는 값이며 빠른 네트워크에서만 유용하다고 적습니다. 네트워크가 느리면 적용 스레드가 느린 수신 스레드를 자주 따라잡아 버려서, 수신 스레드가 소스보다 한참 뒤처져 있어도 값이 0 으로 보입니다.

문서가 밝히는 나머지 제약입니다.

| 상황 | `Seconds_Behind_Source` |
| --- | --- |
| 처리 중인 이벤트가 없음 | `0` |
| 적용 스레드가 돌지 않음 | `NULL` |
| 릴레이 로그 소진 + 수신 스레드 정지 | `NULL` |
| 릴레이 로그 소진 + 수신 스레드 가동 | `0` |

- 소스와 보조 서버의 시계가 달라도, 수신 스레드가 시작할 때 계산한 차이가 그대로 유지되는 한 계산은 성립합니다. NTP 갱신을 포함한 시각 변경은 이 값을 덜 믿을 만한 것으로 만듭니다.
- 이벤트에 실린 타임스탬프는 최초 소스의 것이 보존됩니다. 3단 복제에서 중간 서버가 클라이언트 쓰기까지 함께 받으면, 마지막 이벤트가 최초 소스에서 온 것일 때와 중간 서버에서 생긴 것일 때가 섞여 값이 들쭉날쭉해집니다.
- 멀티스레드 복제에서는 이 값이 `Exec_Source_Log_Pos` 를 기준으로 하므로 가장 최근에 커밋된 트랜잭션을 반영하지 않을 수 있습니다.

멀티스레드 복제라면 `performance_schema.replication_applier_status_by_worker` 를 함께 봅니다. 워커마다 한 행이고, 트랜잭션이 최초 소스와 직전 소스에서 커밋된 시각, 이 워커가 적용을 시작하고 끝낸 시각이 따로 들어 있습니다.

```sql
SELECT CHANNEL_NAME, WORKER_ID,
       LAST_APPLIED_TRANSACTION_ORIGINAL_COMMIT_TIMESTAMP AS committed_on_source,
       LAST_APPLIED_TRANSACTION_END_APPLY_TIMESTAMP       AS applied_on_replica
FROM performance_schema.replication_applier_status_by_worker;
```

커밋 시각은 복제로 전달되지만 적용 시작·종료 시각은 보조 서버에서 수집합니다. 그래서 Performance Schema 를 끄면 적용 시각 칼럼이 0 으로 나옵니다. `APPLYING_TRANSACTION_START_APPLY_TIMESTAMP` 는 첫 시도 시각이므로, 오래 걸리는 트랜잭션을 볼 때는 `APPLYING_TRANSACTION_RETRIES_COUNT` 와 함께 읽어 재시도 때문인지 구분합니다.

> **NOTE** — `START REPLICA` 로 복제를 다시 시작하면 `APPLYING_TRANSACTION` 으로 시작하는 칼럼들이 초기화됩니다.

## 복제 지연에 영향을 주는 파라미터

### innodb_io_capacity 와 innodb_io_capacity_max

`innodb_io_capacity` 는 InnoDB 가 백그라운드 작업, 특히 버퍼 풀의 더티 페이지를 디스크로 플러시하는 작업에 쓸 수 있는 I/O 작업량의 기준입니다. 보조 서버가 변경을 적용하는 속도도 이 값에 달려 있어 복제 지연과 직접 이어집니다.

기본값이 8.0 과 8.4 사이에서 크게 바뀐 파라미터입니다.

| 파라미터 | 8.0 | 8.4 |
| --- | --- | --- |
| `innodb_io_capacity` | 200 | 10000 |
| `innodb_io_capacity_max` | 최소 2000 | `innodb_io_capacity` 의 2배 |

8.4 문서는 기본값 10000 이면 일반적으로 충분하고, `innodb_io_capacity_max` 의 기본값인 2배가 대부분의 작업 부하를 겨냥한 값이라고 적습니다. 8.0 에서 쓰던 "기본값 200 에서 시작해 올린다"는 절차를 8.4 에 그대로 옮기면 값을 오히려 내리는 셈이 됩니다.

올리고 내리는 판단 기준은 디스크의 IOPS 정격이 아니라 증상입니다.

- 체크포인트 때문에 처리량이 주기적으로 떨어지면 `innodb_io_capacity` 를 올립니다. 더 자주 플러시해서 밀린 작업이 쌓이지 않게 합니다.
- 플러시가 밀리지 않는다면 실용적인 선에서 낮게 유지합니다. `SHOW ENGINE INNODB STATUS` 에서 히스토리 리스트 길이가 수천 아래이고, 버퍼 풀의 변경된 페이지 비율이 `innodb_max_dirty_pages_pct` 보다 꾸준히 낮고, `Log sequence number - Last checkpoint` 가 로그 전체 크기의 7/8 보다 작으면 내릴 여지가 있습니다.

값을 정한 뒤에는 Performance Schema 와 모니터링 도구로 복제 지연과 디스크 I/O 사용률을 함께 관측해 확인합니다.

### RDS 의 스토리지 타입에 따른 IOPS 상한

AWS RDS 라면 볼륨이 낼 수 있는 IOPS 가 상한입니다. IOPS 는 초당 데이터 전송량을 블록 크기로 나눈 값이고, 블록 크기는 엔진마다 다릅니다. InnoDB 의 기본 페이지 크기는 16KB 이고, PostgreSQL 의 기본 블록 크기는 8KB 입니다.

#### gp2

gp2 는 IOPS 를 직접 지정할 수 없습니다. 1 GiB 당 3 IOPS 로 스토리지 크기가 성능을 결정하고, 최소값은 100 IOPS 입니다. MariaDB·MySQL·PostgreSQL 기준입니다.

| 스토리지 크기 | 기준 IOPS | 기준 처리량 | 버스트 IOPS |
| --- | --- | --- | --- |
| 5–399 GiB | 100–1,197 | 128–250 MiB/s | 3,000 |
| 400–1,335 GiB | 1,200–4,005 | 512–1,000 MiB/s | 12,000 |
| 1,336–3,999 GiB | 4,008–11,997 | 1,000 MiB/s | 12,000 |
| 4,000–65,536 GiB | 12,000–64,000 | 1,000 MiB/s | 해당 없음 |

1,000 GiB 미만 볼륨은 I/O 크레딧이 남아 있는 동안 버스트할 수 있습니다. 4,000 GiB 이상에서는 기준 성능이 버스트 성능을 넘어서므로 버스트가 의미를 잃습니다. 400 GiB 이상이면 볼륨 네 개로 스트라이핑되어 기준 처리량과 버스트 IOPS 가 네 배가 됩니다.

#### gp3

gp3 는 크기와 성능을 따로 정합니다. 기준 성능은 3,000 IOPS·125 MiB/s 이고, 400 GiB 를 넘으면 스트라이핑이 적용되어 기준선 자체가 올라갑니다. Db2·MariaDB·MySQL·PostgreSQL 기준입니다.

| 스토리지 크기 | 기준 성능 | 프로비저닝 IOPS | 프로비저닝 처리량 |
| --- | --- | --- | --- |
| 20–399 GiB | 3,000 IOPS · 125 MiB/s | 지정 불가 | 지정 불가 |
| 400–65,536 GiB | 12,000 IOPS · 500 MiB/s | 12,000–64,000 | 500–4,000 MiB/s |

추가 성능은 400 GiB 이상에서만 지정할 수 있습니다. MariaDB 와 MySQL 에서 IOPS 를 32,000 위로 올리면 처리량 값이 500 MiB/s 에서 자동으로 함께 올라갑니다. 예를 들어 IOPS 를 40,000 으로 두면 처리량이 최소 625 MiB/s 가 됩니다. 처리량과 IOPS 의 비율은 최대 0.25 입니다.

스토리지 크기가 최대 IOPS 를 결정하므로, 볼륨이 낼 수 없는 값을 `innodb_io_capacity` 에 적어도 의미가 없습니다. 실제 WriteIOPS 를 먼저 관측하고 그 범위 안에서 정합니다. 인스턴스 클래스에도 EBS 대역폭 상한이 있어, 볼륨에 지정한 값을 인스턴스가 못 받아 줄 수 있습니다.

> **NOTE** — 위 수치는 [Amazon RDS DB 인스턴스 스토리지](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html) 문서 기준입니다. gp2·gp3 는 범용 SSD 이고, 프로비저닝 IOPS 계열인 io1·io2 Block Express 는 상한이 더 높습니다(io2 는 최대 256,000 IOPS). 스토리지 타입을 혼동하면 낼 수 없는 IOPS 를 기대하게 됩니다.

### replica_parallel_workers

8.4 문서가 쓰는 이름은 `replica_parallel_workers` 입니다. `slave_parallel_workers` 는 옛 이름입니다.

값이 0 이면 보조 서버는 적용 스레드 하나로 릴레이 로그를 읽어 트랜잭션을 실행합니다. 1 이상이면 워커 스레드가 그 수만큼 생기고, 릴레이 로그에서 트랜잭션을 순서대로 읽어 워커에 배분하는 코디네이터 스레드가 하나 더 붙습니다. 이 상태를 멀티스레드 복제라고 부릅니다. 복제 채널을 여러 개 쓰면 채널마다 이 수만큼 스레드가 생깁니다.

워커를 늘리면 보조 서버의 CPU 를 그만큼 더 씁니다. 코어가 적은 인스턴스를 읽기 복제로 쓰면서 워커 수를 올리면 적용이 빨라지기 전에 CPU 가 먼저 포화됩니다. RDS·Aurora 는 이 값을 파라미터 그룹에서 관리하므로, 인스턴스 크기를 바꿀 때 파라미터 그룹에 적용된 값을 함께 확인해야 합니다.

병렬 적용을 제어하던 변수들은 정리가 끝났습니다.

| 변수 | 상태 |
| --- | --- |
| `binlog_transaction_dependency_tracking` | 8.2.0 deprecated, 8.4.0 제거 |
| `transaction_write_set_extraction` | 8.3.0 제거 |
| `replica_parallel_type` | 9.7 제거 |

`binlog_transaction_dependency_tracking` 이 사라진 자리에는 writeset 기반 동작이 내부화되어 남았습니다. 8.4 의 writeset 기반 의존성 추적은 `binlog_format=ROW` 를 요구하며 `MIXED` 는 더 이상 지원되지 않습니다. `binlog_transaction_dependency_history_size` 는 9.5.0 에서 기본값이 25000 에서 1000000 으로, 최대값이 10000000 으로 올랐습니다. 옛 옵션 파일에 이 변수들이 남아 있으면 제거된 이름 때문에 기동이 실패하므로 업그레이드 전에 걷어내야 합니다.

### 그 밖에 복제 지연에 영향을 줄 수 있는 파라미터

#### sync_binlog 와 innodb_flush_log_at_trx_commit

두 값 모두 기본값이 1 이고, 이 조합이 가장 안전하면서 가장 느립니다. 공식 문서는 `sync_binlog` 를 두고 가장 안전한 값은 기본값인 1 이지만 동시에 가장 느리다고 적습니다. `sync_binlog` 를 1 보다 큰 N 으로 두면 커밋 그룹 N 개마다 디스크와 동기화합니다.

보조 서버에서 이 조합을 내리면 적용 커밋이 빨라질 수 있지만, 이것은 장애 시점의 유실 범위를 성능과 바꾸는 거래입니다. 감당할 유실 범위를 먼저 정한 다음 값을 고릅니다. Aurora MySQL 버전 3 에서는 `innodb_flush_log_at_trx_commit` 을 1 이 아닌 값으로 바꾸려면 `innodb_trx_commit_allow_data_loss` 를 먼저 1 로 설정해야 하고, 그것은 데이터 유실 위험을 인정한다는 뜻입니다.

#### log_replica_updates

보조 서버가 적용한 복제 이벤트를 자신의 바이너리 로그에도 남길지 결정합니다. 옛 이름은 `log_slave_updates` 입니다. 8.4 에서는 바이너리 로깅이 기본으로 켜져 있고, 그 경우 복제 갱신 로깅도 기본 동작입니다. 보조 서버를 다시 소스로 쓰는 다단 구성에서는 켜 두어야 합니다. 반대로 이 서버가 소스 역할을 하지 않고 장애 때 소스를 세울 다른 방법이 있다면, 문서는 이 값을 끄는 선택을 제시합니다.

#### innodb_buffer_pool_size

적용할 페이지가 버퍼 풀에 없으면 적용 스레드가 매번 디스크에서 읽어야 하므로 지연이 커집니다. 기본값은 128MB 이고 `SET GLOBAL` 로 재시작 없이 늘릴 수 있습니다. 단 값은 `innodb_buffer_pool_chunk_size` 와 `innodb_buffer_pool_instances` 의 곱의 배수여야 하며, 맞지 않으면 서버가 자동으로 올려 맞춥니다. 전용 서버라면 `innodb_dedicated_server` 로 자동 산정하게 하는 방법도 있습니다.

#### innodb_flush_method

InnoDB 가 데이터와 로그를 디스크에 쓸 때 쓰는 방식입니다. 8.4 의 리눅스 기본값은 지원되면 `O_DIRECT`, 아니면 `fsync` 입니다(8.0 은 `fsync`). 동적 변경이 불가하므로 초기 구축 때 정해야 합니다. 8.4 부터는 `--innodb-dedicated-server` 가 이 값을 자동으로 설정하지 않습니다.

#### relay_log_space_limit

릴레이 로그 전체가 쓸 수 있는 최대 용량입니다. 기본값은 0 이고 제한이 없다는 뜻입니다. 값을 준다면 `max_relay_log_size`(이 값이 0 이면 `max_binlog_size`)의 2배보다 작게 잡지 말라고 문서가 적습니다.

#### innodb_thread_concurrency

InnoDB 안에서 동시에 실행되는 스레드 수를 제한합니다. 기본값은 0 이고 제한이 없다는 뜻입니다. 문서는 대부분의 작업 부하가 제한 없이도 잘 돌아간다고 적고, 제한을 걸기 전에 멀티코어 성능에 영향을 주는 다른 설정을 먼저 보라고 권합니다. 복제 지연을 이 값으로 푸는 경우는 드뭅니다.

#### 리두 로그 용량

`innodb_log_file_size` 와 `innodb_log_files_in_group` 은 8.0.30 에서 deprecated 됐습니다. 지금은 `innodb_redo_log_capacity` 로 정하고 기본값은 100MB 입니다. `innodb_redo_log_capacity` 가 정의되지 않은 상태에서 옛 두 변수만 남아 있으면 리두 용량이 두 값의 곱으로 계산되므로, 예전 옵션 파일을 그대로 옮겨 오면 의도하지 않은 용량이 잡힙니다.

#### innodb_flush_neighbors

플러시할 때 인접한 페이지를 함께 플러시할지 결정합니다. 회전형 디스크를 위한 최적화이고 기본값은 비활성입니다. 비회전형 스토리지이거나 회전형과 섞여 있는 구성에서는 끄라고 문서가 적습니다.

## 정리

복제 지연은 파라미터를 먼저 만져서 줄이는 대상이 아닙니다. `SHOW REPLICA STATUS` 와 `performance_schema.replication_applier_status_by_worker` 로 지연이 수신 구간에서 생기는지 적용 구간에서 생기는지 가른 다음, 네트워크·디스크·설정 가운데 어디를 볼 차례인지 정합니다. 설정 차례가 오면 8.4 의 이름과 기본값을 기준으로 봐야 합니다. `innodb_io_capacity` 는 기본값이 10000 이 되었고, `slave_parallel_workers` 는 `replica_parallel_workers` 이며, 병렬 적용의 의존성 추적 변수들은 제거됐습니다. 각 값은 하드웨어 사양, 네트워크 환경, 애플리케이션 요구에 따라 다르므로 실제 환경에서 관측하며 정합니다.
