---
date: 2019-02-18 21:15:00 +0900
title: "주기적인 유지관리 Vacuuming #.3 배큠 시간이 늘어나 장애가 될 때"
category: postgresql
excerpt: "배큠이 오래 걸리는 이유를 dead tuple 개수로 설명하는 것은 대개 틀립니다. 2편에서 본 Percona 벤치마크에서 dead 개수는 같고 분포만 다르게 두었을 때의 결과가 이를 보여줍니다(인덱스 0개, 1000만 행 × 128B ≈ 172,414 힙 페이지 ≈ 1.3GB, VA…"
last_modified_at: 2026-09-20
series: "주기적인 유지관리 Vacuuming"
series_index: "3 / 4"
---

**시리즈** · [1. 배큠의 기초와 VACUUM FULL](/writing/vacuuming-maintenance/) · [2. dead tuple 을 지우지 못할 때](/writing/vacuuming-maintenance-2-blocked-cleanup/) · **3. 장애가 되는 경로** · [4. 시간을 줄이는 방법](/writing/vacuuming-maintenance-4-reducing-time/)

## 배큠 시간이 늘어나 장애가 되는 경로

배큠이 오래 걸리는 이유를 dead tuple 개수로 설명하는 것은 대개 틀립니다. [2편에서 본 Percona 벤치마크](/writing/vacuuming-maintenance-2-blocked-cleanup/)에서 dead **개수는 같고 분포만 다르게** 두었을 때의 결과가 이를 보여줍니다(인덱스 0개, 1000만 행 × 128B ≈ 172,414 힙 페이지 ≈ 1.3GB, `VACUUM FREEZE` 로 all-visible·all-frozen 상태에서 시작, DELETE 로만 dead 생성).

| dead | compact(앞 10% 페이지 집중) | spread(전 페이지 분산) | 비율 |
|---|---|---|---|
| 10%(100만) | 5.0초 | 43.6초 | **8.7배** |
| 25%(250만) | 11.5초 | 43.6초 | 3.8배 |
| 50%(500만) | 21.8초 | 43.4초 | 2.0배 |

spread 쪽은 dead 가 5배 늘어도 시간이 거의 변하지 않습니다. **비용을 정하는 것은 방문해야 하는 페이지 수입니다.** 저자 결론은 "dirty pages is the main cost driver for autovacuum, followed by the number of indexes" 입니다. 넓게 흩어진 소량의 UPDATE·DELETE 가 한 파티션에 몰린 대량 삭제보다 배큠을 오래 붙잡을 수 있다는 뜻입니다.

### 랩어라운드로 쓰기가 멈추는 순서

시간 순으로 네 단계입니다.

1. 테이블 `relfrozenxid` 나이가 `autovacuum_freeze_max_age`(기본 2억)를 넘으면 강제 autovacuum 이 걸립니다. autovacuum 을 껐어도 실행되고, 랩어라운드 방지 배큠이므로 락 충돌로 취소되지 않습니다.
2. 나이가 `vacuum_failsafe_age`(기본 16억)를 넘으면 failsafe 가 발동해 배큠이 스로틀과 인덱스 정리를 버립니다(다음 절).
3. 랩어라운드까지 남은 트랜잭션이 경고 임계 아래로 내려가면 WARNING 이 로그에 반복됩니다.
4. 하드 리밋 아래로 내려가면 새 트랜잭션 ID 를 요구하는 문장이 거부됩니다.

**3·4 의 임계와 문구는 PG 14 에서 모두 바뀌었습니다.** 릴리스 노트 표현은 "Increase warning time and hard limit before transaction id and multi-transaction wraparound" 입니다.

| | PG 13 이하 | PG 14 이상 (PG 18 문서 확인) |
|---|---|---|
| WARNING 시작 | 랩어라운드까지 **1,100만** | **4,000만** |
| 쓰기 거부 | 남은 트랜잭션 **100만** 미만 | 남은 트랜잭션 **300만** 미만 |

경고 로그는 버전별로 이렇게 다릅니다. PG 14 이상:

```text
WARNING:  database "mydb" must be vacuumed within 39985967 transactions
HINT:  To avoid XID assignment failures, execute a database-wide VACUUM in that database.
```

PG 13 이하:

```text
WARNING:  database "mydb" must be vacuumed within 10985967 transactions
HINT:  To avoid a database shutdown, execute a database-wide VACUUM in that database.
```

쓰기 거부 상태의 에러도 다릅니다. PG 14 이상:

```text
ERROR:  database is not accepting commands that assign new transaction IDs to avoid wraparound data loss in database "mydb"
HINT:  Execute a database-wide VACUUM in that database.
```

PG 13 이하(2022년 BattleMetrics 장애에서 실제 관측된 형태):

```text
ERROR: database is not accepting commands to avoid wraparound data loss in database "battlemetrics"
HINT: Stop the postmaster and vacuum that database in single-user mode.
```

**HINT 가 지시하는 복구 방법 자체가 버전에 따라 반대입니다.** 문구를 검색해 나온 오래된 글을 그대로 따르면 최신 서버에서 불필요한 셧다운을 하게 됩니다.

