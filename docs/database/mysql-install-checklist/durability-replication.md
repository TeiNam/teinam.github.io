---
title: "내구성과 복제 안전성"
permalink: /docs/database/mysql-install-checklist/durability-replication/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 내구성과 복제 안전성"
last_modified_at: 2026-09-19
guide: mysql-install-checklist
order: 4
nav_title: "내구성과 복제"
---

장애 시점에 무엇까지 잃어도 되는지 정하는 절이다. 서비스가 감당할 유실 범위를 먼저 정하고 값을 고른다. `innodb_flush_method` 는 동적 변경이 불가하고 `gtid_mode` 는 한 번에 한 단계씩만 전환되므로, 이 두 항목은 초기 구축 때 결정한다.

### `innodb_flush_log_at_trx_commit` 과 `sync_binlog`

두 값 모두 기본값이 `1` 이고, 이 조합이 가장 안전하면서 가장 느리다. 문서는 `sync_binlog` 를 두고 "가장 안전한 값은 기본값인 1 이지만 동시에 가장 느리다"고 적는다. 커밋 지연을 줄이려고 이 조합을 내리는 것은 내구성을 성능과 바꾸는 거래이므로, 서비스가 감당할 유실 범위를 먼저 정한 다음 결정한다.

| 파라미터 | 기본값 | 의미 |
|---|---|---|
| `innodb_flush_log_at_trx_commit` | `1` | 커밋 전에 InnoDB 로그를 디스크에 동기화 |
| `sync_binlog` | `1` | 쓰기마다 바이너리 로그를 디스크에 동기화 |
| `innodb_doublewrite` | `ON` | 페이지 쓰기 중 장애에서 온전한 사본 확보 |

- `innodb_flush_log_at_trx_commit=1` 은 각 트랜잭션이 커밋되기 전에 InnoDB 로그를 디스크와 동기화한다. 이것이 기본값이다.
- `0` 은 예기치 않은 종료가 났을 때 **가장 최근 커밋 일부의 유실을 감수**하는 선택이다. InnoDB 는 그래도 1초에 한 번 로그를 flush 하려 시도하지만, flush 가 보장되지는 않는다.
- 허용값은 `0`·`1`·`2` 세 가지다. `2` 의 동작은 매뉴얼의 시스템 변수 레퍼런스에서 확인한다.
- 기본값 `1` 에서 내리려면 각 값의 정의를 매뉴얼의 시스템 변수 레퍼런스에서 확인한 뒤 결정한다. 이 파라미터는 값에 따라 보장 범위가 달라지고, 그 차이가 장애 시점에만 드러난다.
- `sync_binlog` 를 `N`(1 초과)으로 두면 `N` 개의 커밋 그룹마다 동기화한다. 동기화를 활성화하지 않으면 OS 나 머신이 죽을 때 바이너리 로그의 마지막 문장들이 유실될 수 있다.
- `1`/`1` 조합에서는 크래시 복구 시 바이너리 로그를 마지막 유효 위치까지 절단하고 prepared 트랜잭션을 완료한다. 그런데도 `The binary log file_name is shorter than its expected size` 에러가 나면 해당 바이너리 로그는 올바르지 않으며, 새 스냅샷에서 복제를 다시 시작해야 한다.
- `innodb_doublewrite` 는 기본 `ON` 이다. 페이지 쓰기 중간에 OS·스토리지 서브시스템 장애가 나거나 `mysqld` 프로세스가 예기치 않게 종료되어도, 크래시 복구 때 doublewrite 버퍼에서 온전한 사본을 찾을 수 있다. I/O 가 두 배로 늘지는 않는다. 큰 순차 청크로 한 번의 `fsync()` 호출로 기록된다. 문서가 끄기를 언급하는 경우는 "데이터 정합성보다 성능이 더 중요한" 상황뿐이다.
- `innodb_flush_method` 는 8.4 리눅스 기본값이 "지원되면 `O_DIRECT`, 아니면 `fsync`" 로 바뀌었다(8.0 은 `fsync`). 동적 변경은 불가하다. 공식 문서에서 확인되는 값은 `fsync`, `O_DSYNC`, `O_DIRECT`, `O_DIRECT_NO_FSYNC` 이며, 플랫폼별로 더 있는 값은 매뉴얼의 시스템 변수 레퍼런스에서 확인한다. 8.4 에서는 `--innodb-dedicated-server` 가 이 값을 더 이상 자동 설정하지 않는다. `innodb_use_fdatasync` 는 8.4 기본값이 `ON` 이다(8.0 은 `OFF`).

