---
title: "4. 인덱스"
permalink: /docs/database/mysql-for-developers/indexes/
breadcrumb: "Docs / Database / MySQL for Developers"
description: "MySQL 개발 가이드 — 인덱스 설계와 실행계획 확인"
last_modified_at: 2026-09-20
guide: mysql-for-developers
order: 4
nav_title: "인덱스"
---

### 4.1 인덱스가 DML을 느리게 하는 이유

| 원인 | 설명 |
| --- | --- |
| **B-트리 구조 업데이트** | INSERT/UPDATE 시 페이지 충전율이 바뀌고 트리 재구성이 발생 |
| **다중 인덱스 갱신** | 테이블에 인덱스가 많을수록 각각 개별 갱신 → 비용 누적 |
| **복합 인덱스 비용** | 여러 컬럼을 모두 고려해야 하므로 단일 인덱스보다 갱신 비용 높음 |

공식 문서로 확인되는 기전은 페이지 단위다. InnoDB는 클러스터드 인덱스에 새 레코드를 넣을 때 **페이지의 1/16을 비워 두려 하고**, 삭제·갱신으로 페이지 충전율이 `MERGE_THRESHOLD`(기본 50%) 아래로 내려가면 **트리를 축약해 페이지를 해제**한다. 삽입과 삭제가 섞인 워크로드에서 인덱스 유지 비용이 생기는 지점이 여기다.

표의 세 번째 항목, 즉 "복합 인덱스가 단일 인덱스보다 갱신 비용이 높다"는 판단은 공식 문서의 규범이 아니라 실무에서 굳어진 기준이다. 정확히 말할 수 있는 것은 갱신해야 하는 인덱스 엔트리의 수와 크기가 늘어난다는 것이다.

### 4.2 인덱스 생성 Tip

> **CHECK** — 실전 가이드

- **필요한 인덱스만** 생성
- 쓰기가 많은 LOG 테이블 → **카디널리티 높은 단일 컬럼** 인덱스
- 읽기 속도 중요 → **복합 인덱스** 활용
- **컬럼 쪽에** 함수·연산 적용 시 인덱스 무효화 — `WHERE YEAR(created_at)=2026` (X) / 상수 쪽 함수는 무관 `WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)` (O). 꼭 필요하면 **함수 인덱스**(`CREATE INDEX idx ON t ((YEAR(created_at)))`)나 생성 컬럼으로 우회 (4.3 참고)
- 후행 와일드카드 `LIKE '단어%'`는 **접두어 range 스캔으로 인덱스 사용 가능**
- 선두 와일드카드 `LIKE '%단어'` / 양쪽 `'%단어%'` → 접두어를 특정할 수 없어 **Full Scan 강제** → DB 부하·장애 유발
- 부분 문자열(중간 검색)이 많으면 **FULLTEXT 인덱스**로 바꾼다. 공식 문서는 ngram 파서가 **중국어·일본어·한국어(CJK)를 지원**한다고 명시한다. 한계에 도달하면 **Elasticsearch** 이관을 검토한다
- "뒤에서부터 검색"이 필요하면 역순 문자열을 별도 컬럼이나 생성 컬럼에 저장해 접두 매칭으로 바꾸는 방법이 있다. 이 우회는 공식 권고가 아니라 실무에서 쓰는 기법이다

> **INFO** — ngram FULLTEXT 인덱스를 한국어에 쓸 때
>
> - 인덱스 생성 시 `WITH PARSER ngram`을 명시해야 한다
> - 기본 토큰 크기는 **2**(bigram)다. `ngram_token_size`는 1~10 범위이며 **read-only** 변수라서 기동 옵션이나 설정 파일로만 바꿀 수 있다 — 운영 중 `SET GLOBAL`로 조정할 수 없으니 인덱스를 만들기 전에 정한다
> - ngram FULLTEXT 인덱스에서는 `innodb_ft_min_token_size`·`innodb_ft_max_token_size`·`ft_min_word_len`·`ft_max_word_len`이 **무시된다**
> - 기본 스톱워드 목록은 영어 기준이다. **한국어용 스톱워드는 직접 만들어 등록해야 한다** — 조사·어미가 토큰으로 잔뜩 들어오는 문제를 기본 설정이 걸러 주지 않는다

### 4.3 생성 컬럼과 함수 인덱스

컬럼을 가공한 조건에 인덱스를 쓰는 방법은 두 가지다. 식을 **생성 컬럼(generated column)** 으로 뽑아 일반 인덱스를 걸거나, 식에 직접 인덱스를 거는 **함수 인덱스(functional index)** 를 만든다. 함수 인덱스는 MySQL 8.0의 기능이다.

```sql
-- (1) 생성 컬럼 + 일반 인덱스
ALTER TABLE orders
  ADD COLUMN created_year INT AS (YEAR(created_at)) VIRTUAL,
  ADD KEY idx_created_year (created_year);

-- (2) 함수 인덱스 — 식에 바로 인덱스
CREATE INDEX idx_created_year ON orders ((YEAR(created_at)));
```

