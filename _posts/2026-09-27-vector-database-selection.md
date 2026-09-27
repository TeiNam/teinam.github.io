---
date: 2026-09-27 00:00:00 +0900
title: "벡터 DB는 어떻게 고를까: 선택 기준과 제품별 기능 비교"
category: database
excerpt: "인덱스와 압축, 질의당 최대 k, 필터와 멀티테넌시, 하이브리드 검색, 1억 건 규모의 메모리, 샤딩과 확장을 기준으로 벡터 DB 12종을 공식 문서에 근거해 비교합니다."
last_modified_at: 2026-09-27
series: "벡터 DB"
series_index: "2 / 2"
---

**시리즈** · [1. 개념과 제품·사용 지표](/writing/vector-database-overview/) · **2. 선택 기준과 기능 비교**

사내 문서 조각 1억 개 가운데 사용자가 볼 수 있는 문서만 골라 관련도가 높은 50개를 가져와야 한다고 생각해 봅시다. 제품 소개의 “빠르다”는 문장보다 먼저 확인할 것이 있습니다. 권한 필터를 걸어도 50개가 다 나오는지, 인덱스가 메모리에 들어가는지, 데이터가 두 배로 늘었을 때 샤드를 늘릴 수 있는지입니다.

1편에서는 벡터 DB가 무엇을 검색하는지와 오픈소스·상용 제품의 종류, 공개 사용 지표를 읽는 법을 다뤘습니다. 이 글은 같은 제품군 12종을 **기능과 한도** 기준으로 비교합니다. 대상은 pgvector, Milvus, Qdrant, Weaviate, Chroma, LanceDB, Pinecone, OpenSearch, Elasticsearch, Vespa, MongoDB Vector Search, Redis입니다.

기능과 한도는 2026년 9월 27일 기준 각 제품의 공식 문서와 저장소에 적힌 내용을 따릅니다. 이 글은 성능을 측정해 비교하지 않으므로 속도 수치는 싣지 않습니다. 6절의 메모리 크기는 공식 문서의 산정식이나 사이징 안내에 값을 넣어 계산한 결과이며, 해당 절에서 계산값이라고 밝힙니다.

## 1. 무엇부터 정해야 할까요

제품을 비교하기 전에 요구사항을 숫자로 적어 두면 비교할 항목이 분명해집니다. 아래 항목의 순서가 이 글의 절 순서와 같습니다.

| 정할 것 | 예시 | 비교하는 절 |
| --- | --- | --- |
| 인덱스와 메모리 예산 | 전부 메모리에 적재, 또는 디스크 인덱스·양자화 허용 | 2절 |
| 질의당 결과 수(k) | 재순위화 전 후보 500개 | 3절 |
| 필터와 테넌트 격리 | 권한·기간 조건, 고객사 10만 곳 | 4절 |
| 키워드 검색 결합 | 제품 코드·약어의 BM25 검색 | 5절 |
| 규모와 증가 속도 | 지금 1천만 건, 1년 뒤 1억 건 | 6절 |
| 확장 방식 | 데이터 2배 증가 시 샤드 추가, 읽기 처리량 증설, 수직 확장 | 7절 |
| 운영 주체와 비용 구조 | 셀프 호스팅 또는 관리형, 과금 단위 | 8절 |

비교한 제품과 기준 버전은 다음과 같습니다. 문서가 버전을 따로 표기하지 않는 제품은 조회일의 최신 안정 릴리스를 적었습니다.

| 제품 | 분류 | 기준 버전 |
| --- | --- | --- |
| pgvector[^pgvector] | PostgreSQL 확장 | 0.8.6 |
| Milvus[^milvus] | 전용 벡터 DB | 3.0.2 |
| Qdrant[^qdrant] | 전용 벡터 DB | 1.19.1 |
| Weaviate[^weaviate] | 전용 벡터 DB | 1.39.7 |
| Chroma[^chroma] | 벡터 검색·검색 데이터 인프라 | 1.5.9 |
| LanceDB[^lancedb] | 임베디드 검색·멀티모달 데이터 플랫폼 | 0.39.0 |
| Pinecone[^pinecone] | 관리형 벡터 DB | API 2026-07 |
| OpenSearch[^opensearch] | 검색 엔진 | 3.8.0 |
| Elasticsearch[^elasticsearch] | 검색 엔진 | 9.5.4 |
| Vespa[^vespa] | 검색·추천 플랫폼 | 8.754.14 |
| MongoDB Vector Search[^mongodb] | 문서 DB의 검색 기능 | MongoDB 8.3 |
| Redis[^redis] | 인메모리 DB의 검색 기능 | Redis Open Source 8.10.2 |

## 2. 인덱스와 압축은 어떻게 다를까요

벡터 인덱스는 크게 세 갈래입니다. HNSW는 메모리에 근접 그래프를 두고 탐색하므로 속도와 recall의 균형이 좋지만 메모리를 많이 씁니다. IVF 계열은 벡터를 군집으로 나누고 일부 군집만 탐색합니다. 디스크 기반 인덱스는 그래프나 군집의 대부분을 SSD나 오브젝트 스토리지에 두고, 메모리에는 압축된 부분만 올립니다.

압축(양자화)은 인덱스와 따로 봐야 합니다. float32 벡터를 8비트 정수로 바꾸는 스칼라 양자화는 크기가 4분의 1로, 차원당 1비트로 바꾸는 이진 양자화는 32분의 1로 줄어듭니다. 줄어든 정확도는 후보를 더 뽑은 뒤 원본 벡터로 다시 점수를 매기는 재채점(rescoring)으로 보완합니다.

| 제품 | 벡터 인덱스 | 압축 | 디스크·GPU |
| --- | --- | --- | --- |
| pgvector | 정확 검색(기본), HNSW, IVFFlat | halfvec·bit 표현식 인덱스, 원본으로 재채점 | 전용 디스크 인덱스와 GPU는 문서에 없음 |
| Milvus | FLAT, IVF·HNSW 계열, DISKANN, SCANN, GPU 인덱스 | SQ8, PQ, RaBitQ(1비트), refine 재채점 | DISKANN·AISAQ(SSD), GPU_CAGRA 등 |
| Qdrant | HNSW 하나, 정확 검색 옵션 | scalar(4배), binary(1~2비트), product(최대 64배), rescore | 벡터는 디스크에 저장, 메모리 캐시 계층(tier) 선택, GPU는 인덱스 빌드(검색 가속은 문서에 없음) |
| Weaviate | HNSW(기본), flat, dynamic(실험), HFresh | PQ, BQ(32배), SQ(4배), RQ, rescoreLimit | 전용 디스크 인덱스와 GPU는 문서에 없음 |
| Chroma | 단일 노드는 HNSW, 분산·Cloud는 SPANN | 문서에 없음 | 분산 구성은 인덱스를 오브젝트 스토리지에 저장 |
| LanceDB | IVF 계열(IVF_PQ, IVF_HNSW_* 등), 정확 검색 | PQ, SQ, RaBitQ, refine_factor | 오브젝트 스토리지 위 인덱스, GPU는 빌드만 |
| Pinecone | 인덱스 알고리즘을 설명한 공식 문서 없음 | 사용자가 설정하는 압축 옵션은 문서에 없음 | 오브젝트 스토리지와 메모리·SSD 캐시 |
| OpenSearch | Faiss(기본)·Lucene·JVector 엔진, HNSW·IVF | SQ, PQ, BQ(1·2·4비트), oversample 재채점 | on_disk 모드(기본 32배 압축), GPU 원격 빌드 |
| Elasticsearch | hnsw·flat 계열, bbq_disk | int8·int4, BBQ, oversample 재채점 | bbq_disk는 Enterprise 구독, GPU는 문서에 없음 |
| Vespa | HNSW, 정확 검색 | bfloat16·int8 셀, 이진화 후 2단계 랭킹 | paged attribute로 디스크 이동(HNSW와 함께 쓰기는 비권장) |
| MongoDB | hnsw(기본), flat, 정확 검색(ENN) | scalar(1바이트), binary(1비트, 원본으로 재채점) | 인덱스 전체를 메모리에 적재(자동 양자화 시 원본 벡터는 디스크) |
| Redis | FLAT, HNSW, SVS-VAMANA(8.2+) | FLOAT16·INT8 등 저정밀 타입, SVS 압축 | 데이터와 인덱스 모두 메모리 |

