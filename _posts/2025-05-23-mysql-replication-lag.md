---
date: 2025-05-23 14:53:45 +0900
title: "MySQL 복제지연"
category: mysql
excerpt: "MySQL 8.4의 복제 중단·수신 지연·적용 지연을 구분하고, 대형 트랜잭션·잠금·병렬 복제·스토리지 병목과 쓰기 직후 읽기 문제를 진단합니다."
last_modified_at: 2026-09-20
---

MySQL 복제 지연(replication lag)은 주 서버(source)에 반영된 변경이 보조 서버(replica)에 늦게 도착하거나 늦게 적용되는 현상입니다. 읽기 부하를 보조 서버로 분산한 구성에서는 지연이 그대로 오래된 데이터를 읽는 문제로 이어집니다.

이 글의 파라미터 이름과 기본값은 **MySQL 8.4 LTS의 비동기 binlog 복제** 기준입니다. SQL 예제와 워커 수 변경, GTID 대기는 MySQL Community Server 8.4.11의 소스·보조 서버 구성에서 확인했습니다. RDS와 Aurora는 지원 버전·파라미터 적용 방법·복제 구조를 따로 확인해야 합니다.

## 먼저 복제 구조를 구분합니다

| 구성 | 이 글을 적용할 범위 | 대표 지표 |
| --- | --- | --- |
| 직접 운영하는 MySQL binlog 복제 | 수신·적용 스레드, 워커, 릴레이 로그 진단 | `SHOW REPLICA STATUS`, Performance Schema |
| RDS for MySQL 읽기 복제본 | binlog 복제 진단과 RDS 스토리지·인스턴스 지표 | `ReplicaLag`, I/O·CPU 지표 |
| 같은 Aurora 클러스터의 Reader | 공유 클러스터 볼륨을 사용하는 내부 복제 진단 | `AuroraReplicaLag` |
| 외부 MySQL이나 다른 클러스터의 binlog를 받는 Aurora | 지원 버전의 binlog 수신·적용 진단 | `AuroraBinlogReplicaLag` |

**같은 Aurora 클러스터의 Writer→Reader 복제에 `replica_parallel_workers` 튜닝을 그대로 적용하면 안 됩니다.** Aurora 내부 Reader는 공유 스토리지 구조를 사용하고, 외부·클러스터 간 binlog 복제는 별도 경로입니다. Aurora Global Database도 별도 구성으로 구분합니다.[^aurora-replication][^aurora-metrics]

## 복제 지연이 발생하는 이유

- 수신 경로: 네트워크 지연·재연결, 소스의 binlog 공급 지연
- 적용 작업: 큰 트랜잭션, 행 탐색 비용, 잠금·커밋 순서 대기
- 자원과 설정: CPU·스토리지·메모리 경쟁, 워커 수와 버퍼 설정

적용이 중단된 서버를 단순히 “느린 서버”로 보면 잘못된 파라미터를 조정하게 됩니다. 먼저 스레드 상태와 오류를 확인하고, 수신이 밀리는지 이미 받은 트랜잭션의 적용이 밀리는지 나눕니다.

스토리지 증설도 측정 후 결정합니다. 같은 지연이라도 대형 트랜잭션을 나눠 해결할 수 있고, DDL 잠금을 해소해야 할 수도 있습니다. 파라미터 조정은 병목이 확인된 뒤의 단계입니다.

{% include diagram.html src="replication-path.svg" caption="복제 경로와 세 측정 지점. 각 파라미터가 어느 구간에 작용하는지도 함께 표시했습니다." %}

수신 구간은 소스의 binlog 위치와 보조 서버의 수신 위치 사이이고, 적용 구간은 수신 위치와 적용 위치 사이입니다. 지연을 좁힐 때는 어느 구간이 벌어져 있는지부터 가릅니다.

## 지연을 먼저 측정합니다

파라미터를 만지기 전에 지연을 재는 지표부터 정해야 합니다. 8.4 에서는 `SHOW SLAVE STATUS` 같은 옛 문장이 문법 오류가 되므로 `SHOW REPLICA STATUS` 를 씁니다. 필드 이름도 `Seconds_Behind_Source` 이고, 옛 이름 `Seconds_Behind_Master` 를 찾는 모니터링 스크립트는 함께 고쳐야 합니다.

