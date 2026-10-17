---
date: 2026-10-17 00:00:00 +0900
title: "벡터는 어떻게 설계할까: 벡터 구조부터 청킹 전략까지"
category: ai/ml
excerpt: "레코드에 dense·sparse 벡터를 어떻게 두는지, 원문을 어떤 단위로 잘라 벡터로 만드는지를 작은 예제와 함께 정리합니다. 모델의 차원·입력 길이 제약, 청크 크기 실험 결과, 분할 방식과 부모-자식 검색 구성을 공식 문서와 공개 실험에 근거해 다룹니다."
last_modified_at: 2026-10-17
series: "벡터 DB"
series_index: "5 / 5"
---

**시리즈** · [1. 개념과 제품·사용 지표](/writing/vector-database-overview/) · [2. 선택 기준과 기능 비교](/writing/vector-database-selection/) · [3. AWS 전용 벡터 검색](/writing/aws-vector-search/) · [4. 스키마와 컬렉션 설계](/writing/vector-database-schema-design/) · **5. 벡터 구조와 청킹 전략**

[4편](/writing/vector-database-schema-design/)에서 사내 문서 검색 서비스의 컬렉션을 나눴습니다. 이제 그 안에 레코드를 넣을 차례입니다. 그런데 50쪽짜리 취업규칙을 통째로 벡터 하나로 만들면 “연차휴가는 언제 생기나요?”라는 질문에 맞는 조항을 집어내기 어렵습니다. 50쪽 분량은 대부분의 임베딩 모델 입력 상한을 넘어서 뒷부분이 잘리고, 들어간 부분도 숫자 배열 하나에 뭉뚱그려 담기기 때문입니다. 반대로 문장마다 벡터를 만들면 “이 조항은 계약직에는 적용하지 않습니다” 같은 문장은 ‘이 조항’이 어떤 조항인지 담지 못한 채 저장됩니다.

벡터를 설계할 때는 두 가지를 정합니다. 하나는 **레코드에 어떤 벡터를 둘지**(벡터 구조)이고 다른 하나는 **원문을 어떤 단위로 잘라 벡터로 만들지**(청킹 전략)입니다. 컬렉션을 나누는 기준이 성능과 운영을 좌우했듯이 검색 결과의 품질은 벡터 구조와 청킹 전략에 달려 있습니다.

**이 글에서 알 수 있는 것**

- dense 벡터와 sparse 벡터의 차이, 각각을 저장하는 형식
- 레코드 하나에 dense·sparse 벡터를 함께 두고 두 검색 결과를 합치는 하이브리드 검색 구성
- 임베딩 모델이 정하는 벡터 차원과 최대 입력 길이, 입력 길이에 따른 청크 크기 제한
- 청크 크기가 답변 품질과 응답 시간에 주는 영향을 측정한 공개 실험
- 크기·구분자·문서 구조·의미로 나누는 분할 방식과, 작은 청크로 찾고 큰 맥락을 넘기는 검색 구성

이 글의 문서 조사 기준일은 2026년 10월 17일입니다. LangChain은 `langchain-text-splitters` 1.1.3, LlamaIndex는 `llama-index-core` 0.14.25, Milvus는 v3.0.x 문서를 기준으로 합니다. 예제에 쓴 문서·데이터·숫자는 설명을 위해 만든 것입니다.

## 1. 먼저 알아 둘 용어는 무엇일까요

임베딩·차원·컬렉션·레코드는 [4편의 용어 표](/writing/vector-database-schema-design/)에서 정리했습니다. 이 글에서 새로 자주 나오는 용어는 다음과 같습니다.

| 용어 | 쉬운 설명 |
| --- | --- |
| 임베딩 모델 | 텍스트를 받아 벡터(숫자 배열)를 돌려주는 모델입니다. 모델마다 정해진 길이의 벡터를 냅니다. |
| 코사인 유사도 | 두 벡터가 가리키는 방향이 얼마나 비슷한지를 -1에서 1 사이 값으로 나타냅니다. 1에 가까울수록 비슷합니다. |
| LLM·RAG | LLM(대규모 언어 모델)은 ChatGPT에 쓰이는 GPT처럼 문장을 생성하는 모델입니다. RAG(검색 증강 생성)는 질문과 관련된 문서를 먼저 검색해 LLM에 함께 넘기고 답을 만들게 하는 방식입니다. |
| 토큰(token) | 모델이 텍스트를 읽는 단위입니다. 단어 하나가 토큰 하나일 수도, 여러 토큰으로 쪼개질 수도 있습니다. |
| 청크(chunk) | 원문을 잘라 만든 조각입니다. 벡터 하나는 보통 청크 하나로 만듭니다. |
| 청킹(chunking) | 원문을 청크로 나누는 작업입니다. 텍스트 분할(text splitting)이라고도 부릅니다. |
| dense 벡터 | 길이가 정해진 실수 배열이고 값 대부분이 0이 아닌 벡터입니다. 문장의 의미를 담습니다. |
| sparse 벡터 | 차원은 매우 많지만 값 대부분이 0인 벡터입니다. 어떤 단어(토큰)가 얼마나 중요한지를 담습니다. |
| 역색인(inverted index) | 책 뒤의 찾아보기처럼 단어마다 그 단어가 들어 있는 문서 목록을 적어 둔 색인입니다. 검색 엔진의 키워드 검색이 이 구조를 씁니다. |
| ANN(Approximate Nearest Neighbor) | 정확도를 조금 양보하고 가까운 벡터를 빠르게 찾는 근사 검색입니다. HNSW(Hierarchical Navigable Small World)가 대표적인 ANN 인덱스입니다. |
| 하이브리드 검색(hybrid search) | 의미 검색과 키워드 검색처럼 성격이 다른 검색을 함께 실행하고 결과를 합치는 방식입니다. |
| 오버랩(overlap) | 이웃한 두 청크가 겹치는 부분입니다. 앞 청크의 끝부분을 다음 청크 앞에 다시 넣습니다. |
| top_k | 검색 한 번에 돌려받는 결과의 개수입니다. top_k가 2이면 가장 가까운 청크 2개를 받습니다. |

문서 한 편은 이런 흐름으로 레코드가 됩니다. 원문을 청크로 자르고 청크마다 임베딩 모델로 벡터를 만든 다음 ID·원문·벡터·메타데이터를 레코드 하나로 저장합니다. 질문이 들어오면 질문도 같은 모델로 벡터로 바꾼 뒤 가까운 레코드를 찾습니다.

{% include diagram.html src="vdesign-chunk-to-record.svg" caption="문서를 청크로 자르고 청크마다 벡터를 만들어 레코드로 저장합니다" %}

## 2. dense 벡터와 sparse 벡터는 무엇이 다를까요

벡터 DB에 저장하는 벡터는 크게 dense 벡터와 sparse 벡터로 나뉩니다. 둘 다 숫자 배열이지만 숫자 하나하나가 뜻하는 것이 다릅니다.

### dense 벡터: 의미를 좌표로 나타냅니다

**dense 벡터**는 길이가 정해진 실수 배열로, 값 대부분이 0이 아닙니다. 텍스트를 임베딩하면 `[-0.013052909, 0.020387933, -0.007869, ...]`처럼 수십에서 수천 개의 숫자로 표현합니다.[^milvus-dense] 각 숫자는 다차원 공간의 좌표에 해당하며 의미가 비슷한 텍스트의 벡터가 서로 가까워지도록 학습합니다.[^pinecone-terms] 지금까지 시리즈에서 “벡터”라고 부른 것이 dense 벡터입니다.

숫자 하나하나에는 사람이 읽을 수 있는 이름이 없습니다. 첫 번째 숫자가 ‘휴가’를, 두 번째 숫자가 ‘급여’를 뜻하는 식이 아닙니다. 대신 벡터 전체가 공간의 한 점이 되고 점 사이의 거리나 방향이 의미의 차이를 나타냅니다. 그래서 “휴가는 며칠인가요?”와 “연차는 15일입니다”처럼 같은 단어가 하나도 없는 두 문장도 의미가 비슷하면 가까운 벡터가 될 수 있습니다.

### sparse 벡터: 단어마다 자리가 정해져 있습니다

**sparse 벡터**는 반대로 자리마다 뜻이 정해져 있습니다. 작은 예로 시스템이 아는 단어가 아래 10개뿐이라고 가정해 봅시다.

```text
0: 급여   1: 기준   2: 산정   3: 연차휴가   4: 입사일
5: 출장   6: 퇴직   7: 평가   8: 휴직   9: 계약직
```

“연차휴가는 입사일을 기준으로 산정합니다”에는 이 가운데 4개(기준·산정·연차휴가·입사일)가 나옵니다. 단어마다 그 문장에서 얼마나 중요한지를 점수로 매기면 나머지 6자리는 0이 됩니다(점수는 설명을 위해 정한 값입니다).

```text
[0, 0.4, 0.5, 0.9, 0.8, 0, 0, 0, 0, 0]
```

실제 어휘는 훨씬 큽니다. BERT(Google이 공개한 언어 모델)의 영어 모델 `bert-base-uncased`는 어휘(모델이 아는 토큰 전체)가 30,522개입니다.[^bert] 이런 어휘로 문장 하나를 표현하면 3만 개 넘는 자리 가운데 0이 아닌 값은 몇 개뿐이라서 sparse(희소) 벡터라고 부릅니다. 각 차원은 보통 어휘(vocabulary)의 토큰 하나에 대응하고 0이 아닌 값은 그 토큰이 문서에서 얼마나 중요한지를 나타냅니다.[^pinecone-terms] BM25(단어의 빈도와 희소성으로 점수를 매기는 키워드 검색 방식)처럼 문서에 나온 단어만 세는 방식에서는 문서에 나오지 않은 단어의 자리가 모두 0이 됩니다.[^milvus-sparse]

### sparse 벡터는 0이 아닌 값만 저장합니다

3만 개 넘는 숫자를 대부분 0인 채로 모두 저장하면 공간이 낭비되므로 sparse 벡터는 **0이 아닌 값과 그 위치만 저장**해 메모리를 아낍니다.[^milvus-sparse] 위의 예는 전체 길이 10과 위치 `[1, 2, 3, 4]`, 값 `[0.4, 0.5, 0.9, 0.8]`만 있으면 원래 배열을 다시 만들 수 있습니다. dense 벡터는 모든 차원의 값을 고정된 길이로 저장합니다.

Qdrant는 sparse 벡터를 위치(`indices`)와 값(`values`) 두 배열로 받습니다.[^qdrant-vectors]

```json
{ "indices": [1, 3, 5, 7], "values": [0.1, 0.2, 0.3, 0.4] }
```

이 벡터를 0까지 모두 펼치면 8번째 자리까지 `[0, 0.1, 0, 0.2, 0, 0.3, 0, 0.4]`입니다. 실제 sparse 벡터는 차원이 어휘 크기만큼 크므로 이렇게 펼쳐서 저장하지 않습니다. 다른 제품의 형식을 보면 Pinecone도 `sparse_values` 안에 `indices`·`values`를 받습니다.[^pinecone-upsert] Milvus는 `{27: 0.5, 100: 0.3, 5369: 0.6}`처럼 위치를 키로 하는 사전 형식을 받습니다.[^milvus-sparse] Elasticsearch의 `sparse_vector` 필드는 `{"token_a": 0.5, "token_b": 0.8}`처럼 위치 번호 대신 토큰 문자열을 키로 씁니다.[^es-sparse]