기본 설정이 제품마다 달라서 기본값끼리 비교하면 서로 다른 압축 수준을 비교하게 됩니다. Elasticsearch는 `float` 벡터의 기본 인덱스로, 라이선스가 허용하면 `bbq_disk`를, 그렇지 않으면 384차원 이상에서 `bbq_hnsw`, 미만에서 `int8_hnsw`를 씁니다. OpenSearch의 디스크 기반 모드는 기본 압축률이 32배입니다. Weaviate의 기본 양자화는 `none`입니다. Milvus 문서는 `AUTOINDEX`를 쓰라고 안내하지만, 오픈소스 문서에는 그때 고르는 알고리즘이 나와 있지 않습니다. 1편에서 다룬 것처럼 같은 recall 목표를 정해 두고 비교해야 합니다.[^elasticsearch][^opensearch][^weaviate][^milvus]

Redis의 SVS 압축 가운데 LVQ·LeanVec은 Intel의 비공개 최적화로, Intel 플랫폼에서만 씁니다. Redis Open Source의 기본 빌드와 Intel이 아닌 플랫폼에서는 그 대신 8비트 스칼라 양자화를 쓰며, 빌드 조건은 8절에서 다룹니다.[^redis]

## 3. 한 번에 몇 개까지 받을 수 있을까요

k는 질의 한 번에 돌려받는 최근접 이웃의 수입니다. 재순위화 모델에 넘길 후보를 넉넉히 뽑거나 추천 후보를 한꺼번에 만들 때는 k가 커집니다. k에 직접 상한을 두는 제품도 있고, k와 함께 움직이는 탐색 파라미터나 응답 크기가 실제 한도가 되는 제품도 있습니다.

| 제품 | 질의당 k 상한 | 함께 묶인 값 | 관리형·비고 |
| --- | --- | --- | --- |
| pgvector | `LIMIT` 자체 상한 없음 | HNSW 결과는 `hnsw.ef_search`(기본 40, 최대 1,000) 이내, iterative scan을 켜면 더 탐색 | 자체 관리형 없음 |
| Milvus | `topk` 16,384 | `offset + limit`도 result window(기본 16,384) 이내, GPU_CAGRA는 1,024 이하 | Zilliz Cloud Free·Serverless는 1,024 |
| Qdrant | 문서에 상한 없음 | `hnsw_ef`, 큰 `offset`은 느려짐 | Cloud 한도도 문서에 없음 |
| Weaviate | `offset + limit` ≤ `QUERY_MAXIMUM_RESULTS`(기본 10,000) | dynamic ef 기본 범위 100~500, limit이 500을 넘으면 ef = limit | 한도를 넘으면 잘린 결과가 아니라 오류 |
| Chroma | 단일 노드 상한은 문서에 없음(기본 10) | HNSW `ef_search` 기본 100 | Chroma Cloud는 쿼리당 300(요청 시 상향) |
| LanceDB | 문서에 상한 없음(기본 10) | HNSW 계열 ef 기본 1.5 × limit | Enterprise REST API도 최대값 명시 없음 |
| Pinecone | `top_k` 10,000 | 응답 크기 4MB | 벡터 값·메타데이터를 포함하면 4MB에 먼저 걸릴 수 있음 |
| OpenSearch | `k` 1~10,000 | `k`는 샤드마다 적용, 최종 개수는 `size` | `from + size` ≤ 10,000(기본) |
| Elasticsearch | `num_candidates` ≤ 10,000, `k` ≤ `num_candidates` | 둘 다 샤드마다 적용 | `from + size` ≤ 10,000(기본) |
| Vespa | `targetHits` 상한은 문서에 없음 | `targetHits`는 content node마다, 반환 `hits`는 `maxHits`(기본 400) 이내 | `offset`은 `maxOffset`(기본 1,000) 이내 |
| MongoDB | ANN에서 `limit` ≤ `numCandidates` ≤ 10,000 | `numCandidates`는 limit의 20배 이상 권장 | 정확 검색(ENN)의 상한은 문서에 없음 |
| Redis | `KNN` 자체 상한은 문서에 없음 | 기본 반환이 10개라 `LIMIT 0 <k>` 지정, `search-max-search-results` 기본 1,000,000 | Redis Cloud Free·Fixed는 10,000 |

검색 엔진 계열은 k를 샤드마다(Vespa는 content node마다) 적용한다는 점을 기억해야 합니다. OpenSearch는 최종 개수를 `size`로 따로 정하고, Vespa의 `targetHits`는 첫 단계 랭킹에 넘길 개수입니다.[^opensearch][^elasticsearch][^vespa]

pgvector는 `LIMIT 500`을 줘도 iterative scan을 켜지 않으면 HNSW 결과가 `hnsw.ef_search` 개수를 넘지 않습니다. 기본값 40이면 최대 40행입니다. `ef_search`를 올리거나(최대 1,000) 0.8.0부터 생긴 iterative scan을 켜야 합니다. MongoDB는 `numCandidates` 상한이 10,000이고 문서가 limit의 20배 이상을 권하므로, 권장 비율을 지키면 limit은 500까지입니다(10,000 ÷ 20으로 계산한 값).[^pgvector][^mongodb]

k를 키우면 탐색 후보와 응답 크기도 함께 커집니다. 결과를 대량으로 꺼내야 한다면 페이지 단위 조회 API를 쓰는 편이 맞습니다. Weaviate는 전체를 순회할 때 cursor를 쓰라고 안내하고, Milvus 문서는 SDK의 search iterator에는 16,384 제한이 없다고 밝힙니다.[^weaviate][^milvus]

## 4. 필터와 멀티테넌시는 어떻게 다를까요

