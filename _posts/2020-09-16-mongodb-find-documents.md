---
date: 2020-09-16 15:12:17 +0900
title: "MongoDB Document 조회하기"
category: mongodb
excerpt: "컬렉션에 넣은 도큐먼트를 꺼내오는 find() 명령을 mongosh 기준으로 살펴봅니다. 쿼리 연산자, 프로젝션, 커서까지 순서대로 다룹니다."
updated: 2026-09-20
---

컬렉션에 도큐먼트를 넣었다면 필요할 때 다시 꺼내올 수 있어야 합니다. 조회에 쓰는 명령이 `find()` 입니다.

```javascript
db.collection.find( <query>, <projection>, <options> )
```

| Parameter | Type | Description |
| --- | --- | --- |
| query | document | Optional. 쿼리 연산자로 원하는 도큐먼트를 선택합니다. 생략하거나 `{}` 를 넘기면 전체를 반환합니다. |
| projection | document | Optional. 반환할 필드를 지정합니다. 생략하면 모든 필드를 반환합니다. |
| options | document | Optional. 쿼리 동작과 결과 반환 방식을 바꾸는 옵션입니다. |

`find()` 는 도큐먼트를 직접 반환하지 않고 **커서**를 반환합니다. 공식 문서도 "`find()` 가 도큐먼트를 반환한다고 할 때 실제로 반환되는 것은 도큐먼트를 가리키는 커서"라고 적고 있습니다.

예제는 모두 `mongosh` 에서 실행합니다. 레거시 `mongo` 셸은 MongoDB 6.0 에서 제거됐기 때문에 지금 설치된 셸은 `mongosh` 입니다. 프롬프트는 접속한 데이터베이스 이름 뒤에 `>` 가 붙는 형태라서, 이 글에서는 `mydata>` 로 표기합니다.

우선 그동안 만들었던 컬렉션(Collection)이 뭐가 있는지 보겠습니다.

```bash
mydata> show collections
cappedCollection
myCollection
user
```

3개의 컬렉션이 있습니다. user 컬렉션의 모든 도큐먼트를 조회해보겠습니다.

```javascript
mydata> db.user.find()
{ _id: ObjectId('5f504be9fc907fec200b55ad'), username: 'karoid', password: '1111' }
{ _id: ObjectId('5f504dedfc907fec200b55ae'), username: 'John', password: 4321 }
{ _id: ObjectId('5f504dedfc907fec200b55af'), username: 'K', password: 4221 }
{ _id: ObjectId('5f504dedfc907fec200b55b0'), username: 'Mark', password: 5321 }
{ _id: ObjectId('5f50a274237701f054a0e52e'), userID: 'kimikimi', username: 'Kim', password: 1111 }
{ _id: ObjectId('5f51894e237701f054a0e52f'), username: 'Kei', password: 4321 }
{ _id: ObjectId('5f51894e237701f054a0e530'), username: 'Mijoo', password: 3212 }
{ _id: ObjectId('5f51894e237701f054a0e531'), username: 'Yein', password: 3123 }
```

출력 형식이 레거시 셸과 다릅니다. `mongosh` 는 객체의 키를 따옴표로 감싸지 않고 문자열 값에는 작은따옴표를 붙입니다. 키와 값 모두를 큰따옴표로 감쌌던 예전 출력이 필요하면 `mongosh --eval` 과 `EJSON.stringify()` 를 함께 씁니다.

레거시 셸에서는 명령 끝에 `pretty()` 를 붙여 읽기 좋은 형태로 바꿨습니다. `pretty()` 메서드는 `mongosh` 에도 남아 있지만 출력 형식을 바꾸지 않습니다. 공식 문서가 "`mongosh` 에서는 출력 형식을 바꾸지 않고, 레거시 `mongo` 셸에서만 출력 형식을 바꾼다"고 명시합니다.

```javascript
mydata> db.user.find().pretty()
```

## 쿼리 (Query)

쿼리는 데이터베이스에 쌓인 정보에서 원하는 것만 골라내는 필터 역할을 합니다.

다음은 유저명이 Yein인 도큐먼트를 찾아오는 쿼리입니다.

```javascript
mydata> db.user.find({ username: "Yein" })
{ _id: ObjectId('5f51894e237701f054a0e531'), username: 'Yein', password: 3123 }
```

