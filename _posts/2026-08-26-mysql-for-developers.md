---
title: "MySQL for Developers"
category: database
excerpt: "MySQL 개발에서 알아야 할 핵심 원칙과 안티패턴 — 정규화부터 인덱스, 드라이버 선택, 릴리스 정책까지."
---

> **SUMMARY** — 요약
>
> MySQL 개발 시 알아야 할 핵심 원칙과 안티패턴을 정리한 가이드.
> **정규화 → 데이터 타입 → Stored Program → 인덱스 → 안티패턴 → JDBC → 릴리스 정책** 순으로 구성.
> 버전·드라이버 관련 내용은 **2026-08-26 KST 기준**이다. 실제 적용 전에는 각 벤더의 공식 릴리스 노트와 대상 엔진에서 다시 확인한다.

> **INFO** — 적용 범위
>
> - 기본 대상: **MySQL 8.4 LTS 이상, InnoDB**
> - Aurora MySQL 전용 내용은 별도로 표시
> - 버전 의존 기능은 운영 적용 전에 공식 문서와 대상 엔진에서 재검증

---

## 1. 데이터 정규화 필수

> **TIP** — 핵심 원칙
>
> 관계형 데이터베이스의 본질은 **"쪼개고 저장하고 합쳐서 출력한다"**

- MySQL은 RDBMS — 정규화가 **성능·정합성·무결성**을 지키는 기본 전략
- 하나의 Row를 읽는데 블록이 많으면 당연히 I/O가 늘어남
- **JSON, HTML 데이터를 하나의 컬럼에 밀어 넣는 구조는 안티패턴** (5.5 JSON 안티패턴 참고)

> **TIP** — 정규화 단계 요약 (1NF ~ 3NF)
>
> 실무에서는 3NF까지만 지켜도 대부분의 이상 현상(anomaly)을 막을 수 있음

| 단계 | 규칙 | 위반 시 생기는 문제 |
| --- | --- | --- |
| **1NF** | 각 컬럼은 원자값(atomic value)만 가짐 | 컬럼에 값을 쉼표로 여러 개 저장 → 검색·집계·인덱싱 불가 |
| **2NF** | 1NF + 복합 PK의 일부에만 종속되는 컬럼 분리 | 같은 정보가 여러 행에 중복 → 수정 시 일부만 고쳐 불일치(Update Anomaly) |
| **3NF** | 2NF + PK가 아닌 컬럼에 종속되는 컬럼(**이행 종속**, transitive dependency) 분리 | 행을 지우면 관련 없는 정보까지 같이 사라짐(Delete Anomaly) 등 이상 현상 |

> **WARNING** — 반정규화(Denormalization)는 언제 정당한가
>
> 정규화가 기본값이지만, 조회가 압도적으로 많고 JOIN 비용이 명확한 병목으로 확인된 경우에는 예외적으로 반정규화를 검토할 수 있음.
>
> - 예: `orders.total_price`처럼 계산 결과를 미리 컬럼에 저장해두는 캐시성 반정규화
> - 조건: 반정규화한 값과 원본 데이터의 **동기화 책임을 명시적으로 정의**해야 함 (Trigger는 3장에서 비권장 → 애플리케이션 레벨 동기화나 배치로 처리). 동기화 책임을 정하지 않으면 정합성이 조용히 깨짐

---

## 2. 데이터 타입 선택

### 2.1 가장 작은 데이터 타입을 사용하라

| 이점 | 설명 |
| --- | --- |
| **저장 공간 절약** | `TINYINT`(1B) vs `INT`(4B) — 1억 행 기준 100MB vs 400MB |
| **인덱스 크기 축소** | 작은 타입 → 인덱스가 메모리에 더 많이 적재 → 검색 속도 향상 |
| **메모리 사용량 감소** | 버퍼 풀·캐시 효율성 증가 |
| **네트워크 대역폭 절약** | 전송 데이터량 감소 → 응답 속도 향상 |

> **TIP** — 정수 타입별 저장 범위 (선택 기준)

| 타입 | 크기 | 범위 (SIGNED) | 범위 (UNSIGNED) |
| --- | --- | --- | --- |
| `TINYINT` | 1B | -128 ~ 127 | 0 ~ 255 |
| `SMALLINT` | 2B | -32,768 ~ 32,767 | 0 ~ 65,535 |
| `MEDIUMINT` | 3B | -8,388,608 ~ 8,388,607 | 0 ~ 16,777,215 |
| `INT` | 4B | 약 -21억 ~ 21억 | 0 ~ 약 42억 |
| `BIGINT` | 8B | 약 -922경 ~ 922경 | 0 ~ 약 1844경 |

- 음수를 저장할 일이 없는 컬럼(PK, 개수, 나이 등)은 `UNSIGNED`를 붙이면 같은 바이트로 표현 범위를 2배로 늘릴 수 있음
- 타입 범위는 실제 값과 예상 성장량을 기준으로 정하되, 단기간에 상한에 도달하지 않도록 합리적인 여유를 둔다. `INT → BIGINT` 같은 정수 타입 변경도 대용량 테이블에서는 `ALGORITHM=COPY`에 따른 테이블 복사·재구축과 긴 작업 시간이 발생할 수 있으므로 운영 중 확장이 가볍다고 가정하면 안 된다.
- `DECIMAL`도 마찬가지 원칙 적용: 소수점 이하 정밀도가 필요 없는 금액이라면 정수(예: 원 단위)로 저장하는 것이 `DECIMAL`보다 계산·저장 효율이 좋음

### 2.2 문자열 타입 비교

| 특성 | `CHAR` | `VARCHAR` | `TEXT` 계열 |
| --- | --- | --- | --- |
| **길이** | 고정 (최대 255**자**) | 가변 — `VARCHAR(n)`의 `n`은 **문자 수** (최대 `n`은 행 크기 65,535B에 종속) | 가변 (`TINYTEXT` 255B · `TEXT` ~64KB · `MEDIUMTEXT` ~16MB · `LONGTEXT` ~4GB) |
| **저장 방식** | 정의 길이만큼 고정, 뒤를 공백으로 패딩 | 길이 접두(1~2B) + 실제 데이터 | InnoDB에서 값이 크면 off-page(별도 오버플로 페이지)에 저장하고 행에는 포인터만 |
| **장점** | 길이 일정 → 업데이트 시 행 이동 적음, 짧은 고정폭 값에 유리 | 공간 효율적, 다양한 길이 처리 | 매우 큰 문자열 저장 가능 |
| **단점** | 짧은 문자열에 공간 낭비, 후행 공백 트리밍 주의 | — | 접두어 인덱스만 가능(`col(100)`), 정렬·`GROUP BY` 시 디스크 임시 테이블 유발 가능 |

