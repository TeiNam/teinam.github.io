---
date: 2021-11-18 09:50:32 +0900
title: "MySQL 8.0.1 utf8mb4_0900_ai_ci의 한글 사용에 대한 문제점"
category: mysql
excerpt: "MySQL 8.0.1부터 기본 콜레이션이 된 utf8mb4_0900_ai_ci는 호환 자모 'ㄱㅏㄴㅏㄷㅏ'와 완성형 '가나다'를 같은 문자열로 판정하므로, 한글 컬럼에는 콜레이션을 따로 지정해야 합니다."
updated: 2026-09-20
---

MySQL 8.0.1 버전부터 utf8mb4\_0900\_ai\_ci를 기본값으로 적용했습니다. 5.x 버전대 MySQL을 써 오던 유저라면 한글을 다루는 환경에서 대부분 utf8mb4\_general\_ci를 사용했을 겁니다. 기본값이 0900\_ai\_ci로 바뀌면서 처음 MySQL을 시작하거나 설치만 해서 쓰는 분들은 무슨 차이가 있는지 궁금할 수 있습니다. 이 동작은 현재 LTS인 8.4에서도 그대로이고, 아래 예제는 모두 MySQL 8.4.11에서 실행한 결과입니다.

우선 기본값으로 설정된 utf8mb4\_0900\_ai\_ci의 이름부터 읽어보겠습니다.

- utf8mb4는 각 문자가 UTF-8 인코딩 체계에서 최대 4바이트로 저장됨을 의미합니다.
- 0900은 유니코드 데이터 정렬 알고리즘(UCA) 버전을 나타냅니다. UCA는 유니코드 표준의 요구 사항을 지키면서 두 유니코드 문자열을 비교하는 방법입니다.
- ai는 악센트 무관을 나타냅니다. 즉, 정렬할 때 e, è, é, ê, ë 사이에 차이가 없습니다.
- ci는 대소문자를 구분하지 않음을 나타냅니다. 즉, 정렬할 때 p와 P 사이에 차이가 없습니다.

general\_ci 역시 ci가 붙어 있기 때문에 대소문자를 구분하지 않습니다.

이 콜레이션이 기본값이 된 이유는 속도입니다. 공식 문서는 UCA 9.0.0 이상을 기반으로 하는 콜레이션이 그 이전 UCA 버전을 기반으로 하는 콜레이션보다 빠르다고 적습니다.

그런데 utf8mb4\_0900\_ai\_ci는 한글이나 동아시아 계열 문자를 쓰는 환경에서 치명적인 문제가 있습니다. 한글 자음·모음을 완성형 음절과 같은 문자열로 판정합니다. 일본어도 마찬가지입니다. 공식 문서는 utf8mb4\_ja\_0900\_as\_cs가 가타카나와 히라가나를 정렬에서 같게 취급하고, 둘을 구분하려면 kana-sensitive인 utf8mb4\_ja\_0900\_as\_cs\_ks를 써야 한다고 설명합니다. 글로벌 서비스라면 콜레이션 설정을 반드시 확인해야 합니다.

## utf8mb4\_0900\_ai\_ci 한글 검색 문제

실제 검색에서 어떤 문제가 있는지 확인하기 위해 콜레이션이 다른 두 개의 테이블을 생성해서 테스트했습니다.

- utf8mb4\_general\_ci

```sql
CREATE TABLE test.test1 (
    `no` INT UNSIGNED auto_increment NOT NULL,
  name varchar(100) NULL,
  PRIMARY KEY (no)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;
```

- utf8mb4\_0900\_ai\_ci

```sql
CREATE TABLE test.test2 (
    `no` INT UNSIGNED auto_increment NOT NULL,
  name varchar(100) NULL,
  PRIMARY KEY (no)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_0900_ai_ci;
```

각 테이블에 동일한 데이터를 적재합니다.

```sql
mysql> insert into test1 (name) values ('가나다'),('ㄱㅏ나다'),('ㄱㅏㄴㅏㄷㅏ');
Query OK, 3 rows affected (0.01 sec)
Records: 3  Duplicates: 0  Warnings: 0

mysql> insert into test2 (name) values ('가나다'),('ㄱㅏ나다'),('ㄱㅏㄴㅏㄷㅏ');
Query OK, 3 rows affected (0.00 sec)
Records: 3  Duplicates: 0  Warnings: 0
```

