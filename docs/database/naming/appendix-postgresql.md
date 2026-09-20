---
title: "부록 B. PostgreSQL 18 전용"
permalink: /docs/database/naming/appendix-postgresql/
breadcrumb: "Docs / Database / 데이터베이스 네이밍 규칙"
description: "네이밍 규칙 — PostgreSQL 전용 부록"
last_modified_at: 2026-09-20
guide: naming
order: 9
nav_title: "부록 B. PostgreSQL"
---

### B-1. Boolean

표준 SQL 의 **`boolean`** 타입을 그대로 쓴다. 1바이트를 차지하고 true·false 와 SQL null 로 표현되는 unknown 세 상태를 갖는다.

- 입력은 `true`/`yes`/`on`/`1` 과 `false`/`no`/`off`/`0`, 그리고 이들의 **고유 접두사**를 대소문자 구분 없이 받는다.
- **출력은 항상 `t` 와 `f`** 다. MySQL 에서는 `0`/`1` 이 오므로 드라이버의 불리언 변환에 맡기고 문자열 비교를 하지 않는다.
- MySQL 과 달리 `2` 같은 값을 넣을 수 없으므로 5-1 의 `CHECK` 는 필요하지 않다.

### B-2. 대용량 텍스트 타입

- 길이 제한이 필요하면 `VARCHAR(n)`, 무제한이면 **`TEXT`** 를 쓴다.
- MySQL 의 `TINYTEXT`·`MEDIUMTEXT`·`LONGTEXT` 구분은 없다.
- `character(n)` 은 쓰지 않는다. 근거는 5-2 에 있다.

세 타입 사이에 성능 차이가 없으므로 `VARCHAR(n)` 의 `n` 은 저장 효율이 아니라 **도메인 제약**으로 다룬다. 값의 길이에 업무적 상한이 있으면 `n` 을 걸고, 없으면 `TEXT` 를 쓴다.

### B-3. 자동 증가

**`GENERATED ALWAYS AS IDENTITY`** 를 쓴다. 표준 SQL 의 identity 컬럼 기능이다.

```sql
CREATE TABLE member (
  member_id  BIGINT   GENERATED ALWAYS AS IDENTITY,
  is_active  BOOLEAN  NOT NULL DEFAULT TRUE,
  CONSTRAINT pk_member PRIMARY KEY (member_id)
);
```

- identity 컬럼은 자동으로 `NOT NULL` 이 되지만 **유일성을 보장하지 않는다.** 위 예제처럼 `PRIMARY KEY` 나 `UNIQUE` 로 강제한다.
- `ALWAYS` 면 사용자 지정 값은 `OVERRIDING SYSTEM VALUE` 를 명시할 때만 받아들이고, `UPDATE` 로 `DEFAULT` 아닌 값을 넣으면 거부한다. `BY DEFAULT` 면 사용자 값이 우선한다.
- PostgreSQL 은 identity 컬럼을 **여러 개** 둘 수 있다. 표준은 최대 하나로 규정하므로 한 개만 쓴다.
- 파티션은 파티션 테이블의 identity 컬럼을 상속하며 자기 identity 컬럼을 가질 수 없다. 상속 자식 테이블은 부모의 identity 컬럼을 자동으로 상속하지 않는다.

`serial`·`bigserial` 은 PostgreSQL 고유의 자동 증가 컬럼 작성 방식이고, 표준 identity 컬럼 기능은 그와 별개의 경로다. 두 방식 모두 유효하며, 이 문서가 identity 를 택하는 근거는 **표준 준수** 하나다. `serial` 계열은 진짜 타입이 아니라 시퀀스와 `DEFAULT nextval(...)` 로 펼쳐지는 표기 편의다.

| 타입 | 상한 |
| --- | --- |
| `smallserial` | 32,767 |
| `serial` | 2,147,483,647 |
| `bigserial` | 9,223,372,036,854,775,807 |

두 방식 모두 값에 빈 구간이 생긴다. 시퀀스에서 뽑힌 값은 그 값을 담은 행이 끝내 삽입되지 않아도 소비된 것으로 남는다.

### B-4. 식별자 폴딩

따옴표 없는 식별자는 자동으로 소문자화된다. 규칙(소문자 snake_case)을 지키면 문제없다. **대소문자를 섞은 식별자에 따옴표를 쓰지 않는다.** 이식 영향은 0-2 에 있다.

식별자 길이 한계는 **63바이트**이고 초과분은 **조용히 잘린다.** 따옴표를 써도 이 한계는 그대로다. 한글 식별자라면 21자에서 한계에 닿는다(1-5).

### B-5. 문자셋

데이터베이스 인코딩을 `UTF8` 로 생성한다.

```sql
CREATE DATABASE app ENCODING 'UTF8';
```

### B-6. 시퀀스 객체 명명

identity 와 `serial` 은 **시퀀스라는 별도 relation** 을 만든다. 그 이름이 스키마의 relation 네임스페이스를 차지하므로 테이블·인덱스·뷰 이름과 충돌할 수 있다(4-3). **MySQL 에는 시퀀스 객체가 없다.**

| 생성 경로 | 시퀀스 이름 |
| --- | --- |
| `serial` · `bigserial` | `<table>_<column>_seq` |
| identity, `SEQUENCE NAME` 지정 | 지정한 이름 |
| identity, 미지정 | 시스템이 쓰이지 않은 이름을 고른다 |

- `serial` 의 자동 이름 `<table>_<column>_seq` 는 확장 정의에 명시돼 있다. 시퀀스를 직접 만들 때도 이 형식을 따른다.
- identity 컬럼은 `SEQUENCE NAME` 옵션으로 이름을 **명시 지정할 수 있다.** 이름을 관리 대상에 두려면 지정한다.
- `<table>_<column>_seq` 형식은 테이블명을 포함하므로 4-3 의 스키마 전역 유일 규칙을 이미 만족한다.

### B-7. 인덱스 메서드와 전문 검색

PostgreSQL 의 인덱스 메서드는 **`btree`·`hash`·`gist`·`spgist`·`gin`·`brin`** 이고 기본은 `btree` 다. **`FULLTEXT` 인덱스 타입은 없다** — 전문 검색은 `tsvector` 에 GIN 인덱스를 얹어 구현한다.

인덱스 이름은 메서드와 무관하게 4-1 의 `idx_<table>_<col…>` 규칙을 그대로 쓴다. 메서드는 `USING` 절과 카탈로그에 남으므로 이름에 넣지 않는다. MySQL 의 `FULLTEXT` 인덱스(부록 A-7)에 대응하는 DDL 은 그대로 옮겨지지 않으므로, 전문 검색이 필요한 테이블은 인덱스 정의와 검색 쿼리를 엔진별로 따로 관리한다.