이 상태에서 되는 것과 안 되는 것은 문서에 명확합니다 — "any transactions already in progress can continue, but **only read-only transactions can be started**. Operations that modify database records **or truncate relations** will fail. **The `VACUUM` command can still be run normally.**"

PG 18 문서의 권장 복구 순서는 [2편의 진단](/writing/vacuuming-maintenance-2-blocked-cleanup/) 그대로입니다. `pg_prepared_xacts` 의 오래된 항목을 commit 또는 rollback 하고, `pg_stat_activity` 의 오래된 세션을 `pg_terminate_backend` 하고, `pg_replication_slots` 의 오래된 슬롯을 drop 한 뒤, 데이터베이스 전역 `VACUUM` 을 돌립니다. 여기서 문서가 명시적으로 **금지**하는 것이 두 개입니다.

> "Do not use `VACUUM FULL` in this scenario, because it **requires an XID and will therefore fail**, except in super-user mode, where it will instead **consume an XID and thus increase the risk** of transaction ID wraparound. **Do not use `VACUUM FREEZE` either.**"

그리고 PG 18 문서는 single-user mode 를 사실상 권하지 않습니다 — "it is **not necessary or desirable** to stop the postmaster or enter single user-mode in order to restore normal operation". 유일한 이유는 배큠할 필요를 없애기 위해 불필요한 테이블을 `TRUNCATE` 또는 `DROP` 하려는 경우이고, "The three-million-transaction safety margin exists to let the administrator do this" 입니다. PG 13 이하 문서는 반대로 single-user mode 를 유일한 방법으로 안내합니다.

현재 위치를 확인하는 쿼리는 문서가 직접 제시합니다.

```sql
SELECT c.oid::regclass as table_name,
       greatest(age(c.relfrozenxid), age(t.relfrozenxid)) as age
FROM pg_class c
LEFT JOIN pg_class t ON c.reltoastrelid = t.oid
WHERE c.relkind IN ('r', 'm');

SELECT datname, age(datfrozenxid) FROM pg_database;
```

단 실사례가 예외를 보여줍니다. BattleMetrics(2022)는 single-user mode 없이 full vacuum 을 시도했다가 약 30분 뒤 인덱스 손상으로 실패했고, `DROP INDEX` 마저 **같은 랩어라운드 에러로 거부**되었습니다(DDL 도 XID 를 필요로 하기 때문입니다). 결국 셧다운 후 single-user mode 에서 손상 인덱스를 DROP 하고 재시작해야 했습니다. **배큠이 실패하는 원인이 손상이면 최신 문서의 경로도 막힙니다.**

### failsafe 가 발동하면 무엇이 달라지는가

| 파라미터 | 기본값 | 클램프 | 설정 위치 |
|---|---|---|---|
| `vacuum_failsafe_age` | **16억** 트랜잭션 | 0~21억 설정 가능하나 "silently adjust the effective value to no less than 105% of `autovacuum_freeze_max_age`" | postgresql.conf (**reloption 없음**) |
| `vacuum_multixact_failsafe_age` | **16억** multixact | `autovacuum_multixact_freeze_max_age` 의 105% | 동일 |

문서는 이를 "`VACUUM`'s **strategy of last resort**" 로 부르고, 보통은 랩어라운드 방지 autovacuum 이 한동안 돌고 있을 때 발동하지만 "it's possible for the failsafe to trigger during **any** `VACUUM`" 이라고 덧붙입니다.

발동 시 동작은 XID 판과 multixact 판의 **문서 문구가 다릅니다.** `vacuum_failsafe_age` 는 "any cost-based delay that is in effect will no longer be applied, further non-essential maintenance tasks (such as index vacuuming) are bypassed, and **any Buffer Access Strategy in use will be disabled resulting in `VACUUM` being free to make use of all of shared buffers**" 입니다. `vacuum_multixact_failsafe_age` 쪽에는 **Buffer Access Strategy 문장이 없습니다.**

도입 커밋(PG 14)에서 확인되는 내부 동작은 다음과 같습니다. `lazy_check_wraparound_failsafe()` 가 `do_index_vacuuming = false`, `do_index_cleanup = false`, `do_failsafe = true`, `VacuumCostActive = false`, `VacuumCostBalance = 0` 을 세웁니다. 병렬 인덱스 배큠도 같은 게이트에 걸려 비활성화되고, **힙 배큠도 결과적으로 스킵됩니다** — `lazy_vacuum_heap_rel()` 은 인덱스 라운드를 완주했을 때만 실행되기 때문입니다. 계속 수행되는 것은 pruning, freezing, relation 수준 유지보수, FSM vacuum 입니다. 검사는 힙 스캔 시작 전, 스캔 중 일정 블록마다, 각 인덱스 전후에 이루어지며 4GB 상당 미만 테이블은 첫 검사에서 스킵됩니다.

`INDEX_CLEANUP` 과의 관계도 분명합니다 — failsafe 가 발동하면 "index vacuuming is skipped **even when `INDEX_CLEANUP` is `ON`**" 이고, 문서는 수동 `INDEX_CLEANUP OFF` 보다 자동으로 걸리는 failsafe 를 "should be preferred" 로 봅니다. 대가는 인덱스 블로트입니다 — "performance may suffer as indexes accumulate dead tuples and the table accumulates **dead line pointers that can't be removed until index cleanup completes**".

