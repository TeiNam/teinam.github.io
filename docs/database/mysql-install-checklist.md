---
title: "MySQL 초기 설치 체크리스트"
permalink: /docs/database/mysql-install-checklist/
breadcrumb: "Docs / Database"
description: "MySQL 을 처음 설치할 때 기본값으로 두면 안 되는 파라미터"
updated: 2026-09-19
redirect_from:
  - /writing/mysql-first-install-checklist/
---

> **INFO** — 유효 범위와 버전 기준선
>
> 값은 MySQL 8.4 LTS 매뉴얼을 기준으로 적었고, 8.0 과 다른 항목은 버전을 함께 표기했다.
> **MySQL 8.0 은 2026-04-21 부로 Oracle Sustaining Support 로 이관되어 Premier·Extended 지원이 끝났다.**
> 공식 문서가 안내하는 업그레이드 대상은 8.4 LTS 또는 9.7 LTS 이므로, 신규 구축이라면 이 두 계열에서 고른다.
>
> - LTS 계열은 Premier 5년과 Extended 3년을 지원하고, Innovation 계열은 다음 Innovation 릴리스가 나올 때까지만 지원된다.
> - LTS 업그레이드는 한 단계씩만 지원된다. 8.4 에서 9.7 로는 갈 수 있지만, LTS 계열을 건너뛰는 경로는 지원되지 않는다.
> - 9.7 은 순차 버전 번호를 쓰는 마지막 LTS 계열이고, 이후 릴리스는 `YY.M.P` 형식의 캘린더 버저닝을 쓴다. 첫 캘린더 버전은 2026년 7월 릴리스인 26.7.0 이다. 캘린더 버전 번호만으로는 그 릴리스가 Innovation 인지 LTS 인지 구분되지 않는다.

처음 MySQL 을 구성하는 개발자나 스타트업은 대부분 기본값을 그대로 두고 시작한다. 그런데 기본값은 "어디서나 기동되는 값"이지 "우리 서비스에 맞는 값"이 아니다. 서비스가 커진 뒤에 데이터 정합성이나 무결성 문제가 드러나면 이미 쌓인 데이터를 안은 채로 되돌려야 하므로 비용이 몇 배로 든다. 초기화 시점에만 정할 수 있어서 아예 되돌릴 수 없는 값도 있다.

그래서 이 문서는 MySQL 을 새로 세울 때마다 위에서부터 짚어 가는 순서로 배치했다. 되돌릴 수 없는 항목이 맨 앞이고, 운영 중에 바꿀 수 있는 항목이 뒤쪽이다. DB 가 맡는 역할에 따라 답이 갈리는 항목은 판단 기준을 함께 적었다.

## 초기화할 때만 정할 수 있는 값

이 절을 맨 앞에 두는 이유는 단순하다. 나중에 바꿀 수 없으니 순서상 가장 먼저 결정해야 한다.

InnoDB 설정에서 먼저 결정할 것은 데이터 파일, 로그 파일, 페이지 크기, 메모리 버퍼이며, 문서는 이들을 **InnoDB 초기화 전에 구성해야 하고 초기화 이후의 변경은 간단하지 않은 절차를 수반한다**고 못 박는다. 한편 데이터 디렉터리를 초기화하는 순간에는 `--basedir`·`--datadir` 처럼 디렉터리 위치를 정하는 옵션과 필요한 경우의 `--user` 외에는 지정하지 않는 것이 문서 권고다. 서버가 평소 사용할 옵션은 초기화 후 재기동할 때 적용한다. 다만 디렉터리와 테이블스페이스 관련 옵션은 `mysqld` 를 처음 실행하기 전에 옵션 파일에 들어가 있어야 한다.

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
- 문서가 제시하는 선택지는 두 가지다. 모든 시스템에서 `1` 을 쓰거나(대신 `SHOW TABLES` 가 원래 대소문자를 보여주지 못한다), Unix 는 `0` Windows 는 `2` 로 두는 것이다(대신 문장마다 대소문자를 정확히 써야 한다).
- **InnoDB 테이블을 쓰면서 플랫폼 간 이관 문제를 피하려면 모든 플랫폼에서 `1` 을 쓰라는 것이 문서의 예외 권고다.** Unix 에서는 `my_table` 과 `MY_TABLE` 이 공존할 수 있지만 Windows 에서는 같은 테이블로 취급되므로, 이관 시점에 충돌이 드러난다.
- 트리거 식별자는 이 변수의 영향을 받지 않는다.

### `innodb_page_size`

- 인스턴스 안 모든 InnoDB 테이블스페이스의 페이지 크기를 정한다. **이 값은 인스턴스를 만들 때 정해지고 이후 변하지 않는다.**
- 허용값은 64KB, 32KB, **16KB(기본값)**, 8KB, 4KB 이고 바이트로도 지정할 수 있다(65536, 32768, 16384, 8192, 4096). 데이터 디렉터리를 초기화할 때만 설정할 수 있으며 동적 변경은 불가하다.
- 첫 데이터 파일의 최소 크기가 페이지 크기에 연동된다. 16KB 이하는 5MB, 32KB 는 6MB, 64KB 는 12MB 다.
- 페이지 크기에 따라 인덱스 키 최대 길이, 행 크기 한계, 압축 동작이 달라진다. 바꾸려면 새 인스턴스를 만들어 논리 덤프로 이관해야 하므로, 기본값을 벗어날 이유가 분명할 때만 건드린다.

### 데이터 파일과 리두 로그 경로

- `mysqld` 가 InnoDB 시스템 테이블스페이스를 구성한 뒤에는 **테이블스페이스 특성 중 일부를 바꾸려면 완전히 새 인스턴스를 세워야 한다.** 문서가 든 예는 시스템 테이블스페이스 첫 파일의 파일명과 언두 로그 개수다.
- 따라서 기본값을 쓰지 않을 생각이라면 `mysqld` 를 실행하기 **전에** `innodb_data_file_path` 와 `innodb_log_file_size` 설정이 옵션 파일에 있어야 하고, `innodb_data_home_dir`·`innodb_log_group_home_dir` 처럼 InnoDB 파일의 생성·위치에 영향을 주는 파라미터도 함께 지정해야 한다.
- `innodb_data_file_path` 의 기본 동작은 `ibdata1` 이라는 자동 확장 데이터 파일 하나를 12MB보다 약간 크게 만드는 것이다. 문법은 `file_name:file_size[:autoextend[:max:max_file_size]]` 이고, `autoextend` 와 `max` 는 마지막 파일에만 붙일 수 있다. 자동 확장 증가분은 64MB 이며 `innodb_autoextend_increment` 로 조절한다.
- 초기화 시점에 언두 테이블스페이스 2개가 함께 생성된다. 전역 임시 테이블스페이스 `ibtmp1` 은 약 12MB 로 시작해 자동 확장되고, 세션 임시 테이블스페이스는 `#innodb_temp` 에 놓인다. `innodb_undo_directory` 는 동적 변경이 불가해서 설정을 바꾸려면 재시작이 필요하다.
- 리두 로그 파일 개수와 개별 크기를 기본값과 다르게 두려면 **인스턴스를 초기화할 때** `innodb_log_files_in_group` 과 `innodb_log_file_size` 를 설정해야 한다. 두 변수는 8.0.30 에서 deprecated 됐으므로, 새로 세우는 서버는 뒤에 나오는 `innodb_redo_log_capacity` 를 쓴다.

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
- 데이터 디렉터리 초기화는 `mysql` 스키마에 시간대 테이블을 **만들지만 채우지는 않는다.** `--initialize` 또는 `--initialize-insecure` 로 직접 초기화한 경우에는 바이너리 로깅이 기본 비활성이다.

