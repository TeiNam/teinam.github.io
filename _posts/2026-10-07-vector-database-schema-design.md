---
date: 2026-10-07 00:00:00 +0900
title: "벡터 DB 컬렉션은 어떻게 나눌까: 레코드 구성부터 컬렉션 설계까지"
category: ai/ml
excerpt: "벡터 DB 레코드를 이루는 ID·벡터·원문·메타데이터와 RDB 테이블과의 대응, 컬렉션을 나누는 기준과 파티션·테넌트·샤드 같은 대안, 여러 컬렉션을 함께 검색할 때 맞춰야 할 벡터 공간을 공식 문서에 근거해 정리합니다."
last_modified_at: 2026-10-07
series: "벡터 DB"
series_index: "4 / 4"
---

**시리즈** · [1. 개념과 제품·사용 지표](/writing/vector-database-overview/) · [2. 선택 기준과 기능 비교](/writing/vector-database-selection/) · [3. AWS 전용 벡터 검색](/writing/aws-vector-search/) · **4. 스키마와 컬렉션 설계**

사내 문서 검색 서비스를 만든다고 해 봅시다. 인사팀 규정과 영업팀 제안서가 있고 제품 사진도 검색되면 좋겠고 업계 뉴스는 매일 수백 건씩 들어옵니다. 벡터 DB를 골랐다면 다음 질문은 “이 데이터를 컬렉션 하나에 넣을까, 여러 개로 나눌까”입니다.

벡터 DB에서는 컬렉션을 나누는 기준이 서비스의 성능과 운영을 좌우합니다. 관계형 데이터베이스(RDB)에서 테이블을 나누는 기준과 같은 역할입니다. 벡터 차원이나 샤드 수는 컬렉션을 만들 때 한 번 정하면 나중에 바꾸기 어려운 제품이 많습니다(7·8절). 이 때문에 처음 설계할 때 따져 볼 것을 미리 알아 두는 편이 좋습니다.

[2편](/writing/vector-database-selection/)에서는 제품을 고르는 기준을 비교했습니다. 이 글은 제품을 고른 뒤 그 안에 **데이터를 어떤 모양과 단위로 담을지**를 다룹니다.

**이 글에서 알 수 있는 것**

- 벡터 DB 레코드를 이루는 네 가지(ID·벡터·원문·메타데이터)와 RDB 테이블과의 대응
- 컬렉션을 나누는 다섯 가지 기준과, 컬렉션 대신 파티션·테넌트·필터로 나누는 방법
- 업무 문서, 텍스트와 이미지, 매일 쌓이는 뉴스 기사에서 컬렉션을 정하는 방법
- 여러 컬렉션을 함께 검색하는 방법과, 그때 벡터 공간을 맞춰야 하는 이유
- 컬렉션을 나누는 것과 컬렉션 안에서 샤드를 나누는 것의 차이

이 글의 문서 조사 기준일은 2026년 10월 7일입니다. Milvus는 v3.0.x 문서, Pinecone은 API 버전 2026-07 문서, pgvector는 README에 표시된 0.8.7을 기준으로 합니다. 예제의 컬렉션 이름과 데이터는 설명을 위해 만든 것입니다.

## 1. 먼저 알아 둘 용어는 무엇일까요

이 글에 자주 나오는 용어를 먼저 정리합니다. 제품마다 이름이 다른 개념은 2절의 표에서 다시 대응시킵니다.

| 용어 | 쉬운 설명 |
| --- | --- |
| 임베딩(embedding) | 문장이나 이미지를 숫자 배열(벡터)로 바꾼 값입니다. 의미가 비슷한 데이터는 서로 가까운 벡터가 됩니다. |
| 차원(dimension) | 벡터에 든 숫자의 개수입니다. 768차원 벡터는 숫자 768개로 이루어집니다. |
| 컬렉션(collection) | 벡터와 관련 데이터를 함께 저장하고 검색하는 단위입니다. RDB의 테이블에 해당합니다. |
| 레코드(record) | 컬렉션에 저장하는 데이터 한 건입니다. RDB의 행(row)에 해당합니다. |
| 메타데이터(metadata) | 레코드에 붙이는 부가 정보입니다. 작성일·부서·카테고리 같은 값이며, 검색 조건(필터)으로 씁니다. Qdrant는 payload라고 부릅니다. |
| 거리 측정(distance metric) | 두 벡터가 얼마나 가까운지 계산하는 방식입니다. 코사인 유사도, 내적(dot product), 유클리드 거리(L2)가 대표적입니다. |
| 파티션(partition) | 한 컬렉션을 논리적으로 나눈 부분 집합입니다. 같은 스키마를 공유하면서 검색 범위를 좁히는 데 씁니다. |
| 테넌트(tenant) | 데이터를 서로 분리해야 하는 사용자 단위입니다. 서비스형 소프트웨어(SaaS)의 고객사 하나가 테넌트 하나인 경우가 많습니다. |
| 멀티테넌시(multi-tenancy) | 테넌트 여러 개의 데이터를 한 시스템에 두면서 서로 섞이지 않게 나누는 방식입니다. |
| 샤드(shard) | 한 컬렉션의 데이터를 여러 조각으로 나눠 여러 노드에 분산한 것입니다. 데이터가 커질 때 수평 확장에 씁니다. |

## 2. 벡터 DB의 레코드는 무엇으로 이루어질까요

벡터 DB 제품은 저장 단위를 부르는 이름이 서로 다릅니다. 그래도 레코드 한 건을 열어 보면 대부분 네 가지로 이루어져 있습니다.

- **ID:** 레코드를 구별하는 고유 값입니다. RDB의 기본 키(primary key)에 해당합니다.
- **벡터:** 원문을 임베딩한 숫자 배열입니다. 유사도 검색은 이 값으로 합니다.
- **원문:** 벡터를 만든 원래 텍스트입니다. 검색 결과로 사용자에게 보여 주거나 대규모 언어 모델(LLM)에 넘길 때 씁니다.
- **메타데이터:** 작성일·부서·카테고리처럼 검색 범위를 좁히는 데 쓰는 값입니다.

Chroma의 레코드는 이 네 가지 구성을 그대로 따릅니다. Chroma에서 컬렉션은 저장과 질의의 기본 단위입니다. 레코드마다 고유한 문자열 `id`가 필요하고 원문(`documents`)과 벡터(`embeddings`) 중 하나 또는 둘 다를 넣습니다. 메타데이터(`metadatas`)는 언제나 선택 사항입니다. 컬렉션마다 임베딩 함수를 지정하며 기본값은 sentence transformer 모델입니다.[^chroma]

{% include diagram.html src="vdb-record-structure.svg" caption="레코드는 ID·벡터·원문·메타데이터로 이루어지며 RDB의 행과 열에 대응합니다" %}

### RDB 테이블과는 어떻게 대응할까요

컬렉션을 RDB 테이블, 레코드를 행으로 보면 이해하기 쉽습니다. pgvector는 이 대응이 실제 구조 그대로입니다. pgvector는 PostgreSQL 확장이므로 별도의 컬렉션 개념 없이 일반 테이블에 `vector` 타입 열을 추가합니다.[^pgvector]

```sql
-- 테이블 = 컬렉션, 행 = 레코드
CREATE TABLE doc_chunks (
  id        bigserial PRIMARY KEY,  -- ID
  content   text,                   -- 원문
  metadata  jsonb,                  -- 메타데이터
  embedding vector(768)             -- 벡터(768차원)
);

-- 주어진 벡터와 L2 거리가 가까운 순서로 5건 조회
SELECT id, content
FROM doc_chunks
ORDER BY embedding <-> '[0.12, -0.03, ...]'
LIMIT 5;
```

앞 SQL의 `'[0.12, -0.03, ...]'`는 자리 표시입니다. 실제 질의에는 768개 값을 모두 넣습니다. `<->`는 pgvector의 L2 거리 연산자입니다.

