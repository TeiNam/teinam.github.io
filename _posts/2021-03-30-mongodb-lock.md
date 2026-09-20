---
date: 2021-03-30 01:50:54 +0900
title: "MongoDB Lock (잠금)"
category: mongodb
excerpt: "다른 DBMS와 마찬가지로 MongoDB도 여러 스레드가 같은 데이터를 동시에 건드릴 때 생기는 충돌을 막기 위해 락을 사용합니다."
last_modified_at: 2026-09-20
---

다른 DBMS와 마찬가지로 MongoDB도 여러 스레드가 같은 데이터를 동시에 건드릴 때 생기는 충돌을 막기 위해 락을 사용합니다. 락은 MongoDB 서버가 잡는 것과 스토리지 엔진이 잡는 것으로 나뉩니다. 기본 스토리지 엔진인 WiredTiger는 쓰기 작업에 문서 수준 동시성 제어를 적용하고, 그보다 위 계층에는 의도 락(intention lock)만 잡습니다. 그래서 MongoDB는 여러 계층을 함께 다루는 다중 레벨 잠금(multi-granularity locking)을 사용합니다.

잠금 수준은 네 가지입니다.

- **Global**: 인스턴스 전체를 잠급니다.
- **Database**: 지정된 데이터베이스를 잠급니다.
- **Collection**: 지정된 컬렉션을 잠급니다.
- **Document**: MongoDB 서버가 직접 잠그지 않고 스토리지 엔진에 위임합니다. WiredTiger가 문서 수준에서 동시성을 제어합니다.

잠금 모드도 네 가지이고, `db.serverStatus()` 와 `db.currentOp()` 출력에는 한 글자 약자로 나타납니다.

- **`R` — Shared(S)**: 공유 잠금 또는 읽기 잠금입니다. 현재 스레드가 보고 있는 데이터를 다른 스레드가 바꾸지 못하게 막는 것이 목적이라 다른 스레드의 S 잠금과 호환됩니다. 읽기만 한다면 여러 스레드가 동시에 읽을 수 있습니다.
- **`W` — Exclusive(X)**: 배타적 잠금 또는 쓰기 잠금입니다. 변경 중인 데이터를 다른 스레드가 바꾸는 것은 물론 읽는 것도 허용하지 않습니다.
- **`r` — Intent Shared(IS)**: 하위 수준을 잠그기 전에 상위 수준에 걸어 두는 의도 락입니다. 데이터베이스에 IS가 걸렸다면 락 보유자가 컬렉션이나 문서 수준에서 S를 걸 의향이 있다는 뜻입니다.
- **`w` — Intent Exclusive(IX)**: 락 보유자가 더 세분화된 수준에서 리소스를 수정할 것임을 나타냅니다. 데이터베이스에 IX가 걸렸다면 컬렉션이나 문서 수준에서 X를 걸 의향이 있다는 뜻입니다.

어떤 수준을 잠그면 그보다 위의 모든 수준은 의도 락으로 잠깁니다. 컬렉션을 X로 잠글 때 해당 데이터베이스 락과 글로벌 락은 IX로 잡힙니다. 한 데이터베이스가 IS와 IX로 동시에 잠기는 것은 가능하지만, X는 다른 어떤 모드와도 공존하지 못하고 S는 IS와만 공존합니다.

## Global Lock

읽기·쓰기 명령은 필요한 락을 묵시적으로 잡고 필요 없어지면 자동으로 놓습니다. 사용자가 명시적으로 인스턴스 전체를 잠글 수 있는 명령은 `db.fsyncLock()` 입니다.

```javascript
db.fsyncLock()
```

