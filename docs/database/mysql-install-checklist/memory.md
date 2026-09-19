---
title: "메모리"
permalink: /docs/database/mysql-install-checklist/memory/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 메모리 파라미터"
updated: 2026-09-19
guide: mysql-install-checklist
order: 7
nav_title: "메모리"
---

버퍼풀 크기는 운영 중에 조정할 수 있지만, `innodb_buffer_pool_chunk_size` 와 `innodb_buffer_pool_instances` 는 기동 시점에 고정된다. 크기를 나중에 올릴 계획이라면 이 두 값을 첫 구성에서 함께 정한다. 버퍼풀과 임시 테이블 계열은 기본값이 실서비스 규모와 거리가 있다.

### `innodb_buffer_pool_size`

- 기본값은 `134217728`(128MB), 최소값은 `5242880`(5MB)이다. 전역 범위이고 동적 변경이 가능하다.
- 공식 권고는 **시스템 메모리의 50~75%** 다.
- 버퍼풀 크기는 항상 `innodb_buffer_pool_chunk_size` 와 `innodb_buffer_pool_instances` 의 곱과 같거나 그 배수여야 한다. 동적으로 올려도 이 배수로 반올림되므로, 청크 크기와 인스턴스 수는 기동 시점에 정해야 한다. 청크 개수는 1000 을 넘지 않게 둔다.
- `innodb_buffer_pool_chunk_size` 기본값은 `134217728`(128MB)이고 동적 변경이 불가하다. `innodb_buffer_pool_instances` 도 동적 변경이 불가하며, 8.0 기본값 8(버퍼풀이 1GiB 미만이면 1)에서 8.4 는 산식 기반으로 바뀌었다. 8.4 산식은 버퍼풀 힌트(크기를 청크 크기로 나눈 값의 1/2)와 CPU 힌트(가용 논리 프로세서 수의 1/4) 중 최솟값이다.
- `--innodb-dedicated-server` 를 켜면 명시하지 않은 버퍼풀 크기가 자동 설정된다.
- `Innodb_buffer_pool_wait_free` 가 계속 늘어난다면 버퍼풀이 부족하다는 신호다.

```ini
[mysqld]
# 메모리 32GiB 전용 서버에서 75%
innodb_buffer_pool_size       = 24G
innodb_buffer_pool_chunk_size = 128M
```

### 임시 테이블

- `internal_tmp_mem_storage_engine` 의 기본값은 **`TempTable`** 이다(8.0.2 도입). 허용값은 `TempTable` 과 `MEMORY` 이고, 세션 값 변경에는 `SESSION_VARIABLES_ADMIN` 또는 `SYSTEM_VARIABLES_ADMIN` 권한이 필요하다. `internal_tmp_disk_storage_engine` 은 8.0.16 에서 제거됐다.
- TempTable 은 `VARCHAR`·`VARBINARY` 와 바이너리 대형 객체 타입을 효율적으로 저장한다. MEMORY 는 고정 길이 행 포맷을 써서 `VARCHAR`·`VARBINARY` 를 컬럼 최대 길이까지 패딩해 `CHAR`·`BINARY` 처럼 저장한다. 디스크 임시 테이블은 8.4 에서 InnoDB 만 사용한다.
- `tmp_table_size` 기본값은 `16777216`(16MiB)이다. TempTable 로 만든 **개별 인메모리 임시 테이블의 최대 크기**를 정하며, 한도에 닿으면 InnoDB 디스크 임시 테이블로 자동 전환된다.
- `max_heap_table_size` 기본값도 `16777216`(16MiB)이지만 **TempTable 에서는 무관하다.** `tmp_table_size` 와 `max_heap_table_size` 중 작은 값이 상한이라는 규칙은 **MEMORY 엔진을 쓸 때만** 성립한다. 명시적으로 `CREATE TABLE ... ENGINE=MEMORY` 로 만든 테이블은 `max_heap_table_size` 만 적용되고 디스크 전환이 없다.

| 파라미터 | 8.0 기본값 | 8.4 기본값 | 도입 |
|---|---|---|---|
| `temptable_max_ram` | 1GiB | 총메모리 3%(1–4GiB) | 8.0.2 |
| `temptable_max_mmap` | 1GiB | `0` | 8.0.23 |
| `temptable_use_mmap` | `ON` | `OFF`(deprecated) | 8.0.16 |

- `temptable_max_mmap=0` 은 `temptable_use_mmap=OFF` 와 같다. `temptable_use_mmap` 은 8.0.26 에서 deprecated 됐다.
- `tmp_table_size` 가 `temptable_max_ram` 보다 작으면 인메모리 임시 테이블은 `tmp_table_size` 를 넘을 수 없다. 반대로 크면 `temptable_max_ram` 과 `temptable_max_mmap` 의 합계가 상한이 된다.
- 스레드-로컬 메모리 블록(요청이 1MB 미만이면 1MB)은 `temptable_max_ram` 한도에 포함되지 않고 스레드가 끝날 때까지 유지된다.
- 임시 테이블이 디스크로 강제되는 조건은 세 가지다.
  - 테이블에 `BLOB` 또는 `TEXT` 컬럼이 있는 경우. 단 TempTable 은 이 타입을 지원하므로 이 조건을 절대 규칙으로 보면 안 된다.
  - **`UNION` 또는 `UNION ALL` 을 쓸 때** `SELECT` 리스트에 최대 길이가 512 를 넘는 문자열 컬럼이 있는 경우(바이너리 문자열은 바이트, 그 외는 문자 단위).
  - `SHOW COLUMNS` 와 `DESCRIBE` 는 일부 컬럼 타입을 `BLOB` 으로 잡으므로 결과용 임시 테이블이 디스크 테이블이 된다.
- 관측은 `Created_tmp_tables` 와 `Created_tmp_disk_tables` 로 한다. 후자는 메모리맵 파일에 만든 디스크 임시 테이블을 세지 않는다.

### MyISAM 전용 파라미터

- `key_buffer_size` 는 MyISAM 인덱스 블록만 캐싱한다. InnoDB 는 버퍼풀을 쓰고 키 캐시를 쓰지 않는다.
- 기본 상태에서 약 8MiB(`8384512`)가 잡혀 있고, **`SET GLOBAL key_buffer_size = 0` 으로도 기본 키 캐시 자체를 없앨 수는 없다.** 문서는 이 시도가 무시된다고 적는다.
- 값이 `0` 이거나 최소 블록 버퍼 8개를 잡지 못할 만큼 작으면 키 캐시를 쓰지 않고, 인덱스 파일은 OS 가 제공하는 파일시스템 버퍼링만으로 접근한다.
- 8.4 부터 `keycache1.key_buffer_size` 형태의 복합 구조 변수 문법은 deprecated 다.
- `bulk_insert_buffer_size` 도 MyISAM 의 대량 삽입에 쓰인다. InnoDB 는 이 버퍼를 쓰지 않으므로 MyISAM 을 쓰지 않으면 조정할 이유가 없다.
