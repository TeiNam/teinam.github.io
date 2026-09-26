---
date: 2026-09-25 00:00:00 +0900
title: "벡터 DB란 무엇인가: 중요해진 이유와 주요 제품, 사용 지표로 보는 시장"
category: database
excerpt: "임베딩·유사도 검색·RAG의 관계부터 오픈소스와 상용 제품까지 정리하고 개발자 설문·DB-Engines·GitHub 별 수가 각각 무엇을 재는지 구분해 읽습니다."
last_modified_at: 2026-09-25
---

기술 문서에서 “DB 연결이 몰릴 때 응답이 느려지는 이유”를 검색한다고 생각해 봅시다. 찾고 싶은 문서의 제목은 “커넥션 풀 포화와 대기 시간 분석”일 수 있습니다. 검색어와 문서의 표현이 달라도 관련 있는 내용을 찾는 것이 의미 검색의 목표입니다.

**벡터 DB는 숫자 벡터로 표현한 데이터를 저장하고 벡터 사이의 유사도로 관련 항목을 찾도록 설계된 데이터베이스입니다.** 벡터와 원본 식별자, 메타데이터를 함께 관리하고 검색·필터링·갱신 기능을 제공합니다. 벡터를 만드는 임베딩은 외부 모델에 맡기기도 하고 제품에 통합된 기능을 쓰기도 합니다.[^qdrant-overview][^azure]

RAG와 AI 에이전트가 늘면서 이 검색 기능을 서비스에 붙일 일도 많아졌습니다. 이때 후보는 전용 벡터 DB만이 아닙니다. 기존 DB의 벡터 기능, 검색 엔진, 관리형 검색 서비스까지 함께 살펴봐야 합니다.

제품·라이선스·인기도 정보는 2026년 9월 25일 기준이고 지표마다 자료 시점은 다릅니다. 사용 경험은 Stack Overflow 2025년 조사를, 인기도는 DB-Engines 2026년 9월 표를, GitHub 별 수는 2026년 9월 25일 조회값을 씁니다.

## 1. 벡터 DB는 무엇을 검색하나요

### 임베딩은 데이터를 비교할 수 있게 만든 숫자 표현입니다

임베딩(embedding)은 모델이 텍스트·이미지 같은 데이터를 숫자 배열로 바꾼 표현입니다. 검색용으로 학습된 모델은 서로 관련 있는 항목이 벡터 공간에서 가깝게 놓이도록 표현을 만듭니다. 그래서 질문을 벡터로 바꿔 문서 벡터와 비교하면, 단어가 정확히 겹치지 않아도 관련 문서를 찾을 수 있습니다.[^qdrant-overview]

예를 들어 검색 항목 하나는 다음 정보로 이루어집니다. 벡터 값은 구조를 보여 주려고 넣은 임의의 숫자입니다.

```text
문서 조각 ID: article-42-chunk-3
벡터:        [0.12, -0.35, 0.81, ...]
원본 위치:   기술 문서 42번의 세 번째 조각
메타데이터:  tenant_id, 문서 분류, 수정 시각, 접근 권한 정보
```

검색할 때는 질문 벡터와 가장 가까운 항목 k개, 즉 Top-k를 가져옵니다. 가까움을 재는 척도로는 코사인 유사도, 내적, 유클리드 거리를 주로 씁니다. 척도는 임베딩 모델의 특성에 맞춰 고릅니다.[^faiss]

**차원 수가 같다고 해서 서로 다른 모델의 벡터를 섞어 검색할 수 있는 것은 아닙니다.** 질문 벡터와 문서 벡터는 서로 호환되는 공간에 있어야 합니다. two-tower 구조처럼 질문과 문서에 서로 다른 인코더를 쓰도록 학습한 모델도 있으니, 필요한 조건은 “같은 인코더”가 아니라 “호환되는 공간”입니다. 모델·전처리·버전을 바꾸면 기존 벡터와 호환되는지 확인하고 벡터를 다시 생성할지 정해야 합니다.[^google]

