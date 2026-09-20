---
date: 2021-03-24 01:55:34 +0900
title: "MongoDB Index #.1 Architecture"
category: mongodb
excerpt: "인덱스는 키와 레코드 위치를 정렬된 상태로 보관해 검색을 빠르게 만드는 자료구조이며, 이 글은 MongoDB가 제공하는 인덱스 종류와 그 내부 구조를 정리합니다."
last_modified_at: 2026-09-20
---

## Index란?

DBMS에서 인덱스는 컬럼과 레코드 저장 위치를 key-value 형태로 관리하는 자료구조입니다. 검색 속도를 향상시키기 위해 존재하며, 프로그래밍 언어의 SortedList와 동일한 구조를 갖습니다. SortedList가 값을 정렬된 상태로 유지하는 것처럼, 인덱스는 키를 정렬된 형태로 저장해 빠른 검색을 지원합니다. 반면 데이터 파일 자체는 ArrayList처럼 저장 순서를 유지하는 구조입니다.

인덱스는 새 데이터가 추가될 때마다 정렬된 자리를 찾아 넣어야 하므로 쓰기가 느려지지만, 이미 정렬된 구조를 읽기 때문에 조회는 빠릅니다. MongoDB의 `find()` 는 인덱스가 있는지에 따라 실행 계획이 달라집니다. 쓰기가 빈번한 컬렉션에서는 인덱스가 많을수록 쓰기 성능이 떨어지고, 읽기가 주를 이루는 컬렉션에서는 인덱스로 조회 성능을 확보할 수 있습니다.

> **NOTE** — 인덱스 생성이 언제나 성능을 높이는 것은 아닙니다. 인덱스 없이도 충분히 연산 속도가 보장된다면 굳이 인덱스를 생성하지 않아도 괜찮습니다. 사용되지 않는 인덱스를 많이 생성하는 것은 자원 낭비로 이어집니다.

## MongoDB의 인덱스

### B-tree 구조

MongoDB의 기본 인덱스는 B-tree 인덱스입니다. MongoDB 공식 문서는 이 구조를 "B-tree data structure"라고 명시하며, 최상단 루트 노드, 중간 브랜치 노드, 최하단 리프 노드로 구성됩니다.

공식 문서가 서술하는 B-tree 인덱스의 특징은 두 가지입니다. 인덱스 엔트리가 필드 값 순서로 저장되어 정확한 조회와 레인지 쿼리를 모두 지원하고, 같은 정렬 순서를 그대로 써서 정렬된 결과를 인덱스에서 바로 만들 수 있습니다.

MongoDB는 `_id` 외의 필드에도 세컨더리 인덱스를 만들 수 있고, 필드 여러 개로 구성한 복합 인덱스도 지원합니다. 다만 공식 문서는 쓰기가 읽기보다 많은 컬렉션에서 인덱스가 비싸다고 적습니다. insert 한 번마다 해당 컬렉션의 모든 인덱스를 함께 갱신해야 하기 때문입니다.

또한 MongoDB는 Schema-Free 데이터베이스라고 알려져 있지만, 인덱스는 내부적으로 별도의 스키마를 갖습니다. 각 인덱스는 자신의 타입과 구성 필드를 메타 정보로 유지합니다.

### Clustered Collection

MongoDB 5.3부터는 clustered collection이 도입되었습니다. clustered collection은 도큐먼트와 인덱스를 하나의 WiredTiger 파일에 `_id` 순서로 함께 저장합니다. 이는 일반 컬렉션의 non-clustered 방식과 다릅니다.

```javascript
db.createCollection(
  "products",
  { clusteredIndex: { "key": { _id: 1 }, "unique": true, "name": "products clustered key" } }
)
```

공식 문서는 I/O 이득을 이렇게 설명합니다. non-clustered 컬렉션은 `_id` 인덱스를 도큐먼트와 따로 저장하므로 insert·update·delete 당 2번의 쓰기와 쿼리당 2번의 읽기가 필요하지만, clustered 컬렉션은 각각 1번씩으로 줄어듭니다. `expireAfterSeconds` 를 지정하면 clustered index 가 TTL 인덱스 역할까지 맡아 별도의 TTL 인덱스를 두지 않아도 됩니다. 이때 `_id` 는 날짜 타입이어야 합니다.

다만 제약이 있습니다. 키는 반드시 `{ _id: 1 }`이어야 하고, 도큐먼트가 한 가지 순서로만 저장되므로 컬렉션당 하나만 만들 수 있습니다. 생성은 컬렉션을 만들 때만 가능하고, 기존 non-clustered 컬렉션을 clustered 로 바꾸거나 그 반대로 되돌리는 변환은 없습니다. 옮기려면 `$out`·`$merge` 파이프라인이나 `mongodump`·`mongorestore` 로 다른 컬렉션에 다시 써야 합니다. clustered index 는 숨길 수 없고, clustered collection 은 capped collection 이 될 수 없습니다.

