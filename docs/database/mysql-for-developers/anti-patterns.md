---
title: "6. MySQL 안티패턴 (하지 말아야 할 것들)"
permalink: /docs/database/mysql-for-developers/anti-patterns/
breadcrumb: "Docs / Database / MySQL for Developers"
description: "MySQL 개발 가이드 — 자주 쓰이지만 피해야 하는 설계"
last_modified_at: 2026-09-20
guide: mysql-for-developers
order: 6
nav_title: "안티패턴"
---

### 6.1 `COUNT(*)`를 존재 검증 로직에 사용

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
> - **FK 액션은 트리거를 발동시키지 않는다.** `ON DELETE CASCADE`로 지워진 자식 행에는 감사·동기화 트리거가 실행되지 않는다 (7.3 참고)
> - 8.4는 `restrict_fk_on_non_standard_key=ON`이 기본값이다. 비유니크 키나 부분 키를 참조하는 FK 생성이 막히므로, **8.0에서 통과했던 스키마가 8.4에서 거부될 수 있다.** 업그레이드 전에 FK가 참조하는 키가 유니크 전체 키인지 확인한다

> **TIP** — 대안
>
> FK 제약을 **애플리케이션 레벨**에서 관리하면 대규모·분산·마이그레이션 잦은 환경에서 더 유연하고 성능 최적화 여지가 크다. 단 이 판단은 공식 권고가 아니라 운영 환경에 따른 트레이드오프다.

> **INFO** — 균형 잡힌 시각: FK를 무조건 배제할 필요는 없다
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