### sparse 벡터는 어떻게 만들까요

자리마다 넣을 점수를 정하는 방법은 두 갈래입니다.

- **통계 기반:** BM25는 단어가 문서에 몇 번 나오는지(빈도)와 전체 문서에서 얼마나 드문지로 가중치를 매기고 문서 길이도 반영합니다.[^bm25] 다른 조건이 같다면 여러 문서에 흔히 나오는 단어보다 몇몇 문서에만 나오는 단어가 더 높은 점수를 받습니다. Milvus는 원문 텍스트 필드를 BM25 sparse 벡터로 바꿔 주는 내장 함수를 제공합니다.[^milvus-fts]
- **학습 기반:** 모델이 토큰마다 가중치를 예측합니다. 문서에 없는 관련 단어(예: ‘연차휴가’ 문서에 없는 ‘휴일’)까지 가중치를 줄 수 있습니다. SPLADE는 BERT가 가려진 단어를 맞히도록 학습한 부분(MLM 헤드)을 이용해 문서에 없는 관련 단어에도 가중치를 주도록(sparse 확장) 학습합니다.[^splade] Elastic의 ELSER(Elastic Learned Sparse EncodeR)도 학습 기반 sparse 모델입니다.[^es-elser] BGE-M3는 dense 벡터와 함께 토큰별 가중치(`lexical_weights`)를 출력합니다.[^bge-m3]

### 두 벡터는 어떤 검색에 맞을까요

| 구분 | dense 벡터 | sparse 벡터 |
| --- | --- | --- |
| 담는 정보 | 문장 전체의 의미 | 토큰별 중요도 |
| 차원 | 모델이 정한 고정 길이(예: 1024) | 어휘 크기만큼, 0이 아닌 값만 저장 |
| 잘 맞는 검색 | 표현이 달라도 뜻이 비슷한 문서 찾기 | 제품 코드·고유명사처럼 단어가 정확히 맞아야 하는 검색 |
| 대표 인덱스 | HNSW 같은 ANN 인덱스 | 역색인 |

“ERR-4031 오류는 어떻게 해결하나요?”라는 질문에서는 `ERR-4031`이라는 문자열이 정확히 들어 있는 문서를 찾는 것이 중요하므로 이런 질문에는 sparse 벡터가 유리합니다. “아이를 낳으면 쉴 수 있나요?”처럼 문서와 다른 단어로 묻는 질문에는 dense 벡터가 유리합니다.

인덱스도 다른데 Qdrant는 dense 벡터에 HNSW를 쓰고 sparse 벡터에는 텍스트 검색 엔진의 역색인과 비슷한 전용 인덱스를 씁니다.[^qdrant-indexing] Milvus의 `SPARSE_INVERTED_INDEX`도 sparse 벡터의 0이 아닌 차원으로 역색인 구조를 만듭니다.[^milvus-sparse-index] 역색인에서는 ‘연차휴가’ 자리(위치 3)에 값이 있는 문서 목록만 따라가면 되므로, 값이 0인 수많은 자리는 볼 필요가 없습니다.

## 3. 레코드 하나에 벡터를 여러 개 둘 수 있을까요

가장 단순한 구조는 [4편 2절](/writing/vector-database-schema-design/)에서 본 것처럼 레코드마다 ID·원문·벡터 하나·메타데이터를 두는 구조입니다. 여기에 같은 원문으로 만든 sparse 벡터를 하나 더 둘 수 있습니다. 2절의 두 질문 유형을 한 시스템에서 함께 처리하려고 dense 벡터로는 뜻이 비슷한 청크를, sparse 벡터로는 질문의 단어가 그대로 들어 있는 청크를 찾고 두 결과를 합쳐 씁니다.

**Qdrant**에서는 컬렉션을 만들 때 dense 벡터(`vectors`)와 sparse 벡터(`sparse_vectors`)를 이름을 붙여 함께 정의합니다.[^qdrant-vectors] 아래 컬렉션 이름과 벡터 이름은 예시입니다.

```json
PUT /collections/hr_docs
{
  "vectors": {
    "dense": { "size": 1024, "distance": "Cosine" }
  },
  "sparse_vectors": {
    "sparse": {}
  }
}
```

`dense`라는 이름의 벡터는 1024차원이고 코사인 유사도로 비교하지만 `sparse`라는 이름의 벡터에는 크기를 적지 않습니다. 레코드(point)를 넣을 때는 이름별로 두 벡터를 줍니다. dense 벡터의 `...`는 자리 표시이며 실제로는 1024개 값을 모두 넣습니다.

```json
PUT /collections/hr_docs/points
{
  "points": [
    {
      "id": 1,
      "vector": {
        "dense": [0.012, -0.031, 0.044, ...],
        "sparse": { "indices": [102, 3071, 9921], "values": [0.41, 0.83, 0.27] }
      },
      "payload": { "text": "연차휴가는 입사일을 기준으로 산정합니다." }
    }
  ]
}
```

dense 벡터의 크기는 컬렉션에서 1024로 고정되지만 sparse 벡터에는 크기를 지정하지 않습니다. 0이 아닌 값의 위치와 값만 넣으므로 레코드마다 넣는 값의 개수가 달라도 됩니다. 0이 아닌 값의 개수는 문장에 서로 다른 토큰이 몇 개 들었는지(학습 기반 모델은 문장에 없는 관련 단어에도 값을 주므로 그 단어 수도 포함)에 따라 레코드마다 달라집니다.

**Milvus**는 한 스키마에 `FLOAT_VECTOR` 필드와 `SPARSE_FLOAT_VECTOR` 필드를 함께 둡니다. sparse 필드에는 `dim`을 지정하지 않습니다.[^milvus-hybrid][^milvus-sparse] `schema`는 미리 만들어 둔 컬렉션 스키마 객체이고 `DataType`은 `pymilvus`에서 가져옵니다.

```python
# 같은 텍스트의 dense 벡터와 sparse 벡터를 필드 두 개로 둡니다
schema.add_field(field_name="text_dense", datatype=DataType.FLOAT_VECTOR, dim=1024)
schema.add_field(field_name="text_sparse", datatype=DataType.SPARSE_FLOAT_VECTOR)
```

Milvus 컬렉션에 둘 수 있는 벡터 필드 수는 `proxy.maxVectorFieldNum`으로 정합니다. 기본값은 4이고 최대 10까지 늘릴 수 있습니다.[^milvus-proxy]

### 두 검색 결과는 어떻게 합칠까요

두 검색을 따로 돌리면 결과 목록이 두 개 나오므로 이것을 하나로 합쳐야 합니다. 점수를 그대로 더하면 될 것 같지만 두 점수는 척도가 다릅니다. 코사인 유사도는 -1에서 1 사이지만 sparse 벡터의 내적(같은 위치의 값끼리 곱해 모두 더한 값) 점수는 값이 커질수록 함께 커져 정해진 상한이 없습니다. 예를 들어 dense 점수 0.8과 sparse 점수 12를 그대로 더하면 sparse 쪽 점수가 결과를 거의 다 정해 버립니다. 그래서 보통은 점수를 그대로 더하지 않고 순위로 합치거나, 점수를 0~1 같은 비슷한 범위로 맞추거나(정규화) 가중치를 준 뒤 합칩니다.[^milvus-weighted][^pinecone-hybrid]

{% include diagram.html src="vdesign-hybrid-search.svg" caption="dense·sparse 벡터를 각자의 인덱스로 검색하고 결과를 합칩니다" %}

순위로 합치는 대표적인 방법은 RRF(Reciprocal Rank Fusion)입니다. 결과마다 각 검색에서 매겨진 순위로 `1 / (k + 순위)`를 계산해 더하므로 각 검색의 상위 순위에 모두 나온 결과일수록 점수가 커집니다. 검색 점수의 척도를 맞추거나 검색별 가중치를 정하지 않고 순위로 결합할 수 있습니다.[^es-rrf]

`k = 60`일 때 두 검색이 다음 순위를 돌려줬다고 해 봅시다.

| 문서 | dense 순위 | sparse 순위 | RRF 점수 |
| --- | --- | --- | --- |
| A | 1 | 2 | 1/61 + 1/62 ≈ 0.0325 |
| C | 3 | 1 | 1/63 + 1/61 ≈ 0.0323 |
| B | 2 | 없음 | 1/62 ≈ 0.0161 |
| D | 없음 | 3 | 1/63 ≈ 0.0159 |

두 검색에 모두 나온 A와 C가 한쪽에만 나온 B와 D보다 위로 갑니다. A는 두 검색에서 모두 2위 안에 들어 1위가 됩니다. `k`는 순위에 더하는 상수이고 클수록 1위와 2위의 점수 차가 작아집니다. `k = 2`이면 1/3과 1/4의 차가 약 0.083이고 `k = 60`이면 1/61과 1/62의 차가 약 0.0003입니다. 그래서 한 검색에서 1위를 했는지보다 여러 검색에 고르게 나왔는지가 더 중요해집니다. 상수 `k`의 기본값을 보면 Elasticsearch의 `rank_constant`는 60이고 Milvus 문서는 보통 60으로 둔다고 적지만 Qdrant는 기본값이 2입니다.[^es-rrf][^milvus-rrf][^qdrant-hybrid]

Qdrant에서는 `prefetch`로 두 검색을 먼저 실행하고 바깥 `query`에서 RRF로 합칩니다.[^qdrant-hybrid]

```json
POST /collections/hr_docs/points/query
{
  "prefetch": [
    { "query": { "indices": [102, 3071], "values": [0.5, 0.9] }, "using": "sparse", "limit": 20 },
    { "query": [0.021, -0.017, 0.038, ...], "using": "dense", "limit": 20 }
  ],
  "query": { "rrf": {} },
  "limit": 10
}
```

이 요청으로 각 검색에서 20개씩 후보를 받은 뒤 두 목록을 RRF로 합쳐 최종 10개를 돌려받습니다. dense 쿼리 벡터의 `...`는 자리 표시이며 실제로는 1024개 값을 모두 넣습니다.

제품마다 저장 방식과 결합 방식은 조금씩 다릅니다.

| 제품 | 저장 방식 | 결합 방식 |
| --- | --- | --- |
| Qdrant | 한 point에 named dense·sparse 벡터 | `prefetch` + RRF 또는 DBSF(Distribution-Based Score Fusion, 점수 분포 정규화)[^qdrant-hybrid] |
| Milvus | 한 컬렉션에 dense·sparse 벡터 필드 | 필드별 검색 요청 + RRF 또는 Weighted ranker(가중합 방식)[^milvus-hybrid][^milvus-weighted] |
| Pinecone | 레코드 하나에 dense·sparse, 또는 두 인덱스를 ID로 연결 | 질의 벡터에 가중치(`alpha`, 두 점수의 비중을 정하는 값)를 주거나 클라이언트에서 병합[^pinecone-hybrid] |
| Weaviate | 벡터 인덱스 + BM25용 역색인 | 벡터 검색과 BM25 키워드 검색을 결합[^weaviate-hybrid] |
| Elasticsearch | `dense_vector` 필드, 학습 기반 sparse는 `sparse_vector` 필드 | `rrf` retriever로 knn·sparse_vector·키워드 질의 등을 결합[^es-rrf] |

