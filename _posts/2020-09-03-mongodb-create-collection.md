---
date: 2020-09-03 12:58:58 +0900
title: "MongoDB Collection 생성하기"
category: mongodb
excerpt: "MongoDB 컬렉션은 RDBMS 테이블과 비슷해 보이지만 도큐먼트마다 필드 구성이 달라도 됩니다. mongosh 기준으로 컬렉션을 만들고, 조회하고, 지우는 방법을 정리했습니다."
last_modified_at: 2026-09-20
---

데이터베이스를 만들려면 컬렉션을 만들어야 한다고 했습니다. 그럼 컬렉션이란 무엇일까요? RDBMS를 주로 다루던 분들은 테이블처럼 받아들이면 출발점으로는 충분합니다.

| RDBMS | MongoDB |
| --- | --- |
| Database | Database |
| Table | Collection |
| Row | Document |
| Column | Field |

RDBMS를 먼저 접한 사람에게 설명할 때 이런 대응표를 자주 씁니다. 하지만 둘 사이에는 분명한 차이가 있고 사용법과 접근 방법도 다릅니다.

첫째, RDBMS 테이블에는 자료형이 정해진 컬럼이 있고 그 자료형에 맞춰 데이터를 넣어야 합니다. MongoDB 컬렉션은 기본적으로 도큐먼트마다 필드 구성과 자료형이 달라도 됩니다.

둘째, RDBMS 테이블은 없는 컬럼에 값을 넣을 수 없어서 DDL로 컬럼을 먼저 추가해야 합니다. 행이 많은 테이블에서는 이 작업 자체가 조심스럽습니다. MongoDB는 도큐먼트를 넣을 때 필드를 그냥 같이 넣습니다.

아래 예제는 `mongosh`로 실행합니다. 레거시 `mongo` 셸은 6.0에서 제거됐고, 출력 형식도 `mongosh`가 다릅니다.

```javascript
db.article.insertMany([
  { title: 'hello', content: 'hi, hello1', author: 'Karoid' },
  { title: 'hi', content: 'hi, hello2', author: 'Jeong' },
  { title: 'hi', content: 'hi, hello3', author: 'Hong', comments: [
    { author: 'Karoid', content: 'hello Hong!' }
  ] }
])
```

```javascript
{
  acknowledged: true,
  insertedIds: { '0': ObjectId('...'), '1': ObjectId('...'), '2': ObjectId('...') }
}
```

`insertedIds`는 입력 배열의 위치를 키로 쓰는 도큐먼트입니다. 순서가 아닌 `ordered: false` 삽입에서 일부가 실패하면 실패한 위치의 키는 빠집니다.

```javascript
db.article.find()
```

```javascript
[
  { _id: ObjectId('...'), title: 'hello', content: 'hi, hello1', author: 'Karoid' },
  { _id: ObjectId('...'), title: 'hi', content: 'hi, hello2', author: 'Jeong' },
  {
    _id: ObjectId('...'),
    title: 'hi',
    content: 'hi, hello3',
    author: 'Hong',
    comments: [ { author: 'Karoid', content: 'hello Hong!' } ]
  }
]
```

예제 출처: 맛있는 MongoDB(도서)

세 번째 도큐먼트에만 `comments` 필드가 있습니다. 앞의 두 도큐먼트는 그 필드가 없는 상태로 그대로 남습니다.

RDBMS 테이블의 특징은 다음과 같습니다.

- 스키마를 미리 정의하고 데이터를 행과 열에 저장합니다.
- 외래 키 관계를 데이터베이스가 직접 보장합니다.
- 컬럼 자료형, 기본 키, 외래 키 제약을 위반하면 저장이 거부됩니다.
- 조인으로 여러 테이블을 묶어 질의합니다.

MongoDB 컬렉션의 특징은 다음과 같습니다.

- 데이터를 도큐먼트로 저장하고, 도큐먼트마다 필드 구성이 달라도 됩니다.
- 외래 키 제약은 없습니다. 참조 필드로 관계를 표현할 수는 있지만 정합성은 애플리케이션이 지켜야 합니다.
- `$lookup`이 SQL의 LEFT OUTER JOIN과 비슷한 일을 합니다.
- 필드 구성을 강제하고 싶으면 `validator`로 스키마 검증 규칙을 걸 수 있습니다. 규칙은 삽입과 갱신에서 검사됩니다.
- 샤딩으로 데이터를 여러 서버에 분산합니다.

## 컬렉션 생성

