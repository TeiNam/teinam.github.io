---
date: 2026-09-27 10:00:00 +0900
title: "AWS에서만 쓰는 벡터 검색: S3 Vectors부터 Bedrock Knowledge Bases까지"
category: ai/ml
excerpt: "S3 Vectors, OpenSearch Serverless, DynamoDB 등 AWS 전용 벡터 검색 7종을 인덱스, 질의당 k, 필터, 규모, 확장·과금 단위로 비교하고 Bedrock Knowledge Bases가 맡는 일을 정리합니다."
last_modified_at: 2026-09-27
series: "벡터 DB"
series_index: "3 / 4"
---

**시리즈** · [1. 개념과 제품·사용 지표](/writing/vector-database-overview/) · [2. 선택 기준과 기능 비교](/writing/vector-database-selection/) · **3. AWS 전용 벡터 검색** · [4. 스키마와 컬렉션 설계](/writing/vector-database-schema-design/)

AWS에서 사내 문서 RAG를 만든다고 생각해 봅시다. Bedrock Knowledge Bases로 지식 베이스를 만들 때 대신 만들어 주는 벡터 저장소는 S3 Vectors, OpenSearch Serverless, Aurora PostgreSQL Serverless, Neptune Analytics 네 가지입니다. 이미 운영하는 DynamoDB, MemoryDB, ElastiCache, DocumentDB에도 벡터 검색 기능이 있습니다. 모두 벡터 검색을 지원하지만 질의당 결과 수와 필터 방식, 확장 단위, 과금 단위는 서비스마다 다릅니다.

1편에서는 벡터 DB의 개념과 제품의 종류, 공개 사용 지표를, 2편에서는 어디서나 쓸 수 있는 오픈소스·상용 제품 12종의 기능과 한도를 다뤘습니다. 이 글은 AWS 관리형으로만 쓸 수 있는 벡터 검색 서비스를 2편과 같은 기준으로 비교합니다. 비교 대상은 S3 Vectors, OpenSearch Serverless, DynamoDB, MemoryDB, ElastiCache, DocumentDB, Neptune Analytics입니다. 엔진이 오픈소스인 OpenSearch Service 도메인과 Aurora·RDS for PostgreSQL(pgvector)은 2편과 달라지는 AWS 고유 기능만 다룹니다. Bedrock Knowledge Bases는 이 가운데 S3 Vectors, OpenSearch, Aurora PostgreSQL, Neptune Analytics를 저장소로 쓰면서 수집과 검색을 맡는 계층이라 따로 봅니다.

Amazon Kendra와 Amazon Q Business는 각각 2026년 7월 30일과 7월 31일부터 신규 고객을 받지 않아 비교 대상이 아닙니다. RDS for SQL Server·MariaDB·Oracle의 벡터 기능은 엔진 공급사의 기능이고, Bedrock AgentCore Memory의 의미 검색은 에이전트 메모리 전용이라 역시 비교 대상이 아닙니다.[^retired]

기능과 한도는 2026년 9월 27일 기준 AWS 공식 문서와 가격 페이지, 출시 발표에 적힌 내용을 따릅니다. AWS의 한도는 자주 바뀝니다. S3 Vectors의 질의당 최대 결과 수도 2026년 6월에 100에서 10,000으로 늘었습니다. 이 글은 성능을 측정해 비교하지 않으므로 속도 수치는 싣지 않고, 문서가 서비스 특성으로 밝힌 지연 범위만 인용합니다.

## 1. AWS의 벡터 검색은 어디에 들어 있을까요

AWS의 벡터 검색은 세 곳에 들어 있습니다. 벡터만 담는 저장소(S3 Vectors), 검색 엔진의 벡터 기능(OpenSearch Serverless·OpenSearch Service), 기존 데이터베이스에 붙은 벡터 기능(DynamoDB·MemoryDB·ElastiCache·DocumentDB·Neptune Analytics·Aurora)입니다.

| 서비스 | 기반 | 배포 형태 | 벡터 검색 GA |
| --- | --- | --- | --- |
| S3 Vectors[^s3v] | 객체 스토리지(S3의 벡터 버킷) | 서버리스, 프로비저닝 없음 | 2025-12 |
| OpenSearch Serverless[^oss] | 검색 엔진(OpenSearch의 k-NN) | 서버리스(OCU) | 2023-11, NextGen 세대 2026-05 |
| DynamoDB[^ddb] | NoSQL DB(테이블의 벡터 인덱스) | 서버리스(on-demand 용량 모드 테이블 전용) | 2026-08 |
| MemoryDB[^mdb] | 인메모리 DB(7.1 이상, Valkey·Redis OSS 호환) | 노드 기반 클러스터 | 2024-07 |
| ElastiCache[^ec] | 인메모리 캐시(Valkey 8.2 이상) | 노드 기반 클러스터 | 2025-10 |
| DocumentDB[^docdb] | 문서 DB(MongoDB 호환, 5.0 이상) | 인스턴스 기반 클러스터 | 2023-11 |
| Neptune Analytics[^neptune] | 그래프 분석 엔진(인메모리) | m-NCU 단위로 용량 지정 | 2023-11 |

문서가 서비스 특성으로 밝힌 지연도 자릿수가 다릅니다. S3 Vectors는 드물게 들어오는 질의에 1초 미만, 자주 들어오는 질의에 100밀리초 수준을 제시합니다. DynamoDB와 MemoryDB 문서는 한 자릿수 밀리초, ElastiCache 문서는 마이크로초 수준을 적습니다.[^s3v][^ddb][^mdb][^ec]

## 2. 인덱스와 차원은 어떻게 다를까요

인덱스 알고리즘은 사용자가 직접 고르는 곳과 그렇지 않은 곳으로 나뉩니다. MemoryDB와 ElastiCache는 FLAT과 HNSW 가운데서, DocumentDB는 HNSW와 IVFFlat 가운데서 고릅니다. S3 Vectors와 DynamoDB는 근사 최근접 이웃(ANN) 검색이라고만 밝히며 알고리즘 이름은 문서에 없습니다. OpenSearch Serverless의 NextGen 컬렉션은 엔진과 구성을 서비스가 자동으로 정합니다.