Pinecone 문서는 텍스트 작업용 Documents API(단어 기반 전문(full-text) 검색 + dense 검색)와 기존 벡터 기반 시스템용 Vectors API의 하이브리드 방식을 나눠 설명합니다.[^pinecone-hybrid] Weaviate 문서에 따르면 하이브리드 검색은 sparse 벡터가 아니라 벡터 검색과 BM25 키워드 검색의 결합입니다.[^weaviate-hybrid]

### 같은 텍스트의 두 표현과 다른 데이터의 벡터는 구분합니다

레코드 하나에 벡터를 여러 개 두는 구성은 [4편 5절](/writing/vector-database-schema-design/)에서 텍스트와 이미지를 한 컬렉션에 담을 때도 나왔지만 두 경우는 목적이 다릅니다. dense·sparse 벡터는 같은 텍스트를 의미와 키워드라는 두 방식으로 표현한 것입니다. 반면 텍스트 벡터와 이미지 벡터는 서로 다른 데이터를 표현합니다. Milvus 문서의 예시 스키마도 `text_dense`·`text_sparse`(같은 텍스트)와 `image_dense`(이미지)를 따로 둡니다.[^milvus-hybrid] dense와 sparse를 함께 쓰는 것은 키워드와 의미를 함께 보는 검색이며 텍스트와 이미지를 동시에 검색하는 기능과는 다릅니다.

같은 텍스트를 여러 벡터로 표현하는 방식도 있습니다. ColBERT는 토큰마다 벡터를 하나씩 만드는 모델 계열이라 문장 하나가 벡터 하나가 아니라 토큰 수만큼의 벡터 묶음이 됩니다. Qdrant는 이렇게 만든 벡터 묶음을 multivector로 저장합니다. multivector는 벡터 여러 개를 한 묶음으로 저장하는 형식입니다. 점수는 `max_sim`으로 내는데 질문 쪽 벡터마다 문서 쪽 벡터 가운데 가장 비슷한 값을 골라 모두 더한 값입니다.[^qdrant-vectors] 토큰별 벡터를 쓰는 한국어 모델은 [한국어 임베딩 모델 고찰](/writing/korean-embedding-review/)에서 다뤘습니다.

## 4. 벡터 차원과 입력 길이는 무엇이 정할까요

### 차원은 문장 길이가 아니라 모델이 정합니다

짧은 문장과 긴 문장을 같은 모델로 임베딩하면 벡터의 차원은 같습니다.[^sbert-usage] “휴가”라는 한 단어를 넣어도, 다섯 문장짜리 문단을 넣어도 같은 길이의 숫자 배열이 나옵니다. 긴 문장은 더 많은 토큰을 처리하지만 그 정보를 같은 차원 안에 담습니다.

차원은 모델 구조가 정하는데 BERT 같은 인코더 모델은 먼저 토큰마다 벡터를 하나씩 만들고 이 벡터들을 하나로 합쳐 문장 벡터를 만듭니다. 이 합치는 단계를 풀링(pooling)이라고 부릅니다. 흔히 토큰별 벡터를 평균 내거나 문장 맨 앞 특수 토큰(BERT에서는 `[CLS]`)의 벡터를 대표로 씁니다. BERT 계열 모델에서는 이렇게 만든 문장 벡터의 길이가 모델이 토큰마다 내는 벡터의 길이(은닉 크기)와 같습니다. BERT-base의 은닉 크기는 768, BERT-large는 1024입니다.[^bert]

이 구조 때문에 청크가 길수록 같은 길이의 벡터에 더 많은 내용을 눌러 담게 됩니다. 도입부의 50쪽 문서는 대부분의 모델 상한을 넘어서 뒷부분은 아예 잘리고(아래 소절) 남은 부분도 벡터 하나에 눌러 담깁니다.

### 입력 길이에는 상한이 있고 단위는 토큰입니다

모델마다 한 번에 받을 수 있는 입력 길이에 상한이 있습니다. 이 상한은 글자 수나 단어 수가 아니라 토큰 수로 정해지는데 토큰은 모델의 토크나이저(tokenizer)가 텍스트를 자른 단위입니다. Hugging Face 문서에 따르면 흔한 단어는 토큰 하나로 남고 드문 단어는 더 작은 조각(subword)으로 쪼개집니다. `annoyingly`는 어휘에 따라 `["annoying", "ly"]`나 `["annoy", "ing", "ly"]`가 됩니다.[^hf-tokenizer]

OpenAI 문서는 영어 텍스트에서 토큰 하나가 대략 4글자, 0.75단어라고 안내합니다.[^openai-tokens] 이 비율로 어림하면 512토큰은 영어로 2,000글자, 380단어 정도입니다. 한국어는 토크나이저마다 비율이 달라서 실제 모델의 토크나이저로 세어 보는 것이 정확합니다(10절에 세는 코드가 있습니다).

| 모델 | 출력 차원 | 최대 입력 |
| --- | --- | --- |
| BERT-base(`bert-base-uncased`) | 768 | 512토큰 |
| `intfloat/multilingual-e5-large` | 1024 | 512토큰 |
| `BAAI/bge-m3` | 1024 | 8192토큰 |
| `nlpai-lab/KURE-v1` | 1024 | 8192토큰 |
| OpenAI `text-embedding-3-small` | 1536(기본) | 8192토큰 |
| OpenAI `text-embedding-3-large` | 3072(기본) | 8192토큰 |

BERT 수치는 공식 저장소와 설정 파일(`hidden_size`, `max_position_embeddings`)에서, 나머지는 각 모델 카드와 OpenAI 문서에서 가져왔습니다.[^bert][^e5][^bge-m3][^kure][^openai-embeddings] `multilingual-e5-large`는 입력 앞에 `query: `나 `passage: ` 접두어를 붙여야 하고 이 접두어도 토큰 수에 들어갑니다.[^e5] OpenAI의 `text-embedding-3` 계열은 `dimensions` 파라미터로 출력 차원을 줄일 수 있습니다.[^openai-embeddings]

### 상한을 넘는 입력은 도구에 따라 잘리거나 거부됩니다

Sentence-Transformers 문서는 상한보다 긴 텍스트를 넣으면 앞에서부터 `max_seq_length` 토큰까지만 쓰고 나머지는 잘린다고 적습니다. `multilingual-e5-large` 모델 카드도 긴 텍스트는 최대 512토큰으로 잘린다고 명시합니다.[^sbert-length][^e5] 반면 OpenAI 임베딩 API는 입력이 모델의 최대 입력 토큰을 넘지 않아야 한다고 규정합니다.[^openai-embeddings-api] 입력을 거부하는 도구와 달리 오류 없이 잘라 내는 도구는 문제를 알아차리기 어렵습니다.

512토큰 모델에 1,000토큰짜리 청크를 넣는 경우를 생각해 봅시다. 앞의 약 500토큰만 벡터에 반영되고 나머지 절반 정도는 원문으로만 저장됩니다(512에는 특수 토큰이나 접두어처럼 본문이 아닌 토큰도 들어갑니다). 검색은 벡터로 하므로 뒤쪽 내용을 묻는 질문에는 이 청크가 검색되기 어렵습니다. 검색 결과에 원문이 그대로 보이니 잘린 사실을 눈치채기도 어렵습니다.

Sentence-Transformers 문서는 입력이 길어질수록 계산 시간과 메모리가 입력 길이의 제곱으로 늘고 짧은 텍스트로 학습한 모델은 긴 텍스트의 표현이 좋지 않을 수 있다고도 적습니다.[^sbert-length] 어텐션(attention)이라고 부르는 단계는 토큰끼리 서로 얼마나 관련 있는지를 모든 쌍에 대해 계산합니다. 이 단계는 토큰 수의 제곱에 비례하므로 어텐션 부분만 보면 입력이 2배가 될 때 계산량이 4배가 되는 셈입니다. 따라서 청크 크기의 **상한은 임베딩 모델이 정하고 그 안에서 적절한 크기는 실험으로 정합니다.** 모델을 고르는 기준은 [한국어 임베딩 모델 고찰](/writing/korean-embedding-review/)에 정리했습니다.

## 5. 청크 크기는 무엇에 영향을 줄까요

청크 크기를 정할 때는 검색의 세밀함과 문맥 보존을 함께 고려해야 합니다. 청크가 길면 여러 주제가 벡터 하나에 섞일 수 있고 짧으면 내용을 이해하는 데 필요한 앞뒤 문맥이 빠질 수 있습니다.[^lc-parent] Late Chunking 논문도 dense 검색은 짧은 텍스트에서 더 잘 동작하는 경우가 많지만 따로 자른 청크의 임베딩은 주변 청크의 맥락을 잃을 수 있다고 지적합니다.[^late-chunking]

검색 결과의 개수(top_k)와 함께 보면 크기의 영향이 더 분명해집니다. top_k가 2라면 LLM이 받는 원문은 청크 2개뿐입니다. 청크가 128토큰이면 256토큰, 1024토큰이면 2,048토큰 분량의 원문이 넘어갑니다. 답에 필요한 내용이 세 군데 흩어져 있다면 작은 청크 2개로는 다 담지 못할 수 있습니다. 반대로 청크가 크면 한 청크에 질문과 관계없는 내용도 함께 들어갑니다.

### LlamaIndex의 청크 크기 실험

LlamaIndex는 2023년 공식 블로그에서 청크 크기를 바꿔 가며 RAG 시스템의 답변을 평가했습니다. 2021년 Uber 연례 보고서(10-K)로 질문을 만들고 GPT-3.5-turbo로 답변을 생성했습니다. 답변은 GPT-4로 두 지표를 판정했습니다.[^llamaindex-chunk] 두 지표는 질문마다 통과·실패를 판정해 통과한 비율로 계산하므로 0에서 1 사이 값이고 클수록 좋습니다.

- **Faithfulness:** 답변이 검색된 원문과 맞는지, 즉 지어낸 내용이 없는지
- **Relevancy:** 답변과 검색된 원문이 질문에 실제로 답하는지

| 청크 크기(토큰) | 평균 응답 시간(초) | Faithfulness | Relevancy |
| --- | --- | --- | --- |
| 128 | 1.55 | 0.85 | 0.78 |
| 256 | 1.57 | 0.90 | 0.78 |
| 512 | 1.68 | 0.85 | 0.85 |
| 1024 | 1.68 | 0.93 | 0.90 |
| 2048 | 1.72 | 0.90 | 0.89 |

블로그는 결과를 이렇게 해석합니다.[^llamaindex-chunk]

- 128처럼 작은 청크는 정보가 잘게 나뉩니다. `similarity_top_k`가 2처럼 작으면 필요한 정보가 상위 청크에 들어오지 않을 위험이 있습니다.
- 512 정도의 청크는 필요한 정보를 상위 청크 안에 담을 가능성이 큽니다.
- 청크가 커질수록 LLM에 넘기는 정보가 늘어나 맥락은 풍부해지지만 시스템이 느려질 수 있습니다. 표에서도 응답 시간이 조금씩 늘었습니다.
- 이 실험에서는 Faithfulness와 Relevancy 모두 1024에서 가장 높았습니다.