### 리두 로그

- `innodb_redo_log_capacity` 는 8.0.30 에서 도입됐고 기본값은 `104857600`(100MB)이다. 8.0.34 기준 최소 `8388608`, 최대 `549755813888` 이며 `SET GLOBAL` 로 동적 변경이 가능하다.
- InnoDB 는 리두 로그 파일을 총 32개 유지하려 하고 각 파일 크기는 용량의 1/32 다. 위치는 `#innodb_redo` 디렉터리다. 8.0.30 이전에는 데이터 디렉터리에 2개를 두었다.
- `innodb_log_file_size`(기본 48MB)와 `innodb_log_files_in_group`(기본값이자 권고값 2)은 8.0.30 에서 deprecated 됐다. **`innodb_redo_log_capacity` 가 정의되지 않고 이 두 변수가 정의되어 있으면 리두 용량은 두 값의 곱으로 계산된다.** 예전 옵션 파일을 그대로 가져왔다면 여기서 의도하지 않은 용량이 잡힌다.
- 8.4 에서 `innodb_log_buffer_size` 기본값이 64MiB 로 바뀌었다(8.0 은 16MiB). `--innodb-dedicated-server` 의 리두 용량 산정 방식도 메모리 기반에서 CPU 기반으로 바뀌었다.
- 관측은 `Innodb_redo_log_capacity_resized`, `Innodb_redo_log_resize_status` 상태 변수와 `performance_schema.innodb_redo_log_files` 로 한다.

### GTID

`gtid_mode` 의 기본값은 `OFF` 다. 값 전환이 **한 번에 한 단계씩만** 가능하다는 점이 이 항목을 초기에 정해야 하는 이유다. 예를 들어 현재 `OFF_PERMISSIVE` 라면 `OFF` 나 `ON_PERMISSIVE` 로는 갈 수 있지만 `ON` 으로 바로 갈 수 없다. 운영 중에 켜려면 온라인 서버의 GTID 모드 변경 전용 절차를 따라야 한다.

| 파라미터 | 기본값 | 허용값 |
|---|---|---|
| `gtid_mode` | `OFF` | `OFF` · `OFF_PERMISSIVE` · `ON_PERMISSIVE` · `ON` |
| `enforce_gtid_consistency` | `OFF` | `OFF` · `ON` · `WARN` |

- GTID 기반 복제를 켜기 전에 `enforce_gtid_consistency` 를 `ON` 으로 두어야 한다. 이 값이 `ON` 이어야 `gtid_mode=ON` 설정이 가능하다.
- 예기치 않은 정지에 강한 복제 구성으로 문서가 드는 조합은 `gtid_mode=ON`, `SOURCE_AUTO_POSITION=1`, `GTID_ONLY=1` 이다. GTID 기반 복제가 그런 구성을 가장 쉽게 만들어 준다고 적혀 있다.
- `gtid_purged` 는 `gtid_executed` 의 부분집합이며 초기화는 `RESET BINARY LOGS AND GTIDS` 로 한다. 이 문장은 GTID 상태와 바이너리 로그를 모두 버린다. `gtid_executed_compression_period` 는 기본값 0 이고 문서 권고도 0 이다.
- 8.4 에서는 `gtid_mode=ON` 일 때 `IGNORE_SERVER_IDS` 가 거부된다.

```ini
[mysqld]
enforce_gtid_consistency = ON
gtid_mode                = ON
```
