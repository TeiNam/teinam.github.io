---
date: 2021-03-04 02:18:09 +0900
title: "MongoDB의 읽기 연산"
category: mongodb
excerpt: "읽기 연산은 쿼리로 도큐먼트를 돌려주는 핵심 기능입니다. find() 의 조건과 프로젝션, 커서 옵션, readConcern 과 readPreference 를 MongoDB 8.0 문서 기준으로 정리합니다."
updated: 2026-09-20
---

읽기 연산은 쿼리로 데이터를 돌려주는 핵심 기능이고, 하나의 쿼리는 하나의 컬렉션에서 도큐먼트를 고릅니다. 어떤 도큐먼트를 돌려줄지 가리는 기준(criteria) 또는 조건(conditions)을 쿼리에 지정할 수 있고, 돌려받을 필드를 고르는 프로젝션(projection)도 함께 쓸 수 있습니다. 프로젝션으로 필요한 필드만 남기면 서버가 네트워크로 내보내는 데이터가 줄어듭니다.

읽기 연산을 이해할 때 함께 보아야 하는 주제는 세 가지입니다.

- 커서(cursor): 쿼리는 결과 집합을 한 배치씩 넘겨주는 커서를 돌려줍니다.
- 쿼리 최적화: 실행 계획을 확인하고 인덱스를 맞춥니다.
- 분산 쿼리: 레플리카 셋과 샤드 클러스터에서 읽기가 어디로 가는지 달라집니다.

> **NOTE** — 이 글의 예제는 `mongosh` 기준입니다. 레거시 `mongo` 셸은 MongoDB 6.0 에서 제거됐습니다. 버전에 따라 달라지는 내용은 MongoDB 8.0 문서를 기준으로 적었습니다.

### 쿼리 특성

MongoDB의 쿼리는 다음 성질을 공통으로 가집니다.

- 하나의 쿼리는 하나의 컬렉션만 대상으로 합니다.
- `limit`, `skip`, 정렬 순서로 쿼리 결과를 조정할 수 있습니다.
- `sort()` 를 지정하지 않으면 반환되는 도큐먼트 순서는 정해져 있지 않습니다.
- 기존 도큐먼트를 갱신하는 명령은 대상을 고를 때 읽기와 같은 쿼리 문법을 씁니다.
- 집계 파이프라인의 `$match` 단계도 같은 쿼리 문법을 씁니다.

### FIND

`find()` 는 MongoDB에서 데이터를 조회하는 명령이고, 조건과 옵션을 가장 다양하게 붙일 수 있는 명령입니다.

`find()` 는 인자를 두 개 받습니다. 첫 번째 인자에는 도큐먼트를 걸러낼 조건을, 두 번째 인자에는 클라이언트로 돌려받을 필드를 적습니다. 두 인자 모두 선택이므로 아무 인자 없이 `find()` 만 쓸 수도 있습니다.

```javascript
db.users.find()
db.users.find( {} )
```

위 명령은 users 컬렉션의 모든 도큐먼트를 돌려줍니다. 프로젝션을 지정하지 않았으므로 모든 필드를 그대로 돌려줍니다.

`find()` 는 커서를 돌려주지만 `findOne()` 은 조건에 맞는 도큐먼트 하나를 바로 돌려줍니다. `aggregate()` 역시 커서를 돌려주므로 배치 단위로 결과를 읽습니다.

```javascript
db.users.find( {}, { _id: 0, name: 1, score: 1 } )
```

두 번째 인자의 필드 값에 1과 0을 줘서 돌려받을 필드와 제외할 필드를 정합니다. 위 쿼리는 \_id 는 제외하고 name, score 만 돌려받겠다는 뜻입니다. 이렇게 반환 필드를 고르는 것을 BSON(Binary JSON, MongoDB의 바이너리 데이터 포맷) 쿼리에서 프로젝션이라고 합니다.

프로젝션에서는 1과 0을 섞어 쓸 수 없습니다.

```javascript
db.users.find( {}, { name: 0, score: 1 } )
```

위와 같은 쿼리는 쓸 수 없습니다.

일부 필드에만 프로젝션을 지정하면 나머지 필드는 반대값이 자동으로 적용됩니다.

```javascript
db.users.find( {}, { username: 1 } )
```

