---
date: 2022-05-25 10:25:28 +0900
title: "MongoDB에서 Sequence 사용하기 on Node.js"
category: mongodb
excerpt: "MongoDB에서 Sequence 사용하기 on Node.js MongoDB는 Oracle이나 PostgreSQL의 Sequence나 MySQL의 Auto Increment 같은 기능이 없습니다. 반면 MongoDB에 익숙한 사람들은 12-byte로된 Object_ID에 더 익숙할…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 카운터 컬렉션으로 시퀀스를 만드는 아이디어는 유효하지만 예제가 deprecated 된 `db.collection.insert()` 와 레거시 셸의 `WriteResult` 출력 기준입니다. insertOne 과 findOneAndUpdate 기반으로 다시 작성해야 합니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB에서 Sequence 사용하기 on Node.js

MongoDB는 Oracle이나 PostgreSQL의 Sequence나 MySQL의 Auto Increment 같은 기능이 없습니다.  반면 MongoDB에 익숙한 사람들은 12-byte로된 Object\_ID에 더 익숙할겁니다.  MongoDB는 자동 증가 시퀀스를 기본 기능으로 지원하지 않지만 이 기능은 카운터 컬렉션을 사용해 프로그래밍 방식으로 구현할 수 있습니다.

```json
{
  "_id" : 1,
  "title" : "책이름",
  "author" : [ "저자1", "저자2" ],
  "published_date" : ISODate("1970-01-01T09:00:00.000+09:00"),
  "pages" : 216,
  "language" : "한국어",
  "publisher" : {
    "name" : "출판사",
    "founded_date" : 2021,
    "location" : "소재지"
  }
},
{
  "_id" : 2,
  "title" : "MongoDB: The Definitive Guide",
  "author" : [ "Kristina Chodorow", "Mike Dirolf" ],
  "published_date" : ISODate("2010-09-24T09:00:00.000+09:00"),
  "pages" : 216,
  "language" : "English",
  "publisher" : {
    "name" : "O'Reilly Media",
    "founded" : 1980,
    "location" : "CA"
  }
}
```

### Object\_ID (\_id)에 Auto Increment를 사용하는 방법

1. SEQ Count에 사용할 seq collection 생성

   
```js
> db.createCollection("seq")
{ "ok" : 1 }
>
```

2. Collection에 데이터 삽입

   
```js
> db.seq.insert ( {_id: "seq_no" , seq_value : 0 } )
WriteResult ( { "nInserted" : 1 } )
>
```

3. seq 데이터 확인

   
```js
> db.seq.find({})
{
  "_id" : "seq_no",
  "seq_value" : 0
}
```

4. Javascript Function 생성하기

   
```js
function autoIncObjectId(seqName){
    var autoInc = db.seq.findAndModify({
        query: {_id: seqName },
        update: { $inc: {seq_value:1}},
        new: true
    });
    return autoInc.seq_value;
}
```

5. Javascript 함수 사용하여 데이터 Insert

   
```javascript
db.book.insert({
    "_id" : autoIncObjectId("seq_no"),
  "title" : "책이름",
  "author" : [ "저자1", "저자2" ],
  "published_date" : ISODate("1970-01-01T09:00:00.000+09:00"),
  "pages" : 216,
  "language" : "한국어",
  "publisher" : {
    "name" : "출판사",
    "founded_date" : 2021,
    "location" : "소재지"
  }
});

db.book.insert({
    "_id" : autoIncObjectId("seq_no"),
  "title" : "MongoDB: The Definitive Guide",
  "author" : [ "Kristina Chodorow", "Mike Dirolf" ],
  "published_date" : ISODate("2010-09-24T09:00:00.000+09:00"),
  "pages" : 216,
  "language" : "English",
  "publisher" : {
    "name" : "O'Reilly Media",
    "founded" : 1980,
    "location" : "CA"
  }
});
```

MongoDB 안에 함수를 저장해 두고 사용하는 방법도 있지만, 소스 상에서 함수를 이용해 데이터를 입력할 수도 있습니다.

해당 방법의 단점은 역시 MySQL 처럼 clustered index가 아니기 때문에 중간에 데이터 삭제가 되어도 PK값의 순서대로 끼워 넣는 것은 불가능하다는 것과, Sequence를 사용하는 컬렉션 마다 별도의 카운터 컬렉션을 생성해줘야하는 것, 틀어졌을때 수동으로 관리를 해줘야 하는 점 등이 있습니다.

Object\_ID를 사용하는 것이 유니크한 값을 사용하고, 시간정보등이  들어있고 12-byte 고정이기 때문에 더 많은 장점이 있긴 합니다만, 부득이하게 시퀀스 타입을 사용해야 한다면 위 같이 프로그래밍을 통한 방법을 구현 할 수 있습니다.
