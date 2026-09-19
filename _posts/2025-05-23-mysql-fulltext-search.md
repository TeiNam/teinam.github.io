---
date: 2025-05-23 11:08:25 +0900
title: "MySQL 전문 검색"
category: mysql
excerpt: "MySQL LIKE 검색의 성능 저하를 방지하기 위한 FULLTEXT 인덱스 사용법과 ngram 파서를 활용한 한국어 검색 설정"
updated: 2026-09-20
---

MySQL의 FULLTEXT는 텍스트 기반 데이터를 효율적으로 검색하기 위한 전문 검색 기능을 제공합니다. 일반적인 SQL의 LIKE 연산자와 달리, 키워드 기반으로 텍스트 데이터의 의미를 분석하고 관련성을 평가하여 검색 결과를 반환하는 데 최적화되어 있습니다.

## FULLTEXT의 개념

FULLTEXT 인덱스는 텍스트 컬럼에서 효율적인 검색을 위해 MySQL에서 제공하는 전문 검색 인덱스입니다. 일반적인 인덱스(B-Tree)와 달리 텍스트 데이터를 기반으로 각 단어의 출현 빈도와 위치를 분석하여 고급 검색 기능을 제공합니다. FULLTEXT는 단순한 패턴 매칭이 아니라 **관련성 점수(Relevance Score)**를 기반으로 결과를 정렬할 수 있습니다.

### 지원 데이터 타입

FULLTEXT 인덱스는 다음의 데이터 타입에서 사용할 수 있습니다:
- CHAR
- VARCHAR
- TEXT (및 그 변형: TINYTEXT, MEDIUMTEXT, LONGTEXT)

### FULLTEXT의 작동 방식

#### 토큰화(Tokenization)

텍스트 데이터를 단어 단위로 나누고 인덱싱합니다. 기본적으로 공백과 구두점을 기준으로 단어를 분리합니다.

최소 단어 길이는 스토리지 엔진에 따라 다릅니다:
- **InnoDB**: `innodb_ft_min_token_size` (기본값 3)
- **MyISAM**: `ft_min_word_len` (기본값 4)

이 값을 변경하려면 서버 설정을 수정한 후 FULLTEXT 인덱스를 다시 생성해야 합니다.

#### 불용어 처리(Stop Words)

“the”, “is”, “a”와 같은 자주 사용되지만 검색에 큰 의미가 없는 단어는 인덱싱하지 않습니다. MySQL에 내장된 기본 불용어 목록을 사용하며, 다음 변수로 커스터마이징할 수 있습니다:
- **InnoDB**: `innodb_ft_enable_stopword`, `innodb_ft_server_stopword_table`, `innodb_ft_user_stopword_table`
- **MyISAM**: `ft_stopword_file`

#### TF-IDF 알고리즘

FULLTEXT는 TF-IDF(Term Frequency-Inverse Document Frequency)를 사용하여 단어의 중요도를 계산합니다. 특정 단어가 한 문서에서 많이 나오고 다른 문서에서는 적게 나오면 가중치가 높아집니다.

## FULLTEXT 인덱스 생성 및 사용

### FULLTEXT 인덱스 생성

#### 테이블 생성 시 추가

```sql
CREATE TABLE articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    FULLTEXT KEY articles_title_content_FTX (title, content)
);
```

#### 기존 테이블에 추가

```sql
ALTER TABLE articles ADD FULLTEXT KEY articles_title_content_FTX (title, content);
```

#### 한국어 검색을 위한 ngram 파서 사용

한국어, 중국어, 일본어와 같은 CJK 언어는 공백으로 단어를 구분하지 않기 때문에 기본 파서로는 제대로 검색할 수 없습니다. 이럴 때 ngram 파서를 사용합니다:

```sql
CREATE TABLE articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    FULLTEXT KEY articles_title_content_FTX (title, content) WITH PARSER ngram
);
```

또는 기존 테이블에 추가:

```sql
ALTER TABLE articles ADD FULLTEXT KEY articles_title_content_FTX (title, content) WITH PARSER ngram;
```

ngram 토큰 크기는 `ngram_token_size` 변수로 설정하며, 기본값은 2입니다(범위: 1~10). 이 값을 변경하려면 서버를 재시작해야 합니다:

```ini
[mysqld]
ngram_token_size=2
```

### 검색 쿼리 사용

FULLTEXT 검색은 `MATCH()`와 `AGAINST()` 함수 조합으로 수행됩니다:

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('database optimization');
```

## FULLTEXT 검색 모드

FULLTEXT는 검색 요구에 따라 세 가지 모드를 제공합니다.

### NATURAL LANGUAGE MODE (기본)

텍스트 데이터를 자연어 처리로 분석하며, 관련성이 높은 결과를 반환합니다. 명시하지 않으면 이 모드가 기본입니다:

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('database optimization' IN NATURAL LANGUAGE MODE);
```