발동을 알리는 WARNING 은 PG 14 원본만 확인했습니다.

```text
WARNING:  abandoned index vacuuming of table "%s.%s.%s" as a failsafe after %d index scans
DETAIL:  table's relfrozenxid or relminmxid is too far in the past
HINT:  Consider increasing configuration parameter "maintenance_work_mem" or "autovacuum_work_mem".
You might also need to consider other ways for VACUUM to keep up with the allocation of transaction IDs.
```

이 문구는 이후 개정되었습니다. 그래서 PG 15 이상에서 알람을 만들 때는 WARNING 문구를 매칭하는 대신 PG 18 요약 로그의 접두어 `index scan bypassed by failsafe: ` 를 잡는 편이 안전합니다.

### multixact 는 ID 가 아니라 멤버 공간이 먼저 터진다

multixact ID(MXID)는 한 행을 두 개 이상의 트랜잭션이 동시에 락할 때 생성됩니다. 멤버 목록은 `pg_multixact` 에 저장되고 `xmax` 에는 MXID 만 들어가며, 멤버는 `pg_get_multixact_members()` 로 조회합니다. 테이블의 가장 오래된 MXID 는 `pg_class.relminmxid`, 나이는 `mxid_age()` 입니다. 문서는 "Aggressive `VACUUM`s, regardless of what causes them, are *guaranteed* to be able to advance the table's `relminmxid`" 라고 보장합니다.

XID 와 다른 점이 네 가지 있습니다. multixact 에 나타날 수 없는 실행 중·prepared 트랜잭션은 무시할 수 있고, **replication slot 은 multixact 정리를 직접 막지 않으며**, MXID 정보는 `pg_stat_activity` 에 보이지 않아 오래된 XID 를 프록시로 써야 하고, 소진의 결과가 다릅니다 — "**XID exhaustion will block all write transactions, but MXID exhaustion will only block a subset of write transactions**, specifically those that involve row locks that require an MXID."

관련 기본값은 `vacuum_multixact_freeze_min_age` 500만, `vacuum_multixact_freeze_table_age` 1.5억, `autovacuum_multixact_freeze_max_age` 4억입니다. 기본값이 낮은 이유도 문서에 있습니다 — 배큠이 `pg_multixact/members`·`pg_multixact/offsets` 의 오래된 파일을 지울 수 있게 하려는 것입니다. 그리고 **경고·거부 임계는 XID 와 같지만(PG 14 이상 4,000만/300만), 먼저 한계에 닿는 것은 ID 가 아니라 멤버 저장 공간입니다.** 문서가 드는 값이 약 10GB(전역 aggressive 스캔 빈발)와 약 20GB(랩어라운드 전 성장 한계)입니다.

2025년 5월 Metronome 의 포스트모템이 이 경로를 실제로 보여줍니다. Aurora PostgreSQL 13.18, 30TB 를 넘는 클러스터에서 "nearly 10TB" 짜리 모놀리식 invoice 테이블을 수십 개로 쪼개는 마이그레이션 중에 5월 10일부터 17일 사이 **4회**, 각 1시간 이상(타임라인 기준 약 2h25m / 3h54m / 2h30m / 2h15m) 장애가 났습니다. **쓰기만** 실패해 고객 생성·가격 변경·설정 저장이 막혔고 이벤트 처리와 알림은 계속 동작했습니다. 5xx 부분 실패로 남은 데이터 불일치는 고객과 수동으로 정리했습니다.

증폭 구조가 핵심입니다. MultiXact 는 불변이라 락커가 추가되면 이전 멤버를 복사한 새 MultiXact 가 생깁니다. 글이 인용한 Thomas Munro 의 메일링 리스트 표현은 "**when n backends share lock a row we make O(n) multixacts and O(n^2) members**" 이고, 글의 예시는 트랜잭션 5개에서 MultiXact 4개·멤버 14개입니다. **외래 키가 이를 곱합니다** — 같은 부모 행을 참조하는 동시 INSERT 가 참조 행마다 MultiXact 를 만들기 때문에, 저카디널리티(enum 성) 부모를 가리키는 FK 에서 특히 악화됩니다. 게다가 멤버 공간은 연속·순차 할당이라 배큠이 연속 구간만 회수합니다. **오래된 장기 트랜잭션 하나가 옛 MultiXact 를 붙잡으면 그 뒤의 새 공간도 회수하지 못합니다.**

숫자 관계가 진단을 어렵게 만들었습니다. MXID 는 32비트로 약 42억이고 **멤버 공간의 전역 하드 캡은 약 40억**입니다. `autovacuum_multixact_freeze_max_age` 는 4억이었지만 emergency vacuum 은 실제로 **MXID 약 2억** 지점에서 발동했고, 대시보드는 ID 임계의 **50% 미만**을 보여주고 있었습니다. 온콜이 본 증상은 "XAct Member Exhausted errors" 스파이크였고, 소스(`multixact.c`, REL_13_18)의 문자열은 다음과 같습니다.

```text
This command would create a multixact with %u members, but the remaining space is only enough for %u member
```

