---
title: "MySQL for Developers"
permalink: /docs/database/mysql-for-developers/
breadcrumb: "Docs / Database"
description: "MySQL 개발에서 지킬 핵심 원칙과 안티패턴 — 정규화·데이터 타입·콜레이션·인덱스·트랜잭션과 락·드라이버 선택·릴리스 정책"
updated: 2026-09-20
redirect_from:
  - /writing/mysql-for-developers/
  - /writing/mysql-guide-for-developers/
---

> **SUMMARY** — 요약
>
> MySQL 개발 시 알아야 할 핵심 원칙과 안티패턴을 정리한 가이드.
> **정규화 → 데이터 타입 → 문자셋·콜레이션 → 인덱스 → 트랜잭션·락 → 안티패턴 → Stored Program → JDBC → 릴리스 정책** 순으로 구성.
> 버전·드라이버 관련 내용은 **2026-09-19 KST 기준**이다. 실제 적용 전에는 각 벤더의 공식 릴리스 노트와 대상 엔진에서 다시 확인한다.

> **INFO** — 적용 범위
>
> - 기본 대상: **MySQL 8.4 LTS 이상, InnoDB**
> - Aurora MySQL 전용 내용은 별도로 표시
> - 시스템 변수의 기본값은 배포판·벤더·설정 파일에 따라 달라지므로, 문서의 숫자를 믿지 말고 대상 서버에서 실측한다 (`SELECT @@GLOBAL.변수명;`)
> - 버전 의존 기능은 운영 적용 전에 공식 문서와 대상 엔진에서 재검증

---

## 1. 데이터 정규화 필수

> **TIP** — 핵심 원칙
>
> 관계형 데이터베이스의 본질은 **"쪼개고 저장하고 합쳐서 출력한다"**

- MySQL은 RDBMS — 정규화가 **성능·정합성·무결성**을 지키는 기본 전략
- 하나의 Row를 읽는데 블록이 많으면 당연히 I/O가 늘어남
- **JSON, HTML 데이터를 하나의 컬럼에 밀어 넣는 구조는 안티패턴** (6.5 JSON 안티패턴 참고)

> **TIP** — 정규화 단계 요약 (1NF ~ 3NF)
>
> 실무에서는 3NF까지만 지켜도 대부분의 이상 현상(anomaly)을 막을 수 있음

| 단계 | 규칙 | 위반 시 생기는 문제 |
| --- | --- | --- |
| **1NF** | 각 컬럼은 원자값(atomic value)만 가짐 | 컬럼에 값을 쉼표로 여러 개 저장 → 검색·집계·인덱싱 불가 |
| **2NF** | 1NF + 복합 PK의 일부에만 종속되는 컬럼 분리 | 같은 정보가 여러 행에 중복 → 수정 시 일부만 고쳐 불일치(Update Anomaly) |
| **3NF** | 2NF + PK가 아닌 컬럼에 종속되는 컬럼(**이행 종속**, transitive dependency) 분리 | 행을 지우면 관련 없는 정보까지 같이 사라짐(Delete Anomaly) 등 이상 현상 |

1NF~3NF 규칙과 이상 현상 분류는 관계 이론의 일반론이고, MySQL 매뉴얼이 규범으로 정해 둔 것은 아니다. 이 문서는 그 일반론을 MySQL 스키마 설계의 판단 기준으로 쓴다. 반대로 정규화를 끝낸 뒤 집계 쿼리에서 실제로 부딪히는 규범은 공식 기본값 쪽에 있다 — MySQL 8.4의 기본 `sql_mode`에는 `ONLY_FULL_GROUP_BY`가 들어 있어서, `GROUP BY`에 없고 함수적으로 종속되지도 않은 컬럼을 select 리스트에 올리면 쿼리가 거부된다. 정규화된 테이블을 합쳐 보여 주는 집계 쿼리는 처음부터 이 모드를 전제로 작성한다.

> **WARNING** — 반정규화(Denormalization)는 언제 정당한가
>
> 정규화가 기본값이지만, 조회가 압도적으로 많고 JOIN 비용이 명확한 병목으로 확인된 경우에는 예외적으로 반정규화를 검토할 수 있음.
>
> - 예: `orders.total_price`처럼 계산 결과를 미리 컬럼에 저장해두는 캐시성 반정규화
> - 조건: 반정규화한 값과 원본 데이터의 **동기화 책임을 명시적으로 정의**해야 함 (Trigger는 7장에서 비권장 → 애플리케이션 레벨 동기화나 배치로 처리). 동기화 책임을 정하지 않으면 정합성이 조용히 깨짐
> - 트리거로 동기화하려는 계획에는 공식 제약이 하나 더 걸린다 — **외래 키 액션은 트리거를 발동시키지 않는다.** `ON DELETE CASCADE`로 지워진 자식 행에 대해서는 동기화 트리거가 돌지 않는다 (7.3 참고)

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
- 타입 범위는 실제 값과 예상 성장량을 기준으로 정하되, 단기간에 상한에 도달하지 않도록 합리적인 여유를 둔다. `INT → BIGINT` 같은 정수 타입 변경은 대용량 테이블에서 테이블 복사·재구축과 긴 작업 시간을 부를 수 있으므로, 운영 중 확장이 가볍다고 가정하면 안 된다. 대상 버전의 온라인 DDL 지원 범위를 확인하고, 같은 크기의 스테이징 테이블에서 실제 소요 시간을 측정한 뒤 적용한다
- 금액에 `DECIMAL` 대신 정수(예: 원 단위)를 쓰라는 권고는 공식 문서의 규범이 아니라 실무에서 굳어진 기준이다. 통화 단위·환율·부분 정산처럼 소수점이 업무적으로 필요한 경우에는 `DECIMAL`을 쓰고, 정밀도와 스케일을 스키마에 명시한다

### 2.2 문자열 타입 비교

| 특성 | `CHAR` | `VARCHAR` | `TEXT` 계열 |
| --- | --- | --- | --- |
| **길이** | 고정 (0~255**자**) | 가변 — `VARCHAR(n)`의 `n`은 **문자 수** (선언 가능한 최대 `n`은 행 크기 65,535B에 종속) | 가변 (`TINYTEXT` 255B · `TEXT` ~64KB · `MEDIUMTEXT` ~16MB · `LONGTEXT` ~4GB) |
| **저장 방식** | 정의 길이에 맞춰 오른쪽을 공백으로 패딩 — 단 InnoDB의 compact 계열 행 포맷은 가변길이 문자셋의 `CHAR` 저장을 최적화한다 | 길이 접두(1~2B) + 실제 데이터 | InnoDB에서 값이 크면 off-page(별도 오버플로 페이지)에 저장하고 행에는 포인터만 |
| **장점** | 길이가 일정한 코드·해시·체크섬 같은 짧은 고정폭 값에 유리 | 공간 효율적, 다양한 길이 처리 | 매우 큰 문자열 저장 가능 |
| **단점** | 짧은 문자열에 공간 낭비, 후행 공백 비교 결과가 콜레이션에 좌우됨(3.3 참고) | — | 인덱스에 프리픽스 지정이 필수(`col(100)`), 정렬·`GROUP BY` 시 임시 테이블 비용 |

> **WARNING** — `VARCHAR(n)`의 `n`은 문자 수, 단 그 `n`의 상한이 바이트로 제약됨
>
> - **정의 단위는 문자 수**: `VARCHAR(n)`은 캐릭터셋과 무관하게 `n`자를 저장한다. `VARCHAR(500)`은 `utf8mb4`에서도 그대로 **500자** 저장(125자로 줄지 않음).
> - **`n`을 얼마나 크게 잡을 수 있는가는 바이트로 제약**: 컬럼(정확히는 행 전체) 최대 크기가 **65,535바이트**이고 이 한도를 모든 컬럼이 나눠 쓰므로, 멀티바이트 캐릭터셋에서는 정의 가능한 최대 `n`이 줄어듦 — `utf8mb4`(문자당 최대 4B)면 단일 `VARCHAR` 컬럼의 실질 상한이 **16,383자**. 즉 "저장은 문자 수로, 정의 최댓값만 바이트 한도에 걸린다"고 이해하면 정확함.
> - `VARCHAR`의 길이 접두 크기는 **개별 값의 실제 길이가 아니라 컬럼이 저장할 수 있는 최대 바이트 길이**로 결정됨. 최대 255B 이하면 1B, 255B를 초과할 수 있으면 2B를 사용함.
> - `CHAR(n)`의 `n`도 문자 수 기준이며, 내부 저장 바이트는 캐릭터셋에 따라 달라짐(`utf8mb4`면 최대 `n`×4B).
> - `BLOB`·`TEXT` 컬럼은 이 65,535바이트 계산에 값 전체가 아니라 **9~12바이트만** 기여한다. 본문을 `TEXT`로 빼면 행 크기 한도에 여유가 생기는 이유다.

> **WARNING** — `CHAR`가 항상 "고정폭 한 덩어리"는 아니다
>
> - InnoDB의 compact 계열 행 포맷은 가변길이 문자셋에 대해 `CHAR` 저장을 최적화한다. 즉 `CHAR`를 썼다는 사실만으로 "행 안에서 늘 같은 바이트를 차지한다"고 단정할 수 없다.
> - `CHAR(255)`에 `utf8mb4`를 쓰면 최대 길이가 768바이트를 넘는다. InnoDB는 768바이트 이상이 될 수 있는 고정길이 필드를 가변길이로 인코딩해 **off-page**에 둘 수 있으므로, 이 조합은 "짧은 고정폭 값"이라는 `CHAR`의 전제에서 이미 벗어나 있다.
> - 인덱스 프리픽스 상한도 행 포맷에 따라 다르다 — InnoDB `DYNAMIC`·`COMPRESSED`는 **3072바이트**, `REDUNDANT`·`COMPACT`는 **767바이트**다.

> **INFO** — 정렬·임시 테이블 비용의 실제 조건
>
> "`TEXT`를 정렬하면 디스크 임시 테이블이 생긴다"는 서술은 단정하기 어렵다. 8.4는 메모리 내부 임시 테이블에 **TempTable 엔진**을 기본으로 쓰고, 메모리 한도를 넘어 디스크로 넘어갈 때 **InnoDB**를 쓴다. `tmp_table_size` 기본값은 **16MiB**이며, `max_heap_table_size`(16MiB)는 `MEMORY` 엔진을 쓸 때만 관여한다.
>
> 공식 문서가 "메모리 임시 테이블을 쓸 수 없다"고 못 박는 조건은 좁다 — **`UNION`·`UNION ALL`을 쓰면서 select 리스트에 최대 길이 512를 넘는 문자열 컬럼이 있는 경우**, 그리고 `SHOW COLUMNS`·`DESCRIBE`다. 따라서 추측하지 말고 세션에서 실측한다 — `Created_tmp_tables`와 `Created_tmp_disk_tables`를 쿼리 전후로 비교하면 된다. 단 메모리맵 파일로 만들어진 임시 테이블은 `Created_tmp_disk_tables`에 집계되지 않는다.

### 2.3 날짜와 시간 — DATETIME vs TIMESTAMP

| 특성 | DATETIME | TIMESTAMP |
| --- | --- | --- |
| **저장 형식** | packed binary (문자열이 아님) — 입력 값을 시간대 변환 없이 그대로 보관 | UTC epoch 기반 정수 — 저장 시 세션 시간대→UTC, 조회 시 UTC→세션 시간대로 자동 변환 |
| **범위** | 1000-01-01 ~ 9999-12-31 | 1970-01-01 00:00:01 UTC ~ 2038-01-19 03:14:07 UTC |
| **시간대** | 시간대 무관(저장한 그대로) | 세션(`time_zone`)에 따라 변환됨 |
| **저장 공간** | **5바이트** (MySQL 5.6.4+, 소수 초 정밀도에 따라 +0~3B) | **4바이트** (소수 초 정밀도에 따라 +0~3B) |
| **사용 시점** | 넓은 범위·시간대 변환이 필요 없는 값(예약 시각, 생년월일시) | **글로벌 서비스**, `created_at`/`updated_at`처럼 UTC 절대시각 + 자동 갱신이 필요할 때 |