| 서비스 | 인덱스 | 거리 척도 | 최대 차원(벡터 타입) |
| --- | --- | --- | --- |
| S3 Vectors | ANN(알고리즘 이름은 문서에 없음) | 코사인, 유클리드 | 4,096(float32) |
| OpenSearch Serverless | NextGen은 자동 구성, Classic은 nmslib(기본)·Faiss HNSW | 유클리드, 코사인, 내적 | 16,000 |
| DynamoDB | ANN(알고리즘 이름은 문서에 없음) | 코사인, 내적, 유클리드 | 4,096(float32 정밀도로 저장) |
| MemoryDB | FLAT(정확 검색), HNSW | 유클리드, 내적, 코사인 | 32,768(float32) |
| ElastiCache | FLAT, HNSW | 코사인, 유클리드, 내적 | 32,768 |
| DocumentDB | HNSW(엔진 패치 3.0.4574부터 기본), IVFFlat, 인덱스가 없으면 정확 검색 | 유클리드, 코사인, 내적 | 인덱스 2,000, 인덱스 없이 저장 16,000 |
| Neptune Analytics | HNSW, 그래프당 1개 | 제곱 유클리드 거리(점수로 반환) | 1~65,535 |

7종 가운데 사용자가 고르는 압축 선택지를 문서에 적은 곳은 OpenSearch Serverless뿐입니다. NextGen 컬렉션은 모든 인덱스를 기본 32배로 압축하고, 압축 수준을 `1x`·`2x`·`8x`·`16x`·`32x` 가운데서 다시 고르게 합니다. Classic 컬렉션은 FP16 스칼라 양자화, 이진 벡터, 디스크 기반 검색을 지원합니다. S3 Vectors와 MemoryDB는 float32 벡터만 받고, DynamoDB는 인덱스에 float32 정밀도로 저장합니다. S3 Vectors는 벡터 데이터를 자동으로 최적화한다고 설명하지만, 그 방식은 문서에 없습니다. 대부분의 데이터셋에서 평균 recall이 90% 이상이라고 하면서도, 대표 데이터로 직접 시험해 보라고 권합니다.[^oss][^s3v][^ddb][^mdb]

메모리 계획에서는 MemoryDB와 ElastiCache의 차이도 봐야 합니다. ElastiCache는 인덱스가 벡터 사본을 하나 더 두므로 그만큼 공간을 계획하라고 안내합니다. MemoryDB는 인덱스가 벡터 데이터의 중복 사본을 없앤다고 설명합니다.[^ec][^mdb]

생성한 뒤에 바꿀 수 없는 설정도 많습니다. S3 Vectors 인덱스의 차원·거리 척도·필터 불가 메타데이터 키와 MemoryDB HNSW의 `M`·`EF_CONSTRUCTION`은 바꿀 수 없습니다. Neptune Analytics는 그래프를 생성할 때만 벡터 인덱스를 둘 수 있고, 차원도 그때 고정됩니다. MemoryDB는 기존 클러스터에서 벡터 검색을 켤 수 없어, 검색을 켠 설정으로 새 클러스터를 만들어야 합니다. 검색을 끈 클러스터의 스냅샷으로 검색을 켠 새 클러스터를 만들 수는 있습니다.[^s3v][^mdb][^neptune]

## 3. 한 번에 몇 개까지 받을 수 있을까요

비교 대상 7종과 Bedrock Knowledge Bases 가운데 질의당 결과 수(k)의 상한을 문서에 밝힌 곳은 S3 Vectors(10,000개)와 DynamoDB·Bedrock Knowledge Bases(100개)입니다. 나머지 서비스의 문서에는 k 상한이 없고, DocumentDB처럼 함께 묶인 파라미터가 사실상 한도가 되는 곳도 있습니다.

| 서비스 | 질의당 k 상한 | 응답·페이지 | 비고 |
| --- | --- | --- | --- |
| S3 Vectors | `topK` 10,000 | 페이지당 100개, `nextToken`으로 이어 받음 | 10,000을 쓰려면 최신 SDK 필요(2026년 6월 전에는 100), 응답은 기본으로 키만 |
| OpenSearch Serverless | Serverless 문서에는 상한이 없음 | NextGen은 원본 벡터를 응답에서 기본으로 뺌 | OpenSearch Service 도메인 문서는 `k` 최대 10,000 |
| DynamoDB | `TopK` 1~100 | 응답 16MB, 페이지네이션 없음 | 벡터 속성은 기본으로 응답에서 뺌 |
| MemoryDB | `KNN` k의 상한은 문서에 없음 | `LIMIT`을 생략하면 최대 10개 | `TIMEOUT` 절 최대 10,000ms |
| ElastiCache | `KNN` k의 상한은 문서에 없음 | 샤드가 시간 초과되면 부분 결과(기본 켜짐) | `TIMEOUT` 절 최대 60,000ms |
| DocumentDB | `$search`는 문서에 없음, `$vectorSearch`(8.0 이상)는 `limit` ≤ `numCandidates` ≤ 1,000 | 문서에 없음 | HNSW `efSearch` 1~1,000(기본 40) |
| Neptune Analytics | `topK` 기본 10, 상한은 문서에 없음 | 결과는 노드와 점수 | 질의 임베딩은 질의 문자열에 직접 넣음 |
| Bedrock Knowledge Bases | `numberOfResults` 1~100(기본 5) | `nextToken` | 재순위화 뒤 개수도 1~100 |

S3 Vectors를 직접 질의할 때와 OpenSearch Service를 거칠 때는 한도가 다릅니다. S3 Vectors의 `QueryVectors`는 `topK`를 10,000까지 받지만, OpenSearch Service 도메인의 `s3vector` 엔진으로 같은 벡터를 질의하면 `k`는 최대 100입니다. S3 Vectors의 페이지네이션 토큰은 질의 뒤 몇 분 동안 유효하고, 페이지를 받는 사이에 들어온 쓰기는 그 질의 세션에 반영되지 않습니다.[^s3v][^osm]

DocumentDB의 `$vectorSearch`는 두 조건을 합치면 ANN 결과가 최대 1,000개입니다(`limit` ≤ `numCandidates` ≤ 1,000으로 계산한 값). Bedrock Knowledge Bases의 `numberOfResults`는 최대값일 뿐이라 실제 결과는 더 적을 수 있고, 계층형 청크를 쓰면 검색한 자식 청크를 부모 청크로 바꿔 돌려줍니다.[^docdb][^kb]

