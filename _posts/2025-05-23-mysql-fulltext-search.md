---
date: 2025-05-23 11:08:25 +0900
title: "MySQL 전문 검색"
category: mysql
excerpt: "MySQL 8.4의 FULLTEXT와 ngram 검색을 재현하고, 검색 모드·한 글자 검색·불용어·인덱스 재구축·트랜잭션 가시성의 차이를 정리합니다."
updated: 2026-09-20
---

MySQL의 FULLTEXT는 텍스트를 토큰으로 나누고, 토큰이 등장하는 문서와 위치를 역색인(inverted index)에 저장하는 전문 검색 기능입니다. 검색어와 문서에 등장하는 토큰을 바탕으로 관련성 점수를 계산합니다. **문장의 의미를 이해하는 검색이나 임베딩 기반 의미 검색은 아닙니다.**[^overview][^innodb]

이 글은 **MySQL 8.4 LTS·InnoDB**를 기준으로 설명합니다. SQL 예제는 MySQL Community Server 8.4.11, `ngram_token_size=2`, 기본 불용어 활성 상태에서 확인했습니다. MyISAM과 다른 동작은 별도로 표시합니다.

## LIKE와 FULLTEXT 중 무엇을 써야 할까요

먼저 필요한 검색의 의미를 정합니다.

| 요구사항 | 검토할 방법 | 주의할 점 |
| --- | --- | --- |
| 문자열 전체가 같은 값 | `=`와 일반 인덱스 | 컬럼 콜레이션이 동일성 기준을 결정합니다. |
| 특정 문자열로 시작 | `LIKE '검색어%'` | 선행 와일드카드가 없는 상수 패턴은 B-Tree 범위 검색을 사용할 수 있습니다. |
| 문자열 중간의 임의 부분이 포함됨 | `LIKE '%검색어%'` | 일반적으로 B-Tree의 접두 범위 검색을 사용할 수 없습니다. |
| 키워드 관련도·필수 포함·제외 조건 | `MATCH() AGAINST()`와 FULLTEXT | 토큰화·불용어·검색 모드에 따라 결과가 달라집니다. |
| 한국어의 연속된 문자 조각 검색 | ngram FULLTEXT | 형태소 분석이나 임의 부분 문자열 검색과 결과가 같지는 않습니다. |

`LIKE`가 항상 느리고 FULLTEXT가 항상 빠른 것은 아닙니다. 조회 범위가 작은 경우에는 단순한 패턴 검색으로 충분할 수 있습니다. 필요한 결과를 먼저 정하고 실제 조건의 실행계획과 처리 시간을 비교합니다.[^range]

한국어에도 띄어쓰기가 있습니다. 기본 파서가 공백으로 나눈 어절을 검색하는 데는 사용할 수 있지만, 조사·어미가 붙은 어절 내부를 찾거나 띄어쓰기 차이를 처리하는 데 한계가 있습니다. ngram은 이를 일정 길이의 문자 조각으로 나누며, **조사·어간을 이해하는 한국어 형태소 분석기는 아닙니다.**[^ngram]

## 재현용 테이블과 데이터

`mysql` CLI에서 실습용 데이터베이스를 선택하고 아래 쿼리를 같은 연결에서 실행합니다. 첫 예제는 인덱스를 포함해 테이블을 생성하므로, 이어서 같은 이름의 인덱스를 다시 `ADD`하면 안 됩니다.

```sql
SET NAMES utf8mb4;

SELECT VERSION(), @@ngram_token_size,
       @@innodb_ft_min_token_size, @@innodb_ft_enable_stopword;

CREATE TABLE article (
  article_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  FULLTEXT KEY fts_article_title_body (title, body) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO article (title, body) VALUES
('데이터베이스 성능', '인덱스와 쿼리 실행 계획을 점검합니다.'),
('데이터 분석', '집계와 시각화를 다룹니다.'),
('로그 보관', '베이스 설정과 보관 주기를 점검합니다.'),
('검색 기능', '검색 파서와 토큰을 설명합니다.'),
('서울 여행', '경복궁을 방문합니다.'),
('트랜잭션 잠금', '잠금과 커밋을 설명합니다.'),
('금', '');
```

