---
title: "초기화할 때만 정할 수 있는 값"
permalink: /docs/database/mysql-install-checklist/initialize-only/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 데이터 디렉터리 초기화 시점에만 정할 수 있는 값"
updated: 2026-09-19
guide: mysql-install-checklist
order: 1
nav_title: "초기화 전용 값"
---

이 절을 맨 앞에 두는 이유는 단순하다. 나중에 바꿀 수 없으니 순서상 가장 먼저 결정해야 한다.

InnoDB 설정에서 먼저 결정할 것은 데이터 파일, 로그 파일, 페이지 크기, 메모리 버퍼다. 문서는 이들을 **InnoDB 초기화 전에 구성해야 하고 초기화 이후의 변경은 간단하지 않은 절차를 수반한다**고 명시한다. 데이터 디렉터리를 초기화하는 순간에는 `--basedir`·`--datadir` 처럼 디렉터리 위치를 정하는 옵션과 필요한 경우의 `--user` 외에는 지정하지 않는 것이 문서 권고다. 서버가 평소 사용할 옵션은 초기화 후 재기동할 때 적용한다. 다만 디렉터리와 테이블스페이스 관련 옵션은 `mysqld` 를 처음 실행하기 전에 옵션 파일에 들어가 있어야 한다.

| 파라미터 | 초기화 이후 | 기본값 |
|---|---|---|
| `lower_case_table_names` | 변경 금지 | Unix 0 · Windows 1 · macOS 2 |
| `innodb_page_size` | 인스턴스 생성 시점에 고정 | 16KB |
| `innodb_data_file_path` | 첫 파일명 변경은 새 인스턴스 필요 | `ibdata1:12M:autoextend` |
| `innodb_data_home_dir` · `innodb_log_group_home_dir` | 재시작 필요 | 데이터 디렉터리 |

### `lower_case_table_names`

- 문서 표현은 명확하다. 이 변수는 **서버를 초기화할 때만 설정할 수 있고, 초기화 이후 설정을 바꾸는 것은 금지**된다.
- 플랫폼 기본값은 Unix 가 `0`, Windows 가 `1`, macOS 가 `2` 다.
- `0` — 생성 시 대소문자를 그대로 디스크에 저장하고 비교도 대소문자를 구분한다. Windows·macOS 처럼 파일명 대소문자를 구분하지 않는 시스템에서는 이 값을 쓰지 않는다. 강제하면 인덱스 손상이 발생할 수 있다.
- `1` — 소문자로 저장하고 비교 시 대소문자를 무시한다. 데이터베이스명과 테이블 별칭에도 적용된다.
- `2` — 저장은 원래 대소문자로 하고 조회할 때 소문자로 변환한다. 대소문자를 구분하지 **않는** 파일시스템에서만 동작한다. InnoDB 테이블명과 뷰 이름은 `1` 과 같이 소문자로 저장된다.
- 문서가 제시하는 선택지는 두 가지다. 모든 시스템에서 `1` 을 쓰면 `SHOW TABLES` 가 원래 대소문자를 보여주지 못한다. Unix 는 `0`, Windows 는 `2` 로 두면 문장마다 대소문자를 정확히 써야 한다.
- **InnoDB 테이블을 쓰면서 플랫폼 간 이관 문제를 피하려면 모든 플랫폼에서 `1` 을 쓰라는 것이 문서의 예외 권고다.** Unix 에서는 `my_table` 과 `MY_TABLE` 이 공존할 수 있지만 Windows 에서는 같은 테이블로 취급되므로, 이관 시점에 충돌이 드러난다.
- 트리거 식별자는 이 변수의 영향을 받지 않는다.

### `innodb_page_size`

