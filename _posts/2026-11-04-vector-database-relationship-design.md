---
date: 2026-11-04 00:00:00 +0900
title: "관계는 어떻게 설계할까: 복사와 참조, 문서 단위 묶기, 참조로 만든 벡터"
category: ai/ml
excerpt: "조인이 없거나 약한 벡터 DB에서 레코드 사이의 관계를 표현하는 방법을 정리합니다. ID만 저장하고 두 번 조회하기, 필드를 복사하는 비정규화, DB의 참조 기능을 비교하고, 같은 문서의 청크를 묶는 그룹핑과 Weaviate의 교차 참조·ref2vec-centroid로 만든 추천 스키마를 손으로 계산할 수 있는 예제와 함께 다룹니다."
last_modified_at: 2026-11-04
series: "벡터 DB"
series_index: "7 / 7"
---

**시리즈** · [1. 개념과 제품·사용 지표](/writing/vector-database-overview/) · [2. 선택 기준과 기능 비교](/writing/vector-database-selection/) · [3. AWS 전용 벡터 검색](/writing/aws-vector-search/) · [4. 스키마와 컬렉션 설계](/writing/vector-database-schema-design/) · [5. 벡터 구조와 청킹 전략](/writing/vector-database-vector-design/) · [6. 메타데이터 설계](/writing/vector-database-metadata-design/) · **7. 관계 설계**

[6편](/writing/vector-database-metadata-design/)까지는 레코드 하나 안에 무엇을 담을지를 다뤘습니다. ID·벡터·원문을 정하고 필터와 권한과 추적에 쓰는 메타데이터를 붙였습니다. 서비스를 키우다 보면 레코드와 레코드 사이의 관계가 필요해집니다.

쇼핑몰 상품 검색을 예로 들어 보겠습니다. 상품 레코드에는 상품 설명의 벡터가 있습니다. 검색 결과에 브랜드 이름을 함께 보여 주고 싶고 특정 브랜드의 상품만 거르고 싶습니다. 브랜드 정보를 상품마다 복사해 둘지, 브랜드를 따로 두고 상품에서 가리키게 할지 정해야 합니다. 고객이 “좋아요”를 누른 상품으로 그 고객에게 맞는 상품을 추천하고 싶을 때도 있습니다. 이때 고객과 상품의 관계를 어디에 어떻게 저장할지가 추천 방식을 정합니다.

사내 문서 검색에서도 같은 문제가 생깁니다. 6편에서 청크마다 원문 문서의 `doc_id`를 붙였습니다. 그런데 질문 하나에 같은 문서의 청크 네 개가 상위 5개를 차지하면 다른 문서는 결과에 거의 나오지 못합니다. 청크와 문서의 관계를 써서 결과를 문서 단위로 묶어야 합니다.

**이 글에서 알 수 있는 것**

- 벡터 DB에서 레코드 사이의 관계를 표현하는 세 가지 방법(ID 저장 후 두 번 조회, 복사, DB의 참조 기능)과 고르는 기준
- 같은 문서의 청크가 결과를 차지하지 않도록 문서 단위로 묶는 기능과 제품별 차이
- Weaviate의 교차 참조(cross-reference)를 정의하고 조회하는 방법과 주의할 점
- 참조한 상품 벡터의 평균으로 고객 벡터를 만드는 ref2vec-centroid의 동작과 한계
- 고객·상품·브랜드로 만든 추천 스키마와, 평균 벡터 대신 쓸 수 있는 방법

이 글의 문서 조사 기준일은 2026년 11월 4일입니다. Weaviate 예제는 Weaviate 1.40.3과 Python 클라이언트 4.24.1에서 직접 실행해 확인했습니다. Qdrant는 v1.20, Milvus는 v3.0.x, pgvector는 0.8.7 문서를 기준으로 합니다. 예제에 쓴 상품·벡터·점수는 설명을 위해 만든 값입니다.

## 1. 먼저 알아 둘 용어는 무엇일까요

컬렉션·레코드·메타데이터는 [4편의 용어 표](/writing/vector-database-schema-design/)에서, 청크와 부모-자식 검색은 [5편](/writing/vector-database-vector-design/)에서, 메타데이터 필터는 [6편](/writing/vector-database-metadata-design/)에서 정리했습니다. 이 글에서 새로 자주 나오는 용어는 다음과 같습니다.

| 용어 | 쉬운 설명 |
| --- | --- |
| 관계 | 레코드와 레코드 사이의 연결입니다. “이 상품은 저 브랜드의 상품이다”, “이 청크는 저 문서의 일부다” 같은 것입니다. |
| 조인(join) | 관계형 데이터베이스(RDB)에서 두 테이블의 행을 연결 열(외래 키)로 이어 붙여 한 번에 조회하는 연산입니다. |
| 비정규화(denormalization) | 다른 레코드에 있는 값을 조회할 때마다 찾아오지 않고, 필요한 레코드마다 복사해 두는 설계입니다. 읽기는 빨라지지만 원본이 바뀌면 사본을 모두 고쳐야 합니다. |
| 교차 참조(cross-reference) | Weaviate에서 한 객체가 다른 객체를 가리키도록 만드는 속성입니다. 대상 객체의 ID를 값으로 저장합니다. |
| 고아 참조 | 가리키던 대상이 지워졌는데 남아 있는 참조입니다. |
| 그룹핑(grouping) | 검색 결과를 `doc_id` 같은 필드 값으로 묶어서 그룹마다 몇 개씩만 돌려주는 기능입니다. |
| 센트로이드(centroid) | 여러 벡터의 중심점입니다. 이 글에서는 같은 위치의 성분끼리 더해 개수로 나눈 평균 벡터를 말합니다. |
| 코사인 거리 | 1에서 코사인 유사도를 뺀 값입니다. 두 벡터의 방향이 같으면 0이고 직각이면 1입니다. 작을수록 가깝습니다. |

코사인 유사도는 두 벡터의 내적을 두 벡터 길이의 곱으로 나눈 값입니다. (1, 0, 0)과 (0.8, 0.6, 0)이라면 내적이 1×0.8 + 0×0.6 + 0×0 = 0.8이고, 두 벡터의 길이가 모두 1이므로 코사인 유사도는 0.8, 코사인 거리는 0.2입니다.

## 2. 벡터 DB에서 관계는 어떻게 표현할까요

### RDB에서는 외래 키와 조인을 씁니다

관계형 데이터베이스라면 상품 테이블에 `brand_id` 열을 두고 브랜드 테이블과 조인합니다. 브랜드 이름은 브랜드 테이블에 한 번만 저장하고 상품을 조회할 때 조인으로 이어 붙입니다. 브랜드 이름이 바뀌면 브랜드 테이블의 한 행만 고치면 됩니다.

벡터 DB는 사정이 다릅니다. PostgreSQL의 확장인 pgvector는 벡터를 다른 데이터와 같은 테이블에 두므로 SQL 조인을 그대로 쓸 수 있습니다.[^pgvector] 반면 Pinecone과 Chroma 문서에서는 레코드끼리 조인하는 기능을 찾을 수 없습니다. Pinecone 문서가 권하는 연결 방법은 `document_id#chunk_number` 같은 구조화된 ID와 `document_id` 같은 메타데이터 필드입니다.[^pinecone-data-modeling] Qdrant는 그룹 검색 결과에 다른 컬렉션의 포인트를 ID로 붙이는 lookup 기능이 있고, 문서는 이것을 벡터 검색이 아닌 “포인트 ID로 하는 단순 조인”이라고 설명합니다.[^qdrant-search] Elasticsearch에는 같은 인덱스 안에서 부모-자식 관계를 만드는 `join` 필드가 있지만, 문서는 이것을 RDB의 조인처럼 쓰지 말라고 경고합니다.[^es-join]

### 관계를 담는 세 가지 방법

그래서 벡터 DB에서는 관계를 세 가지 방법으로 표현합니다. 상품과 브랜드로 비교해 보겠습니다.

**① ID만 저장하고 두 번 조회하기.** 상품 레코드의 메타데이터에 `brand_id`만 넣습니다. 벡터 검색으로 상품을 찾은 뒤, 결과에 나온 `brand_id`로 브랜드 정보를 한 번 더 조회합니다. 브랜드 정보는 같은 벡터 DB의 다른 컬렉션에 둘 수도 있고 RDB에 둘 수도 있습니다. Milvus의 추천 시스템 튜토리얼도 영화 벡터는 Milvus에 두고 검색 결과의 ID로 영화 정보를 Redis나 MySQL에서 조회하는 구성을 씁니다.[^milvus-recsys]

