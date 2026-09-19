---
title: "1. 공통 규칙"
permalink: /docs/database/naming/common-rules/
breadcrumb: "Docs / Database / 데이터베이스 네이밍 규칙"
description: "네이밍 규칙 — 공통 규칙"
updated: 2026-09-20
guide: naming
order: 2
nav_title: "공통 규칙"
---

### 1-1. snake_case + 전부 소문자

모든 식별자는 **소문자**로만 쓰고 **언더스코어(`_`)** 로 단어를 구분한다.

| Bad | Good |
| --- | --- |
| `authUser` | `auth_user` |
| `Book_IDX` | `book_idx` |
| `userloginattempt` | `user_login_attempt` |

구분자를 아예 쓰지 않으면(`userloginattempt`) 이름이 길어질수록 읽기 어려워진다.
snake_case 를 택하는 이유는 0장의 케이스 폴딩 외에 셋 더 있다.

- **따옴표가 필요 없다.** 하이픈(`user-account`)이나 대문자를 섞은 이름은 따옴표로 감싸야 하므로 위 결론 3번이 깨진다.
- **애플리케이션 코드와 스타일이 맞는다.** Python 처럼 snake_case 를 쓰는 언어에서는 쿼리 문자열의 식별자와 코드의 이름이 같은 형태가 된다.
- **오래된 관행이다.** DB 설계에서 통용돼 온 형태라 팀 안에서 합의 비용이 낮다.

소문자만 쓰면 폴딩 방향이 어느 쪽이든 한 가지 표기가 언제나 한 객체를 가리킨다.

### 1-2. 직관적인 기술형 작성

이름만 보고도 대상을 명확히 구분할 수 있게 짓고, 되도록 쉬운 단어를 쓴다.

| Bad | Good | 설명 |
| --- | --- | --- |
| `log` | `delivery_log` | 배송 로그 |
| `log` | `order_log` | 주문 로그 |

### 1-3. 시각 컬럼 명명 (과거분사형)

- 생성·수정·삭제 시각 컬럼은 **`created_at` / `updated_at` / `deleted_at`** 으로 쓴다.
- 그 외 일반 시각·날짜 컬럼은 `<목적>_at` / `<목적>_date` 형식을 쓴다. (예: `publish_at`, `expire_at`, `open_date`)
- 타입 선택은 5-8 을 따른다.

이 이름은 **Rails 계열 ORM 의 관행**이고, 이 팀이 채택한 컨벤션이다. 엔진 문서나 표준 SQL 이 규정하는 형태가 아니다.

| 근거 | 확인되는 내용 |
| --- | --- |
| Rails Active Record | `timestamps` 매크로가 `created_at`·`updated_at` 을 추가하고 자동 관리한다 |
| Django | 기본 타임스탬프 컬럼이 없다. 컬럼명은 필드명에서 온다 |
| TypeORM | 데코레이터만 제공하고 컬럼명은 프로퍼티명에서 생성된다 |
| 공개 SQL 스타일 가이드 | 날짜 접미사로 `_date` 만 규정한다. `_at` 규약이 없다 |

즉 널리 쓰이는 관행이지 업계 표준은 아니다. 컬럼명을 프로퍼티명에서 만드는 ORM 을 쓰면 프로퍼티 `createdAt` 이 컬럼 `created_at` 으로 가도록 매핑을 명시한다.

### 1-4. 예약어 사용 금지

**MySQL 과 PostgreSQL 양쪽 예약어의 합집합을 피한다.** 한쪽에서만 예약어인 단어도 회피 대상이다 — 그 엔진에서 따옴표 없이 쓸 수 없고, 따옴표로 우회하면 0-2 의 결론이 깨진다.

| 단어 | MySQL 9.7 | PostgreSQL 18 |
| --- | --- | --- |
| `order`, `group`, `limit` | 예약 | 예약 (컬럼 레이블에 `AS` 필요) |
| `table`, `column`, `default`, `check`, `desc` | 예약 | 예약 |
| `user` | 비예약 | **예약** |
| `offset` | 비예약 | **예약** (컬럼 레이블에 `AS` 필요) |
| `current_user`, `session_user` | 예약 | 예약 |

`user` 와 `offset` 이 "한쪽에서만 예약어" 규칙의 실제 사례다. MySQL 에서 `user` 컬럼을 만들고 넘어간 스키마가 PostgreSQL 에서 파싱 단계에 멈춘다.

`type` 과 `role` 은 **MySQL 9.7 과 PostgreSQL 18 양쪽 모두에서 비예약**이다. 예약어를 이유로 피할 근거가 없다. 다만 도메인 의미가 넓은 단어이므로 1-2 에 따라 `member_role`·`payment_type` 처럼 한정해 쓴다.

예약어 집합은 버전마다 늘어난다 — **8.4 에서 `QUALIFY`·`TABLESAMPLE` 이, 9.7 에서 `EXTERNAL`·`LIBRARY` 가 예약어로 추가됐다.** 8.4 는 `MASTER_*` 계열 키워드를 제거하고 `SOURCE_*` 로 대체했다. MySQL 문서는 상위 버전 매뉴얼의 미래 예약어도 미리 살펴보라고 권한다.

