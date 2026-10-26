---
date: 2026-10-27 00:00:00 +0900
title: "메타데이터는 어떻게 설계할까: 필터와 권한부터 필드 표준까지"
category: ai/ml
excerpt: "벡터 DB 레코드에 붙이는 메타데이터로 검색 범위를 좁히고, 권한을 거르고, 출처를 추적하는 방법을 정리합니다. 필터가 벡터 검색의 앞·중간·뒤 어디에 걸리는지에 따라 달라지는 결과, 필터 필드의 인덱스와 타입 제약, 필드 이름과 값의 표준을 공식 문서에 근거해 작은 예제와 함께 다룹니다."
last_modified_at: 2026-10-27
series: "벡터 DB"
series_index: "6 / 6"
---

**시리즈** · [1. 개념과 제품·사용 지표](/writing/vector-database-overview/) · [2. 선택 기준과 기능 비교](/writing/vector-database-selection/) · [3. AWS 전용 벡터 검색](/writing/aws-vector-search/) · [4. 스키마와 컬렉션 설계](/writing/vector-database-schema-design/) · [5. 벡터 구조와 청킹 전략](/writing/vector-database-vector-design/) · **6. 메타데이터 설계**

[5편](/writing/vector-database-vector-design/)에서 사내 문서를 청크로 잘라 벡터로 만들었습니다. 이제 서비스를 열었더니 이런 일이 생깁니다. 인사팀 직원이 “연차휴가 이월 규정”을 물었는데 검색 결과에 3년 전 개정 이전의 취업규칙과 영업팀 회의록이 함께 나옵니다. 벡터만 보면 모두 “연차휴가”와 가까운 문장이기 때문입니다. 더 곤란한 경우도 있습니다. 일반 직원의 질문에 인사 평가 결과가 담긴 문서가 답변 근거로 올라오는 것입니다.

벡터는 문장의 뜻이 얼마나 가까운지만 알려 줍니다. 이 문서가 지금 유효한지, 어느 부서의 문서인지, 질문한 사람이 볼 수 있는 문서인지는 벡터에 들어 있지 않습니다. 그 정보를 담는 곳이 레코드의 **메타데이터**입니다. [4편](/writing/vector-database-schema-design/)에서 레코드가 ID·벡터·원문·메타데이터로 이루어진다고 정리했는데, 이 글은 그중 메타데이터를 어떻게 설계할지를 다룹니다.

**이 글에서 알 수 있는 것**

- 메타데이터가 하는 일: 검색 범위 좁히기, 접근 권한 거르기, 출처와 버전 추적하기
- 필터가 벡터 검색의 앞·중간·뒤 어디에 적용되는지와, 그에 따라 결과 개수가 모자랄 수 있는 이유
- 필터에 쓰는 필드에 인덱스를 만드는 방법과 제품별 타입·크기 제약
- 메타데이터로 권한을 거를 때 지켜야 할 원칙
- 필드 이름과 값의 표준이 없을 때 생기는 문제와, 표준을 지키게 하는 방법

이 글의 문서 조사 기준일은 2026년 10월 27일입니다. pgvector는 0.8.7, Milvus는 v3.0.x, PostgreSQL은 18 문서를 기준으로 합니다. 예제에 쓴 문서·데이터·숫자는 설명을 위해 만든 것입니다.

## 1. 먼저 알아 둘 용어는 무엇일까요

메타데이터·테넌트·멀티테넌시는 [4편의 용어 표](/writing/vector-database-schema-design/)에서, 청크와 부모-자식 검색은 [5편](/writing/vector-database-vector-design/)에서 정리했습니다. 이 글에서 새로 자주 나오는 용어는 다음과 같습니다.

| 용어 | 쉬운 설명 |
| --- | --- |
| 메타데이터 필터 | 메타데이터 조건으로 검색 대상을 제한하는 것입니다. “`department`가 `hr`인 청크 중에서 찾아라” 같은 조건입니다. |
| 통과 비율 | 전체 레코드 가운데 필터 조건을 만족하는 레코드의 비율입니다. 10만 개 중 2,000개가 조건에 맞으면 2%입니다. |
| HNSW(Hierarchical Navigable Small World) | 벡터를 이웃끼리 그래프로 이어 두고, 그래프를 따라가며 가까운 벡터를 빠르게 찾는 근사 인덱스입니다. 근사 인덱스는 속도를 위해 모든 벡터와 거리를 재지 않습니다. |
| 사전 필터(pre-filtering) | 조건에 맞는 후보 목록을 먼저 만들고 그 안에서만 벡터 검색을 하는 방식입니다. |
| 사후 필터(post-filtering) | 벡터 검색으로 상위 후보를 먼저 뽑은 뒤 조건에 맞지 않는 것을 버리는 방식입니다. |
| 탐색 중 필터 | 인덱스 그래프를 따라가는 동안 조건에 맞는 레코드만 결과로 모으는 방식입니다. |
| 스칼라 인덱스 | 벡터가 아닌 필드(숫자·문자열·날짜 등)에 만드는 인덱스입니다. Qdrant는 메타데이터에 해당하는 payload 필드의 인덱스를 payload 인덱스라고 부릅니다. |
| ACL | 접근 제어 목록(Access Control List)입니다. 어떤 사용자나 그룹이 이 문서를 볼 수 있는지 적은 목록입니다. |
| 통제 어휘 | 한 필드에 들어갈 수 있는 값을 미리 정해 둔 목록입니다. 부서 필드라면 `hr`, `sales`, `finance`만 허용하는 식입니다. |
| RFC 3339 | 인터넷 프로토콜에서 쓰는 날짜·시각 표기 규격입니다. ISO 8601을 좁혀 정한 형태이고 `2026-03-01T09:00:00+09:00`처럼 씁니다. |

## 2. 메타데이터는 무엇에 쓸까요

메타데이터는 벡터에 담기지 않는 사실을 레코드에 붙여 둔 것입니다. 하는 일은 크게 세 가지입니다.

- **검색 범위 좁히기:** 부서, 문서 종류, 시행일, 언어 같은 조건으로 검색 대상을 줄입니다.
- **접근 권한 거르기:** 문서를 볼 수 있는 그룹이나 보안 등급을 적어 두고 질문한 사람이 볼 수 없는 청크를 결과에서 뺍니다.
- **출처와 버전 추적하기:** 청크가 어느 원문의 몇 번째 조각인지, 언제 어떤 설정으로 만들었는지 남깁니다. 답변의 근거를 보여 주고 다시 만들 범위를 고르는 데 씁니다.

사내 문서 검색 서비스의 청크 하나에 메타데이터를 붙이면 다음과 같습니다. 특정 제품의 API 형식이 아니라 구성을 보이기 위한 예시입니다.

```json
{
  "id": "hr-rules#0012",
  "text": "연차휴가는 1년간 80% 이상 출근한 근로자에게 15일을 부여합니다. …",
  "vector": [0.021, -0.113, 0.087],
  "metadata": {
    "doc_id": "hr-rules",
    "chunk_index": 12,
    "title": "취업규칙",
    "department": "hr",
    "doc_type": "policy",
    "effective_date": "2026-03-01",
    "updated_at": "2026-02-20T09:00:00+09:00",
    "acl_groups": ["all-employees"],
    "source_url": "https://wiki.example.com/hr/rules",
    "embedding_model": "intfloat/multilingual-e5-large"
  }
}
```

`department`·`doc_type`·`effective_date`는 범위를 좁히는 데, `acl_groups`는 권한을 거르는 데, `doc_id`·`chunk_index`·`source_url`·`updated_at`·`embedding_model`은 추적하는 데 씁니다. 벡터 값은 길이를 줄여 적었습니다.