인자를 받지 않습니다. 데이터베이스 명령으로 쓸 때의 이름은 `fsync` 입니다. 스토리지 계층에 밀려 있던 쓰기를 모두 디스크로 내려보내고, 잠금이 풀릴 때까지 추가 쓰기를 막습니다. 서버는 fsync 잠금 횟수를 셉니다. `db.fsyncLock()` 이 이 값을 올리고 `db.fsyncUnlock()` 이 내리므로, 쓰기를 다시 열려면 횟수가 0이 될 때까지 `db.fsyncUnlock()` 을 호출해야 합니다. 이 잠금은 `cp`·`scp`·`tar` 같은 저수준 백업 유틸리티로 데이터 파일을 안전하게 복사하려고 씁니다. MongoDB 7.1부터는(7.0.2·6.0.11·5.0.22 에도 포함) `mongos` 에서 실행해 샤드 클러스터 전체를 잠그고 풀 수 있습니다.

> **WARNING** — fsync 잠금은 프라이머리에서 실행됩니다. 잠금이 걸린 프라이머리가 내려가면 새로 선출된 프라이머리는 이 잠금을 물려받지 않고 쓰기를 받기 시작하므로, 백업 도중 선출이 일어나면 결과물이 일관성을 잃거나 쓸 수 없게 됩니다. 잠금 자체는 노드에 남아 있어서 예전 프라이머리가 복귀하면 `db.fsyncUnlock()` 으로 풀어 줘야 합니다.

데이터베이스 수준 배타 잠금을 오래 잡는 관리 명령으로는 `cloneCollectionAsCapped` 와 `convertToCapped` 가 있습니다. 한때 글로벌 배타 잠금을 쓰던 명령들은 잠금 범위가 좁아졌습니다.

- **`renameCollection`**: 같은 데이터베이스 안에서 이름을 바꿀 때는 원본·대상 컬렉션에 X를 잡습니다. 데이터베이스를 넘나들 때는 대상 데이터베이스에 X, 원본 데이터베이스에 IS(`r`), 원본 컬렉션에 S(`R`) 를 잡고 대상 데이터베이스의 다른 작업을 막습니다.
- **`reIndex`**: 글로벌 배타 잠금 대신 컬렉션에 X만 잡고, 끝날 때까지 그 컬렉션의 다른 작업을 막습니다. 6.0부터 deprecated 이고 실행하면 로그에 경고가 남습니다. 5.0 이후로는 standalone 인스턴스에서만 실행할 수 있습니다.
- **`replSetResizeOplog`**: 글로벌 배타 잠금 대신 `oplog` 컬렉션에 X만 잡습니다.

## WiredTiger 스토리지 엔진 Lock

WiredTiger는 쓰기 작업에 문서 수준 동시성 제어를 적용하므로 여러 클라이언트가 한 컬렉션의 서로 다른 문서를 동시에 수정할 수 있습니다. 대부분의 읽기·쓰기에는 낙관적 동시성 제어(optimistic concurrency control)를 쓰고, 글로벌·데이터베이스·컬렉션 수준에는 의도 락만 잡습니다. 두 작업이 충돌하면 한쪽이 쓰기 충돌(write conflict)을 받고 MongoDB가 그 작업을 투명하게 재시도합니다. 여러 데이터베이스에 걸친 짧은 작업 일부는 여전히 인스턴스 전체 글로벌 락이 필요하고, `renameCollection` 처럼 조건에 따라 데이터베이스 배타 잠금이 필요한 명령도 있습니다.

다음은 문서 수준 동시성 제어를 지원하는 스토리지 엔진에서 주요 작업이 잡는 락입니다.

| Operation | Database | Collection |
| --- | --- | --- |
| Issue a query | `r` (Intent Shared) | `r` (Intent Shared) |
| Insert data | `w` (Intent Exclusive) | `w` (Intent Exclusive) |
| Remove data | `w` (Intent Exclusive) | `w` (Intent Exclusive) |
| Update data | `w` (Intent Exclusive) | `w` (Intent Exclusive) |
| Perform Aggregation | `r` (Intent Shared) | `r` (Intent Shared) |
| Create an index | — | `W` (Exclusive) |
| List collections | `r` (Intent Shared) | — |
| Map-reduce | `W` (Exclusive) and `R` (Shared) | `w` (Intent Exclusive) and `r` (Intent Shared) |