메타데이터 필터는 벡터 탐색과 어느 시점에 결합하느냐에 따라 결과가 달라집니다. 제품마다 부르는 이름이 다르므로, 조건을 언제 확인하는지로 나눠 보면 비교가 쉽습니다.

{% include diagram.html src="vector-filter-timing.svg" caption="메타데이터 필터를 탐색 전·후·도중에 적용할 때의 차이" %}

- **탐색 전(사전 필터):** 조건에 맞는 후보 집합을 먼저 정하고 그 안에서만 찾습니다. 조건에 맞는 후보가 아주 적으면 인덱스 대신 남은 후보를 모두 비교하는 정확 검색으로 바꾸는 제품도 있습니다.
- **탐색 후(사후 필터):** ANN으로 후보를 먼저 찾고 조건으로 거릅니다. 조건에 맞는 후보가 적으면 결과가 k개보다 적습니다. 그래서 k개가 찰 때까지 인덱스를 더 탐색하는 기능을 두는 제품이 있습니다.
- **탐색 중(필터 인지 탐색):** 그래프를 따라가며 이웃마다 조건을 확인하고, 맞는 노드만 결과에 넣습니다. 조건에 걸려 빠지는 이웃이 많으면 따라갈 경로가 줄어듭니다. Qdrant와 Weaviate는 이때 걸러진 이웃의 이웃까지 살피는 ACORN 방식을 제공합니다.

| 제품 | 필터를 적용하는 시점 | k개가 안 찰 때 | 멀티테넌시 권장 방식 |
| --- | --- | --- | --- |
| pgvector | 사후 필터(인덱스 스캔 뒤) | iterative scan(0.8.0+, 기본 꺼짐) | 리스트 파티셔닝 또는 테넌트별 테이블 |
| Milvus | 사전 필터(기본) | iterative filtering 옵션 | partition key(수백만 테넌트), database·collection·partition 수준도 가능 |
| Qdrant | payload index로 전략 선택, 좁으면 정확 검색, 아니면 필터 인지 탐색(HNSW), ACORN 옵션(1.16+) | 문서에 없음 | 한 컬렉션 + `is_tenant` 인덱스, 큰 테넌트는 전용 샤드 |
| Weaviate | 사전 필터(허용 목록을 만든 뒤 탐색), ACORN 기본(1.34+) | 문서에 없음 | 네이티브 멀티테넌시(테넌트마다 샤드), 비활성 테넌트 offload(S3 offload 모듈 필요) |
| Chroma | `where`·`where_document`, 적용 시점은 문서에 없음 | 문서에 없음 | tenant·database·collection 계층, 분산 구성은 고객마다 컬렉션 |
| LanceDB | 사전 필터(기본) 또는 사후 필터 | 사후 필터는 limit 미만·0건 가능 | 공식 권장 방식은 문서에 없음 |
| Pinecone | 메타데이터 필터, 적용 시점은 문서에 없음 | 문서에 없음 | 테넌트마다 namespace(따로 저장해 물리적으로 분리) |
| OpenSearch | 필터 인지 탐색(efficient filtering), 좁으면 정확 검색 | k개 보장(대상이 k개 이상일 때), `post_filter`는 미만 가능 | 벡터 검색 문서에 권장 방식 없음 |
| Elasticsearch | 필터 인지 탐색(`knn`의 `filter`) | k개 보장, 다른 절·`post_filter`는 미만 가능 | 벡터 검색 문서에 권장 방식 없음 |
| Vespa | 사전 필터(기본), 적중 비율이 2%(기본값) 미만이면 정확 검색 | 사후 필터는 기본 꺼짐, 켜면 targetHits 자동 상향(기본 최대 20배) | 개인 데이터는 streaming search(정확 검색) |
| MongoDB | 인덱스에 등록한 filter 필드로 사전 필터 | 문서에 없음 | 한 컬렉션 + `tenant_id` 사전 필터, 작은 테넌트가 많으면 flat 인덱스 |
| Redis | 사후 필터를 배치로 반복(배치 모드)과 사전 필터 후 정확 검색 가운데 자동 선택 | 배치 모드는 k개가 찰 때까지 반복 | 전용 가이드 없음, 테넌트별 인덱스 별칭 예시 |

멀티테넌시 권장 방식은 제품 구조를 따라갑니다. Qdrant는 테넌트마다 컬렉션을 만들지 말고 한 컬렉션에 모은 뒤 `is_tenant` 인덱스로 나누라고 안내합니다. MongoDB도 테넌트별 컬렉션·DB를 권하지 않습니다. 반대로 Weaviate는 테넌트마다 샤드를 두는 네이티브 멀티테넌시를, Pinecone은 테넌트마다 namespace를 권합니다. Pinecone 문서는 메타데이터 필터로 테넌트를 나누면 필터와 관계없이 namespace 전체를 스캔하므로 모든 테넌트의 데이터만큼 비용이 든다고 설명합니다.[^qdrant][^mongodb][^weaviate][^pinecone]

## 5. 하이브리드 검색은 어디까지 될까요

의미 검색은 표현이 달라도 관련 문서를 찾지만, 제품 코드나 약어처럼 글자가 정확히 맞아야 하는 질의에는 약합니다. 하이브리드 검색은 벡터 검색과 키워드 검색의 결과를 합쳐 이 약점을 보완합니다.

{% include diagram.html src="vector-hybrid-fusion.svg" caption="벡터 검색과 키워드 검색의 순위를 합친 뒤 필요하면 재순위화하는 흐름" %}

결과를 합치는 방식은 크게 두 가지입니다. RRF(Reciprocal Rank Fusion)는 점수 대신 각 목록의 순위로 1 ÷ (상수 + 순위)를 계산해 더합니다. 점수 분포가 달라도 바로 합칠 수 있고, 여러 제품이 상수 60을 기본으로 씁니다. 점수 기반 결합(선형 결합)은 두 점수를 같은 범위로 정규화한 뒤 가중합합니다. 가중치로 한쪽을 강조할 수 있지만, 정규화 방법에 따라 결과가 달라집니다. 재순위화는 결합한 뒤에 상위 후보의 순서를 모델로 다시 매기는 단계입니다.