## 4. 필터와 하이브리드 검색, 테넌트 격리는 어떻게 다를까요

2편에서 본 필터 시점(사전 필터, 사후 필터, 필터 인지 탐색)으로 보면 AWS 문서의 설명 방식이 제각각입니다. S3 Vectors는 벡터 탐색과 필터 평가를 함께 한다고 설명하고, MemoryDB와 ElastiCache 문서는 조건을 만족하는 벡터에만 KNN을 적용한다고 적습니다. DocumentDB 문서에는 벡터 질의와 메타데이터 필터를 결합하는 방법이 없습니다. 아래 표는 2편의 분류에 끼워 맞추지 않고 각 문서의 설명 방식대로 적습니다.

| 서비스 | 필터 | k개가 안 찰 때 | 하이브리드 |
| --- | --- | --- | --- |
| S3 Vectors | 탐색과 필터 평가를 함께 수행, string·number·boolean·list 메타데이터 | 조건에 맞는 벡터가 아주 적으면 k개보다 적을 수 있음 | 지원 안 함, 하이브리드가 필요하면 OpenSearch 연동을 안내 |
| OpenSearch Serverless | `knn` 질의 안의 `filter` 절, 적용 시점은 문서에 없음 | 문서에 없음 | 키워드·neural·k-NN 질의 결합(정규화 프로세서), neural sparse |
| DynamoDB | 파티션 키(HASH)·인라인 필터 속성의 등호(=) 조건, 인라인 필터 최대 18개 | 문서에 없음 | 문서에 없음 |
| MemoryDB | 사전 필터(NUMERIC 범위·TAG) | 문서에 없음 | 질의 연산자에 전문 검색 없음(TEXT 필드는 결과 표시용) |
| ElastiCache | 사전 필터(TAG·NUMERIC, 9.0 이상은 전문 검색 포함) | 문서에 없음 | 9.0 이상에서 전문 검색과 벡터를 한 질의로 결합 |
| DocumentDB | 벡터 질의와 필터를 결합하는 방법은 문서에 없음 | 문서에 없음 | 벡터와 전문 검색을 결합하는 방법은 문서에 없음 |
| Neptune Analytics | `vertexFilter`로 계산 중에 레이블·속성 필터(`topK.byEmbedding`만) | 문서에 없음 | 벡터 검색 결과에서 그래프 순회로 확장 |

7종 가운데 하이브리드 검색을 문서에 적은 곳은 OpenSearch Serverless와 ElastiCache입니다. OpenSearch Serverless는 2025년 8월부터 키워드·neural·k-NN 질의를 검색 파이프라인의 정규화 프로세서로 결합합니다. 이 기능은 11개 리전에서 제공되고 서울 리전은 목록에 없으며, 임베딩 모델은 커넥터로 연결한 원격 모델만 쓸 수 있습니다. ElastiCache는 Valkey 9.0부터 전문 검색과 벡터 검색을 한 질의로 결합합니다. AWS 예시는 텍스트로 먼저 거른 뒤 KNN으로 순위를 매깁니다. S3 Vectors는 하이브리드 검색·집계·다면 검색이 필요한 워크로드에 OpenSearch 연동을 안내합니다.[^oss][^ec][^s3v]

테넌트 격리 방식은 서비스 구조를 따라갑니다. S3 Vectors는 테넌트마다 벡터 인덱스를 두고 IAM·버킷 정책으로 접근을 제한하는 방식을 안내하며, 인덱스마다 고객 관리형 KMS 키를 따로 지정할 수 있습니다. OpenSearch Serverless의 collection group은 KMS 키가 다른 컬렉션끼리 컴퓨팅 자원을 함께 쓰게 하는 기능이고, AWS 발표는 테넌트마다 컬렉션을 두는 멀티테넌트 앱을 주요 용례로 듭니다. NextGen은 그룹 하나에 컬렉션을 10,000개까지 둘 수 있습니다. ElastiCache는 사용자별 에이전트 메모리를 `@user_id` 같은 TAG로 먼저 거른 뒤 KNN 검색을 실행하는 방식을 권합니다.[^s3v][^oss][^ec]

## 5. 규모 한도는 어디서 막힐까요

문서화된 규모 한도는 서비스 구조를 드러냅니다. S3 Vectors는 인덱스당 벡터 수와 요청률로, OpenSearch Serverless와 DynamoDB는 인덱스 수와 용량·전송률 상한으로, 노드 기반 서비스는 인덱스 수와 샤드·노드 구성으로 한도를 적습니다.

| 서비스 | 문서화된 한도 | 비고 |
| --- | --- | --- |
| S3 Vectors | 인덱스당 벡터 20억, 버킷당 인덱스 1만, 계정·리전당 버킷 1만, 인덱스당 쓰기 초당 1,000요청·2,500벡터 | 요청률을 넘으면 429 오류, 질의는 인덱스당 초당 수백 건까지 가능하다고 안내(수치 한도 아님) |
| OpenSearch Serverless | 컬렉션당 인덱스 1,000, 계정 OCU 인덱싱·검색 각 1,700(조정 불가) | OCU 하나는 메모리 6GiB, Classic은 컬렉션당 hot 저장소 10TiB |
| DynamoDB | 테이블당 벡터 인덱스 5, 파티션 키당 검색 1GBps·쓰기 10MBps(모두 조정 가능) | 별도 허용 목록(allowlist) 등록 없이 벡터 인덱스를 만들 수 있는 테이블은 600GB까지(조정 가능) |
| MemoryDB | 인덱스 10, 인덱스당 필드 50, 단일 샤드 | 문서 예시: 벡터 1,000만 개 × 1,536차원(M=16, 비벡터 데이터 0GB)에 데이터와 인덱스 1개로 104.9GB |
| ElastiCache | 인덱스 1,000(9.0 이상)·10(8.2), 인덱스당 필드 1,000·50 | 인덱스가 벡터 사본을 하나 더 둠 |
| DocumentDB | 컬렉션당 인덱스 64, 클러스터 256TiB(8.0 이상) | IVFFlat의 `lists` 최대값이 인스턴스 유형과 차원에 묶임 |
| Neptune Analytics | 16~24,576 m-NCU(1 m-NCU ≈ 메모리 1GiB), 그래프당 대기 질의 8,192 | 그래프의 모든 데이터를 담을 수 있는 m-NCU가 필요 |