```sql
mysql> select * from test1;
+----+--------------------+
| no | name               |
+----+--------------------+
|  1 | 가나다             |
|  2 | ㄱㅏ나다           |
|  3 | ㄱㅏㄴㅏㄷㅏ       |
+----+--------------------+
3 rows in set (0.00 sec)

mysql> select * from test2;
+----+--------------------+
| no | name               |
+----+--------------------+
|  1 | 가나다             |
|  2 | ㄱㅏ나다           |
|  3 | ㄱㅏㄴㅏㄷㅏ       |
+----+--------------------+
3 rows in set (0.00 sec)
```

## utf8mb4\_general\_ci 한글 데이터 검색 결과

```sql
mysql> select no, name, length(name), hex(name) from test1 t1 
    -> where name = '가나다';
+----+-----------+--------------+--------------------+
| no | name      | length(name) | hex(name)          |
+----+-----------+--------------+--------------------+
|  1 | 가나다    |            9 | EAB080EB8298EB8BA4 |
+----+-----------+--------------+--------------------+
1 row in set (0.00 sec)

mysql> select no, name, length(name), hex(name) from test1 t1 
    -> where name = 'ㄱㅏ나다';
+----+--------------+--------------+--------------------------+
| no | name         | length(name) | hex(name)                |
+----+--------------+--------------+--------------------------+
|  2 | ㄱㅏ나다     |           12 | E384B1E3858FEB8298EB8BA4 |
+----+--------------+--------------+--------------------------+
1 row in set (0.00 sec)

mysql> select no, name, length(name), hex(name) from test1 t1 
    -> where name = 'ㄱㅏㄴㅏㄷㅏ';
+----+--------------------+--------------+--------------------------------------+
| no | name               | length(name) | hex(name)                            |
+----+--------------------+--------------+--------------------------------------+
|  3 | ㄱㅏㄴㅏㄷㅏ       |           18 | E384B1E3858FE384B4E3858FE384B7E3858F |
+----+--------------------+--------------+--------------------------------------+
1 row in set (0.00 sec)
```

utf8mb4\_general\_ci에서는 모두 각기 다른 글자로 판정하기 때문에 조건에 맞는 글자만 찾아줍니다. 문자열이 가지는 길이도 다르고 HEX 값도 다릅니다.

## utf8mb4\_0900\_ai\_ci 한글 데이터 검색 결과

```sql
mysql> select no, name, length(name), hex(name) from test2 t2
    -> where name = '가나다';
+----+--------------------+--------------+--------------------------------------+
| no | name               | length(name) | hex(name)                            |
+----+--------------------+--------------+--------------------------------------+
|  1 | 가나다             |            9 | EAB080EB8298EB8BA4                   |
|  2 | ㄱㅏ나다           |           12 | E384B1E3858FEB8298EB8BA4             |
|  3 | ㄱㅏㄴㅏㄷㅏ       |           18 | E384B1E3858FE384B4E3858FE384B7E3858F |
+----+--------------------+--------------+--------------------------------------+
3 rows in set (0.00 sec)

mysql> select no, name, length(name), hex(name) from test2 t2 
    -> where name = 'ㄱㅏ나다';
+----+--------------------+--------------+--------------------------------------+
| no | name               | length(name) | hex(name)                            |
+----+--------------------+--------------+--------------------------------------+
|  1 | 가나다             |            9 | EAB080EB8298EB8BA4                   |
|  2 | ㄱㅏ나다           |           12 | E384B1E3858FEB8298EB8BA4             |
|  3 | ㄱㅏㄴㅏㄷㅏ       |           18 | E384B1E3858FE384B4E3858FE384B7E3858F |
+----+--------------------+--------------+--------------------------------------+
3 rows in set (0.00 sec)

mysql> select no, name, length(name), hex(name) from test2 t2 
    -> where name = 'ㄱㅏㄴㅏㄷㅏ';
+----+--------------------+--------------+--------------------------------------+
| no | name               | length(name) | hex(name)                            |
+----+--------------------+--------------+--------------------------------------+
|  1 | 가나다             |            9 | EAB080EB8298EB8BA4                   |
|  2 | ㄱㅏ나다           |           12 | E384B1E3858FEB8298EB8BA4             |
|  3 | ㄱㅏㄴㅏㄷㅏ       |           18 | E384B1E3858FE384B4E3858FE384B7E3858F |
+----+--------------------+--------------+--------------------------------------+
3 rows in set (0.00 sec)
```

