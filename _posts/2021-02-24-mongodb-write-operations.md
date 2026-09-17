---
date: 2021-02-24 15:54:27 +0900
title: "MongoDB의 쓰기 연산"
category: mongodb
excerpt: "도큐먼트 쓰기 동작 쓰기 동작은 MongoDB 인스턴스에서 데이터를 만들거나 수정하는 모든 작업을 말합니다. 쓰기 작업은 단일 컬렉션을 대상으로 하며, 단일 도큐먼트 레벨에서 원자적으로 실행됩니다. 다음은 SQL과 MongoDB의 BSON 쿼리의 비교입니다. SQL MongoDB…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — SQL 대응표와 예제 전반이 deprecated 된 `insert()`·`update()`·`remove()` 기준이라 insertOne/insertMany, updateOne/updateMany, deleteOne/deleteMany 로 바꿔야 합니다. 또한 ObjectId 는 현재 4바이트 타임스탬프 + 프로세스당 5바이트 랜덤값 + 3바이트 증가 카운터 구성이므로 머신 ID·프로세스 ID 설명은 맞지 않고, `oid.str` 도 `mongosh` 에서는 undefined 입니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## 도큐먼트 쓰기 동작

쓰기 동작은 MongoDB 인스턴스에서 데이터를 만들거나 수정하는 모든 작업을 말합니다. 쓰기 작업은 단일 컬렉션을 대상으로 하며, 단일 도큐먼트 레벨에서 원자적으로 실행됩니다.

다음은 SQL과 MongoDB의 BSON 쿼리의 비교입니다.

|  |  |
| --- | --- |
| **SQL** | **MongoDB BSON 쿼리** |
| INSERT | db.collection.insert() |
| Batched DML (배치 INSERT, UPDATE, DELETE) | db.collection.bulkWrite() |
| UPDATE  REPLACE (INSERT .. ON DUPLICATE KEY UPDATE) | db.collection.update()  db.collection.update( { }, { $set: {} }, { upsert:true } ) |
| DELETE | db.collection.remove() |
| SELECT | db.collection.find() |
| SELECT .. GROUP BY .. | db.collection.aggregate()  MapReduce |

### 삽입(INSERT)

`db.collection.insert()` 명령으로 컬렉션에 새로운 도큐먼트를 추가합니다.

```javascript
db.users.insert(            <---- collections
  {
     name: "lee",           <---- field : value            
     age: 22,               <---- field : value          
     status: "B"            <---- field : value           
  }
)
```

사용자가 \_id 필드 없이 새로운 도큐먼트를 추가할 경우, 클라이언트 라이브러리 또는 mongod 인스턴스는 \_id 필드를 추가하고 그 필드에 유일한 ObjectId를 부여합니다.

### Object ID

ObjectId는 12 byte의 Binary Data 타입을 원시(Primitive) 타입으로 사용하는 데이터 타입 입니다. ObjectId 타입은 주로 MongoDB의 프라이머리 키인 "\_id" 필드의 값으로 자주 사용됩니다. ObjectId는 아래와 같은 형식을 가지고 있습니다.

```javascript
ObjectId("602dcb49b44cb815df1453fa")
```

ObjectId의 12 byte는 다음과 같이 생성됩니다.

|  |  |
| --- | --- |
| 4 byte | Unix timestamp (초 간위의 타임스탬프) |
| 3 byte | 서버 ID (Machine identifier) |
| 2 byte | 프로세스 아이디 (리눅스의 ps -ef 로 확인할 수 있는  PID 값) |
| 3 byte | 랜덤 값부터 시작되는 카운터 (단순 증가) |