> **WARNING** — 함수 인덱스는 숨은 가상 생성 컬럼이다
>
> 함수 인덱스는 내부적으로 **숨은 가상 생성 컬럼**으로 구현된다. 그래서 다음 제약이 따라온다.
>
> - **PK로 쓸 수 없고**, 외래 키 지정에도 쓸 수 없다
> - **프리픽스 길이를 지정할 수 없다**
> - 테이블의 컬럼 수 제한에 포함된다
> - 식에 서브쿼리·변수·스토어드 함수·loadable 함수를 쓸 수 없다
> - **Index Condition Pushdown(ICP)이 가상 생성 컬럼 위의 세컨더리 인덱스에는 적용되지 않는다.** 즉 함수 인덱스는 "인덱스로 찾기"에는 쓰이지만 ICP로 조기 필터링하는 이득은 기대할 수 없다

> **DANGER** — 쿼리의 식이 인덱스의 식과 정확히 일치해야 한다
>
> 함수 인덱스는 **쿼리에 쓴 식이 인덱스에 쓴 식과 같을 때만** 사용된다. 공식 문서의 예시는 인자 하나 차이를 든다 — `(SUBSTRING(col1, 1, 10))`에 만든 인덱스는 `WHERE SUBSTRING(col1, 1, 9) = ...`에 쓰이지 않는다. 자릿수·인자·함수 이름이 모두 같아야 한다.
>
> 그래서 함수 인덱스는 "이 식으로만 조회한다"가 확정된 쿼리에만 쓴다. 조건 식이 자주 바뀌는 화면이라면 생성 컬럼으로 뽑아 이름을 주는 편이 관리하기 쉽다.

> **DANGER** — JSON 경로 인덱스의 콜레이션 함정
>
> JSON 값을 꺼내는 두 표현의 콜레이션이 다르다. `->>`(즉 `JSON_UNQUOTE(JSON_EXTRACT())`)의 결과는 `utf8mb4_bin`이고, `CAST(... AS CHAR(n))`의 결과는 서버 기본 콜레이션을 따른다. 이 차이를 모르고 인덱스를 만들면 쿼리가 그 인덱스를 쓰지 못한다. 옵티마이저가 `CAST()`를 자동으로 걷어내 주는 것도 **콜레이션이 일치할 때만**이다.
>
> 해법은 두 가지다. 인덱스 식에 `COLLATE utf8mb4_bin`을 명시해 쿼리 쪽 식과 콜레이션을 맞추거나, 쿼리에 인덱스와 **완전히 같은 식**을 그대로 쓴다.

### 4.4 기간(Range) 컬럼 최적화 — `start_date` / `end_date` 동시 조건

> **WARNING** — 문제 상황
>
> `start_date`, `end_date` 두 컬럼으로 유효 기간을 표현하는 테이블에서 "특정 날짜에 유효한 행"을 찾을 때 보통 아래처럼 쓴다.
>
> ```sql
> SELECT * FROM promotions
> WHERE start_date <= :target_date
>   AND end_date   >= :target_date;
> ```
>
> MySQL(InnoDB B-tree)은 **하나의 인덱스 스캔에서 Range 조건을 실질적으로 하나만 태울 수 있음**. 복합 인덱스 `(start_date, end_date)`를 만들어도 선두 컬럼(`start_date`)에 이미 Range(`<=`) 조건이 걸리는 순간, 뒤따르는 `end_date`는 **인덱스 탐색 범위를 좁히는 데 쓰이지 못하고** 필터로만 동작함. → `start_date <= :target_date` 자체가 "그 이전 모든 행"을 스캔 범위로 잡기 때문에, 데이터가 쌓일수록 스캔량이 계속 늘어남.

이 동작에는 공식 근거가 명확하다. 옵티마이저는 비교 연산자가 `=`·`<=>`·`IS NULL`인 동안에는 다음 키 파트를 계속 써서 인터벌을 좁히지만, `>`·`<`·`>=`·`<=`·`!=`·`<>`·`BETWEEN`·`LIKE`를 만나면 **그 조건은 쓰되 더 이상 키 파트를 고려하지 않는다.**

> "The optimizer attempts to use additional key parts to determine the interval as long as the comparison operator is `=`, `<=>`, or `IS NULL`. If the operator is `>`, `<`, `>=`, `<=`, `!=`, `<>`, `BETWEEN`, or `LIKE`, **the optimizer uses it but considers no more key parts**."

> **TIP** — 해결 아이디어: 알려진 최대 기간(N)으로 Range를 양쪽에서 제한
>
> 유효기간의 **최대 길이(N일)** 를 업무적으로 보장할 수 있다면(예: 쿠폰·프로모션 최대 유효기간 90일), 다음 논리가 성립함:
>
> `start_date ≤ target_date ≤ end_date` 이고 `end_date − start_date ≤ N` 이면 → `target_date − N ≤ start_date ≤ target_date`
>
> 즉 `end_date >= target_date` 조건을 별도 Range로 검사하지 않고, **`start_date`의 하한선을 계산**해서 Range를 `start_date` 한 컬럼에 몰아넣을 수 있음.

