---
date: 2021-03-30 01:50:54 +0900
title: "MongoDB Lock (잠금)"
category: mongodb
excerpt: "MongoDB Lock 다른 DBMS와 마찬가지로 MongoDB도 멀티 쓰레드의 동시 처리중에 발생할 수 있는 쓰레드간의 충돌문제를 방지하기 위해 Lock을 사용합니다. 간단하게 설명하면 DB의 동시성을 유지하기 위하여 사용하는 메카니즘 입니다. MongoDB가 WiredTiger…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — 잠금 범위(Global/Database/Collection/Document)와 모드(S/X/IS/IX), 인텐션 락, `db.fsyncLock()`, Lock Yield 설명은 현재도 유효합니다. 다만 표에 나오는 인덱스 생성 Background 옵션은 4.2 에서 폐기됐고 map-reduce 는 5.0, `reIndex` 는 6.0 에서 각각 deprecated 됐습니다.

## MongoDB Lock

다른 DBMS와 마찬가지로 MongoDB도 멀티 쓰레드의 동시 처리 중 발생할 수 있는 쓰레드 간 충돌 문제를 방지하기 위해 Lock을 사용합니다. DB의 동시성을 유지하기 위해 사용하는 메카니즘입니다. MongoDB가 WiredTiger 스토리지 엔진 아키텍처를 채용하면서 MongoDB 서버 차원에서 처리되는 Lock과 각 스토리지 엔진에서 처리되는 Lock으로 크게 나누어 볼 수 있습니다. WiredTiger 스토리지 엔진이 도입된 3.2 버전부터 여러 계층의 데이터베이스 오브젝트의 동시처리를 위해 인텐션 락(Intention Lock)이 도입되어 활용되고 있으며, 다중 레벨의 잠금(multi-granularity locking)을 사용합니다.

MongoDB에는 네 가지 잠금 수준이 있습니다.

- **Global**: 모든 데이터베이스가 잠기는 MongoDB 인스턴스 수준 잠금입니다.
- **Database**: 언급된 데이터베이스가 잠기는 데이터베이스 수준 잠금입니다.
- **Collection**: 여기서 잠금은 컬렉션 수준에서 처리됩니다.
- **Document**: 특정 도큐먼트만 잠기는 도큐먼트 수준 잠금입니다.

그리고 네 가지 잠금 모드가 있습니다.

- **Shared(R)**: 공유 잠금 또는 읽기 잠금이라고 불리며, 줄여서 S-Lock이라고 합니다. 현재 쓰레드가 참조하고 있는 데이터를 다른 쓰레드가 변경하지 못하도록 방어하는 것이 목적이므로 다른 쓰레드의 Shared Lock과 호환됩니다. 데이터를 읽기만 하는 경우에는 여러 쓰레드가 동시에 읽을 수 있습니다.
- **Exclusive(W)**: 배타적 잠금 또는 쓰기 잠금이라고 하며 줄여서 X-Lock이라고 합니다. 현재 쓰레드가 변경하려고 하는 데이터를 다른 쓰레드가 변경하지 못하게 방지하는 것이 목적이므로 변경 중인 데이터를 다른 쓰레드가 읽는 것도 허용하지 않습니다.
- **Intent Shared(r)**: 인텐션 락은 하위 수준 잠금 전에 획득한 상위 수준 잠금입니다. Lock Holder가 세분화된 수준에서 리소스를 읽을 것임을 나타냅니다. Intent Shared(r) 잠금이 데이터베이스에 적용되면 Lock Holder가 컬렉션 또는 도큐먼트 수준에서 Shared(S) 잠금을 적용할 의향이 있음을 의미합니다.
- **Intent Exclusive(w)**: Lock Holder가 세분화된 수준에서 리소스를 수정할 것임을 나타냅니다. Intent Exclusive(w) 잠금이 데이터베이스에 적용되면 Lock Holder가 컬렉션 또는 도큐먼트 수준에서 Exclusive(X) 잠금을 적용할 의향이 있음을 의미합니다.

### Global Lock

MongoDB 3.4 이후 버전에서 모든 잠금은 묵시적으로 사용됩니다. 쿼리 혹은 데이터 변경에 대한 명령은 일시적으로 잠금 획득을 했다가 필요 없는 시점에 자동으로 해제됩니다. MongoDB에서 유일하게 명시적으로 사용할 수 있는 잠금은 글로벌 잠금뿐이며, 인스턴스 잠금이라고도 합니다.