- 인스턴스 안 모든 InnoDB 테이블스페이스의 페이지 크기를 정한다. **이 값은 인스턴스를 만들 때 정해지고 이후 변하지 않는다.**
- 허용값은 64KB, 32KB, **16KB(기본값)**, 8KB, 4KB 이고 바이트로도 지정할 수 있다(65536, 32768, 16384, 8192, 4096). 데이터 디렉터리를 초기화할 때만 설정할 수 있으며 동적 변경은 불가하다.
- 첫 데이터 파일의 최소 크기가 페이지 크기에 연동된다. 16KB 이하는 5MB, 32KB 는 6MB, 64KB 는 12MB 다.
- 페이지 크기에 따라 인덱스 키 최대 길이, 행 크기 한계, 압축 동작이 달라진다. 바꾸려면 새 인스턴스를 만들어 논리 덤프로 이관해야 하므로, 기본값을 벗어날 이유가 분명할 때만 건드린다.

### 데이터 파일과 리두 로그 경로

- `mysqld` 가 InnoDB 시스템 테이블스페이스를 구성한 뒤에는 **테이블스페이스 특성 중 일부를 바꾸려면 완전히 새 인스턴스를 세워야 한다.** 문서가 든 예는 시스템 테이블스페이스 첫 파일의 파일명과 언두 로그 개수다.
- 기본값을 쓰지 않을 생각이라면 `mysqld` 를 실행하기 **전에** `innodb_data_file_path` 와 `innodb_log_file_size` 설정이 옵션 파일에 있어야 한다. `innodb_data_home_dir`·`innodb_log_group_home_dir` 처럼 InnoDB 파일의 생성·위치에 영향을 주는 파라미터도 함께 지정한다.
- `innodb_data_file_path` 의 기본 동작은 `ibdata1` 이라는 자동 확장 데이터 파일 하나를 12MB보다 약간 크게 만드는 것이다. 문법은 `file_name:file_size[:autoextend[:max:max_file_size]]` 이고, `autoextend` 와 `max` 는 마지막 파일에만 붙일 수 있다. 자동 확장 증가분은 64MB 이며 `innodb_autoextend_increment` 로 조절한다.
- 초기화 시점에 언두 테이블스페이스 2개가 함께 생성된다. 전역 임시 테이블스페이스 `ibtmp1` 은 약 12MB 로 시작해 자동 확장되고, 세션 임시 테이블스페이스는 `#innodb_temp` 에 놓인다. `innodb_undo_directory` 는 동적 변경이 불가해서 설정을 바꾸려면 재시작이 필요하다.
- 리두 로그 파일 개수와 개별 크기를 기본값과 다르게 두려면 **인스턴스를 초기화할 때** `innodb_log_files_in_group` 과 `innodb_log_file_size` 를 설정해야 한다. 두 변수는 8.0.30 에서 deprecated 됐으므로, 새로 세우는 서버는 「내구성과 복제 안전성」 절의 `innodb_redo_log_capacity` 를 쓴다.

```ini
[mysqld]
lower_case_table_names    = 1
innodb_page_size          = 16384
innodb_data_home_dir      = /var/lib/mysql
innodb_data_file_path     = ibdata1:12M:autoextend
innodb_log_group_home_dir = /var/lib/mysql
```

### 재시작이 필요한 것들

초기화 전용은 아니지만 동적 변경이 불가해서, 운영 중에 고치려면 재시작 창을 잡아야 하는 값들이다. 첫 구성 때 함께 정해 두면 재시작 한 번을 아낀다.

| 파라미터 | 비고 |
|---|---|
| `innodb_buffer_pool_instances` | 기동 시 결정 |
| `innodb_buffer_pool_chunk_size` | 버퍼풀 크기 반올림 기준 |
| `innodb_flush_method` | 기동 시 결정 |
| `innodb_autoinc_lock_mode` | 기동 시 결정 |
| `innodb_dedicated_server` | 기동 시 결정 |
| `log_bin` | 기동 옵션 |
| `relay_log_recovery` | 기본 `OFF`, 런타임 읽기 전용 |
| `innodb_doublewrite` | `ON` 과 `OFF` 사이의 동적 전환 불가 |

- `innodb_doublewrite` 는 `ON`·`DETECT_AND_RECOVER`·`DETECT_ONLY` 사이에서는 동적으로 바꿀 수 있지만, 활성 상태와 `OFF` 사이의 전환은 지원되지 않는다.