**예제 테이블**

```sql
CREATE TABLE promotions (
    id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    KEY idx_start_end (start_date, end_date)
);
```

인덱스에 `end_date`를 포함시킨 것이 핵심이다. `end_date >= :target_date`가 테이블 접근 전에 걸러지는 것(ICP)은 **그 컬럼이 인덱스에 들어 있을 때만** 성립한다. ICP는 조건의 일부를 인덱스의 컬럼만으로 평가할 수 있을 때 작동하며, InnoDB에서는 **세컨더리 인덱스에만** 적용된다. `KEY idx_start_date (start_date)` 하나로는 `end_date` 조건이 인덱스 안에서 평가되지 않으므로, 각 후보 행마다 테이블을 읽어 필터링하게 된다.

**Before — 비효율 (start_date Range의 하한이 없어 과거 전체를 스캔 범위로 잡음)**

```sql
SELECT *
FROM promotions
WHERE start_date <= '2026-07-17'
  AND end_date   >= '2026-07-17';
```

**After — 최적화 (최대 유효기간 N=90일 가정)**

```sql
SET @target_date       := '2026-07-17';
SET @max_duration_days := 90;  -- 업무적으로 보장되는 최대 유효기간

SELECT *
FROM promotions
WHERE start_date BETWEEN DATE_SUB(@target_date, INTERVAL @max_duration_days DAY)
                     AND @target_date
  AND end_date >= @target_date;
```

- `start_date`가 `BETWEEN`으로 **상·하한이 모두 있는 단일 Range**가 되어 `idx_start_end`가 좁은 구간만 스캔
- `end_date >= @target_date`는 여전히 탐색 범위를 좁히지 못하고 필터로 동작하지만, 인덱스에 포함돼 있으므로 테이블 접근 전에 걸러진다
- 데이터가 계속 쌓여도 스캔량이 "최근 N일치"로 고정된다 (Before는 테이블이 커질수록 스캔량이 무한히 증가)

> **DANGER** — 주의사항
>
> - `N`은 **실제로 보장되는 최대 유효기간**이어야 한다. 이보다 긴 기간의 행이 하나라도 있으면 그 행이 결과에서 조용히 빠지는 정합성 버그가 된다. `CHECK (DATEDIFF(end_date, start_date) <= 90)` 같은 제약이나 애플리케이션 검증으로 N을 강제한다
> - `N`이 너무 크면 최적화 효과가 줄고, 너무 작으면 유효한 행을 놓친다. 실제 데이터 분포로 N을 검증한다
> - 이 패턴이 맞지 않는 경우(최대 기간을 보장할 수 없는 경우)는 Interval Tree류 구조, 별도 검색엔진(Elasticsearch) 이관, 또는 두 개의 Range를 `UNION`으로 나눠 처리하는 방식을 검토한다. 이 대안들은 공식 문서의 권고가 아니라 실무에서 쓰는 선택지다

### 4.5 복합 인덱스 컬럼 순서 정하는 방법

> **TIP** — 기본 후보: "등치 → 정렬/그룹 → 범위" 순서 (절대 규칙 아님)
>
> 복합 인덱스는 **선두 컬럼이 정렬 기준**이 되고, 뒤에 오는 컬럼일수록 앞 컬럼 값이 좁혀진 뒤에만 효과가 있음. 아래 우선순위로 컬럼을 배치한다.

공식 근거는 leftmost prefix 규칙이다. `(col1, col2, col3)` 인덱스는 `(col1)`·`(col1, col2)`·`(col1, col2, col3)`에 대한 탐색 능력을 주고, 컬럼들이 leftmost prefix를 구성하지 못하면 MySQL은 그 인덱스로 조회할 수 없다.

1. **등치 조건 컬럼을 최우선으로** (비교 연산자 `=`)
    - `=` 조건은 인덱스에서 정확히 한 지점(또는 몇 개 지점)만 찾으므로 탐색 범위를 가장 크게 좁힌다. 4.4에서 인용한 인터벌 구성 규칙이 그대로 근거가 된다
    - 등치 조건 컬럼이 **둘 이상**이면 그들 사이의 앞뒤 순서는 탐색 범위를 좁히는 데 영향이 없다. 다만 다른 쿼리에서도 자주 재사용되는(leftmost prefix로 활용될) 컬럼을 앞쪽에 두면 하나의 인덱스로 여러 쿼리 패턴을 커버할 수 있다
    - NULL을 허용하는 컬럼을 등치 조건으로 쓸 때 주의: `col = NULL`은 항상 거짓이라 인덱스 탐색에 걸리지 않고 `col IS NULL`은 별도로 취급된다. NULL 비중이 크면 4.6의 "NULL 비중이 높은 컬럼" 항목도 함께 고려한다
