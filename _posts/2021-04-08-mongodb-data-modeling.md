---
date: 2021-04-08 19:29:14 +0900
title: "MongoDB Data Modeling"
category: mongodb
excerpt: "데이터 모델링은 애플리케이션의 요구사항과 데이터베이스 엔진의 성능 특성, 데이터 조회 패턴 사이에서 균형을 잡는 일입니다. MongoDB 에서 임베딩과 참조를 고르는 기준을 정리합니다."
updated: 2026-09-20
---

데이터 모델링의 핵심은 애플리케이션의 요구사항과 데이터베이스 엔진의 성능 특성, 그리고 데이터 조회 패턴 사이에서 균형을 잡는 것입니다. 데이터 모델을 설계할 때는 데이터 자체의 구조뿐 아니라 애플리케이션이 그 데이터를 어떻게 조회하고 갱신하고 처리하는지를 함께 봐야 합니다. 공식 문서는 이 원칙을 한 문장으로 정리합니다. 함께 조회하는 데이터는 함께 저장하라는 것입니다.

MongoDB 도큐먼트 하나는 16MiB(16 메비바이트)를 넘을 수 없고, 중첩은 100단계까지만 허용됩니다. 객체와 배열이 각각 한 단계를 차지합니다. 그래서 임베딩과 참조를 상황에 맞게 나눠 써야 합니다. 한 컬렉션의 도큐먼트가 같은 필드 집합을 가질 필요가 없는 유연한 스키마를 제공하지만, 한 번에 함께 조회되는 데이터와 자주 갱신되는 데이터를 구분해 두지 않으면 나중에 되돌리기 어렵습니다. 정규화한 모델과 비정규화한 모델을 한 스키마 안에서 섞어 쓸 수 있다는 점이 MongoDB 모델링의 가장 큰 특징입니다.

## MongoDB 모델링의 특징

### 유연한 스키마 (Flexible Schema)

데이터를 넣기 전에 테이블 스키마를 결정하고 선언해야 하는 SQL 데이터베이스와 달리, MongoDB 컬렉션의 도큐먼트는 기본적으로 같은 스키마를 가질 필요가 없습니다.

- 한 컬렉션의 도큐먼트가 같은 필드 집합을 가질 필요가 없고, 같은 이름의 필드라도 도큐먼트마다 데이터 타입이 다를 수 있습니다.
- 컬렉션의 도큐먼트 구조를 바꾸려면 새 필드를 추가하거나 기존 필드를 제거하거나 값의 타입을 바꿔서 도큐먼트를 새 구조로 갱신합니다.

이 유연성 덕분에 도큐먼트를 엔티티에 그대로 대응시킬 수 있습니다. 같은 컬렉션 안의 도큐먼트끼리 구조가 상당히 달라도 각 도큐먼트는 자신이 대표하는 엔티티의 필드를 담을 수 있습니다. 다만 실제로는 한 컬렉션의 도큐먼트가 비슷한 구조를 공유하므로, 삽입과 갱신 시점에 도큐먼트 유효성 검사 규칙을 적용해 구조를 고정할 수도 있습니다.

### 도큐먼트 구조

데이터 모델 설계에서 가장 중요한 결정은 도큐먼트 구조를 어떻게 잡고 데이터 사이의 관계를 어떻게 표현할지입니다. MongoDB 는 관련 데이터를 한 도큐먼트 안에 담을 수 있습니다. 공식 문서는 비정규화한 데이터 모델이 MongoDB 의 대부분 사용 사례에 맞는다고 적습니다.

#### 임베디드 데이터

임베디드 도큐먼트는 관계가 있는 데이터를 하나의 도큐먼트 구조에 담습니다. 도큐먼트 안에 다시 도큐먼트나 배열을 넣을 수 있습니다. 공식 문서는 임베딩의 이점을 세 가지로 정리합니다. 읽기 성능이 좋아지고, 관련 데이터를 데이터베이스 작업 한 번으로 가져올 수 있고, 관련 데이터를 원자적 쓰기 한 번으로 갱신할 수 있습니다.

> **NOTE** — 도큐먼트는 16MiB 보다 작아야 합니다. 이 한계를 넘는 큰 바이너리 데이터는 GridFS 를 씁니다.