```sql
SHOW REPLICA STATUS\G
```

### 복제 중단 → 수신 지연 → 적용 지연 순서로 봅니다

여러 채널을 사용한다면 같은 `Channel_Name`의 상태를 이어서 비교합니다.[^status]

| 확인 항목 | 해석과 다음 행동 |
| --- | --- |
| `Replica_IO_Running`이 `No` 또는 `Connecting` | `Last_IO_Errno`, `Last_IO_Error`, 연결 상태부터 확인합니다. 의도적으로 중지했는지도 확인합니다. |
| `Replica_SQL_Running`이 `No` | `Last_SQL_Errno`, `Last_SQL_Error`와 워커별 오류를 확인합니다. 오류로 중단된 경우에는 재시작보다 오류 원인 해결이 먼저입니다. |
| 두 스레드가 `Yes`, 수신 위치가 소스보다 계속 뒤처짐 | 네트워크·재연결·소스 부하를 확인합니다. `relay_log_space_limit`에 도달해 수신이 대기하는 경우도 구분합니다. |
| 수신 위치는 따라가지만 적용 위치가 계속 뒤처짐 | 적용 중인 트랜잭션·워커 상태·잠금·CPU·스토리지 순서로 좁힙니다. |
| 조회한 순간에는 모두 따라잡음 | 간헐적 지연일 수 있습니다. 몇 초 간격으로 반복 측정하고 애플리케이션 오류 시각과 대조합니다. |

소스의 현재 binlog 위치는 **소스 서버**에서 확인합니다.

```sql
SHOW BINARY LOG STATUS;
```

비교할 위치는 다음 세 쌍입니다.

- 소스: `File` + `Position`
- 보조 서버 수신: `Source_Log_File` + `Read_Source_Log_Pos`
- 보조 서버 적용: `Relay_Source_Log_File` + `Exec_Source_Log_Pos`

**파일명이 다른 위치의 숫자만 빼면 안 됩니다.** 파일·위치는 시간 지연 자체도 아니며, 병렬 적용에서 실행 위치는 완료된 작업의 하한을 나타낼 수 있습니다. 한 번의 스냅샷보다 각 위치가 전진하는지, 간격이 줄어드는지를 반복해서 봅니다.[^status]

GTID 구성에서는 소스의 `Executed_Gtid_Set`, 보조 서버의 `Retrieved_Gtid_Set`·`Executed_Gtid_Set`도 참고합니다. `GTID_SUBTRACT()`로 미적용 집합을 구할 수 있지만 그 결과는 지연 시간이나 남은 바이트 수가 아닙니다. 보조 서버의 실행 집합에는 다른 채널이나 로컬 트랜잭션도 포함될 수 있으므로 비교 범위를 확인합니다.[^gtid]

### Seconds_Behind_Source의 한계

`Seconds_Behind_Source` 는 꺼내 보기 편하지만 그대로 믿을 수 있는 값이 아닙니다. 공식 문서는 이 필드가 본질적으로 적용(applier) 스레드와 수신(receiver) 스레드 사이의 시간 차를 재는 값이며 빠른 네트워크에서만 유용하다고 적습니다. 네트워크가 느리면 적용 스레드가 느린 수신 스레드를 자주 따라잡아 버려서, 수신 스레드가 소스보다 한참 뒤처져 있어도 값이 0 으로 보입니다.

문서가 밝히는 나머지 제약입니다.

| 상황 | `Seconds_Behind_Source` |
| --- | --- |
| 수신·적용이 정상이고 처리할 이벤트가 없음 | `0` |
| 적용 스레드가 돌지 않음 | `NULL` |
| 릴레이 로그 소진 + 수신 스레드 정지 | `NULL` |
| 릴레이 로그 소진 + 수신 스레드 가동 | `0` |

