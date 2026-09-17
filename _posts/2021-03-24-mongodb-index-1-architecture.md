---
date: 2021-03-24 01:55:34 +0900
title: "MongoDB Index #.1 Architecture"
category: mongodb
excerpt: "DBMS에서 인덱스는 컬럼과 레코드 저장 위치를 key-value 형태로 관리하는 자료구조입니다. 검색 속도를 향상시키기 위해 존재하며, 프로그래밍 언어의 SortedList와 동일한 구조를 갖습니다. SortedList가 값을 정렬된 상태로 유지하는 것처럼, 인덱스는 키를 정렬된 형…"
updated: 2026-09-17
---

> **다시 씀 (2026-09)** — 2021년에 쓴 글을 2026년 9월 기준으로 새로 썼습니다. 버전·명령·인덱스 종류를 현재 MongoDB 문서에 맞췄습니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## Index란?

DBMS에서 인덱스는 컬럼과 레코드 저장 위치를 key-value 형태로 관리하는 자료구조입니다. 검색 속도를 향상시키기 위해 존재하며, 프로그래밍 언어의 SortedList와 동일한 구조를 갖습니다. SortedList가 값을 정렬된 상태로 유지하는 것처럼, 인덱스는 키를 정렬된 형태로 저장해 빠른 검색을 지원합니다. 반면 데이터 파일 자체는 ArrayList처럼 저장 순서를 유지하는 구조입니다.

인덱스는 새 데이터가 추가될 때마다 정렬 작업을 수행하므로 쓰기 작업이 느려지지만, 이미 정렬된 구조를 갖고 있기 때문에 읽기 작업에서는 매우 빠르게 동작합니다. MongoDB의 `find()` 작업은 인덱스의 존재 여부에 따라 성능이 크게 달라집니다. 쓰기가 빈번한 컬렉션에서는 인덱스가 많을수록 쓰기 성능이 저하될 수 있지만, 읽기가 주를 이루는 컬렉션에서는 인덱스 추가로 성능을 보장할 수 있습니다.

> **주의:** 인덱스 생성이 절대적으로 성능을 높이는 것은 아닙니다. 인덱스 없이도 충분히 연산 속도가 보장된다면 굳이 인덱스를 생성하지 않아도 괜찮습니다. 사용되지 않는 인덱스를 많이 생성하는 것은 자원 낭비로 이어집니다.

## MongoDB의 인덱스

### B-tree 구조

MongoDB의 기본 인덱스는 B-tree 인덱스입니다. MongoDB 공식 문서는 이 구조를 "B-tree data structure"라고 명시하며, 최상단 루트 노드, 중간 브랜치 노드, 최하단 리프 노드로 구성됩니다.

공식 문서가 서술하는 B-tree 인덱스의 특징은 다음과 같습니다. 첫째, 인덱스 엔트리가 정렬된 형태로 저장되어 정확한 조회와 레인지 쿼리를 모두 지원합니다. 둘째, 인덱스 키에 prefix compression이 기본으로 적용되어 공통 프리픽스를 중복 제거해 RAM 사용량을 낮춥니다.

MongoDB의 인덱스는 다른 NoSQL과 달리 세컨더리 인덱스를 지원하며, 복합 인덱스와 같은 유연한 특성을 갖습니다. 인덱스는 쓰기마다 갱신이 필요하므로 write-heavy 컬렉션에서는 비용이 큽니다.

또한 MongoDB는 Schema-Free 데이터베이스라고 알려져 있지만, 인덱스는 내부적으로 별도의 스키마를 갖습니다. 각 인덱스는 어떤 타입인지, 어떤 필드로 구성되어 있는지에 대한 메타 정보를 유지합니다.

### Clustered Collection

MongoDB 5.3부터는 clustered collection이 도입되었습니다. clustered collection은 도큐먼트와 인덱스를 하나의 WiredTiger 파일에 `_id` 순서로 함께 저장합니다. 이는 일반 컬렉션의 non-clustered 방식과 다릅니다.

```javascript
db.createCollection(
  "products",
  { clusteredIndex: { "key": { _id: 1 }, "unique": true, "name": "products clustered key" } }
)
```

clustered collection의 I/O 이득은 명확합니다. non-clustered 방식에서는 insert/update/delete 당 2번의 쓰기와 쿼리당 2번의 읽기가 필요하지만, clustered 방식에서는 각각 1번씩으로 줄어듭니다.

