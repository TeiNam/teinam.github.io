---
title: "5. 트랜잭션과 락"
permalink: /docs/database/mysql-for-developers/transactions-and-locks/
breadcrumb: "Docs / Database / MySQL for Developers"
description: "MySQL 개발 가이드 — 격리 수준과 락 범위, 데드락 회피"
last_modified_at: 2026-09-20
guide: mysql-for-developers
order: 5
nav_title: "트랜잭션과 락"
---

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