2. **정렬·그룹 대상 컬럼을 그다음에** (`ORDER BY` / `GROUP BY`)
    - 등치 조건으로 좁혀진 상태에서 이미 정렬돼 있으면 **filesort를 생략**할 수 있다
    - **정렬 방향까지 인덱스와 일치**해야 함: `ORDER BY a ASC, b DESC`처럼 컬럼별 방향이 다르면 **Descending Index**(`CREATE INDEX ... (a ASC, b DESC)`)로 인덱스 자체에 방향을 맞춰야 filesort가 생략됨. 공식 문서의 표현대로, descending index는 **일부 컬럼은 오름차순, 일부는 내림차순이 섞인** 스캔 순서가 가장 효율적일 때 옵티마이저가 복합 인덱스를 쓸 수 있게 해 준다. 단 `ASC`·`DESC` 지정은 HASH·multi-valued·SPATIAL 인덱스에는 쓸 수 없다
    - 등치 컬럼과 정렬 컬럼 "사이"에 새로운 등치 조건이 끼어들면 인덱스도 그 컬럼을 포함해 순서를 다시 맞춰야 함 — 예: `WHERE status='ACTIVE' ORDER BY user_id`용 인덱스 `(status, user_id)`에 조건이 늘어 `WHERE status='ACTIVE' AND grade='VIP' ORDER BY user_id`가 되면 인덱스도 `(status, grade, user_id)`로 갱신해야 정렬 최적화가 유지된다
    - **`GROUP BY`의 정렬에 기대지 않는다.** MySQL 8.0.13에서 `GROUP BY` 절의 `ASC`·`DESC` 한정자가 제거됐고, 릴리스 노트는 이전에 `GROUP BY` 정렬에 의존했던 쿼리가 **다른 결과를 낼 수 있다**고 경고하며 원하는 순서가 있으면 `ORDER BY`를 쓰라고 명시한다. 정렬이 필요하면 `ORDER BY`를 적는다
    - 정렬 컬럼이 인덱스에 있어도 `LIMIT`의 오프셋이 커지면 여전히 느려지는 것은 별개 문제 — 오프셋 대신 커서 기반 페이지네이션으로 전환 검토 (4.7 참고)
3. **범위 조건 컬럼은 반드시 맨 뒤** (`<`, `>`, `BETWEEN`, `LIKE 'foo%'` 등)
    - 범위 조건이 걸린 컬럼 다음에 오는 컬럼은 인덱스 탐색에 활용되지 못하고 필터로만 동작한다 (4.4의 start_date/end_date 사례와 동일 원리)
4. **카디널리티(선택도)가 높은 컬럼을 우선 배치**
    - 단, 위 1~3번 규칙(쿼리 패턴)이 카디널리티보다 우선. 쿼리에서 반드시 등치로 쓰이는 컬럼이면 카디널리티가 낮아도 선두에 두는 게 유리한 경우가 많음. 이 4번 항목은 공식 문서의 규범이 아니라 실무에서 굳어진 기준이다

```sql
-- 예: WHERE status = 'ACTIVE' AND created_at BETWEEN ... ORDER BY user_id
-- status(등치) → user_id(정렬) → created_at(범위) 순으로 생성
CREATE INDEX idx_status_user_created ON orders (status, user_id, created_at);
```

> **WARNING** — 흔한 실수
>
> Range 조건 컬럼을 앞에 두고 그 뒤에 다른 컬럼을 이어 붙이는 경우(`(created_at, status)`처럼) — `created_at`으로 이미 넓게 스캔한 뒤 `status`는 각 행마다 개별 필터링만 하게 되어 복합 인덱스를 만든 효과가 거의 없다

### 4.6 인덱스가 유리한 조건 / 불리한 조건

> **CHECK** — 인덱스가 유리한 경우

| 조건 | 이유 |
| --- | --- |
| **카디널리티가 높은 컬럼** | 조건 하나로 대부분의 행을 걸러낼 수 있음 (예: PK, 이메일, 주문번호) |
| **`WHERE`/`JOIN`/`ORDER BY`/`GROUP BY`에 자주 등장** | 인덱스 스캔·정렬 생략 등으로 직접 이득을 봄 |
| **등치(`=`)·`IN` 조건으로 주로 조회** | 탐색 범위가 정확히 좁혀짐 |
| **커버링 인덱스 구성 가능** | SELECT 대상 컬럼까지 인덱스에 포함되면 테이블 접근(랜덤 I/O) 없이 인덱스만으로 응답 |
| **대용량 테이블 + 낮은 선택 비율** | 전체 대비 일부 행만 필요할 때 Full Scan 대비 이득이 큼 |

> **WARNING** — 인덱스가 불리하거나 효과가 적은 경우