### 가까운 벡터와 좋은 검색 결과를 구분해야 합니다

거리 계산을 정확히 했다고 해서 사용자가 원하는 문서를 찾았다는 뜻은 아닙니다. 임베딩이 한국어, 사내 약어, 코드, 상품명 등을 제대로 표현하지 못하면 수학적으로 가까운 결과도 업무에는 쓸모가 없을 수 있습니다.

검색 품질은 두 가지로 나눠 평가해야 합니다.

- **검색 알고리즘의 품질:** 정확한 최근접 이웃 결과를 얼마나 잘 재현하는가.
- **서비스 검색의 품질:** 사람이 관련 있다고 판단한 문서를 얼마나 잘 찾아내는가.

검색 알고리즘의 품질을 높여도 서비스 검색의 품질은 임베딩 모델과 문서 분할 방식에 따라 달라집니다. 이 구분이 제품 벤치마크를 해석하는 출발점입니다.[^faiss][^google]

## 2. 데이터가 많아지면 왜 ANN 인덱스가 필요할까요

모든 벡터와의 거리를 계산해 정렬하면 정확한 최근접 이웃을 구할 수 있습니다. 데이터가 작거나 필터로 후보가 충분히 줄어들었다면 이 방법이 맞을 수 있습니다. pgvector도 기본 동작은 정확 검색이고 인덱스를 추가하면 근사 검색을 씁니다.[^pgvector]

벡터 수와 차원, 동시 요청이 늘면 전체를 비교하는 비용이 커집니다. 이때 **근사 최근접 이웃 검색(Approximate Nearest Neighbor, ANN)**으로 탐색할 후보를 줄입니다. 정확 검색과 대표적인 ANN 방식을 비교하면 다음과 같습니다.[^hnsw][^pgvector][^faiss]

| 방식 | 접근 방법 | 함께 확인할 사항 |
| --- | --- | --- |
| 정확 검색 | 대상 벡터 전체와 비교 | 데이터 크기·필터 이후 후보 수·동시성 |
| HNSW | 여러 층의 근접 그래프를 따라 후보 탐색 | 탐색량, 인덱스 메모리, 구축·갱신 비용 |
| IVF 계열 | 벡터를 여러 그룹으로 나누고 일부 그룹 탐색 | 그룹 학습, 검색할 그룹 수, 데이터 분포 변화 |
| 양자화 | 벡터 표현을 압축해 저장·비교 비용 절감 | 정확도 손실, 원본 벡터 재순위화, 압축·인덱스 조합 |

ANN에서는 속도와 재현율(recall)이 맞물려 있습니다. 탐색 범위를 줄일수록 빨라지지만 정확 검색이 찾는 이웃을 놓칠 가능성도 커집니다. 정확 검색의 상위 10개 중 ANN이 9개를 찾았다면 이 질문의 **ANN recall@10은 90%**입니다. “정답률 90%인 챗봇”이라는 뜻이 아닙니다.[^google]

제품을 비교할 때는 이 절충 때문에 **같은 데이터·거리 척도·필터·recall 목표에서 잰 지연 시간**을 봐야 합니다. 탐색 후보를 줄여 빨라진 설정과 후보를 늘려 정확해진 설정의 QPS를 나란히 놓으면 잘못된 결론을 내릴 수 있습니다.

## 3. 벡터 DB는 왜 중요해졌을까요

### RAG는 검색한 자료를 모델 입력에 넣습니다

RAG(Retrieval-Augmented Generation)는 질문과 관련된 자료를 먼저 검색하고 그 자료를 질문과 함께 생성 모델에 입력하는 방식입니다. 2020년에 발표된 RAG 논문(Lewis 외)도 언어 모델에 Wikipedia의 밀집 벡터 인덱스를 결합했습니다.[^rag]

기술 문서 챗봇을 만든다면 다음과 같은 흐름을 생각할 수 있습니다.

{% include diagram.html src="vector-rag-flow.svg" caption="색인 경로와 질의 경로가 벡터 DB에서 만나는 RAG 흐름" %}