> **WARNING** — 흔히 잘못 알려진 두 가지
>
> - **DATETIME은 "문자열로 저장"되지 않는다.** MySQL 5.6.4부터 DATETIME은 비소수부에 **5바이트**를 쓰는 packed binary로 저장됨(그 이전 버전은 8바이트). 즉 "DATETIME=8B, 문자 저장"이라는 설명은 옛 버전 기준의 오해.
> - **소수 초(fractional seconds)** 저장 크기는 **0~3바이트**다. 정밀도를 지정하지 않으면(정밀도 0) 추가 바이트가 없고, 1~2자리에 1B, 3~4자리에 2B, 5~6자리에 3B가 붙는다. `DATETIME(6)`은 5+3=8바이트, `TIMESTAMP(3)`은 4+2=6바이트다.
> - 소수 초를 쓰면 범위 상한도 같이 움직인다 — DATETIME은 `9999-12-31 23:59:59.499999`, TIMESTAMP는 `2038-01-19 03:14:07.499999`까지다.

> **DANGER** — 2038년 문제 (Y2038)
>
> `TIMESTAMP`의 상한은 **2038-01-19 03:14:07 UTC**. 만료일·미래 예약 시각처럼 2038년을 넘길 수 있는 값에 `TIMESTAMP`를 쓰면 오버플로가 발생하므로, 이런 컬럼은 `DATETIME`(또는 애플리케이션에서 UTC를 명시적으로 다루는 설계)을 사용해야 함. 같은 상한이 Event Scheduler에도 걸려 있다 — 공식 문서는 이벤트가 Unix Epoch 이후(대략 2038년 이후)의 시각을 지원하지 않는다고 명시한다(7.3 참고).

> **TIP** — 실무 권장 패턴
>
> - "UTC 절대시각"을 앱에서 일관되게 다룰 수 있다면, 시간대 변환 부작용을 피하기 위해 **DATETIME + 항상 UTC 저장** 조합을 선호하는 팀도 많음. 반대로 서버의 자동 UTC 변환에 기대고 싶으면 TIMESTAMP. 어느 쪽이 낫다는 판단은 공식 문서의 규범이 아니라 팀의 운영 방식에 달려 있다.
> - 자동 초기화·자동 갱신은 타입과 무관하게 `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP`로 DATETIME·TIMESTAMP 양쪽에 걸 수 있다.
> - 이미 저장된 TIMESTAMP를 UTC 기준 DATETIME으로 꺼내야 하면 `CAST(col AT TIME ZONE INTERVAL '+00:00' AS DATETIME)`을 쓴다.

> **DANGER** — 명명 시간대는 시간대 테이블이 적재돼 있어야 동작한다
>
> `time_zone = 'Asia/Seoul'`처럼 이름으로 시간대를 지정하려면 `mysql.time_zone*` 테이블이 채워져 있어야 한다(이름형 `'UTC'`도 포함된다). MySQL 설치는 이 테이블을 만들기만 하고 값을 채우지 않으므로, 적재 없이 쓰면 `ERROR 1298 (HY000): Unknown or incorrect time zone`이 난다. 오프셋 표기(`'+09:00'`)는 테이블 없이 동작한다.
>
> `time_zone = 'SYSTEM'`은 시간대 계산 함수를 호출할 때마다 시스템 라이브러리를 거치며 전역 뮤텍스 경합을 만들 수 있다. 시간대 변환이 많은 워크로드라면 세션·서버 `time_zone`을 명시적 값으로 고정한다.

### 2.4 함수를 이용한 데이터 저장

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
- `UNSIGNED`는 선택이 아니다. 공식 문서는 signed 컬럼을 쓰면 **첫 옥텟이 127보다 큰 IP 주소**가 올바르게 저장되지 않는다고 명시한다
- `INET_ATON()`은 잘못된 입력에 `NULL`을 반환할 수 있으므로 함수만으로 무결성이 보장되지는 않음. `NOT NULL`, Strict SQL mode, 애플리케이션 입력 검증을 함께 적용

> **WARNING** — `INET_ATON`은 IPv4 전용, 그리고 단축 표기에 관대하다
>
> - `INET_ATON`/`INET_NTOA`는 **IPv4만** 처리함(IPv6 문자열을 넣으면 `NULL` 반환). IPv6까지 저장해야 한다면 **`INET6_ATON`/`INET6_NTOA` + `VARBINARY(16)`** 조합을 사용해야 함. `INET6_ATON`은 IPv4·IPv6를 모두 받아 각각 4B/16B 바이너리로 반환하므로, 듀얼스택 환경이면 처음부터 `VARBINARY(16)`으로 통일해 두는 편이 안전함.
> - 공식 문서는 `INET_ATON()`에 `'127.1'` 같은 **단축 표기를 쓰지 말라**고 경고한다 — 시스템에 따라 non-NULL 값을 돌려줄 수 있다. 입력 검증에는 `INET_ATON()`보다 엄격한 `IS_IPV4()`를 쓰고, `INET6_ATON()`의 IPv4 판정은 `IS_IPV4()`와 같은 수준으로 엄격하다.
> - `INET6_ATON()`은 zone ID(`fe80::3%eth0`), 네트마스크(`/64`), 포트(`:8080`), 16진·8진 옥텟 표기를 거부한다. 저장 전에 입력을 정규화해야 하는 이유다.
> - `INET6_NTOA()`의 반환값은 최대 39자 소문자이며 타입은 `VARCHAR(39) CHARACTER SET utf8mb3`다. 이 값을 다시 컬럼에 담을 때 문자셋을 맞추지 않으면 3장의 콜레이션 충돌로 이어진다.

```sql
-- IPv4/IPv6 겸용 저장
INSERT INTO ip_log (ip) VALUES (INET6_ATON('2001:db8::1'));
SELECT INET6_NTOA(ip) FROM ip_log;   -- 다시 문자열로 복원
```

#### `UUID_TO_BIN` / `BIN_TO_UUID` — UUID를 바이너리로 저장

- **저장 공간 절약**: 문자열(36B) → 바이너리(16B). `UUID_TO_BIN()`의 반환형은 `VARBINARY(16)`이며, 보통 `BINARY(16)` 컬럼에 저장한다
- **성능 향상**: 짧은 바이너리 비교가 36자 문자열 비교보다 유리하고, PK로 쓸 경우 모든 세컨더리 인덱스가 그 길이를 함께 짊어진다(6.2 참고)
- **단점**: JOIN 키로 사용 시 직관적이지 않음, 함수 없이는 알아보기 어려움

> **TIP** — Swap Flag의 실제 동작
>
> `UUID_TO_BIN(uuid, 1)`은 UUID v1 값의 **time-low 와 time-high 부분을 swap**해서 **더 빠르게 변하는 부분을 오른쪽으로** 옮긴다. 공식 문서의 표현대로, 결과를 인덱스 컬럼에 저장하면 **indexing efficiency 를 개선할 수 있다.** 왜 이득인지는 6.2의 페이지 충전율 설명과 이어진다 — 값이 대체로 증가하는 순서로 들어오면 인덱스 페이지가 더 촘촘히 찬다.
>
> 두 가지를 반드시 지킨다.
>
> - **플래그를 짝 맞춘다.** `UUID_TO_BIN(uuid, 1)`로 저장했으면 `BIN_TO_UUID(val, 1)`로 되돌려야 원래 UUID가 복원된다. 한쪽만 1이면 조용히 다른 값이 나온다.
> - **v1이 아니면 의미가 없다.** 공식 문서는 v1 형식을 따르지 않는 값에 대해서는 time-part swapping이 **아무 이득을 주지 않는다**고 명시한다.

```sql
-- 저장과 복원은 같은 swap flag 로 짝을 맞춘다
SELECT UUID_TO_BIN(UUID(), 1);        -- time-ordered binary, VARBINARY(16)
SELECT BIN_TO_UUID(id_bin, 1) FROM t; -- 원본 UUID 복원
```

> **WARNING** — `UUID()` 자체의 제약
>
> - `UUID()`는 **UUID v1**을 생성한다. 공식 문서는 이 값이 unique 하지만 **unguessable·unpredictable 하지는 않다**고 경고하므로, 추측 불가능성이 필요한 토큰에 쓰면 안 된다.
> - `UUID()`는 `binlog_format=STATEMENT`에서 복제에 안전하지 않다. 8.4의 기본값은 `ROW`지만, 복제 설정을 바꿀 때 함께 확인해야 한다.

> **INFO** — UUID v7 검토
>
> MySQL의 `UUID()` 함수는 v1만 생성하며 v7 생성 함수는 제공하지 않는다. 시간순 정렬 + 전역 유일성이 필요하면 **애플리케이션 레벨에서 UUID v7을 생성**해 `BINARY(16)`으로 저장하는 방식이 실무에서 권장된다. 이 권고는 MySQL 공식 문서의 규범이 아니라 애플리케이션 쪽 관행이며, 근거는 6.2에서 다루는 삽입 순서와 페이지 충전율이다.

---

## 3. 문자셋과 콜레이션

문자셋은 "어떤 문자를 저장할 수 있는가"를 정하고, 콜레이션은 "그 문자들을 어떤 순서로 정렬하고 무엇을 같다고 볼 것인가"를 정한다. 개발자에게 중요한 것은 두 번째다. 콜레이션은 `WHERE`의 일치 판정, `ORDER BY`의 순서, 유니크 제약의 중복 판정, 조인의 성립 여부를 모두 바꾼다.

### 3.1 콜레이션이 비교와 정렬을 정한다

공식 문서의 서술은 짧고 명확하다.

> "Values in `CHAR`, `VARCHAR`, and `TEXT` columns are **sorted and compared according to the character set collation assigned to the column**."

즉 정렬과 비교의 기준은 컬럼에 붙은 콜레이션이다. 인덱스는 이 순서대로 만들어진 자료구조이므로, **콜레이션을 바꾸는 것은 인덱스의 정렬 순서 자체를 바꾸는 것**이다. 같은 `VARCHAR(20)` 컬럼이라도 `utf8mb4_0900_ai_ci`와 `utf8mb4_bin`은 서로 다른 순서의 인덱스를 만들고, 서로 다른 값 집합을 "중복"으로 판정한다.

- 새로 만드는 테이블은 `utf8mb4`를 쓴다. `utf8mb3`와 그 별칭 `utf8`은 deprecated 상태이며, 공식 문서는 `utf8mb3`가 8.0.x·8.4.x LTS 시리즈의 수명 동안은 지원되지만 **미래의 메이저 릴리스에서 제거될 것으로 예상하라**고 적는다
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

## 4. 인덱스

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
- `end_date >= @target_date`는 여전히 탐색 범위를 좁히지 못하고 필터로 동작하지만, 인덱스에 포함돼 있으므로 테이블 접근 전에 걸러짐
- 데이터가 계속 쌓여도 스캔량이 "최근 N일치"로 고정됨 (Before는 테이블이 커질수록 스캔량이 무한히 증가)

> **DANGER** — 주의사항
>
> - `N`은 **실제로 보장되는 최대 유효기간**이어야 함. 이보다 긴 기간의 행이 하나라도 존재하면 결과에서 조용히 빠지는 데이터 정합성 버그가 생김 → `CHECK (DATEDIFF(end_date, start_date) <= 90)` 같은 제약이나 애플리케이션 검증으로 N을 강제해야 함
> - `N`이 너무 크면 최적화 효과가 줄고, 너무 작으면 유효한 행을 놓침 — 실제 데이터 분포로 N을 검증할 것
> - 이 패턴이 맞지 않는 경우(최대 기간을 보장할 수 없는 경우)는 Interval Tree류 구조, 별도 검색엔진(Elasticsearch) 이관, 또는 두 개의 Range를 `UNION`으로 나눠 처리하는 방식을 검토한다. 이 대안들은 공식 문서의 권고가 아니라 실무에서 쓰는 선택지다