컬렉션을 만들고 도큐먼트를 넣어 보겠습니다.

```javascript
db.createCollection("컬렉션이름", { 옵션 })
```

옵션으로 컬렉션의 성격이 정해집니다. MongoDB 8.0의 `db.createCollection()`이 받는 옵션은 다음과 같이 묶어 볼 수 있습니다.

| 옵션 | 쓰임 |
| --- | --- |
| `capped`·`size`·`max` | capped 컬렉션. `capped: true`면 `size`는 필수입니다 |
| `validator`·`validationLevel`·`validationAction` | 스키마 검증 규칙과 위반 시 동작. 기본값은 `strict`와 `error` |
| `collation` | 기본 콜레이션. `locale`이 필수이고 생성 후에는 바꿀 수 없습니다 |
| `timeseries`·`expireAfterSeconds` | 시계열 컬렉션과 도큐먼트 만료 |
| `clusteredIndex` | 클러스터드 컬렉션(5.3에서 추가) |
| `changeStreamPreAndPostImages` | 변경 스트림의 전·후 이미지(6.0에서 추가) |
| `viewOn`·`pipeline` | 뷰의 원본 컬렉션과 파이프라인 |
| `storageEngine`·`indexOptionDefaults`·`writeConcern`·`encryptedFields` | 스토리지 엔진 설정, 인덱스 기본값, 쓰기 관심사, Queryable Encryption |

`autoIndexId`는 현재 `db.createCollection()`의 옵션 목록에 없습니다. 오래된 스크립트에 남아 있으면 걷어내면 됩니다.

capped 컬렉션부터 만들어 보겠습니다.

```javascript
db.createCollection("cappedCollection", { capped: true, size: 10000 })
```

```javascript
{ ok: 1 }
```

capped 컬렉션은 정해진 크기를 넘기면 오래된 도큐먼트부터 지우는 컬렉션입니다. `_id` 필드와 `_id` 인덱스는 기본으로 있습니다.

> **NOTE** — 공식 문서는 capped 컬렉션보다 TTL 인덱스를 먼저 고려하라고 권합니다. TTL 인덱스가 성능과 유연성 면에서 더 낫고, capped 컬렉션은 쓰기를 직렬화해서 동시 삽입·수정·삭제 성능이 일반 컬렉션보다 나쁩니다. 시계열 데이터라면 시계열 컬렉션도 선택지입니다.

capped 컬렉션에는 다음 제약이 있습니다.

- 샤딩할 수 없습니다.
- Stable API V1에서는 지원하지 않습니다.
- 트랜잭션 안에서 쓰기를 할 수 없습니다.
- `$out` 스테이지의 결과를 여기에 쓸 수 없습니다.
- 갱신은 피하는 편이 좋습니다. 갱신으로 데이터가 할당된 공간을 넘기면 동작을 예측하기 어려워집니다.
- 동시에 쓰는 클라이언트가 여러 개면 삽입 순서대로 읽힌다고 보장하지 않습니다.

`db.컬렉션이름.insertOne()`과 `db.컬렉션이름.insertMany()`로 도큐먼트를 넣습니다. 컬렉션을 미리 만들지 않아도 첫 삽입 때 자동으로 생깁니다. `db.컬렉션이름.createIndex()`도 마찬가지로 컬렉션을 만듭니다. 최대 크기나 검증 규칙 같은 옵션이 필요할 때만 `db.createCollection()`으로 명시적으로 만들면 됩니다.

```javascript
db.cappedCollection.insertOne({ x: 1 })
```

```javascript
{ acknowledged: true, insertedId: ObjectId('...') }
```

여러 건은 이렇게 넣습니다.

```javascript
db.user.insertMany([
  { username: "John", password: 4321 },
  { username: "K", password: 4221 },
  { username: "Mark", password: 5321 }
])
```

```javascript
{
  acknowledged: true,
  insertedIds: { '0': ObjectId('...'), '1': ObjectId('...'), '2': ObjectId('...') }
}
```

예제 출처: 맛있는 MongoDB(도서)

for 문으로 반복해서 넣어도 됩니다.

> **NOTE** — 트랜잭션 안에서도 컬렉션을 만들 수 있습니다. 삽입이나 `upsert: true`로 암묵적으로 만들 때는 트랜잭션이 쓸 수 있는 읽기 관심사를 아무거나 써도 되지만, `db.createCollection()`으로 명시적으로 만들 때는 읽기 관심사가 `"local"`이어야 합니다. 샤드에 걸쳐 쓰는 트랜잭션에서는 새 컬렉션을 만들 수 없습니다.

