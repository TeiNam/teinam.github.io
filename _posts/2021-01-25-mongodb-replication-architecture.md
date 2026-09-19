---
date: 2021-01-25 23:10:35 +0900
title: "MongoDB 복제 아키텍처"
category: mongodb
excerpt: "MongoDB는 Secondary가 Primary에서 OpLog를 가져와 재생하여 데이터를 동기화합니다. 레플리카 셋은 최대 50개 멤버를 지원하며, 이 중 7개까지 투표권을 가질 수 있습니다."
updated: 2026-09-20
---

MongoDB는 Secondary가 Primary에서 OpLog를 가져온 다음 OpLog를 재생해서 데이터를 동기화합니다. Secondary 멤버는 Primary뿐만 아니라 다른 Secondary 멤버의 OpLog를 재생할 수도 있습니다.

## OpLog

OpLog는 Operation Log의 약자로, MongoDB의 복제를 위해서만 사용됩니다. 컬렉션의 레코드 형태로 저장되기 때문에 저널로그와는 다른 방식으로 기록됩니다. OpLog와 저널로그의 차이는 주체가 다르다는 점으로, OpLog는 MongoDB의 엔진이 처리하며 저널로그는 스토리지 엔진이 처리합니다.

## OpLog의 구조

OpLog는 MongoDB의 Local 데이터베이스 안에 'oplog.rs'라는 컬렉션으로 기록됩니다. 항상 모든 필드가 존재하는 것은 아니며, 필요에 따라 생성되는 필드도 존재합니다. 아래는 oplog.rs의 필드 값의 내용입니다.

- **ts(Timestamp):** 저장 순서를 결정합니다. 동기화를 잠시 중단하거나 재시작할 때 기준점이 됩니다.
- **t(Primary Term):** 레플리카 셋의 Primary 선출 투표가 실행될 때마다 증가합니다.
- **v(Version):** OpLog 엔트리의 내부 버전을 나타냅니다.
- **op(Operation Type):** 작업 종류를 저장합니다. i(Insert), d(Delete), u(Update), c(Command), n(No Operation) 등이 있으며, n은 단순 정보 저장용입니다.
- **ns(Namespace):** 데이터가 변경된 컬렉션의 네임스페이스가 저장됩니다.
- **o(Operation):** op 필드에 저장된 작업 타입별로 실제 변경된 정보가 저장됩니다.
- **o2(Operation 2):** op 필드가 u인 경우에만 존재합니다. 업데이트될 대상 도큐먼트의 \_id 정보를 저장합니다.
- **wall:** 작업이 Primary에서 기록된 시각을 나타냅니다.

### Local Database

MongoDB의 기본 데이터베이스의 하나로, MongoDB를 설치하면 기본으로 생성되는 데이터베이스입니다. oplog.rs를 포함하여 해당 데이터베이스만을 위한 정보들이 담긴 컬렉션이 저장되어 있습니다. Local 데이터베이스의 내용은 Secondary로 복제되지 않습니다. 따라서 복제할 필요가 없는 모니터링 데이터나 백업 이력 등을 Local 데이터베이스에 저장하여 관리합니다.

Secondary 멤버는 기본적으로 쓰기를 받지 않지만, `mongosh`에서 read preference를 `secondary` 계열 모드(`secondary`, `secondaryPreferred`, `nearest` 등)로 지정하면 읽기 명령을 실행할 수 있습니다. Local 데이터베이스는 복제되지 않으므로 각 멤버의 local 데이터베이스에는 독립적으로 데이터를 입력, 수정, 삭제할 수 있습니다.

### Initial Sync (초기 동기화)

MongoDB를 처음 설치 후 비어있는 데이터베이스를 레플리카 셋에 투입하면 이미 투입되어 있는 멤버들로부터 모든 데이터를 일괄적으로 가져옵니다. 특별히 사용자가 작업을 따로 해주지 않았다면 자동으로 초기 동기화가 발생합니다. 초기 데이터를 복제한 후, 복제하는 동안 발생한 변경사항을 OpLog로 가져와 재생하여 적용합니다. 최종적으로 인덱스를 생성하여 동기화가 마무리됩니다.