### 4.5 복합 인덱스 컬럼 순서 정하는 방법

> **TIP** — 기본 후보: "등치 → 정렬/그룹 → 범위" 순서 (절대 규칙 아님)
>
> 복합 인덱스는 **선두 컬럼이 정렬 기준**이 되고, 뒤에 오는 컬럼일수록 앞 컬럼 값이 좁혀진 뒤에만 효과가 있음. 아래 우선순위로 컬럼을 배치한다.

공식 근거는 leftmost prefix 규칙이다. `(col1, col2, col3)` 인덱스는 `(col1)`·`(col1, col2)`·`(col1, col2, col3)`에 대한 탐색 능력을 주고, 컬럼들이 leftmost prefix를 구성하지 못하면 MySQL은 그 인덱스로 조회할 수 없다.

1. **등치 조건 컬럼을 최우선으로** (비교 연산자 `=`)
    - `=` 조건은 인덱스에서 정확히 한 지점(또는 몇 개 지점)만 찾으므로 탐색 범위를 가장 크게 좁힘. 4.4에서 인용한 인터벌 구성 규칙이 그대로 근거가 된다
    - 등치 조건 컬럼이 **여러 개**라면 그들 사이의 앞뒤 순서는 탐색 범위 좁히기 자체에는 영향이 없음 — 다만 다른 쿼리에서도 자주 재사용되는(leftmost prefix로 활용될) 컬럼을 더 앞쪽에 두면 하나의 인덱스로 여러 쿼리 패턴을 커버할 수 있음
    - NULL을 허용하는 컬럼을 등치 조건으로 쓸 때 주의: `col = NULL`은 항상 거짓이라 인덱스 탐색에 걸리지 않고 `col IS NULL`은 별도로 취급됨. NULL 비중이 크면 4.6의 "NULL 비중이 높은 컬럼" 항목도 함께 고려할 것
2. **정렬·그룹 대상 컬럼을 그다음에** (`ORDER BY` / `GROUP BY`)
    - 등치 조건으로 좁혀진 상태에서 이미 정렬돼 있으면 **filesort 생략** 가능
    - **정렬 방향까지 인덱스와 일치**해야 함: `ORDER BY a ASC, b DESC`처럼 컬럼별 방향이 다르면 **Descending Index**(`CREATE INDEX ... (a ASC, b DESC)`)로 인덱스 자체에 방향을 맞춰야 filesort가 생략됨. 공식 문서의 표현대로, descending index는 **일부 컬럼은 오름차순, 일부는 내림차순이 섞인** 스캔 순서가 가장 효율적일 때 옵티마이저가 복합 인덱스를 쓸 수 있게 해 준다. 단 `ASC`·`DESC` 지정은 HASH·multi-valued·SPATIAL 인덱스에는 쓸 수 없다
    - 등치 컬럼과 정렬 컬럼 "사이"에 새로운 등치 조건이 끼어들면 인덱스도 그 컬럼을 포함해 순서를 다시 맞춰야 함 — 예: `WHERE status='ACTIVE' ORDER BY user_id`용 인덱스 `(status, user_id)`에 조건이 늘어 `WHERE status='ACTIVE' AND grade='VIP' ORDER BY user_id`가 되면 인덱스도 `(status, grade, user_id)`로 갱신해야 정렬 최적화가 유지됨
    - **`GROUP BY`의 정렬에 기대지 않는다.** MySQL 8.0.13에서 `GROUP BY` 절의 `ASC`·`DESC` 한정자가 제거됐고, 릴리스 노트는 이전에 `GROUP BY` 정렬에 의존했던 쿼리가 **다른 결과를 낼 수 있다**고 경고하며 원하는 순서가 있으면 `ORDER BY`를 쓰라고 명시한다. 정렬이 필요하면 `ORDER BY`를 적는다
    - 정렬 컬럼이 인덱스에 있어도 `LIMIT`의 오프셋이 커지면 여전히 느려지는 것은 별개 문제 — 오프셋 대신 커서 기반 페이지네이션으로 전환 검토 (4.7 참고)
3. **범위 조건 컬럼은 반드시 맨 뒤** (`<`, `>`, `BETWEEN`, `LIKE 'foo%'` 등)
    - 범위 조건이 걸린 컬럼 다음에 오는 컬럼은 인덱스 탐색에 활용되지 못하고 필터로만 동작함 (4.4의 start_date/end_date 사례와 동일 원리)
4. **카디널리티(선택도)가 높은 컬럼을 우선 배치**
    - 단, 위 1~3번 규칙(쿼리 패턴)이 카디널리티보다 우선. 쿼리에서 반드시 등치로 쓰이는 컬럼이면 카디널리티가 낮아도 선두에 두는 게 유리한 경우가 많음. 이 4번 항목은 공식 문서의 규범이 아니라 실무에서 굳어진 기준이다

```sql
-- 예: WHERE status = 'ACTIVE' AND created_at BETWEEN ... ORDER BY user_id
-- status(등치) → user_id(정렬) → created_at(범위) 순으로 생성
CREATE INDEX idx_status_user_created ON orders (status, user_id, created_at);
```

> **WARNING** — 흔한 실수
>
> Range 조건 컬럼을 앞에 두고 그 뒤에 다른 컬럼을 이어 붙이는 경우(`(created_at, status)`처럼) — `created_at`으로 이미 넓게 스캔한 뒤 `status`는 각 행마다 개별 필터링만 하게 되어 복합 인덱스를 만든 효과가 거의 없음

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
| **카디널리티가 낮은 컬럼 단독 인덱스** | 성별, boolean, 상태값 3~4종 등 — 조건을 걸어도 행이 거의 안 줄어 Optimizer가 Full Scan을 선택하기도 함 |
| **테이블 크기가 작음** | 옵티마이저가 인덱스 탐색보다 Full Scan(순차 I/O)이 더 빠르다고 판단 |
| **컬럼 값에 함수·연산을 적용한 조건** | `WHERE YEAR(created_at) = 2026` 처럼 컬럼을 가공하면 인덱스 무효화 (생성 컬럼·함수 인덱스로 우회 가능, 4.3 참고) |
| **선두 와일드카드 `LIKE '%단어'`** | 접두어 기반 탐색이 불가능해 Full Scan 강제 (4.2 참고) |
| **쓰기(INSERT/UPDATE/DELETE)가 매우 빈번한 컬럼** | 인덱스가 많을수록 각 DML마다 인덱스 갱신 비용 누적 (4.1 참고) |
| **NULL 비중이 매우 높은 컬럼** | NULL은 대부분 한 그룹으로 몰려 선택도가 떨어짐 |
| **값의 분포가 극단적으로 왜곡된(skewed) 컬럼** | 특정 값이 전체의 대부분을 차지하면 그 값 조회 시 Optimizer가 인덱스 대신 Full Scan을 선택 |
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
> `WHERE col IN (서브쿼리)` 또는 `WHERE col IN (수백~수천 개의 값)`은 겉보기엔 인덱스를 잘 탈 것 같지만, 조건에 따라 Optimizer가 **인덱스를 포기하고 Full Scan을 선택**하는 경우가 있음.

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

- Optimizer는 `IN` 리스트의 각 값에 대해 **index dive**(각 범위의 양 끝을 실제로 들여다봐 행 수를 추정)를 수행해 실행계획을 정한다. 공식 문서의 설명은 트레이드오프를 그대로 말한다 — "Index dives provide accurate row estimates, but as the number of comparison values in the expression increases, the optimizer takes longer to generate a row estimate. Use of index statistics is less accurate than index dives but permits faster row estimation for large value lists."
- 비교 대상 컬럼에 **유니크 인덱스가 있으면 각 범위의 행 추정치는 1**이므로 dive 자체를 하지 않는다. 즉 이 문제는 논유니크 인덱스에서 생긴다
- 리스트 길이가 `eq_range_index_dive_limit`를 넘으면 MySQL은 **값마다 dive 하지 않고** 인덱스 통계(대략치)로 행 수를 추정한다 → 추정이 흐트러져 "인덱스보다 Full Scan이 싸다"는 잘못된 판단이 나올 확률이 올라간다. 이 변수는 N개까지 dive를 허용하려면 **N+1**로 설정하고, 0이면 항상 dive한다. 현재 값은 서버에서 확인한다 — `SELECT @@eq_range_index_dive_limit;`
- 통계 자체가 낡으면 추정이 더 나빠지므로 `ANALYZE TABLE`로 인덱스 통계를 갱신한다
- 값 개수가 매우 많으면(수천~수만) SQL 문 자체의 파싱·최적화 비용도 커지고, 매치되는 행이 테이블의 상당 비율을 차지하면 실제로도 Full Scan이 더 빠를 수 있다
- **컬럼과 값의 타입이 다를 때는 방향이 중요하다.** 공식 근거가 있는 쪽은 **문자열 컬럼에 숫자를 비교하는 경우**다 — "For comparisons of a string column with a number, MySQL cannot use an index on the column to look up the value quickly." `'1'`·`' 1'`·`'1a'`가 모두 1로 변환될 수 있기 때문이다. 반대로 숫자 컬럼에 문자열 상수를 비교하면 상수 쪽이 변환되므로 인덱스는 살아 있다

> **DANGER** — `VARCHAR` 컬럼에 `= 0`을 쓰면 전 행이 매치될 수 있다
>
> 문자열 컬럼을 숫자와 비교하면 문자열이 숫자로 변환된다. 숫자로 시작하지 않는 문자열은 0으로 변환되므로, `WHERE str_col = 0`은 **strict mode에서도** 사실상 모든 행에 매치될 수 있다. 인덱스를 못 타는 것보다 결과가 틀리는 쪽이 더 위험하다. 바인딩 파라미터의 타입을 컬럼 타입에 맞추고, ORM이 숫자를 문자열 컬럼에 보내지 않는지 확인한다.

```sql
-- 주의: 리스트가 수천 개 이상이면 index dive 추정이 흐트러져 Full Scan 위험 증가
SELECT * FROM products WHERE id IN (1, 2, 3, /* ... 수천 개 ... */);
```

> **TIP** — 대안
>
> - 대량 값 매칭은 **임시 테이블에 값을 넣고 JOIN**하는 방식이 IN 리스트보다 Optimizer 입장에서 계획을 세우기 쉽다. 이 대안은 공식 권고가 아니라 실무 패턴이다
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
> - `FOR CONNECTION`과 함께 쓸 수 없다. 이미 돌고 있는 다른 커넥션의 쿼리를 `EXPLAIN ANALYZE`로 들여다볼 수는 없다
> - 지원 문장은 `SELECT`, **다중 테이블 `UPDATE`·`DELETE`**, `TABLE`이다
> - 해시 조인이 쓰였는지는 `TREE` 포맷에서만 보인다. 조인 전략을 확인하려면 `TREE`로 읽어야 한다

---

## 5. 트랜잭션과 락

인덱스 설계가 조회 성능을 정한다면, 트랜잭션 경계와 락 범위는 **동시성**을 정한다. 그리고 이 둘은 분리되지 않는다 — InnoDB가 무엇을 잠그는지는 쿼리가 어떤 인덱스를 어떻게 탔는지로 결정되기 때문이다. 4장에서 만든 인덱스가 5장의 락 범위를 좁히는 장치이기도 하다.

### 5.1 격리 수준

InnoDB의 기본 격리 수준은 **`REPEATABLE READ`** 다.

| 항목 | `REPEATABLE READ` (기본) | `READ COMMITTED` |
| --- | --- | --- |
| **일관된 읽기** | 첫 일관된 읽기가 잡은 스냅샷을 트랜잭션이 끝날 때까지 사용 | 각 일관된 읽기가 **자기 스냅샷을 새로 잡는다** |
| **갭 락** | 사용한다 | 사용하지 않는다 — 외래 키 제약 검사와 중복 키 검사에만 쓰인다 |
| **부작용** | 같은 쿼리가 트랜잭션 안에서 같은 결과 | **팬텀 행 문제**가 생길 수 있다 |
| **복제** | 제한 없음 | **행 기반 로깅만 지원** |

