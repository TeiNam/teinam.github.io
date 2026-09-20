---
title: "바이너리 로그"
permalink: /docs/database/mysql-install-checklist/binary-log/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 바이너리 로그 설정"
last_modified_at: 2026-09-19
guide: mysql-install-checklist
order: 5
nav_title: "바이너리 로그"
---

바이너리 로깅은 기본적으로 활성이다(`log_bin` 이 `ON`). 예외는 `mysqld` 를 `--initialize` 나 `--initialize-insecure` 로 실행해 데이터 디렉터리를 직접 초기화한 경우다. 옵션을 지정하지 않으면 기본 base name 은 `binlog`, 인덱스 파일은 `binlog.index` 다. `log_bin` 은 기동 옵션이라 동적 변경이 불가하고, 바이너리 로그를 끄는 수단은 `--skip-log-bin` 이다.

### `binlog_format`

- **기본값은 이미 `ROW`** 다. 허용값은 `ROW`, `STATEMENT`, `MIXED` 세 가지다.
- `binlog_format` 자체가 8.0.34 부터 deprecated 이고 장래 제거 대상이다. 문서는 행 기반 외의 로깅 형식 지원도 제거 대상이므로 **신규 복제 구성에는 행 기반 로깅만 사용하라**고 명시한다. 새로 세우는 서버에서는 이 값을 손댈 이유가 없다.
- 변경 데이터 캡처(CDC)로 바이너리 로그를 읽는 구성도 행 기반을 전제로 한다.
- `binlog_rows_query_log_events` 를 켜면 행 기반 로그에 원본 SQL 문이 함께 기록되어 사후 추적이 쉬워진다. 로그 크기는 늘어난다.
- NDB Cluster 는 예외로 기본값이 `MIXED` 이며 문장 기반 복제를 지원하지 않는다.
- 8.4 에서는 writeset 기반 의존성 추적이 `binlog_format=ROW` 를 요구한다. `MIXED` 는 더 이상 지원되지 않는다.
- 런타임 변경에는 제약이 있다. 스토어드 함수나 트리거 안에서는 바꿀 수 없고, 세션에 임시 테이블이 열려 있으면 세션 값을, 복제 채널에 임시 테이블이 열려 있거나 applier 스레드가 도는 중이면 전역 값을 바꿀 수 없다. `PERSIST_ONLY` 는 항상 허용된다.

### `binlog_row_image`

- 기본값은 `full` 이고 값은 `full`, `minimal`, `noblob` 이다. `minimal` 은 before image 에서 변경할 행을 식별하는 데 필요한 컬럼만, after image 에서는 SQL 문이 값을 지정했거나 auto-increment 로 생성된 컬럼만 기록한다.
- **`minimal` 과 `noblob` 에는 조건이 붙는다.** 소스와 대상 테이블 양쪽에서 모든 컬럼이 같은 순서로 존재하고 각 컬럼의 데이터 타입이 같아야 하며, 기본 키 정의가 동일해야 삭제와 갱신이 올바르게 동작한다. 이 조건이 깨지면 **경고도 에러도 없이 소스와 레플리카의 데이터가 어긋난다.**
- `STATEMENT` 포맷에서는 효과가 없고 NDB 에도 효과가 없다. 소스가 `full` 이고 레플리카가 `minimal` 이면 레플리카가 받는 이벤트에는 full after image 가 들어 있다.
- 문서가 `minimal` 을 고려하라고 적는 조건은 바이너리 로그가 비회전 스토리지에 있고 모든 테이블에 기본 키가 있는 경우다. 로깅량이 줄어든다.
- 반대로 CDC 나 감사 용도로 변경 전후 값을 온전히 남겨야 한다면 기본값 `full` 을 유지한다.

### 보존 기간

| 파라미터 | 기본값 | 비고 |
|---|---|---|
| `binlog_expire_logs_seconds` | `2592000`(30일) | 동적, 0 은 자동 삭제 중단 |
| `binlog_expire_logs_auto_purge` | `ON` | 보존 기간 설정보다 우선 |

- `binlog_expire_logs_seconds` 는 8.0.1 에 도입되고 8.0.11 에 기본값이 확정됐다. 최소 0, 최대 4294967295 다.
- `binlog_expire_logs_auto_purge` 가 자동 삭제 여부를 결정하며 보존 기간 설정보다 우선한다. 보존 기간을 `0` 으로 두면 자동 삭제가 멈춘다. 둘 중 하나만 보고 용량을 계산하면 디스크 공간이 부족해진다.
- `expire_logs_days` 는 8.0.3 에서 deprecated 됐고 **8.4 에서 제거**됐다. 런타임에 이 변수를 읽거나 쓰려 해도, `--expire-logs-days` 로 `mysqld` 를 기동해도 에러가 난다. 대신 `binlog_expire_logs_seconds` 를 쓴다.
- `binlog_row_metadata` 의 기본값 `MINIMAL`(8.0.1 도입)은 `SIGNED` 플래그, 컬럼 문자셋, geometry 타입에 관한 메타데이터만 기록한다.

### `binlog_cache_size`

- 기본값은 `32768`(32KB)이다.
- 한 트랜잭션이 만드는 바이너리 로그가 이 값(기본 `32768` 바이트)을 넘는 일이 잦으면 더 올려야 할 수 있다. 캐시가 차면 디스크의 임시 파일로 스왑되어 성능이 떨어진다.

```sql
SHOW GLOBAL STATUS LIKE 'Binlog_cache_use';
SHOW GLOBAL STATUS LIKE 'Binlog_cache_disk_use';
```

- `Binlog_cache_disk_use` 가 꾸준히 늘어난다면 캐시가 부족하다는 신호다.
