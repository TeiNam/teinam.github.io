---
date: 2019-02-18 21:16:00 +0900
title: "주기적인 유지관리 Vacuuming #.4 배큠 시간을 줄이는 방법"
category: postgresql
excerpt: "튜닝을 시작하기 전에 전제 하나를 분명히 해 둡니다. PostgreSQL 공식 문서는 기본값·상한·하한·클램프 규칙만 규정하고, 워크로드별 권장값을 제시하지 않습니다. 아래에 나오는 숫자는 대부분 문서가 규정한 기본값이거나 한계값입니다. 그 밖의 값은 서드파티 저자의 경험치이거나 공식…"
last_modified_at: 2026-09-20
series: "주기적인 유지관리 Vacuuming"
series_index: "4 / 4"
---

**시리즈** · [1. 배큠의 기초와 VACUUM FULL](/writing/vacuuming-maintenance/) · [2. dead tuple 을 지우지 못할 때](/writing/vacuuming-maintenance-2-blocked-cleanup/) · [3. 장애가 되는 경로](/writing/vacuuming-maintenance-3-outages/) · **4. 시간을 줄이는 방법**

## autovacuum 파라미터와 기본값

튜닝을 시작하기 전에 전제 하나를 분명히 해 둡니다. **PostgreSQL 공식 문서는 기본값·상한·하한·클램프 규칙만 규정하고, 워크로드별 권장값을 제시하지 않습니다.** 아래에 나오는 숫자는 대부분 문서가 규정한 기본값이거나 한계값입니다. 그 밖의 값은 서드파티 저자의 경험치이거나 공식 파라미터로 직접 유도한 계산값이며, 그런 경우에는 본문에 그렇게 밝혔습니다. 이 구분을 흘려보내면 남의 환경 숫자를 내 서버 설정으로 옮겨 적게 됩니다.

PostgreSQL 18 은 배큠 관련 GUC 를 문서 19.10 Vacuuming 절 하나로 모았습니다. 17 이하에서는 `runtime-config-autovacuum` 과 `runtime-config-resource` 로 흩어져 있었습니다.

| 파라미터 | 기본값 (18) | 반영 방법 | 테이블별 재정의 |
|---|---|---|---|
| `autovacuum` | `on` | reload | O (`autovacuum_enabled`) |
| `autovacuum_worker_slots` | 보통 `16` (initdb 시 커널 설정에 따라 더 작을 수 있음) | 재시작 | X |
| `autovacuum_max_workers` | `3` | reload (18 부터) | X |
| `autovacuum_naptime` | `1min` | reload | X |
| `autovacuum_vacuum_threshold` | `50` | reload | O |
| `autovacuum_vacuum_max_threshold` | `100000000` (1억). `-1` = 상한 없음 | reload | O |
| `autovacuum_vacuum_scale_factor` | `0.2` | reload | O |
| `autovacuum_vacuum_insert_threshold` | `1000`. `-1` = insert 기반 배큠 비활성 | reload | O |
| `autovacuum_vacuum_insert_scale_factor` | `0.2` | reload | O |
| `autovacuum_analyze_threshold` | `50` | reload | O (`toast.` 변형 없음) |
| `autovacuum_analyze_scale_factor` | `0.1` | reload | O (`toast.` 변형 없음) |
| `autovacuum_freeze_max_age` | `200000000` (2억) | 재시작 | O — 낮추는 방향만 |
| `autovacuum_multixact_freeze_max_age` | `400000000` (4억) | 재시작 | O — 낮추는 방향만 |
| `autovacuum_vacuum_cost_delay` | `2ms`. `-1` = `vacuum_cost_delay` 사용 | reload | O |
| `autovacuum_vacuum_cost_limit` | `-1` (= `vacuum_cost_limit` 사용) | reload | O |

표를 읽을 때 걸려 넘어지기 쉬운 지점이 네 개 있습니다.

- `autovacuum_max_workers` 를 reload 로 바꿀 수 있는 것은 **18 부터**입니다. 17 이하에서는 재시작이 필요했습니다. 그리고 `autovacuum_worker_slots` 보다 큰 값은 무효입니다 — 워커는 그 슬롯 풀에서 꺼내 쓰기 때문입니다.
- `autovacuum_vacuum_cost_limit` 은 **워커당 예산이 아닙니다.** 문서 표현대로 "the value is distributed proportionally among the running autovacuum workers … so that the sum of the limits for each worker does not exceed the value of this variable" 입니다. 워커 수만 늘리면 각 워커가 그만큼 느려집니다. 자세한 것은 cost-based delay 절에서 다룹니다.
- `autovacuum_vacuum_max_threshold`(기본 1억)는 **18 신규**입니다. 17 이하에는 dead tuple 개수의 절대값 상한이 없어서, 10억 행 테이블은 dead tuple 이 2억 개 쌓일 때까지 배큠이 트리거되지 않았습니다. 그때 도는 배큠은 필연적으로 오래 걸립니다. 발동 공식 자체는 [2편](/writing/vacuuming-maintenance-2-blocked-cleanup/)에서 다뤘습니다.
- freeze 계열은 **GUC 이름과 테이블별 파라미터 이름이 다릅니다.** 다음 절에서 표로 정리합니다.

### 테이블별로 따로 주기

전역 `postgresql.conf` 를 흔드는 것보다 문제 테이블만 개별 설정하는 편이 안전합니다. Laurenz Albe(CYBERTEC)도 "it is usually best *not* to change the global setting in `postgresql.conf`" 라고 명시합니다.

배큠 관련 storage parameter 는 다음과 같습니다. `autovacuum_enabled`, `autovacuum_vacuum_threshold`, `autovacuum_vacuum_max_threshold`(18+), `autovacuum_vacuum_scale_factor`, `autovacuum_vacuum_insert_threshold`, `autovacuum_vacuum_insert_scale_factor`, `autovacuum_analyze_threshold`, `autovacuum_analyze_scale_factor`, `autovacuum_vacuum_cost_delay`, `autovacuum_vacuum_cost_limit`, freeze 계열 6개, `vacuum_index_cleanup`, `vacuum_truncate`, `vacuum_max_eager_freeze_failure_rate`(18+), `fillfactor`, `toast_tuple_target`, `parallel_workers`, `log_autovacuum_min_duration`. analyze 계열 2개를 뺀 나머지에는 `toast.` 접두 변형이 있고, "If a table parameter value is set and the equivalent `toast.` parameter is not, the TOAST table will use the table's parameter value" 입니다.

**이름이 바뀌는 함정** — 흔히 틀리는 지점입니다.

| GUC | 테이블별 storage parameter |
|---|---|
| `vacuum_freeze_min_age` | `autovacuum_freeze_min_age` |
| `vacuum_freeze_table_age` | `autovacuum_freeze_table_age` |
| `vacuum_multixact_freeze_min_age` | `autovacuum_multixact_freeze_min_age` |
| `vacuum_multixact_freeze_table_age` | `autovacuum_multixact_freeze_table_age` |
| `autovacuum_freeze_max_age` | 동명 — "it can only be set smaller" |
| `autovacuum_multixact_freeze_max_age` | 동명 — 낮추는 방향만 |