블로그의 결론은 여러 크기로 실험하고 구체적인 데이터로 결정하라는 것이고 1024라는 숫자 자체를 권하지는 않습니다.[^llamaindex-chunk] 2048에서 두 지표가 다시 조금 내려간 것처럼, 청크를 키운다고 계속 좋아지지는 않습니다. 이 수치는 한 데이터셋과 한 모델 조합의 결과이므로 다른 데이터에 그대로 옮길 수는 없습니다.

### Chroma의 분할 방식 비교

Chroma는 2024년 연구에서 분할 방식과 크기를 바꿔 가며 검색 단계를 따로 평가했습니다. 질문에 필요한 원문 토큰 가운데 검색된 비율(recall)과, 검색된 토큰과 필요한 토큰이 얼마나 겹치는지(IoU, Intersection over Union)를 쟀습니다. 임베딩 모델은 OpenAI `text-embedding-3-large`이고 질의마다 청크 5개를 검색했습니다.[^chroma-chunking]

두 지표를 숫자로 보면 이렇습니다. 질문에 답하려면 원문에서 100토큰이 필요하고 200토큰짜리 청크 5개(1,000토큰)를 검색했는데 필요한 100토큰이 모두 그 안에 있다고 해 봅시다. 필요한 토큰을 빠짐없이 찾았으니 recall은 100%입니다. IoU는 겹친 부분을 합집합으로 나눈 값입니다. 합집합은 검색한 토큰과 필요한 토큰을 합치되 겹치는 부분은 한 번만 센 범위로, 이 예에서는 1,000토큰입니다. 그래서 IoU는 100 ÷ 1,000 = 10%입니다. recall이 놓친 것이 없는지만 보는 데 비해 IoU는 놓친 것과 쓸데없이 가져온 것을 함께 봅니다. 이 예처럼 놓친 것이 없으면 IoU는 쓸데없는 내용이 얼마나 적은지를 나타냅니다. 아래 표의 IoU가 한 자릿수라는 것은 검색한 토큰 가운데 질문에 필요한 부분이 작다는 뜻입니다.

이 실험에서는 재귀 분할의 기본 구분자에 마침표·물음표·느낌표를 추가해 `["\n\n", "\n", ".", "?", "!", " ", ""]`를 썼습니다. 아래는 결과 일부입니다. 설정 크기와 실제 평균 청크 길이는 다르며 크기·길이·오버랩의 단위는 모두 토큰입니다.[^chroma-chunking]

| 분할 방식 | 설정 크기 / 오버랩 (실제 평균 길이) | Recall(%) | IoU(%) |
| --- | --- | --- | --- |
| `RecursiveCharacterTextSplitter` | 800 / 400 (약 661) | 85.4 | 1.5 |
| `RecursiveCharacterTextSplitter` | 400 / 0 (약 276) | 89.5 | 3.6 |
| `RecursiveCharacterTextSplitter` | 200 / 0 (약 137) | 88.1 | 6.9 |
| 의미 기반 분할(Greg Kamradt가 공개한 방식, 8절) | 고정 크기 없음 / 0 (약 660) | 83.6 | 1.5 |

Chroma는 `RecursiveCharacterTextSplitter`를 200토큰 설정에 오버랩 없이 쓰면 여러 지표에서 고르게 좋은 성능을 낸다고 평가했습니다. 위 표에서도 200토큰 설정은 400토큰보다 IoU가 높지만 recall은 낮습니다. 오버랩을 줄이면 IoU가 오르는데 이 지표가 중복된 정보에 벌점을 주기 때문입니다.[^chroma-chunking]

두 실험은 재는 대상이 다른데, LlamaIndex가 LLM 답변의 품질을 쟀다면 Chroma는 검색된 토큰의 관련성과 중복을 쟀습니다. 이 결과만으로 작은 청크가 검색에, 큰 청크가 답변에 항상 유리하다고 볼 수는 없습니다. 9절에서 살펴볼 구성은 작은 청크로 관련 구간을 찾은 뒤 답변에 필요한 주변 내용이나 부모 문서를 함께 넘깁니다.

### 도구마다 기본값과 단위가 다릅니다

청크 크기를 말할 때는 단위를 함께 확인해야 합니다. 기본값을 그대로 쓰면 도구마다 크기가 크게 달라집니다. 같은 “청크 크기 1000”이라도 글자 1,000개와 토큰 1,000개는 전혀 다른 분량입니다.

| 도구 | 기본 청크 크기 | 기본 오버랩 | 단위 |
| --- | --- | --- | --- |
| LangChain `TextSplitter` 계열 | 4000 | 200 | 글자(`len`) |
| LlamaIndex `SentenceSplitter` | 1024 | 200 | 토큰 |
| OpenAI 파일 검색(vector store) | 800 | 400 | 토큰 |
| Unstructured `chunk_by_title` | 500(`max_characters`) | 0 | 글자 |

LangChain은 길이 함수 기본값이 파이썬 `len`이라 글자 수로 잽니다.[^lc-base] LlamaIndex `SentenceSplitter`는 토큰 단위입니다.[^li-sentence] OpenAI 파일 검색은 청크 크기를 100에서 4096토큰 사이로 바꿀 수 있고 오버랩은 청크 크기의 절반을 넘지 않아야 합니다.[^openai-retrieval] Unstructured는 `max_characters`를 넘는 청크를 만들지 않습니다.[^unstructured]

### 무엇을 따져 보고 정할까요

Pinecone의 청킹 가이드는 청크 전략을 정하기 전에 다음 네 가지를 물어보라고 권합니다.[^pinecone-chunking]

1. **콘텐츠의 성격:** 기사나 책처럼 긴 문서인가, 트윗·상품 설명·채팅 메시지처럼 짧은 콘텐츠인가
2. **임베딩 모델:** 모델마다 담을 수 있는 정보량이 다르며 특히 코드·금융·의료·법률 같은 전문 분야에서 차이가 납니다
3. **사용자 질의:** 짧고 구체적인가, 길고 복잡한가
4. **결과의 쓰임:** 의미 검색, 질문 답변, RAG, 에이전트 작업 가운데 어디에 쓰는가

이 밖에 직접 따져 볼 것은 LLM의 입력 한도입니다. 검색한 청크를 LLM에 넘긴다면 `청크 크기 × 넘길 청크 수`가 프롬프트에 들어갑니다. 800토큰 청크 5개를 넘기면 원문만 4,000토큰입니다. 질문·지시문과 합쳐서 모델이 한 번에 받을 수 있는 입력 길이(컨텍스트 한도) 안에 들어와야 합니다.

## 6. 청킹 방법에는 어떤 것이 있을까요

청킹 방법은 무엇을 기준으로 자르는지에 따라 나눌 수 있습니다. 이름은 자료마다 조금씩 다르지만 다음 범주로 정리할 수 있습니다.

| 방법 | 자르는 기준 | 잘 맞는 경우 | 주의할 점 |
| --- | --- | --- | --- |
| 고정 크기 | 글자 수나 토큰 수 | 첫 시도, 형식이 단순한 텍스트 | 문장·문단 중간에서 잘림 |
| 오버랩 | 이웃 청크와 일부를 겹침 | 경계에 걸친 정보를 놓치지 않으려 할 때 | 저장량 증가, 같은 내용이 중복 검색됨 |
| 재귀 분할 | 문단→줄→단어 순서의 구분자 | 일반 텍스트의 기본 선택 | 구분자가 문서 구조와 맞아야 함 |
| 문서 구조 기반 | 제목·HTML 태그·코드 구문·표 | Markdown·HTML·코드·PDF | 형식별 파서가 필요 |
| 의미 기반 | 이웃 문장 임베딩의 거리 | 주제가 여러 번 바뀌는 긴 글 | 임베딩 비용, 청크 크기가 들쭉날쭉 |
| 부모-자식·계층 | 작은 청크로 찾고 큰 청크를 반환 | 정밀한 검색과 넓은 맥락이 함께 필요할 때 | 저장소가 둘, 동기화 필요 |
| 요약·가상 질문 | LLM이 만든 요약이나 질문을 벡터로 | 질문형 검색, 긴 문서 탐색 | LLM 호출 비용, 생성 품질에 의존 |
| 맥락 보강 | 청크마다 문서 맥락을 덧붙여 임베딩 | 청크만 보면 대상이 모호한 문서 | LLM 호출 비용 |

앞의 다섯 가지는 원문을 어디서 자를지를 정하는 방법입니다(7·8절). 글자 수에서 의미 쪽으로 갈수록 계산 비용은 대체로 늘어나지만 검색 품질이 함께 좋아진다고 보장되지는 않습니다(5절 Chroma 실험). 뒤의 세 가지는 자른 청크를 어떻게 검색하고 무엇을 LLM에 넘길지를 정하는 구성입니다(9절). 실제로는 문서 구조로 먼저 나누고 긴 절만 재귀 분할로 다시 자르는 식으로 여러 방법을 섞어 씁니다.

## 7. 크기와 구분자로 나누려면 어떻게 할까요

### 고정 크기 분할

가장 단순한 방법은 정해진 글자 수나 토큰 수마다 자르는 것입니다. Pinecone 가이드는 고정 크기 분할을 가장 흔하고 직관적인 방법이라고 소개하면서 대부분의 경우 여기서 시작하고 부족하다고 판단될 때만 다른 방법으로 넘어가라고 권합니다.[^pinecone-chunking] 구현이 쉽고 청크 크기가 고르다는 장점이 있습니다.

단점은 문장·문단은 물론 단어 중간에서도 잘릴 수 있다는 것입니다. “연차휴가는 입사일을 기준으로 산정합니다.”(22글자)를 10글자마다 자르면 이렇게 됩니다.

```text
청크 1: "연차휴가는 입사일을"
청크 2: " 기준으로 산정합니"
청크 3: "다."
```

‘산정합니다’가 두 청크에 걸쳐 잘렸고 청크 3은 의미가 없는 조각이 됐습니다. 실제 청크는 5절 표의 기본값처럼 수백에서 수천 글자 단위라 이렇게 극단적이지는 않지만 경계마다 같은 일이 생길 수 있습니다.

LangChain의 `CharacterTextSplitter`는 이 문제를 줄이려고 글자 수만으로 자르지 않습니다. 먼저 구분자(기본값 `"\n\n"`, 빈 줄)로 자른 뒤, 합친 길이가 `chunk_size`를 넘지 않는 범위에서 조각을 이어 붙입니다.[^lc-character] 구분자 사이의 조각 하나가 이미 `chunk_size`보다 길면 더 쪼개지 않고 그대로 반환하므로 **`chunk_size`는 조각을 합칠 때의 기준이며 결과 청크의 길이 상한을 보장하지 않습니다.** 크기 초과 경고도 항상 남는 것은 아닙니다. 구분자 없이 600글자인 텍스트를 `chunk_size=500`으로 처리하면 600글자 청크 하나가 경고 없이 반환됩니다.[^lc-base]