- ObjectId 의 처음 4 byte는 시간 정보를 담고 있습니다. 1970년 1월 1일 0시 0분 0초를 0으로 해서 4 byte의 정보를 담고 있으므로 2106년 2월 7일 6시 28분 15초까지 표현할 수 있습니다.
- 다음 3 byte는 Machine별 고유 id인데, 개발 언어의 Driver의 구현에 따라 다르지만, Mac address + IP 혹은 hostname을 md5 hash 값의 처음 3 byte를 가져옵니다. 동일한 Driver를 사용할 때 같은 머신이 같은 값을 유지하되 최대한 랜덤하게 분포하도록 구현됩니다.
- 다음 2 byte는 Process id 정보를 담고 있습니다. 역시 Driver별로 조금씩 생성하는 방식이 다른데, MongoDB가 가지고 있는 BSON 구현체에서는 Process id가 2 byte보다 크면 하위 2 byte만을 pid bits에 저장하고, 상위 1 byte는 machine number에 반영하지만 드라이버에 따라서는 하위 2 byte만을 process id로 저장하고 상위 1 byte는 버리는 드라이버도 있습니다.
- 마지막 3 byte는 mongos가 생성한 값으로 inc라고 합니다. 랜덤한 숫자에서 시작하여 Auto increment 되는 숫자입니다. 역시 개발언어의 Driver마다 조금씩 다르지만 0부터 시작하는 랜덤숫자를 사용하기도 하고, 단순히 랜덤하게 고른 숫자를 사용하기도 합니다.

이렇게 생성된 ObjectId가 같을 확율이 매우 적습니다. machine id로 3 byte를 사용하므로 machine id가 같을 확률은 1/16,777,215입니다. 거기에 같은 inc를 가질 확률 1/16,777,215까지 더해져 실제로 machine id가 같은 mongos에서 같은 inc를 가질 확률은 1/10,000,000이며, 여기에 서로 같은 process id로 process가 실행될 확률까지 더해져서 실제 확률은 더 낮습니다.

#### ObjectId 활용

ObjectId는 반드시 "\_id" 프라이머리 키를 위한 값으로만 사용해야 하는 것은 아니며, 사용자 필드에 랜덤한 UUID 값을 할당해야 하는 경우에도 사용할 수 있습니다. 또한 ObjectId는 멀티 쓰레드나 분산 시스템에서도 고유한 값을 보장하도록 설계됐기 때문에 일반적으로 샤딩이 적용된 MongoDB에서도 유니크한 값을 생성하는 목적으로 활용할 수 있습니다.

MongoDB에서 INSERT가 실행될 때, INSERT하는 도큐먼트에 프라이머리 키(\_id 필드)가 없을 때 MongoDB 클라이언트 드라이버나 MongoDB 라우터(mongos)에서 ObjectId를 자동으로 생성하여 추가하도록 작동합니다.

ObjectId 값은 단순히 유일성을 보장해주는 아이디 값으로서의 목적뿐만 아니라, ObjectID를 가진 도큐먼드가 언제 생성 되었는지 또는 도큐먼트의 생성 시간별 정렬 용도로도 사용할 수 있습니다. 이것은 ObjectId의 앞자리 4 byte가 타임스탬프로 구성되어 있기 때문이며, MongoDB는 16진수 문자열 포맷이나 타임스탬프 값으로 쉽게 변환할 수 있는 함수들을 자체적으로 제공합니다.

새로운 ObjectId 생성

```javascript
mongo> var oid=ObjectId()
```

생성된 ObjectId의 HexString 출력

```javascript
mongo> print(oid.str);
6035cb769913ac101626e6e9

mongo> print(oid.valueOf());
6035cb769913ac101626e6e9
```

생성된 ObjectId의 문자 포맷 출력

```javascript
mongo> print(oid.toString());
ObjectId("6035cb769913ac101626e6e9")
```

생성된 ObjectId에서 타임스탬프 부분 출력

```javascript
mongo> print(oid.getTimestamp());
Wed Feb 24 2021 12:43:50 GMT+0900 (KST)
```

이렇게 생성된 ObjectId는 프라이머리 키를 가지게되고 프라이머리 키로 쓰면 Unique 인덱스가 자동 생성됩니다.

### 수정(UPDATE)

UPDATE 명령에 대해서 MongoDB는 4가지 형태의 명령을 제공합니다.

- `db.collection.update()`
- `db.collection.updateOne()`
- `db.collection.updateMany()`
- `db.collection.replaceOne()`

UPDATE 명령은 INSERT와 달리 3개의 인자를 가지고 있습니다.

```javascript
db.collection.update(
  {name: "rastalion",                // 업데이트 대상 도큐먼트 검색 조건
  {$set: { score: 100 }},            // 업데이트 내용
  {upsert: true}                     // 도큐먼트 업데이트 옵션
)
```