## 3. 필터를 걸면 검색 결과는 어떻게 달라질까요

필터 없이 검색하면 컬렉션의 모든 청크가 후보입니다. 문서가 많아질수록 질문과 뜻은 비슷하지만 답이 없는 청크도 늘어나기 쉽습니다. 이 글 첫머리의 연차휴가 예처럼 개정 전 취업규칙과 다른 부서 회의록이 상위 결과를 차지하면 정작 필요한 조항이 밀려납니다.

인덱스 규모와 검색 품질의 관계를 다룬 연구가 있습니다. Reimers와 Gurevych는 인덱스에 넣은 문서 수가 늘어날 때 dense 검색(5편에서 다룬 dense 벡터로 하는 검색)의 성능이 sparse 검색(BM25처럼 단어 일치를 기준으로 하는 검색)보다 빠르게 떨어진다는 것을 이론과 실험으로 보였습니다. 벡터 차원이 낮을수록 관계없는 문서를 돌려줄(false positive) 가능성이 커진다고도 적었습니다.[^dense-index-size] 검색 결과를 받아 답을 만드는 단계에서는 Cuconasu 등이 검색 점수는 높지만 답을 담고 있지 않은 문서가 LLM의 답변 품질을 떨어뜨린다고 보고했습니다.[^power-of-noise]

메타데이터 필터는 후보 자체를 줄입니다. “인사팀 문서 중에서, 지금 시행 중인 것만”이라는 조건을 걸면 다른 부서 문서와 지난 판은 처음부터 후보에 들어오지 않습니다. 그 안에서 벡터 검색으로 뜻이 가까운 청크를 고릅니다.

{% include diagram.html src="vmeta-filter-then-search.svg" caption="필터로 후보를 줄인 뒤 그 안에서 뜻이 가까운 청크를 고릅니다" %}

다만 “필터를 먼저 건다”는 그림은 논리적인 순서입니다. 실제 엔진이 필터를 인덱스 탐색의 앞·중간·뒤 중 어디에서 적용하는지는 제품마다 다르고 그 차이가 결과 개수와 속도를 바꿉니다.

## 4. 필터는 검색의 어느 단계에 적용될까요

### 세 가지 적용 방식

**사후 필터**는 벡터 검색으로 상위 후보를 뽑은 다음 조건에 맞지 않는 것을 버립니다. 구현은 단순하지만 몇 개가 남을지 미리 알 수 없습니다. Weaviate 문서는 조건이 아주 까다로워 전체의 작은 비율만 통과한다면 처음 뽑은 후보 안에 조건에 맞는 것이 하나도 없을 수 있다고 설명합니다.[^weaviate-filtering]

**사전 필터**는 조건에 맞는 레코드의 목록(allow list)을 먼저 만들고 그 안에서만 검색합니다. Weaviate는 각 샤드(데이터를 나눠 저장하는 단위)에 HNSW 인덱스와 함께 역색인(inverted index)을 두고, 역색인으로 조건에 맞는 ID 목록을 만듭니다.[^weaviate-filtering] Milvus의 기본 필터 검색도 조건에 맞는 엔티티를 먼저 거른 뒤 그 안에서 근사 검색(ANN)을 합니다.[^milvus-filtered]

**탐색 중 필터**는 그래프를 따라가며 조건에 맞는 레코드만 결과로 모읍니다. 조건에 맞지 않는 노드가 많으면 그래프의 길이 끊긴 것처럼 되어 탐색이 어려워집니다. Qdrant는 필터에 쓰는 payload 값을 기준으로 HNSW 그래프에 간선을 더 이어 이 문제를 줄입니다.[^qdrant-indexing] Weaviate와 Qdrant가 쓰는 ACORN 계열 방식은 바로 옆 이웃이 조건에 맞지 않으면 이웃의 이웃까지 살펴봅니다.[^weaviate-filtering][^qdrant-search] ACORN 논문은 같은 recall(정답 가운데 실제로 찾아낸 비율)에서 기존 방법보다 처리량이 2~1,000배 높다고 보고했습니다.[^acorn]

{% include diagram.html src="vmeta-filter-timing.svg" caption="사후·사전·탐색 중 필터는 조건을 거는 시점이 다릅니다" %}

### 사후 필터에서 결과가 모자라는 이유

계산해 보면 사후 필터의 약점이 분명해집니다. pgvector는 근사 인덱스를 쓸 때 인덱스를 훑은 **뒤에** 필터를 적용합니다. README는 조건이 전체 행의 10%에 맞고 HNSW의 `hnsw.ef_search`가 기본값 40이면 평균 4행만 조건에 맞는다고 설명합니다.[^pgvector] 인덱스가 후보 40개를 내놓고, 그중 10%가 조건을 통과하는 셈입니다.

사내 문서 컬렉션에 청크가 10만 개 있고 그중 인사팀 문서가 2,000개라고 가정해 봅시다. 통과 비율은 2%입니다.

```text
인덱스가 내놓는 후보 수(ef_search 기본값)   40개
조건 통과 비율                              2,000 / 100,000 = 2%
조건에 맞을 것으로 기대되는 후보 수         40 × 0.02 = 0.8개
```

`LIMIT 5`로 5개를 요청해도 평균 1개도 돌아오지 않습니다. 통과 비율이 낮은 조건일수록 결과가 비거나 모자랄 가능성이 커집니다. 이 계산은 후보가 조건과 무관하게 섞여 있다고 가정한 것입니다. 실제로는 질문과 비슷한 청크가 특정 부서에 몰려 있을 수 있어 결과가 이보다 많거나 적을 수 있습니다.

pgvector는 0.8.0부터 이 문제를 줄이는 iterative index scan을 제공합니다. 결과가 충분히 모일 때까지 인덱스를 자동으로 더 훑습니다.[^pgvector] 정렬을 엄격하게 지키는 `strict_order`와, 거리 순서가 조금 어긋나는 대신 recall이 더 좋은 `relaxed_order`가 있습니다. HNSW에서 더 훑을 튜플 수의 상한은 `hnsw.max_scan_tuples`로 정하며 기본값은 20,000입니다.[^pgvector]

```sql
SET hnsw.iterative_scan = relaxed_order;

SELECT id, title
FROM chunks
WHERE department = 'hr'
ORDER BY embedding <=> '[0.021,-0.113,0.087]'
LIMIT 5;
```

`<=>`는 pgvector의 코사인 거리 연산자이고, `embedding` 컬럼에 코사인 거리용 HNSW 인덱스(`vector_cosine_ops`)가 있다고 가정한 예입니다.

README는 필터 컬럼에 일반 인덱스를 만드는 것부터 시작하라고 권합니다. 값의 종류가 몇 개뿐이면 그 값마다 HNSW 부분 인덱스(partial index)를, 값의 종류가 많으면 테이블 파티셔닝을 검토하라고 안내합니다.[^pgvector]

### 반대로 통과 비율이 너무 낮을 때

사전 필터와 탐색 중 필터에도 약점이 있습니다. 조건을 통과하는 레코드가 아주 적으면 HNSW 탐색은 조건에 맞는 노드를 찾아 그래프를 거의 다 돌게 됩니다.[^weaviate-filtering] 이럴 때는 남은 레코드와 모두 거리를 재는 편이 빠릅니다. 인사팀 문서 2,000개라면 거리 계산 2,000번으로 정확한 결과를 얻습니다.