널리 인용되는 `multixact "members" limit exceeded` 라는 문구는 그 글에 없습니다. 진단이 어려웠던 이유를 저자가 그대로 적어 두었습니다 — **PostgreSQL 이 멤버 공간을 노출하는 메트릭이 없고**, ID 기반 대시보드가 오도하며, 에러 문구가 낯설고, XID 랩어라운드에 비해 문서가 빈약합니다. 실제 진단은 SQL 이 아니라 `GetNewMultiXactId`(`multixact.c`)·`heapam.c` 소스 읽기와 메일링 리스트로 이루어졌습니다.

효과가 없었던 조치는 배큠 튜닝, 워크로드 변경, 그리고 **hot standby 페일오버**였습니다(오히려 "unintentionally restarting vacuum processes"). 효과가 있었던 것은 진행 중인 배큠을 **data-files-only / non-index vacuum** 으로 교체한 것과, 백필 **및 그 태스크 컨슈머까지** 완전히 정지시킨 것입니다(1차에서는 컨슈머를 멈추지 않아 재발했습니다). 다만 이 사건에서 실제로 소비된 멤버 수, SLRU 파일 크기, `pg_multixact` 디스크 사용량은 글이 제시하지 않습니다.

### 배큠 지연이 만드는 2차 장애

배큠이 늦어지는 것 자체보다, 그것이 다른 자원과 결합해 만드는 2차 효과가 실제 장애를 만듭니다. 아래는 모두 공개 사례에 근거한 유형입니다.

- **락 대기 누적 → 전면 쓰기 불가** — Duffel: anti-wraparound vacuum 뒤에 파티션 생성 DDL 이 대기하고, 그 뒤로 모든 INSERT 가 줄을 섰습니다. **2h17m** 완전 중단.
- **재시도 폭주 → 부하 증폭** — Mandrill: 쓰기 실패 재시도가 부하를 급등시켰습니다.
- **디스크 소진** — Mandrill: 큐에 쌓인 잡과 에러 로그가 앱 서버 디스크를 채워 스토리지 볼륨을 교체했습니다.
- **복제 지연 · 동기 복제 커밋 정지** — ardentperf: WAL 폭증으로 수백 커넥션이 `IPC:SyncRep` 에서 대기했습니다. Joyent Manta(2차 회고): 배큠이 쓰기 부하를 증폭해 replay·checkpoint lag 이 커졌고 최악 **18시간 이상** 누적 replay lag 이 났습니다.
- **replay 비용 예측 불가** — Joyent(2차 회고): "a vacuum may generate WAL records that cause **many more random reads than usual**" 이라, WAL 위치 차이가 takeover 시간의 대략적 프록시밖에 되지 못했습니다.
- **리소스 완전 포화 + 백로그** — BattleMetrics: 단일 서버의 CPU·디스크·네트워크가 전부 포화됐습니다. 지연 P50 약 2.5분, P90/P99 는 5분 상한, 최악 서버 2시간. 첫 레플리카 복구 **3h44m**, 백로그 **660,000 업데이트**, 인덱스 재구축 약 2시간.
- **autovacuum 워커 풀 고갈** — Metronome: emergency vacuum 이 "exceeded our available autovacuum worker threads" 상태가 됐습니다.
- **스로틀로 영원히 못 따라감** — Coroot 실험: 테이블에 `autovacuum_vacuum_cost_delay = 100` 을 걸면 워커가 `VacuumDelay` 대기에 시간의 약 **99%** 를 씁니다. 워커를 늘려도 해결되지 않습니다.
- **메모리 상한으로 인덱스 다중 패스** — Sentry 후속: `maintenance_work_mem` 이 관련 코드 경로에서 **하드 1GB 제한**이라 배정한 100GB 가 "wasn't even being used" 였습니다. PG 17 에서 해소됐습니다.
- **배큠이 현실적으로 끝나지 않음** — Sentry: 구형 테스트 머신이 single-user mode 에서 "going on **24 hours**" 째 배큠 중이었습니다. Mandrill: "would take many days", 튜닝 후에도 "days or even weeks", 최악 추정 **40일**.

마지막 두 항목이 특히 중요합니다. **장애 중에 "배큠을 끝까지 돌린다"는 선택지는 자주 성립하지 않습니다.** 그래서 공개 사례들의 실제 탈출 수단은 대부분 배큠 완주가 아니라 데이터나 작업량을 제거하는 쪽이었습니다.

## 공개된 장애 사례에서 배울 것

무엇이 터졌는지를 먼저 봅니다.

| 사례 | 시점 | 유형 | 진짜 원인 |
|---|---|---|---|
| Sentry | 2015-07-20 | XID 랩어라운드 | 배큠이 부하를 못 따라감 + 관측 부재 |
| Mandrill | 2019-02-04~06 | XID 랩어라운드 | 샤드 편향으로 특정 샤드 autovacuum 낙오·실패 |
| Duffel | 2021-11-22 | anti-wraparound vacuum × DDL 락 | 타임아웃 없는 DDL |
| BattleMetrics | 2022-03-27 | XID 랩어라운드 | **인덱스 손상으로 배큠 실패** + XID 모니터링 부재 |
| Metronome | 2025-05-10~19 | **MultiXact 멤버 공간** 소진 | FK × 동시 INSERT 의 O(n²) 멤버 증가 + 백필 |
| 익명 SaaS | 2026-02 | XID 랩어라운드 | **autovacuum 을 껐다 잊음** |
| Figma | 2020-01-21~22 | (랩어라운드 아님) | 플래너 오추정. aggressive vacuum 은 악화 요인 |
| Joyent Manta | 2015-07-27 | XID 랩어라운드(2차 서술) | — |

