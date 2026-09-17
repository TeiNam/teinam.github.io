---
date: 2019-02-18 21:13:43 +0900
title: "주기적인 유지관리 Vacuuming"
category: postgresql
excerpt: "PostgreSQL 문서는 배큠을 각 테이블마다 정기적으로 실행해야 하는 이유를 네 가지로 정리합니다. 네 번째는 성질이 다른 카운터 두 개를 묶은 것이라 나눠 봅니다. 서술 기준은 PostgreSQL 18(2025-09-25 릴리스, 최신 GA)입니다. UPDATE 나 DELETE…"
updated: 2026-09-18
---

> **다시 씀 (2026-09)** — 2019년에 쓴 글을 2026년 9월 기준으로 새로 썼습니다. PostgreSQL 18 문서와 릴리스 노트를 근거로 사실을 맞추고, 운영·장애·튜닝 관점을 더했습니다.

## 배큠이 하는 네 가지 일

PostgreSQL 문서는 배큠을 각 테이블마다 정기적으로 실행해야 하는 이유를 네 가지로 정리합니다.

1. UPDATE 또는 DELETE 된 행이 점유한 디스크 공간의 회수·재사용
2. 쿼리 플래너가 사용하는 데이터 통계 갱신
3. 인덱스 전용 스캔(index-only scan)을 빠르게 만드는 visibility map(가시성 맵) 갱신
4. 트랜잭션 ID(XID) 랩어라운드와 multixact ID 랩어라운드가 일으키는 아주 오래된 데이터 손실 방지

네 번째는 성질이 다른 카운터 두 개를 묶은 것이라 나눠 봅니다. 서술 기준은 **PostgreSQL 18**(2025-09-25 릴리스, 최신 GA)입니다.

### 디스크 공간 회수

UPDATE 나 DELETE 는 옛 행 버전을 즉시 지우지 않습니다. MVCC 아래에서는 다른 트랜잭션이 그 버전을 계속 볼 수 있기 때문입니다. 어떤 트랜잭션에도 더는 보이지 않게 된 행 버전이 dead tuple 이고, 배큠이 회수하는 대상입니다.

표준 VACUUM(plain VACUUM)은 테이블과 인덱스에서 dead tuple 을 제거하고 그 공간을 재사용 가능하다고 표시합니다. 중요한 것은 **그 공간이 운영체제로 돌아가지 않는다**는 점입니다. 예외는 말단 페이지가 완전히 비고 배타 락을 쉽게 얻을 수 있는 경우뿐입니다. VACUUM FULL 은 테이블을 새 파일로 다시 써서 공간을 운영체제에 반환하지만 느리고 락이 강합니다. (흔히 쓰는 "표준 VACUUM 은 공간을 FSM 에 반환한다"는 문장은 문서에 없습니다. FSM 을 배큠과 직접 잇는 문장은 진행률 보고의 `performing final cleanup` 페이즈 설명뿐입니다.)

일상 유지관리의 목표는 표준 VACUUM 을 충분히 자주 돌려 FULL 이 필요 없게 만드는 것입니다. 여기에 자주 오해되는 사실이 붙습니다. autovacuum 데몬은 **절대** VACUUM FULL 을 실행하지 않습니다(*"in fact will never issue VACUUM FULL"*). 심한 블로트를 autovacuum 이 알아서 압축해 주는 일은 없습니다.

### 플래너 통계 갱신

플래너는 실행 계획을 만들 때 테이블 내용 통계에 의존합니다. 통계는 `ANALYZE` 명령, `VACUUM` 의 `ANALYZE` 옵션, autovacuum 의 analyze 로 생성됩니다. 원문의 판단은 지금도 맞습니다. 갱신이 빈번해도 통계적 분포가 크게 바뀌지 않으면 통계를 다시 만들 필요는 없습니다. 단 autovacuum 은 통계 수집에 의존하므로 `track_counts` 가 `true` 여야 동작합니다.

### visibility map 갱신

배큠은 테이블마다 visibility map 을 관리합니다. 모든 활성 트랜잭션에 보이는 튜플만 담긴 페이지를 표시하는 지도이고, 용도는 두 가지입니다. 배큠 자신이 정리할 것 없는 페이지를 다음 실행에서 건너뛰고, 인덱스 전용 스캔이 heap fetch 를 건너뜁니다. visibility map 은 heap 보다 훨씬 작아 heap 이 커도 캐시에 잘 남습니다.

PG 18 에서 달라진 점이 있습니다. "일반 배큠은 all-visible 페이지를 절대 건드리지 않는다"는 설명은 17 이하에서만 맞습니다. 18 은 eager scanning 을 도입해 일반 배큠도 all-visible 페이지를 골라 얼립니다. 릴리스노트가 *"Previously vacuum never processed all-visible pages until freezing was required"* 라고 과거형으로 씁니다. 조절 방법은 뒤에서 다룹니다.

### XID 랩어라운드 방지

XID 는 32비트이고 모듈로 2^32 로 비교됩니다. 그래서 어떤 XID 를 기준으로 "과거"가 약 20억, "미래"가 약 20억입니다. 문서는 *"vacuum every table in every database at least once every two billion transactions"* 라고 못 박고, 원문의 "20억 트랜잭션마다"는 이 문장과 일치합니다. 다만 세 가지를 보태야 합니다.

- 정확한 상한은 20억이 아니라 *"two billion transactions minus the `vacuum_freeze_min_age` value at the time of the last aggressive vacuum"* 입니다. 기본값 5천만을 대입하면 19억5천만입니다(문서 문장에 기본값을 넣은 **저자의 산술**).
- 실제 발동선은 훨씬 앞입니다. `autovacuum_freeze_max_age` 기본값이 2억이고, 문서는 다른 이유로 배큠되지 않는 테이블이 *"once every `autovacuum_freeze_max_age` minus `vacuum_freeze_min_age` transactions"* 마다 배큠된다고 씁니다. 기본값이면 약 1억5천만마다입니다(같은 **산술**). 20억은 이론적 벽이고 실제 선은 그 10분의 1 근처입니다.
- 그래도 밀리면 랩어라운드 지점까지 약 4천만이 남았을 때 경고가, 3백만 미만에서 신규 XID 할당 거부가 옵니다. 이 두 임계값은 **PG 14 이상 기준**이고(14 에서 경고 시점과 하드리밋이 상향되었습니다), 13 이하는 값과 에러 문구가 다릅니다. 실제 로그 문구와 멈추는 순서는 뒤에서 다룹니다.