Milvus는 RDB와 어떻게 대응하는지를 문서에서 직접 설명합니다. 문서는 컬렉션을 고정된 열과 가변적인 행으로 이루어진 2차원 표로 소개합니다. 행 하나를 엔티티(entity), 열 하나를 필드(field)라고 부릅니다. 기본 키 필드(primary field)의 값은 엔티티 하나를 고유하게 가리키며 `Int64` 또는 `VARCHAR`만 받습니다.[^milvus-collection]

Milvus 스키마(schema)는 기본 키 필드, 하나 이상의 벡터 필드, 선택적인 스칼라 필드(숫자·문자열 같은 일반 값)로 구성됩니다. 벡터 필드에는 `dim` 파라미터로 차원을 지정합니다.[^milvus-schema] Milvus에는 컬렉션 위에 데이터베이스(database)라는 논리 단위도 있습니다. 한 데이터베이스에 컬렉션을 여러 개 두며 기본 데이터베이스는 삭제할 수 없습니다.[^milvus-database]

### 제품마다 부르는 이름은 어떻게 다를까요

| 제품 | 컬렉션에 해당하는 단위 | 레코드와 구성 요소 |
| --- | --- | --- |
| Chroma | collection | record: `id`, 벡터(`embeddings`), 원문(`documents`), 메타데이터(`metadatas`) |
| Qdrant | collection | point: ID, 벡터(이름 붙인 벡터 여러 개 가능), payload |
| Milvus | collection(database 아래) | entity: 기본 키 필드, 벡터 필드, 스칼라 필드, 동적 필드 |
| Weaviate | collection | object: UUID, properties, 벡터(이름 붙인 벡터 여러 개 가능) |
| Pinecone | index(namespace로 나눔) | record: ID, dense 벡터·sparse 벡터, 메타데이터 |
| pgvector | 테이블 | 행: 기본 키 열, `vector(n)` 열, 나머지 열 |
| Elasticsearch | index | 문서: `dense_vector` 필드, 나머지 필드 |

Qdrant에서 컬렉션은 point(payload가 붙은 벡터)를 모은 집합이며 컬렉션마다 이름이 있습니다. 검색은 이 집합을 대상으로 합니다. point의 ID로는 64비트 부호 없는 정수와 UUID를 쓸 수 있습니다.[^qdrant-points] Weaviate는 모든 객체에 UUID를 부여하며 이 UUID는 모든 컬렉션에 걸쳐 고유합니다.[^weaviate-data]

Pinecone에서는 프로젝트 안에 인덱스가 있고 인덱스 안을 namespace로 나눕니다. 레코드는 ID와 벡터 하나(하이브리드 검색용 인덱스는 dense·sparse 두 종류), 선택적인 메타데이터로 이루어집니다.[^pinecone-concepts] sparse 벡터는 차원 수는 매우 많지만 그 가운데 0이 아닌 값은 적은 벡터이고 dense 벡터는 대부분의 값이 0이 아닌 일반적인 벡터입니다. Elasticsearch는 인덱스의 `dense_vector` 필드에 벡터를 저장하고 나머지 필드에 원문과 메타데이터를 둡니다.[^es-dense-vector]

Qdrant의 point 하나는 JSON으로 다음과 같이 생겼습니다. payload의 키와 값은 예시입니다.

```json
{
  "id": 129,
  "vector": [0.1, 0.2, 0.3, 0.4],
  "payload": {"department": "hr", "created_at": "2026-10-01"}
}
```

### 한 컬렉션 안의 레코드는 모양이 모두 같아야 할까요

꼭 그렇지는 않습니다. Chroma는 원문만 있는 레코드, 벡터만 있는 레코드, 둘 다 있는 레코드를 한 컬렉션에 받습니다. 메타데이터도 레코드마다 있을 수도 없을 수도 있습니다.[^chroma] Milvus는 동적 필드를 켜면 스키마에 정의하지 않은 필드를 `$meta`라는 예약된 JSON 필드에 키-값 쌍으로 저장합니다. 동적 필드는 `enable_dynamic_field=True`로 켭니다.[^milvus-dynamic]

다만 **벡터의 차원과 거리 측정 방식은 컬렉션 안에서 같아야 합니다.** Qdrant 문서는 한 컬렉션에 있는 모든 point의 벡터가 차원이 같고 하나의 거리 측정으로 비교된다고 명시합니다.[^qdrant-collections] 유연한 메타데이터와 달리 벡터에는 엄격한 규칙이 적용되는 구조입니다. 이 규칙은 7절에서 여러 컬렉션을 함께 검색할 때 다시 중요해집니다.

## 3. 컬렉션은 어떤 단위로 만들까요

컬렉션을 도출하는 방법은 RDB 테이블을 도출하는 방법과 크게 다르지 않습니다. **비슷한 데이터의 묶음이자 비슷한 서비스를 제공하는 단위**가 컬렉션 후보입니다. 그 후보를 다시 나눌지 합칠지는 다음 다섯 가지 기준으로 판단합니다.

| 기준 | 확인할 질문 | 나누는 쪽으로 기우는 경우 |
| --- | --- | --- |
| 크기와 확장 | 데이터가 얼마나 빨리 늘고, 한 컬렉션으로 감당할 수 있는가 | 한 덩어리로는 색인·검색·백업이 부담스러울 때(먼저 8절의 샤드를 검토) |
| 접근 패턴 | 어떤 데이터를 함께, 얼마나 자주 검색하는가 | 늘 따로 검색되고 함께 검색할 일이 없을 때 |
| 생명주기 | 데이터가 언제 생기고 언제 지워지는가 | 보관 기간이 달라 묶음째 지우거나 옮겨야 할 때 |
| 속성 | 같은 필드 구성·임베딩 모델·거리 측정을 쓰는가 | 벡터 차원이나 모델, 필드 구성이 다를 때 |
| 운영 용이성 | 컬렉션이 늘면 관리할 대상이 얼마나 늘어나는가 | 반대로 컬렉션이 너무 많아지면 합치는 쪽을 검토 |

다섯 기준은 서로 당기는 방향이 다릅니다. 생명주기와 속성은 나누는 쪽으로 기웁니다. 운영 용이성은 반대로 합치는 쪽을 가리킵니다. 다섯 기준을 함께 놓고 가장 단순한 구조를 찾는 것이 출발점입니다.

### 컬렉션 말고도 나누는 방법이 있습니다

데이터를 나눠야 한다고 해서 꼭 컬렉션을 새로 만들 필요는 없습니다. 대부분의 제품은 컬렉션보다 가벼운 분리 수단을 함께 제공합니다. 나누는 수준을 위에서부터 놓으면 다음과 같습니다.

{% include diagram.html src="vdb-split-levels.svg" caption="데이터를 나누는 수준: 컬렉션, 파티션·테넌트, 메타데이터 필터, 샤드" %}

공식 문서는 테넌트나 사용자마다 컬렉션을 만드는 방식을 기본값으로 권하지 않습니다.

**Qdrant**는 대부분의 경우 컬렉션 하나를 쓰고 payload(메타데이터)로 데이터를 나누라고 안내하며 이 방식을 멀티테넌시라고 부릅니다. 문서에 따르면 컬렉션을 여러 개 만드는 방식은 유연하지만 컬렉션이 많아지면 리소스 오버헤드로 비용이 커질 수 있습니다. 여러 컬렉션은 사용자 수가 적고 격리가 필요할 때 쓰는 방법으로 둡니다. 테넌트마다 컬렉션을 따로 만드는 방식은 가장 효율적인 경우가 드물다고도 적습니다.[^qdrant-collections][^qdrant-multitenancy]

Qdrant에서 테넌트를 구분하는 keyword payload 인덱스에 `is_tenant=true`(v1.11.0+)를 주면, 같은 테넌트의 벡터를 저장소에서 가까이 모아 둡니다. 문서는 이렇게 하면 순차 읽기를 활용해 성능이 크게 좋아질 수 있다고 적습니다.[^qdrant-multitenancy]

**Milvus**는 멀티테넌시를 네 수준으로 나눠 비교합니다.[^milvus-tenancy]