그다음은 어떻게 빠져나왔는지입니다.

| 사례 | 탈출 수단 | 공개 다운타임 |
|---|---|---|
| Sentry | 하드웨어 페일오버 + **TRUNCATE** | 미국 업무일 대부분 |
| Mandrill | **TRUNCATE**(대형 테이블 2개) | 약 40.5시간(발송 80% 유지) |
| Duffel | DB 재시작 | 2h17m |
| BattleMetrics | **single-user mode 에서 DROP INDEX** | DB 복구 약 3시간, 전체 약 21시간 |
| Metronome | **non-index vacuum** + 백필·컨슈머 완전 정지 | 4회 × 각 1시간 이상 |
| 익명 SaaS | 장기 트랜잭션 종료 + 수동 `VACUUM FREEZE` | 미공개 |
| Figma | 쿼리 취소·IOPS 증설·버전 업그레이드 | 점검 창 약 75분 + 간헐 |
| Joyent Manta | — | "10-hour outage"(2차 인용) |

**Duffel(2021)의 사슬은 세 단입니다.** 검색 결과를 시간 단위 파티션으로 저장하고(30분 만료) 파티션 생성·삭제 잡이 DDL 을 발행하는 구조였습니다. anti-wraparound autovacuum 이 `SHARE UPDATE EXCLUSIVE` 를 쥐고 있었고, 그 자체는 DML 을 막지 않지만 **파티션 생성 DDL 이 대기**하고, 그 DDL 이 락 큐에서 앞서면서 **모든 INSERT 가 뒤에 줄을 섰습니다.** 로그에 남은 두 줄이 사슬을 그대로 보여줍니다.

```text
process 1447996 still waiting for RowExclusiveLock on relation 98765 of database 12345 after 1000.137 ms
process 1467042 still waiting for ShareRowExclusiveLock on relation 98765 of database 12345 after 1000.067 ms
```

앞 줄의 문장은 `INSERT INTO "search_results" ...` 이고 뒷 줄은 파티션 생성 `CREATE TABLE IF NOT EXISTS ... PARTITION OF search_results ...` 였습니다. 정체 주체가 드러난 줄은 `FATAL: terminating autovacuum process due to administrator command` 였습니다. 증명 방식이 인상적입니다 — `age(relfrozenxid)` 를 시계열로 샘플링해 노화 속도를 측정하고, 장애 직전 백업에서 그 값이 "**extremely close to 200,000,000**" 임을 확인해 anti-wraparound 배큠 시작 시각을 **2021-11-22 21:48:12** 로 역산했습니다. psql 3세션으로 재현까지 마쳤습니다. 저자들의 결론은 원인이 autovacuum 이 아니라 "our application issuing DDL statements, **without appropriate timeouts**" 라는 것입니다. 마이그레이션 툴에는 `lock_timeout`·`statement_timeout` 이 있었지만 파티션 생성 잡에만 빠져 있었습니다.

**BattleMetrics(2022)가 주는 교훈은 다릅니다.** 근본 원인이 부하가 아니라 인덱스 손상이었고(손상 시작 추정 2022-02-26), 손상이 레플리카와 다운로드 가능한 백업까지 전파돼 페일오버가 무효였습니다. 팀의 자기 진단은 "made a critical mistake by foregoing health checks on the size of the transaction IDs" 였습니다. API 키가 최대 15분 유효해 사이트가 잠시 정상처럼 보였고, 30분쯤 전의 소규모 DDoS 가 조사를 오도했다는 기록도 남아 있습니다.

**익명 SaaS 사례(2026)는 부하가 필요 없다는 것을 보여줍니다.** 저자의 표현은 "No spike was required. No growth was required. **Time alone was sufficient.**" 입니다. 워크로드는 약 10 write TPS, 짧은 autocommit, 배치·분석 없음이었고 CPU·메모리·I/O 대시보드는 모두 정상이었습니다. 원인은 저자 입사 전 디스크 I/O 대응으로 여러 테이블에서 autovacuum 을 끄고 되돌리지 않은 것이었습니다. freeze 는 테이블 단위인데 XID 는 전역으로 진행하므로 **버려진 테스트·미사용 테이블이 가장 오래된 unfrozen XID 를 보유**하게 됩니다 — "a table does not need to be actively used to be dangerous". 저자의 산술은 하루 864,000 XID 와 기본 `autovacuum_freeze_max_age` 2억을 놓고 약 **231일(약 7.5개월)** 이었습니다. 사후 점검 쿼리는 단순합니다.

```sql
SELECT relname, age(relfrozenxid)
FROM pg_class WHERE relkind = 'r'
ORDER BY age(relfrozenxid) DESC;
```