## 컬렉션 이름 제약

컬렉션 이름은 밑줄이나 문자로 시작하는 것이 좋고, 다음은 쓸 수 없습니다.

- `$` 를 포함할 수 없습니다.
- 빈 문자열이거나 널 문자를 포함할 수 없습니다.
- `system.` 으로 시작하거나 `.system.` 을 포함할 수 없습니다.

길이는 이름 자체가 아니라 네임스페이스 기준입니다. `데이터베이스이름.컬렉션이름` 전체가 샤딩하지 않은 컬렉션과 뷰는 255바이트, 샤딩한 컬렉션은 235바이트까지입니다. 데이터베이스 이름은 64바이트 미만이어야 합니다. 밑줄 같은 특수 문자가 들어가거나 숫자로 시작하는 이름은 `db.getCollection()`으로 접근합니다.

```javascript
db.getCollection("3_records").find()
```

## 컬렉션 내의 도큐먼트 조회

`db.컬렉션이름.find()`로 컬렉션이 가진 도큐먼트를 조회합니다. `mongosh`는 결과를 배열로 출력합니다.

```javascript
db.cappedCollection.find()
```

```javascript
[
  { _id: ObjectId('...'), x: 690 },
  { _id: ObjectId('...'), x: 691 },
  { _id: ObjectId('...'), x: 692 },
  { _id: ObjectId('...'), x: 693 },
  { _id: ObjectId('...'), x: 694 }
]
```

## 컬렉션 상태 조회

컬렉션 정보는 `$collStats` 집계 스테이지로 조회합니다. `collStats` 명령은 6.2부터 deprecated이고, `db.컬렉션이름.stats()` 메서드도 내부적으로 `$collStats`를 호출합니다.

```javascript
db.cappedCollection.aggregate( [ { $collStats: { storageStats: { } } } ] )
```

```javascript
[
  {
    ns: 'testDB.cappedCollection',
    host: 'mongo.example.net:27017',
    localTime: 2026-09-20T03:12:44.101Z,
    storageStats: {
      size: 10230,
      count: 310,
      avgObjectSize: 33,
      storageSize: 36864,
      capped: true,
      maxSize: 10240,
      ...
    }
  }
]
```

`$collStats`는 파이프라인의 첫 스테이지여야 하고 트랜잭션 안에서는 쓸 수 없습니다. `storageStats: { }`는 크기를 바이트로 보여 주고, `{ scale: 1024 }`를 주면 킬로바이트로 바꿔 줍니다. 출력 필드는 컬렉션 설정과 스토리지 엔진에 따라 달라지며, `max`는 도큐먼트 개수 한도를 준 capped 컬렉션에서 나타납니다.

`size`를 10000으로 주고 만들었는데 `maxSize`는 10240입니다. 공식 문서는 oplog의 capped 크기를 256바이트의 배수로 올린다고만 적고, 그 밖의 capped 컬렉션에는 올림 규칙을 명시하지 않습니다. 그래서 실제로 쓸 수 있는 한도는 요청값이 아니라 `maxSize`로 확인하는 편이 안전합니다.

컬렉션은 도큐먼트만 가지고 있는 것이 아니라 자신에 대한 정보도 함께 가지고 있습니다. 저장한 데이터의 합계와 컬렉션이 차지한 크기가 정확히 같지 않은 이유입니다.

## 컬렉션 삭제

`db.컬렉션이름.drop()`으로 컬렉션을 지웁니다.

```javascript
db.myCollections.drop()
```

```javascript
true
```

데이터베이스에 남은 컬렉션은 `db.getCollectionInfos()`로 확인합니다. 아무것도 없으면 빈 배열이 나옵니다.

```javascript
db.getCollectionInfos()
```

```javascript
[]
```

여기까지 컬렉션이 무엇인지, 그리고 기초적인 생성과 삭제 방법을 살펴봤습니다. 옵션과 명령이 더 필요하면 공식 문서(<https://www.mongodb.com/docs/>)에 정리돼 있습니다.

다음 포스팅에서는 도큐먼트를 살펴볼 예정입니다.

MongoDB를 공부하면서 참고하는 자료입니다.

- MongoDB 공식 문서 및 Webinar
- 맛있는 MongoDB (도서)
- MongoDB in Action (도서)
- Real MongoDB (도서)
- Node.js와 fluentd를 활용하여 배우는 오픈소스 몽고DB (도서)