첫번째 인자는 검색 조건인데 {}로 주면 모든 도큐먼트를 대상으로 합니다.

두번째 인자는 UPDATE 할 필드와 값을 넣어주는 것인데, $set 옵션이 없으면 기존 도큐먼트를 통채로 덮어써 버리기 때문에 주의해야 합니다.

세번째 인자는 UPDATE 할때 여러가지 옵션을 지정할 수 있습니다.

#### 두번째 인자의 오퍼레이터

|  |  |
| --- | --- |
| 오퍼레이터 | 설명 |
| $inc | 필드의 값을 주어진 값만큼 증가시켜서 저장하는데, 하나의 도큐먼트 내에서도 값의 조회와 저장은 원자적(Atomic)으로 처리된다. 
```javascript
db.products.update(
  { sku: "abc123" },
  { $inc: {quantity: -2, "metrics.orders": 1 }}
)
```
 |
| $mul | 필드의 값을 주어진 값만큼 배수로 지정하는데, 하나의 도큐먼트 내에서도 값의 조회와 저장은 원자적(Atomic)으로 처리된다. 
```javascript
db.products.update(
  { _id: 1 },
  { $mul: { price: 1.25 }}
)
```
 |
| $rename | 필드의 이름을 변경한다. 특정 도큐먼트의 필드명만 변경할 수도 있고, 전체 도큐먼트의 필드명을 변경할 수도 있다. 
```javascript
db.students.update({_id:1},{$rename: {"nmae":"name"}})
db.students.updateMany({},{$rename: {"nmae":"name"}})
```
 |
| $selOnInsert | $selOnInsert는 $set과 동일한 방식으로 사용하지만, upsert옵션이 true인 UPDATE 명령이 업데이트 할 도큐먼트를 찾지 못해선 INSERT를 할 때만 $selOnInsert의 내용이 적용 된다.  다음 명령에서 $selOnInsert의 defaultQty 필드의 값은 products 컬렉션에 도큐먼트를 INSERT할 때만 저장된다. 만약 \_id 필드 값이 1인 도큐먼트가 있으면 UPDATE가 실행되고 이때는 $selOnInsert 옵션이 무시된다. 
```javascript
db.products.update(
  { _id: 1 },
  {
    $set: { item: "apple" },
    $selOnInsert: { defaultQty: 100 }
  },
  { upsert: true }
)
```
 |
| $set | 도큐먼트 필드 값을 변경한다. 
```javascript
db.products.update(
  { _id: 1 },
  { $set: { item: "apple" },
  { upsert: true }
)
```
 |
| $unset | 도큐먼트 필드를 삭제한다. 
```javascript
db.products.update(
  { _id: 1 },
  { $unset: { quantity: "", instock: "" }}
)
```
 |
| $currentDate | 필드의 값을 현재 시각으로 변경한다. lastModified는 Date 타입, cancellation.date는 timestamp 타입으로 업데이트 한다. 
```javascript
db.products.update(
  { _id: 1 },
  {
    $currentDate: {
      lastModified: true,
      "cancellation.date": { $type: "timestamp" }
    },
    $set: { status: "D" }
  }
)
```
 |
| $max | $max 연산자는 지정된 값이 필드의 현재 값보다 큰 경우 필드 값을 지정된 값으로 UPDATE 한다. $max 연산자는 BSON 비교 순서를 사용하여 다른 유형의 값을 비교할 수 있다. 
```javascript
db.scores.update( 
  { _id: 1 }, 
  { $max: { highScore: 950 } }
)
```
 |
| $min | $min은 지정된 값이 필드의 현재 값보다 작은 경우 필드 값을 지정된 값으로 UPDATE 한다. $min 연산자는 BSON 비교 순서를 사용하여 다양한 유형의 값을 비교할 수 있다. 
```javascript
db.scores.update( 
  { _id: 1 }, 
  { $min: { lowScore: 150 } }
)
```
 |

#### 세번째 인자의 옵션 값