```python
from langchain_text_splitters import CharacterTextSplitter

splitter = CharacterTextSplitter(
    separator="\n\n",   # 빈 줄(문단 경계)에서 먼저 자릅니다
    chunk_size=500,     # 조각을 합칠 때의 길이 기준(기본 단위: 글자 수)
    chunk_overlap=50,   # 이웃 청크와 겹칠 목표 길이
)
chunks = splitter.split_text(text)  # 문자열 목록을 돌려줍니다
```

`langchain.text_splitter`에서 가져오는 예제가 많은데, 현재 `langchain` 1.x 패키지에는 이 모듈이 없습니다. 분할기는 `langchain-text-splitters` 패키지의 `langchain_text_splitters`에서 가져옵니다. `langchain-classic` 패키지에 남아 있는 `langchain_classic.text_splitter` 모듈은 이전 코드와 호환되도록 `langchain_text_splitters`의 클래스를 다시 내보냅니다(재수출, re-export).[^lc-package]

### 오버랩

오버랩은 이웃한 청크가 일부를 공유하게 만듭니다. 문장 네 개(S1~S4)를 문장 두 개씩, 한 문장을 겹쳐 자르면 이렇게 됩니다.

```text
오버랩 없음:  [S1 S2]  [S3 S4]
오버랩 1문장: [S1 S2]  [S2 S3]  [S3 S4]
```

S2와 S3을 함께 읽어야 이해되는 내용이 있다고 해 봅시다. 오버랩이 없으면 두 문장이 서로 다른 청크로 갈라지지만 오버랩을 두면 가운데 청크 `[S2 S3]`에 두 문장이 함께 들어갑니다. 이렇게 중요한 문장이 두 청크의 경계에 걸쳐도 어느 한쪽 청크에는 온전히 들어갈 가능성이 커집니다.[^lc-recursive] OpenAI 파일 검색은 기본값으로 800토큰 청크에 400토큰을 겹칩니다.[^openai-retrieval]

위 예에서 청크가 2개에서 3개로 늘었듯이 같은 문장이 여러 청크에 들어가므로 저장할 레코드와 벡터가 늘어나는 대가도 있습니다. 내용이 겹치는 청크가 함께 검색되면 top_k 자리를 나눠 가질 수 있습니다. 5절의 Chroma 실험에서도 오버랩을 줄이자 중복 정보에 벌점을 주는 IoU가 올랐습니다.[^chroma-chunking]

LangChain은 오버랩을 만들 때 정확히 N글자를 복사하지 않고 직전 청크의 뒤쪽 조각(구분자로 나뉜 단위)을 `chunk_overlap` 이하가 될 때까지 남겨 다음 청크를 시작합니다. 문서도 이 값을 목표 오버랩이라고 부릅니다.[^lc-base][^lc-recursive] `chunk_overlap`이 `chunk_size`보다 크면 오류가 납니다.[^lc-base]

### 재귀 분할

`RecursiveCharacterTextSplitter`는 구분자 목록을 순서대로 시도합니다. 기본 목록은 `["\n\n", "\n", " ", ""]`이므로 문단, 줄, 단어, 글자 순서입니다.[^lc-recursive] 동작은 다음과 같습니다.[^lc-recursive-src]

1. 텍스트에 들어 있는 첫 구분자(보통 빈 줄)로 자릅니다.
2. `chunk_size`보다 작은 조각은 합친 길이가 `chunk_size`를 넘지 않는 범위에서 이어 붙입니다.
3. `chunk_size`보다 큰 조각만 다음 구분자(줄바꿈)로 다시 자릅니다.
4. 그래도 크면 공백, 마지막에는 글자 단위로 자릅니다.

`chunk_size=100`(글자), `chunk_overlap=0`으로 문단 세 개를 자르는 경우를 따라가 보겠습니다(구분자 길이는 계산에서 뺐습니다).

| 단계 | 조각 | 처리 |
| --- | --- | --- |
| 빈 줄로 자름 | 문단 1(60글자), 문단 2(150글자), 문단 3(30글자) | 문단 2만 100글자를 넘음 |
| 줄바꿈으로 다시 자름 | 문단 2 → 줄 1(70글자), 줄 2(80글자) | 두 줄 모두 100글자 이하 |
| 결과 | 60 · 70 · 80 · 30글자 청크 4개 | 문단 1과 3은 그대로, 문단 2만 줄 단위로 나뉨 |

큰 문단만 더 작은 단위로 자르고 이웃한 작은 조각은 크기 안에서 합칩니다. 이 예에서는 사이에 문단 2가 있어서 문단 1과 3이 합쳐지지 않았습니다. 이렇게 문단과 문장을 최대한 한 청크에 두면서도 크기 상한을 지킵니다. 청크 크기가 정확히 같지는 않지만 크기 상한 안으로 맞춰집니다. LangChain 문서는 대부분의 경우 이 분할기로 시작하라고 권합니다.[^lc-overview] 고정 크기 분할 소절의 Pinecone 가이드가 고정 크기에서 시작하라고 한 것과 출발점은 다르지만 단순한 방법으로 시작해 부족할 때 바꾸라는 취지는 같습니다.

4절에서 본 것처럼 청크의 상한은 임베딩 모델의 토큰 수로 정해집니다. 길이를 글자 수 대신 임베딩 모델의 토크나이저로 재면 상한을 맞추기 쉽습니다.

```python
from transformers import AutoTokenizer
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 임베딩에 쓸 모델의 토크나이저로 길이를 잽니다
tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-m3")

splitter = RecursiveCharacterTextSplitter.from_huggingface_tokenizer(
    tokenizer,
    chunk_size=400,    # 청크 최대 길이(토큰)
    chunk_overlap=0,   # 오버랩 없음
)
chunks = splitter.split_text(text)  # 문자열 목록을 돌려줍니다
```

`from_huggingface_tokenizer`는 자르는 방식은 그대로 두고 길이 함수만 토크나이저의 토큰 수로 바꿉니다. OpenAI 모델이라면 `from_tiktoken_encoder`를 씁니다. 기본 인코딩(텍스트를 토큰으로 나누는 규칙)이 `gpt2`이므로 `text-embedding-3` 계열에 맞춰 `encoding_name="cl100k_base"`를 지정합니다.[^lc-base][^openai-embeddings]

LlamaIndex의 `SentenceSplitter`는 문장과 문단을 최대한 함께 두려고 한다는 점에서 `RecursiveCharacterTextSplitter`와 비슷합니다. 기본 크기는 1024토큰, 오버랩은 200토큰입니다.[^li-sentence]

## 8. 문서 구조와 의미로 나누려면 어떻게 할까요

### 문서 구조로 나누기

문서에 제목·태그·코드 구문 같은 구조가 있다면 이를 경계로 나눌 수 있습니다. 사람이 문서를 쓸 때 이미 주제별로 제목을 달아 두었으니 그 경계를 그대로 쓰는 것입니다. 형식에 맞는 파서를 쓰면 원래 구조를 보존하는 데 도움이 됩니다.[^pinecone-chunking]

**Markdown**은 제목(`#`, `##`)으로 나눌 수 있습니다. LangChain의 `MarkdownHeaderTextSplitter`는 제목을 경계로 자르고 그 청크가 속한 제목들을 메타데이터에 넣습니다.[^lc-markdown]

```python
from langchain_text_splitters import MarkdownHeaderTextSplitter

splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "Header 1"), ("##", "Header 2")],  # 자를 제목 수준과 메타데이터 키 이름
)
docs = splitter.split_text(markdown_text)
# 예: docs[0].metadata → {'Header 1': '취업규칙', 'Header 2': '연차휴가'}
```

기본값으로는 경계로 쓴 제목 줄을 청크 본문에서 빼고 메타데이터에만 남깁니다. `strip_headers=False`로 본문에 남길 수도 있습니다. 한 절이 너무 길면 이 결과를 `RecursiveCharacterTextSplitter.split_documents()`로 다시 자르는데 이때 제목 메타데이터는 그대로 유지됩니다.[^lc-markdown] 제목 메타데이터는 4편에서 본 메타데이터 필터에 바로 쓸 수 있습니다. 청크만 봐서는 무엇에 관한 내용인지 모를 때는 제목을 청크 앞에 붙여 임베딩할 수도 있습니다(9절의 맥락 보강).

**HTML**은 `HTMLHeaderTextSplitter`가 `<h1>`·`<h2>` 같은 제목 태그로 나누고 제목을 메타데이터로 붙입니다.[^lc-html] **코드**는 언어의 구문 단위로 자릅니다. `RecursiveCharacterTextSplitter.from_language(Language.PYTHON)`은 `"\nclass "`, `"\ndef "`를 먼저 구분자로 써서 클래스와 함수 경계에서 자르려고 합니다.[^lc-recursive-src] 함수 하나가 한 청크에 들어가야 그 함수가 무슨 일을 하는지 벡터에 담기기 쉽습니다. LlamaIndex의 `CodeSplitter`는 tree-sitter(코드를 구문 구조로 파싱하는 라이브러리)의 구문 트리로 자르며 기본값은 40줄, 겹침 15줄, 최대 1,500글자입니다.[^li-code]

**PDF·Word**처럼 레이아웃이 있는 문서는 먼저 제목·본문·표 같은 요소로 파싱한 뒤 그 요소를 묶습니다. Unstructured의 `chunk_by_title`은 제목 요소가 나오면 앞 청크를 닫고 새 청크를 시작합니다. 표 요소는 다른 요소와 합치지 않고 항상 따로 둡니다.[^unstructured]

### 의미로 나누기

의미 기반 분할(semantic chunking)은 글자 수나 구분자 대신 이웃 문장의 의미가 얼마나 달라지는지를 보고 자릅니다. 주제가 바뀌는 지점에서 청크를 나누는 것이 목표입니다. LangChain의 `SemanticChunker`는 다음 순서로 동작합니다.[^lc-semantic]

1. 마침표·물음표·느낌표 뒤의 공백(`(?<=[.?!])\s+`)에서 문장을 나눕니다.
2. 문장마다 앞뒤 문장을 하나씩 붙여(`buffer_size=1`) 최대 3문장 묶음을 만들고 임베딩합니다.
3. 이웃한 묶음끼리 코사인 거리(`1 - 코사인 유사도`)를 계산합니다.
4. 그 문서의 거리 분포에서 임계값을 정합니다. 기본값은 95 백분위수입니다.
5. 거리가 임계값보다 큰 지점, 즉 이웃 문장의 유사도가 크게 떨어지는 지점에서 자릅니다.

{% include diagram.html src="vdesign-semantic-chunking.svg" caption="이웃 문장 묶음의 거리가 임계값을 넘는 곳에서 청크를 자릅니다" %}

코사인 거리는 `1 - 코사인 유사도`이므로, 거리가 클수록 유사도는 낮습니다.[^milvus-metric][^scipy-cosine] 기본 설정의 임계값은 그 문서의 거리 분포에서 정합니다. LlamaIndex의 `SemanticSplitterNodeParser`도 기본값으로 문장 묶음 사이의 코사인 거리(LlamaIndex 문서에서는 비유사도라고 부릅니다)가 95 백분위수를 넘는 지점에서 나눕니다.[^li-semantic]

