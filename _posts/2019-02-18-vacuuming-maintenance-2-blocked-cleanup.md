---
date: 2019-02-18 21:14:00 +0900
title: "주기적인 유지관리 Vacuuming #.2 배큠이 dead tuple 을 지우지 못할 때"
category: postgresql
excerpt: "운영에서 배큠이 문제가 되는 순간은 \"배큠이 아예 안 돌았다\"보다 \"배큠이 돌았는데 아무것도 지우지 못했다\" 또는 \"배큠이 시작됐는데 끝나지 않는다\"인 경우가 많습니다. 세 경우를 구분하려면 autovacuum 이 무엇을 보고 테이블을 고르는지부터 봐야 합니다. PostgreSQL 1…"
updated: 2026-09-20
series: "주기적인 유지관리 Vacuuming"
series_index: "2 / 4"
---

**시리즈** · [1. 배큠의 기초와 VACUUM FULL](/writing/vacuuming-maintenance/) · **2. dead tuple 을 지우지 못할 때** · [3. 장애가 되는 경로](/writing/vacuuming-maintenance-3-outages/) · [4. 시간을 줄이는 방법](/writing/vacuuming-maintenance-4-reducing-time/)

## autovacuum 은 무엇을 보고 판단하는가

운영에서 배큠이 문제가 되는 순간은 "배큠이 아예 안 돌았다"보다 "배큠이 돌았는데 아무것도 지우지 못했다" 또는 "배큠이 시작됐는데 끝나지 않는다"인 경우가 많습니다. 세 경우를 구분하려면 autovacuum 이 무엇을 보고 테이블을 고르는지부터 봐야 합니다.

### 발동 공식 (PostgreSQL 18 기준)

PostgreSQL 18 문서가 제시하는 임계 공식은 두 개입니다.

```text
vacuum threshold = Minimum(vacuum max threshold,
                           vacuum base threshold + vacuum scale factor * number of tuples)
vacuum insert threshold = vacuum base insert threshold
                          + vacuum insert scale factor * number of tuples
                            * percent of table not frozen
```

여기서 `percent of table not frozen` 은 `1 - pg_class.relallfrozen / pg_class.relpages` 입니다.

**PG 17 이하와 다른 지점이 두 곳입니다.** 첫째, 첫 공식의 `Minimum(...)` 상한을 만드는 `autovacuum_vacuum_max_threshold` 는 PG 18 신규 파라미터입니다. 둘째, 두 번째 공식의 `percent of table not frozen` 곱은 PG 18 신규 컬럼 `pg_class.relallfrozen` 에 기반합니다. 따라서 PG 17 이하에는 상한도, 아직 frozen 되지 않은 비율만큼 삽입 임계를 줄이는 항도 없습니다. 같은 테이블·같은 워크로드라도 18 로 올리면 배큠이 걸리는 시점 자체가 달라집니다. 파라미터별 기본값과 테이블별 재정의는 [4편](/writing/vacuuming-maintenance-4-reducing-time/)에서 다룹니다.

모니터링 도구가 실제로 쓰는 식은 대개 스케일 팩터 판만 남긴 축약형입니다. Coroot 는 트리거 규칙을 `n_dead_tup >= autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * n_live_tup`(기본 50 + 20%)으로 표기하고, 여기서 **압력 지표** `n_dead_tup / (threshold + scale_factor * n_live_tup)` 를 만들어 정상값을 약 1.0 으로 잡습니다. 경보 조건은 이 값이 2배를 넘고 **동시에** dead 데이터가 512 MiB 이상일 때입니다. 5억 행 테이블의 dead 500만은 사소하지만 600만 행 테이블의 dead 500만은 테이블의 절반이기 때문입니다.

### aggressive vacuum 과 anti-wraparound vacuum