> **WARNING** — `VARCHAR(n)`의 `n`은 문자 수, 단 그 `n`의 상한이 바이트로 제약됨
>
> - **정의 단위는 문자 수**: MySQL 4.1부터 문자열 타입의 길이는 **문자(character) 단위**로 해석되며(그 이전은 바이트), 캐릭터셋과 무관하게 `VARCHAR(n)`은 `n`자를 저장함. `VARCHAR(500)`은 `utf8mb4`에서도 그대로 **500자** 저장(125자로 줄지 않음). → **Oracle과 다른 지점**: Oracle `VARCHAR2(n)`은 기본이 **바이트** 시맨틱(`VARCHAR2(n CHAR)`로 명시해야 문자 단위), MySQL `VARCHAR(n)`은 항상 **문자** 시맨틱.
> - **`n`을 얼마나 크게 잡을 수 있는가는 바이트로 제약**: 컬럼(정확히는 행 전체) 최대 크기가 **65,535바이트**라, 멀티바이트 캐릭터셋에서는 정의 가능한 최대 `n`이 줄어듦 — `utf8mb4`(문자당 최대 4B)면 단일 `VARCHAR` 컬럼의 실질 상한이 **약 16,383자**. 즉 "저장은 문자 수로, 정의 최댓값만 바이트 한도에 걸린다"고 이해하면 정확함.
> - `VARCHAR`의 길이 접두 크기는 **개별 값의 실제 길이가 아니라 컬럼이 저장할 수 있는 최대 바이트 길이**로 결정됨. 최대 255B 이하면 1B, 255B를 초과할 수 있으면 2B를 사용함.
> - `CHAR(n)`의 `n`도 문자 수 기준이며, 내부 저장 바이트는 캐릭터셋에 따라 달라짐(`utf8mb4`면 최대 `n`×4B).

### 2.3 날짜와 시간 — DATETIME vs TIMESTAMP

| 특성 | DATETIME | TIMESTAMP |
| --- | --- | --- |
| **저장 형식** | packed binary (문자열이 아님) — 입력 값을 시간대 변환 없이 그대로 보관 | UTC epoch 기반 정수 — 저장 시 세션 시간대→UTC, 조회 시 UTC→세션 시간대로 자동 변환 |
| **범위** | 1000-01-01 ~ 9999-12-31 | 1970-01-01 00:00:01 UTC ~ 2038-01-19 03:14:07 UTC |
| **시간대** | 시간대 무관(저장한 그대로) | 세션(`time_zone`)에 따라 변환됨 |
| **저장 공간** | **5바이트** (MySQL 5.6.4+, 소수 초 자리마다 +1~3B) | **4바이트** (소수 초 자리마다 +1~3B) |
| **사용 시점** | 넓은 범위·시간대 변환이 필요 없는 값(예약 시각, 생년월일시) | **글로벌 서비스**, `created_at`/`updated_at`처럼 UTC 절대시각 + 자동 갱신이 필요할 때 |

> **WARNING** — 흔히 잘못 알려진 두 가지
>
> - **DATETIME은 "문자열로 저장"되지 않는다.** MySQL 5.6.4부터 DATETIME은 **5바이트 packed binary**로 저장됨(그 이전 버전은 8바이트). 즉 "DATETIME=8B, 문자 저장"이라는 설명은 옛 버전 기준의 오해.
> - **소수 초(fractional seconds)** 정밀도(`DATETIME(3)`, `TIMESTAMP(6)` 등)를 쓰면 자릿수에 따라 1~3B가 추가됨(1~2자리 +1B, 3~4자리 +2B, 5~6자리 +3B).

> **DANGER** — 2038년 문제 (Y2038)
>
> `TIMESTAMP`의 상한은 **2038-01-19 03:14:07 UTC**. 만료일·미래 예약 시각처럼 2038년을 넘길 수 있는 값에 `TIMESTAMP`를 쓰면 오버플로가 발생하므로, 이런 컬럼은 `DATETIME`(또는 애플리케이션에서 UTC를 명시적으로 다루는 설계)을 사용해야 함.

> **TIP** — 실무 권장 패턴
>
> - "UTC 절대시각"을 앱에서 일관되게 다룰 수 있다면, 시간대 변환 부작용을 피하기 위해 **DATETIME + 항상 UTC 저장** 조합을 선호하는 팀도 많음. 반대로 서버의 자동 UTC 변환에 기대고 싶으면 TIMESTAMP.
> - 자동 갱신은 타입과 무관하게 `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP`로 DATETIME·TIMESTAMP 모두에 걸 수 있음(5.6.5+).

### 2.4 꿀팁 — 함수를 이용한 데이터 저장

#### `INET_ATON` — IP 주소를 정수로 저장

```sql
CREATE TABLE ip_addresses (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip_address INT UNSIGNED NOT NULL,
    PRIMARY KEY (id)
);

-- 삽입
INSERT INTO ip_addresses (ip_address) VALUES (INET_ATON('192.168.0.1'));

-- 조회
SELECT * FROM ip_addresses WHERE ip_address = INET_ATON('192.168.0.1');
-- 결과: 3232235521
```

- 문자열 대신 `INT UNSIGNED`로 저장 → **4바이트**만 사용
- `INET_ATON()`은 잘못된 입력에 `NULL`을 반환할 수 있으므로 함수만으로 무결성이 보장되지는 않음. `NOT NULL`, Strict SQL mode, 애플리케이션 입력 검증을 함께 적용

> **WARNING** — `INET_ATON`은 IPv4 전용
>
> `INET_ATON`/`INET_NTOA`는 **IPv4만** 처리함(IPv6 문자열을 넣으면 `NULL` 반환). IPv6까지 저장해야 한다면 **`INET6_ATON`/`INET6_NTOA` + `VARBINARY(16)`** 조합을 사용해야 함. `INET6_ATON`은 IPv4·IPv6를 모두 받아 각각 4B/16B 바이너리로 반환하므로, 듀얼스택 환경이면 처음부터 `VARBINARY(16)`으로 통일해 두는 편이 안전함.

```sql
-- IPv4/IPv6 겸용 저장
INSERT INTO ip_log (ip) VALUES (INET6_ATON('2001:db8::1'));
SELECT INET6_NTOA(ip) FROM ip_log;   -- 다시 문자열로 복원
```

#### `UUID_TO_BIN` / `BIN_TO_UUID` — UUID를 바이너리로 저장

- **저장 공간 절약**: 문자열(36B) → 바이너리(16B)
- **성능 향상**: 바이너리 비교가 문자열 비교보다 빠름
- **단점**: JOIN 키로 사용 시 직관적이지 않음, 함수 없이는 알아보기 어려움