`WITH PARSER ngram`을 생략하면 기본 파서를 사용합니다. FULLTEXT 인덱스는 `CHAR`, `VARCHAR`, `TEXT` 계열 컬럼에 만들 수 있으며, 같은 FULLTEXT 인덱스에 포함된 컬럼들은 문자셋과 콜레이션이 같아야 합니다.[^overview][^restrictions]

## ngram의 자연어 모드와 불리언 모드는 결과가 다릅니다

`ngram_token_size=2`에서 `데이터베이스`는 다음 다섯 토큰으로 나뉩니다.

```text
데이 / 이터 / 터베 / 베이 / 이스
```

### NATURAL LANGUAGE MODE

모드를 생략하면 자연어 모드입니다. ngram 파서는 검색어를 토큰들의 합집합으로 검색하므로, 긴 검색어의 **일부 토큰만 가진 문서도 결과에 포함**됩니다.[^ngram]

```sql
SELECT article_id, title,
       MATCH(title, body) AGAINST('데이터베이스' IN NATURAL LANGUAGE MODE) AS score
FROM article
WHERE MATCH(title, body) AGAINST('데이터베이스' IN NATURAL LANGUAGE MODE)
ORDER BY score DESC, article_id ASC;
```

결과에는 1·2·3번이 포함됩니다.

| article_id | 포함되는 이유 |
| --- | --- |
| 1 | `데이터베이스`의 토큰을 모두 포함합니다. |
| 2 | `데이터`의 `데이`, `이터` 토큰을 포함합니다. |
| 3 | 본문의 `베이스`에 `베이`, `이스` 토큰이 있습니다. |

따라서 `%데이터베이스%`를 이 자연어 검색으로 교체하면 검색 범위가 넓어집니다. 두 방식의 결과가 같다고 가정하면 안 됩니다.

### BOOLEAN MODE

ngram의 불리언 모드는 검색어 하나를 연속된 ngram 구문 검색으로 변환합니다. 아래 예제에서는 1번만 검색됩니다.[^ngram]

```sql
SELECT article_id, title
FROM article
WHERE MATCH(title, body) AGAINST('데이터베이스' IN BOOLEAN MODE)
ORDER BY article_id;
```

여러 검색어에 필수 포함·제외 조건을 지정할 수도 있습니다.

```sql
SELECT article_id, title,
       MATCH(title, body) AGAINST('+데이터 -분석' IN BOOLEAN MODE) AS score
FROM article
WHERE MATCH(title, body) AGAINST('+데이터 -분석' IN BOOLEAN MODE)
ORDER BY score DESC, article_id ASC;
-- 1번: 데이터는 포함하고 분석은 제외합니다.
```

| 연산자 | 의미 | 주의할 점 |
| --- | --- | --- |
| `+검색어` | 반드시 포함 | InnoDB에서는 단어 앞에 붙입니다. |
| `-검색어` | 검색 결과에서 제외 | 제외 조건만으로는 전체 문서의 여집합을 반환하지 않습니다. |
| 연산자 없는 검색어 | 선택적 검색어 | 여러 항을 모두 필수 포함으로 만들려면 각 항에 `+`를 붙입니다. |
| `"구문 검색"` | 토큰의 순서·구문 일치 | 원문 바이트까지 동일하다는 뜻은 아닙니다. |
| `검색어*` | 접두 토큰 검색 | ngram에서는 일반 단어 파서와 의미가 다릅니다. |

구문 검색도 토큰화·불용어·콜레이션의 영향을 받습니다. 원문의 공백·구두점까지 보존한 정확한 부분 문자열 일치가 필요하면 해당 조건을 별도로 검증해야 합니다.[^boolean][^natural]

