---
date: 2021-02-02 02:54:27 +0900
title: "MongoDB의 데이터베이스, 컬렉션, 도큐먼트"
category: mongodb
excerpt: "MongoDB의 데이터베이스, 컬렉션, 도큐먼트 데이터베이스는 컬렉션과 인덱스의 물지적인 모음이며, 동시에 네임스페이스입니다. 데이터베이스 구조는 데이터베이스 > 컬렉션 > 도큐먼트 형식으로 데이터베이스안에 컬렉션, 컬렉션안에 도큐먼트가 있는 구조로 되어있습니다. 도큐먼트안에 실직…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — 데이터베이스 > 컬렉션 > 도큐먼트 구조와 db.stats() 설명은 그대로 유효합니다. 본문이 말하는 "Mongo 셸"은 5.0 에서 `mongosh` 로 대체되고 6.0 에서 제거되었으므로 실행 도구만 `mongosh` 로 읽으면 됩니다.

## MongoDB의 데이터베이스, 컬렉션, 도큐먼트

데이터베이스는 컬렉션과 인덱스의 물리적인 모음이며, 동시에 네임스페이스입니다.

데이터베이스 구조는 **데이터베이스 > 컬렉션 > 도큐먼트** 형식으로 데이터베이스안에 컬렉션, 컬렉션안에 도큐먼트가 있는 구조로 되어있습니다.

도큐먼트안에 실질적인 데이터가 기록되어 있습니다.

### 데이터베이스 생성

```javascript
> use testDB
```

`use` 명령을 사용해도 데이터베이스가 생성되지 않습니다. 단지, MongoDB 데이터베이스를 나타내는 Mongo::DB 클래스의 인스턴스를 하나 만들어진 상태입니다. `use`는 어떤 데이터베이스를 사용할 것인지 선택하는 명령으로 데이터베이스가 없어도 선택이 가능하고, 실제로 컬렉션을 생성하는 명령을 실행하면 데이터베이스가 같이 생성됩니다.

### 데이터베이스 조회

```text
shard-a:PRIMARY> db
test


shard-a:PRIMARY> show dbs
admin   0.000GB
config  0.001GB
local   0.001GB


shard-a:PRIMARY> db.stats()
{
  "db" : "test",
  "collections" : 0,
  "views" : 0,
  "objects" : 0,
  "avgObjSize" : 0,
  "dataSize" : 0,                     // BSON 객체의 실제 크기
  "storageSize" : 0,                  // 컬렉션이 증가할 것을 대비한 여분의 공간과 삭제되었지만 아직 할당되지 않은 공간을 포함. 컬렉션 익스텐트를 위해 할당
  "totalSize" : 0,
  "indexes" : 0,                      // 인덱스의 개수
  "indexSize" : 0,                    // 데이터베이스 인덱스 전체 크기
  "scaleFactor" : 1,
  "fileSize" : 0,                     // 데이터 파일의 합
  "fsUsedSize" : 0,
  "fsTotalSize" : 0,
  "ok" : 1,
  "$gleStats" : {
    "lastOpTime" : Timestamp(0, 0),
    "electionId" : ObjectId("7fffffff0000000000000002")
  },
  "lastCommittedOpTime" : Timestamp(1612196469, 1),
  "$configServerState" : {
    "opTime" : {
      "ts" : Timestamp(1612196472, 1),
      "t" : NumberLong(2)
    }
  },
  "$clusterTime" : {
    "clusterTime" : Timestamp(1612196472, 1),
    "signature" : {
      "hash" : BinData(0,"AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      "keyId" : NumberLong(0)
    }
  },
  "operationTime" : Timestamp(1612196469, 1)
}
```

\* 모든 인덱스가 램에 있을 때 데이터베이스 성능이 최적화되므로 `indexSize` 값을 주의해서 봐야합니다.

### 데이터베이스 삭제

```javascript
> db.drop
> db.dropDatabase();
```

## 컬렉션

컬렉션은 구조적으로 혹은 개념적으로 비슷한 도큐먼트를 담고 있는 컨테이너입니다. 별도의 명령어 없이 도큐먼트를 네임스페이스에 삽입하는 것만으로도 컬렉션이 생성됩니다. 그러나 컬렉션은 여러 타입이 있으므로 별도의 컬렉션 생성 명령이 따로 있습니다. 네임스페이스는 128자 이내여야 합니다.

### 컬렉션 생성

```javascript
> db.createCollection("users")

> db.collection.insertOne({x:1})
```

Mongo 셸에서 `db`라는 변수를 통해 명령어를 실행하는 것에 익숙해져야 합니다. MongoDB의 많은 명령어가 `db`로 시작하는 경우가 많고, 이 `db`는 현재 세팅된 데이터베이스를 의미합니다.

### 컬렉션 삭제

```javascript
> products.drop
```

### 컬렉션 데이터만 삭제

```javascript
> products.find({}).delete_many
```

### 컬렉션 이름 변경

```javascript
> db.users.renameCollection("user_infomation")
```

### 캡드 컬렉션 (Capped Collection)

캡드 컬렉션은 높은 성능의 로깅 기능을 위해 설계되었습니다. 고정된 크기를 갖는다는 특징이 있고, 공간이 가득차게 되면 오래된 도큐먼트를 덮어쓰게 됩니다. 크기 제한뿐만 아니라 `max` 매개변수로 캡드 컬렉션에 대한 도큐먼트 최대 개수를 지정할 수 있습니다.

```javascript
> db.createCollection("users.action", {capped: true, size: 16384, max: 100})
```