**② 복사하기(비정규화).** 상품 레코드에 `brand_name`, `brand_country`처럼 필요한 브랜드 필드를 복사해 둡니다. 조회는 한 번으로 끝나고 브랜드 이름으로 바로 필터를 걸 수 있습니다. 대신 브랜드 정보가 바뀌면 그 브랜드의 상품 레코드를 모두 고쳐야 합니다.

**③ DB의 참조 기능 쓰기.** Weaviate의 교차 참조처럼 관계를 DB에 저장해 두면 조회할 때 참조를 따라갈 수 있습니다. 상품에서 브랜드를 가리키는 참조 속성을 두면 상품을 조회하면서 브랜드 이름을 함께 받거나 브랜드 이름으로 상품을 거를 수 있습니다.

{% include diagram.html src="vrel-three-ways.svg" caption="관계를 담는 세 방법은 조회 횟수와 고칠 곳이 다릅니다" %}

세 방법으로 같은 상품 하나를 저장하면 다음과 같습니다. 특정 제품의 API 형식이 아니라 구성을 보이기 위한 예시입니다.

```js
// ① ID만 저장
{ "id": "p-101", "vector": [1.0, 0.0, 0.0],
  "metadata": { "product_name": "러닝화", "brand_id": "b-7" } }

// ② 복사
{ "id": "p-101", "vector": [1.0, 0.0, 0.0],
  "metadata": { "product_name": "러닝화", "brand_id": "b-7",
                "brand_name": "런웨이", "brand_country": "KR" } }

// ③ 참조 (브랜드 객체는 따로 있고, 상품은 그 객체의 ID를 가리킴)
{ "id": "p-101", "vector": [1.0, 0.0, 0.0],
  "properties": { "productName": "러닝화" },
  "references": { "hasBrand": ["b-7"] } }
```

| 방법 | 조회 | 관련 정보가 바뀔 때 | 관련 정보로 필터 |
| --- | --- | --- | --- |
| ① ID 저장(모든 제품) | 두 번(검색 + ID 조회) | 원본 한 곳만 고침 | 바로는 안 됨. 먼저 ID 목록을 구해 필터로 넣음 |
| ② 복사(모든 제품) | 한 번 | 사본을 모두 고침 | 복사한 필드로 바로 |
| ③ 참조 기능(Weaviate 교차 참조, pgvector 조인 등) | 한 번(DB가 따라감) | 원본 한 곳만 고침 | 참조를 따라가는 필터 |

①에서 “브랜드 이름이 런웨이인 상품만”을 찾으려면 브랜드 컬렉션에서 런웨이의 ID를 먼저 구하고, 그 ID를 `brand_id` 필터로 넣어 벡터 검색을 합니다. 조회 횟수는 늘지만 어느 제품에서나 쓸 수 있습니다.

## 3. 복사할까요, 참조할까요

### 문서들은 먼저 복사를 검토하라고 권합니다

참조 기능이 있는 제품도 참조를 아껴 쓰라고 안내합니다. Weaviate 문서는 교차 참조가 들어간 쿼리는 그렇지 않은 쿼리보다 느릴 수 있고, 객체가 많거나 쿼리가 복잡할수록 더 그렇다고 경고합니다. 그래서 스키마에서 교차 참조를 피할 수 있는지부터 따져 보라고 권하고, 예로 `Author`와 `Book`을 참조로 잇는 대신 저자 정보를 `Book` 객체에 직접 넣고 필터로 찾는 방법을 듭니다.[^weaviate-data] Weaviate 기여자 가이드는 참조를 처리하는 방식을 이렇게 설명합니다. 참조 대상은 다른 샤드(데이터를 나눠 저장하는 단위)나 다른 인덱스에 있을 수 있고, 여러 노드(서버)로 운영하면 다른 노드에 있을 수도 있습니다. 그래서 참조는 샤드 단위가 아니라 데이터베이스 전체 수준에서 따로 찾아와야 합니다.[^weaviate-parse-xref]

Elasticsearch 문서도 `join` 필드에 대해 같은 방향으로 말합니다. Elasticsearch에서 성능의 핵심은 데이터를 문서 단위로 비정규화하는 것이고, `join` 필드와 `has_child`·`has_parent` 쿼리는 쿼리 성능에 상당한 부담을 준다고 적습니다. 관계형 모델을 흉내 내려고 관계를 여러 단계로 두는 것도 권하지 않습니다.[^es-join]

### 복사가 손해인 경우도 있습니다

복사에는 두 가지 비용이 있습니다. 저장 공간이 늘고, 원본이 바뀔 때 사본을 모두 고쳐야 합니다. Qdrant 문서는 청크마다 문서 수준의 필드를 복사할 때의 크기를 계산해 보입니다.[^qdrant-search]

```text
문서 수                              20,000개
문서당 청크 수                       약 24개
청크마다 복사하는 문서 수준 데이터   약 3 KB

청크마다 복사할 때    20,000 × 24 × 3 KB ≈ 1,440,000 KB ≈ 1.4 GB
문서마다 한 번 둘 때  20,000 × 3 KB      =    60,000 KB ≈ 60 MB
```

같은 정보가 24배로 늘어납니다. 문서 제목이나 요약이 바뀌면 청크 24개를 모두 다시 써야 합니다. Qdrant 문서는 공유하는 필드가 크거나 자주 바뀔 때 문서 정보를 별도 컬렉션으로 나누는 편이 낫다고 설명합니다.[^qdrant-search]

권한처럼 바뀌면 바로 반영돼야 하는 값을 복사했다면, 원본이 바뀔 때 사본도 함께 고쳐야 합니다. Pinecone의 pgvector 이전 가이드는 권한 속성을 메타데이터로 복사해 두는 방법을 안내하면서, 그렇게 했다면 벡터 테이블의 변경뿐 아니라 권한 변경도 동기화해야 한다고 적습니다.[^pinecone-pgvector] 권한 복사본이 늦게 갱신되면 이미 권한을 잃은 사람이 문서를 계속 보게 됩니다. 권한 필터는 [6편의 6절](/writing/vector-database-metadata-design/)에서 다뤘습니다.

### 고르는 기준

MongoDB 데이터 모델링 문서는 관련 데이터를 한 문서에 넣을지(embedding), 따로 두고 참조할지(referencing)를 고르는 기준을 정리해 둡니다.[^mongo-modeling] 벡터 DB의 복사와 참조에 맞춰 다음 표로 옮겨 쓸 수 있습니다.

| 이런 경우 | 복사 쪽 | 참조(또는 ID 저장) 쪽 |
| --- | --- | --- |
| 함께 조회하는가 | 늘 같이 읽는다 | 따로 읽는 경우가 많다 |
| 얼마나 자주 바뀌는가 | 거의 안 바뀌거나 함께 바뀐다 | 자주, 따로 바뀐다 |
| 개수가 얼마나 되는가 | 레코드당 몇 개로 정해져 있다 | 한쪽이 끝없이 늘어난다 |
| 혼자 존재할 수 있는가 | 부모 없이는 의미가 없다 | 부모 없이도 따로 쓰인다 |

MongoDB 문서는 중복 데이터를 얼마나 늦게 갱신해도 되는지로도 나눕니다. 계정 생성일처럼 바뀌지 않는 값은 복사하기 좋습니다. 재고 수량처럼 늦게 반영되면 안 되는 값은 사본을 트랜잭션(여러 변경을 한 묶음으로 처리하는 단위)으로 함께 고쳐야 합니다. 추천 상품 목록처럼 조금 늦어도 되는 값은 백그라운드 작업으로 주기적으로 맞추면 됩니다.[^mongo-modeling]

상품과 브랜드에 적용해 보겠습니다. 브랜드 이름은 상품 검색 결과에 늘 함께 보여 주고, 거의 바뀌지 않고, 상품마다 브랜드가 하나입니다. 복사하기 좋은 조건입니다. 반대로 브랜드 소개문이나 로고처럼 크고 상품 상세 화면에서만 쓰는 정보는 브랜드 컬렉션에 한 번 두고 ID로 조회하는 편이 낫습니다. 한 레코드 안에서도 필드마다 다르게 정할 수 있습니다.

### 복사한 필드는 벡터에 섞지 않습니다

복사한 브랜드 이름은 필터와 화면 표시에 쓰는 메타데이터입니다. 상품 설명을 임베딩할 때 브랜드 필드가 함께 들어가지 않도록 합니다. [6편 7절](/writing/vector-database-metadata-design/)에서 메타데이터가 임베딩 입력에 섞이지 않게 하는 방법을 다뤘습니다.

