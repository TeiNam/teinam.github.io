---
date: 2021-11-18 09:50:32 +0900
title: "MySQL utf8mb4_0900_ai_ci의 한글 비교 문제와 콜레이션 선택"
category: mysql
excerpt: "utf8mb4_0900_ai_ci의 한글 동등성 판정을 MySQL 8.4에서 재현하고, 호환 자모와 NFD 분해형의 차이, 유니크 제약, 후행 공백, 컬럼별 콜레이션 선택 기준을 정리합니다."
last_modified_at: 2026-09-20
---

MySQL 8.0.1에서 기본 문자셋과 콜레이션이 `utf8mb4`·`utf8mb4_0900_ai_ci`로 바뀌었습니다.[^default] 이 콜레이션에서는 완성형 `가나다`와 호환 자모 `ㄱㅏㄴㅏㄷㅏ`가 `=` 비교에서 같은 값입니다. 한글이 깨지거나 저장된 문자열이 바뀌는 문제가 아니라, **서로 다른 표기를 어디까지 같은 값으로 볼 것인가**의 문제입니다.

이 글은 2026-09-20에 MySQL 8.4·9.7 공식 매뉴얼과 유니코드 표준을 확인해 갱신했습니다. SQL 결과는 **MySQL Community Server 8.4.11**에서 재현했습니다. 다른 버전이나 관리형 서비스에서는 아래 쿼리로 실제 동작을 확인해야 합니다.

## 이름과 적용 범위부터 확인합니다

`utf8mb4_0900_ai_ci`의 이름은 다음 뜻입니다.[^unicode]

- `utf8mb4`: 문자 하나를 최대 4바이트로 표현하는 UTF-8 문자셋입니다.
- `0900`: Unicode Collation Algorithm(UCA) 9.0.0에 기반한 비교·정렬 규칙입니다.
- `ai`: 악센트를 구분하지 않습니다. 예를 들어 `e`와 `é`가 같습니다.
- `ci`: 대소문자를 구분하지 않습니다. 예를 들어 `a`와 `A`가 같습니다.

이 글의 `0900_ai_ci`는 1차 가중치로 비교하고, `0900_as_ci`는 2차까지, `0900_as_cs`는 3차까지 비교합니다. 3차 차이에는 대소문자 외의 문자 형태 차이도 포함되므로, 한글에 대소문자가 없다고 해서 `ci`와 `cs`의 결과가 항상 같은 것은 아닙니다.[^uca]

UCA 9.0 기반 콜레이션은 이전 UCA 기반 콜레이션보다 빠르도록 구현되어 있지만, 그것만으로 기본값 변경의 이유나 모든 데이터에서의 성능 우위를 설명할 수는 없습니다. 보조 문자 지원과 비교 정확성도 함께 봐야 합니다.[^unicode]

## 완성형과 호환 자모가 같은 값으로 검색됩니다

`mysql` CLI에서 실습용 데이터베이스를 선택한 뒤, 같은 연결에서 아래 쿼리를 실행합니다. 임시 테이블은 연결을 종료하면 사라집니다.

```sql
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SELECT VERSION(), @@character_set_connection, @@collation_connection;

CREATE TEMPORARY TABLE korean_collation_demo (
  id INT PRIMARY KEY,
  name VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO korean_collation_demo (id, name)
VALUES (1, '가나다'), (2, 'ㄱㅏ나다'), (3, 'ㄱㅏㄴㅏㄷㅏ');

SELECT id, name, CHAR_LENGTH(name) AS chars,
       LENGTH(name) AS bytes, HEX(name) AS hex_value
FROM korean_collation_demo
WHERE name = '가나다'
ORDER BY id;
```

| id | name | chars | bytes | hex_value |
| --- | --- | --- | --- | --- |
| 1 | 가나다 | 3 | 9 | EAB080EB8298EB8BA4 |
| 2 | ㄱㅏ나다 | 4 | 12 | E384B1E3858FEB8298EB8BA4 |
| 3 | ㄱㅏㄴㅏㄷㅏ | 6 | 18 | E384B1E3858FE384B4E3858FE384B7E3858F |

바이트도 문자 수도 다른 세 행이 모두 나옵니다. 조건을 `name = 'ㄱㅏ나다'`나 `name = 'ㄱㅏㄴㅏㄷㅏ'`로 바꿔도 같은 세 행이 나옵니다. 반면 비교식에 `utf8mb4_general_ci`를 명시하면 첫 번째 행만 나옵니다.

