---
title: "AWS RDS · Aurora 를 쓸 때"
permalink: /docs/database/mysql-install-checklist/aws-rds-aurora/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — AWS RDS·Aurora 파라미터"
last_modified_at: 2026-09-19
guide: mysql-install-checklist
order: 12
nav_title: "RDS · Aurora"
---

> **IMPORTANT** — 중괄호 수식은 MySQL 문법이 아니다
>
> `GREATEST({DBInstanceClassMemory/32}, 209715200)` 같은 표기는 **RDS 파라미터 그룹이 평가하는 RDS 고유 표기**다. MySQL 서버는 이 문자열을 해석하지 못하므로 `my.cnf` 에 넣지 않는다. MySQL 시스템 변수는 정수·열거값·문자열만 받는다.

- 수식 문법은 `{FormulaVariable}`, `{FormulaVariable*Integer}`, `{FormulaVariable*Integer/Integer}`, `{FormulaVariable/Integer}` 네 가지다. 사용할 수 있는 변수는 `AllocatedStorage`, `DBInstanceClassMemory`, `DBInstanceVCPU`, `EndPointPort`, `TrueIfReplica` 다.
- 연산자는 나눗셈과 곱셈 둘뿐이고 **몫의 소수점은 반올림하지 않고 잘라낸다.** 함수는 `GREATEST`, `LEAST`, `SUM` 을 쓸 수 있고 함수명은 대소문자를 구분하지 않는다. 로그 수식의 `log` 는 밑이 2 다.
- `DBInstanceClassMemory` 는 OS 와 RDS 프로세스용으로 예약된 메모리를 뺀 값이라 인스턴스 클래스 표의 메모리 수치보다 항상 다소 작다.
- 파라미터 값이 `engine default` 로 표시되어 있으면 실제 기본값은 해당 버전의 MySQL 문서에서 확인한다.
- AWS 문서는 두 목록을 따로 제시한다. 하나는 **Aurora MySQL 에 적용되지 않는** MySQL 파라미터이고, 다른 하나는 **파라미터 그룹에서 수정할 수 없는** 파라미터다.
- Aurora MySQL 에서 **아예 적용되지 않는 MySQL 파라미터**가 많다. AWS 문서가 드는 목록은 다음과 같고, 문서 스스로 이것이 전부가 아니라고 밝힌다.
  - 데이터·리두 파일 — `innodb_data_file_path` · `innodb_redo_log_capacity` · `innodb_log_file_size` · `innodb_log_files_in_group` · `innodb_log_buffer_size`
  - 페이지·버퍼풀 — `innodb_page_size` · `innodb_buffer_pool_chunk_size` · `innodb_buffer_pool_instances` · `innodb_change_buffering`
  - I/O·플러시 — `innodb_doublewrite` · `innodb_flush_method` · `innodb_io_capacity` · `innodb_numa_interleave`
  - undo — `innodb_undo_tablespaces`

  **이 문서의 내구성·리두 항목 다수가 Aurora 에서는 효과가 없다.**
- 수정할 수 없는 파라미터도 있다.
  - 스토리지·엔진 — `default_storage_engine` · `innodb_page_size` · `innodb_data_home_dir` · `innodb_undo_directory`
  - 복제·식별 — `server_id` · `sync_binlog` · `relay_log_recovery`
  - 인증·권한 — `default_authentication_plugin` · `partial_revokes`
  - 그 밖에 — `default_time_zone` · `skip_name_resolve` · `thread_handling` · `tmpdir`
- 파일 경로 계열은 사유가 다르다. `basedir` · `datadir` · `plugin_dir` · `secure_file_priv` · `general_log_file` · `slow_query_log_file` 는 파일시스템에 직접 접근하지 않는 관리형 인스턴스라서 설정 대상 자체가 아니다.
- `gtid-mode` 와 `enforce_gtid_consistency` 는 Aurora MySQL 버전 2 이상에서 수정할 수 있다. `event_scheduler` 는 버전 3 에서 클러스터 레벨로만 설정한다.
- **`lower_case_table_names` 는 Aurora MySQL 버전 3 에서 클러스터를 만드는 시점에 영구히 고정된다.** 버전 2 에서는 수정할 수 있다. 글로벌 데이터베이스에서 이 값이 켜져 있으면 버전 2 에서 3 으로의 in-place 업그레이드가 불가능하다.
- `innodb_flush_log_at_trx_commit` 은 수정할 수 있지만 AWS 는 기본값 `1` 을 쓰라고 강력히 권고한다. 버전 3 에서 `1` 이 아닌 값으로 바꾸려면 먼저 `innodb_trx_commit_allow_data_loss` 를 `1` 로 설정해야 하고(기본값 `0`), 그것은 데이터 유실 위험을 인정한다는 뜻이다.
- Aurora 의 임시 테이블 기본값은 커뮤니티 MySQL 과 다르다. `temptable_max_ram` 은 메모리 16GiB 이상 인스턴스에서 1GiB, 그보다 작은 인스턴스에서 16MB 다. `temptable_max_mmap` 은 writer·reader 모두 1GiB 이며 인스턴스 메모리와 무관하다. reader 에서는 `0` 으로 설정할 수 없다. Aurora MySQL 8.4.7 이상은 이 기본값이 `LEAST(4294967296, {AllocatedStorage*3/100})` 로 바뀌었다. reader 는 항상 TempTable 엔진을 쓴다.
- `aurora_tmptable_enable_per_table_limit` 은 인스턴스 레벨 파라미터로, **Aurora MySQL 버전 3.04 이상에서 `tmp_table_size` 가 TempTable 엔진이 만든 인메모리 임시 테이블의 최대 크기를 제어할지** 결정한다. 기본값은 `OFF` 이며 3.03 이하와 같은 동작이다. `OFF` 일 때 `tmp_table_size` 는 TempTable 이 만든 내부 인메모리 임시 테이블에 고려되지 않는다. 전역 TempTable 한도에 닿으면 writer 는 InnoDB 디스크 임시 테이블로 전환한다. 그러나 **reader 는 쿼리가 실패한다**(`ERROR 1114 (HY000): The table '/rdsdbdata/tmp/#sql...' is full`). `internal_tmp_mem_storage_engine=MEMORY` 이면 이 파라미터는 무효다.
- 그 밖의 Aurora 기본값으로 `time_zone` 은 UTC, `character_set_database` 는 `utf8mb4`, `read_only` 는 버전 2 가 `{TrueIfReplica}` 이고 버전 3 이 `0` 이다. Aurora 는 `interactive_timeout` 과 `wait_timeout` 중 **최솟값**으로 모든 유휴 세션을 끊는다.
- 비밀번호 정책은 Aurora MySQL 8.4.7 이상에서 `aurora_enable_validate_password_component`(기본 `0`)로 관리하며 `INSTALL COMPONENT` 를 쓰지 않는다. 같은 버전대에서 `authentication_policy` 기본값은 `*:caching_sha2_password` 이고, `validate_password.policy` 는 LOW 와 MEDIUM 만 지원한다.
- RDS for MySQL 은 Aurora 와 파라미터 지원 범위가 다르다. 위 Aurora 항목을 그대로 적용하지 말고 해당 엔진과 버전의 파라미터 그룹 문서를 확인한다.

여기까지 세팅해 두면 시스템 규모가 커진 뒤에도 DB 에서 일어나는 일의 원인을 추적할 수 있다. 나중에 감사나 이관, DBA 합류 같은 단계가 와도 호환성과 데이터 무결성을 근거 있게 설명할 수 있다.
