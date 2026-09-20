---
date: 2020-09-04 09:33:55 +0900
title: "MongoDB Document 생성하기"
category: mongodb
excerpt: "MongoDB의 도큐먼트와 생성 방법을 알아보는 포스팅입니다. 도큐먼트는 속성의 이름과 값으로 이루어진 쌍의 집합이며, MongoDB는 이러한 도큐먼트를 컬렉션에 저장합니다."
last_modified_at: 2026-09-20
---

MongoDB의 도큐먼트와 생성 방법을 알아보는 포스팅입니다. 이 글의 예제는 MongoDB 8.0 기준이며, mongosh 셸에서 실행합니다.

MongoDB의 특징을 말할 때 빠지지 않는 것이 도큐먼트 지향 데이터베이스라는 점입니다. 도큐먼트는 속성의 이름과 값으로 이루어진 쌍의 집합입니다. 속성의 값은 문자열이나 숫자, 날짜와 같이 간단한 데이터 타입이 될 수 있고, 배열이나 다른 JSON 도큐먼트가 될 수도 있습니다. MongoDB에서 말하는 중첩 도큐먼트의 개념입니다. JSON 도큐먼트는 숫자값을 제외한 모든 곳에서 큰따옴표(")를 사용하며, MongoDB 역시 같은 형식을 따릅니다.

MongoDB의 도큐먼트는 0개 이상의 필드-값 쌍으로 이루어진 엔티티입니다. MongoDB는 내부적으로 BSON(Binary JSON) 형식으로 데이터를 저장합니다. BSON은 JSON의 이진 인코딩 직렬화이며, C 데이터 유형을 사용하므로 프로그래밍 언어에서 인코딩과 디코딩이 더 쉽습니다. 이 때문에 MongoDB의 도큐먼트를 더 쉽게 탐색할 수 있습니다. 도큐먼트에 다른 도큐먼트가 중첩되어 있을 수 있으며, MongoDB는 이러한 도큐먼트들을 컬렉션에 저장합니다.

다음은 MongoDB의 문서 구조입니다.

```json
{
    field1:value1;
    field2:value2;
    .
    .
    fieldN:valueN;
}
```

도큐먼트에는 N개의 필드-값(field:value) 쌍이 포함될 수 있습니다. 필드는 RDBMS의 컬럼, 값은 행 값처럼 생각하면 이해하기 쉽습니다.  
값은 BSON 사양에서 지원하는 모든 데이터 유형을 가질 수 있습니다.

다음은 필드-값 쌍이 있는 간단한 문서입니다.

```json
{
    name: "Kim",
    age: 23,
    place: "Seoul",
    hobbies: ["Singing", "Reading Books"]
}
```

중첩된 다른 문서가 포함된 도큐먼트의 예시입니다.

```json
{
    name: "Kim",
    age: 23,
    place: "Seoul",
    hobbies: ["Singing", "Reading Books"]
    spouse: {
        name: "Lee",
        age: 21
    }
}
```

spouse 항목을 보면 하나의 field-value 구조가 아닌 두 개의 field-value를 가지고 있습니다. 하나의 컬럼에 하나의 값만 가질 수 있는 RDBMS 구조에서는 구현할 수 없는 구조입니다. 다른 테이블과 조인해서 결과를 만들 수 있지만, MongoDB에서는 하나의 도큐먼트 안에 중첩으로 데이터를 저장할 수 있습니다.

```json
spouse: {
        name: "Lee",
        age: 21
    }
```

이 부분이 중첩 도큐먼트의 예시입니다.

RDBMS에서는 하나의 객체(Object)를 여러 개의 테이블로 나누어 표현하는 기법인 정규화로 하나의 단위 데이터를 오직 하나의 테이블로 표현합니다. 하지만 정규화를 너무 많이 하면 그에 따른 비용이 발생합니다. 이는 곧 데이터를 모으는 작업을 해야 한다는 것입니다.  
반대로 도큐먼트 지향적인 데이터 모델에서는 객체를 자연스럽게 모아 놓은 형태로 표현하므로 객체를 전체적으로 작업할 수 있습니다.

## 단일 도큐먼트 생성

db.컬렉션이름.insertOne()

```bash
> db.user.insertOne({userID: "kimikimi", username: "Kim", password: 1111})
{
  "acknowledged" : true,
  "insertedId" : ObjectId("5f50a274237701f054a0e52e")
}

> db.user.find().pretty()
{
  "_id" : ObjectId("5f50a274237701f054a0e52e"),
  "userID" : "kimikimi",
  "username" : "Kim",
  "password" : 1111
}
```

## 다수 도큐먼트 생성

db.컬렉션이름.insertMany()

```bash
> db.user.insertMany( [
... {username: "Kei", password: 4321 },
... {username: "Mijoo", password: 3212 },
... {username: "Yein", password: 3123 },
... ]);
{
  "acknowledged" : true,
  "insertedIds" : [
    ObjectId("5f51894e237701f054a0e52f"),
    ObjectId("5f51894e237701f054a0e530"),
    ObjectId("5f51894e237701f054a0e531")
  ]
}

> db.user.find().pretty()
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

간단하게 도큐먼트가 무엇인지와 생성하는 방법을 살펴보았습니다.

다음 포스팅에서는 도큐먼트를 조회하는 방법을 다룰 예정입니다.

현재 MongoDB를 공부하면서 참고하는 것들입니다.

- MongoDB 공홈 및 Webinar
- 맛있는 MongoDB (도서)
- MongoDB in Action (도서)
- Real MongoDB (도서)
- Node.js와 flentd를 활용하여 배우는 오픈소스 몽고DB (도서)