`READ COMMITTED`를 쓸 때 반드시 함께 알아야 할 것이 복제 제약이다. 이 격리 수준은 행 기반 로깅만 지원하므로 `binlog_format`이 `MIXED`여도 해당 트랜잭션은 ROW로 기록된다. 8.4의 기본값이 이미 `ROW`이므로 새로 구축하는 환경에서는 문제가 되지 않지만, 문장 기반 로깅이 남아 있는 환경에서 격리 수준만 낮추면 복제가 막힌다.

> **WARNING** — "격리 수준을 낮추면 데드락이 줄어든다"를 정확히 쓰기
>
> `READ COMMITTED`는 갭 락을 쓰지 않으므로 같은 쿼리가 잠그는 범위가 좁아진다. 여기서 락 대기와 데드락이 줄어든다는 실무 근거가 나온다.
>
> 그런데 공식 데드락 문서는 다른 방향으로 못 박는다 — **격리 수준을 바꾸는 것은 데드락 확률에 영향을 주지 않는다.** 격리 수준은 읽기 동작을 바꾸는 것이고, 쓰기 작업의 잠금 순서는 그대로이기 때문이다.
>
> 두 서술이 충돌하는 것처럼 보이지만 결론은 하나다. **격리 수준 변경을 데드락 대책으로 먼저 꺼내지 않는다.** 5.4의 다섯 가지 원칙(짧은 트랜잭션, 같은 접근 순서, 락킹 대상 컬럼의 인덱스)을 먼저 적용하고, 격리 수준은 애플리케이션이 팬텀 행을 감당할 수 있는지로 판단한다.

### 5.2 무엇이 잠기는가

락킹 읽기·`UPDATE`·`DELETE`가 잠그는 범위는 **어떤 인덱스로 행을 찾았는지**에 달려 있다.

- **유니크 인덱스에 유니크 검색 조건**을 쓰면, 찾은 인덱스 레코드만 잠근다. PK로 한 행을 갱신하는 문장이 가장 좁다
- 그 밖의 조건이거나 논유니크 인덱스를 쓰면, **스캔한 인덱스 범위 전체를 갭 락·넥스트키 락으로** 잠근다. 결과에 포함되지 않은 행 사이의 간격까지 잠긴다
- 적합한 인덱스가 없으면 최악이 된다.

> "If you have no indexes suitable for your statement and MySQL must scan the entire table to process the statement, **every row of the table becomes locked**, and in turn blocks all inserts by other users to the table."

인덱스 없는 `UPDATE ... WHERE`가 위험한 이유가 이것이다. 실행계획상 Full Scan이라는 말은 곧 **테이블 전체가 잠긴다**는 말이다.

```sql
-- 위험: status 에 인덱스가 없으면 테이블의 모든 행이 잠긴다
UPDATE orders SET status = 'EXPIRED' WHERE status = 'PENDING';

-- 안전한 방향: 잠글 범위를 인덱스로 특정하고, 건수를 나눈다 (5.7 참고)
UPDATE orders SET status = 'EXPIRED'
WHERE status = 'PENDING' AND id BETWEEN 1 AND 10000;
```

> **TIP** — 배치 잡을 배포하기 전에 실행계획을 본다
>
> 읽기 쿼리는 느리면 알아차리지만, 쓰기 배치는 느려지는 대신 **다른 세션을 멈춰 세운다.** `UPDATE`·`DELETE` 배치를 배포하기 전에 같은 `WHERE`로 `SELECT`를 만들어 `EXPLAIN`을 확인한다. `type`이 `ALL`이면 그 배치는 테이블을 잠그는 배치다.

### 5.3 중복 키가 데드락을 만든다

중복 키 에러는 단순한 실패가 아니다. 에러가 나는 순간 그 레코드에 **공유 락**이 걸린다. 같은 값을 넣으려는 세션이 둘 이상이면, 서로가 상대의 공유 락 때문에 진행하지 못해 데드락이 된다.

- 여러 워커가 "있으면 넘어가고 없으면 넣는다"를 `INSERT` 후 중복 에러로 판정하는 구조는 데드락을 유발한다
- `INSERT ... ON DUPLICATE KEY UPDATE`는 공유 락 대신 **배타 락**을 쓴다. PK 중복이면 인덱스 레코드에 배타 락, 유니크 키 중복이면 배타 **넥스트키 락**이다. 즉 이 구문은 중복 키 데드락을 없애는 장치가 아니라 잠금의 종류를 바꾸는 것이고, 유니크 키 경로에서는 오히려 간격까지 잠근다
- 실무 대응은 두 갈래다. 같은 키에 동시에 쓰는 워커 수 자체를 줄이거나(키 기준 파티셔닝), 5.4의 재시도를 반드시 구현한다

```sql
-- 유니크 키 중복 경로는 넥스트키 락을 잡는다 — 워커가 여러 개면 재시도 로직이 필수다
INSERT INTO daily_stats (stat_date, product_id, hit_count)
VALUES ('2026-07-17', 42, 1)
ON DUPLICATE KEY UPDATE hit_count = hit_count + 1;
```

### 5.4 데드락을 줄이는 방법

공식 문서가 제시하는 원칙은 다섯 개다.

1. **`LOCK TABLES` 대신 트랜잭션을 쓴다**
2. **쓰기 트랜잭션을 작고 짧게 유지한다** — 커밋까지의 시간이 곧 락을 쥐고 있는 시간이다
3. **여러 트랜잭션이 테이블에 같은 순서로 접근한다** — 순서가 엇갈리는 두 코드 경로가 데드락의 전형적인 원인이다
4. **`SELECT ... FOR UPDATE`와 `UPDATE ... WHERE`에 쓰는 컬럼에 인덱스를 만든다** — 5.2의 락 범위가 좁아진다
5. **격리 수준은 데드락 확률에 영향을 주지 않는다** — 격리 수준은 읽기 동작을 바꾸는 것이다

그리고 가장 중요한 한 줄이 남는다.

> "even if your application logic is correct, you must still handle the case where a transaction must be retried"

애플리케이션 로직이 옳아도 데드락은 발생한다. **트랜잭션을 재시도하는 경로를 애플리케이션에 반드시 만든다.** 데드락은 버그가 아니라 정상적인 운영 이벤트로 다룬다.

```java
// 데드락·락 타임아웃은 재시도 가능한 실패로 다룬다
int attempt = 0;
while (true) {
    try {
        transferPoints(fromId, toId, amount);   // 내부에서 begin/commit
        break;
    } catch (SQLException e) {
        // 재시도 대상인지 판정하고, 한도를 넘으면 포기한다
        if (!isRetryable(e) || ++attempt >= MAX_RETRY) {
            throw e;
        }
        sleepWithJitter(attempt);   // 같은 순서로 재충돌하지 않도록 간격을 흔든다
    }
}
```

> **TIP** — 데드락 관측
>
> - `SHOW ENGINE INNODB STATUS`의 `LATEST DETECTED DEADLOCK` 절에서 마지막 데드락의 양쪽 트랜잭션과 잠금 대상을 볼 수 있다. 다만 **마지막 한 건만** 남는다
> - 전부 남기려면 `innodb_print_all_deadlocks`를 켠다. 모든 데드락이 에러 로그에 기록된다
> - 데드락 **감지는 기본적으로 켜져 있다.** `innodb_deadlock_detect=OFF`로 끄면 감지 대신 `innodb_lock_wait_timeout`에 의존하게 되므로, 데드락이 즉시 에러로 돌아오지 않고 타임아웃까지 기다린다

### 5.5 락킹 읽기 — `FOR UPDATE` · `FOR SHARE`

일관된 읽기(스냅샷 읽기)는 다른 트랜잭션의 쓰기를 막지 않는다. "읽은 값을 근거로 쓰기"를 해야 하면 락킹 읽기가 필요하다.

- `FOR SHARE`가 `LOCK IN SHARE MODE`의 대체 구문이며, `OF table_name`·`NOWAIT`·`SKIP LOCKED`를 지원한다
- **autocommit이 꺼져 있어야 락킹 읽기가 성립한다.** autocommit 상태에서는 문장이 끝나는 즉시 커밋되므로 잡은 락이 바로 풀린다. `START TRANSACTION`으로 시작하거나 `autocommit=0`으로 두어야 한다
- 락은 **커밋이나 롤백 시점에 해제된다.** 트랜잭션을 길게 열어 두는 것이 곧 락을 길게 쥐는 것이다

> **DANGER** — 외부 문장의 락킹 절은 서브쿼리의 테이블을 잠그지 않는다
>
> 공식 문서가 명시하는 함정이다. `SELECT ... FOR UPDATE`의 락킹 절은 그 문장이 직접 읽는 테이블에만 적용되며, 서브쿼리가 읽는 테이블은 잠기지 않는다. 서브쿼리에도 락킹 절을 따로 붙여야 한다.

```sql
START TRANSACTION;

-- 잘못된 예: child 테이블은 잠기지 않는다
SELECT * FROM parent
WHERE id IN (SELECT parent_id FROM child WHERE state = 'READY')
FOR UPDATE;

-- 올바른 예: 서브쿼리에도 락킹 절을 붙인다
SELECT * FROM parent
WHERE id IN (SELECT parent_id FROM child WHERE state = 'READY' FOR UPDATE)
FOR UPDATE;

COMMIT;
```

### 5.6 `NOWAIT` 와 `SKIP LOCKED` — 큐 테이블 패턴

락킹 읽기에 두 옵션을 붙이면 "기다리지 않는" 동작을 만들 수 있다.

- **`NOWAIT`** — 다른 세션이 이미 잠근 행을 만나면 기다리지 않고 즉시 에러를 낸다

```text
ERROR 3572 (HY000): Do not wait for lock.
```

- **`SKIP LOCKED`** — 잠긴 행을 결과에서 제외한다. 잠기지 않은 행만 가져온다

이 조합이 작업 큐를 DB로 구현하는 표준 패턴이 된다. 여러 워커가 같은 테이블에서 각자 다른 작업을 집어 가되, 서로 기다리지 않는다.

```sql
START TRANSACTION;

-- 다른 워커가 집어 간 행은 건너뛰고, 내 몫만 가져와 잠근다
SELECT id, payload
FROM job_queue
WHERE state = 'READY'
ORDER BY id
LIMIT 10
FOR UPDATE SKIP LOCKED;

-- 가져온 id 들을 처리 중으로 표시 (애플리케이션이 위 결과의 id 를 바인딩한다)
UPDATE job_queue SET state = 'RUNNING' WHERE id IN (:picked_ids);

COMMIT;
```

> **DANGER** — 공식 경고를 함께 읽는다
>
> 잠긴 행을 건너뛰는 쿼리는 **데이터의 일관되지 않은 뷰를 돌려준다.** 공식 문서는 그래서 이 기능이 **일반적인 트랜잭션 작업에는 적합하지 않다**고 명시한다. 다만 여러 세션이 같은 **큐 같은(queue-like) 테이블**에 접근할 때 락 경합을 피하는 데는 쓸 수 있다고 용례를 인정한다.
>
> 즉 `SKIP LOCKED`는 "건너뛴 행이 결과에서 빠져도 업무적으로 괜찮은" 경우에만 쓴다. 정산 집계나 재고 검증처럼 전체 집합을 봐야 하는 쿼리에 붙이면 조용히 틀린 숫자가 나온다.
>
> 또 `NOWAIT`과 `SKIP LOCKED`는 둘 다 **문장 기반 복제에 안전하지 않다.**

### 5.7 큰 DML은 나눠서 한다

대량 변경을 어떻게 끊을지는 취향 문제가 아니다. 공식 문서가 양쪽 방향의 권고를 함께 제시한다.

