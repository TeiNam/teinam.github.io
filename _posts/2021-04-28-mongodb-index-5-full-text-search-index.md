---
date: 2021-04-28 17:51:13 +0900
title: "MongoDB Index #.5 Full Text Search Index"
category: mongodb
excerpt: "이전 포스트 Full Text Search Index (전문 검색 인덱스) DBMS에서 일반적으로 전문 검색 엔진을 구축할 때 사용하는 알고리즘은 크게 두가지로 나눌수 있습니다. 하나는 형태소 분석(어근 분석, stemming)과 N-Gram 2가지로 나뉘어집니다. 명사와 조사 사…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — text 인덱스가 형태소 분석만 지원하고 한국어에 약하다는 진단은 여전히 유효합니다. 다만 "5.0 정식 출시 때 n-gram 을 넣을지"라는 추측은 시효가 지났고, 현재는 Atlas 뿐 아니라 자체 관리형 배포에서도 MongoDB Search/Vector Search 를 사용할 수 있습니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

이전 포스트

MongoDB Index #.4 Multi key Index

이전 포스팅   멀티 키 인덱스 (Multi key Index) MongoDB는 도큐먼트 기반의 비정규화된 데이터를 저장하는 데이터베이스입니다. 따라서 하나의 도큐먼트가 배열 형태의 데이터를 가지는 경우가 많이 발생하는데, 배열값이 있는 필드를 인덱싱하기 위해서 MongoDB는 각 엘리먼트에 대한 인덱스...

## Full Text Search Index (전문 검색 인덱스)

DBMS에서 일반적으로 전문 검색 엔진을 구축할 때 사용하는 알고리즘은 크게 두 가지로 나뉩니다. 하나는 형태소 분석(어근 분석, stemming)이고, 다른 하나는 N-Gram입니다. 명사와 조사 사이를 띄어쓰기로 구분하는 서구권 언어에서는 형태소 분석 방법이 주로 사용됩니다. 하지만 명사와 조사 사이에 별도의 구분 문자가 없이 연결되는 아시아권 언어, 특히 한국어, 일본어, 중국어에서는 어근 분석이 까다롭기 때문에 N-Gram을 주로 사용합니다.

MongoDB의 Text Search는 형태소 분석 방법만 지원합니다. 한국어 지원 역시 없으며, 한글 전문 검색 엔진을 사용하는 데 많은 제약이 있습니다. 한글 검색이 필요하다면 다른 방법을 사용해야 합니다.