- 소스와 보조 서버의 시계가 달라도, 수신 스레드가 시작할 때 계산한 차이가 그대로 유지되는 한 계산은 성립합니다. NTP 갱신을 포함한 시각 변경은 이 값을 덜 믿을 만한 것으로 만듭니다.
- 이벤트에 실린 타임스탬프는 최초 소스의 것이 보존됩니다. 3단 복제에서 중간 서버가 클라이언트 쓰기까지 함께 받으면, 마지막 이벤트가 최초 소스에서 온 것일 때와 중간 서버에서 생긴 것일 때가 섞여 값이 들쭉날쭉해집니다.
- 멀티스레드 복제에서는 이 값이 `Exec_Source_Log_Pos` 를 기준으로 하므로 가장 최근에 커밋된 트랜잭션을 반영하지 않을 수 있습니다.

### 워커별 상태와 적용 시간을 확인합니다

멀티스레드 복제라면 `performance_schema.replication_applier_status_by_worker`를 함께 봅니다. `threads`와 연결하면 워커가 실행 중인지 잠금·커밋 순서를 기다리는지도 확인할 수 있습니다.[^worker][^thread-states]

```sql
SELECT w.CHANNEL_NAME, w.WORKER_ID, w.SERVICE_STATE,
       t.PROCESSLIST_STATE,
       w.APPLYING_TRANSACTION,
       w.APPLYING_TRANSACTION_START_APPLY_TIMESTAMP,
       w.APPLYING_TRANSACTION_RETRIES_COUNT,
       w.LAST_APPLIED_TRANSACTION_ORIGINAL_COMMIT_TIMESTAMP AS committed_on_source,
       w.LAST_APPLIED_TRANSACTION_END_APPLY_TIMESTAMP AS applied_on_replica,
       w.LAST_ERROR_NUMBER, w.LAST_ERROR_MESSAGE
FROM performance_schema.replication_applier_status_by_worker AS w
LEFT JOIN performance_schema.threads AS t ON t.THREAD_ID = w.THREAD_ID
ORDER BY w.CHANNEL_NAME, w.WORKER_ID;
```

커밋 시각은 복제로 전달되지만 적용 시작·종료 시각은 보조 서버에서 수집합니다. 그래서 Performance Schema 를 끄면 적용 시각 칼럼이 0 으로 나옵니다. `APPLYING_TRANSACTION_START_APPLY_TIMESTAMP` 는 첫 시도 시각이므로, 오래 걸리는 트랜잭션을 볼 때는 `APPLYING_TRANSACTION_RETRIES_COUNT` 와 함께 읽어 재시도 때문인지 구분합니다.

> **NOTE** — `START REPLICA` 로 복제를 다시 시작하면 `APPLYING_TRANSACTION` 으로 시작하는 칼럼들이 초기화됩니다.

두 시각의 차이는 **해당 워커에서 마지막으로 완료한 트랜잭션의 소스 커밋→복제 적용 완료 시간**입니다. 현재 대기 중인 전체 작업의 지연은 아닙니다. 유휴 서버에서 현재 시각과 마지막 커밋 시각의 차이를 계산하면, 새 쓰기가 없는데도 지연이 늘어나는 것처럼 보입니다. 서로 다른 서버의 시각을 비교하므로 시계 동기화도 확인합니다.

## 파라미터로 해결되지 않는 원인을 먼저 봅니다

### 하나의 큰 트랜잭션

단일 트랜잭션은 여러 워커로 나눠 적용되지 않습니다. 대량 UPDATE·DELETE 하나가 오래 걸리면 워커 수를 늘려도 그 트랜잭션 자체는 빨라지지 않습니다. 소스에서 오래 실행 중인 InnoDB 트랜잭션은 다음처럼 찾습니다.[^aurora-binlog]

```sql
SELECT trx_mysql_thread_id, trx_started, trx_state,
       trx_rows_modified, trx_query
FROM information_schema.INNODB_TRX
ORDER BY trx_started;
```

이 목록은 현재 활성 트랜잭션입니다. **이미 소스에서 커밋됐지만 보조 서버에서 적용 중인 작업은 여기서 보이지 않습니다.** 그 경우 워커의 `APPLYING_TRANSACTION`, 적용 시작 시각, 배치 실행 이력과 binlog를 대조합니다.