캡드 컬렉션에서는 일반 컬렉션에서 사용할 수 있는 모든 연산이 전부 허용되어 있지 않습니다. 개별 도큐먼트를 삭제할 수 없으며, 도큐먼트의 크기를 증가시키는 어떤 명령어도 실행할 수 없습니다. 로깅을 위해 만들어진 컬렉션이기 때문에 삭제나 업데이트를 구현할 필요가 없었다고 합니다.

### TTL 컬렉션

MongoDB에서 특정 시간이 경과한 도큐먼트를 만료 시킬 수 있는 기능을 제공합니다. TTL(Time to Live) 컬렉션이라고 부르지만, 실제로는 TTL 인덱스를 통해 구현합니다.

```javascript
> db.reviews.createIndex({time_field: 1},{expireAfterSeconds: 3600})
```

`time_field`에 대한 인덱스를 생성하고, 이 필드는 주기적으로 타임스탬프 값을 체크하여 현재 시간과 비교를 수행합니다. 만약 `time_field` 값과 현재 시간 사이에 차이가 `expireAfterSeconds` 설정 값보다 크게 되면 해당 도큐먼트를 자동으로 삭제합니다. insert 시점의 `time_field`를 삽입하게 할 수도 있고, 다른 시점의 시간 값을 삽입할 수도 있습니다. 도큐먼트의 라이프사이클을 관리하기 위해 사용될 수 있습니다. TTL 인덱스는 여러 제약사항을 가지고 있습니다. `_id` 필드 또는 다른 인덱스가 사용되고 있는 필드에 대해서는 사용이 불가능합니다. 캡드 컬렉션에서도 사용할 수 없습니다.

### 시스템 컬렉션

`system.namespaces`와 `system.indexes` 컬렉션들은 모두 표준 컬렉션이고, 디버깅을 위해 접근 할 수 있습니다.

- **system.namespaces:** 현재 사용중인 데이터베이스에 정의된 모든 네임스페이스를 보여줍니다.
- **system.indexes:** 각 인덱스에 대한 정의를 저장합니다.

또, MongoDB에서 복제를 사용할 때, `oplog.rs`라는 캡드 컬렉션을 시스템 컬렉션으로 사용합니다.

### 

### 도큐먼트

#### 도큐먼트 시리얼라이제이션

모든 도큐먼트는 MongoDB에 저장하기 전에 BSON으로 시리얼라이즈(serialize)되고 나중에 BSON으로부터 디시리얼라이즈(deserialize)됩니다. 드라이버에서 이러한 과정을 처리하고, 프로그래밍 언어를 통해 적절한 데이터 타입으로 변환하게 됩니다. 에러 없이 시리얼라이즈하려면 키 이름이 유효해야 하고, 키의 값이 BSON 타입으로 변환할 수 있어야 합니다. 유효한 키 이름은 최대 255바이트 이하의 아스키 문자열이어야 하는데, `$`로 시작해서는 안되며, `.`(마침표)를 포함해서도 안되며, 마지막 위치 외에 Null값이 있으면 안됩니다. 키의 이름은 매번 도큐먼트에 저장되기 때문에 크기에 영향을 주게되니 약어를 사용하면 용량을 절약할 수 있습니다.

#### 문자열

모든 문자열은 UTF-8 형식이어야 합니다.

#### 숫자

BSON은 double, int, long의 세 가지 수 타입을 규정합니다. 이것은 BSON이 IEEE 실수와 signed 정수를 8바이트까지 인코딩할 수 있다는 것을 뜻합니다. 파이썬이나 루비에서는 드라이버가 자동으로 int나 long 타입을 결정하는데, 자바스크립트 셸에서는 Number라는 수 타입 하나만을 가지고 있기 때문에 타입을 지정해줘야 합니다.

#### 날짜와 시간

BSON datetime 타입은 시간이나 날짜에 관련된 값을 저장하는데 사용됩니다. 시간은 signed 64비트 정수를 사용해서 유닉스 에폭(Unix Epoch)이후 지나간 밀리초(ms)로 표현합니다. 음수는 에폭이전의 밀리초를 나타냅니다. 유닉스 에폭은 UTC로 1970년 1월 1일 자정입니다.

#### 가상타입

시간을 반드시 타임존과 함께 저장해야 할 필요가 있다면, 루비의 MongoMapper 혹은 node.js의 mongoose등을 통해 `to_mongo`와 `from_mongo` 메서드를 정의하는 것을 허용합니다.

```json
{ 
  time_with_zone: {
      time: new Date(),
    zone: "EST"
  }
}
```

#### 도큐먼트 크기에 대한 제약

도큐먼트의 최대 크기는 16MB입니다. 이 제한의 이유는 크게 두 가지가 있는데 첫 번째는 효율적이지 못한 데이터 모델을 생성하는 것을 막기 위함입니다. 과도하게 큰 도큐먼트를 가지는 스키마를 방지할 수 있게 해줍니다. 16MB가 넘는 경우 도큐먼트를 나눠서 저장할지 파일로 저장할지 등의 여부도 고려해봐야 합니다.

16MB 제한의 두 번째 이유는 성능과 관련 있습니다. 코어 서버에서 크기가 큰 도큐먼트에 질의하면 질의 결과를 클라이언트로 보내기 전에 큰 도큐먼트가 버퍼에 복사되어야 하는데, 도큐먼트의 일부 데이터만 필요한 경우 성능에 문제가 있을 수 있습니다. 도큐먼트의 최대 중첩 깊이는 100으로 제한되어 있습니다.

#### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