`ALTER TABLE t SET (vacuum_freeze_min_age =...)` 는 없는 파라미터를 쓰는 것입니다. 그리고 테이블별 `autovacuum_freeze_min_age` 는 "larger than half the system-wide `autovacuum_freeze_max_age` setting" 이면 조용히 무시됩니다.

```sql
-- (1) 고변경 대형 테이블: 자주·짧게 돌게 만들기
ALTER TABLE public.orders SET (
  autovacuum_vacuum_scale_factor  = 0.01,
  autovacuum_analyze_scale_factor = 0.005,
  fillfactor                      = 90
);

-- (2) append-only 대형 테이블: insert 트리거 + freeze 분산
ALTER TABLE public.events_2026_09 SET (
  autovacuum_vacuum_insert_scale_factor = 0.01,
  autovacuum_freeze_min_age             = 0,          -- 적재분을 바로 freeze
  autovacuum_freeze_max_age             = 150000000,  -- 전역(2억)보다 작게만 유효
  toast.autovacuum_freeze_max_age       = 150000000
);

-- (3) 현재 설정 확인 / 되돌리기
SELECT relname, reloptions FROM pg_class WHERE relname = 'orders';
ALTER TABLE public.orders RESET (autovacuum_vacuum_scale_factor);
```

위 숫자는 예시이며 공식 권장값이 아닙니다. Albe 가 제시한 예시값은 `autovacuum_vacuum_cost_delay = 1`, `autovacuum_vacuum_scale_factor = 0.01`, `autovacuum_analyze_scale_factor = 0.02`, insert-only 테이블에 `autovacuum_freeze_max_age = 10000000` 입니다. 전부 경험치입니다.

주의점 두 개가 있습니다. 첫째, **파티션 부모에는 storage parameter 를 줄 수 없습니다** — "Specifying these parameters for partitioned tables is not supported, but you may specify them for individual leaf partitions". 파티션 생성 자동화에 개별 지정을 넣어야 합니다. 둘째, **테이블별 cost 파라미터를 준 테이블은 전역 I/O 밸런싱에서 빠집니다.** "any workers processing tables whose per-table `autovacuum_vacuum_cost_delay` or `autovacuum_vacuum_cost_limit` storage parameters have been set are not considered in the balancing algorithm" 이므로, 여러 테이블에 cost 설정을 뿌리면 전체 I/O 총량 통제를 잃습니다. cost 계열은 소수의 테이블에만 쓰고, 나머지는 scale factor 계열로 조정하는 편이 안전합니다.

### autovacuum 을 끄면 안 되는 이유

문서는 autovacuum 을 "optional but highly recommended" 로 서술합니다. 그리고 끈다고 배큠이 사라지지 않습니다.

> "Even when this parameter is disabled, the system will launch autovacuum processes if necessary to prevent transaction ID wraparound."

테이블별로 끈 경우도 같습니다 — `autovacuum_enabled = false` 는 "except to prevent transaction ID wraparound" 이고, multixact 쪽 aggressive vacuum 도 "will occur even if autovacuum is nominally disabled" 입니다. `track_counts` 를 끄는 것 역시 사실상 끄는 것입니다("autovacuum cannot be used unless `track_counts` is set to `true`").

그래서 끄기의 실제 효과는 이렇습니다.

1. **예측 가능한 소량 배큠을 예측 불가능한 시점의 거대한 anti-wraparound vacuum 으로 바꾸는 것**뿐입니다.
2. 그 anti-wraparound vacuum 은 락 충돌로 중단되지 않습니다 — "the autovacuum is not automatically interrupted". 피크 시간에 터져도 멈출 방법이 없습니다.
3. `vacuum_failsafe_age` 에 도달하면 cost delay 와 Buffer Access Strategy 가 무력화됩니다. 보수적으로 스로틀해 둔 설정이 그 순간 전부 무시됩니다.
4. 방치된 블로트는 배큠보다 훨씬 비싼 수단으로만 회수됩니다. 배큠은 테이블 끝의 빈 페이지만 OS 에 돌려주기 때문입니다.

배큠 시간이 문제일 때의 정답은 끄기가 아니라 (a) 더 자주·더 작게 돌게 만들기, (b) 유지보수 창에서 수동 배큠으로 선점하기, (c) 애초에 dead tuple 을 덜 만들기입니다. 아래가 그 방법들입니다.
## 배큠 시간을 줄이는 방법

### 메모리 — maintenance_work_mem

이 메모리의 용도는 하나입니다. **삭제할 dead tuple 의 TID 목록을 담아 두는 버퍼**입니다. 버퍼가 꽉 차면 배큠은 힙 스캔을 멈추고 **모든 인덱스를 한 바퀴 전부 스캔**한 뒤 버퍼를 비우고 힙 스캔을 재개합니다.

> "If a table has any indexes, this will happen **at least once per vacuum**, after the heap has been completely scanned. It may happen multiple times per vacuum if `maintenance_work_mem` (or, in the case of autovacuum, `autovacuum_work_mem` if set) is insufficient to store the number of dead tuples found."

즉 **인덱스 전체 스캔 횟수 = 인덱스 개수 N × 인덱스 배큠 패스 수 P** 이고, 메모리는 P 를 결정합니다. 대형 테이블 배큠 시간이 폭발하는 가장 흔한 단일 원인이 P > 1 입니다.

여기서 버전이 갈립니다. PostgreSQL 17 릴리스 노트:

> "Allow vacuum to more efficiently store tuple references … Additionally, vacuum is no longer silently limited to one gigabyte of memory when `maintenance_work_mem` or `autovacuum_work_mem` are higher."

| | 16 이하 | 17 이상 |
|---|---|---|
| dead tuple 저장 상한 | 1GB 초과분은 조용히 무시 | 상한 없음 |
| `maintenance_work_mem = 4GB` 의 효과 | 배큠 버퍼는 여전히 1GB — **효과 없음** (`CREATE INDEX` 등에는 효과 있음) | 실제로 더 큰 버퍼 사용 |

**16 이하에서 배큠 때문에 이 값을 1GB 넘게 준 것은 무의미했습니다.** 17 은 자료구조 자체가 "reduces memory consumption" 이라 같은 dead tuple 수를 더 적은 메모리로 담습니다. 컬럼 이름이 개수에서 바이트 기준으로 바뀐 것이 그 증거입니다 — 17 에서 `max_dead_tuples` → `max_dead_tuple_bytes`, `num_dead_tuples` → `num_dead_item_ids` 로 개편되고 `dead_tuple_bytes` 가 추가됐습니다(비호환 변경). 다만 압축률 수치는 릴리스 노트가 "reduces memory consumption" 이라는 정성 표현만 제시하므로 확인되지 않습니다.

진단 지표는 `index_vacuum_count` 하나입니다. 이 값이 **1보다 크면 메모리 부족**입니다.

```sql
SELECT p.pid,
       p.relid::regclass                      AS tbl,
       p.phase,
       p.heap_blks_scanned, p.heap_blks_total,
       p.index_vacuum_count,                   -- 1보다 크면 메모리 부족 신호
       pg_size_pretty(p.dead_tuple_bytes)     AS dead_bytes,
       pg_size_pretty(p.max_dead_tuple_bytes) AS max_dead_bytes,
       p.indexes_processed, p.indexes_total    -- 17+
FROM pg_stat_progress_vacuum p;
```