예를 들어 백만 행을 한 트랜잭션으로 갱신하던 배치는, 업무상 분할 커밋이 가능할 때 PK 구간별 작은 트랜잭션으로 나눌 수 있습니다. 배치 크기와 실행 간격은 지연·잠금·처리량을 보며 조절하고, 분할 후 재시도와 부분 완료도 처리합니다. 전체 원자성이 필요한 작업을 임의로 나누지는 않습니다.

### PK나 적절한 인덱스가 없는 테이블

ROW 복제의 UPDATE·DELETE도 보조 서버에서 변경할 행을 찾아야 합니다. MySQL은 PK, 적합한 유니크 키 등 사용 가능한 키를 검토하고, 적합한 인덱스가 없으면 테이블 스캔 비용이 발생할 수 있습니다. **PK가 없다는 사실만으로 매 행마다 전체 스캔한다고 단정하면 안 됩니다.** 실제 키와 행 탐색 방식을 확인합니다.[^row-search]

다음 쿼리는 사용자 InnoDB 테이블 중 PK가 없는 후보를 찾습니다.

```sql
SELECT t.TABLE_SCHEMA, t.TABLE_NAME
FROM information_schema.TABLES AS t
WHERE t.TABLE_TYPE = 'BASE TABLE' AND t.ENGINE = 'InnoDB'
  AND t.TABLE_SCHEMA NOT IN ('mysql', 'sys', 'performance_schema', 'information_schema')
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS AS c
    WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
      AND c.CONSTRAINT_TYPE = 'PRIMARY KEY'
  )
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME;
```

후보 테이블은 `SHOW CREATE TABLE`과 `SHOW INDEX`로 확인합니다. 키를 추가할 때는 소스와 보조 서버의 스키마를 일관되게 유지하고, 기존 데이터의 중복과 DDL 비용도 확인합니다.

### 읽기 트랜잭션이 막는 DDL과 행 잠금

보조 서버의 긴 읽기 트랜잭션이 메타데이터 잠금(MDL)을 유지하면, 복제로 전달된 `ALTER TABLE`이 기다릴 수 있습니다. `read_only` 설정만으로 읽기 작업의 이런 영향까지 없어지지는 않습니다. MDL 대기와 InnoDB 행 잠금 대기는 별도로 조회합니다.[^mdl]

```sql
-- 복제 DDL을 막고 있는 메타데이터 잠금 후보
SELECT object_schema, object_name, waiting_pid, blocking_pid, waiting_query
FROM sys.schema_table_lock_waits;

-- InnoDB 행 잠금 대기 후보
SELECT locked_table, waiting_pid, blocking_pid, waiting_query
FROM sys.innodb_lock_waits;
```

워커 상태의 `Waiting for table metadata lock`과 차단 세션을 대조합니다. 장기 조회를 짧게 나누거나 트랜잭션을 적시에 종료하고, DDL 실행 시점을 조정합니다. 세션 종료는 해당 업무와 트랜잭션 영향을 확인한 뒤 결정합니다.

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

이 절은 **RDS for MySQL의 EBS 기반 스토리지**에 관한 설명입니다. Aurora 클러스터 볼륨에 그대로 적용하지 않습니다. IOPS는 초당 I/O 작업 수이고, 처리량은 초당 전송 바이트 수입니다. 실제 I/O 요청 크기와 병합·분할이 영향을 주므로 InnoDB의 기본 페이지 크기 16KiB로 처리량을 나눠 스토리지 IOPS를 단정하면 안 됩니다.[^storage]

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

스토리지와 인스턴스 클래스 양쪽의 IOPS·처리량 한도를 확인합니다. `innodb_io_capacity`를 올려도 물리적 용량이 늘어나지는 않습니다. 반대로 현재 관측한 `WriteIOPS`가 장치의 최대 성능이라는 뜻도 아니므로, 관측값 자체를 설정의 상한으로 삼지 않습니다.

> **NOTE** — 위 수치는 [Amazon RDS DB 인스턴스 스토리지](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html) 문서 기준입니다. gp2·gp3 는 범용 SSD 이고, 프로비저닝 IOPS 계열인 io1·io2 Block Express 는 상한이 더 높습니다(io2 는 최대 256,000 IOPS). 스토리지 타입을 혼동하면 낼 수 없는 IOPS 를 기대하게 됩니다.

### 스토리지 사양을 실제 지표와 연결합니다

