---
date: 2021-03-11 16:43:26 +0900
title: "MongoDB Aggregation"
category: mongodb
excerpt: "Aggregation FIND로는 처리할 수 없는 복잡한 데이터 분석 기능을 제공하는 기능입니다. 일반적으로 SQL에서 GROUP BY 절로 처리할 수 있는 기능들을 샤딩된 환경에서 실행할 수 있게 해줍니다. Aggregation의 목적 기존의 MongoDB에 맵리듀스라는 분석 기…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — `count()` 는 deprecated 되어 countDocuments()/estimatedDocumentCount() 를 써야 하고, 대안으로 언급한 map-reduce 는 5.0 부터 deprecated 입니다. 또 `$lookup`·`$graphLookup` 은 5.1 부터 샤딩된 컬렉션도 지원하며, 6.0 부터는 `allowDiskUseByDefault` 로 100MB 초과 스테이지가 기본적으로 디스크를 사용합니다.

![MongoDB Aggregation 파이프라인 개념도](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## Aggregation

FIND로는 처리할 수 없는 복잡한 데이터 분석 기능을 제공하는 기능입니다. 일반적으로 SQL에서 GROUP BY 절로 처리할 수 있는 기능들을 샤딩된 환경에서 실행할 수 있게 해줍니다.

### Aggregation의 목적

MongoDB는 맵리듀스 분석 기능이 있지만 새롭게 aggregation 기능을 도입한 데에는 대표적으로 두 가지 이유가 있습니다. 맵리듀스를 사용하기 위해서는 자바스크립트 언어를 알고 있어야 하며, 자바스크립트로 작성된 맵리듀스 작업은 자바스크립트 엔진과 MongoDB 엔진간의 빈번한 데이터 맵핑으로 인해서 성능적인 제약이 심하기 때문입니다.

### Aggregation의 동작

샤딩되지 않은 MongoDB에서 aggregation 실행은 다른 오퍼레이션과 비교했을 때 차이가 없습니다. 하나의 샤드만 이용할 때에는 FIND나 aggregation 모두 단일 샤드에서 실행됩니다.

하지만 샤딩된 환경에서 aggregation 파이프라인의 각 스테이지가 어떤 샤드에서 실행되는지가 부하 분산 차원에서 상당히 중요한 문제가 됩니다. 샤드키(샤딩 기준 필드)가 아닌 필드를 그룹핑을 해야한다면 각 사드에 커넥션이 만들어지고 각 샤드의 데이터를 하나의 샤드에 모아야만 해당 필드를 기준으로 그룹핑하고 도큐먼트의 데이터를 확인할 수 있습니다. 마지막 정렬 작업역시 그룹핑 작업을 완료해야 수행할 수 있기 때문에 단일 샤드에서만 처리할 수 있습니다. MongoDB는 여러 샤드에서 데이터를 수집해야 하는 처리를 위해서 프라이머리 샤드(대표 샤드)를 활용하는데 임의의 샤드를 대표 샤드로 선정합니다. 대표 샤드는 모든 샤드 서버중에서 임의의 샤드 서버가 대표 샤드로 선택될 수 있습니다.

mongos(쿼리 라우터)는 클라이언트로부터 Aggregation 쿼리를 전달 받으면 우선 요청된 Aggregation 쿼리의 파이프라인 선두에 $match 스테이지가 있는지와 $match 스테이지의 검색 조건이 샤드키를 포함하는지 비교합니다. 만약 검색 조건이 필요로 하는 도큐먼트가 단일 샤드에만 있다면 mongos는 해당 샤드로만 Aggregation 쿼리를 전송합니다.

만약 그렇지 않다면 Aggregation 쿼리를 대표 샤드로 전달합니다. 대표 샤드는 Aggregation 쿼리를 전달받으면 다른 샤드로 Aggregation 파이프라인에서 필요한 일부 스테이지만 전송합니다.

그리고 요청을 받은 샤드들이 쿼리 결과를 반환하면 대표 샤드는 그 결과를 병합하고 정렬하는 작업을 수행해서 mongos로 전달합니다.

Aggregation 파이프라인은 각 샤드가 실행할 수 있는 부분과 그렇지 않은 부분으로 나뉘어서 처리합니다. $match나 $project와 같은 스테이지는 각 샤드가 개별로 실행할 수 있는 부분이며, $sort, $group, $out, $lookup, $graphLookup 등 스테이지는 각 샤드가 개별로 실행하지 못하는 부분에 속합니다. $out, $lookup, $graphLookup는 반드시 프라이머리 샤드만 실행할 수 있는 스테이지입니다. 각 샤드에서 개별적으로 처리하지 못하는 부분은 mongos나 MongoDB 서버에서에서 모아서 처리합니다. $out이나 $lookup과 같은 스테이지를 사용하는 Aggregation 쿼리는 프라이머드 샤드에 의존할 수 밖에 없습니다.

$lookup이나 $graphLookup 등과 같은 조인을 수행하는 Aggregation 쿼리는 샤딩이 되지 않은 컬렉션만 조인을 수행할 수 있습니다. 즉, 프라이머리 샤드만을 사용할 수 밖에 없고, 이 경우 mongos가 Aggregation 쿼리들을 모두 프라이머리 샤드로만 전송을 하기 때문에 부하가 걸릴수도 있습니다.

### 단일 목적의 Aggregation

`db.collection.count(query, options)`

count() 명령은 특정 조건에 부합하는 도큐먼트의 건수를 확인하는 Aggregate 명령이며, FIND 명령처럼 일치하는 조건을 찾아 도큐먼트를 조회할 수 있습니다. count() 명령은 조건이 없을 때 메타데이터를 기반으로 결과를 반환합니다. 이런 경우에는 정확한 데이터를 가져오지 못 할 수도 있으나, 서버에 부하를 유발하지는 않습니다.

count()는 `db.collection.find(query).count()` 구문과 동일합니다.

샤딩된 클러스터에서는 Orphaned 도큐먼트를 제대로 필터링할 수 없거나 chunk 마이그레이션이 실행 중이라면 정확한 결과를 가져오지 못합니다. 이러한 상황을 방지하기 위해서 샤딩된 클러스터에서는 db.collation.aggregate() 메서드를 이용합니다. $count 스테이지를 이용해 도큐먼트의 수를 계산할 수 있습니다.

```json
db.collection.aggregate( [
{ $count: "myCount" }
])
```

$count 스테이지는 $group + $project 시퀀스와 동일합니다.

```json
db.collection.aggregate( [
{ $group: { _id: null, count: { $sum: 1 } } }
{ $project: { _id: 0 } }
] )
```

count() 명령은 선택적으로 Options라는 두 번째 인자를 사용하는데 다음과 같은 선택 사항을 설정할 수 있습니다.

- **limit**: 조건이 일치하는 도큐먼트의 최대개수를 설정
- **skip**: 조건에 일치하는 도큐먼트의 개수를 확인할때, 건너뛸 도큐먼트의 개수를 설정
- **hint**: count() 명령이 사용하도록 유도할 인덱스의 이름이나 스펙을 설정
- **maxTimeMS**: 명령이 실행될 최대 시간을 설정
- **readConcern**: 명령으로 도큐먼트의 개수를 확인할 때 사용할 readConcern 옵션을 설정. 옵션을 설정하지 않으면 "local"로 실행
- **collation**: 3.4 버전부터 추가된 옵션으로 collation을 지정할 수 있음

count() 명령에 limit이나 skip 옵션을 사용하는 경우는, 특정 조건에 일치하는 도큐먼트의 개수를 확인하고자 할 때, 전체 개수가 100건 이상이면 더 이상 카운트를 하지 않도록 할 때 사용합니다. 100개 미만의 개수는 정확히 표현하고, 100개 이상이 존재하면 100+ 이라고 표현하고자 한다면 limit 옵션을 사용하는 편이 서버의 부하 감소에 상당한 도움이 될 수도 있습니다.

`db.collection.distinct(field, query, options)`

distinct() 명령은 지정된 필드의 유니크한 값들을 배열로 반환하는데, 유니크한 값의 개수를 확인하고자 한다면 distinct() 명령의 결과에 배열의 길이를 확인하는 속정 length를 출력해보면 됩니다. 지정된 필드의 값이 배열 인 경우 db.collection.distinct ()는 배열의 각 요소를 개별 값으로 간주합니다. 예를 들어, 필드의 값이 [1, [1], 1]이면 db.collection.distinct ()는 1, [1] 및 1을 별도의 값으로 간주합니다.  
MongoDB 4.2부터 db.collection.distinct()를 발행 한 클라이언트가 작업이 완료되기 전에 연결이 끊어지면 MongoDB는 db.collection.distinct()를 종료(즉, 작업에서 killOp)하도록 표시합니다.  
collation 옵션을 통해 사용자는 문자 및 악센트 표시에 대한 규칙과 같은 문자열 비교를 위한 언어별 규칙을 지정할 수 있습니다.  
myColl 컬렉션에는 다음과 같은 문서가 있습니다.

```json
{ _id: 1, category: "café", status: "A" }
{ _id: 2, category: "cafe", status: "a" }
{ _id: 3, category: "cafE", status: "a" }
```

distinct() 명령에는 collation 옵션이 포함됩니다.

```json
db.myColl.distinct( "category", {}, { collation: { locale: "fr", strength: 1 } } )
```

### 범용 Aggregation

단일 목적뿐만 아니라 다양한 서비스 요건을 위해서 사용자가 직접 작업 내용을 구현할 수 있도록 일반적인 Aggregation 기능도 제공하고 있습니다. 이때 Aggregation 은 사용자가 필요한 데이터 가공작업을 직접 작성해야합니다. 이때 데이터를 가공하는 작업은 스테이지(Stage)라는 단위 작업들로 구성되며, 데이터는 이럴게 작성된 스테이지들을 하나의 관(Pipeline)처럼 흘러가면서 원하는 형태의 데이터로 변환됩니다. MongoDB 서버의 각 스테이지는 사용자가 정의한 입력과 출력을 가지며, 이들 스테이지가 서로 파이프로 연결되어 실행되는 형태를 가지기 때문에 파이프라인이라고도 부릅니다.

Aggregation  명령은 pipeline과 options 두 개의 파라미터를 사용합니다.

```javascript
db.collection.aggregate(pipeline,options)
```

MongoDB의 Aggregation 프레임워크가 인식할 수 있도록 미리 정의된 스테이지로만 구성해야합니다. 두 번째 파라미터는 다음과 같이 다양한 설정을 가질수 있습니다.

- **explain**: Aggregation 명령의 실행 계획을 확인할 수 있는 옵션입니다.
- **allowDiskUse**: Aggregation() 명령은 기본적으로 정렬을 위해서 100MB의 메모리까지 사용할 수 있습니다. allowDiskUse 옵션을 true로 설정해서 디스크를 이용해서 정렬을 처리할 수 있게 합니다. 데이터 디렉터리 밑에 \_tmp 라는 디렉토리를 만들어서 임시 가공용 데이터를 저장합니다.
- **cursor**: Aggregation() 명령의 결과로 반환되는 커서의 배치 사이즈를 설정할 수 있습니다.
- **maxTimeMS**: Aggregation() 실행될 최대 시간을 설정합니다.
- **readConcern**: Aggregation() 명령이 도큐먼트의 개수를 확인할 때, 사용할 readConcern 옵션을 설정합니다. 아무런 옵션을 설정하지 않으면 "local" readConcern이 사용됩니다.
- **bypassDocumentValidation**: Aggregation() 명령의 결과를 다른 컬렉션으로 저장하는 경우에 컬렉션의 도큐먼트 유효성 체크를 무시할 것인지 설정할 수 있습니다.
- **collation**: Aggregation() 명령이 필요한 도큐먼트를 검색할 쿼리에서 사용할 콜레이션을 사용할 수 있습니다.

### Aggregation 파이프라인 스테이지와 표현식

`db.collection.aggregate()` 의 스테이지 값들 입니다.

|  |  |
| --- | --- |
| **스테이지** | **설명** |
| $project | 입력으로 주어진 도큐먼트에서 필요한 필드만 선별해서 다음 스테이지로 넘겨주는 작업을 처리한다. 기존 필드의 이름을 변경하거나 필드를 제거하는 처리도 가능하다. |
| $addField | 입력으로 주어진 도큐먼트에 새로운 필드를 추가한다. |
| $replaceRoot | 입력으로 주어진 도큐먼트에서 특정 필드를 최상위 도큐먼트로 만들고, 나머지는 버린다. |
| $match | 컬렉션 또는 직전 스테이지에서 넘어온 도큐먼트에서 조건에 일치하는 도큐먼트만 다음 스테이지로 갈수 있다. |
| $redact | 도큐먼트의 각 필드 또는 서브 도큐먼트의 포맷이 다양한 경우에 지정된 형태의 포맷과 일치하는 서브 도큐먼트 또는 필드만으로 도큐먼트를 재구성한다. |
| $limit | 입력으로 주어진 도큐먼트에서 처음 몇 건의 도큐먼트만 다음 스테이지로 전달한다. |
| $skip | 입력으로 주어진 도큐먼트에서 처음 몇 건의 도큐먼트만 버리고 나머지 도큐먼트만 다음 스테이지로 전달한다. |
| $out | 처리의 결과를 컬렉션으로 저장하거나 클라이언트로 직접 전달한다. |
| $unwind | 입력 도큐먼트에 배열 필드가 있으면 이를 여러 도큐먼트로 풀어서 다음 스테이지로 전달한다. 즉, 입력 도큐먼트가 10개의 엘리먼트를 가진 배열로 구성된 필드를 가진다면 $unwind 스테이지는 이를 10개의 도큐먼트로 만들어서 다음 스테이지로 전달한다. |
| $group | 입력으로 주어진 도큐먼트를 지정된 조건에 맞게 그룹핑해서 카운트나 합계 또는 평균 등의 계산을 처리한다. |
| $sample | 주어진 입력 도큐먼트 중에서 임의로 몇 개의 도큐먼트만 샘플링해서 다음 스테이지로 전달한다. |
| $sort | 주어진 입력 도큐먼트를 정렬해서 다음 스테이지로 전달한다. |
| $count | 주어진 입력 도큐먼트의 개수를 세어서 다음 스테이지로 전달한다. |
| $geoNear | 주어진 위치를 기준으로 위치 기반의 검색을 수행해서 일정 반경 이내의 결과만 다음 스테이지로 전달한다. |
| $lookup | 주어진 입력 도큐먼트와 동일 데이터베이스 내의 다른 컬렉션과 Left Outer Join을 실행해서 결과를 다음 스테이지를 가진다. |
| $facet | 하나의 스테이지로 다양한 차원의 그룹핑 작업을 수행한다. $facet 스테이지는 $bucket과 $bucketAuto 그리고 $sortByCount 등의 서브 스테이지를 가진다. |
| $bucket | 입력 도큐먼트를 여러 범위로 그룹핑한다. $group 스테이지는 유니크한 모든 값에 대해서 그룹을 생성하지만, $bucket은 사용자가 임의로 각 그룹의 범위를 설정할 수 있다. |
| $bucketAuto | $bucket 스테이지와 동일하지만, $bucketAuto는 사용자가 아닌 MongoDB 서버가 자동으로 그룹의 범위를 설정한다. |
| $sortByCount | 주어진 도큐먼트의 필드를 기준으로 그룹핑해서 개수의 역순으로 정렬한 결과를 다음 스테이지로 전달한다. |
| $graphLookup | 주어진 입력 도큐먼트와 동일 데이터베이스 내 다른 컬렉션과 그래프(재귀) 쿼리를 실행한다. |
| $collStats | 컬렉션의 상태 정보를 조회해서 다음 스테이지로 전달한다. |
| $indexStats | 인덱스의 상태 정보를 조회해서 다음 스테이지로 전달한다. |
| $merge | Aggregation Pipeline의 결과 값은 컬렉션에 도큐먼트형태로 저장. $merge 스테이지는 항상 맨 마지막 위치. 4.2버전부터 추가 된 기능 |
| $unionWith | 두 컬렉션을 하나로 결합. 두 컬렉션의 파이프라인 결과 값을 하나의 결과값으로 출력. 4.4버전부터 추가 된 기능 |

너무나 많은 스테이지와 표현식이 있고, MongoDB의 연산 방식은 수학의 사칙연산 연산자를 사용할 수 없습니다. MongoDB의 Aggregation 연산자를 사용해야 하기 때문에 SQL에 익숙하신 분들이라면 어색할 수도 있습니다.

MongoDB는 Aggregation(<https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/>)에 대한 메뉴얼을 제공하고 있습니다. 이런 부분은 필요한 부분이 있을때 마다 찾아가면서 사용하면서 익숙해지지 않으면 어려운 문제라고 생각합니다.

또 MongoDB에서는 Agrregation Quick Reference(<https://docs.mongodb.com/manual/meta/aggregation-quick-reference/index.html>)를 제공하고 있습니다.

MongoDB는 3.6버전부터 컬렉션 뿐만 아니라 DB에 대한 aggregation도 지원합니다.

`db.aggregate()`

DB에 대한 aggregation 스테이지 값은 아래와 같습니다.

|  |  |
| --- | --- |
| **스테이지** | **설명** |
| $currentOp | MongoDB에 배포된 활동 정보 또는 휴면 상태인 작동들에 대해 반환 |
| $listLocalSessions | 현재 연결된 mongo 또는 mongod 인스턴스에서 최근 사용중인 모든 활성 세션을 나열. 이 세션들중 몇몇은 업데이트 되지 않아 system.sessions 컬렉션에서 확인 할 수 없는 경우도 있다. |

MongoDB 4.2버전부터는 스테이지를 이용해 Update도 가능해 졌습니다. 스테이지를 이용해서 업데이트를 전송할 수 있는 명령은 아래와 같습니다.

- findAndModify
- update

업데이트의 경우 파이프 라인은 다음 단계로 구성 될 수 있습니다.

- [`$addFields`](https://docs.mongodb.com/manual/reference/operator/aggregation/addFields/#pipe._S_addFields "$addFields") and its alias [`$set`](https://docs.mongodb.com/manual/reference/operator/aggregation/set/#pipe._S_set "$set")
- [`$project`](https://docs.mongodb.com/manual/reference/operator/aggregation/project/#pipe._S_project "$project") and its alias [`$unset`](https://docs.mongodb.com/manual/reference/operator/aggregation/unset/#pipe._S_unset "$unset")
- [`$replaceRoot`](https://docs.mongodb.com/manual/reference/operator/aggregation/replaceRoot/#pipe._S_replaceRoot "$replaceRoot") and its alias [`$replaceWith`](https://docs.mongodb.com/manual/reference/operator/aggregation/replaceWith/#pipe._S_replaceWith "$replaceWith")

#### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