그래서 엔진은 통과하는 레코드 수를 보고 방식을 바꿉니다. Weaviate는 조건이 까다로우면 전수 비교(flat search)로 자동 전환하는 옵션을 두고, 그 기준값 `flatSearchCutoff`의 기본값은 40000입니다.[^weaviate-filtering][^weaviate-vector-index] Qdrant의 쿼리 플래너는 조건을 만족할 것으로 추정되는 레코드 수가 임계값보다 작으면 HNSW 대신 전체 스캔을 씁니다.[^qdrant-indexing] Qdrant 문서는 통과 비율이 높은 필터는 HNSW를 그대로 쓰면 되고, 낮은 필터는 payload 인덱스로 후보를 찾아 다시 점수를 매기면 된다고 설명합니다. 어려운 것은 그 중간이라고 합니다.[^qdrant-indexing]

### 제품별로 정리하면

| 제품 | 필터 적용 방식 | 조정 방법 |
| --- | --- | --- |
| pgvector | 근사 인덱스 스캔 뒤 | iterative index scan(0.8.0+), 필터 컬럼 인덱스·부분 인덱스·파티셔닝 |
| Elasticsearch | kNN의 `filter`는 탐색 중, `post_filter`는 탐색 뒤 | 조건은 kNN `filter`에 넣음 |
| OpenSearch | efficient filtering은 탐색 중(사전·사후 혼합) | `knn` 쿼리 안의 `filter` |
| Milvus | 조건으로 먼저 거른 뒤 ANN | 조건이 복잡해 느리면 `iterative_filter` 힌트 |
| Qdrant | payload 인덱스 기반 탐색 중 필터 | 통과 레코드가 적으면 전체 스캔으로 전환, ACORN(v1.16.0+) |
| Weaviate | 역색인으로 만든 allow list를 쓰는 사전 필터, 탐색 전략 `acorn`(v1.34+ 기본) | `filterStrategy`, `flatSearchCutoff` |

Elasticsearch는 kNN 검색의 `filter`가 근사 검색 **도중에** 적용되어 조건에 맞는 문서를 k개 돌려준다고 설명합니다. 반면 `post_filter`는 근사 검색 **뒤에** 적용되므로 k개보다 적게 돌려줄 수 있습니다.[^es-filtered-knn] OpenSearch의 Faiss 엔진은 조건에 맞는 문서가 k개 이상인데 근사 검색 결과가 k개에 못 미치면 걸러진 문서 ID를 대상으로 정확 검색을 다시 해 k개를 채웁니다.[^opensearch-efficient]

Elasticsearch 문서는 필터가 검색을 오히려 느리게 만들 수도 있다고 덧붙입니다. 조건을 만족하는 후보를 충분히 모으려면 그래프를 더 많이 탐색해야 하기 때문입니다.[^es-filtered-knn] 필터를 추가한 뒤에는 결과 개수와 응답 시간을 함께 재 봐야 합니다.

## 5. 필터에 쓰는 필드는 어떻게 준비할까요

### 필터에 쓰는 필드에는 인덱스를 만듭니다

RDB에서 `WHERE` 조건에 자주 쓰는 컬럼에 인덱스를 만들듯, 벡터 DB에서도 필터에 쓰는 메타데이터 필드에 인덱스를 만듭니다. 인덱스가 없으면 조건에 맞는 레코드를 찾느라 모든 레코드의 메타데이터를 읽어야 합니다.

- **Qdrant:** 필터 조건에 쓰는 필드에만 payload 인덱스를 만들라고 권합니다. 인덱스 타입은 `keyword`, `integer`, `float`, `bool`, `geo`, `datetime`, `text`, `uuid` 등이 있습니다.[^qdrant-indexing] 필터용 간선이 HNSW 그래프에 반영되려면 payload 인덱스를 **데이터를 넣기 전에** 만들어야 합니다. 데이터를 넣은 뒤에 만들면 HNSW 인덱스를 다시 빌드해야 새 payload 인덱스의 효과를 봅니다.[^qdrant-indexing]
- **Milvus:** 스칼라 필드에 인덱스 타입을 골라 만듭니다. INVERTED는 특정 값으로 거를 때 쓰고 모든 스칼라 타입을 지원합니다.[^milvus-inverted] BITMAP은 값의 종류(카디널리티)가 적은 필드용이고, Milvus 문서는 카디널리티가 500 미만일 때 가장 효과적이라고 적습니다.[^milvus-bitmap] STL_SORT는 숫자 필드 등의 비교 조건을 빠르게 합니다.[^milvus-stl-sort] 테넌트처럼 거의 모든 검색에 들어가는 필드는 partition key로 지정하면 Milvus가 파티션 16개를 자동으로 만듭니다. 검색할 때는 조건의 partition key 값에 해당하는 파티션만 훑습니다. partition key 필드의 값은 비어 있거나 null이면 안 됩니다.[^milvus-partition-key]
- **Weaviate:** 속성마다 일치 조건용 `indexFilterable`(기본 켜짐)과 범위 조건용 `indexRangeFilters`(기본 꺼짐, `int`·`number`·`date`만)를 설정합니다.[^weaviate-inverted] 날짜나 숫자로 범위 필터를 자주 건다면 `indexRangeFilters`를 켜 둡니다.
- **pgvector:** 메타데이터를 일반 컬럼으로 두면 B-tree 인덱스를 만들 수 있습니다.[^pgvector] `jsonb` 컬럼 하나에 메타데이터를 몰아 두는 경우에는 GIN 인덱스가 키 존재(`?`)와 포함(`@>`) 조건을 지원합니다.[^pg-jsonb]
- **Pinecone:** 기본으로 모든 메타데이터 필드를 인덱싱합니다. 메타데이터가 많으면 인덱스 빌드와 질의가 느려질 수 있어 필터에 쓰는 필드만 인덱싱하도록 지정할 수 있습니다(API `2026-07` 이상). 이 설정은 인덱스나 namespace를 만든 뒤에는 바꿀 수 없습니다.[^pinecone-metadata-indexing]

Qdrant와 Pinecone처럼 어떤 필드로 필터할지는 데이터를 넣기 전에 정해 두는 것이 좋습니다. 나중에 바꾸면 인덱스를 다시 빌드하거나 데이터를 다시 넣어야 할 수 있습니다.

### 값의 타입과 크기에는 제약이 있습니다

메타데이터에는 아무 값이나 넣을 수 있을 것 같지만 제품마다 허용하는 타입과 크기가 정해져 있습니다.

| 제품 | 값 타입 | 주요 제약 |
| --- | --- | --- |
| Pinecone | 문자열, 정수(64비트 부동소수로 변환), 부동소수, 불리언, 문자열 배열 | 레코드당 40KB, null·중첩 객체 불가, 키는 `$`·`_`로 시작 불가·64바이트 이하 |
| Chroma | 문자열, 정수, 부동소수, 불리언과 이들의 배열 | 배열 원소는 모두 같은 타입, 빈 배열 불가 |
| Milvus | BOOL, INT8~INT64, FLOAT, DOUBLE, VARCHAR, JSON, ARRAY 등 | VARCHAR 65,535바이트, JSON 필드 65,536바이트, 컬렉션당 필드 64개 |
| Qdrant | integer(64비트), float, bool, keyword, geo, datetime, uuid | datetime은 RFC 3339, 시간대가 없으면 UTC로 봄 |
| Weaviate | text, int, number, boolean, date, uuid 등과 배열 | date는 RFC 3339의 date-time 형식, 자동 스키마가 기본으로 켜져 있음 |

출처: Pinecone[^pinecone-indexing-overview][^pinecone-data-modeling], Chroma[^chroma-add-data], Milvus[^milvus-limits][^milvus-json], Qdrant[^qdrant-payload], Weaviate[^weaviate-datatypes][^weaviate-collections].