| 조건 | 이유 |
| --- | --- |
| **카디널리티가 낮은 컬럼 단독 인덱스** | 성별, boolean, 상태값 3~4종 등 — 조건을 걸어도 행이 거의 안 줄어 옵티마이저가 Full Scan을 선택하기도 함 |
| **테이블 크기가 작음** | 옵티마이저가 인덱스 탐색보다 Full Scan(순차 I/O)이 더 빠르다고 판단 |
| **컬럼 값에 함수·연산을 적용한 조건** | `WHERE YEAR(created_at) = 2026` 처럼 컬럼을 가공하면 인덱스 무효화 (생성 컬럼·함수 인덱스로 우회 가능, 4.3 참고) |
| **선두 와일드카드 `LIKE '%단어'`** | 접두어 기반 탐색이 불가능해 Full Scan 강제 (4.2 참고) |
| **쓰기(INSERT/UPDATE/DELETE)가 매우 빈번한 컬럼** | 인덱스가 많을수록 각 DML마다 인덱스 갱신 비용 누적 (4.1 참고) |
| **NULL 비중이 매우 높은 컬럼** | NULL은 대부분 한 그룹으로 몰려 선택도가 떨어짐 |
| **값의 분포가 극단적으로 왜곡된(skewed) 컬럼** | 특정 값이 전체의 대부분을 차지하면 그 값 조회 시 옵티마이저가 인덱스 대신 Full Scan을 선택 |
| **`OR`로 여러 컬럼을 묶은 조건** | 컬럼별 단일 인덱스로는 Index Merge에 의존해야 해 비효율적일 수 있음 → 조건을 `UNION`으로 분리하거나 복합 인덱스 재설계 검토 |

위 두 표에서 공식 문서로 뒷받침되는 항목은 커버링 인덱스의 이득, 컬럼 가공에 따른 인덱스 무효화, 선두 와일드카드가 스캔 행 수를 줄이지 못한다는 것, 그리고 `OR` 조건이다. 마지막 항목의 근거는 명확하다 — 두 컬럼에 각각 단일 컬럼 인덱스가 있으면 옵티마이저는 Index Merge 최적화를 시도하거나 가장 제한적인 인덱스 하나를 찾으려 한다.

반면 **카디널리티가 낮은 단독 인덱스, 작은 테이블, NULL 비중이 높은 컬럼, 분포가 치우친 컬럼, 쓰기가 빈번한 컬럼**에 대한 판단은 공식 문서의 규범이 아니라 실무에서 굳어진 기준이다. 방향은 대체로 맞지만 옵티마이저가 반드시 그렇게 선택한다고 단정할 수는 없으므로, 실제 판단은 `EXPLAIN`과 `EXPLAIN ANALYZE`로 확인한다(4.9 참고).

### 4.7 LIMIT 사용 시 성능이 안 나오는 패턴 — OFFSET 함정

> **WARNING** — 문제 상황
>
> `LIMIT n OFFSET m` (또는 `LIMIT m, n`)은 "몇 페이지째"가 커질수록 느려진다. 게시판 뒷페이지나 무한 스크롤 후반부에서 특히 심각하다(딥 페이지네이션 문제).

```sql
-- 나쁜 예: OFFSET이 커질수록 느려짐 — 앞의 100,000건은 결과에 쓰이지도 않는다
SELECT * FROM posts ORDER BY id DESC LIMIT 20 OFFSET 100000;
```

OFFSET이 커질수록 느려지는 것은 널리 관찰되는 현상이다. 공식 문서가 설명하는 비용은 조금 다른 각도에 있다.

| 공식 문서가 말하는 것 | 실무에서의 의미 |
| --- | --- |
| 정렬을 인덱스로 처리할 수 없어 filesort를 쓰면, **`LIMIT` 없이 매치되는 행 전체를 선택해** 정렬한다 | 뒤 페이지든 앞 페이지든 정렬 대상이 줄지 않는다. 페이지 번호와 무관하게 비싸다 |
| 필요한 행 수를 클라이언트에 보내면 **`SQL_CALC_FOUND_ROWS`를 쓰지 않는 한 쿼리를 중단한다** | `LIMIT`의 이득은 "일찍 멈춘다"는 것이다. 그런데 OFFSET이 크면 멈추는 시점 자체가 뒤로 밀린다 |
| 세컨더리 인덱스 레코드는 PK 값을 담고 있고, InnoDB는 그 값으로 클러스터드 인덱스에서 행을 찾는다 | 커버링 인덱스가 아니면 반환 행마다 되짚기(랜덤 I/O)가 발생한다 |
| `ORDER BY` 컬럼 값이 같은 행들의 순서는 비결정적이며, 같은 `ORDER BY` 쿼리도 `LIMIT`이 있을 때와 없을 때 순서가 다를 수 있다 | 정렬 키가 유니크하지 않으면 페이지 경계에서 행이 중복·누락된다 |

> **TIP** — 해결책

