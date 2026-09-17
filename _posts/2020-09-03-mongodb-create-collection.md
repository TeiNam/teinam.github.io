---
date: 2020-09-03 12:58:58 +0900
title: "MongoDB Collection 생성하기"
category: mongodb
excerpt: "MongoDB Collection 생성하기 데이터베이스를 생성하기 위해서는 Collection을 생성해야 한다고 했습니다. 그럼 Collection이라는 것이 무엇일까요? RDBMS를 주로 다루던 분들은 쉽게 TABLE 처럼 인식할 수 있습니다. 일반적으로 RDBMS를 먼저 접한…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — insertOne/insertMany 를 쓰고 있어 CRUD API 자체는 현재 기준과 맞습니다. 다만 프롬프트와 `"acknowledged" : true` 형태의 출력은 6.0 에서 제거된 레거시 `mongo` 셸 것이므로 예제는 `mongosh` 로 실행해야 합니다.

### MongoDB Collection 생성하기

데이터베이스를 생성하려면 Collection을 생성해야 한다고 했습니다. 그럼 Collection이라는 것이 무엇일까요? RDBMS를 주로 다루던 분들은 쉽게 TABLE처럼 인식합니다.

![RDBMS와 MongoDB 매핑 관계](/assets/img/wp/2020/09/RDBMS_MongoDB_Mapping.jpg)

<출처 : Beginersbook.com >

일반적으로 RDBMS를 먼저 접한 사람들을 위해 이렇게 표현하는 경우가 많습니다. 하지만 RDBMS와 MongoDB 간에 분명한 차이점이 존재하며 사용법과 접근방법이 다릅니다.

첫 번째, RDBMS의 테이블에는 지정된 형식의 속성값을 가진 컬럼이 존재하며 그 속성값에 맞춰 데이터를 입력해야 합니다. 하지만 MongoDB의 컬렉션에는 형식에 상관없이 데이터를 넣습니다.

두 번째, RDBMS의 테이블에 데이터를 Insert하거나 update를 할 때, 컬럼을 추가할 수 없고 상황에 따라 컬럼 추가에 대한 작업(DDL)을 따로 해줘야 합니다. 대용량 테이블의 경우 이런 작업을 할 때 매우 주의를 필요로 합니다. MongoDB에서는 그냥 데이터를 insert할 때 열(컬럼 개념처럼)을 추가합니다. 자세한 예를 들면

```javascript
> db.article.insertMany([
... {board_id: freeboard_id, title: 'hello', content: 'hi, hello1', author: 'Karoid'},
... {board_id: freeboard_id, title: 'hi', content: 'hi, hello2', author: 'Jeong'},
... {board_id: freeboard_id, title: 'hi', content: 'hi, hello3', author: 'Hong', comments: [
... {author: 'Karoid', content: 'hello Hong!'}
... ]},
... ])
{
  "acknowledged" : true,
  "insertedIds" : [
    ObjectId("5f505017fc907fec200b55b2"),
    ObjectId("5f505017fc907fec200b55b3"),
    ObjectId("5f505017fc907fec200b55b4")
  ]
}
> db.aerticle.find()
> db.article.find()
{ "_id" : ObjectId("5f505017fc907fec200b55b2"), "board_id" : undefined, "title" : "hello", "content" : "hi, hello1", "author" : "Karoid" }
{ "_id" : ObjectId("5f505017fc907fec200b55b3"), "board_id" : undefined, "title" : "hi", "content" : "hi, hello2", "author" : "Jeong" }
{ "_id" : ObjectId("5f505017fc907fec200b55b4"), "board_id" : undefined, "title" : "hi", "content" : "hi, hello3", "author" : "Hong", "comments" : [ { "author" : "Karoid", "content" : "hello Hong!" } ] }
> db.user.find({name: "Karoid"})
> db.user.find()
> db.user.find({username: "Karoid"})
```

<예제 : 도서 – 맛있는 MongoDB>

세 번째 도큐먼트에서 comment라는 열값이 추가되었고, 첫 번째, 두 번째 도큐먼트 값에 상관없이 열값이 존재하게 됩니다.

아래는 RDBMS의 테이블이 가진 특징입니다.

