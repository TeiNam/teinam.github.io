---
date: 2021-04-28 17:51:13 +0900
title: "MongoDB Index #.5 Full Text Search Index"
category: mongodb
excerpt: "전문 검색 색인 알고리즘인 형태소 분석과 N-Gram을 비교하고, 한국어를 지원하지 않는 MongoDB text 인덱스의 제약과 대안을 정리했습니다."
updated: 2026-09-20
---

전문 검색 엔진의 색인 알고리즘은 크게 형태소 분석(어근 분석, stemming)과 N-Gram 두 가지로 나뉩니다. 명사와 조사 사이를 띄어쓰기로 구분하는 서구권 언어에는 형태소 분석이 잘 맞습니다. 반면 한국어, 일본어, 중국어처럼 명사와 조사가 구분 문자 없이 붙는 언어는 어근 분석이 까다로워서 N-Gram을 주로 씁니다.

MongoDB의 `text` 인덱스는 형태소 분석만 지원하고, 공식 지원 언어 목록에 한국어가 없습니다. 그래서 한글 전문 검색을 `text` 인덱스로 처리하려고 하면 제약이 큽니다.

> **NOTE** — 공식 문서는 `text` 인덱스 대신 MongoDB Search 인덱스나 MongoDB Vector Search 인덱스를 쓰라고 권고합니다. 그렇다고 `text` 인덱스가 사라진 것은 아닙니다. 자체 관리 배포에서 `$text` 쿼리를 쓰려면 여전히 `text` 인덱스를 만들어야 하고, 같은 문서가 그 방법을 함께 설명합니다. 이 글은 그 `text` 인덱스를 다룹니다.

MongoDB Search는 Atlas 전용 기능이 아닙니다. Atlas에서는 MongoDB가 검색 프로세스인 `mongot`을 대신 운영해 주고, Community Edition 같은 자체 관리 배포에서는 `mongot`을 직접 설치하고 운영합니다. 다만 서버 버전과 `mongot` 버전 조합에 제약이 있어서 공식 호환성 표를 먼저 확인해야 합니다.

한글 검색이 필요하다면 선택지는 세 갈래입니다.