해결 원리는 freeze 입니다. 과거에 커밋된 트랜잭션이 삽입한 행을 현재·미래 모두에 보인다고 확정 표시해 XID 비교에서 빼냅니다. 원문의 "동결 표시"는 맞지만 구현은 9.4 에서 바뀌었습니다. 그 전에는 `xmin` 을 `FrozenTransactionId` 로 실제 교체했고, 9.4 이후는 플래그 비트만 세워 원래 `xmin` 을 보존합니다.

### multixact ID 랩어라운드 방지

multixact ID 는 여러 트랜잭션이 한 행을 동시에 잠글 때 쓰입니다. 튜플 헤더에는 락 정보를 담을 자리가 부족하므로 그 정보를 `pg_multixact` 에 두고 헤더의 `xmax` 에는 multixact ID 만 남깁니다. XID 와 다른 점은 관리 대상 32비트 카운터가 **두 개**라는 것입니다. multixact ID 카운터와, 멤버 목록을 담는 **멤버 저장소** 카운터입니다.

원문에서 이 절의 세 지점이 틀렸습니다.

| 원문 서술 | 정확한 사실 |
|---|---|
| `relminmxid` 가 `vacuum_multixact_freeze_min_age` 보다 오래되면 강제된다 | 비교 대상은 **`vacuum_multixact_freeze_table_age`**(기본 1억5천만)입니다. `vacuum_multixact_freeze_min_age`(기본 5백만)는 스캔 중인 페이지에서 *어떤* multixact ID 를 교체할지 정하는 컷오프이고 스캔 범위와 무관합니다 |
| 전체 테이블 스캔이 강제된다 | 강제되는 것은 **aggressive vacuum** 입니다. *"only those pages which are known to be all-frozen will be skipped"* — all-frozen 스킵은 9.6 도입이라 그 이전 자료의 "전체 페이지 방문" 서술은 지금 틀렸습니다 |
| 멤버 저장소가 할당량의 50% 를 넘으면 | PG 18 문서는 절대값으로 *"exceeds about 10GB"*, 상한은 *"about 20GB before reaching wraparound"* 로 씁니다. "50%" 는 PG 13 문서의 표기입니다 |

동작은 이렇습니다. 배큠이 테이블의 일부라도 스캔하면 `vacuum_multixact_freeze_min_age` 보다 오래된 multixact ID 를 다른 값(0, 단일 트랜잭션 ID, 또는 더 새로운 multixact ID)으로 교체합니다. `pg_class.relminmxid` 는 그 테이블에 남아 있을 수 있는 가장 오래된 multixact ID 를 담고, 이 값이 `vacuum_multixact_freeze_table_age` 보다 오래되면 aggressive vacuum 이 강제됩니다. 멤버 저장소가 약 10GB 를 넘으면 연령이 오래된 테이블부터 aggressive vacuum 이 더 자주 일어나며, **autovacuum 이 명목상 꺼져 있어도** 발동합니다.

두 축은 같은 3단 구조입니다.

| 역할 | XID | MultiXact |
|---|---|---|
| 무엇을 얼릴지 (컷오프) | `vacuum_freeze_min_age` (5천만) | `vacuum_multixact_freeze_min_age` (5백만) |
| 어디까지 스캔할지 (aggressive 승격) | `vacuum_freeze_table_age` (1억5천만) | `vacuum_multixact_freeze_table_age` (1억5천만) |
| 무조건 발동 (백스톱) | `autovacuum_freeze_max_age` (2억) | `autovacuum_multixact_freeze_max_age` (4억) |
| 비상 모드 | `vacuum_failsafe_age` (16억) | `vacuum_multixact_failsafe_age` (16억) |

비대칭이 하나 있습니다. XID 쪽 승격 기준은 `vacuum_freeze_table_age` 에서 `vacuum_freeze_min_age` 를 **뺀** 값입니다(기본값이면 1억). multixact 쪽 문장에는 뺄셈이 없고, 같은 뺄셈이 적용되는지는 **문서로 확인되지 않으니** 표기 차이를 그대로 두는 편이 안전합니다.

경고·차단 구조는 XID 와 같습니다(4천만에서 경고, 3백만 미만에서 신규 MXID 생성 거부). 다만 XID 소진은 모든 쓰기를 막고 MXID 소진은 MXID 를 요구하는 행 락이 걸린 쓰기만 막습니다. 그리고 replication slot 은 multixact 정리를 직접 붙잡지 않으므로 오래된 슬롯 삭제는 multixact 랩어라운드 해결과 대개 무관합니다.

aggressive vacuum 의 발동 조건 전수와 anti-wraparound vacuum(랩어라운드 방지 배큠)의 성질, failsafe 는 뒤에서 다룹니다.

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

표준 VACUUM 은 *"can operate in parallel with normal reading and writing of the table, as an exclusive lock is not obtained"* 입니다. 잡는 락 이름은 `SHARE UPDATE EXCLUSIVE` 이고, 이 이름은 `sql-vacuum` 이 아니라 `routine-vacuuming` 의 autovacuum 절에 나옵니다.

원문에는 "Vacuum 진행 중 DDL 은 불가하지만 DML 은 정상 작동한다"는 문장이 있었습니다. 부정확합니다.

- 일반 SELECT · INSERT · UPDATE · DELETE 는 표준 VACUUM 과 **동시에** 진행됩니다.
- 충돌하는 락 요청이 오면 **autovacuum 쪽이 중단됩니다** — *"lock acquisition will interrupt the autovacuum"*. "배큠이 DDL 을 막는다"가 아니라 "DDL 이 오면 autovacuum 이 물러난다"가 맞습니다. 이 문장은 autovacuum 대상이며, 수동 `VACUUM` 이 같은 방식으로 중단된다는 서술은 문서에 없습니다.
- 그래서 문서가 경고합니다. *"Regularly running commands that acquire locks conflicting with a SHARE UPDATE EXCLUSIVE lock (e.g., ANALYZE) can effectively prevent autovacuums from ever completing."*
- 예외는 `pg_stat_activity` 의 쿼리 이름이 `(to prevent wraparound)` 로 끝나는 autovacuum 입니다. 자동 중단되지 않습니다.

표준 VACUUM 도 한 구간에서는 `ACCESS EXCLUSIVE` 를 잡습니다. 인덱스 정리 뒤 말단 빈 페이지를 잘라 운영체제에 반환하는 `truncating heap` 페이즈입니다. PG 18 소스(`src/backend/access/heap/vacuumlazy.c`)의 상수가 조건을 정합니다.

```c
#define REL_TRUNCATE_MINIMUM            1000
#define REL_TRUNCATE_FRACTION           16
#define VACUUM_TRUNCATE_LOCK_TIMEOUT    5000    /* ms */
```

