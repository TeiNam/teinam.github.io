---
date: 2021-01-21 01:40:26 +0900
title: "MongoDB의 wiredTiger 스토리지 엔진"
category: mongodb
excerpt: "MongoDB 8.0 의 기본 스토리지 엔진인 WiredTiger 의 공유 캐시, 체크포인트, 저널, 압축, MVCC 동작을 공식 문서 기준으로 정리합니다."
updated: 2026-09-20
---

## WiredTiger 스토리지 엔진

WiredTiger 는 MongoDB 의 기본 스토리지 엔진입니다. `storage.engine` 의 기본값이 `wiredTiger` 이고, 내부 락 경합을 줄이려고 Hazard Pointer 와 스킵 리스트 같은 자료 구조를 쓰며, 최신 RDBMS 가 갖춘 MVCC 와 데이터 파일 압축을 제공합니다. 저장 데이터 암호화는 MongoDB Enterprise 에서만 쓸 수 있습니다.

자주 쓰는 기본 파라미터부터 보겠습니다.

- **storage.dbPath**: 데이터 파일이 저장되는 경로입니다. 저널 로그와 oplog 도 이 디렉터리 아래에 놓입니다. 다른 디스크나 파티션에 두려면 심볼릭 링크를 씁니다.
- **storage.directoryPerDB**: 데이터베이스 단위로 하위 디렉터리를 만들지, `dbPath` 에 모두 만들지 결정합니다. 기본값은 `false` 이고, `true` 로 두면 데이터베이스별로 디렉터리를 만듭니다.
- **storage.wiredTiger.engineConfig.directoryForIndexes**: 기본값은 `false` 입니다. `true` 로 두면 컬렉션 데이터를 `collection`, 인덱스를 `index` 하위 디렉터리에 나눠 저장합니다. 심볼릭 링크를 걸면 인덱스만 다른 디스크로 뺄 수 있습니다.
- **storage.journal.commitIntervalMs**: 저널 로그를 디스크에 동기화하는 간격입니다. 1~500 밀리초를 받고 WiredTiger 에서 기본값은 100 밀리초입니다. MongoDB 는 트랜잭션마다 저널을 디스크에 내리지 않고 이 간격으로 모아서 내립니다.

> **IMPORTANT** — 저널링은 MongoDB 6.1 부터 항상 켜져 있습니다. `storage.journal.enabled` 설정과 `--journal`·`--nojournal` 명령행 옵션은 그때 제거되었으므로 저널링을 끌 수 없습니다.

## WiredTiger 스토리지 엔진의 저장 방식

스토리지 엔진이 데이터를 디스크에 배치하는 방식은 크게 세 가지로 나뉩니다.

- **레코드(도큐먼트) 스토어:** 일반적인 RDBMS 가 쓰는 방식입니다. 한 레코드의 칼럼들을 한자리에 모아 저장하고 B-Tree 로 찾아갑니다.
- **컬럼 스토어:** 대용량 분석(OLAP, DW)에서 주로 씁니다. 레코드 단위가 아니라 칼럼 패밀리 단위로 파일을 만들기 때문에 특정 칼럼만 읽는 질의에서 읽어야 할 양이 줄어듭니다.
- **LSM(Log Structured Merge Tree) 스토어:** HBase 나 카산드라 같은 NoSQL 이 쓰는 방식입니다. 읽기보다 쓰기에 무게를 둡니다. B-Tree 대신 순차 파일 형태로 쌓고, 메모리에 담을 수 있는 크기의 조각으로 관리하다가 한계를 넘으면 디스크로 내립니다.

MongoDB 는 이 가운데 레코드 스토어만 씁니다. 현재 WiredTiger 설정 레퍼런스에는 LSM 관련 옵션이 남아 있지 않습니다.

## WiredTiger 스토리지 엔진의 내부 동작 방식

WiredTiger 는 다른 DBMS 처럼 B-Tree 구조의 데이터 파일과, 서버 크래시에서 데이터를 복구하기 위한 저널 로그(WAL, Write Ahead Log)를 함께 둡니다. Oracle 의 Redo 처럼 정해진 파일 몇 개를 로테이션하는 방식이 아니라, 새 로그 파일을 만들고 더 필요 없어진 파일을 자동으로 삭제하는 방식입니다. 저널 파일의 크기나 보관 여부는 MongoDB 자체 설정 항목으로 제어하지 않고, 다음처럼 WiredTiger 설정 문자열을 `configString` 으로 넘겨서 지정합니다.

