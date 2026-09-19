---
date: 2019-02-18 21:13:43 +0900
title: "주기적인 유지관리 Vacuuming #.1 배큠의 기초와 VACUUM FULL"
category: postgresql
excerpt: "PostgreSQL 문서는 배큠을 각 테이블마다 정기적으로 실행해야 하는 이유를 네 가지로 정리합니다. 네 번째는 성질이 다른 카운터 두 개를 묶은 것이라 나눠 봅니다. 서술 기준은 PostgreSQL 18(2025-09-25 릴리스, 최신 GA)입니다. UPDATE 나 DELETE…"
updated: 2026-09-18
series: "주기적인 유지관리 Vacuuming"
series_index: "1 / 4"
---

> **다시 씀 (2026-09)** — 2019년에 쓴 글을 PostgreSQL 18 기준으로 다시 썼습니다.

**시리즈** · **1. 배큠의 기초와 VACUUM FULL** · [2. dead tuple 을 지우지 못할 때](/writing/vacuuming-maintenance-2-blocked-cleanup/) · [3. 장애가 되는 경로](/writing/vacuuming-maintenance-3-outages/) · [4. 시간을 줄이는 방법](/writing/vacuuming-maintenance-4-reducing-time/)

## 배큠이 하는 네 가지 일

PostgreSQL 문서는 배큠을 각 테이블마다 정기적으로 실행해야 하는 이유를 네 가지로 정리합니다.

1. UPDATE 또는 DELETE 된 행이 점유한 디스크 공간의 회수·재사용
2. 쿼리 플래너가 사용하는 데이터 통계 갱신
3. 인덱스 전용 스캔(index-only scan)을 빠르게 만드는 visibility map(가시성 맵) 갱신
4. 트랜잭션 ID(XID) 랩어라운드와 multixact ID 랩어라운드가 일으키는 아주 오래된 데이터 손실 방지

네 번째는 성질이 다른 카운터 두 개를 묶은 것이라 나눠 봅니다. 서술 기준은 **PostgreSQL 18**(2025-09-25 릴리스, 최신 GA)입니다.

### 디스크 공간 회수

UPDATE 나 DELETE 는 옛 행 버전을 즉시 지우지 않습니다. MVCC 아래에서는 다른 트랜잭션이 그 버전을 계속 볼 수 있기 때문입니다. 어떤 트랜잭션에도 더는 보이지 않게 된 행 버전이 dead tuple 이고, 배큠이 회수하는 대상입니다.

표준 VACUUM(plain VACUUM)은 테이블과 인덱스에서 dead tuple 을 제거하고 그 공간을 재사용 가능하다고 표시합니다. 중요한 것은 **그 공간이 운영체제로 돌아가지 않는다**는 점입니다. 예외는 말단 페이지가 완전히 비고 배타 락을 쉽게 얻을 수 있는 경우뿐입니다. VACUUM FULL 은 테이블을 새 파일로 다시 써서 공간을 운영체제에 반환하지만 느리고 락이 강합니다.

일상 유지관리의 목표는 표준 VACUUM 을 충분히 자주 돌려 FULL 이 필요 없게 만드는 것입니다. 여기에 자주 오해되는 사실이 붙습니다. autovacuum 데몬은 **절대** VACUUM FULL 을 실행하지 않습니다(*"in fact will never issue VACUUM FULL"*). 심한 블로트를 autovacuum 이 알아서 압축해 주는 일은 없습니다.

### 플래너 통계 갱신

플래너는 실행 계획을 만들 때 테이블 내용 통계에 의존합니다. 통계는 `ANALYZE` 명령, `VACUUM` 의 `ANALYZE` 옵션, autovacuum 의 analyze 로 생성됩니다. 갱신이 빈번해도 통계적 분포가 크게 바뀌지 않으면 통계를 다시 만들 필요는 없습니다. 단 autovacuum 은 통계 수집에 의존하므로 `track_counts` 가 `true` 여야 동작합니다.

### visibility map 갱신