이 사례는 PostgreSQL 버전·OS·호스팅·장애 날짜·지속 시간·에러 문구가 공개되지 않았고 회사명도 없으므로 **정황 사례로만** 읽어야 합니다.

**두 사례는 자주 잘못 소개됩니다.** Figma(2020)는 랩어라운드 장애가 아닙니다. 이틀에 걸친 별개의 두 성능 장애였고 2일차의 근본 원인은 통계 갱신 후의 플래너 오추정(잘못된 계획이 2,000만 행 이상을 추정했으나 실제 결과는 3행)이었습니다. 배큠은 악화 요인입니다 — 취소한 쿼리가 배큠 백로그를 남겨 "This crossed the threshold for a more aggressive form of automatic vacuuming intended to prevent transaction ID wraparound" 상태가 되었고, 그 모드가 "has a greater impact on locking and writes" 였습니다. 이 사건은 **"aggressive autovacuum 이 락과 쓰기에 미치는 영향을 회사가 공개적으로 인정한 기록"** 으로 읽는 것이 정확합니다. Joyent/Manta 는 원 포스트모템 URL 이 현재 404 이고, 위 표의 값은 2024년 Dave Pacheco 의 회고에 실린 **2차 서술**입니다.

Sentry(2015)에서 가져올 것은 설정이 아니라 관측 실패의 기록입니다. 쓰기가 멈춘 시점에 이미 autovacuum 이 돌고 있었고 끝내기를 택했으나 "one of them either failed or simply didn't work correctly" 였는데, 진단이 불가능했던 이유가 그대로 남아 있습니다 — "**the logs contain nothing to suggest failure and we didn't have verbosity for autovacuums**". 이 글이 공개한 사후 설정에는 `autovacuum_vacuum_cost_delay = 0` 이 들어 있지만, 앞 절에서 본 2026년 진단과 정면으로 충돌하므로 **권장 설정으로 옮겨 쓰면 안 됩니다.**

사례 전체를 겹쳐 보면 반복되는 것이 네 가지입니다. 첫째, 탈출 수단은 대체로 배큠 완주가 아니라 제거였습니다(TRUNCATE, DROP INDEX, non-index vacuum, 백필 정지). 둘째, XID·MXID 나이 알람의 부재가 거의 모든 사례에 있습니다. 셋째, 배큠이 아니라 **타임아웃 없는 DDL** 이 장애를 전면화시켰습니다. 넷째, 매니지드 서비스와 구버전에서는 문서·문구·기본값이 다르므로 검색 결과를 그대로 적용하면 오히려 상황을 악화시킵니다.
## 무엇을 모니터링해야 하는가

### XID·MXID 나이

문서가 제시하는 쿼리 그대로면 충분합니다.

```sql
-- 테이블별 XID age (TOAST 포함)
SELECT c.oid::regclass AS table_name,
       greatest(age(c.relfrozenxid), age(t.relfrozenxid)) AS age
FROM pg_class c LEFT JOIN pg_class t ON c.reltoastrelid = t.oid
WHERE c.relkind IN ('r','m')
ORDER BY age DESC;

-- 데이터베이스별
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;

-- multixact age
SELECT c.oid::regclass, mxid_age(c.relminmxid) AS mxid_age
FROM pg_class c WHERE c.relkind IN ('r','m') ORDER BY 2 DESC;
```

비교 기준은 `autovacuum_freeze_max_age`(기본 2억), `autovacuum_multixact_freeze_max_age`(기본 4억), `vacuum_failsafe_age`(16억), 그리고 하드 리밋(PG 14 이상은 남은 300만, PG 13 이하는 100만)입니다.

### 멤버 공간은 지표가 없다

Metronome 의 교훈을 지표로 옮기면 이렇습니다. **PostgreSQL 은 MultiXact 멤버 공간을 노출하지 않습니다.** ID 나이만 보면 50% 미만으로 안전해 보이는 동안 이미 emergency vacuum 이 돌 수 있습니다. 문서상 대체 감시 지점은 `pg_multixact/members`·`pg_multixact/offsets` **디렉터리 크기**이고(약 10GB 에서 전역 aggressive 스캔이 빈발, 약 20GB 가 상한), Metronome 이 실제로 추가한 것도 member·offset 파일 스토리지 모니터링입니다.

### 진행 중인 배큠

```sql
SELECT p.pid, p.datname, c.relname, p.phase,
       p.heap_blks_scanned, p.heap_blks_total,
       round(100.0 * p.heap_blks_scanned / NULLIF(p.heap_blks_total,0), 1) AS pct_scanned,
       p.index_vacuum_count, p.indexes_processed, p.indexes_total,
       p.dead_tuple_bytes, p.max_dead_tuple_bytes, p.delay_time
FROM pg_stat_progress_vacuum p JOIN pg_class c ON c.oid = p.relid;
```

읽을 때 주의할 점이 몇 개 있습니다.