임계와 무관하게 강제로 도는 배큠이 두 종류 있습니다. 문서에 따르면 `relfrozenxid` 가 `autovacuum_freeze_max_age`(기본 2억)보다 오래된 테이블은 "always vacuumed" 이고, 이 강제 실행은 "will happen even if autovacuum is disabled" 입니다. multixact 쪽도 마찬가지입니다. 멤버 저장 공간이 약 10GB 를 넘으면 모든 테이블에 대해 aggressive vacuum 스캔이 더 자주 발생하며, multixact 나이가 오래된 테이블부터 시작합니다. 문서 표현은 "Both of these kinds of aggressive scans will occur even if autovacuum is nominally disabled" 입니다. **`autovacuum_enabled = false` 로 껐다고 안심할 수 없다는 뜻입니다.**

anti-wraparound vacuum(랩어라운드 방지 배큠)에는 운영상 결정적인 성질이 하나 더 있습니다.

> "Autovacuum workers generally don't block other commands. If a process attempts to acquire a lock that conflicts with the `SHARE UPDATE EXCLUSIVE` lock held by autovacuum, lock acquisition will interrupt the autovacuum. **However, if the autovacuum is running to prevent transaction ID wraparound (i.e., the autovacuum query name in the `pg_stat_activity` view ends with `(to prevent wraparound)`), the autovacuum is not automatically interrupted.**"

평소 autovacuum 워커는 충돌 락 요청이 오면 스스로 물러납니다. 그러나 랩어라운드 방지로 돌고 있는 워커는 물러나지 않습니다. 지금 도는 워커가 그 종류인지는 `pg_stat_activity` 의 쿼리 이름이 `(to prevent wraparound)` 로 끝나는지로 확인합니다. Duffel 장애가 정확히 이 성질에서 출발했습니다(뒤의 사례 절).

로그만으로도 구분할 수 있습니다. PG 18 소스에서 배큠 요약 로그의 헤더는 verbose·is_wraparound·aggressive 조합에 따라 다섯 가지입니다.

```text
finished vacuuming "%s.%s.%s": index scans: %d
automatic aggressive vacuum to prevent wraparound of table "%s.%s.%s": index scans: %d
automatic vacuum to prevent wraparound of table "%s.%s.%s": index scans: %d
automatic aggressive vacuum of table "%s.%s.%s": index scans: %d
automatic vacuum of table "%s.%s.%s": index scans: %d
```

첫 줄은 수동 `VACUUM (VERBOSE)` 이고 나머지 네 줄이 autovacuum 입니다. `to prevent wraparound` 가 붙어 있으면 취소되지 않는 그 배큠이며, `aggressive` 가 붙어 있으면 all-visible 페이지까지 훑는 모드입니다. **헤더 한 줄만 읽어도 두 가지를 동시에 판별할 수 있습니다.**
## 배큠이 dead tuple 을 지우지 못하는 이유

### xmin horizon

문서는 MVCC 의 제약을 이렇게 씁니다. "the row version must not be deleted while it is still potentially visible to other transactions. But eventually, an outdated or deleted row version is no longer of interest to any transaction." 즉 dead tuple 을 지울 수 있는지는 배큠이 아니라 **가장 오래된 관심 트랜잭션**이 결정합니다. 이 경계를 xmin horizon(xmin 지평)이라고 부릅니다.

`routine-vacuuming.html` 자체는 "xmin horizon" 이라는 용어를 쓰지 않고 막는 주체를 열거하는 방식으로 설명합니다. 용어가 문서에 등장하는 곳은 `pg_stat_activity.backend_xmin` 의 정의입니다 — "The current backend's `xmin` horizon." Laurenz Albe 의 정의를 빌리면, dead tuple 은 삭제 트랜잭션의 `xmax` 가 **가장 오래된 활성 트랜잭션보다 오래되어야** 제거 대상이 됩니다.

여기서 자주 틀리는 지점이 있습니다. **READ COMMITTED 의 idle 읽기 전용 세션은 horizon 을 붙잡지 않습니다.** 각 문장이 새 스냅숏을 잡기 때문입니다. Coroot 가 이 상황을 재현할 때 일부러 `BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT 1;` 를 idle 로 남긴 이유가 그것입니다. 반대로 말하면 커넥션 목록에서 `idle in transaction` 을 세는 것만으로는 원인을 지목할 수 없고, `backend_xmin`·`backend_xid` 의 나이를 봐야 합니다. 대응 GUC 는 `statement_timeout` 과 `idle_in_transaction_session_timeout` 입니다.