배큠은 테이블마다 visibility map 을 관리합니다. 모든 활성 트랜잭션에 보이는 튜플만 담긴 페이지를 표시하는 지도이고, 용도는 두 가지입니다. 배큠 자신이 정리할 것 없는 페이지를 다음 실행에서 건너뛰고, 인덱스 전용 스캔이 heap fetch 를 건너뜁니다. visibility map 은 heap 보다 훨씬 작아 heap 이 커도 캐시에 잘 남습니다.

PG 18 에서 달라진 점이 있습니다. "일반 배큠은 all-visible 페이지를 절대 건드리지 않는다"는 설명은 17 이하에서만 맞습니다. 18 은 eager scanning 을 도입해 일반 배큠도 all-visible 페이지를 골라 얼립니다. 릴리스노트가 *"Previously vacuum never processed all-visible pages until freezing was required"* 라고 과거형으로 씁니다. 조절 방법은 [4편](/writing/vacuuming-maintenance-4-reducing-time/)에서 다룹니다.

### XID 랩어라운드 방지

XID 는 32비트이고 모듈로 2^32 로 비교됩니다. 그래서 어떤 XID 를 기준으로 "과거"가 약 20억, "미래"가 약 20억입니다. 문서는 *"vacuum every table in every database at least once every two billion transactions"* 라고 못 박습니다. 여기에 세 가지를 보태야 실무에서 쓸 수 있습니다.

- 정확한 상한은 20억이 아니라 *"two billion transactions minus the `vacuum_freeze_min_age` value at the time of the last aggressive vacuum"* 입니다. 기본값 5천만을 대입하면 19억5천만입니다.
- 실제 발동선은 훨씬 앞입니다. `autovacuum_freeze_max_age` 기본값이 2억이고, 문서는 다른 이유로 배큠되지 않는 테이블이 *"once every `autovacuum_freeze_max_age` minus `vacuum_freeze_min_age` transactions"* 마다 배큠된다고 씁니다. 기본값이면 약 1억5천만마다입니다. 20억은 이론적 벽이고 실제 선은 그 10분의 1 근처입니다.
- 그래도 밀리면 랩어라운드 지점까지 약 4천만이 남았을 때 경고가, 3백만 미만에서 신규 XID 할당 거부가 옵니다. 이 두 임계값은 **PG 14 이상 기준**이고(14 에서 경고 시점과 하드리밋이 상향되었습니다), 13 이하는 값과 에러 문구가 다릅니다. 실제 로그 문구와 멈추는 순서는 [3편](/writing/vacuuming-maintenance-3-outages/)에서 다룹니다.

해결 원리는 freeze 입니다. 과거에 커밋된 트랜잭션이 삽입한 행을 현재·미래 모두에 보인다고 확정 표시해 XID 비교에서 빼냅니다. 구현 방식은 9.4 에서 바뀌었습니다. 그 전에는 `xmin` 을 `FrozenTransactionId` 로 실제 교체했고, 9.4 이후는 플래그 비트만 세워 원래 `xmin` 을 보존합니다.

### multixact ID 랩어라운드 방지

multixact ID 는 여러 트랜잭션이 한 행을 동시에 잠글 때 쓰입니다. 튜플 헤더에는 락 정보를 담을 자리가 부족하므로 그 정보를 `pg_multixact` 에 두고 헤더의 `xmax` 에는 multixact ID 만 남깁니다. XID 와 다른 점은 관리 대상 32비트 카운터가 **두 개**라는 것입니다. multixact ID 카운터와, 멤버 목록을 담는 **멤버 저장소** 카운터입니다.

이 절에는 잘못 알려진 서술이 세 가지 돌아다닙니다.

