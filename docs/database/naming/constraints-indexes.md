---
title: "4. 제약조건 · 인덱스 네이밍 규칙"
permalink: /docs/database/naming/constraints-indexes/
breadcrumb: "Docs / Database / 데이터베이스 네이밍 규칙"
description: "네이밍 규칙 — 제약조건·인덱스 명명과 유일성 범위"
updated: 2026-09-20
guide: naming
order: 5
nav_title: "제약·인덱스"
---

> **IMPORTANT** — 접두사(prefix) 방식으로 통일
>
> 제약과 인덱스 이름은 **소문자 접두사 + 테이블명 + 컬럼명** 형태로 쓴다. 대문자 접미사(`_IDX`)는 PostgreSQL 의 소문자 폴딩에서 형태가 사라지고, 복합 인덱스에서 길이 한계에 먼저 닿는다. 접두사 방식은 정렬했을 때 유형별로 묶이고, 4-3 의 유일성 범위와도 맞물린다.
>
> **이름은 항상 명시적으로 부여한다.** 근거는 4-4 에 있다.

### 4-1. 명명 규칙

| 유형 | 규칙 | 예시 |
| --- | --- | --- |
| Primary Key | `pk_<table>` | `pk_member` |
| Foreign Key | `fk_<child>_<parent>` | `fk_order_member` |
| Unique | `uq_<table>_<col…>` | `uq_member_email` |
| Check | `chk_<table>_<rule>` | `chk_order_amount_positive` |
| 일반 인덱스 | `idx_<table>_<col…>` | `idx_book_like_member_id` |
| 복합 인덱스 | `idx_<table>_<col1>_<col2>…` | `idx_actor_first_name_last_name` |

> **NOTE** — `pk_<table>` 은 MySQL 에 남지 않는다
>
> MySQL 의 PRIMARY KEY 이름은 **항상 `PRIMARY`** 다. 그래서 `PRIMARY` 는 다른 종류의 인덱스 이름으로 쓸 수 없다. `pk_<table>` 이 MySQL 카탈로그에 남을 여지가 없으므로 이 행은 PostgreSQL·Oracle·표준 SQL 에서만 의미를 갖는다. 두 엔진에 DDL 을 공유한다면 그래도 적어 둔다 — PostgreSQL 에서는 이름이 그대로 산다.

전문 검색 인덱스는 공통 규칙에서 다루지 않는다. **PostgreSQL 에는 `FULLTEXT` 인덱스 타입이 없다** — 인덱스 메서드는 `btree`·`hash`·`gist`·`spgist`·`gin`·`brin` 이고 기본은 `btree` 다. MySQL 쪽 명명은 부록 A-7, PostgreSQL 쪽은 부록 B-7 에 둔다.

### 4-2. 길이 한계와 초과 처리

이름은 **ASCII 63자** 안에서 짓는다. ASCII 만 쓰면 1문자가 1바이트이므로 PostgreSQL 의 63바이트 한계와 MySQL 의 64문자 한계를 동시에 만족한다(1-5 참조). 컬럼을 모두 나열하면 이 선을 넘길 수 있고, 초과 시 다음 순서로 축약한다.

1. **약어 정의서(6장)에 등록된 약어** 적용 (예: `authentication` → `auth`)
2. 그래도 넘으면 **핵심 컬럼만 남기고 의미 있는 접미사**로 마무리 (예: `idx_order_member_created_at` → `idx_order_member_created`)

어떤 규칙으로 잘랐는지 마이그레이션 스크립트 주석에 남긴다.

> **WARNING** — 초과 시 동작이 엔진마다 다르다
>
> **PostgreSQL 은 조용히 자른다.** 63바이트보다 긴 이름을 써도 DDL 은 통과하고 저장된 이름만 달라진다. 잘린 이름끼리 같아지면 그때 4-3 의 유일성 범위에 걸려 실패한다.
>
> **MySQL 은 64문자를 넘으면 에러다.** 직접 이름을 주지 않아도 초과할 수 있다. 이름 없는 CHECK·FK 제약은 서버가 테이블명에서 이름을 만들기 때문이다. 테이블명이 한계에 가까우면 제약명에 붙는 추가 문자 때문에 한계를 넘겨 에러가 날 수 있다.

| 이름 | 길이 |
| --- | --- |
| `idx_user_login_attempt_created_at` | 33 |
| `uq_organization_membership_invitation_organization_id_user_id` | 61 |
| `idx_organization_membership_invitation_accepted_at_created_at_id` | 64 |

