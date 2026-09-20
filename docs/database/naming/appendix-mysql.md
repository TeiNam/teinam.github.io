---
title: "부록 A. MySQL 8.4 · 9.7 전용"
permalink: /docs/database/naming/appendix-mysql/
breadcrumb: "Docs / Database / 데이터베이스 네이밍 규칙"
description: "네이밍 규칙 — MySQL 전용 부록"
last_modified_at: 2026-09-20
guide: naming
order: 8
nav_title: "부록 A. MySQL"
---

### A-1. Boolean

**선언은 `BOOLEAN`(또는 `BOOL`)으로 한다.** 두 이름은 `TINYINT(1)` 의 동의어이므로 카탈로그에는 `tinyint(1)` 로 남는다.

`TINYINT(1)` 을 직접 쓰지 않는 이유는 `(1)` 이 값의 범위가 아니라 **display width** 이고, 정수 타입의 display width 속성이 **deprecated 되었기** 때문이다. MySQL 문서는 앞으로 지원이 제거될 것을 예상해야 한다고 적는다. 값 도메인은 5-1 에 따라 `CHECK` 로 좁힌다 — `TINYINT` 는 `-128 ~ 127` 을 경고 없이 받는다.

```sql
CREATE TABLE member (
  member_id  BIGINT   NOT NULL AUTO_INCREMENT,
  is_active  BOOLEAN  NOT NULL DEFAULT TRUE,
  PRIMARY KEY (member_id),
  CONSTRAINT chk_member_is_active_domain CHECK (is_active IN (0, 1))
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

### A-2. 대용량 텍스트 타입

| 타입 | 최대 길이 | 문서 표기 단위 |
| --- | --- | --- |
| `TINYTEXT` | 255 | 문자 |
| `TEXT` | 65,535 | 바이트 |
| `MEDIUMTEXT` | 16,777,215 | — |
| `LONGTEXT` | 4,294,967,295 | — |

`TINYTEXT` 의 상한은 255 다. 표기 단위가 타입마다 흔들리지만 네 타입 모두 **값에 멀티바이트 문자가 있으면 실질 최대 길이가 줄어든다**는 단서가 붙으므로 실질적인 상한은 바이트로 이해한다. 경계를 정할 수 있는 문자열은 5-2 에 따라 `VARCHAR(n)` 을 쓰고, 여기서는 상한을 예측할 수 없는 본문·로그·직렬화 데이터만 다룬다.

### A-3. 자동 증가

```sql
member_id BIGINT NOT NULL AUTO_INCREMENT
```

- **테이블당 하나만** 둘 수 있고, **인덱스가 걸려 있어야 하며**, `DEFAULT` 값을 가질 수 없다.
- 양수 값에서만 정상 동작한다. **음수를 넣으면 아주 큰 양수를 넣은 것으로 취급된다.**
- `NULL`(권장) 또는 `0` 을 넣으면 다음 시퀀스 값이 들어간다. `NO_AUTO_VALUE_ON_ZERO` 를 켜면 `0` 은 값 그대로 저장된다.
- 그 밖의 값을 넣으면 그 값이 저장되고 **시퀀스가 리셋된다.** 기존 값을 `UPDATE` 해도 리셋된다.

### A-4. UNSIGNED (이식성 주의)

- MySQL 전용 속성이다. PostgreSQL 에 대응이 없으므로 **이식 대상 컬럼엔 쓰지 않는다.**
- 음수 방지는 공통 규칙 5-5 의 `CHECK (col >= 0)` 로 대체한다.
- `AUTO_INCREMENT` 에 대해서는 MySQL 이 `UNSIGNED` 사용을 권한다 — 따르지 않는 이유는 5-5 의 NOTE 에 있다.
- `DECIMAL`·`FLOAT`·`DOUBLE` 의 `UNSIGNED` 는 **deprecated 되었고**, MySQL 문서는 대신 단순한 `CHECK` 제약을 쓰는 것을 고려하라고 권한다.

### A-5. ZEROFILL (사용 금지)

- display width 와 함께 **deprecated 되었다.** 쓰지 않는다.
- 공식 대안은 두 가지다 — 애플리케이션이 `LPAD()` 함수를 쓰거나, 형식이 적용된 숫자를 `CHAR` 컬럼에 저장한다.
- **`ZEROFILL` 을 지정하면 MySQL 이 자동으로 `UNSIGNED` 를 붙인다.** 의도하지 않은 `UNSIGNED` 가 따라 들어와 A-4 의 이식성 문제로 번진다.

### A-6. 문자셋 · 콜레이션

`CHARACTER SET utf8mb4`, `COLLATE utf8mb4_0900_ai_ci` 를 기본으로 한다. 한글 비교가 중요한 컬럼은 5-7 의 경고에 따라 `utf8mb4_0900_as_cs` 나 `utf8mb4_bin` 을 컬럼 단위로 지정한다.

### A-7. FULLTEXT 인덱스 명명

MySQL 에는 `FULLTEXT` 인덱스 타입이 있다. 이름은 4-1 과 같은 접두사 방식으로 짓는다.

| 유형 | 규칙 | 예시 |
| --- | --- | --- |
| Fulltext 인덱스 | `ftx_<table>_<col…>` | `ftx_book_name` |

이 규칙은 MySQL 전용이다. PostgreSQL 에는 대응하는 인덱스 타입이 없으므로(부록 B-7) 전문 검색 인덱스는 엔진별 마이그레이션으로 분리한다.

---