- **"`relminmxid` 가 `vacuum_multixact_freeze_min_age` 보다 오래되면 강제된다"** — 비교 대상은 `vacuum_multixact_freeze_table_age`(기본 1억5천만)입니다. `vacuum_multixact_freeze_min_age`(기본 5백만)는 스캔 중인 페이지에서 *어떤* multixact ID 를 교체할지 정하는 컷오프이고, 스캔 범위와는 무관합니다.
- **"전체 테이블 스캔이 강제된다"** — 강제되는 것은 aggressive vacuum 입니다. *"only those pages which are known to be all-frozen will be skipped"* 이고, all-frozen 스킵은 9.6 도입이므로 그 이전 자료에 근거한 "전체 페이지 방문" 서술은 지금 맞지 않습니다.
- **"멤버 저장소가 할당량의 50% 를 넘으면"** — PG 18 문서는 절대값으로 *"exceeds about 10GB"* 라고 쓰고, 상한은 *"about 20GB before reaching wraparound"* 입니다. "50%" 는 PG 13 문서의 표기입니다.

동작은 이렇습니다. 배큠이 테이블의 일부라도 스캔하면 `vacuum_multixact_freeze_min_age` 보다 오래된 multixact ID 를 다른 값(0, 단일 트랜잭션 ID, 또는 더 새로운 multixact ID)으로 교체합니다. `pg_class.relminmxid` 는 그 테이블에 남아 있을 수 있는 가장 오래된 multixact ID 를 담고, 이 값이 `vacuum_multixact_freeze_table_age` 보다 오래되면 aggressive vacuum 이 강제됩니다. 멤버 저장소가 약 10GB 를 넘으면 연령이 오래된 테이블부터 aggressive vacuum 이 더 자주 일어나며, **autovacuum 이 명목상 꺼져 있어도** 발동합니다.

두 축은 같은 3단 구조입니다.

| 역할 | XID | MultiXact |
|---|---|---|
| 무엇을 얼릴지 (컷오프) | `vacuum_freeze_min_age` (5천만) | `vacuum_multixact_freeze_min_age` (5백만) |
| 어디까지 스캔할지 (aggressive 승격) | `vacuum_freeze_table_age` (1억5천만) | `vacuum_multixact_freeze_table_age` (1억5천만) |
| 무조건 발동 (백스톱) | `autovacuum_freeze_max_age` (2억) | `autovacuum_multixact_freeze_max_age` (4억) |
| 비상 모드 | `vacuum_failsafe_age` (16억) | `vacuum_multixact_failsafe_age` (16억) |

비대칭이 하나 있습니다. XID 쪽 승격 기준은 `vacuum_freeze_table_age` 에서 `vacuum_freeze_min_age` 를 **뺀** 값입니다(기본값이면 1억). multixact 쪽 문장에는 뺄셈이 없습니다. 같은 뺄셈이 적용되는지는 문서에 명시되어 있지 않으므로, 표기 차이를 그대로 두고 읽는 편이 안전합니다.

경고·차단 구조는 XID 와 같습니다(4천만에서 경고, 3백만 미만에서 신규 MXID 생성 거부). 다만 XID 소진은 모든 쓰기를 막고 MXID 소진은 MXID 를 요구하는 행 락이 걸린 쓰기만 막습니다. 그리고 replication slot 은 multixact 정리를 직접 붙잡지 않으므로 오래된 슬롯 삭제는 multixact 랩어라운드 해결과 대개 무관합니다.

aggressive vacuum 의 발동 조건과 anti-wraparound vacuum(랩어라운드 방지 배큠)의 성질은 [2편](/writing/vacuuming-maintenance-2-blocked-cleanup/), failsafe 는 [3편](/writing/vacuuming-maintenance-3-outages/)에서 다룹니다.
## 표준 VACUUM 과 VACUUM FULL

| 항목 | 표준 VACUUM | VACUUM FULL |
|---|---|---|
| 락 | `SHARE UPDATE EXCLUSIVE` (말단 절단 시 순간 `ACCESS EXCLUSIVE`) | 전 구간 `ACCESS EXCLUSIVE` |
| 읽기·쓰기 동시 진행 | 가능 | 불가 |
| 회수 공간의 행선지 | 테이블 내부 재사용 | 운영체제로 반환 |
| 추가 디스크 | 필요 없음 | 테이블 + 인덱스 크기 |
| 인덱스 재생성 | 아니오 | 예 |
| 진행률 뷰 | `pg_stat_progress_vacuum` | `pg_stat_progress_cluster` |