| 수준 | 테넌트 수 상한(기본) | 특징 |
| --- | --- | --- |
| Database | 64 | 테넌트마다 데이터베이스 하나, 물리적 격리, 스키마 유연성이 가장 높음 |
| Collection | 65,536 | 테넌트마다 컬렉션 하나, 물리적 격리 |
| Partition | 컬렉션당 1,024 | 공유 컬렉션 안에 테넌트마다 파티션을 직접 생성 |
| Partition key | 수백만 | 파티션 키 값에 따라 물리적으로 분리된 16개 파티션에 자동 분배 |

같은 문서의 비교표에서 검색 성능은 Database·Collection 수준이 더 높고 파티션 계열은 중간으로 정리돼 있습니다. 역할 기반 접근 제어(RBAC, Role-Based Access Control)는 Database·Collection 수준에서만 쓸 수 있습니다. 대신 Partition·Partition key 수준에서는 테넌트를 하나씩 질의할 수도, 여러 파티션에 걸쳐 함께 질의할 수도 있어 테넌트를 가로지르는 집계에 맞습니다. 자주 쓰는 데이터와 드물게 쓰는 데이터를 나눠 다루는 hot·cold 처리는 Partition key 수준에서 아직 지원하지 않습니다.[^milvus-tenancy] Milvus의 한도 문서에는 클러스터당 컬렉션 65,536개, 컬렉션당 파티션 1,024개가 적혀 있습니다.[^milvus-limits]

**Weaviate**는 네이티브 멀티테넌시를 제공합니다. 테넌트마다 별도의 샤드에 저장하며 한 테넌트의 데이터는 다른 테넌트에게 보이지 않습니다. 문서는 여러 사용자에게 서비스하는 애플리케이션에서는 멀티테넌시로 데이터가 분리되고 DB 작업도 효율적이라고 정리합니다.[^weaviate-mt] 테넌트마다 전용 벡터 인덱스를 가지며 쓰지 않는 테넌트는 비활성 상태로 두거나 S3로 내보낼 수 있습니다.[^weaviate-data]

**Pinecone**은 테넌트마다 namespace를 하나씩 두라고 안내합니다. namespace는 따로 저장되므로 테넌트 간 데이터가 물리적으로 분리됩니다. 읽기와 쓰기는 언제나 namespace 하나를 대상으로 하므로 한 테넌트의 사용량이 다른 테넌트에 영향을 주지 않습니다. 테넌트가 서비스를 떠나 데이터를 없앨 때는 해당 namespace를 지우면 됩니다. 문서에 따르면 이 작업은 가볍고 거의 즉시 끝납니다. 서버리스 인덱스당 namespace 수는 요금제에 따라 Starter 100개에서 Enterprise 1,000,000개까지입니다.[^pinecone-mt]

같은 문서는 테넌트를 모두 namespace 하나에 넣고 메타데이터 필터로 나누는 방식의 비용도 짚습니다. 이 경우 필터와 관계없이 namespace 전체를 훑으므로 비용과 지연이 커진다는 취지입니다.[^pinecone-mt]

**컬렉션은 스키마·임베딩 모델·접근 권한까지 달라야 할 때 나누는 무거운 경계**입니다. 같은 스키마에서 검색 범위만 나누면 된다면 파티션·테넌트·namespace를, 그보다 가벼운 조건이라면 메타데이터 필터를 먼저 검토합니다. 2편의 [필터와 멀티테넌시 비교](/writing/vector-database-selection/)에 제품별 권장 방식을 표로 정리했습니다.

## 4. 업무가 다른 비슷한 문서는 한 컬렉션에 둘까요

인사 규정, 영업 제안서, 기술 매뉴얼은 모두 문서입니다. 같은 임베딩 모델로 벡터를 만들 수 있고 형식도 비슷해서 흔히 컬렉션 하나에 넣을 생각부터 합니다. 데이터가 많지 않다면 실제로 그 방법이 가장 단순합니다(데이터가 아주 많을 때는 이 절 마지막 소절에서 다룹니다). 다만 쓰임새가 다르면 나누는 편이 검색 정확도나 운영에 유리한 경우가 있습니다.

### 한 컬렉션과 메타데이터로 충분한 경우

다음 조건을 모두 만족하면 컬렉션 하나에 넣고 업무 구분은 메타데이터로 둡니다.

- 모든 문서에 같은 임베딩 모델·차원·거리 측정을 씁니다.
- 업무를 가로질러 함께 검색할 일이 있습니다. 예를 들어 전사 통합 검색입니다.
- 보관 기간과 삭제 규칙이 비슷합니다.
- 접근 권한을 메타데이터 필터나 테넌트 수준에서 나눠도 됩니다.

다음은 업무 구분을 메타데이터로 담은 레코드 예시입니다(특정 제품의 API 형식은 아닙니다).

```json
{
  "id": "hr-policy-0012#3",
  "document": "연차휴가는 입사일을 기준으로 산정합니다. ...",
  "metadata": {
    "business": "hr",
    "doc_type": "policy",
    "updated_at": "2026-09-01"
  }
}
```

인사팀 화면에서는 `business = "hr"` 조건을 걸어 검색하고 통합 검색에서는 조건 없이 검색합니다. 업무가 하나 늘어나도 컬렉션을 새로 만들 필요 없이 `business` 값만 추가하면 됩니다. 업무별로 검색 범위를 물리적으로 나누고 싶다면 3절의 파티션이나 테넌트를 같은 방식으로 씁니다.

### 컬렉션을 나누는 편이 나은 경우

반대로 다음과 같은 차이가 있으면 컬렉션을 나누는 쪽을 검토합니다.

| 상황 | 나누는 이유 |
| --- | --- |
| 업무마다 다른 임베딩 모델을 씀 | 차원이나 벡터 공간이 달라 같은 벡터 필드에 넣을 수 없음(7절) |
| 접근 권한을 DB 수준에서 분리해야 함 | Milvus의 RBAC처럼 컬렉션 이상의 단위에서만 권한을 나누는 제품이 있음(3절) |
| 필드 구성이 크게 다름 | 한 스키마에 모든 업무의 필드를 넣으면 대부분 비어 있는 필드가 생김 |
| 보관·삭제 주기가 다름 | 컬렉션째 지우거나 옮기는 편이 단순함 |
| 검색 부하나 증가 속도가 크게 다름 | 샤드·복제본 설정을 컬렉션마다 따로 잡을 수 있음 |

### 데이터가 아주 많으면 어떻게 할까요

대용량 데이터를 컬렉션 하나에 두면 구조는 단순합니다. 대신 한 컬렉션이 커질수록 색인·검색·갱신의 부담이 한곳에 몰리고 컬렉션 단위로 하는 백업과 복구도 오래 걸립니다. 업무 유형이나 기간을 기준으로 컬렉션을 나누면 이 부담이 컬렉션마다 나뉘어 성능과 관리에 유리할 수 있습니다.

다만 규모 문제만 있다면 컬렉션을 나누기 전에 **샤드**부터 검토합니다. 샤드는 컬렉션 하나를 여러 노드에 나눠 담는 기능이므로 애플리케이션이 다루는 컬렉션은 그대로 두고 용량을 늘릴 수 있습니다(8절). 컬렉션을 여러 개로 나누면 생성·삭제와 검색 대상 관리를 자동화해야 하므로 그에 맞는 도구와 절차가 함께 필요해집니다. 컬렉션을 가로지르는 검색이 필요해지면 7절의 제약도 따라옵니다.

## 5. 텍스트와 이미지를 한 컬렉션에 담을 수 있을까요

멀티모달(multimodal)은 텍스트·이미지·오디오·비디오처럼 종류가 다른 데이터를 함께 이해하고 분석하는 방식입니다. “해변에서 서핑하는 사람”이라는 텍스트로 사진이나 영상을 찾는 검색이 대표적입니다. 영상에 설명을 붙이거나 이미지와 음성을 함께 넣어 질문하는 서비스도 같은 범주에 듭니다.

종류가 다른 데이터도 한 컬렉션에서 관리할 수 있습니다. 방법은 크게 두 가지입니다.

### 공유 임베딩 공간을 쓰는 방법