## SQL_MODE

`sql_mode` 를 비워 두고 쓰면 잘못된 데이터가 경고만 남기고 통과한다. 정합성이 깨진 데이터는 나중에 다른 DB 로 이관하거나 버전을 올리거나 데이터 검증을 해야 할 때 한꺼번에 드러난다.

다행히 8.0 과 8.4 의 기본 `sql_mode` 는 이미 6개 모드를 포함한다. 두 버전 모두 `ONLY_FULL_GROUP_BY`, `STRICT_TRANS_TABLES`, `NO_ZERO_IN_DATE`, `NO_ZERO_DATE`, `ERROR_FOR_DIVISION_BY_ZERO`, `NO_ENGINE_SUBSTITUTION` 이다. 그래서 이 절의 질문은 "무엇을 켤까"가 아니라 **"기본값에 무엇을 더할까"** 다.

```sql
SELECT @@GLOBAL.sql_mode;
```

### `TRADITIONAL` 이 실제로 포함하는 것

`TRADITIONAL` 은 정확히 6개 모드와 같다. `STRICT_TRANS_TABLES`, `STRICT_ALL_TABLES`, `NO_ZERO_IN_DATE`, `NO_ZERO_DATE`, `ERROR_FOR_DIVISION_BY_ZERO`, `NO_ENGINE_SUBSTITUTION` 이다. **`ONLY_FULL_GROUP_BY` 는 여기에 포함되지 않는다.** 이 모드는 기본 `sql_mode` 목록과 `ANSI` 조합 모드에만 들어 있다.

| 모드 | 기본 `sql_mode` | `TRADITIONAL` |
|---|---|---|
| `ONLY_FULL_GROUP_BY` | 포함 | 미포함 |
| `STRICT_TRANS_TABLES` | 포함 | 포함 |
| `STRICT_ALL_TABLES` | 미포함 | 포함 |
| `NO_ZERO_IN_DATE` | 포함 | 포함 |
| `NO_ZERO_DATE` | 포함 | 포함 |
| `ERROR_FOR_DIVISION_BY_ZERO` | 포함 | 포함 |
| `NO_ENGINE_SUBSTITUTION` | 포함 | 포함 |

각 모드가 막아 주는 것은 다음과 같다.

- `STRICT_TRANS_TABLES` — 트랜잭션 테이블에 잘못된 데이터를 넣으려 하면 오류를 내고, 비트랜잭션 테이블에서는 경고를 낸다. 유효하지 않거나 누락된 데이터가 첫 번째 행이 아닌 여러 행에 걸친 경우를 제외하면 문장이 중단되고 롤백된다.
- `STRICT_ALL_TABLES` — 모든 테이블에 대해 잘못된 데이터 삽입을 오류로 만든다.
- `NO_ZERO_IN_DATE` — 연도는 0 이 아니지만 월이나 일이 `0` 인 날짜를 거부한다. 이 모드만 켠 상태에서는 `0000-00-00` 은 허용되고 `1970-00-10` 이나 `1929-01-00` 이 거부된다.
- `NO_ZERO_DATE` — `0000-00-00` 같은 날짜를 거부한다.
- `ERROR_FOR_DIVISION_BY_ZERO` — `0` 으로 나누기를 오류로 만든다. 켜지 않으면 `0` 으로 나눈 결과가 `NULL` 이 된다.
- `NO_ENGINE_SUBSTITUTION` — 지정한 스토리지 엔진이 없을 때 다른 엔진으로 대체하지 않고 오류를 낸다. 켜지 않으면 기본 스토리지 엔진으로 테이블이 만들어진다.
- `ONLY_FULL_GROUP_BY` — `GROUP BY` 절에 명확히 지정되지 않은 비집계 열을 선택하면 오류를 낸다.

### 기본값과 무엇이 다른가

기본값과 `TRADITIONAL` 의 차이는 두 개뿐이다. `TRADITIONAL` 은 `STRICT_ALL_TABLES` 를 더하고 `ONLY_FULL_GROUP_BY` 를 뺀다. 그래서 `sql_mode = TRADITIONAL` 만 적으면 그동안 기본값이 잡아 주던 `GROUP BY` 오류가 통과한다. 둘 다 원하면 다음처럼 쓴다.

```ini
[mysqld]
# 기본 6개 모드 + STRICT_ALL_TABLES
sql_mode = ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
```

`sql_mode = TRADITIONAL,ONLY_FULL_GROUP_BY` 도 같은 모드 집합이 된다. 어느 쪽이든 기동 후 위의 확인 쿼리로 실제 적용값을 한 번 읽어 본다.

> **IMPORTANT** — `NO_AUTO_CREATE_USER` 는 옵션 파일에서 지운다
>
> 이 모드는 8.0.11 에서 제거됐다. MySQL 8.0 에서 기동 실패를 피하려면 옵션 파일의 `sql_mode` 설정에서 `NO_AUTO_CREATE_USER` 를 모두 제거해야 한다. 스토어드 프로그램 정의에 이 모드가 들어 있는 덤프 파일을 8.0 서버에 적재하면 실패한다. 8.4 매뉴얼의 모드 목록에는 이 이름이 아예 없다.
>
> 같은 8.0.11 에서 `DB2`, `MAXDB`, `MSSQL`, `MYSQL323`, `MYSQL40`, `ORACLE`, `POSTGRESQL`, `NO_FIELD_OPTIONS`, `NO_KEY_OPTIONS`, `NO_TABLE_OPTIONS` 도 제거되어 `sql_mode` 에 지정할 수 없다. 또한 `GRANT` 로 계정의 비권한 특성을 바꾸는 사용법 자체가 제거됐으므로, 계정 생성과 변경은 `CREATE USER` 와 `ALTER USER` 로 한다.

### 함께 알아둘 것