- 데이터 간의 관계 유지
- 고정 또는 사전 정의된 스키마 데이터는 행과 열에 저장됩니다.
- 외래 키 관계는 DB에서 지원합니다.
- 열 데이터 유형, 외래 키 또는 기본 키를 위반하는 경우 데이터가 저장되지 않습니다.
- 조인을 효과적으로 사용하여 데이터를 쿼리할 수 있습니다.
- 수직 확장 가능 (하드웨어에서 제한될 수 있습니다. 서버 시스템에 RAM을 계속 추가할 수 없다고 가정하면 시스템에는 RAM을 늘릴 수 있는 자체 제한이 있습니다.) 데이터가 큰 경우 저장 및 검색이 비교적 느립니다.

MongoDB의 컬렉션이 가진 특징은 다음과 같습니다.

- 데이터 간에 관계가 유지되지 않습니다. (동적 스키마)
- 데이터는 문서로 저장됩니다.
- 동적 스키마를 사용하면 모든 데이터 유형 또는 여러 매개 변수의 문서를 저장할 수 있습니다.
- 더 많은 서버를 추가하여 수평 확장 가능 (저장 및 검색이 더 빠름)
- 명시적인 외래 키 지원은 사용할 수 없지만, 외래 키를 사용하여 스키마를 설계할 수는 있습니다. (하지만 데이터 간의 관계를 유지해야 합니다.)
- $lookup은 SQL의 LEFT OUTER JOIN과 유사한 작업을 수행합니다.

#### Collection 생성

컬렉션을 생성하고 도큐먼트를 넣어보겠습니다.

db.createCollection("컬렉션이름", { 옵션 })

```javascript
> db.createCollection("cappedCollection", { capped: true, size: 10000 })
{ "ok" : 1 }
```

capped 타입의 컬렉션은 지정한 사이즈가 넘어가면 오래된 데이터부터 삭제하는 컬렉션 타입입니다.

db.컬렉션이름.insertOne 또는 db.컬렉션이름.insertMany 명령으로 도큐먼트를 삽입할 수 있습니다. 도큐먼트를 따로 생성하지 않아도 insert 명령으로 자동 생성됩니다.

```javascript
> db.cappedCollection.insertOne({x:1})
{
  "acknowledged" : true,
  "insertedId" : ObjectId("5f5048d2fc907fec200b51c1")
}
```

or

```javascript
> db.user.insertMany( [
... { username: "John", password: 4321 },
... { username: "K", password: 4221 },
... { username: "Mark", password: 5321 },
... ] );
{
  "acknowledged" : true,
  "insertedIds" : [
    ObjectId("5f504dedfc907fec200b55ae"),
    ObjectId("5f504dedfc907fec200b55af"),
    ObjectId("5f504dedfc907fec200b55b0")
  ]
}
```

<예제 : 도서 – 맛있는 MongoDB>

for 문을 사용하여 반복적으로 도큐먼트를 삽입하는 것도 가능합니다.

#### 컬렉션 내의 도큐먼트 조회

db.컬렉션이름.find() 명령을 사용하면 컬렉션이 가진 도큐먼트를 조회할 수 있습니다.

```text
> db.cappedCollection.find()
{ "_id" : ObjectId("5f5049adfc907fec200b5474"), "x" : 690 }
{ "_id" : ObjectId("5f5049adfc907fec200b5475"), "x" : 691 }
{ "_id" : ObjectId("5f5049adfc907fec200b5476"), "x" : 692 }
{ "_id" : ObjectId("5f5049adfc907fec200b5477"), "x" : 693 }
{ "_id" : ObjectId("5f5049adfc907fec200b5478"), "x" : 694 }
{ "_id" : ObjectId("5f5049adfc907fec200b5479"), "x" : 695 }
{ "_id" : ObjectId("5f5049adfc907fec200b547a"), "x" : 696 }
{ "_id" : ObjectId("5f5049adfc907fec200b547b"), "x" : 697 }
{ "_id" : ObjectId("5f5049adfc907fec200b547c"), "x" : 698 }
{ "_id" : ObjectId("5f5049adfc907fec200b547d"), "x" : 699 }
{ "_id" : ObjectId("5f5049adfc907fec200b547e"), "x" : 700 }
{ "_id" : ObjectId("5f5049adfc907fec200b547f"), "x" : 701 }
{ "_id" : ObjectId("5f5049adfc907fec200b5480"), "x" : 702 }
{ "_id" : ObjectId("5f5049adfc907fec200b5481"), "x" : 703 }
{ "_id" : ObjectId("5f5049adfc907fec200b5482"), "x" : 704 }
{ "_id" : ObjectId("5f5049adfc907fec200b5483"), "x" : 705 }
{ "_id" : ObjectId("5f5049adfc907fec200b5484"), "x" : 706 }
{ "_id" : ObjectId("5f5049adfc907fec200b5485"), "x" : 707 }
{ "_id" : ObjectId("5f5049adfc907fec200b5486"), "x" : 708 }
{ "_id" : ObjectId("5f5049adfc907fec200b5487"), "x" : 709 }
```