마지막 이름은 PostgreSQL 에서 잘리고 MySQL 에서 에러가 난다. MySQL 이 자동으로 만드는 CHECK 제약명은 테이블명 + `_chk_` + 번호이므로, 테이블명이 57자면 `_chk_1` 을 붙여 63자이고 59자면 한계를 넘는다.

### 4-3. 이름의 유일성 범위

4-1 은 이름의 **형태**를 정한다. 그 이름이 **어디에서 유일해야 하는지**는 두 엔진이 가장 크게 갈리는 지점이고, 이 문서가 인덱스·제약 이름에 테이블명을 넣는 이유가 여기 있다.

| 대상 | MySQL 8.4 · 9.7 | PostgreSQL 18 | 표준 SQL |
| --- | --- | --- | --- |
| 인덱스명 | 테이블 단위 | **스키마 전역** | — |
| PK · UNIQUE · EXCLUDE 제약명 | 스키마 단위, 타입별 | **스키마 전역** | 스키마 전역 |
| CHECK · FK 제약명 | 스키마 단위, 타입별 | 테이블 단위 | 스키마 전역 |
| 스키마와 데이터베이스 | 같은 것 | database > schema | — |

**PostgreSQL 의 인덱스명은 스키마 전역이고 다른 relation 과 이름 공간을 공유한다.** `CREATE INDEX` 문서가 규정한다 — 인덱스 이름에는 스키마명을 넣을 수 없고 인덱스는 항상 부모 테이블과 같은 스키마에 만들어진다. 그 이름은 같은 스키마의 **테이블·시퀀스·인덱스·뷰·머티리얼라이즈드뷰·외부테이블** 어느 것의 이름과도 달라야 한다.

**PostgreSQL 의 제약명은 테이블 단위지만 인덱스 기반 제약은 예외다.** 표준 SQL 은 테이블·도메인 제약 이름이 그것을 담은 스키마 전역에서 유일해야 한다고 규정하고, PostgreSQL 은 더 느슨해서 한 테이블(또는 도메인)에 붙은 제약들 사이에서만 유일하면 된다. 단 이 여유가 **인덱스 기반 제약(`UNIQUE`·`PRIMARY KEY`·`EXCLUDE`)에는 없다** — 딸린 인덱스가 제약과 같은 이름을 갖고, 인덱스 이름은 같은 스키마의 모든 relation 사이에서 유일해야 하기 때문이다.

**MySQL 의 제약명은 스키마 단위이고 제약 타입별로 네임스페이스가 나뉜다.**

- `CONSTRAINT symbol` 은 **스키마(데이터베이스)마다, 제약 타입마다** 유일해야 한다. 중복이면 에러다.
- 표준 SQL 은 모든 제약 타입이 하나의 네임스페이스에 속한다고 규정하지만 MySQL 은 타입마다 스키마별 네임스페이스를 따로 갖는다. 그래서 **타입이 다른 제약은 같은 이름을 가질 수 있다.**
- CHECK 제약 이름은 스키마마다 유일해야 하고, 같은 스키마의 두 테이블이 CHECK 제약 이름을 공유할 수 없다. MySQL 문서는 자동 생성 제약명을 테이블명으로 시작하면 스키마 유일성 확보에 도움이 된다고 밝힌다 — 테이블명 자체가 스키마 안에서 유일하기 때문이다.
- FK 의 `CONSTRAINT symbol` 은 데이터베이스 안에서 유일해야 하고, 중복이면 `ERROR 1005 (HY000)` 이 난다.
- 인덱스명의 유일성 범위는 MySQL 문서가 규정하지 않는다. 이름 없는 인덱스에 `_2`·`_3` 을 붙여 유일하게 만든다는 서술과 에러 메시지가 `customers.zips` 처럼 테이블로 정규화된다는 점을 보면 테이블 단위로 다루는 것이 안전하다.

> **IMPORTANT** — 제약·인덱스 이름은 스키마 전역에서 유일하게 짓는다
>
> 세 규칙(MySQL·PostgreSQL·표준 SQL)을 모두 만족하는 최소 공통 규칙이다. 4-1 의 `<접두사>_<table>_<col…>` 형태를 지키면 기계적으로 충족된다 — 테이블명이 스키마 안에서 유일하므로 그것을 포함한 이름도 유일해지고, 접두사가 유형을 갈라 준다.