RDBMS 에서 select 구문에 다양한 조건절과 연산자를 쓰듯이, MongoDB 에서는 연산자로 원하는 데이터를 찾습니다. 연산자는 비교(Comparison), 논리(Logical), 요소(Element), 배열(Array) 등으로 나뉩니다.

다음은 자주 쓰는 연산자입니다.

**비교(Comparison)**

| Operator | Description |
| --- | --- |
| $eq | (equals) 주어진 값과 일치하는 값 |
| $gt | (greater than) 주어진 값보다 큰 값 |
| $gte | (greater than or equals) 주어진 값보다 크거나 같은 값 |
| $lt | (less than) 주어진 값보다 작은 값 |
| $lte | (less than or equals) 주어진 값보다 작거나 같은 값 |
| $ne | (not equal) 주어진 값과 일치하지 않는 값 |
| $in | 주어진 배열 안에 속하는 값 |
| $nin | 주어진 배열 안에 속하지 않는 값 |

**논리(Logical)**

| Operator | Description |
| --- | --- |
| $or | 주어진 조건 중 하나라도 true 일 때 true |
| $and | 주어진 모든 조건이 true 일 때 true |
| $not | 주어진 조건이 false 일 때 true |
| $nor | 주어진 모든 조건이 false 일 때 true |

`$and`·`$or`·`$nor` 는 조건 배열을 받아 최상위에 놓입니다. 반면 `$not` 은 한 필드의 연산자 표현식을 뒤집는 자리에 들어갑니다.

```javascript
mydata> db.user.find({ $or: [ { password: { $lt: 3500 } }, { userID: { $exists: true } } ] })
mydata> db.user.find({ password: { $not: { $gt: 4000 } } })
```

**$regex 연산자**

`$regex` 연산자로 정규식을 써서 도큐먼트를 찾을 수 있습니다. 다음 형태 중 하나를 씁니다.

```javascript
{ <field>: { $regex: /pattern/, $options: '<options>' } }
{ <field>: { $regex: 'pattern', $options: '<options>' } }
{ <field>: { $regex: /pattern/<options> } }
{ <field>: /pattern/<options> }
```

| Option | Description |
| --- | --- |
| i | 대소문자를 구분하지 않고 매치 |
| m | `^`·`$` 앵커를 문자열 전체가 아니라 줄 단위로 매치. 앵커가 없거나 값에 `\n` 이 없으면 효과가 없습니다 |
| x | 패턴 안의 공백을 모두 무시. `#` 부터 줄 끝까지를 주석으로 취급합니다 |
| s | dot(`.`) 이 `\n` 까지 포함해서 매치 |
| u | 유니코드 옵션. 받아들이지만 중복입니다. `$regex` 는 기본적으로 UTF 를 켭니다 |

> **NOTE** — `x` 와 `s` 를 쓰려면 반드시 `$regex` 연산자 표현식에 `$options` 를 함께 써야 합니다. `i` 와 `s` 를 같이 지정하려면 두 옵션 모두 `$options` 에 넣습니다. 그리고 `$regex` 는 전역 검색 수식어 `g` 를 지원하지 않습니다.

```javascript
mydata> db.user.find({ username: { $regex: /^k/, $options: "i" } })
{ _id: ObjectId('5f504be9fc907fec200b55ad'), username: 'karoid', password: '1111' }
{ _id: ObjectId('5f504dedfc907fec200b55af'), username: 'K', password: 4221 }
{ _id: ObjectId('5f50a274237701f054a0e52e'), userID: 'kimikimi', username: 'Kim', password: 1111 }
{ _id: ObjectId('5f51894e237701f054a0e52f'), username: 'Kei', password: 4321 }
```

`$in` 안에 정규식을 넣을 때는 `$regex` 표현식을 쓸 수 없고 `/pattern/` 형태의 정규식 객체만 쓸 수 있습니다. 반대로 한 필드에 정규식과 다른 조건을 쉼표로 함께 나열할 때는 `$regex` 를 써야 합니다. MongoDB 는 6.1 부터 정규식 매칭을 PCRE2 라이브러리로 처리합니다.

**$where 연산자와 그 대안**

`$where` 연산자로 JavaScript 표현식을 조건에 쓸 수 있습니다. 다만 MongoDB 8.0 부터 서버 사이드 JavaScript 함수(`$accumulator`·`$function`·`$where`)는 deprecated 이고, 실행하면 서버가 경고 로그를 남깁니다.