95 백분위수는 값을 작은 것부터 늘어놓았을 때 95%가 그 아래에 오는 지점입니다. 문장이 6개인 짧은 문서(문장마다 묶음 하나, 묶음도 6개)로 계산해 보겠습니다. 이웃한 묶음 사이의 거리 5개가 아래와 같다고 해 봅시다.

```text
1–2: 0.08   2–3: 0.10   3–4: 0.45   4–5: 0.07   5–6: 0.09
```

다섯 값의 95 백분위수는 약 0.38입니다(numpy `percentile`의 기본 방식으로 계산한 값). numpy의 기본 방식은 이웃한 두 값 사이를 비율로 나눠(선형 보간) 계산하므로 실제 거리에 없는 0.38 같은 값이 나옵니다. 이보다 큰 거리는 3–4 사이의 0.45 하나뿐이므로 여기서 잘라 문장 1~3과 문장 4~6, 청크 두 개가 나옵니다. 다른 곳의 거리는 0.1 안팎으로 작아서 같은 주제가 이어진다고 보고 자르지 않습니다. 임계값이 고정 숫자가 아니라 그 문서의 거리 분포로 정해지므로, 문서마다 “다른 곳보다 유난히 거리가 큰 지점”에서 자르게 됩니다.

```python
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings

chunker = SemanticChunker(
    HuggingFaceEmbeddings(model_name="BAAI/bge-m3"),  # 문장 묶음을 임베딩할 모델
    breakpoint_threshold_type="percentile",  # 기본값
    breakpoint_threshold_amount=95,          # 거리 분포의 95 백분위수에서 자름
)
docs = chunker.create_documents([text])
```

`SemanticChunker`는 실험용 패키지인 `langchain-experimental`에 들어 있고 예제의 임베딩 클래스는 `langchain-huggingface` 패키지에서 가져옵니다.[^lc-semantic] 임계값 방식은 백분위수 외에 세 가지를 더 고를 수 있습니다.

- **표준편차:** 거리 평균 + 3×표준편차(기본 배수 3)
- **사분위 범위:** 거리 평균 + 1.5×사분위 범위(기본 배수 1.5). 사분위 범위는 3사분위수 − 1사분위수입니다.
- **거리 변화율:** 이웃 거리의 변화율 분포에서 95 백분위수(기본값)

의미 기반 분할은 청크를 만들려고 문장 묶음마다 임베딩을 계산해야 하므로 비용이 따릅니다. 문장이 1,000개인 문서라면 청크를 만들기 전에 묶음 1,000개를 먼저 임베딩합니다. 크기 상한을 따로 두지 않으면 청크 크기도 들쭉날쭉해집니다. 5절의 Chroma 실험에서 Kamradt 방식(`SemanticChunker`가 바탕으로 삼은 알고리즘)의 청크는 평균 약 660토큰이었고 표에 실린 방법 가운데 recall이 가장 낮았습니다.[^chroma-chunking] 문장 분리 정규식은 `.?!` 뒤의 공백을 기준으로 하므로 마침표 없이 끝나는 목록이나 제목이 많은 문서에서는 문장이 제대로 나뉘지 않을 수 있습니다.

## 9. 작은 청크로 찾고 큰 맥락을 넘기려면 어떻게 할까요

검색된 청크에 답의 단서는 있지만 내용을 이해하는 데 필요한 앞뒤 문맥이 빠질 수 있습니다. 이때는 **검색에 쓰는 단위와 LLM에 넘기는 단위를 나눠** 관련 구간을 찾은 뒤 주변 맥락을 함께 전달할 수 있습니다.

책에서 무언가를 찾는 과정과 비슷합니다. 찾아보기(색인)에서 단어를 찾아 쪽수를 알아낸 뒤 그 쪽이 속한 절 전체를 읽습니다. 작은 단위로 찾고 큰 단위로 읽으면 편합니다.

### 부모-자식 검색

부모-자식(parent-child) 검색은 원문을 큰 청크(부모)와 그 안의 작은 청크(자식)로 나눕니다. 자식 청크를 검색하고 검색된 청크가 속한 부모를 돌려줍니다. LangChain의 `ParentDocumentRetriever`가 이 방식을 구현합니다.[^lc-parent] 부모를 2,000글자, 자식을 400글자로 자르면 부모 하나에 자식이 다섯 개 안팎 생깁니다. 검색은 최대 400글자 단위로 하고 LLM에는 검색된 자식이 속한 부모들(각각 최대 2,000글자)을 넘기는 셈입니다.

{% include diagram.html src="vdesign-parent-child.svg" caption="자식 청크로 검색하고 doc_id로 부모 문서를 찾아 LLM에 넘깁니다" %}

저장할 때는 다음과 같이 동작합니다.[^lc-parent-src]

1. 부모 문서마다 고유 ID(UUID)를 만듭니다. 부모는 원문 전체일 수도, 원문을 크게 자른 청크일 수도 있습니다.
2. 부모를 작은 자식 청크로 자르고 자식의 메타데이터 `doc_id`에 부모 ID를 넣습니다.
3. 자식 청크의 **본문을 임베딩**하고 본문과 벡터, 그리고 부모 ID 같은 메타데이터를 벡터 저장소에 함께 저장합니다. 메타데이터는 본문과 별도로 전달하며 자동으로 임베딩 입력에 포함하지 않습니다.[^lc-vectorstore]
4. 부모 문서는 ID를 키로 문서 저장소(docstore)에 따로 저장합니다.

검색할 때는 벡터 저장소에서 자식 청크를 찾고 자식의 `doc_id`로 부모 ID를 모은 뒤 문서 저장소에서 부모를 꺼내 돌려줍니다.[^lc-parent][^lc-multivector] 같은 부모의 자식이 여러 개 검색되면 부모는 한 번만 돌려줍니다.

```python
from langchain_classic.retrievers import ParentDocumentRetriever
from langchain_core.stores import InMemoryStore
from langchain_text_splitters import RecursiveCharacterTextSplitter

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,      # 자식 청크와 그 벡터를 저장
    docstore=InMemoryStore(),     # 부모 문서를 저장
    child_splitter=RecursiveCharacterTextSplitter(chunk_size=400),    # 글자 수 기준
    parent_splitter=RecursiveCharacterTextSplitter(chunk_size=2000),  # 글자 수 기준
)
retriever.add_documents(documents)                  # 부모·자식으로 나눠 두 저장소에 저장
parents = retriever.invoke("연차휴가는 언제 생기나요?")  # 부모 문서 목록
```

`vectorstore`에는 사용하는 벡터 DB의 LangChain 연동 객체를 넣습니다. `InMemoryStore`는 프로세스 메모리에만 저장하므로 프로그램을 끄면 내용이 사라집니다. 운영에서는 디스크나 DB에 저장하는 저장소로 바꿉니다. `parent_splitter`를 생략하면 넣은 원문 전체가 부모가 됩니다.[^lc-parent] LangChain 1.x에서 이 리트리버는 `langchain-classic` 패키지로 옮겨졌습니다.[^lc-package]

라이브러리 없이 벡터 DB만으로도 같은 구성을 만들 수 있습니다. 자식 레코드의 메타데이터에 `parent_id`를 두고 부모 원문은 RDB나 객체 저장소에 둡니다. 검색 결과의 `parent_id`로 부모를 조회해 LLM에 넘깁니다. 이때 부모를 고치면 자식 레코드를 다시 만들고 부모를 지우면 자식 레코드도 함께 지워야 두 저장소가 어긋나지 않습니다.

### 계층 분할과 문장 창

LlamaIndex의 계층 분할과 문장 창도 검색 단위와 반환 단위를 구분합니다.

- **계층 분할 + 자동 병합:** `HierarchicalNodeParser`는 문서를 여러 크기로 겹겹이 자릅니다. 크기를 지정하지 않으면 `[2048, 512, 128]`토큰으로 자릅니다. LlamaIndex는 청크를 노드(node)라고 부릅니다. 2048토큰 노드 안에 512토큰 노드들이, 그 안에 다시 128토큰 노드들이 들어갑니다. 가장 작은 노드로 검색하고 `AutoMergingRetriever`가 결과를 부모로 합칩니다. 한 부모의 자식 가운데 검색된 비율이 0.5를 넘으면 자식들을 부모 노드 하나로 바꿉니다.[^li-hierarchical][^li-automerging] 자식이 4개인 부모에서 3개가 검색되면 비율이 0.75라서 부모로 합치고 2개만 검색되면 0.5라서 합치지 않습니다.
- **문장 창(sentence window):** `SentenceWindowNodeParser`는 문장 하나를 노드 하나로 만들고 앞뒤 3문장(`window_size=3`)을 메타데이터에 담습니다. 이 창은 임베딩에서 빠지므로 검색은 문장 하나로 합니다. 검색 뒤 `MetadataReplacementNodePostProcessor`로 노드 본문을 창으로 바꾸면 LLM에 앞뒤 문장을 포함한 창을 넘길 수 있습니다.[^li-sentence-window] 이 후처리기를 쓰면 10번째 문장이 검색됐을 때 7~13번째 문장, 최대 7문장이 LLM에 넘어갑니다.

### 요약과 가상 질문

원문 대신 **원문을 대표하는 다른 텍스트**를 벡터로 만들 수도 있습니다. LangChain의 `MultiVectorRetriever`는 부모 문서 하나에 여러 벡터를 붙이는 리트리버입니다. LangChain v0.3 공식 가이드는 그 벡터를 만드는 방법으로 작은 청크, 문서 요약, 그 문서가 답할 만한 가상 질문(hypothetical questions) 세 가지를 소개했습니다.[^lc-multivector]

- **요약:** LlamaIndex의 `DocumentSummaryIndex`는 문서마다 LLM으로 요약을 만듭니다. 질의에 맞는 요약을 고른 뒤 그 요약에 딸린 원문 노드를 돌려줍니다. 요약은 기본값으로 임베딩해 두며 임베딩 대신 LLM이 요약을 고르게 할 수도 있습니다.[^li-docsummary]
- **가상 질문:** LlamaIndex의 `QuestionsAnsweredExtractor`는 청크마다 그 청크가 답할 수 있는 질문을 만듭니다. 기본값은 5개이며 메타데이터 `questions_this_excerpt_can_answer`에 넣습니다.[^li-extractors] 이 방법은 질문형 검색에 맞추려고 사용자 질문을 가상 질문과 비교하게 합니다. “연차휴가는 입사일을 기준으로 산정합니다”라는 청크에 “연차는 언제부터 계산하나요?” 같은 질문을 붙여 두면, 질문 형태로 들어온 검색어와 비교할 대상이 생깁니다.

두 방법 모두 청크나 문서마다 LLM을 호출하므로 색인 비용이 듭니다. 원문 대신 요약이나 질문만 임베딩한다면 요약·질문이 빠뜨린 내용은 검색되지 않습니다.

### 청크에 문서 맥락을 덧붙이기

