---
title: "로깅"
permalink: /docs/database/mysql-install-checklist/logging/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 로그 설정"
last_modified_at: 2026-09-19
guide: mysql-install-checklist
order: 9
nav_title: "로깅"
---

장애가 난 뒤 원인을 재현할 근거를 남기는 절이다. 슬로우 쿼리 로그는 기본적으로 꺼져 있고 에러 로그 시각은 기본적으로 UTC 이므로, 이 두 기본값을 그대로 둘지 구축 시점에 정한다.

### 슬로우 쿼리 로그

| 파라미터 | 기본값 |
|---|---|
| `slow_query_log` | 비활성 |
| `slow_query_log_file` | `host_name-slow.log`(데이터 디렉터리) |
| `long_query_time` | 10초 (최소 0, 마이크로초 해상도) |
| `log_queries_not_using_indexes` | 비활성 |

```ini
[mysqld]
slow_query_log                = ON
long_query_time               = 1   # 예시값, 로그량을 보고 조정
log_queries_not_using_indexes = OFF
```

- 슬로우 쿼리 로그는 기본적으로 꺼져 있다. 문제를 나중에 재현하려면 처음부터 켜 둔다.
- `log_queries_not_using_indexes` 를 켜면 인덱스를 쓰지 않는 조회가 모두 기록된다. `log_throttle_queries_not_using_indexes` 의 기본값 `0` 은 무제한이므로, 켤 때는 스로틀 값을 함께 지정한다.
- `log_slow_admin_statements` 와 `log_slow_replica_statements` 도 기본 비활성이다.
- 초기 락을 얻는 시간은 실행 시간에 포함되지 않는다. `mysqld` 는 문장을 실행하고 모든 락을 해제한 뒤 기록하므로, **로그 순서가 실행 순서와 다를 수 있다.**

### 에러 로그

- `log_error_verbosity` 는 기본 `2`, 최소 `1`, 최대 `3` 이다. `1` 은 `ERROR`, `2` 는 `ERROR`·`WARNING`, `3` 은 `ERROR`·`WARNING`·`INFORMATION` 을 남긴다.
- `2` 이상이면 문장 기반 로깅에 안전하지 않은 문장에 대한 메시지를 남긴다. `3` 이면 중단된 커넥션과 신규 접속 시도의 접근 거부 에러까지 기록한다.
- **복제를 쓴다면 `2` 이상이 문서 권고다.** 네트워크 장애나 재접속 정보를 얻기 위해서다.
- `SYSTEM` 우선순위 메시지는 verbosity 필터를 받지 않는다. 시작·종료 메시지와 주요 설정 변경은 항상 기록된다.
- `log_filter_internal` 은 내장이며 기본 활성이다. 이 필터를 끄면 `log_error_verbosity` 와 `log_error_suppression_list` 가 무효가 된다. `log_error_services` 의 기본값은 `log_filter_internal; log_sink_internal` 이다.
- `log_timestamps` 의 기본값은 `UTC` 이고 허용값은 `UTC` 와 `SYSTEM` 이다. 에러 로그 전체와 일반·슬로우 쿼리 로그 **파일**에 적용된다. 형식은 ISO 8601/RFC 3339(`2020-08-07T15:02:00.832521Z`)다. `time_zone` 을 `Asia/Seoul` 로 두어도 로그 시각은 기본적으로 UTC 다. 장애 시각을 맞출 때 혼동하지 않도록 둘 중 하나를 기준으로 통일한다.