```sql
SELECT id, name
FROM korean_collation_demo
WHERE name COLLATE utf8mb4_general_ci = '가나다'
ORDER BY id;
```

이 예제는 `=` 비교에 관한 것입니다. `LIKE`는 문자 단위로 비교하므로 같은 결과라고 가정하면 안 됩니다.[^like]

```sql
SELECT
  _utf8mb4'가나다' COLLATE utf8mb4_0900_ai_ci = _utf8mb4'ㄱㅏㄴㅏㄷㅏ'
    AS equal_result,
  _utf8mb4'가나다' COLLATE utf8mb4_0900_ai_ci LIKE _utf8mb4'ㄱㅏㄴㅏㄷㅏ'
    AS like_result;
-- equal_result = 1, like_result = 0
```

콜레이션은 `GROUP BY`, `DISTINCT`, 유니크 인덱스의 중복 판정에도 영향을 줍니다. 위 테이블에서 `COUNT(DISTINCT name)`은 `1`입니다.

```sql
SELECT COUNT(DISTINCT name) AS distinct_names FROM korean_collation_demo;
-- distinct_names = 1

CREATE TEMPORARY TABLE korean_unique_demo (
  name VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_korean_unique_demo_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO korean_unique_demo (name) VALUES ('가나다');
INSERT INTO korean_unique_demo (name) VALUES ('ㄱㅏㄴㅏㄷㅏ');
-- 두 번째 INSERT는 ERROR 1062 (23000): Duplicate entry ... 로 실패합니다.
```

애플리케이션에서 코드포인트나 바이트로만 중복 검사했다면, 검사 결과와 DB의 유니크 판정이 달라질 수 있습니다. 중복 조회와 저장의 비교 기준을 맞추고, 동시에 들어오는 요청에 대해서도 최종 유니크 제약 위반을 처리해야 합니다.

## UCA 비교와 유니코드 정규화를 구분합니다

UCA 9.0의 가중치표에서 결합 자모 `ᄀ`(U+1100)와 호환 자모 `ㄱ`(U+3131)는 1차·2차 가중치가 같고 3차 가중치가 다릅니다.[^weights] 따라서 두 형태의 차이가 `ai_ci` 비교에서 사라지는 것은 UCA의 가중치 규칙으로 설명됩니다. 버전 업그레이드만 기대하기보다, 서비스에서 필요한 동일성 기준을 정해야 합니다.

또한 확인한 8.4·9.7 매뉴얼에는 `utf8mb4_ko_0900_ai_ci` 같은 한국어 전용 콜레이션이 없습니다.[^unicode][^current] `euckr_korean_ci`는 다른 문자셋용이므로 `utf8mb4` 컬럼에 사용할 수 없습니다.

여기서 **호환 자모와 NFD 분해형은 다릅니다.** 둘을 모두 “분해형”이라고 부르면 해결 방법을 잘못 고르게 됩니다.

| 형태 | 예 | 첫 음절에 해당하는 코드포인트 | NFC 적용 결과 |
| --- | --- | --- | --- |
| 완성형 음절 | `가나다` | U+AC00 | `가나다` |
| NFD 분해형의 결합 자모 | `가나다` | U+1100 + U+1161 | `가나다` |
| 호환 자모 나열 | `ㄱㅏㄴㅏㄷㅏ` | U+3131 + U+314F | `ㄱㅏㄴㅏㄷㅏ` |

NFC는 정준적으로 동등한 문자를 정규화하며 호환성 차이는 유지합니다. 따라서 **NFC만 적용해서는 이 글의 호환 자모 입력을 완성형으로 바꿀 수 없습니다.** NFKC는 호환성 정규화까지 하지만, 전각 문자·동그라미 숫자 등의 차이도 함께 없애므로 입력 정책에 맞춰 선택해야 합니다.[^normalization]

Python 표준 라이브러리로 차이를 확인할 수 있습니다.