참조는 원래 벡터에 영향을 주지 않습니다. Weaviate 문서는 교차 참조가 출발 객체와 대상 객체 어느 쪽의 벡터도 바꾸지 않는다고 설명합니다. 관련 객체의 내용을 벡터 검색에 반영하고 싶다면 그 내용을 벡터화되는 속성에 넣어야 합니다.[^weaviate-xref][^weaviate-starter] 예외는 6절에서 다룰 ref2vec-centroid처럼 참조 대상의 벡터로 자기 벡터를 계산하도록 설정한 경우입니다.

## 4. 같은 문서의 청크가 결과를 차지하면 어떻게 할까요

### 문서 단위로 묶어야 하는 이유

청크와 원문 문서는 벡터 검색에서 자주 만나는 관계입니다. 청크마다 `doc_id`를 붙여 두었다고 하고, 사내 문서 검색에서 “연차휴가 이월”을 물었을 때 상위 결과가 다음과 같다고 가정해 봅시다.

```text
순위  청크              doc_id        코사인 유사도
1     hr-rules#0012     hr-rules      0.91
2     hr-rules#0013     hr-rules      0.89
3     hr-rules#0040     hr-rules      0.87
4     hr-faq#0003       hr-faq        0.85
5     hr-rules#0041     hr-rules      0.84
6     leave-guide#0002  leave-guide   0.82
```

상위 5개를 그대로 쓰면 취업규칙 청크가 4개이고 다른 문서는 FAQ 하나뿐입니다. 연차 사용 안내서(`leave-guide`)는 6위라서 빠집니다. 화면에 “관련 문서 3개”를 보여 주려 해도, 상위 3개 청크는 모두 `hr-rules`라 문서가 하나뿐이고, 상위 5개로 넓혀도 둘뿐이라 세 개를 채울 수 없습니다.

`doc_id`로 묶고 문서마다 가장 점수가 높은 청크 하나만 남기면 결과가 이렇게 바뀝니다.

```text
그룹(doc_id)   대표 청크          코사인 유사도
hr-rules       hr-rules#0012      0.91
hr-faq         hr-faq#0003        0.85
leave-guide    leave-guide#0002   0.82
```

{% include diagram.html src="vrel-grouping.svg" caption="청크를 doc_id로 묶으면 문서마다 대표 청크 하나가 남습니다" %}

문서 세 개가 한 번씩 나옵니다. 앱에서 상위 결과를 넉넉히 받아 직접 묶을 수도 있지만 몇 개를 받아야 문서 세 개가 모일지 미리 알 수 없습니다. 위 예에서도 상위 5개로는 부족하고 6개를 받아야 했습니다. 그래서 여러 제품이 검색 단계에서 묶어 주는 기능을 둡니다.

### 제품마다 묶는 방법이 다릅니다

**Qdrant**는 Grouping API를 둡니다. 큰 문서를 청크로 나눠 저장했을 때 문서 단위로 검색하거나 추천하려면 문서 ID로 묶으라고 안내합니다.[^qdrant-search] `group_by`에 묶을 필드를, `limit`에 그룹 수를, `group_size`에 그룹당 포인트 수를 줍니다. 그룹은 그룹 안 최고 점수 포인트의 점수 순으로 정렬됩니다. 제약도 있습니다.

- `group_size`는 최선을 다해 채우는 값이라 포인트가 모자라거나 질의와 너무 멀면 덜 채워질 수 있습니다.
- `group_by`에는 keyword와 integer 값만 쓸 수 있습니다.
- 그룹 검색에서는 `offset`을 쓸 수 없어 페이지 넘김이 안 됩니다.
- Qdrant 문서는 성능을 위해 `group_by` 필드에 payload 인덱스를 만들라고 권합니다.[^qdrant-search]

```http
POST /collections/chunks/points/query/groups
{
  "query": [0.021, -0.113, 0.087],
  "group_by": "doc_id",
  "limit": 3,
  "group_size": 1,
  "with_lookup": { "collection": "documents", "with_payload": true }
}
```

`with_lookup`은 각 그룹에 `documents` 컬렉션에서 그룹 ID와 같은 ID의 포인트를 붙여 줍니다. 2절에서 본 “포인트 ID로 하는 단순 조인”이 이것입니다. 문서 제목·요약 같은 문서 수준 정보를 청크마다 복사하지 않고 `documents` 컬렉션에 한 번만 두는 구성입니다. 조건이 있습니다. `documents` 컬렉션에 그룹 값과 같은 ID의 포인트가 미리 있어야 하고 ID 타입도 맞아야 합니다. 문자열 `doc_id`로 묶었는데 `documents`의 ID가 정수라면 오류 없이 빈 `lookup`이 돌아옵니다.[^qdrant-search] 위 요청은 구성을 보이기 위한 예이고 `doc_id`를 Qdrant 포인트 ID로 쓰려면 정수나 UUID여야 합니다.

**Milvus**는 Grouping Search를 둡니다. 검색 요청에 `group_by_field`를 주면 ANN 검색 결과를 그 필드로 묶고, `limit`만큼의 그룹에서 결과를 돌려줍니다. 여기서 `limit`은 엔티티 수가 아니라 그룹 수입니다. `group_size`를 주지 않으면 그룹마다 가장 비슷한 엔티티 하나를 돌려줍니다. `strict_group_size`를 `True`로 두면 데이터가 모자라지 않는 한 그룹마다 `group_size`개를 정확히 채우려 하지만, 분포가 고르지 않으면 느려질 수 있습니다. 기본값 `False`는 그룹 수를 채우는 쪽을 우선합니다.[^milvus-grouping]

**Elasticsearch와 OpenSearch**는 한 문서 안에 청크 벡터들을 `nested` 필드로 넣는 방법을 씁니다. Elasticsearch의 nested kNN 검색은 결과를 항상 최상위 문서 기준으로 다양화해서 `k`개의 문서를 돌려주고, 각 문서의 점수는 가장 가까운 청크(Elasticsearch 문서의 용어로는 passage) 벡터로 정합니다. `inner_hits`를 주면 문서마다 가장 가까운 청크가 응답에 함께 들어옵니다.[^es-nested-knn] OpenSearch도 nested 필드가 있는 문서는 질의 벡터와 가장 가까운 벡터 하나만 보고 결과에 넣을지 정합니다. 문서 A에 청크 A1·A2, 문서 B에 청크 B1이 있고 가까운 순서가 A1, A2, B1이면 `k`가 2일 때 A와 B가 돌아옵니다.[^opensearch-nested] 이 방식은 문서 수준 메타데이터를 청크마다 복사하지 않아도 된다는 장점이 있습니다.[^es-nested-knn]

**MongoDB Atlas Vector Search**는 문서 안 배열에 든 임베딩을 인덱스의 `nestedRoot`로 지정합니다.[^mongo-vector-type] 질의할 때 `nestedOptions.scoreMode`로 자식 청크(배열 원소)의 점수를 부모 문서 점수로 합치는 방법을 고르는데, 기본값 `max`는 가장 관련 있는 원소 하나로, `avg`는 매칭된 원소 점수의 평균으로 순위를 매깁니다.[^mongo-vector-search]

**Weaviate**는 `near_vector`·`near_text` 같은 유사도 검색에 `GroupBy`를 붙여 속성이나 교차 참조 하나로 결과를 묶습니다. 그룹 수는 `number_of_groups`로, 그룹당 객체 수는 `objects_per_group`으로 정합니다.[^weaviate-similarity] 묶는 경로는 속성이나 참조 하나로 제한되고 중첩 경로는 쓸 수 없습니다.[^weaviate-graphql-get]

**Chroma**는 Search API의 `GroupBy`로 메타데이터 키 기준 그룹마다 상위 k개를 고릅니다. 다만 `limit`은 그룹 수가 아니라 묶은 뒤 펼친 전체 결과 수에 걸리고, Search API는 Chroma Cloud에서만 제공됩니다.[^chroma-groupby] **Pinecone** 문서에서는 검색 결과를 묶어 주는 기능을 찾을 수 없습니다. 문서가 안내하는 것은 `document_id` 필터로 한 문서 안에서만 검색하거나, ID 접두어로 한 문서의 청크를 모두 가져오는 방법입니다.[^pinecone-chunks]