표에 남아 있는 map-reduce는 5.0부터 deprecated 입니다. 공식 문서는 집계 파이프라인으로 바꿔 쓰라고 안내합니다.

인덱스 생성이 잡는 락은 4.2에서 크게 바뀌었습니다. 예전에는 Background 옵션 없이 인덱스를 만들면 빌드가 끝날 때까지 배타 잠금이 유지돼 쓰기가 오래 막혔고, 그것 때문에 장애가 나기도 했습니다. 지금은 빌드 시작과 끝에만 컬렉션에 X를 잡습니다. 시작 직후 X를 IX로 내려 읽기·쓰기에 주기적으로 양보하고, 커밋 직전에 S로 올려 쓰기를 막은 뒤 마지막에 X로 올려 마무리합니다. 잠금 방식이 이렇게 바뀌면서 Background 옵션은 4.2에서 폐기됐습니다. 4.4부터는 레플리카 셋과 샤드 클러스터에서 데이터를 가진 모든 멤버가 인덱스를 동시에 빌드하고, 프라이머리가 커밋 쿼럼(기본값 `votingMembers`)을 채운 뒤 인덱스를 사용 가능으로 표시합니다. 자세한 단계는 MongoDB 매뉴얼의 [Index Build Process](https://www.mongodb.com/docs/manual/core/index-creation/) 문서에 정리돼 있습니다.

5.0부터 `find`·`count`·`distinct`·`aggregate`·`mapReduce`·`listCollections`·`listIndexes` 는 컬렉션에 X가 걸려 있어도 막히지 않습니다. 단 `mapReduce` 와 `aggregate` 가 컬렉션에 쓰는 경우에는 IX를 잡으므로, X가 이미 걸려 있으면 그 쓰기는 막힙니다.

`create`·`createIndexes`·`drop`·`dropIndexes`·`collMod` 처럼 컬렉션 정의를 바꾸는 명령은 대상 컬렉션에 컬렉션 수준 잠금을 잡습니다. `db.serverStatus().locks` 는 7.1부터 DDL 락을 `DDLDatabase`·`DDLCollection` 타입으로 따로 보고합니다.

### 동시 트랜잭션 티켓

WiredTiger는 동시에 실행할 스토리지 엔진 트랜잭션 수를 티켓으로 제한합니다. 7.0부터는 기본 알고리즘이 읽기·쓰기 티켓의 최대치를 동적으로 조정해 클러스터가 과부하일 때 처리량을 지킵니다. 이 알고리즘은 예전보다 훨씬 낮은 티켓 수에서 출발하므로, 7.0으로 올린 뒤 티켓 사용량이 크게 떨어져 보이는 것은 정상입니다. 최대치는 읽기 128개·쓰기 128개를 넘지 않고, 같은 노드 안에서는 읽기와 쓰기 최대치가 항상 같습니다. 클러스터 안 노드끼리는 값이 다를 수 있습니다. 동적 최대치가 넘지 못할 상한을 직접 정하려면 `storageEngineConcurrentReadTransactions` 와 `storageEngineConcurrentWriteTransactions` 를 씁니다. 현재 허용된 티켓 수는 `db.serverStatus()` 의 `queues.execution` 문서에서 확인합니다.

> **NOTE** — `queues.execution` 의 `available` 이 낮다는 것만으로 과부하라고 볼 수 없습니다. 공식 문서는 대기 중인 읽기·쓰기 티켓 수를 과부하 지표로 보라고 안내합니다.

## Lock Yield

일부 상황에서는 읽기 및 쓰기 작업이 잡은 잠금을 Yield 할 수 있습니다. MongoDB 서버의 Yield는 쿼리를 실행하는 도중에 지정한 조건에 다다르면 잠깐 작업을 중지했다가 다시 재개하는 것을 말합니다. 단순히 쉬는 게(Sleep) 아니라 처리 중인 쿼리를 위해 획득했던 잠금까지 모두 해제하고 쉬게 됩니다.

Yield를 실행하는 규칙은 두 가지입니다.

- 쿼리가 지정된 건수의 도큐먼트를 읽은 경우
- 쿼리가 지정된 시간 동안 수행된 경우

WiredTiger처럼 문서 수준 동시성 제어를 지원하는 스토리지 엔진에서는 글로벌·데이터베이스·컬렉션 수준에 잡힌 의도 락이 다른 읽기·쓰기를 막지 않으므로, 스토리지에 접근할 때 Yield 할 필요가 없습니다. 그래도 다음 목적으로는 주기적으로 Yield 합니다.

- 많은 데이터를 메모리에 들고 있어야 하는 장시간 스토리지 트랜잭션을 피하기 위해
- 장기 실행 작업을 중단할 수 있도록 인터럽트 지점 역할을 하기 위해
- 인덱스·컬렉션 생성과 삭제처럼 컬렉션에 배타적 접근이 필요한 작업을 허용하기 위해

## 잠금 진단

잠금이 병목인지 보려면 `db.serverStatus()` 의 `globalLock` 과 `locks` 를 주기적으로 관찰합니다.

`db.serverStatus().globalLock`

- **totalTime**: 서버가 마지막으로 기동한 뒤 경과한 시간(마이크로초)이고, 서버 가동 시간과 거의 같습니다.
- **currentQueue.total**: 락을 기다리며 큐에 쌓인 작업 수로, `readers` 와 `writers` 의 합입니다. 이 값이 계속 높으면 락을 기다리는 요청이 많다는 뜻입니다.
- **activeClients**: 읽기·쓰기를 수행 중인 클라이언트 수입니다. `currentQueue` 를 해석할 때 함께 봅니다.

`db.serverStatus().locks.<type>` 은 락 타입별로 모드(`R`·`W`·`r`·`w`)마다 수치를 담습니다. `<type>` 에는 `Global`·`Database`·`Collection`·`Metadata`·`Mutex`·`oplog`·`ParallelBatchWriterMode`·`ReplicationStateTransition` 이 오고, 7.1부터 `DDLDatabase`·`DDLCollection` 이 추가됐습니다.

- **acquireCount**: 해당 모드로 락을 획득한 횟수
- **acquireWaitCount**: 락이 충돌하는 모드로 잡혀 있어 대기한 횟수
- **timeAcquiringMicros**: 락 획득 누적 대기 시간(마이크로초). `acquireWaitCount` 로 나누면 평균 대기 시간을 어림할 수 있습니다.
- **deadlockCount**: 락 획득이 데드락을 만난 횟수

진행 중인 작업은 `$currentOp` 집계 스테이지로 조회합니다. 공식 문서는 `currentOp` 명령(6.2에서 deprecated)과 `db.currentOp()` 대신 `$currentOp` 를 권합니다. 5.0부터 `mongosh` 의 `db.currentOp()` 는 내부적으로 `$currentOp` 를 쓰므로 결과가 16MB BSON 제한에 걸리지 않습니다. 출력에서 `locks` 는 그 작업이 잡은 락, `waitingForLock` 은 락을 기다리는 중인지, `lockStats` 는 락 타입·모드별 획득·대기 통계를 담습니다.

락을 기다리는 쓰기 작업만 골라 보려면 필터를 넘깁니다.

```javascript
db.currentOp(
   {
     "waitingForLock": true,
     $or: [
        { "op": { "$in": [ "insert", "update", "remove" ] } },
        { "command.findandmodify": { $exists: true } }
     ]
   }
)
```

> **WARNING** — `db.killOp()` 은 클라이언트가 시작한 작업에만 쓰고 내부 작업은 건드리지 않습니다. 특히 레플리카 셋이나 샤드 클러스터에서 진행 중인 인덱스 빌드는 `killOp` 으로 중단하면 안 됩니다. 이때는 `dropIndexes` 명령이나 `db.collection.dropIndex()`·`db.collection.dropIndexes()` 로 빌드를 정리합니다.

## 참고 자료

도서: Real MongoDB

MongoDB Manual: [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/)