아래 세 가지는 설계에 바로 영향을 줍니다.

- **null을 쓸 수 없는 제품이 있습니다.** Pinecone은 null 값을 지원하지 않으므로 값이 없으면 키 자체를 빼라고 안내합니다.[^pinecone-indexing-overview] “값이 없음”을 필터로 찾아야 한다면 Pinecone의 `$exists` 같은 연산자나 별도의 값(`"unknown"`)을 정해 둡니다.
- **큰 정수는 정밀도를 잃을 수 있습니다.** Pinecone은 정수를 64비트 부동소수로 바꿔 저장합니다.[^pinecone-indexing-overview] Milvus는 JSON 필드를 인덱싱할 때 숫자를 double로 저장하므로 2^53을 넘는 숫자가 정밀도를 잃을 수 있다고 적습니다.[^milvus-json] 주문 번호나 사번처럼 크기를 비교하지 않는 ID는 문자열로 두는 편이 안전합니다.
- **중첩 객체를 바로 쓸 수 없는 제품이 있습니다.** Pinecone은 메타데이터가 평평한(flat) JSON 객체여야 합니다.[^pinecone-indexing-overview] `{"author": {"team": "hr"}}` 대신 `{"author_team": "hr"}`처럼 펼쳐서 넣습니다.

## 6. 메타데이터로 접근 권한을 거를 수 있을까요

### 권한도 청크마다 붙입니다

권한을 거르는 기본 방법은 청크마다 볼 수 있는 그룹을 적어 두고 검색할 때 질문한 사람의 그룹과 겹치는 청크만 남기는 것입니다. 2절 예시의 `acl_groups`가 그 필드입니다. OWASP는 LLM 애플리케이션 보안 위험 목록(Top 10 for LLM Applications 2025)에 “LLM08:2025 Vector and Embedding Weaknesses”를 두고 있습니다. OWASP는 접근 통제가 부족하면 민감한 정보가 담긴 임베딩에 권한 없는 접근이 일어나고, 여러 그룹이 한 저장소를 쓸 때 다른 그룹의 정보가 새어 나갈 수 있다고 경고합니다. 대응책으로 세밀한 접근 통제와 권한을 인식하는 벡터 저장소, 지식 베이스의 데이터에 접근 수준을 표시하고 분류하는 것을 듭니다.[^owasp-llm08]

권한은 원문 문서가 아니라 청크 단위로 있어야 합니다. 검색은 청크를 대상으로 하기 때문입니다. Azure AI Search 문서도 청크로 나눈 인덱스를 쓸 때 민감도 레이블을 청크마다 옮겨 담지 않으면 청크 단위의 결과가 걸러지지 않는다고 적습니다. 원본 시스템에서 권한을 바꾸면 그 변경은 메타데이터가 인덱스에 다시 동기화된 뒤에야 검색 결과에 반영된다는 점도 함께 밝힙니다.[^azure-doc-level] 원문의 권한이 바뀌면 그 문서의 모든 청크를 갱신하는 절차를 색인 파이프라인에 넣어 두어야 합니다.

### 권한 조건은 서버가 만듭니다

가장 중요한 원칙은 **권한 조건을 클라이언트가 보낸 값으로 만들지 않는 것**입니다. 브라우저나 앱이 “나는 hr 그룹이다”라는 필터를 보내고 서버가 그대로 검색에 넘긴다면, 사용자가 그 값을 바꿔 다른 그룹의 문서를 볼 수 있습니다. OWASP Top 10:2025의 A01(Broken Access Control)은 접근 통제가 신뢰할 수 있는 서버 측 코드나 서버리스 API, 곧 공격자가 검사나 메타데이터를 바꿀 수 없는 곳에서 구현될 때만 효과가 있다고 적습니다.[^owasp-a01]

Azure AI Search가 안내하는 security filter 방식이 이 구조를 따릅니다. 질의할 때 호출한 사람의 신원을 얻고, 그 신원(사용자나 그룹 ID)을 필터 문자열로 넣습니다.[^azure-doc-level] Azure의 security filter 패턴 문서는 이 방식에서 필터 값이 문자열 비교일 뿐 그 자체로 인증이나 권한 부여를 하지 않는다고 강조합니다.[^azure-security-trimming] 그룹 ID를 믿을 수 있는지는 그 값을 만드는 서버의 인증에 달려 있다는 뜻입니다.

{% include diagram.html src="vmeta-acl-filter.svg" caption="서버가 인증된 사용자의 그룹으로 권한 조건을 만들어 검색에 붙입니다" %}

아래는 서버가 로그인한 사용자의 그룹으로 Qdrant 필터를 만드는 예입니다. `get_groups()`는 인증 시스템에서 그룹 목록을 읽어 오는 함수로 가정합니다. 컬렉션 이름과 필드 이름은 예시입니다.

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

def search_for_user(user, query_vector, extra_filters=None):
    # 그룹 목록은 요청 본문이 아니라 인증된 세션에서 가져옵니다
    groups = get_groups(user.id)
    acl = models.FieldCondition(key="acl_groups", match=models.MatchAny(any=groups))
    must = [acl] + (extra_filters or [])
    return client.query_points(
        collection_name="company_docs",
        query=query_vector,
        query_filter=models.Filter(must=must),
        limit=5,
    )
```

배열 필드에 조건을 걸면 Qdrant는 배열 안의 값 가운데 하나라도 조건을 만족하면 그 레코드를 통과시킵니다.[^qdrant-payload] 그래서 `acl_groups`가 `["hr", "managers"]`인 청크는 `hr` 그룹 사용자와 `managers` 그룹 사용자 모두에게 보입니다. 사용자가 고른 부서나 기간 조건은 `extra_filters`로 받되, 권한 조건 `acl`은 항상 서버가 붙입니다.

질문에서 필터를 자동으로 만들어 주는 기능도 권한에는 쓰지 않습니다. Amazon Bedrock Knowledge Bases의 implicit metadata filtering은 사용자 질의와 메타데이터 스키마를 바탕으로 검색 필터를 만들어 적용합니다.[^bedrock-kb-filter] 질문 내용에 따라 달라지는 필터이므로 “2025년 문서만” 같은 범위 조건에는 편리합니다. 하지만 사용자가 질문을 바꿔 조건을 흔들 수 있어 권한 조건으로는 맞지 않습니다.

### 등급은 비교할 수 있는 값으로 둡니다

보안 등급처럼 단계가 있는 권한은 문자열 대신 숫자로 두면 필터가 단순해집니다. 청크에 `"security": "사내 이상"`이라고 적어 두면 사람은 읽을 수 있지만 필터로는 비교할 수 없습니다. 등급을 숫자로 정하면 `security_level <= 2` 같은 조건 하나로 거를 수 있습니다.

```text
등급 표: 공개 = 1, 사내 = 2, 대외비 = 3

