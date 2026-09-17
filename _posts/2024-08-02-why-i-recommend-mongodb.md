---
date: 2024-08-02 21:00:26 +0900
title: "RDBMS 전문가인 내가 MongoDB를 추천하는 이유"
category: mongodb
excerpt: "안녕하세요, 18년차로 주로 RDBMS를 다뤄온 DBA입니다. 오늘은 제가 왜 MongoDB를 적극적으로 추천하는지에 대해 이야기해보려 합니다. RDBMS의 강점을 누구보다 잘 알고 있는 제가 MongoDB를 추천한다면, 뭔가 특별한 이유가 있지 않을까요? 1. MongoDB의 진…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 트랜잭션·스키마 검증 예제는 유효하지만 벡터 검색 부분이 틀렸습니다. 벡터 검색은 6.0.11/7.0.2 이상에서 지원되며 `db.collection.createIndex({ field: "vectorSearch" })` 가 아니라 검색 인덱스(`createSearchIndex`, type `vectorSearch`)로 정의해야 합니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

안녕하세요, 18년차로 주로 RDBMS를 다뤄온 DBA입니다. 오늘은 제가 왜 MongoDB를 적극적으로 추천하는지에 대해 이야기해보려 합니다. RDBMS의 강점을 누구보다 잘 알고 있는 제가 MongoDB를 추천한다면, 뭔가 특별한 이유가 있지 않을까요?

## 1. MongoDB의 진화: 유연성과 안정성의 결합

MongoDB는 초기의 "schemaless" 데이터베이스라는 이미지에서 벗어나, 이제는 엔터프라이즈급 기능을 갖춘 성숙한 데이터베이스 시스템으로 발전했습니다.

### 1.1 트랜잭션 지원

MongoDB 4.0부터 다중 문서 ACID 트랜잭션을 지원하기 시작했습니다. 이는 RDBMS에서 보장하는 수준의 데이터 일관성을 MongoDB에서도 실현할 수 있게 되었다는 것을 의미합니다.

```javascript
const session = client.startSession();
session.startTransaction();
try {
  const ordersCollection = client.db("mydb").collection("orders");
  const inventoryCollection = client.db("mydb").collection("inventory");
  
  await ordersCollection.insertOne({ _id: 1, item: "example", quantity: 2 }, { session });
  await inventoryCollection.updateOne(
    { item: "example", quantity: { $gte: 2 } },
    { $inc: { quantity: -2 } },
    { session }
  );
  
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
} finally {
  await session.endSession();
}
```

이 예제는 주문 생성과 재고 감소를 하나의 트랜잭션으로 처리하는 방법을 보여줍니다. RDBMS에서 익숙한 이 패턴을 MongoDB에서도 그대로 사용할 수 있습니다.

### 1.2 스키마 검증

MongoDB 3.6부터 도입된 스키마 검증 기능은 문서의 구조를 제어할 수 있게 해줍니다. RDBMS의 테이블 스키마처럼 데이터 무결성을 보장하면서도, 필요에 따라 유연성을 유지할 수 있습니다.

```javascript
db.createCollection("users", {
   validator: {
      $jsonSchema: {
         bsonType: "object",
         required: [ "name", "email", "created_at" ],
         properties: {
            name: {
               bsonType: "string",
               description: "must be a string and is required"
            },
            email: {
               bsonType: "string",
               pattern: "^.+@.+$",
               description: "must be a valid email address"
            },
            created_at: {
               bsonType: "date",
               description: "must be a date and is required"
            }
         }
      }
   }
})
```

이 예제는 'users' 컬렉션에 대한 스키마 검증 규칙을 설정합니다. 데이터 무결성을 유지하면서도, 필요에 따라 추가 필드를 허용하는 유연성을 가질 수 있습니다.

## 2. 최신 기능: 벡터 검색과 Atlas 검색 엔진

### 2.1 벡터 검색

MongoDB 6.0부터 벡터 검색 기능을 지원합니다. 이는 AI/ML 애플리케이션 개발에 큰 도움이 됩니다.