```yaml
storage:
  engine: wiredTiger
  dbPath: /data/db
  wiredTiger:
    engineConfig:
      cacheSizeGB: 10
      configString: "log=(remove=false,file_max=100MB,path=/log/journal)"
    collectionConfig:
      blockCompressor: snappy
```

- **remove:** 필요 없어진 저널 파일을 자동으로 삭제할지 결정합니다. 기본값은 `true` 입니다. 체크포인트가 지난 저널 파일까지 남겨 두려면 `false` 로 둡니다. 예전 이름인 `archive` 는 현재 설정 레퍼런스에 없습니다.
- **file\_max:** 저널 파일 하나의 최대 크기입니다. 100KB~2GB 를 받고 기본값은 100MB 입니다. MongoDB 가 이 상한을 쓰기 때문에 저널 데이터가 약 100MB 쌓일 때마다 새 파일이 생깁니다.
- **path:** 저널 파일을 다른 디렉터리에 두고 싶을 때 지정합니다. 디렉터리가 미리 있어야 합니다.

사용자가 쿼리를 실행하면 WiredTiger 는 블록 매니저를 통해 필요한 데이터 블록을 디스크에서 읽어 공유 캐시에 적재한 다음 쿼리를 처리합니다. 도큐먼트를 변경하는 쿼리라면 트랜잭션을 시작하고 커서로 내용을 바꿉니다. 변경 내용은 공유 캐시에 먼저 반영되고, 데이터 파일에 기록되기를 기다리지 않고 저널 로그에 적은 뒤 결과를 돌려줍니다. writeConcern 에 따라 달라지지만 기본적으로 응답 시점은 데이터 파일에 기록한 시점이 아니라 저널 기록이 끝난 시점입니다.

저널 레코드도 곧바로 디스크로 가지는 않습니다. WiredTiger 는 저널 레코드를 메모리에 버퍼링하다가 `j: true` 가 포함되거나 함축된 쓰기가 들어올 때, 세컨더리가 oplog 배치를 적용한 뒤, 100 밀리초 간격마다, 그리고 새 저널 파일을 만들 때 디스크로 동기화합니다. 버퍼에 남아 있는 동안 `mongod` 가 하드 셧다운되면 그 사이 갱신은 유실될 수 있습니다.

공유 캐시에 변경이 쌓이면 WiredTiger 는 체크포인트를 일으켜 더티 페이지를 모아 디스크에 기록합니다. 더티 페이지를 디스크에 쓰기 전에 원본 데이터와 변경 정보를 합치는 작업은 리컨실리에이션 모듈이 담당합니다.

블록 매니저가 새 데이터 페이지를 계속 읽어 오다 보면 공유 캐시에 더 이상 넣을 자리가 없어집니다. 그때 이빅션(Eviction) 모듈이 오래된 데이터 페이지를 골라 캐시에서 내립니다. 내릴 페이지가 더티 페이지라면 리컨실리에이션을 거쳐 디스크에 기록한 뒤 제거합니다. 이 경로 어느 한 곳이라도 막히면 전체 처리가 느려집니다.

WiredTiger 의 데이터 블록은 모두 가변 크기입니다. Oracle 이나 MySQL 은 블록 크기가 고정이지만 WiredTiger 는 상한만 두고 실제 크기는 고정하지 않습니다. 블록 크기가 고정이면 압축을 구현하기 어렵습니다. 8KB 페이지를 압축한 결과 크기는 내용에 따라 달라지는데, 그 가변적인 결과물을 다시 고정 크기 블록에 밀어 넣으면 압축 효율이 떨어집니다. 가변 크기 블록을 쓰는 WiredTiger 에서는 압축을 훨씬 적극적으로 쓰고, 압축된 데이터를 들어갈 만한 빈 공간에 배치하는 일은 블록 매니저가 맡습니다. 블록 매니저는 변경된 블록을 기록할 때 프래그멘테이션을 줄이면서 크기에 맞는 위치를 찾아 저장합니다.