```javascript
[
  { _id: ObjectId('602db73fb44cb815df1453e4'), username: 'Alice' },
  { _id: ObjectId('602db814b44cb815df1453e6'), username: 'rabbit' },
  { _id: ObjectId('602db888b44cb815df1453e8'), username: 'Elsa' },
  { _id: ObjectId('602db907b44cb815df1453ea'), username: 'Queen_Anna' },
  { _id: ObjectId('602dbb23b44cb815df1453ec'), username: 'Harry' },
  { _id: ObjectId('602dc053b44cb815df1453f8'), username: 'hermione' },
  { _id: ObjectId('602dcb49b44cb815df1453fa'), username: 'ronweasley' }
]
```

username 에 1을 주면 위처럼 \_id 와 username 만 돌려받습니다. 반대로 0을 주면 username 만 빠진 나머지 필드를 돌려받습니다.

```javascript
db.users.find( {}, { username: 0 } )
```

```javascript
[
  { _id: ObjectId('602db73fb44cb815df1453e4'), email: 'alice@naxer.com' },
  { _id: ObjectId('602db814b44cb815df1453e6'), email: 'rabbit@naxer.com' }
]
```

1과 0을 함께 쓰지 못하는 이유가 여기서 보입니다. 포함 목록과 제외 목록이 동시에 성립할 수 없기 때문입니다. \_id 만 예외인데, \_id 는 모든 쿼리에서 기본으로 따라오는 필드라서 \_id 를 빼고 다른 필드를 골라 받는 조합은 허용됩니다.

```javascript
db.users.find( {}, { _id: 0, name: 1 } )
```

> **NOTE** — 레거시 셸에서 쓰던 `pretty()` 는 `mongosh` 에서 출력 형식을 바꾸지 않습니다. 공식 문서도 `pretty()` 가 레거시 `mongo` 셸에서만 형식을 바꾼다고 적습니다.

### FIND 연산자

MongoDB 매뉴얼은 쿼리 조건에 쓰는 연산자(쿼리 술어, query predicate)를 일곱 갈래로 묶습니다.

- 비교 연산자
- 논리 연산자
- 데이터 타입 연산자
- 기타 연산자
- 공간 연산자
- 배열 연산자
- 비트 연산자

MongoDB의 쿼리 조건은 모두 JSON 포맷으로 적어야 하므로 SQL의 `=`, `>`, `<`, `IN`, `NOT IN` 같은 기호를 그대로 쓸 수 없습니다. 대신 `$` 로 시작하는 연산자를 JSON 문법 안에서 씁니다. 연산자는 대소문자를 구분합니다. 표기법만 다르고 의미는 RDBMS의 연산자와 같습니다.

#### 비교 연산자

| 연산자 | 설명 |
| --- | --- |
| `$eq` | SQL `=`. 값이 같은지 비교합니다. 보통 생략하고 씁니다. |
| `$gt` | SQL `>`. 지정한 값보다 큰지 비교합니다. |
| `$gte` | SQL `>=`. 지정한 값보다 크거나 같은지 비교합니다. |
| `$lt` | SQL `<`. 지정한 값보다 작은지 비교합니다. |
| `$lte` | SQL `<=`. 지정한 값보다 작거나 같은지 비교합니다. |
| `$ne` | SQL `<>`. 값이 같지 않은지 비교합니다. |
| `$in` | SQL `IN`. 배열에 주어진 값 중 하나와 일치하는지 비교합니다. |
| `$nin` | SQL `NOT IN`. 배열에 주어진 어떤 값과도 일치하지 않는지 비교합니다. |

#### 논리 연산자

| 연산자 | 설명 |
| --- | --- |
| `$or` | 배열로 주어진 표현식 중 하나라도 일치하면 반환합니다. |
| `$and` | 배열로 주어진 표현식을 모두 만족해야 반환합니다. |
| `$not` | 표현식의 부정 연산을 수행합니다. |
| `$nor` | 배열로 주어진 표현식 어디에도 일치하지 않아야 반환합니다. |

```javascript
// name 이 matt 이거나 score 가 90 보다 큰 도큐먼트
db.users.find( { $or: [ { name: "matt" }, { score: { $gt: 90 } } ] } )

// name 이 matt 이고 score 가 90 보다 큰 도큐먼트
db.users.find( { $and: [ { name: "matt" }, { score: { $gt: 90 } } ] } )

// score 가 90 보다 크지 않은 도큐먼트
db.users.find( { score: { $not: { $gt: 90 } } } )

// name 이 matt 도 아니고 score 도 90 이 아닌 도큐먼트
db.users.find( { $nor: [ { name: "matt" }, { score: 90 } ] } )
```

`$nor` 는 해당 필드가 아예 없는 도큐먼트도 조건을 만족한 것으로 봅니다.

