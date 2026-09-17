---
date: 2020-09-16 15:12:17 +0900
title: "MongoDB Document 조회하기"
category: mongodb
excerpt: "MongoDB 도큐먼트 조회하기 find() 명령은 컬렉션 안에 도큐먼트들을 넣었으면, 필요할 때 조회를 할 수 있어야 합니다. 조회를 할때 사용하는 명령입니다. > db.COLLECTION_NAME.find( <query>, <projection> ) Parameter Type…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — find() 와 비교·논리 연산자 설명은 버전과 무관하게 유효합니다. 예제는 레거시 `mongo` 셸(6.0 제거) 기준이므로 `mongosh` 로 실행해야 하며, `mongosh` 는 결과 출력을 기본적으로 보기 좋게 정렬해 보여줍니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

### MongoDB 도큐먼트 조회하기

find() 명령은 컬렉션 안에 도큐먼트들을 넣었으면, 필요할 때 조회를 할 수 있어야 합니다. 조회할 때 쓰는 명령이다.

```javascript
> db.COLLECTION_NAME.find( <query>, <projection> )
```

|  |  |  |
| --- | --- | --- |
| **Parameter** | **Type** | **Description** |
| query | document | Optional. 쿼리 연산자를 이용해 원하는 도큐먼트를 선택. |
| projection | document | Optional. return할 필드를 선택할 수 있다. |

우선 그동안 만들었던 컬렉션(Collection)이 뭐가 있는지 보겠습니다.

```bash
> show collections
cappedCollection
myCollection
user
```

3개의 컬렉션이 존재하고, user 컬렉션의 모든 도큐먼트를 조회해보도록 하겠습니다.

```javascript
> db.user.find()
{ "_id" : ObjectId("5f504be9fc907fec200b55ad"), "username" : "karoid", "password" : "1111" }
{ "_id" : ObjectId("5f504dedfc907fec200b55ae"), "username" : "John", "password" : 4321 }
{ "_id" : ObjectId("5f504dedfc907fec200b55af"), "username" : "K", "password" : 4221 }
{ "_id" : ObjectId("5f504dedfc907fec200b55b0"), "username" : "Mark", "password" : 5321 }
{ "_id" : ObjectId("5f50a274237701f054a0e52e"), "userID" : "kimikimi", "username" : "Kim", "password" : 1111 }
{ "_id" : ObjectId("5f51894e237701f054a0e52f"), "username" : "Kei", "password" : 4321 }
{ "_id" : ObjectId("5f51894e237701f054a0e530"), "username" : "Mijoo", "password" : 3212 }
{ "_id" : ObjectId("5f51894e237701f054a0e531"), "username" : "Yein", "password" : 3123 }
```

많은 데이터가 들어가 있네요.

```javascript
> db.user.find().pretty()
{
  "_id" : ObjectId("5f504be9fc907fec200b55ad"),
  "username" : "karoid",
  "password" : "1111"
}
{
  "_id" : ObjectId("5f504dedfc907fec200b55ae"),
  "username" : "John",
  "password" : 4321
}
{
  "_id" : ObjectId("5f504dedfc907fec200b55af"),
  "username" : "K",
  "password" : 4221
}
{
  "_id" : ObjectId("5f504dedfc907fec200b55b0"),
  "username" : "Mark",
  "password" : 5321
}
{
  "_id" : ObjectId("5f50a274237701f054a0e52e"),
  "userID" : "kimikimi",
  "username" : "Kim",
  "password" : 1111
}
{
  "_id" : ObjectId("5f51894e237701f054a0e52f"),
  "username" : "Kei",
  "password" : 4321
}
{
  "_id" : ObjectId("5f51894e237701f054a0e530"),
  "username" : "Mijoo",
  "password" : 3212
}
{
  "_id" : ObjectId("5f51894e237701f054a0e531"),
  "username" : "Yein",
  "password" : 3123
}
```

명령 끝에 pretty()를 넣으면 좀 더 보기 편하다.

#### 쿼리 (Query)

쿼리는 데이터베이스 속의 수 많은 정보 속에서 원하는 정보를 찾아내도록 도와주는 필터같은 역할을 합니다.

다음 예제는 유저명이 Yein인 도큐먼트를 찾아오는 쿼리입니다.

```javascript
> db.user.find({username: "Yein"})
{ "_id" : ObjectId("5f51894e237701f054a0e531"), "username" : "Yein", "password" : 3123 }
```

RDBMS 데이터베이스에서 select 구문을 사용할 때 다양한 조건절과 연산자를 사용할 수 있는데, MongoDB에서는 원하는 데이터를 찾기 위해 연산자를 사용합니다. 연산자의 종류는 비교(Comparison), 논리(Logical), 요소(Element), 배열(Array) 등 여러종류가 있습니다.

다음은 자주 쓰는 연산자다.

**비교(Comparison)**

