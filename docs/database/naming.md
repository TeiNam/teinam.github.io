---
title: "데이터베이스 네이밍 규칙"
permalink: /docs/database/naming/
breadcrumb: "Docs / Database"
description: "MySQL 8.x 와 PostgreSQL 양쪽에 이식 가능한 식별자·타입 명명 규칙"
updated: 2026-08-26
---

> **INFO** — 적용 범위
>
> 이 규칙집은 **MySQL 8.x** 와 **PostgreSQL** 을 공통 타깃으로 한다. 본문(1~7장)은 **두 엔진 모두에 이식 가능한 규칙**만 담고, 엔진 고유의 타입·옵션은 **부록(A: MySQL / B: PostgreSQL)** 으로 분리한다.

## 0. 핵심 원칙 — 식별자 케이스 폴딩(Case Folding)

가장 먼저 이해해야 할 이식성 규칙이다. 엔진마다 **따옴표 없는 식별자(unquoted identifier)를 자동으로 대소문자 변환**한다.

| 엔진 | unquoted 식별자 처리 | 예시 |
| --- | --- | --- |
| PostgreSQL | 소문자로 폴딩 | `Book_IDX` → 실제 `book_idx` |
| MySQL | 설정(`lower_case_table_names`)에 따라 다름 | 보존되는 것처럼 착각하기 쉬움 |
| (참고) Oracle | 대문자로 폴딩 | 향후 확장 시 주의 |

> **IMPORTANT** — 결론
>
> 1. **모든 식별자는 소문자 snake_case로 작성한다.** 대문자에 의미를 부여하는 규칙(예: 대문자 접미사)은 PostgreSQL에서 자동으로 깨지므로 사용하지 않는다.
> 2. **식별자 길이는 63자(bytes) 이하로 유지한다.** (PostgreSQL 63, MySQL 64 → 안전 하한은 63)
> 3. 식별자에 따옴표(`"..."`, `` `...` ``)를 쓰지 않아도 되도록 이름을 짓는다. 따옴표는 이식성과 가독성을 모두 해친다.

---

## 1. 공통 규칙

### 1-1. snake_case + 전부 소문자

모든 식별자는 **소문자**로만 쓰고 **언더스코어(`_`)** 로 단어를 구분한다.

| Bad | Good |
| --- | --- |
| `authUser` | `auth_user` |
| `Book_IDX` | `book_idx` |

### 1-2. 직관적인 기술형 작성

이름만 보고도 대상을 명확히 구분할 수 있게 짓고, 되도록 쉬운 단어를 쓴다.

| Bad | Good | 설명 |
| --- | --- | --- |
| `log` | `delivery_log` | 배송 로그 |
| `log` | `order_log` | 주문 로그 |

### 1-3. 시각 컬럼은 업계 표준(과거분사형)을 따른다

- 생성·수정·삭제 시각 컬럼은 **`created_at` / `updated_at` / `deleted_at`** 으로 쓴다. 대부분의 ORM(Django, Rails, JPA, Prisma, TypeORM)이 이 이름을 기본값으로 쓰므로 이식성과 협업에 유리하다.
- 그 외 일반 시각/날짜 컬럼은 `<목적>_at` / `<목적>_date` 형식을 쓴다. (예: `publish_at`, `expire_at`, `open_date`)

> **NOTE** — 이전 버전의 "능동태 강제" 규칙은 폐기
>
> 과거 규칙은 `create_date`처럼 능동태를 강제했으나, 시각 컬럼에서 업계 표준(`created_at`)과 충돌한다. 범용성을 위해 시각 컬럼은 과거분사형 표준을 우선한다.

### 1-4. 예약어 사용 금지

