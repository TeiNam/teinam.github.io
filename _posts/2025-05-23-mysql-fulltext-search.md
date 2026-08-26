---
date: 2025-05-23 11:08:25 +0900
title: "MySQL 전문 검색"
category: database
excerpt: "MySQL Like 검색 사용을 통한 성능저하를 방지 하기 위한 Fulltext 검색 사용법"
updated: 2025-05-23
---
## MySQL Fulltext Index

- MySQL의 FULLTEXT는 텍스트 기반의 데이터를 효율적으로 검색하기 위한 전문 검색(Full-Text Search) 기능을 제공한다.
- 이 기능은 일반적인 SQL의 LIKE 연산자와 달리, 키워드 기반으로 텍스트 데이터에서 의미를 분석하고, 관련성을 평가하여 검색 결과를 반환하는 데 최적화되어 있다.

### FULLTEXT의 개념

- FULLTEXT 인덱스는 텍스트 컬럼에서 효율적인 검색을 위해 MySQL에서 제공하는 전문 검색 인덱스이다.
- 일반적인 인덱스(B-Trees)와는 달리, 텍스트 데이터를 기반으로 각 단어의 출현 빈도와 위치를 분석하여 고급 검색 기능을 제공한다.
- FULLTEXT는 단순한 패턴 매칭이 아니라 **관련성 점수(Relevance Score)**를 기반으로 결과를 정렬할 수 있다.

#### 지원 데이터 타입

- FULLTEXT 인덱스는 다음의 데이터 타입에서 사용할 수 있다:
  1. CHAR
  2. VARCHAR
  3. TEXT (및 그 변형: TINYTEXT, MEDIUMTEXT, LONGTEXT)

#### FULLTEXT의 작동 방식

1. 토큰화(Tokenization):
   - 텍스트 데이터를 단어 단위로 나누고, 이를 인덱싱한다.
   - 기본적으로 공백과 구두점을 기준으로 단어를 분리.
   - MySQL의 기본 단어 길이 기준은 3자 이상 (설정 변경 가능, 최소 2자)
2. 불용어 처리(Stop Words):
   - “the”, “is”, “a”와 같은 자주 사용되지만 검색에 큰 의미가 없는 단어는 인덱싱하지 않는다.
   - MySQL에 내장된 기본 불용어 목록을 사용하며, 필요하면 커스터마이징 할 수 있다.
3. TF-IDF 알고리즘:
   - FULLTEXT는 TF-IDF(Term Frequency-Inverse Document Frequency)를 사용하여 단어의 중요도를 계산한다.
   - 특정 단어가 한 문서에서 많이 나오고 다른 문서에서는 적게 나오면 가중치가 높아진다.

### FULLTEXT 인덱스 생성 및 사용

#### FULLTEXT 인덱스 생성

- FULLTEXT 인덱스를 생성하려면 다음과 같은 구문을 사용한다:

##### 테이블 생성 시 추가

```sql
CREATE TABLE articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    FULLTEXT KEY articles_title_content_FTX (title, content)
);
```

##### 기존 테이블에 추가

```sql
ALTER TABLE articles ADD FULLTEXT KEY articles_title_content_FTX (title, content) WITH PARSER ngram;
```

#### 검색 쿼리 사용

- FULLTEXT 검색은 MATCH()와 AGAINST() 함수 조합으로 수행된다.

##### 기본 검색

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('database optimization');
```

##### 모드 지정

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('database optimization' IN NATURAL LANGUAGE MODE);
```

#### FULLTEXT 검색 모드

- FULLTEXT는 검색 요구에 따라 다음 세 가지 모드를 제공한다:

##### NATURAL LANGUAGE MODE (기본)

- 텍스트 데이터를 자연어 처리로 분석하며, 관련성이 높은 결과를 반환한다.
- 키워드 사이에 논리 연산자(AND, OR 등)를 사용할 수 없다.

##### BOOLEAN MODE

- 논리 연산자를 포함하여 복잡한 조건 검색을 수행할 수 있다.
- 결과는 관련성 점수가 아닌 조건 일치 여부로 반환된다.

###### Boolean 모드 예제

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('+database -optimization "query tuning"' IN BOOLEAN MODE);
```

##### QUERY EXPANSION MODE

- 기본 검색 결과를 바탕으로 연관 키워드를 확장하여 검색한다.

```sql
SELECT * FROM articles
WHERE MATCH(title, content) AGAINST('optimization' WITH QUERY EXPANSION);
```

### FULLTEXT와 LIKE 비교

#### 특징

| 구분 | FULLTEXT | LIKE |
| --- | --- | --- |
| 검색 방식 | 전문 검색 알고리즘 사용 (MATCH…AGAINST) | 단순 패턴 매칭 (`'%패턴%'`) |
| 인덱스 사용 | FULLTEXT 인덱스 필요 | 일반 B-Tree 인덱스 또는 전체 스캔 |
| 검색 성능 | 큰 데이터셋에서 효율적 | 데이터셋이 커질수록 비효율적 |
| 기능 | 관련성 점수, 논리 연산자 사용 가능 (Boolean, Natural Language 등) | 간단한 패턴 일치만 가능 (와일드카드) |

### FULLTEXT의 한계

#### 지원 엔진:

- MySQL의 InnoDB와 MyISAM에서만 FULLTEXT 인덱스를 지원한다.
- InnoDB는 MySQL 5.6 이후부터 FULLTEXT를 지원한다.

#### 다국어 지원:

- 기본적으로 영어 기반으로 설계되어 있으며, 다른 언어(특히 형태소 분석이 필요한 언어)에서는 추가 설정이 필요할 수 있다.

#### 불용어와 최소 단어 길이:

- 기본적으로 불용어 목록과 최소 단어 길이(3자 이상)가 적용된다. 이를 변경하려면 서버 설정을 수정해야 한다.

### 실제 사용 사례

#### 게시판 검색:

- 게시글의 제목과 내용을 효율적으로 검색하기 위해 사용.

#### 전자상거래:

- 제품 설명이나 리뷰에서 특정 키워드를 기반으로 검색.

#### 문서 관리 시스템:

- 대량의 문서에서 중요한 정보를 빠르게 검색.

MySQL FULLTEXT는 텍스트 데이터의 고속 검색과 유연성을 제공하며, 이를 활용하면 다양한 검색 기능을 구현할 수 있다. 다만, 다국어 지원이나 설정 조정이 필요할 수 있으므로 요구사항에 맞게 최적화해야 한다.