#### 컬렉션 상태 조회

db.컬렉션이름.stats()로 컬렉션에 대한 정보를 조회할 수 있습니다.

```json
> db.cappedCollection.stats()
{
  "ns" : "testDB.cappedCollection",
  "size" : 10230,
  "count" : 310,
  "avgObjSize" : 33,
  "storageSize" : 36864,
  "freeStorageSize" : 16384,
  "capped" : true,
  "max" : -1,
  "maxSize" : 10240,
  "sleepCount" : 0,
  "sleepMS" : 0,
  "wiredTiger" : {
    "metadata" : {
      "formatVersion" : 1
    },
    "creationString" : "access_pattern_hint=none,allocation_size=4KB,app_metadata=(formatVersion=1),assert=(commit_timestamp=none,durable_timestamp=none,read_timestamp=none),block_allocation=best,block_compressor=snappy,cache_resident=false,checksum=on,colgroups=,collator=,columns=,dictionary=0,encryption=(keyid=,name=),exclusive=false,extractor=,format=btree,huffman_key=,huffman_value=,ignore_in_memory_cache_size=false,immutable=false,internal_item_max=0,internal_key_max=0,internal_key_truncate=true,internal_page_max=4KB,key_format=q,key_gap=10,leaf_item_max=0,leaf_key_max=0,leaf_page_max=32KB,leaf_value_max=64MB,log=(enabled=true),lsm=(auto_throttle=true,bloom=true,bloom_bit_count=16,bloom_config=,bloom_hash_count=8,bloom_oldest=false,chunk_count_limit=0,chunk_max=5GB,chunk_size=10MB,merge_custom=(prefix=,start_generation=0,suffix=),merge_max=15,merge_min=0),memory_page_image_max=0,memory_page_max=10m,os_cache_dirty_max=0,os_cache_max=0,prefix_compression=false,prefix_compression_min=4,source=,split_deepen_min_child=0,split_deepen_per_child=0,split_pct=90,type=file,value_format=u",
    "type" : "file",
    "uri" : "statistics:table:collection-11--5182215938589110903",
    "LSM" : {

생략...
```

컬렉션의 Size는 10000으로 주고 생성했지만, 실제 생성될 때는 사용자가 제시한 10000보다 크면서 256의 가장 가까운 배수로 최댓값이 설정되기 때문에 maxSize가 10240이 됩니다.

컬렉션 내부에는 도큐먼트뿐만 아니라 컬렉션 자체적인 정보도 가지고 있기 때문에, 실제 저장된 크기와 컬렉션 크기 사이에는 오차가 있습니다.

#### 컬렉션 삭제

db.컬렉션이름.drop() 명령으로 컬렉션을 삭제할 수 있습니다.

```javascript
> db.myCollections.drop()
true
```

true가 나오면 삭제된 것이고, 컬렉션이 아무것도 없는 상태이면 아래와 같이 나옵니다.

```javascript
> db.getCollectionInfos()
[ ]
```

이렇게 컬렉션에 대해서 알아보았고, 기초적인 생성 및 삭제 방법을 알아보았습니다. 몽고DB의 Docs 홈에 가면 더 많은 명령어가 존재합니다. (<https://docs.mongodb.com/>)

다음 포스팅에서는 도큐먼트에 대해서 알아볼 예정입니다.

현재 MongoDB를 공부하면서 참고하는 것들입니다.

- MongoDB 공홈 및 Webinar
- 맛있는 MongoDB (도서)
- MongoDB in Action (도서)
- Real MongoDB (도서)
- Node.js와 flentd를 활용하여 배우는 오픈소스 몽고DB (도서)