| 제품 | 묶는 방법 | `limit`이 세는 것 | 메모 |
| --- | --- | --- | --- |
| Qdrant | Grouping API `group_by` | 그룹 수 | keyword·integer만, `offset` 불가, `with_lookup`으로 문서 정보 붙이기 |
| Milvus | `group_by_field` | 그룹 수 | `group_size` 기본 1, `strict_group_size` |
| Elasticsearch | nested `dense_vector` + kNN | 최상위 문서 수(`k`) | 가장 가까운 청크로 점수, `inner_hits` |
| OpenSearch | nested `knn_vector` | 최상위 문서 수(`k`) | 가장 가까운 벡터로 판정 |
| MongoDB Atlas | `nestedRoot` + `nestedOptions` | 문서 수 | `scoreMode` `max`(기본)·`avg` |
| Weaviate | `GroupBy` | `limit` 대신 `number_of_groups`가 그룹 수 | 그룹당 개수는 `objects_per_group`, 속성이나 참조 하나 |
| Chroma | Search API `GroupBy` | 펼친 전체 결과 수 | Chroma Cloud 전용 |
| Pinecone | 문서에서 찾을 수 없음 | — | `document_id` 필터, ID 접두어 |

문서 단위로 묶은 뒤 LLM에 무엇을 넘길지는 별개의 문제입니다. 대표 청크만 넘길 수도 있고, [5편의 부모-자식 검색](/writing/vector-database-vector-design/)처럼 그 청크가 속한 더 큰 부모 청크를 찾아 넘길 수도 있습니다.

## 5. Weaviate의 교차 참조는 어떻게 쓸까요

Weaviate는 객체 사이의 참조를 DB 기능인 교차 참조로 제공합니다. 이 절과 다음 절의 예제는 상품(`Product`), 브랜드(`Brand`), 고객(`Customer`) 세 컬렉션을 씁니다.

### 참조 속성 정의하기

교차 참조는 한 객체에서 다른 객체로 가는 링크입니다.[^weaviate-datatypes] Python v4 클라이언트에서는 일반 속성과 따로 `references` 인자에 `ReferenceProperty`로 정의합니다.[^weaviate-xref] 대상 컬렉션이 없으면 참조 속성을 정의할 수 없으므로(없는 컬렉션을 가리키면 422 오류가 납니다) `Brand`부터 만듭니다. 예제는 로컬에서 Weaviate가 실행 중이고 Python v4 클라이언트가 설치돼 있다고 가정합니다.

```python
import weaviate
from weaviate.classes.config import Configure, Property, DataType, ReferenceProperty

client = weaviate.connect_to_local()

client.collections.create(
    name="Brand",
    properties=[Property(name="brandName", data_type=DataType.TEXT)],
)
client.collections.create(
    name="Product",
    properties=[
        Property(name="productName", data_type=DataType.TEXT),
        Property(name="price", data_type=DataType.INT),
    ],
    references=[ReferenceProperty(name="hasBrand", target_collection="Brand")],
    vectorizer_config=Configure.Vectorizer.none(),  # 상품 벡터는 직접 넣는다
)
```

`Product`의 `hasBrand`가 `Brand`를 가리키는 참조 속성입니다. 이 예제는 손으로 계산할 수 있도록 상품 벡터를 3차원 값으로 직접 넣습니다. 실제 서비스라면 상품 설명을 임베딩 모델로 벡터화하는 vectorizer를 설정하거나, 앱에서 만든 벡터를 넣습니다. `vectorizer_config` 인자를 쓴 이유는 6절에서 설명합니다.

컬렉션 이름은 대문자로, 속성 이름은 소문자로 시작합니다. REST로 보내는 JSON 스키마에서는 참조 속성의 `dataType`에 대상 컬렉션 이름을 넣는데, 첫 글자가 대문자인지로 기본 타입과 구별합니다. `["text"]`는 텍스트 타입이고 `["Text"]`는 `Text`라는 컬렉션을 가리키는 참조입니다.[^weaviate-collections] 컬렉션 이름은 만든 뒤에 바꿀 수 없습니다. `Customerr`처럼 오타가 난 채로 만들었다면 새 컬렉션을 만들어 데이터를 옮기거나, 컬렉션 별칭(alias)을 둬서 기존 컬렉션을 다른 이름으로 불러야 합니다.[^weaviate-collections]

### 참조 넣기와 조회하기

객체를 넣을 때 `references`로 참조를 함께 줄 수 있고 나중에 `reference_add`로 추가할 수도 있습니다. 참조 값은 대상 객체의 UUID입니다.[^weaviate-xref]

```python
brands = client.collections.use("Brand")
products = client.collections.use("Product")

runway = brands.data.insert({"brandName": "런웨이"})
hiking = brands.data.insert({"brandName": "하이킹랩"})

items = {
    "러닝화":        ([1.0, 0.0, 0.0], runway),
    "러닝 양말":     ([0.8, 0.6, 0.0], runway),
    "트레일 러닝화": ([0.6, 0.0, 0.8], runway),
    "등산 배낭":     ([0.0, 0.6, 0.8], hiking),
    "요가 매트":     ([0.0, 1.0, 0.0], hiking),
}
ids = {}
for name, (vector, brand) in items.items():
    ids[name] = products.data.insert(
        properties={"productName": name, "price": 50000},
        vector=vector,
        references={"hasBrand": brand},
    )
```

쿼리는 참조된 데이터를 요청하지 않으면 돌려주지 않습니다. `return_references`로 따라갈 참조와 받을 속성을 지정합니다. 참조 대상의 속성으로 거르려면 `Filter.by_ref`를 씁니다.[^weaviate-xref][^weaviate-filters]

```python
from weaviate.classes.query import Filter, QueryReference

resp = products.query.fetch_objects(
    filters=Filter.by_ref(link_on="hasBrand").by_property("brandName").equal("하이킹랩"),
    return_references=QueryReference(link_on="hasBrand", return_properties=["brandName"]),
)
for o in resp.objects:
    print(o.properties["productName"], o.references["hasBrand"].objects[0].properties["brandName"])
# 등산 배낭 하이킹랩
# 요가 매트 하이킹랩
```

참조 개수로 거르는 `Filter.by_ref_count`도 있습니다. 6절에서 만드는 `Customer` 컬렉션이라면 “좋아한 상품이 3개 넘는 고객”을 찾을 때 씁니다.[^weaviate-graphql-filters]

### 알아 둘 성질

**참조는 한쪽 방향입니다.** `Product`에서 `Brand`로 가는 참조를 만들어도 `Brand`에서 그 브랜드의 상품들로 가는 참조는 생기지 않습니다. 양쪽으로 따라가려면 `Brand`에도 `Product`를 가리키는 참조 속성을 따로 두고, 상품과 브랜드 한 쌍마다 참조를 두 번 넣어야 합니다.[^weaviate-xref] 같은 관계가 두 곳에 적히는 셈이라 한쪽만 고치면 서로 어긋납니다.

**참조 속성 하나가 여러 컬렉션을 가리킬 수 있습니다.** Python 클라이언트는 이를 위해 `ReferenceProperty.MultiTarget`을 제공합니다.[^weaviate-python]

**대상을 지워도 참조는 남습니다.** 문서는 객체를 지우면 그 객체를 가리키던 교차 참조는 그대로 남는다고 설명합니다. 참조를 따라가는 조회는 남아 있는 대상만 돌려주지만 ID로 객체를 가져오면 대상이 있든 없든 모든 참조가 보입니다.[^weaviate-xref] 대상을 지울 때는 그 대상을 가리키는 참조를 먼저 지우는 편이 안전합니다. 6절에서 보듯 고아 참조가 남으면 참조 갱신이 실패하는 경우도 있습니다.

**멀티테넌시 컬렉션 사이에는 제약이 있습니다.** 멀티테넌시 객체에서 비멀티테넌시 객체로, 또는 같은 테넌트의 멀티테넌시 객체로는 참조할 수 있습니다. 비멀티테넌시 객체에서 멀티테넌시 객체로, 또는 다른 테넌트의 객체로는 참조할 수 없습니다.[^weaviate-data] 테넌트는 [4편](/writing/vector-database-schema-design/)에서 다뤘습니다.

## 6. 참조로 벡터를 만들 수 있을까요: ref2vec-centroid

### 참조한 객체 벡터의 평균

3절에서 본 대로 교차 참조는 벡터를 바꾸지 않습니다. Weaviate의 ref2vec-centroid 모듈은 예외입니다. 객체의 내용으로 임베딩을 만드는 대신, 그 객체가 참조하는 객체들의 벡터로 자기 벡터를 계산합니다. 계산 방법은 현재 평균(`mean`) 하나뿐입니다.[^weaviate-ref2vec] 문서는 사용자의 행동이나 선호를 모아 추천을 만드는 용도에 쓸 수 있다고 소개합니다.[^weaviate-ref2vec]