horizon 이 막혀 있을 때 배큠 로그에 남는 신호는 `are dead but not yet removable` 값이 큰 것입니다. 읽는 법은 [3편의 모니터링 절](/writing/vacuuming-maintenance-3-outages/)에서 다룹니다.

### 막는 주체 네 가지와 진단 쿼리

공식 문서(§24.1.5)가 드는 주체는 **세 개**입니다 — prepared transaction, 장시간 트랜잭션, replication slot. `hot_standby_feedback` 은 이 페이지에 없고 `hot-standby.html` 에서 따로 인정합니다. Coroot 는 실무 관점에서 보유자를 **네 소스**로 나눠 계측합니다. `pg_stat_activity` 의 클라이언트 백엔드, 같은 뷰의 walsender, `pg_replication_slots`, `pg_prepared_xacts` 입니다.

**(1) 장시간 트랜잭션 / idle in transaction.** 문서 지침은 "checking `pg_stat_activity` for rows where `age(backend_xid)` or `age(backend_xmin)` is large... or the session can be terminated using `pg_terminate_backend`" 입니다.

```sql
SELECT pid, datname, usename, state, backend_xmin, backend_xid
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL OR backend_xid IS NOT NULL
ORDER BY greatest(age(backend_xmin), age(backend_xid)) DESC;
```

**(2) replication slot.** 문서의 `xmin` 정의가 그대로 답입니다 — "The oldest transaction that this slot needs the database to retain. `VACUUM` cannot remove tuples deleted by any later transaction." `catalog_xmin` 은 시스템 카탈로그에만 영향을 주며 논리 슬롯에서 의미가 있습니다.

```sql
SELECT slot_name, slot_type, database, xmin, catalog_xmin,
       age(xmin) AS xmin_age, age(catalog_xmin) AS catalog_xmin_age,
       active, wal_status, invalidation_reason, inactive_since
FROM pg_replication_slots ORDER BY age(xmin) DESC NULLS LAST;
```

- `invalidation_reason` 은 **PG 18 신규**이며 물리·논리 슬롯 모두에 적용됩니다. 값은 `wal_removed`, `rows_removed`(논리만), `wal_level_insufficient`(논리만), `idle_timeout` 입니다.
- `inactive_since` 는 **PG 17 신규**인데 함정이 있습니다 — "If the slot becomes invalid, this value is never updated again". 무효 슬롯의 liveness 시계로 쓰면 안 됩니다.
- 슬롯을 지울 때의 대가도 문서에 있습니다. "If you drop a slot for a server that still exists and might still try to connect to that slot, that replica may need to be rebuilt."
- `pg_stat_replication_slots` 에는 `xmin`·`catalog_xmin` 이 **없습니다.** 그 뷰는 `spill_*`·`stream_*` 계열 통계뿐이고, xmin 계열은 `pg_replication_slots` 입니다. 흔한 혼동입니다.
- **multixact 는 슬롯이 막지 않습니다** — "replication slots do not directly hold back multixact cleanup."

**(3) `hot_standby_feedback` 을 켠 스탠바이의 장시간 쿼리.** 문서가 프라이머리 블로트를 명시적으로 인정하는 드문 대목입니다.

> "The first option is to set the parameter `hot_standby_feedback`, which prevents `VACUUM` from removing recently-dead rows and so cleanup conflicts do not occur. If you do this, you should note that this **will delay cleanup of dead rows on the primary, which may result in undesirable table bloat**. However, the cleanup situation will be no worse than if the standby queries were running directly on the primary server."

```sql
-- 프라이머리에서 실행
SELECT pid, application_name, client_addr, client_hostname, state, backend_xmin
FROM pg_stat_replication WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC;
```

문서는 스탠바이가 자주 붙었다 끊기면 피드백 공백이 생기니 `max_standby_archive_delay`·`max_standby_streaming_delay` 를 올리라고 권고합니다. 이 두 GUC 는 `-1` 이 "wait forever" 를 뜻하고, **프라이머리에 설정하면 효과가 없습니다** — "have no effect if set on the primary". 옛 조언인 `vacuum_defer_cleanup_age` 상향은 **PG 16 에서 이 GUC 가 제거되어 무효**입니다.