### 1억 건 × 768차원이면 무엇이 달라질까요

2편과 같은 조건(벡터 1억 개, 768차원, float32)으로 크기를 계산하려 해도, 공식 산정식을 둔 곳은 S3 Vectors뿐입니다. S3 가격 페이지는 벡터 한 개의 크기를 벡터 값(차원당 4바이트), 키(글자당 1바이트), 메타데이터의 합으로 셉니다. 1억 개 × 768차원이면 벡터 값만 307.2GB입니다(계산값).

질의 요금도 이 크기를 기준으로 합니다. S3 Vectors의 질의 요금은 요청 수, 처리한 데이터(TB), 반환한 데이터(GB)로 매기고, 처리한 데이터는 인덱스의 벡터 수에 평균 벡터 크기(벡터 값·키·필터 가능 메타데이터)를 곱해 계산합니다. 이 인덱스라면 질의 한 번마다 벡터 값만으로 약 0.31TB가 처리한 데이터로 잡힙니다(계산값). 처리한 데이터의 TB당 단가는 인덱스의 벡터 10만 개·1,000만 개를 경계로 구간이 나뉘고, 벡터가 많은 구간일수록 낮습니다. 한편 문서는 질의 성능을 위해 벡터를 여러 인덱스로 나누라고 권합니다.[^s3v][^pricing]

DynamoDB는 검색 요금을 매기는 기준 가운데 처리한 데이터가 항목 수에 비례하지 않는다고 설명합니다. 검색 한 번에 처리하는 데이터는 항목 수의 로그 함수 꼴로 커져, 항목 수가 10,000배가 되어도 1.5배 미만입니다. 처리하는 데이터에는 항목 수보다 차원 수가 더 크게 작용합니다.[^pricing]

다른 서비스는 벡터 수·메모리 산정식을 문서에 두지 않습니다. MemoryDB는 벡터 1,000만 개 × 1,536차원(M=16, 비벡터 데이터 0GB)을 데이터와 인덱스 1개로 담는 데 104.9GB가 든다는 예시와 콘솔 계산기를 제시하고, ElastiCache는 에이전트 메모리 항목 하나에 약 4~6KB(차원 × 4바이트 + 메타데이터)라는 어림값을 적습니다. OpenSearch Serverless는 OCU 하나가 메모리 6GiB라는 구성만, Neptune Analytics는 그래프의 모든 데이터를 담을 수 있는 m-NCU를 골라야 한다는 조건만 밝힙니다.[^mdb][^ec][^oss][^neptune]

## 6. 확장과 과금은 어떻게 다를까요

확장 단위와 과금 단위는 함께 봐야 합니다. 서버리스 서비스는 쓴 만큼 과금하는 대신 요청률과 용량 단위에 상한이 있습니다. MemoryDB, ElastiCache, DocumentDB는 벡터 검색에 추가 요금을 받지 않고 기존 요금 체계(노드·인스턴스 시간, 서비스별 저장·I/O 요금)를 그대로 적용합니다.[^s3v][^oss][^ddb][^mdb][^ec][^docdb][^neptune][^pricing]

| 서비스 | 확장 방식 | 쓰기 반영 | 과금 단위 |
| --- | --- | --- | --- |
| S3 Vectors | 프로비저닝 없음, 인덱스를 나눠 늘림 | 강한 일관성, 쓰기 직후 조회 가능 | 저장 GB-월(논리 크기), 쓰기 논리 GB(PUT당 최소 128KB), 질의 요청 수·처리 TB·반환 GB |
| OpenSearch Serverless | OCU 자동 확장(인덱싱·검색 분리), NextGen은 최소 OCU를 0으로 두면 그룹 전체가 10분 동안 요청이 없을 때 0 OCU | NextGen 10초, Classic 60초 | OCU 시간, 저장 GB-월, GPU 가속 인덱스 빌드 OCU 시간 |
| DynamoDB | on-demand 용량 모드 | 최종 일관성(쓰기 뒤 검색에 나타나기까지 짧은 지연) | 벡터 쓰기 GB, 검색 처리·반환 GB, 인덱스 저장 GB-월(테이블 요금은 별도) |
| MemoryDB | 수직·복제본 확장만(단일 샤드), Multi-Region 불가 | 최종 일관성(백그라운드 스레드가 인덱스 갱신) | 노드 시간, 쓴 데이터 GB, 스냅샷 GB-월 |
| ElastiCache | 수평·수직·복제본 확장 | 프라이머리는 쓰기를 색인한 뒤 응답(9.0 이상), 복제본은 최종 일관성 | 노드 시간, 동기식 내구성 쓰기는 할증 |
| DocumentDB | 인스턴스 크기, 복제본 최대 15개, 서버리스 0.5~256 DCU | 클러스터 읽기 규칙: 프라이머리는 read-after-write, 복제본은 최종 일관성(벡터 인덱스 반영 시점은 문서에 없음) | 인스턴스(초 단위)·I/O·스토리지·백업, 서버리스는 DCU |
| Neptune Analytics | m-NCU 변경(수직), 복제본 0~2개 | 임베딩 변경은 원자적이지 않고 쓰는 즉시 보임 | m-NCU 시간(복제본도 같은 요금), 일시 중지 중 컴퓨팅 요금의 10% |

수평 확장은 MemoryDB와 ElastiCache에서 갈립니다. 같은 Valkey 계열이지만 MemoryDB의 벡터 검색은 단일 샤드로 제한되어 샤드를 늘릴 수 없고, ElastiCache는 수평·수직·복제본 확장을 모두 지원합니다. ElastiCache 문서는 샤드를 늘리면 적재 처리량은 선형으로 늘지만 질의 처리량은 줄 수 있으니, 질의 처리량은 복제본이나 CPU로 늘리라고 안내합니다. DocumentDB도 샤딩하는 Elastic 클러스터에서는 벡터 검색을 쓸 수 없습니다.[^mdb][^ec][^docdb]