`find()` 에 나열한 조건은 기본적으로 AND 로 해석됩니다. 여러 조건을 OR 로 묶으려면 `$or` 를 명시해야 하고, `$and` 와 `$or` 를 섞어 복잡한 조건도 만들 수 있습니다.

```sql
SELECT * FROM inventory WHERE status = 'A' AND (qty < 30 OR item LIKE 'p%');
```

```javascript
db.inventory.find( {
    status: "A",
    $or: [ { qty: { $lt: 30 } }, { item: /^p/ } ]
} )
```

#### 데이터 타입 연산자

필드가 있는지, 어떤 타입인지 비교하는 연산자입니다.

| 연산자 | 설명 |
| --- | --- |
| `$exists` | 도큐먼트가 해당 필드를 가지고 있는지 확인합니다. |
| `$type` | 필드의 데이터 타입을 비교합니다. |

```javascript
db.users.find( { name: { $exists: true } } )
db.users.find( { name: { $type: "string" } } )
```

타입별 숫자 코드와 이름은 [$type 문서](https://www.mongodb.com/docs/manual/reference/operator/query/type/)에서 확인할 수 있습니다.

#### 기타 연산자

값을 계산하거나 표현식으로 평가하는 연산자가 이 갈래에 모여 있습니다.

| 연산자 | 설명 |
| --- | --- |
| `$expr` | 집계 표현식을 쿼리 조건에서 사용합니다. |
| `$jsonSchema` | 주어진 JSON 스키마로 도큐먼트를 검증합니다. |
| `$mod` | 모듈러(%) 연산 결과를 비교합니다. |
| `$regex` | 정규 표현식 비교를 수행합니다. |
| `$where` | 자바스크립트 표현식에 일치하는 도큐먼트를 돌려줍니다. |

```javascript
// score 를 10 으로 나눈 나머지가 0 인 도큐먼트
db.users.find( { score: { $mod: [ 10, 0 ] } } )

// 정규 표현식 — 두 표기는 같은 결과입니다
db.users.find( { name: { $regex: "^matt" } } )
db.users.find( { name: /^matt/ } )

// 같은 도큐먼트의 두 필드를 비교합니다
db.users.find( { $expr: { $gt: [ "$low_score", "$high_score" ] } } )
```

> **WARNING** — MongoDB 8.0 부터 서버 사이드 자바스크립트 함수(`$accumulator`, `$function`, `$where`)는 deprecated 이고, 실행하면 서버가 경고를 로그에 남깁니다. `$where` 는 자바스크립트를 평가하므로 인덱스를 쓸 수 없어 컬렉션 스캔이 필요합니다. 공식 문서는 자바스크립트를 실행하지 않는 `$expr` 을 먼저 쓰고, 사용자 정의 표현식이 꼭 필요하면 `$function` 을 쓰라고 권합니다.

전문 검색은 텍스트 인덱스를 만든 컬렉션에서 `$text` 로 수행합니다.

```javascript
db.movies.createIndex( { title: "text", fullplot: "text" } )
db.movies.find( { $text: { $search: "baseball" } } )
```

한 쿼리에 `$text` 는 한 번만 쓸 수 있고, `$nor` 나 `$elemMatch` 안에서는 쓸 수 없습니다. 뷰(view)도 `$text` 를 지원하지 않고, `$text` 가 있는 쿼리에는 `hint()` 로 인덱스를 지정할 수 없습니다. 기본적으로 점수 순으로 정렬하지 않으므로 정렬이 필요하면 `$meta: "textScore"` 를 씁니다. Atlas 에서는 공식 문서가 Atlas Search 를 권합니다.

#### 배열 연산자

| 연산자 | 설명 |
| --- | --- |
| `$all` | 배열 필드가 지정한 요소를 모두 가지고 있는지 비교합니다. 다른 요소가 더 있어도 반환합니다. |
| `$elemMatch` | 배열 요소 하나가 지정한 조건을 모두 만족하는지 비교합니다. |
| `$size` | 배열의 요소 개수를 비교합니다. |

```javascript
db.users.find( { tags: { $all: [ "book", "music" ] } } )
```

배열 필드에 범위 조건을 걸 때는 `$elemMatch` 가 필요합니다. `$elemMatch` 는 배열 요소 하나가 조건을 모두 만족할 때만 도큐먼트를 돌려줍니다.

```javascript
db.users.find( { scores: { $elemMatch: { $gt: 80, $lt: 90 } } } )
```

위 쿼리는 80 보다 크고 90 보다 작은 값을 가진 요소가 있는 도큐먼트만 돌려줍니다. `$elemMatch` 없이 `{ scores: { $gt: 80, $lt: 90 } }` 로 적으면 한 요소는 80 보다 크고 다른 요소는 90 보다 작기만 해도 조건이 성립합니다. 단순 일치 비교라면 `$elemMatch` 없이 써도 결과가 같으므로, 결과가 같다면 읽기 쉬운 쪽으로 적는 편이 낫습니다.

#### 비트 연산자

| 연산자 | 설명 |
| --- | --- |
| `$bitsAllSet` | 지정한 비트 위치가 모두 1 인지 비교합니다. |
| `$bitsAnySet` | 지정한 비트 위치 중 하나라도 1 인지 비교합니다. |
| `$bitsAllClear` | 지정한 비트 위치가 모두 0 인지 비교합니다. |
| `$bitsAnyClear` | 지정한 비트 위치 중 하나라도 0 인지 비교합니다. |

### FIND 조건

`find()` 로 데이터를 찾을 때 가장 중요한 일은 대상을 걸러낼 조건을 정하는 것입니다. MongoDB의 도큐먼트는 RDBMS의 행처럼 고정된 형태가 아니라서 배열이나 서브 도큐먼트를 조건으로 쓸 수 있습니다.

그만큼 도큐먼트가 복잡해지기 쉽고, 도큐먼트가 복잡해지면 쿼리도 복잡해져서 어떤 인덱스를 쓸지 눈으로 가늠하기 어려워집니다. 사람에게만 어려운 것이 아니라 옵티마이저에게도 마찬가지이므로 데이터 모델과 도큐먼트 포맷은 단순하게 유지하는 편이 좋습니다.

한 필드에 여러 조건을 걸 때는 조건을 하나의 서브 도큐먼트로 묶어야 합니다.

```javascript
db.users.find( { name: { $gte: "m" }, name: { $lte: "u" } } )
```

위 쿼리는 name 이 m 이상이고 u 이하인 도큐먼트를 찾으려는 의도지만 그대로 동작하지 않습니다. 같은 필드 이름을 두 번 적으면 앞의 조건이 버려지고 뒤의 조건만 남기 때문입니다. 원하는 결과를 얻으려면 연산자를 하나의 서브 도큐먼트로 묶습니다.

```javascript
db.users.find( { name: { $gte: "m", $lte: "u" } } )
```

조건을 따로 나열하고 싶다면 `$and` 로 각각을 별개의 도큐먼트로 만듭니다.

```javascript
db.users.find( { $and: [ { name: { $gte: "m" } }, { name: { $lte: "u" } } ] } )
```

논리 연산자를 쓰지 않은 조건은 모두 AND 로 해석되므로 아래 두 쿼리는 같습니다.

```javascript
db.users.find( { name: "Alice", score: 90 } )
db.users.find( { $and: [ { name: "Alice" }, { score: 90 } ] } )
```

`$and` 를 넣으면 쿼리가 길어지고 읽기 어려워지므로, AND 로 이어지는 조건은 나열하는 형태로 씁니다.

#### 서브 도큐먼트 필드 검색 쿼리

```javascript
db.users.find( { contact: { type: "office", phone: "02-0000-0000" } } )
db.users.find( { "contact.type": "office", "contact.phone": "02-0000-0000" } )
```

서브 도큐먼트에 다른 필드가 없다면 두 쿼리는 같은 결과를 돌려주므로 같은 쿼리처럼 보입니다. 하지만 서브 도큐먼트에 필드가 하나 추가되면 첫 번째 쿼리는 아무것도 돌려주지 못합니다. 첫 번째 쿼리는 서브 도큐먼트 전체가 조건과 완전히 같아야 하고, 두 번째 쿼리는 서브 도큐먼트 안의 개별 필드를 비교하기 때문에 다른 필드가 늘어도 영향을 받지 않습니다.

인덱스도 같은 규칙을 따릅니다. 서브 도큐먼트 안의 필드로 조회하려면 contact 자체가 아니라 `"contact.type"`, `"contact.phone"` 에 인덱스를 만들어야 합니다.

#### 배열 필드 검색 쿼리

배열 필드에는 값이 나열된 단순 배열(Array of Element)과 요소가 서브 도큐먼트인 도큐먼트 배열(Array of Sub-Document)이 있습니다.

단순 배열입니다.

```javascript
{
  scores: [ 85, 90, 71 ]
}
```

도큐먼트 배열입니다.

```javascript
{
  name: "Alice",
  contact: [
    { type: "office", phone: "02-0000-0000" },
    { type: "home", phone: "031-000-0000" }
  ]
}
```

도큐먼트 배열에 범위 조건을 걸 때도 `$elemMatch` 를 써야 합니다.

```javascript
db.users.find( { contact: { $elemMatch: { type: "office", phone: { $gt: "02" } } } } )
```

`explain()` 으로 실행 계획을 보면 조건이 어떻게 풀리는지 확인할 수 있습니다. `$elemMatch` 없이 도큐먼트 배열을 조회하면 각 필드에 `$eq` 조건이 개별로 붙고, `$elemMatch` 를 쓰면 요소 하나에 대한 `$and` 조건이 붙습니다. 단순 일치 검색이라면 `$elemMatch` 가 없어도 되지만 범위 검색에는 필요합니다.

### 인덱스 필드 순서 — ESR 지침

여러 조건과 정렬이 섞인 쿼리에 복합 인덱스를 만들 때, MongoDB 매뉴얼은 ESR(Equality, Sort, Range) 지침을 제시합니다.

```javascript
db.songs.find( { seconds: { $lt: 400 }, genre: "rock" } ).sort( { rating: 1 } )
```

이 쿼리에서 genre 는 동등 비교, rating 은 정렬, seconds 는 범위 조건입니다. 지침에 따르면 인덱스 키는 다음 순서가 됩니다.

```javascript
{ genre: 1, rating: 1, seconds: 1 }
```

동등 비교 필드는 항상 앞에 둡니다. 동등 조건이 앞에 오면 뒤따르는 인덱스 필드가 정렬된 상태로 남기 때문입니다. 그 뒤는 상황에 따라 갈립니다. 메모리 정렬을 피하는 것이 중요하면 정렬 필드를 범위 필드 앞에 두고(ESR), 쿼리의 범위 조건이 매우 선택적이면 범위 필드를 정렬 필드 앞에 둡니다(ERS).

연산자 분류에 주의할 점이 있습니다. `$ne`, `$nin`, `$regex` 는 동등이 아니라 범위 연산자로 취급됩니다. `$in` 은 단독으로 쓰이면 동등 비교처럼 동작하지만, `sort()` 와 함께 쓸 때 배열 요소가 200개 미만이면 동등 조건처럼, 200개 이상이면 범위 조건처럼 동작합니다. 공식 문서는 이 200 이라는 경계가 버전에 따라 달라질 수 있다고 밝히고 있습니다.

### 커서(Cursor)

`find()` 는 항상 커서를 돌려주고, 커서로 결과 도큐먼트를 하나씩 읽습니다. 커서는 결과를 읽는 통로일 뿐 아니라 정렬, 건너뛰기, 개수 제한 같은 기능도 제공합니다. [커서 메서드 문서](https://www.mongodb.com/docs/manual/reference/method/js-cursor/)에 전체 목록이 있고, 여기서는 자주 쓰는 것만 짚습니다.

커서는 결과를 배치 단위로 돌려줍니다. `find()` 와 `aggregate()` 의 첫 배치는 기본 101건이고, 이후 `getMore` 로 받아오는 배치에는 건수 기본값이 없어 16 MiB 메시지 크기 제한만 걸립니다. `mongosh` 는 한 번에 20건씩 화면에 출력하고, 이 값은 `config.set("displayBatchSize")` 로 바꿉니다.

#### 데이터 정렬 cursor.sort()

결과를 정렬하려면 `sort()` 를 씁니다. 정렬 조건에 따라 실행 계획이 달라지므로 쿼리를 실행하는 시점에 함께 지정해야 합니다.

`sort()` 는 정렬할 필드 목록을 인자로 받습니다. 오름차순은 1, 내림차순은 -1 입니다.

```javascript
db.users.find().sort( { name: 1, scores: -1 } )
```

인덱스로 정렬 순서를 얻을 수 있으면 데이터 크기나 정렬용 메모리와 무관하게 정렬된 결과를 받습니다. 인덱스를 쓸 수 없으면 서버가 결과를 메모리에 모아 정렬하는 블로킹 정렬을 수행합니다. `explain()` 결과에 `SORT` 단계가 있으면 이 경우입니다.

블로킹 정렬의 메모리 한계는 100 MB 입니다. 한계를 넘었을 때의 동작은 `allowDiskUseByDefault` 파라미터가 결정합니다. MongoDB 6.0 부터 이 파라미터의 기본값이 `true` 이므로, 100 MB 를 넘는 단계는 기본적으로 임시 파일을 디스크에 쓰면서 계속 진행합니다. 특정 명령에서 디스크 사용을 막고 싶으면 `allowDiskUse: false` 를 주는데, 이때는 한계를 넘는 순간 쿼리가 실패합니다.

```javascript
// 정렬 대상을 줄여 top-k 정렬을 유도합니다
db.orders.find().sort( { amount: -1 } ).limit( 10 )

// 디스크로 넘기지 않고 실패시킵니다
db.orders.find().sort( { amount: -1 } ).limit( 10 ).allowDiskUse( false )
```

정렬 비용을 줄이는 방법은 두 가지입니다. 정렬이 인덱스를 타게 만들거나, `limit()` 으로 정렬할 데이터 양을 줄이는 것입니다. `allowDiskUse()` 는 `find()` 에도 있으므로 디스크 사용만을 위해 집계 명령으로 바꿀 필요는 없습니다.

결과를 끝까지 읽지 않을 커서는 닫아 두는 편이 좋습니다. 커서를 방치하면 서버가 유휴 커서를 정리할 때까지 자원을 붙잡고 있습니다.

`cursorTimeoutMillis` 는 유휴 커서의 제한 시간이고 기본값은 10분입니다. 세션에 속하지 않은 커서는 이 시간이 지나면 서버가 닫고, 배치를 한 번 돌려줄 때마다 시간이 다시 연장됩니다. 수동으로 닫을 때는 `killCursors` 를 씁니다.

세션 쪽 제한 시간은 따로 있습니다. 드라이버와 `mongosh` 는 모든 연산을 세션에 묶고, 세션이 30분 넘게 유휴 상태면 서버가 만료로 표시한 뒤 그 세션의 진행 중인 연산과 열린 커서를 함께 죽입니다. `noCursorTimeout()` 을 지정한 커서도 여기서는 예외가 아니므로, 한 배치를 처리하는 데 30분 이상 걸리면 다음 배치를 요청할 때 오류를 받습니다.

```javascript
db.collection.find().noCursorTimeout()
```

배치 처리가 길어질 수 있다면 `Mongo.startSession()` 으로 명시적 세션을 열고 `refreshSessions` 명령으로 주기적으로 세션을 갱신합니다. 세션 제한 시간의 기본값은 `localLogicalSessionTimeoutMinutes` 파라미터에 30분으로 잡혀 있습니다.

#### 콜레이션 변경 cursor.collation()

문자열을 비교할 때 사용할 콜레이션을 지정합니다. 인덱스의 콜레이션과 쿼리의 콜레이션이 다르면 그 인덱스를 쓸 수 없으므로, 쿼리마다 콜레이션을 명시하는 방식은 권할 만하지 않습니다. 컬렉션과 인덱스의 콜레이션을 같게 맞추는 편이 좋습니다.

#### Read Concern cursor.readConcern()

MongoDB의 복제는 비동기로 동작하므로 레플리카 셋의 어느 멤버에서 읽느냐에 따라 결과가 달라질 수 있습니다. readConcern 은 이 상황에서 어느 수준까지 확정된 데이터를 읽을지 정하는 옵션입니다. writeConcern 과 달리 쓰기 승인 조건이 아니라 읽기가 무엇을 볼 수 있는지를 제어합니다.

레벨은 다섯 가지입니다.

- **local:** 해당 노드가 가진 데이터를 그대로 돌려줍니다. 과반 기록을 확인하지 않으므로 읽은 데이터가 롤백될 수 있습니다. causally consistent 세션과 트랜잭션에서 쓸 수 있습니다.
- **available:** 과반 기록을 확인하지 않고 돌려주며, 샤드 컬렉션에서는 청크 이동 후 남은 고아 도큐먼트(orphaned document)까지 돌려줄 수 있습니다. 지연이 가장 낮은 대신 일관성이 가장 약하고, causally consistent 세션과 트랜잭션에서는 쓸 수 없습니다. 고아 도큐먼트를 피해야 한다면 local 같은 다른 레벨을 씁니다.
- **majority:** 레플리카 셋의 과반이 승인한 데이터만 돌려줍니다. 각 멤버는 majority-commit point 기준의 인메모리 뷰에서 읽습니다. 공식 문서는 majority 가 다른 레벨과 성능이 비슷하며 쿼리 성능을 떨어뜨리지 않고 클라이언트로 무엇이 돌아가는지만 바꾼다고 적습니다. WiredTiger 스토리지 엔진이 필요합니다.
- **linearizable:** 읽기가 시작되기 전에 완료된 과반 승인 쓰기를 모두 반영합니다. 프라이머리에서만 쓸 수 있고, 단일 도큐먼트를 유일하게 식별하는 필터에만 보장이 적용되며, 집계의 `$out`·`$merge` 와는 함께 쓸 수 없습니다. 과반 멤버가 사라졌을 때 무한정 대기하지 않도록 `maxTimeMS` 를 함께 주라고 문서가 권합니다.
- **snapshot:** 최근 과거의 한 시점에 과반이 커밋한 데이터의 스냅샷에서 읽습니다. 트랜잭션 안의 모든 읽기에 쓸 수 있고, 트랜잭션 밖에서는 `find`, `aggregate`, 그리고 샤딩되지 않은 컬렉션의 `distinct` 에서 쓸 수 있습니다.

기본값은 프라이머리와 세컨더리 모두 local 입니다. 명시하지 않은 연산은 전역 기본값을 물려받고, 전역 기본값은 `setDefaultRWConcern` 명령으로 설정합니다. 트랜잭션은 local, majority, snapshot 만 지원하고, 레벨은 개별 연산이 아니라 트랜잭션 단위로 지정합니다. 트랜잭션 안에서는 컬렉션·데이터베이스 레벨 설정이 무시됩니다.

```javascript
db.restaurants.find( { _id: 5 } ).readConcern("linearizable").maxTimeMS(10000)
```

> **IMPORTANT** — MongoDB 5.0 부터 `enableMajorityReadConcern` 과 `--enableMajorityReadConcern` 은 변경할 수 없고 항상 `true` 입니다. majority 레벨을 쓰기 위해 별도로 켜야 하는 설정은 없습니다. PSA(Primary-Secondary-Arbiter) 구성에서 스토리지 캐시 압박을 피하려고 이 값을 끄는 우회는 이제 쓸 수 없고, 공식 문서는 PSA 성능 완화 가이드를 대신 안내합니다.

레벨을 바꾸더라도 한 가지는 남습니다. 어떤 레벨을 쓰든 특정 노드의 최신 데이터가 시스템 전체의 최신 버전이라는 보장은 없습니다.

#### Read Preference cursor.readPref()

쿼리에 따라서는 복제가 조금 지연된 세컨더리에서 읽어도 괜찮습니다. 최신 데이터가 아니어도 되고, 양이 많아 프라이머리에 부담을 주고 싶지 않은 조회가 여기에 해당합니다. readPreference 는 어느 멤버에서 읽을지 정하는 옵션이고, 모드는 다섯 가지입니다.

| 모드 | 설명 |
| --- | --- |
| `primary` | 기본값. 모든 읽기를 현재 프라이머리에서 처리합니다. |
| `primaryPreferred` | 보통 프라이머리에서 읽고, 없으면 세컨더리에서 읽습니다. |
| `secondary` | 모든 읽기를 세컨더리에서 처리합니다. |
| `secondaryPreferred` | 세컨더리에서 읽고, 가능한 세컨더리가 없으면 프라이머리에서 읽습니다. |
| `nearest` | 지연 임계값 안에 있는 멤버 중 하나에서 읽습니다. 프라이머리·세컨더리를 구분하지 않습니다. |

```javascript
db.collection.find().readPref("secondaryPreferred")
```

`primary` 를 뺀 모든 모드는 오래된 데이터를 돌려줄 수 있습니다. 세컨더리가 비동기로 복제하기 때문입니다. 지연이 심한 멤버를 피하려면 `maxStalenessSeconds` 를 지정하고, 태그 셋과 함께 쓰면 클라이언트가 먼저 지연으로 걸러낸 다음 태그로 고릅니다. `maxStalenessSeconds` 나 태그 셋을 `primary` 와 함께 지정하면 드라이버가 오류를 냅니다.

읽기를 포함하는 트랜잭션은 `primary` 로만 실행할 수 있습니다. readPreference 는 연결 문자열에도 지정할 수 있어서 레플리카 셋과 샤드 클러스터 모두 같은 방식으로 설정합니다. 다만 readPreference 는 데이터의 가시성이나 인과 일관성(causal consistency)을 바꾸지는 않습니다.

#### 쿼리 코멘트 cursor.comment()

MongoDB의 쿼리는 BSON 포맷이라 SQL처럼 주석을 달 수 없습니다. 대신 코멘트를 붙여 두면 슬로우 쿼리 로그에 남은 쿼리가 어느 모듈에서 실행된 것인지 추적할 수 있습니다.

#### 실행 계획 cursor.explain()

쿼리의 실행 계획을 확인합니다. 상세 수준(verbosity)은 세 가지이고 기본값은 `queryPlanner` 입니다. 실행 통계가 필요하면 `executionStats`, 후보 계획들의 부분 실행 정보까지 보려면 `allPlansExecution` 으로 실행합니다.

계획은 단계(stage) 트리로 표시되고, 각 단계는 결과를 부모 노드로 넘깁니다. 단계 이름은 동작을 그대로 나타냅니다. 컬렉션 스캔은 `COLLSCAN`, 인덱스 키 스캔은 `IXSCAN`, 도큐먼트를 가져오는 단계는 `FETCH`, 인덱스로 정렬을 얻지 못한 메모리 정렬은 `SORT`, 샤드의 고아 도큐먼트를 걸러내는 단계는 `SHARDING_FILTER` 입니다. 커버드 쿼리는 `IXSCAN` 이 `FETCH` 의 하위가 아니고 `executionStats.totalDocsExamined` 가 0 인 것으로 확인합니다.

출력 구조는 쿼리 엔진에 따라 달라집니다. 클래식 엔진은 `winningPlan.stage` 아래로 `inputStage` 가 이어지고, 슬롯 기반 실행 엔진(SBE)은 `winningPlan.queryPlan` 아래에 계획 트리가 들어갑니다. MongoDB 8.0 에서는 기존 `queryHash` 와 같은 값을 담은 `planCacheShapeHash` 필드가 추가됐고, 공식 문서는 `queryHash` 를 deprecated 로 표시하며 이후 버전에서 제거한다고 안내합니다. 같은 버전에서 일반적인 쿼리 계획 단계를 건너뛰고 최적화된 인덱스 스캔을 쓰는 `EXPRESS` 단계도 추가됐습니다.

`explain` 은 플랜 캐시를 보지 않고 후보 계획을 새로 만들어 승자를 고르며, 이때 고른 계획을 캐시에 넣지도 않습니다.

#### 힌트 cursor.hint()

쿼리가 적절한 인덱스를 고르지 못할 때 사용자가 특정 인덱스를 지정합니다. 인덱스를 비교해 볼 때 유용합니다.

### FindAndModify

MongoDB는 여러 도큐먼트·컬렉션·데이터베이스·샤드에 걸친 ACID 트랜잭션을 지원하고, `findAndModify` 도 분산 트랜잭션 안에서 쓸 수 있습니다. 그래도 변경 직전이나 직후의 도큐먼트를 한 번에 받아야 하는 요구는 자주 생깁니다. `findAndModify` 는 조건에 맞는 도큐먼트를 찾아 변경하거나 삭제하고 그 도큐먼트를 돌려주는 명령입니다.

- 조건에 여러 건이 맞아도 한 건만 변경합니다. 단일 도큐먼트 변경은 원자적으로 처리됩니다.
- 기본적으로 변경 전 도큐먼트를 돌려줍니다. 변경 후 도큐먼트가 필요하면 `new: true` 를 줍니다.
- 여러 건 중 어느 도큐먼트를 바꿀지는 `sort` 로 정합니다. 안정 정렬이 아니므로 정렬 순서를 확정하려면 `_id` 처럼 값이 유일한 필드를 정렬에 포함합니다.
- `upsert: true` 는 조건에 맞는 도큐먼트가 없으면 새로 만듭니다. 유니크 인덱스가 없으면 중복 도큐먼트가 생길 수 있습니다.
- `remove` 와 `update` 중 하나는 반드시 지정해야 합니다.

```javascript
db.runCommand( {
    findAndModify: "people",
    query: { state: "active" },
    sort: { rating: 1 },
    remove: true
} )
```

`updateOne()` 과 비교하면 차이가 분명합니다. 단일 도큐먼트를 변경할 때 두 명령 모두 원자적이지만, `updateOne()` 은 조건에 맞는 첫 도큐먼트를 변경하고 연산 상태만 돌려줍니다. 여러 건 중 대상을 고르고 그 도큐먼트까지 받아야 하면 `findAndModify` 를 씁니다. 변경 후에 `find()` 로 다시 읽는 방법도 있지만, 그 사이 다른 갱신이 끼어들 수 있습니다.

`mongosh` 헬퍼인 `db.collection.findAndModify()` 는 도큐먼트만 돌려주고 명령 형태에서 받을 수 있는 `lastErrorObject` 는 돌려주지 않습니다. 트랜잭션 안에서 실행할 때는 writeConcern 을 명시하지 않고 트랜잭션 단위 설정을 따릅니다.

#### 참고 자료

도서: 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/)