| Operator | **Description** |
| --- | --- |
| $eq | (equals) 주어진 값과 일치하는 값 |
| $gt | (greater than) 주어진 값보다 큰 값 |
| $gte | (greather than or equals) 주어진 값보다 크거나 같은 값 |
| $lt | (less than) 주어진 값보다 작은 값 |
| $lte | (less than or equals) 주어진 값보다 작거나 같은 값 |
| $ne | (not equal) 주어진 값과 일치하지 않는 값 |
| $in | 주어진 배열 안에 속하는 값 |
| $nin | 주어진 배열 안에 속하지 않는 값 |

**논리(Logical)**

| Operator | **Description** |
| --- | --- |
| $or | 주어진 조건중 하나라도 true 일 때 true |
| $and | 주어진 모든 조건이 true 일 때 true |
| $not | 주어진 조건이 false 일 때 true |
| $nor | 주어진 모든 조건이 false 일때 true |

**$regex 연산자**

$regex 연산자를 통하여 Document를 정규식을 통해 찾을 수 있습니다. 이 연산자는 다음과 같이 사용합니다.

```javascript
{ <field>: { $regex: /pattern/, $options: '<options>' } }
{ <field>: { $regex: 'pattern', $options: '<options>' } }
{ <field>: { $regex: /pattern/<options> } }
{ <field>: /pattern/<options> }
```

| Option | **Description** |
| --- | --- |
| i | 대소문자 무시 |
| m | 정규식에서 anchor(^) 를 사용 할 때 값에 \n 이 있다면 무력화 |
| x | 정규식 안에있는 whitespace를 모두 무시 |
| s | dot (.) 사용 할 떄 \n 을 포함해서 매치 |

**$where 연산자**

$where 연산자를 통해 JavaScript expression을 사용할 수 있다.

#### 프로젝션 (Projection)

find() 메소드의 두번째 파라미터인 projection을 설명한다. 쿼리의 결과값에서 보여질 field를 정합니다.

프로젝션을 이용하여 도큐먼트의 모든 필드를 불러오지 않고 원하는 필드만 가져오게 되면 불러오는 정보의 양을 줄여서 응답속도를 높일수 있습니다.

\_id 값은 조회하지 않고, 유저명과 패스워드만 조회 하는 예제입니다.

```javascript
> db.user.find( { } ,{ "_id": false, "username": true, "password": true} )
{ "username" : "karoid", "password" : "1111" }
{ "username" : "John", "password" : 4321 }
{ "username" : "K", "password" : 4221 }
{ "username" : "Mark", "password" : 5321 }
{ "username" : "Kim", "password" : 1111 }
{ "username" : "Kei", "password" : 4321 }
{ "username" : "Mijoo", "password" : 3212 }
{ "username" : "Yein", "password" : 3123 }
```

다음은 유저 네임만 가져오는 프로젝션입니다.

```javascript
> db.user.find( null, {"_id":false, "username":true} )
{ "username" : "karoid" }
{ "username" : "John" }
{ "username" : "K" }
{ "username" : "Mark" }
{ "username" : "Kim" }
{ "username" : "Kei" }
{ "username" : "Mijoo" }
{ "username" : "Yein" }
```

프로젝션을 설정할 때에는 \_id 필드를 제외한 필드들의 설정값이 true 혹은 false로 모두 통일되어야 합니다. 그래야 출력된다.