고객 민지가 러닝화와 러닝 양말에 “좋아요”를 눌렀다고 해 봅시다. 고객 객체가 두 상품을 참조하면 고객 벡터는 두 상품 벡터의 평균이 됩니다.

```text
러닝화       (1.0, 0.0, 0.0)
러닝 양말    (0.8, 0.6, 0.0)
-------------------------------
합           (1.8, 0.6, 0.0)
평균(÷2)     (0.9, 0.3, 0.0)   ← 민지의 고객 벡터
```

이 벡터를 질의로 상품을 검색하면 민지가 좋아한 상품과 방향이 비슷한 상품이 앞에 나옵니다. 코사인 거리를 직접 계산해 보겠습니다. 민지 벡터의 길이는 √(0.9² + 0.3²) = √0.9 ≈ 0.9487이고 상품 벡터의 길이는 모두 1입니다.

```text
상품            내적                        코사인 유사도        코사인 거리
러닝화          0.9×1.0              = 0.90  0.90 / 0.9487 = 0.9487   0.0513
러닝 양말       0.9×0.8 + 0.3×0.6    = 0.90  0.90 / 0.9487 = 0.9487   0.0513
트레일 러닝화   0.9×0.6              = 0.54  0.54 / 0.9487 = 0.5692   0.4308
요가 매트       0.3×1.0              = 0.30  0.30 / 0.9487 = 0.3162   0.6838
등산 배낭       0.3×0.6              = 0.18  0.18 / 0.9487 = 0.1897   0.8103
```

Weaviate에서 같은 데이터로 검색해도 같은 거리가 나옵니다. 그런데 1위와 2위는 민지가 이미 좋아한 상품입니다. 이 예에서는 고객 벡터가 두 상품 벡터의 평균이라 두 상품과 방향이 가장 가깝습니다. 추천에서는 7절처럼 이미 좋아한 상품을 필터로 빼야 합니다.

### 설정하기

ref2vec-centroid는 Weaviate Cloud에서는 기본으로 켜져 있고 직접 운영할 때는 환경 변수 `ENABLE_MODULES`에 `ref2vec-centroid`를 넣어 켭니다.[^weaviate-ref2vec] 고객 컬렉션의 vectorizer를 ref2vec-centroid로 두고 평균에 쓸 참조 속성을 `reference_properties`로 지정합니다. 다음 코드는 5절의 import와 `client`를 이어서 씁니다.

```python
client.collections.create(
    name="Customer",
    properties=[Property(name="customerId", data_type=DataType.TEXT)],
    references=[ReferenceProperty(name="likedItem", target_collection="Product")],
    vectorizer_config=Configure.Vectorizer.ref2vec_centroid(
        reference_properties=["likedItem"],
        method="mean",
    ),
)

customers = client.collections.use("Customer")
minji_uuid = customers.data.insert({"customerId": "c-001"})
customers.data.reference_add(from_uuid=minji_uuid, from_property="likedItem", to=ids["러닝화"])
customers.data.reference_add(from_uuid=minji_uuid, from_property="likedItem", to=ids["러닝 양말"])
```

민지 고객 객체를 만들고 5절에서 넣은 러닝화와 러닝 양말을 참조합니다. 두 번째 `reference_add`가 끝나면 민지의 고객 벡터는 위에서 계산한 (0.9, 0.3, 0.0)이 됩니다.

REST JSON 스키마로 쓰면 컬렉션 수준의 `vectorizer`와 `moduleConfig`가 됩니다.

```json
{
  "class": "Customer",
  "vectorizer": "ref2vec-centroid",
  "moduleConfig": {
    "ref2vec-centroid": { "referenceProperties": ["likedItem"], "method": "mean" }
  },
  "properties": [
    { "name": "customerId", "dataType": ["text"] },
    { "name": "likedItem", "dataType": ["Product"] }
  ]
}
```

Python 클라이언트 4.16.0부터는 `vectorizer_config` 대신 `vector_config`를, `Configure.NamedVectors` 대신 `Configure.Vectors`를 쓰라고 안내합니다.[^weaviate-python] 그래서 앞의 Python 예제를 실행하면 클라이언트가 `vectorizer_config`가 deprecated라는 경고(Dep024)를 냅니다.

그런데 Weaviate 1.40.3에서 `vector_config=Configure.Vectors.ref2vec_centroid(...)`처럼 이름 있는 벡터(named vector)로 설정하면 참조를 넣어도 고객 벡터가 만들어지지 않았습니다. 상품을 named vector로 둔 경우와 컬렉션 수준의 단일 벡터로 둔 경우 모두 그랬고, 상품이 named vector일 때는 참조를 객체 생성 때 넣어도 마찬가지였습니다. 반대로 고객을 컬렉션 수준 ref2vec-centroid로 두더라도 상품이 named vector이면 고객 벡터가 생기지 않았습니다. 시험한 네 조합 가운데 고객 벡터가 만들어진 것은 상품과 고객이 모두 컬렉션 수준의 단일 벡터 설정(`Configure.Vectorizer.none()`, `Configure.Vectorizer.ref2vec_centroid(...)`)일 때뿐이었습니다.

ref2vec-centroid 문서의 예제도 컬렉션 수준의 `vectorizer`·`moduleConfig` 설정만 보여 줍니다.[^weaviate-ref2vec] 이 글은 상품과 고객 모두 컬렉션 수준 설정을 씁니다. 버전을 올릴 때는 이 동작을 다시 확인해야 합니다.

vectorizer는 컬렉션을 만든 뒤에 바꿀 수 없습니다.[^weaviate-collections] 처음에 고객 컬렉션을 일반 텍스트 vectorizer로 만들었다면 ref2vec-centroid로 바꾸기 위해 새 컬렉션을 만들어 옮겨야 합니다.

### 벡터는 언제 다시 계산될까요

문서는 참조가 이미 들어 있는 객체를 만들 때, 객체의 참조 목록을 바꿀 때(객체 `PUT`·`PATCH`, 참조 `POST`·`PUT`), 참조를 지울 때 벡터를 다시 계산한다고 설명합니다.[^weaviate-ref2vec] 같은 데이터로 확인한 동작은 다음과 같습니다.

| 작업 | 고객 벡터 |
| --- | --- |
| 참조 없이 고객 생성 | 없음 |
| `reference_add`로 러닝화 참조 | (1.0, 0.0, 0.0) |
| `reference_add`로 러닝 양말 참조 | (0.9, 0.3, 0.0) |
| 참조를 넣으며 생성: 등산 배낭·요가 매트 | (0.0, 0.8, 0.4) |
| 그중 `reference_delete`로 요가 매트 참조 삭제 | (0.0, 0.6, 0.8) |
| `reference_add_many`(배치 참조)로 참조 | 다시 계산되지 않음 |
| 참조한 상품의 벡터를 바꿈 | 그대로 |
| 그 뒤 고객 객체를 수정(`update`) | 바뀐 상품 벡터로 다시 계산 |

**배치로 넣은 참조는 계산에 반영되지 않습니다.** 문서는 배치 참조 기능이 벡터 인덱스 갱신 비용을 피하려고 만든 것이라 ref2vec-centroid가 이를 지원하지 않는다고 설명합니다.[^weaviate-ref2vec] 좋아요 기록을 한꺼번에 옮길 때 배치 참조를 쓰면 그 참조가 고객 벡터에 반영되지 않고, 참조가 없던 고객이라면 벡터가 비어 있게 됩니다. 이럴 때는 참조를 담은 고객 객체를 생성하거나 참조를 하나씩 추가합니다.

**참조된 객체가 바뀌어도 참조하는 객체의 벡터는 자동으로 바뀌지 않습니다.**[^weaviate-ref2vec] 상품 설명을 고쳐 상품 벡터가 바뀌어도, 그 상품을 좋아한 고객의 벡터는 옛 상품 벡터로 계산된 그대로입니다. 다시 계산하려면 고객 객체를 같은 내용으로 다시 쓰거나 참조를 지웠다 다시 넣어야 합니다.[^weaviate-ref2vec] 임베딩 모델을 바꿔 상품 벡터를 모두 다시 만들었다면 고객 벡터도 모두 다시 계산해야 합니다.

**참조가 하나도 없으면 벡터가 없습니다.** 문서도 참조가 없는 객체의 벡터는 `nil`이고, 벡터가 있는 객체를 참조하는 순간 평균 벡터가 정해진다고 설명합니다.[^weaviate-ref2vec] 가입하고 아직 좋아요를 누르지 않은 고객에게는 이 방식으로 추천할 수 없으므로, 인기 상품 같은 다른 방법을 준비해야 합니다.