OpenSearch Serverless의 NextGen은 최소 OCU를 0으로 둘 수 있습니다. 그룹의 모든 컬렉션에 10분 동안 요청이 없으면 0 OCU로 내려가 과금이 멈추고, 다시 요청이 오면 첫 요청에 10~30초의 지연이 생길 수 있다고 문서가 밝힙니다. Classic은 최소 OCU를 0으로 둘 수 없습니다.[^oss]

Neptune Analytics는 그래프를 일시 중지하면 컴퓨팅 요금의 10%만 내고 데이터와 설정을 유지합니다.[^pricing] 벡터 임베딩 변경은 원자적이지 않아서, 질의가 나중에 실패해도 이미 쓴 임베딩은 남습니다.[^neptune]

## 7. OpenSearch Service와 Aurora에서는 무엇이 달라질까요

두 서비스의 엔진 기능은 2편과 같습니다. AWS 관리형에서 쓸 때는 여기에 AWS 고유 기능과 제약이 더해집니다.

### OpenSearch Service 도메인

`s3vector` 엔진은 벡터를 S3 Vectors 인덱스에 두고 나머지 필드는 도메인에 둡니다. OpenSearch 2.19 이상, OpenSearch Optimized 인스턴스, 최신 패치 버전이 조건이고, 가격 페이지는 벡터 1억 개를 이 엔진의 단일 샤드 k-NN 인덱스에 담는 예를 듭니다. 다만 다음 제약이 있습니다.[^osm][^pricing]

- **질의:** `k`는 최대 100이고, 필터는 사후 필터에 오버샘플링을 더해 적용합니다.
- **인덱스:** 차원은 4,096까지, 거리 척도는 `l2`·`cosinesimil`만 지원합니다. 엔진은 인덱스를 만들 때만 지정할 수 있습니다.
- **기능:** 스냅샷, UltraWarm 이동, 교차 클러스터 복제, split·shrink·clone을 쓸 수 없습니다.
- **운영:** 엔진을 켜거나 끄면 도메인에 blue/green 배포가 일어납니다.

S3 Vectors의 벡터를 OpenSearch에서 검색하는 방법은 하나 더 있습니다. OpenSearch Serverless 컬렉션으로 한 번 내보내는 방식입니다. OpenSearch Ingestion 파이프라인이 데이터를 복사하며, 복사한 뒤에는 동기화되지 않습니다. 데이터가 두 곳에 있는 동안은 두 서비스 요금이 함께 나옵니다.[^s3v][^oss]

{% include diagram.html src="aws-s3vectors-opensearch.svg" caption="S3 Vectors의 벡터를 OpenSearch에서 검색하는 두 가지 경로" %}

도메인의 메모리 배분은 OpenSearch Service가 정합니다. 인스턴스 RAM의 절반을 JVM 힙에 쓰고, k-NN은 기본으로 나머지 절반의 50%까지 씁니다(2편 6절의 메모리 계산에 쓴 규칙). 힙은 기본으로 32GiB까지 잡고, r7g와 OpenSearch Optimized 인스턴스는 Auto-Tune이 필요하다고 판단하거나 지원 요청을 하면 더 큰 힙을 쓸 수 있습니다.[^osm]

GPU 가속 인덱스 빌드는 OpenSearch 3.1 이상 도메인의 Faiss HNSW 인덱스에 쓰고, OCU 시간으로 따로 과금합니다. Bedrock Knowledge Bases의 벡터 저장소로 쓰려면 VPC 안에 있지 않은 퍼블릭 액세스 도메인이어야 합니다.[^osm][^kb]

### Aurora·RDS for PostgreSQL

pgvector 버전은 엔진 마이너 버전에 묶여 있습니다. 2026년 9월 기준으로 Aurora PostgreSQL 18.4·17.10·16.14·15.18·14.23과 RDS for PostgreSQL의 최신 마이너 버전이 pgvector 0.8.2를 제공합니다. 엔진을 업그레이드해도 확장 버전은 자동으로 올라가지 않습니다. 설치된 pgvector가 0.8.0 미만이라면 2편에서 다룬 iterative scan을 쓰기 전에 pgvector 확장 버전을 직접 올려야 합니다.[^aurora]

Aurora에만 있는 기능도 벡터 검색에 쓰입니다. Optimized Reads는 NVMe를 단 R6gd·R6id(Aurora PostgreSQL 14.9·15.4·16.1 이상)와 R8gd(14.12·15.7·16.3·17.4 이상) 인스턴스에서 계층 캐시(tiered cache)로 캐시 용량을 인스턴스 메모리의 최대 5배까지 넓히며, 문서는 pgvector로 수백만 개의 임베딩을 검색하는 생성형 AI 앱을 용례로 듭니다. 계층 캐시는 I/O-Optimized 클러스터에서만 쓰입니다. Aurora ML의 `aws_ml` 2.0은 SQL에서 Bedrock 임베딩 모델을 호출하는 함수를 제공하지만, 결과는 `vector`가 아니라 `float8[]` 형식입니다. Aurora PostgreSQL Limitless Database도 pgvector 확장을 지원합니다.[^aurora]

Bedrock Knowledge Bases는 Aurora PostgreSQL 클러스터를 저장소로 쓸 수 있습니다. 같은 계정의 Aurora PostgreSQL 16.1·15.4·14.9·13.12·12.16 이상 클러스터여야 하고, pgvector 0.5.0 이상과 RDS Data API, Secrets Manager 자격 증명이 필요합니다. `id`·`embedding`·`chunks`·`metadata` 열과 `embedding`의 HNSW 인덱스, `chunks`의 GIN 전문 인덱스도 미리 만들어야 합니다. 이 필드 매핑은 지식 베이스를 만든 뒤 바꿀 수 없고, Data API의 응답은 1MiB로 제한됩니다. RDS for PostgreSQL 인스턴스를 저장소로 쓰는 방법은 Bedrock 문서에 없습니다.[^aurora][^kb]

Aurora의 zero-ETL 통합(Redshift·SageMaker로 복제)이 지원하는 데이터 타입 목록에는 pgvector의 `vector` 타입이 없습니다. 지원하지 않는 타입이 있는 테이블은 동기화가 끊겨 대상에서 쓸 수 없습니다.[^aurora]

## 8. Bedrock Knowledge Bases는 어디까지 대신해 줄까요