- `heap_blks_scanned` 는 **visibility map 으로 스킵된 블록까지 포함**하므로 완료 시 `heap_blks_total` 과 같아집니다. 반대로 `heap_blks_vacuumed` 는 dead 없는 블록을 건너뛰므로 큰 폭으로 점프할 수 있습니다.
- `heap_blks_total` 은 스캔 시작 시점의 값이고 이후 추가된 블록은 방문하지 않습니다.
- 컬럼 이름이 **PG 17 에서 바뀌었습니다** — `max_dead_tuples` → `max_dead_tuple_bytes`, `num_dead_tuples` → `num_dead_item_ids`, `dead_tuple_bytes` 추가. `indexes_total`·`indexes_processed` 도 PG 17 신규, `delay_time` 은 PG 18 신규입니다. `track_cost_delay_timing` 이 꺼져 있으면 `delay_time` 은 0 입니다.
- **`VACUUM FULL` 은 이 뷰에 나오지 않습니다.** `pg_stat_progress_cluster` 를 봐야 합니다.

phase 는 일곱 개입니다.

| phase | 의미 |
|---|---|
| `initializing` | 힙 스캔 준비. "Expected to be very brief" |
| `scanning heap` | 힙 스캔. 필요 시 prune·defragment·freezing |
| `vacuuming indexes` | 인덱스 배큠. 메모리가 부족하면 **여러 번** 발생 |
| `vacuuming heap` | 힙 배큠. 각 인덱스 라운드 뒤에 온다 |
| `cleaning up indexes` | 힙 스캔과 모든 인덱스·힙 배큠 후 인덱스 정리 |
| `truncating heap` | 관계 끝의 빈 페이지를 OS 로 반환 |
| `performing final cleanup` | FSM vacuum, `pg_class` 통계 갱신, 누적 통계 보고 |

### autovacuum 로그를 한 줄씩 읽기

`log_autovacuum_min_duration` 기본값은 **PG 15 부터 10min** 입니다. **PG 14 이하는 기본 `-1`(비활성)** 이었고, Sentry(2015)와 Duffel(2021)이 모두 "배큠 로그가 없어 진단이 안 됐다"고 기록한 배경이 이것입니다. 문제 테이블만 전부 남기려면 테이블별로 낮춥니다.

```sql
ALTER TABLE big_table SET (log_autovacuum_min_duration = 0);
```

PG 18 의 요약 로그 본문은 다음 순서로 나옵니다(조건부 줄 포함).

```text
pages: %u removed, %u remain, %u scanned (%.2f%% of total), %u eagerly scanned
tuples: %lld removed, %lld remain, %lld are dead but not yet removable
tuples missed: %lld dead from %u pages not removed due to cleanup lock contention
removable cutoff: %u, which was %d XIDs old when operation ended
new relfrozenxid: %u, which is %d XIDs ahead of previous value
new relminmxid: %u, which is %d MXIDs ahead of previous value
frozen: %u pages from table (%.2f%% of total) had %lld tuples frozen
visibility map: %u pages set all-visible, %u pages set all-frozen (%u were all-visible)
index scan needed: %u pages from table (%.2f%% of total) had %lld dead item identifiers removed
index scan bypassed: %u pages from table (%.2f%% of total) have %lld dead item identifiers
index "%s": pages: %u in total, %u newly deleted, %u currently deleted, %u reusable
delay time: %.3f ms
I/O timings: read: %.3f ms, write: %.3f ms
avg read rate: %.3f MB/s, avg write rate: %.3f MB/s
buffer usage: %lld hits, %lld reads, %lld dirtied
WAL usage: %lld records, %lld full page images, %llu bytes, %lld buffers full
system usage: %s
```

해석 포인트를 정리하면 다음과 같습니다.

- **`index scans: 0` 과 `index scan bypassed`** → 인덱스 배큠을 건너뛰었습니다. 접두어가 `index scan bypassed by failsafe: ` 면 랩어라운드 failsafe 가 발동 중이라는 뜻입니다.
- **`index scans` 가 2 이상** → `maintenance_work_mem` 또는 `autovacuum_work_mem` 이 부족해 인덱스를 여러 번 돌았습니다. PG 17 이상은 1GB 상한이 없으므로 실제 메모리 부족입니다.
- **`are dead but not yet removable` 이 크다** → xmin horizon 이 막혀 있습니다. `removable cutoff` 값으로 얼마나 오래된 지점에 갇혀 있는지 봅니다. **PG 14 이하는 같은 정보가 `oldest xmin:` 으로 tuples 줄에 붙습니다** — PG 15 에서 이 필드가 별도의 `removable cutoff` 줄로 대체됐으니, 오래된 글이 "oldest xmin 을 보라"고 할 때는 버전을 구분해야 합니다.
- **`new relfrozenxid` 줄이 없다** → 이번 실행이 freeze 경계를 전진시키지 못했습니다. 랩어라운드 대책으로는 무효라는 뜻이므로, 랩어라운드를 쫓는 중이라면 이 줄의 유무가 성패 지표입니다.
- **`tuples missed: ... due to cleanup lock contention`** → 정리 락 경쟁으로 놓친 dead tuple 이 있습니다.
- **`WAL usage: ... full page images` 가 크다** → [2편에서 본](/writing/vacuuming-maintenance-2-blocked-cleanup/) FPI 폭증 패턴입니다.
- **`delay time` 이 전체 소요의 대부분** → cost delay 스로틀이 병목입니다.