초기 동기화는 일시적인 네트워크 오류, 컬렉션 삭제, 컬렉션 이름 변경 등의 상황에서 재개할 수 있습니다. 재개 가능 시간은 `initialSyncTransientErrorRetryPeriodSeconds` 파라미터로 설정하며, 기본값은 24시간입니다. MongoDB 5.2 이상의 Enterprise Edition에서는 `initialSyncMethod`를 `fileCopyBased`로 설정해 파일 복사 기반 초기 동기화를 사용할 수 있습니다.

### 실시간 복제

MongoDB는 비동기 복제를 사용하므로 Secondary에서 읽은 데이터가 Primary의 최신 상태를 반영하지 않을 수 있습니다. 복제 지연이 있더라도 Secondary는 지속적으로 Primary의 OpLog를 가져와 적용하며, 결국 Primary와 동일한 상태에 도달합니다. Primary 멤버는 모든 멤버의 복제 상태 정보를 보유합니다.

MongoDB의 복제 아키텍처를 그림으로 그리면 아래와 같습니다.

![MongoDB의 복제 아키텍처 다이어그램](/assets/img/wp/2021/01/2021-01-21__3.22.41.png)

MongoDB의 복제 아키텍처

1. MongoDB가 처리한 모든 데이터 변경 내용을 capped 컬렉션 구조의 'oplog.rs' 컬렉션에 저장합니다.
2. **테일러블 커서**[1]로 최신 데이터를 전송합니다.
3. Secondary의 **백그라운드 쓰레드(Observer)**[2]가 큐에 일정 개수의 OpLog를 담습니다.
4. **리플리케이션 배치**[3] 쓰레드는 큐에서 일정 개수의 OpLog를 가져와 **OpLog 적용 쓰레드**[4]에 맞게 작업량을 나눈 다음 작업을 요청합니다.

  - **[1] 테일러블 커서:** capped 컬렉션에서 지원하는 커서로, 리눅스의 Tail 명령처럼 큐 방식으로 동작합니다.
  - **[2] Observer:** Secondary 멤버의 OpLog 수집을 위한 백그라운드 쓰레드입니다. 수집하여 큐에 쌓는 역할만 합니다.
  - **[3] 리플리케이션 배치**: 큐에서 OpLog를 가져와 적용 쓰레드 개수에 맞게 작업량을 나눈 다음 작업을 요청합니다.
  - **[4] OpLog 적용 쓰레드(Applier):** OpLog 엔트리를 실제로 적용하는 쓰레드입니다. 쓰레드 수와 배치 크기는 `replWriterThreadCount`, `replBatchLimitOperations`, `replBatchLimitBytes` 파라미터로 조정할 수 있습니다.

## OpLog의 컬렉션 크기 설정

oplog.rs의 컬렉션 크기는 OpLog가 담을 수 있는 데이터 양을 결정하며, 이는 곧 Secondary 멤버가 허용할 수 있는 최대 지연 시간을 결정합니다.

**기본 크기 (WiredTiger 스토리지 엔진 기준)**

- Unix/Windows: 여유 디스크 공간의 **5%**
  - 최소: **990 MB**
  - 최대: **50 GB**
- 64비트 macOS: **192 MB** (고정)

OpLog 크기를 명시하지 않으면 MongoDB는 위 규칙에 따라 자동으로 크기를 결정합니다. 레플리카 셋 구성 후에는 `replSetResizeOplog` 명령으로 `mongod` 재시작 없이 동적으로 크기를 조정할 수 있습니다. 시작 옵션 `replication.oplogSizeMB`로 크기를 지정하거나, `storage.oplogMinRetentionHours`로 OpLog 항목의 최소 보존 시간을 설정할 수 있습니다.

oplog.rs는 capped 컬렉션이지만, 일반 capped 컬렉션과 달리 majority commit point를 삭제하지 않기 위해 설정된 크기 제한을 초과해 커질 수 있습니다.

## OpLog의 정보 확인

`mongosh`에서 다음 명령으로 OpLog 상태를 확인할 수 있습니다.

- `rs.printReplicationInfo()`: OpLog의 크기와 작업 시간 범위를 텍스트 형식으로 출력
- `db.getReplicationInfo()`: 위와 동일한 정보를 JSON 형식으로 반환

### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/ "https://www.mongodb.com/docs/manual/")