> **TIP** — Swap Flag로 정렬 가능한 바이너리 만들기
>
> `UUID_TO_BIN(uuid, swap_flag)`의 두 번째 인자(`swap_flag=1`)를 주면 UUID v1의 타임스탬프 상위 비트를 앞으로 재배치해 **시간순 정렬이 가능한 바이너리 값**을 만들 수 있음 → InnoDB B-tree 단편화 감소

```sql
SELECT UUID_TO_BIN(UUID(), 1);  -- time-ordered binary
```

> **INFO** — UUID v7 검토
>
> MySQL의 `UUID()` 함수는 여전히 v1만 생성함(v7 미지원, 2026-08 기준). 시간순 정렬 + 전역 유일성이 필요하면 **애플리케이션 레벨에서 UUID v7을 생성**해 `BINARY(16)`으로 저장하는 방식이 최근 권장됨 (5.2 PK 안티패턴과 연계).

---

## 3. Stored Procedure · Trigger · Event Scheduler 사용 자제

> **WARNING** — MySQL에서는 특히 주의
>
> MySQL의 stored program 캐시는 **연결(세션) 단위**라 연결 간에 공유되지 않음 — 커넥션 풀 환경에서 새 연결마다 첫 호출 시 파싱·컴파일 비용을 다시 치름

| 문제 영역 | 상세 |
| --- | --- |
| **유지보수** | 비즈니스 로직 분산, IDE 디버깅 불가 |
| **이식성** | DBMS 종속, 버전 호환성 문제 |
| **성능** | 캐싱 솔루션(Redis 등) 통합 어려움, Scale-Out 제한 |
| **생산성** | 버전 관리·테스트·배포 자동화 부족, 협업 어려움 |
| **로직 중복** | 앱 코드와 SP 간 동일 로직 중복 → 일관성 저하 |
| **보안** | 권한 관리 복잡(DEFINER/INVOKER 혼동), SP 내부에서 **문자열 연결로 동적 SQL을 조립하면** 인젝션 위험 |

### MySQL SP의 고유한 성능 특성

- **세션 로컬 캐시**: Oracle의 shared pool처럼 인스턴스 전역에서 공유되는 컴파일 캐시가 없음. stored program은 **각 연결이 처음 호출할 때 파싱·컴파일되어 그 연결에서만 재사용**되고, 연결이 끊기면 사라짐
- **커넥션 풀과의 궁합**: 풀이 연결을 자주 만들고 버리면 매 연결의 "첫 호출"마다 파싱 비용이 반복됨. 반대로 장수(long-lived) 연결을 재사용하는 풀에서는 두 번째 호출부터는 캐시가 살아 있어 비용이 크지 않음
- **정리**: "매 호출마다 무조건 재컴파일"은 과장이지만, **전역 공유 캐시가 없다는 구조적 한계** 때문에 Oracle/PostgreSQL 대비 SP 캐싱 이점이 약한 것은 사실. 이 점이 위의 유지보수·이식성 문제와 겹쳐 SP 남용을 피하는 근거가 됨

---

## 4. 인덱스

### 4.1 인덱스가 DML을 느리게 하는 이유

| 원인 | 설명 |
| --- | --- |
| **B-트리 구조 업데이트** | INSERT/UPDATE 시 노드 분할·병합·재배치 발생 |
| **다중 인덱스 갱신** | 테이블에 인덱스가 많을수록 각각 개별 갱신 → 비용 누적 |
| **복합 인덱스 비용** | 여러 컬럼을 모두 고려해야 하므로 단일 인덱스보다 갱신 비용 높음 |

### 4.2 인덱스 생성 Tip

> **CHECK** — 실전 가이드

- **필요한 인덱스만** 생성
- 쓰기가 많은 LOG 테이블 → **카디널리티 높은 단일 컬럼** 인덱스
- 읽기 속도 중요 → **복합 인덱스** 활용
- **컬럼 쪽에** 함수·연산 적용 시 인덱스 무효화 — `WHERE YEAR(created_at)=2026` (X) / 상수 쪽 함수는 무관 `WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)` (O). 꼭 필요하면 **Functional Index**(8.0.13+, `CREATE INDEX idx ON t ((YEAR(created_at)))`)나 Generated Column으로 우회
- 후행 와일드카드 `LIKE '단어%'`는 **접두어 range 스캔으로 인덱스 사용 가능**
- 선두 와일드카드 `LIKE '%단어'` / 양쪽 `'%단어%'` → 접두어를 특정할 수 없어 **Full Scan 강제** → DB 부하·장애 유발
- 부분 문자열(중간 검색)이 많으면 **Fulltext 인덱스**(ngram 파서로 한국어 대응) → 한계 시 **Elasticsearch** 이관. "뒤에서부터 검색"이 필요하면 역순 문자열을 별도 컬럼/Generated Column에 저장해 접두 매칭으로 바꾸는 트릭도 있음