잘라낼 수 있는 페이지가 1000 또는 `relsize / 16` 중 작은 쪽 이상 있어야 절단을 시도하고, 락은 **최대 5초까지만** 기다립니다. 이 값들은 의도적으로 GUC 로 노출되지 않았습니다. 락 획득 실패 시의 정확한 재시도·포기 흐름은 함수 본문을 끝까지 읽지 못해 **확인하지 못했습니다**.

`TRUNCATE` 옵션은 끄는 것만 되고 강제할 수는 없습니다(*"it can't force truncation to happen"*). 이 락을 피해 `vacuum_truncate = false` 를 쓰는 대표적 이유는 스탠바이입니다. 9.6 릴리스노트가 불필요한 절단 시도를 없앤 이유로 *"avoiding unnecessary query cancellations on standby servers"* 를 듭니다.

### 회수한 공간은 어디로 가는가

표준 VACUUM 은 공간을 테이블 안에 남겨 재사용하게 하고, VACUUM FULL 은 새 파일을 쓴 뒤에야 옛 사본을 놓습니다. 그래서 재작성 계열 명령은 *"extra disk space approximately equal to the size of the table"* 을 일시적으로 더 쓰며, 문서는 여기서 테이블과 인덱스의 옛 사본을 함께 언급합니다.

정확한 크기는 `CLUSTER` 문서에 있습니다. 인덱스 스캔 경로는 *"the sum of the table size and the index sizes"*, 순차 스캔과 정렬 경로는 *"as much as double the table size, plus the index sizes"* 입니다. 진행률 문서에서 `sorting tuples` 와 `writing new heap` 은 `CLUSTER` 에 한정해 서술되고 `seq scanning heap` 만 명령 무관으로 서술되므로, **VACUUM FULL 은 순차 스캔만 하고 정렬하지 않는다는 추론**이 나옵니다. 실무 수치는 **테이블 + 인덱스 크기**이고, 이것은 문서의 직접 진술이 아닌 **추론**입니다. "정렬까지 2배"는 `CLUSTER` 에만 해당합니다.

인덱스는 성질이 다릅니다. 완전히 빈 B-tree 페이지는 재사용되지만 *"if all but a few index keys on a page have been deleted, the page remains allocated"* 이고, 문서는 그런 패턴에는 주기적 reindex 를 권고합니다. B-tree 가 아닌 인덱스의 블로트 가능성은 *"has not been well researched"* 라고만 적혀 있습니다.

### VACUUM FULL 이 인덱스까지 다시 만드는 이유

근거는 진행률 뷰입니다. VACUUM FULL 은 `pg_stat_progress_cluster` 에 보고하고, 그 페이즈 목록에 `swapping relation files` 다음으로 **`rebuilding index`** 가 있으며 `index_rebuild_count` 는 그 페이즈에서만 증가합니다. 뷰를 공유하는 이유도 문서가 밝힙니다. *"both VACUUM FULL and CLUSTER rewrite the table, while regular VACUUM only modifies it in place."*

`CLUSTER` 문서에도 각 인덱스의 임시 사본을 만든다는 문장이 있고, `INDEX_CLEANUP` 이 `FULL` 과 함께면 무시되는 것도 같은 이유입니다. 어차피 다시 만드니 인덱스 정리 옵션이 의미가 없습니다. 다만 "VACUUM FULL 이 인덱스 블로트를 없앤다"는 문장 자체는 `sql-vacuum` 에 **없습니다**. `rebuilding index` 페이즈, `CLUSTER` 문서, 같은 코드 경로 후계 명령 문서의 *"creates a new file for each index"* 를 조합해서만 입증됩니다.

### VACUUM FULL 을 써야 할 때와 쓰면 안 될 때

문서가 인정하는 용도는 좁습니다. *"not recommended for routine use, but might be useful in special cases — e.g., when you have deleted or updated most of the rows in a table and would like the table to physically shrink."* 테이블 대부분을 지웠거나 갱신해 파일을 물리적으로 줄여야 하는 일회성 상황입니다.

쓰면 안 되는 경우는 다섯 가지입니다.

1. **정기 유지관리.** 목표는 FULL 이 필요 없게 만드는 것이고, autovacuum 도 FULL 을 실행하지 않습니다.
2. **XID 랩어라운드 비상 복구 중.** 가장 반직관적인 항목입니다.
3. 가용성이 중요한 테이블. 전 구간 `ACCESS EXCLUSIVE` 라 읽기까지 멈춥니다.
4. 여유 디스크가 테이블 + 인덱스 크기만큼 없을 때.
5. 다른 옵션과 함께 쓸 때. `PARALLEL` 병용 불가, `BUFFER_USAGE_LIMIT` 병용 불가(`ANALYZE` 동반 시 가능), `PROCESS_TOAST` 는 필수라 끌 수 없고, `INDEX_CLEANUP`·`TRUNCATE` 는 무시되며, `FREEZE` 는 중복입니다.

2번의 근거는 문서 원문입니다.

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

**`pg_squeeze`** 는 CYBERTEC 의 서버 사이드 확장으로, 동시 변경을 트리거가 아니라 **logical decoding** 으로 캡처합니다. 대부분 구간에서 읽기·쓰기가 가능하고 *"exclusive lock is needed to finalize the processing"* 만 남습니다. `squeeze.max_xlock_time` 을 넘기면 락을 놓고 그동안의 변경을 적용한 뒤 재시도합니다. 도입에는 `max_replication_slots` 확보와 `shared_preload_libraries`·`output_plugin_libraries` **양쪽** 등록이 필요하고, 서버 버전이 19 보다 낮으면 `wal_level = logical` 이 필요합니다. 단 이 확장의 **최신 릴리스 버전과 날짜, 지원 버전 매트릭스, 현재 유지보수 활발도는 확인하지 못했습니다**(폐기 표기는 없습니다).

두 확장 모두 행 가시성을 바꾸는 방식이라 MVCC 관점에서 안전하지 않은 동작이 노출될 수 있습니다. 그리고 이 "코어 밖 온라인 재구성" 구도 자체가 다음 메이저 버전에서 달라집니다. GA 전이므로 뒤에서 따로 다룹니다.

## VACUUM 명령의 옵션

```sql
VACUUM [ ( option [, ...] ) ] [ [ ONLY ] table_name [ * ] [ ( column_name [, ...] ) ] [, ...] ]
```

PostgreSQL 18 이 받는 옵션 전수입니다.