`index_vacuum_count` 가 1이면 메모리는 충분하고, **더 올려도 배큠 시간이 줄지 않습니다.** 2 이상일 때만 `dead_tuple_bytes` / `max_dead_tuple_bytes` 비율을 보고 올립니다.

올릴 때는 총량을 계산해야 합니다. "when autovacuum runs, up to `autovacuum_max_workers` times this memory may be allocated". 기본값 `autovacuum_work_mem = -1` 은 `maintenance_work_mem` 값을 그대로 쓴다는 뜻이므로, `maintenance_work_mem` 을 2GB 로 올리면 워커 3개 기준 최악 6GB 가 `shared_buffers` 와 별도로 잡힙니다. 그래서 실무 패턴은 **`maintenance_work_mem` 은 크게, `autovacuum_work_mem` 은 그보다 작게 명시 지정**입니다. 문서도 "It may be useful to control for this by separately setting `autovacuum_work_mem`" 라고 같은 방향을 제시합니다. `autovacuum_work_mem` 은 `postgresql.conf`·커맨드라인 전용이고 수동 `VACUUM` 에는 영향이 없습니다("The setting has no effect on the behavior of `VACUUM` when run in other contexts").

병렬 배큠에서는 워커 수만큼 곱해지지 않습니다 — "Parallel utility commands treat the resource limit `maintenance_work_mem` as a limit to be applied to the **entire utility command**".

### 병렬 인덱스 배큠

`PARALLEL` 옵션은 13 에서 도입됐고, 병렬화되는 것은 **인덱스 처리 2개 phase 뿐**입니다. "Perform **index vacuum and index cleanup phases** of `VACUUM` in parallel using *integer* background workers". `scanning heap` · `vacuuming heap` · `truncating heap` 은 병렬화되지 않으므로, 인덱스가 없거나 작은 테이블에서는 아무 효과가 없습니다.

동작 조건은 전부 문서에 있습니다.

- 인덱스 크기가 `min_parallel_index_scan_size`(기본 `512kB`)보다 커야 참여합니다.
- "Only one worker can be used per index. So parallel workers are launched only when there are at least `2` indexes in the table."
- 워커 수는 `PARALLEL` 지정값과 `max_parallel_maintenance_workers`(기본 `2`)로 제한됩니다.
- `FULL` 과 함께 쓸 수 없습니다. `VACUUM (PARALLEL 0) t;` 로 비활성화합니다.
- 병렬에서도 cost delay 는 살아 있습니다 — "each worker sleeps in proportion to the work done by that worker".

소스에서는 **리더가 인덱스 하나를 직접 맡는다**는 점이 추가로 확인됩니다. 인덱스 3개인 테이블의 최대 추가 워커는 2개입니다.

```c
nindexes_parallel = Max(nindexes_parallel_bulkdel, nindexes_parallel_cleanup);
/* The leader process takes one index */
nindexes_parallel--;
```

**그리고 여기가 이 절의 핵심입니다. autovacuum 은 18 까지 병렬 인덱스 배큠을 쓰지 않습니다.** 이 사실은 공식 문서에 적혀 있지 않습니다 — `sql-vacuum.html`, `routine-vacuuming.html`, `runtime-config-vacuum.html` 모두 이 조합을 언급하지 않습니다. 소스에만 있습니다. `autovacuum.c` 의 `table_recheck_autovac()`:

```c
/* As of now, we don't support parallel vacuum for autovacuum */
tab->at_params.nworkers = -1;
```

`vacuumlazy.c` 파일 헤더 주석도 같은 이야기를 반대 방향에서 합니다 — "**Manually invoked VACUUMs** may scan indexes during phase II in parallel."

실무 결론 세 가지입니다.

1. **`max_parallel_maintenance_workers` 를 아무리 올려도 autovacuum 은 빨라지지 않습니다** (18 이하). 이 값은 수동 배큠과 `CREATE INDEX` 에만 듣습니다.
2. autovacuum 의 병렬성은 **테이블 단위 동시성**뿐입니다. 워커 3개가 서로 다른 테이블을 동시에 처리하지만, 한 테이블의 인덱스는 항상 한 프로세스가 순차 처리합니다.
3. 따라서 인덱스가 많은 초대형 단일 테이블은 autovacuum 만으로는 구조적으로 시간이 줄지 않습니다. **파티셔닝이 autovacuum 에서 병렬성을 얻는 사실상 유일한 수단**입니다(19 의 autovacuum 병렬화 이전까지). 테이블 설계 절에서 다시 다룹니다.

우회는 유지보수 창의 수동 배큠입니다.

```sql
SET maintenance_work_mem = '4GB';           -- 17+ 라면 1GB 초과분도 실제로 쓰임
SET max_parallel_maintenance_workers = 8;
VACUUM (VERBOSE, PARALLEL 8, BUFFER_USAGE_LIMIT '512MB') big_table;
```

여러 테이블을 동시에 돌리려면 `vacuumdb` 의 `--parallel`(13+)·`--jobs`·`--buffer-usage-limit`(16+)·`--no-process-toast`(14+)·`--no-process-main`(16+)·`--skip-locked`·`--min-xid-age`·`--missing-stats-only`(18+)를 씁니다.

### cost-based delay

| 파라미터 | 기본값 |
|---|---|
| `vacuum_cost_delay` | `0` (= 기능 비활성) |
| `vacuum_cost_limit` | `200` |
| `vacuum_cost_page_hit` | `1` |
| `vacuum_cost_page_miss` | `2` |
| `vacuum_cost_page_dirty` | `20` |
| `autovacuum_vacuum_cost_delay` | `2ms` (`-1` = `vacuum_cost_delay` 사용) |
| `autovacuum_vacuum_cost_limit` | `-1` (= `vacuum_cost_limit` = 200) |

가장 자주 오해되는 지점부터 짚습니다. "This feature is **disabled by default for manually issued `VACUUM` commands**." 수동 배큠은 기본적으로 전혀 스로틀되지 않습니다. "수동 배큠이 느리다"의 원인은 cost delay 가 아닙니다(전역에 `vacuum_cost_delay` 를 켜 뒀다면 예외).

그리고 **기본값이 바뀌었습니다.**

| 변경 | 버전 |
|---|---|
| `autovacuum_vacuum_cost_delay` 20ms → **2ms** | 12 |
| `vacuum_cost_delay` 소수점(ms 미만) 허용 | 12 |
| `vacuum_cost_page_miss` 10 → **2** | 14 |
| delay 설정 변경 반영 주기: 릴레이션 단위 → **블록 단위** | 16 |

인터넷의 배큠 산수 글 상당수가 `autovacuum_vacuum_cost_delay = 20ms`, `vacuum_cost_page_miss = 10` 을 전제로 계산합니다. 11 이하·13 이하 기준이고, 현재 기본값과 각각 10배·5배 차이가 납니다. Percona 의 튜닝 글이 그 예로, 계산 구조 자체는 맞지만 값이 구버전 기준입니다.

sleep 시간 산식은 문서에 있습니다.

```text
actual_delay = vacuum_cost_delay * accumulated_balance / vacuum_cost_limit
maximum      = vacuum_cost_delay * 4
```