1. **커서(Seek) 기반 페이지네이션** — offset 대신 "마지막으로 본 값"을 조건으로 사용한다. 가장 근본적인 해법이다

    ```sql
    -- 정렬 키가 유니크할 때 (id 는 PK)
    SELECT * FROM posts WHERE id < :last_seen_id ORDER BY id DESC LIMIT 20;
    ```

    정렬 키가 유니크하지 않으면 **PK 타이브레이커가 필수**다. 공식 권고가 그대로 근거다 — `LIMIT`이 있을 때와 없을 때 같은 행 순서를 보장해야 한다면 **`ORDER BY`에 컬럼을 추가해 순서를 결정적으로 만들라**는 것이다(예: `ORDER BY category, id`).

    ```sql
    -- created_at 이 중복될 수 있으므로 (created_at, id) 로 커서를 만든다
    SELECT * FROM posts
    WHERE created_at < :last_created_at
       OR (created_at = :last_created_at AND id < :last_id)
    ORDER BY created_at DESC, id DESC
    LIMIT 20;
    ```

    타이브레이커가 없으면 같은 `created_at`을 가진 행들의 순서가 호출마다 달라져, 페이지 경계의 행이 두 번 나오거나 아예 빠진다.

2. **지연 조인(Deferred Join)** — 커서를 쓸 수 없는 UI(페이지 번호 직접 클릭 등)라면, 커버링 인덱스로 PK만 먼저 뽑고 그 뒤에 필요한 컬럼을 JOIN으로 가져와 되짚기를 최종 페이지 크기만큼으로 줄인다. 이 기법은 공식 문서의 권고가 아니라 실무에서 쓰는 패턴이다

    ```sql
    -- id만 인덱스로 스캔한 뒤, 좁혀진 20건에만 실제 컬럼을 JOIN
    SELECT p.*
    FROM posts p
    JOIN (
        SELECT id FROM posts ORDER BY id DESC LIMIT 20 OFFSET 100000
    ) AS sub USING (id);
    ```

    - 서브쿼리가 `id`만 다루면 커버링 인덱스로 처리되어 테이블 되짚기는 최종 20건에만 발생 — Before보다는 낫지만 **offset 자체가 커지는 근본 문제는 남음** → 가능하면 1번(커서)을 우선한다
3. **대량 처리(export, 배치)** 목적이면 페이지네이션이 아니라 커서 기반 스트리밍이나 청크 단위 처리로 전환한다 (5.7 참고)

> **INFO** — `prefer_ordering_index`
>
> `ORDER BY`·`GROUP BY` + `LIMIT` 쿼리에서 옵티마이저는 기본적으로 **정렬된 인덱스를 선호**한다. 이 동작은 `optimizer_switch`의 `prefer_ordering_index` 플래그로 제어되며 기본값은 on이다. 정렬 인덱스를 타려고 훨씬 넓은 범위를 스캔하는 계획이 잡혔다면 이 플래그를 끄고 비교해 볼 수 있다.

### 4.8 `IN` 절에 서브쿼리·대량 값을 넣으면 Full Scan이 나는 이유

> **WARNING** — 문제 상황
>
> `WHERE col IN (서브쿼리)` 또는 `WHERE col IN (수백~수천 개의 값)`은 겉보기엔 인덱스를 잘 탈 것 같지만, 조건에 따라 옵티마이저가 **인덱스를 포기하고 Full Scan을 선택**하는 경우가 있다.

**(1) `IN (서브쿼리)` — 세미조인 최적화가 적용되지 않는 경우**

MySQL 8.0에서 `IN (서브쿼리)`는 기본적으로 **세미조인(semi-join) 최적화** 대상이다. 서브쿼리를 매 행마다 다시 실행하지 않고 table pullout·Duplicate Weedout·FirstMatch·LooseScan·Materialization 전략으로 JOIN처럼 처리한다. 각 전략은 `optimizer_switch` 플래그로 켜고 끌 수 있다.

전제 조건이 하나 있다. 서브쿼리는 **`IN`·`= ANY`·`EXISTS` 술어의 일부로서 `WHERE`나 `ON` 절의 최상위에 있어야** 한다(`AND` 식의 한 항이어도 된다). 즉 `OR`로 얽히면 대상이 아니다.

| 서브쿼리 안의 요소 | 세미조인 변환 |
| --- | --- |
| 집계 함수 (명시적 그룹·암묵적 그룹 모두) | 불가 |
| `HAVING` | 불가 |
| `UNION` | 불가 |
| `LIMIT` | 불가 |
| **`GROUP BY` 단독 (집계 함수 없음)** | **허용 — 무시된다** |
| `DISTINCT` · `ORDER BY` | 허용 — 무시된다 |

`GROUP BY`가 있다는 사실만으로 세미조인이 깨지지는 않는다. 공식 문서의 표현은 "A `GROUP BY` clause is permitted but ignored, **unless the subquery also contains one or more aggregate functions**"다. `DISTINCT`와 `ORDER BY`도 같은 취급이다. 실격시키는 것은 집계 함수·`HAVING`·`UNION`·`LIMIT`이다.