청크          security_level = 2         (사내 문서)
사용자        clearance = 2              (사내 문서까지 열람 가능)
필터          security_level <= 2        → 공개·사내 문서만 통과
```

문자열로 둔다면 허용 등급 목록(`["public", "internal"]`)을 배열로 적고 사용자 등급이 그 목록에 들어 있는지 확인하는 방식도 쓸 수 있습니다. 어느 쪽이든 등급의 이름과 순서를 한 곳에서 정해 두어야 합니다(8·9절).

### 테넌트 격리와 권한 조건은 다릅니다

고객사처럼 데이터를 완전히 나눠야 하는 단위는 [4편](/writing/vector-database-schema-design/)에서 본 namespace·테넌트·파티션으로 먼저 나눕니다. 그 안에서 문서마다 다른 권한은 메타데이터 필터로 거릅니다. 제품의 권한 기능이 어디까지 닿는지 확인해 두면 이 경계가 분명해집니다.

- **Milvus**의 RBAC는 인스턴스·데이터베이스·컬렉션 단위로 권한을 줍니다.[^milvus-rbac] 테넌트를 partition key로 나누는 방식은 수백만 테넌트까지 늘릴 수 있지만 RBAC를 지원하지 않습니다.[^milvus-tenancy]
- **Qdrant**의 JWT 기반 접근 제어는 토큰마다 전체 권한(읽기 `r`, 관리 `m`)이나 컬렉션별 권한(읽기 `r`, 읽기·쓰기 `rw`)을 정합니다.[^qdrant-security]
- **Weaviate**의 RBAC는 컬렉션과 테넌트를 단위로 권한을 정합니다.[^weaviate-rbac]

세 제품의 권한은 이처럼 컬렉션·테넌트 같은 저장 단위에 걸립니다. 같은 컬렉션이나 테넌트 안에서 문서마다 다른 권한은 앞의 Qdrant 예처럼 애플리케이션 서버가 필터로 겁니다.

### PostgreSQL에서는 행 수준 보안을 쓸 수 있습니다

pgvector로 PostgreSQL에 벡터를 저장한다면 행 수준 보안(RLS, Row-Level Security)으로 권한을 데이터베이스가 강제하게 할 수 있습니다. RLS를 켠 테이블은 정책이 허용한 행만 조회되고 정책이 하나도 없으면 아무 행도 보이지 않습니다(default-deny).[^pg-rls] 정책 조건은 일반적으로 사용자 질의의 조건보다 먼저 적용됩니다.[^pg-create-policy]

```sql
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY chunks_by_group ON chunks
    FOR SELECT
    USING (acl_groups && (SELECT groups FROM user_groups WHERE user_name = current_user));
```

`acl_groups`와 `user_groups.groups`는 `text[]` 배열이고 `&&`는 두 배열에 겹치는 원소가 있는지 보는 연산자입니다. 정책은 접속한 데이터베이스 사용자(`current_user`)를 기준으로 하므로, 애플리케이션이 모든 요청을 한 계정으로 접속한다면 현재 사용자 정보를 데이터베이스에 알려 주는 별도의 방법이 필요합니다. 슈퍼유저와 `BYPASSRLS` 속성이 있는 역할은 RLS를 우회합니다. 테이블 소유자도 기본으로 우회하므로 `FORCE ROW LEVEL SECURITY`를 함께 검토합니다.[^pg-rls]

RLS 정책도 행을 거르는 조건이므로 4절에서 본 사후 필터와 같은 현상이 생길 수 있습니다. pgvector의 근사 인덱스는 인덱스를 훑은 뒤 조건을 적용하므로 정책을 통과하는 행이 적은 사용자는 `LIMIT`보다 적은 결과를 받을 수 있습니다. 정책을 건 뒤에는 권한이 좁은 사용자의 결과 개수를 따로 재 봅니다.

## 7. 어떤 관리용 필드를 남길까요

### 원문과 청크를 잇는 필드

검색된 청크로 답을 만든 뒤에는 “이 답이 어느 문서에서 나왔는지” 보여 줘야 합니다. 원문이 고쳐지면 그 문서의 청크만 골라 다시 만들어야 합니다. 두 작업 모두 청크에서 원문으로 돌아가는 필드가 있어야 가능합니다.

Pinecone 문서는 레코드 ID에 `document_id#chunk_number`처럼 원문 ID를 접두어로 붙이면 한 문서의 청크를 접두어로 모두 가져올 수 있다고 안내합니다. 메타데이터에는 `document_id`·`chunk_number`로 한 문서의 청크를 묶고 `document_url`로 결과를 원문에 연결하라고 권합니다.[^pinecone-data-modeling] Amazon Bedrock Knowledge Bases는 관리형 지식 베이스에서 `_source_uri`, `_data_source_id` 같은 필드를 예약해 두고, PDF 문서의 쪽 번호는 `x-amz-bedrock-kb-document-page-number` 필드에 만들어 저장합니다(벡터 저장소가 OpenSearch Serverless나 Aurora일 때).[^bedrock-kb-filter]

이 글의 예에서 남길 관리용 필드를 정리하면 다음과 같습니다.

| 필드 | 용도 | 예 |
| --- | --- | --- |
| `doc_id` | 원문 문서 식별자. 원문이 바뀌면 이 값으로 청크를 모아 지우고 다시 넣음 | `hr-rules` |
| `chunk_index` | 원문 안에서 몇 번째 청크인지. 앞뒤 청크를 이어 붙여 보여 줄 때 씀 | `12` |
| `parent_id` | 부모-자식 검색에서 부모 청크의 ID([5편 9절](/writing/vector-database-vector-design/)) | `hr-rules#p03` |
| `source_url` | 답변에 표시할 원문 위치 | `https://wiki.example.com/hr/rules` |
| `updated_at` | 원문을 마지막으로 고친 시각. 색인이 최신인지 비교할 때 씀 | `2026-02-20T09:00:00+09:00` |
| `embedding_model` | 벡터를 만든 모델과 버전. 모델을 바꿀 때 다시 만들 범위를 고름 | `intfloat/multilingual-e5-large` |
| `chunker` | 분할 방식과 크기. 청킹 설정을 바꿀 때 다시 만들 범위를 고름 | `recursive-400-50` |

`embedding_model`과 `chunker`는 이 글에서 권하는 설계입니다. [5편 10절](/writing/vector-database-vector-design/)에서 본 것처럼 임베딩 모델이나 청킹 설정을 바꾸면 레코드를 모두 다시 만들어야 합니다. 이 두 필드가 있으면 옮기는 동안 어떤 레코드가 옛 설정으로 만든 것인지 구분할 수 있습니다.

### 메타데이터가 임베딩에 섞이지 않게 합니다

프레임워크에 따라 메타데이터가 벡터를 만드는 텍스트에 함께 들어가기도 합니다. LlamaIndex는 기본으로 메타데이터를 임베딩 모델과 LLM에 보내는 텍스트에 넣습니다. 문서의 메타데이터는 그 문서에서 만든 모든 노드(청크)로 전파됩니다. 특정 키를 빼려면 `excluded_embed_metadata_keys`와 `excluded_llm_metadata_keys`에 적습니다.[^llamaindex-documents]

```python
document.excluded_embed_metadata_keys = ["acl_groups", "updated_at", "source_url"]
document.excluded_llm_metadata_keys = ["acl_groups"]
```

`title`처럼 뜻을 보태는 키는 임베딩에 남기는 편이 검색에 도움이 될 수 있지만 권한 그룹이나 시각 같은 관리용 값은 문장의 뜻과 관계가 없습니다. 특히 `acl_groups`가 LLM 프롬프트에 들어가면 답변에 그룹 이름이 노출될 수 있습니다. 어떤 텍스트가 실제로 들어가는지는 `get_content(metadata_mode=MetadataMode.EMBED)`로 확인할 수 있습니다.[^llamaindex-documents]

## 8. 메타데이터 표준이 없으면 무엇이 문제일까요

### 같은 뜻, 다른 이름과 다른 값

컬렉션 하나에 여러 팀이 문서를 넣다 보면 같은 정보를 서로 다른 이름과 형식으로 적기 쉽습니다. 세 팀이 각자 올린 인사 문서의 메타데이터가 이렇다고 가정해 봅시다.