색인 경로는 원본 문서를 조각으로 나눠 임베딩한 뒤 벡터·원본 ID·메타데이터를 저장합니다. 질의 경로는 질문을 임베딩해 사용자가 접근할 수 있는 문서 범위 안에서 Top-k를 찾습니다. 필요하면 키워드 검색 결과와 합쳐 순위를 다시 매깁니다. 마지막으로 관련 문서를 질문과 함께 LLM에 넘겨 답변을 생성합니다.

이 구조에서는 검색 대상 자료를 갱신하면 새 문서를 답변의 근거로 쓸 수 있습니다. 사내 규정, 제품 설명서, 장애 대응 기록처럼 조직마다 다르고 계속 바뀌는 자료에 적용할 수 있습니다. 다만 검색기가 부정확한 자료를 가져오거나 모델이 자료를 잘못 해석할 수 있으므로, RAG를 쓴다고 답변의 정확성이 보장되지는 않습니다.[^rag]

벡터 검색은 RAG의 검색기를 구현하는 한 가지 방법입니다. 질문에 따라 키워드 검색, SQL, API 조회를 함께 씁니다. 현재 주문 상태처럼 정확한 최신 값이 필요한 질의라면 원천 시스템을 직접 조회하는 편이 맞습니다.

### 텍스트 외의 데이터와 추천에도 적용됩니다

같은 검색 구조는 이미지 검색, 유사 상품 추천, 중복에 가까운 이미지 탐지 등에도 쓰입니다. 텍스트와 이미지를 함께 검색하려면 두 종류의 데이터를 호환되는 공간에 표현하는 모델이 필요합니다. 벡터로 저장했다는 이유만으로 모든 데이터 종류(모달리티)끼리 검색되는 것은 아닙니다.[^azure][^s3vectors]

### 검색을 지속적으로 운영해야 합니다

서비스에서는 문서 추가·삭제, 사용자별 접근 범위, 장애 복구, 검색 지연을 함께 다룹니다. 벡터 검색이 제품 기능으로 자리 잡으면서 이런 운영 작업을 DB나 관리형 서비스에 맡길 필요가 커졌다고 볼 수 있습니다. 이 요구는 임베딩 알고리즘의 발전과는 별개로 제품 선택에 영향을 줍니다.[^qdrant-overview]

## 4. 어떤 오픈소스와 상용 제품이 있나요

먼저 두 기준을 나눕니다. **라이선스**는 소프트웨어를 쓸 수 있는 조건이고 **배포 형태**는 서버와 운영을 누가 맡는지에 따른 구분입니다. 오픈소스 프로젝트에도 유료 관리형 서비스가 있을 수 있습니다.

아래 표는 대표 제품을 추린 것으로, 전체 목록이나 성능 순위가 아닙니다.

### 오픈소스 또는 오픈소스 코어가 있는 주요 선택지

도입할 때는 사용할 릴리스와 배포판의 조건을 따로 확인해야 합니다. 아래 표의 라이선스는 2026년 9월 25일 기준 공식 저장소 기본 브랜치의 표기입니다.

| 제품 | 분류 | 코어 라이선스·범위 | 검토할 만한 지점 |
| --- | --- | --- | --- |
| PostgreSQL + pgvector | 관계형 DB 확장 | PostgreSQL License | 벡터와 업무 데이터를 함께 관리하고 SQL·JOIN·트랜잭션을 활용합니다.[^pgvector] |
| Milvus | 전용 벡터 DB | Apache-2.0 | 분산 구성, 여러 인덱스 방식, 단일 서버·Lite 형태도 제공합니다.[^milvus] |
| Qdrant | 전용 벡터 DB | Apache-2.0 | 벡터와 payload 관리, 메타데이터 필터, dense·sparse·하이브리드 검색을 제공합니다.[^qdrant] |
| Weaviate | 전용 벡터 DB | BSD-3-Clause 코어와 별도 Weaviate License 영역 | 코어와 별도 라이선스 기능의 범위를 구분해 검토해야 합니다.[^weaviate] |
| Chroma | 벡터 검색·검색 데이터 인프라 | Apache-2.0 | 로컬 개발, 영속 저장, 클라이언트·서버 사용 경로와 Chroma Cloud를 제공합니다.[^chroma] |
| LanceDB | 임베디드 검색·멀티모달 데이터 플랫폼 | Apache-2.0 | Lance 컬럼 형식 기반으로 벡터·메타데이터·멀티모달 데이터를 함께 다룹니다.[^lancedb] |
| OpenSearch | 검색 엔진 | Apache-2.0 | 기존 검색 데이터와 벡터 검색을 함께 운영하는 후보입니다.[^opensearch] |
| Vespa | 검색·추천 플랫폼 | Apache-2.0 | 텍스트·벡터·구조화 데이터와 검색 시점의 랭킹을 함께 다룹니다.[^vespa] |