| 제품 | 키워드 검색 | 희소 벡터 | 결과 결합 |
| --- | --- | --- | --- |
| pgvector | PostgreSQL 전문 검색과 함께 사용 | `sparsevec` | 내장 결합 없음, RRF·cross-encoder 패턴 안내 |
| Milvus | BM25 function(분석기를 켠 텍스트 필드) | `SPARSE_FLOAT_VECTOR` | RRF(기본 60), Weighted, 요청별 가중 RRF(3.0.1+) |
| Qdrant | text payload index, BM25 희소 임베딩을 서버에서 생성 | 희소 벡터(정확 검색) | Query API의 prefetch와 RRF·DBSF, RRF 가중치(1.17+) |
| Weaviate | BM25F 내장 | 사용자가 넣는 희소 벡터는 문서에 없음 | relativeScoreFusion(기본)·rankedFusion, `alpha` 기본 0.75 |
| Chroma | `$contains`·`$regex` 필터(점수 없음), BM25 희소 임베딩 함수 | 희소 벡터 인덱스(컬렉션 생성 시 선언, 단일 노드 지원은 문서에 없음) | RRF·선형 결합(Search API, Cloud 전용) |
| LanceDB | 네이티브 전문 검색(FTS, BM25) | 문서에 없음 | RRF(기본), 선형 결합, 모델 기반 reranker |
| Pinecone | 전문 검색(BM25, API 2026-07 GA, 서버리스·OnDemand 한정) | 희소 벡터를 밀집 벡터와 한 레코드에 | 전문 검색으로 거른 뒤 밀집 벡터 순위, 또는 클라이언트 RRF·alpha 가중 |
| OpenSearch | BM25 내장 | neural sparse, `sparse_vector`(3.3+) | normalization processor, RRF(2.19+) |
| Elasticsearch | BM25 내장 | `sparse_vector`(ELSER) | `rrf`·`linear` retriever, `text_similarity_reranker` |
| Vespa | `bm25` rank feature(`enable-bm25`) | mapped 텐서 | 랭킹 식, global-phase의 `reciprocal_rank_fusion`·`normalize_linear` |
| MongoDB | MongoDB Search(`$search`) | 문서에 없음 | `$rankFusion`(RRF, 8.0+), `$scoreFusion`(8.3+), `$rerank`(Atlas Preview) |
| Redis | TEXT 필드(기본 스코어러 BM25STD) | 문서의 타입 목록에 없음 | `FT.HYBRID`(8.4+): RRF 기본, LINEAR |

세부 조건에서도 차이가 납니다. MongoDB의 `$rankFusion`·`$scoreFusion`은 페이지네이션을 지원하지 않고 하위 파이프라인을 차례로 실행합니다. Chroma의 Search API는 Chroma Cloud에서만 쓸 수 있습니다. Weaviate는 결합하기 전에 양쪽에서 각각 최소 `offset` + `QUERY_HYBRID_MAXIMUM_RESULTS`(기본 100)개의 후보를 가져옵니다.[^mongodb][^chroma][^weaviate]

## 6. 1억 건이 넘으면 무엇이 달라질까요

### 문서화된 한도와 대규모용 기능

셀프 호스팅 제품의 문서는 벡터 수 상한을 거의 두지 않습니다. 실제 한계는 메모리와 샤드 수, 관리형 플랜의 할당량에서 나옵니다.

| 제품 | 문서화된 한도 | 대규모용 기능 |
| --- | --- | --- |
| pgvector | 비파티션 테이블 32TB(PostgreSQL 기본) | 파티셔닝, halfvec·이진 양자화 인덱스, 병렬 빌드 |
| Milvus | 엔티티 수 무제한, 컬렉션당 샤드 16, 로드할 데이터는 메모리의 90% 미만 | DISKANN·AISAQ, Tiered Storage(2.6.4+), 기본 mmap, GPU 인덱스 |
| Qdrant | 벡터 수 한도는 문서에 없음, Cloud 클러스터당 컬렉션 1,000 | 양자화, cold tier, 사용자 정의 샤딩 |
| Weaviate | 샤드당 한도는 문서에 없음 | 양자화, HFresh 인덱스, 비활성 테넌트 offload(S3 offload 모듈 필요) |
| Chroma | 단일 노드는 보통 1천만 건 미만 규모, Cloud 컬렉션당 500만 건(요청 시 상향) | 분산 구성(SPANN, 오브젝트 스토리지) |
| LanceDB | 한도는 문서에 없음 | 오브젝트 스토리지 위 IVF 인덱스, Enterprise 분산 구성 |
| Pinecone | 인덱스·namespace 레코드 한도는 문서에 없음 | 서버리스 slab 구조, Dedicated Read Nodes |
| OpenSearch | 오픈소스 문서에는 없음, AWS 도메인은 샤드 크기 쿼터 | on_disk 모드, 메모리 최적화 검색(3.1+), GPU 원격 빌드 |
| Elasticsearch | 인덱스당 샤드 1,024, Serverless Vector Database 프로젝트 1TB | bbq_disk(Enterprise), BBQ·int4·int8 |
| Vespa | 노드당 문서 수 한도는 공식 문서에 없음, 벤치마크로 산정 | bfloat16·이진화, streaming search(정확 검색 전용) |
| MongoDB | 벡터 수 한도는 문서에 없음, 인덱스 전체를 메모리에 적재 | 양자화, 전용 Search Nodes, 샤딩 |
| Redis | 한도는 문서에 없음, 데이터와 인덱스 모두 메모리 | SVS-VAMANA 압축, 저정밀 타입, 샤딩 |

### 1억 건 × 768차원이면 메모리는 얼마나 필요할까요

아래는 벡터 1억 개, 768차원, float32, 사본 1개(복제본 없음)를 공식 문서의 산정식에 넣어 계산한 값입니다. HNSW의 m은 여러 제품의 기본값인 16을 넣었습니다. 측정값이 아니며 메타데이터, 필터용 인덱스, 운영체제, JVM 힙은 빠져 있습니다.

| 제품·구성 | 공식 문서의 식 | 1억 × 768차원 |
| --- | --- | --- |
| 원본 벡터(float32) | 벡터 수 × 차원 × 4바이트 | 307.2GB |
| OpenSearch Faiss HNSW | 1.1 × (4 × 차원 + 8 × m) × 벡터 수 | 352GB |
| OpenSearch HNSW + 1비트 이진 양자화 | 1.1 × (차원 ÷ 8 + 8 × m) × 벡터 수 | 24.64GB |
| Elasticsearch `hnsw`(float) | 벡터 수 × 차원 × 4 + 벡터 수 × 4 × m | 313.6GB |
| Elasticsearch `int8_hnsw` | 벡터 수 × (차원 + 16) + 벡터 수 × 4 × m | 84.8GB |
| Elasticsearch `bbq_hnsw` | 벡터 수 × (⌈차원 ÷ 64⌉ × 8 + 14) + 벡터 수 × 4 × m | 17.4GB |
| Qdrant scalar 양자화 + HNSW 그래프 | 벡터 수 × 차원 × 1 + 벡터 수 × m × 2 × 4 × 1.2 | 92.16GB |
| Qdrant binary 양자화 + HNSW 그래프 | 벡터 수 × 차원 ÷ 8 + 벡터 수 × m × 2 × 4 × 1.2 | 24.96GB |
| Weaviate(문서 예시의 maxConnections 64) | 벡터 수 × (차원 × 4 + 64 × 10) | 371.2GB |
| MongoDB scalar / binary 양자화(벡터 RAM) | 원본 벡터 크기 ÷ 3.75 / 원본 벡터 크기 ÷ 24 | 81.92GB / 12.8GB |
| pgvector 저장(vector / halfvec / bit) | 벡터 수 × (4 × 차원 + 8) / (2 × 차원 + 8) / (차원 ÷ 8 + 8) | 308GB / 154.4GB / 10.4GB |