로그 라인을 문장 로그와 묶으려면 `log_line_prefix` 에 PID 또는 세션 ID 를 넣으라는 것이 문서 권고입니다. 관련 로깅 기본값도 알아 둘 필요가 있습니다 — `log_lock_waits` **off**, `log_lock_failures` **off**, `log_recovery_conflict_waits` **off**, `log_min_duration_statement` **-1**. Duffel 장애에서 결정적이었던 것이 슬로우 쿼리와 락 대기 로그였다는 점을 생각하면, 이 중 최소한 `log_lock_waits` 는 켜 둘 값입니다.

### 워커 포화와 스로틀은 다른 문제다

Coroot 의 재현 실험이 이 둘을 분리해서 보여줍니다. `autovacuum_max_workers = 1` 로 두면 "all 1 autovacuum workers are busy" 가 되고 워커를 늘리면 해결됩니다. 반면 테이블에 `autovacuum_vacuum_cost_delay = 100` 을 걸면 워커가 `VacuumDelay` 대기에 시간의 약 99% 를 쓰는데, **이 경우는 워커를 늘려도 낫지 않습니다.** 두 지표를 따로 봐야 합니다.

- **워커 포화**: `pg_stat_activity` 에서 `backend_type = 'autovacuum worker'` 인 행 수를 `autovacuum_max_workers`(기본 3)와 비교합니다.
- **스로틀**: `pg_stat_progress_vacuum` 과 `pg_stat_activity` 를 조인해 `wait_event = 'VacuumDelay'` 를 봅니다. PG 18 부터는 `delay_time` 컬럼과 `total_vacuum_time`·`total_autovacuum_time`(cost delay sleep 포함)으로 직접 정량화할 수 있습니다. 조인 시 함정이 하나 있습니다 — `relid` 는 **같은 데이터베이스에서만 해석되므로 DB 별로 쿼리해야 합니다.**

배큠 관련 대기 이벤트로는 `VacuumDelay`, `VacuumTruncate`, `ParallelVacuumDSA`, `AutovacuumSchedule`, `WrapLimitsVacuum`, `RecoveryConflictSnapshot` 가 있습니다. I/O 는 `pg_stat_io` 의 `context='vacuum'`(PG 18 부터 `read_bytes`·`write_bytes`·`extend_bytes` 로 바이트 단위 보고), WAL 은 `pg_walinspect` 로 resource manager 별 분해 후 `FPI_FOR_HINT` 비중을 봅니다.

### 낙오 신호와 매니지드 서비스

배큠이 뒤처지고 있다는 신호는 몇 가지 조합으로 나타납니다. 블로트가 정리 속도보다 빠르게 증가하거나, `pg_stat_activity` 에 배큠이 계속 떠 있거나, `autovacuum_count` 가 낮은데 `last_autovacuum` 이 오래되었거나, `heap_blks_scanned` 대 `heap_blks_total` 의 진척이 시간축에서 거의 움직이지 않는 경우입니다.

RDS 와 Aurora 를 쓴다면 `rds_tools.postgres_get_av_diag()` 가 aggressive(freeze) 배큠을 막고 있는 주체를 직접 보고합니다(`CREATE EXTENSION IF NOT EXISTS rds_tools;` 필요). 지원 버전은 RDS for PostgreSQL 17.2+/16.7+/15.11+/14.16+/13.19+, Aurora PostgreSQL 17.4+/16.7+/15.11+/14.16+/13.19+ 입니다. 출력은 `blocker`, `database`, `blocker_identifier`, `wait_event`, `autovacuum_lagging_by`, `suggestion`, `suggested_action` 이고 `autovacuum_lagging_by DESC` 로 정렬하면 가장 오래된 blocker 가 위로 옵니다. 문서 예시 행은 논리 복제 슬롯 `my_replication_slot` 이 **833,665,514** 만큼 lagging 이고 조치 제안이 `pg_drop_replication_slot(...)` 입니다. 보고 대상에는 장기 트랜잭션·미완 prepared transaction·정체된 논리 슬롯·`hot_standby_feedback` 을 켠 리드 레플리카의 장기 쿼리·배큠되지 않은 임시 테이블, 그리고 "logical inconsistencies in indexes or physical issues in database pages"(BattleMetrics 유형)까지 들어갑니다. 기본적으로 미동결 트랜잭션 약 5억 초과부터 보고하되 `autovacuum_freeze_max_age` 가 더 크면 그 값을 따릅니다. **RDS for PostgreSQL 의 `autovacuum_freeze_max_age` 최대값은 7억 5천만**이고 약 20억에서 쓰기가 중단됩니다. 상위 알람 지표로 권장되는 것은 CloudWatch 의 **`MaximumUsedTransactionIDs`** 이며, 이 함수는 그 아래의 심층 진단 레이어입니다.

정리하면 알람은 세 층으로 두면 됩니다. **소진 층**은 XID·MXID 나이와 멤버·offset 파일 크기, **지연 층**은 테이블별 압력 지표와 `last_autovacuum` 공백, **원인 층**은 xmin horizon 보유자 네 종류와 워커 포화·`VacuumDelay` 체류율입니다. 세 층 중 하나만 보고 있으면 앞의 사례들이 반복됩니다.