2026년 9월 25일 기준 Weaviate 저장소의 `LICENSE`는 `wl` 디렉터리 밖의 코드에 BSD-3-Clause를, 그 안의 코드에 별도 Weaviate License를 적용한다고 밝힙니다. 예전 자료처럼 저장소 전체를 단일 BSD 라이선스로 표시하면 정확하지 않습니다.[^weaviate]

**FAISS는 따로 구분하는 편이 좋습니다.** MIT 라이선스의 유사도 검색·클러스터링 라이브러리로, 인덱스 알고리즘을 직접 조합하거나 검색 엔진 내부를 구현할 때 활용할 수 있습니다. 인증·운영 API·데이터 관리 계층까지 갖춘 DB 제품과는 비교 범위가 다릅니다.[^faiss]

### 주요 상용·관리형 서비스

| 서비스 | 제공 형태 | 구분해서 볼 점 |
| --- | --- | --- |
| Pinecone | 관리형 벡터 DB | 벡터 검색·지식 검색을 서비스 API로 이용합니다.[^pinecone] |
| Zilliz Cloud | Milvus 기반 관리형 서비스 | Milvus 코어의 라이선스와 관리형 서비스의 기능·운영 조건을 구분합니다.[^zilliz] |
| Qdrant Cloud / Weaviate Cloud / Chroma Cloud / LanceDB Cloud | 해당 프로젝트의 관리형 서비스 | 로컬·오픈소스 형태와 클라우드 형태의 제공 기능이 같은지 확인합니다.[^qdrant][^weaviate][^chroma][^lancedb] |
| Google Cloud Vector Search | 관리형 벡터 검색 엔진 | 인덱스·엔드포인트 운영과 Google Cloud의 검색·AI 기능 연계를 검토합니다.[^google] |
| Azure AI Search | 관리형 검색 서비스 | 벡터·키워드 검색, 필터, 문서 처리 파이프라인을 함께 다룹니다.[^azure] |
| Amazon OpenSearch Service | 관리형 검색 서비스 | OpenSearch 기반 검색 기능과 AWS 서비스 연계를 활용합니다.[^aws-opensearch] |
| MongoDB Atlas의 Vector Search | 관리형 문서 DB의 검색 기능 | MongoDB 데이터와 벡터·전문 검색을 함께 다룹니다. 공식 문서는 self-managed 사용 경로도 별도로 안내합니다.[^mongodb] |
| Amazon S3 Vectors | 벡터 전용 저장·검색 서비스 | 일반 S3 객체 버킷과 구분되는 vector bucket·index·API를 사용합니다.[^s3vectors] |

Elasticsearch와 Redis도 벡터 검색을 제공합니다. 이 두 제품과 MongoDB는 라이선스가 버전·배포판·서비스에 따라 달라서 어느 기준의 조건인지부터 확인해야 합니다.