원본 벡터만 300GB를 넘고, HNSW 그래프는 m=16에서 6.4~15GB 정도라서 전체 크기는 양자화가 좌우합니다. 같은 1억 건이라도 float32 HNSW는 300GB대, 8비트 양자화는 80~90GB대, 이진 양자화는 10~25GB대입니다. pgvector 값은 테이블 저장 크기이며, pgvector 문서는 HNSW 인덱스 크기의 산정식을 따로 두지 않습니다.[^opensearch][^elasticsearch][^qdrant][^weaviate][^mongodb][^pgvector]

여기에 곱하고 더할 것이 있습니다. primary와 복제본을 합친 사본마다 같은 메모리가 필요하므로 사본 수만큼 곱합니다. Qdrant는 합계에 약 20% 여유를, MongoDB는 인덱스 전체보다 10% 이상 큰 RAM을 권합니다. JVM 기반 검색 엔진은 힙도 따로 떼어야 합니다. AWS 문서에 따르면 OpenSearch Service는 인스턴스 RAM의 절반을 JVM 힙에 쓰고, k-NN은 기본으로 나머지 절반의 50%까지 씁니다. 그래서 RAM 32GiB 인스턴스에 담을 수 있는 그래프는 8GiB입니다(32 × 0.5 × 0.5). JVM 힙은 최대 32GiB까지만 잡습니다.[^qdrant][^mongodb][^opensearch]

관리형 서비스와 단일 노드의 사이징 안내에 1억 건을 넣으면 다음과 같습니다.[^chroma][^zilliz][^milvus]

| 사이징 안내 | 기준 | 1억 건이면 |
| --- | --- | --- |
| Chroma 단일 노드 | N = R × 0.245(1024차원·메타데이터 3개·짧은 문서 조건, N은 백만 건 단위 최대 컬렉션 크기, R은 RAM GB, 공식 문서의 검증 범위는 약 700만 건) | RAM 약 408GB(검증 범위 밖까지 식을 적용한 계산값) |
| Zilliz Cloud | query CU 하나에 768차원 벡터 Performance-optimized 200만 / Capacity-optimized 800만 / Tiered-storage 4,000만 개 | 50 / 12.5 / 2.5 CU |
| Milvus | 엔티티 2억 건마다 샤드 하나(흔한 방식) / 넣을 데이터 100GB마다 샤드 하나 | 엔티티 기준 샤드 1개 / 데이터 크기 기준 샤드 4개 이상(원본 307GB) |

Chroma 문서는 단일 노드를 보통 1천만 건 미만의 중소 규모용 배포 형태로 설명하므로, 1억 건은 이 범위를 넘습니다.

### 공개 벤치마크로 알 수 있는 것

1억 건 이상에서 이 12개 제품을 같은 조건으로 비교하면서, 비교 대상 벤더가 운영하지도 않는 공개 벤치마크는 찾기 어렵습니다. 공개된 대규모 벤치마크는 대부분 알고리즘 비교이거나 벤더가 만든 도구입니다.[^benchmarks]

| 벤치마크 | 운영 주체 | 규모와 대상 |
| --- | --- | --- |
| ANN-Benchmarks | Bernhardsson·Aumüller·Faithfull(README 기준 더 이상 활발히 유지되지 않음) | 최대 약 1천만 건, 단일 CPU, 알고리즘과 일부 DB |
| big-ann-benchmarks NeurIPS'21 | Microsoft Research India·ITU Copenhagen 등 | 10억 건 데이터셋 6종, 알고리즘 비교 |
| big-ann-benchmarks NeurIPS'23 | NeurIPS'21 조직위 일부와 Pinecone·Zilliz 소속 인원 | 약 1천만~3천만 건, 필터·희소·스트리밍 트랙 |
| SISAP Indexing Challenge 2023·2024 | 학계(SISAP) | LAION2B의 1억 건 부분집합, 인덱스 알고리즘 비교 |
| VectorDBBench | Zilliz 후원 | 제품·관리형 비교 도구, LAION 1억 건·768차원 케이스 포함 |

1억 건 이상에서는 결국 우리 데이터로 직접 재 보고 골라야 합니다. VectorDBBench의 1억 건 케이스는 시작점으로 쓸 수 있지만, 비교 대상 가운데 하나를 만든 회사가 후원하는 도구라는 점을 감안해야 합니다. 1편에서 정리한 대로 같은 데이터·필터·recall 목표에서 p95·p99 지연과 비용을 함께 기록합니다.

## 7. 수평 샤딩과 수직 확장은 얼마나 쉬울까요

수평 확장은 두 갈래입니다. 데이터를 샤드로 나눠 여러 노드에 분산하면 담을 수 있는 규모가 커지고 적재 속도가 빨라지며, 복제본을 늘리면 읽기 처리량이 늘어납니다. 비교할 때 가장 중요한 질문은 **샤드 수를 나중에 바꿀 수 있는가**입니다. 샤드 수가 생성 시점에 고정되는 제품은 처음 잡은 값이 이후의 확장 여지를 결정합니다.

| 제품 | 샤딩 | 샤드 수 변경 | 읽기 확장·수직 확장 |
| --- | --- | --- | --- |
| pgvector | 자체 기능 없음, Citus·PgDog 같은 외부 수단 | 외부 도구의 영역 | 읽기 복제본, HNSW 빌드 속도는 `maintenance_work_mem`에 좌우 |
| Milvus | 컬렉션을 만들 때 샤드 수 지정(기본 1, 최대 16) | 변경 방법은 문서에 없음 | 무상태 노드 추가, in-memory replica, 로드할 데이터는 메모리의 90% 미만 |
| Qdrant | `shard_number`(기본은 생성 시점의 노드 수), 사용자 정의 샤딩 | 리샤딩은 Cloud 전용, 셀프 호스팅은 컬렉션 재생성 | 복제로 읽기 확장, 노드당 샤드 2개 이상 권장 |
| Weaviate | 해시 샤딩, 샤드 설정은 생성 후 변경 불가 | 리샤딩 방법은 문서에 없음, 노드를 추가해도 기존 샤드는 그대로(1.32부터 복제본의 노드 간 이동 가능) | 복제본은 질의 처리량, 샤드는 적재 속도 확장 |
| Chroma | 분산·Cloud는 컬렉션 단위로 샤딩 | 컬렉션 하나를 나누는 방법은 문서에 없음 | 단일 노드는 RAM이 컬렉션 크기 상한, 질의 병렬도는 vCPU 수까지 |
| LanceDB | OSS는 단일 프로세스 | 문서에 없음 | Enterprise는 질의 노드와 인덱서를 따로 확장, 분산 검색의 동적 확장은 예정 기능 |
| Pinecone | 서버리스는 자동 확장 | Dedicated Read Nodes는 샤드·복제본 수를 수동 조정(프로젝트당 노드 20, 설정 변경은 10분에 한 번) | 복제본을 늘려 읽기 처리량, 샤드를 늘려 저장 용량 확장 |
| OpenSearch | primary 샤드 수는 생성 시 지정 | split·shrink로 새 인덱스 생성 | 복제본 수는 동적, 노드를 추가하면 자동 리밸런싱 |
| Elasticsearch | primary 샤드 수는 생성 시 고정(인덱스당 최대 1,024) | split(원본은 읽기 전용)·shrink로 새 인덱스 생성 | 복제본 수는 동적, 자동 리밸런싱, Serverless는 Elastic이 샤딩을 관리 |
| Vespa | bucket 단위 자동 분산, 샤드를 사람이 정하지 않음 | 노드를 늘리거나 줄이면 자동 재분배 | 그룹(데이터 전체 사본)으로 처리량 확장, 노드 리소스를 바꾸면 보통 노드 전체 교체(Cloud) |
| MongoDB | MongoDB 샤딩, `mongos`가 모든 샤드에 질의 | `reshardCollection`(8.0+는 같은 샤드 키로도 재분배), 끝나면 검색 인덱스를 수동 재빌드 | Search Nodes는 리전당 2~32개, 확장하면 인덱스 재빌드(AWS·Azure는 조건에 따라 저장된 인덱스 사본 사용) |
| Redis | 클러스터에서 문서 ID로 인덱스를 나누고 모든 샤드 결과를 병합 | Redis Software는 리샤딩 지원(옮긴 데이터의 인덱스를 동기 생성) | `search-workers`, query performance factor(최대 16배, Software·Cloud Pro) |