Bedrock Knowledge Bases는 벡터 저장소가 아니라, 문서를 파싱·청크 분할·임베딩해 저장소에 넣고 질의 때 검색해 주는 RAG 계층입니다. 지식 베이스는 Customer-managed와 Managed 두 종류입니다. Customer-managed는 고객이 벡터 저장소를 고르고 운영하며, Managed는 저장·색인·검색 인프라를 Bedrock이 운영합니다. Managed 지식 베이스는 2026년 6월에 정식 출시(GA)됐습니다.[^kb]

{% include diagram.html src="aws-bedrock-kb-types.svg" caption="Customer-managed와 Managed 지식 베이스가 맡는 범위" %}

Customer-managed 지식 베이스에서는 파서, 청크 전략, 임베딩 모델, 벡터 저장소를 고른 뒤 동기화로 문서를 수집합니다. 동기화는 수동으로 시작하며, 지난 동기화 뒤에 추가·수정·삭제된 문서만 처리합니다. 청크는 기본(약 300토큰), 고정 크기, 계층형, 의미 기반, 청크 없음 가운데 고릅니다. 임베딩 모델과 저장소 설정은 지식 베이스를 만든 뒤에, 청크 설정은 데이터 소스를 만든 뒤에 바꿀 수 없습니다.[^kb]

저장소는 여덟 가지입니다. 아래 표의 빠른 생성(quick create)은 지식 베이스를 만들 때 Bedrock이 벡터 저장소를 대신 만들어 주는 콘솔 옵션입니다.[^kb]

| 저장소 | 빠른 생성 | 하이브리드 검색 | 조건 |
| --- | --- | --- | --- |
| S3 Vectors | 지원 | 지원 안 함 | float 임베딩만, 벡터당 사용자 메타데이터 1KB·35키 |
| OpenSearch Serverless | 지원 | 지원(필터 가능한 텍스트 필드 필요) | 직접 만들 때는 `faiss` 엔진(NextGen 컬렉션 지원 여부는 Bedrock 문서에 없음), Confluence·SharePoint·Salesforce 데이터 소스는 이 저장소만 |
| Aurora PostgreSQL | 지원(Serverless) | 지원(필터 가능한 텍스트 필드 필요, 취리히·GovCloud 리전 제외) | Data API·Secrets Manager, 필수 열과 HNSW 인덱스 |
| Neptune Analytics | 지원 | 지원 안 함(대신 GraphRAG) | 벡터 인덱스를 둔 그래프, 데이터 소스는 S3만 |
| OpenSearch Service 도메인 | 지원 안 함 | 지원 안 함 | 퍼블릭 액세스 도메인만, OpenSearch 2.13 이상, `faiss` 엔진 |
| Pinecone·Redis Enterprise Cloud·MongoDB Atlas | 지원 안 함 | MongoDB Atlas만 지원(필터 가능한 텍스트 필드 필요) | 외부 서비스, 자격 증명은 Secrets Manager |

Bedrock 사용자 가이드와 2025년 4월 발표는 위 표처럼 하이브리드 검색 지원 저장소를 적지만, API 레퍼런스는 OpenSearch Serverless만 적습니다. 빠른 생성은 콘솔에서만 쓸 수 있고, 이진 임베딩은 OpenSearch Serverless와 OpenSearch Service 도메인(OpenSearch 2.16 이상)에만 저장할 수 있습니다.[^kb]

지식 베이스의 검색 결과 수 상한은 S3 Vectors의 `topK`나 OpenSearch Service 도메인의 `k` 상한(10,000)보다 작습니다. 한도는 다음과 같습니다.[^kb]

- **검색:** `Retrieve`는 `numberOfResults`를 1~100(기본 5)으로 받고, 리전별 초당 20회로 제한됩니다(조정 불가).
- **구성:** 지식 베이스는 계정당 100개, 지식 베이스당 데이터 소스는 5개까지입니다(조정 불가).
- **필터:** `andAll`·`orAll`로 최대 5개씩 묶을 수 있고, `startsWith`는 OpenSearch Serverless 저장소에서만 쓸 수 있습니다.

Managed 지식 베이스는 저장소를 고르지 않습니다. 사용자 지정 임베딩 모델은 float32·1024차원 모델만 쓸 수 있고, 관리형 재순위화가 기본으로 들어 있습니다.[^kb] 검색은 하이브리드 방식이며, Kendra 이전 안내에 따르면 의미 검색만 하는 모드는 없습니다.[^retired]

과금 단위는 원본 데이터 GB-월과 검색 호출 1,000회입니다. Agentic 검색은 Agentic 호출과 그 아래에서 실행된 `Retrieve` 호출을 각각 세고, 임베딩·재순위화 모델을 직접 고르면 그 모델 요금이 더해집니다. 지식 베이스 하나에 10TB까지 저장할 수 있습니다.[^kb][^pricing]

Confluence·SharePoint·Salesforce 데이터 소스는 OpenSearch Serverless만 저장소로 쓸 수 있습니다. 그런데 Customer-managed 지식 베이스에서는 2026년 9월 30일부터 Confluence, SharePoint, Salesforce, Web Crawler 커넥터를 새로 만들 수 없습니다. 이미 만든 커넥터는 수집과 검색을 계속하며, AWS는 이 커넥터가 필요한 앱에 Managed 지식 베이스를 권합니다.[^kb]

## 9. 상황별로 어떤 서비스부터 볼까요

아래는 앞의 비교에서 나온 **먼저 검토할 후보**입니다. 순위가 아니며, 후보를 좁힌 뒤에는 1편의 순서대로 같은 데이터와 recall 목표에서 측정해야 합니다.