```python
import unicodedata

# 결합 자모는 NFC로 합쳐지지만 호환 자모는 그대로 남습니다.
assert unicodedata.normalize("NFC", "\u1100\u1161\u1102\u1161\u1103\u1161") == "가나다"
assert unicodedata.normalize("NFC", "ㄱㅏㄴㅏㄷㅏ") == "ㄱㅏㄴㅏㄷㅏ"
assert unicodedata.normalize("NFKC", "ㄱㅏㄴㅏㄷㅏ") == "가나다"
```

정규화는 키보드 입력기의 한글 조합 과정도 아닙니다. 예를 들어 NFKC가 `ㄱㅏㄱ`을 받침 있는 `각`으로 조합해 주지는 않습니다. 따라서 임의의 호환 자모 나열을 복원하는 방법으로 취급해서는 안 됩니다.

## 요구사항에 맞는 콜레이션을 컬럼에 지정합니다

아래는 MySQL 8.4.11에서 각 쌍을 `=`로 비교한 결과입니다. “같음”은 `1`, “다름”은 `0`입니다. NFD 열은 위 표의 결합 자모 문자열을 뜻합니다.

| 콜레이션 | `가나다` / 호환 자모 | `가나다` / NFD | `a` / `A` | `e` / `é` | `a` / `a ` |
| --- | --- | --- | --- | --- | --- |
| `utf8mb4_0900_ai_ci` | 같음 | 같음 | 같음 | 같음 | 다름 |
| `utf8mb4_0900_as_ci` | 같음 | 같음 | 같음 | 다름 | 다름 |
| `utf8mb4_0900_as_cs` | 다름 | 같음 | 다름 | 다름 | 다름 |
| `utf8mb4_0900_bin` | 다름 | 다름 | 다름 | 다름 | 다름 |
| `utf8mb4_bin` | 다름 | 다름 | 다름 | 다름 | 같음 |
| `utf8mb4_general_ci` | 다름 | 다름 | 같음 | 같음 | 같음 |

각 환경에서 재검증할 때는 다음 비교식의 `COLLATE` 이름을 바꿔 실행하면 됩니다. NFD 문자열은 편집기에서 모양을 구분하기 어려워 UTF-8 바이트로 지정했습니다.

```sql
SELECT
  _utf8mb4'가나다' COLLATE utf8mb4_0900_as_cs = _utf8mb4'ㄱㅏㄴㅏㄷㅏ'
    AS compatibility_equal,
  _utf8mb4'가나다' COLLATE utf8mb4_0900_as_cs =
    CONVERT(0xE18480E185A1E18482E185A1E18483E185A1 USING utf8mb4)
    AS nfd_equal;
-- compatibility_equal = 0, nfd_equal = 1
```

### UCA 비교를 유지하면서 호환 자모를 구분할 때

`utf8mb4_0900_as_cs`를 검토합니다. 호환 자모와 완성형을 구분하지만, 악센트와 영문 대소문자도 함께 구분합니다. 완성형과 NFD 분해형은 여전히 같은 값입니다.

`utf8mb4_0900_as_ci`만으로는 호환 자모 문제가 해결되지 않습니다. 이 예제의 차이는 2차까지 비교해서는 드러나지 않고 3차 비교에서 드러납니다. 대소문자 무시도 필요한 계정명이라면, `as_cs`로 바꾸기 전에 입력 정규화·대소문자 처리·유니크 판정을 함께 설계해야 합니다.

### 문자 코드의 차이와 후행 공백까지 구분할 때

`utf8mb4_0900_bin`을 검토합니다. 이 콜레이션은 MySQL 8.0.17에 추가되었고 `NO PAD`입니다. 기존 `utf8mb4_bin`도 문자 코드에 따른 비교를 하지만 `PAD SPACE`라서 후행 공백을 무시합니다.[^binary-release]

`_bin` 콜레이션을 쓰는 `VARCHAR`는 여전히 **문자열 타입**입니다. `utf8mb4_bin`을 “바이트를 그대로 비교하는 타입”이라고 설명하면 부정확합니다. 인코딩 변환 없이 바이트 자체를 저장·비교해야 한다면 `VARBINARY`나 `BLOB`을 검토해야 합니다.[^binary] 또한 바이너리 계열의 정렬은 언어별 정렬 규칙과 다르므로 표시 순서도 확인합니다.

### 기존 `utf8mb4_general_ci`를 유지할 때