Qdrant 문서는 샤드 수를 처음에 넉넉히 잡으라고 안내합니다. 노드당 샤드를 2개 이상 두고, 크게 늘어날 예정이면 12개로 시작하라고 권합니다. 12개면 노드를 1, 2, 3, 6, 12대로 늘릴 때 리샤딩 없이 고르게 나눌 수 있기 때문입니다. OpenSearch와 Elasticsearch의 split은 새 인덱스를 만들며, 목표 샤드 수는 원래 샤드 수의 배수여야 합니다.[^qdrant][^opensearch][^elasticsearch]

수직 확장에서는 메모리가 먼저 막힙니다. MongoDB는 인덱스 전체를, Redis는 데이터와 인덱스를 메모리에 둡니다. Weaviate 문서는 메모리가 데이터셋 크기의 상한을, CPU가 질의·적재 속도를 정한다고 설명합니다. Vespa Cloud에서 노드의 vCPU·메모리·디스크를 바꾸면 보통 새 노드를 할당해 클러스터의 노드를 모두 교체하고 문서를 재분배합니다.[^mongodb][^redis][^weaviate][^vespa]

## 8. 라이선스와 비용은 어떻게 볼까요

코어 라이선스는 1편에서 정리했습니다. 선택에 더 직접 걸리는 것은 **기능 단위의 조건**입니다. 같은 제품이라도 에디션이나 배포 형태, 추가 모듈에 따라 쓸 수 있는 기능이 다릅니다.

- **Elasticsearch:** 디스크 친화 인덱스 `bbq_disk`에는 Enterprise 구독이 필요하고, 기본 인덱스 종류도 라이선스에 따라 달라집니다.[^elasticsearch]
- **Qdrant:** 기존 컬렉션의 샤드 수를 바꾸는 리샤딩은 Qdrant Cloud에서만 지원합니다.[^qdrant]
- **Chroma:** RRF 하이브리드를 포함한 Search API는 Chroma Cloud 전용입니다.[^chroma]
- **MongoDB:** 재순위화 단계 `$rerank`는 Atlas에서만 쓰는 Preview 기능이고, 전용 Search Nodes도 Atlas 기능입니다.[^mongodb]
- **Redis:** LVQ·LeanVec 압축은 Intel 플랫폼 전용이고, Redis Open Source에서는 RSALv2 배포판을 Intel SVS 옵션으로 빌드해야 쓸 수 있습니다. query performance factor는 Redis Software(7.4.2-54 이상)와 Redis Cloud Pro(Redis 7.2 이상)에서 제공합니다.[^redis]
- **LanceDB:** 인덱스 자동 관리, 기본 strong consistency, 여러 노드로 나눈 구성은 Enterprise의 기능입니다.[^lancedb]
- **Pinecone:** 관리형 전용입니다. Dedicated Read Nodes는 Standard·Enterprise 플랜, BYOC는 Enterprise 플랜에서 씁니다.[^pinecone]
- **Weaviate:** 비활성 테넌트를 클라우드 스토리지로 내리는 offload에는 S3 offload 모듈이 필요합니다.[^weaviate]

관리형 서비스는 과금 단위가 서로 다릅니다. 금액은 자주 바뀌므로 단위만 정리합니다.[^pricing]

| 관리형 서비스 | 과금 단위 |
| --- | --- |
| Pinecone | read unit(RU)·write unit·저장 GB·egress(질의는 namespace 1GB당 1 RU, 최소 0.25 RU) |
| Zilliz Cloud | CU·쓰기·읽기·저장·백업·Pipelines 비용 항목 |
| Qdrant Cloud | vCPU·메모리·디스크 등의 사용 시간 |
| Weaviate Cloud | 저장한 벡터 차원 수·저장 GiB·백업 |
| Chroma Cloud | 쓴 GiB·월 저장 GiB·조회 TiB·반환 GiB |
| MongoDB Atlas | 클러스터·Search Nodes의 사용 시간 |
| Redis Cloud | 플랜별 사용 시간(Pro는 월 최소액) |
| Elastic Cloud | Hosted는 RAM 크기(GB)와 사용 시간, Serverless는 VCU·저장 GB |
| Amazon OpenSearch Service | 인스턴스 사용 시간·스토리지·데이터 전송, Serverless는 OCU 사용 시간·저장 |
| Vespa Cloud | vCPU·메모리 GB·디스크 GB·GPU 메모리 GB의 사용 시간 |
| LanceDB Enterprise | 가격 페이지에 과금 단위 없음(문의 양식) |

과금 단위는 설계에도 영향을 줍니다. Pinecone은 질의 비용이 namespace 크기에 비례하므로(1GB당 1 RU), 테넌트를 namespace로 나누면 질의 한 번이 훑는 데이터가 줄어듭니다. Weaviate Cloud는 저장한 벡터 차원 수를, Chroma Cloud는 조회한 데이터 양을 과금 단위로 씁니다. 같은 데이터라도 차원 수와 테넌트 분할, 질의 패턴에 따라 비용 구조가 달라집니다.[^pinecone][^pricing]

## 9. 상황별로 어떤 후보부터 볼까요

아래는 앞의 비교에서 나온 **먼저 검토할 후보**입니다. 순위가 아니며, 후보를 좁힌 뒤에는 1편의 순서대로 같은 조건에서 측정해야 합니다.