### 관련성 점수와 정렬

InnoDB의 관련성 계산은 BM25·TF-IDF 기반 알고리즘을 사용합니다. 엔진과 검색 대상 문서 집합에 따라 점수가 달라지므로, 점수를 고정된 “정답 확률”처럼 해석하지 않습니다.[^boolean]

자연어 모드는 특정 실행계획 조건에서 관련도순으로 반환하지만, 불리언 모드는 자동으로 관련도순 정렬하지 않습니다. 화면의 정렬 계약은 예제처럼 `ORDER BY score DESC, article_id ASC`로 명시하는 편이 분명합니다. 같은 점수에 대한 보조 정렬도 있어야 순서가 안정적입니다.[^natural][^boolean]

## 50% 임계값은 MyISAM의 자연어 검색에 해당합니다

**InnoDB 자연어 검색에는 MyISAM의 50% 임계값이 적용되지 않습니다.** 테스트 데이터가 적다는 이유로 InnoDB 검색을 무조건 불리언 모드로 바꿀 필요는 없습니다.[^natural]

기본 파서로 만든 다음 InnoDB 테이블에서는 모든 행에 `database`가 있어도 두 행이 검색됩니다.

```sql
CREATE TABLE word_demo (
  id INT PRIMARY KEY,
  body TEXT NOT NULL,
  FULLTEXT KEY fts_word_demo_body (body)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO word_demo VALUES
(1, 'database indexing'),
(2, 'database tuning');

SELECT COUNT(*) AS matched
FROM word_demo
WHERE MATCH(body) AGAINST('database' IN NATURAL LANGUAGE MODE);
-- matched = 2
```

MyISAM의 자연어 모드는 전체 행의 50% 이상에 나타나는 단어를 검색에서 제외합니다. MyISAM에서도 불리언 모드에는 그 임계값이 적용되지 않습니다. **불용어 목록과 토큰 길이 제한은 별개의 조건**입니다.[^natural][^boolean]

## Query Expansion은 검색어를 문서에서 확장합니다

Query Expansion은 첫 검색에서 상위에 나온 문서의 단어를 검색어에 추가해 다시 검색합니다. 의미를 이해해 동의어를 생성하는 기능은 아닙니다. 관련 없는 결과가 늘어날 수 있으므로, 정확한 필터보다 탐색용 검색에 적합한지 평가합니다.[^expansion]

```sql
SELECT id, body
FROM word_demo
WHERE MATCH(body) AGAINST('indexing' WITH QUERY EXPANSION)
ORDER BY id;
```

## ngram의 한 글자 검색과 와일드카드

bigram 인덱스는 길이 2의 토큰을 저장합니다. 길이 1의 검색어를 그대로 검색하면 필요한 토큰이 없어 결과가 나오지 않습니다.

```sql
SELECT article_id FROM article
WHERE MATCH(title, body) AGAINST('금' IN BOOLEAN MODE)
ORDER BY article_id;
-- 결과 없음

SELECT article_id FROM article
WHERE MATCH(title, body) AGAINST('금*' IN BOOLEAN MODE)
ORDER BY article_id;
-- 6번: 본문의 '잠금과'에서 '금과' 토큰이 만들어집니다.

SELECT article_id FROM article
WHERE title LIKE '%금%' OR body LIKE '%금%'
ORDER BY article_id;
-- 6번, 7번
```

`금*`은 인덱스에 있는 `금`으로 시작하는 토큰을 찾습니다. 7번의 단독 한 글자 `금`에는 bigram 토큰이 없으므로, `*`를 붙여도 검색되지 않습니다. 반대로 ngram 크기보다 긴 접두 검색어는 ngram 구문 검색으로 변환되며 `*`가 무시됩니다.[^ngram]