서브쿼리 바깥에도 실격 사유가 있다 — **외부 쿼리에 `STRAIGHT_JOIN`이 있으면** 세미조인 변환 대상이 아니고, 조인 테이블 수 상한을 넘겨도 적용되지 않는다.

```sql
-- 이 예제는 GROUP BY 때문이 아니라 COUNT(*) 와 HAVING 때문에 세미조인 대상이 아니다
SELECT * FROM orders
WHERE user_id IN (
    SELECT user_id FROM logins GROUP BY user_id HAVING COUNT(*) > 10
);
```

- **성공 신호를 본다.** `EXPLAIN`의 `Extra`에 `Start temporary`·`End temporary`(Duplicate Weedout), `FirstMatch(tbl)`, `LooseScan(m..n)`이 보이거나, `select_type=MATERIALIZED`와 `table=<subquery_N>`이 나오면 세미조인·머티리얼라이즈 전략이 적용된 것이다
- `select_type`이 `DEPENDENT SUBQUERY`면 최적화가 적용되지 않은 쪽 신호다 — 외부 테이블의 각 행마다 서브쿼리가 반복 실행될 수 있어 비용이 커진다
- "세미조인 제외 = materialization 불가"는 아니다. 세미조인 변환이 안 되더라도 **서브쿼리 Materialization**이나 파생 테이블 Materialization이 적용될 수 있으므로, 단정하지 말고 `EXPLAIN`·`EXPLAIN ANALYZE`로 실제 전략을 확인한다
- 우회: 서브쿼리를 **파생 테이블(derived table)로 미리 JOIN**하거나, 집계를 걷어내 서브쿼리를 단순화한다

```sql
-- 파생 테이블 JOIN으로 명시적으로 풀어서 씀
SELECT o.*
FROM orders o
JOIN (
    SELECT user_id FROM logins GROUP BY user_id HAVING COUNT(*) > 10
) AS heavy_users ON heavy_users.user_id = o.user_id;
```

**(2) `IN (대량의 리터럴 값)` — 통계 추정이 부정확해지는 경우**

- 옵티마이저는 `IN` 리스트의 각 값에 대해 **index dive**(각 범위의 양 끝을 실제로 들여다봐 행 수를 추정)를 수행해 실행계획을 정한다. 공식 문서의 설명은 트레이드오프를 그대로 말한다 — "Index dives provide accurate row estimates, but as the number of comparison values in the expression increases, the optimizer takes longer to generate a row estimate. Use of index statistics is less accurate than index dives but permits faster row estimation for large value lists."
- 비교 대상 컬럼에 **유니크 인덱스가 있으면 각 범위의 행 추정치는 1**이므로 dive 자체를 하지 않는다. 즉 이 문제는 논유니크 인덱스에서 생긴다
- 리스트 길이가 `eq_range_index_dive_limit`를 넘으면 MySQL은 **값마다 dive 하지 않고** 인덱스 통계(대략치)로 행 수를 추정한다 → 추정이 흐트러져 "인덱스보다 Full Scan이 싸다"는 잘못된 판단이 나올 확률이 올라간다. 이 변수는 N개까지 dive를 허용하려면 **N+1**로 설정하고, 0이면 항상 dive한다. 현재 값은 서버에서 확인한다 — `SELECT @@eq_range_index_dive_limit;`
- 통계 자체가 낡으면 추정이 더 나빠지므로 `ANALYZE TABLE`로 인덱스 통계를 갱신한다
- 값 개수가 매우 많으면(수천~수만) SQL 문 자체의 파싱·최적화 비용도 커지고, 매치되는 행이 테이블의 상당 비율을 차지하면 실제로도 Full Scan이 더 빠를 수 있다
- **컬럼과 값의 타입이 다를 때는 방향이 중요하다.** 공식 근거가 있는 쪽은 **문자열 컬럼에 숫자를 비교할 때**다 — "For comparisons of a string column with a number, MySQL cannot use an index on the column to look up the value quickly." `'1'`·`' 1'`·`'1a'`가 모두 1로 변환될 수 있기 때문이다. 반대로 숫자 컬럼에 문자열 상수를 비교하면 상수 쪽이 변환되므로 인덱스는 살아 있다

> **DANGER** — `VARCHAR` 컬럼에 `= 0`을 쓰면 전 행이 매치될 수 있다
>
> 문자열 컬럼을 숫자와 비교하면 문자열이 숫자로 변환된다. 숫자로 시작하지 않는 문자열은 0으로 변환되므로, `WHERE str_col = 0`은 **strict mode에서도** 사실상 모든 행에 매치될 수 있다. 인덱스를 못 타는 것보다 결과가 틀리는 쪽이 더 위험하다. 바인딩 파라미터의 타입을 컬럼 타입에 맞추고, ORM이 숫자를 문자열 컬럼에 보내지 않는지 확인한다.