| 상황 | 먼저 볼 후보 | 근거 |
| --- | --- | --- |
| 벡터가 많고 질의가 드물며 저장 비용이 중요함 | S3 Vectors | 인덱스당 20억, 프로비저닝 없음, 드문 질의에 1초 미만(1·5절) |
| 키워드 검색을 함께 쓰거나 집계가 필요함 | OpenSearch Serverless, OpenSearch Service 도메인 | 하이브리드·neural sparse, S3 Vectors 벡터 내보내기(4·7절) |
| 데이터가 이미 DynamoDB 테이블에 있고 질의당 결과 100개면 충분함 | DynamoDB | on-demand 테이블에 벡터 인덱스 추가, `TopK` 1~100(1·3절) |
| 짧은 지연이 필요한 캐시·에이전트 메모리를 다룸 | ElastiCache, MemoryDB | 인메모리 Valkey 계열(ElastiCache는 Valkey 8.2 이상 노드 기반 클러스터), 문서상 마이크로초~한 자릿수 밀리초, MemoryDB는 단일 샤드(1·5·6절) |
| MongoDB 호환 문서 DB에서 벡터와 문서를 함께 다룸 | DocumentDB | 5.0 이상 인스턴스 기반 클러스터, 인덱스 2,000차원까지(1·2절) |
| 관계가 중요한 데이터를 벡터와 함께 탐색함 | Neptune Analytics | 그래프 순회와 결합, Bedrock GraphRAG(4·8절) |
| PostgreSQL을 이미 운영함 | Aurora PostgreSQL | 최신 마이너 버전의 pgvector 0.8.2, Optimized Reads, Bedrock 연동(7절) |
| 저장소를 운영하지 않고 RAG를 시작함 | Bedrock Managed 지식 베이스 | Bedrock이 저장소 운영, 항상 하이브리드(8절) |

서울 리전(ap-northeast-2)에서 쓸 계획이라면 기능별 제공 리전을 먼저 확인해야 합니다.[^s3v][^oss][^osm][^neptune][^kb][^mdb][^ec][^docdb][^ddb]

| 서울 리전 | 서비스·기능 |
| --- | --- |
| 제공 | S3 Vectors, OpenSearch Serverless, Neptune Analytics(ap-northeast-2d 가용 영역 제외), Customer-managed 지식 베이스, MemoryDB·ElastiCache·DocumentDB·DynamoDB의 벡터 검색 |
| 제공 리전 목록에 없음 | OpenSearch Serverless의 neural·하이브리드 검색과 자동 의미 보강(서비스가 관리하는 희소 모델로 텍스트를 보강), OpenSearch Service·Serverless의 GPU 가속 인덱스 빌드, Bedrock의 GraphRAG·Managed 지식 베이스·재순위화 모델 |

## 정리

AWS의 벡터 검색은 기존 데이터 서비스 안에도 들어 있습니다. 새 저장소를 고르기 전에, 이미 쓰는 서비스의 벡터 기능이 질의당 k, 필터, 확장 방식에서 요구사항을 채우는지부터 확인하면 선택지가 줄어듭니다.

서비스마다 막히는 지점이 다릅니다. S3 Vectors는 인덱스당 요청률에서 막히고, 인덱스가 클수록 늘어나는 질의 요금도 따져야 합니다. DynamoDB와 Bedrock Knowledge Bases는 질의당 결과 100개에서, MemoryDB는 단일 샤드에서 막힙니다. OpenSearch Serverless는 NextGen과 Classic 가운데 어느 세대인지에 따라 기능과 쓰기 반영 시간이 달라집니다. 서울 리전에서는 기능별 제공 여부도 함께 봐야 합니다.

## 참고 자료