- upsert : UPDATE 명령에서만 사용 가능하며, 기본 값은 false 입니다. false인 경우 조건에 맞는 도큐먼트를 찾지 못하면 어떤 변경도 발생시키지 않습니다. true인 경우 조건에 맞는 도큐먼트가 없는 경우 새로운 도큐먼트에 INSERT 합니다.
- multi : 기본적으로 MongoDB의 UPDATE 명령은 단일 도큐먼트의 업데이트만 실행합니다. 검색 조건에 맞는 도큐먼트가 2개 이상이어도 하나만 변경합니다. 하지만 multi 옵션을 true로 주면 검색 조건이 일치하는 모든 도큐먼트를 업데이트 합니다.
- writeConcern : UPDATE 명령이 어떤 조건에서 "완료" 응답을 반환할지 결정할 수 있도록 설정하는 값입니다.
- collation : UPDATE 명령이 변경할 대상 도큐먼트를 검색할 때 사용할 문자 셋과 콜레이션을 명시합니다.

### 삭제 (REMOVE, DELETE)

도큐먼트를 삭제하는 명령어는 아래와 같이 3가지 형태의 명령으로 제공됩니다.

- `db.collection.remove()`
- `db.collection.deleteOne()`
- `db.collection.deleteMany()`

REMOVE 명령은 두개의 JSON 인자를 필요로합니다.

```javascript
db.collection.remove(
  {name: "rastalion"},                       // 삭제 대상 도큐먼트 검색 조건
  {justOne: true }                           // 도큐먼트 삭제 옵션
)
```

#### 세번째 인자의 옵션 값

- justOne : MongoDB의 REMOVE 명령은 UPDATE와 달리 여러 도큐먼트가 삭제되는 것이 기본값입니다. justOne 옵션을 주지 않으면 조건에 맞는 모든 도큐먼트를 삭제합니다. 첫번째 도큐먼트만 삭제하고자 한다면 justOne 옵션을 주면 됩니다.
- writeConcern : REMOVE 명령이 어떤 조건에서 "완료" 응답을 반환할지 결정할 수 있도록 설정하는 값입니다.
- collation : REMOVE 명령이 변경할 대상 도큐먼트를 검색할 때 사용할 문자 셋과 콜레이션을 명시합니다.

### 격리된($isolated) UPDATE와 REMOVE (4버전부터 기능 제외)

MongoDB의 쓰기 오퍼레이션은 도큐먼트 단위의 원자성(Atomicity)만 제공하기 때문에, 하나의 쓰기 오퍼레이션으로 여러 도큐먼트를 변경하거나 삭제하더라도 내부적으로 하나의 트랜잭션으로 하나의 도큐먼트만 처리하는 방식으로 동작합니다. 일반적인 쓰기 오퍼레이션으로 도큐먼트들을 변경하면 오퍼레이션이 완료되기 전에 먼저 변경된 데이터들을 다른 커넥션에서 즉시 조회가 가능합니다.

변경 중 조회를 방지하기 위해 쓰기 오퍼레이션이 완료되기 전까지 다른 커넥션이 변경 내용을 보지 못하게 하는 방법이 있습니다.

```javascript
db.users.remove( { score: { $lt: 50 }, $isolated: 1 } )

db.users.update(
  { score: {$gt: 90 }, $isolated: 1 },
  { $set: { grade: "A" }},
  { upsert: true }
)
```

### BulkWrite

BulkWrite는 위의 쓰기 작업들을 모아서 한 번에 실행할 수 있는 명령어 입니다. 하나의 컬렉션에 대해서만 데이터 변경이 가능합니다. BulkWrite로 실행할 수 있는 명령들은 다음과 같습니다.

- insertOne
- updateOne
- updateMany
- replaceOne
- deleteOne
- deleteMany

BulkWrite 작업 역시 다른 CRUD 명령들과 같인 ordered 옵션을 사용할 수 있는데, 이 때 ordered 옵션이 true 이면 중간에 작업이 실패하는 경우에 지금까지 변경된 도큐먼트는 그대로 유지하고 남은 작업은 포기하고 멈추게 됩니다. RDBMS 같은 롤백작업은 불가능합니다. ordered 옵션을 false로 설정하면 중간에 에러가 발생해도 나머지 작업을 계속 진행하며, 각 단위 작업을 여러 쓰레드로 나누어 병렬로 처리합니다.