첫째는 텍스트와 이미지를 **같은 벡터 공간**에 놓는 모델을 쓰는 방법입니다. 대표적인 예가 CLIP(Contrastive Language-Image Pre-training)입니다. CLIP은 이미지 인코더와 텍스트 인코더를 함께 학습합니다. 학습 배치 안에서 실제로 짝인 이미지·캡션 N쌍은 임베딩의 코사인 유사도를 높이고 짝이 아닌 N²−N개 조합은 유사도를 낮추도록 학습합니다. 그 결과 이미지와 텍스트가 하나의 멀티모달 임베딩 공간을 공유합니다.[^clip]

공간을 공유하므로 사진의 벡터와 “해변에서 서핑하는 사람”이라는 문장의 벡터를 바로 비교할 수 있습니다. 컬렉션 하나, 벡터 필드 하나에 이미지와 텍스트를 함께 넣고 텍스트 질의로 이미지를 찾을 수 있습니다. CLIP 논문에 따르면 사전 학습 뒤 자연어로 시각 개념을 가리킬 수 있어 별도 학습 없이 다른 작업에 옮겨 쓸 수 있습니다.[^clip]

### 레코드 하나에 벡터를 여러 개 두는 방법

둘째는 모달리티마다 다른 모델로 벡터를 만들고 **레코드 하나에 이름 붙인 벡터를 여러 개** 두는 방법입니다.

**Qdrant**는 named vector로 point 하나에 크기와 종류가 다른 벡터 여러 개를 둡니다. 이름마다 다른 임베딩 모델·차원·거리 측정을 쓸 수 있고 dense·sparse·multivector(같은 크기의 벡터 여러 개를 한 묶음으로 저장하는 형식)를 섞을 수도 있습니다.[^qdrant-vectors] 벡터를 넣을 때는 이름별로 값을 줍니다.[^qdrant-points]

```json
{
  "id": 129,
  "vector": {
    "image": [0.9, 0.1, 0.1, 0.2],
    "text": [0.4, 0.8, 0.0]
  },
  "payload": {"title": "해변 서핑 사진"}
}
```

이 예시에서 `image` 벡터는 4차원, `text` 벡터는 3차원으로 차원이 서로 다릅니다. 이름이 다른 벡터끼리는 차원이 달라도 되지만 같은 이름의 벡터는 컬렉션 안에서 차원이 같아야 합니다.

**Milvus**는 한 컬렉션에 벡터 필드를 여러 개 두고 여러 필드를 함께 검색하는 하이브리드 검색(hybrid search)을 제공합니다. 텍스트 설명과 이미지 임베딩을 함께 쓰는 멀티모달 검색이 문서의 용례입니다. 필드별 결과는 RRF Ranker(순위를 기준으로 결합)나 Weighted Ranker(필드별 점수에 가중치를 주어 결합)로 합칩니다.[^milvus-hybrid]

**Weaviate**도 컬렉션에 named vector를 여러 개 둘 수 있습니다. 벡터 공간마다 인덱스·압축·vectorizer(데이터를 벡터로 바꾸는 모듈)를 따로 설정하며 v1.31부터는 기존 컬렉션에 새 named vector를 추가할 수 있습니다. 이미 만든 named vector의 설정은 바꿀 수 없습니다.[^weaviate-data][^weaviate-config]

### 어느 쪽을 고를까요

| 방식 | 잘 맞는 경우 | 주의할 점 |
| --- | --- | --- |
| 공유 임베딩 공간(벡터 하나) | 텍스트로 이미지를 찾는 것처럼 모달리티를 가로지르는 검색 | 한 모델이 다룰 모달리티를 모두 지원해야 함 |
| 레코드당 벡터 여러 개 | 모달리티마다 더 잘 맞는 모델을 따로 쓰고 싶을 때 | 레코드마다 저장할 벡터가 늘고, 결과를 합치는 방식을 정해야 함 |

복합 정보를 벡터 하나로 표현하면 검색 한 번으로 끝나고 결과를 합칠 필요가 없습니다. 벡터를 여러 개 두면 저장할 값과 계산이 늘어납니다. 어느 쪽 검색 품질이 나은지는 데이터와 질의에 따라 다르므로 대표 질의를 정해 두 구성을 직접 비교해 보고 정합니다.

## 6. 매일 쌓이는 뉴스 기사는 어떻게 나눌까요

이번에는 뉴스 기사를 저장하는 경우를 생각해 봅시다. 데이터와 사용 방식에는 다음과 같은 특징이 있습니다.

- **데이터 특성:** 기사가 매일 생기고 날짜별 양이 많습니다. 주제·카테고리·작성자 같은 속성이 다양합니다.
- **접근 패턴:** 최신 기사를 자주 검색하고 오래된 기사는 덜 검색합니다. 특정 주제나 카테고리로 좁혀 검색하는 일이 많습니다.

이 특징을 바탕으로 세 가지 설계안을 세울 수 있습니다.

{% include diagram.html src="vdb-news-collection-options.svg" caption="뉴스 기사를 날짜·주제·월과 주제 혼합 기준으로 나누는 세 가지 안" %}

| 안 | 컬렉션 이름 예 | 장점 | 주의할 점 |
| --- | --- | --- | --- |
| 날짜 기준 | `news_20240530`, `news_20240531` | 최신 기사는 최근 날짜 컬렉션만 검색하면 되고, 오래된 기사는 컬렉션째 보관·삭제 | 주제 검색이나 여러 날에 걸친 검색은 여러 컬렉션을 봐야 하고, 컬렉션이 하루에 하나씩 늘어남 |
| 주제 기준 | `news_politics`, `news_economy`, `news_sports` | 특정 주제 검색이 한 컬렉션 안에서 끝나고 컬렉션 수가 거의 고정 | 오래된 기사를 정리하려면 컬렉션마다 날짜 조건으로 지워야 함 |
| 혼합(월+주제) | `news_202405_politics` | 지나치게 잘게 나누지 않으면서 기간과 주제를 함께 좁힘 | 컬렉션 수가 월 수×주제 수로 늘어남(주제 10개면 1년에 120개) |

세 안 모두 “컬렉션 이름에 조건을 넣는” 방식입니다. 3절의 공식 권고를 따르면 넷째 안도 있습니다. 컬렉션은 `news` 하나로 두고 날짜와 주제를 메타데이터나 파티션 키로 담는 방식입니다. 주제별로 데이터를 물리적으로 모으고 싶다면 Milvus의 partition key나 Qdrant의 `is_tenant`를 씁니다. 이때 오래된 기사는 바로 다음 소절에서 다루는 만료·삭제 기능으로 정리합니다.

### 시간 순으로 쌓이는 데이터에는 어떤 기능이 있을까요

날짜별로 컬렉션을 직접 만들고 지우는 작업을 대신해 주는 기능이 제품마다 있습니다.

| 제품 | 제공하는 기능 | 동작 |
| --- | --- | --- |
| Elasticsearch | data stream, rollover, ILM, alias | 새 인덱스를 나이·크기 기준으로 자동 생성하고, 오래된 인덱스를 옮기거나 삭제 |
| Milvus | 컬렉션 TTL | 만료된 엔티티를 결과에서 즉시 빼고 다음 compaction에서 물리적으로 삭제 |
| Weaviate | 컬렉션 수준 TTL | 지정한 기간이 지난 객체를 백그라운드에서 주기적으로 삭제 |
| Qdrant | 필터 삭제 | payload 조건에 맞는 point를 삭제 |
| Chroma | `where` 필터 삭제 | 조건에 맞는 항목을 삭제(되돌릴 수 없음) |
| Pinecone | ID·메타데이터 필터·namespace 삭제 | 조건에 맞는 레코드나 namespace 전체를 삭제 |

**Elasticsearch의 data stream**은 여러 인덱스 위에 놓인 추상 계층으로, append-only(추가만 하는) 시계열 데이터를 저장하도록 최적화돼 있습니다. 실제 데이터는 자동으로 만들어지는 숨은 백킹 인덱스(backing index)에 들어갑니다. 모든 문서에는 `@timestamp` 필드가 있어야 합니다.[^es-data-stream]