1. **인덱스 이름에 테이블명을 넣는 것은 PostgreSQL 에서 선택이 아니라 필수다.** 인덱스명이 스키마 전역이므로 서로 다른 테이블에 각각 만든 `idx_created_at` 두 개가 같은 스키마에서 충돌한다.
2. **접두사가 인덱스 이름을 테이블·뷰·시퀀스 이름 공간에서 떼어 놓는다.** PostgreSQL 에서 `uq_member_email` 인덱스가 있으면 같은 스키마에 같은 이름의 뷰·시퀀스·머티리얼라이즈드뷰를 만들 수 없다. identity·serial 이 만드는 시퀀스도 이 이름 공간을 쓴다(부록 B-6).
3. **MySQL 의 타입별 네임스페이스에 기대면 안 된다.** FK 와 CHECK 가 같은 이름을 공유하는 스키마는 MySQL 에서 통과하지만, 표준 SQL 의 단일 네임스페이스에서는 성립하지 않고 두 제약이 같은 테이블에 붙어 있으면 PostgreSQL 에서도 깨진다.

> **WARNING** — MySQL 은 스키마와 데이터베이스가 같다
>
> MySQL 문서의 "per schema (database)" 표현이 그대로 사실이다. PostgreSQL 은 database 가 schema 를 담는 계층이므로 한 데이터베이스 안에 여러 스키마를 둘 수 있다. 그래서 PostgreSQL 에서 `app.member` 와 `audit.member` 로 나눈 논리 분리를 MySQL 로 옮기면 데이터베이스 두 개가 되고, 제약명 유일성 범위의 경계도 함께 이동한다. 이식 대상 스키마에서는 스키마로 논리를 분리하는 설계를 쓰지 않는다.

### 4-4. 자동 생성 이름과 조용히 무시되는 절

제약과 인덱스 이름을 **항상 명시적으로 부여한다.** 두 엔진의 자동 생성 이름은 무작위가 아니라 결정적이지만, 그래도 이름을 맡기지 않는다.

| 엔진 | 대상 | 자동 생성 이름 |
| --- | --- | --- |
| MySQL | PRIMARY KEY | `PRIMARY` (고정) |
| MySQL | 이름 없는 인덱스 | 첫 인덱스 컬럼명 (+ `_2`, `_3` …) |
| MySQL | CHECK 제약 | `<table>_chk_<n>` |
| MySQL | FK 제약 | `<table>_ibfk_<n>` |
| PostgreSQL | PK 제약 | `<table>_pkey` |
| PostgreSQL | 인덱스 | `<table>_<cols>_idx` |

MySQL 의 CHECK 제약명만 규칙으로 기술돼 있고, FK 의 `_ibfk_` 는 예제와 식별자 길이 문서에서 확인된다. PostgreSQL 문서는 "이름을 지정하지 않으면 시스템이 이름을 만든다" 고만 적으므로 위 두 형태는 공식 문서의 예제에서 관찰되는 형태다. 이름을 명시하는 근거가 여기서 나온다.

- **문서화된 규칙이 아닌 이름에는 버전 간 보장이 없다.**
- **MySQL 의 인덱스 자동명은 첫 컬럼명과 같아진다.** 로그와 실행 계획에서 컬럼명인지 인덱스명인지 구분되지 않는다.
- **`_2`·`_N` 접미는 의미를 담지 않는다.**
- **MySQL 의 FK 용 자동 인덱스는 사라질 수 있다.**

> **WARNING** — DDL 을 옮길 때 조용히 무시되는 절
>
> - **MySQL**: `CONSTRAINT symbol` 없이 FK 를 정의하면 `FOREIGN KEY` 절의 `index_name` 이 무시된다 — InnoDB 와 NDB 모두 무시한다. 이름을 남기려면 `CONSTRAINT` 절로 symbol 을 준다.
> - **MySQL**: FK 를 강제할 인덱스는 없으면 참조하는 테이블에 자동으로 만들어지고, 나중에 그 FK 를 강제할 수 있는 다른 인덱스를 만들면 **조용히 삭제될 수 있다.** 이름으로 관리하려면 FK 용 인덱스를 직접 만들어 둔다.
> - **PostgreSQL**: `INCLUDING INDEXES` 로 테이블을 복제하면 인덱스와 제약 이름이 원본과 무관하게 기본 규칙으로 다시 만들어진다.

---