- **Elasticsearch:** 무료 소스 코드 영역에는 AGPLv3 선택지가 추가됐지만 기본 배포판의 ELv2와는 다른 조건입니다. Elastic Cloud와 상용 구독도 별개입니다.[^elastic-license]
- **Redis 8 이상:** AGPLv3·RSALv2·SSPLv1 중 하나를 고르는 구조입니다. 이전 버전의 BSD나 2024년의 두 가지 라이선스 체계를 그대로 적용하면 안 됩니다.[^redis-license]
- **MongoDB Community Server:** SSPL을 쓰는 소스 공개 모델이며 MongoDB도 SSPL이 OSI 승인을 받은 오픈소스 라이선스가 아니라고 설명합니다. Atlas 서비스 이용 조건은 이와 별개입니다.[^mongodb-license]

## 5. 전 세계에서 가장 많이 쓰는 벡터 DB는 무엇일까요

**공개 자료만으로는 전 세계 운영 환경의 벡터 DB 사용량 1위를 확정할 근거가 부족합니다.** 설치 수, 운영 중인 클러스터 수, 이용 조직 수를 같은 기준으로 집계한 시장 전체 자료를 찾기 어렵기 때문입니다.

대신 성격이 다른 공개 지표 세 가지를 나눠 볼 수 있습니다.

### 사용 경험: Stack Overflow 2025 조사

Stack Overflow 2025년 조사의 AI 에이전트 데이터 저장 도구 문항은 **AI 에이전트를 사용하거나 개발하는 응답자가 지난 1년간 에이전트 메모리·데이터 관리에 쓴 도구**를 물었습니다. 이 문항의 응답자는 **3,398명**으로 전체 응답자의 6.9%입니다. 아래 표는 벡터 검색과 관련된 선택지만 발췌한 것입니다. 선택지 이름 ChromaDB는 Chroma를 가리킵니다.[^survey]

| 제품·프로젝트 | 해당 문항의 사용 경험 응답률 |
| --- | ---: |
| ChromaDB | 19.7% |
| pgvector | 17.9% |
| Pinecone | 11.2% |
| Qdrant | 8.2% |
| Milvus | 5.2% |
| Weaviate | 4.5% |
| LanceDB | 4.4% |

같은 문항 전체로 보면 Redis가 42.9%, GitHub MCP Server가 42.8%로 1·2위입니다. 벡터 검색 도구가 아닌 GitHub MCP Server가 상위에 있을 만큼 이 문항의 범위는 벡터 DB보다 넓습니다. 그래서 Redis 응답률을 벡터 검색 사용률로 읽을 수는 없습니다. 한 사람이 여러 도구를 고를 수 있으므로 표의 비율을 시장 점유율처럼 더해서도 안 됩니다. Supabase(20.9%)와 pgvector처럼 사용 경로가 겹칠 수 있는 선택지를 더하면 같은 사용자를 두 번 셀 수도 있습니다.[^survey]

전체 조사는 177개국 49,009명의 응답을 분석했고 참여자는 주로 Stack Overflow 자체 채널에서 모았습니다. 그러니 전체 조사 규모를 이 문항의 표본 수로 인용하거나, 자발적으로 응답한 표본을 세계 전체 사용자의 분포로 일반화하면 안 됩니다.[^survey-method]

이 자료로 말할 수 있는 것은 **“2025년 조사의 에이전트 데이터 관리 문항에서, 위에 발췌한 벡터 검색 도구 중 ChromaDB의 사용 경험 응답률이 가장 높았다”**까지입니다.

### 인기도: DB-Engines 2026년 9월 자료

DB-Engines는 웹 언급, 검색 관심, 기술 토론, 채용 공고 같은 신호로 인기도를 계산합니다. 방법론 문서는 이 점수가 설치 수나 실제 사용량을 측정하지 않는다고 밝힙니다.[^db-method]

벡터 DBMS 목록(기본 표 26개 제품)에서 데이터 모델이 `Vector` 하나로만 표시된 주요 제품을 추리면 다음과 같습니다. 표의 순위는 벡터 DBMS 원표의 순위를 그대로 옮긴 것입니다.[^db-ranking]

| 제품 | 원표 내 순위 | 2026년 9월 인기도 점수 |
| --- | ---: | ---: |
| Pinecone | 4 | 9.07 |
| Milvus | 6 | 6.85 |
| Qdrant | 7 | 6.82 |
| Weaviate | 9 | 4.74 |
| Chroma | 12 | 2.98 |