rollover는 새 백킹 인덱스를 만들어 data stream의 새 쓰기 인덱스로 지정합니다. 백킹 인덱스 이름은 `.ds-<data-stream>-<yyyy.MM.dd>-<generation>` 형식입니다.[^es-data-stream] 인덱스 하나에 계속 쓰면 성능과 리소스 사용에 나쁠 수 있으므로, 샤드 크기(예: 50GB), 인덱스의 나이(예: 7일), 샤드당 문서 수 같은 조건으로 rollover합니다.[^es-rollover]

ILM(Index Lifecycle Management, 인덱스 생명주기 관리)은 오래된 백킹 인덱스를 더 저렴한 하드웨어로 옮기고 필요 없는 인덱스를 삭제합니다. 인덱스는 Hot(활발히 갱신·조회) 단계에서 Delete(더 이상 필요 없어 삭제 가능) 단계까지 차례로 이동합니다. 다음 단계로 넘어가려면 현재 단계의 작업이 모두 끝나고 인덱스가 다음 단계의 최소 나이를 넘어야 합니다.[^es-ilm] 날짜별 컬렉션 이름을 직접 짓는 대신 data stream이 날짜가 붙은 인덱스를 만들고 정리하는 셈입니다.

data stream은 로그·이벤트·메트릭처럼 계속 생성되고 갱신·삭제보다 새 문서 색인이 대부분인 데이터에 맞습니다.[^es-data-stream] 기사 수정이 잦다면 data stream이 맞는 데이터인지 함께 따져 봅니다. 별칭(alias)은 인덱스나 data stream 하나 이상을 가리키는 이름이며 대부분의 Elasticsearch API가 인덱스 이름 자리에 alias를 받습니다. 여러 인덱스를 한 이름으로 검색하고 `is_write_index`로 쓰기 대상을 정할 수 있습니다.[^es-alias]

**Milvus의 컬렉션 TTL(Time-to-Live)**은 엔티티를 자동으로 만료시킵니다. 만료된 엔티티는 질의·검색 결과에서 즉시 빠지고 다음 compaction(작은 데이터 조각을 합치고 삭제된 데이터를 정리하는 백그라운드 작업) 주기에 저장소에서 물리적으로 삭제됩니다. Milvus 문서는 이 물리 삭제가 보통 24시간 안에 이뤄진다고 적습니다. TTL은 컬렉션 속성 `collection.ttl.seconds`에 초 단위 정수로 지정하며 기존 컬렉션에는 `alter_collection_properties()`로 설정합니다.[^milvus-ttl]

**Weaviate**도 컬렉션 수준의 TTL 설정으로 일정 기간이 지난 객체를 자동으로 삭제할 수 있습니다. 만료된 객체는 백그라운드 프로세스가 주기적으로 지웁니다. 조건으로 지울 때는 컬렉션과 `where` 필터를 지정하며 한 번에 지울 수 있는 객체 수에는 설정 가능한 상한(`QUERY_MAXIMUM_RESULTS`, 기본 10,000)이 있습니다.[^weaviate-ttl]

**Qdrant**는 ID 대신 필터로 삭제할 point를 지정할 수 있습니다.[^qdrant-points] 아래는 `published_month` payload가 `2024-05`인 기사를 지우는 요청입니다. 컬렉션 이름과 payload 키는 예시입니다.

```http
POST /collections/news/points/delete
{
  "filter": {
    "must": [
      { "key": "published_month", "match": { "value": "2024-05" } }
    ]
  }
}
```

이 요청은 조건에 맞는 point를 모두 지웁니다. 운영 컬렉션에서는 같은 filter로 대상 point를 먼저 조회해 확인한 뒤 실행합니다.

**Chroma**는 `id`나 `where` 필터로 컬렉션의 항목을 삭제하며 이 작업은 되돌릴 수 없습니다.[^chroma-delete] **Pinecone**은 ID(요청당 최대 1,000개), 메타데이터 필터, namespace 단위로 레코드를 삭제합니다.[^pinecone-delete]

### 설계 단계에서 실제 질의로 시험해 봅니다

어느 안이 나은지는 데이터 특성, 접근 패턴, 성능 요구, 운영 편의를 함께 봐야 정할 수 있습니다. 같은 뉴스 데이터라도 서비스가 최신 속보 검색 위주인지, 주제별 아카이브 검색 위주인지에 따라 답이 달라집니다. 분석·설계 단계에서 후보 구성을 작게 만들어 먼저 시험해 보기를 권합니다.

시험할 때는 다음을 확인합니다.

1. **대표 질의를 정합니다.** 최신 기사 검색, 특정 주제 검색, 기간과 주제를 함께 건 검색처럼 실제 화면에서 나올 질의를 고릅니다.
2. **후보 구성마다 같은 질의를 실행합니다.** 검색 결과의 품질과 응답 시간을 함께 기록합니다.
3. **정리 작업을 실제로 해 봅니다.** 한 달 치 기사를 지우거나 옮기는 데 드는 시간과, 그동안 검색에 주는 영향을 봅니다.
4. **1년 뒤를 계산합니다.** 컬렉션 수, 컬렉션당 데이터 양, 자동화해야 할 작업을 적어 봅니다.

## 7. 여러 컬렉션을 한 번에 검색할 수 있을까요

날짜별이나 주제별로 컬렉션을 나눴다면 여러 컬렉션에 걸쳐 유사도 검색을 해야 할 때가 생깁니다. 여러 컬렉션을 함께 검색하는 기능은 제품마다 지원 방식이 다릅니다.

### Elasticsearch는 URL 경로에 인덱스를 나열합니다

Elasticsearch는 검색 API의 요청 경로에 인덱스 이름을 쉼표로 나열해 여러 인덱스를 한 번에 검색합니다. `my-index-*` 같은 와일드카드와 alias도 쓸 수 있습니다. 경로에서 인덱스를 생략하거나 `*`·`_all`을 쓰면 모든 data stream과 인덱스를 검색합니다.[^es-multi-search][^es-search-api] 특정 인덱스의 결과에 가중치를 주려면 `indices_boost` 파라미터를 씁니다.[^es-multi-search]

아래는 두 인덱스에서 게시된 문서만 골라 질의 벡터와의 코사인 유사도로 점수를 매기는 예입니다. 인덱스 이름과 필드 이름, 벡터 값은 예시입니다.

```http
GET /collection1,collection2/_search
{
  "query": {
    "script_score": {
      "query": {
        "bool": {
          "filter": { "term": { "status": "published" } }
        }
      },
      "script": {
        "source": "cosineSimilarity(params.query_vector, 'my_vector_field') + 1.0",
        "params": { "query_vector": [0.1, 0.2, 0.3] }
      }
    }
  }
}
```

검색 대상 인덱스는 요청 본문이 아니라 첫 줄의 경로에 적습니다. 본문의 바깥 `query`는 점수를 매길 문서를 고르고 `script`는 고른 문서마다 점수를 계산합니다.

`cosineSimilarity(...)` 뒤에 `+ 1.0`을 붙이는 이유는 점수가 음수가 될 수 없기 때문입니다. Elasticsearch 문서는 `script_score` 질의의 최종 점수가 음수일 수 없으며 검색 최적화를 위해 Lucene이 점수를 양수나 0으로 요구한다고 설명합니다.[^es-script-score] 코사인 유사도는 -1에서 1 사이의 값이므로 1.0을 더하면 0에서 2 사이로 옮겨집니다. 순위는 그대로 유지됩니다.

이 방식은 **조건에 맞는 문서를 모두 하나씩 비교**합니다. Elasticsearch 문서에 따르면 벡터 함수를 계산할 때 대상 문서를 모두 선형으로 훑으므로 질의 시간이 대상 문서 수에 비례해 늘어납니다.[^es-script-score] 이런 정확한(brute-force) kNN(k-최근접 이웃, 질의 벡터와 가장 가까운 벡터 k개를 찾는 검색) 검색은 작은 데이터셋이나 필터로 미리 좁힌 집합에 맞습니다. Elasticsearch는 지연 시간과 규모가 중요한 대부분의 운영 환경에 `knn` 섹션을 쓰는 근사(approximate) kNN 검색을 권장합니다.[^es-knn] 근사 kNN은 인덱스로 후보를 좁혀 정확도를 조금 양보하는 대신 빠르게 찾는 방식입니다.