한 글자 검색이 필수라면 `ngram_token_size=1` 또는 범위를 제한한 다른 검색 경로를 검토합니다. `*`만 붙여 모든 한 글자·부분 문자열 검색을 해결할 수는 없습니다.

## 토큰 길이와 불용어 설정

### 기본 파서와 ngram의 설정은 다릅니다

| 항목 | InnoDB 기본 파서 | ngram 파서 |
| --- | --- | --- |
| 토큰 생성 | 공백·구두점 등을 기준으로 단어 분리 | 길이 N의 연속된 문자 조각 |
| 최소 길이 | `innodb_ft_min_token_size`, 기본 3 | 적용하지 않음 |
| 최대 길이 | `innodb_ft_max_token_size` | 적용하지 않음 |
| ngram 크기 | 해당 없음 | `ngram_token_size`, 기본 2, 범위 1~10 |
| 불용어 | 토큰 전체가 불용어와 같은지 확인 | 토큰 안에 불용어가 포함되는지도 확인 |

MyISAM 기본 파서는 `ft_min_word_len`과 `ft_max_word_len`을 사용하고 최소 길이 기본값은 4입니다. **이 최소·최대 단어 길이 변수들은 ngram 인덱스에 적용되지 않습니다.**[^ngram][^tuning]

ngram은 공백을 가로질러 무조건 토큰을 만들지도 않습니다. 예를 들어 크기 2에서 `ab cd`는 `ab`, `cd`로 나뉘며 `bc` 토큰은 만들지 않습니다.[^ngram]

### 영문 불용어가 ngram에도 영향을 줍니다

ngram도 기본적으로 영문 불용어 목록을 사용합니다. 예를 들어 `a`가 불용어이면 `ab` 토큰도 제외될 수 있습니다. 한국어와 영문 상품명·코드를 함께 저장하는 서비스에서 확인할 부분입니다.[^ngram][^stopwords]

```sql
CREATE TABLE stopword_demo (
  id INT PRIMARY KEY,
  body TEXT NOT NULL,
  FULLTEXT KEY fts_stopword_demo_body (body) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO stopword_demo VALUES (1, 'abcd');

SELECT COUNT(*) AS ab_hits FROM stopword_demo
WHERE MATCH(body) AGAINST('ab' IN BOOLEAN MODE);
-- ab_hits = 0: 기본 불용어 a를 포함하는 ab 토큰은 제외됩니다.

SELECT COUNT(*) AS bc_hits FROM stopword_demo
WHERE MATCH(body) AGAINST('bc' IN BOOLEAN MODE);
-- bc_hits = 1
```

불용어는 `innodb_ft_enable_stopword`, `innodb_ft_server_stopword_table`, `innodb_ft_user_stopword_table`로 제어합니다. 사용자 불용어 테이블은 공식 문서가 요구하는 스키마로 만들고 인덱스 생성·재구축 전에 지정합니다. MyISAM은 `ft_stopword_file`을 사용합니다.[^stopwords]

## 설정 변경은 기존 인덱스 재구축까지 포함합니다

`ngram_token_size`는 읽기 전용 시작 옵션입니다. 예를 들어 크기를 1로 바꾸려면 설정을 변경하고 서버를 재시작한 뒤, 영향을 받는 ngram FULLTEXT 인덱스를 재구축해야 합니다. **서버 재시작만으로 기존 인덱스의 토큰이 다시 만들어지지는 않습니다.**[^ngram][^tuning]

```ini
[mysqld]
ngram_token_size=1
```

InnoDB 기본 파서의 최소·최대 단어 길이를 변경할 때도 서버 재시작과 해당 인덱스 재구축이 필요합니다. 불용어 정책 변경 역시 기존 인덱스가 자동 갱신된다고 가정하지 않습니다.

다음은 앞의 실습 테이블에서 불용어를 끄고 인덱스를 재구축하는 예제입니다. 이 예제는 ngram 크기를 바꾸지 않으며, 같은 연결에서 실행합니다.