```javascript
db.products.createIndex(
  { description_embedding: "vectorSearch" },
  {
    vectorSearchOptions: {
      dimension: 384,
      similarity: "cosine"
    }
  }
)

db.products.aggregate([
  {
    $vectorSearch: {
      index: "description_embedding",
      path: "description_embedding",
      queryVector: [0.1, 0.2, ..., 0.3],
      numCandidates: 100,
      limit: 10
    }
  }
])
```

이 예제는 제품 설명의 임베딩 벡터를 인덱싱하고 검색하는 방법을 보여줍니다. 이로써 "유사한 제품 찾기" 같은 고급 검색 기능을 구현할 수 있습니다.

### 2.2 Atlas 검색 엔진

MongoDB Atlas는 Lucene 기반 전문 검색 엔진을 내장하고 있습니다. 이는 별도의 검색 엔진 없이 MongoDB만으로 전문 검색 기능을 구현할 수 있게 해줍니다.

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      text: {
        query: 'organic coffee',
        path: 'description'
      }
    }
  },
  {
    $limit: 5
  },
  {
    $project: {
      _id: 0,
      name: 1,
      description: 1,
      score: { $meta: 'searchScore' }
    }
  }
])
```

이 쿼리는 "organic coffee"라는 키워드로 제품을 검색하고, 관련성 점수와 함께 결과를 반환합니다.

## 3. 문서 모델의 장점: 개발 생산성 향상

MongoDB의 문서 모델은 객체 지향 프로그래밍과 자연스럽게 매핑됩니다. 이는 개발 과정을 간소화하고 생산성을 크게 향상시킵니다. 이 부분을 좀 더 자세히 살펴보고, 일부 단점도 함께 고려해 보겠습니다.

### 3.1 객체-문서 매핑의 자연스러움

객체 지향 프로그래밍에서 객체는 속성과 메서드를 갖습니다. MongoDB의 문서는 이러한 객체 구조를 그대로 표현할 수 있습니다.

예를 들어, 다음과 같은 Java 클래스가 있다고 가정해 보겠습니다

```java
public class Person {
    private String name;
    private int age;
    private List<String> hobbies;
    private Address address;
}

