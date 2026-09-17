---
date: 2021-03-04 02:18:09 +0900
title: "MongoDB의 읽기 연산"
category: mongodb
excerpt: "MongoDB의 읽기 연산 읽기 작업이란 쿼리를 통해 테이터를 반환하는 핵심 연산 기능으로 쿼리는 단일 컬렉션에 도큐먼트를 선택합니다. MongoDB가 클라언트에게 반환하는 도큐먼트를 식별하는 기준(criteria) 또는 조건(conditions)들을 쿼리에서 설정할 수 있습니다.…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — find() 의 쿼리·프로젝션 규칙과 연산자 분류는 현재 문서와 동일합니다. 예제 프롬프트가 6.0 에서 제거된 레거시 `mongo` 셸 기준이라는 점만 감안하면 됩니다.

## MongoDB의 읽기 연산

읽기 작업이란 쿼리를 통해 데이터를 반환하는 핵심 연산 기능으로 쿼리는 단일 컬렉션에 도큐먼트를 선택합니다. MongoDB가 클라이언트에게 반환하는 도큐먼트를 식별하는 기준(criteria) 또는 조건(conditions)을 쿼리에서 설정할 수 있습니다. 또한 쿼리는 반환된 도큐먼트로부터 필드를 설정하는 프로젝션(projection) 기능을 포함할 수 있습니다. 프로젝션을 통해 몽고 DB가 네트워크 상에서 클라이언트에 반환하는 데이터의 양을 제한합니다.

- 커서(Cursor): 쿼리는 전체 결과 셋을 소유하는 커서라고 부르는 반복적인 객체를 반환합니다.
- 쿼리 최적화: 쿼리 성능을 분석하고 개선합니다.
- 분산 쿼리: 샤드된 클러스터와 레플리카 셋이 읽기 연산 성능에 어떤 영향을 미치는지를 설명합니다.

### 쿼리 특성

MongoDB에서 모든 쿼리는 다음과 같이 동작합니다.

- MongoDB에서 모든 쿼리는 단일 컬렉션에서 사용합니다.
- 사용자는 Limit, skips 및 sort order를 사용하여 쿼리를 수정할 수 있습니다.
- sort()가 설정되지 않으면 쿼리에서 반환되는 도큐먼트 순서는 정의되지 않습니다.
- 기존의 도큐먼트를 갱신(update)하는 동작은 쿼리가 갱신하려는 도큐먼트를 선택하는 것과 동일한 쿼리 문법을 사용합니다.
- $match 파이프라인 작업은 집계 파이프라인에서 MongoDB 쿼리에 접근합니다.

### FIND

`find()`는 MongoDB에서 데이터를 조회하는 명령으로 MongoDB에서 사용되는 명령 중에서도 가장 다양한 조건이나 옵션을 많이 사용할 수 있는 명령입니다.

`find()` 명령은 2개의 인자를 사용하는데, 첫 번째 인자에는 도큐먼트를 검색할 때 사용할 조건을 명시하며, 두 번째 인자에는 클라이언트로 반환할 필드를 명시합니다. 이 두 개의 인자는 모두 선택 옵션이므로 아무런 인자 없이 `find()`만을 사용할 수도 있습니다.

```javascript
db.users.find()
db.users.find({})
```

위 명령은 users 컬렉션의 모든 도큐먼트를 반환하는 명령입니다. 특별한 필드를 설정하지 않았기 때문에 기본값으로 모든 도큐먼트를 반환합니다.

```javascript
db.users.find({},{_id:0, name:1, score:1})
```

두번째 인자의 필드값에 1과 0을 반환할 필드와 반환하지 않을 필드를 결정할 수 있습니다. 위의 쿼리는 \_id 필드는 반환하지 않으며, name, score 필드는 반환하겠다는 의미입니다. 이렇게 쿼리가 반환한 목록을 선택할 수 있는데, BSON(Binary JSON, MongoDB의 바이너리 데이터 포맷) 쿼리에서는 프로젝션이라고 합니다.

프로젝션에서는 1과 0를 함께 사용할 수 없습니다.

```javascript
db.users.find({}, {name:0, score:1})
```

위와 같은 쿼리는 사용할 수 없습니다.