**한 방향 — 너무 자주 커밋하지 않는다.** `AUTOCOMMIT=1`은 커밋마다 로그 flush를 강제하므로, **저장 장치의 I/O 처리량이 초당 가능한 연산 수에 상한을 만든다.** 논리적으로 한 덩어리인 변경은 한 트랜잭션으로 묶는다.

**반대 방향 — 거대한 트랜잭션을 만들지 않는다.** 수많은 행을 삽입·수정·삭제한 뒤 롤백하는 것을 피해야 한다. 공식 문서의 경고는 강하다.

> "If a big transaction is slowing down server performance, rolling it back can make the problem worse, potentially taking **several times as long** to perform as the original data change operations. Killing the database process does not help, because the rollback starts again on server startup."

롤백이 원래 작업보다 **몇 배의 시간**을 쓸 수 있고, DB 프로세스를 죽여도 도움이 되지 않는다 — 서버가 다시 시작되면 롤백이 처음부터 이어진다.

**두 권고의 교차점이 청크 DML이다.** 공식 완화책이 그대로 근거다 — 큰 데이터 변경 작업 중에 주기적으로 `COMMIT`을 내고, 하나의 delete나 update를 **더 적은 행을 다루는 여러 문장으로 쪼갠다.**

```sql
-- 한 문장으로 500만 건을 지우지 않는다. 끊어서 반복한다
-- 애플리케이션이나 스크립트에서 영향 행 수가 0이 될 때까지 반복 호출한다
DELETE FROM access_log
WHERE created_at < '2026-01-01'
ORDER BY created_at
LIMIT 5000;
```

> **WARNING** — 장기 트랜잭션이 남의 쿼리까지 느리게 한다
>
> 트랜잭션을 길게 열어 두면 비용이 그 트랜잭션에만 머물지 않는다.
>
> - InnoDB가 오래된 행 버전을 **purge 하지 못한다**
> - 다른 트랜잭션이 과거 버전을 재구성하는 비용이 늘어난다
> - **그 테이블에 대한 다른 트랜잭션의 쿼리가 커버링 인덱스 최적화를 쓰지 못한다** — 세컨더리 인덱스만으로 답할 수 있었던 쿼리가 테이블을 읽게 된다
>
> 커넥션을 잡아 두고 외부 API를 호출하거나 사용자 입력을 기다리는 구간은 트랜잭션 밖으로 빼낸다.

> **TIP** — 읽기 전용 트랜잭션은 반대로 판단한다
>
> 단일 `SELECT` 하나만 실행하는 경우라면 `AUTOCOMMIT`을 켜 두는 편이 낫다. 트랜잭션을 명시적으로 열지 않으면 InnoDB가 read-only 최적화를 적용할 수 있다. ORM이 모든 조회를 `START TRANSACTION`으로 감싸고 있다면, 단순 조회 경로는 그 설정을 빼는 쪽을 검토한다.

---

## 6. MySQL 안티패턴 (하지 말아야 할 것들)

### 6.1 `COUNT(*)` 를 존재 검증 로직에 사용

**정확한 원인은 스토리지 엔진(InnoDB)의 MVCC다.** 공식 문서의 서술이 그대로 근거다.

> "`InnoDB` does not keep an internal count of rows in a table because concurrent transactions might 'see' different numbers of rows at the same time. Consequently, `SELECT COUNT(*)` statements only count rows visible to the current transaction."

- 트랜잭션마다 보이는 행 수가 다르므로 "지금 이 트랜잭션에서 보이는 정확한 행 수"를 미리 계산해 둘 수 없다. 공식 문서도 트랜잭션 스토리지 엔진에서 정확한 행 수를 저장하는 것은 문제가 있다고 적는다
- 그래서 InnoDB는 `SELECT COUNT(*)`를 **사용 가능한 가장 작은 세컨더리 인덱스를 훑어서** 처리한다(인덱스 힌트나 옵티마이저 힌트로 다른 인덱스를 지정하지 않는 한). 세컨더리 인덱스가 없으면 클러스터드 인덱스를 스캔한다
- MyISAM이 `COUNT(*)`를 즉시 돌려주는 것은 이 엔진에 **정확한 행 수가 저장돼 있기 때문**이다. 단 이 최적화는 **단일 테이블이고, 다른 컬럼을 함께 조회하지 않으며, `WHERE`가 없을 때**만 적용된다. 이 차이가 "MySQL은 카운트가 느리다"는 오해의 출처다
- 타 DBMS가 테이블의 총 행 수를 상시 저장하는지는 이 문서에서 다루지 않는다. MySQL 쪽 동작만 근거로 쓴다
- **`COUNT(1)`이 더 빠르다는 통념은 사실이 아니다.** 공식 문서는 InnoDB가 `SELECT COUNT(*)`와 `SELECT COUNT(1)`을 같은 방식으로 처리하며 **성능 차이가 없다**고 명시한다

**존재 여부만 알고 싶을 때 `COUNT(*)`는 안티패턴이다.** 행이 하나라도 있는지 확인하려는 목적이라면 전체를 세지 말고 조기 종료시킨다. 공식 근거는 `LIMIT` 쪽에 있다 — MySQL은 필요한 행 수를 클라이언트에 보내는 즉시 `SQL_CALC_FOUND_ROWS`를 쓰지 않는 한 쿼리를 중단한다.

```sql
-- 나쁜 예: 존재 확인에 전체 카운트
SELECT COUNT(*) FROM orders WHERE user_id = 42;   -- 있으면 다 셈

-- 좋은 예: 존재만 확인
SELECT EXISTS(SELECT 1 FROM orders WHERE user_id = 42);
-- 또는
SELECT 1 FROM orders WHERE user_id = 42 LIMIT 1;
```

> **TIP** — 총건수가 정말 필요할 때
>
> - **대략적인 총건수면 `SHOW TABLE STATUS`를 쓴다.** 공식 문서가 제시하는 표현이 이것이다 — 근사치로 충분하면 `SHOW TABLE STATUS`를 쓰라고 적는다
> - 정확한 총건수를 상시 보여 줘야 한다면 **카운터 테이블**을 두고 애플리케이션이 갱신하는 방법이 공식 권고에 있다. 다만 같은 한계도 함께 적혀 있다 — **수천 개의 동시 트랜잭션이 같은 카운터 테이블을 갱신하는 상황에서는 잘 확장되지 않는다.** 카운터를 쓰려면 5.3의 중복 키 데드락과 5.2의 락 범위를 같이 설계해야 한다
> - 필터가 커버링 인덱스로 처리되면 `COUNT(*)`도 충분히 빠를 수 있다. 공식 문서는 `WHERE`·`GROUP BY` 같은 추가 절이 없는 `SELECT COUNT(*) FROM tbl_name`이 단일 스레드 워크로드에 최적화돼 있다고 적고, 동시에 **인덱스 레코드가 버퍼 풀에 전부 들어 있지 않으면 시간이 걸린다**고 덧붙인다. 무조건 느린 게 아니라 **"존재 확인에 총계를 구하는 패턴"이 잘못된 것**이다

### 6.2 PK에 랜덤 키 사용

> **IMPORTANT** — PK는 `INT` 계열 + `AUTO_INCREMENT` 권장

공식 문서는 PK 설계에 대해 두 가지를 분명히 말한다. 첫째, 클러스터드 인덱스는 보통 PK와 같은 것이며 테이블에 `PRIMARY KEY`를 정의하면 InnoDB가 그것을 클러스터드 인덱스로 쓴다. 둘째, PK로 쓸 만한 논리적 유일·비NULL 컬럼이 없으면 **AUTO_INCREMENT 컬럼을 추가하라**는 것이 공식 권고다.

**랜덤 키가 불리한 기전은 "물리적 재배열"이 아니라 페이지 충전율이다.**

> "When new records are inserted into an `InnoDB` clustered index, `InnoDB` tries to leave **1/16 of the page free** … If index records are inserted in a **sequential order** (ascending or descending), the resulting index pages are about **15/16 full**. If records are inserted in a **random order**, the pages are from **1/2 to 15/16 full**."

- 순차 삽입은 페이지를 약 **15/16**까지 채운다. 랜덤 삽입은 **1/2에서 15/16 사이**다. 같은 행 수를 담는 데 더 많은 페이지가 필요하고, 그만큼 버퍼 풀과 디스크를 더 쓴다
- 삭제·갱신으로 충전율이 `MERGE_THRESHOLD`(기본 50%) 밑으로 내려가면 InnoDB가 트리를 축약해 페이지를 해제한다(4.1 참고)

**두 번째 근거는 PK 길이다.** 세컨더리 인덱스의 각 레코드는 PK 컬럼 값을 포함한다. 공식 문서의 결론은 직설적이다.

> "If the primary key is long, **the secondary indexes use more space**, so it is advantageous to have a short primary key."

즉 `BINARY(16)`과 `BIGINT`의 8바이트 차이는 PK 하나가 아니라 **그 테이블의 모든 세컨더리 인덱스에 곱해진다.** 인덱스가 다섯 개면 다섯 배로 되돌아온다.

- **대안**: 분산 환경에서 전역 유일 키가 꼭 필요하다면 완전 랜덤인 UUID v4보다 **UUID v7**(타임스탬프 기반, 정렬 가능)을 애플리케이션에서 생성해 `BINARY(16)`으로 저장하는 방식이 실무에서 권장된다. MySQL 문서에 v7 서술은 없으므로 이 선택은 애플리케이션 쪽 판단이다
- UUID v1을 쓴다면 `UUID_TO_BIN(uuid, 1)`으로 저장한다. 공식 문서는 v1 형식을 따르지 않는 값에는 time-part swapping이 **아무 이득을 주지 않는다**고 명시한다 — v4를 swap 해도 얻는 것이 없다 (2.4 참고)

> **INFO** — PK를 아예 만들지 않으면
>
> PK도, 적격 `UNIQUE` 인덱스도 없으면 InnoDB는 **6바이트 row ID** 기반의 숨은 클러스터드 인덱스 `GEN_CLUST_INDEX`를 만든다. 이때 행은 **row ID 순서, 즉 삽입 순서로 물리적으로 정렬된다.** 개발자가 그 순서를 지정하거나 조회에 쓸 수는 없으므로, PK는 직접 정의한다.

> **INFO** — "AUTO_INCREMENT는 경합 때문에 못 쓴다"는 반론
>
> `innodb_autoinc_lock_mode`의 기본값은 **2(interleaved)** 이며 동적으로 변경할 수 없는 변수다. 예전의 테이블 단위 AUTO-INC 락을 전제로 한 경합 우려는 현재 기본값과 맞지 않는다.

### 6.3 복합키(Composite Key)로 PK 생성

| 문제 | 영향 |
| --- | --- |
| 인덱스 크기·검색 비용 증가 | 모든 세컨더리 인덱스가 PK 전체를 포함해 함께 커진다 |
| 쿼리 복잡성·가독성 저하 | 조인 조건과 파라미터 바인딩이 길어진다 |
| FK 참조 복잡성 | 여러 컬럼을 함께 참조해야 하므로 실수 가능성이 커진다 |
| 인덱스 순서 의존성 | leftmost prefix 규칙 때문에 컬럼 순서가 쿼리 패턴을 제약한다 |

이 표에서 공식 문서로 뒷받침되는 것은 첫 번째 항목 하나다 — 세컨더리 인덱스가 PK 컬럼을 포함하므로 **PK가 길면 모든 세컨더리 인덱스가 커진다.** 나머지 세 항목은 실무에서 굳어진 기준이며, 옵티마이저 동작이 아니라 코드 유지보수 쪽 논거다.

그래서 이 절의 규칙은 "복합키 PK 금지"가 아니라 **"PK 길이는 모든 세컨더리 인덱스에 곱해진다"** 로 읽는 것이 정확하다.