### 4.3 기간(Range) 컬럼 최적화 — `start_date` / `end_date` 동시 조건

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
> MySQL(InnoDB B-tree)은 **하나의 인덱스 스캔에서 Range 조건을 실질적으로 하나만 태울 수 있음**. 복합 인덱스 `(start_date, end_date)`를 만들어도 선두 컬럼(`start_date`)에 이미 Range(`<=`) 조건이 걸리는 순간, 뒤따르는 `end_date`는 **인덱스 탐색 범위를 좁히는 데 쓰이지 못하고** ICP(Index Condition Pushdown) 필터로만 동작함. → `start_date <= :target_date` 자체가 "그 이전 모든 행"을 스캔 범위로 잡기 때문에, 데이터가 쌓일수록 스캔량이 계속 늘어남.

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
    KEY idx_start_date (start_date)
    -- 커버링 효과까지 원하면: KEY idx_start_end (start_date, end_date)
);
```

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

- `start_date`가 `BETWEEN`으로 **상·하한이 모두 있는 단일 Range**가 되어 `idx_start_date`가 좁은 구간만 스캔
- `end_date >= @target_date`는 이미 좁혀진 결과 집합에 대한 필터로만 동작(인덱스에 `end_date`를 포함시키면 ICP로 테이블 접근 전에 걸러짐)
- 데이터가 계속 쌓여도 스캔량이 "최근 N일치"로 고정됨 (Before는 테이블이 커질수록 스캔량이 무한히 증가)

> **DANGER** — 주의사항
>
> - `N`은 **실제로 보장되는 최대 유효기간**이어야 함. 이보다 긴 기간의 행이 하나라도 존재하면 결과에서 조용히 빠지는 데이터 정합성 버그가 생김 → `CHECK (DATEDIFF(end_date, start_date) <= 90)` (MySQL 8.0.16+) 같은 제약이나 애플리케이션 검증으로 N을 강제해야 함
> - `N`이 너무 크면 최적화 효과가 줄고, 너무 작으면 유효한 행을 놓침 — 실제 데이터 분포로 N을 검증할 것
> - 이 패턴이 맞지 않는 경우(최대 기간을 보장할 수 없는 경우)는 Interval Tree류 구조, 별도 검색엔진(Elasticsearch) 이관, 또는 두 개의 Range를 `UNION`으로 나눠 처리하는 방식을 검토

### 4.4 복합 인덱스 컬럼 순서 정하는 방법

> **TIP** — 기본 후보: "등치 → 정렬/그룹 → 범위" 순서 (절대 규칙 아님)
>
> 복합 인덱스는 **선두 컬럼이 정렬 기준**이 되고, 뒤에 오는 컬럼일수록 앞 컬럼 값이 좁혀진 뒤에만 효과가 있음. 아래 우선순위로 컬럼을 배치한다.

1. **등치 조건 컬럼을 최우선으로** (비교 연산자 `=`)
    - `=` 조건은 인덱스에서 정확히 한 지점(또는 몇 개 지점)만 찾으므로 탐색 범위를 가장 크게 좁힘
    - 등치 조건 컬럼이 **여러 개**라면 그들 사이의 앞뒤 순서는 탐색 범위 좁히기 자체에는 영향이 없음 — 다만 다른 쿼리에서도 자주 재사용되는(leftmost prefix로 활용될) 컬럼을 더 앞쪽에 두면 하나의 인덱스로 여러 쿼리 패턴을 커버할 수 있음
    - NULL을 허용하는 컬럼을 등치 조건으로 쓸 때 주의: `col = NULL`은 항상 거짓이라 인덱스 탐색에 걸리지 않고 `col IS NULL`은 별도로 취급됨. NULL 비중이 크면 4.5의 "NULL 비중이 높은 컬럼" 항목도 함께 고려할 것
2. **정렬·그룹 대상 컬럼을 그다음에** (`ORDER BY` / `GROUP BY`)
    - 등치 조건으로 좁혀진 상태에서 이미 정렬돼 있으면 **filesort 생략** 가능
    - **정렬 방향까지 인덱스와 일치**해야 함: `ORDER BY a ASC, b DESC`처럼 컬럼별 방향이 다르면 MySQL 8.0+ **Descending Index**(`CREATE INDEX ... (a ASC, b DESC)`)로 인덱스 자체에 방향을 맞춰야 filesort가 생략됨. 방향이 안 맞으면 정렬 컬럼이 인덱스에 있어도 filesort가 발생함
    - 등치 컬럼과 정렬 컬럼 "사이"에 새로운 등치 조건이 끼어들면 인덱스도 그 컬럼을 포함해 순서를 다시 맞춰야 함 — 예: `WHERE status='ACTIVE' ORDER BY user_id`용 인덱스 `(status, user_id)`에 조건이 늘어 `WHERE status='ACTIVE' AND grade='VIP' ORDER BY user_id`가 되면 인덱스도 `(status, grade, user_id)`로 갱신해야 정렬 최적화가 유지됨
    - **MySQL 8.0부터** `GROUP BY`의 암묵적 정렬(implicit sorting)이 사라짐 — 정렬이 필요하면 반드시 `ORDER BY`를 명시해야 함 (참고: 8.0.13에서는 `GROUP BY col ASC/DESC` 구문 자체도 제거됨)
    - 정렬 컬럼이 인덱스에 있어도 `LIMIT/OFFSET`의 오프셋이 커지면 여전히 느려지는 것은 별개 문제 — 오프셋 대신 커서 기반 페이지네이션(`WHERE id > :last_id LIMIT N`)으로 전환 검토
3. **범위 조건 컬럼은 반드시 맨 뒤** (`<`, `>`, `BETWEEN`, `LIKE 'foo%'` 등)
    - 범위 조건이 걸린 컬럼 다음에 오는 컬럼은 인덱스 탐색에 활용되지 못하고 필터로만 동작함 (4.3의 start_date/end_date 사례와 동일 원리)
4. **카디널리티(선택도)가 높은 컬럼을 우선 배치**
    - 단, 위 1~3번 규칙(쿼리 패턴)이 카디널리티보다 우선. 쿼리에서 반드시 등치로 쓰이는 컬럼이면 카디널리티가 낮아도 선두에 두는 게 유리한 경우가 많음

```sql
-- 예: WHERE status = 'ACTIVE' AND created_at BETWEEN ... ORDER BY user_id
-- status(등치) → user_id(정렬) → created_at(범위) 순으로 생성
CREATE INDEX idx_status_user_created ON orders (status, user_id, created_at);
```

> **WARNING** — 흔한 실수
>
> Range 조건 컬럼을 앞에 두고 그 뒤에 다른 컬럼을 이어 붙이는 경우(`(created_at, status)`처럼) — `created_at`으로 이미 넓게 스캔한 뒤 `status`는 각 행마다 개별 필터링만 하게 되어 복합 인덱스를 만든 효과가 거의 없음

### 4.5 인덱스가 유리한 조건 / 불리한 조건

> **CHECK** — 인덱스가 유리한 경우

| 조건 | 이유 |
| --- | --- |
| **카디널리티가 높은 컬럼** | 조건 하나로 대부분의 행을 걸러낼 수 있음 (예: PK, 이메일, UUID) |
| **`WHERE`/`JOIN`/`ORDER BY`/`GROUP BY`에 자주 등장** | 인덱스 스캔·정렬 생략 등으로 직접 이득을 봄 |
| **등치(`=`)·`IN` 조건으로 주로 조회** | 탐색 범위가 정확히 좁혀짐 |
| **커버링 인덱스 구성 가능** | SELECT 대상 컬럼까지 인덱스에 포함되면 테이블 접근(랜덤 I/O) 없이 인덱스만으로 응답 |
| **대용량 테이블 + 낮은 선택 비율** | 전체 대비 일부 행만 필요할 때 Full Scan 대비 이득이 큼 |

> **WARNING** — 인덱스가 불리하거나 효과가 적은 경우

| 조건 | 이유 |
| --- | --- |
| **카디널리티가 낮은 컬럼 단독 인덱스** | 성별, boolean, 상태값 3~4종 등 — 조건을 걸어도 행이 거의 안 줄어 Optimizer가 Full Scan을 선택하기도 함 |
| **테이블 크기가 작음** | 옵티마이저가 인덱스 탐색보다 Full Scan(순차 I/O)이 더 빠르다고 판단 |
| **컬럼 값에 함수·연산을 적용한 조건** | `WHERE YEAR(created_at) = 2026` 처럼 컬럼을 가공하면 인덱스 무효화 (Generated Column + 인덱스로 우회 가능, 5.5 참고) |
| **선두 와일드카드 `LIKE '%단어'`** | 접두어 기반 탐색이 불가능해 Full Scan 강제 (4.2 참고) |
| **쓰기(INSERT/UPDATE/DELETE)가 매우 빈번한 컬럼** | 인덱스가 많을수록 각 DML마다 B-tree 갱신 비용 누적 (4.1 참고) |
| **NULL 비중이 매우 높은 컬럼** | NULL은 대부분 한 그룹으로 몰려 선택도가 떨어짐 |
| **값의 분포가 극단적으로 왜곡된(skewed) 컬럼** | 특정 값이 전체의 대부분을 차지하면 그 값 조회 시 Optimizer가 인덱스 대신 Full Scan을 선택 |
| **`OR`로 여러 컬럼을 묶은 조건** | 컬럼별 단일 인덱스로는 Index Merge에 의존해야 해 비효율적일 수 있음 → 조건을 `UNION`으로 분리하거나 복합 인덱스 재설계 검토 |

### 4.6 LIMIT 사용 시 성능이 안 나오는 패턴 — OFFSET 함정

> **WARNING** — 문제 상황
>
> `LIMIT n OFFSET m` (또는 `LIMIT m, n`)은 MySQL이 앞의 `m`개 행을 실제로 다 읽고 버린 뒤에야 그다음 `n`개를 반환함. 즉 **OFFSET이 커질수록 스캔량이 그만큼 늘어남** — "몇 페이지째"가 커지는 게시판·무한 스크롤 뒷부분에서 특히 심각(딥 페이지네이션 문제).

```sql
-- 나쁜 예: OFFSET이 커질수록 느려짐 — 100,020개 행을 읽고 100,000개는 버림
SELECT * FROM posts ORDER BY id DESC LIMIT 20 OFFSET 100000;
```

| 원인 | 설명 |
| --- | --- |
| **행을 읽고 버리는 구조** | MySQL은 offset+limit개 행을 순서대로 읽어 앞부분을 버림 — 인덱스로 정렬을 커버해도 스캔량 자체는 줄지 않음 |
| **커버링 인덱스가 없으면 랜덤 I/O 추가** | 정렬용 인덱스에서 PK만 얻은 뒤, `SELECT *`를 위해 각 행마다 클러스터드 인덱스로 되짚어가는 랜덤 I/O 발생 → 페이지가 뒤로 갈수록 누적 |
| **`ORDER BY` 없이 `LIMIT`만 사용** | 정렬 기준이 없으면 실행계획이 바뀔 때마다 반환 순서가 달라질 수 있어 페이지네이션 정합성이 깨짐 |

> **TIP** — 해결책

1. **커서(Seek) 기반 페이지네이션** — offset 대신 "마지막으로 본 값"을 조건으로 사용. 가장 근본적인 해법(4.4에서도 언급)

    ```sql
    -- 이전 페이지 마지막 id를 기억해서 조건으로 사용 — offset 없이 항상 빠름
    SELECT * FROM posts WHERE id < :last_seen_id ORDER BY id DESC LIMIT 20;
    ```

2. **지연 조인(Deferred Join)** — 커서를 쓸 수 없는 UI(페이지 번호 직접 클릭 등)라면, 커버링 인덱스로 PK만 먼저 빠르게 뽑고 그 뒤에 필요한 컬럼을 JOIN으로 가져와 랜덤 I/O를 최소화

    ```sql
    -- id만 인덱스로 빠르게 스캔한 뒤, 좁혀진 20건에만 실제 컬럼을 JOIN
    SELECT p.*
    FROM posts p
    JOIN (
        SELECT id FROM posts ORDER BY id DESC LIMIT 20 OFFSET 100000
    ) AS sub USING (id);
    ```

    - 서브쿼리가 `id`만 다루면 커버링 인덱스로 처리되어 테이블 랜덤 I/O는 최종 20건에만 발생 — Before보다는 낫지만 **offset 자체가 커지는 근본 문제는 남음** → 가능하면 1번(커서)을 우선한다
3. **대량 처리(export, 배치)** 목적이면 페이지네이션이 아니라 커서 기반 스트리밍이나 청크 단위 처리로 전환

### 4.7 `IN` 절에 서브쿼리·대량 값을 넣으면 Full Scan이 나는 이유

> **WARNING** — 문제 상황
>
> `WHERE col IN (서브쿼리)` 또는 `WHERE col IN (수백~수천 개의 값)`은 겉보기엔 인덱스를 잘 탈 것 같지만, 조건에 따라 Optimizer가 **인덱스를 포기하고 Full Scan을 선택**하는 경우가 있음.

**(1) `IN (서브쿼리)` — 세미조인 최적화가 깨지는 경우**

MySQL 5.6부터 `IN (서브쿼리)`는 기본적으로 **세미조인(semi-join) 최적화**를 탄다. 서브쿼리를 매 행마다 다시 실행하지 않고 materialization(임시 테이블화 + 인덱스 부여) 또는 `FirstMatch` 전략으로 JOIN처럼 처리하는 방식이다. 문제는 아래 조건 중 하나라도 있으면 이 최적화가 **적용되지 않고** 예전 방식(의존 서브쿼리, dependent subquery)으로 되돌아간다는 점이다.

| 세미조인이 깨지는 서브쿼리 조건 | 결과 |
| --- | --- |
| 서브쿼리에 집계 함수 / `HAVING` | 세미조인 변환 대상에서 제외 → 매 외부 행마다 서브쿼리 재실행 가능성 (단, 서브쿼리·파생 테이블 materialization이 별도로 적용될 수 있음) |
| 서브쿼리에 `UNION` | 세미조인 대상 아님 |
| 서브쿼리에 `LIMIT` | 세미조인 대상 아님 |
| `IN`이 `OR` 등과 얽혀 서브쿼리가 조건 트리 최상위가 아님 | 최적화 미적용 |

```sql
-- 주의: 서브쿼리에 집계가 있어 세미조인 최적화가 적용되지 않을 수 있음
SELECT * FROM orders
WHERE user_id IN (
    SELECT user_id FROM logins GROUP BY user_id HAVING COUNT(*) > 10
);
```

- `EXPLAIN`에서 `Select_type`이 `DEPENDENT SUBQUERY`로 나오면 최적화가 깨진 신호 — 외부 테이블의 각 행마다 서브쿼리가 반복 실행될 수 있어 사실상 Full Scan에 가까운 비용이 남
- "세미조인 제외 = materialization 불가"는 아님. 세미조인 변환이 안 되더라도 **서브쿼리 Materialization**이나 파생 테이블 Materialization이 적용될 수 있으므로, 단정하지 말고 `EXPLAIN` / `EXPLAIN ANALYZE`로 실제 전략을 확인해야 함
- 우회: 서브쿼리를 **파생 테이블(derived table)로 미리 JOIN**하거나, materialization이 되도록 서브쿼리를 단순화

```sql
-- 파생 테이블 JOIN으로 명시적으로 풀어서 씀
SELECT o.*
FROM orders o
JOIN (
    SELECT user_id FROM logins GROUP BY user_id HAVING COUNT(*) > 10
) AS heavy_users ON heavy_users.user_id = o.user_id;
```

**(2) `IN (대량의 리터럴 값)` — 통계 추정이 부정확해지는 경우**

- Optimizer는 `IN` 리스트의 각 값에 대해 **index dive**(인덱스를 실제로 조금 들여다봐서 그 값의 행 수를 추정)를 수행해 실행계획을 정함
- 리스트 길이가 시스템 변수 `eq_range_index_dive_limit`(기본값 200, 8.0 기준)를 넘으면, MySQL은 **값마다 index dive를 하지 않고** 기존 인덱스 통계(대략치)만으로 행 수를 추정함 → 추정이 부정확해져 Optimizer가 "인덱스보다 Full Scan이 싸다"고 잘못 판단할 확률이 올라감
- 값 개수가 매우 많으면(수천~수만) SQL 문 자체의 파싱·최적화 비용도 커지고, 매치되는 행이 테이블의 상당 비율을 차지하면 실제로도 Full Scan이 더 빠른 경우도 있음(4.5의 "카디널리티가 낮은 경우"와 같은 원리)
- **컬럼과 IN 값의 타입이 다르면**(예: `VARCHAR` 컬럼에 정수 리스트, 혹은 그 반대) 암묵적 형변환이 걸려 컬럼 쪽이 가공된 것과 같은 효과 → 인덱스 무효화(4.2의 "컬럼 쪽 함수·연산" 원리와 동일)

```sql
-- 주의: 리스트가 수천 개 이상이면 index dive 추정이 흐트러져 Full Scan 위험 증가
SELECT * FROM products WHERE id IN (1, 2, 3, /* ... 수천 개 ... */);
```

> **TIP** — 대안
>
> - 대량 값 매칭은 **임시 테이블에 값을 넣고 JOIN**하는 방식이 IN 리스트보다 Optimizer 입장에서 계획을 세우기 쉬움
> - 서브쿼리 기반 `IN`은 `EXPLAIN`으로 `DEPENDENT SUBQUERY` 여부를 확인하고, 걸리면 파생 테이블 JOIN으로 명시적으로 풀어 쓴다
> - `eq_range_index_dive_limit`을 늘려서 index dive 대상을 넓히는 것도 방법이지만, 그만큼 매 쿼리 플래닝 비용이 늘어나므로 리스트 자체를 줄이는 근본 대응이 우선

```sql
-- 대량 값은 임시 테이블 + JOIN으로
CREATE TEMPORARY TABLE tmp_ids (id INT PRIMARY KEY);
INSERT INTO tmp_ids VALUES (1), (2), (3) /* ... */;

