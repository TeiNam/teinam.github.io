---
date: 2021-11-18 09:50:32 +0900
title: "MySQL 8.0.1 utf8mb4_0900_ai_ci의 한글 사용에 대한 문제점"
category: mysql
excerpt: "MySQL 8.0.1 버전부터 기본값으로 채택된 utf8mb4_0900_ai_ci의 한글 사용에 대한 문제점 MySQL 8.0.1 버전부터 utf8mb4_0900_ai_ci를 기본값으로 적용했습니다. 기존의 5.x버전대의 MySQL을 사용해 오던 유저분들이라면 한글을 사용해야 하는…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — utf8mb4_0900_ai_ci 는 MySQL 8.x 기본 콜레이션으로 남아 있고, UCA 9.0.0 기반 accent/case-insensitive 특성 때문에 한글 자모를 같은 문자열로 취급하는 문제도 그대로입니다. 다만 MySQL 8.0 은 2026-04-30 지원 종료라 실제 검증은 8.4 LTS 이상에서 하는 편이 좋습니다.

![MySQL 로고](/assets/img/wp/2019/04/mysql_PNG19.png)

## MySQL 8.0.1 버전부터 기본값으로 채택된 utf8mb4\_0900\_ai\_ci의 한글 사용 문제점

MySQL 8.0.1 버전부터 utf8mb4\_0900\_ai\_ci를 기본값으로 적용했습니다. 기존의 5.x 버전대 MySQL을 사용해 오던 유저라면 한글을 사용해야 하는 환경에서 대부분 utf8mb4\_general\_ci를 사용해왔을 겁니다. 0900\_ai\_ci로 기본값이 변경되면서 처음 MySQL을 시작하거나 그냥 설치만 해서 사용하시는 분들은 무슨 차이가 있나 궁금하실 수도 있습니다.

우선 기본값으로 설정된 utf8mb4\_0900\_ai\_ci를 설명하겠습니다.

- uft8mb4는 각 문자가 UTF-8 인코딩 체계에서 최대 4바이트로 저장됨을 의미.
- 0900은 유니코드 데이터 정렬 알고리즘 버전을 나타냄. (유니코드 정렬 알고리즘은 유니코드 표준의 요구 사항을 준수하는 두 개의 유니코드 문자열을 비교하는 데 사용되는 방법.)
- ai는 악센트 무관을 나타냄. 즉, 정렬할 때 e, è, é, ê, ë 사이에는 차이가 없음.
- ci는 대소문자를 구분하지 않음을 나타냄. 즉, 정렬할 때 p와 P 사이에는 차이가 없음.

general\_ci 역시 ci가 붙어 있기 때문에 대소문자를 구분하지 않습니다.

Oracle 측은 0900\_ai\_ci를 채택한 이유를 검색에 있어 해당 콜레이션이 가장 성능이 뛰어나기 때문이라고 설명했습니다.

그런데 utf8mb4\_0900\_ai\_ci는 한글이나 동아시아 계열의 문자를 사용하는 나라에서는 치명적인 문제가 있습니다. 특히 한글의 자음 모음, 일본어 가타카나/히라가나를 같은 문자열로 인식하여 처리하기 때문에 글로벌 서비스인 경우 콜레이션 설정을 반드시 주의해야 합니다.

### utf8mb4\_0900\_ai\_ci 한글 검색 문제

실제 검색에서 어떤 문제가 있는지 확인하기 위해 캐릭터 셋이 다른 두 개의 테이블을 생성해서 테스트했습니다.

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

### utf8mb4\_general\_ci 한글 데이터 검색 결과

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

utf8mb4\_general\_ci에서는 모두 각기 다른 글자로 인식하기 때문에 조건에 맞는 글자만 찾아줍니다. 문자열이 가지는 길이도 다르고 HEX 값도 다릅니다.

### utf8mb4\_0900\_ai\_ci 한글 데이터 검색 결과

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

utf8mb4\_0900\_ai\_ci에서는 조건절을 다르게 줬음에도 길이나 hex 값이 다름에도 모두 동일한 글자로 인식하고 결과값으로 모두 반환합니다.

콜레이션은 단지 검색과 정렬에만 사용하는 것이 아니라 유니크 인덱스나 다른 부분에도 많이 사용되기 때문에 한글 데이터가 있으면 매우 주의해야 하는 부분입니다. 정확한 한글(및 동아시아 언어, 일본어, 중국어) 검색을 처리하기 위해서는 utf8mb4\_general\_ci로 설정해야 합니다.

### 추가적으로 PAD 처리 문제

MySQL은 전통적으로 데이터 값의 뒤 공백을 제거하고 비교하는 방법을 사용해왔습니다. 하지만 8.0부터는 Collation에 따라, ORACLE과 비슷하게 공백을 제거하지 않고 비교가 가능해졌습니다. 즉 general\_ci와 0900\_ai\_ci는 공백을 처리하는데 있어 다른 방식을 취한다는 점입니다.

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

utf8mb4\_general\_ci의 경우 데이터값 뒤에 공백이 있어도 공백이 있다고 인식하지 않으나 utf8mb4\_0900\_ai\_ci는 스페이스바로 공백을 입력한 경우 공백을 인식하기 때문에 다른 문자로 인식합니다. 이는 WAS의 connection string에서도 꼭 connectionCollation을 지정해야하는 이유이기도 합니다.