- **MySQL과 PostgreSQL 양쪽의 예약어**를 모두 피한다. 한쪽에서만 예약어인 단어도 회피 대상이다.
- 대표적 함정: `user`, `order`, `group`, `table`, `column`, `type`, `default`, `check`, `limit`, `offset`, `desc`, `role`.
- 참고: [MySQL 키워드](https://dev.mysql.com/doc/refman/8.0/en/keywords.html) · [PostgreSQL 키워드](https://www.postgresql.org/docs/current/sql-keywords-appendix.html)

---

## 2. 테이블 네이밍 규칙

### 2-1. prefix / postfix 금지

- `tb_`, `_tbl` 같은 타입 표시용 접두/접미사는 쓰지 않는다.
- 단, **마스터 테이블의 하위 속성 테이블**을 묶는 목적의 prefix는 허용한다.

| Bad | Good | 설명 |
| --- | --- | --- |
| `tb_user` | `member` | 불필요한 prefix 제거 |
| `user_tbl` | `member` | 불필요한 postfix 제거 |
| — | `member_auth` | 마스터(`member`) 하위 속성 |
| — | `book_like` | 마스터(`book`) 하위 속성 |

### 2-2. 단수형 사용 (+ 예약어 예외)

테이블 이름은 **단수형**을 원칙으로 한다. (엔티티 1건 = 1행, `member_id` PK 컨벤션과 정합)

> **WARNING** — 예약어 충돌 시 예외
>
> 단수형 이름이 예약어와 충돌하면(예: `user` → PostgreSQL 예약어) **따옴표로 감싸지 말고 이름 자체를 바꾼다.** 권장: `user` → **`member`**, `order` → **`purchase_order`** 또는 **`order_info`**, `group` → **`user_group`**.

### 2-3. 다대다(M:N) 조인 테이블

- 두 마스터를 잇는 조인 테이블은 **`<테이블A>_<테이블B>`** 형식으로 하고, **알파벳 순서**로 붙여 팀 내 중복 생성을 방지한다.
- 의미가 뚜렷한 관계면 도메인 이름을 우선한다. (예: `book_like`, `member_role`)

| 관계 | Good |
| --- | --- |
| `book` × `tag` | `book_tag` |
| `member` × `role` | `member_role` |

### 2-4. ENUM 대신 룩업(코드) 테이블

- MySQL `ENUM` / PostgreSQL `enum type`은 값 추가·이식이 번거롭다. **룩업 테이블 + FK**로 대체한다.
- 룩업 테이블은 `<도메인>_code` 또는 `<도메인>_type` 형태로 짓는다. (예: `order_status_code`)

### 2-5. 약어 사용 제한

되도록 약어를 피하고, 부득이한 경우 소문자로 쓰며 **약어 정의서(6장)** 에 등재해 팀에 전파한다.

| Bad | Good |
| --- | --- |
| `create_dt` | `created_date` |
| `user_cd` | `member_code` |

---

## 3. 컬럼 네이밍 규칙

### 3-1. 타입별 접두/접미사

| 용도 | 규칙 | 예시 |
| --- | --- | --- |
| PK 컬럼 | `<테이블명>_id` | `member_id` |
| FK 컬럼 | `<부모 테이블명>_id` | `member_id` |
| 날짜 (DATE) | `<목적>_date` | `open_date` |
| 날짜+시간 | `<목적>_at` | `publish_at` (생성/수정/삭제는 `created_at`/`updated_at`/`deleted_at`) |
| 코드 | `<목적>_code` | `member_code` |
| 숫자(일련/번호) | `<목적>_no` | `order_no` |
| **Boolean** | **`is_` / `has_` 접두사** | `is_active`, `is_deleted`, `has_coupon` |

> **IMPORTANT** — Boolean 컬럼 정책 변경
>
> 이전 규칙의 `use_yn`(CHAR(1) 'Y'/'N') 대신 **`is_`/`has_` 접두사 + 네이티브 불리언**을 표준으로 한다.
>
> - 이름: `use_yn` → `is_used`, `del_yn` → `is_deleted`
> - 타입: 부록 참고 (PostgreSQL `BOOLEAN`, MySQL `TINYINT(1)`)
> - 레거시 Y/N 데이터가 이미 크게 깔려 있고 앱 코드 의존이 강한 테이블은, 마이그레이션 비용을 고려해 기존 방식 유지를 허용하되 **신규 설계는 반드시 표준을 따른다.**

### 3-2. 접미사에 타입을 억지로 끼워넣지 않는다

`_yn` 같은 타입 인코딩 접미사는 위 Boolean 규칙으로 대체됐다. 의미(도메인) 중심으로 짓는다.

---

## 4. 제약조건 · 인덱스 네이밍 규칙

> **IMPORTANT** — 접두사(prefix) 방식으로 통일
>
> 이전 버전은 대문자 postfix(`_IDX`)를 썼으나, **PostgreSQL 케이스 폴딩으로 대문자가 깨지고** 복합 인덱스에서 길이가 금방 초과된다. 따라서 **소문자 접두사 방식**으로 통일한다. 접두사는 정렬 시 유형별로 묶여 관리에도 유리하다. (엔진이 자동 생성하는 이름 `SYS_C00...`, 무작위 `fk_...`는 디버깅·이식에 최악이므로 **항상 명시적으로 부여한다.**)

### 4-1. 명명 규칙

| 유형 | 규칙 | 예시 |
| --- | --- | --- |
| Primary Key | `pk_<table>` | `pk_member` |
| Foreign Key | `fk_<child>_<parent>` | `fk_order_member` |
| Unique | `uq_<table>_<col…>` | `uq_member_email` |
| Check | `chk_<table>_<rule>` | `chk_order_amount_positive` |
| 일반 인덱스 | `idx_<table>_<col…>` | `idx_book_like_member_id` |
| 복합 인덱스 | `idx_<table>_<col1>_<col2>…` | `idx_actor_first_name_last_name` |
| Fulltext 인덱스 | `ftx_<table>_<col…>` | `ftx_book_name` |

### 4-2. 길이 초과 처리 (63자 규칙)

컬럼을 모두 나열하면 63자를 넘길 수 있다. 초과 시 다음 순서로 축약한다.

1. **약어 정의서(6장)에 등록된 약어** 적용 (예: `authentication` → `auth`)
2. 그래도 넘으면 **핵심 컬럼만 남기고 의미 있는 접미사**로 마무리 (예: `idx_order_member_created_at` → `idx_order_member_created`)

어떤 규칙으로 잘랐는지 마이그레이션 스크립트 주석에 남긴다.

---

## 5. 데이터 타입 정의 (공통)

### 5-1. Boolean

- 네이티브 불리언을 사용한다. 값 저장 형식은 부록 참고.
- 컬럼명은 3-1의 `is_`/`has_` 규칙을 따른다.

### 5-2. 문자열

- **경계가 있는 문자열** → `VARCHAR(n)` (양 엔진 공통, `n`은 실제 최대 길이 기준으로 산정)
- **경계가 없는 긴 텍스트** → 엔진별 대용량 타입 (부록 참고: MySQL `TEXT` 계열 / PostgreSQL `TEXT`)
- `CHAR(n)`은 **진짜 고정 자릿수(예: 국가 코드 `CHAR(2)`)에만** 제한적으로 쓴다. PostgreSQL에선 `CHAR`가 성능 이점이 없고 오히려 불리하므로 남용하지 않는다.

### 5-3. 금액 / 정산 데이터

- **부동소수점(FLOAT/DOUBLE) 금지.** 반드시 `DECIMAL`(= 표준 `NUMERIC`, 양 엔진 동일 동작)을 쓴다.
- `precision`·`scale`은 **통화·용도별로 산정**한다. `(10,2)` 고정은 금지.

| 용도 | 권장 타입 | 비고 |
| --- | --- | --- |
| 원화(KRW) 금액 | `DECIMAL(15, 0)` | 원화는 소수부 없음 → scale 0 |
| 다국적 일반 금액 | `DECIMAL(19, 4)` | 대부분 통화(2~4자리) 수용, 대액 안전 |
| 환율·단가 | `DECIMAL(19, 6)` 등 | 정밀도 요구에 맞춰 |

> **TIP** — precision 산정
>
> `DECIMAL(10, 2)`는 약 1억 미만까지만 표현한다. 누적 정산액·거래 총액엔 부족할 수 있으니 `precision`을 넉넉히 잡는다.

### 5-4. JOIN 키 / 서러게이트 PK

- JOIN 키는 **정수 계열**로 하고, 조인되는 컬럼 간 **타입을 동일하게** 맞춘다.
- 서러게이트 PK의 **기본값은 `BIGINT`** 로 한다. (`INT`는 약 21억으로 대형 테이블에서 소진 위험)
- 자동 증가 방식은 부록 참고 (MySQL `AUTO_INCREMENT` / PostgreSQL `GENERATED ... AS IDENTITY`)

### 5-5. 음수 금지 컬럼

음수가 나올 수 없는 컬럼은 **`CHECK (col >= 0)`** 제약으로 보장한다. (MySQL `UNSIGNED`는 이식 불가 → 부록 A 참고)

### 5-6. NULL 사용 지양

- 인덱스가 잡히는 컬럼은 되도록 NOT NULL로 설계하고, 선택적 속성은 정규화된 테이블에서 JOIN으로 푼다.
- 사이즈가 작거나 사용처가 적은 데이터에 한해 NULL을 허용한다.

### 5-7. 문자셋 / 콜레이션

UTF-8로 통일한다. MySQL은 **`utf8mb4`**, PostgreSQL은 **`UTF8`** 을 사용한다. (부록 참고)

---

## 6. 약어 정의서

> **IMPORTANT** — 원칙
>
> - 충분히 통용되고 의미 손실이 없는 단어만 약속하에 약어로 쓴다.
> - 약어 규칙은 **최소한**으로 유지한다.

| # | 대상 | 약어 |
| --- | --- | --- |
| 1 | number | `no` |
| 2 | address | `addr` |
| 3 | episode | `ep` |
| 4 | transaction | `tx` |
| 5 | count | `cnt` |
| 6 | authentication | `auth` |
| 7 | introduce | `intro` |

---

## 부록 A. MySQL 8.x 전용

### A-1. Boolean

`TINYINT(1)`에 `0`/`1`을 저장한다. (`BOOLEAN`/`BOOL`은 `TINYINT(1)`의 별칭)

### A-2. 대용량 텍스트 타입

| 타입 | 최대 크기 |
| --- | --- |
| `TINYTEXT` | 256 bytes |
| `TEXT` | ≈ 64 KB |
| `MEDIUMTEXT` | ≈ 16 MB |
| `LONGTEXT` | ≈ 4 GB |

인덱스가 필요 없는 200자 이상 데이터에 사용한다. 데이터 길이에 맞는 최소 타입을 고른다.

### A-3. 자동 증가

`BIGINT ... AUTO_INCREMENT`

### A-4. UNSIGNED (이식성 주의)

- MySQL 전용 기능이다. PostgreSQL엔 없으므로 **이식 대상 컬럼엔 쓰지 않는다.**
- 음수 방지는 공통 규칙 5-5의 `CHECK (col >= 0)`로 대체한다.
- 참고: `DECIMAL`/`FLOAT`/`DOUBLE`의 `UNSIGNED`는 MySQL 8.0.17에서 deprecated.

### A-5. ZEROFILL (사용 금지)

- MySQL 8.0.17부터 display width와 함께 deprecated. **사용하지 않는다.**
- 자릿수 zero-padding은 애플리케이션/조회 레이어(`LPAD` 등)에서 처리한다.

### A-6. 문자셋

`CHARACTER SET utf8mb4`, `COLLATE utf8mb4_0900_ai_ci`(또는 팀 표준 콜레이션).

---

## 부록 B. PostgreSQL 전용

### B-1. Boolean

네이티브 **`BOOLEAN`** 타입을 사용한다. (`TRUE`/`FALSE`)

### B-2. 대용량 텍스트 타입

- 길이 제한이 필요하면 `VARCHAR(n)`, 무제한이면 **`TEXT`** 를 쓴다. (PostgreSQL은 `TEXT`와 `VARCHAR` 성능 차이가 없다)
- MySQL의 `TINYTEXT`/`MEDIUMTEXT`/`LONGTEXT` 구분은 없다.

### B-3. 자동 증가

- **`GENERATED ALWAYS AS IDENTITY`** (표준, 권장). `SERIAL`/`BIGSERIAL`은 레거시 방식이므로 신규 설계에선 지양.
- 시퀀스를 직접 만들면 `<table>_<column>_seq` 형식으로 짓는다.

### B-4. 식별자 폴딩

unquoted 식별자는 자동 소문자화된다. 규칙(소문자 snake_case)을 지키면 문제없다. **대소문자를 섞은 식별자에 따옴표를 쓰지 않는다.**

### B-5. 문자셋

데이터베이스 인코딩을 `UTF8`로 생성한다. (`CREATE DATABASE ... ENCODING 'UTF8'`)