다음은 BlukWrite의 예제입니다.

```javascript
db.follows.bulkWrite(
  [
    {
      updateOne: 
        {
          "filter": {_id: db.follows.findOne({_id:fwi_email})._id}, 
          "update": {$inc: {"counts.followers_cnt": 1}, $push: {followers: db.users.findOne({email: fwr_email}).username}}
        }
     },
     {
      updateOne: 
        {
          "filter": {_id: db.follows.findOne({_id:fwr_email})._id}, 
          "update": {$inc: {"counts.followings_cnt": 1}, $push: {followings: db.users.findOne({email: fwi_email}).username}}
        }
     }
  ]
)
```

변수 값을 받아 팔로워와 팔로잉의 배열을 업데이트하고 count 값을 1 증가하는 쿼리입니다. 여러개의 쿼리를 하나의 task로 처리 할 수 있는 것이 특징입니다.

### 배열(array)

배열은 MongoDB가 RDBMS와 차별점을 갖는 큰 특징중에 하나입니다.  PostgreSQL 같은 RDBMS는 배열 타입을 지원하긴 합니다만, 다른 MySQL이나 Oracle의 경우 지원하지 않습니다. 배열은 RDBMS로 놓고 생각했을때, Table안의 하나의 컬럼에 여러행이 아닌 하나의 행에 n개의 값을 가지는 것인데, MongoDB에서는 특별한 설정 없이 도큐먼트에 배열 타입의 데이터를 삽입하고 수정이 가능합니다.

배열을 사용하면 복잡한 객체의 계층 관계를 하나의 레코드(열)로 표현할 수 있습니다. 이 것은 자바나 파이썬 같은 최신 객체지향 언어들을 사용하는 개발자들에게 매우 편리함을 가져다 주는 요소입니다. 배열로 처리하면 하나의 도큐먼트로 처리가 가능해 한번의 쿼리로 조회하거나 변경할 수 있고, 컬렉션이 여러개 일때보다 빠르게 개발할 수도 있습니다.

반대로 주의해야 하는 점은 배열 타입의 값을 가지는 필드에서 제약사항은 유일성이 보장되지 않는 다는 점입니다. 유니크 인덱스 역시 생성할 수 없으며, 유일성을 보장해야 하는 경우 서브 도큐먼트로 처리해야합니다.

#### 배열의 업데이트

배열에 데이터를 업데이트 하는 방식에도 여러가지 오퍼레이터를 제공합니다.

|  |  |
| --- | --- |
| 이름 | 설명 |
| $ | 쿼리 조건과 일치하는 첫번째 자리 표시자 역할 |
| $[] | 쿼리 조건과 일치하는 문서에 대한 배열의 모든 요소를 업데이트하는 자리 표시자 역할 |
| $[<identifier>] | 쿼리 조건과 일치하는 문서에 대해 arrayFilters 조건과 일치하는 모든 요소를 업데이트하는 자리 표시자 역할 |
| $addToSet | 배열 안에 값이 없는 경우에만 요소들을 추가 |
| $pop | 배열의 첫번째 혹은 마지막 요소를 제거 |
| $pull | 조건에 맞는 요소들을 배열에서 제거 |
| $push | 배열에 요소를 추가 |
| $pullAll | 배열안의 모든 요소를 제거 |

배열의 업데이트 오퍼레이터들은 여러가지 수정자(Modifier)들을 가집니다.

|  |  |
| --- | --- |
| 이름 | 설명 |
| $each | $push와 $addToSet 과 함께 사용할 수 있으며, 배열에 여러개의 요소를 삽입할 때 사용 |
| $positon | $push와 함께 사용할 수 있으며 삽입될 요소의 위치를 지정할 수 있다. $position 값이 없으면 맨 끝에 삽입 |
| $slice | $push와 함께 사용할 수 있으며 배열 삽입시 요소들의 수를 제한 |
| $sort | $push와 함께 사용할 수 있으며 $push 작업중에 배열의 요소를 정렬 |

이렇게 오퍼레이터와 수정자의 조합으로 배열에 CRUD 작업을 실행할 수 있습니다.

#### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
