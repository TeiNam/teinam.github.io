---
title: "3. 문자셋과 콜레이션"
permalink: /docs/database/mysql-for-developers/charset-collation/
breadcrumb: "Docs / Database / MySQL for Developers"
description: "MySQL 개발 가이드 — coercibility 규칙과 콜레이션 충돌"
last_modified_at: 2026-09-20
guide: mysql-for-developers
order: 3
nav_title: "문자셋과 콜레이션"
---

문자셋은 "어떤 문자를 저장할 수 있는가"를 정하고, 콜레이션은 "그 문자들을 어떤 순서로 정렬하고 무엇을 같다고 볼 것인가"를 정한다. 개발자에게 중요한 것은 두 번째다. 콜레이션은 `WHERE`의 일치 판정, `ORDER BY`의 순서, 유니크 제약의 중복 판정, 조인의 성립 여부를 모두 바꾼다.

### 3.1 콜레이션이 비교와 정렬을 정한다

공식 문서의 서술은 짧고 명확하다.

> "Values in `CHAR`, `VARCHAR`, and `TEXT` columns are **sorted and compared according to the character set collation assigned to the column**."

즉 정렬과 비교의 기준은 컬럼에 붙은 콜레이션이다. 인덱스는 이 순서대로 만들어진 자료구조이므로, **콜레이션을 바꾸는 것은 인덱스의 정렬 순서 자체를 바꾸는 것**이다. 같은 `VARCHAR(20)` 컬럼이라도 `utf8mb4_0900_ai_ci`와 `utf8mb4_bin`은 서로 다른 순서의 인덱스를 만들고, 서로 다른 값 집합을 "중복"으로 판정한다.

- 새로 만드는 테이블은 `utf8mb4`를 쓴다. `utf8mb3`와 그 별칭 `utf8`은 deprecated 상태다. 공식 문서는 `utf8mb3`가 8.0.x·8.4.x LTS 시리즈의 수명 동안은 지원되지만 **미래의 메이저 릴리스에서 제거될 것으로 예상하라**고 적는다
- 콜레이션은 컬럼 단위로 지정할 수 있다. 테이블 전체를 대소문자 무시로 두고 특정 컬럼만 엄격하게 비교하려면 그 컬럼에만 다른 콜레이션을 붙인다
- 비교 기준이 헷갈릴 때는 추측하지 말고 확인한다 — `INFORMATION_SCHEMA.COLLATIONS`에서 콜레이션의 속성을, `SHOW FULL COLUMNS FROM 테이블명`으로 컬럼에 실제로 붙은 콜레이션을 볼 수 있다

### 3.2 콜레이션이 충돌하면 무엇이 이기는가 — coercibility

한 식에 서로 다른 콜레이션이 섞이면 MySQL은 **coercibility**(변환 가능성) 값으로 우선순위를 정한다. 값이 작을수록 "양보하지 않는" 쪽이다.

| coercibility | 대상 |
| --- | --- |
| **0** | 명시적 `COLLATE` 절 |
| **1** | 서로 다른 콜레이션 문자열의 연결(concatenation) |
| **2** | **컬럼, 루틴 파라미터, 로컬 변수** |
| **3** | 시스템 상수(`USER()` 등이 돌려주는 값) |
| **4** | 리터럴 |
| **5** | 숫자·시간 값 |
| **6** | `NULL` 또는 `NULL`에서 파생된 식 |

규칙은 한 줄이다.

> "Use the collation with the lowest coercibility value."

여기서 실무 결론이 그대로 나온다.

- **리터럴과의 비교는 안전하다.** 컬럼(2)이 리터럴(4)보다 낮으므로 컬럼 콜레이션이 이긴다. `WHERE name = '홍길동'`은 콜레이션 충돌을 일으키지 않는다
- **서로 다른 콜레이션의 컬럼을 조인하면 에러가 된다.** 양쪽이 모두 coercibility 2라서 우선순위로 결정되지 않는다. 같은 값끼리 충돌할 때(둘 다 Unicode이거나 둘 다 비Unicode) 결과는 에러다
- **한쪽만 Unicode면 Unicode가 이기고** 상대 쪽이 변환된다
- **같은 문자셋 안에서 `_bin`과 `_ci`·`_cs`가 섞이면 `_bin`이 이긴다**
- 루틴 파라미터와 로컬 변수도 컬럼과 같은 2다. 스토어드 프로그램 안에서 파라미터와 컬럼을 비교할 때 같은 충돌이 난다

에러는 다음 형태로 나온다. 세 개 모두 SQLSTATE는 `HY000`이다.