### 다른 제품은 검색 요청이 컬렉션 하나를 받습니다

**Milvus**의 검색 요청은 컬렉션 이름 하나와 파티션 이름 목록을 받습니다. 검색 요청에 파티션 이름을 넣어 범위를 좁힐 수 있으며 검색에 참여하는 파티션 수를 줄이면 성능이 좋아집니다.[^milvus-search] 3절에서 본 것처럼 Partition·Partition key 수준으로 나눈 데이터는 여러 파티션에 걸쳐 함께 질의할 수 있습니다.[^milvus-tenancy]

**Qdrant**는 `lookup_from` 파라미터로 다른 컬렉션에 있는 point의 벡터를 질의 벡터로 가져올 수 있습니다.[^qdrant-search] 이 기능은 질의에 쓸 벡터를 빌려 오는 것이며 여러 컬렉션을 한 번에 검색하는 기능은 아닙니다. **Pinecone**의 읽기와 쓰기는 언제나 namespace 하나를 대상으로 합니다.[^pinecone-mt] **Weaviate**는 컬렉션마다 고유한 벡터 공간을 가지므로 같은 객체라도 컬렉션마다 다른 임베딩을 가질 수 있습니다.[^weaviate-data]

**함께 검색할 일이 잦은 데이터라면 처음부터 한 컬렉션 안에서 파티션·테넌트·메타데이터로 나누는 편**이 낫습니다. 이렇게 하면 앞에서 본 제품별 검색 범위 제약을 피할 수 있습니다. 컬렉션을 나누는 결정은 “이 데이터를 함께 검색할 일이 있는가”를 먼저 물은 뒤에 내립니다.

### 벡터 공간이 일관돼야 합니다

여러 컬렉션을 함께 검색할 수 있더라도 점수를 서로 비교하려면 **벡터 공간의 일관성(consistent vector space)**이 필요합니다. 서로 다른 항목을 벡터로 바꿀 때 차원 수를 같게 하고 의미 해석도 같게 맞춰야 한다는 뜻입니다. 같은 모델로, 같은 방식으로 벡터화해야 두 벡터의 거리가 의미를 가집니다.

| 맞출 것 | 예 | 어긋나면 |
| --- | --- | --- |
| 차원 수 | BERT-base로 만든 벡터는 모두 768차원 | 같은 벡터 필드에 넣을 수 없음 |
| 임베딩 모델과 버전 | 모든 컬렉션에 같은 모델 체크포인트 사용 | 값은 들어가도 거리를 비교하는 의미가 없음 |
| 전처리 | 토크나이징·텍스트 정규화·청크 분할 방식 | 같은 내용이 다른 벡터가 됨 |
| 거리 측정과 정규화 | 모두 코사인, 또는 모두 단위 벡터 + 내적 | 점수의 척도가 달라 순위를 합칠 수 없음 |

차원은 모델 구조가 정합니다. BERT 논문에서 BERT-base는 층 12개, 은닉 크기(hidden size) 768, 어텐션 헤드 12개, 파라미터 1억 1,000만 개이고 BERT-large는 은닉 크기가 1024입니다.[^bert] Hugging Face의 `bert-base-uncased` 설정 파일에도 `"hidden_size": 768`이 적혀 있습니다.[^bert] 따라서 BERT-base로 만든 임베딩은 768차원이고 컬렉션의 벡터 필드도 768차원으로 맞춰야 합니다.

### 차원은 컬렉션을 만들 때 정해집니다

대부분의 제품은 컬렉션이나 벡터 필드를 정의할 때 차원을 고정합니다.

- **Qdrant:** 같은 컬렉션 안의 모든 벡터는 같은 차원을 가지며 컬렉션 설정에서 벡터 크기가 고정됩니다.[^qdrant-collections][^qdrant-vectors]
- **Milvus:** 벡터 필드의 `dim`으로 차원을 정합니다.[^milvus-schema] 컬렉션을 만든 뒤 바꿀 수 있는 필드 속성은 VarChar의 `max_length`, Array의 `max_capacity`, `mmap.enabled`이며 기본 키 필드는 생성 후 바꿀 수 없습니다.[^milvus-alter]
- **pgvector:** `vector(768)`처럼 열 타입에 차원을 씁니다. 차원 없는 `vector` 열도 만들 수 있지만 인덱스는 차원이 같은 행에만 만들 수 있습니다(표현식·부분 인덱스 사용). `vector` 타입은 16,000차원까지 저장하고 HNSW·IVFFlat 인덱스는 2,000차원까지 지원합니다.[^pgvector]
- **Elasticsearch:** `dense_vector` 필드에 `dims`를 지정하지 않으면 처음 추가한 벡터의 길이로 정해집니다.[^es-dense-vector] 기존 필드의 타입은 바꿀 수 없으며 원하는 매핑으로 새 인덱스를 만들어 데이터를 재색인(reindex)해야 합니다.[^es-mapping]
- **Pinecone:** 인덱스를 만들 때 차원과 거리 측정을 지정하며 차원은 임베딩 모델의 출력에 맞춥니다. 예를 들어 `multilingual-e5-large`는 1024차원입니다.[^pinecone-index]

### 임베딩 모델을 바꾸면 다시 색인합니다

벡터 값은 그 벡터를 만든 모델의 공간 안에서 의미를 가집니다. CLIP이 텍스트와 이미지를 한 공간에 놓기 위해 두 인코더를 함께 학습한 것도 이 때문입니다(5절). 따로 학습한 모델이 만든 벡터는 차원이 우연히 같더라도 같은 공간에 있다고 볼 수 없습니다. 임베딩 모델을 바꾸면 기존 데이터를 새 모델로 다시 임베딩해야 합니다.

제품 문서도 이 작업을 새 컬렉션을 만드는 방식으로 안내합니다. Weaviate 문서에는 vectorizer를 바꿀 수 없으며 새 컬렉션을 만들어 데이터를 옮기라고 나와 있습니다. `distance`나 `efConstruction` 같은 변경 불가 설정도 같은 방법으로 바꿉니다.[^weaviate-config] Elasticsearch에서는 앞 소절(차원은 컬렉션을 만들 때 정해집니다)에서 설명한 재색인 절차를 따릅니다.[^es-mapping] alias를 쓰면 새 인덱스로 검색 대상을 바꾸는 작업을 중단 없이 할 수 있습니다.[^es-alias]

### 거리 측정과 정규화도 맞춥니다

같은 모델로 만든 벡터라도 거리 측정이 다르면 점수의 척도가 달라집니다. 벡터를 단위 길이로 맞추는 정규화(normalization)는 코사인 유사도와 내적의 관계를 바꿉니다.

- **Qdrant:** 코사인 거리를 쓰면 벡터를 컬렉션에 넣을 때 한 번 정규화하고 비교할 때는 내적으로 계산합니다. 문서에 따르면 내적은 SIMD(한 명령으로 여러 값을 동시에 계산하는 CPU 기능) 덕분에 매우 빠른 연산입니다.[^qdrant-search]
- **Milvus:** 실수 벡터에 L2·IP(내적)·COSINE을 지원합니다. 정규화한 임베딩에 IP를 쓰면 코사인 유사도를 계산한 것과 같습니다.[^milvus-metric]
- **Elasticsearch:** `dot_product`는 float 벡터일 때 문서와 질의 벡터가 모두 단위 길이여야 합니다. `cosine`은 색인할 때 벡터를 자동으로 단위 길이로 정규화합니다. `max_inner_product`는 정규화를 요구하지 않습니다.[^es-dense-vector]
- **pgvector:** `<->`는 L2 거리, `<#>`는 내적, `<=>`는 코사인 거리입니다. PostgreSQL 인덱스 스캔이 오름차순만 지원하므로 `<#>`는 내적에 음수를 붙여 돌려줍니다. 벡터가 길이 1로 정규화돼 있다면 내적을 쓰는 것이 성능상 가장 좋습니다.[^pgvector]
- **Pinecone:** `euclidean`·`cosine`·`dotproduct` 중에서 임베딩 모델을 학습할 때 쓴 거리 측정을 고르라고 안내합니다.[^pinecone-index]