#### 50% 임계값 제한

NATURAL LANGUAGE MODE에서는 전체 행의 50% 이상에 나타나는 단어를 자동으로 불용어처럼 처리합니다. 이는 MyISAM 테이블에서 특히 문제가 되는데, 테스트용으로 1~2개 행만 넣으면 모든 단어가 50% 이상에 나타나 어떤 검색도 결과를 반환하지 않습니다.

InnoDB 테이블은 이러한 실험에 더 적합하며, BOOLEAN MODE를 사용하면 이 제한을 우회할 수 있습니다.

이 모드에서는 불용어(stopword)가 적용됩니다.

### BOOLEAN MODE

논리 연산자를 포함하여 복잡한 조건 검색을 수행할 수 있습니다:

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('+database -optimization "query tuning"' IN BOOLEAN MODE);
```

주요 연산자:
- `+`: 반드시 포함되어야 함
- `-`: 제외되어야 함
- `"..."`: 정확한 구문 일치
- `*`: 와일드카드(단어 끝에만 사용 가능)

이 모드에서도 불용어가 적용되지만, 절단 연산자(`*`)가 붙은 단어는 너무 짧거나 불용어여도 제거되지 않습니다.

50% 임계값 제한이 적용되지 않습니다.

### QUERY EXPANSION MODE

기본 검색 결과를 바탕으로 연관 키워드를 확장하여 검색합니다. 두 번의 검색을 수행합니다: 첫 번째는 원래 검색어로, 두 번째는 첫 번째 결과에서 가장 관련성 높은 문서의 단어를 추가하여 검색합니다:

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('optimization' WITH QUERY EXPANSION);
```

이 모드는 사용자가 찾고자 하는 정확한 키워드를 모를 때 유용하지만, 관련 없는 결과가 포함될 수 있습니다.

## FULLTEXT와 LIKE 비교

| 구분 | FULLTEXT | LIKE |
| --- | --- | --- |
| 검색 방식 | 전문 검색 알고리즘 (MATCH…AGAINST) | 단순 패턴 매칭 (`'%패턴%'`) |
| 인덱스 | FULLTEXT 인덱스 필요 | 일반 B-Tree 인덱스 또는 전체 스캔 |
| 검색 성능 | 큰 데이터셋에서 효율적 | 데이터셋이 커질수록 비효율적 |
| 기능 | 관련성 점수, 논리 연산자, Query Expansion | 간단한 와일드카드 패턴만 가능 |

## FULLTEXT의 한계

### 지원 엔진

MySQL의 InnoDB와 MyISAM에서만 FULLTEXT 인덱스를 지원합니다. InnoDB는 MySQL 5.6부터 FULLTEXT를 지원하기 시작했습니다.

### 다국어 지원

기본적으로 영어 기반으로 설계되어 있으며, 한국어·중국어·일본어와 같이 공백으로 단어를 구분하지 않는 언어는 ngram 파서를 사용해야 합니다. 형태소 분석이 필요한 고급 검색은 외부 전문 검색 엔진(Elasticsearch 등)을 고려해야 할 수 있습니다.

### 불용어와 최소 단어 길이

기본적으로 불용어 목록과 최소 단어 길이가 적용됩니다:
- InnoDB: `innodb_ft_min_token_size` (기본값 3)
- MyISAM: `ft_min_word_len` (기본값 4)

이를 변경하려면 서버 설정을 수정한 후 FULLTEXT 인덱스를 다시 생성해야 합니다.

## 실제 사용 사례

### 게시판 검색

게시글의 제목과 내용을 효율적으로 검색하기 위해 사용합니다. 관련성 점수로 정렬하여 가장 관련성 높은 게시글을 먼저 보여줄 수 있습니다.

### 전자상거래

제품 설명이나 리뷰에서 특정 키워드를 기반으로 검색합니다. BOOLEAN MODE를 사용하면 "필수 포함" 또는 "제외" 조건을 쉽게 구현할 수 있습니다.

### 문서 관리 시스템

대량의 문서에서 중요한 정보를 빠르게 검색합니다. QUERY EXPANSION을 활용하면 사용자가 정확한 키워드를 모르더라도 관련 문서를 찾을 수 있습니다.

## 요약

MySQL FULLTEXT는 텍스트 데이터의 고속 검색과 유연성을 제공합니다. LIKE 검색의 성능 문제를 해결하고, 관련성 기반 정렬과 복잡한 검색 조건을 지원합니다. 한국어 검색을 위해서는 ngram 파서를 사용해야 하며, 불용어와 최소 단어 길이 설정을 요구사항에 맞게 조정해야 합니다. 소규모 테스트 시에는 50% 임계값 제한을 고려하여 BOOLEAN MODE를 사용하거나 충분한 데이터를 준비하는 것이 좋습니다.