- 다대다 연결 테이블의 `(a_id, b_id)` 복합 PK를 금지하는 공식 근거는 없다. 두 컬럼 모두 짧은 정수이고 그 조합으로만 조회한다면 합리적인 선택이다
- 반대로 공식 제약이 분명한 쪽은 함수 키파트다 — **함수 키파트는 PK로 쓸 수 없다**(가상 생성 컬럼으로 구현되기 때문이다, 4.3 참고)
- 대리키(`BIGINT AUTO_INCREMENT`)를 추가할 때는 자연키 조합에 `UNIQUE` 제약을 함께 걸어 중복을 막는다. 대리키만 두고 유니크 제약을 빼면 같은 조합이 여러 번 들어온다

### 6.4 물리적 모델에 FK 적용

| 문제 | 영향 |
| --- | --- |
| 쓰기 성능 저하 | 삽입·수정·삭제 시 제약 검사 오버헤드 |
| 잠금 경합 | 참조되는 **행에 공유 락** → 동시성 저하 |
| 마이그레이션·통합 어려움 | 스키마 변경·분산 환경에서 제약 |
| 이식성 저하 | DBMS별 FK 구현 차이 |

**두 번째 항목의 단위가 중요하다. FK는 참조 테이블을 잠그지 않는다.** 공식 문서의 서술은 행 단위다.

> "If a `FOREIGN KEY` constraint is defined on a table, any insert, update, or delete that requires the constraint condition to be checked **sets shared record-level locks on the records that it looks at** to check the constraint. `InnoDB` also sets these locks in the case where the constraint fails."

즉 제약을 검사하려고 **들여다본 레코드에 공유 행 락**을 걸고, 제약 위반으로 실패할 때에도 락을 건다. 테이블 락이 아니다. 그래도 경합은 실재한다 — 인기 있는 부모 행(예: 모든 주문이 참조하는 기본 카테고리)이 있으면 그 한 행에 공유 락이 몰린다.

세 번째·네 번째 항목은 공식 근거가 아니라 대규모·분산 환경에서의 실무 판단이다.

> **WARNING** — FK를 쓸 때 알아야 할 공식 동작
>
> - **FK 컬럼의 인덱스는 자동 생성된다.** MySQL은 FK 컬럼에 인덱스를 요구하고 없으면 만든다. FK를 하나 걸면 인덱스가 하나 늘어난다는 뜻이다
> - **지연 검사(deferred constraint checking)를 지원하지 않는다.** 그래서 `NO ACTION`은 `RESTRICT`와 동일하게 처리된다. "커밋 시점에 한꺼번에 검사"를 기대할 수 없다
> - `SET DEFAULT`는 InnoDB가 거부한다
> - **`MATCH FULL`·`MATCH PARTIAL`·`MATCH SIMPLE`을 쓰면 같은 문장의 `ON DELETE`·`ON UPDATE` 절이 무시된다.** 조용히 무시되므로 캐스케이드가 동작하지 않는 사고로 이어진다. `MATCH` 절은 쓰지 않는다
> - **FK 액션은 트리거를 발동시키지 않는다.** `ON DELETE CASCADE`로 지워진 자식 행에 대해 감사·동기화 트리거가 돌지 않는다 (7.3 참고)
> - 8.4는 `restrict_fk_on_non_standard_key=ON`이 기본값이다. 비유니크 키나 부분 키를 참조하는 FK 생성이 막히므로, **8.0에서 통과했던 스키마가 8.4에서 거부될 수 있다.** 업그레이드 전에 FK가 참조하는 키가 유니크 전체 키인지 확인한다

> **TIP** — 대안
>
> FK 제약을 **애플리케이션 레벨**에서 관리하면 대규모·분산·마이그레이션 잦은 환경에서 더 유연하고 성능 최적화 여지가 크다. 단 이 판단은 공식 권고가 아니라 운영 환경에 따른 트레이드오프다.

> **INFO** — 균형 잡힌 시각: FK를 무조건 배제할 필요는 없음
>
> 위 표는 **대규모 트래픽·분산·잦은 스키마 변경** 맥락에서의 트레이드오프다. 반대로 다음 상황에서는 물리적 FK가 오히려 이득이 크다.
>
> - **단일 인스턴스·중소 규모**로 쓰기 부하가 병목이 아닌 서비스
> - **정합성이 비즈니스적으로 치명적**이고, 애플리케이션이 여러 개(배치·어드민·외부 연동 등)라 앱 레벨 검증을 전부 신뢰하기 어려운 경우 → DB가 최후의 방어선 역할
> - 개발 초기, 데이터 모델을 문서화·강제하고 싶은 단계
>
> 즉 "FK 금지"가 아니라 **"부하·확장 요구가 명확해지면 앱 레벨로 이관을 검토"** 가 정확한 규칙이다. FK를 뺄 때는 그 무결성 책임을 **어디서(앱/배치/제약) 어떻게 보장할지**를 반드시 명시해야 하며, 방치하면 고아 레코드가 조용히 쌓인다.

### 6.5 JSON 타입 컬럼 사용

| 문제 | 영향 |
| --- | --- |
| 쓰기 시 파싱·검증 오버헤드 | 삽입·갱신 때 JSON 유효성 검사 + 내부 바이너리 포맷 변환 |
| 인덱스 제한 | JSON 컬럼 자체에 직접 인덱스 불가 → 생성 컬럼·함수 인덱스·Multi-Valued Index 필요 |
| 스키마 유효성 검증 약함 | "유효한 JSON"만 보장하고 필드 구성·타입은 보장하지 않음 |
| 복잡한 쿼리·JOIN 제한 | 경로 표현식 남발 시 가독성·유지보수성 저하 |
| 저장 공간 | 저장 요구량이 `LONGBLOB`·`LONGTEXT`와 대략 같아 정규화 컬럼보다 크다 |

- 유효성 검사는 공식 동작이다. 잘못된 문서를 넣으면 에러가 나고, 에러 번호는 `ERROR 3140 (22032)`다
- 인덱스 제한도 공식 문서에 명시돼 있다 — JSON 컬럼은 다른 바이너리 타입처럼 **직접 인덱싱되지 않으며**, JSON 컬럼에서 스칼라 값을 추출하는 생성 컬럼에 인덱스를 만들어야 한다. JSON 배열에 대한 multi-valued 인덱스는 InnoDB가 지원한다
- 저장 공간에 대해 공식 문서가 말하는 것은 "`LONGBLOB`이나 `LONGTEXT`와 대략 같다"까지다. 실제 사용량은 `JSON_STORAGE_SIZE()`로 확인한다
- **문서 하나의 크기는 `max_allowed_packet` 값에 걸린다.** 큰 문서를 넣다가 실패하는 경로가 여기다
- 공식 문서는 같은 바이너리 포맷을 **장점**으로도 설명한다 — 키나 배열 인덱스로 하위 객체·중첩 값을 직접 조회할 수 있기 때문이다. 즉 JSON 자체가 잘못된 기능이 아니라, 관계로 풀 수 있는 데이터를 JSON에 밀어 넣는 설계가 문제다

> **TIP** — 그래도 JSON을 꼭 써야 한다면
>
> - **생성 컬럼 + 인덱스**: `col->>'$.field'` 값을 생성 컬럼으로 추출해 일반 인덱스를 건다. 이때 4.3의 콜레이션 함정을 먼저 확인한다 — `->>`의 결과는 `utf8mb4_bin`이고 `CAST(... AS CHAR(n))`은 서버 기본 콜레이션이다
> - **Multi-Valued Index**: JSON 배열 값 자체에 인덱스를 걸 수 있다. 예: `CREATE INDEX idx_tags ON t ((CAST(tags->'$[*]' AS CHAR(20) ARRAY)))`. 제약이 있다 — **정렬을 지원하지 않아 PK로 쓸 수 없고**, `ASC`·`DESC` 지정과 프리픽스 지정도 안 된다. 옵티마이저는 이 인덱스를 `MEMBER OF()`·`JSON_CONTAINS()`·`JSON_OVERLAPS()`에 사용한다
> - **부분 업데이트 최적화를 살린다**: `JSON_SET()`·`JSON_REPLACE()`·`JSON_REMOVE()`로 갱신하고, 입력과 대상 컬럼이 같고 새 값이 기존 값보다 크지 않으면 in-place 부분 업데이트가 적용된다. 반대로 `SET jcol = '{ ... }'`처럼 문서 전체를 대입하면 대상이 아니다. 복제 트래픽도 `binlog_row_value_options=PARTIAL_JSON`으로 줄일 수 있다
> - 두 방법 모두 JSON 구조를 유지한 채 우회하는 처방이다 — 필드가 안정적으로 고정되어 있다면 **정규화된 컬럼·테이블로 전환**하는 것이 근본적인 해법이다

> **NOTE** — 문서 스키마 자체가 목적이라면
>
> 필드 구성이 문서마다 다르고 그것이 요구사항이라면 관계형 스키마와 싸울 이유가 없다. 문서 저장소를 쓰는 선택은 이 문서의 범위 밖 권고다.

---

## 7. Stored Procedure · Trigger · Event Scheduler 사용 자제

> **WARNING** — MySQL에서는 특히 주의
>
> MySQL의 stored program 캐시는 **연결(세션) 단위**라 연결 간에 공유되지 않는다.

| 문제 영역 | 상세 |
| --- | --- |
| **유지보수** | 비즈니스 로직 분산, 디버깅 기능 없음 |
| **이식성** | DBMS 종속, 버전 호환성 문제 |
| **성능** | 캐싱 솔루션(Redis 등) 통합 어려움, Scale-Out 제한 |
| **생산성** | 버전 관리·테스트·배포 자동화 부족, 협업 어려움 |
| **로직 중복** | 앱 코드와 SP 간 동일 로직 중복 → 일관성 저하 |
| **보안** | 권한 관리 복잡(DEFINER/INVOKER 혼동), 문자열 연결로 동적 SQL을 조립하면 인젝션 위험 |

이 표에서 공식 문서가 직접 뒷받침하는 것은 두 줄이다 — **"There are no stored routine debugging facilities."** 그리고 아래 7.1의 세션 단위 캐시다. 이식성·생산성·로직 중복은 실무에서 굳어진 기준이며, MySQL 매뉴얼에 대응 서술이 없다.

### 7.1 세션 단위 캐시라는 구조적 한계

서버는 스토어드 프로그램을 내부 구조로 변환해 캐시한다. 문제는 그 캐시의 범위다.

> "Stored programs (stored procedures and functions, triggers, and events). In this case, the server converts and caches **the entire program body**. The `stored_program_cache` system variable indicates the approximate number of stored programs the server caches **per session**."

> "The server maintains caches for prepared statements and stored programs **on a per-session basis**. Statements cached for one session are **not accessible to other sessions**. When a session ends, the server **discards** any statements cached for it."

- **세션 로컬 캐시**: 스토어드 프로그램은 각 세션에서 변환·캐시되고, 그 세션에서만 재사용되며, 세션이 끝나면 폐기된다. 세션 경계를 넘어 공유되는 컴파일 캐시는 없다. 타 DBMS의 전역 캐시와 비교하는 서술은 이 문서의 범위 밖이다
- **커넥션 풀과의 궁합**: 풀이 연결을 자주 만들고 버리면 새 세션마다 변환 비용이 다시 든다. 반대로 장수 연결을 재사용하는 풀에서는 두 번째 호출부터 캐시가 살아 있어 비용이 크지 않다
- **정리**: "매 호출마다 무조건 재컴파일"은 과장이다. 정확한 서술은 **전역 공유 캐시가 없다는 구조적 한계**이고, 이것이 위의 유지보수·이식성 문제와 겹쳐 SP 남용을 피하는 근거가 된다
- 캐시 개수 한도는 `stored_program_cache`로 정해진다. 값은 문서의 숫자를 믿지 말고 대상 서버에서 확인한다 — `SELECT @@GLOBAL.stored_program_cache;`

> **INFO** — 메타데이터가 바뀌면 다시 파싱한다
>
> DDL, `FLUSH TABLES`, table definition cache에서의 축출로 참조 객체의 메타데이터가 바뀌면 서버가 **자동으로 재파싱(reprepare)** 한다. 공식 문서의 표현은 "Reparsing is automatic, but to the extent that it occurs, **diminishes prepared statement and stored program performance**"다. 재시도는 최대 3회이며 실패하면 에러가 된다. 즉 스키마를 자주 바꾸는 환경에서는 세션 캐시의 이득이 더 줄어든다.