CloudWatch에서 지연이 발생한 **같은 시간대의 보조 서버 지표**를 함께 봅니다. 아래 해석은 원인을 좁히는 단서이며, 하나의 수치만으로 원인을 확정하지 않습니다.[^rds-metrics]

| 지표 | 확인할 내용 |
| --- | --- |
| `ReplicaLag` | RDS for MySQL에서는 복제 상태의 지연 값에 기반합니다. `-1`은 지연 0초가 아니라 복제가 활성 상태가 아니며 지연 값이 `NULL`인 경우입니다.[^rds-replication] |
| `ReadLatency`, `WriteLatency` | I/O 작업당 지연입니다. CloudWatch 단위는 초이므로 대시보드의 밀리초 표시와 혼동하지 않습니다. |
| `ReadIOPS`, `WriteIOPS` + `ReadThroughput`, `WriteThroughput` | IOPS 한도와 처리량 한도 중 어느 쪽에 가까운지 함께 봅니다. |
| `DiskQueueDepth` | 완료되지 않은 I/O가 누적되는지 확인합니다. 큐 증가와 지연·처리량을 같이 봅니다. |
| `BurstBalance` | gp2의 스토리지 버스트 크레딧입니다. 소진 시 버스트 성능을 계속 낼 수 없습니다. gp3에는 같은 방식으로 적용하지 않습니다. |
| `EBSIOBalance%`, `EBSByteBalance%` | 해당 지표를 제공하는 인스턴스에서 EBS I/O·처리량 크레딧을 확인합니다. 볼륨 크레딧과 구분합니다. |
| `CPUUtilization`, `FreeableMemory`, `SwapUsage` | CPU 포화나 메모리 압박을 스토리지 병목으로 오인하지 않도록 함께 봅니다. |

예를 들어 gp2의 `BurstBalance`가 소진되고 I/O 지연·큐 길이가 함께 늘어난다면 버스트 의존도를 줄이는 방향을 검토합니다. 반대로 스토리지 지표가 여유로운데 한 워커만 오래 실행 중이라면 트랜잭션 크기와 적용 작업부터 확인합니다.

### replica_parallel_workers

8.4 문서가 쓰는 이름은 `replica_parallel_workers`이고 기본값은 **4**입니다. `slave_parallel_workers`는 옛 이름입니다. 값 0은 단일 적용 스레드 방식이고 폐기 예정(deprecated)이므로, 워커를 하나만 사용할 새 설정에는 1을 검토합니다.[^replica-options]

값이 0 이면 보조 서버는 적용 스레드 하나로 릴레이 로그를 읽어 트랜잭션을 실행합니다. 1 이상이면 워커 스레드가 그 수만큼 생기고, 릴레이 로그에서 트랜잭션을 순서대로 읽어 워커에 배분하는 코디네이터 스레드가 하나 더 붙습니다. 이 상태를 멀티스레드 복제라고 부릅니다. 복제 채널을 여러 개 쓰면 채널마다 이 수만큼 스레드가 생깁니다.

워커를 늘리는 효과는 **독립적으로 적용할 트랜잭션과 자원 여유가 있을 때** 나옵니다. 워커 수와 CPU 사용량이 일정 비율로 늘어나는 것은 아닙니다. 대형 트랜잭션, 같은 데이터에 대한 의존성, 잠금·I/O 대기는 워커 증가만으로 해소되지 않습니다.

특히 `Waiting for preceding transaction to commit`은 앞선 트랜잭션의 커밋을 기다린다는 뜻입니다. 기다리는 워커를 더 늘리기 전에 선행 작업이 무엇을 하는지 확인합니다. `replica_preserve_commit_order`는 8.4에서 기본 `ON`이며, 대기를 없애려고 끄면 보조 서버에서 관측하는 커밋 순서가 달라질 수 있습니다.[^thread-states][^replica-options]

현재 설정과 실제 활성 워커 수를 구분해서 확인합니다.

```sql
SELECT @@GLOBAL.replica_parallel_workers,
       @@GLOBAL.replica_preserve_commit_order;

SELECT CHANNEL_NAME, COUNT(*) AS active_workers
FROM performance_schema.replication_applier_status_by_worker
WHERE SERVICE_STATE = 'ON'
GROUP BY CHANNEL_NAME;
```