**(4) 방치된 prepared transaction(2PC).** `PREPARE TRANSACTION` 의 Caution 이 직접 경고합니다.

> "It is unwise to leave transactions in the prepared state for a long time. This will interfere with the ability of `VACUUM` to reclaim storage, and **in extreme cases could cause the database to shut down to prevent transaction ID wraparound**. Keep in mind also that the transaction continues to hold whatever locks it held."

```sql
SELECT gid, prepared, owner, database, transaction AS xmin
FROM pg_prepared_xacts ORDER BY age(transaction) DESC;
-- 해제: COMMIT PREPARED '<gid>' / ROLLBACK PREPARED '<gid>'
```

외부 트랜잭션 매니저를 쓰지 않는다면 문서 권고는 `max_prepared_transactions` 를 0 으로 두는 것입니다. 이 뷰는 조회할 때 내부 트랜잭션 매니저 구조를 잠시 잠그므로 "frequently accessed" 하면 성능에 영향이 있다는 주의도 붙어 있습니다.

논리 디코딩 지연도 `catalog_xmin` 을 통해 같은 경로로 작용합니다. 지연 자체는 `pg_stat_replication_slots` 의 `spill_*`(=`logical_decoding_work_mem` 초과분을 디스크로 쏟은 양)·`stream_*` 로 보고, WAL 보유·무효화 위험은 `restart_lsn`·`wal_status`·`safe_wal_size`·`invalidation_reason` 으로 봅니다. **"디코딩 지연 몇 초 또는 몇 GB 를 넘으면 위험"류의 임계값은 공개된 근거가 없습니다** — 임의의 숫자를 알람에 박지 말고 xmin 나이 자체를 지표로 쓰는 편이 안전합니다.

### 락 충돌로 끝나지 못하는 autovacuum

문서는 이 경우를 명시적으로 경고합니다. "Regularly running commands that acquire locks conflicting with a `SHARE UPDATE EXCLUSIVE` lock (e.g., ANALYZE) can effectively **prevent autovacuums from ever completing**." 표준 VACUUM 이 잡는 락이 `SHARE UPDATE EXCLUSIVE` 이므로, 이와 충돌하는 명령을 주기적으로 돌리는 테이블은 배큠이 영구히 완주하지 못할 수 있습니다.