**공식 문서에는 MB/s 계산 예제가 없습니다.** 아래는 위 상수로 직접 유도한 값이며, 공식 문서에 이 숫자가 적혀 있지 않습니다. 기본값(delay 2ms, limit 200)에서 초당 cost 예산은 200 × (1000/2) = 100,000 입니다. 페이지 1장당 cost 는 캐시 히트 1, 디스크 읽기 2, 여기에 수정이 붙으면 +20 입니다.

| 시나리오 (페이지당 cost) | 페이지/s | 처리량 |
|---|---|---|
| 전부 캐시 히트 (1) | 100,000 | 약 781 MiB/s |
| 전부 디스크 읽기 (2) | 50,000 | 약 391 MiB/s |
| 캐시 히트 + dirty (21) | 4,762 | 약 37 MiB/s |
| 디스크 읽기 + dirty (22) | 4,545 | 약 36 MiB/s |

`page_dirty = 20` 이 압도적으로 크기 때문에 **실제 처리량은 "페이지를 얼마나 더럽히는지"가 사실상 단독으로 결정합니다**. dead tuple 을 실제로 제거하는 구간에서는 페이지가 dirty 가 되므로, 기본 설정 autovacuum 의 유효 처리량은 수십 MiB/s 수준입니다. 이 값은 **상한**입니다 — I/O 대기시간 0 을 가정했고, 이 예산은 동시 실행 중인 워커들이 나눠 쓰며, `actual_delay` 는 최대 4배까지 늘어납니다.

예산을 나눠 쓴다는 것이 `autovacuum_vacuum_cost_limit` 이 **워커당이 아니라 전역**이라는 뜻입니다. `AutoVacuumUpdateCostLimit()`:

```c
vacuum_cost_limit = Max(vacuum_cost_limit / nworkers_for_balance, 1);
```

**따라서 `autovacuum_max_workers` 만 올리면 전체 처리량은 늘지 않고 워커당 속도만 떨어집니다.** 앞 절에서 본 대로 워커 추가는 서로 다른 테이블을 동시에 잡는 효과만 있습니다. 처리량을 올리려면 limit 을 올리거나 delay 를 낮춰야 합니다. Albe 는 `autovacuum_vacuum_cost_delay` 를 낮추는 것을 "the effective method", `autovacuum_vacuum_cost_limit` 을 200 보다 올리는 것을 "the gentle method" 로 부르고, 테이블별 변경을 권합니다. 다만 그 글도 cost limit 의 구체적 목표 숫자를 제시하지 않습니다. "cost limit 을 1000 이나 2000 으로 올려라" 류의 구체적인 숫자는 공개된 근거가 없습니다. 자기 환경의 처리량을 재서 정하는 값입니다.

**delay 를 0 으로 두는 것은 위험합니다.** [2편의 「배큠 자체가 성능을 떨어뜨리는 경로」](/writing/vacuuming-maintenance-2-blocked-cleanup/)에서 본 그 사례입니다 — 스로틀을 없애면 freeze 가 만드는 full page image 로 WAL 이 폭증해 동기 복제 커밋이 멈출 수 있습니다. 그 진단의 조치는 기본값 2ms 로 되돌리는 것이었고, 저자는 1ms 만으로도 WAL 홍수를 막는다고 적었습니다. 처리량이 필요하면 delay 를 0 으로 없애는 것보다 limit 을 올리는 편이 통제 가능한 선택입니다.

여기에 앞 절의 함정이 겹칩니다. 테이블별 cost 설정은 전역 밸런싱에서 제외되므로, 세 테이블에 `autovacuum_vacuum_cost_delay = 0` 을 주면 세 개가 각자 전역 예산 밖에서 I/O 를 씁니다.

반대 방향의 한계도 알아 둘 필요가 있습니다. **failsafe 가 발동하면 cost delay 는 무시됩니다**. 아무리 보수적으로 스로틀해 놔도 랩어라운드 임박 시에는 전력으로 달립니다. 스로틀 튜닝은 결국 "그 지점에 도달하지 않게 하는" 문제입니다.

18 부터는 추정 대신 실측이 가능합니다. delay time 이 서버 로그·`pg_stat_progress_vacuum`·`VERBOSE` 출력에 보고되며, 값을 채우려면 `track_cost_delay_timing` 을 켜야 합니다. `pg_stat_all_tables` 에는 `total_vacuum_time`·`total_autovacuum_time`·`total_analyze_time`·`total_autoanalyze_time` 이 추가됐고, `total_autovacuum_time` 은 "This includes the time spent sleeping due to cost-based delays" 입니다.

```sql
ALTER SYSTEM SET track_cost_delay_timing = on;   -- 켜야 delay_time 이 채워짐
SELECT pid, relid::regclass, phase, delay_time FROM pg_stat_progress_vacuum;

SELECT relname, autovacuum_count, total_autovacuum_time,
       total_autovacuum_time / NULLIF(autovacuum_count,0) AS avg_ms
FROM pg_stat_user_tables ORDER BY total_autovacuum_time DESC NULLS LAST LIMIT 20;
```

`delay_time` 이 전체 소요시간의 큰 비중이면 스로틀이 병목이라는 직접 증거입니다. 17 이하에서는 이 값을 얻을 수 없고 `VacuumDelay` wait event 로 간접 추정만 가능합니다.

### 인덱스 줄이기

인덱스 phase 시간은 앞에서 본 N × P 입니다. 메모리로 P 를 1로 만드는 것과 인덱스를 줄여 N 을 줄이는 것은 곱셈 관계라 둘 다 해야 효과가 큽니다.

먼저 흔한 오해를 정리합니다. **`INDEX_CLEANUP = auto`(14 부터 기본값)는 배큠 시간 단축 수단이 아닙니다.** 문서는 "Normally, `VACUUM` will skip index vacuuming when there are very few dead tuples in the table" 이라고만 쓰고 임계값을 밝히지 않습니다. 실제 임계는 소스에만 있습니다. `vacuumlazy.c` 의 `lazy_vacuum()`:

```c
#define BYPASS_THRESHOLD_PAGES  0.02    /* i.e. 2% of rel_pages */
...
bypass = (vacrel->lpdead_item_pages < threshold &&
          TidStoreMemoryUsage(vacrel->dead_items) < 32 * 1024 * 1024);
```

`LP_DEAD` 항목을 가진 페이지가 전체 페이지의 **2% 미만**이고, dead item 저장소 사용량이 **32MB 미만**일 때 **둘 다** 만족해야 생략합니다. 그리고 생략하는 것은 index vacuum 뿐이고 index cleanup phase 는 그대로 실행됩니다. 즉 `auto` 가 발동하는 구간은 "dead tuple 이 거의 없는 테이블"이고, **대형 고변경 테이블에서는 사실상 매번 인덱스를 전부 처리합니다**. `auto` 는 잔챙이 배큠의 낭비를 없애는 장치이지 시간 단축 레버가 아닙니다.

`OFF` 는 더 위험합니다. "If index cleanup is not performed regularly, performance may suffer, because as the table is modified indexes will accumulate dead tuples and the table itself will accumulate dead line pointers that cannot be removed until index cleanup is completed." 랩어라운드 급박 시의 속도용으로도 문서가 만류합니다 — "the wraparound failsafe mechanism controlled by `vacuum_failsafe_age` will generally trigger automatically … and should be preferred". 어차피 failsafe 는 `INDEX_CLEANUP = ON` 이어도 인덱스 배큠을 생략합니다.