| 옵션 | 도입 버전 | 기본값 | 효과 |
|---|---|---|---|
| `FULL` | 확인 불가 (괄호형 문법 자체는 9.0) | off | 전면 재작성, 공간을 OS 로 반환, `ACCESS EXCLUSIVE` 락 |
| `FREEZE` | 확인 불가 | off | `vacuum_freeze_min_age` 와 `vacuum_freeze_table_age` 를 0 으로 둔 것과 동등 |
| `VERBOSE` | 확인 불가 | off | 테이블별 상세 리포트를 `INFO` 레벨로 출력 |
| `ANALYZE` | 확인 불가 | off | 플래너 통계 갱신 |
| `DISABLE_PAGE_SKIPPING` | 9.6 | off | 페이지 스킵을 전부 끕니다. 손상으로 visibility map 이 의심스러울 때 한정 |
| `SKIP_LOCKED` | 12 | off | 충돌 락을 기다리지 않고 스킵. 파티션 부모가 잠겨 있으면 모든 파티션 스킵 |
| `INDEX_CLEANUP` | 12, `AUTO` 값·기본값화는 14 | `AUTO` | `AUTO` 는 제거 대상이 아주 적으면 인덱스 배큠 스킵, `OFF` 는 항상 스킵. `FULL` 과 함께면 무시, failsafe 발동 시엔 `ON` 이어도 스킵 |
| `PROCESS_MAIN` | 16 | on | off 면 메인 릴레이션을 건너뛰고 TOAST 만 처리 |
| `PROCESS_TOAST` | 14 | on | off 면 TOAST 를 건너뜀. `FULL` 사용 시 필수 |
| `TRUNCATE` | 12 | on (`vacuum_truncate` 가 false 면 off) | 말단 빈 페이지 절단 시도. `FULL` 과 함께면 무시 |
| `PARALLEL integer` | 13 | 미지정 시 `max_parallel_maintenance_workers` 범위에서 자동 (0 은 비활성) | 인덱스 배큠·정리 페이즈를 워커로 병렬화. `min_parallel_index_scan_size` 보다 큰 인덱스만 참여하고 **인덱스당 워커 1개**입니다. `FULL` 과 병용 불가 |
| `SKIP_DATABASE_STATS` | 16 | off | 명령 끝의 DB 전역 통계 갱신 생략 |
| `ONLY_DATABASE_STATS` | 16 | off | 전역 통계 갱신만 수행. `VERBOSE` 외 병용 불가 |
| `BUFFER_USAGE_LIMIT size` | 16 | 미지정 시 `vacuum_buffer_usage_limit`(기본 `2MB`) | 링 버퍼 크기. `0` 은 전략 비활성, 범위 `128 kB`–`16 GB`. `FULL` 과 병용 불가(`ANALYZE` 동반 시 가능) |
| `ONLY` | 18 | 미지정 시 자식까지 처리 | `ONLY table_name` 은 그 테이블만. 18 에서 기본 동작이 상속 자식·파티션까지로 바뀐 **비호환 변경** |

`ONLY` 가 18 에 들어온 배경은 릴리스노트에 있습니다. *"This is useful since autovacuum does not process partitioned tables, just its children."* 17 이하에서는 파티션 부모를 지정하면 리프 파티션이 항상 처리되고 회피 수단이 없었습니다.

`boolean` 값은 생략하면 `TRUE` 이고, `size` 는 단위가 없으면 킬로바이트입니다. 컬럼 목록을 주면 `ANALYZE` 도 반드시 지정해야 합니다. 그 밖에 기억할 것은 세 가지입니다.

- 보통 테이블에 대한 `MAINTAIN` 권한이 필요하고, 권한 없는 테이블은 에러가 아니라 **스킵**됩니다. `MAINTAIN` 권한과 `pg_maintain` 롤은 **17** 도입입니다.
- `VACUUM` 은 **트랜잭션 블록 안에서 실행할 수 없습니다**. 실행 중 `search_path` 는 `pg_catalog, pg_temp` 로 일시 변경됩니다(17 도입).
- GIN 인덱스에서는 어떤 형태의 `VACUUM` 이든 보류 중인 인덱스 삽입을 함께 완료합니다.

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

**PG 17 이하와 다른 지점이 두 곳입니다.** 첫째, 첫 공식의 `Minimum(...)` 상한을 만드는 `autovacuum_vacuum_max_threshold` 는 PG 18 신규 파라미터입니다. 둘째, 두 번째 공식의 `percent of table not frozen` 곱은 PG 18 신규 컬럼 `pg_class.relallfrozen` 에 기반합니다. 따라서 PG 17 이하에는 상한도, 아직 frozen 되지 않은 비율만큼 삽입 임계를 줄이는 항도 없습니다. 같은 테이블·같은 워크로드라도 18 로 올리면 배큠이 걸리는 시점 자체가 달라집니다. 파라미터별 기본값과 테이블별 재정의는 뒤에서 다룹니다.

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

horizon 이 막혀 있을 때 배큠 로그에 남는 신호는 `are dead but not yet removable` 값이 큰 것입니다. 읽는 법은 모니터링 절에서 다룹니다.

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

문서는 스탠바이가 자주 붙었다 끊기면 피드백 공백이 생기니 `max_standby_archive_delay`·`max_standby_streaming_delay` 를 올리라고 권고합니다. 다만 이 두 GUC 의 기본값은 이번 조사에서 1차 확인하지 못했으므로 숫자를 쓰지 않습니다. 확인된 것은 `-1` 이 "wait forever" 라는 점, 그리고 **프라이머리에 설정하면 효과가 없다**는 점입니다 — "have no effect if set on the primary". 옛 조언인 `vacuum_defer_cleanup_age` 상향은 **PG 16 에서 이 GUC 가 제거되어 무효**입니다.

**(4) 방치된 prepared transaction(2PC).** `PREPARE TRANSACTION` 의 Caution 이 직접 경고합니다.

> "It is unwise to leave transactions in the prepared state for a long time. This will interfere with the ability of `VACUUM` to reclaim storage, and **in extreme cases could cause the database to shut down to prevent transaction ID wraparound**. Keep in mind also that the transaction continues to hold whatever locks it held."

```sql
SELECT gid, prepared, owner, database, transaction AS xmin
FROM pg_prepared_xacts ORDER BY age(transaction) DESC;
-- 해제: COMMIT PREPARED '<gid>' / ROLLBACK PREPARED '<gid>'
```

외부 트랜잭션 매니저를 쓰지 않는다면 문서 권고는 `max_prepared_transactions` 를 0 으로 두는 것입니다. 이 뷰는 조회할 때 내부 트랜잭션 매니저 구조를 잠시 잠그므로 "frequently accessed" 하면 성능에 영향이 있다는 주의도 붙어 있습니다.