4.2 버전으로 올라오면서 몇 가지 글로벌 잠금을 사용하던 명령이 묵시적 잠금만 사용하도록 변경된 부분도 존재합니다.

- **db.copyDatabase()**: 이 작업은 Global Exclusive(W) 잠금을 획득하고 완료될 때까지 다른 작업을 차단합니다.
- **db.collection.reIndex()**: reIndex 작업은 4.0 이하의 버전에서 데이터베이스 수준의 Global Exclusive(W) 잠금을 사용하였습니다. MongoDB 4.0.0 ~ 4.2.1의 경우 이러한 작업은 Global Exclusive(W) 잠금을 사용하도록 변경되었고, MongoDB 4.2.2부터 이러한 작업은 Global Exclusive(W) 잠금 대신 컬렉션 수준의 Exclusive(W) 잠금만 얻습니다.
- **renameCollection**: MongoDB 4.2.1 및 이전 버전의 경우 이 작업은 데이터베이스 간의 컬렉션 이름을 바꿀 때 Global Exclusive(W) 잠금을 얻고 완료될 때까지 다른 작업을 차단했습니다. MongoDB 4.2.2부터 이 작업은 Global Exclusive Lock 대신에, 대상 데이터베이스에 대한 Exclusive(W) 잠금, 소스 데이터베이스에 대한 Intent Shared(r) 잠금, 소스 컬렉션에 대한 Shared(R) 잠금만 얻습니다.
- **replSetResizeOplog**: MongoDB 4.2.1 및 이전 버전의 경우 이 작업은 Global Exclusive(W) 잠금을 획득하고 완료될 때까지 다른 작업을 차단했습니다. MongoDB 4.2.2부터는 Global Exclusive(W) 잠금 대신 oplog 컬렉션에 대한 Exclusive(W) 잠금만 얻습니다.

실제로 MongoDB에서 글로벌 잠금을 실행할 수 있는 명령이 있습니다.

```javascript
db.fsyncLock({fsync: 1, lock: true})
```

mongod가 보류 중인 모든 쓰기 작업을 디스크에 플러시하도록 하고 사용자가 해당 `db.fsyncUnlock()` 명령으로 잠금을 해제할 때까지 추가 쓰기를 방지하기 위해 전체 mongod 인스턴스를 잠급니다. 이 명령어를 사용할 경우 모든 커넥션의 데이터 저장과 변경을 막고, Replica Set의 세컨더리에 유입되는 데이터 변경 작업 역시 막히게 됩니다. `db.fsyncLock()`은 cp, scp 또는 tar와 같은 Low-Level 수준의 백업 유틸리티를 사용하여 데이터 파일을 안전하게 복사할 수 있습니다.

> **주의:** 글로벌 잠금이 걸려있는 시간 동안 세컨더리 멤버로 복제 역시 멈추게 되기 때문에 이 시간 동안 프라이머리 장애가 발생한다면 데이터 유실이 발생할 수도 있습니다.

### WiredTiger 스토리지 엔진 Lock

WiredTiger 스토리지 엔진은 다른 RDBMS처럼 도큐먼트(=레코드) 기반의 잠금을 사용합니다. 그리고 다중 레벨의 잠금(multi-granularity locking)을 사용하는데 이것은 데이터베이스 또는 컬렉션 레벨의 잠금을 위해서 사용됩니다. WiredTiger 스토리지 엔진은 글로벌, 데이터베이스와 컬렉션의 인텐션 잠금을 활용하며, 인텐션 잠금은 데이터베이스 레벨이나 컬렉션 레벨의 명령과 도큐먼트 레벨의 명령이 최적의 동시성을 유지하면서 실행될 수 있게 합니다.

다음은 MongoDB에서 어떤 작업이 어떤 Lock을 사용하여 동작하는지 나열된 표입니다.

| Operation | Database | Collection |
| --- | --- | --- |
| Issue a query | `r` (Intent Shared) | `r` (Intent Shared) |
| Insert data | `w` (Intent Exclusive) | `w` (Intent Exclusive) |
| Remove data | `w` (Intent Exclusive) | `w` (Intent Exclusive) |
| Update data | `w` (Intent Exclusive) | `w` (Intent Exclusive) |
| Perform Aggregation | `r` (Intent Shared) | `r` (Intent Shared) |
| Create an index (Foreground) | `W` (Exclusive) |  |
| Create an index (Background) | `w` (Intent Exclusive) | `w` (Intent Exclusive) |
| List collections | `r` (Intent Shared) Changed in version 4.0. |  |
| Map-reduce | `W` (Exclusive) and `R` (Shared) | `w` (Intent Exclusive) and `r` (Intent Shared) |