다만 제약이 있습니다. 키는 반드시 `{ _id: 1 }`이어야 하고, 컬렉션당 하나만 만들 수 있으며, 컬렉션 생성 시에만 지정 가능합니다. 기존 non-clustered 컬렉션을 clustered로 변환할 수 없고, 반대 방향 변환도 불가능합니다. 순차 증가 키를 권장하며, 랜덤한 키 값은 성능을 저하시킬 수 있습니다.

### 인덱스 타입과 속성

MongoDB는 8가지 인덱스 타입을 제공합니다. Single Field, Compound, Multikey, Wildcard, Geospatial(2d/2dsphere), Hashed, Text, Clustered가 그것입니다. 시리즈 후속편에서 다룰 내용은 Single Field와 Compound(#2), Hashed(#3), Multikey(#4), Text(#5), Geospatial(#7)입니다. #6에서 다룰 TTL은 인덱스 타입이 아니라 인덱스 속성입니다.

인덱스 속성(property)으로는 Unique, Partial, Sparse, TTL, Case-Insensitive, Hidden이 있습니다. 이들은 인덱스 타입과 독립적으로 지정 가능한 선택사항입니다. 공식 문서는 Partial 인덱스가 Sparse 인덱스의 상위 집합 기능을 제공한다며 Partial 사용을 권장합니다.

```javascript
db.collection.createIndex(
  { "email": 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true } } }
)
```

2026년 현재 MongoDB는 컬렉션당 최대 64개 인덱스를 지원하고, 복합 인덱스는 최대 32개 필드까지 포함할 수 있습니다. 과거 MongoDB 4.2 이전 버전에서 존재하던 인덱스 키 1024바이트 제한과 인덱스 이름 127바이트 제한은 MongoDB 4.2에서 Feature Compatibility Version(FCV) 4.2 이상일 때 제거되었습니다.

## WiredTiger 스토리지 엔진의 인덱스

WiredTiger는 인덱스 압축으로 prefix compression을 기본으로 사용합니다. 인덱스 프리픽스 압축은 인덱싱된 필드에서 공통 프리픽스를 중복 제거해 RAM 사용량을 줄입니다. WiredTiger 내부 캐시에서 인덱스는 온디스크 표현과 다르지만 여전히 프리픽스 압축 혜택을 받아 RAM 사용량을 낮춥니다.

MongoDB는 clustered collection과 non-clustered collection이라는 두 가지 저장 방식을 제공합니다. non-clustered 컬렉션에서는 `_id` 인덱스를 문서와 따로 저장하므로 쿼리당 2번의 읽기가 필요하지만, clustered 컬렉션은 문서와 인덱스를 하나의 WiredTiger 파일에 `_id` 순서로 함께 저장해 쿼리당 1번의 읽기로 줄입니다.

### Local Index

샤딩된 MongoDB 클러스터에서는 각 샤드가 자신이 저장하고 있는 도큐먼트에 대해서만 인덱스를 관리합니다. 따라서 유니크 인덱스는 샤드 키를 prefix로 포함하거나, 응용 프로그램 수준에서 유니크함을 보장해야 합니다. 샤드 키로 `_id`를 사용하지 않는다면 애플리케이션이 `_id` 유일성을 보장해야 합니다.

샤드 간 데이터를 균등하게 배치하기 위해 MongoDB는 밸런서(Balancer)가 백그라운드에서 데이터를 균등 분배합니다. 인덱스가 많으면 chunk migration 시 인덱스 갱신 비용이 함께 듭니다.

## 인덱스 사용 시 고려사항

### 메모리와 커버링 쿼리

인덱스를 메모리에 적재할 수 있을 정도로 메모리 크기가 충분한지 확인해야 합니다. 또한 인덱스를 설정한 데이터만으로 쿼리가 가능한지 검토해야 합니다.

연산 없이 하나의 도큐먼트에서 데이터를 모두 가져온다면, MongoDB는 불필요한 도큐먼트를 읽지 않으며 검색과 결과 출력이 동시에 이루어져 빠른 검색이 가능합니다. covered query라고 부르는 이 상황은 쿼리에서 사용하는 필드와 반환하는 필드 모두가 인덱스에 포함되어 있을 때 달성됩니다.

```javascript
db.movies.createIndex({ rated: 1, title: 1 })

db.movies.find(
  { rated: "PG", title: /^T/ },
  { title: 1, _id: 0 }
).limit(3)
```

위 예시에서 `_id: 0`을 명시해야 커버링 쿼리가 됩니다. `_id` 필드는 인덱스에 포함되지 않았기 때문입니다. covered query는 인덱스 스캔만으로 쿼리를 완료하므로 도큐먼트를 읽는 `FETCH` 단계가 필요 없습니다. `explain()` 결과에서 `IXSCAN` 단계가 `FETCH`의 하위에 없으면 커버링 쿼리입니다.

반면 인덱스 필드를 검색하면서 인덱스가 없는 다른 필드를 함께 조회해야 한다면, 각 데이터가 매번 메모리에 로드되므로 많은 메모리 액세스가 발생한다는 점을 유의해야 합니다.

### ESR 가이드라인

복합 인덱스를 설계할 때 ESR(Equality, Sort, Range) 가이드라인을 참고할 수 있습니다. 이것은 규칙이 아니라 가이드라인입니다. 공식 문서는 "대부분의 경우 ESR 순서로 인덱스 키를 배치하면 더 효율적인 복합 인덱스를 만든다"고 설명합니다.

Equality 조건을 항상 먼저 배치합니다. 그 다음 순서는 상황에 따라 달라집니다. 인메모리 정렬을 피하는 것이 중요하다면 Sort 필드를 Range 필드보다 앞에 둡니다(ESR). 만약 Range 조건이 매우 선택적이라면 Range 필드를 Sort 필드 앞에 두어 정렬해야 할 문서 수를 줄일 수도 있습니다(ERS).

```javascript
db.movies.find(
  { directors: "David Lynch", runtime: { $lt: 130 } }
).sort({ year: 1 })
// directors = Equality, year = Sort, runtime = Range
// 최적 인덱스: { directors: 1, year: 1, runtime: 1 }
```

주의할 점이 있습니다. `$ne`나 `$nin` 같은 부정 연산자는 Range 연산자입니다. `$regex`도 Range 연산자입니다. `$in`은 단독 사용 시 Equality 연산자로 동작하지만, `.sort()`와 함께 쓰고 배열 원소가 201개 이상일 때는 Range 연산자처럼 동작합니다.

### 인덱스 빌드와 관리

MongoDB는 현재 optimized build process라는 인덱스 빌드 방식을 사용합니다. 빌드 시작과 종료 시점에만 컬렉션에 배타 잠금(exclusive lock)을 걸고, 나머지 빌드 과정에서는 읽기·쓰기 작업을 인터리빙합니다. 과거 버전에서 사용하던 `background: true` 옵션은 현재 무시됩니다.

인덱스는 `mongosh`에서 `db.collection.createIndex()` 또는 `db.collection.createIndexes()`로 생성합니다. `ensureIndex()` 메서드는 MongoDB 3.0에서 deprecated 되었고 5.0에서 제거되어 더 이상 존재하지 않습니다.

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

인덱스 크기는 `db.collection.stats()`로 확인 가능하지만, `collStats` 커맨드는 MongoDB 6.2부터 deprecated되었으므로 `$collStats` aggregation stage를 사용하는 것이 권장됩니다.

## MongoDB Search와 Vector Search

MongoDB는 전문 검색을 위한 MongoDB Search와 벡터 검색을 위한 MongoDB Vector Search를 제공합니다. 이들은 일반 B-tree 인덱스와는 다릅니다.

Search 인덱스는 Lucene 기반 inverted index 구조를 사용하며, `mongod`가 아닌 `mongot`이라는 별도 프로세스가 관리합니다. `$search`와 `$searchMeta` aggregation stage로 접근하며, MongoDB 서버와 별도로 버전이 관리됩니다. Community Edition을 포함한 self-managed 배포에서도 운영 가능합니다.

Vector Search 인덱스는 HNSW(Hierarchical Navigable Small Worlds) 알고리즘을 사용한 ANN(Approximate Nearest Neighbor) 검색을 지원하며, 최대 8192 차원까지 지원합니다. `$vectorSearch` aggregation stage로 접근하며, MongoDB 6.0.11, 7.0.2 이상 버전이 필요합니다.

#### 참고 자료

도서: 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/)

[http://mongodb.citsoft.net/?p=663](http://mongodb.citsoft.net/?p=663)

[https://dzone.com/articles/effective-mongodb-indexing-part-1](https://dzone.com/articles/effective-mongodb-indexing-part-1)