논리 디코딩 지연도 `catalog_xmin` 을 통해 같은 경로로 작용합니다. 지연 자체는 `pg_stat_replication_slots` 의 `spill_*`(=`logical_decoding_work_mem` 초과분을 디스크로 쏟은 양)·`stream_*` 로 보고, WAL 보유·무효화 위험은 `restart_lsn`·`wal_status`·`safe_wal_size`·`invalidation_reason` 으로 봅니다. **"디코딩 지연 몇 초 또는 몇 GB 를 넘으면 위험"류의 임계값은 1차 출처를 찾지 못했습니다** — 임의의 숫자를 알람에 박지 말고 xmin 나이 자체를 지표로 쓰는 편이 안전합니다.

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

여기서 정직하게 밝혀야 할 것이 있습니다. **블로트가 성능을 떨어뜨리는 경로 중 근거의 등급이 다릅니다.** 배큠 자체의 소요 시간이 커지는 것은 측정 자료가 있고(다음 절), 버퍼 캐시 오염은 문서가 명시한 경로입니다. 반면 "테이블 블로트로 순차 스캔이 느려진다", "블로트가 btree `tree_level` 을 늘려 지연이 커진다", "블로트가 플래너 통계를 왜곡한다"는 이번 조사에서 **1차 측정 자료를 찾지 못했습니다.** 페이지 분할이 위로 연쇄되고 루트 분할 시 레벨이 늘어난다는 것은 문서 사실이지만, 그것이 실제 지연을 얼마나 늘리는지는 논리적 추론에 머무릅니다. 특히 Figma 2020 사건은 블로트가 원인이 아니므로 이 주장의 근거로 쓸 수 없습니다.

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

여기서 **측정값과 저자의 산술을 구분**해야 합니다. "roughly 20,000 tuple ins/upd/del per second can dirty 10GB in one minute with hints" 는 저자가 밝힌 냅킨 계산이고, 측정된 것은 실제 워크로드의 쓰기 속도(한쪽은 약 20k tuples/s, 다른 쪽은 "over 30k/s")입니다. 조치는 `autovacuum_vacuum_cost_delay` 를 **기본값 2ms 로 되돌린 것**이고, 결과는 autovacuum 의 XLOG 레코드가 "more spread out" 되고 WAL 양이 안정되고 복제가 유지되며 전체 스루풋이 올랐다는 **정성적 서술**입니다. IOPS 절대치나 처리량 수치는 제시되지 않았습니다. 저자는 큰 서버에서 delay 0 이 "won't do anything that bad" 라던 자신의 예전 판단을 "completely wrong" 이라고 정정하고, **1ms 만으로도** WAL 홍수를 막는다고 적었습니다.

그래서 Sentry 가 2015년 사고 직후 공개한 설정에 들어 있던 `autovacuum_vacuum_cost_delay = 0` 은 **지금 그대로 따라 쓸 설정이 아닙니다.** 2026년 진단과 정면으로 충돌합니다. 코멘트에서 Shaun Thomas 가 정리한 대로 delay 0 은 cost-based 시스템 자체를 끄는 것이며 극단적인 NVMe 하드웨어에서만 고려할 선택지입니다.

**셋째, 배큠은 버퍼 캐시를 밀어냅니다.** `VACUUM`·`ANALYZE` 는 링 버퍼(Buffer Access Strategy)를 쓰고 크기는 `vacuum_buffer_usage_limit`(기본 **2MB**, PG 16 도입·PG 17 에서 2MB 로 인상)이 정합니다. 문서 경고는 "Higher settings can allow `VACUUM` and `ANALYZE` to run more quickly, but having too large a setting **may cause too many other useful pages to be evicted from shared buffers**" 입니다. 실제 발생량은 `pg_stat_io` 의 `context='vacuum'` 에서 `evictions`(공유 버퍼에서 밀어내 링 버퍼에 넣은 횟수)와 `reuses`(링 버퍼 내 재사용)로 확인합니다.

**넷째, 인덱스 수가 I/O 를 배로 늘립니다.** Percona Community 의 Pep Pla 가 2026년 7월 공개한 벤치마크(PG 18.4, 4 vCPU, 15 GiB, SSD, `shared_buffers=4GB`, 36조합 × 10회 = 360런의 중앙값)는 인덱스 0→5 개에서 배큠 소요를 `21.8 → 28.1 → 32.6 → 37.6 → 42.3 → 47.4`초로 측정했습니다 — 인덱스당 약 5초입니다. 블록 접근에서 더 중요한 발견이 나옵니다. **인덱스가 0개에서 1개가 되는 순간 힙 접근이 374,903 → 547,323 으로 뜁니다.** 인덱스 클린업이 **두 번째 힙 패스**를 강제하기 때문입니다. dead 가 앞쪽 페이지에 몰린 경우(compact) 힙 접근은 더 적은데도 인덱스 블록은 인덱스당 약 +109,533 으로 약 4배 빠르게 늘어납니다. 저자 해석은 btree 리프 페이지가 통째로 비어 page deletion·recycling 이 필요해지기 때문입니다. 인덱스가 늘면 2MB 링 버퍼가 넘쳐 워커가 직접 페이지를 쓰고 evict 하기 시작합니다(spread 50% 기준 0, 27k, 54k, 82k, 109k, 136k 페이지).

이 벤치마크를 넘겨 인용하면 안 되는 부분도 분명합니다. 동시 워크로드가 전혀 없어 블로트의 쿼리 성능 영향은 측정하지 않았고, **WAL 발생량은 보고되지 않았으며**, cost delay·limit 스윕과 워커 수 변화가 없고, 데이터가 전부 메모리에 들어가는 크기라 I/O bound 상황이 아닙니다. 5개 동일 정수 인덱스라는 인위적 형태이므로 넓은 인덱스·복합 인덱스·text 인덱스로 외삽할 수 없습니다.

**다섯째, 스탠바이에서는 배큠이 쿼리를 죽입니다.** 문서가 드는 배큠 관련 복구 충돌은 두 종류입니다. "Application of a vacuum cleanup record from WAL conflicts with standby transactions whose snapshots can still 'see' any of the rows to be removed" 와, 제거 대상이 보이는지와 무관하게 "conflicts with queries accessing the target page on the standby" 입니다. index-only scan 때문에 범위가 더 넓어집니다 — "**even running `VACUUM` against a table with no updated or deleted rows requiring cleanup might lead to conflicts**". 스탠바이 쪽에는 `canceling statement due to conflict with recovery` 가 남고, 락을 쥔 idle 트랜잭션과 충돌하면 세션이 종료됩니다. 감시 지점은 `pg_stat_database_conflicts` 와 `log_recovery_conflict_waits` 입니다.

## 배큠 시간이 늘어나 장애가 되는 경로