utf8mb4\_0900\_ai\_ci에서는 조건절을 다르게 줬는데도, 그리고 길이와 hex 값이 다른데도 셋 다 동일한 글자로 판정해 모두 반환합니다.

콜레이션은 검색과 정렬에만 쓰이지 않습니다. 유니크 인덱스의 중복 판정도 같은 콜레이션을 따릅니다. 그래서 한글 컬럼에 유니크 키를 걸면 서로 다른 문자열이 중복으로 거부됩니다.

```sql
mysql> create table uq2 (name varchar(100) collate utf8mb4_0900_ai_ci, unique key (name));
Query OK, 0 rows affected (0.03 sec)

mysql> insert into uq2 (name) values ('가나다');
Query OK, 1 row affected (0.01 sec)

mysql> insert into uq2 (name) values ('ㄱㅏㄴㅏㄷㅏ');
ERROR 1062 (23000): Duplicate entry 'ㄱㅏㄴㅏㄷㅏ' for key 'uq2.name'
```

> **WARNING** — 한글 데이터에 유니크 제약이 걸려 있으면 이 오류가 애플리케이션 레벨의 중복 검사를 통과한 뒤 INSERT 시점에 터집니다. 컬럼 콜레이션을 먼저 확인해야 합니다.

## Oracle의 판단과 한국어 콜레이션