키 값은 순차적으로 증가하는 값이 insert 성능에 유리하고, 무작위로 생성한 키 값은 성능을 떨어뜨릴 수 있습니다. 키 크기는 최대 8MB까지 허용되지만 공식 문서는 가능한 한 작게 유지하라고 권고합니다. 키가 커지면 컬렉션과 세컨더리 인덱스의 저장 크기가 함께 늘어납니다.

> **NOTE** — MongoDB 6.0.7부터 쿼리 플래너가 clustered index 와 세컨더리 인덱스를 함께 비교해 계획을 고릅니다. 그 이전 버전에서는 사용 가능한 세컨더리 인덱스가 있으면 그쪽이 선택되어, clustered index 를 쓰려면 `hint()` 를 줘야 했습니다.

### 인덱스 타입과 속성

MongoDB는 8가지 인덱스 타입을 제공합니다. Single Field, Compound, Multikey, Wildcard, Geospatial(2d/2dsphere), Hashed, Text, Clustered가 그것입니다. 시리즈 후속편에서 다룰 내용은 Single Field와 Compound(#2), Hashed(#3), Multikey(#4), Text(#5), Geospatial(#7)입니다. #6에서 다룰 TTL은 인덱스 타입이 아니라 인덱스 속성입니다.

인덱스 속성(property)은 Case-Insensitive, Hidden, Partial, Sparse, TTL, Unique 여섯 가지입니다. 인덱스를 만들 때 선택적으로 붙이는 값이지만, 공식 문서는 모든 타입이 모든 속성과 호환되지는 않는다고 적습니다. 또한 Partial 인덱스가 Sparse 인덱스 기능의 상위 집합을 제공하므로 Sparse 보다 Partial 을 쓰라고 권합니다.

Wildcard 인덱스는 인덱스를 걸 필드 이름을 미리 알 수 없을 때 씁니다. 키에 와일드카드 지정자 `$**` 를 넣어 만들고, `wildcardProjection` 으로 포함할 필드와 제외할 필드를 지정합니다. `_id` 는 기본적으로 인덱스에서 빠지며, 해당 필드를 가진 도큐먼트만 담는 sparse 인덱스로 동작합니다. 공식 문서는 필드 이름을 알 수 없거나 바뀔 때만 쓰라고 못박습니다. 특정 필드를 겨냥한 인덱스만큼 성능이 나오지 않기 때문입니다.

```javascript
db.collection.createIndex(
  { "email": 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true } } }
)
```

공식 문서가 제한으로 명시하는 숫자는 두 개입니다. 컬렉션 하나는 64개를 넘는 인덱스를 가질 수 없고, 복합 인덱스에는 32개를 넘는 필드를 넣을 수 없습니다. 인덱스 이름은 생성 후 바꿀 수 없으므로, 이름을 고치려면 인덱스를 지우고 다시 만들어야 합니다.

## WiredTiger 스토리지 엔진의 인덱스

WiredTiger는 인덱스 압축으로 prefix compression을 기본으로 사용합니다. 인덱스 프리픽스 압축은 인덱싱된 필드에서 공통 프리픽스를 중복 제거해 RAM 사용량을 줄입니다. WiredTiger 내부 캐시에서 인덱스는 온디스크 표현과 다르지만 여전히 프리픽스 압축 혜택을 받아 RAM 사용량을 낮춥니다.

저장 방식은 인덱스 크기 보고에도 드러납니다. 세컨더리 인덱스 없이 `_id` 인덱스만 있는 clustered collection은 인덱스 파일을 따로 두지 않으므로 인덱스 크기가 0으로 표시됩니다. 반대로 clustered collection에 세컨더리 인덱스를 얹으면, 클러스터드 인덱스 키가 큰 만큼 세컨더리 인덱스의 저장 크기도 non-clustered 컬렉션보다 커질 수 있습니다.

### Local Index

샤딩된 MongoDB 클러스터에서는 각 샤드가 자신이 저장하고 있는 도큐먼트에 대해서만 인덱스를 관리합니다. 따라서 유니크 인덱스는 샤드 키를 prefix로 포함하거나, 응용 프로그램 수준에서 유니크함을 보장해야 합니다. 샤드 키로 `_id`를 사용하지 않는다면 애플리케이션이 `_id` 유일성을 보장해야 합니다.

샤드 간 데이터 분포는 밸런서(Balancer)가 백그라운드에서 조정합니다. 인덱스가 많으면 chunk migration 때 인덱스 갱신 비용이 함께 듭니다.

## 인덱스 사용 시 고려사항

### 메모리와 커버링 쿼리

인덱스를 메모리에 적재할 수 있을 정도로 메모리 크기가 충분한지 확인해야 합니다. 또한 인덱스를 설정한 데이터만으로 쿼리가 가능한지 검토해야 합니다.

쿼리가 조건으로 쓰는 필드와 반환하는 필드가 모두 인덱스에 들어 있으면, MongoDB는 도큐먼트를 읽지 않고 인덱스 스캔만으로 결과를 만듭니다. 이런 쿼리를 covered query라고 부릅니다.

```javascript
db.movies.createIndex({ rated: 1, title: 1 })

db.movies.find(
  { rated: "PG", title: /^T/ },
  { title: 1, _id: 0 }
).limit(3)
```

위 예시에서 `_id: 0`을 명시해야 커버링 쿼리가 됩니다. `_id` 필드는 인덱스에 포함되지 않았기 때문입니다. covered query는 인덱스 스캔만으로 쿼리를 완료하므로 도큐먼트를 읽는 `FETCH` 단계가 필요 없습니다. `explain()` 결과에서 `IXSCAN` 단계가 `FETCH`의 하위에 없으면 커버링 쿼리입니다.

반대로 인덱스에 없는 필드를 함께 반환해야 한다면 `FETCH` 단계가 붙습니다. 이때는 인덱스가 걸러낸 도큐먼트 수만큼 도큐먼트를 다시 읽어야 하므로, 캐시에 없는 도큐먼트가 많을수록 디스크 읽기가 늘어납니다.

### ESR 가이드라인

복합 인덱스의 키를 어떤 순서로 놓을지 정할 때 ESR(Equality, Sort, Range) 가이드라인을 참고할 수 있습니다. 쿼리를 실행하는 순서가 아니라 인덱스 키를 배치하는 순서에 대한 지침이며, 규칙이 아니라 가이드라인입니다. 공식 문서는 "대부분의 경우 ESR 순서로 인덱스 키를 배치하면 더 효율적인 복합 인덱스를 만든다"고 설명합니다.

Equality 조건은 항상 먼저 배치합니다. Equality 키가 여러 개면 그들끼리의 순서는 자유롭지만, 모든 Equality 키가 Sort·Range 키보다 앞에 와야 합니다. 그 다음 순서는 상황에 따라 달라집니다. 인메모리 정렬을 피하는 것이 중요하다면 Sort 필드를 Range 필드보다 앞에 둡니다(ESR). 만약 Range 조건이 매우 선택적이라면 Range 필드를 Sort 필드 앞에 두어 정렬해야 할 문서 수를 줄일 수도 있습니다(ERS).

```javascript
db.movies.find(
  { directors: "David Lynch", runtime: { $lt: 130 } }
).sort({ year: 1 })
// directors = Equality, year = Sort, runtime = Range
// 최적 인덱스: { directors: 1, year: 1, runtime: 1 }
```

주의할 점이 있습니다. `$ne`나 `$nin` 같은 부정 연산자는 Range 연산자입니다. `$regex`도 Range 연산자입니다. `$in`은 단독으로 쓰면 Equality 연산자로 동작하지만, `.sort()`와 함께 쓰고 배열 원소가 201개 이상이면 Range 연산자처럼 정렬됩니다. 공식 문서는 이 201개 경계가 모든 MongoDB 버전에서 유지된다고 보장하지 않는다고 덧붙입니다.

### 인덱스 빌드와 관리

MongoDB는 optimized build process라는 한 가지 인덱스 빌드 방식을 사용합니다. 빌드 시작과 종료 시점에만 컬렉션에 배타 잠금(exclusive lock)을 걸고, 그 사이에는 잠금을 주기적으로 양보해 읽기·쓰기 작업을 인터리빙합니다. 예전처럼 foreground와 background를 고르지 않으며, `createIndexes`나 셸 헬퍼에 `background` 옵션을 넘겨도 MongoDB는 이 옵션을 무시합니다.

레플리카 세트와 샤드 클러스터에서는 데이터를 가진 모든 멤버가 동시에 인덱스를 빌드합니다. 프라이머리는 커밋 쿼럼(commit quorum)을 채울 만큼의 투표 멤버가 빌드를 마친 뒤에 인덱스를 사용 가능 상태로 표시합니다. 기본값은 `"votingMembers"`, 즉 데이터를 가진 모든 투표 멤버입니다. 그래서 투표 노드 하나가 응답하지 않으면 그 노드가 돌아올 때까지 빌드가 멈춰 있을 수 있습니다. 진행 중인 빌드의 쿼럼은 `setIndexCommitQuorum` 커맨드로 조정합니다.

MongoDB 8.0에서는 커밋 쿼럼과 write concern의 역할이 갈라졌습니다. 커밋 쿼럼은 프라이머리가 커밋하기 전에 몇 개 노드가 빌드를 끝낼 준비를 해야 하는지를 정하고, write concern은 프라이머리가 커밋한 뒤 몇 개 노드가 그 oplog 항목을 복제해야 커맨드가 성공으로 돌아오는지를 정합니다. 이전 릴리스에서는 프라이머리가 커밋한 다음 write concern이 몇 개 노드가 빌드를 끝내야 하는지를 뜻했습니다.

멤버를 한 대씩 standalone으로 떼어 빌드하는 롤링 인덱스 빌드도 있습니다. 세컨더리부터 한 번에 한 멤버씩 처리하고 최소 한 번의 레플리카 세트 선거를 필요로 합니다. 절차 자체가 클러스터의 이중화를 낮추므로 공식 문서는 요구 조건을 충족할 때만 쓰라고 하며, 롤링 빌드와 복제 빌드를 동시에 돌리면 빌드가 깨지거나 크래시 루프에 빠질 수 있다고 경고합니다.

빌드는 메모리 예산도 씁니다. `createIndexes` 커맨드 하나에 기본 200MB 한도가 걸리고 그 커맨드로 만드는 인덱스들이 이 예산을 나눠 쓰며, 동시 빌드 허용치(`maxNumActiveUserIndexBuilds`)의 기본값이 3이므로 전체 사용량은 한도의 3배까지 올라갈 수 있습니다.

인덱스는 `mongosh`에서 `db.collection.createIndex()` 또는 `db.collection.createIndexes()`로 생성합니다.

```javascript
db.orders.createIndex({ customerId: 1, orderDate: -1 })

db.orders.createIndexes([
  { status: 1 },
  { productId: 1, quantity: 1 }
])
```

레거시 `mongo` 셸은 MongoDB 6.0에서 제거되었습니다. 현재는 `mongosh`만 존재하며, `mongosh`는 MongoDB 서버와 별도로 버전이 관리됩니다.

인덱스 사용 통계는 `$indexStats` aggregation stage로 확인할 수 있습니다. 각 노드별로 통계가 수집되므로, 클러스터 전체 통계를 원한다면 모든 노드에서 실행해야 합니다.

```javascript
db.orders.aggregate([ { $indexStats: { } } ])
```

인덱스 크기는 `db.collection.stats()`로 확인할 수 있습니다. 다만 그 헬퍼가 호출하는 `collStats` 커맨드는 MongoDB 6.2부터 deprecated이며, 공식 문서는 6.2 이상에서 `$collStats` aggregation stage를 쓰라고 안내합니다.

> **NOTE** — MongoDB 8.0부터 index filter는 deprecated입니다. 특정 쿼리 모양에 어떤 계획을 쓸지 옵티마이저에 알려주려면 `setQuerySettings` 커맨드로 등록하는 query settings를 사용합니다.

## MongoDB Search와 Vector Search

MongoDB는 전문 검색을 위한 MongoDB Search와 벡터 검색을 위한 MongoDB Vector Search를 제공합니다. 둘 다 컬렉션에 별도의 검색 인덱스를 정의하며, 지금까지 다룬 B-tree 인덱스와는 성격이 다릅니다.

전문 검색은 `$search`와 `$searchMeta` aggregation stage로 질의합니다. Atlas에서는 관리형으로 제공되고, 직접 운영하는 배포에서는 검색 프로세스인 `mongot`을 따로 띄워야 합니다. 직접 운영할 때 요구하는 서버 버전은 계속 올라가고 있어, 공식 호환성 문서는 현재 MongoDB Server 8.3.4 이상을 요구하고 8.0·8.2를 지원 대상에서 제외합니다. 도입하려면 그 문서의 버전 조합표를 먼저 확인해야 합니다.

Vector Search 인덱스는 기본적으로 HNSW(Hierarchical Navigable Small Worlds) 그래프 구조로 ANN(Approximate Nearest Neighbor) 검색을 수행하고, `indexingMethod`를 `flat`으로 두면 전수 검색을 합니다. 벡터 차원 수(`numDimensions`)는 8192 이하여야 합니다. 질의는 `$vectorSearch` aggregation stage로 하며, Atlas에서는 MongoDB 6.0.11·7.0.2 이상이 필요합니다. 직접 운영하는 배포는 Search와 같은 `mongot`을 쓰므로 버전 조건도 같이 적용됩니다.

## 참고 자료

도서: 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/)

[http://mongodb.citsoft.net/?p=663](http://mongodb.citsoft.net/?p=663)

[https://dzone.com/articles/effective-mongodb-indexing-part-1](https://dzone.com/articles/effective-mongodb-indexing-part-1)