### 7.2 공식 문서가 명시한 제약

- **동적 SQL은 프로시저에서만 된다.** `PREPARE`를 쓰는 동적 SQL은 스토어드 프로시저에서만 가능하고, **스토어드 함수와 트리거에서는 불가능하다.** 함수 안에서 조건을 조립해 쿼리를 만들려는 설계는 문법 단계에서 막힌다
- **스토어드 함수는 실행 전에 테이블 락을 잡는다.** 공식 문서의 표현은 같은 테이블을 갱신하는 스토어드 함수들이 **병렬로 실행되지 않는다**는 것이다. 반면 스토어드 프로시저는 테이블 수준 락을 잡지 않는다. 표의 "Scale-Out 제한"을 공식 근거로 말할 수 있는 지점이 여기다
- **디버깅 기능이 없다.** 로직을 SP로 옮기는 순간 IDE 디버거·스택 트레이스·단위 테스트 도구를 포기한다
- 8.4에서 권한이 재편됐다 — `SET_USER_ID` 권한이 제거되고 `SET_ANY_DEFINER`·`ALLOW_NONEXISTENT_DEFINER`로 분리됐다. `DEFINER`를 지정해 오던 배포 스크립트는 업그레이드 시 권한을 다시 부여해야 한다

### 7.3 트리거와 이벤트의 함정

트리거는 "DB가 알아서 해 주는 동기화"처럼 보이지만, 돌지 않는 경우가 공식 문서에 나열돼 있다.

- **"Triggers are not activated by foreign key actions."** FK `ON DELETE CASCADE`로 지워진 행에 대해서는 감사·동기화 트리거가 돌지 않는다. 1장의 반정규화 동기화, 6.4의 FK 논의와 직접 이어지는 정합성 함정이다
- **행 기반 복제에서는 소스에서 실행된 문장 때문에 레플리카의 트리거가 작동하지 않는다**(문장 기반 복제에서는 작동한다). 8.4의 기본 `binlog_format`은 `ROW`이므로, "레플리카에서도 트리거가 돌 것"이라는 가정은 기본 설정에서 틀린다
- **트리거 캐시는 기반 객체의 메타데이터 변경을 감지하지 못한다.** 공식 서술대로 트리거가 **낡은 메타데이터로 동작**할 수 있다
- 트리거와 함수는 **호출 문장이 이미 사용(읽거나 쓰기)하고 있는 테이블을 수정할 수 없다.** 명시적·암묵적 커밋이나 롤백 문장도 쓸 수 없고, 결과셋을 반환하는 문장도 불가능하며, 재귀도 안 된다
- `mysql`·`INFORMATION_SCHEMA`·`performance_schema` 테이블에는 트리거를 만들 수 없다

Event Scheduler에도 같은 계열의 제약이 있다.

- **"Events do not support times later than the end of the Unix Epoch; this is approximately the beginning of the year 2038."** 2.3의 Y2038 문제와 같은 상한이다. 2038년 이후의 일정을 이벤트로 예약할 수 없다
- 이벤트 본문은 **매 실행마다 새 연결**에서 돌아간다. 세션 변수·임시 테이블·카운터 같은 세션 상태가 실행 사이에 남지 않는다
- `LOCK TABLES` 중에는 이벤트 관련 DDL을 실행할 수 없고, 이벤트 안에서 이벤트·루틴·트리거를 생성·변경·삭제할 수 없다
- 실행 시점이 1~2초 지연될 수 있다. 초 단위 정확도가 필요한 스케줄에는 쓰지 않는다
- Aurora MySQL v3에서 `event_scheduler`는 **클러스터 레벨 파라미터로만** 수정할 수 있다

---

## 8. JDBC Driver / Connector 선택

### 8.1 드라이버 비교표

> **WARNING** — 2026-09-19 KST 기준
>
> 드라이버 이름과 버전은 조사 시점 기준이다. `Aurora JDBC Driver`(`awslabs/aws-mysql-jdbc`)는 **End of Support** 상태이고, Aurora 대상 래퍼의 정식 명칭은 **AWS Advanced JDBC Wrapper**다. 항목별로 근거 시점이 다른 경우에는 해당 칸에 표시했다.

| 특성 | MySQL Connector/J | MariaDB Connector/J | AWS Advanced JDBC Wrapper |
| --- | --- | --- | --- |
| **대상 서버** | Connector/J 26.7은 **MySQL 8.4 이상** | MariaDB 서버 | Aurora MySQL·PostgreSQL |
| **Read/Write 분리** | Source-Replica Replication 구성 제공 | Replication mode | 전용 플러그인 제공 |
| **다중 호스트** | 멀티호스트 URL · DNS SRV 지원 | 멀티호스트 URL | 클러스터 토폴로지 기반 호스트 선택 |
| **페일오버** | 멀티호스트 Failover 구성 | Aurora 전용 로직 제거(2026-08 조사 기준) | Enhanced Failure Monitoring(EFM) 플러그인 |
| **권장 버전** | 검증 시점의 최신 GA (26.7.x) | 순수 MariaDB 대상이면 3.5.x | 4.4.0 (2026-08-20) |
| **좌표·성격** | `com.mysql:mysql-connector-j` | MariaDB 서버 대상 드라이버 | `software.amazon.jdbc:aws-advanced-jdbc-wrapper` — 기반 커넥터를 감싸는 래퍼 |

### 8.2 Connector/J의 멀티호스트 연결 — 세션이 바뀐다

Connector/J는 멀티호스트 구성으로 Failover, Load Balancing, Source-Replica Replication을 제공하고 DNS SRV 조회도 지원한다. 개발자가 반드시 알아야 할 것은 그 구성에서 **세션이 갈아 끼워진다**는 점이다.

> "Each of the underlying physical connections has its own session … **Every switch between physical connections means a switch between sessions**."

> "Within a transaction boundary, there are no switches between physical connections. **Beyond a transaction boundary, there is no guarantee that a switch does not occur.**"

즉 트랜잭션 안에서는 물리 연결이 바뀌지 않지만, **트랜잭션 경계를 넘으면 바뀌지 않는다는 보장이 없다.** 다음 코드는 멀티호스트 구성에서 조용히 실패할 수 있다.

- `SET @var := ...`로 세션 변수를 만들고 다음 트랜잭션에서 읽는 코드
- `CREATE TEMPORARY TABLE`로 만든 임시 테이블을 뒤 트랜잭션에서 참조하는 코드
- 한 세션에서 준비한 prepared statement를 트랜잭션 경계 밖에서 재사용하는 코드

세션에 의존하는 상태는 **같은 트랜잭션 안에서 만들고 쓰고 버린다.**

> **TIP** — 타임아웃 기본값이 무한 대기다
>
> - `socketTimeout` 기본값은 **0**, 즉 네트워크 소켓 연산에 타임아웃이 없다. 그대로 두면 응답 없는 서버를 무한히 기다린다
> - `connectTimeout` 기본값도 **0**이다
> - `tcpKeepAlive` 기본값은 **true**다
> - 페일오버를 감지하려면 `socketTimeout`과 `connectTimeout`에 업무 허용 시간에 맞는 값을 명시한다. 기본값에 기대면 감지 자체가 일어나지 않는다

### 8.3 드라이버 페일오버 감지 주의사항

> **DANGER** — 핵심 이슈
>
> - **MariaDB Connector/J**: 3.0.3(2023-09)부터 Aurora 전용 페일오버 로직이 제거됐다. 2.7.x 고정 사용 권고는 유효하지 않고, Aurora 환경에서는 MariaDB Connector를 단독으로 쓰지 말고 **AWS Advanced JDBC Wrapper와 결합**한다. 이 항목은 **2026-08 조사 기준**이며 적용 전에 MariaDB 공식 문서에서 재확인한다.
> - **MySQL Connector/J**: 단독 사용 시 기본 설정에서 페일오버 감지가 오래 걸린다. 자주 인용되는 "최대 15분"과 `tcp_retries2` 조정은 **MySQL 공식 문서가 아니라 리눅스 커널 파라미터와 클라우드 벤더 안내에서 온 값**이다. 그대로 믿지 말고 대상 환경에서 실제 감지 시간을 측정한다.
>     - `socketTimeout`을 업무 허용 시간에 맞는 낮은 값으로 명시한다(기본값 0 = 무한 대기)
>     - `connectTimeout`을 함께 설정한다
>     - OS 레벨 재전송 타임아웃(`tcp_retries2`) 조정은 커널 문서와 벤더 가이드를 근거로 결정한다
>     - Aurora라면 **AWS Advanced JDBC Wrapper의 Enhanced Failure Monitoring(EFM)** 을 도입해 드라이버가 능동적으로 노드 상태를 감시하게 한다

### 8.4 드라이버 선택 권장

| 드라이버 | 권장 여부 | 비고 |
| --- | --- | --- |
| **MySQL Connector/J** | 추천 (단독 사용 시 방어 로직 필요) | **Connector/J 26.7은 MySQL 8.4 이상을 지원**하므로 8.0 서버 환경은 올리기 전에 지원 범위를 확인해야 한다. JDBC 4.2 구현이며 4.3 전용 메서드는 `SQLFeatureNotSupportedException`을 던진다. JRE 8 이상이 필요하다. Maven 좌표는 `com.mysql:mysql-connector-j`다. `socketTimeout`·`connectTimeout`을 반드시 명시한다 |
| **MariaDB Connector/J** | Aurora 목적 단독 사용 비권장 | 3.0.3(2023-09)부터 Aurora 페일오버 지원 제거. 순수 MariaDB 서버 대상이면 3.5.x, 2.7.x는 신규 도입 금지 (2026-08 조사 기준) |
| **Aurora JDBC Driver** (`awslabs/aws-mysql-jdbc`) | 신규 도입 금지 · 기능 개발 종료 | **End of Support (2024-07-25)**. 이후로는 보안·중대 수정만 받으며 새 기능은 AWS Advanced Wrapper에서 구현된다. 리포지터리는 여전히 공개 상태이므로 "사라진 드라이버"는 아니지만, 신규 프로젝트에 넣을 이유가 없다 |
| **AWS Advanced JDBC Wrapper** | 최우선 추천 (Aurora) | `software.amazon.jdbc:aws-advanced-jdbc-wrapper` 4.4.0 (2026-08-20). EFM, Read/Write Split, IAM·Secrets Manager 인증, Aurora Global Database의 리전 간 failover·switchover, RDS Multi-AZ, Blue/Green 지원 |

> **INFO** — AWS Advanced JDBC Wrapper 4.x에서 추가된 것
>
> - **4.4.0** — XA/JTA 분산 트랜잭션 지원(`AwsWrapperXADataSource`), read/write splitting 플러그인을 단일 구현으로 통합(`autoSimpleReadWriteSplitting` 등 추가), Secrets Manager의 비밀 로테이션 구간 재시도 옵션, `assumeWriteTransaction`
> - **4.3.0** — Blue/Green 전환 전 준비 상태 로깅
> - **4.2.0** — SQL 파싱 기반 `autoReadWriteSplitting`, `lowestLoadByCpu`·`lowestLoadByLag` 호스트 선택기
> - **4.1.0** — Aurora Global Database의 접근 가능 리전 지원
> - **4.0.0 (2026-05)** — KMS 클라이언트 사이드 암호화 플러그인