변수 변경은 실행 중인 워커 수에 즉시 반영되지 않고 **다음 `START REPLICA`에 적용**됩니다. 아래는 직접 운영하는 MySQL의 기본 채널에서 적용 스레드를 멈추고 워커를 8개로 바꾸는 예제입니다. 8은 실험값이며 권장 고정값이 아닙니다. 중지 중에는 적용 지연이 늘어나므로 읽기 트래픽과 변경 시점을 먼저 조정합니다.[^replica-options]

```sql
STOP REPLICA SQL_THREAD FOR CHANNEL '';
SET GLOBAL replica_parallel_workers = 8;
START REPLICA SQL_THREAD FOR CHANNEL '';
```

명명된 채널에서는 빈 문자열 대신 실제 채널명을 사용합니다. 재시작 후 활성 워커 수·오류·지연 변화·CPU·I/O를 다시 확인합니다. `SET GLOBAL`은 서버 재시작 후 유지되지 않으므로 검증한 값만 설정 파일이나 적절한 영속 설정에 반영합니다. RDS·Aurora에서는 파라미터 그룹과 해당 서비스가 제공하는 복제 제어 절차를 따릅니다.

병렬 적용 관련 변수도 **8.4에서의 상태**를 기준으로 확인합니다.

| 변수 | 8.4에서의 상태 |
| --- | --- |
| `binlog_transaction_dependency_tracking` | 8.2.0 deprecated, 8.4.0 제거 |
| `transaction_write_set_extraction` | 8.3.0 제거 |
| `replica_parallel_type` | 존재하지만 deprecated, 기본 `LOGICAL_CLOCK` |

`binlog_transaction_dependency_tracking`이 사라진 뒤에도 writeset 기반 의존성 추적 동작은 남아 있습니다. 8.4에서 제거된 앞의 두 변수는 옛 옵션 파일에서 정리해야 합니다. 9.x의 변수 제거·기본값 변경을 8.4에 그대로 적용하지 않습니다.[^upgrade]

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

## 쓰기 직후 읽기는 애플리케이션에서도 처리합니다

저장 직후 읽기 복제본을 조회하면 “저장했는데 결과가 없다”는 문제가 생길 수 있습니다. 비동기 복제의 지연을 줄이는 작업과, 해당 요청이 방금 쓴 데이터를 읽게 보장하는 작업은 구분해야 합니다.

가장 단순한 방법은 최신성이 필요한 쓰기 직후 조회를 **소스의 새 조회로 라우팅**하는 것입니다. 일정 시간 `sleep`하거나 특정 시간 동안만 소스로 보내는 규칙은 최악의 복제 지연까지 보장하지 않습니다.

GTID 기반 binlog 복제에서는 해당 쓰기의 GTID가 보조 서버에 적용될 때까지 기다리는 방법도 있습니다. 다음 순서로 처리합니다.[^gtid][^gtid-tracking]

1. 소스에서 쓰기를 커밋하고, **그 커밋의 GTID**를 얻습니다. 지원하는 드라이버라면 쓰기 세션의 `session_track_gtids=OWN_GTID`와 프로토콜의 세션 추적 정보를 사용합니다.
2. 조회할 보조 서버의 연결을 확보하고 `WAIT_FOR_EXECUTED_GTID_SET()`을 제한 시간과 함께 실행합니다.
3. 반환값이 `0`일 때 새 스냅샷으로 조회합니다. `1`은 타임아웃이며, 오류나 `NULL`도 성공으로 처리하지 않습니다.
4. 타임아웃이면 정책에 따라 소스로 조회를 보내거나 재시도 가능한 응답을 반환합니다.

```sql
-- UUID:번호는 예시입니다. 실제로 커밋한 트랜잭션의 GTID로 바꿉니다.
SELECT WAIT_FOR_EXECUTED_GTID_SET(
  '3E11FA47-71CA-11E1-9E33-C80AA9429562:23', 1
) AS wait_result;
-- 0: 적용 완료, 1: 1초 안에 적용되지 않음
```