여기에서 Create Index 명령을 사용할 때, 4.2와 4.4 버전에서 많은 부분이 바뀌었습니다.

기존에는 인덱스를 생성하기 위해 Background 옵션을 주지 않고 인덱스를 생성하면, Exclusive(W) 잠금이 발생하며 데이터베이스에 오랜 시간 쓰기 작업이 불가능해져 장애가 발생하는 일도 있었습니다. 하지만 4.2 버전부터는 인덱스 생성하는 과정이 변화하였고, 인덱스 빌드의 시작과 끝에서만 컬렉션에 대한 Exclusive(W) 잠금을 유지하는 최적화된 빌드 프로세스를 사용합니다. 나머지 빌드 프로세스는 읽기 및 쓰기 작업을 참조합니다. MongoDB 4.4부터는 모든 데이터 보유 복제본 세트 구성원에 걸쳐 복제본 세트 또는 샤딩된 클러스터 빌드에서 인덱스가 동시에 빌드됩니다. 인덱스 생성에 대한 메커니즘이 바뀌면서 Lock을 획득하는 과정이 컬렉션 레벨의 시작과 끝에서만 발생하는 것으로 바뀌었기 때문에 Background 옵션이 4.2 버전부터 Deprecated 되었습니다. 인덱스 생성 프로세스는 MongoDB의 메뉴얼 페이지(<https://docs.mongodb.com/manual/core/index-creation/#index-build-process>)를 참고하시면 됩니다.

### Lock Yield

일부 상황에서는 읽기 및 쓰기 작업이 발생시키는 잠금을 Yield할 수 있습니다. MongoDB 서버의 Yield는 쿼리를 실행하는 도중에 지정한 조건에 다다르면 잠깐 작업을 중지했다가 다시 재개하는 것을 말하는데, 단순히 쉬는 게(Sleep) 아니라 처리 중인 쿼리를 위해 획득했던 잠금까지 모두 해제하고 지정된 시간 동안 쉬게 됩니다.

Yield를 실행하는 규칙은 두 가지입니다.

- 쿼리가 지정된 건수의 도큐먼트를 읽은 경우
- 쿼리가 지정된 시간 동안 수행된 경우

WiredTiger와 같은 도큐먼트 수준의 동시성 제어를 지원하는 스토리지 엔진의 경우, 글로벌, 데이터베이스 및 컬렉션 수준에서 유지되는 Intention 잠금이 다른 읽기 작업과 쓰기 작업을 차단하지 않으므로 스토리지에 액세스할 때 Yield할 필요가 없습니다. 그러나 다음과 같은 작업은 주기적으로 Yield를 사용합니다.

- 많은 데이터가 메모리에 적재될 수 있는 장시간 실행되는 스토리지 트랜잭션을 방지하기 위해서
- 장기 실행 작업을 중단할 수 있도록 인터럽트 지점 역할을 위해
- 인덱스 및 컬렉션 삭제 및 생성과 같은, 컬렉션에 대한 독점적인 액세스가 필요한 작업을 허용하기 위해

### 잠금 진단

MongoDB에는 잠금을 방지하기 위해 주기적으로 모니터링할 수 있는 다양한 매개 변수가 있습니다.

`db.serverStatus().globalLock`

- **totalTime**: 이 값이 총 데이터베이스 가동 시간보다 크면 데이터베이스가 너무 오랫동안 잠금 상태에 있는 것을 나타냅니다.
- **currentQueue**: 많은 요청이 잠금 해제를 기다리고 있을 때 증가합니다.

`db.serverStatus().locks.Database`

- **acquireCount**: 잠금을 획득한 횟수
- **acquireWaitCount**: 잠금 충돌로 인해 locks.acquireCount가 대기한 횟수
- **timeAcquiringMicros**: 잠금 획득에 대한 누적 대기 시간 (마이크로 초)

`db.serverStatus().locks.Collection`

- 컬렉션에 대한 잠금 조회

`db.serverStatus().locks.oplog`

- oplog에 대한 잠금 조회

`db.currentOp()`

- 실행 중인 명령의 목록을 조회할 수 있고, 잠금 정보도 확인 가능

#### 참고 자료

도서: Real MongoDB

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