> **NOTE** — 참고
>
> [AWS 공식 블로그](https://aws.amazon.com/blogs/database/using-the-mariadb-jdbc-driver-with-amazon-aurora-with-mysql-compatibility/)도 "MariaDB Connector/J 3.0.3부터 Aurora 미지원 → AWS Advanced JDBC Wrapper 권장"으로 안내한다.

### 8.5 커넥션 풀과 `wait_timeout`

커넥션 풀 설정을 정할 때 기준이 되는 서버 동작이 하나 있다.

> "By default, the server closes the connection after **eight hours** if nothing has happened."

이 8시간이 `wait_timeout`(값 28800)이다. 서버가 idle 커넥션을 닫은 뒤 애플리케이션이 그 커넥션을 풀에서 꺼내 쓰면 클라이언트는 다음 에러를 본다.

```text
MySQL server has gone away
```

공식 권고는 두 갈래다 — 마지막 쿼리 이후 오래 지났으면 커넥션에 **`mysql_ping()`을 하거나**, `wait_timeout`을 실질적으로 타임아웃되지 않을 만큼 **높게 두라**는 것이다. JDBC 풀에서 이 두 권고에 대응하는 것이 각각 **검증 쿼리(validation query)** 와 **커넥션 최대 수명(max-lifetime)** 설정이다.

실무 기준은 간단하다 — **풀의 커넥션 최대 수명을 서버의 `wait_timeout`보다 짧게 잡는다.** 서버가 먼저 끊는 상황을 만들지 않으면 `gone away`는 애초에 발생하지 않는다. 이 설정값 자체는 공식 문서의 규범이 아니라 풀 구현체의 설정이므로, 쓰고 있는 풀의 문서를 함께 본다.

```sql
-- 대상 서버에서 실측한다. 문서에 적힌 기본값을 그대로 믿지 않는다
SHOW VARIABLES LIKE 'wait_timeout';
SELECT @@GLOBAL.max_connections;
```

> **WARNING** — 커넥션 수 한도에 관한 두 가지 사실
>
> - 관리자용 예비 커넥션이 하나 더 있어서 실제 허용 한도는 **`max_connections + 1`** 이다
> - **파일 디스크립터가 부족하면 서버가 `max_connections`를 자동으로 낮춘다.** 설정 파일에 적은 값이 실제 값과 다를 수 있으므로, 풀 크기를 정하기 전에 실측값을 확인한다
> - `interactive_timeout`의 기본값은 배포판·설정에 따라 다르므로 서버에서 직접 확인한다

> **INFO** — Aurora MySQL
>
> Aurora는 `interactive_timeout`과 `wait_timeout` 중 **더 작은 값**으로 모든 idle 세션을 끊는다. 대화형 클라이언트 기준으로 `interactive_timeout`만 넉넉하게 잡아 두면 의도한 효과가 나지 않는다. 두 값을 함께 맞춘다.

---

## 9. MySQL 릴리스 정책

### 9.1 Innovation 과 LTS

> **INFO** — 2023-07(8.0 이후)부터 MySQL은 두 트랙으로 나뉘었다
>
> 실무에서 "최신 버전 사용"을 권장할 때, 어떤 트랙의 최신 버전인지가 중요하다.

| 구분 | Innovation | LTS (Long-Term Support) |
| --- | --- | --- |
| **성격** | 신기능 우선 릴리스 | 안정성 우선, 첫 LTS 릴리스에서만 기능 추가·제거 이후 고정 |
| **지원 기간** | 짧음 (다음 Innovation으로 빠르게 교체) | Oracle Lifetime Support 정책 — **Premier 5년 + Extended 3년** |
| **동작 변화** | 마이너 버전 간에도 동작(behavior) 변경 가능 | 동일 LTS 시리즈 내에서는 동작 변경 없음 |
| **적합 대상** | 빠른 CI/CD, 자동화 테스트가 잘 갖춰진 개발 환경 | 운영 환경, 장기 안정성이 중요한 서비스 |
| **순차 버전 시절의 대표 버전** | 9.0 ~ 9.6 | **8.4.x**(첫 LTS) · **9.7.x**(두 번째이자 마지막 순차 LTS) |
| **업그레이드 경로** | 같은 메이저 내 Innovation 간 직접 업그레이드 가능 (예: 9.0 → 9.1) | 메이저가 다른 Innovation 간 직접 업그레이드 불가 → 가까운 LTS를 거쳐야 함 (예: 8.3 → **8.4(LTS)** → 9.0). LTS → 다음 LTS는 지원(예: **8.4.x → 9.7.x**), LTS 시리즈 건너뛰기는 불가 |

> **DANGER** — 흔한 혼동: "9.7 = Innovation 최신"은 오해
>
> MySQL **9.7.x는 8.4에 이은 두 번째 LTS**다. 공식 매뉴얼도 "8.4.x LTS → 9.7.x LTS" 업그레이드 경로를 명시한다. 9.0~9.6이 Innovation 트랙이고 **9.7부터 다시 LTS로 고정**되는 구조다(8.1~8.3 Innovation → 8.4 LTS 패턴의 반복). 따라서 "최신 9.x = Innovation"이라고 뭉뚱그리면 안 되고, **9.7 이상은 LTS로 취급**해야 한다.

### 9.2 캘린더 버저닝 전환 — 순차 버전은 9.7에서 끝났다

2026년의 버전 번호는 더 이상 순차 체계가 아니다.

> "MySQL 9.7 was **the final release line using the sequential versioning model**. Subsequent MySQL Innovation and LTS releases use **calendar versioning in the YY.M.P format**."

> "MySQL 26.7.0, representing the July 2026 release, is **the first valid calendar-versioned MySQL release**."

- 버전 형식은 **`YY.M.P`** 다. `26.7.0`은 2026년 7월 릴리스를 뜻한다
- **캘린더 버전만으로는 트랙을 알 수 없다.** 공식 문서가 "A calendar version does not determine whether a release is an Innovation or LTS release"라고 못 박는다. 숫자가 크다고 LTS인 것도, Innovation인 것도 아니다. 각 릴리스의 성격은 해당 릴리스 노트에서 확인한다
- 릴리스 노트의 표기를 그대로 읽는다. 예를 들어 **26.10.0(2026-09-18)** 은 릴리스 노트에 **"Early Access Release"** 로 표기된다. 번호만 보고 운영에 올릴 대상으로 취급하면 안 된다
- 계보 규칙이 하나 더 있다 — **순차 버전의 마지막 LTS 계열인 `MySQL 9.7.x LTS`만 첫 캘린더 버전 호환 계보로 직접 업그레이드할 수 있다.** 8.4 LTS를 쓰고 있으면 9.7을 경유해야 캘린더 계보로 들어간다

### 9.3 8.0의 현재 상태

- **2026년 4월 21일부로 MySQL 8.0은 Oracle Sustaining Support 적용 대상이다.** 즉 새 패치·보안 수정을 기대할 수 있는 단계가 지났다
- 공식 안내가 제시하는 업그레이드 대상은 **MySQL 8.4 LTS 또는 9.7 LTS**다
- 8.0에서 8.4로 올릴 때는 기능 제거와 기본값 변경이 함께 따라온다. 9.5에 개발 코드가 부딪히는 지점을 정리했다

> **WARNING** — 실무 적용 시 주의
>
> - 운영 DB는 **LTS 트랙**을 기본으로 고려한다. 현재 선택지는 **8.4.x**(성숙한 첫 LTS)와 **9.7.x**(두 번째 LTS)이며, 8.0에 머물러 있다면 이전 계획을 먼저 세운다
> - AWS RDS·Aurora for MySQL은 자체 지원 버전 로드맵을 따로 갖고 있으므로, MySQL 커뮤니티 버전의 트랙과 AWS의 지원 버전이 반드시 일치하지는 않는다 — 마이그레이션 전에 AWS 지원 버전 목록을 별도로 확인한다
> - 캘린더 버전 릴리스를 검토할 때는 해당 릴리스 노트에서 트랙과 Early Access 여부를 먼저 확인한다

### 9.4 커넥터 버전은 서버 버전과 다르게 읽는다

- **Connector/J 26.7은 MySQL 8.4 이상을 지원한다.** 커넥터 버전이 서버 버전 번호를 따라간다고 해서 지원되는 서버 범위가 모든 버전을 포함하지는 않는다. 8.0 서버를 쓰는 환경은 커넥터를 최신으로 올리기 전에 지원 범위를 먼저 확인해야 한다
- **서버 9.7.x와 Connector/J 9.7.0은 버전 숫자만 같을 뿐 성격이 다르다.** 서버 쪽 LTS 여부와 커넥터의 지원 범위는 별개로 확인한다
- 커넥터는 JDBC 4.2를 구현하며 4.3 전용 메서드는 `SQLFeatureNotSupportedException`을 던진다. 실행에는 JRE 8 이상이 필요하다

### 9.5 업그레이드 시 개발 코드가 부딪히는 지점

8.0에서 8.4 이상으로 올릴 때 **애플리케이션과 스키마가 직접 영향을 받는** 변화만 모았다.

- **인증 플러그인**: `mysql_native_password`는 8.0.34에서 deprecated, **8.4에서 기본 비활성**, **9.0.0에서 제거**됐다. 8.4에서 해당 플러그인 계정으로 접속하면 `ERROR 1045 (28000)`이고, 그 플러그인으로 계정을 만들거나 바꾸려 하면 `ERROR 1524 (HY000): Plugin 'mysql_native_password' is not loaded`다. 활성화 방법은 기동 옵션 `--mysql-native-password=ON` 하나뿐이다
- **기본 플러그인은 `caching_sha2_password`** 이며 `authentication_policy`로 결정된다. 이 플러그인 계정은 **보안 연결이거나 RSA 키 교환을 지원하는 연결**이어야 한다. 평문 TCP 클라이언트는 `ERROR 2061 (HY000): ... Authentication requires secure connection.`을 받으므로 `--get-server-public-key`가 필요하다
- 8.4.0 이상은 TLSv1.2·TLSv1.3을 준수하지 않거나 순방향 비밀성을 제공하지 않거나 SHA2·AEAD를 쓰지 않는 암호군을 거부한다
- **스키마**: `restrict_fk_on_non_standard_key=ON`이 기본값이라 비유니크·부분 키를 참조하는 FK 생성이 막힌다 (6.4 참고)
- **쿼리 결과**: `GROUP BY`의 `ASC`·`DESC` 한정자는 8.0.13에서 제거됐고 암묵 정렬에 기대면 결과가 달라진다 — `ORDER BY`를 명시한다 (4.5 참고)
- **문자셋**: `utf8mb3`와 별칭 `utf8`은 deprecated다 (3.1 참고)
- **업그레이드 차단 조건**: `FLOAT`·`DOUBLE` 컬럼에 `AUTO_INCREMENT`가 있으면 업그레이드가 `ER_WRONG_FIELD_SPEC`으로 실패한다. 올리기 전에 찾아 고친다
- **기동 실패**: 제거된 시스템 변수를 설정 파일에 남겨 두면 서버가 뜨지 않는다 — `expire_logs_days`(→ `binlog_expire_logs_seconds`), `default_authentication_plugin`(→ `authentication_policy`), `transaction_write_set_extraction`, `log_bin_use_v1_events` 등이다. 공식 문서의 표현은 "Attempting to set any of them in MySQL 8.4 raises an error"다
- **문법 오류가 되는 것**: `LOCK TABLES ... WRITE`의 `LOW_PRIORITY`, 파티셔닝 키에 인덱스 프리픽스 지정, 시스템 변수에 `NULL` 지정
- **도구·클라이언트**: `mysql_upgrade`·`mysqlpump`·`mysql_ssl_rsa_setup`이 제거됐다. `mysql` 클라이언트는 이제 **주석을 보존**한다(과거 동작은 `--skip-comments`) — 주석에 힌트를 넣어 두었다면 서버까지 전달된다
- **비밀번호 검증**: `validate_password`가 플러그인에서 **컴포넌트**로 옮겨졌고 변수명이 점 표기(`validate_password.length`)로 바뀌었다

출처: [MySQL 8.4 Reference Manual — MySQL Releases: Innovation and LTS](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html), [MySQL Connector/J — Connector/J Versions](https://dev.mysql.com/doc/connector-j/en/connector-j-versions.html), [Oracle MySQL EOL Notice](https://www.mysql.com/support/eol-notice.html)
