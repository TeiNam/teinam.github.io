---
title: "SQL_MODE"
permalink: /docs/database/mysql-install-checklist/sql-mode/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — SQL_MODE 구성"
last_modified_at: 2026-09-19
guide: mysql-install-checklist
order: 2
nav_title: "SQL_MODE"
---

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