SELECT p.* FROM products p JOIN tmp_ids t ON t.id = p.id;
```

---

## 5. MySQL 안티패턴 (하지 말아야 할 것들)

### 5.1 `COUNT(*)` 를 존재 검증 로직에 사용

- **정확한 원인은 스토리지 엔진(InnoDB)의 MVCC**: InnoDB는 트랜잭션마다 보이는 스냅샷이 다르므로 "지금 이 트랜잭션에서 보이는 정확한 행 수"를 미리 계산해 둘 수 없음. 그래서 `COUNT(*)`는 **가장 작은 인덱스를 스캔하며 매번 실제로 세어야** 함 (MyISAM은 행 수를 메타데이터로 들고 있어 `WHERE` 없는 `COUNT(*)`가 즉시 반환됨 — 이 차이가 "MySQL은 느리다"는 오해의 출처)
    - "Oracle은 `row_num`을 저장해서 빠르다"는 설명은 **사실이 아님**. Oracle 역시 테이블 행 수를 상시 저장하지 않고 세그먼트/인덱스를 스캔하거나 통계·머티리얼라이즈드 뷰에 의존함
- **존재 여부만 알고 싶을 때 `COUNT(*)`는 안티패턴**: 행이 하나라도 있는지만 확인하려는 목적이라면 전체를 세지 말고 아래처럼 조기 종료시켜야 함

```sql
-- 나쁜 예: 존재 확인에 전체 카운트
SELECT COUNT(*) FROM orders WHERE user_id = 42;   -- 있으면 다 셈