단일 도큐먼트에 대한 쓰기는 하위 도큐먼트 여러 개를 건드려도 항상 원자적입니다. 여러 도큐먼트나 여러 컬렉션에 걸친 원자성이 필요하면 분산 트랜잭션을 쓸 수 있습니다. 레플리카 셋과 샤드 클러스터 모두 지원합니다. 다만 공식 문서는 분산 트랜잭션이 단일 도큐먼트 쓰기보다 비용이 크므로 스키마 설계를 대체하는 수단으로 쓰지 말라고 못 박습니다. 트랜잭션이 있으니 아무렇게나 나눠도 된다는 뜻이 아니고, 임베딩 말고는 방법이 없다는 뜻도 아닙니다.

공식 문서가 임베디드 데이터 모델을 권고하는 경우는 다음과 같습니다.

- **1:1 관계에서 엔티티 사이에 '포함' 관계가 있는 경우.**
  연결된 데이터를 한 도큐먼트에 담으면 데이터를 얻는 데 필요한 읽기 작업 수를 줄일 수 있습니다. 애플리케이션이 한 번의 읽기로 필요한 정보를 모두 받도록 스키마를 잡는 편이 좋습니다.
  아래는 고객과 주소 관계를 매핑하는 예제입니다. 한 데이터 엔티티를 다른 엔티티의 맥락에서만 봐야 하는 경우 참조보다 임베딩이 유리하다는 것을 보여줍니다. 고객과 주소의 일대일 관계에서 주소는 고객에 속한 데이터입니다.

```javascript
// 후원자 도큐먼트
{
   _id: "joe",
   name: "Joe Bookreader"
}

// 주소 도큐먼트
{
patron_id: "joe", // 후원자 도큐먼트를 참조
street: "123 Fake Street",
city: "Faketon",
state: "MA",
zip: "12345"
}
```

  하나의 도큐먼트로 임베딩

```javascript
{
   _id: "joe",
   name: "Joe Bookreader",
   address: {
              street: "123 Fake Street",
              city: "Faketon",
              state: "MA",
              zip: "12345"
            }
}
```

- **하위 도큐먼트를 항상 상위 도큐먼트와 함께 읽는 1:N 관계.**
  아래도 고객과 주소 관계를 매핑하는 예제입니다. 여러 데이터 항목을 상위 엔티티의 맥락에서만 보는 경우 참조보다 임베딩이 유리하다는 것을 보여줍니다. 고객 하나가 주소 엔티티 여러 개를 갖는 일대다 관계입니다.

```javascript
// 후원자 도큐먼트
{
   _id: "joe",
   name: "Joe Bookreader"
}

// 주소 도큐먼트
{
   patron_id: "joe",           // 후원자 도큐먼트 참조
   street: "123 Fake Street",
   city: "Faketon",
   state: "MA",
   zip: "12345"
}
{
   patron_id: "joe",
   street: "1 Some Other Street",
   city: "Boston",
   state: "MA",
   zip: "12345"
}
```

  하나의 도큐먼트로 임베딩

```javascript
{
   "_id": "joe",
   "name": "Joe Bookreader",
   "addresses": [
                {
                  "street": "123 Fake Street",
                  "city": "Faketon",
                  "state": "MA",
                  "zip": "12345"
                },
                {
                  "street": "1 Some Other Street",
                  "city": "Boston",
                  "state": "MA",
                  "zip": "12345"
                }
              ]
 }
```

임베디드 도큐먼트를 쓸 때 하위 도큐먼트의 필드명이 길면 그 이름이 도큐먼트마다 그대로 저장되므로, 조회 대상이 늘어날수록 몇 바이트씩 모여 전체 크기에 영향을 줍니다. 다만 공식 문서는 필드명 단축에 선을 긋습니다. 이름을 줄이면 BSON 크기는 줄지만 표현력이 떨어지고, 인덱스는 필드명을 담지 않는 구조라서 인덱스 크기는 줄지 않습니다. 대개는 이름을 줄이기보다 도큐먼트 모델 자체를 손보는 편이 효과적입니다.

#### 참조(References)

참조는 한 도큐먼트가 다른 도큐먼트를 가리키는 링크를 담아 관계를 저장합니다. 애플리케이션이 이 참조를 따라가 관련 데이터를 읽습니다. 데이터가 여러 컬렉션으로 나뉘고 중복되지 않으므로 정규화한 데이터 모델입니다.