- 매뉴얼에서 말하는 "strict mode" 는 `STRICT_TRANS_TABLES` 나 `STRICT_ALL_TABLES` 중 하나 이상이 켜진 상태를 뜻한다.
- `ERROR_FOR_DIVISION_BY_ZERO`, `NO_ZERO_DATE`, `NO_ZERO_IN_DATE` 는 **deprecated 이면서 기본 활성**이고, strict mode 의 일부가 아니다. 문서는 이 모드들이 개별 이름으로는 장래에 제거되고 그 효과가 strict mode 에 흡수될 것으로 예고한다. `PAD_CHAR_TO_FULL_LENGTH` 도 deprecated 다.
- `TIME_TRUNCATE_FRACTIONAL` 은 시간 값의 소수점 이하 초를 반올림하지 않고 잘라낸다. 밀리초 경계에서 값이 다음 초나 다음 날짜로 올라가는 것을 막아야 할 때 쓴다.

## 문자셋 · 콜레이션 · 시간대

### 문자셋

- 서버 기본 문자셋은 `character_set_server`, 서버 기본 콜레이션은 `collation_server` 로 정한다. 8.0 이상의 기본값은 각각 **`utf8mb4`** 와 **`utf8mb4_0900_ai_ci`** 다. 8.0 에서 `latin1` 과 `latin1_swedish_ci` 로부터 바뀐 값이다.
- 즉 8.0 이상을 새로 세운다면 문자셋은 이미 원하는 값이다. 손댈 것은 오래된 설정 파일이나 문서에서 복사해 온 `utf8`·`utf8mb3` 지정을 걷어내는 쪽이다.
- `utf8mb3` 는 deprecated 다. 8.0.x 와 8.4.x LTS 계열 수명 동안은 지원되지만 장래 메이저 릴리스에서 제거될 것으로 문서가 예고한다. `CHARACTER SET` 절 밖의 용법(`--character-set-server=utf8mb3`, `SET NAMES 'utf8mb3'`, `_utf8mb3 'a'`)도 함께 deprecated 다.
- `utf8` 은 `utf8mb3` 의 deprecated 별칭이다. 출력에서는 `utf8` 과 `utf8_` 접두어가 `utf8mb3` 와 `utf8mb3_` 로 표기된다.
- 사용 중에 서버 기본 문자셋을 바꾸면 이미 만들어진 객체와 새로 만드는 객체의 문자셋이 갈리므로, 처음 구축할 때 정해 둔다.

```ini
[mysqld]
character_set_server = utf8mb4
collation_server     = utf8mb4_0900_ai_ci
```

### 콜레이션과 한국어

기본 콜레이션 `utf8mb4_0900_ai_ci` 는 UCA 9.0.0 가중치 키와 CLDR v30 을 기반으로 하며, 악센트와 대소문자를 구분하지 않는다(이름의 `_0900`·`_ai`·`_ci` 가 그 뜻이다). 특정 언어에 맞춘 콜레이션이 아니라 보조 문자까지 포함해 기본 순서로 정렬한다. pad 속성은 `NO PAD` 여서 `'a'` 와 `'a '` 가 서로 다른 문자열로 비교된다.

한국어와 관련된 문제는 실재한다. MySQL Bug #111331 은 `'가나다'`, `'ㄱㅏ나다'`, `'ㄱㅏㄴㅏㄷㅏ'` 세 행을 넣고 `WHERE name = '가나다'` 를 실행하면 `utf8mb4_0900_ai_ci` 테이블이 **세 행 모두**를 반환한다고 보고한다. 같은 조건에서 `utf8mb4_general_ci` 테이블은 한 행만 반환한다.

```sql
SELECT '가나다' COLLATE utf8mb4_0900_ai_ci  = 'ㄱㅏㄴㅏㄷㅏ' COLLATE utf8mb4_0900_ai_ci  AS ai_ci,
       '가나다' COLLATE utf8mb4_general_ci = 'ㄱㅏㄴㅏㄷㅏ' COLLATE utf8mb4_general_ci AS general_ci;
```

앞 컬럼은 `1`, 뒤 컬럼은 `0` 을 돌려준다. 호환 자모로 분해한 표기와 완성형이 같은 가중치를 갖기 때문이며, Oracle 은 이를 UCA 표준을 그대로 구현한 결과로 보고 "Not a Bug" 으로 닫았다. 규격상 서로 다른 grapheme cluster 를 가진 두 문자열이 동일하다고 판정될 수 있다는 것이 답변의 요지다.

여기서 범위를 정확히 잡아야 한다.

- 문제의 성격은 "한글을 못 알아본다"가 아니라 **분해형 표기까지 같은 값으로 매칭된다**는 것이다. 정상적인 완성형 한글끼리 잘못 매칭된다는 근거는 공개된 자료에 없다.
- **`utf8mb4_ko_0900_ai_ci` 는 존재하지 않는다.** 8.4 와 26.7 매뉴얼의 언어별 콜레이션 표 어디에도 한국어 항목이 없다. 참고로 일본어는 `_ai_ci` 형태가 없고 `utf8mb4_ja_0900_as_cs` 와 `utf8mb4_ja_0900_as_cs_ks` 만 제공된다.
- 공식 문서에 "한국어라면 이 콜레이션을 쓰라"는 권고는 없다. 아래 권고는 확인된 사실에서 끌어낸 판단이다.

`utf8mb4_general_ci` 로 내리는 선택에는 대가가 따른다.

- `general_ci` 는 확장·축약·무시문자를 지원하지 않고 문자 사이의 1:1 비교만 하는 레거시 콜레이션이다. 문서 표현은 빠르지만 "slightly less correct" 다.
- `general_ci` 는 `PAD SPACE` 여서 `'a' = 'a '` 가 참이 된다. 후행 공백이 의미를 갖는 데이터라면 비교 의미 자체가 달라진다.
- 8.0·8.4 기본 스키마로 만들어진 객체와 조인할 때 콜레이션 혼용 문제를 만날 수 있다.

권고 방향은 이렇다. **서버 기본값 `utf8mb4_0900_ai_ci` 를 유지하고, 완성형과 분해형을 엄격히 구분해야 하는 컬럼만 컬럼 단위로 `utf8mb4_0900_as_cs` 또는 `utf8mb4_0900_bin` 을 지정한다.** 로그인 ID, 고유 코드처럼 동일성 판정이 곧 식별인 컬럼이 대상이다.