| 상황 | 먼저 볼 후보 | 근거 |
| --- | --- | --- |
| 이미 PostgreSQL을 운영하고 트랜잭션·단일 DB 구성이 중요함 | pgvector | SQL·JOIN·트랜잭션 활용(1편), 사후 필터는 iterative scan으로 보완(3·4절) |
| 검색 엔진을 운영하고 키워드 검색이 중요함 | OpenSearch, Elasticsearch, Vespa | BM25와 결합 기능 내장, 사전 필터·필터 인지 탐색(4·5절) |
| 테넌트가 수만 곳 이상인 SaaS | Weaviate, Qdrant, Milvus, Pinecone(Standard 플랜 이상) | 테넌트별 샤드, `is_tenant`, partition key, namespace(4절) |
| 1억 건 이상에서 메모리 비용을 줄여야 함 | Milvus, OpenSearch, Qdrant, Elasticsearch, LanceDB | 디스크 인덱스·이진 양자화·오브젝트 스토리지(2·6절), Elasticsearch의 `bbq_disk`는 Enterprise |
| 질의당 결과를 1만 개 넘게 받아야 함 | Milvus(16,384), Redis(Open Source 기본 1,000,000) | 문서화된 한도가 1만보다 큼(3절), Qdrant·LanceDB는 상한이 문서에 없음 |
| 애플리케이션에 내장하거나 로컬 개발 환경에서 시작 | Chroma, LanceDB, Milvus Lite | 임베디드·로컬 실행(Milvus Lite는 FLAT 인덱스만 지원[^milvus]) |
| 운영 인력을 최소로 두어야 함 | Pinecone, Zilliz Cloud, Qdrant Cloud, Weaviate Cloud, MongoDB Atlas 같은 관리형 | 8절의 과금 단위로 비용 구조를 먼저 비교 |
| 검색 시점의 랭킹 식을 직접 설계해야 함 | Vespa | 단계별 랭킹(first·second·global-phase, 5절) |

## 정리

벡터 DB 12종은 이름보다 한도와 조건에서 더 크게 갈립니다. 필터를 언제 적용하는지, 질의당 k가 어디서 막히는지, 샤드 수를 나중에 바꿀 수 있는지, 대규모 기능이 어느 에디션에 있는지를 먼저 확인하면 후보가 줄어듭니다.

1억 건 규모에서는 제품보다 **양자화와 디스크 인덱스 선택**이 필요한 메모리를 좌우합니다. 같은 1억 건이 float32 HNSW로는 300GB대, 이진 양자화로는 10~25GB대가 됩니다. 중립적인 대규모 제품 벤치마크를 찾기 어려우므로, 마지막 판단은 우리 데이터와 목표 recall에서 잰 결과로 내리는 것이 좋습니다.

## 참고 자료