**고아 참조가 남으면 갱신이 실패할 수 있습니다.** 민지가 좋아한 러닝 양말을 상품 컬렉션에서 지우면 민지의 참조 목록에는 러닝 양말의 ID가 남고, 고객 벡터도 (0.9, 0.3, 0.0) 그대로 남습니다. 이 상태에서 민지에게 새 참조를 추가하면 Weaviate 1.40.3은 참조 벡터를 계산하지 못했다는 500 오류(`calculate ref vector`)를 냈습니다. 그런데 객체를 다시 조회해 보면 새 참조는 저장되어 있었고 고객 벡터만 (0.9, 0.3, 0.0) 그대로였습니다. 요청은 실패로 끝났는데 참조 목록과 벡터가 서로 어긋난 상태가 된 것입니다.

고아 참조를 `reference_delete`로 지우면 벡터가 다시 계산되고 그 뒤의 추가도 정상으로 동작했습니다. 상품을 지울 때는 그 상품을 가리키는 참조부터 지우는 순서를 지킵니다.

### 흔한 실수: 상품까지 ref2vec-centroid로 두기

고객과 상품을 같은 설정으로 복사해 만들다 보면 상품 컬렉션의 vectorizer까지 ref2vec-centroid로 두는 실수가 생깁니다. ref2vec-centroid는 객체의 내용을 벡터로 만들지 않으므로 상품 이름과 설명은 벡터에 쓰이지 않습니다.[^weaviate-ref2vec] 상품이 다른 객체를 참조하지 않으면 상품 벡터가 없고, 벡터가 없는 상품만 참조한 고객도 벡터가 생기지 않습니다.

이 구성으로 만들어 보면 스키마 생성에서는 오류가 나지 않습니다. 상품의 `referenceProperties`에 상품에 없는 속성 이름을 넣어도 그대로 만들어졌습니다. 그런데 상품에 벡터를 직접 넣어도 저장되지 않았고 고객 벡터도 비어 있었습니다. 추천 검색에 쓸 벡터가 하나도 없는 상태로 끝납니다.

상품처럼 자기 내용이 있는 객체는 내용으로 벡터를 만들고, 고객처럼 행동으로 표현되는 객체만 ref2vec-centroid로 둡니다. ref2vec-centroid는 참조 대상의 벡터가 Weaviate vectorizer로 만든 것이든 사용자가 직접 넣은 것이든 똑같이 평균을 냅니다.[^weaviate-ref2vec]

## 7. 고객·상품·브랜드로 추천 스키마를 만들어 보면

### 컬렉션 구성

5·6절의 조각을 모으면 추천 스키마가 됩니다.

| 컬렉션 | 벡터 | 주요 속성 | 참조 |
| --- | --- | --- | --- |
| `Product` | 상품 설명으로 만든 벡터 | `productName`, `category`, `description`, `price` | `hasBrand` → `Brand` |
| `Brand` | 없음 | `brandName`, 브랜드 소개 | — |
| `Customer` | 좋아한 상품 벡터의 평균(ref2vec-centroid) | 고객 ID | `likedItem` → `Product` |

스키마를 확정하기 전에 정해 둘 것이 있습니다.

- **상품 벡터에는 상품 설명만 넣습니다.** 가격은 숫자 필터로 쓰고 임베딩 입력에 넣지 않습니다. 브랜드 이름을 검색 결과에 늘 보여 준다면 3절의 기준대로 `Product`에 복사해 두는 것도 방법입니다.
- **브랜드에는 벡터가 없어도 됩니다.** 브랜드는 필터와 표시에만 쓰입니다. Weaviate 1.40부터는 vectorizer와 벡터 인덱스 설정을 하나도 주지 않은 컬렉션이 벡터 없이 만들어집니다. 그 전에는 서버 기본값이 채워져 벡터가 하나 있는 컬렉션이 됐습니다.[^weaviate-collections]
- **고객 컬렉션에는 추천에 쓰는 것만 둡니다.** 이름·나이·성별 같은 개인정보는 이 추천 계산에 쓰이지 않습니다. 회원 정보는 회원 DB에 두고 고객 ID로 연결하는 편이 안전합니다.
- **평점과 시각은 별도 기록으로 둡니다.** Weaviate의 참조 값은 대상 객체를 가리키는 링크(beacon)이고, 문서에는 참조에 평점 같은 값을 함께 저장하는 방법이 나오지 않습니다.[^weaviate-data] “민지가 러닝화에 평점 5를 준 시각” 같은 관계 자체의 값을 남기려면 고객 ID·상품 ID·평점·시각을 담은 기록을 따로 둡니다. 이 기록은 RDB에 두어도 되고 벡터가 없는 별도 컬렉션으로 두어도 됩니다. ref2vec-centroid는 단순 평균이라 평점을 계산에 쓰지 않습니다. 평점을 반영하는 방법은 8절에서 다룹니다.

{% include diagram.html src="vrel-recommend-flow.svg" caption="좋아요 참조로 고객 벡터를 다시 계산하고 그 벡터로 추천합니다" %}

### 추천 질의

고객 벡터와 좋아한 상품 목록을 함께 가져온 뒤, 고객 벡터로 상품을 검색하면서 좋아한 상품은 ID 필터로 뺍니다. 다음 코드는 5절에서 만든 `client`·`products`와 6절에서 만든 `minji_uuid`를 그대로 씁니다.

```python
from weaviate.classes.query import Filter, MetadataQuery, QueryReference

customers = client.collections.use("Customer")
customer = customers.query.fetch_object_by_id(
    minji_uuid,
    include_vector=True,
    return_references=QueryReference(link_on="likedItem", return_properties=[]),
)
liked_ids = [o.uuid for o in customer.references["likedItem"].objects]

resp = products.query.near_vector(
    near_vector=customer.vector["default"],
    filters=Filter.by_id().contains_none(liked_ids),
    limit=3,
    return_metadata=MetadataQuery(distance=True),
)
for o in resp.objects:
    print(o.properties["productName"], round(o.metadata.distance, 4))
# 트레일 러닝화 0.4308
# 요가 매트 0.6838
# 등산 배낭 0.8103
```

컬렉션 수준의 단일 벡터는 `vector["default"]`로 읽습니다.[^weaviate-collections] 결과는 6절에서 손으로 계산한 표에서 러닝화와 러닝 양말을 뺀 순서와 같습니다. 좋아한 상품이 많아지면 `contains_none`에 넣는 ID 목록도 길어집니다. 목록이 길어지면 최근에 좋아한 상품만 빼거나, `limit`을 `limit + 제외할 ID 수`로 늘려 받은 뒤 앱에서 거르는 방법이 있습니다.

Weaviate 블로그의 2022년 예제는 사용자 객체의 ID를 상품 검색의 `nearObject`에 넘깁니다.[^weaviate-ref2vec-blog] 현재 문서에서 `nearObject`는 기준 객체와 가까운 객체를 같은 컬렉션 안에서 찾는 연산자입니다.[^weaviate-search-operators] 위 예제처럼 고객 벡터를 먼저 읽어 `near_vector`로 넘기면 이 차이를 신경 쓰지 않아도 됩니다.

좋아요를 취소하면 `reference_delete`로 참조를 지웁니다. 고객 벡터는 남은 참조로 다시 계산됩니다. 좋아요가 하나도 남지 않으면 고객 벡터도 없어지므로, 6절에서 말한 인기 상품 같은 대체 경로로 보냅니다.

## 8. 평균 벡터만으로 충분할까요

### 서로 다른 취향은 평균에서 섞입니다

평균은 계산이 단순하지만 성격이 다른 상품을 함께 좋아한 고객에게는 맞지 않을 수 있습니다. 준호가 러닝화와 요가 매트를 좋아했다고 해 봅시다.

```text
러닝화      (1.0, 0.0, 0.0)
요가 매트   (0.0, 1.0, 0.0)
평균        (0.5, 0.5, 0.0)   길이 √0.5 ≈ 0.7071

상품            코사인 유사도                       코사인 거리
러닝 양말       (0.4 + 0.3) / 0.7071   = 0.9899      0.0101
러닝화          0.5 / 0.7071           = 0.7071      0.2929
요가 매트       0.5 / 0.7071           = 0.7071      0.2929
트레일 러닝화   0.3 / 0.7071           = 0.4243      0.5757
등산 배낭       0.3 / 0.7071           = 0.4243      0.5757
```