이 글 도입부에서 예로 든 “이 조항은 계약직에는 적용하지 않습니다” 같은 청크는 혼자서는 무엇을 말하는지 알기 어렵습니다. Anthropic이 2024년에 발표한 Contextual Retrieval은 임베딩과 BM25 색인을 만들기 전에 **청크마다 그 청크의 맥락을 설명하는 짧은 글을 앞에 붙이는** 방식입니다.[^anthropic-contextual] 위 청크라면 어느 회사 취업규칙의 어느 장, 어느 조항에 딸린 문장인지를 한두 문장으로 앞에 붙이는 셈입니다.

Anthropic 글의 예에서 “The company's revenue grew by 3% over the previous quarter.”라는 청크에는 어느 회사의 어느 분기 보고서인지, 직전 분기 매출이 얼마였는지를 설명하는 문장이 앞에 붙습니다. 이 맥락은 문서 전체와 청크를 함께 LLM에 넣어 만듭니다.[^anthropic-contextual] 발표한 실험에서 질의마다 상위 20개 청크를 검색했을 때 결과는 다음과 같았습니다. Anthropic은 검색 실패율을 1 − recall@20으로 잽니다. 질문에 필요한 청크 가운데 몇 개가 상위 20개 안에 들지 못했는지를 비율로 나타낸 값입니다.

| 구성 | 검색 실패율 | 실패율 감소 |
| --- | --- | --- |
| 기존 임베딩 | 5.7% | 기준 |
| 맥락을 붙인 임베딩 | 3.7% | 35% |
| 맥락을 붙인 임베딩 + 맥락을 붙인 BM25 | 2.9% | 49% |
| 위 구성 + 재순위화(reranking) | 1.9% | 67% |

감소율은 실패율이 상대적으로 줄어든 비율입니다. 정확도가 67% 올랐다는 뜻이 아닙니다. 5.7%가 1.9%로 줄었으니 실패율이 원래의 3분의 1 정도가 됐다는 뜻입니다. 프롬프트 캐싱은 같은 입력 앞부분을 다시 보낼 때 앞서 처리한 결과를 재사용하는 기능입니다. Anthropic은 이 기능을 쓸 때 맥락을 만드는 일회성 비용이 문서 토큰 100만 개당 1.02달러였다고 밝혔습니다.[^anthropic-contextual] 같은 글은 지식 베이스가 20만 토큰(약 500쪽)보다 작다면 검색 없이 전체를 프롬프트에 넣어도 된다고도 적습니다.

Late Chunking은 맥락을 텍스트로 붙이는 대신 임베딩 단계에서 해결하는 방법으로, 긴 문서 전체를 입력 한도가 큰 임베딩 모델에 한 번에 넣어 토큰마다 벡터를 얻습니다. 이 토큰 벡터들을 마지막 평균 풀링(4절) 직전에 청크 경계에서 나눠 청크마다 평균 내 청크 벡터를 만듭니다. 각 토큰의 표현은 모델이 한 번에 읽은 범위(입력 한도 안의 문서 전체)를 보고 만들어지므로 청크 벡터에 주변 문맥이 반영됩니다. 논문은 이 방법이 추가 학습 없이 여러 장문 임베딩 모델에 적용된다고 설명합니다.[^late-chunking]

| 구성 | 벡터로 만드는 것 | LLM에 넘기는 것 |
| --- | --- | --- |
| 기본 | 청크 | 같은 청크 |
| 부모-자식·계층 | 작은 청크 | 큰 청크나 원문 |
| 문장 창 | 문장 하나 | 앞뒤 문장을 포함한 창 |
| 요약·가상 질문 | 요약이나 질문 | 원문 청크나 문서 |
| 맥락 보강 | 맥락 문장 + 청크 | 청크(필요하면 맥락 포함) |

## 10. 우리 데이터에 맞는 청크는 어떻게 찾을까요

5절의 두 실험은 서로 다른 데이터와 지표로 서로 다른 크기를 가리켰으므로 자기 데이터로 시험해 봐야 합니다. 전체 데이터에 바로 적용하지 말고 작은 표본으로 후보를 비교한 뒤 고른 구성을 전체에 적용합니다.

1. **평가 질의와 정답 위치를 준비합니다.** 실제 사용자가 할 법한 질문과, 그 답이 원문의 어디에 있는지를 함께 적습니다. 평가 데이터를 만드는 방법은 [RAG 평가 글](/writing/rag-evaluation/)에 정리했습니다.
2. **후보 구성을 2~3개 고릅니다.** 먼저 재귀 분할의 크기를 200·400·800토큰으로 바꿔 비교할 수 있습니다. 문서에 따라 구조 기반 분할이나 부모-자식 검색을 후보로 넣어도 됩니다. 비교할 분할 방식과 크기를 정하고 임베딩 모델, 검색 개수(top_k), 프롬프트는 고정합니다.
3. **검색과 답변을 따로 잽니다.** 필요한 근거 중 상위 k개 결과에서 찾은 비율(recall@k)과 답변이 검색된 근거에 충실한지, 질문에 맞는지를 따로 봅니다. 근거를 하나라도 찾았는지만 보는 hit rate와는 구분합니다. 정답 근거가 하나면 두 지표가 같지만 여러 개면 달라집니다.[^li-retrieval-metrics] 예를 들어 근거 3개 가운데 1개만 찾았다면 hit rate는 1(찾음)이지만 recall은 1/3입니다. 검색이 맞았는데 답이 틀렸는지, 검색부터 틀렸는지를 나눠야 원인을 찾을 수 있습니다.
4. **비용도 함께 기록합니다.** 응답 시간, 레코드 수, 저장 용량, 색인에 든 시간과 LLM 호출 비용을 적습니다.

청크 길이가 임베딩 모델의 상한 안에 드는지도 확인합니다. 아래는 모든 청크의 토큰 수를 모델의 토크나이저로 세어 상한을 넘는 청크를 찾는 예입니다.

```python
from transformers import AutoTokenizer

MODEL = "intfloat/multilingual-e5-large"
MAX_TOKENS = 512  # 모델 카드의 최대 입력 길이

tokenizer = AutoTokenizer.from_pretrained(MODEL)

# e5 계열은 문서 앞에 "passage: " 접두어를 붙여 임베딩합니다
too_long = [c for c in chunks if len(tokenizer.encode("passage: " + c)) > MAX_TOKENS]
print(f"상한 초과 청크: {len(too_long)} / {len(chunks)}")
```

상한을 넘는 청크는 e5처럼 잘라 내는 모델에서는 뒷부분이 벡터에 반영되지 않고 OpenAI처럼 입력을 거부하는 API에서는 색인이 실패합니다(4절). 청크 크기를 줄이거나 그 청크만 다시 자릅니다.

청킹 방식이나 크기를 바꾸면 청크의 경계가 바뀌므로 모든 레코드를 다시 만들어야 합니다. 임베딩 모델을 바꿀 때와 같습니다. 새 컬렉션에 다시 색인하고 alias 같은 기능으로 검색 대상을 바꾸는 방법은 [4편 7절](/writing/vector-database-schema-design/)에서 다뤘습니다. 레코드 메타데이터에 분할 방식과 크기를 남겨 두면 어떤 설정으로 만든 레코드인지 나중에 구분할 수 있습니다.

## 정리

자기 서비스에 적용할 때는 아래 질문을 차례로 확인해 봅니다.

| 확인할 질문 | “예”라면 | 참고 |
| --- | --- | --- |
| 제품 코드·고유명사처럼 단어가 정확히 맞아야 하는 검색이 많은가 | dense와 sparse 벡터를 함께 두고 하이브리드 검색을 검토 | 2·3절 |
| 청크가 임베딩 모델의 최대 입력 토큰을 넘을 수 있는가 | 모델 토크나이저로 길이를 재고 상한 안으로 자름 | 4·7·10절 |
| 문서에 제목·태그·코드 구문 같은 구조가 있는가 | 구조로 먼저 나누고 긴 절만 재귀 분할 | 8절 |
| 주제가 자주 바뀌는 긴 글인가 | 의미 기반 분할을 후보에 넣되 크기 상한을 함께 둠 | 8절 |
| 정밀한 검색과 넓은 맥락이 모두 필요한가 | 부모-자식·계층·문장 창 구성을 검토 | 9절 |
| 청크만 봐서는 대상이 모호한 문서인가 | 제목이나 문서 맥락을 청크 앞에 붙여 임베딩 | 8·9절 |
| 청크 설정을 바꿀 계획이 있는가 | 전체를 다시 색인할 절차와 설정 기록을 준비 | 10절 |

## 참고 자료