실제로 N 을 줄이는 방법은 세 가지입니다.

**미사용 인덱스 삭제.** 인덱스 하나를 지우면 그 크기만큼의 스캔이 **모든 배큠에서** 사라집니다.

```sql
SELECT s.schemaname, s.relname, s.indexrelname,
       s.idx_scan, s.last_idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS idx_size
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisprimary
  AND NOT i.indisunique
ORDER BY pg_relation_size(s.indexrelid) DESC;
```

`idx_scan = 0` 만으로 지우면 안 됩니다. 누적값이라 `pg_stat_reset()`·서버 재구축·복제 승격 이후의 짧은 관측 창은 근거가 못 되고, **읽기 복제본에서만 쓰이는 인덱스는 프라이머리 통계에 잡히지 않습니다.** 월말·연말 배치용 인덱스는 관측 창을 길게 잡아야 하며 여기서 `last_idx_scan` 이 0/비0 보다 정보량이 많습니다.

**인덱스 자체를 작게.** 13 의 B-tree 중복 제거는 "The overhead of routine index vacuuming may also be reduced significantly" 라고 문서가 명시합니다. 저카디널리티 컬럼 인덱스에 특히 듣습니다. 중요한 조건이 하나 있습니다 — **"Users upgrading with pg_upgrade will need to use `REINDEX` to make an existing index use this feature."** 12 이하에서 pg_upgrade 로 올라온 인덱스는 `REINDEX` 하지 않으면 중복 제거가 걸려 있지 않습니다. 저카디널리티 대형 인덱스라면 배큠 시간 단축의 가장 값싼 한 방입니다. 비결정적 collation 의 `text`/`varchar`/`char`, `numeric`, `jsonb`, `float4`/`float8`, 컨테이너 타입, `INCLUDE` 인덱스는 중복 제거 대상이 아닙니다.

**인덱스 블로트를 애초에 덜 만들기.** 14 의 bottom-up index deletion 은 "particularly helpful for reducing index bloat on tables whose indexed columns are frequently updated" 이고, 문서는 "It's quite possible that the on-disk size of certain indexes will never increase by even one single page/block despite *constant* version churn from `UPDATE`s" 라고까지 씁니다. 단 배큠을 대체하지는 않습니다 — "an exhaustive "clean sweep" by a `VACUUM` operation … will eventually be required" 이고, 가장 오래된 garbage 항목의 나이를 보장하지 않습니다.

`REINDEX CONCURRENTLY` 는 배큠을 대체하지 않지만, 블로트된 인덱스의 물리 크기를 리셋해 **이후 모든 배큠의 인덱스 phase 스캔량**을 줄입니다. 비용도 큽니다 — "must perform **two scans of the table** for each index … This method requires more total work than a standard index rebuild". 실패하면 `_ccnew`·`_ccold` 접미사의 invalid 인덱스가 남고, 그것은 "will be ignored for querying purposes … however it will still consume update overhead" 이므로 방치하면 쓰이지도 않으면서 부담만 늘립니다. 그리고 14 부터 `CREATE INDEX CONCURRENTLY`·`REINDEX CONCURRENTLY` 는 다른 릴레이션의 dead row 제거를 막지 않습니다. 비-CONCURRENTLY 형태와 일반 장기 트랜잭션에는 여전히 "Like any long-running transaction, `REINDEX` on a table can affect which tuples can be removed by concurrent `VACUUM` on any other table" 이 적용됩니다.

### freeze 를 미리 분산시키기

freeze 관련 GUC 기본값과 내부 클램프입니다. 클램프는 조용히 적용되므로 설정값이 그대로 먹었다고 가정하면 안 됩니다.

| 파라미터 | 기본값 | 내부 클램프 |
|---|---|---|
| `vacuum_freeze_min_age` | 5천만 | `autovacuum_freeze_max_age` 의 **절반** |
| `vacuum_freeze_table_age` | 1억5천만 | `autovacuum_freeze_max_age` 의 **95%** |
| `vacuum_multixact_freeze_min_age` | 5백만 | multixact 판 절반 |
| `vacuum_multixact_freeze_table_age` | 1억5천만 | 95% |
| `vacuum_failsafe_age` | 16억 | `autovacuum_freeze_max_age` 의 105% 미만이 되지 않게 |
| `vacuum_multixact_failsafe_age` | 16억 | 동일 |
| `vacuum_max_eager_freeze_failure_rate` | `0.03` (3%). `0` = eager scanning 비활성 | 18 신규 |

문제의 구조는 이렇습니다. 여러 대형 테이블을 같은 시기에 적재했다면 `relfrozenxid` 가 비슷하고, 기본 설정에서 발동 주기는 모든 테이블이 동일하므로 **거의 같은 시점에 전 테이블이 aggressive vacuum 에 들어갑니다.** 그것이 anti-wraparound vacuum 이면 락으로 중단시킬 수도 없습니다. 레버는 네 개입니다.

**레버 1 — 테이블별 `autovacuum_freeze_max_age` 를 서로 다르게.** 전역보다 작은 값만 유효하므로 테이블마다 다르게 주면 발동 시점이 흩어집니다. `toast.` 변형을 함께 지정해야 합니다 — 문서의 age 조회 쿼리가 `greatest(age(c.relfrozenxid), age(t.relfrozenxid))` 로 TOAST 테이블 age 도 함께 보기 때문에, TOAST 만 늙어 anti-wraparound vacuum 을 유발할 수 있습니다.

**레버 2 — `vacuum_freeze_min_age` 를 낮춰 평시 배큠이 조금씩 freeze 하게.** 문서가 양방향 트레이드오프를 다 적어 뒀습니다 — "decreasing this setting increases the number of transactions that can elapse before the table must be vacuumed again" 이지만, "freezing a row version is a waste of time if the row is modified soon thereafter" 입니다. append-only·이력 테이블은 낮추는 쪽이 유리하고 고변경 테이블은 역효과입니다. 테이블 성격별로 갈라야 하는 파라미터입니다.

**레버 3 — `autovacuum_freeze_max_age` 를 올려 빈도를 낮추기.** 문서가 명시한 유일한 단점은 정량적입니다 — "The **sole disadvantage** … is that the `pg_xact` and `pg_commit_ts` subdirectories will take more space." 기본값 2억이 `pg_xact` 약 50MB·`pg_commit_ts` 약 2GB 이고, 최대값 20억이면 `pg_xact` 약 0.5GB·`pg_commit_ts` 약 20GB 입니다. Albe 는 반대로 insert-only 테이블에 `autovacuum_freeze_max_age = 10000000` 을 걸어 작업을 평탄화하는 방법을 제시합니다. 값을 정할 때는 XID 소모 속도를 재야 합니다 — `pg_current_xact_id()`(13+, 이전엔 `txid_current()`)를 두 시점에 호출해 차분을 봅니다.