## 공유 캐시

WiredTiger 는 자체 공유 캐시를 씁니다. OS 페이지 캐시에 의존했던 MMAPv1 은 MongoDB 4.2 에서 제거되었고, 지금 `mongod` 가 지정할 수 있는 엔진은 WiredTiger 와 In-Memory 둘뿐입니다. 공유 캐시를 어떻게 잡느냐가 MongoDB 처리 성능을 크게 좌우하기 때문에, 처리가 원활하지 않을 때 가장 먼저 보는 그래프도 공유 캐시 사용량입니다.

기본 캐시 크기는 다음 둘 중 큰 값입니다.

- (RAM − 1GB) 의 50%
- 0.256GB

RAM 이 4GB 인 장비라면 `0.5 * (4GB - 1GB) = 1.5GB` 를 캐시로 잡습니다. RAM 이 1.25GB 라면 산식 결과가 0.125GB 로 0.256GB 보다 작으므로 0.256GB 를 씁니다. 직접 지정할 때는 `--wiredTigerCacheSizeGB` 또는 `storage.wiredTiger.engineConfig.cacheSizeGB` 를 쓰고, 값은 0.256GB~10000GB 범위 안에 두어야 합니다. 이 값은 한 장비에 `mongod` 인스턴스가 하나라는 가정에서 나온 기본값이므로, 한 장비에 여러 인스턴스를 올리면 그만큼 낮춰야 합니다.

공유 캐시는 디스크의 인덱스와 데이터 파일을 메모리에 담아 쿼리를 빠르게 처리하는 역할만 하지 않습니다. 변경을 모아 한 번에 디스크로 내리는 쓰기 배치 역할도 같이 합니다.

> **NOTE** — 컨테이너에서 `mongod` 를 돌릴 때는 호스트 RAM 전체가 아니라 컨테이너에 할당된 메모리를 기준으로 `cacheSizeGB` 를 직접 낮춰야 합니다. WiredTiger 가 컨테이너의 메모리 제한을 항상 인식하지는 못합니다. WiredTiger 가 상한으로 인식한 값은 `hostInfo` 명령의 `system.memLimitMB` 로 확인합니다.

캐시 크기는 서버를 재시작하지 않고도 바꿀 수 있습니다.

```javascript
db.adminCommand({
  "setParameter": 1,
  "wiredTigerEngineRuntimeConfig": "cache_size=25G"
})
```

> **WARNING** — `wiredTigerEngineRuntimeConfig` 는 WiredTiger 와 MongoDB 양쪽에 영향이 큽니다. MongoDB 문서는 MongoDB 엔지니어의 안내 없이는 이 값을 바꾸지 말라고 적습니다. 평상시 캐시 크기 조정은 `cacheSizeGB` 쪽을 씁니다.

일반적인 RDBMS 는 디스크의 데이터 페이지 이미지를 그대로 캐시에 올립니다. 그래서 캐시에 올라온 B-Tree 노드에서 자식 노드를 찾아갈 때도 디스크상의 주소를 쓰고, 그 주소를 실제 메모리 주소로 바꾸려면 별도의 매핑 테이블(해시맵)을 계속 참조해야 합니다. WiredTiger 는 데이터 페이지를 공유 캐시에 올릴 때 메모리에 맞는 트리 형태로 재구성합니다. 그래서 매핑 없이 메모리 주소(C/C++ 포인터)로 바로 따라갈 수 있고, 매핑 테이블에서 생기는 경합과 오버헤드가 없습니다.

일반적인 RDBMS 는 데이터 페이지 하나 안에 담긴 레코드들의 인덱스를 따로 관리합니다. 페이지 전체를 훑지 않고 필요한 레코드만 꺼내기 위한 구조입니다. WiredTiger 는 이 레코드 인덱스를 디스크에 두지 않고, 페이지를 공유 캐시에 올리는 시점에 새로 만들어 메모리에 둡니다. 그래서 디스크에서 메모리로 올리는 과정은 RDBMS 보다 느리지만, 캐시에 올라온 뒤 레코드를 찾고 바꾸는 작업은 더 빠릅니다.

## Hazard Pointer