기존 서비스가 이 비교 규칙에 의존한다면 유지할 수 있습니다. 다만 이를 한국어 전용 해결책이나 단순 코드포인트 정렬로 설명해서는 안 됩니다. `general_ci`는 대소문자·악센트를 무시하는 레거시 비교 규칙이며, 확장·축약·무시문자 처리가 제한됩니다.[^unicode]

보조 문자도 주의해야 합니다. 같은 문자셋이라 저장은 가능하지만, 비교는 기대와 다를 수 있습니다. 아래 이모지 비교도 MySQL 8.4.11에서 재현됩니다.

```sql
SELECT
  _utf8mb4'😀' COLLATE utf8mb4_general_ci = _utf8mb4'😁' AS general_equal,
  _utf8mb4'😀' COLLATE utf8mb4_0900_ai_ci = _utf8mb4'😁' AS uca_equal;
-- general_equal = 1, uca_equal = 0
```

한글 호환 자모만 구분하려고 전체 DB를 `general_ci`로 바꾸면, 이모지의 유니크 판정과 후행 공백 등 다른 동작까지 바뀝니다. 한글이라는 이유만으로 하나의 콜레이션을 일괄 적용하기보다, 컬럼이 무엇을 식별하는지에 맞춰 선택하는 편이 낫습니다.

## 연결 설정만으로 기존 컬럼은 바뀌지 않습니다

`collation_connection`이나 Connector/J의 `connectionCollation`을 지정해도 기존 컬럼의 콜레이션은 변경되지 않습니다. 일반적인 컬럼과 문자열 리터럴의 비교에서는 컬럼의 우선순위가 더 높습니다. MySQL의 coercibility 값은 명시적 `COLLATE`가 0, 컬럼이 2, 리터럴이 4이며 작은 쪽을 적용합니다.[^coercibility]

앞서 만든 임시 테이블로 확인할 수 있습니다.

```sql
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

SELECT @@collation_connection;
-- utf8mb4_general_ci
SELECT COUNT(*) AS matched FROM korean_collation_demo WHERE name = '가나다';
-- matched = 3: 컬럼의 utf8mb4_0900_ai_ci를 따릅니다.

SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

연결 설정은 문자 인코딩과 리터럴끼리의 비교 등에 필요하지만, 컬럼의 비교 정책을 대신하지 않습니다. 실제 대상 컬럼은 다음과 같이 확인합니다. 테이블명은 예시입니다.

```sql
SHOW FULL COLUMNS FROM korean_collation_demo;
SHOW CREATE TABLE korean_collation_demo;

SELECT COLLATION_NAME, PAD_ATTRIBUTE
FROM information_schema.COLLATIONS
WHERE COLLATION_NAME IN (
  'utf8mb4_0900_ai_ci', 'utf8mb4_0900_as_cs',
  'utf8mb4_0900_bin', 'utf8mb4_bin', 'utf8mb4_general_ci'
)
ORDER BY COLLATION_NAME;
```

위의 `SET NAMES`는 `mysql` CLI 재현용입니다. Connector/J 애플리케이션에서는 `characterEncoding`·`connectionCollation` 등 드라이버 설정을 사용합니다. Connector/J는 애플리케이션이 직접 실행한 `SET NAMES`의 변경을 감지하지 못하므로, 공식 문서도 이를 사용하지 말라고 안내합니다.[^connector]

## 기존 컬럼을 변경하기 전에 확인할 것

기존 컬럼은 `ALTER TABLE ... MODIFY`로 문자셋과 콜레이션을 지정할 수 있습니다. 아래는 앞의 실습 테이블에 대한 예제이며, 운영 테이블에서는 `SHOW CREATE TABLE`로 확인한 타입·길이·NULL 허용·기본값·COMMENT 등의 속성을 보존해야 합니다. 생략한 컬럼 속성은 자동으로 유지되지 않습니다.[^alter]

```sql
ALTER TABLE korean_collation_demo
  MODIFY name VARCHAR(30)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL;