```sql
-- 주의: 리스트가 수천 개 이상이면 index dive 추정이 흐트러져 Full Scan 위험 증가
SELECT * FROM products WHERE id IN (1, 2, 3, /* ... 수천 개 ... */);
```

> **TIP** — 대안
>
> - 대량 값 매칭은 **임시 테이블에 값을 넣고 JOIN**하는 방식이 IN 리스트보다 옵티마이저 입장에서 계획을 세우기 쉽다. 이 대안은 공식 권고가 아니라 실무 패턴이다
> - 서브쿼리 기반 `IN`은 `EXPLAIN`으로 전략을 확인하고, `DEPENDENT SUBQUERY`가 보이면 파생 테이블 JOIN으로 명시적으로 풀어 쓴다
> - `eq_range_index_dive_limit`을 늘려 dive 대상을 넓히는 것도 방법이지만, 그만큼 매 쿼리 플래닝 비용이 늘어나므로 리스트 자체를 줄이는 근본 대응이 우선

```sql
-- 대량 값은 임시 테이블 + JOIN으로
CREATE TEMPORARY TABLE tmp_ids (id INT PRIMARY KEY);
INSERT INTO tmp_ids VALUES (1), (2), (3) /* ... */;

SELECT p.* FROM products p JOIN tmp_ids t ON t.id = p.id;
```

> **INFO** — 8.4에서 달라진 것: `FORCE INDEX`면 dive를 건너뛴다
>
> 8.4는 조건이 맞으면 index dive를 아예 생략한다 — 단일 테이블 쿼리이고, 단일 인덱스를 `FORCE INDEX`로 지정했고, 그 인덱스가 논유니크·비FULLTEXT이며, 서브쿼리·`DISTINCT`·`GROUP BY`·`ORDER BY`가 없을 때다. 이때 `EXPLAIN FOR CONNECTION`의 `rows`·`filtered`가 `NULL`로 나오고, JSON 출력에 `skip_index_dive_due_to_force: true`, `OPTIMIZER_TRACE`에 `skipped_due_to_force_index`가 보인다. `FORCE INDEX`를 붙였는데 추정 행 수가 사라졌다면 이 동작이다.

### 4.9 `EXPLAIN ANALYZE` — 추정이 아니라 실측으로 확인한다

`EXPLAIN`은 옵티마이저의 계획과 추정치를 보여 준다. `EXPLAIN ANALYZE`는 **문장을 실제로 실행한 뒤** 계획과 함께 실측 타이밍을 보여 준다.

> **DANGER** — 문장을 실제로 실행한다
>
> `EXPLAIN ANALYZE`는 대상 문장을 정말로 실행한다. 다중 테이블 `UPDATE`·`DELETE`에 붙이면 데이터가 바뀐다. 쓰기 문장에 쓸 때는 트랜잭션 안에서 실행한 뒤 롤백하거나, 스테이징에서 확인한다. 오래 걸리면 `KILL QUERY`나 CTRL-C로 중단할 수 있다.

이터레이터마다 다음 값을 보여 준다.

- 예상 비용과 예상 행수 (`EXPLAIN`과 같은 추정치)
- **첫 행까지 걸린 시간**
- **실행 시간(ms)** — 그 이터레이터가 여러 번(loop) 돌았으면 평균값이다
- **실제 행수**
- **loops** — 이터레이터가 실행된 횟수

추정 행수와 실제 행수의 차이가 크면 통계나 선택도 추정이 틀린 것이고, loops가 예상보다 크면 조인 순서가 잘못된 것이다. 4.8의 `DEPENDENT SUBQUERY` 같은 신호도 여기서 반복 횟수로 드러난다.

```sql
EXPLAIN ANALYZE
SELECT p.* FROM promotions p
WHERE p.start_date BETWEEN '2026-04-18' AND '2026-07-17'
  AND p.end_date >= '2026-07-17';
```

> **WARNING** — 포맷 제약
>
> - `EXPLAIN ANALYZE`는 **`TREE` 포맷 전용**이다. `FORMAT=TRADITIONAL`과 `FORMAT=JSON`은 항상 `ERROR 1235`다
> - 세션의 `explain_format`이 `JSON`으로 설정돼 있으면 `EXPLAIN ANALYZE`에 **`FORMAT=TREE`를 명시**해야 한다
> - `FOR CONNECTION`과 함께 쓸 수 없다. 이미 실행 중인 다른 커넥션의 쿼리를 `EXPLAIN ANALYZE`로 들여다볼 수는 없다
> - 지원 문장은 `SELECT`, **다중 테이블 `UPDATE`·`DELETE`**, `TABLE`이다
> - 해시 조인이 쓰였는지는 `TREE` 포맷에서만 보인다. 조인 전략을 확인하려면 `TREE`로 읽어야 한다

---