[^pgvector]: [pgvector README](https://github.com/pgvector/pgvector), [CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md), [src/hnsw.h](https://github.com/pgvector/pgvector/blob/master/src/hnsw.h), [src/hnsw.c](https://github.com/pgvector/pgvector/blob/master/src/hnsw.c). 정확·근사 검색, 사후 필터와 iterative scan, 저장 크기, 파티셔닝과 확장 방식. `hnsw.ef_search` 상한 1,000과 iterative scan 기본값은 소스 코드 기준.
[^milvus]: [Milvus Limitations](https://milvus.io/docs/limitations.md), [Index Explained](https://milvus.io/docs/index-explained.md), [DISKANN](https://milvus.io/docs/diskann.md), [Tiered Storage](https://milvus.io/docs/tiered-storage-overview.md), [GPU Index](https://milvus.io/docs/gpu_index.md), [Filtered Search](https://milvus.io/docs/filtered-search.md), [Search Iterator](https://milvus.io/docs/with-iterators.md), [RRF Ranker](https://milvus.io/docs/rrf-ranker.md), [Multi-tenancy](https://milvus.io/docs/multi_tenancy.md), [Create Collection](https://milvus.io/docs/create-collection.md), [Milvus Lite](https://milvus.io/docs/milvus_lite.md). topK·샤드·엔티티 한도, 인덱스와 압축, 필터, 샤드 수 기준, 멀티테넌시, Milvus Lite의 인덱스 제약.
[^zilliz]: [Zilliz Cloud Limits](https://docs.zilliz.com/docs/limits), [CU Types Explained](https://docs.zilliz.com/docs/cu-types-explained). 플랜별 topK·샤드 한도, query CU 하나에 담기는 768차원 벡터 수.
[^qdrant]: [Qdrant — Indexing](https://qdrant.tech/documentation/manage-data/indexing/), [Quantization](https://qdrant.tech/documentation/manage-data/quantization/), [Search](https://qdrant.tech/documentation/search/search/), [Hybrid Queries](https://qdrant.tech/documentation/search/hybrid-queries/), [Multitenancy](https://qdrant.tech/documentation/manage-data/multitenancy/), [Distributed Deployment](https://qdrant.tech/documentation/scaling/distributed_deployment/), [Capacity Planning](https://qdrant.tech/documentation/capacity-planning/), [Collections](https://qdrant.tech/documentation/manage-data/collections/), [Running with GPU](https://qdrant.tech/documentation/ops-configuration/running-with-gpu/). 필터 인지 HNSW와 ACORN, 양자화, 리샤딩 조건, 메모리 산정식, 벡터 저장 위치와 메모리 계층, GPU 인덱스 빌드.
[^weaviate]: [Weaviate — Vector Index](https://docs.weaviate.io/weaviate/concepts/vector-index), [Vector Quantization](https://docs.weaviate.io/weaviate/concepts/vector-quantization), [Filtering](https://docs.weaviate.io/weaviate/concepts/filtering), [Search Basics](https://docs.weaviate.io/weaviate/search/basics), [Hybrid Search](https://docs.weaviate.io/weaviate/concepts/search/hybrid-search), [Multi-tenancy](https://docs.weaviate.io/weaviate/manage-collections/multi-tenancy), [Cluster Architecture](https://docs.weaviate.io/weaviate/concepts/cluster), [Resource Planning](https://docs.weaviate.io/weaviate/concepts/resources), [Environment Variables](https://docs.weaviate.io/deploy/configuration/env-vars). 결과 한도, 필터 전략, 멀티테넌시, 샤드·복제, 메모리 산정식.
[^chroma]: [Chroma — Architecture](https://docs.trychroma.com/reference/architecture/overview), [Configure Collections](https://docs.trychroma.com/docs/collections/configure), [Quotas & Limits](https://docs.trychroma.com/cloud/quotas-limits), [Single-Node Performance](https://docs.trychroma.com/guides/performance/single-node), [Distributed Architecture](https://docs.trychroma.com/reference/architecture/distributed), [Search API](https://docs.trychroma.com/cloud/search-api/overview), [Index Reference](https://docs.trychroma.com/cloud/schema/index-reference). 배포 형태별 규모, 인덱스와 희소 벡터 인덱스 제약, Cloud 한도, 단일 노드 사이징 공식, 분산 구성.
[^lancedb]: [LanceDB — Vector Index](https://docs.lancedb.com/indexing/vector-index), [Filtering](https://docs.lancedb.com/search/filtering), [Hybrid Search](https://docs.lancedb.com/search/hybrid-search), [Enterprise](https://docs.lancedb.com/enterprise/index), [OSS FAQ](https://docs.lancedb.com/faq/faq-oss), [Enterprise FAQ](https://docs.lancedb.com/faq/faq-enterprise). 인덱스와 양자화, 사전·사후 필터, 하이브리드, OSS와 Enterprise의 차이.
[^pinecone]: [Pinecone — Operation Limits](https://docs.pinecone.io/reference/api/database-limits/operation-limits), [Object Limits](https://docs.pinecone.io/reference/api/database-limits/object-limits), [Database Architecture](https://docs.pinecone.io/guides/core-concepts/architecture), [Hybrid Search](https://docs.pinecone.io/guides/search/hybrid-search), [Implement Multitenancy](https://docs.pinecone.io/guides/index-data/implement-multitenancy), [Dedicated Read Nodes](https://docs.pinecone.io/guides/index-data/dedicated-read-nodes/overview), [Understanding Cost](https://docs.pinecone.io/guides/manage-cost/understanding-cost), [2026 Release Notes](https://docs.pinecone.io/release-notes/2026). top_k·응답 크기 한도, namespace 멀티테넌시, 플랜별 기능, 과금 단위.
[^opensearch]: [OpenSearch — Methods and Engines](https://docs.opensearch.org/3.8/mappings/supported-field-types/knn-methods-engines/), [k-NN Query](https://docs.opensearch.org/3.8/query-dsl/specialized/k-nn/index/), [Filtering](https://docs.opensearch.org/3.8/vector-search/filter-search-knn/index/), [Disk-based Vector Search](https://docs.opensearch.org/3.8/vector-search/optimizing-storage/disk-based-vector-search/), [Binary Quantization](https://docs.opensearch.org/3.8/vector-search/optimizing-storage/binary-quantization/), [Hybrid Search RRF](https://docs.opensearch.org/3.8/vector-search/ai-search/hybrid-search/rrf/), [Split Index](https://docs.opensearch.org/3.8/api-reference/index-apis/split/), [Amazon OpenSearch Service k-NN](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/knn.html), [Amazon OpenSearch Service Quotas](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/limits.html). 엔진과 인덱스, k 한도, 필터, 메모리 산정식, 샤드 변경.
[^elasticsearch]: [Elasticsearch — dense_vector](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/dense-vector), [knn Query](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-knn-query), [Filtered kNN Search](https://www.elastic.co/docs/solutions/search/vector/knn/filtered-knn-search), [Tune Approximate kNN Search](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/approximate-knn-search), [Index Settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/index-modules), [Split Index API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-split), [Retrievers](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/retrievers), [Serverless Differences](https://www.elastic.co/docs/deploy-manage/deploy/elastic-cloud/differences-from-other-elasticsearch-offerings). 인덱스 종류와 기본값, k·num_candidates 한도, 필터, 메모리 산정식, 샤드 설정, Serverless 한도.
[^vespa]: [Vespa — Approximate Nearest Neighbor Search using HNSW](https://docs.vespa.ai/en/querying/approximate-nn-hnsw.html), [Nearest Neighbor Search](https://docs.vespa.ai/en/querying/nearest-neighbor-search.html), [Schema Reference](https://docs.vespa.ai/en/reference/schemas/schemas.html), [Query API Reference](https://docs.vespa.ai/en/reference/api/query.html), [Phased Ranking](https://docs.vespa.ai/en/ranking/phased-ranking.html), [Content Cluster Elasticity](https://docs.vespa.ai/en/content/elasticity.html), [Streaming Search](https://docs.vespa.ai/en/performance/streaming-search.html), [Sizing Search](https://docs.vespa.ai/en/performance/sizing-search.html), [Autoscaling](https://docs.vespa.ai/en/operations/autoscaling.html). targetHits·maxHits, 필터 임계값, 단계별 랭킹, 자동 분산과 노드 교체.
[^mongodb]: [MongoDB — Index Fields for Vector Search](https://www.mongodb.com/docs/vector-search/indexes/vector-search-type/), [$vectorSearch](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/), [Deployment Options](https://www.mongodb.com/docs/vector-search/deployment/deployment-options/), [Multi-Cloud Distribution](https://www.mongodb.com/docs/atlas/cluster-config/multi-cloud-distribution/), [Multi-Tenant Architecture](https://www.mongodb.com/docs/vector-search/deployment/multi-tenant-architecture/), [Hybrid Search](https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/), [$rerank](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/rerank/), [Reshard a Collection](https://www.mongodb.com/docs/manual/core/sharding-reshard-a-collection/). limit·numCandidates 한도, 사전 필터, 메모리와 양자화, Search Nodes, 리샤딩 후 재빌드.
[^redis]: [Redis — Vectors](https://redis.io/docs/latest/develop/ai/search-and-query/vectors/), [SVS Compression](https://redis.io/docs/latest/develop/ai/search-and-query/vectors/svs-compression/), [Configuration Parameters](https://redis.io/docs/latest/develop/ai/search-and-query/administration/configuration/), [FT.HYBRID](https://redis.io/docs/latest/commands/ft.hybrid/), [Technical Overview](https://redis.io/docs/latest/develop/ai/search-and-query/administration/overview/), [Redis Search in Redis Software](https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/search/), [Query Performance Factor](https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/search/query-performance-factor/), [Redis Cloud Advanced Capabilities](https://redis.io/docs/latest/operate/rc/databases/configuration/advanced-capabilities/). 인덱스와 압축, KNN과 LIMIT 한도, 필터 모드, 하이브리드, 클러스터와 리샤딩.
[^pricing]: [Pinecone Pricing](https://www.pinecone.io/pricing/), [Qdrant Pricing](https://qdrant.tech/pricing/), [Weaviate Pricing](https://weaviate.io/pricing), [Chroma Pricing](https://www.trychroma.com/pricing), [Zilliz Cloud Cost](https://docs.zilliz.com/docs/analyze-cost), [MongoDB Pricing](https://www.mongodb.com/pricing), [Redis Pricing](https://redis.io/pricing/), [Elastic Cloud Hosted Billing](https://www.elastic.co/docs/deploy-manage/cloud-organization/billing/cloud-hosted-deployment-billing-dimensions), [Elasticsearch Serverless Billing](https://www.elastic.co/docs/deploy-manage/cloud-organization/billing/elasticsearch-billing-dimensions), [Amazon OpenSearch Service Pricing](https://aws.amazon.com/opensearch-service/pricing/), [Vespa Cloud Price Calculator](https://cloud.vespa.ai/price-calculator.html), [LanceDB Pricing](https://lancedb.com/pricing). 관리형 서비스별 과금 단위(2026-09-27 조회).
[^benchmarks]: [ANN-Benchmarks](https://github.com/erikbern/ann-benchmarks), [big-ann-benchmarks NeurIPS'21](https://big-ann-benchmarks.com/neurips21.html), [NeurIPS'23](https://big-ann-benchmarks.com/neurips23.html), [SISAP 2023](https://sisap-challenges.github.io/2023/), [SISAP 2024 Tasks](https://sisap-challenges.github.io/2024/tasks/), [VectorDBBench](https://github.com/zilliztech/VectorDBBench). 운영 주체, 데이터 규모, 비교 대상.