일부 필드에 대해 프로젝션 옵션을 적용하면, 나머지 필드에 대해서는 자동으로 설정값이 적용되어 프로젝션할 필드가 결정됩니다.

```javascript
db.users.find({},{username:1}).pretty()
{ "_id" : ObjectId("602db73fb44cb815df1453e4"), "username" : "Alice" }
{ "_id" : ObjectId("602db814b44cb815df1453e6"), "username" : "rabbit" }
{ "_id" : ObjectId("602db888b44cb815df1453e8"), "username" : "Elsa" }
{ "_id" : ObjectId("602db907b44cb815df1453ea"), "username" : "Queen_Anna" }
{ "_id" : ObjectId("602dbb23b44cb815df1453ec"), "username" : "Harry" }
{ "_id" : ObjectId("602dc053b44cb815df1453f8"), "username" : "hermione" }
{ "_id" : ObjectId("602dcb49b44cb815df1453fa"), "username" : "ronweasley" }
```

username을 1로 줬을때는 위와 같이 \_id 필드와 username 만을 반환합니다. 반대로 username을 0으로 주면 아래와 같은 결과값을 반환합니다.

```javascript
> db.users.find({},{username:0})
{ "_id" : ObjectId("602db73fb44cb815df1453e4"), "email" : "alice@naxer.com"}
...
..
.
```

username 만 빼고 모든 필드값을 반환합니다. 위 결과 값들을 보면 1과 0을 같이 쓰게되는 경우 논리적이 오류로 인하여 같이 사용이 불가능함을 알 수 있습니다. \_id 필드는 예외로 적용되는데 모든 쿼리에 \_id 필드를 반환하는 것이 기본 값이기 때문에 \_id 필드를 빼고 가져오려면 \_id 필드에 0을 줘야하는데, 이 경우에만 \_id 필드를 제외한 다른 필드에 1을 지정해서 \_id:0, 다른 필드는 1, 이렇게 혼합하여 사용이 가능합니다.

```javascript
db.users.find({}, {_id:0, name:1})
```

### FIND 연산자

MongoDB의 `find()` 명령의 검색조건에 사용할 수 있는 오퍼레이터(연산자)를 메뉴얼에서는 크게 7가지로 나눠서 분류합니다.

- 비교 오퍼레이터
- 논리 결합 오퍼레이터
- 필드 메타 오퍼레이터
- 평가 오퍼레이터
- 공간 오퍼레이터
- 배열 오퍼레이터
- 비트 오퍼레이터

MongoDB의 `find()` 쿼리가 사용하는 검색 조건은 모두 JSON 포맷으로 표시해야 하므로 RDBMS의 SQL 문법에서 사용되는 기본 집합 및 비교 연산자 (=, >, <, IN, NOT IN, …)는 사용할 수 없으며, "$"로 시작하는 오퍼레이터를 JSON 문법에서 사용하도록 제공하고 있습니다. 그리고 오퍼레이터들은 대소문자를 구분해서 사용해야 합니다. 표기법이 다르기 때문에 익숙하지 않을 수 있으나 기존의 RDBMS의 연산자와 내용은 동일합니다.

#### 비교 오퍼레이터

|  |  |
| --- | --- |
| **연산자** | **설명** |
| $eq | SQL =  "Equal"의 약자로 값이 일치한지 비교하는 것인데 일반적으로 $eq연산자는 생략하는 경우가 많습니다. |
| $gt | SQL >  "Greater Than"의 약자로 좌항의 값이 더 큰지 비교합니다. |
| $gte | SQL >=  "Greater Than or Equal"의 약자로 좌항의 값이 더 크거나 같은지 비교합니다. |
| $lt | SQL <  "Less Than"의 약자로 좌항의 값이 더 작은지 비교합니다. |
| $lte | SQL <=  "Less Than or Equal"의 약자로 좌항의 값이 더 작거나 같은지 비교합니다. |
| $ne | SQL <> 또는 !=  "Not Equal"의 약자로 좌항과 우항의 값이 같지 않은지 비교합니다. |
| $in | SQL IN  좌항이 우열의 배열 값 중 하나와 일치하는지 비교합니다. |
| $nin | SQL NOT IN  "NOT IN"의 약자로 좌항이 우항의 배열 값 중 어떤 값과도 일치하지 않는지 비교합니다. |