이 동작은 버그로 접수됐지만 Oracle은 UCA 표준에 따른 정상 동작으로 보아 버그가 아니라고 처리했습니다(공식 버그 트래커 #111331). 호환 자모와 완성형 음절이 UCA에서 같은 1차 가중치를 가지므로, 악센트·대소문자를 무시하는 콜레이션에서는 두 문자열이 같은 값이 되는 것이 표준 동작이라는 것입니다. 따라서 상위 버전으로 올려도 기본 콜레이션의 이 판정은 달라지지 않습니다.

한국어 전용 콜레이션도 없습니다. 공식 문서의 유니코드 콜레이션 언어 지정자 목록에는 일본어(ja), 중국어(zh), 러시아어(ru) 등이 있지만 한국어는 없습니다. utf8mb4에는 `utf8mb4_ko_0900_ai_ci` 같은 이름의 콜레이션이 존재하지 않으므로, 이런 이름을 쓴 DDL은 실행되지 않습니다. euckr 문자셋에 `euckr_korean_ci`가 있지만 이것은 utf8mb4용이 아닙니다.

## 해법은 컬럼 단위 콜레이션 지정입니다

엄격한 구분이 필요한 컬럼에만 콜레이션을 따로 지정하는 것이 실제 해법입니다. 데이터베이스 전체 기본값을 바꾸는 것보다 범위가 좁고, 이미 운영 중인 스키마에도 `ALTER TABLE ... MODIFY`로 적용할 수 있습니다.

```sql
CREATE TABLE members (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nickname VARCHAR(50) COLLATE utf8mb4_0900_as_cs NOT NULL,
  intro TEXT NULL,
  UNIQUE KEY uq_members_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

선택지별로 무엇을 구분하고 무엇을 잃는지는 다음과 같습니다. 모두 MySQL 8.4.11에서 확인한 결과입니다.

| 콜레이션 | 자모·완성형 | 대소문자·악센트 | 정렬 |
| --- | --- | --- | --- |
| utf8mb4\_0900\_ai\_ci | 같은 값 | 둘 다 무시 | UCA 언어 순서 |
| utf8mb4\_0900\_as\_ci | 같은 값 | 악센트만 구분 | UCA 언어 순서 |
| utf8mb4\_0900\_as\_cs | 구분 | 둘 다 구분 | UCA 언어 순서 |
| utf8mb4\_bin | 구분 | 둘 다 구분 | 코드포인트 순서 |
| utf8mb4\_general\_ci | 구분 | 둘 다 무시 | 코드포인트 순서 |

주의할 점은 악센트만 켜는 utf8mb4\_0900\_as\_ci로는 이 문제가 해결되지 않는다는 것입니다. 호환 자모와 완성형의 차이는 악센트(2차) 레벨이 아니라 대소문자(3차) 레벨에서 갈리기 때문에, `as`까지만 붙여서는 여전히 같은 값으로 판정됩니다. UCA 정렬 순서를 유지하면서 두 형태를 구분하려면 `cs`까지 붙은 utf8mb4\_0900\_as\_cs를 써야 합니다.

utf8mb4\_bin은 바이트를 그대로 비교하므로 가장 확실하게 구분하지만, 정렬이 코드포인트 순서가 됩니다. 완성형 음절끼리는 코드포인트 순서가 가나다순과 일치하지만 호환 자모(U+3131부터)는 완성형(U+AC00부터)보다 앞으로 밀립니다. 대소문자를 구분해야 하는 토큰이나 식별자 컬럼에 적합하고, 사람이 읽는 목록을 정렬해야 하는 컬럼에는 utf8mb4\_0900\_as\_cs가 낫습니다.

utf8mb4\_general\_ci도 세 문자열을 구분하기는 하지만 악센트와 대소문자를 모두 무시합니다. 예를 들어 `'e' = 'é'`와 `'a' = 'A'`가 둘 다 참입니다. 자모 문제만 피하려는 목적이라면 동작하지만, 정확한 구분이 필요한 컬럼에서는 utf8mb4\_0900\_as\_cs나 utf8mb4\_bin 쪽이 의도를 분명히 드러냅니다.

> **NOTE** — 콜레이션을 무엇으로 고르든 문자셋은 utf8mb4를 씁니다. utf8mb3는 deprecated이고 공식 문서는 앞으로의 메이저 릴리스에서 제거될 것으로 예상하라고 적습니다. utf8mb3로 테이블을 만들면 `'utf8mb3' is deprecated and will be removed in a future release. Please use utf8mb4 instead` 경고가 뜹니다. 별칭 `utf8`은 `'utf8' is currently an alias for the character set UTF8MB3, but will be an alias for UTF8MB4 in a future release` 경고를 남기므로, 스크립트에 남아 있으면 지금 정리하는 것이 좋습니다.

## 추가적으로 PAD 처리 문제

MySQL은 전통적으로 데이터 값의 뒤 공백을 제거하고 비교하는 방법을 사용해왔습니다. 하지만 8.0부터는 콜레이션에 따라 Oracle과 비슷하게 공백을 제거하지 않고 비교합니다. 즉 general\_ci와 0900\_ai\_ci는 공백을 처리하는 방식이 다릅니다.

```sql
mysql> select * from information_schema.collations where COLLATION_NAME like 'utf8mb4_0900%' or COLLATION_NAME = 'utf8mb4_bin' or COLLATION_NAME like 'utf8mb4_general%';
+--------------------+--------------------+-----+------------+-------------+---------+---------------+
| COLLATION_NAME     | CHARACTER_SET_NAME | ID  | IS_DEFAULT | IS_COMPILED | SORTLEN | PAD_ATTRIBUTE |
+--------------------+--------------------+-----+------------+-------------+---------+---------------+
| utf8mb4_0900_ai_ci | utf8mb4            | 255 | Yes        | Yes         |       0 | NO PAD        |
| utf8mb4_0900_as_ci | utf8mb4            | 305 |            | Yes         |       0 | NO PAD        |
| utf8mb4_0900_as_cs | utf8mb4            | 278 |            | Yes         |       0 | NO PAD        |
| utf8mb4_0900_bin   | utf8mb4            | 309 |            | Yes         |       1 | NO PAD        |
| utf8mb4_bin        | utf8mb4            |  46 |            | Yes         |       1 | PAD SPACE     |
| utf8mb4_general_ci | utf8mb4            |  45 |            | Yes         |       1 | PAD SPACE     |
+--------------------+--------------------+-----+------------+-------------+---------+---------------+
6 rows in set (0.00 sec)
```

공식 문서는 UCA 9.0.0 이상 기반 콜레이션의 PAD 속성이 NO PAD이고, NO PAD 콜레이션은 문자열 끝의 공백을 다른 문자와 똑같이 취급한다고 설명합니다. utf8mb4\_general\_ci는 PAD SPACE라서 값 뒤에 공백이 있어도 없는 것처럼 비교하지만, utf8mb4\_0900\_ai\_ci는 NO PAD라서 뒤 공백이 있는 값을 다른 문자로 판정합니다. 여기서 주의할 점이 하나 더 있는데, 같은 바이너리 계열인데도 utf8mb4\_bin은 PAD SPACE이고 utf8mb4\_0900\_bin은 NO PAD입니다. 이름만 보고 같은 동작을 기대하면 안 됩니다.

이것은 WAS의 connection string에서 connectionCollation을 꼭 지정해야 하는 이유이기도 합니다. 서버 기본값과 커넥션 콜레이션이 다르면 같은 쿼리가 다른 결과를 냅니다.