public class Address {
    private String street;
    private String city;
    private String country;
}
```

이 클래스 구조는 MongoDB 문서로 다음과 같이 자연스럽게 매핑됩니다.

```javascript
{
  "name": "John Doe",
  "age": 30,
  "hobbies": ["reading", "swimming"],
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "country": "USA"
  }
}
```

이러한 직접적인 매핑은 ORM(Object-Relational Mapping) 레이어의 복잡성을 크게 줄여줍니다. RDBMS에서는 이러한 구조를 표현하기 위해 여러 테이블을 만들고 조인해야 할 것입니다.

### 3.2 스키마 유연성과 진화

MongoDB의 동적 스키마는 애플리케이션의 요구사항 변화에 빠르게 대응할 수 있게 해줍니다.

예를 들어, Person 클래스에 새로운 필드를 추가하고 싶다면

```java
public class Person {
    // ... 기존 필드들 ...
    private String email; // 새로 추가된 필드
}
```

MongoDB에서는 기존 문서를 변경하지 않고도 새 필드를 바로 사용할 수 있습니다.

```javascript
db.persons.updateOne(
  { name: "John Doe" },
  { $set: { email: "john@example.com" } }
)
```

이는 애플리케이션 개발 속도를 크게 향상시킬 수 있습니다. RDBMS에서는 이를 위해 ALTER TABLE 명령을 실행해야 하며, 대규모 데이터베이스에서는 이 작업이 상당한 시간을 소요할 수 있습니다.

### 3.3 복잡한 데이터 구조의 표현

MongoDB는 배열과 중첩 문서로 복잡한 데이터 구조를 단일 문서 내에 표현할 수 있습니다. 이는 특히 계층적 데이터나 다대다 관계를 표현할 때 유용합니다.

예를 들어, 블로그 포스트와 댓글을 표현하는 구조를 살펴보겠습니다.

```javascript
{
  "_id": ObjectId("..."),
  "title": "MongoDB vs RDBMS",
  "content": "...",
  "author": {
    "name": "Jane Smith",
    "email": "jane@example.com"
  },
  "tags": ["database", "nosql", "mongodb"],
  "comments": [
    {
      "user": "Bob",
      "text": "Great post!",
      "date": ISODate("2023-07-30T...")
    },
    {
      "user": "Alice",
      "text": "Thanks for the explanation",
      "date": ISODate("2023-07-31T...")
    }
  ]
}
```

이 구조는 블로그 포스트, 작성자 정보, 태그, 그리고 댓글을 모두 하나의 문서로 표현합니다. RDBMS에서는 이를 위해 최소 3개의 테이블(posts, authors, comments)과 복잡한 조인이 필요할 것입니다.

## 4. 확장성과 성능

MongoDB는 수평적 확장(sharding)을 기본적으로 지원합니다. 이는 대규모 데이터와 높은 처리량을 요구하는 애플리케이션에 이상적입니다.

```javascript
sh.enableSharding("mydb")
sh.shardCollection("mydb.users", { "userId": "hashed" })
```

이 명령은 'users' 컬렉션을 userId를 기준으로 샤딩합니다. 이로써 데이터를 여러 서버에 분산하여 저장하고 처리할 수 있습니다.

## 5. 단점과 주의사항

물론 MongoDB의 문서 모델에도 몇 가지 주의해야 할 점이 있습니다.

1. **데이터 중복**: 문서 모델은 종종 데이터 중복을 초래할 수 있습니다. 예를 들어, 여러 블로그 포스트에 같은 작성자 정보가 반복될 수 있습니다. 이는 데이터 일관성 관리에 주의를 요구합니다.
2. **트랜잭션 복잡성**: 여러 문서에 걸친 트랜잭션은 RDBMS보다 복잡할 수 있습니다. MongoDB 4.0 이상에서 다중 문서 트랜잭션을 지원하지만, 성능상의 이유로 가능한 한 단일 문서 내에서 작업을 완결하는 것이 좋습니다.
3. **쿼리의 복잡성**: 중첩된 문서나 배열에 대한 복잡한 쿼리는 RDBMS의 SQL보다 표현하기 어려울 수 있습니다.
4. **스키마 설계의 중요성**: 유연한 스키마는 장점이지만, 잘못 설계된 스키마는 성능 문제나 데이터 불일치를 초래할 수 있습니다. 초기 스키마 설계에 충분한 고민이 필요합니다.

## 결론

RDBMS가 여전히 강력하고 필요한 도구임은 분명합니다. 그러나 현대의 애플리케이션 개발에서 요구되는 유연성, 확장성, 그리고 개발 생산성을 고려할 때 MongoDB는 매우 매력적인 선택입니다.

MongoDB는 이제 ACID 트랜잭션, 스키마 검증 등 RDBMS의 주요 장점들을 제공하면서도, 문서 모델의 유연성과 강력한 확장성을 유지하고 있습니다. 여기에 벡터 검색, Atlas 검색 엔진 같은 최신 기능들이 더해져, 현대적인 애플리케이션 개발에 이상적인 데이터베이스 솔루션이 되었습니다.

물론 모든 상황에 MongoDB가 최선의 선택은 아닐 것입니다. 데이터의 특성, 애플리케이션의 요구사항, 개발 팀의 역량 등을 종합적으로 고려하여 적절한 데이터베이스를 선택해야 합니다. 그러나 많은 현대적인 애플리케이션 시나리오에서 MongoDB는 탁월한 선택이 될 수 있습니다.

RDBMS와 MongoDB를 상호 보완적으로 사용하는 것도 좋은 전략일 수 있습니다. 중요한 것은 각 데이터베이스의 장단점을 이해하고, 주어진 문제를 해결하는 데 가장 적합한 도구를 선택하는 것입니다.