더 많은 쿼리와 프로젝션 연산자는 MongoDB의 Docs(<https://docs.mongodb.com/manual/reference/operator/query/>)에서 확인할 수 있다.

#### 점 연산자

MongoDB에서 오브젝트 안에 들어있는 값을 불러오기 위해서는 점 연산자를 이용해서 접근할 수 있습니다.

var 명령으로 변수를 선언할 수 있다.

```javascript
> var unp = { name: {username: "Yein", password: 3123}}
>
> unp.name
{ "username" : "Yein", "password" : 3123 }
>
> unp.name.username
Yein
```

이런식으로 값만 "username" : "Yein" 항목을 다 불러오는 것이 아니라 Yein이라는 이름 항목만 가져오는 것 입니다.

#### ReadConcern

Replication set에서 더 정확한 값을 읽으려면 이 설정이 필요하다.

#### 커서 (cursor)

쿼리 결과에 대한 포인터입니다. find 명령은 결과로 도큐먼트를 직접 반환하지 않고 커서를 반환합니다. 해당 도큐먼트의 위치 정보만을 반환하여 작업을 효율적으로 만들 수 있습니다. 데이터를 전부 불러올 도큐먼트만 선별적으로 조회할 수 있습니다. 커서는 결과값을 읽는 작업을 위해 필요한 것이기 때문에 10분이 지나면 비활성 상태로 전환됩니다.

cursor를 사용하는 이점은 컬렉션 전체 데이터를 모두 순환 하지만 Node에서는 1개씩의 document 만 가져와 처리하고 GC 되므로 메모리 사용을 최소화 하며 MongoDB에 순간적인 부하도 주지 않습니다. 때문에 대량의 데이터를 처리하는데 적합합니다.

```javascript
> var cursor = db.user.find()
> cursor
{ "_id" : ObjectId("5f504be9fc907fec200b55ad"), "username" : "karoid", "password" : "1111" }
{ "_id" : ObjectId("5f504dedfc907fec200b55ae"), "username" : "John", "password" : 4321 }
{ "_id" : ObjectId("5f504dedfc907fec200b55af"), "username" : "K", "password" : 4221 }
{ "_id" : ObjectId("5f504dedfc907fec200b55b0"), "username" : "Mark", "password" : 5321 }
{ "_id" : ObjectId("5f50a274237701f054a0e52e"), "userID" : "kimikimi", "username" : "Kim", "password" : 1111 }
{ "_id" : ObjectId("5f51894e237701f054a0e52f"), "username" : "Kei", "password" : 4321 }
{ "_id" : ObjectId("5f51894e237701f054a0e530"), "username" : "Mijoo", "password" : 3212 }
{ "_id" : ObjectId("5f51894e237701f054a0e531"), "username" : "Yein", "password" : 3123 }
> cursor.hasNext()
false
```

find 명령어를 실행하면 batch라는 곳에 검색한 결과를 모아 놓습니다. 상황에 따라 다르지만 일반적인 상황에서는  101(또는 그 이하)개의 도큐먼트를 batch에 모아놓고 20개씩 커서가 가르킵니다. 다음 한개의 도큐먼트를 불러오기 위해서는 next()로 호출할 수 있습니다.

```javascript
> var cursor = db.cappedCollection.find()
> cursor
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
Type "it" for more
> cursor.next()
{ "_id" : ObjectId("5f5049adfc907fec200b5488"), "x" : 710 }
> cursor.hasNext()
true
>
```

hasNext()로 호출하면 출력한 도큐먼트가 더이상 없을때 false, 남아 있을때 true를 반환합니다.

#### 커서를 이용한 도큐먼트 반환

일반적으로 find 명령을 사용했을때 모든 도큐먼트를 불러오지는 않습니다. it를 입력하면 추가적으로 도큐먼트를 20개씩 출력합니다.

```javascript
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
Type "it" for more
>
>
>
> it
{ "_id" : ObjectId("5f5049adfc907fec200b5488"), "x" : 710 }
{ "_id" : ObjectId("5f5049adfc907fec200b5489"), "x" : 711 }
{ "_id" : ObjectId("5f5049adfc907fec200b548a"), "x" : 712 }
{ "_id" : ObjectId("5f5049adfc907fec200b548b"), "x" : 713 }
{ "_id" : ObjectId("5f5049adfc907fec200b548c"), "x" : 714 }
{ "_id" : ObjectId("5f5049adfc907fec200b548d"), "x" : 715 }
{ "_id" : ObjectId("5f5049adfc907fec200b548e"), "x" : 716 }
{ "_id" : ObjectId("5f5049adfc907fec200b548f"), "x" : 717 }
{ "_id" : ObjectId("5f5049adfc907fec200b5490"), "x" : 718 }
{ "_id" : ObjectId("5f5049adfc907fec200b5491"), "x" : 719 }
{ "_id" : ObjectId("5f5049adfc907fec200b5492"), "x" : 720 }
{ "_id" : ObjectId("5f5049adfc907fec200b5493"), "x" : 721 }
{ "_id" : ObjectId("5f5049adfc907fec200b5494"), "x" : 722 }
{ "_id" : ObjectId("5f5049adfc907fec200b5495"), "x" : 723 }
{ "_id" : ObjectId("5f5049adfc907fec200b5496"), "x" : 724 }
{ "_id" : ObjectId("5f5049adfc907fec200b5497"), "x" : 725 }
{ "_id" : ObjectId("5f5049adfc907fec200b5498"), "x" : 726 }
{ "_id" : ObjectId("5f5049adfc907fec200b5499"), "x" : 727 }
{ "_id" : ObjectId("5f5049adfc907fec200b549a"), "x" : 728 }
{ "_id" : ObjectId("5f5049adfc907fec200b549b"), "x" : 729 }
Type "it" for more
```

toArarry()를 사용하면 모두 불러옵니다.

```javascript
> db.cappedCollection.find().toArray()
[
  {
    "_id" : ObjectId("5f5049adfc907fec200b5474"),
    "x" : 690
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b5475"),
    "x" : 691
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b5476"),
    "x" : 692
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b5477"),
    "x" : 693
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b5478"),
    "x" : 694
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b5479"),
    "x" : 695
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b547a"),
    "x" : 696
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b547b"),
    "x" : 697
  },

... (중략)

  {
    "_id" : ObjectId("5f5049adfc907fec200b55a6"),
    "x" : 996
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b55a7"),
    "x" : 997
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b55a8"),
    "x" : 998
  },
  {
    "_id" : ObjectId("5f5049adfc907fec200b55a9"),
    "x" : 999
  }
]
>
```

반대로 forEach() 메소드를 사용하면 순차적으로 하나의 도큐먼트를 불러와서 작업 할 수 있습니다. 하나씩 불러와서 처리하기 때문에 메모리 사용이 많지 않습니다.

```javascript
> db.cappedCollection.find().forEach(function(document){
  작업
...})
```

forEach의 파라미터로 콜백 함수를 받는데, 콜백 함수 내에서 각각의 도큐먼트 변수에 담긴 도큐먼트들을 처리할 수 있습니다.

#### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