-- 좋은 예: 존재만 확인 (첫 행에서 멈춤)
SELECT EXISTS(SELECT 1 FROM orders WHERE user_id = 42);
-- 또는
SELECT 1 FROM orders WHERE user_id = 42 LIMIT 1;
```

- **큰 테이블의 대략적 총건수**면 `information_schema.TABLES.TABLE_ROWS`(InnoDB 추정치)나 별도 카운터 테이블/캐시로 대체 검토
- 참고: 필터가 커버링 인덱스로 처리되면 `COUNT(*)`도 충분히 빠를 수 있음 — 무조건 느린 게 아니라 **"존재 확인에 총계를 구하는 패턴"이 잘못된 것**

### 5.2 PK에 랜덤 키 사용

> **IMPORTANT** — PK는 `INT` 계열 + `AUTO_INCREMENT` 권장

- MySQL PK = **클러스터드 인덱스** → 물리적 재배열 발생
- 랜덤 키 사용 시 순서 없는 재배열 → 생성 시점 기준 정렬 불가
- UUID v1 + `UUID_TO_BIN` 방식도 가능하나, FK JOIN 시 직관성 떨어짐
- **대안**: 분산 환경에서 전역 유일 키가 꼭 필요하다면 완전 랜덤인 UUID v4보다 **UUID v7**(타임스탬프 기반, 정렬 가능)을 애플리케이션에서 생성해 `BINARY(16)`으로 저장하는 방식이 최근 권장됨 → 인덱스 단편화 최소화

### 5.3 복합키(Composite Key)로 PK 생성

| 문제 | 영향 |
| --- | --- |
| 인덱스 크기·검색 비용 증가 | 전체 성능 저하 |
| 쿼리 복잡성·가독성 저하 | 유지보수 어려움 |
| FK 참조 복잡성 | 여러 컬럼 함께 참조 필요, 실수 가능성 증가 |
| 인덱스 순서 의존성 | 잘못된 순서 → 성능 저하 |

### 5.4 물리적 모델에 FK 적용

| 문제 | 영향 |
| --- | --- |
| 쓰기 성능 저하 | 삽입·수정·삭제 시 무결성 검사 오버헤드 |
| 잠금 경합 | 참조 테이블 잠금 → 동시성 저하 |
| 마이그레이션·통합 어려움 | 스키마 변경·분산 환경에서 제약 |
| 이식성 저하 | DBMS별 FK 구현 차이 |

> **TIP** — 대안
>
> FK 제약을 **애플리케이션 레벨**에서 관리하면 대규모·분산·마이그레이션 잦은 환경에서 더 유연하고 성능 최적화 여지가 큼

> **INFO** — 균형 잡힌 시각: FK를 무조건 배제할 필요는 없음
>
> 위 표는 **대규모 트래픽·분산·잦은 스키마 변경** 맥락에서의 트레이드오프임. 반대로 다음 상황에서는 물리적 FK가 오히려 이득이 큼:
>
> - **단일 인스턴스·중소 규모**로 쓰기 부하가 병목이 아닌 서비스
> - **정합성이 비즈니스적으로 치명적**이고, 애플리케이션이 여러 개(배치·어드민·외부 연동 등)라 앱 레벨 검증을 전부 신뢰하기 어려운 경우 → DB가 최후의 방어선 역할
> - 개발 초기, 데이터 모델을 문서화·강제하고 싶은 단계
>
> 즉 "FK 금지"가 아니라 **"부하·확장 요구가 명확해지면 앱 레벨로 이관을 검토"** 가 정확한 규칙. FK를 뺄 때는 그 무결성 책임을 **어디서(앱/배치/제약) 어떻게 보장할지**를 반드시 명시해야 하며, 방치하면 고아 레코드가 조용히 쌓임.

### 5.5 JSON 타입 컬럼 사용

| 문제 | 영향 |
| --- | --- |
| 쓰기 시 파싱·검증 오버헤드 | INSERT/UPDATE 시 JSON 유효성 검사 + 내부 바이너리 포맷 변환 비용 |
| 인덱스 제한 | JSON 컬럼 자체에 직접 인덱스 불가 → Generated Column·Functional Index·Multi-Valued Index 필요 |
| 스키마 유효성 검증 약함 | "유효한 JSON"만 보장, 필드 구성·타입은 미보장 (`JSON_SCHEMA_VALID` + CHECK로 보완 가능하나 비용 발생) |
| 복잡한 쿼리·JOIN 제한 | 경로 표현식 남발 시 가독성·유지보수성 저하 |
| 저장 공간 오버헤드 | 내부 **바이너리 포맷**(문자열 아님)이지만, **키 이름이 행마다 반복 저장**되는 등 정규화 컬럼 대비 공간·버퍼풀 비효율 |

> **NOTE** — JSON 컬럼을 사용하고 싶다면 **MongoDB 사용을 추천**

> **TIP** — 그래도 JSON을 꼭 써야 한다면 (완화책)
>
> - **Generated Column + 인덱스**: `col->>'$.field'` 값을 Generated Column으로 추출해 일반 인덱스를 걸면 해당 필드 조회 성능을 확보할 수 있음
> - **Multi-Valued Index** (MySQL 8.0.17+): JSON 배열 값 자체에 인덱스를 걸 수 있음 — 예: `CREATE INDEX idx_tags ON t((CAST(tags->'$[*]' AS CHAR(20) ARRAY)))`
> - 다만 두 방법 모두 JSON 구조를 유지한 채 우회하는 임시 처방에 가까움 — 필드가 안정적으로 고정되어 있다면 **정규화된 컬럼·테이블로 전환**하는 것이 근본적인 해법

---

## 6. JDBC Driver / Connector 선택

### 6.1 드라이버 비교표

> **WARNING** — 2026-08-26 KST 기준 업데이트
>
> 아래 표는 최신 조사(dev.mysql.com, GitHub, MariaDB 공식 문서 기준)로 갱신됨. 특히 "Aurora JDBC Driver"는 **완전 폐기(EOL)**, "Aurora JDBC Advanced Wrapper"는 정식 명칭이 **AWS Advanced JDBC Wrapper**로 정정.

| 특성 | MySQL Connector/J | MariaDB Connector/J | Aurora JDBC Driver (`awslabs/aws-mysql-jdbc`) | AWS Advanced JDBC Wrapper |
| --- | --- | --- | --- | --- |
| **Read/Write Split** | Yes (OS 설정 영향) | Yes (Replication mode) | No | Yes |
| **Topology Detection** | Yes (JMX/DNS SRV) | Yes | Yes | Yes |
| **Failover Detection** | External | Connection Based | Query Based | Query Based (EFM으로 수 초 단위) |
| **Master Auto Detection** | No | Yes | Yes | Yes |
| **Blue/Green Support** | Yes | Yes | No | Yes (Aurora MySQL Engine Release 3.07+) |
| **Aurora Global DB Failover/Switchover** | No | No | No | Yes (v3.0.0+, 리전 간 지원) |
| **권장 버전** | 검증 시점의 최신 GA (현재 26.7.x — 9.7 시리즈를 대체) | Aurora 목적이면 비권장 | 사용 금지 (2024-07-25 EOL 확정) | 검증 시점의 최신 안정 버전 (현재 4.4.x, 매월 말 릴리스) |
| **제약사항** | Maven groupId `com.mysql:mysql-connector-j`로 변경 (구 `mysql:mysql-connector-java`) | **3.0.3(2023-09)부터 Aurora 전용 페일오버 완전 제거** — 순수 MariaDB 서버 대상만 3.5.x(Stable) 사용 | 완전 폐기, 어떤 버전도 사용 금지 | MySQL/MariaDB/PostgreSQL Connector를 감싸는 래퍼, Aurora MySQL/PostgreSQL 전용 |

### 6.2 Failover Detection 메커니즘

**MySQL Connector/J**는 두 가지 방식을 사용하되, **Connection-based에 더 의존**:

1. **Connection-based**: 주기적으로 연결 유효성 확인 (`testConnectionOnCheckout` 등)
2. **Query-based**: 실제 쿼리 실행 시 예외를 통해 감지

### 6.3 드라이버 페일오버 감지 주의사항

> **DANGER** — 핵심 이슈 (2026-08-26 KST 기준 정정)
>
> - **MariaDB Connector/J**: 3.0.3(2023-09)부터 **Aurora 전용 페일오버 로직이 완전히 제거**됨. **2.7.11 고정 사용 권고는 더 이상 유효하지 않음** — 2.7.x는 EOL이 임박했고, Aurora 환경에서는 MariaDB Connector를 단독으로 쓰지 말고 **AWS Advanced JDBC Wrapper와 결합**해야 함.
> - **MySQL Connector/J**: 단독 사용 시 기본 설정에서 페일오버 감지에 여전히 **최대 15분 소요**되는 문제가 남아 있음 (구조적으로 변경 없음).
>     - `tcp_retries2` 커널 파라미터: 기본 15분 → **최소 5분으로 조정**
>     - JDBC `SocketTimeout` 파라미터를 낮은 값으로 설정
>     - 근본적으로 해결하려면 **AWS Advanced JDBC Wrapper의 Enhanced Failure Monitoring(EFM)** 을 도입해 수 초 단위 감지로 단축하는 것을 권장

### 6.4 드라이버 선택 권장

| 드라이버 | 권장 여부 | 비고 |
| --- | --- | --- |
| **MySQL Connector/J** | 추천 (단독 사용 시 방어 로직 필요) | 최신 버전 사용, Maven groupId `com.mysql:mysql-connector-j`로 변경됨. 페일오버 대비 `socketTimeout`을 **적절히 낮은 값**으로 명시(기본값 0 = **무한 대기**라 그대로 두면 감지 불가), `connectTimeout` 설정, `tcp_retries2` 커널 조정 |
| **MariaDB Connector/J** | Aurora 목적 단독 사용 비권장 | 3.0.3(2023-09)부터 Aurora 페일오버 지원 완전 제거. 순수 MariaDB 서버 대상이면 최신 3.5.x(Stable) 사용, 2.7.x는 EOL 임박이라 신규 도입 금지 |
| **Aurora JDBC Driver** (`awslabs/aws-mysql-jdbc`) | 사용 금지 | 2024-07-25 EOL 확정, 완전 폐기 |
| **AWS Advanced JDBC Wrapper** | 최우선 추천 | 현재 4.x(`software.amazon.jdbc:aws-advanced-jdbc-wrapper`), Aurora MySQL/PostgreSQL 전용. EFM, Read/Write Split, IAM/Secrets Manager 인증, Aurora Global DB 리전 간 failover/switchover, RDS Multi-AZ 지원. 2026-05부터 KMS 클라이언트 사이드 암호화 플러그인 추가 |

> **NOTE** — 참고
>
> [AWS 공식 블로그](https://aws.amazon.com/blogs/database/using-the-mariadb-jdbc-driver-with-amazon-aurora-with-mysql-compatibility/)도 "MariaDB Connector/J 3.0.3부터 Aurora 미지원 → AWS Advanced JDBC Wrapper 권장"으로 안내함.

---

## 7. MySQL 릴리스 정책 — Innovation vs LTS

> **INFO** — 2023-07(8.0 이후)부터 MySQL은 두 트랙으로 나뉜다
>
> 실무에서 "최신 버전 사용"을 권장할 때, 어떤 트랙의 최신 버전인지가 중요하다.

| 구분 | Innovation | LTS (Long-Term Support) |
| --- | --- | --- |
| **성격** | 신기능 우선 릴리스 (기존 8.0 연속 개발 모델과 유사) | 안정성 우선, 첫 LTS 릴리스에서만 기능 추가/제거 이후 고정 |
| **지원 기간** | 짧음 (다음 Innovation으로 빠르게 교체) | Oracle Lifetime Support 정책 — **Premier 5년 + Extended 3년** |
| **동작 변화** | 마이너 버전 간에도 동작(behavior) 변경 가능 | 동일 LTS 시리즈 내에서는 동작 변경 없음 |
| **적합 대상** | 빠른 CI/CD, 자동화 테스트가 잘 갖춰진 개발 환경 | 운영 환경, 장기 안정성이 중요한 서비스 |
| **대표 버전** | 9.0 ~ 9.6 (분기별 릴리스, 9.6이 9.7 LTS 직전 마지막 Innovation) | **8.4.x** (첫 LTS) · **9.7.x** (2026-04 릴리스, 두 번째 LTS) |
| **업그레이드 경로** | 같은 메이저 내 Innovation 간 직접 업그레이드 가능 (예: 9.0 → 9.1) | 메이저가 다른 Innovation 간 직접 업그레이드 불가 → 가까운 LTS를 거쳐야 함 (예: 8.3 → **8.4(LTS)** → 9.0). LTS→다음 LTS는 지원(예: **8.4.x → 9.7.x**), LTS 시리즈 건너뛰기는 불가 |

> **DANGER** — 흔한 혼동: "9.7 = Innovation 최신"은 오해
>
> MySQL **9.7.x는 8.4에 이은 두 번째 LTS**(2026-04)임. 공식 매뉴얼도 "8.4.x LTS → 9.7.x LTS" 업그레이드 경로를 명시함. 9.0~9.6이 Innovation 트랙이고, **9.7부터 다시 LTS로 고정**되는 구조(8.1~8.3 Innovation → 8.4 LTS 패턴의 반복). 따라서 "최신 9.x = Innovation"이라고 뭉뚱그리면 안 되고, **9.7 이상은 LTS로 취급**해야 함.
>
> 헷갈리기 쉬운 지점: **Connector/J 9.7.0**과 **서버 9.7.x**는 버전 숫자만 같을 뿐 성격이 다름. 커넥터는 Innovation/LTS 구분 없는 **단일 트랙**이라 서버 최신 번호를 따라갈 뿐, 지원되는 모든 서버(8.0/8.4/9.x)와 호환됨.

> **WARNING** — 실무 적용 시 주의
>
> - 운영 DB는 **LTS 트랙**을 기본으로 고려한다. 현재 선택지는 **8.4.x(성숙한 첫 LTS)** 와 **9.7.x(2026-04 두 번째 LTS)** 이며, 신기능이 꼭 필요한 경우에만 Innovation(9.0~9.6)을 검토한다. 신규 구축이면 지원 기간이 더 긴 9.7.x LTS 채택도 유력하지만, 검증된 안정성이 최우선이면 8.4.x를 유지하는 선택도 합리적이다.
> - AWS RDS/Aurora for MySQL은 자체 지원 버전 로드맵을 따로 갖고 있으므로, MySQL 커뮤니티 버전의 Innovation/LTS 트랙과 AWS의 지원 버전이 반드시 일치하지는 않는다 — 실제 마이그레이션 전에는 AWS RDS 지원 버전 목록을 별도로 확인해야 한다.
> - MySQL Connector(JDBC 포함)는 Innovation/LTS 구분 없이 **단일 버전 트랙**으로 릴리스되며, 지원되는 모든 MySQL Server 버전(8.0, 8.4, 9.x)과 호환된다.

출처: [MySQL 8.4 Reference Manual — 1.3 MySQL Releases: Innovation and LTS](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html), [MySQL 공식 블로그 — Introducing MySQL Innovation and LTS versions](https://dev.mysql.com/blog-archive/introducing-mysql-innovation-and-long-term-support-lts-versions/)