SELECT COUNT(*) AS matched FROM korean_collation_demo WHERE name = '가나다';
-- matched = 1
```

서버·데이터베이스·테이블의 **기본값만 변경해도 이미 존재하는 컬럼이 함께 변환되는 것은 아닙니다.** 실제 컬럼 정의를 확인해야 합니다.[^alter]

운영 데이터에는 다음을 점검합니다.

- **변경 후 중복:** 대상 콜레이션으로 `GROUP BY ... HAVING COUNT(*) > 1`을 실행해 유니크 충돌 후보를 찾습니다. 복합 유니크 키라면 전체 키 조합을 기준으로 검사합니다.
- **공백과 정규화:** `NO PAD`에서 `PAD SPACE`로 바꾸면 `a`와 `a `가 충돌할 수 있습니다. 입력 정규화를 새로 도입할 때도 기존 데이터의 충돌을 확인합니다.
- **쿼리와 조인:** 대소문자·악센트의 일치 여부, 정렬 순서, 조인 상대 컬럼과의 콜레이션 호환성을 확인합니다. 조회식의 `COLLATE`로 우회한다면 인덱스 사용도 `EXPLAIN`으로 확인합니다.
- **변경 비용:** 컬럼 콜레이션 변경에 따른 테이블·인덱스 재구성, 잠금, 필요한 디스크 공간을 사본에서 확인합니다. 운영 테이블에 같은 DDL을 즉시 실행할 수 있다고 가정하지 않습니다.

후행 공백 비교는 값을 실제로 잘라 저장한다는 뜻도 아닙니다. `VARCHAR`의 저장과 콜레이션의 비교를 구분해야 하며, `CHAR`에는 별도의 패딩·조회 규칙이 있습니다. 또한 `LIKE`의 후행 공백 처리를 `=`와 같다고 가정해서는 안 됩니다.[^char]

**완성형·결합 자모·호환 자모·영문 대소문자·후행 공백을 각각 같은 값으로 볼지 정하고, 그 기준을 입력 처리와 컬럼의 유니크 제약에 일관되게 적용해야 합니다.**

## 참고 자료

[^default]: MySQL 8.0.1 Release Notes — Character Set Support. 기본 문자셋·콜레이션 변경. <https://docs.oracle.com/cd/E17952_01/mysql-8.0-relnotes-en/news-8-0-1.html>
[^unicode]: MySQL 8.4 Reference Manual — Unicode Character Sets. UCA 버전·언어별 콜레이션·레거시 콜레이션의 제한. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/charset-unicode-sets.html>
[^current]: MySQL 9.7 Reference Manual — Unicode Character Sets. 9.7 매뉴얼의 지원 목록 대조. <https://docs.oracle.com/cd/E17952_01/mysql-9.7-en/charset-unicode-sets.html>
[^uca]: Unicode Technical Standard #10 — Unicode Collation Algorithm. 비교 수준과 가중치의 의미. <https://www.unicode.org/reports/tr10/>
[^weights]: UCA 9.0.0 Default Unicode Collation Element Table. U+1100과 U+3131의 가중치. <https://www.unicode.org/Public/UCA/9.0.0/allkeys.txt>
[^normalization]: Unicode Standard Annex #15 — Unicode Normalization Forms. NFC·NFKC의 정의와 호환성 차이. <https://www.unicode.org/reports/tr15/>
[^like]: MySQL 8.4 Reference Manual — String Comparison Functions and Operators. `LIKE`와 `=`의 비교 차이. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/string-comparison-functions.html>
[^binary-release]: MySQL 8.0.17 Release Notes — `utf8mb4_0900_bin` 추가와 `utf8mb4_bin`과의 차이. <https://docs.oracle.com/cd/E17952_01/mysql-8.0-relnotes-en/news-8-0-17.html>
[^binary]: MySQL 8.4 Reference Manual — The binary Collation Compared to _bin Collations. 문자 코드 비교와 바이트 비교의 차이. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/charset-binary-collations.html>
[^coercibility]: MySQL 8.4 Reference Manual — Collation Coercibility in Expressions. 컬럼·리터럴·명시적 `COLLATE`의 우선순위. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/charset-collation-coercibility.html>
[^connector]: MySQL Connector/J Developer Guide — Using Character Sets and Unicode. 연결 속성과 `SET NAMES` 주의사항. <https://docs.oracle.com/cd/E17952_01/connector-j-en/connector-j-reference-charsets.html>
[^alter]: MySQL 8.4 Reference Manual — ALTER TABLE Statement. 컬럼 정의 변경 시 속성 보존과 기본값 변경의 범위. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/alter-table.html>
[^char]: MySQL 8.4 Reference Manual — The CHAR and VARCHAR Types. 저장·후행 공백·유니크 인덱스의 동작. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/char.html>