```text
1267 ER_CANT_AGGREGATE_2COLLATIONS
Illegal mix of collations (%s,%s) and (%s,%s) for operation '%s'

1270 ER_CANT_AGGREGATE_3COLLATIONS
1271 ER_CANT_AGGREGATE_NCOLLATIONS
```

콜레이션과 문자셋의 짝이 맞지 않을 때는 별개의 에러다.

```text
1253 ER_COLLATION_CHARSET_MISMATCH
COLLATION '%s' is not valid for CHARACTER SET '%s'
```

> **DANGER** — 조인 대상 컬럼의 콜레이션을 통일한다
>
> 테이블을 시기별로 다르게 만들었거나 마이그레이션 중 일부만 `utf8mb4_0900_ai_ci`로 바꾸면, 나중에 그 두 테이블을 조인하는 쿼리에서 `Illegal mix of collations`가 난다. 스키마 단계에서 조인 키의 문자셋·콜레이션을 맞추는 것이 근본 해법이다.
>
> 쿼리에 `COLLATE`를 붙여 우선순위를 강제하는 방법(coercibility 0)은 임시 조치다. 조건이 늘어날 때마다 누락이 생기고, 식을 감싼 뒤 실행계획이 그대로인지 매번 `EXPLAIN`으로 확인해야 한다. 조인 키 하나를 고치는 `ALTER`가 결국 더 싸다.

### 3.3 후행 공백 — PAD SPACE 와 NO PAD

콜레이션에는 pad 속성이 있고, 이것이 후행 공백을 비교에서 무시할지 정한다.

- UCA 9.0.0 이상 기반 콜레이션(`utf8mb4_0900_*`)은 **`NO PAD`** — 후행 공백을 유의미한 문자로 본다. `'a'`와 `'a '`는 다른 값이다
- 그 밖의 콜레이션은 **`PAD SPACE`** — 비교에서 후행 공백을 무시한다. `'a'`와 `'a '`가 같은 값이다
- 확인은 `INFORMATION_SCHEMA.COLLATIONS.PAD_ATTRIBUTE`로 한다
- **서버 SQL 모드는 후행 공백 비교 동작에 영향을 주지 않는다.** 공식 문서의 표현은 "The server SQL mode has no effect on comparison behavior with respect to trailing spaces"다. `PAD_CHAR_TO_FULL_LENGTH`는 `CHAR` 조회 시 값을 채워 돌려주는지에 관여할 뿐이며, 이 변수 자체도 deprecated다

> **DANGER** — PAD SPACE + 유니크 인덱스 = duplicate-key 에러
>
> `PAD SPACE` 콜레이션 컬럼에 유니크 인덱스가 있으면 `'a'`와 `'a '`를 함께 넣을 수 없다. 두 값이 비교에서 같으므로 **duplicate-key 에러**가 난다. 사용자 입력을 그대로 저장하는 로그인 아이디·쿠폰 코드 컬럼에서 실제로 부딪히는 지점이다.
>
> 반대로 `NO PAD` 콜레이션에서는 두 값이 모두 들어가고, 애플리케이션은 `'a '`로 가입한 사용자를 `'a'`로 찾지 못한다. 어느 쪽이든 정답은 하나다 — **입력 단계에서 trim 한다.** 콜레이션에 판정을 맡기지 않는다.

### 3.4 한국어에서 주의할 것

- `utf8mb4_0900_ai_ci`는 호환 자모 분해형(`ㄱㅏㄴㅏㄷㅏ`)을 완성형(`가나다`)과 **같은 값으로 판정한다.** Oracle은 이를 UCA 표준에 따른 동작으로 보아 버그가 아니라고 처리했다. 즉 고칠 수 있는 설정이 아니라 콜레이션의 정의된 동작이다
- **한국어 전용 콜레이션(`utf8mb4_ko_*`)은 존재하지 않는다.** 한국어 정렬을 위해 찾을 콜레이션이 따로 없다는 뜻이다
- 정렬·비교를 엄격하게 구분해야 하는 컬럼만 **`utf8mb4_0900_as_cs`**(악센트·대소문자 구분) 또는 **`utf8mb4_bin`**(바이트 비교)을 컬럼 단위로 지정한다. 테이블 전체를 바꾸면 기존 쿼리의 일치 판정이 통째로 달라진다
- 유니크 제약을 걸 컬럼이라면 이 선택이 곧 "무엇을 중복으로 볼 것인가"의 정의다. 닉네임 중복 검사에 자모 분해형을 다른 값으로 취급하고 싶다면 `utf8mb4_bin`이 필요하다
- 부분 문자열 검색은 콜레이션으로 해결되지 않는다. 한국어 형태소·부분 일치 검색은 ngram 파서를 쓰는 FULLTEXT 인덱스의 영역이다(4.2 참고)

---