### 락과 동시성

표준 VACUUM 은 *"can operate in parallel with normal reading and writing of the table, as an exclusive lock is not obtained"* 입니다. 잡는 락 이름은 `SHARE UPDATE EXCLUSIVE` 입니다.

"배큠 중에는 DDL 이 불가하고 DML 은 정상 작동한다"고 정리한 자료가 많은데, 정확하지 않습니다.

- 일반 SELECT · INSERT · UPDATE · DELETE 는 표준 VACUUM 과 **동시에** 진행됩니다.
- 충돌하는 락 요청이 오면 **autovacuum 쪽이 중단됩니다** — *"lock acquisition will interrupt the autovacuum"*. "배큠이 DDL 을 막는다"가 아니라 "DDL 이 오면 autovacuum 이 물러난다"가 맞습니다. 이건 autovacuum 에 해당하는 동작이고, 수동 `VACUUM` 은 이렇게 스스로 물러나지 않습니다.
- 그래서 문서가 경고합니다. *"Regularly running commands that acquire locks conflicting with a SHARE UPDATE EXCLUSIVE lock (e.g., ANALYZE) can effectively prevent autovacuums from ever completing."*
- 예외는 `pg_stat_activity` 의 쿼리 이름이 `(to prevent wraparound)` 로 끝나는 autovacuum 입니다. 자동 중단되지 않습니다.

표준 VACUUM 도 한 구간에서는 `ACCESS EXCLUSIVE` 를 잡습니다. 인덱스 정리 뒤 말단 빈 페이지를 잘라 운영체제에 반환하는 `truncating heap` 페이즈입니다. PG 18 소스(`src/backend/access/heap/vacuumlazy.c`)의 상수가 조건을 정합니다.

```c
#define REL_TRUNCATE_MINIMUM            1000
#define REL_TRUNCATE_FRACTION           16
#define VACUUM_TRUNCATE_LOCK_TIMEOUT    5000    /* ms */
```

잘라낼 수 있는 페이지가 1000 또는 `relsize / 16` 중 작은 쪽 이상 있어야 절단을 시도하고, 락은 **최대 5초까지만** 기다립니다. 이 값들은 의도적으로 GUC 로 노출되지 않았습니다.

`TRUNCATE` 옵션은 끄는 것만 되고 강제할 수는 없습니다(*"it can't force truncation to happen"*). 이 락을 피해 `vacuum_truncate = false` 를 쓰는 대표적 이유는 스탠바이입니다. 9.6 릴리스노트가 불필요한 절단 시도를 없앤 이유로 *"avoiding unnecessary query cancellations on standby servers"* 를 듭니다.

### 회수한 공간은 어디로 가는가

표준 VACUUM 은 공간을 테이블 안에 남겨 재사용하게 하고, VACUUM FULL 은 새 파일을 쓴 뒤에야 옛 사본을 놓습니다. 그래서 재작성 계열 명령은 *"extra disk space approximately equal to the size of the table"* 을 일시적으로 더 쓰며, 문서는 여기서 테이블과 인덱스의 옛 사본을 함께 언급합니다.

정확한 크기는 `CLUSTER` 문서에 있습니다. 인덱스 스캔 경로는 *"the sum of the table size and the index sizes"*, 순차 스캔과 정렬 경로는 *"as much as double the table size, plus the index sizes"* 입니다. 진행률 문서에서 `sorting tuples` 와 `writing new heap` 은 `CLUSTER` 에 한정해 서술되고 `seq scanning heap` 만 명령 무관으로 서술되므로, **VACUUM FULL 은 순차 스캔만 하고 정렬하지 않는다는 추론**이 나옵니다. 따라서 실무 수치는 **테이블 + 인덱스 크기**입니다. 문서가 VACUUM FULL 에 대해 직접 밝힌 숫자가 아니라 페이즈 설명에서 따라오는 값입니다. "정렬까지 2배"는 `CLUSTER` 에만 해당합니다.