대기는 **조회할 바로 그 보조 서버 연결**에서 실행합니다. 커넥션 풀이나 로드밸런서가 대기 후 다른 복제본으로 조회를 보내면 보장이 깨집니다. `REPEATABLE READ`에서 이미 만든 오래된 스냅샷을 재사용하지 않도록, 대기를 마친 뒤 새 읽기 트랜잭션을 시작합니다.

소스의 전체 `@@GLOBAL.gtid_executed`를 매 요청의 토큰으로 사용하면 관련 없는 커밋까지 기다릴 수 있습니다. 또한 GTID 적용 완료는 복제 필터로 제외한 데이터까지 존재한다는 보장이 아니므로, 읽을 데이터가 실제로 복제되는 구성에서 사용합니다. 같은 Aurora 클러스터의 내부 Reader에 이 binlog용 절차를 그대로 적용하지 않습니다.

## 정리

복제 지연을 만나면 **복제 구조 확인 → 중단·오류 확인 → 수신·적용 구간 분리 → 트랜잭션·잠금·자원 확인 → 설정 변경과 재측정** 순서로 접근합니다. 지연이 낮아진 것뿐 아니라 오류가 없는지, 밀린 작업이 줄어드는지, 읽기 서비스가 필요한 최신성을 만족하는지 함께 확인합니다.

## 참고 자료

[^status]: MySQL 8.4 Reference Manual — SHOW REPLICA STATUS Statement. 스레드 상태·오류·복제 위치·지연 지표의 의미. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/show-replica-status.html>
[^worker]: MySQL 8.4 Reference Manual — The replication_applier_status_by_worker Table. 워커별 트랜잭션·시각·재시도·오류. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/performance-schema-replication-applier-status-by-worker-table.html>
[^thread-states]: MySQL 8.4 Reference Manual — Replication SQL Thread States. 커밋 순서 대기 등 적용 스레드 상태. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/replica-sql-thread-states.html>
[^row-search]: MySQL 8.4 Reference Manual — Replication and Row Searches. ROW 복제에서 변경할 행을 찾는 방법. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/replication-features-row-searches.html>
[^mdl]: MySQL 8.4 Reference Manual — The schema_table_lock_waits and x$schema_table_lock_waits Views. MDL 대기와 차단 세션. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/sys-schema-table-lock-waits.html>
[^replica-options]: MySQL 8.4 Reference Manual — Replica Server Options and Variables. 워커 수·변경 적용 시점·커밋 순서. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/replication-options-replica.html>
[^upgrade]: MySQL 8.4 Reference Manual — What Is New in MySQL 8.4 since MySQL 8.0. 복제 의존성 추적 변수의 변경. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/mysql-nutshell.html>
[^gtid]: MySQL 8.4 Reference Manual — Functions Used with Global Transaction Identifiers (GTIDs). 집합 연산과 적용 대기 함수. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/gtid-functions.html>
[^gtid-tracking]: MySQL 8.4 Reference Manual — Server System Variables, session_track_gtids. 커밋한 트랜잭션의 GTID 추적. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/server-system-variables.html#sysvar_session_track_gtids>
[^storage]: Amazon RDS User Guide — Amazon RDS DB instance storage. EBS 스토리지의 IOPS·처리량·버스트와 I/O 크기. <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html>
[^rds-metrics]: Amazon RDS User Guide — Amazon CloudWatch metrics for Amazon RDS. 지연·I/O·크레딧·메모리 지표. <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-metrics.html>
[^rds-replication]: Amazon RDS User Guide — Monitoring read replication. ReplicaLag와 복제 비활성 상태. <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.Monitoring.html>
[^aurora-replication]: Amazon Aurora User Guide — Replication with Amazon Aurora. 내부 Reader와 binlog 복제의 구조. <https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html>
[^aurora-metrics]: Amazon Aurora User Guide — Amazon CloudWatch metrics for Amazon Aurora. AuroraReplicaLag와 AuroraBinlogReplicaLag. <https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraMonitoring.Metrics.html>
[^aurora-binlog]: Amazon Aurora User Guide — Troubleshooting replication lag for Aurora MySQL. 대형 트랜잭션·병렬 적용·키와 적용 지연. <https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-mysql-troubleshooting-replication-lag.html>