이 조건에서는 Pinecone이 가장 높은 점수를 받았습니다. 같은 목록에서 Elasticsearch는 95.50점으로 1위, OpenSearch는 22.11점으로 2위입니다. 두 제품의 점수는 벡터 기능을 포함한 제품 전체의 인기도이므로 그 기능의 사용량으로 읽을 수 없습니다.[^db-ranking]

### 개발자 관심: GitHub 저장소 별 수

Stack Overflow 설문 표에 나온 오픈소스 프로젝트 6개의 별 수는 다음과 같습니다. 2026년 9월 25일 GitHub REST API로 조회한 `stargazers_count` 값이며 GitHub 웹 화면은 이 값을 반올림해 보여 줄 수 있습니다.

| 프로젝트 | 별 수 | 분류 |
| --- | ---: | --- |
| Milvus | 46,253 | 전용 벡터 DB[^milvus] |
| Qdrant | 34,810 | 전용 벡터 DB[^qdrant] |
| Chroma | 29,372 | 검색 데이터 인프라[^chroma] |
| pgvector | 23,157 | PostgreSQL 확장[^pgvector] |
| Weaviate | 16,846 | 전용 벡터 DB·코어와 별도 라이선스 영역[^weaviate] |
| LanceDB | 11,527 | 임베디드 검색·데이터 플랫폼[^lancedb] |

이 중에서는 Milvus가 가장 많습니다. 같은 시각에 조회한 값으로 보면 라이브러리인 FAISS는 40,978개, 검색 플랫폼인 OpenSearch와 Vespa는 각각 13,775개와 7,110개입니다. GitHub의 별은 관심 있는 저장소를 저장하거나 프로젝트에 지지를 표시하는 기능이라서 설치 수나 운영 사용, 유료 고객 수를 뜻하지 않습니다.[^stars]

세 지표에서 앞선 제품은 모두 다릅니다.

| 지표 | 재는 것 | 앞선 제품 |
| --- | --- | --- |
| Stack Overflow 2025 문항(벡터 검색 도구 발췌) | AI 에이전트를 쓰거나 만드는 응답자의 도구 사용 경험 | ChromaDB (19.7%) |
| DB-Engines 2026년 9월(모델이 `Vector` 하나인 제품) | 웹 언급·검색 관심·기술 토론·채용 공고 등으로 계산한 인기도 | Pinecone (9.07점) |
| GitHub 별 수(설문 표의 오픈소스 6개) | 저장소에 대한 관심과 지지 | Milvus (46,253개) |

세 지표는 서로 다른 질문에 답하므로 하나의 “전 세계 점유율 순위”로 합칠 수 없습니다.

## 6. 제품을 고를 때 무엇을 확인해야 할까요

제품 순위와 별개로, 도입 전에 다음 항목을 확인합니다.

| 검토 항목 | 확인할 질문 |
| --- | --- |
| 검색 품질 | 한국어·약어·코드·고유명사 질의에서 필요한 문서를 찾는가? |
| 하이브리드 검색 | 의미 검색과 키워드 검색을 결합했을 때 결과가 개선되는가? |
| 필터 | tenant·사용자 권한·기간 조건을 걸어도 필요한 Top-k를 확보하는가? |
| 갱신 | 원문 변경과 삭제가 검색 결과에 반영되기까지 얼마나 걸리는가? |
| 성능 | 목표 recall과 동시성에서 p95·p99 지연이 요구사항을 충족하는가? |
| 운영 | 백업·복구·증설·모니터링을 누가 담당하며 어떤 범위까지 제공하는가? |
| 이식성 | 원본·벡터·메타데이터를 내보내 다른 엔진에 다시 색인할 수 있는가? |
| 비용 | 임베딩 생성, 재순위화, 인덱스, 복제, 네트워크 비용을 함께 계산했는가? |