```python
records = [
    {"id": "a-1", "dept": "HR", "effectiveDate": "2026.3.1", "security": "사내"},
    {"id": "b-7", "department": "인사팀", "effective_date": "20260301", "security_level": 2},
    {"id": "c-3", "team": "인사", "eff_date": "1 Mar 26", "security_level": "2"},
]
```

세 레코드는 모두 “인사 부서 문서, 2026년 3월 1일 시행, 사내 등급”이라는 같은 뜻입니다. 그런데 문제가 세 겹으로 쌓여 있습니다.

- **필드 이름이 다릅니다.** 부서는 `dept`·`department`·`team`, 시행일은 `effectiveDate`·`effective_date`·`eff_date`, 보안 등급은 `security`·`security_level`입니다.
- **값의 표기가 다릅니다.** 부서 값이 `HR`·`인사팀`·`인사`이고, 날짜가 `2026.3.1`·`20260301`·`1 Mar 26` 세 가지입니다. `1 Mar 26`은 연도를 두 자리로 적어 2026년인지 1926년인지 문자열만으로는 정할 수 없습니다.
- **타입이 다릅니다.** 보안 등급이 이름(`"사내"`), 숫자(`2`), 숫자처럼 보이는 문자열(`"2"`)로 섞여 있습니다.

이 상태에서 인사 문서를 찾는 조건을 써 보면 결과가 이렇게 나옵니다.

```python
# 필드 이름을 하나로 정해 두었다고 믿고 쓴 조건
print([r["id"] for r in records if r.get("department") == "hr"])
# []

# 세 팀의 이름과 값을 모두 알아야 같은 조건이 됩니다
print([r["id"] for r in records
       if r.get("dept") == "HR"
       or r.get("department") == "인사팀"
       or r.get("team") == "인사"])
# ['a-1', 'b-7', 'c-3']

# 숫자와 문자열이 섞이면 크기 비교가 실패합니다
print([r["id"] for r in records if r.get("security_level", 0) <= 2])
# TypeError: '<=' not supported between instances of 'str' and 'int'
```

첫 조건은 오류 없이 빈 결과를 돌려줍니다. 검색 서비스에서는 오류 없이 빈 결과가 나오는 경우가 가장 위험합니다. 오류가 나면 바로 알 수 있지만 빈 결과나 일부만 걸린 결과는 “관련 문서가 없다”로 보이기 때문입니다.

둘째 조건은 결과는 맞지만 팀이 하나 늘 때마다 조건을 고쳐야 합니다. 날짜 범위 조건은 아예 쓸 수 없습니다. 세 형식의 문자열을 크기로 비교하면 시간 순서와 관계없는 결과가 나옵니다.

셋째 조건은 `"2"`라는 문자열 하나 때문에 실패합니다. 만약 `security_level` 필드가 없는 `a-1`을 0으로 간주하지 않았다면 권한 조건에서 그 문서가 빠졌을 것이고, 반대로 0으로 간주하면 사내 문서가 공개 문서처럼 다뤄질 수 있습니다.

벡터 DB 필터에서도 같은 일이 일어납니다. Pinecone의 `$gt`·`$gte` 같은 범위 연산자는 숫자에만 쓸 수 있으므로[^pinecone-filter] 등급이 문자열로 들어간 레코드는 범위 조건에 걸리지 않습니다. Weaviate는 자동 스키마가 켜져 있으면 들어오는 데이터에서 타입을 추론해 속성을 만듭니다.[^weaviate-collections] 등급을 문자열로 적은 레코드가 먼저 들어가면 그 속성이 문자열 타입으로 만들어질 수 있고 그러면 숫자 범위 조건을 걸 수 없습니다.

### 표준을 정하면 조건이 하나로 줄어듭니다

필드 이름과 값을 정해 두면 같은 데이터가 이렇게 바뀝니다.

```python
normalized = [
    {"id": "a-1", "department": "hr", "effective_date": "2026-03-01", "security_level": 2},
    {"id": "b-7", "department": "hr", "effective_date": "2026-03-01", "security_level": 2},
    {"id": "c-3", "department": "hr", "effective_date": "2026-03-01", "security_level": 2},
]
print([r["id"] for r in normalized
       if r["department"] == "hr"
       and r["effective_date"] >= "2026-01-01"
       and r["security_level"] <= 2])
# ['a-1', 'b-7', 'c-3']
```

조건 하나로 세 건이 모두 걸리고 날짜 범위와 등급 비교도 됩니다. 날짜를 `YYYY-MM-DD` 형식으로 맞추면 문자열의 사전 순서가 날짜 순서와 같아지므로 문자열 비교로도 범위를 거를 수 있습니다(9절).[^rfc3339]

## 9. 표준은 어떻게 지키게 할까요

### 이름 규칙: 어느 제품으로 옮겨도 깨지지 않게

필드 이름에도 제품마다 규칙이 있습니다.

- **Pinecone:** 필드 이름은 비어 있지 않아야 하고 64바이트 이하입니다. `_`로 시작하는 이름은 `_id`·`_score` 같은 시스템 필드용으로, `$`로 시작하는 이름은 필터 연산자용으로 예약돼 있습니다.[^pinecone-data-modeling]
- **Milvus:** 컬렉션·파티션·인덱스 같은 자원 이름에는 숫자·영문자·밑줄만 쓰고 영문자나 밑줄로 시작해야 합니다.[^milvus-limits] JSON 필드의 키에도 영문자·숫자·밑줄만 쓰라고 권합니다.[^milvus-json]
- **Weaviate:** GraphQL 명명 규칙을 따르며 `id`, `_id`, `_additional` 같은 이름은 예약돼 있습니다.[^weaviate-collections]
- **Amazon Bedrock Knowledge Bases:** 직접 구성한 지식 베이스에서는 `x-amz-bedrock`으로 시작하는 필드를, 관리형 지식 베이스에서는 `_`로 시작하는 필드를 서비스가 예약해 둡니다.[^bedrock-kb-filter]

영문 소문자로 시작하고 소문자·숫자·밑줄만 쓰는 snake_case(`effective_date`)로 짧게 정하면 위 규칙을 대부분 지킵니다. 다만 Weaviate의 예약 이름(`id`, `_id`, `_additional`)과 `_searchable`·`_temp` 같은 금지 접미사는 따로 피해야 합니다.[^weaviate-collections] 한글 필드 이름이나 공백, 하이픈도 피합니다.

### 값 규칙: 허용값 목록, 날짜 형식, 타입

- **허용값 목록(통제 어휘):** 부서·문서 종류·보안 등급처럼 값의 종류가 정해진 필드는 쓸 수 있는 값을 목록으로 정합니다. `hr`만 허용하면 `HR`·`인사팀`이 들어올 수 없습니다. 목록을 문서로만 두지 말고 이 절 아래의 “검증” 소절에서 강제합니다.
- **날짜와 시각:** RFC 3339 형식(`2026-03-01`, `2026-02-20T09:00:00+09:00`)으로 씁니다.
  - **정렬 조건:** RFC 3339는 연도를 반드시 네 자리로 쓰게 합니다. 시간대 표기(모두 `Z` 또는 모두 `+09:00`)와 초 이하 자릿수가 같다면 문자열로 정렬해도 시간 순서가 된다고 설명합니다.[^rfc3339] 반대로 같은 필드에 `Z`와 `+09:00`이 섞이면 문자열 비교가 시간 순서와 어긋날 수 있으므로 한 가지로 통일합니다.
  - **제품별 형식:** Qdrant의 datetime은 RFC 3339 형식이고 날짜만 적은 값(`2026-03-01`)도 받습니다.[^qdrant-payload] Weaviate의 date는 RFC 3339의 date-time 형식이라 `2026-03-01T00:00:00+09:00`처럼 시각까지 적습니다.[^weaviate-datatypes]
  - **숫자로 저장:** 시각을 숫자 범위로 다루고 싶다면 1970년 1월 1일(UTC)부터 지난 초 수(Unix 시각)로 저장하는 방법도 있습니다. Bedrock 문서의 필터 예에 나오는 `epoch_modification_time`이 이 형식입니다.[^bedrock-kb-filter]