**레버 4 — 스케줄된 수동 배큠으로 aggressive vacuum 을 선점.** `vacuum_freeze_table_age` 상한이 0.95배인 이유가 문서에 적혀 있습니다 — "the 0.95 multiplier leaves some breathing room to run a manual `VACUUM` before that happens". 수동 배큠은 cost delay 가 기본 0 이고 병렬 인덱스 배큠을 쓸 수 있으므로, **예측 불가 시점에 스로틀 없이 터지게 두는 대신 내가 고른 유지보수 창에서 직접 소화**하는 것이 문서가 상정한 운영 형태입니다.

대량 적재 직후라면 그 자리에서 freeze 부채를 청산하는 편이 낫습니다. `FREEZE` 는 "equivalent to performing `VACUUM` with the `vacuum_freeze_min_age` and `vacuum_freeze_table_age` parameters set to zero" 입니다.

```sql
VACUUM (FREEZE, VERBOSE, PARALLEL 8, ANALYZE) big_table;
```

`COPY FREEZE` 는 조건이 까다롭습니다. 대상 테이블이 **같은 서브트랜잭션에서 CREATE 또는 TRUNCATE** 되었고, 열린 커서가 없고, 더 오래된 스냅샷을 잡고 있지 않아야 합니다. 파티션 테이블과 foreign table 에는 쓸 수 없고 `COPY FROM` 전용입니다. 조건을 못 맞추면 **에러가 아니라 조용히 freeze 가 안 됩니다**("Rows will be frozen **only if** …") — 성공으로 착각하기 쉬우므로 `pg_class.relallfrozen`(18+)이나 `pg_visibility` 로 검증해야 합니다. 그리고 온전한 효과는 14 이상입니다 — 14 에서 "Have `COPY FREEZE` appropriately update page visibility bits" 가 들어갔고, 13 이하에서는 visibility map 이 제대로 세워지지 않아 이후 배큠이 전 페이지를 다시 훑었습니다.

18 로 올리는 것 자체가 이 문제의 구조적 완화책입니다. eager scanning 이 도입되어 "a normal vacuum may choose to scan skippable pages in an effort to freeze them. Doing so decreases the number of pages the next aggressive vacuum must scan" 이 되었습니다. 이전에는 "vacuum never processed all-visible pages until freezing was required" 였습니다. 공격성은 `vacuum_max_eager_freeze_failure_rate` 로 조절하며 **실패만 계산**하고, 성공적 eager freeze 는 all-visible but not all-frozen 페이지의 20% 로 내부 상한이 걸립니다. 이 값은 테이블별로도 줄 수 있어 append-only 대형 테이블만 더 공격적으로 만들 수 있습니다. 다만 "most tables still require periodic aggressive vacuuming" 이라는 문장도 함께 있습니다.

### 테이블 설계로 줄이기

**HOT update 와 `fillfactor`.** HOT 이 성립하는 조건은 두 개입니다 — 인덱스가 참조하는 컬럼을 하나도 수정하지 않을 것(BRIN 은 예외), 그리고 같은 페이지에 새 버전이 들어갈 여유가 있을 것. 성립하면 두 가지가 절약됩니다. "New index entries are not needed to represent updated rows" 이고, 중간 버전은 "can be completely removed during normal operation, including `SELECT`s, instead of requiring periodic vacuum operations" 입니다. 즉 배큠의 인덱스 phase 대상이 줄고, 배큠이 손댈 dead tuple 자체가 줄어듭니다.

진단은 `pg_stat_user_tables` 세 컬럼으로 합니다.

```sql
SELECT relname, n_tup_upd, n_tup_hot_upd, n_tup_newpage_upd,
       round(100.0 * n_tup_hot_upd     / NULLIF(n_tup_upd,0), 1) AS hot_pct,
       round(100.0 * n_tup_newpage_upd / NULLIF(n_tup_upd,0), 1) AS newpage_pct
FROM pg_stat_user_tables
WHERE n_tup_upd > 0
ORDER BY n_tup_upd DESC;
```

`newpage_pct` 가 높으면 페이지 공간 부족이 원인일 가능성이 크므로 `fillfactor` 를 낮춥니다. `hot_pct` 가 낮은데 `newpage_pct` 도 낮으면 원인은 공간이 아니라 **인덱스 컬럼을 건드리는 UPDATE** 이므로 `fillfactor` 로는 해결되지 않습니다.

`fillfactor` 는 10에서 100 사이이고 기본값은 100 입니다. 권장 숫자는 공식 문서에도 커뮤니티 자료에도 없습니다 — 문서가 제시하는 것은 "For a table whose entries are never updated, complete packing is the best choice, but in heavily updated tables smaller fillfactors are appropriate" 라는 방향뿐입니다. 트레이드오프도 분명합니다: fillfactor 를 낮추면 같은 데이터가 더 많은 페이지를 차지하고, 배큠은 페이지를 훑으므로 스캔 대상이 늘어납니다. **UPDATE 가 없는 테이블에 낮은 fillfactor 를 주면 순손실**입니다.

**인덱스 컬럼을 건드리는 UPDATE 를 줄이기.** 문서 문장이 강합니다 — "Changing the value of only one column covered by one index during an `UPDATE` *always* necessitates a new set of index tuples — one for *each and every* index on the table." 인덱스가 10개인 테이블에서 인덱스 컬럼 하나를 갱신하면 인덱스 항목 10개가 생깁니다. 처방은 `UPDATE... SET` 에 실제로 바뀌는 컬럼만 넣는 것과, 빈번히 갱신되는 컬럼에 인덱스를 만들지 않는 것입니다. 참고로 인덱스 컬럼을 "같은 값"으로 SET 했을 때 HOT 이 유지되는지는 공식 문서로 확인되지 않습니다 — 문구가 "does not modify" 기준인지 값 변화 기준인지 명시하지 않습니다.

**파티셔닝.** 병렬 인덱스 배큠 절에서 본 논리가 여기서 실질적인 설계 결론이 됩니다. 18 이하 autovacuum 은 한 테이블의 인덱스를 병렬 처리할 수 없으므로 1TB 단일 테이블은 항상 워커 하나가 순차 처리합니다. 같은 데이터를 12개 파티션으로 쪼개면 `autovacuum_max_workers` 한도 내에서 최대 12개 워커가 서로 다른 파티션에 동시에 붙을 수 있습니다. Albe 도 "Parallel workers on separate partitions finish a large partitioned table faster than one worker could" 라고 같은 방향이며, 다만 **"provided updates hit all partitions"** 라는 조건을 붙입니다. UPDATE 가 한 파티션에 집중되면 그 파티션은 여전히 워커 하나가 처리하므로 이점이 사라집니다.

두 번째 이점은 배큠 자체를 회피하는 것입니다. 대량 `DELETE` 는 dead tuple 을 대량 생성하고, 그것을 지우려고 모든 인덱스를 전체 스캔하게 만들고, 지운 공간도 OS 로 돌아오지 않습니다. `DROP TABLE`·`DETACH PARTITION`·`TRUNCATE` 는 이 셋을 모두 0 으로 만듭니다. 배큠이 OS 에 돌려주는 것은 "any empty pages at the end of the table" 뿐이라는 점이 근거입니다. 그 truncate 단계가 `ACCESS EXCLUSIVE` 락을 요구하므로, 서비스 중이라면 `VACUUM (TRUNCATE false) t;` 또는 `ALTER TABLE t SET (vacuum_truncate = false)` 로 피할 수 있습니다. 동명의 GUC `vacuum_truncate`(기본 `true`)는 18 신규이고 storage parameter 는 12 부터 있었습니다.