특히 메타데이터 필터는 직접 재 봐야 합니다. pgvector 문서는 ANN 인덱스를 스캔한 뒤에 필터를 적용하는 경로를 설명하고 이때 결과가 모자라면 iterative scan으로 보완하는 방법도 안내합니다. Qdrant 문서는 payload index를 검색 그래프와 결합하는 방식을 설명합니다. 필터 문법이 비슷해도 실행 방식과 결과 특성은 다를 수 있습니다.[^pgvector][^qdrant-overview]

저장량은 대략 계산해 볼 수 있습니다. **1,536차원 벡터 100만 개를 float32(4바이트)로 저장하면 숫자 배열만 1,000,000 × 1,536 × 4 = 6,144,000,000바이트, 약 6.14GB입니다.** 단순 산술값이라 실제 DB 용량이나 RAM 요구량과는 다릅니다. 원문·메타데이터·인덱스·복제본·운영 여유 공간은 따로 더해야 합니다.

### 후보를 고르는 순서

후보를 비교하기 전에 평가 세트부터 준비합니다. 우리 문서를 대상으로 질의를 만들고 질의마다 관련 있는 문서를 사람이 판정해 둡니다. 같은 임베딩·차원·거리 척도로 정확 검색 결과도 구해 두면 ANN의 recall을 잴 기준이 됩니다.

이미 PostgreSQL을 운영한다면 pgvector로 요구사항을 충족할 수 있는지부터 측정해 봅니다. 검색 엔진을 운영한다면 그 엔진의 벡터·하이브리드 기능을 후보에 넣습니다. 검색 부하를 따로 확장해야 하거나 전용 기능이 필요하면 전용 벡터 DB를, 운영 부담을 줄여야 하면 관리형 서비스를 후보에 더합니다. 새 후보는 기존 스택과 같은 데이터·recall 목표로 비교합니다.

{% include diagram.html src="vector-selection-path.svg" caption="기존 스택부터 측정하고, 부족할 때 후보를 늘려 같은 조건으로 비교하는 순서" %}

## 정리

벡터 DB가 중요해진 이유는 AI 서비스가 필요한 자료를 찾아 쓰는 과정에서 검색의 비중이 커졌기 때문입니다. 공개 지표는 서로 다른 것을 재므로 제품 순위도 지표마다 달라지고 어느 지표도 운영 환경의 점유율을 보여 주지 않습니다. 최종 선택은 **우리 데이터에서의 검색 품질, 갱신과 권한의 정확성, 운영 가능한 성능과 비용**으로 정하는 것이 좋습니다.

## 참고 자료