#### 논리 결합 오퍼레이터

|  |  |
| --- | --- |
| **연산자** | **설명** |
| $or | 두 개의 표현식을 OR로 연결합니다.  다음 예제는 name이 "matt" 이거나 score 필드값이 90보다 큰 사용자를 반환합니다. 
```javascript
db.users.find( { $or: [ { name: "matt"}, { score: { $gt: 90 } } } )
```
 |
| $and | 두 개의 표현식을 AND로 연결합니다.  다음 예제는 name이 "matt" 이고,  score 필드값이 90보다 큰 사용자를 반환합니다. 
```javascript
db.users.find( { $and: [ { name: "matt"}, { score: { $gt: 90 } } } )
```
 |
| $not | 표현식의 부정 연산을 수행합니다.  다음 예제는 score 필드가 90점 이하인 도큐먼트를 반환합니다. 
```javascript
db.users.find( { score: { $not: { $gt: 90 } } } )
```
 |
| $nor | 배열로 주어진 모든 표현식에 일치하지 않는지 비교합니다.  다음 예제는 name이 "matt"도 아니고 score 필드의 값도 90이 아닌 도큐먼트를 반환합니다. 이때 name 필드나 score 필드가 존재하지 않는 경우에도 TRUE로 연산됩니다. 
```javascript
db.users.find( { $nor: [ { name: "matt"}, { score: 90 } } )
```
 |

FIND에 사용되는 검색 조건은 기본적으로 AND 연산으로 해석됩니다. 만약 여러 검색 조건을 OR로 결합하려면 아래처럼 $or 오퍼레이터를 명시적으로 사용해야 합니다. 그리고 $and 와 $or 연산자를 이용해서 AND와 OR로 여러 조건을 결합해서 필요한 조건으로 만들 수 있습니다.

```javascript
SELECT * FROM inventory WHERE status = 'A' AND (qty<30 OR item LIKE 'p%');

db.inventory.find( {
    status: "A",
    $or: [ { qty: { $lt: 30 } }, { item: /^p/ } ]
} )
```

#### 필드 메타 오퍼레이터

|  |  |
| --- | --- |
| **연산자** | **설명** |
| $exists | 도큐먼트가 필드를 가지고 있는지 확인합니다. 
```javascript
db.users.find( { name: { $exists: true } } )
```
 |
| $type | 필드의 데이터 타입을 비교합니다. 
```javascript
db.users.find( { "name": { $type: "string" } } )
```
 |