배큠이 오래 걸리는 이유를 dead tuple 개수로 설명하는 것은 대개 틀립니다. 앞의 Percona 벤치마크에서 dead **개수는 같고 분포만 다르게** 두었을 때의 결과가 이를 보여줍니다(인덱스 0개, 1000만 행 × 128B ≈ 172,414 힙 페이지 ≈ 1.3GB, `VACUUM FREEZE` 로 all-visible·all-frozen 상태에서 시작, DELETE 로만 dead 생성).

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

PG 18 문서의 권장 복구 순서는 앞 절의 진단 그대로입니다. `pg_prepared_xacts` 의 오래된 항목을 commit 또는 rollback 하고, `pg_stat_activity` 의 오래된 세션을 `pg_terminate_backend` 하고, `pg_replication_slots` 의 오래된 슬롯을 drop 한 뒤, 데이터베이스 전역 `VACUUM` 을 돌립니다. 여기서 문서가 명시적으로 **금지**하는 것이 두 개입니다.

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

**PG 15~18 의 현재 문구는 1차 출처로 확정하지 못했습니다.** 이후 개정된 것은 확실하나 문자열을 확인하지 못했으므로, PG 15 이상에서 알람을 만들 때는 이 WARNING 문구 대신 PG 18 에서 확인된 요약 로그 접두어 `index scan bypassed by failsafe: ` 를 잡는 편이 안전합니다.

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

널리 인용되는 `multixact "members" limit exceeded` 라는 문구는 이 글에 없습니다. 진단이 어려웠던 이유를 저자가 그대로 적어 두었습니다 — **PostgreSQL 이 멤버 공간을 노출하는 메트릭이 없고**, ID 기반 대시보드가 오도하며, 에러 문구가 낯설고, XID 랩어라운드에 비해 문서가 빈약합니다. 실제 진단은 SQL 이 아니라 `GetNewMultiXactId`(`multixact.c`)·`heapam.c` 소스 읽기와 메일링 리스트로 이루어졌습니다.

효과가 없었던 조치는 배큠 튜닝, 워크로드 변경, 그리고 **hot standby 페일오버**였습니다(오히려 "unintentionally restarting vacuum processes"). 효과가 있었던 것은 진행 중인 배큠을 **data-files-only / non-index vacuum** 으로 교체한 것과, 백필 **및 그 태스크 컨슈머까지** 완전히 정지시킨 것입니다(1차에서는 컨슈머를 멈추지 않아 재발했습니다). 다만 이 사건에서 실제로 소비된 멤버 수, SLRU 파일 크기, `pg_multixact` 디스크 사용량은 글이 제시하지 않습니다.

### 배큠 지연이 만드는 2차 장애

배큠이 늦어지는 것 자체보다, 그것이 다른 자원과 결합해 만드는 2차 효과가 실제 장애를 만듭니다. 아래는 모두 공개 사례에 근거한 유형입니다.

| 유형 | 사례와 수치 | 출처 |
|---|---|---|
| 락 대기 누적 → 전면 쓰기 불가 | Duffel: anti-wraparound vacuum → 파티션 생성 DDL 대기 → 모든 INSERT 대기. **2h17m** 완전 중단 | duffel.com |
| 재시도 폭주 → 부하 증폭 | Mandrill: 쓰기 실패 재시도가 부하를 급등시킴 | mailchimp.com |
| 디스크 소진 | Mandrill: 큐에 쌓인 잡과 에러 로그가 앱 서버 디스크를 채워 스토리지 볼륨 교체 | mailchimp.com |
| 복제 지연 · 동기 복제 커밋 정지 | ardentperf: WAL 폭증으로 수백 커넥션이 `IPC:SyncRep` 대기 / Joyent Manta: 배큠이 쓰기 부하를 증폭해 replay·checkpoint lag 확대, 최악 **18시간 이상** 누적 replay lag | ardentperf.com · davepacheco.net(2차 회고) |
| replay 비용 예측 불가 | Joyent: "a vacuum may generate WAL records that cause **many more random reads than usual**" → WAL 위치 차이가 takeover 시간의 대략적 프록시밖에 못 됨 | davepacheco.net(2차 회고) |
| 리소스 완전 포화 + 백로그 | BattleMetrics: 단일 서버 CPU·디스크·네트워크 전부 포화. P50 약 2.5분, P90/P99 는 5분 상한, 최악 서버 2시간. 첫 레플리카 복구 **3h44m**, 백로그 **660,000 업데이트**, 인덱스 재구축 약 2시간 | learn.battlemetrics.com |
| autovacuum 워커 풀 고갈 | Metronome: emergency vacuum 이 "exceeded our available autovacuum worker threads" | metronome.com |
| 스로틀로 영원히 못 따라감 | Coroot 실험: 테이블에 `autovacuum_vacuum_cost_delay = 100` 을 걸면 워커가 `VacuumDelay` 대기에 시간의 약 **99%** 체류. 워커를 늘려도 해결되지 않음 | coroot.com |
| 메모리 상한으로 인덱스 다중 패스 | Sentry 후속: `maintenance_work_mem` 이 관련 코드 경로에서 **하드 1GB 제한**이라 배정한 100GB 가 "wasn't even being used" → PG 17 에서 해소 | blog.sentry.io · postgresql.org |
| 배큠이 현실적으로 끝나지 않음 | Sentry: 구형 테스트 머신이 single-user mode 에서 "going on **24 hours**" 째 배큠 중 / Mandrill: "would take many days", 튜닝 후에도 "days or even weeks", 최악 추정 **40일** | blog.sentry.io · mailchimp.com |

마지막 두 줄이 특히 중요합니다. **장애 중에 "배큠을 끝까지 돌린다"는 선택지는 자주 성립하지 않습니다.** 그래서 공개 사례들의 실제 탈출 수단은 대부분 배큠 완주가 아니라 데이터나 작업량을 제거하는 쪽이었습니다.

## 공개된 장애 사례에서 배울 것

