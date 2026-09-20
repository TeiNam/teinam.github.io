---
date: 2019-06-10 13:57:42 +0900
title: "MySQL 쿼리 실행 구조"
category: mysql
excerpt: "MySQL 쿼리는 파서 → 전처리기 → 옵티마이저 → 실행 엔진 → 스토리지 엔진 순서로 처리됩니다. 옵티마이저는 비용 기반으로 최적의 실행 계획을 선택하며, MySQL 8.0 이후 히스토그램과 해시 조인 같은 기능이 추가되었습니다."
last_modified_at: 2026-09-20
---

> **NOTE** — 이 글은 MySQL 8.4 LTS 및 9.7 LTS 기준으로 작성되었습니다. MySQL 8.0은 2026년 4월 21일부로 Oracle Sustaining Support로 전환되었습니다. **쿼리 캐시는 MySQL 8.0에서 제거되었으므로** 이 문서에서 다루지 않습니다.

{% include diagram.html src="mysql-query-path.svg" caption="MySQL 쿼리 실행 흐름 — 클라이언트 요청부터 결과 반환까지 단계별 처리 과정" %}

## 쿼리 실행 구조 구성 요소

- **파서(Parser)** — 사용자의 요청으로 들어온 쿼리 문장을 토큰으로 분리해 트리 형태의 구조로 만드는 작업입니다. 쿼리의 기본 문법 오류는 이 단계에서 발견되며 사용자에게 오류 메시지를 통보합니다.

- **전처리기(Pre-processor)** — 파서 과정에서 만들어진 파서 트리를 기반으로 쿼리 문장에 구조적인 문제점이 있는지 확인합니다. 각 토큰을 테이블 이름이나 컬럼 이름 또는 내장 함수와 같은 개체에 매핑해 해당 객체의 존재 여부와 접근 권한 등을 확인하는 과정을 이 단계에서 수행합니다.

- **옵티마이저(Optimizer)** — 사용자가 요청한 쿼리를 가장 낮은 비용(cost)으로 가장 빠르게 처리할지 결정하는 역할을 담당하는데, 데이터베이스(DB)의 두뇌 역할을 하며 매우 중요합니다. 대부분의 MySQL 튜닝은 옵티마이저가 선택하는 방법을 이해하고, 최적의 실행 계획을 유도하기 위한 것입니다.

- **실행 엔진(Execution Engine)** — 옵티마이저가 만든 실행 계획에 따라 핸들러(Handler)에게 요청을 전달합니다. 만들어진 계획대로 각 핸들러에게 요청해서 받은 결과를 또 다른 핸들러 요청의 입력으로 연결하는 역할을 수행합니다.

- **핸들러(Handler, 스토리지 엔진)** — MySQL 실행 엔진의 요청에 따라 데이터를 디스크로 저장하고 디스크로부터 읽어 오는 역할을 담당합니다. InnoDB, MyISAM 등의 스토리지 엔진이 이 계층에 해당합니다.

## 옵티마이저 동작 방식

MySQL 옵티마이저는 **비용 기반(Cost-based) 최적화**를 수행합니다. 여러 실행 계획의 예상 비용을 계산하고 가장 낮은 비용의 계획을 선택합니다.

### optimizer_switch 플래그

`optimizer_switch` 시스템 변수로 옵티마이저 동작을 제어할 수 있습니다. MySQL 8.0 이후 추가된 주요 플래그는 다음과 같습니다:

- `hash_join=on` — 해시 조인 사용 (8.0.18 추가, 8.4에서는 `block_nested_loop`로 제어)
- `prefer_ordering_index=on` — `ORDER BY`/`GROUP BY` + `LIMIT` 사용 시 정렬된 인덱스 선호
- `hash_set_operations=on` — `EXCEPT`/`INTERSECT` 연산에 해시 테이블 사용
- `skip_scan=on` — Skip Scan 범위 접근 방식 사용
- `derived_condition_pushdown=on` — 파생 테이블로 조건 푸시다운

전체 플래그 목록은 다음 명령으로 확인할 수 있습니다:

```sql
SELECT @@optimizer_switch\G
```

### 히스토그램 통계

MySQL 8.0.3부터 **히스토그램 통계**를 지원합니다. 인덱스가 없는 컬럼에 대해 데이터 분포 정보를 수집하여 옵티마이저가 더 정확한 행 수 예측을 할 수 있게 합니다.

히스토그램은 `ANALYZE TABLE` 문으로 생성합니다:

```sql
ANALYZE TABLE orders UPDATE HISTOGRAM ON amount WITH 256 BUCKETS;
```

히스토그램 정보는 `INFORMATION_SCHEMA.COLUMN_STATISTICS` 뷰에서 조회할 수 있습니다. 히스토그램은 singleton(개별 값) 또는 equi-height(값 범위) 두 가지 타입으로 생성됩니다.

## 실행 계획 확인

### EXPLAIN

`EXPLAIN` 문으로 쿼리의 실행 계획을 확인할 수 있습니다. 여러 출력 형식을 지원합니다:

```sql
-- 기본 테이블 형식
EXPLAIN SELECT * FROM orders WHERE amount > 100;

-- 트리 형식 (해시 조인 표시)
EXPLAIN FORMAT=TREE SELECT * FROM t1 JOIN t2 ON t1.id = t2.id;

-- JSON 형식 (상세한 비용 정보)
EXPLAIN FORMAT=JSON SELECT * FROM orders WHERE status = 'pending';
```

### EXPLAIN ANALYZE

MySQL 8.0.18부터 `EXPLAIN ANALYZE`를 지원합니다. 쿼리를 실제로 실행하고 예상 비용과 실제 실행 시간을 함께 보여줍니다:

```sql
EXPLAIN ANALYZE SELECT * FROM t1 JOIN t2 ON t1.c1 = t2.c2\G
```

출력에는 다음 정보가 포함됩니다:

- 예상 실행 비용 및 예상 행 수
- 첫 번째 행 반환 시간
- 실제 실행 시간 (밀리초, 평균값)
- 실제 반환된 행 수 및 루프 횟수

`EXPLAIN ANALYZE`는 항상 `TREE` 형식으로 출력되며, `SELECT`, `UPDATE`, `DELETE`, `TABLE` 문에서 사용할 수 있습니다.