공식 문서는 다음 순서로 대안을 권합니다.

- JavaScript 를 쓰지 않는 집계 연산자와 `$expr` 조합이 가장 빠릅니다. `$where` 와 달리 JavaScript 를 실행하지 않기 때문입니다.
- 직접 만든 표현식이 꼭 필요하면 `$where` 보다 `$function` 을 씁니다.

```javascript
mydata> db.user.find({ $expr: { $eq: [ "$username", "Yein" ] } })
{ _id: ObjectId('5f51894e237701f054a0e531'), username: 'Yein', password: 3123 }
```

`$where` 를 쓸 때 알아둘 제약이 있습니다. `$where` 는 인덱스를 활용하지 못하므로 단독으로 쓰면 컬렉션 스캔이 필요합니다. 그래서 표준 연산자를 최소한 하나 함께 넣어 결과 집합을 줄이라고 권합니다. MongoDB 는 `$where` 가 아닌 조건을 먼저 평가하고, 그쪽에서 일치하는 도큐먼트가 없으면 `$where` 를 평가하지 않습니다. 또 `$where` 는 최상위 도큐먼트에만 적용되며 `$elemMatch` 같은 중첩 도큐먼트 안에서는 동작하지 않습니다. 서버 사이드 스크립팅이 켜져 있어야 하고(기본값), 쓰지 않는다면 `security.javascriptEnabled` 설정이나 `--noscripting` 옵션으로 끄는 것이 안전합니다.

## 프로젝션 (Projection)

`find()` 의 두 번째 파라미터인 projection 은 쿼리 결과에서 보여줄 필드를 정합니다. 모든 필드를 불러오지 않고 원하는 필드만 가져오면 주고받는 데이터의 양이 줄어듭니다.

\_id 값은 제외하고 유저명과 패스워드만 조회하는 예제입니다.

```javascript
mydata> db.user.find( {}, { _id: false, username: true, password: true } )
{ username: 'karoid', password: '1111' }
{ username: 'John', password: 4321 }
{ username: 'K', password: 4221 }
{ username: 'Mark', password: 5321 }
{ username: 'Kim', password: 1111 }
{ username: 'Kei', password: 4321 }
{ username: 'Mijoo', password: 3212 }
{ username: 'Yein', password: 3123 }
```

다음은 유저 네임만 가져오는 프로젝션입니다. 전체 도큐먼트를 대상으로 하려면 query 파라미터를 생략하거나 빈 도큐먼트 `{}` 를 넘깁니다.

```javascript
mydata> db.user.find( {}, { _id: false, username: true } )
{ username: 'karoid' }
{ username: 'John' }
{ username: 'K' }
{ username: 'Mark' }
{ username: 'Kim' }
{ username: 'Kei' }
{ username: 'Mijoo' }
{ username: 'Yein' }
```

프로젝션 규칙은 세 가지입니다.

- 포함은 `1` 또는 `true`, 제외는 `0` 또는 `false` 로 지정합니다. 0 이 아닌 정수를 넣으면 `true` 로 취급합니다.
- `_id` 는 따로 지정하지 않아도 반환됩니다. 빼려면 `_id: 0` 을 명시해야 합니다.
- 포함과 제외를 한 프로젝션에 섞을 수 없습니다. 예외는 `_id` 뿐입니다. 포함을 나열한 프로젝션에서 명시적으로 제외할 수 있는 필드는 `_id` 하나이고, 제외를 나열한 프로젝션에서 명시적으로 포함할 수 있는 필드도 `_id` 하나입니다.

중첩 필드는 `"field.nestedfield": 1` 처럼 점 표기로 쓰거나 `{ field: { nestedfield: 1 } }` 처럼 중첩 형태로 씁니다. 정렬과 프로젝션이 같은 필드를 다룰 때는 MongoDB 가 프로젝션을 적용하기 전의 원본 값으로 정렬합니다.

프로젝션은 집계의 `$project` 단계와 문법을 맞추는 방향으로 확장됐습니다. 그래서 `find()` 와 `findAndModify()` 의 프로젝션은 집계 표현식과 문법을 받습니다. 숫자도 불리언도 아닌 리터럴(문자열, 배열, 연산자 표현식)을 값으로 주면 그 필드는 새 값으로 채워집니다. 숫자 리터럴을 그대로 넣고 싶으면 `$literal` 을 씁니다.