| 사례 | 시점 | 유형 | 진짜 원인 | 탈출 수단 | 공개 다운타임 |
|---|---|---|---|---|---|
| Sentry | 2015-07-20 | XID 랩어라운드 | 배큠이 부하를 못 따라감 + 관측 부재 | 하드웨어 페일오버 + **TRUNCATE** | 미국 업무일 대부분 |
| Mandrill | 2019-02-04~06 | XID 랩어라운드 | 샤드 편향으로 특정 샤드 autovacuum 낙오·실패 | **TRUNCATE**(대형 테이블 2개) | 약 40.5시간(발송 80% 유지) |
| Duffel | 2021-11-22 | anti-wraparound vacuum × DDL 락 | 타임아웃 없는 DDL | DB 재시작 | 2h17m |
| BattleMetrics | 2022-03-27 | XID 랩어라운드 | **인덱스 손상으로 배큠 실패** + XID 모니터링 부재 | **single-user mode 에서 DROP INDEX** | DB 복구 약 3시간, 전체 약 21시간 |
| Metronome | 2025-05-10~19 | **MultiXact 멤버 공간** 소진 | FK × 동시 INSERT 의 O(n²) 멤버 증가 + 백필 | **non-index vacuum** + 백필·컨슈머 완전 정지 | 4회 × 각 1시간 이상 |
| 익명 SaaS | 2026-02 | XID 랩어라운드 | **autovacuum 을 껐다 잊음** | 장기 트랜잭션 종료 + 수동 `VACUUM FREEZE` | 미공개 |
| Figma | 2020-01-21~22 | (랩어라운드 아님) | 플래너 오추정. aggressive vacuum 은 악화 요인 | 쿼리 취소·IOPS 증설·버전 업그레이드 | 점검 창 약 75분 + 간헐 |
| Joyent Manta | 2015-07-27 | XID 랩어라운드(2차 서술) | — | — | "10-hour outage"(2차 인용) |

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

이 글은 PostgreSQL 버전·OS·호스팅·장애 날짜·지속 시간·에러 문구가 모두 없고 회사명도 없으므로 **정황 사례로만** 읽어야 합니다.

**두 사례는 인용할 때 특히 주의해야 합니다.** Figma(2020)는 랩어라운드 장애가 아닙니다. 이틀에 걸친 별개의 두 성능 장애였고 2일차의 근본 원인은 통계 갱신 후의 플래너 오추정(잘못된 계획이 2,000만 행 이상을 추정했으나 실제 결과는 3행)이었습니다. 배큠은 악화 요인입니다 — 취소한 쿼리가 배큠 백로그를 남겨 "This crossed the threshold for a more aggressive form of automatic vacuuming intended to prevent transaction ID wraparound" 상태가 되었고, 그 모드가 "has a greater impact on locking and writes" 였습니다. 이 사건의 정확한 용법은 **"aggressive autovacuum 이 락과 쓰기에 미치는 영향을 회사가 공개적으로 인정한 기록"** 입니다. Joyent/Manta 는 1차 포스트모템 URL 이 현재 404 이므로 1차 근거로 쓸 수 없습니다. 위 표의 값은 2024년 Dave Pacheco 의 회고에 실린 **2차 서술**입니다.

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
- **`WAL usage: ... full page images` 가 크다** → 앞에서 본 FPI 폭증 패턴입니다.
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
- `autovacuum_vacuum_max_threshold`(기본 1억)는 **18 신규**입니다. 17 이하에는 dead tuple 개수의 절대값 상한이 없어서, 10억 행 테이블은 dead tuple 이 2억 개 쌓일 때까지 배큠이 트리거되지 않았습니다. 그때 도는 배큠은 필연적으로 오래 걸립니다. 발동 공식 자체는 앞에서 다뤘습니다.
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

**따라서 `autovacuum_max_workers` 만 올리면 전체 처리량은 늘지 않고 워커당 속도만 떨어집니다.** 앞 절에서 본 대로 워커 추가는 서로 다른 테이블을 동시에 잡는 효과만 있습니다. 처리량을 올리려면 limit 을 올리거나 delay 를 낮춰야 합니다. Albe 는 `autovacuum_vacuum_cost_delay` 를 낮추는 것을 "the effective method", `autovacuum_vacuum_cost_limit` 을 200 보다 올리는 것을 "the gentle method" 로 부르고, 테이블별 변경을 권합니다. 다만 그 글도 cost limit 의 구체적 목표 숫자를 제시하지 않습니다. "cost limit 을 1000 이나 2000 으로 올려라" 류의 숫자는 1차 근거를 확보하지 못했으므로 이 글에서는 단정하지 않습니다.

**delay 를 0 으로 두는 것은 위험합니다.** 앞의 「배큠 자체가 성능을 떨어뜨리는 경로」에서 본 그 사례입니다 — 스로틀을 없애면 freeze 가 만드는 full page image 로 WAL 이 폭증해 동기 복제 커밋이 멈출 수 있습니다. 그 진단의 조치는 기본값 2ms 로 되돌리는 것이었고, 저자는 1ms 만으로도 WAL 홍수를 막는다고 적었습니다. 처리량이 필요하면 delay 를 0 으로 없애는 것보다 limit 을 올리는 편이 통제 가능한 선택입니다.

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

18 의 비동기 I/O 는 배큠에 직접 작용합니다. 릴리스 노트 Overview 가 수혜 대상에 "**vacuums**" 를 명시적으로 넣었으므로 이것은 추론이 아닙니다. `io_method` 기본값이 `worker` 이므로 **설정 변경 없이도** 배큠의 힙 스캔 I/O 가 AIO 경로를 탑니다. `io_workers` 기본값이 3 이라 I/O 바운드 환경에서는 이 값이 병목이 될 수 있고, `pg_aios` 뷰로 관측합니다. Linux 에서 `io_uring` 빌드가 가능하면 워커 프로세스 경유 오버헤드를 줄일 수 있지만 정량 효과는 확인되지 않습니다.

마지막으로 이 절에서 **쓰지 않은 것**을 밝혀 둡니다. NVMe·gp3·네트워크 스토리지 사이의 배큠 시간 배수, OS 레벨 read-ahead 튜닝 효과, 스토리지 유형별 cost 파라미터 권장값, 그리고 매니지드 서비스 벤더의 권장 숫자는 1차 근거를 확보하지 못했습니다. 이런 숫자는 자기 환경에서 측정해서 얻어야 합니다.

## PostgreSQL 14 → 18 배큠 변화 요약

13 은 이미 EOL(2025-11-13)이므로 지원 중인 14 부터 정리합니다. 각 항목은 릴리스 노트 기준입니다.