파티셔닝 관련해 18 에서 바뀐 호환성 항목이 하나 있습니다. "Change VACUUM and ANALYZE to process the inheritance children of a parent … The previous behavior can be performed by using the new `ONLY` option." **18 부터 `VACUUM parent;` 는 모든 자식 파티션을 처리합니다.** 17 이하 습관대로 부모에 배큠을 걸던 스크립트는 소요 시간이 크게 달라집니다. 부모의 통계만 갱신하려면 `VACUUM (ONLY) parent;` 를 써야 합니다.

**배치 삭제는 나눠서.** 파티션 드롭으로 대체할 수 없다면 최소한 트랜잭션을 짧게 끊습니다. 근거는 세 가지입니다: 한 트랜잭션이 길어지면 그 동안 DB 전체의 배큠이 dead tuple 을 지우지 못하고, 한 번에 만든 dead tuple 이 메모리 한도를 넘으면 인덱스를 여러 번 통째로 스캔하며, 대량 삭제는 WAL 을 급증시킵니다. 배치 크기와 sleep 시간에 대한 공식 권장값은 없습니다.

**큰 컬럼과 TOAST.** 큰 값이 메인 힙에 남아 있으면 페이지당 튜플 수가 줄어 같은 행 수를 담는 데 더 많은 페이지가 필요하고, 배큠 스캔량도 늘어납니다. 페이지 여유가 없어 HOT 도 실패하기 쉽습니다. 단 TOAST 는 별개 테이블이며 자체 배큠 대상이므로 부담이 사라지는 것이 아니라 이동합니다. `toast_tuple_target` 은 "the default setting is often close to optimal, and it is possible that setting this parameter could have negative effects in some cases" 라고 문서가 직접 경고합니다. 유지보수 창이 짧을 때는 메인과 TOAST 를 나눠 배치할 수 있습니다 — `PROCESS_TOAST`(14+)와 `PROCESS_MAIN`(16+)입니다. TOAST 도 랩어라운드 대상이므로 무기한 미루면 TOAST 때문에 anti-wraparound vacuum 이 발동합니다.

### I/O 와 버퍼 캐시

`vacuum_buffer_usage_limit`(16 도입, 기본 `2MB`)은 배큠에 작은 링 버퍼를 할당해 그 안의 버퍼를 재사용하게 만듭니다. 그래서 1TB 테이블을 배큠해도 `shared_buffers` 전체가 배큠 데이터로 덮이지 않습니다. 유효 범위는 `128 kB`부터 `16 GB`이고, `0` 은 링 버퍼를 비활성화해 `shared_buffers` 를 자유롭게 쓰게 합니다. **`shared_buffers` 의 1/8 을 넘으면 조용히 캡됩니다**.

목표가 정반대인 두 설정이 하나의 값에 걸려 있습니다. 크게 하면 배큠이 빨라지지만 "having too large a setting may cause too many other useful pages to be evicted from shared buffers" 이고, 기본값을 유지하면 배큠이 같은 페이지를 반복 읽을 수 있습니다. 전역 값은 autovacuum 에도 적용되므로("which also controls autovacuum"), **전역은 기본값으로 두고 유지보수 창의 수동 배큠에서만 `BUFFER_USAGE_LIMIT` 을 크게 주는 것**이 실무 결론입니다. 참고로 failsafe 가 발동하면 Buffer Access Strategy 자체가 비활성화됩니다 — 이 트레이드오프의 극단 선택은 이미 엔진에 내장돼 있습니다. 17 에서 기본값을 2MB 로 올렸다는 사실은 릴리스 노트로 확인되지만, 16 시점의 값은 릴리스 노트가 밝히지 않아 확인되지 않습니다.

WAL 쪽도 봐야 합니다. `full_page_writes`(기본 `on`)는 "the entire content of each disk page to WAL during the first modification of that page after a checkpoint" 를 씁니다. freeze 는 튜플 헤더를 수정해 페이지를 dirty 로 만들고, aggressive vacuum 은 all-visible but not all-frozen 페이지를 전부 방문합니다. 그래서 **대형 테이블의 aggressive vacuum 은 짧은 시간에 페이지당 8KB 의 full page image 를 대량 생성합니다**. 이것이 "배큠이 돌면 WAL 이 폭증하고 복제가 밀린다"의 주된 메커니즘입니다. 대응은 두 가지이고 둘 다 공식 근거가 있습니다: 문서가 직접 제시한 유일한 감축법인 **체크포인트 간격 늘리기**("one way to reduce the cost of full-page writes is to increase the checkpoint interval parameters"), 그리고 **`wal_compression`**(기본 `off`, `pglz`/`lz4`/`zstd`) — 압축 대상이 full page image 이므로 배큠이 만드는 WAL 에 정확히 들어맞습니다. 방법별 압축률과 CPU 비용의 정량 비교는 공식 문서가 제공하지 않습니다. `wal_log_hints` 를 켜 뒀다면 hint bit 갱신도 full page image 를 유발하므로 배큠 WAL 량이 더 늘어납니다.

read-ahead 계열 기본값은 18 에서 올라갔습니다: `effective_io_concurrency` 와 `maintenance_io_concurrency` 가 각각 **16**("This more accurately reflects modern hardware"), `io_combine_limit` 은 `128kB` 입니다. 앞의 두 값은 테이블스페이스별로 재정의할 수 있으므로, 배큠 대상 대형 테이블이 별도 스토리지의 테이블스페이스에 있다면 그 테이블스페이스만 다르게 줄 수 있습니다. 17 이하의 `maintenance_io_concurrency` 기본값은 릴리스 노트가 이전 값을 밝히지 않아 확인되지 않습니다.

18 의 비동기 I/O 는 배큠에 직접 작용합니다. 릴리스 노트 Overview 가 수혜 대상에 "**vacuums**" 를 명시적으로 넣었습니다. `io_method` 기본값이 `worker` 이므로 **설정 변경 없이도** 배큠의 힙 스캔 I/O 가 AIO 경로를 탑니다. `io_workers` 기본값이 3 이라 I/O 바운드 환경에서는 이 값이 병목이 될 수 있고, `pg_aios` 뷰로 관측합니다. Linux 에서 `io_uring` 빌드가 가능하면 워커 프로세스 경유 오버헤드를 줄일 수 있지만 정량 효과는 확인되지 않습니다.

반면 NVMe·gp3·네트워크 스토리지 사이의 배큠 시간 배수, OS 레벨 read-ahead 튜닝 효과, 스토리지 유형별 cost 파라미터 권장값, 매니지드 서비스 벤더의 권장 숫자는 공개된 근거가 없습니다. 이런 숫자는 자기 환경에서 측정해서 얻어야 합니다.
## PostgreSQL 14 → 18 배큠 변화 요약

13 은 이미 EOL(2025-11-13)이므로 지원 중인 14 부터 정리합니다. 각 항목은 릴리스 노트 기준입니다.

**14** (2021-09-30)