- **타입:** 크기를 비교하는 값(등급·금액·쪽수)은 숫자로, 비교하지 않는 식별자는 문자열로 둡니다(5절). 사람이 읽는 표기는 피합니다. `"3분 20초"` 대신 `duration_sec: 200`, `"1920 x 1080"` 대신 `width: 1920`, `height: 1080`처럼 나눠 넣어야 필터와 정렬에 쓸 수 있습니다.

### 검증: 넣기 전에 막습니다

규칙은 데이터가 들어가기 전에 확인해야 지켜집니다. 이미 들어간 잘못된 값은 찾아서 고치기가 훨씬 어렵기 때문입니다.

**데이터베이스의 스키마를 씁니다.** Milvus는 스키마에 스칼라 필드와 타입을 정의할 수 있습니다. 동적 필드(`$meta`)는 스키마에 없는 필드를 받아 주므로 편하지만[^milvus-dynamic] 이름과 타입을 강제하지 않습니다. 필터에 쓰는 필드는 스키마에 정의하는 편이 좋습니다. Weaviate는 자동 스키마가 기본으로 켜져 있지만 문서는 운영 환경에서는 끄라고 권합니다. 환경 변수 `AUTOSCHEMA_ENABLED`를 `'false'`로 두고 컬렉션의 속성을 직접 정의합니다.[^weaviate-collections]

**색인 파이프라인에서 검증합니다.** 스키마가 느슨한 저장소를 쓰거나 저장소의 검사로 부족하다면 레코드를 넣기 전에 JSON Schema 같은 규격으로 검사합니다. JSON Schema의 `required`는 반드시 있어야 할 필드를, `enum`은 허용값 목록을, `additionalProperties: false`는 정의하지 않은 필드를 막습니다.[^json-schema-object][^json-schema-validation]

```json
{
  "type": "object",
  "required": ["doc_id", "chunk_index", "department", "effective_date", "acl_groups"],
  "properties": {
    "doc_id": { "type": "string" },
    "chunk_index": { "type": "integer", "minimum": 0 },
    "department": { "enum": ["hr", "sales", "finance"] },
    "effective_date": { "type": "string", "format": "date" },
    "security_level": { "type": "integer", "minimum": 1, "maximum": 3 },
    "acl_groups": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
  },
  "additionalProperties": false
}
```

8절 레코드의 메타데이터(`id`를 뺀 부분)를 이 스키마로 검사하면 셋 다 실패합니다. 세 레코드 모두 `doc_id`·`chunk_index`·`acl_groups` 같은 필수 필드가 빠졌습니다. 그 밖에 `a-1`은 `dept`·`effectiveDate`·`security`가 정의하지 않은 필드이고, `b-7`은 부서 값 `인사팀`이 허용값 목록에 없고, `c-3`은 `team`·`eff_date`가 정의하지 않은 필드이면서 `security_level`이 문자열입니다.

JSON Schema 2020-12에서 `format`은 기본으로 주석(annotation)으로만 다뤄집니다.[^json-schema-validation] 쓰는 검증 라이브러리에서 형식 검사를 따로 켜지 않으면 `"format": "date"`가 있어도 `"1 Mar 26"`이 통과할 수 있습니다.

Python의 Pydantic 모델을 쓴다면 `extra='forbid'` 설정이 정의하지 않은 필드를 막는 역할을 합니다.[^pydantic-models]

`acl_groups`에 `minItems: 1`을 둔 것은 권한 필드가 빈 채로 들어가는 것을 막기 위해서입니다. 빈 배열이면 6절의 필터에 아무도 걸리지 않아 문서가 보이지 않게 되고, 반대로 권한 필드가 없는 레코드를 “모두에게 공개”로 처리하는 코드가 있다면 문서가 새어 나갑니다. 권한 필드는 반드시 있어야 하는 필드로 두는 것이 안전합니다.

## 정리

자기 서비스에 적용할 때는 아래 질문을 차례로 확인해 봅니다.

| 확인할 질문 | “예”라면 | 참고 |
| --- | --- | --- |
| 부서·기간·문서 종류처럼 범위를 좁힐 조건이 있는가 | 그 조건을 메타데이터 필드로 두고 필터로 검색 | 2·3절 |
| 통과 비율이 낮은 필터를 자주 거는가 | 결과 개수와 응답 시간을 재고 제품의 필터 방식에 맞게 조정(iterative scan, 전수 비교 전환 기준 등) | 4절 |
| 필터에 쓸 필드가 정해졌는가 | 데이터를 넣기 전에 인덱스를 만들고 타입과 크기 제약을 확인 | 5절 |
| 문서마다 볼 수 있는 사람이 다른가 | 청크마다 권한 필드를 두고 서버가 인증된 사용자로 필터를 만듦 | 6절 |
| 답변에 근거를 보여 주거나 원문 변경을 반영해야 하는가 | `doc_id`·`chunk_index`·`source_url`·`updated_at`을 남김 | 7절 |
| 임베딩 모델이나 청킹 설정을 바꿀 계획이 있는가 | `embedding_model`·`chunker`를 남겨 다시 만들 범위를 고름 | 7절 |
| 여러 팀이나 시스템이 데이터를 넣는가 | 필드 이름·허용값·날짜 형식·타입을 정하고 넣기 전에 검증 | 8·9절 |

## 참고 자료