```sql
SET SESSION innodb_ft_enable_stopword = OFF;

ALTER TABLE stopword_demo DROP INDEX fts_stopword_demo_body;
ALTER TABLE stopword_demo
  ADD FULLTEXT KEY fts_stopword_demo_body (body) WITH PARSER ngram;

SELECT COUNT(*) AS ab_hits FROM stopword_demo
WHERE MATCH(body) AGAINST('ab' IN BOOLEAN MODE);
-- ab_hits = 1

SET SESSION innodb_ft_enable_stopword = ON;
```

이 예제는 삭제와 생성을 별도 문장으로 실행합니다. 그 사이에는 해당 FULLTEXT 인덱스가 없으므로 운영에서는 검색 트래픽과 작업 시간을 조정해야 합니다. 마지막 `SET`은 연결의 설정을 되돌리는 것이며, 방금 만든 인덱스를 다시 불용어 적용 상태로 재구축하는 명령은 아닙니다. 선택한 정책의 적용 범위·영속 설정·재구축 대상을 함께 관리합니다.

기존 기본 파서 인덱스를 ngram으로 바꿀 때도 현재 인덱스를 확인한 뒤 교체해야 합니다. `SHOW CREATE TABLE`·`SHOW INDEX`로 이름과 컬럼을 확인하고, 동일한 이름의 인덱스를 중복으로 추가하지 않습니다.

## MATCH 컬럼과 트랜잭션에서 자주 만나는 문제

### 복합 FULLTEXT는 B-Tree의 왼쪽 접두 규칙과 다릅니다

이 글의 인덱스는 `(title, body)`입니다. InnoDB에서 `MATCH(title)`만 사용하면 이 복합 인덱스로 대신 검색할 수 없어 오류가 납니다.[^restrictions]

```sql
SELECT article_id FROM article
WHERE MATCH(title) AGAINST('데이터' IN BOOLEAN MODE);
-- ERROR 1191 (HY000): Can't find FULLTEXT index matching the column list
```

제목만 검색해야 한다면 제목만의 FULLTEXT 인덱스를 별도로 만들거나, 요구에 맞는 다른 조회를 사용합니다. `MATCH(title, body)`로 바꾸면 본문까지 검색한다는 점도 함께 고려해야 합니다.

### INSERT 직후 같은 트랜잭션에서도 검색되지 않을 수 있습니다

InnoDB FULLTEXT의 삽입·갱신 반영은 커밋 시점에 처리됩니다. 같은 트랜잭션에서 일반 SELECT로 보이는 새 행이 FULLTEXT로는 아직 보이지 않을 수 있습니다.[^innodb]

```sql
START TRANSACTION;
INSERT INTO article (title, body) VALUES ('초신성 관측', '새 관측 기록입니다.');

SELECT COUNT(*) AS ordinary_select FROM article WHERE title = '초신성 관측';
-- ordinary_select = 1
SELECT COUNT(*) AS before_commit FROM article
WHERE MATCH(title, body) AGAINST('초신성' IN BOOLEAN MODE);
-- before_commit = 0

COMMIT;

SELECT COUNT(*) AS after_commit FROM article
WHERE MATCH(title, body) AGAINST('초신성' IN BOOLEAN MODE);
-- after_commit = 1
```

저장 직후 같은 트랜잭션에서 저장 결과를 확인하는 용도로 FULLTEXT를 사용하지 않습니다. 그 경우 PK로 조회하는 편이 목적에 맞습니다.

## 운영에 적용하기 전에 확인할 것