- *추가* — `INDEX_CLEANUP` 기본값 `auto` · vacuum failsafe(`vacuum_failsafe_age`·`vacuum_multixact_failsafe_age`) · bottom-up index deletion · `PROCESS_TOAST` · 인덱스별 autovacuum 로깅 · `COPY FREEZE` 가 page visibility bit 를 정상 갱신 · `vacuumdb --no-index-cleanup`·`--no-truncate`
- *변경* — `vacuum_cost_page_miss` 기본값 10 → 2 · 랩어라운드 경고·하드리밋 여유 확대 · `CREATE INDEX CONCURRENTLY`·`REINDEX CONCURRENTLY` 가 다른 릴레이션의 dead row 제거를 막지 않음
- *제거* — `vacuum_cleanup_index_scale_factor`

**15** (2022-10-13)

- *추가* — `VACUUM VERBOSE`·autovacuum 로그 정보 · 중복 제거가 시스템·TOAST 인덱스에도 적용 · `CLUSTER` 의 파티션 테이블 지원
- *변경* — `log_autovacuum_min_duration` 기본값 `-1` → `10min`(`log_checkpoints` 도 `on`) · `relfrozenxid`·`relminmxid` 를 더 적극적으로 전진
- 신규 `VACUUM` 옵션은 없습니다.

**16** (2023-09-14)

- *추가* — `BUFFER_USAGE_LIMIT` 과 `vacuum_buffer_usage_limit` · `PROCESS_MAIN` · `SKIP_DATABASE_STATS`·`ONLY_DATABASE_STATS` · `pg_stat_io` 뷰 · `n_tup_newpage_upd` 컬럼
- *변경* — 평시 배큠 중 기회적 페이지 freeze("makes full-table freeze vacuums less necessary") · delay 설정 변경을 **블록 단위**로 반영 · BRIN 전용 컬럼 갱신 시 HOT 허용
- *제거* — `vacuum_defer_cleanup_age`

**17** (2024-09-26)

- *추가* — dead tuple 저장 구조 개편으로 **`maintenance_work_mem` 1GB 상한 제거** · `indexes_total`·`indexes_processed` 진행률 · `MAINTAIN` 권한과 `pg_maintain` 롤 · 인덱스 없는 릴레이션 배큠 최적화
- *변경* — `vacuum_buffer_usage_limit` 기본값 `2MB` · 배큠 WAL 이 더 압축적
- *비호환* — `pg_stat_progress_vacuum` 컬럼 개편(`max_dead_tuple_bytes`·`num_dead_item_ids`·`dead_tuple_bytes`)
- *제거* — `old_snapshot_threshold`

**18** (2025-09-25, 현재 GA)

- *추가* — eager freezing·eager scanning 과 `vacuum_max_eager_freeze_failure_rate` · `autovacuum_worker_slots` · `autovacuum_vacuum_max_threshold`(1억) · `vacuum_truncate` GUC · `total_vacuum_time` 등 4개 컬럼 · delay time 보고(`track_cost_delay_timing`) · AIO(`io_method`·`pg_aios`) · `pg_class.relallfrozen` · `pg_signal_autovacuum_worker` 롤
- *변경* — autovacuum 발동 공식 2곳 · `autovacuum_max_workers` 를 reload 로 변경 가능 · `effective_io_concurrency`·`maintenance_io_concurrency` 기본값 16
- *비호환* — `VACUUM`·`ANALYZE` 가 상속 자식까지 처리(이전 동작은 새 `ONLY` 옵션)
## PostgreSQL 19 에서 바뀌는 것 (GA 전)

**PostgreSQL 19 는 아직 GA 전입니다.** 2026년 9월 현재 Beta 3(2026-08-13)이고 GA 날짜는 공개되지 않았습니다. 아래는 개발 문서 릴리스 노트 기준이며 GA 시점에 달라질 수 있습니다.

- **`REPACK` 명령 도입.** `VACUUM FULL` 과 `CLUSTER` 의 기능을 통합하고, `CONCURRENTLY` 옵션으로 "repacking without blocking reads and writes to the table" 가 가능해집니다. `max_repack_replication_slots` 도 함께 추가됩니다. 주의할 점은 **`VACUUM FULL` 이 폐기된 것이 아니라는 것**입니다 — 릴리스 노트 문장은 "The old commands have been retained for compatibility" 입니다. 통합이지 deprecated 가 아닙니다.
- **autovacuum 의 병렬 인덱스 배큠.** 앞에서 여러 번 짚은 18 이하의 구조적 제약이 여기서 풀립니다. "Autovacuum can now use parallel worker processes to vacuum a table's indexes" 이고, 전역 `autovacuum_max_parallel_workers` 와 테이블별 `autovacuum_parallel_workers` 로 제어합니다. **전역 기본값이 `0` 이므로 19 로 올려도 옵트인하지 않으면 동작은 바뀌지 않습니다.**
- **autovacuum 우선순위 스코어링.** 테이블 처리 순서를 점수로 정하는 방식이 추가되고, weight GUC 5종(`autovacuum_freeze_score_weight`, `autovacuum_multixact_freeze_score_weight`, `autovacuum_vacuum_score_weight`, `autovacuum_vacuum_insert_score_weight`, `autovacuum_analyze_score_weight`, 전부 기본값 1.0)과 `pg_stat_autovacuum_scores` 뷰가 생깁니다. 이 5종은 `postgresql.conf` 전용이고 테이블별 오버라이드가 없습니다.
- **랩어라운드 경고 임계 상향.** "Issue warnings when the wraparound of xid and multi-xids is less than 100 million … The previous warning was 40 million." 즉 4천만에서 1억으로 올라갑니다.
- **multixact 멤버 64비트화.** "Make multixid members 64-bit" 로 멤버 저장소 카운터가 64비트가 됩니다. [3편에서 본](/writing/vacuuming-maintenance-3-outages/) 멤버 저장소 압박 구조가 사실상 해소되는 변화입니다. 다만 **multixact ID 자체는 여전히 32비트**이고, 내부 XID 폭도 18·19 모두 32비트입니다. `xid8` 은 64비트 XID 를 표현하는 데이터 타입이지 내부 XID 폭이 바뀐 것이 아닙니다.
- **평시 쿼리 스캔이 visibility map 을 갱신할 수 있게 됩니다.** "Allow query table scans to mark pages as all-visible in the visibility map — Previously only `VACUUM` and `COPY... FREEZE` could do this."
- 그 밖에: `pg_stat_progress_vacuum` 에 `started_by`·`mode` 컬럼 / `VACUUM (VERBOSE)`·autovacuum 로그에 메모리 사용량·병렬 정보 / full page write 바이트 보고 / `log_autoanalyze_min_duration` 분리 / hash 인덱스 bulk-deletion 과 GIN 인덱스 배큠에 streaming read / `io_method = worker` 의 워커 수 자동 조절(`io_min_workers`·`io_max_workers` 등) / `vacuumdb --dry-run`.

각 항목의 정량 개선폭은 릴리스 노트가 밝히지 않습니다. 19 를 기다릴 이유가 있는 곳은 분명합니다 — 인덱스가 많은 초대형 단일 테이블의 autovacuum, 그리고 무중단 재구성에 확장(pg_repack)을 써야 했던 자리입니다. 그전까지는 앞에서 본 방법들, 특히 파티셔닝과 유지보수 창의 수동 배큠이 남은 선택지입니다.