## 8. 컬렉션을 나누는 것과 샤드를 나누는 것은 무엇이 다를까요

컬렉션을 날짜별로 나누고 그 안을 다시 주제별로 나누는 그림을 그리다 보면 컬렉션 분리와 샤드 분할을 같은 도구로 생각하기 쉽습니다. 두 가지는 목적이 다릅니다.

| 구분 | 컬렉션 분리 | 컬렉션 안의 샤드 |
| --- | --- | --- |
| 나누는 것 | 스키마·모델·권한·생명주기가 다른 데이터 | 한 컬렉션 데이터의 수평 조각 |
| 목적 | 성격이 다른 데이터를 따로 관리 | 한 컬렉션을 여러 노드에 나눠 확장 |
| 개수를 정하는 시점 | 필요할 때 생성 | 대개 컬렉션(인덱스)을 만들 때 |
| 늘릴 때의 부담 | 컬렉션마다 리소스 오버헤드, 관리 대상 증가 | 제품별 상한(Milvus 16, Elasticsearch 1,024) |

**Milvus**에서 샤드는 컬렉션의 수평 조각이며 샤드마다 데이터 입력 채널이 하나씩 대응합니다. 기본값은 1개이고 컬렉션을 만들 때 지정합니다. 파라미터 이름은 SDK마다 달라 Python은 `num_shards`, Node.js는 `shards_num`, Java는 `numShards`입니다. 문서는 엔티티 2억 개마다 샤드 하나를 두는 것이 일반적이고 stream node가 여러 대라면 샤드를 여러 개 쓰라고 권합니다.[^milvus-create] 컬렉션당 샤드는 최대 16개입니다.[^milvus-limits]

**Qdrant**는 수평 확장을 위해 컬렉션의 point를 여러 샤드에 분산합니다. `shard_number`를 지정하지 않으면 컬렉션을 만들 때의 클러스터 노드 수로 정해집니다. Qdrant Cloud에서는 리샤딩으로 기존 컬렉션의 샤드 수를 바꿀 수 있고 셀프 호스팅에서는 컬렉션을 다시 만들어야 합니다.[^qdrant-distributed]

**Elasticsearch**의 `index.number_of_shards`는 인덱스의 primary 샤드 수입니다. 기본값은 1이며 인덱스를 만들 때만 설정할 수 있습니다. 클러스터를 불안정하게 만드는 실수를 막기 위해 인덱스당 1,024개로 제한합니다. 복제본 수 `index.number_of_replicas`는 운영 중에 바꿀 수 있는 동적 설정이며 기본값은 1입니다.[^es-shards]

### 주제별로 데이터를 모으고 싶다면

“날짜별 컬렉션 안에 스포츠 기사는 샤드 1, 경제 기사는 샤드 2”처럼 샤드를 주제에 맞춰 나누고 싶을 수 있습니다. 하지만 샤드 수 설정은 데이터를 어떤 값으로 모을지를 정하는 기능이 아닙니다. 특정 값으로 데이터를 물리적으로 모으는 기능은 따로 있습니다.

- **Milvus partition key:** 파티션 키 값에 따라 데이터를 물리적으로 분리된 파티션에 자동으로 나눠 넣습니다.[^milvus-tenancy]
- **Qdrant `is_tenant`:** 같은 테넌트 값을 가진 벡터를 저장소에서 가까이 모읍니다.[^qdrant-multitenancy]
- **Qdrant user-defined sharding:** 테넌트별로 샤드를 지정하는 방식입니다. 작은 테넌트는 공유 샤드에 두고 커지면 전용 샤드로 옮기는 tiered multitenancy도 안내합니다.[^qdrant-multitenancy]

뉴스 예제라면 주제는 partition key나 테넌트 값으로 나누고 샤드 수는 전체 데이터 양과 노드 수에 맞춰 따로 정하는 구성이 각 기능의 목적에 맞습니다.

## 정리

벡터 DB의 레코드는 ID·벡터·원문·메타데이터로 이루어지고 컬렉션은 RDB의 테이블에 해당합니다. 컬렉션을 나누는 기준도 RDB와 비슷하게 데이터의 크기, 접근 패턴, 생명주기, 속성, 운영 용이성입니다. 다만 공식 문서는 컬렉션을 늘리기보다 파티션·테넌트·namespace·메타데이터 필터로 나누는 방법을 먼저 안내합니다. 컬렉션은 스키마나 임베딩 모델, 권한이 다를 때 나누는 무거운 경계로 두는 편이 좋습니다.

자기 서비스에 적용할 때는 아래 질문을 차례로 확인해 봅니다.

| 확인할 질문 | “예”라면 | 참고 |
| --- | --- | --- |
| 임베딩 모델·차원·거리 측정이 데이터마다 다른가 | 컬렉션(또는 named vector)을 나눔 | 5·7절 |
| DB 수준의 접근 권한 분리가 필요한가 | 컬렉션이나 데이터베이스를 나눔 | 3절 |
| 데이터를 함께 검색할 일이 잦은가 | 한 컬렉션에 두고 파티션·테넌트·필터로 나눔 | 3·7절 |
| 테넌트·업무 단위로 검색 범위를 나눠야 하는가 | 파티션·partition key·테넌트·namespace를 검토 | 3·4절 |
| 기간이 지나면 지워야 하는 데이터인가 | data stream·TTL·필터 삭제를 먼저 검토 | 6절 |
| 한 컬렉션이 노드 하나에 담기지 않을 만큼 큰가 | 샤드 수를 늘림(생성 시점에 정하는 제품이 많음) | 8절 |
| 컬렉션 수가 계속 늘어나는 설계인가 | 자동화 계획을 세우거나, 더 가벼운 분리 수단으로 바꿈 | 3·6절 |
| 임베딩 모델을 바꿀 계획이 있는가 | 새 컬렉션에 다시 임베딩하고 alias 등으로 전환 | 7절 |

어느 구성이 나은지는 데이터를 저장하고 쓰는 방식에 따라 달라집니다. 후보 구성을 작게 만들어 실제 질의로 결과 품질, 응답 시간, 정리 작업을 비교해 봅니다.

## 참고 자료