평균 벡터는 두 상품의 한가운데를 가리킵니다. 그 근처에 있는 러닝 양말이 준호가 직접 좋아한 두 상품(거리 0.2929)보다 가깝게(거리 0.0101) 나옵니다. 러닝 쪽 취향과 요가 쪽 취향이 하나의 중간 지점으로 합쳐진 것입니다. 실제 임베딩은 차원이 수백에서 수천이라 이렇게 깔끔하지 않지만, 평균이 여러 방향을 하나로 줄인다는 성질은 같습니다.

예시마다 따로 점수를 매기는 방법도 있습니다. Qdrant 추천 API의 `best_score` 전략은 후보 상품마다 모든 예시(좋아한 상품은 positive 예시, 싫어한 상품은 negative 예시)와의 점수를 계산해, 가장 높은 positive 점수와 가장 높은 negative 점수를 고릅니다. positive 쪽이 높으면 positive 점수로 순위를 매깁니다.[^qdrant-explore] negative 예시가 없다면 러닝화에 가까운 상품은 러닝화와의 점수로, 요가 매트에 가까운 상품은 요가 매트와의 점수로 평가받습니다. 대신 계산량이 예시 수에 비례해 늘어납니다.[^qdrant-explore]

### 평점을 반영하려면 앱에서 계산합니다

ref2vec-centroid는 단순 평균만 지원합니다.[^weaviate-ref2vec] 평점 5를 준 상품과 2를 준 상품이 같은 무게로 들어갑니다. 평점을 가중치로 쓰려면 앱에서 가중 평균을 계산합니다. 고객 컬렉션은 벡터를 직접 넣는 설정(`Configure.Vectorizer.none()`)으로 두고, 계산한 값을 벡터로 넣습니다. 준호가 러닝화에 5점, 요가 매트에 2점을 줬다면 다음과 같습니다.

```text
가중 평균 = (5 × (1.0, 0.0, 0.0) + 2 × (0.0, 1.0, 0.0)) / (5 + 2)
          = (5.0, 2.0, 0.0) / 7
          ≈ (0.7143, 0.2857, 0.0)

상품            단순 평균의 코사인 거리   가중 평균의 코사인 거리
러닝 양말       0.0101                    0.0344
러닝화          0.2929                    0.0715
트레일 러닝화   0.5757                    0.4429
요가 매트       0.2929                    0.6286
등산 배낭       0.5757                    0.7772
```

단순 평균에서는 트레일 러닝화와 등산 배낭이 같은 거리였지만, 가중 평균에서는 높은 점수를 준 러닝 쪽에 가까운 트레일 러닝화가 앞섭니다. 이 방식에서는 고객 벡터를 언제 다시 계산할지도 앱이 정해야 합니다. 평점이 바뀔 때마다 계산할 수도 있고, 하루 한 번 배치로 계산할 수도 있습니다. 3절의 MongoDB 기준으로 보면 추천용 벡터는 조금 늦어도 되는 값에 가깝습니다. 이런 값은 백그라운드 작업으로 주기적으로 맞추면 됩니다.

### 다른 제품의 방법

**Qdrant**는 추천 API에 좋아한 상품을 positive로, 싫어한 상품을 negative로 넘길 수 있습니다. 예시는 포인트 ID로도 벡터로도 줄 수 있습니다. 기본 전략 `average_vector`는 positive 평균과 negative 평균을 따로 구한 뒤 `avg_positive + avg_positive - avg_negative`로 질의 벡터 하나를 만듭니다. negative가 없으면 positive 평균 그대로입니다.[^qdrant-explore] 민지가 러닝화와 러닝 양말을 좋아하고 요가 매트를 싫어한다고 하면 다음과 같습니다.

```text
avg_positive = (0.9, 0.3, 0.0)
avg_negative = (0.0, 1.0, 0.0)
질의 벡터    = 2 × (0.9, 0.3, 0.0) − (0.0, 1.0, 0.0) = (1.8, −0.4, 0.0)

상품            negative 없음(평균만)   negative 있음
트레일 러닝화   0.4308                  0.4143
요가 매트       0.6838                  1.2169
등산 배낭       0.8103                  1.1302
```

코사인 거리가 1보다 크면 코사인 유사도가 음수, 즉 두 벡터 사이의 각도가 90도보다 크다는 뜻입니다. 싫어한 요가 매트와 같은 방향 성분(두 번째 성분)이 있는 상품은 멀리 밀려납니다. 러닝화·러닝 양말·요가 매트의 포인트 ID가 101·102·105라고 하면 요청 형태는 다음과 같습니다. 좋아한 상품과 싫어한 상품은 결과에서 빼도록 `filter`를 함께 겁니다.

```http
POST /collections/products/points/query
{
  "query": {
    "recommend": {
      "positive": [101, 102],
      "negative": [105],
      "strategy": "average_vector"
    }
  },
  "filter": { "must_not": [ { "has_id": [101, 102, 105] } ] },
  "limit": 3
}
```

`sum_scores` 전략은 후보마다 positive 예시와의 점수를 모두 더하고 negative 예시와의 점수를 뺍니다.[^qdrant-explore] 고객 벡터와 상품 벡터가 다른 컬렉션에 있을 때는 `lookup_from`으로 다른 컬렉션의 벡터를 예시로 가져올 수 있습니다. 문서는 이 기능의 용도로 아이템-사용자 추천을 듭니다.[^qdrant-explore] `has_id`는 지정한 ID의 포인트만 고르는 조건이고 `must_not`에 넣으면 그 포인트를 뺍니다.[^qdrant-filtering]

**pgvector**는 `AVG(embedding)` 집계 함수가 있어 SQL 안에서 평균 벡터를 만들 수 있고, 다른 행의 벡터를 서브쿼리로 받아 이웃을 찾는 예도 README에 있습니다.[^pgvector] `AVG(embedding)` 집계와 서브쿼리를 합치면, 좋아요 테이블과 조인해 계산한 평균 벡터로 검색하는 쿼리를 다음처럼 쓸 수 있습니다.

```sql
SELECT id, name
FROM products
WHERE id NOT IN (SELECT product_id FROM likes WHERE customer_id = 42)
ORDER BY embedding <=> (
  SELECT AVG(p.embedding)
  FROM products p
  JOIN likes l ON l.product_id = p.id
  WHERE l.customer_id = 42
)
LIMIT 3;
```

`NOT IN` 조건은 근사 인덱스를 쓸 때 인덱스 스캔 **뒤에** 적용되므로, 좋아요가 많은 고객이면 결과가 3개보다 적게 나올 수 있습니다. [6편 4절](/writing/vector-database-metadata-design/)의 iterative index scan이 이 문제를 줄입니다.[^pgvector]

### 문서를 대표 벡터 하나로 만들 때

ref2vec-centroid 문서에는 논문(`Article`)이 문단(`Paragraph`)을 참조하게 하고 논문 벡터를 문단 벡터의 평균으로 만드는 구성도 있습니다.[^weaviate-ref2vec] 논문 단위로 검색할 수 있고 논문에 문단 참조를 추가하거나 지우면 논문 벡터가 다시 계산됩니다.

다만 8절 처음의 예처럼 평균은 문단마다 다른 내용을 하나로 섞습니다. 질문이 논문의 특정 문단 하나에만 답이 있는 경우라면 그 문단의 내용이 평균 속에 묽어질 수 있습니다. 특정 조항이나 문단을 찾아야 하는 검색이라면 4절처럼 청크로 검색하고 문서 단위로 묶는 편이 맞고, 문서 대표 벡터는 주제가 비슷한 문서를 고르는 용도에 더 어울립니다.

## 정리

| 상황 | 선택 | 다룬 절 |
| --- | --- | --- |
| 관련 정보가 작고, 늘 함께 읽고, 거의 안 바뀜 | 레코드에 복사(비정규화) | 3절 |
| 관련 정보가 크거나 자주 바뀌거나 따로 쓰임 | ID만 저장하고 두 번 조회, 또는 DB 참조 기능 | 2·3절 |
| 권한처럼 늦게 반영되면 안 되는 값을 복사함 | 원본이 바뀔 때 사본도 함께 갱신 | 3절 |
| 같은 문서의 청크가 결과를 차지함 | 그룹핑(`group_by`, `group_by_field`, nested kNN 등) | 4절 |
| Weaviate에서 관련 객체 정보를 함께 조회하거나 거름 | 교차 참조, `return_references`, `Filter.by_ref` | 5절 |
| 대상 객체를 지움 | 그 대상을 가리키는 참조부터 지움 | 5·6절 |
| 고객의 좋아요로 고객 벡터를 만듦 | ref2vec-centroid(단순 평균), 배치 참조 대신 단건 추가 | 6절 |
| 추천 결과에 이미 좋아한 상품이 나옴 | 좋아한 상품의 ID를 필터로 뺌 | 7절 |
| 평점을 반영하거나 싫어요를 반영함 | 앱에서 가중 평균 계산, Qdrant 추천 API의 positive·negative | 8절 |