[^dense-index-size]: [Reimers·Gurevych — The Curse of Dense Low-Dimensional Information Retrieval for Large Index Sizes](https://arxiv.org/abs/2012.14210). 2020. 인덱스 규모가 커질 때 dense 검색 성능이 sparse 검색보다 빠르게 떨어지는 현상과 차원 수의 관계.
[^power-of-noise]: [Cuconasu 외 — The Power of Noise: Redefining Retrieval for RAG Systems](https://arxiv.org/abs/2401.14887). 2024. 점수는 높지만 답이 없는 검색 결과가 LLM 답변 품질에 주는 영향.
[^weaviate-filtering]: [Weaviate — Filtering](https://docs.weaviate.io/weaviate/concepts/filtering). 사전·사후 필터의 정의와 한계, allow list와 역색인, 까다로운 필터에서의 전수 비교 전환, ACORN 전략.
[^weaviate-vector-index]: [Weaviate — Vector index](https://docs.weaviate.io/weaviate/config-refs/indexing/vector-index). `filterStrategy`·`flatSearchCutoff`의 기본값.
[^milvus-filtered]: [Milvus — Filtered Search](https://milvus.io/docs/filtered-search.md). v3.0.x. 기본 필터 검색의 순서와 iterative filtering.
[^qdrant-indexing]: [Qdrant — Indexing](https://qdrant.tech/documentation/manage-data/indexing/). payload 인덱스 타입과 생성 시점, filterable HNSW의 추가 간선, 쿼리 플래너의 전체 스캔 전환.
[^qdrant-search]: [Qdrant — Similarity Search](https://qdrant.tech/documentation/search/search/). ACORN 검색 파라미터(v1.16.0+)와 필터를 건 검색 예.
[^acorn]: [Patel 외 — ACORN: Performant and Predicate-Agnostic Search Over Vector Embeddings and Structured Data](https://arxiv.org/abs/2403.04871). 2024. 조건을 건 벡터 검색 알고리즘과 처리량 비교.
[^pgvector]: [pgvector README](https://github.com/pgvector/pgvector). 0.8.7. 근사 인덱스에서 필터가 적용되는 순서, iterative index scan(0.8.0+)과 설정, 필터 컬럼 인덱스·부분 인덱스·파티셔닝.
[^es-filtered-knn]: [Elasticsearch — Filter approximate kNN results](https://www.elastic.co/docs/solutions/search/vector/knn/filtered-knn-search). kNN `filter`와 `post_filter`의 적용 시점과 결과 개수, 필터가 검색을 느리게 할 수 있는 이유.
[^opensearch-efficient]: [OpenSearch — Efficient k-NN filtering](https://docs.opensearch.org/latest/vector-search/filter-search-knn/efficient-knn-filtering/). 탐색 중 필터와 Faiss 엔진의 정확 검색 보충.
[^milvus-inverted]: [Milvus — INVERTED](https://milvus.io/docs/inverted.md). v3.0.x. 지원 타입과 쓰임새.
[^milvus-bitmap]: [Milvus — BITMAP](https://milvus.io/docs/bitmap.md). v3.0.x. 카디널리티가 낮은 필드용 인덱스와 효과적인 범위.
[^milvus-stl-sort]: [Milvus — STL_SORT](https://milvus.io/docs/stl-sort.md). v3.0.x. 숫자 필드 비교 조건용 인덱스.
[^milvus-partition-key]: [Milvus — Use Partition Key](https://milvus.io/docs/use-partition-key.md). v3.0.x. 자동 파티션 수, 검색 범위 축소, 값이 비면 안 되는 조건.
[^weaviate-inverted]: [Weaviate — Inverted index](https://docs.weaviate.io/weaviate/config-refs/indexing/inverted-index). `indexFilterable`·`indexRangeFilters`의 대상 타입과 기본값.
[^pg-jsonb]: [PostgreSQL 18 — JSON Types](https://www.postgresql.org/docs/current/datatype-json.html). `jsonb` GIN 인덱스가 지원하는 연산자.
[^pinecone-metadata-indexing]: [Pinecone — Configure metadata indexing](https://docs.pinecone.io/guides/index-data/configure-metadata-indexing). 선택적 메타데이터 인덱싱과 생성 후 변경 불가.
[^pinecone-indexing-overview]: [Pinecone — Index data overview](https://docs.pinecone.io/guides/index-data/indexing-overview). 메타데이터 값 타입, 레코드당 크기, null·중첩 객체 제약.
[^pinecone-data-modeling]: [Pinecone — Data modeling](https://docs.pinecone.io/guides/index-data/data-modeling). ID 접두어, 청크를 묶는 필드와 원문 연결 필드, 필드 이름 규칙.
[^pinecone-filter]: [Pinecone — Filter by metadata](https://docs.pinecone.io/guides/search/filter-by-metadata). 필터 연산자와 대상 타입.
[^chroma-add-data]: [Chroma — Adding Data to Chroma Collections](https://docs.trychroma.com/docs/collections/add-data). 메타데이터 값 타입과 배열 제약.
[^milvus-limits]: [Milvus — Milvus Limits](https://milvus.io/docs/limitations.md). v3.0.x. 이름 규칙, 필드 수와 VARCHAR 길이 한도.
[^milvus-json]: [Milvus — JSON Field](https://milvus.io/docs/use-json-fields.md). v3.0.x. JSON 필드 크기, 키 이름 권고, 인덱싱할 때 큰 정수의 정밀도.
[^milvus-dynamic]: [Milvus — Enable Dynamic Field](https://milvus.io/docs/enable-dynamic-field.md). v3.0.x. 스키마에 없는 필드를 담는 `$meta`.
[^qdrant-payload]: [Qdrant — Payload](https://qdrant.tech/documentation/manage-data/payload/). payload 타입, datetime 형식과 시간대, 배열 필드의 조건 판정.
[^weaviate-datatypes]: [Weaviate — Property data types](https://docs.weaviate.io/weaviate/config-refs/datatypes). 속성 타입과 `date`의 RFC 3339 형식.
[^weaviate-collections]: [Weaviate — Collection definition](https://docs.weaviate.io/weaviate/config-refs/collections). 자동 스키마의 기본값과 끄는 방법, 운영 환경 권고, 이름 규칙.
[^owasp-llm08]: [OWASP — LLM08:2025 Vector and Embedding Weaknesses](https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/). 벡터·임베딩 저장소의 접근 통제 위험과 대응책.
[^owasp-a01]: [OWASP Top 10:2025 — A01 Broken Access Control](https://top10.owasp.org/2025/A01_2025-Broken_Access_Control). 서버 측에서 접근 통제를 강제해야 하는 이유.
[^azure-doc-level]: [Azure AI Search — Document-level access control](https://learn.microsoft.com/en-us/azure/search/search-document-level-access-overview). 호출자 신원으로 만드는 security filter, 권한 변경의 동기화, 청크마다 레이블을 옮겨 담아야 하는 이유.
[^azure-security-trimming]: [Azure AI Search — Security filter pattern](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search). 그룹 ID 필드와 필터, 이 방식이 인증이 아닌 문자열 비교라는 설명.
[^bedrock-kb-filter]: [Amazon Bedrock — Configure and customize queries and response generation](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-config.html). 메타데이터 필터, implicit metadata filtering, 예약 필드와 쪽 번호 필드, Unix 시각 필터 예.
[^milvus-rbac]: [Milvus — RBAC Explained](https://milvus.io/docs/rbac.md). v3.0.x. 권한을 주는 자원 단위.
[^milvus-tenancy]: [Milvus — Implement Multi-tenancy](https://milvus.io/docs/multi_tenancy.md). v3.0.x. 테넌트 격리 수준별 규모와 RBAC 지원 여부.
[^qdrant-security]: [Qdrant — Security & Access Control](https://qdrant.tech/documentation/security/). JWT 기반 세분 접근 제어(v1.9.0+)와 `access` claim.
[^weaviate-rbac]: [Weaviate — RBAC Overview](https://docs.weaviate.io/weaviate/configuration/rbac). 역할 기반 권한의 대상.
[^pg-rls]: [PostgreSQL 18 — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). 행 수준 보안의 기본 거부와 우회 주체.
[^pg-create-policy]: [PostgreSQL 18 — CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html). `USING` 조건과 정책 조건의 적용 순서.
[^llamaindex-documents]: [LlamaIndex — Defining and Customizing Documents](https://developers.llamaindex.ai/python/framework/module_guides/loading/documents_and_nodes/usage_documents/). 메타데이터의 기본 주입과 제외 키, 노드로의 전파.
[^rfc3339]: [RFC 3339 — Date and Time on the Internet: Timestamps](https://www.rfc-editor.org/rfc/rfc3339). 2002. 날짜·시각 형식, 네 자리 연도, 문자열 정렬이 시간 순서가 되는 조건.
[^json-schema-object]: [JSON Schema — object](https://json-schema.org/understanding-json-schema/reference/object). `required`와 `additionalProperties`.
[^json-schema-validation]: [JSON Schema Validation: A Vocabulary for Structural Validation of JSON (2020-12)](https://json-schema.org/draft/2020-12/json-schema-validation). `enum`·`required`의 판정과 `format`의 기본 동작.
[^pydantic-models]: [Pydantic — Models](https://pydantic.dev/docs/validation/latest/concepts/models/). 모델 검증과 `extra` 설정.