인덱스는 성질이 다릅니다. 완전히 빈 B-tree 페이지는 재사용되지만 *"if all but a few index keys on a page have been deleted, the page remains allocated"* 이고, 문서는 그런 패턴에는 주기적 reindex 를 권고합니다. B-tree 가 아닌 인덱스의 블로트 가능성은 *"has not been well researched"* 라고만 적혀 있습니다.

### VACUUM FULL 이 인덱스까지 다시 만드는 이유

근거는 진행률 뷰입니다. VACUUM FULL 은 `pg_stat_progress_cluster` 에 보고하고, 그 페이즈 목록에 `swapping relation files` 다음으로 **`rebuilding index`** 가 있으며 `index_rebuild_count` 는 그 페이즈에서만 증가합니다. 뷰를 공유하는 이유도 문서가 밝힙니다. *"both VACUUM FULL and CLUSTER rewrite the table, while regular VACUUM only modifies it in place."*

`CLUSTER` 문서에도 각 인덱스의 임시 사본을 만든다는 문장이 있고, `INDEX_CLEANUP` 이 `FULL` 과 함께면 무시되는 것도 같은 이유입니다. 어차피 다시 만드니 인덱스 정리 옵션이 의미가 없습니다. 인덱스가 처음부터 새로 만들어지므로 인덱스 블로트도 함께 해소됩니다.

### VACUUM FULL 을 써야 할 때와 쓰면 안 될 때

문서가 인정하는 용도는 좁습니다. *"not recommended for routine use, but might be useful in special cases — e.g., when you have deleted or updated most of the rows in a table and would like the table to physically shrink."* 테이블 대부분을 지웠거나 갱신해 파일을 물리적으로 줄여야 하는 일회성 상황입니다.

쓰면 안 되는 경우는 다섯 가지입니다.

1. **정기 유지관리.** 목표는 FULL 이 필요 없게 만드는 것이고, autovacuum 도 FULL 을 실행하지 않습니다.
2. **XID 랩어라운드 비상 복구 중.** 가장 반직관적인 항목입니다.
3. 가용성이 중요한 테이블. 전 구간 `ACCESS EXCLUSIVE` 라 읽기까지 멈춥니다.
4. 여유 디스크가 테이블 + 인덱스 크기만큼 없을 때.
5. 다른 옵션과 함께 쓸 때. `PARALLEL` 병용 불가, `BUFFER_USAGE_LIMIT` 병용 불가(`ANALYZE` 동반 시 가능), `PROCESS_TOAST` 는 필수라 끌 수 없고, `INDEX_CLEANUP`·`TRUNCATE` 는 무시되며, `FREEZE` 는 중복입니다.

2번은 문서가 직접 금지합니다.

> *"Do not use VACUUM FULL in this scenario, because it requires an XID and will therefore fail, except in super-user mode, where it will instead consume an XID and thus increase the risk of transaction ID wraparound. Do not use VACUUM FREEZE either, because it will do more than the minimum amount of work required to restore normal operation."*

쓰기가 멈춘 상황에서 손이 먼저 가는 두 명령이 정확히 금지 대상입니다. 실행할 것은 대상 데이터베이스의 **표준 `VACUUM`** 입니다.

### 온라인 재구성 대안 — CLUSTER · pg_repack · pg_squeeze