자기 서비스에서 확인할 것도 남겨 둡니다.

- 레코드마다 복사해 둔 필드가 어떤 원본에서 왔는지, 원본이 바뀌면 누가 언제 사본을 고치는지 정해져 있나요?
- 상위 결과 중 같은 문서의 청크가 몇 개인지 재 봤나요? 그룹핑을 켜면 결과의 문서 수가 얼마나 늘어나나요?
- ref2vec-centroid를 쓴다면 좋아요를 배치 참조로 넣고 있지 않나요? 상품 벡터를 다시 만든 뒤 고객 벡터도 다시 계산했나요?
- 상품을 지우는 코드가 그 상품을 가리키는 참조도 지우나요?
- 좋아요가 없는 고객에게는 무엇을 보여 주나요?

## 참고 자료

[^pgvector]: [pgvector README](https://github.com/pgvector/pgvector). 0.8.7. 다른 데이터와 같은 테이블에 벡터를 두는 구성, 다른 행의 벡터로 이웃을 찾는 서브쿼리, `AVG(embedding)` 집계, 근사 인덱스에서 필터가 적용되는 순서와 iterative index scan.
[^pinecone-data-modeling]: [Pinecone — Data modeling](https://docs.pinecone.io/guides/index-data/data-modeling). 구조화된 ID(`document_id#chunk_number`), 청크를 묶고 원문으로 연결하는 메타데이터 필드, 평면 구조의 메타데이터.
[^qdrant-search]: [Qdrant — Search](https://qdrant.tech/documentation/search/search/). Grouping API의 `group_by`·`limit`·`group_size`와 제약, `with_lookup`의 조건과 청크마다 문서 정보를 복사할 때의 크기 계산.
[^es-join]: [Elasticsearch — Join field type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/parent-join). 부모-자식 관계의 제약과, 비정규화를 권하는 성능 경고.
[^milvus-recsys]: [Milvus — Recommender System](https://milvus.io/docs/recommendation_system.md). 영화 벡터는 Milvus에 두고 검색 결과 ID로 영화 정보를 다른 저장소에서 조회하는 구성.
[^weaviate-data]: [Weaviate — Data structure](https://docs.weaviate.io/weaviate/concepts/data). 교차 참조의 방향, 참조 값(beacon), 성능 경고와 비정규화 권고, 멀티테넌시에서의 참조 제약.
[^weaviate-parse-xref]: [Weaviate Contributor Guide — Parsing cross-references](https://docs.weaviate.io/contributor-guide/weaviate-core/parsing-cross-refs). 참조를 샤드가 아니라 데이터베이스 수준에서 따로 찾아오는 이유.
[^qdrant-explore]: [Qdrant — Explore the data](https://qdrant.tech/documentation/search/explore/). 추천 API의 positive·negative 예시, `average_vector`·`best_score`·`sum_scores` 전략의 계산, `lookup_from`.
[^qdrant-filtering]: [Qdrant — Filtering](https://qdrant.tech/documentation/search/filtering/). `must_not`과 `has_id` 조건.
[^pinecone-pgvector]: [Pinecone — Migrate from pgvector](https://docs.pinecone.io/guides/index-data/migrate-from-pgvector). 권한 속성을 메타데이터로 복사할 때 권한 변경도 동기화해야 한다는 안내.
[^mongo-modeling]: [MongoDB — Data Modeling Best Practices](https://www.mongodb.com/docs/manual/data-modeling/best-practices/). 내장(embedding)과 참조(referencing)를 고르는 기준, 중복 데이터의 종류와 갱신 방법.
[^weaviate-xref]: [Weaviate — Cross-references](https://docs.weaviate.io/weaviate/manage-collections/cross-references). Python v4의 `ReferenceProperty`, 참조 추가·삭제, `return_references`, 양방향 참조, 대상 삭제 뒤 남는 참조, 참조가 벡터에 주는 영향.
[^weaviate-starter]: [Weaviate — Collection definitions(starter guide)](https://docs.weaviate.io/weaviate/starter-guides/managing-collections). 관련 정보를 벡터 검색에 반영하려면 벡터화되는 속성에 넣어야 한다는 안내.
[^milvus-grouping]: [Milvus — Grouping Search](https://milvus.io/docs/grouping-search.md). v3.0.x. `group_by_field`, 그룹 수를 세는 `limit`, `group_size`, `strict_group_size`.
[^es-nested-knn]: [Elasticsearch — Nested kNN search](https://www.elastic.co/docs/solutions/search/vector/knn/nested-knn-search). 최상위 문서 `k`개를 가장 가까운 passage로 점수 매기는 동작, `inner_hits`, 문서 메타데이터를 복사하지 않는 구성.
[^opensearch-nested]: [OpenSearch — Nested field search](https://docs.opensearch.org/latest/vector-search/specialized-operations/nested-search-knn/). 문서마다 가장 가까운 벡터 하나로 결과를 정하는 동작과 예.
[^mongo-vector-search]: [MongoDB — $vectorSearch](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/). 배열 안 임베딩의 `nestedOptions.scoreMode`(`max`·`avg`).
[^weaviate-similarity]: [Weaviate — Vector similarity search](https://docs.weaviate.io/weaviate/search/similarity). 유사도 검색 결과를 속성이나 교차 참조로 묶는 `GroupBy`의 `number_of_groups`·`objects_per_group`.
[^weaviate-graphql-get]: [Weaviate — GraphQL Get](https://docs.weaviate.io/weaviate/api/graphql/get). `groupBy` 경로를 속성이나 참조 하나로 제한하는 규칙.
[^mongo-vector-type]: [MongoDB — How to Index Fields for Vector Search](https://www.mongodb.com/docs/vector-search/indexes/vector-search-type/). 문서 배열 안 임베딩을 지정하는 `nestedRoot`.
[^chroma-groupby]: [Chroma — Group By](https://docs.trychroma.com/cloud/search-api/group-by). 메타데이터 키 기준 그룹, `MinK`·`MaxK`, 펼친 결과에 걸리는 `limit`, Chroma Cloud 전용.
[^pinecone-chunks]: [Pinecone — Manage document chunks](https://docs.pinecone.io/guides/manage-data/manage-document-chunks). `document_id` 필터와 ID 접두어로 한 문서의 청크를 다루는 방법.
[^weaviate-datatypes]: [Weaviate — Property data types](https://docs.weaviate.io/weaviate/config-refs/datatypes). 교차 참조 타입의 정의.
[^weaviate-collections]: [Weaviate — Collection definition](https://docs.weaviate.io/weaviate/config-refs/collections). 컬렉션·속성 이름 규칙, 대문자로 구별하는 참조 표기, 생성 후 바꿀 수 없는 설정, v1.40의 벡터 없는 컬렉션, `default` 벡터 이름.
[^weaviate-filters]: [Weaviate — Filters](https://docs.weaviate.io/weaviate/search/filters). 참조 대상 속성으로 거르는 `Filter.by_ref`.
[^weaviate-graphql-filters]: [Weaviate — GraphQL filters](https://docs.weaviate.io/weaviate/api/graphql/filters). 참조 개수로 거르는 필터.
[^weaviate-python]: [Weaviate — Python client](https://docs.weaviate.io/weaviate/client-libraries/python). v4.24.1. `ReferenceProperty.MultiTarget`, 4.16.0부터 `vector_config`·`Configure.Vectors`로 바뀐 설정 인자.
[^weaviate-ref2vec]: [Weaviate — ref2vec-centroid](https://docs.weaviate.io/weaviate/modules/ref2vec-centroid). 평균만 지원하는 계산 방법, 설정, 벡터를 다시 계산하는 시점, 배치 참조 미지원, 참조된 객체 변경이 전파되지 않는 점, 참조가 없을 때의 벡터, 논문·문단 예.
[^weaviate-ref2vec-blog]: [Weaviate Blog — What is Ref2Vec and why you need it for your recommendation system](https://weaviate.io/blog/ref2vec-centroid). 2022-11-23. 사용자 벡터를 상품 검색의 질의로 쓰는 예.
[^weaviate-search-operators]: [Weaviate — Search operators](https://docs.weaviate.io/weaviate/api/graphql/search-operators). 같은 컬렉션 안에서 기준 객체와 가까운 객체를 찾는 `nearObject`.