```javascript
mydata> db.user.find( {}, { _id: 0, username: 1, tag: "member", rank: { $literal: 5 } } )
```

배열 필드는 `$slice` 와 `$elemMatch` 로 일부만 꺼낼 수 있습니다. `$slice` 는 양수 `n` 이면 앞에서 `n` 개, 음수면 뒤에서 `n` 개를 반환하고, `$slice: [ <건너뛸 수>, <반환할 수>]` 형태로 건너뛴 뒤 개수를 지정할 수도 있습니다. 두 값 모두 반드시 적어야 합니다. `$elemMatch` 는 조건에 맞는 첫 요소만 반환합니다.

```javascript
mydata> db.posts.find( {}, { comments: { $slice: 3 } } )
mydata> db.posts.find( {}, { comments: { $slice: [ 1, 3 ] } } )
```

> **NOTE** — `$slice` 와 `$elemMatch` 는 뷰(view)에서는 쓸 수 없습니다. `$slice` 는 위치 연산자 `"field.$"` 와 함께 쓸 수 없고, 같은 프로젝션에 배열의 `$slice` 와 그 배열에 속한 필드를 동시에 넣으면 `Path collision` 오류가 납니다. 두 가지를 같이 얻어야 한다면 `aggregate()` 에서 `$project` 단계를 두 번 나눠 씁니다.

`$slice` 만 단독으로 쓴 프로젝션은 제외 프로젝션으로 취급됩니다. 그래서 중첩 도큐먼트의 배열을 자를 때, 포함 프로젝션 안에서는 그 중첩 도큐먼트의 다른 필드가 함께 반환되지 않고 제외 프로젝션에서는 함께 반환됩니다.