[^chroma]: [Chroma — Manage Collections](https://docs.trychroma.com/docs/collections/manage-collections), [Chroma — Add Data](https://docs.trychroma.com/docs/collections/add-data). 저장·질의의 기본 단위인 컬렉션, 컬렉션별 임베딩 함수, 레코드의 `id`·`documents`·`embeddings`·`metadatas`.
[^chroma-delete]: [Chroma — Delete Data](https://docs.trychroma.com/docs/collections/delete-data). `id`·`where` 필터 삭제와 되돌릴 수 없는 삭제.
[^qdrant-collections]: [Qdrant — Collections](https://qdrant.tech/documentation/concepts/collections/). 컬렉션 정의, 컬렉션 안 벡터의 같은 차원·거리 측정, payload 기반 분할 권고와 다중 컬렉션의 오버헤드, `shard_number`.
[^qdrant-points]: [Qdrant — Points](https://qdrant.tech/documentation/manage-data/points/). point의 구성과 ID 형식, named vector 입력, 필터 삭제 요청.
[^qdrant-vectors]: [Qdrant — Vectors](https://qdrant.tech/documentation/manage-data/vectors/). named vectors, dense·sparse·multivector, 컬렉션 설정의 고정 벡터 크기.
[^qdrant-multitenancy]: [Qdrant — Multitenancy](https://qdrant.tech/documentation/guides/multitenancy/). 테넌트별 컬렉션의 비효율, `is_tenant`, user-defined sharding과 tiered multitenancy.
[^qdrant-search]: [Qdrant — Search](https://qdrant.tech/documentation/search/search/). `lookup_from`, 코사인 거리의 정규화와 내적 계산.
[^qdrant-distributed]: [Qdrant — Distributed Deployment](https://qdrant.tech/documentation/scaling/distributed_deployment/). 샤드 분산, `shard_number` 기본값, Cloud 리샤딩.
[^milvus-collection]: [Milvus — Collection Explained](https://milvus.io/docs/manage-collections.md). v3.0.x. 2차원 표로서의 컬렉션, 엔티티·필드·기본 키.
[^milvus-database]: [Milvus — Database](https://milvus.io/docs/manage_databases.md). v3.0.x. 논리 단위로서의 데이터베이스와 기본 데이터베이스.
[^milvus-schema]: [Milvus — Schema Explained](https://milvus.io/docs/schema.md). v3.0.x. 스키마 구성, 기본 키 필드 타입, 벡터 필드의 `dim`.
[^milvus-dynamic]: [Milvus — Dynamic Field](https://milvus.io/docs/enable-dynamic-field.md). v3.0.x. `$meta` 예약 필드와 `enable_dynamic_field`.
[^milvus-tenancy]: [Milvus — Implement Multi-tenancy](https://milvus.io/docs/multi_tenancy.md). v3.0.x. Database·Collection·Partition·Partition key 수준의 상한·격리·성능 비교와 파티션 간 질의.
[^milvus-limits]: [Milvus — Milvus Limits](https://milvus.io/docs/limitations.md). v3.0.x. 클러스터당 컬렉션, 컬렉션당 파티션·샤드 상한.
[^milvus-ttl]: [Milvus — Set Collection TTL](https://milvus.io/docs/set-collection-ttl.md). v3.0.x. 엔티티 자동 만료, compaction 시점의 물리 삭제, `collection.ttl.seconds`.
[^milvus-search]: [Milvus — Basic Vector Search](https://milvus.io/docs/single-vector-search.md). v3.0.x. 검색 요청의 컬렉션·파티션 지정과 파티션 수에 따른 성능.
[^milvus-hybrid]: [Milvus — Multi-Vector Hybrid Search](https://milvus.io/docs/multi-vector-search.md). v3.0.x. 여러 벡터 필드를 함께 검색하는 하이브리드 검색과 RRF·Weighted Ranker.
[^milvus-alter]: [Milvus — Alter Collection Field](https://milvus.io/docs/alter-collection-field.md). v3.0.x. 생성 후 변경할 수 있는 필드 속성과 기본 키 필드의 변경 제한.
[^milvus-metric]: [Milvus — Metric Types](https://milvus.io/docs/metric.md). v3.0.x. L2·IP·COSINE과 정규화 벡터에서 IP와 코사인의 관계.
[^milvus-create]: [Milvus — Create Collection](https://milvus.io/docs/create-collection.md). v3.0.x. 샤드의 정의와 기본값, SDK별 파라미터 이름, 샤드 수 권고.
[^weaviate-data]: [Weaviate — Data Structure](https://docs.weaviate.io/weaviate/concepts/data). 컬렉션과 객체, UUID, 컬렉션별 벡터 공간, named vectors, 테넌트별 벡터 인덱스와 테넌트 상태.
[^weaviate-mt]: [Weaviate — Multi-tenancy Operations](https://docs.weaviate.io/weaviate/manage-collections/multi-tenancy). 테넌트별 샤드와 데이터 분리.
[^weaviate-config]: [Weaviate — Collection Definition](https://docs.weaviate.io/weaviate/config-refs/collections). 변경 불가 설정(vectorizer·`distance`·`efConstruction`)과 새 컬렉션으로의 이전, named vector 추가.
[^weaviate-ttl]: [Weaviate — Time-to-Live](https://docs.weaviate.io/weaviate/manage-collections/time-to-live), [Weaviate — Delete Objects](https://docs.weaviate.io/weaviate/manage-objects/delete). 컬렉션 수준 TTL, 백그라운드 삭제, `where` 필터 삭제와 `QUERY_MAXIMUM_RESULTS`.
[^pinecone-concepts]: [Pinecone — Concepts](https://docs.pinecone.io/guides/get-started/concepts). API 버전 2026-07. 프로젝트·인덱스·namespace·레코드·메타데이터·sparse 벡터.
[^pinecone-mt]: [Pinecone — Implement Multitenancy](https://docs.pinecone.io/guides/index-data/implement-multitenancy). API 버전 2026-07. 테넌트별 namespace, 단일 namespace 읽기·쓰기, namespace 삭제, 요금제별 namespace 수, 메타데이터 필터 방식의 비용.
[^pinecone-delete]: [Pinecone — Delete Records](https://docs.pinecone.io/guides/manage-data/delete-data). API 버전 2026-07. ID·메타데이터 필터·namespace 단위 삭제.
[^pinecone-index]: [Pinecone — Create an Index](https://docs.pinecone.io/guides/index-data/create-an-index). API 버전 2026-07. 인덱스의 차원·거리 측정 지정과 임베딩 모델과의 일치.
[^pgvector]: [pgvector — README](https://github.com/pgvector/pgvector). 0.8.7. `vector(n)` 열, 거리 연산자, 저장·인덱스 차원 상한, 차원 없는 열의 인덱스 제한, 정규화 벡터의 내적.
[^es-dense-vector]: [Elasticsearch — Dense Vector Field Type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/dense-vector). `dense_vector`, `dims` 기본 동작, `dot_product`·`cosine`·`max_inner_product`의 정규화 조건.
[^es-data-stream]: [Elasticsearch — Data Streams](https://www.elastic.co/docs/manage-data/data-store/data-streams). 백킹 인덱스, `@timestamp`, rollover와 백킹 인덱스 이름, ILM, 적합한 데이터.
[^es-rollover]: [Elasticsearch — Rollover](https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management/rollover). 한 인덱스에 계속 쓸 때의 문제와 크기·나이·문서 수 조건.
[^es-ilm]: [Elasticsearch — Index Lifecycle](https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management/index-lifecycle). Hot부터 Delete까지의 단계와 단계 이동 조건.
[^es-alias]: [Elasticsearch — Aliases](https://www.elastic.co/docs/manage-data/data-store/aliases). 여러 인덱스를 가리키는 alias, `is_write_index`, 중단 없는 인덱스 교체.
[^es-multi-search]: [Elasticsearch — Search Multiple Data Streams and Indices](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-multiple-data-streams-indices). 경로의 쉼표 나열, 인덱스 패턴, `indices_boost`.
[^es-search-api]: [Elasticsearch — Search API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-search). 경로 파라미터 `index`의 와일드카드·`_all`.
[^es-script-score]: [Elasticsearch — Script Score Query](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-script-score-query). `cosineSimilarity` 예제, 음수가 될 수 없는 점수, 벡터 함수의 선형 스캔.
[^es-knn]: [Elasticsearch — kNN Search](https://www.elastic.co/docs/solutions/search/vector/knn). 정확한 kNN과 근사 kNN의 쓰임.
[^es-mapping]: [Elasticsearch — Update Mappings Examples](https://www.elastic.co/docs/manage-data/data-store/mapping/update-mappings-examples). 기존 필드 타입 변경 불가와 새 인덱스로의 재색인.
[^es-shards]: [Elasticsearch — Index Modules](https://www.elastic.co/docs/reference/elasticsearch/index-settings/index-modules). `index.number_of_shards`·`index.number_of_replicas`의 기본값과 인덱스당 샤드 상한.
[^clip]: [Radford 외 — Learning Transferable Visual Models From Natural Language Supervision](https://arxiv.org/abs/2103.00020). 2021. 이미지·텍스트 인코더의 공동 학습과 멀티모달 임베딩 공간, 자연어를 이용한 zero-shot 전이.
[^bert]: [Devlin 외 — BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding](https://arxiv.org/abs/1810.04805), [google-research/bert](https://github.com/google-research/bert), [Hugging Face — bert-base-uncased config.json](https://huggingface.co/google-bert/bert-base-uncased/blob/main/config.json). BERT-base·BERT-large의 층 수·은닉 크기·파라미터 수.