| 버전 | 추가된 것 | 제거·변경된 것 |
|---|---|---|
| **14** (2021-09-30) | `INDEX_CLEANUP` 기본값 `auto` / vacuum failsafe(`vacuum_failsafe_age`·`vacuum_multixact_failsafe_age`) / bottom-up index deletion / `PROCESS_TOAST` / 인덱스별 autovacuum 로깅 / `COPY FREEZE` 가 page visibility bit 정상 갱신 / `vacuumdb --no-index-cleanup`·`--no-truncate` | `vacuum_cost_page_miss` 기본값 10 → 2 / 랩어라운드 경고·하드리밋 여유 확대 / `CREATE INDEX CONCURRENTLY`·`REINDEX CONCURRENTLY` 가 다른 릴레이션 dead row 제거를 막지 않음 / **제거**: `vacuum_cleanup_index_scale_factor` |
| **15** (2022-10-13) | `VACUUM VERBOSE`·autovacuum 로그 정보 추가 / 중복 제거가 시스템·TOAST 인덱스에도 적용 / `CLUSTER` 가 파티션 테이블 지원 | `log_autovacuum_min_duration` 기본값 `-1` → `10min`(`log_checkpoints` 도 `on`) / `relfrozenxid`·`relminmxid` 를 더 적극적으로 전진 / **신규 `VACUUM` 옵션 없음** |
| **16** (2023-09-14) | `BUFFER_USAGE_LIMIT` + `vacuum_buffer_usage_limit` / `PROCESS_MAIN` / `SKIP_DATABASE_STATS`·`ONLY_DATABASE_STATS` / `pg_stat_io` 뷰 / `n_tup_newpage_upd` 컬럼 | 평시 배큠 중 기회적 페이지 freeze("makes full-table freeze vacuums less necessary") / delay 설정 변경을 **블록 단위**로 반영 / BRIN 전용 컬럼 갱신 시 HOT 허용 / **제거**: `vacuum_defer_cleanup_age` |
| **17** (2024-09-26) | dead tuple 저장 구조 개편 — **`maintenance_work_mem` 1GB 상한 제거** / `indexes_total`·`indexes_processed` 진행률 / `MAINTAIN` 권한·`pg_maintain` 롤 / 인덱스 없는 릴레이션 배큠 최적화 | `vacuum_buffer_usage_limit` 기본값 `2MB` / 배큠 WAL 이 더 압축적 / **비호환**: `pg_stat_progress_vacuum` 컬럼 개편(`max_dead_tuple_bytes`·`num_dead_item_ids`·`dead_tuple_bytes`) / **제거**: `old_snapshot_threshold` |
| **18** (2025-09-25, 현재 GA) | eager freezing·eager scanning + `vacuum_max_eager_freeze_failure_rate` / `autovacuum_worker_slots` / `autovacuum_vacuum_max_threshold`(1억) / `vacuum_truncate` GUC / `total_vacuum_time` 등 4개 컬럼 / delay time 보고(`track_cost_delay_timing`) / AIO(`io_method`·`pg_aios`) / `pg_class.relallfrozen` / `pg_signal_autovacuum_worker` 롤 | autovacuum 발동 공식 2곳 변경 / `autovacuum_max_workers` 를 reload 로 변경 가능 / `effective_io_concurrency`·`maintenance_io_concurrency` 기본값 16 / **비호환**: `VACUUM`·`ANALYZE` 가 상속 자식까지 처리(이전 동작은 새 `ONLY` 옵션) |

## PostgreSQL 19 에서 바뀌는 것 (GA 전)

**PostgreSQL 19 는 아직 GA 전입니다.** 이 글 기준 상태는 Beta 3(2026-08-13)이고, 버전 정책 페이지에 목표일이 없어 GA 날짜는 확인되지 않습니다. 아래는 확정이 아니며 GA 시점에 달라질 수 있습니다. 근거는 개발 문서 릴리스 노트입니다.

- **`REPACK` 명령 도입.** `VACUUM FULL` 과 `CLUSTER` 의 기능을 통합하고, `CONCURRENTLY` 옵션으로 "repacking without blocking reads and writes to the table" 가 가능해집니다. `max_repack_replication_slots` 도 함께 추가됩니다. 주의할 점은 **`VACUUM FULL` 이 폐기된 것이 아니라는 것**입니다 — 릴리스 노트 문장은 "The old commands have been retained for compatibility" 입니다. 통합이지 deprecated 가 아닙니다.
- **autovacuum 의 병렬 인덱스 배큠.** 이 글에서 여러 번 짚은 18 이하의 구조적 제약이 여기서 풀립니다. "Autovacuum can now use parallel worker processes to vacuum a table's indexes" 이고, 전역 `autovacuum_max_parallel_workers` 와 테이블별 `autovacuum_parallel_workers` 로 제어합니다. **전역 기본값이 `0` 이므로 19 로 올려도 옵트인하지 않으면 동작은 바뀌지 않습니다.**
- **autovacuum 우선순위 스코어링.** 테이블 처리 순서를 점수로 정하는 방식이 추가되고, weight GUC 5종(`autovacuum_freeze_score_weight`, `autovacuum_multixact_freeze_score_weight`, `autovacuum_vacuum_score_weight`, `autovacuum_vacuum_insert_score_weight`, `autovacuum_analyze_score_weight`, 전부 기본값 1.0)과 `pg_stat_autovacuum_scores` 뷰가 생깁니다. 이 5종은 `postgresql.conf` 전용이고 테이블별 오버라이드가 없습니다.
- **랩어라운드 경고 임계 상향.** "Issue warnings when the wraparound of xid and multi-xids is less than 100 million … The previous warning was 40 million." 즉 4천만에서 1억으로 올라갑니다.
- **multixact 멤버 64비트화.** "Make multixid members 64-bit" 로 멤버 저장소 카운터가 64비트가 됩니다. 앞에서 본 멤버 저장소 압박 구조가 사실상 해소되는 변화입니다. 다만 **multixact ID 자체는 여전히 32비트**이고, 내부 XID 폭도 18·19 모두 32비트입니다. `xid8` 은 64비트 XID 를 표현하는 데이터 타입이지 내부 XID 폭이 바뀐 것이 아닙니다.
- **평시 쿼리 스캔이 visibility map 을 갱신할 수 있게 됩니다.** "Allow query table scans to mark pages as all-visible in the visibility map — Previously only `VACUUM` and `COPY... FREEZE` could do this."
- 그 밖에: `pg_stat_progress_vacuum` 에 `started_by`·`mode` 컬럼 / `VACUUM (VERBOSE)`·autovacuum 로그에 메모리 사용량·병렬 정보 / full page write 바이트 보고 / `log_autoanalyze_min_duration` 분리 / hash 인덱스 bulk-deletion 과 GIN 인덱스 배큠에 streaming read / `io_method = worker` 의 워커 수 자동 조절(`io_min_workers`·`io_max_workers` 등) / `vacuumdb --dry-run`.

각 항목의 정량 개선폭은 릴리스 노트가 밝히지 않으므로 확인되지 않습니다. 19 를 기다릴 이유가 있는 곳은 분명합니다 — 인덱스가 많은 초대형 단일 테이블의 autovacuum, 그리고 무중단 재구성에 확장(pg_repack)을 써야 했던 자리입니다. 그전까지는 이 글의 방법들, 특히 파티셔닝과 유지보수 창의 수동 배큠이 남은 선택지입니다.