[^qdrant-overview]: [Qdrant Overview](https://qdrant.tech/documentation/overview/). 임베딩·검색 흐름, 배포 형태, payload index와 필터, 저장·운영 고려사항.
[^azure]: [Microsoft — Vector Search Overview, Azure AI Search](https://learn.microsoft.com/en-us/azure/search/vector-search-overview). 의미·하이브리드·멀티모달 검색과 임베딩 처리 경로.
[^faiss]: [Meta — FAISS](https://github.com/facebookresearch/faiss). 라이브러리 범위, 거리 척도, 검색 품질·메모리·속도의 절충, MIT 라이선스.
[^google]: [Google Cloud — Vector Search](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/vector-search/overview). 검색 개념, two-tower 예시, recall, 관리형 인덱스와 서비스.
[^pgvector]: [pgvector 공식 저장소](https://github.com/pgvector/pgvector), [라이선스](https://github.com/pgvector/pgvector/blob/master/LICENSE). 정확·근사 검색, 필터, PostgreSQL 통합. GitHub의 라이선스 자동 감지는 `NOASSERTION`으로 표시하지만 LICENSE 본문은 PostgreSQL License입니다. 별 수는 같은 저장소의 GitHub REST API 조회값.
[^hnsw]: Malkov·Yashunin, [Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs](https://arxiv.org/abs/1603.09320). 2016년 최초 제출.
[^rag]: Lewis 외, [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401). NeurIPS 2020.
[^milvus]: [Milvus 공식 저장소](https://github.com/milvus-io/milvus). 배포 형태, 인덱스, Apache-2.0. 별 수는 같은 저장소의 GitHub REST API 조회값.
[^qdrant]: [Qdrant 공식 저장소](https://github.com/qdrant/qdrant). payload·필터·하이브리드 검색, 관리형 서비스, Apache-2.0. 별 수는 같은 저장소의 GitHub REST API 조회값.
[^weaviate]: [Weaviate 공식 저장소](https://github.com/weaviate/weaviate), [2026-09-25 조회 시점 커밋의 LICENSE](https://github.com/weaviate/weaviate/blob/e3f4df7ba89fddc6a6c03fd54102fcc7fed63b7f/LICENSE). 별 수는 같은 저장소의 GitHub REST API 조회값.
[^chroma]: [Chroma 공식 저장소](https://github.com/chroma-core/chroma), [LICENSE](https://github.com/chroma-core/chroma/blob/main/LICENSE). 로컬·서버 사용과 Chroma Cloud. 별 수는 같은 저장소의 GitHub REST API 조회값.
[^lancedb]: [LanceDB 공식 저장소](https://github.com/lancedb/lancedb), [LICENSE](https://github.com/lancedb/lancedb/blob/main/LICENSE). 컬럼 형식·멀티모달 데이터·Cloud/Enterprise 구분. 별 수는 같은 저장소의 GitHub REST API 조회값.
[^opensearch]: [OpenSearch Vector Search](https://docs.opensearch.org/latest/vector-search/), [공식 저장소](https://github.com/opensearch-project/OpenSearch).
[^vespa]: [Vespa 공식 저장소](https://github.com/vespa-engine/vespa). 검색·추천·랭킹 범위와 Apache-2.0.
[^pinecone]: [Pinecone 공식 문서](https://docs.pinecone.io/guides/get-started/overview).
[^zilliz]: [Zilliz Cloud](https://zilliz.com/cloud). Milvus 기반 관리형 서비스.
[^aws-opensearch]: [Amazon OpenSearch Service — Vector search](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/vector-search.html).
[^mongodb]: [MongoDB Vector Search Overview](https://www.mongodb.com/docs/vector-search/). Atlas 및 self-managed 경로와 검색 기능.
[^s3vectors]: [AWS — Working with S3 Vectors and vector buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html).
[^elastic-license]: [Elastic — FAQ on Software Licensing](https://www.elastic.co/pricing/faq/licensing). 소스 코드의 라이선스 선택지와 기본 배포판 ELv2 구분.
[^redis-license]: [Redis Licensing Overview](https://redis.io/legal/licenses/). Redis 8 이상과 이전 버전의 라이선스 구분.
[^mongodb-license]: [MongoDB — Server Side Public License FAQ](https://www.mongodb.com/legal/licensing/server-side-public-license/faq).
[^survey]: [Stack Overflow Developer Survey 2025 — AI Agent data storage tools](https://survey.stackoverflow.co/2025/ai#3-ai-agent-data-storage-tools). 해당 문항의 질문·응답 수·선택지별 비율(2026-09-25 조회).
[^survey-method]: [Stack Overflow Developer Survey 2025 — Methodology](https://survey.stackoverflow.co/2025/methodology). 조사 기간 2025-05-29~2025-06-23, 전체 표본과 모집 방식.
[^db-ranking]: [DB-Engines — Vector DBMS Ranking](https://db-engines.com/en/ranking/vector+dbms). 2026년 9월 표(2026-09-25 조회). 링크는 이후 달의 표로 바뀔 수 있습니다.
[^db-method]: [DB-Engines — Method of calculating the scores](https://db-engines.com/en/ranking_definition). 설치 수·실제 사용량을 측정하지 않는다는 방법론 설명.
[^stars]: [GitHub — Saving repositories with stars](https://docs.github.com/en/get-started/exploring-projects-on-github/saving-repositories-with-stars). 수치 조회: 2026-09-25 12:45 UTC, GitHub REST API `GET /repos/{owner}/{repo}`.