- **인덱스와 실행계획:** 실제 서비스의 필터·정렬·LIMIT을 포함한 쿼리로 측정합니다. FULLTEXT 인덱스가 있다고 모든 조회가 빨라지는 것은 아닙니다.
- **DDL 비용:** 첫 FULLTEXT 인덱스를 추가할 때 사용자 정의 `FTS_DOC_ID`가 없으면 테이블 재구축이 발생합니다. InnoDB의 FULLTEXT 인덱스 추가는 동시 DML을 허용하지 않으므로, `ALGORITHM=INPLACE`를 무중단 쓰기 허용으로 해석하면 안 됩니다.[^ddl]
- **지원 범위:** MySQL 8.4에서는 InnoDB·MyISAM이 FULLTEXT를 지원하며 파티션 테이블에는 사용할 수 없습니다.[^restrictions]
- **검색 입력:** SQL 바인딩과 검색 문법 처리를 구분합니다. 값을 바인딩해도 BOOLEAN MODE의 `+`, `-`, 따옴표 등이 일반 문자로 바뀌지는 않습니다. 일반 검색창과 고급 검색 문법의 허용 범위를 정하고 빈 검색어·문법 오류를 처리합니다.
- **검색 품질:** 한 글자, 조사·어미, 띄어쓰기, 영문 코드, 불용어, 구두점에 대해 기대 결과를 정해 테스트합니다. 형태소·동의어·오타 보정이 필요한 경우에는 그 요구를 지원하는 별도 검색 시스템을 검토합니다.

```sql
EXPLAIN
SELECT article_id, title
FROM article
WHERE MATCH(title, body) AGAINST('데이터베이스' IN BOOLEAN MODE)
ORDER BY article_id
LIMIT 20;
```

이 실습에서는 접근 방식 `type=fulltext`, 사용 인덱스 `key=fts_article_title_body`를 확인할 수 있습니다. 실제 데이터량과 검색어 빈도에서도 실행 시간과 반환 결과를 함께 확인합니다.

FULLTEXT를 도입할 때는 LIKE를 기계적으로 교체하기보다, **찾아야 할 결과 → 파서와 검색 모드 → 토큰·불용어 정책 → 재구축과 검증** 순서로 결정합니다.

## 참고 자료

[^overview]: MySQL 8.4 Reference Manual — Full-Text Search Functions. 검색 기능과 지원 타입. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-search.html>
[^innodb]: MySQL 8.4 Reference Manual — InnoDB Full-Text Indexes. 역색인과 트랜잭션 반영 시점. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/innodb-fulltext-index.html>
[^ngram]: MySQL 8.4 Reference Manual — ngram Full-Text Parser. 토큰 크기·공백·불용어·검색 모드·와일드카드. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-search-ngram.html>
[^natural]: MySQL 8.4 Reference Manual — Natural Language Full-Text Searches. 관련도 정렬과 MyISAM의 50% 임계값. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-natural-language.html>
[^boolean]: MySQL 8.4 Reference Manual — Boolean Full-Text Searches. 연산자·정렬·InnoDB 관련성 계산. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-boolean.html>
[^expansion]: MySQL 8.4 Reference Manual — Full-Text Searches with Query Expansion. 두 단계 검색과 검색어 확장. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-query-expansion.html>
[^tuning]: MySQL 8.4 Reference Manual — Fine-Tuning MySQL Full-Text Search. 설정 변경과 인덱스 재구축. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-fine-tuning.html>
[^stopwords]: MySQL 8.4 Reference Manual — Full-Text Stopwords. 기본·사용자 정의 불용어 설정. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-stopwords.html>
[^restrictions]: MySQL 8.4 Reference Manual — Full-Text Restrictions. MATCH 컬럼·문자셋·파티션 제약. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/fulltext-restrictions.html>
[^ddl]: MySQL 8.4 Reference Manual — Online DDL Operations. FULLTEXT 인덱스 추가 시 재구축과 동시 DML 제한. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/innodb-online-ddl-operations.html>
[^range]: MySQL 8.4 Reference Manual — Range Optimization. LIKE 패턴과 B-Tree 범위 검색 조건. <https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/range-optimization.html>