첫 번째 대안은 Percona MongoDB를 사용하는 방법입니다. [이전 포스팅](/writing/mongodb-ngram-full-text-search/)에서 [Precona MongoDB](https://www.percona.com/software/mongodb/percona-server-for-mongodb)의 N-Gram 사용법을 다룬 적이 있었습니다. Percona의 fork 버전에서는 N-Gram을 지원하기 때문에 별도의 검색 엔진을 구축할 필요가 없으며, MongoDB를 많이 사용하기로 유명한 모 IT기업에서도 Percona 버전을 도입해 사용합니다.

두 번째 대안은 ElasticSearch 같은 전문 검색 엔진을 붙여서 사용하는 방법입니다. 엘라스틱 서치는 MongoDB와 비슷하게 JSON 파일로 데이터를 저장하기 때문에 [Monstache로 MongoDB의 컬렉션을 엘라스틱 서치에 동기화](/writing/mongodb-to-elasticsearch-realtime-sync/)하거나, 키바나, 카프카 같은 툴로 다른 데이터베이스에 마이그레이션해서 전문 검색 엔진을 구축하는 방법입니다.

MongoDB의 클라우드 버전인 [아틀라스](https://www.mongodb.com/cloud/atlas/lp/try2?utm_source=google&utm_campaign=gs_apac_south_korea_search_core_brand_atlas_desktop&utm_term=atlas%20mongodb&utm_medium=cpc_paid_search&utm_ad=e&utm_ad_campaign_id=12212624365&gclid=CjwKCAjw7J6EBhBDEiwA5UUM2nQWA2PvUzJIp_DwLPydnqwRzj_xJ7tpVi8Nisqe36AsEAVbrIJnOxoC0MgQAvD_BwE)에서는 한국어 전문 검색을 지원하며, 엘라스틱 서치와 마찬가지로 Nori 형태소 분석기를 사용합니다. 아틀라스에서 N-Gram을 지원하지 않고 형태소 분석을 선택했기 때문에, 2021년 내에 MongoDB 5 버전이 정식 출시될 때 과연 아틀라스와 마찬가지로 Nori 형태소 분석기를 지원할지, N-Gram을 탑재할지 궁금합니다.

### 형태소 분석 알고리즘

MongoDB의 전문 검색 인덱스는 다음과 같은 2가지 중요한 과정을 거쳐 색인 작업이 수행됩니다.

- 불용어(stop word) 처리
- 형태소 분석(stemming)

불용어 처리란 데이터에서 유의미한 단어 토큰만을 선별하기 위해 큰 의미가 없는 단어 토큰을 제거하는 것을 말합니다. 조사, 접미사 같은 단어들은 문장에서 자주 등장하지만 실제 의미 분석을 하는 데는 필요 없는 경우가 많습니다. 이러한 단어들을 불용어라고 부릅니다. 다음은 한국어 불용어 정보를 확인할 수 있는 링크입니다.

- <https://www.ranks.nl/stopwords/korean?fbclid=IwAR2ExNUknGf4bOHA3cECFrv50f8YO2WOTEV4XKP5iDFAANYFWJ1PbMu9j_k>
- <https://github.com/stopwords-iso/stopwords-ko?fbclid=IwAR39k6XIYRN7fFahioaRHu8h2-IBp-vNMShwGMR92n8xlby8LJ6O1VwjHvc>
- <https://gist.github.com/spikeekips/40eea22ef4a89f629abd87eed535ac6a>

불용어의 개수는 많지 않기 때문에 알고리즘을 구현한 코드에서 모두 상수로 정의해서 사용하는 경우가 많고, 유연성을 위해 불용어 자체를 데이터베이스화해서 사용자가 추가하거나 삭제할 수 있게 구현하는 경우도 있습니다.

형태소란 언어에 있어서 "최소 의미 단위"를 말합니다. 이때 의미는 어휘적 의미와 문법적 의미를 모두 포함합니다. 형태소 분석이란 형태소보다 단위가 큰 언어 단위인 어절, 혹은 문장을 최소 의미 단위인 형태소로 분절하는 과정입니다. 오해하지 말아야 하는 것은 형태소를 분석하는 것이 아니라, 형태소로 분석하는 것이라는 점입니다.

영어에서 불용어 처리와 형태소 분석이 어떻게 처리되는지 보겠습니다.

> These are not the droids you are looking for

MongoDB 서버는 우선 색인 작업이 필요한 텍스트를 구분자(공백 또는 문장기호)로 토큰으로 분리합니다.

|  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| These | are | not | the | droids | you | are | looking | for |

구분된 토큰 단위로 불용어 사전에 등록된 단어인지 검색하고, 위 토큰에서 불용어인 These, are, not, the, you, are, for를 필터링하여 제거합니다. 그럼 droids와 looking만 남는데, 이렇게 불용어를 제거한 상태에서 각 단어의 형태소 분석 작업이 시작됩니다. 형태소 분석은 동사의 원형을 찾는 작업입니다.

복수형을 제거한 droid, ing를 제거한 look 이렇게 두 단어를 인덱스에 저장하는 방식이 Text Index입니다. Text Index는 [멀티 키 인덱스](/writing/mongodb-index-4-multi-key-index/)와 동일한 자료 구조로 저장됩니다.

이제 한국어의 경우를 보겠습니다. 다음은 "나는 배가 아파서 걸어서 집에 갔습니다"라는 문장을 형태소 분석한 결과입니다.

> **나**/대명사 **는**/보조사 **배**/명사+**가**/격조사 **아프**/형용사+**아서**/연결어미 **걷**/동사+**어서**/연결어미 **집**/명사+**에**/격조사 **가**/동사+**았**/선어말어미+**습니다**/어말어미

위에서 나, 배, 아프, 걷, 집, 가는 어휘적 의미를 나타내고 있으며 이들을 어휘 형태소라고 부릅니다. 한편 는, 가, 아서, 어서, 에, 았, 습니다는 문법적 의미를 나타내며 이러한 형태소들을 문법 형태소라고 부릅니다.

걸어서의 형태소를 찾으면 걷다라는 동사가 나오는데, 다는 의미가 없으니 걷만 추출하면 됩니다. 이렇듯 한국어는 형태소 분석이 서구권 언어에 비해 더 복잡합니다. 그렇기 때문에 실제 불용어 사전의 관리도 어렵고, 신조어도 빠른 속도로 늘어나기 때문에 사전 관리가 필수입니다. 한국어의 전문 검색을 이용하는 데 있어 MongoDB의 형태소 분석 방법은 적합하지 않습니다.

### N-Gram 알고리즘

N-Gram이란 입력한 문자열을 N개의 기준 단위로 절단하는 방법입니다. 코퍼스에서 n개의 단어 뭉치 단위로 끊어서 이를 하나의 토큰으로 간주합니다. 예를 들어서 문장 An adorable little boy is spreading smiles이 있을 때, 각 n에 대해서 n-gram을 전부 구해보면 다음과 같습니다.

- unigrams : an, adorable, little, boy, is, spreading, smiles
- bigrams(2-gram): an adorable, adorable little, little boy, boy is, is spreading, spreading smiles
- trigrams(3-gram): an adorable little, adorable little boy, little boy is, boy is spreading, is spreading smiles
- 4-grams : an adorable little boy, adorable little boy is, little boy is spreading, boy is spreading smiles

위의 예시처럼 영어는 보통 단어 단위로 자르는데, 한국어의 경우는 음절 단위로 자르기 때문에 조금 다릅니다. "나는 배가 아파서 걸어서 집에 갔습니다"를 3-gram으로 나누면

"나는\_", "는\_배", "\_배가", "배가\_", "가\_아", "\_아파", "아파서", "파서\_", "서\_걸", "\_걸어", "걸어서", "어서\_", "서\_갔", "\_갔습", "갔습니", "습니다"

이렇게 음절 단위로 나뉘어지게 되고, 불용어 제거 단계가 없고, 토크나이징 결과에서 중복 단위 문자열은 중복이 제거되며 유니크한 단위 문자열만 전문 인덱스에 추가됩니다.

### 형태소 분석과 N-Gram의 장단점

|  |  |  |
| --- | --- | --- |
|  | 형태소 분석 | N-Gram |
| 언어 의존도 | 국가마다 사용하는 언어에 맞는 알고리즘이 필요 | 언어의 특성과 무관 |
| 인덱스 크기 | 불용어를 제거 후 유니크한 키워드만 인덱싱하기 때문에 크기가 작음 | 문자열을 바이트 수로 잘라서 모든 부분을 인덱싱하기에 검색에 가치가 없는 부분도 인덱싱하며, 때로는 2개 이상의 인덱스가 필요할 때도 있어 따라서 용량이 큼 |
| 성능 | 인덱스의 크기가 작기 때문에 성능이 빠름 | 많은 인덱스 키를 관리해야 하기 때문에 느림 |
| 검색 품질 | 형태소 분석 알고리즘에 따라 품질의 차이가 많이 나며, 알고리즘에 많은 노력과 시간이 필요 | 적은 노력과 시간으로 평균 이상의 검색 품질이 보장 |

### 전문 검색 인덱스 생성, 삭제 및 조회

필드 레벨의 전문 검색 인덱스 생성

```javascript
db.posts.createIndex( { title: "text" } )

db.posts.createIndex( { title: "text", contents: "text" } )
```

컬렉션 레벨의 전문 검색 인덱스 생성

```javascript
db.posts.createIndex( { "$**": "text" } )
```

인덱스 삭제시에는 인덱스의 이름을 사용합니다.

```bash
db.posts.dropIndex("title_text")
```

조회

```javascript
db.posts.find( { $text: { $search: "java coffee shop" } } )
```

### 중요도(Weight) 할당

MongoDB의 전문 검색 인덱스는 필드별로 중요도(Weight)를 설정할 수 있으며, 중요도를 기준으로 정렬해서 결과를 가져갈 수도 있습니다. 특별히 중요도 설정을 하지 않으면 모든 필드의 중요도는 1로 설정됩니다.

중요도가 설정된 필드의 결과는 각 필드의 검색어 일치 정도와 중요도(Weight)의 곱으로 계산됩니다. 단일 키워드로 동등한 경우 중요도에 설정한 값이 반환되며, 일부만 매칭되는 경우는 0.75 \* N(일치하는 단어 수) 형태로 계산됩니다.

```javascript
db.stores.find(
   { $text: { $search: "coffee shop cake" } },
   { score: { $meta: "textScore" } }
).sort( { score: { $meta: "textScore" } } )
```

`$meta` 쿼리 연산자를 사용하여 일치하는 각 문서의 관련성 점수를 얻고 정렬합니다.

### 다른 언어의 검색

Text Index를 사용할 때 각 언어마다 형태소 분석 방법이 다르기 때문에 인덱스나 도큐먼트가 어떤 언어로 작성되어 있는지 명시해야 합니다. Text 인덱스는 `default_language` 옵션을 지정할 수 있고, 기본값은 `english`입니다. MongoDB가 지원하는 언어의 최신 목록을 확인하려면 <https://docs.mongodb.com/manual/reference/text-search-languages/#text-search-languages>에 들어가보면 됩니다. 한국어는 지원하지 않는 것을 알 수 있습니다.

Text 인덱스에 직접 언어를 지정하지 않고 도큐먼트의 필드 값에 language 필드를 생성해서 도큐먼트별로 언어를 다르게 지정할 수도 있습니다.

MongoDB는 전문 검색을 위해 설계된 DB가 아니기 때문에 전문 검색 인덱스는 보조적으로만 사용하는 것이 좋습니다. 검색 기능이 반드시 필요하다면, 별도의 검색 엔진을 붙여 사용하는 것이 더 효율적일 수 있습니다.

다음 포스트

MongoDB Index #.6 TTL Index

이전 포스트   TTL(Time To Live) Index TTL 인덱스는 도큐먼트가 가진 Date 타입의 필드값을 보고 설정된 TTL Monitor 쓰레드의 삭제 주기에 따라 도큐먼트의 유효기간을 체크하여, 더 이상 유효하지 않은 도큐먼트를 자동으로 삭제하는 기능의 인덱스입니다. TTL...

#### 참고 자료

도서: Real MongoDB

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