| 락 | autovacuum 을 방해하는 명령 |
|---|---|
| `SHARE UPDATE EXCLUSIVE` | `ANALYZE`, `CREATE INDEX CONCURRENTLY`, `CREATE STATISTICS`, `COMMENT ON`, `REINDEX CONCURRENTLY`, 일부 `ALTER TABLE`·`ALTER INDEX` |
| `SHARE` | plain `CREATE INDEX` |
| `SHARE ROW EXCLUSIVE` | `CREATE TRIGGER`, 일부 `ALTER TABLE` |
| `EXCLUSIVE` | `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| `ACCESS EXCLUSIVE` | `DROP TABLE`, `TRUNCATE`, plain `REINDEX`, `CLUSTER`, `VACUUM FULL`, non-concurrent `REFRESH MATERIALIZED VIEW`, 다수 `ALTER TABLE`·`ALTER INDEX`, 모드 미지정 `LOCK TABLE` |

일반 `SELECT` 과 DML 이 잡는 `ACCESS SHARE`·`ROW SHARE`·`ROW EXCLUSIVE` 는 충돌하지 않습니다. 어떤 `ALTER TABLE` 변형이 어떤 락인지는 문서가 이 페이지에서 열거하지 않고 각 명령 레퍼런스로 넘깁니다.

취소는 락 대기자 쪽에서 일어납니다. `ProcSleep()` 이 `deadlock_state == DS_BLOCKED_BY_AUTOVACUUM` 이고 `allow_autovacuum_cancel` 일 때만 다음 조건을 검사합니다.

```c
/* Only do it if the worker is not working to protect against Xid wraparound. */
if ((statusFlags & PROC_IS_AUTOVACUUM) && !(statusFlags & PROC_VACUUM_FOR_WRAPAROUND))
```

조건을 통과하면 `kill(pid, SIGINT)` 를 보냅니다. 취소는 **한 번만** 시도합니다(`allow_autovacuum_cancel` 을 클리어해 "prevent signal from being sent again more than once"). 실패하면 `"could not send signal to process %d: %m"` 이 남습니다.

**운영에서 가장 아픈 함정은 이 취소가 로그에 안 남는다는 것입니다.** 취소를 보낸 쪽 메시지는 **DEBUG1** 입니다.

```text
sending cancel to blocking autovacuum PID %d
Process %d waits for %s on %s.
```

기본 `log_min_messages`(warning)에서는 보이지 않습니다. 추적하려면 `log_min_messages = debug1` 이 필요합니다. Duffel 도 "autovacuum start events aren't logged" 를 교훈으로 남겼습니다. 반면 기본 설정에서도 남는 것들은 다음과 같습니다.

| 상황 | 로그 문자열 | SQLSTATE |
|---|---|---|
| 취소된 워커 쪽 | `ERROR: canceling autovacuum task` + `CONTEXT: automatic analyze of table "dbname.schemaname.tablename"` (배큠이면 CONTEXT 가 vacuum) | 57014 query_canceled |
| 락을 못 잡아 건너뜀 | `LOG: skipping vacuum of "mytable" --- lock not available` | 55P03 lock_not_available |
| 관리자 명령·재시작 | `FATAL: terminating autovacuum process due to administrator command` | — |

`log_autovacuum_min_duration` 이 `-1` 이 아니면 "a message will be logged if an autovacuum action is **skipped due to a conflicting lock or a concurrently dropped relation**" 라는 보장이 추가로 붙습니다. 지금 누가 락을 쥐고 있는지는 아래로 확인합니다.

```sql
SELECT * FROM pg_locks WHERE relation = 'mytable'::regclass;
```

실무 대응으로 Citus 가 권하는 것은 락 경쟁이 심한 테이블에 **수동 `VACUUM`** 을 쓰는 것입니다. autovacuum 워커는 락을 못 잡으면 스스로 물러나지만 "a manual run won't terminate itself" 이기 때문입니다.

### 블로트를 측정하는 방법

가장 먼저 보게 되는 `pg_stat_user_tables` 의 두 컬럼은 **추정값**입니다. 문서 정의가 각각 "**Estimated** number of live rows", "**Estimated** number of dead rows" 입니다. 블로트 판정을 이 두 값에만 걸면 안 됩니다.

| 컬럼 | 의미 | 비고 |
|---|---|---|
| `n_live_tup` / `n_dead_tup` | 추정 live·dead 행 수 | 추정값 |
| `n_ins_since_vacuum` | 마지막 배큠 이후 삽입 추정 행 수 | 삽입 임계와 짝 |
| `n_tup_hot_upd` | "updates where no successor versions are required in indexes" | |
| `n_tup_newpage_upd` | 후속 버전이 새 힙 페이지로 간 UPDATE. "These are always non-HOT updates." | **PG 16 신규** |
| `total_vacuum_time` / `total_autovacuum_time` | 배큠 누적 시간(ms). "(This includes the time spent sleeping due to cost-based delays.)" | **PG 18 신규** |

`pg_stat_xact_all_tables` 에는 live·dead 및 배큠 관련 컬럼이 없습니다. 트리아지용으로는 Albe 가 쓰는 정렬식이 편합니다 — `pg_stat_all_tables` 를 `n_dead_tup / (n_live_tup * autovacuum_vacuum_scale_factor + autovacuum_vacuum_threshold)` 로 정렬해 상위 10개를 봅니다. 판독법이 함께 있습니다. 전부 0 또는 NULL 이면 통계 수집 자체에 문제가 있는 것이고, 상위 테이블의 `last_autovacuum` 이 NULL 이면 autovacuum 을 더 공격적으로 만들어야 한다는 신호입니다.

```sql
SELECT last_autovacuum, autovacuum_count, vacuum_count FROM pg_stat_user_tables;
```

정확한 값이 필요하면 `pgstattuple` 입니다. 기본 권한은 슈퍼유저와 `pg_stat_scan_tables` 롤입니다.

| 함수 | 스캔 방식 | 정확도 |
|---|---|---|
| `pgstattuple(regclass)` | **전체 테이블 스캔**, read lock 만 | 정확값. 단 "results are not an instantaneous snapshot" |
| `pgstattuple_approx(regclass)` | visibility map 으로 페이지 스킵, FSM 으로 free space 추정 | **dead 계열만 정확**, live·free 는 `approx_*`. `scanned_percent` 로 스캔 비율 노출 |
| `pgstatindex(regclass)` | 인덱스 전체 페이지 | 순간 스냅숏 아님. `index_size` 는 metapage 포함이라 페이지 합보다 1 큼 |

`pgstattuple` 의 퍼센트 합이 100 이 안 되는 이유도 문서에 있습니다 — "`table_len` is always greater than `tuple_len + dead_tuple_len + free_space`". 페이지 고정 오버헤드, line pointer 배열, 정렬 패딩 때문입니다. `pgstatindex` 의 `avg_leaf_density`·`leaf_fragmentation` 은 **문서가 계산식을 정의하지 않습니다.** "값이 낮으면 `REINDEX` 후보" 같은 해석도 문서에 없으므로, 이 두 값을 임계로 자동화하는 것은 근거 없는 규칙을 만드는 일입니다.

`pg_freespacemap` 은 한계를 알고 써야 합니다. 값이 "not exact. They're rounded to precision of 1/256th of `BLCKSZ`(기본 `BLCKSZ` 에서 32바이트)" 이고 "not kept fully up-to-date as tuples are inserted and updated" 입니다. **인덱스에는 사실상 무의미**합니다 — 인덱스에서 추적하는 것은 페이지 내 free space 가 아니라 완전히 안 쓰는 페이지 여부뿐입니다.

공개 블로트 추정 쿼리는 두 갈래입니다. PostgreSQL 위키의 "Show database bloat" 는 `check_postgres` 에서 온 것으로 `tbloat`·`wastedbytes`·`ibloat`·`wastedibytes` 를 냅니다. 위키 자신이 "for informational purposes only", "loose estimate" 라고 못박고 정확한 값은 `pgstattuple`·`pg_freespacemap` 을 쓰라고 안내하며, **페이지 최종 수정이 2015-10-06 으로 10년 이상 갱신이 없습니다.** 대안으로 위키가 권하는 ioguix/pgsql-bloat-estimation 은 한계를 문서화해 둔 편입니다. `is_na` 로 통계 신뢰 불가 행을 표시하지만 **TOAST 는 통계가 없어 "might be largely underestimated, even leading to negative bloat for some tables" 이며 `is_na` 로도 안 잡힙니다.** 정렬 패딩은 분리할 수 없어 늘 블로트에 합산되며 "up to 10% or more of the table size" 가 될 수 있고, 작은 관계는 과대평가됩니다 — 문서의 예시가 "150 rows across 2 pages yields a natural bloat of 4kB, 25% of your table" 입니다.

**블로트가 성능을 떨어뜨린다는 말은 경로별로 근거의 무게가 다릅니다.** 배큠 자체의 소요 시간이 커지는 것은 측정 자료가 있고(다음 절), 버퍼 캐시 오염은 문서가 명시한 경로입니다. 반면 "테이블 블로트로 순차 스캔이 느려진다", "블로트가 btree `tree_level` 을 늘려 지연이 커진다", "블로트가 플래너 통계를 왜곡한다"는 **공개된 측정 자료가 없습니다.** 페이지 분할이 위로 연쇄되고 루트 분할 시 레벨이 늘어난다는 것은 문서에 있는 사실이지만, 그것이 실제 지연을 얼마나 늘리는지는 수치로 뒷받침되지 않습니다. 이 대목을 근거로 무언가를 결정하기 전에 자기 환경에서 재 보는 편이 낫습니다.
## 배큠 자체가 성능을 떨어뜨리는 경로

**첫째, 수동 배큠에는 기본 스로틀이 없습니다.** cost-based delay 는 누적 코스트가 `vacuum_cost_limit` 에 닿을 때 `vacuum_cost_delay` 만큼 재우는 방식인데, 문서 표현대로 "This feature is **disabled by default for manually issued `VACUUM` commands**" 입니다.

`vacuum_cost_delay` 기본값이 `0` 이라서 그렇습니다. 스로틀이 걸리는 것은 autovacuum 뿐이고, 그쪽 기본값은 `autovacuum_vacuum_cost_delay = 2ms` 입니다. 파라미터 전체와 기본값은 뒤의 튜닝 절에 정리했습니다.

실제 sleep 은 `vacuum_cost_delay * accumulated_balance / vacuum_cost_limit` 이며 상한은 `vacuum_cost_delay * 4` 입니다. 그리고 중요한 예외가 있습니다 — "Cost-based vacuum delays do not occur during such operations"(중요 락을 쥔 구간). 그래서 누적 코스트가 지정 한도를 훨씬 넘길 수 있습니다. 장애 대응 중 손으로 `VACUUM` 을 돌리는 것은 I/O 제한을 스스로 해제하는 행위라는 점을 기억해야 합니다.

**둘째, 스로틀 없는 배큠은 WAL 을 폭증시켜 복제와 커밋을 멈출 수 있습니다.** 2026년 4월 Jeremy Schneider 가 공개한 진단이 이 경로를 끝까지 추적했습니다. 증상은 "unexplained, intermittent application performance problems" 였고 레이턴시 스파이크가 시스템 전반의 큐를 부풀렸습니다. 추적 경로는 이렇습니다.

1. wait event 와 top SQL → `COMMIT` 스파이크가 **`IPC:SyncRep`** 에 몰림. "periodic spikes of hundreds of connections waiting on IPC:SyncRep"
2. 네트워크 모니터링 → 프라이머리와 레플리카 사이 트래픽 버스트가 시각적으로 일치
3. **`pg_walinspect`**(PG 16)로 resource manager 별 WAL 분해 → `XLOG` 급증, 정확히는 full-page image
4. 덤프가 특정 **40GB toast 테이블**에서 순차적으로 나온 **`FPI_FOR_HINT`** 블록에 지배됨. `pg_stat_statements` 상 그 테이블에는 INSERT 만 있었음
5. autovacuum 로그의 실행 시각이 "aligned perfectly with each WAL storm"
6. 체크포인트는 배제 — WAL 스파이크보다 훨씬 자주 발생하고 시각 상관이 없었음

메커니즘은 full page write 입니다. 체크포인트 후 페이지의 첫 쓰기는 torn write 방어로 페이지 전체가 WAL 에 들어갑니다("the OS block size usually doesn't align with the database block size"). **힌트 비트만 바뀌어도 8KB 블록 전체가 WAL 로 나갑니다.** 최근 기록된 행을 읽는 평범한 `SELECT` 도, 배큠도 이를 유발하므로 대형 append-only 테이블과 스로틀 없는 배큠이 만나면 WAL 이 폭증합니다.

글이 제시한 수치는 성격이 나뉩니다. "roughly 20,000 tuple ins/upd/del per second can dirty 10GB in one minute with hints" 는 저자가 밝힌 냅킨 계산이고, 측정된 것은 실제 워크로드의 쓰기 속도(한쪽은 약 20k tuples/s, 다른 쪽은 "over 30k/s")입니다. 조치는 `autovacuum_vacuum_cost_delay` 를 **기본값 2ms 로 되돌린 것**이고, 결과는 autovacuum 의 XLOG 레코드가 "more spread out" 되고 WAL 양이 안정되고 복제가 유지되며 전체 스루풋이 올랐다는 **정성적 서술**입니다. IOPS 절대치나 처리량 수치는 제시되지 않았습니다. 저자는 큰 서버에서 delay 0 이 "won't do anything that bad" 라던 자신의 예전 판단을 "completely wrong" 이라고 정정하고, **1ms 만으로도** WAL 홍수를 막는다고 적었습니다.

그래서 Sentry 가 2015년 사고 직후 공개한 설정에 들어 있던 `autovacuum_vacuum_cost_delay = 0` 은 **지금 그대로 따라 쓸 설정이 아닙니다.** 2026년 진단과 정면으로 충돌합니다. 코멘트에서 Shaun Thomas 가 정리한 대로 delay 0 은 cost-based 시스템 자체를 끄는 것이며 극단적인 NVMe 하드웨어에서만 고려할 선택지입니다.

**셋째, 배큠은 버퍼 캐시를 밀어냅니다.** `VACUUM`·`ANALYZE` 는 링 버퍼(Buffer Access Strategy)를 쓰고 크기는 `vacuum_buffer_usage_limit`(기본 **2MB**, PG 16 도입·PG 17 에서 2MB 로 인상)이 정합니다. 문서 경고는 "Higher settings can allow `VACUUM` and `ANALYZE` to run more quickly, but having too large a setting **may cause too many other useful pages to be evicted from shared buffers**" 입니다. 실제 발생량은 `pg_stat_io` 의 `context='vacuum'` 에서 `evictions`(공유 버퍼에서 밀어내 링 버퍼에 넣은 횟수)와 `reuses`(링 버퍼 내 재사용)로 확인합니다.

**넷째, 인덱스 수가 I/O 를 배로 늘립니다.** Percona Community 의 Pep Pla 가 2026년 7월 공개한 벤치마크(PG 18.4, 4 vCPU, 15 GiB, SSD, `shared_buffers=4GB`, 36조합 × 10회 = 360런의 중앙값)는 인덱스 0→5 개에서 배큠 소요를 `21.8 → 28.1 → 32.6 → 37.6 → 42.3 → 47.4`초로 측정했습니다 — 인덱스당 약 5초입니다. 블록 접근에서 더 중요한 발견이 나옵니다. **인덱스가 0개에서 1개가 되는 순간 힙 접근이 374,903 → 547,323 으로 뜁니다.** 인덱스 클린업이 **두 번째 힙 패스**를 강제하기 때문입니다. dead 가 앞쪽 페이지에 몰린 경우(compact) 힙 접근은 더 적은데도 인덱스 블록은 인덱스당 약 +109,533 으로 약 4배 빠르게 늘어납니다. 저자 해석은 btree 리프 페이지가 통째로 비어 page deletion·recycling 이 필요해지기 때문입니다. 인덱스가 늘면 2MB 링 버퍼가 넘쳐 워커가 직접 페이지를 쓰고 evict 하기 시작합니다(spread 50% 기준 0, 27k, 54k, 82k, 109k, 136k 페이지).

이 벤치마크를 넘겨 인용하면 안 되는 부분도 분명합니다. 동시 워크로드가 전혀 없어 블로트의 쿼리 성능 영향은 측정하지 않았고, **WAL 발생량은 보고되지 않았으며**, cost delay·limit 스윕과 워커 수 변화가 없고, 데이터가 전부 메모리에 들어가는 크기라 I/O bound 상황이 아닙니다. 5개 동일 정수 인덱스라는 인위적 형태이므로 넓은 인덱스·복합 인덱스·text 인덱스로 외삽할 수 없습니다.

**다섯째, 스탠바이에서는 배큠이 쿼리를 죽입니다.** 문서가 드는 배큠 관련 복구 충돌은 두 종류입니다. "Application of a vacuum cleanup record from WAL conflicts with standby transactions whose snapshots can still 'see' any of the rows to be removed" 와, 제거 대상이 보이는지와 무관하게 "conflicts with queries accessing the target page on the standby" 입니다. index-only scan 때문에 범위가 더 넓어집니다 — "**even running `VACUUM` against a table with no updated or deleted rows requiring cleanup might lead to conflicts**". 스탠바이 쪽에는 `canceling statement due to conflict with recovery` 가 남고, 락을 쥔 idle 트랜잭션과 충돌하면 세션이 종료됩니다. 감시 지점은 `pg_stat_database_conflicts` 와 `log_recovery_conflict_waits` 입니다.