[^milvus-dense]: [Milvus — Dense Vector](https://milvus.io/docs/dense-vector.md). v3.0.x. dense 벡터의 정의, 차원 범위, 예시 벡터.
[^milvus-sparse]: [Milvus — Sparse Vector](https://milvus.io/docs/v2.6.x/sparse_vector.md). v2.6.x. 0이 아닌 원소와 인덱스만 저장하는 형식, 어휘와 대응하는 차원, 식별자 검색에서의 장점, 사전 형식 입력, `SPARSE_FLOAT_VECTOR`.
[^milvus-sparse-index]: [Milvus — SPARSE_INVERTED_INDEX](https://milvus.io/docs/sparse-inverted-index.md). v3.0.x. sparse 벡터의 0이 아닌 차원으로 만드는 역색인 구조.
[^milvus-fts]: [Milvus — Full Text Search](https://milvus.io/docs/full-text-search.md). v3.0.x. 텍스트 필드를 BM25 sparse 벡터로 바꾸는 내장 함수.
[^milvus-hybrid]: [Milvus — Multi-Vector Hybrid Search](https://milvus.io/docs/multi-vector-search.md). v3.0.x. 한 컬렉션의 dense·sparse·이미지 벡터 필드, dense와 sparse의 쓰임 비교.
[^milvus-rrf]: [Milvus — RRF Ranker](https://milvus.io/docs/rrf-ranker.md). v3.0.x. 순위 기반 결합과 상수 k.
[^milvus-weighted]: [Milvus — Weighted Ranker](https://milvus.io/docs/weighted-ranker.md). v3.0.x. 경로별 점수의 정규화와 가중합, 거리 지표별 점수 범위.
[^milvus-proxy]: [Milvus — proxy-related Configurations](https://milvus.io/docs/configure_proxy.md). v3.0.x. `proxy.maxVectorFieldNum`의 기본값과 범위.
[^milvus-metric]: [Milvus — Metric Types](https://milvus.io/docs/metric.md). v3.0.x. 코사인 유사도의 범위와 코사인 거리의 관계.
[^qdrant-vectors]: [Qdrant — Vectors](https://qdrant.tech/documentation/concepts/vectors/). dense·sparse 벡터의 정의와 입력 형식, named vectors, multivector와 `max_sim`.
[^qdrant-indexing]: [Qdrant — Indexing](https://qdrant.tech/documentation/concepts/indexing/). dense 벡터의 HNSW와 sparse 벡터 인덱스.
[^qdrant-hybrid]: [Qdrant — Hybrid Queries](https://qdrant.tech/documentation/concepts/hybrid-queries/). `prefetch`, RRF와 DBSF, RRF 상수 k의 기본값.
[^pinecone-terms]: [Pinecone — Key Terms](https://docs.pinecone.io/guides/core-concepts/key-terms). dense·sparse 벡터의 정의, BM25와 학습 기반 sparse 인코더.
[^pinecone-upsert]: [Pinecone — Upsert Data](https://docs.pinecone.io/guides/index-data/upsert-data). `sparse_values`의 `indices`·`values` 형식.
[^pinecone-hybrid]: [Pinecone — Hybrid Search](https://docs.pinecone.io/guides/search/hybrid-search). Documents API와 Vectors API의 하이브리드 검색 방식, 단일 인덱스와 인덱스 분리.
[^pinecone-chunking]: [Pinecone — Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/). 청크 전략을 정할 때의 고려 사항, 고정 크기·문서 구조 기반 분할.
[^weaviate-hybrid]: [Weaviate — Hybrid Search](https://docs.weaviate.io/weaviate/concepts/search/hybrid-search). 벡터 검색과 BM25 키워드 검색의 결합.
[^es-sparse]: [Elasticsearch — Sparse Vector Field Type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/sparse-vector). 토큰과 가중치로 이루어진 `sparse_vector` 필드.
[^es-elser]: [Elasticsearch — ELSER](https://www.elastic.co/docs/explore-analyze/machine-learning/nlp/ml-nlp-elser). Elastic의 학습 기반 sparse 검색 모델.
[^es-rrf]: [Elasticsearch — Reciprocal Rank Fusion](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion). RRF 공식, `rank_constant` 기본값, `rrf` retriever.
[^splade]: [naver/splade](https://github.com/naver/splade); [Formal 외 — SPLADE: Sparse Lexical and Expansion Model for First Stage Ranking](https://arxiv.org/abs/2107.05720). 2021. BERT 언어 모델 헤드로 학습하는 sparse 확장.
[^bge-m3]: [BAAI/bge-m3 모델 카드](https://huggingface.co/BAAI/bge-m3). 차원 1024, 최대 8192토큰, dense·sparse·multi-vector 동시 출력과 sparse 표현의 설명.
[^kure]: [nlpai-lab/KURE-v1 모델 카드](https://huggingface.co/nlpai-lab/KURE-v1). bge-m3 기반 한국어 미세조정, 차원 1024, 최대 8192토큰.
[^e5]: [intfloat/multilingual-e5-large 모델 카드](https://huggingface.co/intfloat/multilingual-e5-large). 임베딩 크기 1024, `query: `·`passage: ` 접두어, 512토큰 절단.
[^bert]: [google-research/bert](https://github.com/google-research/bert); [bert-base-uncased config.json](https://huggingface.co/google-bert/bert-base-uncased/raw/main/config.json). BERT-base 768·BERT-large 1024 은닉 크기, 최대 시퀀스 길이 512, `bert-base-uncased` 어휘 크기 30,522.
[^sbert-usage]: [Sentence Transformers — Usage](https://sbert.net/docs/sentence_transformer/usage/usage.html). 텍스트를 고정 크기 벡터로 바꾸는 임베딩.
[^sbert-length]: [Sentence Transformers — Computing Embeddings, Input Sequence Length](https://sbert.net/examples/sentence_transformer/applications/computing-embeddings/README.html). `max_seq_length`를 넘는 입력의 절단, 입력 길이에 따른 계산 비용.
[^hf-tokenizer]: [Hugging Face Transformers — Tokenization Algorithms](https://huggingface.co/docs/transformers/tokenizer_summary). subword 토큰화와 분할 예.
[^openai-tokens]: [OpenAI — Key Concepts](https://developers.openai.com/api/docs/concepts). 토큰의 정의와 영어 기준 글자·단어 비율.
[^openai-embeddings]: [OpenAI — Vector Embeddings](https://developers.openai.com/api/docs/guides/embeddings). `text-embedding-3` 모델의 기본 차원과 최대 입력, `dimensions` 파라미터.
[^openai-embeddings-api]: [OpenAI API Reference — Create Embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create). 입력의 최대 토큰 제한.
[^openai-retrieval]: [OpenAI — Retrieval](https://developers.openai.com/api/docs/guides/retrieval). vector store 파일의 기본 청크 크기·오버랩과 허용 범위.
[^lc-package]: [langchain-text-splitters 패키지 소스](https://github.com/langchain-ai/langchain/tree/master/libs/text-splitters); [langchain v1 패키지 소스](https://github.com/langchain-ai/langchain/tree/master/libs/langchain_v1/langchain); [langchain_classic/text_splitter.py](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain_classic/text_splitter.py); [LangChain v1 Migration Guide](https://docs.langchain.com/oss/python/migrate/langchain-v1). 분할기 패키지 경로(1.1.3), v1 `langchain`의 모듈 구성, `langchain-classic`의 호환용 재수출과 옮겨진 retriever.
[^lc-overview]: [LangChain — Text Splitters](https://docs.langchain.com/oss/python/integrations/splitters). 분할기 분류와 `RecursiveCharacterTextSplitter` 권장.
[^lc-base]: [langchain_text_splitters/base.py](https://github.com/langchain-ai/langchain/blob/master/libs/text-splitters/langchain_text_splitters/base.py). `TextSplitter` 기본값, 조각 병합과 오버랩, 크기 초과 경고, 토크나이저 기반 길이 함수(`from_huggingface_tokenizer`·`from_tiktoken_encoder`).
[^lc-character]: [LangChain — Split by Character](https://docs.langchain.com/oss/python/integrations/splitters/character_text_splitter). 구분자로 자르고 글자 수로 재는 `CharacterTextSplitter`.
[^lc-recursive]: [LangChain — Recursively Split by Character](https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter). 기본 구분자 목록, `chunk_size`·`chunk_overlap`의 의미.
[^lc-recursive-src]: [langchain_text_splitters/character.py](https://github.com/langchain-ai/langchain/blob/master/libs/text-splitters/langchain_text_splitters/character.py). 재귀 분할 로직과 언어별 구분자.
[^lc-markdown]: [LangChain — Split Markdown by Headers](https://docs.langchain.com/oss/python/integrations/splitters/markdown_header_metadata_splitter). 제목을 메타데이터로 남기는 분할과 `strip_headers`.
[^lc-html]: [LangChain — Split HTML](https://docs.langchain.com/oss/python/integrations/splitters/split_html). 제목 태그 기반 분할.
[^lc-semantic]: [langchain_experimental/text_splitter.py](https://github.com/langchain-ai/langchain-experimental/blob/main/libs/experimental/langchain_experimental/text_splitter.py). 0.4.2. `SemanticChunker`의 문장 분리·묶음·코사인 거리·임계값 계산.
[^lc-parent]: [LangChain API Reference — ParentDocumentRetriever](https://reference.langchain.com/python/langchain-classic/retrievers/parent_document_retriever/ParentDocumentRetriever). 작은 청크로 찾고 부모 문서를 돌려주는 리트리버와 청크 크기의 상충.
[^lc-parent-src]: [langchain_classic/retrievers/parent_document_retriever.py](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain_classic/retrievers/parent_document_retriever.py). langchain-classic 1.0.8. 부모 ID 생성, 자식 메타데이터의 `doc_id`, 벡터 저장소와 docstore 저장.
[^lc-vectorstore]: [langchain_core/vectorstores/base.py](https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/vectorstores/base.py). `add_documents()`에서 본문(`page_content`)과 메타데이터를 분리해 `add_texts()`에 전달하는 경로.
[^lc-multivector]: [langchain_classic/retrievers/multi_vector.py](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain_classic/retrievers/multi_vector.py); [LangChain v0.3 — How to retrieve using multiple vectors per document](https://github.com/langchain-ai/langchain/blob/v0.3/docs/docs/how_to/multi_vector.ipynb). 부모 문서당 여러 벡터, 작은 청크·요약·가상 질문.
[^li-sentence]: [llama_index/core/node_parser/text/sentence.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/node_parser/text/sentence.py). 0.14.25. `SentenceSplitter`의 기본 청크 크기와 오버랩(토큰).
[^li-semantic]: [LlamaIndex — Node Parser Modules](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/). `SemanticSplitterNodeParser`의 `breakpoint_percentile_threshold`.
[^li-code]: [LlamaIndex — Node Parser Modules](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/); [code.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/node_parser/text/code.py). tree-sitter 기반 `CodeSplitter`의 기본값.
[^li-hierarchical]: [llama_index/core/node_parser/relational/hierarchical.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/node_parser/relational/hierarchical.py). 0.14.25. `HierarchicalNodeParser`의 기본 청크 크기.
[^li-automerging]: [llama_index/core/retrievers/auto_merging_retriever.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/retrievers/auto_merging_retriever.py). 0.14.25. 자식 비율에 따른 부모 병합(`simple_ratio_thresh`).
[^li-sentence-window]: [llama_index/core/node_parser/text/sentence_window.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/node_parser/text/sentence_window.py). 0.14.25. 문장 단위 노드와 임베딩에서 빠지는 창 메타데이터.
[^li-docsummary]: [llama_index/core/indices/document_summary/base.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/indices/document_summary/base.py). 0.14.25. 문서 요약을 임베딩해 검색하는 `DocumentSummaryIndex`.
[^li-extractors]: [llama_index/core/extractors/metadata_extractors.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/extractors/metadata_extractors.py). 0.14.25. `QuestionsAnsweredExtractor`·`SummaryExtractor`.
[^li-retrieval-metrics]: [LlamaIndex — Retrieval Metrics 소스](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/evaluation/retrieval/metrics.py). 관련 항목을 하나라도 찾았는지 확인하는 `HitRate` 기본 동작과 관련 항목 전체 중 찾은 비율을 계산하는 `Recall`.
[^llamaindex-chunk]: [LlamaIndex — Evaluating the Ideal Chunk Size for a RAG System using LlamaIndex](https://www.llamaindex.ai/blog/evaluating-the-ideal-chunk-size-for-a-rag-system-using-llamaindex-6207e5d3fec5). 2023. 실험 조건, 청크 크기별 응답 시간·Faithfulness·Relevancy, 결론.
[^chroma-chunking]: [Chroma Research — Evaluating Chunking Strategies for Retrieval](https://www.trychroma.com/research/evaluating-chunking). 2024. 토큰 단위 recall·IoU 평가, 재귀 분할의 구분자 설정, 설정 크기와 실제 평균 청크 길이, 분할 방식별 결과와 결론.
[^unstructured]: [Unstructured — Chunking](https://docs.unstructured.io/open-source/core-functionality/chunking). `chunk_by_title`의 섹션 경계, 표 분리, `max_characters`.
[^anthropic-contextual]: [Anthropic — Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval). 2024. 청크 맥락 생성 방법, 검색 실패율 실험 결과, 비용, 작은 지식 베이스의 처리.
[^late-chunking]: [Günther 외 — Late Chunking: Contextual Chunk Embeddings Using Long-Context Embedding Models](https://arxiv.org/abs/2409.04701). 2024. 짧은 청크의 맥락 손실과 임베딩 뒤 분할.
[^bm25]: [Robertson·Zaragoza — The Probabilistic Relevance Framework: BM25 and Beyond](https://doi.org/10.1561/1500000019). 2009. BM25의 단어 빈도·역문서 빈도·문서 길이 정규화.
[^scipy-cosine]: [SciPy — scipy.spatial.distance.cosine](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.distance.cosine.html). 1.18.0. 코사인 거리의 정의.