필드의 타입별로 숫자 코드값과 이름은 MongoDB 메뉴얼([https://docs.mongodb.com/manual/reference/operator/query/type](https://docs.mongodb.com/manual/reference/operator/query/type "https://docs.mongodb.com/manual/reference/operator/query/type"))에서 확인 가능합니다.

#### 평가 오퍼레이터

|  |  |
| --- | --- |
| **연산자** | **설명** |
| $mod | 모듈러(%)연산의 수행 결과값을 비교합니다. 다음 예제는 score 필드값을 10으로 나눈 나머지가 0인 도큐먼트를 반환합니다. 
```javascript
db.users.find( { score: { $mod: [ 10, 0 ] } } } )
```
 |
| $regex | 정규 표현식 비교를 수행합니다. 
```javascript
db.users.find( { name: { $regex; '^matt' } } )
db.users.find( { name: /^matt/ } )
```
 |
| $text | MongoDB의 전문 검색 비교를 수행합니다. 이는 Full Text Search 인덱스를 가진 컬렉션에 대해서만 실행할 수 있습니다. 
```javascript
db.users.find( { $text: { $search: "matt" } } )
```
 |
| $where | 주어진 자바 스크립트 표현식에 일치하는 도큐먼트만 필터링해서 클라이언트로 반환합니다.  $where 절에 주어진 조건은 인덱스를 사용하지 못하고 full scan을 하기 때문에 처리 속도가 느립니다. 하지만 자바스크립트를 이용해서 표현식을 작성할 수 있기 때문에 유연한 패턴의 비교가 가능합니다. 
```javascript
db.users.find( { $where: "obj.low_score > obj.high_score" } )
```
 |

#### 배열 오퍼레이터

|  |  |
| --- | --- |
| **연산자** | **설명** |
| $all | 배열 타입의 필드가 파라미터로 주어진 배열의 모든 엘리먼트(요소)를 가졌는지 비교합니다. 지정된 요소 이외의 요소를 가지고 있어도 지정한 요소가 포함되어 있으면 반환합니다. 
```javascript
db.users.find( { tags: { $all: [ 'book', 'music' ] } } )
```
 |
| $elemMatch | $elemMatch의 모든 조건에 일치하는 엘리먼트를 검색합니다. |
| $size | 배열의 엘리먼트 개수를 비교합니다. |

배열 필드에서 원하는 결과 값을 얻으려면 $elemMatch 오퍼레이터를 이용해야 합니다. $elemMatch 연산자는 배열 필드가 가진 엘리먼트 하나가 $elemMatch의 모든 조건을 만족할 때 결과로 반환합니다.

```javascript
db.users.find( { score: { $elemMatch: { $gt: 80, $lt: 90 } } } )
```

위의 쿼리는 배열 필드가 가진 엘리먼트 중에 80보다 크고 90보다 작은 값이 있는 도큐먼트만 반환을 합니다. 범위 검색을 사용할 때 $elemMatch는 매우 중요한 의미를 가지지만, 단순 일치 비교를 할때는 $elemMatch가 그다지 중요하지 않습니다. 쿼리의 가독성을 위해 단순화 해도 결과 값이 같다면 최대한 단순화 해서 사용하는 것이 좋습니다.

#### 비트 오퍼레이터

|  |  |
| --- | --- |
| **연산자** | **설명** |
| $bitAllSet | 필드 값의 각 비트가 파라미터로 주어진 값의 각 비트처럼 1로 Set 되어 있는지 비교합니다. |
| $bitAnySet | 필드 값의 각 비트중 하나라도 파라미터로 주어진 값의 비트처럼 1로 Set 되어 있는지 비교합니다. |
| $bitAllClear | 필드 값의 각 비트가 파라미터로 주어진 값의 각 비트처럼 0으로 Clear 되어 있는지 비교합니다. ($bitAllSet의 반대) |
| $bitAnyClear | 필드 값의 각 비트중 하나라도 파라미터로 주어진 값의 비트처럼 0으로 Clear 되어 있는지 비교합니다. ($bitAnySet의 반대) |

### FIND 조건

`find()` 쿼리로 데이터를 검색할 때 가장 중요한 것은 검색 대상을 걸러내는 조건을 정하는 것입니다. MongoDB의 도큐먼트의 가장 큰 특징은 RDBMS 처럼 정형화 되어 있지 않고, 다양한 형태를 가지고 있기 때문에 배열이나 서브 도큐먼트 조건을 활용할 수 있게 되어 있습니다.

반면 다양한 포맷을 지원하기 때문에 도큐먼트가 복잡해 지기 쉬우며, 도큐먼트가 복잡해지면 쿼리도 복잡해지고, 쿼리가 어떤 인덱스를 사용할지 명확히 보이지 않는 경우도 발생합니다. 이 것은 사용자 뿐만아니라 옵티마이저에게도 마찬가지이기 때문에 데이터 모델을 단순화하고 도큐먼트의 데이터 포맷을 단순화하는 것이 좋습니다.

MongoDB의 쿼리를 작성할 때 가장 중요한 것은 하나의 필드에 대한 조건을 걸 때 반드시 하나의 서브 도큐먼트로 작성해야 한다는 것입니다.

```javascript
db.users.find( { name: { $gte: "m"}, name: { $lte: "u" } } )
{ "name" : "matt", "scores" : [ 79, 85, 93 ] }
{ "name" : "lara", "scores" : [91, 63] }
```

위 쿼리는 name 필드의 값이 m 보다 크거나 같고, u 보다 작거나 같은 도큐먼트를 검색하는 쿼리인데 출력된 결과는 원하는 결과값이 나오지 않습니다. MongoDB의 쿼리는 두 개의 조건이 있는 경우 첫번째 조건을 버리고, 두번째 조건만 취합니다. 그렇기 때문에 원하는 결과 값을 받기 위해서는 연산자를 같이 묶어야 합니다.

```javascript
db.users.find( { name: { $gte: "m", $lte: "u" } } )
```

이렇게 하나의 필드에 대한 조건은 하나의 서브 도큐먼트로 묶어서 처리해야 합니다. 하나의 필드에 대한 조건을 분리해서 나열하고자 한다면 $and 연산자를 이용하면 됩니다.

```javascript
db.users.find( { $and: [ { name: { $gte: "m" }, name: { $lte: "u" } } ] } )
```

MongoDB의 BSON 쿼리는 논리 연산을 포함하지 않으면 모두 AND 연산으로 수행합니다.

```javascript
db.users.find( { name: "Alice", scores: 90 } )

db.users.find( { $and: [ { name: "Alice" }, { score: 90 } ] } )
```

$and 연산자를 넣게되면 쿼리의 가독성이 떨어지고, 복잡해 지기 때문에 AND 연산자로 연결되는 조건에서는 생략하고 나열하는 형태로 사용합니다.

#### 서브 도큐먼트 필드 검색 쿼리

```javascript
db.users.find( { contact: { type: "office", phone: "02-0000-0000" } } )

db.users.find( { "contact.type": "office", "contact.phone": "02-0000-0000 } } )
```

두 쿼리는 서브 도큐먼트 안에 다른 필드가 없다는 가정하에 같은 결과 값을 보여줍니다. 그렇기 때문에 같은 쿼리라고 생각할 수 있지만, 서브도큐먼트 안에 다른 필드값이 추가되면 첫번째 쿼리는 동일한 필드를 가진 도큐먼트가 없다고 인식하여 결과 값을 반환하지 못합니다. 두 쿼리의 차이점은 첫번째 쿼리는 서브 도큐먼트 자체가 조건으로 걸려 완벽히 같은 서브 도큐먼트가 존재해야지만 결과 값을 반환하며, 두번째 쿼리는 서브 도큐먼트 안의 개별 필드를 비교하기 때문에 서브 도큐먼트 안에 다른 필드가 추가되어도 결과값에 영향이 없습니다. MongoDB에서의 서브 도큐먼트는 BSON으로 변환하여 비교하기 때문에 이러한 차이가 발생하게 됩니다.

이러한 결과는 인덱스를 생성할 때에도 동일하게 적용하기 때문에 서브 도큐먼트안의 필드 값에 인덱스를 적용하기 위해서는 contact 자체에 인덱스를 생성하는 것이 아닌, "contact.type", "contact.phone"에 인덱스를 생성해 줘야합니다.

#### 배열 필드 검색 쿼리

배열 필드에는 단순 엘리먼트 배열(Array of Element)가 있고, 배열의 엘리먼트가 서브 도큐먼트인 도큐먼트 배열(Array Of Sub-Document)이 있습니다.

엘리먼트 배열

```javascript
{
  scores: [ 85, 90, 71 ]
}
```

도큐먼트 배열

```javascript
{
  name: "Alice",
  contact: [
    {type: "office", phone: "02-0000-0000"},
    {type: "home", phone: "031-000-0000"}
  ]
}
```

이렇게 엘리먼트가 서브 도큐먼트 타입의 도큐먼트 배열의 경우, 번위 검색을 하기 위해서는 $elemMatch 오퍼레이터를 사용해야 합니다.

```javascript
db.users.find( { contact: { $elemMatch: { type: "office", phone: { $gt: "02" } } } )
```

explain() 연산자를 이용해 쿼리를 실행하면 어떤 연산자가 어떻게 적용되는지 알 수 있습니다. 도큐먼트 배열의 조회에서 $elemMatch를 이용하지 않는 경우, 각각의 $eq 조건이 자동으로 추가되지만, $elemMatch의 경우 $and 조건이 추가되는 것을 볼 수 있습니다. 즉 일치하는 검색을 찾을때는 $elemMatch를 사용하지 않아도 괜찮지만, 범위 검색이 필요한 경우에는 $elemMatch를 이용해 배열의 범위를 지정해 줘야합니다.

### 읽기 연산의 동작순서

find() 명령을 사용할 시에 인자에 여러가지 값이 있는 경우 다음과 같이 동작합니다.

```javascript
db.songs.find( { seconds: { $lt: 400 }, genre: "rock" } ).sort( { rating: 1 } )
```

{ "genre": 1, "rating": 1, "seconds": 1}

E -> S -> R (Equal ->  Sort -> Range ) 순으로 동작을 합니다.

### 커서(Cursor)

MongoDB의 FIND는 항상 커서를 반환하는데, 커서를 통해서 쿼리 결과 도큐먼트를 하나씩 읽을 수 있습니다. 커서는 단순히 결과 도큐먼트를 읽는 용도로만 사용되는 것이 아니며, 검색 결과를 정렬하거나 지정된 건수의 도큐먼트를 건너뛰거나 제한하는 등의 기능도 제공합니다. MongoDB의 매뉴얼([https://docs.mongodb.com/manual/reference/method/js-cursor/](https://docs.mongodb.com/manual/reference/method/js-cursor/ "https://docs.mongodb.com/manual/reference/method/js-cursor/"))에서 많은 커서 기능을 확인할 수 있으며, 자주 사용되는 커서만 짚고 넘어가겠습니다.

#### 데이터 정렬 cursor.sort()

쿼리의 결과 데이터를 정렬하려면 sort() 커서 옵션을 사용해야 합니다. 정렬 옵션에 따라 실행 계획이 바뀌기도 하니 반드시 쿼리를 실행하는 시점에 sort()를 사용해야 합니다.

sort() 옵션은 하나의 인자를 사용하는데, 정렬할 필드의 목록을 나열하면 됩니다. 역순으로 정렬하고자 하는 필드는 -1, 정순으로 정렬하고자 하는 필드는 1로 설정하면 됩니다.

```javascript
db.users.find().sort( { name:1, scores: -1 } )
```

커서의 sort() 옵션이 인덱스를 이용해 정렬을 수행할 수 있을때에는 데이터 크기나 정렬을 위한 메모리 크기에 관계없이 정렬된 결과를 가져올 수 있습니다. 하지만 sort() 옵션이 인덱스를 사용할 수 없을 때에는 MongoDB 서버가 쿼리를 실행하는 도중에 정렬 알고리즘 (Quicksort 알고리즘)을 실행해서 FIND 명령의 결과 도큐먼트를 정렬한 다음 클라이언트로 값을 반환하는데 이 경우 많은 메모리가 필요 됩니다. MongoDB에서는 정렬을 수행해야 할 때 사용할 수 있는 최대 메모리 크기가 인터널 파라미터(기본값 32MB)로 설정되어 있습니다.

> **주의:** 쿼리의 정렬을 수행하는 데 필요한 메모리가 32MB를 넘어가게 되면, 에러를 발생시키고 쿼리는 실패를 하게 됩니다.

이런 경우 3가지 우회 방법을 사용할 수 있습니다.

첫번째, 정렬 작업이 인덱스를 활용 할 수 있게 합니다.

두번째, 정렬을 위한 메모리 공간을 더 크게 설정합니다.

세번째, `find()` 명령 대신 Aggregate() 명령을 사용하고, allowDiskUse 옵션을 true로 줍니다.

정렬을 위해 할당된 메모리는 쿼리가 완료되기 전까지 운영체제로 반납되지 않습니다. 만약 클라이언트가 초반 일부분의 데이터만 받고 나머지 결과가 필요하지 않아 커서가 도큐먼트에 남은채로 방치 된다면, 커서가 자동으로 닫힐때까지 메모리가 운영체제에 반환되지 않습니다. 그래서 전달 받은 커서는 반드시 모든 도큐먼트를 클라이언트로 가져가거나, 결과 값이 도중에 필요없게 되어 Fetch를 중간에 멈추는 경우 커서를 반드시 닫아주는게 좋습니다.

#### 콜레이션 변경 cursor.collation()

쿼리의 검색 조건을 이용해서 검색할 때 , 사용할 문자열 콜레이션을 지정합니다. 인덱스의 콜레이션과 컬렉션의 콜레이션이 다르다면 인덱스를 사용할 수 없고, 쿼리에 콜레이션을 명시하는 방식은 추천할 만한 방식은 아닙니다.

컬렉션과 인덱스의 콜레이션은 동일하게 적용하는게 좋습니다.

#### Read Concern cursor.readConcern()

MongoDB의 서버는 분산 처리구조로 되어 있기 때문에 여러 레플리카 멤버중에서 어떤 멤버를 선택하느냐에 따라 FIND 결과가 달라질 수도 있습니다. MongoDB의 복제는 비동기 모드이며, 최종 일관성(Eventual Consistency) 모델을 채택하고 있기 때문입니다. 하지만 데이터를 읽어가는 쿼리 입장에서는 "Eventual Consistency"가 수많은 문제점을 유발할 가능성이 있습니다. 이런 동기화 과정중에 데이터 읽기를 일관성 있게 유지할 수 있도록 ReadConcern 옵션을 제공합니다. ReadConcern 옵션은 WriteConcern 옵션과 달리 레플리카 셋 간의 동기화 이슈만 제어합니다.

ReadConcern 옵션은 4.4 버전에서 5개로 선택지가 늘었습니다.

- **local:** MongoDB의 기본 ReadConcern옵션인데, local 모드에서는 다른 멤버가 가진 데이터의 상태를 확인하지 않기 때문에 최신의 데이터를 프라이머리 멤버만 가진 상태에서 프라이머리 멤버가 비정상적으로 종료되거나 연결이 끊어지면 그 데이터는 롤백 되서 Phantom Read와 비슷한 상황이 발생할 수도 있습니다. causally consistent session 또는 트랜잭션에서 사용할 수 있습니다.
- **available:** 과반수에 기록되었음을 확인하지 않고 데이터를 반환합니다. 읽어온 데이터가 롤백될수 있습니다.  causally consistent session 또는 트랜잭션에서 사용할 수 없습니다.
- **majority:** 레플리카 셋에서 다수의 멤버들이 최신의 데이터를 가졌을 때에만 읽기 결과가 반환됩니다.  이를 충족하기 위해 각 레플리카 셋 멤버가 메모리의 majority-commit point를 반환해야 합니다. 따라서 위 두 설정에 비해 성능이 떨어집니다. causally consistent session 또는 트랜잭션에서 사용할 수 있습니다. PSA 아키텍처를 사용할 때 이 설정을 쓰지 않게 설정할 수 있습니다. 하지만 이것은 Change Streams, 트랜잭션, 샤디드 클러스터에 영향을 줄 수 있습니다. 자세한 내용은 [Disable Read Concern Majority](https://docs.mongodb.com/manual/reference/read-concern-majority/#disable-read-concern-majority)에서 확인하시길 바랍니다.
- **linearizable:** 모든 레플리카 셋의 멤버들이 데이터를 반영하고 있을때 결과를 반환합니다. 프라이머리 스위칭이 일어나도 데이터가 롤백 될 일이 없으며, Phantom Read가 전혀 발생하지 않습니다. causally consistent session 또는 트랜잭션에서 사용할 수 없습니다.  
  프라이머리 노드에만 설정할 수 있습니다. 어그리게이션의 $out, $merge 스테이지에서 사용할 수 없습니다. 유니크하게 식별가능한 단일 도큐먼트에 읽기 작업에서만 보장됩니다.
- **snapshot:** 트랜잭션이 causally consistent session 이 아니고 Write concern 이 majority 인 경우, 트랜잭션은 과반이 커밋된 데이터의 스냅샷에서 읽습니다. 트랜잭션이 causally consistent session 이고 Write concern 이 majority 인 경우, 트랜잭션 시작 직전에 과반이 커밋된 데이터의 스냅샷에서 읽습니다. 멀티 도큐먼트 트랜잭션에서만 사용가능합니다. 샤딩된 클러스터 중 하나라도 [Disable Read Concern Majority](https://docs.mongodb.com/manual/reference/read-concern-majority/#disable-read-concern-majority) 설정을 할 경우 사용할 수 없습니다.

majority 모드의 ReadConcern을 사용하려면 반드시 MongoDB 설정에 enableMajorityReadConcern 옵션이 활성화 되어 있어야 합니다.

```javascript
$ mongod -- enableMajorityReadConcern

or

setParameter:
   enableMajorityReadConcern: true
```

ReadConcern 옵션은 클라이언트와 데이터베이스, 그리고 컬렉션 레벨의 3가지 방법으로 설정할 수 있습니다. 하지만 이번 포스팅에서는 커서에서도 ReadConcern을 사용할 수 있다 정도만 알면된다고 생각하기에 ReadConcern에 대한 더 자세한 내용은 따로 포스팅 하겠습니다.

#### Read Preference cursor.readPref()

FIND 쿼리의 요건에 따라서 때로는 세컨더리 멤버에서 복제가 조금 지연됐다 하더라도 세컨더리 멤버에서 처리해도 무방한 경우가 자주 있습니다. 최신데이터가 아니어도 괜찮고, 많은 양의 도큐먼트를 처리를 위해 프라이머리에서 사용하기 부담스러운 경우 사용할 수 있는 옵션입니다.

Read Preference 에 대해서도 다른 포스트에서 더 다룰예정입니다.

#### 쿼리 코멘트 cursor.comment()

MongoDB의 쿼리는 BSON 포맷을 사용하기 때문에 SQL 문법처럼 주석을 사용할 수 없습니다. FIND 쿼리의 옵션으로 코멘트를 추가해두면 슬로우 쿼리 로그에 기록된 쿼리가 프로그램의 어느 모듈에서 실행된 것인지 쿼리 코멘트로 추적할 수 있게 해줍니다.

#### 실행 계획 cursor.explain()

FIND 쿼리의 실행 계획을 확인하는 커서 명령입니다.

#### 힌트 cursor.hint()

FIND 쿼리가 적절한 인덱스를 선택하지 못할 경우에 옵티마이저가 특정 인덱스를 사용하도록 사용자가 직접 힌트를 제공할 수 있습니다.

그 밖에도 많은 커서 옵션이 있으니 메뉴얼([https://docs.mongodb.com/manual/reference/method/js-cursor/](https://docs.mongodb.com/manual/reference/method/js-cursor/ "https://docs.mongodb.com/manual/reference/method/js-cursor/"))에서 한번 쯤 이런 기능이 있다고 봐두면 좋을것 같습니다.

MongoDB에서 장시간 실행되는 find()와 aggregate() 명령의 경우 MongoCursorNotFound Exception이 발생하며 에러메세지를 발생합니다. 이 두 명령은 커서를 반환하는데, 일정 시간이 지나면 자동으로 타임아웃되어 자동으로 MongoDB에서 삭제됩니다. 커서의 생성이 완료된 시점이 아닌 처음 생성된 시점으로부터 지정된 시간이 지나면 자동으로 삭제됩니다. 디폴트 타임아웃(10분)이상 실행되는 경우 결과 도큐먼트를 읽기도 전에 MongoDB에서 커서가 제거되는 것 입니다. 이런 문제를 해결하기 위해 find() 명령을 실행할때 noCursorTimeout() 옵션을 설정하면 됩니다.

```javascript
db.collection.find().noCursorTimeout()
```

### FindAndModify

MongoDB에서는 여러 명령을 하나의 트랜잭션으로 묶어서 사용할 수 없기 때문에, 변경 직전이나 직후의 도큐먼트의 데이터를 확인하는 것이 어렵습니다. FindAndModify 명령은 검색 조건에 일치하는 도큐먼트를 검색하고, 그 도큐먼트를 변경하거나 삭제하는 후속 오퍼레이션을 설정할 수 있습니다.  FindAndModify 명령의 조건에 일치하는 도큐먼트가 여러 건일 수도 있지만, FindAndModify 명령은 한 번에 하나의 도큐먼트만 변경하고, 변경된 또는 변경전의 도큐먼트를 반환합니다.  FindAndModify 명령의 조건에 일치하는 도큐먼트가 여러건일때, 특정 도큐먼트만 변경하거나 삭제하고 싶다면 sort옵션을 사용하면 됩니다.

기본적으로 find() 명령의 옵션이나 update() 명령의 옵션을 이용할 수 있습니다. 하지만 FindAndModify를 사용하는 방법은 "majority" 레벨의 WriteConcern이 설정되야 하므로 "majority" 레벨의 ReadConcern을 사용하는 것보다 높은 비용이 발생하며, 굳이 FindAndModify 사용하기보다는 ReadConcern 옵션을 활용하는 방법을 고려하는 편이 좋습니다.

#### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
