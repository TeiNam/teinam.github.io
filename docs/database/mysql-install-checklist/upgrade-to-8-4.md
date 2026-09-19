---
title: "MySQL 8.4 로 갈 때 깨지는 것"
permalink: /docs/database/mysql-install-checklist/upgrade-to-8-4/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 8.4 업그레이드 시 깨지는 것"
updated: 2026-09-19
guide: mysql-install-checklist
order: 11
nav_title: "8.4 업그레이드"
---

8.0 기준으로 써 둔 옵션 파일과 운영 스크립트가 8.4 에서 그대로 죽는 지점이다. 제거된 변수는 **8.4 에서 설정을 시도하면 에러가 난다.**

| 제거된 변수·옵션 | 대체 |
|---|---|
| `expire_logs_days` | `binlog_expire_logs_seconds` |
| `default_authentication_plugin` | `authentication_policy`(문법도 다름) |
| `binlog_transaction_dependency_tracking` | 기능 내부화, 항상 WRITESET 동작 |
| `transaction_write_set_extraction` | — |
| `log_bin_use_v1_events` | — |
| `--relay-log-info-file` · `--relay-log-info-repository` | — |
| `--master-info-file` · `--master-info-repository` | — |
| `--slave-rows-search-algorithms` | 항상 `HASH_SCAN,INDEX_SCAN` |
| `--ssl` · `--admin-ssl` · `have_ssl` · `have_openssl` | — |
| `--skip-host-cache` | `--host-cache-size=0` |
| `--innodb` · `--skip-innodb` · `--character-set-client-handshake` | — |
| `--no-dd-upgrade` | `--upgrade=NONE` |
| `SET_USER_ID` 권한 | `SET_ANY_DEFINER` · `ALLOW_NONEXISTENT_DEFINER` |
| `keyring_file` · `keyring_encrypted_file` · `keyring_oci` | 같은 이름의 `component_*` 컴포넌트 |
| `authentication_fido` · `authentication_fido_rp_id` | `authentication_webauthn` |
| `group_replication_ip_whitelist` | `group_replication_allowlist` |

기본값이 바뀐 변수 중 설정 문서에 영향이 큰 것들이다.

| 변수 | 8.0 | 8.4 |
|---|---|---|
| `innodb_change_buffering` | `all` | `none` |
| `innodb_adaptive_hash_index` | `ON` | `OFF` |
| `innodb_flush_method`(Linux) | `fsync` | 지원되면 `O_DIRECT` |
| `innodb_io_capacity` | 200 | 10000 |
| `innodb_io_capacity_max` | 최소 2000 | `innodb_io_capacity` 의 2배 |
| `innodb_log_buffer_size` | 16MiB | 64MiB |
| `innodb_numa_interleave` | `OFF` | `ON` |
| `innodb_use_fdatasync` | `OFF` | `ON` |
| `innodb_buffer_pool_instances` | 8 | 산식 기반 |
| `innodb_doublewrite_files` | instances × 2 | 2 |
| `innodb_doublewrite_pages` | 4 | 128 |
| `temptable_max_ram` | 1GiB | 총메모리 3%(1–4GiB) |
| `temptable_max_mmap` | 1GiB | `0` |
| `restrict_fk_on_non_standard_key` | (없음) | `ON` |

복제 문장은 전면 개명됐다. 예전 이름은 문법 오류가 된다.

| 8.0 | 8.4 |
|---|---|
| `CHANGE MASTER TO` | `CHANGE REPLICATION SOURCE TO` |
| `RESET MASTER` | `RESET BINARY LOGS AND GTIDS` |
| `SHOW MASTER STATUS` | `SHOW BINARY LOG STATUS` |
| `SHOW MASTER LOGS` · `PURGE MASTER LOGS` | `SHOW BINARY LOGS` · `PURGE BINARY LOGS` |
| `START SLAVE` · `STOP SLAVE` | `START REPLICA` · `STOP REPLICA` |
| `SHOW SLAVE STATUS` · `SHOW SLAVE HOSTS` | `SHOW REPLICA STATUS` · `SHOW REPLICAS` |
| `RESET SLAVE` | `RESET REPLICA` |
| `MASTER_*` 옵션·키워드 | `SOURCE_*` |

그 밖에 확인할 것들이다.

- 업그레이드 전에 `AUTO_INCREMENT` 가 붙은 `FLOAT`·`DOUBLE` 컬럼이 있는 테이블을 **반드시 고쳐야 한다.** 그러지 않으면 업그레이드가 실패한다(`ER_WRONG_FIELD_SPEC`).
- `mysql_upgrade`, `mysql_ssl_rsa_setup`, `mysqlpump`(및 `lz4_decompress`·`zlib_decompress`)가 제거됐다.
- `INFORMATION_SCHEMA.TABLESPACES` 가 제거됐고, `DROP`·`ALTER TABLESPACE` 의 `ENGINE` 절도 예외 두 건을 빼고 제거됐다.
- `LOCK TABLES ... WRITE` 의 `LOW_PRIORITY` 는 문법 오류가 된다. 파티셔닝 키에 인덱스 프리픽스를 쓸 수 없다. 시스템 변수에 `NULL` 을 지정할 수 없다(예외 목록이 있다).
- `WAIT_UNTIL_SQL_THREAD_AFTER_GTIDS()` 는 `WAIT_FOR_EXECUTED_GTID_SET()` 으로 대체됐다.
- 8.4 에서 새로 deprecated 된 것은 다음과 같다.

  - DB 권한 부여의 `%`·`_` 와일드카드
  - 비유니크·부분 키를 외래 키로 쓰기
  - `DISABLE ON SLAVE`
  - `INFORMATION_SCHEMA.PROCESSLIST`
  - `temptable_use_mmap`
  - `--master-retry-count`
  - `group_replication_view_change_uuid`
  - `group_replication_allow_local_lower_version_join`
- 9.7 까지 더 갈 계획이라면 다음을 함께 본다.

  - `mysql_native_password` 가 **9.0.0 에서 제거**됐다.
  - `replica_parallel_type` 과 `group_replication_allow_local_lower_version_join` 이 제거됐다.
  - `binlog_transaction_dependency_history_size` 기본값이 25000 에서 **1000000** 으로 바뀌었다(9.5.0, 최대 10000000).
  - `innodb_log_writer_threads` 기본값이 `log_bin` 활성 여부와 논리 CPU 수에 따라 결정된다.