```sql
CREATE TABLE members (
  login_id VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  PRIMARY KEY (login_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

컬럼에 지정한 콜레이션이 의도대로 동작하는지는 위와 같은 비교 쿼리로 배포 전에 확인한다. 그리고 분해형 입력이 애초에 들어오지 않게 애플리케이션에서 입력을 NFC 로 정규화하는 것이 근본 대응이다. 이는 MySQL 문서의 권고가 아니라 유니코드 처리의 일반 원칙이다.

### 시간대

- `time_zone` 의 초기값은 `'SYSTEM'` 이고, 서버 시간대가 시스템 시간대와 같다는 뜻이다.
- `SYSTEM` 에는 비용이 있다. 시간대 계산이 필요한 모든 함수 호출이 현재 시스템 시간대를 알아내려고 시스템 라이브러리를 호출하고, 이 호출이 전역 뮤텍스로 보호되어 경합이 생길 수 있다.
- **시간대 테이블은 설치 과정에서 만들어지지만 적재되지는 않는다.** 이름 형태의 시간대는 이 테이블이 채워져 있을 때만 쓸 수 있고, 그렇지 않으면 `ERROR 1298 (HY000): Unknown or incorrect time zone: 'UTC'` 가 난다. `'Asia/Seoul'` 은 물론 이름 형태의 `'UTC'` 도 실패한다. 오프셋 표기 `'+00:00'` 은 테이블이 필요 없다. `CONVERT_TZ()` 도 이름을 쓰면 테이블이 필요하다.

```sql
SELECT COUNT(*) FROM mysql.time_zone_name;
```

```bash
mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root -p mysql
```

- 적재 후에는 서버를 재시작해야 한다. `mysqld` 가 조회한 시간대 정보를 캐싱하기 때문이다. `zoneinfo` 가 있는 시스템에서는 다운로드용 시간대 패키지를 쓰지 말라는 경고가 문서에 있다.
- 명시 설정은 옵션 파일의 `default-time-zone='timezone'` 또는 `SET GLOBAL time_zone` 으로 한다. 후자는 `SYSTEM_VARIABLES_ADMIN` 권한이 필요하고, 오프셋으로 지정할 때 범위는 `'-13:59'` 부터 `'+14:00'` 이다.
- 국내 전용 서비스는 `Asia/Seoul`, 여러 지역을 상대하는 서비스는 `UTC` 로 두고 표시 시점에 변환하는 편이 다루기 쉽다.

```ini
[mysqld]
default-time-zone = 'Asia/Seoul'
```

## 내구성과 복제 안전성

### `innodb_flush_log_at_trx_commit` 과 `sync_binlog`

`1`/`1` 조합이 기본값이면서 가장 안전하고 가장 느리다. 문서는 `sync_binlog` 에 대해 "가장 안전한 값은 기본값인 1 이지만 동시에 가장 느리다"고 적는다. 커밋 지연을 줄이려고 이 조합을 내리는 것은 내구성을 성능과 바꾸는 거래이므로, 서비스가 감당할 유실 범위를 먼저 정한 다음 결정한다.

| 파라미터 | 기본값 | 의미 |
|---|---|---|
| `innodb_flush_log_at_trx_commit` | `1` | 커밋 전에 InnoDB 로그를 디스크에 동기화 |
| `sync_binlog` | `1` | 쓰기마다 바이너리 로그를 디스크에 동기화 |
| `innodb_doublewrite` | `ON` | 페이지 쓰기 중 장애에서 온전한 사본 확보 |

- `innodb_flush_log_at_trx_commit=1` 은 각 트랜잭션이 커밋되기 전에 InnoDB 로그를 디스크와 동기화한다. 이것이 기본값이다.
- `0` 은 예기치 않은 종료가 났을 때 **가장 최근 커밋 일부의 유실을 감수**하는 선택이다. InnoDB 는 그래도 1초에 한 번 로그를 flush 하려 시도하지만, flush 가 보장되지는 않는다.
- 기본값 `1` 에서 내리려면 각 값의 정의를 변수 표에서 직접 확인한 뒤 결정한다. 이 파라미터는 값에 따라 보장 범위가 달라지고, 그 차이가 장애 시점에만 드러난다.
- `sync_binlog` 를 `N`(1 초과)으로 두면 `N` 개의 커밋 그룹마다 동기화한다. 동기화를 활성화하지 않으면 OS 나 머신이 죽을 때 바이너리 로그의 마지막 문장들이 유실될 수 있다.
- `1`/`1` 조합에서는 크래시 복구 시 바이너리 로그를 마지막 유효 위치까지 절단하고 prepared 트랜잭션을 완료한다. 그런데도 `The binary log file_name is shorter than its expected size` 에러가 나면 해당 바이너리 로그는 올바르지 않으며, 새 스냅샷에서 복제를 다시 시작해야 한다.
- `innodb_doublewrite` 는 기본 `ON` 이다. OS·스토리지 서브시스템 장애나 `mysqld` 프로세스의 예기치 않은 종료가 페이지 쓰기 중간에 발생해도 크래시 복구 때 doublewrite 버퍼에서 온전한 사본을 찾을 수 있다. I/O 가 두 배로 늘지는 않는다. 큰 순차 청크로 한 번의 `fsync()` 호출로 기록된다. 문서가 끄기를 언급하는 경우는 "데이터 정합성보다 성능이 더 중요한" 상황뿐이다.
- `innodb_flush_method` 는 8.4 리눅스 기본값이 "지원되면 `O_DIRECT`, 아니면 `fsync`" 로 바뀌었다(8.0 은 `fsync`). 동적 변경은 불가하다. 공식 문서에서 확인되는 값은 `fsync`, `O_DSYNC`, `O_DIRECT`, `O_DIRECT_NO_FSYNC` 이며, 플랫폼별로 더 있는 값은 변수 표에서 확인한다. 8.4 에서는 `--innodb-dedicated-server` 가 이 값을 더 이상 자동 설정하지 않는다. `innodb_use_fdatasync` 는 8.4 기본값이 `ON` 이다(8.0 은 `OFF`).

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
- `gtid_purged` 는 `gtid_executed` 의 부분집합이며 초기화는 `RESET BINARY LOGS AND GTIDS` 로 한다. `gtid_executed_compression_period` 는 기본값 0 이고 문서 권고도 0 이다.
- 8.4 에서는 `gtid_mode=ON` 일 때 `IGNORE_SERVER_IDS` 가 거부된다.

```ini
[mysqld]
enforce_gtid_consistency = ON
gtid_mode                = ON
```

## 바이너리 로그

바이너리 로깅은 기본적으로 활성이다(`log_bin` 이 `ON`). 예외는 `mysqld` 를 `--initialize` 나 `--initialize-insecure` 로 실행해 데이터 디렉터리를 직접 초기화한 경우다. 옵션을 지정하지 않으면 기본 base name 은 `binlog`, 인덱스 파일은 `binlog.index` 다. `log_bin` 은 기동 옵션이라 동적 변경이 불가하고, 바이너리 로그를 끄는 수단은 `--skip-log-bin` 이다.

### `binlog_format`

- **기본값은 이미 `ROW`** 다. 허용값은 `ROW`, `STATEMENT`, `MIXED` 세 가지다. 바이너리 로그를 끄는 것은 이 변수의 값이 아니라 `--skip-log-bin` 이다.
- `binlog_format` 자체가 8.0.34 부터 deprecated 이고 장래 제거 대상이다. 문서는 행 기반 외의 로깅 형식 지원도 제거 대상이므로 **신규 복제 구성에는 행 기반 로깅만 사용하라**고 못 박는다. 새로 세우는 서버에서는 이 값을 손댈 이유가 없다.
- 변경 데이터 캡처(CDC)로 바이너리 로그를 읽는 구성도 행 기반을 전제로 한다.
- NDB Cluster 는 예외로 기본값이 `MIXED` 이며 문장 기반 복제를 지원하지 않는다.
- 8.4 에서는 writeset 기반 의존성 추적이 `binlog_format=ROW` 를 요구한다. `MIXED` 는 더 이상 지원되지 않는다.
- 런타임 변경에는 제약이 있다. 스토어드 함수나 트리거 안에서는 바꿀 수 없고, 세션에 임시 테이블이 열려 있으면 세션 값을, 복제 채널에 임시 테이블이 열려 있거나 applier 스레드가 도는 중이면 전역 값을 바꿀 수 없다. `PERSIST_ONLY` 는 항상 허용된다.

### `binlog_row_image`

- 기본값은 `full` 이고 값은 `full`, `minimal`, `noblob` 이다. `minimal` 은 before image 에서 변경할 행을 식별하는 데 필요한 컬럼만, after image 에서는 SQL 문이 값을 지정했거나 auto-increment 로 생성된 컬럼만 기록한다.
- **`minimal` 과 `noblob` 에는 조건이 붙는다.** 소스와 대상 테이블 양쪽에서 모든 컬럼이 같은 순서로 존재하고 각 컬럼의 데이터 타입이 같아야 하며, 기본 키 정의가 동일해야 삭제와 갱신이 올바르게 동작한다. 이 조건이 깨지면 **경고나 에러 없이 소스와 레플리카가 조용히 갈라진다.**
- `STATEMENT` 포맷에서는 효과가 없고 NDB 에도 효과가 없다. 소스가 `full` 이고 레플리카가 `minimal` 이면 레플리카가 받는 이벤트에는 full after image 가 들어 있다.
- 문서가 `minimal` 을 고려하라고 적는 조건은 바이너리 로그가 비회전 스토리지에 있고 모든 테이블에 기본 키가 있는 경우다. 로깅량이 줄어든다.
- 반대로 CDC 나 감사 용도로 변경 전후 값을 온전히 남겨야 한다면 기본값 `full` 을 유지한다.

### 보존 기간

| 파라미터 | 기본값 | 비고 |
|---|---|---|
| `binlog_expire_logs_seconds` | `2592000`(30일) | 동적, 0 은 자동 삭제 중단 |
| `binlog_expire_logs_auto_purge` | `ON` | 보존 기간 설정보다 우선 |
| `binlog_row_metadata` | `MINIMAL` | 8.0.1 도입 |

- `binlog_expire_logs_seconds` 는 8.0.1 에 도입되고 8.0.11 에 기본값이 확정됐다. 최소 0, 최대 4294967295 다.
- `binlog_expire_logs_auto_purge` 가 자동 삭제 여부를 결정하며 보존 기간 설정보다 우선한다. 보존 기간을 `0` 으로 두면 자동 삭제가 멈춘다. 둘 중 하나만 보고 용량을 계산하면 디스크가 찬다.
- `expire_logs_days` 는 8.0.3 에서 deprecated 됐고 **8.4 에서 제거**됐다. 런타임에 이 변수를 읽거나 쓰려 해도, `--expire-logs-days` 로 `mysqld` 를 기동해도 에러가 난다. 대신 `binlog_expire_logs_seconds` 를 쓴다.
- `binlog_row_metadata` 의 기본값 `MINIMAL` 은 `SIGNED` 플래그, 컬럼 문자셋, geometry 타입에 관한 메타데이터만 기록한다.

### `binlog_cache_size`

- 기본값은 `32768`(32KB)이다.
- 큰 트랜잭션을 자주 쓰는 환경에서는 이 값을 늘려야 할 수 있다. 캐시가 차면 디스크의 임시 파일로 스왑되어 성능이 떨어진다.

```sql
SHOW GLOBAL STATUS LIKE 'Binlog_cache_use';
SHOW GLOBAL STATUS LIKE 'Binlog_cache_disk_use';
```

- `Binlog_cache_disk_use` 가 꾸준히 늘어난다면 캐시가 부족하다는 신호다.
- `binlog_rows_query_log_events` 를 켜면 행 기반 로그에 원본 SQL 문이 함께 기록되어 사후 추적이 쉬워진다. 로그 크기는 늘어난다.

## 계정과 인증

### 설치 직후 해야 할 일

- MySQL 설치는 슈퍼유저 계정 `'root'@'localhost'` **하나만** 만든다. 함께 `mysql.proxies_priv` 에 `''@''` 를 대상으로 PROXY 권한을 부여하는 행이 존재한다.
- `mysqld --initialize` 는 임의의 초기 비밀번호를 생성해 **만료 상태로 표시**하고 서버 에러 로그에 기록한다. RPM 설치는 에러 로그, macOS 설치기는 다이얼로그로 알려 준다. `--initialize-insecure` 는 비밀번호 없이 만들고 경고를 로그에 남긴다.
- `mysql_secure_installation` 이 하는 일은 네 가지다. `root` 계정에 비밀번호를 설정하고, 로컬 호스트 밖에서 접근 가능한 `root` 계정을 제거하고, 익명 사용자 계정을 제거하고, `test` 데이터베이스와 `test_` 로 시작하는 이름의 DB 에 누구나 접근하게 하는 권한을 제거한다. `validate_password` 가 설치되지 않았으면 설치 여부를 묻는다. `--use-default` 로 비대화식 실행도 된다.

```bash
mysql_secure_installation
```

- 애플리케이션 계정에는 `CONNECTION_ADMIN` 이나 `SUPER` 를 주지 않는다. 문서도 이 권한은 관리자에게만 주고 일반 사용자에게는 주지 말라는 취지로 적는다.
- 8.2.0 부터 DB 권한 부여에서 `%` 와 `_` 와일드카드가 deprecated 다. 스키마 이름을 그대로 적는다.

### 비밀번호 정책

8.4 에서 `validate_password` 플러그인이 **컴포넌트로 재구현**됐다. 플러그인은 deprecated 이고 장래 제거 대상이다. 둘을 동시에 설치하면 컴포넌트가 우선하고, 컴포넌트가 없으면 플러그인으로 폴백한다.

```sql
INSTALL COMPONENT 'file://component_validate_password';
```

전환 순서는 컴포넌트 설치 → 변수명을 점 표기(`validate_password.length` 등)로 교체 → `UNINSTALL PLUGIN validate_password` → 재시작이다.

| 변수 | 기본값 |
|---|---|
| `validate_password.policy` | `1`(MEDIUM) |
| `validate_password.length` | `8` |
| `validate_password.mixed_case_count` | `1` |
| `validate_password.number_count` | `1` |
| `validate_password.special_char_count` | `1` |
| `validate_password.check_user_name` | `ON` |
| `validate_password.dictionary_file` | 빈 값(사전 검사 없음) |

- 전부 전역 범위이고 동적 변경이 가능하다.
- `length` 는 `number_count + special_char_count + 2*mixed_case_count` 보다 작게 내릴 수 없다.
- 정책을 위반하면 `ERROR 1819 (HY000): Your password does not satisfy the current policy requirements` 가 난다.
- 해시로 지정한 비밀번호는 검사 대상이 아니다. 원본 값이 없어 검사할 수 없기 때문이다.

### 인증 플러그인과 구 드라이버

- `caching_sha2_password` 가 기본 인증 플러그인이다. 8.4 에서는 `authentication_policy` 변수가 기본 플러그인을 결정하며 그 기본이 `caching_sha2_password` 다. `default_authentication_plugin` 은 8.0.27 에서 deprecated 됐고 **8.4.0 에서 제거**됐다.
- `mysql_native_password` 는 **8.0.34 deprecated → 8.4 기본 비활성 → 9.0.0 제거**다. 8.4 서버에는 내장돼 있지만 꺼져 있고 `--mysql-native-password=ON` 으로만 켤 수 있다. 8.4 이상 클라이언트도 기본적으로 `caching_sha2_password` 를 쓴다.
- 꺼진 상태에서 해당 플러그인 계정으로 접속하면 `ERROR 1045 (28000): Access denied for user ...` 가 나고, 그 플러그인으로 계정을 만들거나 바꾸려 하면 `ERROR 1524 (HY000): Plugin 'mysql_native_password' is not loaded` 가 난다.
- `caching_sha2_password` 계정으로 접속하려면 **보안 연결이거나, RSA 키 페어로 비밀번호를 교환할 수 있는 비암호화 연결**이어야 한다. 서버는 기본적으로 공개키를 클라이언트에 보내지 않으므로 평문 TCP 클라이언트는 `ERROR 2061 (HY000): Authentication plugin 'caching_sha2_password' reported error: Authentication requires secure connection.` 을 만난다. `--get-server-public-key` 또는 `--server-public-key-path` 가 필요하다.
- 캐시는 재시작하면 남지 않는다. 계정 생성, 비밀번호 변경, `RENAME USER`, `FLUSH PRIVILEGES` 이후 첫 접속에서 다시 요구된다.
- 8.4.0 이상은 TLSv1.2·TLSv1.3 을 지키지 않거나, 순방향 비밀성을 제공하지 않거나, SHA2·AEAD 를 쓰지 않는 암호군을 허용하지 않는다.
- 결론은 드라이버를 먼저 올리는 것이다. `mysql_native_password` 를 켜서 버티는 임시 대응은 9.0.0 에서 끝난다.

### `local_infile`

- **기본 비활성**이다. 런타임에 켤 수 있다.
- 문서가 드는 위험은 두 가지다. 악의적으로 패치된 서버는 클라이언트 사용자가 읽을 수 있는 파일 전부에 접근할 수 있고, 웹 서버가 클라이언트인 환경에서는 사용자가 `LOAD DATA LOCAL` 로 웹 서버 프로세스가 읽을 수 있는 파일을 읽어낼 수 있다.
- 서버와 클라이언트 양쪽이 모두 허용해야 동작한다. 아니면 `ERROR 3950 (42000): Loading local data is disabled; this must be enabled on both the client and server side` 가 난다. 바이너리 배포판의 클라이언트 라이브러리는 `ENABLED_LOCAL_INFILE` 를 끈 상태로 빌드된다.
- 꼭 써야 한다면 `--load-data-local-dir` 로 디렉터리를 한정한다(경로 비교는 대소문자를 구분한다). 신뢰할 수 없는 서버를 피하려면 `--ssl-mode=VERIFY_IDENTITY` 와 CA 인증서를 함께 쓴다.

## 메모리

메모리는 초기 설정에서 가장 급한 영역이 아니다. 부하가 드러난 뒤 조정해도 늦지 않다. 다만 버퍼풀과 임시 테이블 계열은 기본값이 실서비스 규모와 거리가 있다.

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
  - 테이블에 `BLOB` 또는 `TEXT` 컬럼이 있는 경우. 단 TempTable 은 이 타입을 지원하므로 절대 규칙으로 읽지 않는다.
  - **`UNION` 또는 `UNION ALL` 을 쓸 때** `SELECT` 리스트에 최대 길이가 512 를 넘는 문자열 컬럼이 있는 경우(바이너리 문자열은 바이트, 그 외는 문자 단위).
  - `SHOW COLUMNS` 와 `DESCRIBE` 는 일부 컬럼 타입을 `BLOB` 으로 잡으므로 결과용 임시 테이블이 디스크 테이블이 된다.
- 관측은 `Created_tmp_tables` 와 `Created_tmp_disk_tables` 로 한다. 후자는 메모리맵 파일에 만든 디스크 임시 테이블을 세지 않는다.

### MyISAM 전용 파라미터

- `key_buffer_size` 는 MyISAM 인덱스 블록만 캐싱한다. InnoDB 는 버퍼풀을 쓰고 키 캐시를 쓰지 않는다.
- 기본 상태에서 약 8MiB(`8384512`)가 잡혀 있고, **`SET GLOBAL key_buffer_size = 0` 으로도 기본 키 캐시 자체를 없앨 수는 없다.** 문서는 이 시도가 무시된다고 적는다.
- 값이 `0` 이거나 최소 블록 버퍼 8개를 잡지 못할 만큼 작으면 키 캐시를 쓰지 않고, 인덱스 파일은 OS 가 제공하는 파일시스템 버퍼링만으로 접근한다.
- 8.4 부터 `keycache1.key_buffer_size` 형태의 복합 구조 변수 문법은 deprecated 다.
- `bulk_insert_buffer_size` 도 MyISAM 의 대량 삽입에 쓰인다. InnoDB 는 이 버퍼를 쓰지 않으므로 MyISAM 을 쓰지 않으면 조정할 이유가 없다.

## 커넥션과 격리 수준

### 커넥션

`max_connections` 의 기본값은 공식 문서 안에서도 표기가 엇갈린다. 숫자를 외워 두는 대신 운영할 서버에 직접 묻는다.

```sql
SELECT @@GLOBAL.max_connections;
```

- 서버는 실제로 `max_connections + 1` 개의 클라이언트 접속을 허용한다. 여분 한 자리는 `CONNECTION_ADMIN` 권한(또는 deprecated 된 `SUPER`)을 가진 계정 몫이다. 커넥션이 포화됐을 때 관리자가 들어갈 통로가 여기다.
- `max_connections` 를 올리면 `mysqld` 가 필요한 파일 디스크립터 수도 늘어난다. **필요한 개수를 확보하지 못하면 서버가 `max_connections` 값을 낮춘다.** OS 한도와 `open_files_limit` 을 함께 올려야 설정한 값이 실제로 적용된다.
- 한계를 정하는 요소는 스레드 라이브러리 품질, 전체 RAM, 커넥션당 RAM, 워크로드, 목표 응답시간, 파일 디스크립터 수다. 문서는 Linux 나 Solaris 가 통상 500~1000 개의 동시 접속을, RAM 이 넉넉하고 커넥션당 부하가 낮으면 10,000 개까지 감당한다고 적는다.
- 한도를 넘기면 `Connection_errors_max_connections` 상태 변수가 늘고 `Too many connections` 에러가 난다.
- `thread_cache_size` 는 기동 시 서버가 값을 자동 산정하며, 명시 설정으로 덮어쓸 수 있다. `0` 은 캐싱을 비활성화한다. 관측은 `Threads_cached` 와 `Threads_created` 로 한다.
- `wait_timeout` 은 `28800`(8시간)이다. 아무 일도 없으면 서버가 8시간 후 커넥션을 닫고, 그 뒤 클라이언트는 `MySQL server has gone away` 를 본다. `interactive_timeout` 은 대화형 세션에 같은 역할을 한다. 두 값은 `SHOW VARIABLES LIKE '%timeout%';` 로 확인한다.
- 문서가 제시하는 대응은 두 가지다. 마지막 쿼리 후 오래 지났으면 `mysql_ping()` 으로 확인하거나, `wait_timeout` 을 실질적으로 만료되지 않을 값으로 두는 것이다. 커넥션 풀 크기 산정에 대한 공식 권고는 문서에 없다.
- `max_allowed_packet` 기본값은 64MB 다.

### 격리 수준

- **InnoDB 의 기본 격리 수준은 `REPEATABLE READ`** 다. 기동 옵션 `--transaction-isolation` 이나 `SET TRANSACTION` 으로 바꾼다. 현재 값은 `SELECT @@GLOBAL.transaction_isolation;` 으로 확인한다.
- `REPEATABLE READ` — 같은 트랜잭션 안의 일관된 읽기는 첫 읽기가 만든 스냅샷을 본다. 락킹 읽기와 `UPDATE`·`DELETE` 는 유니크 인덱스에 유니크 검색 조건이면 찾은 인덱스 레코드만 잠그고 그 앞의 갭은 잠그지 않지만, 그 밖의 조건에서는 스캔한 인덱스 범위를 갭 락이나 넥스트키 락으로 잠근다.
- `READ COMMITTED` — 같은 트랜잭션 안에서도 각 일관된 읽기가 자기만의 새 스냅샷을 만든다. 인덱스 레코드만 잠그고 앞의 갭은 잠그지 않으며, 갭 락은 외래 키 제약 검사와 중복 키 검사에만 쓰인다. 갭 락이 없으므로 **팬텀 행 문제가 생길 수 있다.** 조건에 맞지 않는 행의 락을 바로 풀어 데드락 확률을 크게 낮추지만 없어지지는 않는다. `UPDATE` 는 semi-consistent read 를 쓴다.
- 복제 제약이 있다. **`READ COMMITTED` 에서는 행 기반 바이너리 로깅만 지원된다.** `binlog_format=MIXED` 와 함께 쓰면 서버가 자동으로 행 기반 로깅을 쓴다.
- 문서가 적는 선택 기준은 ACID 준수가 중요한 핵심 데이터 작업에는 기본값 `REPEATABLE READ` 로 높은 일관성을 강제하고, 대량 리포팅 같은 상황에서는 `READ COMMITTED` 로 일관성 규칙을 완화하는 것이다. "`READ COMMITTED` 를 권장한다"는 문장은 공식 문서에 없다.
- 하나의 `REPEATABLE READ` 트랜잭션에서 락킹 문장과 비락킹 문장을 섞지 않는다. 그런 경우에는 보통 `SERIALIZABLE` 이 필요하다.

## 로깅

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
- `log_timestamps` 의 기본값은 `UTC` 이고 허용값은 `UTC` 와 `SYSTEM` 이다. 에러 로그 전체와 일반·슬로우 쿼리 로그 **파일**에 적용되며 형식은 ISO 8601/RFC 3339(`2020-08-07T15:02:00.832521Z`)다. `time_zone` 을 `Asia/Seoul` 로 두어도 로그 시각은 기본적으로 UTC 이므로, 장애 시각을 맞출 때 혼동하지 않도록 둘 중 하나를 기준으로 통일한다.

## 처음엔 손대지 않아도 되는 파라미터

건드려야 할 것처럼 보이지만, 근거 없이 올리면 오히려 손해가 나는 값들이다.

- `sort_buffer_size` — `ORDER BY`·`GROUP BY` 정렬에 쓰는 세션 단위 버퍼다. 정렬 쿼리가 많고 `sort_merge_passes` 가 크면 늘리는 것을 고려할 수 있지만, 잘못 잡으면 성능이 떨어지고 메모리 소비가 늘어난다. 어떤 값을 써야 할지 확실하지 않으면 기본값을 바꾸지 않는다.
- `join_buffer_size` — 기본값은 256KB 다. 인덱스가 없는 전체 테이블 조인에 커넥션당 할당되므로, 늘리기보다 조인에 인덱스를 추가하는 것이 먼저다. 인덱스를 추가할 수 없으면 해당 쿼리에서만 세션 값으로 올린다.
- `read_buffer_size` — MyISAM 에만 적용되고 InnoDB 에는 영향이 없다.
- `read_rnd_buffer_size` — 정렬 후 정렬된 순서로 행을 읽을 때 쓰이며 InnoDB 도 사용한다. 클라이언트마다 할당되므로 전역값을 올리기보다 큰 쿼리를 실행하는 세션에서만 올린다.
- `cte_max_recursion_depth` — 기본값은 1000 이다(8.0.3 도입). 전역값을 낮추기보다 `max_execution_time`, `MAX_EXECUTION_TIME` 힌트, `SET_VAR` 힌트로 쿼리 단위로 제한하는 편이 부작용이 적다.
- `innodb_file_per_table` — InnoDB 는 기본적으로 테이블별 테이블스페이스에 테이블을 만든다. 전역 범위에서 동적 변경이 가능하다. 테이블을 지우거나 비우면 공간이 OS 로 반환되고 테이블 단위 백업·이관이 가능해지는 대신, 테이블마다 파일 핸들과 파일 디스크립터를 유지하므로 테이블 수가 매우 많으면 부담이 된다. 기본값을 유지한다.
- `innodb_autoinc_lock_mode` — 기본값은 `2`(interleaved)이고 동적 변경이 불가하다. 행 기반 복제와의 호환을 위해 정해진 기본값이므로, 문장 기반 복제를 쓰지 않는다면 바꿀 이유가 없다.

## MySQL 8.4 로 갈 때 깨지는 것

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
- 8.4 에서 새로 deprecated 된 것은 DB 권한 부여의 `%`·`_` 와일드카드, 비유니크·부분 키를 외래 키로 쓰는 것, `DISABLE ON SLAVE`, `INFORMATION_SCHEMA.PROCESSLIST`, `temptable_use_mmap`, `--master-retry-count`, `group_replication_view_change_uuid`, `group_replication_allow_local_lower_version_join` 이다.
- 9.7 까지 더 갈 계획이라면 `mysql_native_password` 가 **9.0.0 에서 제거**된 점, `replica_parallel_type` 과 `group_replication_allow_local_lower_version_join` 이 제거된 점, `binlog_transaction_dependency_history_size` 기본값이 25000 에서 **1000000** 으로 바뀐 점(9.5.0, 최대 10000000), `innodb_log_writer_threads` 기본값이 `log_bin` 활성 여부와 논리 CPU 수에 따라 결정되는 점을 함께 본다.

## AWS RDS · Aurora 를 쓸 때

> **IMPORTANT** — 중괄호 수식은 MySQL 문법이 아니다
>
> `GREATEST({DBInstanceClassMemory/32}, 209715200)` 같은 표기는 **RDS 파라미터 그룹이 평가하는 RDS 고유 표기**다. MySQL 서버는 이 문자열을 해석하지 못하므로 `my.cnf` 에 넣지 않는다. MySQL 시스템 변수는 정수·열거값·문자열만 받는다.

- 수식 문법은 `{FormulaVariable}`, `{FormulaVariable*Integer}`, `{FormulaVariable*Integer/Integer}`, `{FormulaVariable/Integer}` 네 가지다. 사용할 수 있는 변수는 `AllocatedStorage`, `DBInstanceClassMemory`, `DBInstanceVCPU`, `EndPointPort`, `TrueIfReplica` 다.
- 연산자는 나눗셈과 곱셈 둘뿐이고 **몫의 소수점은 반올림하지 않고 잘라낸다.** 함수는 `GREATEST`, `LEAST`, `SUM` 을 쓸 수 있고 함수명은 대소문자를 구분하지 않는다. 로그 수식의 `log` 는 밑이 2 다.
- `DBInstanceClassMemory` 는 OS 와 RDS 프로세스용으로 예약된 메모리를 뺀 값이라 인스턴스 클래스 표의 메모리 수치보다 항상 다소 작다.
- 파라미터 값이 `engine default` 로 표시되어 있으면 실제 기본값은 해당 버전의 MySQL 문서에서 확인한다.
- Aurora MySQL 에서 **아예 적용되지 않는 MySQL 파라미터**가 많다. 문서가 드는 목록에는 `innodb_data_file_path`, `innodb_doublewrite`, `innodb_flush_method`, `innodb_page_size`, `innodb_redo_log_capacity`, `innodb_log_file_size`, `innodb_log_files_in_group`, `innodb_log_buffer_size`, `innodb_buffer_pool_chunk_size`, `innodb_buffer_pool_instances`, `innodb_io_capacity`, `innodb_change_buffering`, `innodb_numa_interleave`, `innodb_undo_tablespaces` 등이 있고, 문서 스스로 이 목록이 전부가 아니라고 밝힌다. **이 문서의 내구성·리두 항목 다수가 Aurora 에서는 없는 손잡이다.**
- 수정할 수 없는 파라미터에는 `default_storage_engine`, `innodb_page_size`, `innodb_data_home_dir`, `innodb_undo_directory`, `partial_revokes`, `server_id`, `skip_name_resolve`, `sync_binlog`, `default_authentication_plugin`, `default_time_zone`, `relay_log_recovery`, `thread_handling`, `tmpdir` 이 있다. `basedir`·`datadir`·`plugin_dir`·`secure_file_priv`·`general_log_file`·`slow_query_log_file` 는 파일시스템에 직접 접근하지 않는 관리형 인스턴스라서 수정 대상이 아니다.
- `gtid-mode` 와 `enforce_gtid_consistency` 는 Aurora MySQL 버전 2 이상에서 수정할 수 있다. `event_scheduler` 는 버전 3 에서 클러스터 레벨로만 설정한다.
- **`lower_case_table_names` 는 Aurora MySQL 버전 3 에서 클러스터를 만드는 시점에 영구히 고정된다.** 버전 2 에서는 수정할 수 있다. 글로벌 데이터베이스에서 이 값이 켜져 있으면 버전 2 에서 3 으로의 in-place 업그레이드가 불가능하다.
- `innodb_flush_log_at_trx_commit` 은 수정할 수 있지만 AWS 는 기본값 `1` 을 쓰라고 강력히 권고한다. 버전 3 에서 `1` 이 아닌 값으로 바꾸려면 먼저 `innodb_trx_commit_allow_data_loss` 를 `1` 로 설정해야 하고(기본값 `0`), 그것은 데이터 유실 위험을 인정한다는 뜻이다.
- Aurora 의 임시 테이블 기본값은 커뮤니티 MySQL 과 다르다. `temptable_max_ram` 은 메모리 16GiB 이상 인스턴스에서 1GiB, 그보다 작은 인스턴스에서 16MB 다. `temptable_max_mmap` 은 writer·reader 모두 1GiB 이며 인스턴스 메모리와 무관하고 reader 에서는 `0` 으로 설정할 수 없다. Aurora MySQL 8.4.7 이상은 이 기본값이 `LEAST(4294967296, {AllocatedStorage*3/100})` 로 바뀌었다. reader 는 항상 TempTable 엔진을 쓴다.
- `aurora_tmptable_enable_per_table_limit` 은 인스턴스 레벨 파라미터로, **Aurora MySQL 버전 3.04 이상에서 `tmp_table_size` 가 TempTable 엔진이 만든 인메모리 임시 테이블의 최대 크기를 제어할지** 결정한다. 기본값은 `OFF` 이며 3.03 이하와 같은 동작이다. `OFF` 일 때 `tmp_table_size` 는 TempTable 이 만든 내부 인메모리 임시 테이블에 고려되지 않고, 전역 TempTable 한도에 닿으면 writer 는 InnoDB 디스크 임시 테이블로 전환하지만 **reader 는 쿼리가 실패한다**(`ERROR 1114 (HY000): The table '/rdsdbdata/tmp/#sql...' is full`). `internal_tmp_mem_storage_engine=MEMORY` 이면 이 파라미터는 무효다.
- 그 밖의 Aurora 기본값으로 `time_zone` 은 UTC, `character_set_database` 는 `utf8mb4`, `read_only` 는 버전 2 가 `{TrueIfReplica}` 이고 버전 3 이 `0` 이다. Aurora 는 `interactive_timeout` 과 `wait_timeout` 중 **최솟값**으로 모든 유휴 세션을 끊는다.
- 비밀번호 정책은 Aurora MySQL 8.4.7 이상에서 `aurora_enable_validate_password_component`(기본 `0`)로 관리하며 `INSTALL COMPONENT` 를 쓰지 않는다. 같은 버전대에서 `authentication_policy` 기본값은 `*:caching_sha2_password` 이고, `validate_password.policy` 는 LOW 와 MEDIUM 만 지원한다.
- RDS for MySQL 은 Aurora 와 파라미터 지원 범위가 다르다. 위 Aurora 항목을 그대로 적용하지 말고 해당 엔진과 버전의 파라미터 그룹 문서를 확인한다.

여기까지 세팅해 두면 시스템 규모가 커진 뒤에도 DB 에서 일어나는 일에 대처하기가 수월하다. 나중에 감사나 이관, DBA 합류 같은 단계가 와도 호환성과 데이터 무결성을 근거 있게 설명할 수 있다.