- **Percona Server for MongoDB** — ngram 전문 검색을 내장한 fork입니다. [이전 포스팅](/writing/mongodb-ngram-full-text-search/)에서 사용법을 다뤘고, [Percona 8.0 문서](https://docs.percona.com/percona-server-for-mongodb/8.0/ngram-full-text-search.html)에도 그대로 남아 있습니다. 인덱스를 만들 때 `default_language`를 `ngram`으로 지정하면 됩니다.
- **별도 검색 엔진** — Elasticsearch처럼 JSON 문서를 저장하는 엔진이면 Monstache로 MongoDB 컬렉션을 동기화해 붙일 수 있습니다.
- **MongoDB Search** — 한국어 분석기로 `lucene.korean`과 `lucene.nori`를 제공하고, 한국어·일본어·중국어를 함께 다루는 `lucene.cjk`도 있습니다.

2021년에는 MongoDB가 Nori 형태소 분석기 쪽으로 갈지 N-Gram을 넣을지가 열린 질문이었습니다. 지금은 둘 다 있습니다. MongoDB Search의 사용자 정의 분석기에는 `nGram`과 `edgeGram` 토크나이저가 있고, `minGram`과 `maxGram`으로 자를 길이를 지정합니다. 단 `nGram` 토크나이저를 쓴 사용자 정의 분석기는 동의어나 자동완성 필드 매핑의 `analyzer`에 지정할 수 없습니다. 이 토크나이저들은 단어 하나에서 여러 토큰을 만들어 토큰 그래프를 생성하는데, 동의어와 자동완성 매핑은 그래프를 만들지 않는 토크나이저에서만 동작하기 때문입니다.

## 형태소 분석 알고리즘

MongoDB의 전문 검색 인덱스는 다음 두 과정을 거쳐 색인 작업을 수행합니다.

- 불용어(stop word) 처리
- 형태소 분석(stemming)

불용어 처리란 유의미한 단어 토큰만 남기려고 큰 의미가 없는 토큰을 제거하는 작업입니다. 조사나 접미사 같은 단어는 문장에 자주 등장하지만 의미 분석에는 도움이 되지 않습니다. 이런 단어를 불용어라고 부릅니다. 한국어 불용어 목록은 아래에서 확인할 수 있습니다.

- <https://www.ranks.nl/stopwords/korean>
- <https://github.com/stopwords-iso/stopwords-ko>
- <https://gist.github.com/spikeekips/40eea22ef4a89f629abd87eed535ac6a>

불용어의 개수는 많지 않아서 알고리즘 구현 코드에 상수로 박아 두는 경우가 많습니다. 유연성이 필요하면 불용어 자체를 데이터베이스에 넣고 사용자가 추가하거나 삭제하게 만듭니다.

형태소는 언어의 "최소 의미 단위"를 말합니다. 이때 의미는 어휘적 의미와 문법적 의미를 모두 포함합니다. 형태소 분석은 형태소보다 큰 언어 단위인 어절이나 문장을 최소 의미 단위인 형태소로 분절하는 과정입니다. 형태소를 분석하는 것이 아니라 형태소로 분석한다는 점을 오해하기 쉽습니다.

영어에서 불용어 처리와 형태소 분석이 어떻게 이뤄지는지 보겠습니다.

> These are not the droids you are looking for

MongoDB 서버는 먼저 색인할 텍스트를 구분자(공백 또는 문장기호)로 잘라 토큰으로 분리합니다.

```text
These / are / not / the / droids / you / are / looking / for
```

구분된 토큰마다 불용어 사전에 등록된 단어인지 검색하고, 위 토큰에서 불용어인 These, are, not, the, you, are, for를 걸러 제거합니다. 그러면 droids와 looking만 남고, 이 상태에서 각 단어의 형태소 분석이 시작됩니다. 형태소 분석은 단어의 원형을 찾는 작업입니다.

복수형을 제거한 droid, ing를 제거한 look 이렇게 두 단어를 인덱스에 저장하는 방식이 `text` 인덱스입니다. `text` 인덱스는 [멀티 키 인덱스](/writing/mongodb-index-4-multi-key-index/)와 동일한 자료 구조로 저장됩니다.

이제 한국어를 보겠습니다. 다음은 "나는 배가 아파서 걸어서 집에 갔습니다"를 형태소 분석한 결과입니다.

> **나**/대명사 **는**/보조사 **배**/명사+**가**/격조사 **아프**/형용사+**아서**/연결어미 **걷**/동사+**어서**/연결어미 **집**/명사+**에**/격조사 **가**/동사+**았**/선어말어미+**습니다**/어말어미

여기서 나, 배, 아프, 걷, 집, 가는 어휘적 의미를 나타내며 어휘 형태소라고 부릅니다. 는, 가, 아서, 어서, 에, 았, 습니다는 문법적 의미를 나타내며 문법 형태소라고 부릅니다.

걸어서의 형태소를 찾으면 걷다라는 동사가 나오는데, 다는 의미가 없으니 걷만 추출하면 됩니다. 이렇듯 한국어는 형태소 분석이 서구권 언어보다 복잡합니다. 불용어 사전 관리도 어렵고 신조어가 계속 늘어나서 사전을 계속 손봐야 합니다. 한국어 전문 검색에 MongoDB의 형태소 분석 방식은 적합하지 않습니다.

## N-Gram 알고리즘

N-Gram은 입력 문자열을 N개의 기준 단위로 잘라내는 방법입니다. 코퍼스를 n개의 단어 뭉치로 끊어 하나의 토큰으로 간주합니다. 예를 들어 An adorable little boy is spreading smiles라는 문장에서 각 n에 대한 n-gram을 구하면 다음과 같습니다.

- unigrams: an, adorable, little, boy, is, spreading, smiles
- bigrams(2-gram): an adorable, adorable little, little boy, boy is, is spreading, spreading smiles
- trigrams(3-gram): an adorable little, adorable little boy, little boy is, boy is spreading, is spreading smiles
- 4-grams: an adorable little boy, adorable little boy is, little boy is spreading, boy is spreading smiles

영어는 보통 단어 단위로 자르지만, 한국어는 음절 단위로 자르기 때문에 결과가 다릅니다. "나는 배가 아파서 걸어서 집에 갔습니다"를 3-gram으로 나누면 이렇습니다.

"나는\_", "는\_배", "\_배가", "배가\_", "가\_아", "\_아파", "아파서", "파서\_", "서\_걸", "\_걸어", "걸어서", "어서\_", "서\_갔", "\_갔습", "갔습니", "습니다"

이렇게 음절 단위로 나뉘고, 불용어 제거 단계가 없습니다. 토크나이징 결과에서 중복된 단위 문자열은 제거되고 유니크한 단위 문자열만 전문 인덱스에 들어갑니다.

## 형태소 분석과 N-Gram의 장단점

| 항목 | 형태소 분석 | N-Gram |
| --- | --- | --- |
| 언어 의존도 | 언어별 알고리즘이 필요 | 언어 특성과 무관 |
| 인덱스 크기 | 불용어를 걸러 유니크한 키워드만 색인해 작음 | 문자열의 모든 구간을 색인해 큼 |
| 사전 관리 | 불용어·형태소 사전을 계속 관리 | 사전 없이 동작 |
| 검색 품질 | 알고리즘 완성도에 따라 편차가 큼 | 사전 없이도 평균 수준을 확보 |

인덱스가 커지는 만큼 조회 비용도 따라옵니다. Percona 문서는 자사의 ngram 전문 검색이 MongoDB 전문 검색보다 느리다고 적습니다. MongoDB 공식 문서도 `text` 인덱스가 도큐먼트마다, 인덱싱된 필드마다, 어간 처리된 단어마다 인덱스 항목 하나를 만들기 때문에 RAM을 많이 쓰고 쓰기 성능에 영향을 준다고 설명합니다.

## 전문 검색 인덱스 생성, 삭제 및 조회

필드 레벨의 전문 검색 인덱스 생성입니다.

```javascript
db.posts.createIndex( { title: "text" } )

db.posts.createIndex( { title: "text", contents: "text" } )
```

컬렉션 레벨의 전문 검색 인덱스 생성입니다.

```javascript
db.posts.createIndex( { "$**": "text" } )
```

인덱스를 삭제할 때는 인덱스 이름을 사용합니다.

```javascript
db.posts.dropIndex("title_text")
```

조회는 `$text` 연산자로 합니다.

```javascript
db.posts.find( { $text: { $search: "java coffee shop" } } )
```

`text` 인덱스에는 버전이 있습니다. MongoDB 3.2에서 버전 3이 들어왔고, 그 이후에 만드는 `text` 인덱스의 기본값이 버전 3입니다. `textIndexVersion` 옵션으로 이전 버전을 지정할 수 있지만, 공식 문서는 호환성 때문에 필요한 경우가 아니면 기본 버전을 쓰라고 권합니다. 버전 3의 `text` 인덱스는 대소문자를 구분하지 않고, `é`·`ê`·`e`처럼 발음 구별 기호가 붙은 문자와 붙지 않은 문자도 구분하지 않습니다.

## text 인덱스의 제약

`text` 인덱스는 다른 인덱스보다 제약이 많습니다. 설계 단계에서 걸리는 것들만 모으면 다음과 같습니다.

- 컬렉션 하나에 `text` 인덱스는 **하나만** 만들 수 있습니다. 대신 그 인덱스가 여러 필드를 포함할 수는 있습니다.
- `$text` 표현식이 들어간 쿼리에는 `hint()`로 사용할 인덱스를 지정할 수 없습니다.
- `text` 인덱스는 정렬 성능을 개선하지 못합니다. 단일 필드 인덱스든 복합 인덱스든 마찬가지입니다.
- 복합 인덱스에 `text` 키와 오름차순·내림차순 키를 함께 둘 수 있지만, 멀티키나 지리 공간 같은 다른 특수 인덱스 필드와는 섞을 수 없습니다. 또 `text` 키 앞에 다른 키가 오면 `$text` 쿼리에 그 키들에 대한 동등 조건이 있어야 하고, `text` 키들은 인덱스 정의에서 서로 붙어 있어야 합니다.
- `text` 인덱스는 항상 sparse이고 `sparse` 옵션은 무시됩니다. 커버드 쿼리에도 쓸 수 없습니다.
- `text` 인덱스는 이진 비교만 하고 collation 옵션을 지원하지 않습니다. simple이 아닌 collation을 가진 컬렉션에 만들려면 인덱스 생성 시 `collation: { locale: "simple" }`을 명시해야 합니다.
- 쿼리 하나에 `$text` 표현식은 하나만 올 수 있고, `$nor`나 `$elemMatch` 안에서는 쓸 수 없습니다. 뷰도 `$text`를 지원하지 않습니다.
- 애그리게이션에서는 `$text`가 들어간 `$match`가 파이프라인의 **첫 번째** 스테이지여야 합니다.

`$search` 문자열에 여러 단어로 된 구와 개별 단어가 섞여 있으면, `$text`는 그 구를 포함하는 도큐먼트만 매칭합니다. 개별 단어만 가진 도큐먼트는 결과에서 빠집니다.

## 중요도(Weight) 할당

`text` 인덱스는 필드별로 중요도(weight)를 설정할 수 있습니다. 중요도를 지정하지 않으면 모든 필드의 중요도는 1입니다. 중요도는 다른 인덱싱된 필드와 비교한 상대적 비중을 뜻하고, 값이 클수록 점수가 높아집니다.

```javascript
db.blog.createIndex(
   { content: "text", keywords: "text", about: "text" },
   { weights: { content: 10, keywords: 5 }, name: "BlogTextIndex" }
)
```

검색어가 여러 필드에 걸쳐 일치하면, MongoDB는 필드별 일치 횟수에 해당 필드의 중요도를 곱해 모두 더한 값을 점수로 계산합니다. 위 예에서 `content`의 단어 일치는 `keywords`의 10대 5, 즉 두 배의 영향을 줍니다. 인덱스를 만든 뒤에 중요도를 바꾸면 컬렉션을 다시 색인해야 하므로, 큰 컬렉션에서는 성능에 영향을 줄 수 있습니다.

`$text`는 기본적으로 점수 순으로 결과를 정렬하지 않습니다. 점수를 쓰려면 `$meta` 연산자로 꺼내야 합니다.

```javascript
db.stores.find(
   { $text: { $search: "coffee shop cake" } },
   { score: { $meta: "textScore" } }
).sort( { score: { $meta: "textScore" } } )
```

프로젝션 없이 `sort()`에만 `{ $meta: "textScore" }`를 써도 됩니다. 이 경우 점수를 결과에 노출하지 않고 관련도 순으로만 정렬합니다. 애그리게이션에서는 `$sort` 스테이지에서 같은 `$meta` 표현식을 씁니다.

## 다른 언어의 검색

언어마다 형태소 분석 방식이 다르기 때문에 인덱스나 도큐먼트가 어떤 언어인지 명시해야 합니다. `text` 인덱스는 `default_language` 옵션으로 언어를 지정하고, 기본값은 `english`입니다. 이 값이 어간 처리 규칙과 걸러낼 불용어 목록을 결정합니다.

공식 문서가 `$text`에서 지원한다고 밝힌 언어는 다음 15개입니다. 언어 이름과 ISO 639-1 두 글자 코드를 모두 받습니다.

- danish, dutch, english, finnish, french, german
- hungarian, italian, norwegian, portuguese, romanian
- russian, spanish, swedish, turkish

한국어는 목록에 없고, 일본어와 중국어도 없습니다. 같은 문서가 더 많은 언어 분석기를 원하면 MongoDB Search 인덱스와 `$search` 스테이지를 쓰라고 안내합니다.

`default_language`를 `none`으로 주면 인덱스가 불용어까지 포함해 모든 단어를 그대로 파싱하고 접미사 어간 처리를 건너뜁니다. 어간 처리가 도움이 되지 않는 언어에서 쓸 수 있는 탈출구입니다.

컬렉션 안에 여러 언어가 섞여 있으면 도큐먼트에 `language` 필드를 두고 값으로 언어를 지정합니다. 그러면 인덱스가 도큐먼트마다 그 필드 값에 따라 어간 규칙과 불용어를 달리 적용합니다. 임베디드 도큐먼트에 `language` 필드가 없으면 상위 도큐먼트의 값을 따르고, 그것도 없으면 기본 언어를 씁니다.

MongoDB는 전문 검색을 위해 설계된 데이터베이스가 아닙니다. `text` 인덱스는 보조 수단으로 쓰는 편이 좋습니다. 검색 기능이 제품의 핵심이라면 MongoDB Search를 붙이거나 별도의 검색 엔진을 두는 편이 낫습니다.

## 참고 자료

도서: Real MongoDB

MongoDB Manual: [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/)