공식 문서가 임베딩 대신 참조를 고려하라고 적는 경우는 다음과 같습니다.

- 임베딩이 데이터 중복을 만드는데, 그 중복을 감당할 만큼 읽기 성능 이득이 크지 않을 때. 임베딩한 데이터가 자주 바뀌는 경우가 여기에 해당합니다.
- 복잡한 다대다(N:N) 관계나 큰 계층형 데이터 셋을 표현해야 할 때
- 관련 엔티티를 그 자체로 자주 조회해야 할 때
- 임베딩한 배열이 상한 없이 자라는 구조일 때

컬렉션 사이의 조인은 집계 파이프라인 스테이지로 구현합니다.

- [`$lookup`](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/)
- [`$graphLookup`](https://www.mongodb.com/docs/manual/reference/operator/aggregation/graphLookup/)

다음은 출판사와 도서의 관계를 매핑하는 예제입니다. 출판사 정보가 도서마다 반복되는 것을 막으려면 임베딩보다 참조가 낫다는 것을 보여줍니다.

```javascript
{
   title: "MongoDB: The Definitive Guide",
   author: [ "Kristina Chodorow", "Mike Dirolf" ],
   published_date: ISODate("2010-09-24"),
   pages: 216,
   language: "English",
   publisher: {
              name: "O'Reilly Media",
              founded: 1980,
              location: "CA"
            }
}
{
   title: "50 Tips and Tricks for MongoDB Developer",
   author: "Kristina Chodorow",
   published_date: ISODate("2011-05-06"),
   pages: 68,
   language: "English",
   publisher: {
              name: "O'Reilly Media",
              founded: 1980,
              location: "CA"
            }
}
```

출판사 데이터의 반복을 막으려면 참조를 써서 출판사 정보를 도서 컬렉션과 별도의 컬렉션으로 분리합니다.

참조를 쓸 때는 관계가 어느 쪽으로 자라는지에 따라 참조를 어디에 둘지가 갈립니다. 출판사당 도서 수가 적고 증가가 제한적이면 출판사 도큐먼트 안에 도서 정보를 참조로 저장하는 편이 유용할 수 있습니다. 출판사당 도서 수에 상한이 없으면 이 데이터 모델은 다음 예제처럼 계속 자라는 배열이 됩니다.

```javascript
{
   name: "O'Reilly Media",
   founded: 1980,
   location: "CA",
   books: [123456789, 234567890, ...]
}

{
    _id: 123456789,
    title: "MongoDB: The Definitive Guide",
    author: [ "Kristina Chodorow", "Mike Dirolf" ],
    published_date: ISODate("2010-09-24"),
    pages: 216,
    language: "English"
}

{
   _id: 234567890,
   title: "50 Tips and Tricks for MongoDB Developer",
   author: "Kristina Chodorow",
   published_date: ISODate("2011-05-06"),
   pages: 68,
   language: "English"
}
```

`books` 필드가 배열이고 그 안에 도서 참조가 들어 있습니다. 배열이 상한 없이 자라는 것을 피하고 데이터 변경을 쉽게 하려면, 반대로 도서 도큐먼트가 출판사 도큐먼트를 참조하게 둘 수 있습니다.

```javascript
{
   _id: "oreilly",
   name: "O'Reilly Media",
   founded: 1980,
   location: "CA"
}
{
   _id: 123456789,
   title: "MongoDB: The Definitive Guide",
   author: [ "Kristina Chodorow", "Mike Dirolf" ],
   published_date: ISODate("2010-09-24"),
   pages: 216,
   language: "English",
   publisher_id: "oreilly"
}
{
   _id: 234567890,
   title: "50 Tips and Tricks for MongoDB Developer",
   author: "Kristina Chodorow",
   published_date: ISODate("2011-05-06"),
   pages: 68,
   language: "English",
   publisher_id: "oreilly"
}
```

공식 문서는 임베딩과 참조를 고를 때 볼 기준을 다음과 같이 정리합니다.

| 임베딩이 맞는 경우 | 참조가 맞는 경우 |
| --- | --- |
| 함께 두면 모델과 코드가 단순해지는 관계 | 자식 쪽 카디널리티가 높은 관계 |
| `has-a`·`contains` 관계 | 상한 없이 자라는 임베디드 배열 |
| 애플리케이션이 함께 조회하는 데이터 | 합쳐 두면 메모리·전송 대역을 크게 쓰는 데이터 |
| 함께 갱신하는 데이터 | 쓰기 위주 워크로드에서 서로 다른 시점에 기록되는 데이터 |
| 같은 시점에 아카이브하는 데이터 | 중복 관리가 복잡하거나 부모 없이 존재할 수 있는 데이터 |

{% include diagram.html src="embed-or-reference.svg" caption="관계 강도·일관성 요구·크기 제약·증가 패턴 순서로 판단해 임베딩과 참조를 고릅니다." %}

## MongoDB의 View

MongoDB 의 view 는 다른 컬렉션이나 다른 view 위에 정의한 집계 파이프라인의 결과를 조회할 수 있게 만든 읽기 전용 객체입니다. RDBMS 에서 view 를 쓰는 이유는 보통 두 가지입니다.

- 복잡한 가공 로직을 감싸서 사용자가 쉽게 접근하도록 합니다.
- 테이블의 일부 데이터에만 접근 권한을 주어 보안을 강화합니다.

표준 view 는 내용을 디스크에 저장하지 않고 클라이언트가 조회하는 시점에 계산합니다. 쓰기 작업은 오류를 반환합니다. `show collections` 나 `db.getCollectionNames()` 처럼 컬렉션 목록을 내는 작업에는 view 이름도 함께 나오지만, 그 목록만 보고 무엇이 view 인지는 알 수 없습니다. view 정의는 데이터베이스의 `system.views` 컬렉션에 저장되므로 `db.system.views.find()` 로 확인할 수 있습니다. view 는 실제 데이터를 갖지 않으므로 view 를 지워도 원본 컬렉션과 데이터는 그대로 남습니다.

MongoDB 는 표준 view 외에 온디맨드 구체화 뷰(on-demand materialized view)도 제공합니다. 집계 파이프라인의 `$merge` 나 `$out` 스테이지로 결과를 컬렉션에 써 두는 방식입니다. 디스크에 저장되므로 인덱스를 직접 만들 수 있고, 파이프라인이 복잡하고 집계 대상이 클수록 표준 view 보다 읽기 성능이 좋습니다.

다음은 표준 view 를 쓸 때 주의할 점입니다.

- 표준 view 는 원본 컬렉션의 인덱스를 씁니다. view 에 일반 인덱스를 직접 만들거나 지우거나 목록으로 볼 수 없으므로, 조건에 맞는 인덱스가 원본 컬렉션에 없으면 전체 스캔이 됩니다.
- view 를 다시 다른 view 의 원본으로 삼으면 바깥 view 의 쿼리도 결국 같은 집계로 펼쳐집니다. 처리할 도큐먼트가 많으면 성능을 보장하기 어렵습니다.
- 표준 view 는 결과를 저장하지 않으므로, 가공 비용이 큰 파이프라인을 자주 조회하면 그 비용을 매번 냅니다.

view 파이프라인에 집계의 모든 스테이지를 넣을 수 있는 것은 아닙니다. `$out` 과 `$merge` 는 view 정의에 쓸 수 없고, `$lookup` 이나 `$facet` 안에 중첩된 파이프라인에도 같은 제약이 걸립니다. view 에서는 `db.collection.mapReduce()` 와 `$text` 연산자를 쓸 수 없고, 한번 만든 view 는 이름을 바꿀 수 없습니다. view 에 대한 `find()` 는 `$`, `$elemMatch`, `$slice`, `$meta` 프로젝션 연산자를 지원하지 않습니다.

view 의 파이프라인도 집계와 같은 메모리 제약을 받습니다. 블로킹 정렬과 블로킹 그룹 스테이지는 100MB 를 넘으면 임시 파일을 씁니다. `allowDiskUseByDefault` 파라미터의 기본값이 `true` 라서 별도 설정 없이 디스크로 넘어가고, 개별 `find`·`aggregate` 명령에서 `allowDiskUse` 로 이 동작을 뒤집을 수 있습니다.

## 배열 (Array)

복잡한 모델을 구현할 때 RDBMS 에는 없는 수단이 배열입니다. 배열을 쓰면 여러 컬렉션으로 나뉘어야 할 데이터가 한 컬렉션에 모이므로 한 번의 쿼리로 조회하고 변경할 수 있고, 컬렉션이 여러 개일 때보다 개발이 빠릅니다. 배열 필드에도 멀티키 인덱스(multi-key index)를 만들 수 있습니다.

문제는 배열이 상한 없이 자랄 때입니다. 공식 문서는 상한 없는 배열(unbounded array)을 스키마 설계 안티패턴으로 분류합니다. 배열이 커지면 도큐먼트가 16MiB 한계를 넘을 수 있고, 애플리케이션 리소스를 압박하고, 인덱스 성능이 떨어집니다. 해법으로 제시하는 것은 두 가지입니다. 필요한 부분만 도큐먼트에 담는 서브셋 패턴과, 나머지를 별도 컬렉션으로 빼는 참조입니다.

배열을 특정 개수 기준으로 잘라 여러 도큐먼트에 나누는 방식은 공식 문서가 이상치 패턴(outlier pattern)이라는 이름으로 문서화하고 있습니다.

아래는 팔로워 목록 모델링입니다. 특정 사용자의 팔로워가 배열 하나에 모여 있습니다.

```javascript
{
  "_id" : ObjectId("6062c5c009fab8547ddb977e"),
  "userId" : ObjectId("6062c5c009fab8547ddb977d"),
  "username" : "judy",
  "count" : 512,
  "followers" : [
    ObjectId("6062c6b309fab8547ddb9787"),
    ObjectId("6062c6db09fab8547ddb978c"),
    ObjectId("6062c65909fab8547ddb9782"),
    ObjectId("6062c80709fab8547ddb979b"),
    ObjectId("6062c7c309fab8547ddb9796"),
    ObjectId("6062c73609fab8547ddb9791"),
    ObjectId("6062c86b09fab8547ddb97a0"),
    ObjectId("6062c8bb09fab8547ddb97a5"),
                ...
                ...
                ...
  ]
}
```

ObjectId 하나는 12바이트이므로, 16MiB 를 값만으로 채운다는 계산으로는 140만 개 정도가 상한입니다. BSON 배열은 요소마다 인덱스를 문자열 키로 함께 저장하므로 실제로는 이보다 적게 들어갑니다. 어느 쪽이든 한 도큐먼트가 여기까지 자라는 구조는 위에서 말한 안티패턴에 그대로 걸립니다.

이상치 패턴을 적용하면 다음과 같이 바꿀 수 있습니다.

```javascript
{
  "_id" : ObjectId("6062c5c009fab8547ddb977e"),
  "userId" : ObjectId("6062c5c009fab8547ddb977d"),
  "username" : "judy",
  "count" : 200,
  "addList" : [ ObjectId("6062c5c009fab8547ddb977f"), ObjectId("6062c5c009fab8547ddb9780") ],
  "followers" : [
    ObjectId("6062c6b309fab8547ddb9787"),
    ObjectId("6062c6db09fab8547ddb978c"),
    ObjectId("6062c65909fab8547ddb9782"),
    ObjectId("6062c80709fab8547ddb979b"),
    ObjectId("6062c7c309fab8547ddb9796"),
    ObjectId("6062c73609fab8547ddb9791"),
    ObjectId("6062c86b09fab8547ddb97a0"),
    ObjectId("6062c8bb09fab8547ddb97a5"),
    ObjectId("6062c8bb09fab8547ddb97a6"),
    ObjectId("6062c8bb09fab8547ddb97a7"),
    ...
    ...
    ...
  ]
}

{
  "_id" : ObjectId("6062c5c009fab8547ddb977f"),
  "count" : 200,
  "followers" : [
    ObjectId("6062c6b309fab8547ddb9788"),
    ObjectId("6062c6db09fab8547ddb9789"),
    ObjectId("6062c65909fab8547ddb9780"),
    ObjectId("6062c80709fab8547ddb979c"),
    ObjectId("6062c7c309fab8547ddb9797"),
    ObjectId("6062c73609fab8547ddb9792"),
    ObjectId("6062c86b09fab8547ddb97a1"),
    ObjectId("6062c8bb09fab8547ddb97a6"),
    ObjectId("6062c8bb09fab8547ddb97a7"),
    ObjectId("6062c8bb09fab8547ddb97a8"),
    ...
    ...
    ...
  ]
}

{
  "_id" : ObjectId("6062c5c009fab8547ddb9780"),
  "count" : 112,
  "followers" : [
    ObjectId("6062c6b309fab8547ddb971a"),
    ...
    ...
    ...
    ObjectId("6062c6db09fab8547ddb9712")
  ]
}
```

기존 도큐먼트에 `addList` 필드를 추가해, 팔로워 배열과 카운트만 담은 도큐먼트의 `_id` 값을 모아 둡니다.

특정 기준으로 배열을 여러 도큐먼트에 나누면 요소가 늘어나도 도큐먼트 하나의 크기와 읽기 비용을 예측 가능한 범위에 묶어 둘 수 있습니다. 팔로워 목록은 애플리케이션에서 한 번에 전부 가져오지 않고 화면 단위로 잘라 추가 로딩하도록 설계하는 경우가 많으므로, 이렇게 나눈 구조와도 잘 맞습니다.

## MongoDB의 다양한 모델링 패턴

MongoDB 는 블로그의 Building With Patterns 시리즈에서 성능을 고려한 모델링 패턴에 이름을 붙여 소개합니다.

- **The [Polymorphic](https://www.mongodb.com/blog/post/building-with-patterns-the-polymorphic-pattern) pattern** (다형성 패턴): 컬렉션 내 모든 도큐먼트가 유사하지만 동일하지는 않은 구조를 가질 때 적합합니다.
- **The [Attribute](https://www.mongodb.com/blog/post/building-with-patterns-the-attribute-pattern) pattern** (속성 패턴): 정렬하거나 조회할 공통 특성을 가진 필드가 도큐먼트의 일부 집합에만 있을 때 적합합니다.
- **The [Bucket](https://www.mongodb.com/blog/post/building-with-patterns-the-bucket-pattern) pattern** (버킷 패턴): 데이터가 일정 기간에 걸쳐 스트림으로 유입되는 시계열 데이터에 적합합니다.
- **The [Outlier](https://www.mongodb.com/blog/post/building-with-patterns-the-outlier-pattern) pattern** (이상치 패턴): 일부 도큐먼트의 조회 양상이 애플리케이션의 정상 패턴을 벗어날 때 적합합니다. 인기도 편차가 큰 상황을 위해 설계됐습니다.
- **The [Computed](https://www.mongodb.com/blog/post/building-with-patterns-the-computed-pattern) pattern** (계산된 패턴): 같은 계산을 자주 해야 하거나 접근 패턴이 읽기 집약적일 때 적합합니다. 동일 계산의 반복을 줄입니다.
- **The [Subset](https://www.mongodb.com/blog/post/building-with-patterns-the-subset-pattern) pattern** (서브셋 패턴): 작업 셋이 장비의 램 용량을 초과할 때 적합합니다.
- **The [Extended Reference](https://www.mongodb.com/blog/post/building-with-patterns-the-extended-reference-pattern) pattern** (확장된 참조 패턴): 각각 고유한 컬렉션을 가진 논리 엔티티 여러 개를 특정 기능을 위해 한데 모을 때 씁니다.
- **The [Approximation](https://www.mongodb.com/blog/post/building-with-patterns-the-approximation-pattern) pattern** (근사 패턴): 시간·메모리·CPU 를 많이 쓰는 계산이 필요하지만 정확도가 반드시 필요하지는 않은 상황에 적합합니다.
- **The [Tree](https://www.mongodb.com/blog/post/building-with-patterns-the-tree-pattern) pattern** (트리 패턴): 조회가 많고 구조가 주로 계층적인 데이터에 적용합니다. 함께 조회되는 데이터를 한데 저장하는 방식을 따릅니다.
- **The [Preallocation](https://www.mongodb.com/blog/post/building-with-patterns-the-preallocation-pattern) pattern** (사전 할당 패턴): 빈 구조를 미리 할당합니다.
- **The [Document Versioning](https://www.mongodb.com/blog/post/building-with-patterns-the-document-versioning-pattern) Pattern** (도큐먼트 버전 관리 패턴): 도큐먼트의 이전 버전을 유지하는 메커니즘을 제공합니다.

이 이름 가운데 일부는 공식 매뉴얼에도 들어왔습니다. 매뉴얼의 스키마 설계 패턴 절은 계산된 값, 데이터 그룹화(버킷 패턴과 이상치 패턴), 다형성 데이터, 도큐먼트 및 스키마 버전 관리, 아카이브, 단일 컬렉션 을 문서화합니다. 서브셋 패턴은 상한 없는 배열 안티패턴 문서에서 다루고, 트리 구조는 별도의 트리 모델링 문서에 있습니다. 속성 패턴, 확장된 참조 패턴, 근사 패턴, 사전 할당 패턴은 매뉴얼에 같은 이름의 절이 없고 블로그 시리즈에만 있습니다.

버킷 패턴을 직접 구현하기 전에는 시계열 컬렉션(time series collection)을 먼저 보는 편이 좋습니다. 공식 문서는 시계열 컬렉션이 버킷 패턴을 자동으로 적용하며 버킷 패턴의 대부분 사용 사례에 적합하다고 적습니다.

## 도큐먼트 유효성 체크 (Schema Validation)

MongoDB 는 유연한 스키마를 쓰기 때문에 같은 컬렉션 안에서도 필드를 더하거나 뺀 도큐먼트를 언제든 넣을 수 있습니다. 실수로 들어간 필드나 의도하지 않은 구조 변형을 막으려면 컬렉션에 유효성 검사 규칙을 지정합니다. 공식 문서는 스키마 검증이 데이터 구조가 이미 정해진 애플리케이션에서 가장 유용하다고 적고, 규칙이 도큐먼트의 모든 필드를 덮을 필요는 없다고 덧붙입니다.

아래는 블로그 포스트의 likes 통계를 따로 빼둔 `likes` 컬렉션에 유효성 검사를 지정해 만드는 예제입니다.

```javascript
db.createCollection("likes", {
    "storageEngine": {
        "wiredTiger": {}
    },
    "capped": false,
    "validator": {
        "$jsonSchema": {
            "bsonType": "object",
            "title": "likes",
            "properties": {
                "_id": {
                    "bsonType": "objectId"
                },
                "postId": {
                    "bsonType": "objectId",
                    "description": "포스트 ID"
                },
                "count": {
                    "bsonType": "number",
                    "description": "포스트 Like 수",
                    "minimum": 0
                },
                "likeUsers": {
                    "bsonType": "array",
                    "description": "like 누른 유저 목록 배열",
                    "additionalItems": true,
                    "items": {
                        "bsonType": "objectId",
                        "description": " 오브젝트ID"
                    }
                }
            },
            "additionalProperties": false,
            "required": [
                "postId",
                "count",
                "likeUsers"
            ]
        }
    },
    "validationLevel": "moderate",
    "validationAction": "error"
});
```

`$jsonSchema` 로 필드별 BSON 타입과 값의 범위를 지정할 수 있습니다. 위 예제는 `validationLevel` 이 `moderate`, `validationAction` 이 `error` 이므로 해당 필드에 맞지 않는 타입이 들어오면 오류를 반환하고 데이터는 들어가지 않습니다. 배열 요소 개수를 제한하거나, GeoJSON 을 쓸 때 위경도 범위를 좁히거나, boolean 필드를 `true` 와 `false` 로만 제한하는 것도 같은 방식입니다. `$jsonSchema` 대신 쿼리 연산자로 규칙을 쓸 수도 있는데, 이때 `$near`·`$nearSphere`·`$text`·`$where` 는 쓸 수 없습니다.

쓸 수 있는 옵션은 다음과 같습니다.

- **validationLevel**
  - `off` — 삽입과 갱신 모두 검사하지 않습니다.
  - `strict` — 기본값입니다. 모든 삽입과 모든 갱신에 규칙을 적용합니다.
  - `moderate` — 삽입과, 이미 규칙을 만족하는 도큐먼트의 갱신에만 규칙을 적용합니다. 규칙을 만족하지 못한 상태로 들어 있던 도큐먼트의 갱신은 검사하지 않습니다.
- **validationAction**
  - `error` — 기본값입니다. 규칙을 위반하는 삽입·갱신을 거부합니다.
  - `warn` — 작업을 통과시키고 위반 내용을 MongoDB 로그에 남깁니다.
  - `errorAndLog` — 작업을 거부하고 오류를 `mongod` 로그에도 남깁니다. MongoDB 8.1 에서 추가됐습니다.

## 참고 자료

도서: Real MongoDB

[MongoDB Manual](https://www.mongodb.com/docs/manual/)