단어를 나열해 관리하는 방식은 이 증가를 따라가지 못한다. 두 엔진 모두 예약어 전수를 조회하는 공식 경로가 있으므로, 스키마 린터나 CI 에서 다음 결과의 합집합과 식별자를 대조한다.

```sql
-- MySQL: INFORMATION_SCHEMA.KEYWORDS 가 키워드 목록과 예약 여부를 담는다
SELECT WORD FROM INFORMATION_SCHEMA.KEYWORDS WHERE RESERVED = 1;
```

```sql
-- PostgreSQL: 완전 예약어
SELECT word FROM pg_get_keywords() WHERE catcode = 'R';

-- 컬럼 레이블에 AS 가 필요한 것까지 포함해 보수적으로
SELECT word FROM pg_get_keywords() WHERE catcode <> 'U' OR NOT barelabel;
```

`catcode` 는 `U`(비예약), `C`(컬럼명 가능), `T`(타입·함수명 가능), `R`(완전 예약)이다.

> **WARNING** — "로컬에서 에러가 안 났다" 는 안전 신호가 아니다
>
> - PostgreSQL 은 완전 예약어도 **컬럼 레이블**로는 통과한다. `CHECK` 가 예약어인데도 `SELECT 55 AS CHECK` 가 실행된다.
> - MySQL 은 **qualified name 의 뒤쪽**이면 예약어여도 따옴표가 필요 없다. `CREATE TABLE mydb.interval (...)` 는 통과하지만 `CREATE TABLE interval (...)` 는 `ERROR 1064` 다.
> - MySQL 의 Restricted Keywords 는 일부 비예약 키워드를 **롤 이름과 스토어드 프로그램 레이블에서만** 제한한다. 컬럼명으로는 통과하는 단어가 롤 이름에서 실패한다.

- 참고: [MySQL 8.4 키워드](https://dev.mysql.com/doc/refman/8.4/en/keywords.html) · [MySQL 9.7 키워드](https://dev.mysql.com/doc/refman/9.7/en/keywords.html) · [PostgreSQL 키워드](https://www.postgresql.org/docs/18/sql-keywords-appendix.html)

### 1-5. 식별자 문자 집합

**식별자에는 ASCII 소문자·숫자·언더스코어만 쓴다.** 0장 결론 2번의 "63자" 가 공통 안전선이 되는 전제가 이 규칙이다. 두 엔진의 한계는 세는 단위가 다르다.

| 엔진 | 한계 | 단위 | 초과 시 |
| --- | --- | --- | --- |
| PostgreSQL 18 | 63 | **바이트** | 조용히 잘린다 |
| MySQL 8.4 · 9.7 | 64 | **문자** | 에러 |

PostgreSQL 의 63바이트는 `NAMEDATALEN`(기본값 64)에서 1을 뺀 값이고, 늘리려면 `pg_config_manual.h` 의 상수를 고쳐 다시 컴파일해야 한다. MySQL 의 64문자는 데이터베이스·테이블·컬럼·인덱스·제약·뷰·스토어드 프로그램 이름에 공통으로 적용된다. MySQL 문서는 이 값이 **문자 수**이고 멀티바이트 문자를 써도 허용 문자 수가 줄지 않는다고 밝힌다.

ASCII 만 쓰면 1문자가 1바이트이므로 두 한계가 63자에서 정합한다. 여기서 벗어나면 격차가 벌어진다.

| 식별자 | PostgreSQL 18 | MySQL 8.4 · 9.7 |
| --- | --- | --- |
| ASCII 소문자·숫자·`_` | 63자 | 64자 |
| 한글 | **21자** | **64자** |

한글 음절과 자모는 UTF-8 에서 한 글자가 3바이트이므로 PostgreSQL 은 21자에서 한계에 닿는다. 세 배 차이다. 두 엔진 모두 따옴표 없는 한글 식별자를 허용하므로 이 차이는 DDL 을 옮기는 순간에야 드러난다. 게다가 **PostgreSQL 은 초과분을 조용히 자른다** — 앞 21자가 같은 두 이름은 같은 이름이 되고, 인덱스나 제약이면 4-3 의 유일성 범위에 걸려 실패한다.

MySQL 쪽 문자 제약도 함께 알아 둔다.

- 따옴표 없는 식별자에 ASCII `[0-9 a-z A-Z $ _]` 와 **U+0080 부터 U+FFFF 까지**를 허용한다. 한글이 여기 들어간다.
- **보조 문자(U+10000 이상)는 따옴표를 써도 쓸 수 없다.** 이모지가 여기 해당한다.
- 숫자로 시작할 수는 있지만 **숫자만으로 이루어진 이름**은 따옴표 없이 쓸 수 없다.
- **데이터베이스·테이블·컬럼 이름은 공백으로 끝날 수 없다.**
- `$` 로 시작하는 따옴표 없는 이름은 deprecated 되었고 경고가 난다.

---