더 많은 쿼리·프로젝션 연산자는 MongoDB 공식 문서([쿼리 연산자 레퍼런스](https://www.mongodb.com/docs/manual/reference/operator/query/))에서 확인할 수 있습니다.

## 점 연산자

오브젝트 안에 들어 있는 값은 점 연산자로 접근합니다.

`mongosh` 는 Node.js 기반이라 `let` 으로 변수를 선언할 수 있습니다.

```javascript
mydata> let unp = { name: { username: "Yein", password: 3123 } }

mydata> unp.name
{ username: 'Yein', password: 3123 }

mydata> unp.name.username
Yein
```

`"username": "Yein"` 항목을 전부 불러오는 대신 Yein 이라는 값만 꺼내는 것입니다. 쿼리와 프로젝션에서도 같은 점 표기로 중첩 필드를 지정합니다.

## Read Concern

복제 세트에서 어느 시점의 데이터를 읽을지는 read concern 이 결정합니다. `mongosh` 에서는 커서에 `readConcern()` 을 붙입니다.

```javascript
mydata> db.user.find({ username: "Yein" }).readConcern("majority")
```

수준은 다섯 가지입니다.

| Level | 의미 |
| --- | --- |
| local | 해당 인스턴스의 데이터를 반환합니다. 과반수에 기록됐다는 보장이 없어 롤백될 수 있습니다 |
| available | local 과 같은 보장 수준이며 샤드 클러스터에서 지연이 가장 낮지만 orphan 도큐먼트를 반환할 수 있습니다 |
| majority | 복제 세트 과반수가 승인한 데이터만 반환합니다. 장애가 나도 남아 있는 데이터입니다 |
| linearizable | 읽기 시작 전에 완료된 모든 과반수 승인 쓰기를 반영합니다. 프라이머리에서만 씁니다 |
| snapshot | 최근 특정 시점의 과반수 커밋 데이터를 샤드에 걸쳐 일관되게 반환합니다 |

기본값은 `local` 이고, 프라이머리와 세컨더리 읽기에 모두 적용됩니다. 복제 세트와 샤드 클러스터는 전역 기본 read concern 을 지원하므로, read concern 을 지정하지 않은 작업의 기본값을 `setDefaultRWConcern` 명령으로 바꿀 수 있습니다. `linearizable` 은 `maxTimeMS()` 와 함께 쓰는 것을 전제로 문서화돼 있습니다. 트랜잭션에서는 `local`·`majority`·`snapshot` 만 쓸 수 있고, 수준을 트랜잭션 시작 시점에 정하므로 개별 작업에 지정한 값은 무시됩니다.

## 커서 (cursor)

커서는 쿼리 결과를 가리키는 포인터입니다. `find()` 는 도큐먼트를 직접 반환하지 않고 커서를 반환합니다. 결과 전체를 한 번에 받지 않고 필요한 만큼만 꺼내오므로 메모리 사용을 줄일 수 있습니다.

`mongosh` 에서 커서를 변수에 담으면 자동으로 순회하지 않습니다. 변수에 담지 않으면 첫 배치까지 자동으로 순회해 출력합니다.

```javascript
mydata> let cursor = db.user.find()
mydata> cursor
{ _id: ObjectId('5f504be9fc907fec200b55ad'), username: 'karoid', password: '1111' }
{ _id: ObjectId('5f504dedfc907fec200b55ae'), username: 'John', password: 4321 }
{ _id: ObjectId('5f504dedfc907fec200b55af'), username: 'K', password: 4221 }
{ _id: ObjectId('5f504dedfc907fec200b55b0'), username: 'Mark', password: 5321 }
{ _id: ObjectId('5f50a274237701f054a0e52e'), userID: 'kimikimi', username: 'Kim', password: 1111 }
{ _id: ObjectId('5f51894e237701f054a0e52f'), username: 'Kei', password: 4321 }
{ _id: ObjectId('5f51894e237701f054a0e530'), username: 'Mijoo', password: 3212 }
{ _id: ObjectId('5f51894e237701f054a0e531'), username: 'Yein', password: 3123 }
mydata> cursor.hasNext()
false
```

`find()` 를 실행하면 서버는 배치(batch)를 채울 때까지 실행한 뒤 멈춥니다. 이 멈춘 쿼리가 커서이고, 커서 ID 로 식별됩니다. 배치 크기는 BSON 최대 도큐먼트 크기인 16 MiB 로 제한되며, `find()` 와 `aggregate()` 의 기본 배치 크기는 101 개입니다. 이후 `getMore` 로 받아오는 배치는 기본 개수 제한이 없고 16 MiB 메시지 크기 제한만 적용됩니다. 배치 크기는 `cursor.batchSize()` 로 바꿉니다.

셸에 보이는 개수는 이와 별개입니다. `mongosh` 는 커서를 한 번 순회할 때 기본 20개를 출력하고, `config.set("displayBatchSize", <값>)` 으로 조절합니다. 다음 도큐먼트 하나는 `next()` 로 가져옵니다.

```javascript
mydata> let cursor = db.cappedCollection.find()
mydata> cursor
{ _id: ObjectId('5f5049adfc907fec200b5474'), x: 690 }
{ _id: ObjectId('5f5049adfc907fec200b5475'), x: 691 }
{ _id: ObjectId('5f5049adfc907fec200b5476'), x: 692 }
{ _id: ObjectId('5f5049adfc907fec200b5477'), x: 693 }
{ _id: ObjectId('5f5049adfc907fec200b5478'), x: 694 }
{ _id: ObjectId('5f5049adfc907fec200b5479'), x: 695 }
{ _id: ObjectId('5f5049adfc907fec200b547a'), x: 696 }
{ _id: ObjectId('5f5049adfc907fec200b547b'), x: 697 }
{ _id: ObjectId('5f5049adfc907fec200b547c'), x: 698 }
{ _id: ObjectId('5f5049adfc907fec200b547d'), x: 699 }
{ _id: ObjectId('5f5049adfc907fec200b547e'), x: 700 }
{ _id: ObjectId('5f5049adfc907fec200b547f'), x: 701 }
{ _id: ObjectId('5f5049adfc907fec200b5480'), x: 702 }
{ _id: ObjectId('5f5049adfc907fec200b5481'), x: 703 }
{ _id: ObjectId('5f5049adfc907fec200b5482'), x: 704 }
{ _id: ObjectId('5f5049adfc907fec200b5483'), x: 705 }
{ _id: ObjectId('5f5049adfc907fec200b5484'), x: 706 }
{ _id: ObjectId('5f5049adfc907fec200b5485'), x: 707 }
{ _id: ObjectId('5f5049adfc907fec200b5486'), x: 708 }
{ _id: ObjectId('5f5049adfc907fec200b5487'), x: 709 }
Type "it" for more
mydata> cursor.next()
{ _id: ObjectId('5f5049adfc907fec200b5488'), x: 710 }
mydata> cursor.hasNext()
true
```

`hasNext()` 는 남은 도큐먼트가 있으면 true, 없으면 false 를 반환합니다.

커서는 영원히 열려 있지 않습니다. 서버 파라미터 `cursorTimeoutMillis` 가 유휴 커서의 타임아웃을 정하고 기본값은 10분입니다. 세션 밖에서 만들어진 유휴 커서는 이 시간이 지나면 닫히고, 배치를 반환할 때마다 타임아웃이 갱신됩니다. 드라이버와 `mongosh` 는 명시적 세션 없이 커서를 열 때 암묵적 세션을 만드는데, 세션 안의 커서는 커서를 모두 소진하거나 직접 닫거나 세션을 종료하거나 세션이 만료될 때 닫힙니다. 세션 타임아웃은 `localLogicalSessionTimeoutMinutes` 가 정하며 기본값은 30분입니다.

> **NOTE** — 개수를 셀 때 쓰던 `db.collection.count()` 는 `mongosh` 에서 deprecated 로 표시돼 있습니다. `countDocuments()` 나 `estimatedDocumentCount()` 를 씁니다. 샤드 클러스터라면 `db.collection.aggregate([ { $count: "myCount" } ])` 를 권합니다. `count()` 는 쿼리 조건이 없을 때 컬렉션 메타데이터를 근거로 값을 내므로 orphan 도큐먼트를 걸러내지 못하고, 비정상 종료 뒤에는 값이 틀어질 수 있습니다. 그리고 `count` 명령과 셸 헬퍼 `cursor.count()`·`count()` 는 트랜잭션 안에서 쓸 수 없습니다.

### 정렬·건너뛰기·개수 제한

`sort()`·`skip()`·`limit()` 는 커서에 이어 붙여 씁니다. 세 메서드는 도큐먼트를 하나라도 가져오기 전에 적용해야 합니다.

```javascript
mydata> db.user.find().sort({ password: 1, _id: 1 }).skip(2).limit(3)
```

체이닝 순서는 결과에 영향을 주지 않습니다. 서버는 정렬 순서를 기준으로 skip 을 먼저 적용하고 그다음 반환 개수를 제한합니다. 즉 `skip(3).limit(6)` 과 `limit(6).skip(3)` 은 같은 결과를 냅니다.

정렬에는 결정성 문제가 있습니다. MongoDB 는 컬렉션에 도큐먼트를 특정한 순서로 저장하지 않습니다. 정렬 키에 중복 값이 있으면 그 값을 가진 도큐먼트들은 어떤 순서로도 반환될 수 있습니다. `$sort` 는 stable sort 가 아니어서 같은 정렬 키를 가진 도큐먼트의 상대 순서가 입력과 같게 유지된다는 보장도 없습니다. 정렬 기준 필드가 두 도큐먼트에 아예 없으면 두 도큐먼트의 정렬 값이 같아지므로 역시 순서가 정해지지 않습니다.

일관된 순서가 필요하면 고유한 값만 갖는 필드를 정렬 키에 하나 이상 포함시킵니다. 가장 간단한 방법은 `_id` 를 정렬에 넣는 것입니다. `_id` 는 항상 고유한 값만 갖기 때문에 같은 정렬을 여러 번 실행해도 순서가 같습니다. `skip()` 을 페이지네이션에 쓸 때 이 점이 특히 중요합니다. 쓰기가 계속 들어오는 컬렉션이라면 중복 값이 있는 필드로 정렬한 결과가 실행마다 달라질 수 있습니다.

```javascript
mydata> db.user.find().sort({ password: 1 })        // 순서가 실행마다 달라질 수 있습니다
mydata> db.user.find().sort({ password: 1, _id: 1 })  // 순서가 고정됩니다
```

성능 쪽으로 두 가지를 더 챙겨볼 만합니다. 정렬 키를 인덱스 스캔으로 얻을 수 없으면 MongoDB 는 메모리에서 정렬합니다. `explain()` 결과에 `SORT` 단계가 있으면 메모리 정렬이 일어난 것입니다. 이때 top-k 정렬 알고리즘이 버퍼링하는 결과가 100 MB 를 넘으면 임시 파일을 디스크에 쓰고, `cursor.allowDiskUse()` 에 `false` 를 준 쿼리라면 실패합니다. 정렬 키는 최대 32개까지 지정할 수 있습니다.

그리고 `skip()` 은 결과 집합의 처음부터 훑어야 하므로 오프셋이 커질수록 느려집니다. 공식 문서는 오프셋이 커지는 페이지네이션에는 범위 쿼리를 권합니다. `_id` 처럼 한 방향으로 증가하고 고유 인덱스가 있는 필드를 골라 `$gt`(또는 `$lt`) 조건과 `limit()` 을 쓰고, 마지막으로 본 값을 다음 쿼리의 시작점으로 넘기는 방식입니다.

```javascript
mydata> db.user.find({ _id: { $gt: lastSeenId } }).sort({ _id: 1 }).limit(10)
```

다만 ObjectId 는 시간이 지나며 커지는 경향이 있을 뿐 단조 증가가 보장되지는 않습니다. 시간 해상도가 1초여서 같은 초에 만들어진 값들의 순서는 보장되지 않고, 값을 만드는 주체가 클라이언트라 시스템 시계가 서로 다를 수 있습니다.

## 커서를 이용한 도큐먼트 반환

`find()` 를 실행해도 모든 도큐먼트가 한 번에 출력되지는 않습니다. `it` 를 입력하면 다음 배치를 이어서 출력합니다.

```javascript
mydata> db.cappedCollection.find()
{ _id: ObjectId('5f5049adfc907fec200b5474'), x: 690 }
{ _id: ObjectId('5f5049adfc907fec200b5475'), x: 691 }
{ _id: ObjectId('5f5049adfc907fec200b5476'), x: 692 }
... (중략)
{ _id: ObjectId('5f5049adfc907fec200b5486'), x: 708 }
{ _id: ObjectId('5f5049adfc907fec200b5487'), x: 709 }
Type "it" for more
mydata> it
{ _id: ObjectId('5f5049adfc907fec200b5488'), x: 710 }
{ _id: ObjectId('5f5049adfc907fec200b5489'), x: 711 }
{ _id: ObjectId('5f5049adfc907fec200b548a'), x: 712 }
... (중략)
{ _id: ObjectId('5f5049adfc907fec200b549a'), x: 728 }
{ _id: ObjectId('5f5049adfc907fec200b549b'), x: 729 }
Type "it" for more
```

`toArray()` 를 사용하면 모두 불러옵니다.

```javascript
mydata> db.cappedCollection.find().toArray()
[
  { _id: ObjectId('5f5049adfc907fec200b5474'), x: 690 },
  { _id: ObjectId('5f5049adfc907fec200b5475'), x: 691 },
  { _id: ObjectId('5f5049adfc907fec200b5476'), x: 692 },
  { _id: ObjectId('5f5049adfc907fec200b5477'), x: 693 },

  ... (중략)

  { _id: ObjectId('5f5049adfc907fec200b55a8'), x: 998 },
  { _id: ObjectId('5f5049adfc907fec200b55a9'), x: 999 }
]
```

> **WARNING** — `toArray()` 는 커서가 반환하는 모든 도큐먼트를 RAM 에 올리고 커서를 소진합니다. 결과 집합이 큰 쿼리에는 쓰지 않습니다.

반대로 `forEach()` 는 도큐먼트를 하나씩 꺼내 처리합니다. 한 번에 하나만 다루므로 메모리 사용이 적습니다.

```javascript
mydata> let cursor = db.cappedCollection.find()
mydata> cursor.forEach( doc => printjson(doc) )
```

`forEach()` 는 콜백 함수를 받고, 콜백 안에서 각 도큐먼트를 처리합니다. `hasNext()` 와 `next()` 를 조합한 while 문으로 같은 일을 할 수도 있고, `mongosh` 2.1.0 부터는 `for...of` 로 커서를 순회할 수 있습니다.

```javascript
mydata> let cursor = db.cappedCollection.find()
mydata> for ( let doc of cursor ) {
...   printjson(doc)
... }
```

## 참고 자료

- 도서: 맛있는 몽고DB
- 도서: Real MongoDB
- 도서: 오픈소스 몽고DB
- 도서: MongoDB in Action
- [MongoDB Manual](https://www.mongodb.com/docs/manual/)
- [db.collection.find()](https://www.mongodb.com/docs/manual/reference/method/db.collection.find/)
- [Cursors](https://www.mongodb.com/docs/manual/core/cursors/)