| 방법 | 락 | 인덱스 재생성 | 추가 디스크 | 코어 여부 |
|---|---|---|---|---|
| `CLUSTER` | 전 구간 `ACCESS EXCLUSIVE` | 예 | 테이블+인덱스 (정렬 경로면 테이블 2배+인덱스) | 코어 |
| `REINDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | 예 (인덱스만) | 인덱스 사본 | 코어 |
| `pg_repack` | 시작·종료에 짧은 `ACCESS EXCLUSIVE`, 중간은 `SHARE UPDATE EXCLUSIVE` | 예 | 테이블+인덱스의 약 2배 | 확장 |
| `pg_squeeze` | 마지막 확정 단계에만 exclusive lock | 예 | 테이블+인덱스의 약 2배 | 확장 |

**`CLUSTER`** 는 VACUUM FULL 과 같은 재작성 경로에 지정 인덱스 순서의 물리적 재정렬을 더합니다. `MAINTAIN` 권한이 필요하고, 정렬은 일회성이라 이후 갱신분은 정렬되지 않습니다. 순서 유지에는 `fillfactor` 를 100 아래로 두는 것이 도움이 됩니다. 실행 후 `ANALYZE` 를 권고하고, 15 부터 파티션 테이블을 지원합니다(이때 인덱스 생략 불가).

**`pg_repack`** 은 최신 릴리스가 1.5.3(2025-11-03)이고 지원 목록에 **PG 18 이 포함**됩니다. 대상 테이블에 PRIMARY KEY 또는 NOT NULL 컬럼의 UNIQUE 인덱스가 없으면 실패합니다.

```text
relation "table" must have a primary key or not-null unique keys
```

변경 캡처는 트리거(`repack_trigger`)입니다. 초기 설정과 마지막 교체 구간에만 짧게 `ACCESS EXCLUSIVE` 를 잡고 그 사이에는 INSERT·UPDATE·DELETE 가 평소처럼 진행됩니다. 락 대기는 `--wait-timeout` 기본 60초이고, 실패하면 충돌 쿼리를 강제 취소한 뒤 `pg_terminate_backend()` 로 폴백합니다(`--no-kill-backend` 로 억제). 여유 공간은 대상 테이블과 인덱스의 약 2배가 필요합니다. 제약은 임시 테이블 불가, GiST 인덱스로 클러스터링 불가, 실행 중 대상 테이블 DDL 금지, 치명적 오류 후 잔여 트리거·고아 임시 인덱스 **수동 정리**입니다.

**`pg_squeeze`** 는 CYBERTEC 의 서버 사이드 확장으로, 동시 변경을 트리거가 아니라 **logical decoding** 으로 캡처합니다. 대부분 구간에서 읽기·쓰기가 가능하고 *"exclusive lock is needed to finalize the processing"* 만 남습니다. `squeeze.max_xlock_time` 을 넘기면 락을 놓고 그동안의 변경을 적용한 뒤 재시도합니다. 도입에는 `max_replication_slots` 확보와 `shared_preload_libraries`·`output_plugin_libraries` **양쪽** 등록이 필요하고, 서버 버전이 19 보다 낮으면 `wal_level = logical` 이 필요합니다. 단 이 확장은 릴리스 버전·날짜와 지원 PostgreSQL 버전 매트릭스를 공개해 두지 않았습니다(폐기 표기도 없습니다).

두 확장 모두 행 가시성을 바꾸는 방식이라 MVCC 관점에서 안전하지 않은 동작이 노출될 수 있습니다. 그리고 이 "코어 밖 온라인 재구성" 구도 자체가 다음 메이저 버전에서 달라집니다. GA 전이므로 [4편](/writing/vacuuming-maintenance-4-reducing-time/) 말미에서 따로 다룹니다.
## VACUUM 명령의 옵션

```sql
VACUUM [ ( option [, ...] ) ] [ [ ONLY ] table_name [ * ] [ ( column_name [, ...] ) ] [, ...] ]
```

PostgreSQL 18 이 받는 옵션 전수입니다.

| 옵션 | 도입 | 기본값 | 효과 |
|---|---|---|---|
| `FULL` | 9.0 이전 | off | 전면 재작성. 공간을 OS 로 반환하고 `ACCESS EXCLUSIVE` 락을 잡습니다 |
| `FREEZE` | 9.0 이전 | off | `vacuum_freeze_min_age`·`vacuum_freeze_table_age` 를 0 으로 둔 것과 동등 |
| `VERBOSE` | 9.0 이전 | off | 테이블별 리포트를 `INFO` 레벨로 출력 |
| `ANALYZE` | 9.0 이전 | off | 플래너 통계 갱신 |
| `DISABLE_PAGE_SKIPPING` | 9.6 | off | 페이지 스킵을 전부 끕니다 |
| `SKIP_LOCKED` | 12 | off | 충돌 락을 기다리지 않고 스킵 |
| `INDEX_CLEANUP` | 12 (`AUTO` 는 14) | `AUTO` | `AUTO` 는 제거 대상이 적을 때만, `OFF` 는 항상 인덱스 배큠을 생략 |
| `PROCESS_MAIN` | 16 | on | off 면 메인 릴레이션을 건너뛰고 TOAST 만 처리 |
| `PROCESS_TOAST` | 14 | on | off 면 TOAST 를 건너뜀 |
| `TRUNCATE` | 12 | on | 말단 빈 페이지를 잘라 OS 에 반환 시도 |
| `PARALLEL n` | 13 | 자동 | 인덱스 배큠·정리 페이즈를 워커 `n` 개로 병렬화 |
| `SKIP_DATABASE_STATS` | 16 | off | 명령 끝의 DB 전역 통계 갱신 생략 |
| `ONLY_DATABASE_STATS` | 16 | off | DB 전역 통계 갱신만 수행 |
| `BUFFER_USAGE_LIMIT` | 16 | `2MB` | 링 버퍼 크기. `0` 은 버퍼 전략 비활성 |
| `ONLY` | 18 | — | 상속 자식·파티션을 빼고 그 테이블만 처리 |

표에 담기 어려운 단서들은 이렇습니다.

- `DISABLE_PAGE_SKIPPING` 은 손상으로 visibility map 이 의심스러울 때만 씁니다.
- `SKIP_LOCKED` 는 파티션 부모에 충돌 락이 있으면 **모든 파티션을 스킵**합니다.
- `INDEX_CLEANUP` 은 failsafe 가 발동하면 `ON` 이어도 무력화됩니다.
- `TRUNCATE` 의 기본값은 GUC·테이블 파라미터 `vacuum_truncate` 가 `false` 면 off 로 뒤집힙니다.
- `PARALLEL` 은 `min_parallel_index_scan_size` 보다 큰 인덱스만 참여시키고 **인덱스당 워커 1개**입니다.
- `BUFFER_USAGE_LIMIT` 의 유효 범위는 `128 kB` 부터 `16 GB` 입니다.
- `FULL` 과 병용할 수 없거나 무시되는 옵션은 앞의 「VACUUM FULL 을 써야 할 때와 쓰면 안 될 때」에 정리해 두었습니다.

`ONLY` 가 18 에 들어온 배경은 릴리스노트에 있습니다. *"This is useful since autovacuum does not process partitioned tables, just its children."* 17 이하에서는 파티션 부모를 지정하면 리프 파티션이 항상 처리되고 회피 수단이 없었습니다.

`boolean` 값은 생략하면 `TRUE` 이고, `size` 는 단위가 없으면 킬로바이트입니다. 컬럼 목록을 주면 `ANALYZE` 도 반드시 지정해야 합니다. 그 밖에 기억할 것은 세 가지입니다.

- 보통 테이블에 대한 `MAINTAIN` 권한이 필요하고, 권한 없는 테이블은 에러가 아니라 **스킵**됩니다. `MAINTAIN` 권한과 `pg_maintain` 롤은 **17** 도입입니다.
- `VACUUM` 은 **트랜잭션 블록 안에서 실행할 수 없습니다**. 실행 중 `search_path` 는 `pg_catalog, pg_temp` 로 일시 변경됩니다(17 도입).
- GIN 인덱스에서는 어떤 형태의 `VACUUM` 이든 보류 중인 인덱스 삽입을 함께 완료합니다.