[^s3v]: [Amazon S3 — Working with S3 Vectors](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html), [Limitations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-limitations.html), [Querying Vectors](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-query.html), [Metadata Filtering](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-metadata-filtering.html), [Vector Indexes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-indexes.html), [Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-best-practices.html), [Regions and Quotas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-regions-quotas.html), [OpenSearch Integration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-opensearch.html), [Bedrock Knowledge Bases Integration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-bedrock-kb.html), [GA 발표](https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-s3-vectors-generally-available/), [검색 결과 10,000개 발표](https://aws.amazon.com/about-aws/whats-new/2026/06/s3-vectors-supports-10000-search-results-per-query/). 버킷·인덱스 구조, 한도, 질의와 페이지네이션, 필터, 테넌트 격리, 일관성, 리전.
[^oss]: [Amazon OpenSearch Serverless — Vector Search Collections](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-vector-search.html), [Overview](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-overview.html), [Scaling](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-scaling.html), [Collection Group Capacity Limits](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/collection-groups-capacity-limits.html), [Scale to Zero](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-scale-to-zero.html), [Neural and Hybrid Search](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-configure-neural-search.html), [S3 Vectors Import](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/s3-opensearch-vector-bucket-integration.html), [Automatic Semantic Enrichment](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-semantic-enrichment.html), [Service Quotas](https://docs.aws.amazon.com/general/latest/gr/opensearch-service.html), [NextGen GA 발표](https://aws.amazon.com/about-aws/whats-new/2026/05/amazon-opensearch-serverless-next-generation-generally-available/), [하이브리드 검색 발표](https://aws.amazon.com/about-aws/whats-new/2025/08/amazon-opensearch-serverless-ai-connectors-hybrid-search/), [collection group 컬렉션 10,000개 발표](https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-opensearch-serverless-supports-10000-collections-per-collection-group/). NextGen·Classic 세대 차이, 압축, OCU 확장, 반영 지연, 하이브리드 검색, 자동 의미 보강, 리전.
[^osm]: [Amazon OpenSearch Service — k-NN Search](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/knn.html), [S3 Vectors Engine](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/s3-vector-opensearch-integration-engine.html), [GPU Acceleration](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/gpu-acceleration-vector-index.html), [Service Limits](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/limits.html), [GPU 가속·Auto-optimize 발표](https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-opensearch-service-gpu-accelerated-auto-optimized-vector-indexes/). `s3vector` 엔진의 조건과 제약, 힙과 k-NN 메모리 규칙, GPU 가속 빌드.
[^ddb]: [Amazon DynamoDB — What is Amazon DynamoDB?](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html), [Vector Search](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearch.html), [Requirements and Limitations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearch.Requirements.html), [Working with Vector Indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearchWorkingWith.html), [Service Quotas](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html), [SearchVectors API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_SearchVectors.html), [Endpoints and Quotas](https://docs.aws.amazon.com/general/latest/gr/ddb.html), [GA 발표](https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-dynamodb-vector-search/). 용량 모드 조건, 거리 함수, TopK와 응답 한도, 필터, 일관성, 쿼터, 리전.
[^mdb]: [Amazon MemoryDB — Vector Search](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search.html), [Overview](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-overview.html), [Limits](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-limits.html), [FT.CREATE](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-commands-ft.create.html), [FT.SEARCH](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-commands-ft.search.html), [Multi-Region Prerequisites](https://docs.aws.amazon.com/memorydb/latest/devguide/multi-region.prereq.html), [Endpoints and Quotas](https://docs.aws.amazon.com/general/latest/gr/memorydb-service.html), [GA 발표](https://aws.amazon.com/about-aws/whats-new/2024/07/aws-vector-search-for-amazon-memorydb/). 인덱스와 파라미터, 한도, 단일 샤드 제약과 Multi-Region 미지원, 일관성, 메모리 예시, 과금, 리전.
[^ec]: [Amazon ElastiCache — Search](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/search.html), [Search Features and Limits](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/search-features-limits.html), [Choosing a Configuration](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/choosing-configuration.html), [Agentic Memory Best Practices](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/agentic-memory-best-practices.html), [Engine Parameters](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/ParameterGroups.Engine.html), [Endpoints and Quotas](https://docs.aws.amazon.com/general/latest/gr/elasticache-service.html), [벡터 검색 GA 발표](https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-elasticache-vector-search/), [하이브리드 검색 발표](https://aws.amazon.com/about-aws/whats-new/2026/05/amazon-elasticache-hybrid-search/), [Enhanced Search 블로그](https://aws.amazon.com/blogs/database/enhanced-search-for-amazon-elasticache/). Valkey 버전별 기능과 한도, 확장 방식, 일관성, 과금, 리전.
[^docdb]: [Amazon DocumentDB — Vector Search](https://docs.aws.amazon.com/documentdb/latest/devguide/vector-search.html), [$vectorSearch](https://docs.aws.amazon.com/documentdb/latest/devguide/vectorSearch.html), [Quotas and Limits](https://docs.aws.amazon.com/documentdb/latest/devguide/limits.html), [Serverless](https://docs.aws.amazon.com/documentdb/latest/devguide/docdb-serverless-how-it-works.html), [Managing Performance and Scaling](https://docs.aws.amazon.com/documentdb/latest/devguide/db-cluster-manage-performance.html), [How It Works](https://docs.aws.amazon.com/documentdb/latest/devguide/how-it-works.html), [Regions and Availability Zones](https://docs.aws.amazon.com/documentdb/latest/devguide/regions-and-azs.html), [FAQ](https://aws.amazon.com/documentdb/faqs/), [벡터 검색 발표](https://aws.amazon.com/about-aws/whats-new/2023/11/vector-search-amazon-documentdb/). 인덱스, 차원, k 관련 파라미터, 클러스터 조건, 확장, 일관성, 리전, 과금.
[^neptune]: [Amazon Neptune Analytics — Vector Index](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/vector-index.html), [topK.byEmbedding](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/vectors.topK.byEmbedding.html), [Limits](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/analytics-limits.html), [Query Concurrency](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/query-concurrency-queuing.html), [Modifying a Graph](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/managing-modifying.html), [CreateGraph API](https://docs.aws.amazon.com/neptune-analytics/latest/apiref/API_CreateGraph.html), [FAQ](https://aws.amazon.com/neptune/faqs/). 그래프당 벡터 인덱스, 점수와 필터, 용량 단위, 일관성, 리전.
[^aurora]: [Amazon Aurora — PostgreSQL Extension Versions](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/AuroraPostgreSQL.Extensions.html), [RDS for PostgreSQL Extension Versions](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html), [Aurora PostgreSQL as a Knowledge Base](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.VectorDB.html), [Optimized Reads](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.optimized.reads.html), [Aurora Machine Learning](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/postgresql-ml.html), [Data API Limitations](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.limitations.html), [Limitless Database Extensions](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/limitless-reference.DDL-limitations.html), [Zero-ETL Data Types](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/zero-etl.querying.html). pgvector 버전, Aurora 고유 기능, Bedrock 저장소 조건, zero-ETL 지원 타입.
[^kb]: [Amazon Bedrock — Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html), [Set Up a Vector Store](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-setup.html), [Create a Knowledge Base](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-create.html), [Query Configuration](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-config.html), [Chunking](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-chunking.html), [Sync and Ingest](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-data-source-sync-ingest.html), [Data Source Connectors](https://docs.aws.amazon.com/bedrock/latest/userguide/data-source-connectors.html), [Managed Knowledge Base](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-build-managed.html), [Managed Knowledge Base Regions](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-managed-regions.html), [GraphRAG](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-build-graphs.html), [Reranking Models](https://docs.aws.amazon.com/bedrock/latest/userguide/rerank-supported.html), [Update a Data Source](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-ds-update.html), [UpdateKnowledgeBase API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_UpdateKnowledgeBase.html), [KnowledgeBaseVectorSearchConfiguration API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_KnowledgeBaseVectorSearchConfiguration.html), [Service Quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html), [Managed Knowledge Base GA 발표](https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-bedrock-managed-knowledge-base/), [Aurora·MongoDB Atlas 하이브리드 검색 발표](https://aws.amazon.com/about-aws/whats-new/2025/04/amazon-bedrock-knowledge-bases-hybrid-search-aurora-postgresql-mongo-db-atlas-vector-stores/). 두 가지 지식 베이스, 저장소별 조건, 수집·동기화, 검색 한도, 쿼터, 리전.
[^pricing]: [Amazon S3 Pricing](https://aws.amazon.com/s3/pricing/), [Amazon OpenSearch Service Pricing](https://aws.amazon.com/opensearch-service/pricing/), [Amazon DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/), [Amazon MemoryDB Pricing](https://aws.amazon.com/memorydb/pricing/), [Amazon ElastiCache Pricing](https://aws.amazon.com/elasticache/pricing/), [Amazon DocumentDB Pricing](https://aws.amazon.com/documentdb/pricing/), [Amazon Neptune Pricing](https://aws.amazon.com/neptune/pricing/), [Amazon Aurora Pricing](https://aws.amazon.com/rds/aurora/pricing/), [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/). 서비스별 과금 단위와 산정 기준(2026-09-27 조회).
[^retired]: [Amazon Kendra Availability Change](https://docs.aws.amazon.com/kendra/latest/dg/kendra-availability-change.html), [Amazon Q Business Availability Change](https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/qbusiness-availability-change.html). 신규 고객 가입 종료 일정과 이전 권장 서비스.