WiredTiger 가 페이지를 캐시에 올리고, 다 쓴 뒤 캐시에서 내리는 판단에 Hazard Pointer 를 씁니다.

Lock-Free 알고리즘을 보다 보면 [ABA problem](https://en.wikipedia.org/wiki/ABA_problem) 을 만나게 되는데, 이를 푸는 효과적인 방법 중 하나가 Hazard Pointer 입니다. 어떤 스레드가 안전하게 접근하려는 메모리 블록이 있으면 그것을 Hazard Pointer 리스트에 등록하고 사용합니다. 사용이 끝나면 리스트에서 지웁니다. 반대로 어떤 스레드가 더 이상 쓰이지 않는 메모리 블록을 해제하려 할 때는 먼저 Hazard Pointer 리스트를 검색합니다. 리스트에 없으면 삭제하고, 발견되면 자기 Retire List 에 담아 두기만 하고 실제로는 삭제하지 않습니다. 나중에 다시 해제할 기회가 오면 Retire List 에 쌓인 것들을 다시 Hazard Pointer 리스트와 대조해 삭제합니다.

WiredTiger 에서 "사용자 스레드"는 쿼리를 처리하려고 캐시를 참조하는 스레드이고, "이빅션 스레드(Eviction Thread)"는 새 데이터 페이지가 들어올 자리를 만드는 스레드입니다. 사용자 스레드는 캐시의 데이터 페이지를 참조하기 전에 자기가 참조할 페이지를 Hazard Pointer 에 등록합니다. 이빅션 스레드는 내려도 될 만한 페이지(자주 쓰이지 않는 페이지)를 골라 놓고 Hazard Pointer 에 등록되어 있는지 먼저 확인합니다. 등록된 페이지는 건너뛰고, 등록되지 않은 페이지만 캐시에서 내립니다.

Hazard Pointer 배열이 얼마나 길어졌는지는 WiredTiger 통계의 `cache: hazard pointer maximum array length` 로 관찰합니다. 페이지 이빅션이 Hazard Pointer 때문에 막힌 횟수도 `cache: hazard pointer blocked page eviction` 통계로 나옵니다. 배열 길이를 사용자가 직접 지정하는 옵션은 현재 WiredTiger 설정 레퍼런스에 없습니다.

## Skip-List

WiredTiger 가 Lock-Free 를 구현하는 또 다른 축이 스킵 리스트입니다. 스킵 리스트는 RDBMS 의 Undo 에 해당하는 역할도 맡습니다. 다른 점은 데이터 페이지의 레코드를 직접 고치지 않고 변경된 데이터를 스킵 리스트에 추가한다는 것입니다. 쿼리가 데이터를 읽을 때는 변경 이력이 담긴 스킵 리스트를 검색해 원하는 시점의 값을 가져갑니다. 변경 내용을 페이지에 덮어쓰지 않고 별도 리스트로 관리하는 이유는 쓰기를 빠르게 끝내기 위함입니다. 리스트에 추가하는 작업은 짧게 끝나므로 응답 시간도 짧아집니다. 이 구조 덕분에 여러 스레드가 같은 데이터 페이지를 동시에 읽고 쓸 수 있고, 동시 처리 성능이 올라갑니다.

## 캐시 이빅션(Cache Eviction)

공유 캐시는 새 데이터 페이지가 들어올 빈 공간을 늘 어느 정도 유지해야 합니다. 그 일을 하는 모듈이 이빅션 모듈이고, "이빅션 서버(Eviction Server)"라고도 부릅니다. 이빅션 서버는 백그라운드 스레드로 돌면서 캐시에 올라온 페이지 중 자주 쓰이지 않는 것부터 내립니다. 이 과정에서 캐시 스캔이 자주 일어나고, B-Tree 의 브랜치 노드는 접근 빈도와 무관하게 캐시에 남겨 두려는 경향이 있습니다. 예전에는 SSD 를 써도 이빅션이 읽기 속도를 따라가지 못해 캐시가 가득 차는 일이 있었습니다. 버전이 올라가면서 나아졌고, MongoDB 는 현재 저장 매체로 SSD 를 권장합니다.

## Checkpoint

체크포인트는 모든 데이터베이스에 있는 개념으로, 데이터 파일과 트랜잭션 로그가 동기화되는 시점을 가리킵니다. MongoDB 는 스냅샷 데이터를 60초 간격으로 디스크에 기록하도록 WiredTiger 를 설정합니다. 이 간격은 `storage.syncPeriodSecs` 로 노출되고 기본값이 60 입니다. 새 체크포인트를 쓰는 동안에도 직전 체크포인트는 계속 유효합니다. 그래서 기록 중에 `mongod` 가 죽거나 오류를 만나도 재시작 후 마지막 유효 체크포인트에서 복구할 수 있습니다. 사용자 요청을 빠르게 처리하면서 커밋된 트랜잭션의 영속성을 지키려고 트랜잭션 로그(WAL, 저널 로그)를 먼저 기록하고, 데이터 파일 기록은 트랜잭션과 무관하게 뒤로 미룹니다.

> **WARNING** — MongoDB 문서는 운영 시스템에서 `storage.syncPeriodSecs` 를 건드리지 말라고 적습니다. 이 값은 저널링 자체에는 영향을 주지 않지만 `0` 으로 두면 저널이 디스크를 다 채웁니다.

체크포인트는 서버가 크래시되거나 재구동될 때 복구를 어디서 시작할지 정하는 기준입니다. 간격이 길면 복구 시간이 길어지고, 너무 짧으면 쿼리 처리 성능이 떨어집니다. Oracle 이나 MySQL InnoDB 가 Fuzzy 방식을 쓰는 것과 달리 WiredTiger 는 Sharp 체크포인트 방식을 씁니다. 평상시에는 디스크 쓰기가 없고, 체크포인트가 도는 시점에 더티 페이지를 한 번에 모아 기록합니다.

WiredTiger 의 체크포인트는 기존 B-Tree 구조를 덮어쓰지 않습니다. 새 leaf 페이지가 생기면 새 공간을 할당받고, 새 브랜치 노드가 구성되면 root 노드를 지우지 않은 채 기존 leaf 부터 새로 만든 leaf 까지 바라보는 B-Tree 를 새로 만듭니다. 쓰이지 않는 leaf 는 그 과정에서 빠집니다. 새 구조가 완성되면 기존 B-Tree 를 지우고 쓰던 공간을 반납합니다.

## MVCC

WiredTiger 는 read-uncommitted, read-committed, snapshot 세 가지 격리 모델을 제공하고 snapshot 을 기본값으로 씁니다. 모든 갱신은 snapshot 격리로 수행해야 합니다. snapshot 격리에서 트랜잭션은 자기가 시작하기 전에 커밋된 버전을 읽으므로 더티 리드와 반복 불가능한 읽기는 생기지 않지만, 팬텀은 생길 수 있습니다. 갱신 대상이 겹치지 않는 두 트랜잭션이 서로가 바꾼 데이터를 시작 이전 상태로 읽고 둘 다 커밋하는 경우도 있는데, 이것을 write skew 라고 부릅니다. 즉 snapshot 은 강한 보장이지만 직렬 실행과 동등하지는 않습니다. 동등한 보장은 serializable 격리입니다.

MongoDB 는 여러 연산과 컬렉션, 데이터베이스, 도큐먼트, 샤드에 걸친 ACID 트랜잭션을 지원합니다. MongoDB 8.0 부터는 capped 컬렉션에도 `"snapshot"` read concern 을 쓸 수 있습니다.

## 데이터 블록(페이지)

WiredTiger 는 고정 크기 블록을 쓰지 않습니다. 다만 페이지 하나가 지나치게 커지는 것을 막으려고 최대 크기는 제한합니다. B-Tree 의 브랜치 노드와 leaf 노드에 서로 다른 페이지 크기를 줄 수 있고, 컬렉션별·인덱스별로도 다르게 줄 수 있습니다. 컬렉션마다 세밀하게 손대면 관리가 어려워지고 운영 비용이 올라갑니다. 분석이나 대량 Insert 가 많으면 페이지를 크게, 소규모 데이터에 랜덤 액세스와 Update 가 잦으면 페이지를 작게 두는 편이 유리합니다.

## 운영체제 캐시(페이지 캐시)

WiredTiger 는 파일을 OS 페이지 캐시를 거쳐 읽습니다. 참조하려는 데이터 페이지가 리눅스 페이지 캐시에 있으면 그것을 다시 자기 공유 캐시로 복사하는 셈입니다. 같은 데이터가 OS 페이지 캐시와 WiredTiger 공유 캐시에 모두 있는 상태를 더블 버퍼링이라고 부르고, RDBMS 는 보통 Direct IO 로 이를 피합니다. 현재 WiredTiger 설정 레퍼런스에는 Direct IO 를 켜는 옵션이 없습니다.

그래서 MongoDB 에서는 페이지 캐시를 전제로 메모리를 나누는 편이 현실적입니다. WiredTiger 내부 캐시를 기본값 위로 올리지 말라는 권고도 여기서 나옵니다. 내부 캐시가 RAM 을 다 차지하지 않게 두면 남은 메모리가 파일시스템 캐시로 쓰이고, 압축된 상태의 데이터 파일이 그쪽에 남아 있게 됩니다.

## 압축

WiredTiger 의 큰 장점 중 하나가 압축입니다. RDBMS 와 비교하면 세 가지 차이가 있습니다.

- **가변 크기 페이지 사용:** 페이지가 가변 크기이므로 압축 결과를 그대로 디스크에 기록합니다. 고정 크기 블록에 맞추려고 페이지를 쪼개 여러 번 압축할 필요가 없습니다.
- **입출력 레이어에서의 압축:** 블록 매니저가 디스크 페이지를 읽어 공유 캐시에 올릴 때는 압축을 푼 상태로 올리고, 공유 캐시에서 디스크로 내려가는 페이지만 압축해 저장합니다.
- **여러 압축 알고리즘 지원:** 컬렉션 블록 압축은 `none`·`snappy`·`zlib`·`zstd` 중에서 고릅니다.

컬렉션 블록 압축의 기본값은 `snappy` 이고, 시계열(time series) 컬렉션만 기본값이 `zstd` 입니다. `zstd` 를 쓸 때는 `zstdCompressionLevel` 로 1~22 단계를 지정하며 기본값은 6 입니다. 이 설정은 MongoDB 5.0 부터 쓸 수 있습니다. 압축률이 높을수록 공간은 아끼지만 압축·해제 비용이 성능에 반영됩니다.

`storage.wiredTiger.collectionConfig.blockCompressor` 를 바꾸면 그 뒤에 만들어지는 컬렉션에만 적용됩니다. 이미 있는 컬렉션은 만들어질 때의 압축기를 계속 씁니다. 컬렉션과 인덱스를 만들 때 개별로 지정할 수도 있습니다.

저널은 기본적으로 snappy 로 압축하고 `storage.wiredTiger.engineConfig.journalCompressor` 로 바꿉니다. 로그 레코드가 WiredTiger 의 최소 로그 레코드 크기인 128바이트 이하면 압축하지 않습니다.

인덱스는 모두 Prefix 압축을 기본으로 씁니다. `storage.wiredTiger.indexConfig.prefixCompression` 의 기본값이 `true` 이고, 이 값을 바꾸면 그 뒤에 만들어지는 인덱스에만 적용됩니다. Prefix 압축은 인덱스 키에서 왼쪽의 중복 구간을 생략하는 방식입니다. 블록 압축과 달리 공유 캐시에 올라간 뒤에도 압축 상태를 유지합니다. 그래서 읽을 때마다 완전한 키를 얻으려고 조립 과정을 거치는데, 페이지 첫 번째 키부터 되짚어 조립해야 하면 효율이 떨어집니다. 압축률이 좋을수록 인덱스 읽기가 느려질 수 있고, 인덱스를 역순으로 읽을 때 더 두드러집니다.

## 암호화

저장 데이터 암호화(Encryption at Rest)는 MongoDB Enterprise 의 WiredTiger 에서 제공합니다. Community Edition 에는 포함되지 않습니다.

## 그 밖의 MongoDB 스토리지 엔진

`storage.engine` 에 지정할 수 있는 값은 `wiredTiger` 와 `inMemory` 둘입니다.

- **In-Memory**: MongoDB Enterprise 에 포함되고 Community Edition 에는 없습니다. 메타데이터와 진단 데이터, 큰 인덱스를 만들 때 쓰는 임시 파일 말고는 디스크에 쓰지 않아서 데이터베이스 작업의 지연이 더 일정합니다. 데이터와 인덱스, 레플리카 셋일 때의 oplog 와 메타데이터까지 모두 `storage.inMemory.engineConfig.inMemorySizeGB` 안에 들어가야 하고, 기본값은 물리 RAM 의 50% 에서 1GB 를 뺀 값입니다. 별도의 저널이 없으므로 `j: true` 쓰기는 즉시 승인됩니다. 프로세스가 내려가면 데이터는 남지 않습니다.
- **MMAPv1**: MongoDB 처음 나왔을 때 쓰던 엔진입니다. 3.0 에서 WiredTiger 가 기본이 되었고, MongoDB 4.2 에서 지원이 제거되었습니다. `storage.mmapv1.*` 설정과 `--nssize`·`--smallfiles`·`--noprealloc` 같은 명령행 옵션, `storage.repairPath` 도 함께 제거되었습니다.
- **RocksDB·TokuDB**: 한때 플러그형 스토리지 API 위에 올리던 서드파티 엔진입니다. MongoDB 공식 문서가 다루는 엔진 목록에는 들어 있지 않습니다.

### 스토리지 엔진 혼합 사용

하나의 MongoDB 인스턴스에서 두 엔진을 동시에 쓸 수는 없습니다. `storage.engine` 에 지정한 엔진과 다른 엔진이 만든 데이터 파일이 `dbPath` 에 있으면 `mongod` 는 기동을 거부합니다.

반면 레플리카 셋 멤버끼리 다른 엔진을 쓰는 구성은 가능합니다. 프라이머리를 In-Memory 로 올려 지연을 낮추고 세컨더리를 디스크 기반 WiredTiger 로 두면, 프라이머리가 내려가도 데이터를 들고 있는 멤버가 남습니다. 단 투표권이 있는 멤버 중 하나라도 In-Memory 를 쓰면 `writeConcernMajorityJournalDefault` 를 `false` 로 두어야 합니다. 근래에는 SSD 성능이 좋아져서 SSD 기반 WiredTiger 구성을 그대로 쓰는 경우가 많습니다.

## MongoDB 8.0 에서 달라진 것

- `serverStatus` 의 `wiredTiger.concurrentTransactions` 가 `queues.execution` 으로 이름이 바뀌었습니다. 티켓 사용량을 보던 대시보드는 필드 경로를 고쳐야 합니다.
- TCMalloc 이 스레드별 캐시 대신 CPU별 캐시를 쓰는 버전으로 올라갔습니다. 메모리 단편화를 줄이려는 변경이고, Transparent Huge Pages 에 대한 기존 운영 권고도 함께 달라졌습니다. `tcmallocEnableBackgroundThread` 는 기본으로 켜져 있어서 주기적으로 메모리를 OS 에 돌려줍니다.
- `autoCompact` 명령이 추가되어 백그라운드 압축을 걸 수 있습니다. 컬렉션과 인덱스의 빈 공간을 `freeSpaceTargetMB` 아래로 유지하려고 시도합니다.
- 같은 컬렉션에 `compact` 를 동시에 여러 개 실행하면 오류를 돌려줍니다. `compact` 에 `dryRun` 을 주면 회수 가능한 공간만 추정해 돌려주고 실제 압축은 하지 않습니다.
- `Bulk.insert()` 와 데이터 적재 워크로드의 처리량은 나아졌지만, 그 직후에 서버를 내리면 디스크로 내릴 데이터가 더 많아 종료가 길어질 수 있습니다.
- 스토리지 엔진 동시 트랜잭션 티켓 수는 7.0 부터 서버가 동적으로 조절하며, 상한은 읽기 128개와 쓰기 128개입니다. `storageEngineConcurrentReadTransactions`·`storageEngineConcurrentWriteTransactions` 로 동적 상한의 한계를 지정할 수 있습니다.

## 참고 자료

도서: 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual — WiredTiger Storage Engine: <https://www.mongodb.com/docs/manual/core/wiredtiger/>

MongoDB Manual — Journaling: <https://www.mongodb.com/docs/manual/core/journaling/>

WiredTiger 개발자 문서: <https://source.wiredtiger.com/>
