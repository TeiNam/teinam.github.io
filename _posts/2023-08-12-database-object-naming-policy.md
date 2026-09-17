---
date: 2023-08-12 00:01:58 +0900
title: "데이터베이스 오브젝트 이름 생성 정책"
category: security
excerpt: "데이터베이스 네이밍 컨벤션 데이터베이스 네이밍 컨벤션에는 여러가지가 있습니다. 스네이크 케이스(Snake Case) 스네이크 케이스는 단어 사이를 언더스코어(_)로 연결합니다. 예시: first_name, last_name, order_detail 스네이크 케이스는 주로 SQL 데…"
updated: 2026-09-17
---

![](/assets/img/wp/2023/09/스크린샷-2023-09-30-오후-8.15.26.png)

## 데이터베이스 네이밍 컨벤션

데이터베이스 네이밍 컨벤션에는 네 가지가 있습니다.

1. 스네이크 케이스(Snake Case)
   - 스네이크 케이스는 단어 사이를 언더스코어(\_)로 연결합니다.
   - 예시: first\_name, last\_name, order\_detail
   - 스네이크 케이스는 주로 SQL 데이터베이스나 Python에서 자주 사용됩니다.
2. 카멜 케이스(Camel Case)
   - 카멜 케이스는 단어의 첫 글자를 대문자로 표기하며, 첫 단어의 첫 글자는 소문자로 표기합니다.
   - 예시: firstName, lastName, orderDetail
   - 자바나 자바스크립트 등의 언어에서 주로 사용됩니다.
3. 파스칼 케이스(Pascal Case)
   - 파스칼 케이스는 카멜 케이스와 유사하지만, 첫 단어의 첫 글자도 대문자로 표기합니다.
   - 예시: FirstName, LastName, OrderDetail
   - 클래스 이름이나 상수 등을 정의할 때 많이 사용됩니다.
4. 케밥 케이스(Kebab Case)
   - 케밥 케이스는 단어 사이를 하이픈(-)으로 연결합니다.
   - 예시: first-name, last-name, order-detail
   - 주로 URL이나 HTML에서 사용됩니다.

스네이크 케이스는 일반적으로 네이밍 컨벤션이 정의되어 있지 않은 상황에서 데이터 품질과 통일성을 갖기 위해 제가 주로 사용하는 RDBMS 네이밍 규칙입니다.

다음은 MySQL을 메인으로 사용할 때 적용하는 네이밍 컨벤션 예시입니다.

---

### 공통 규칙

1. 모든 데이터베이스 네이밍 규칙은 **snake\_case**를 따른다.

   - snake\_case 는 모든 글자를 **소문자**로 하고 **언더스코어 ( \_ )**로 단어를 구분하는 방법이다.
   - 예)

     ```text
     authUser (x)  
     auth_user (o)
     ```
2. 직관적인 **기술형**으로 작성한다.

   - 오브젝트 명만 보고도 어떤 오브젝트인지 구분이 명확하도록 생성
   - 되도록 쉬운 단어 선택
   - 테이블 생성 예)

     ```text
     log 테이블 → log (x)  
     어떤 로그를 담는 테이블인가?  
     배송 → delivery_log (o)  
     주문 → order_log (o)
     ```
   - 인덱스 생성 예)  
     인덱스를 만들 테이블과 컬럼을 조건 순서에 맞게 기술  
     <table\_name>\_<column1>\_<column2>\_…\_IDX

     ```text
     actor_first_name_last_name_last_update_IDX (o)
     ```
3. 동사는 **능동태**를 사용한다. 동명사는 허용.

   - 예)

     ```text
     created_date (x)  
     create_date (o)
     ```
4. 데이터베이스 고유의 **예약어**는 사용하지 않는다.

### 테이블 및 컬럼 네이밍 규칙

1. **접미사**는 사용하지 않으며 **접두사**는 마스터 테이블 제외, 마스터 테이블에 속성으로 묶인 테이블을 구분하는데만 사용한다.

   - 예)

     ```text
     tb_user (x), user_tbl (x)  
     user (o)  
     user_auth (o)  
     book (o)  
     book_like (o)
     ```
2. 테이블의 이름은 복수형이 아닌 **단수형**을 사용한다.

   - 예)

     ```text
     users (x)  
     user (o)
     ```
3. 약어 사용 제한

   - 되도록 **약어**의 사용을 피한다. 약어를 사용해야 하는 경우 **소문자**로 사용하며, **약어에 대한 정의서**를 작성하고 모든 사람이 같은 약어를 사용할 수 있게 전파
   - 예)

     ```text
     create_dt (x), user_cd (x)  
     create_date (o), user_code (o)
     ```
4. 컬럼의 타입에 맞는 **접두사**, **접미사**를 통일하여 사용한다.

   - PK 컬럼

     ```text
     <테이블 이름> + _id
     ```
   - FK 컬럼 (릴레이션 된 PK 값과 동일하게 설정)

     ```text
     <부모 테이블 이름> + _id
     ```
   - 날짜

     ```text
     <테이블 이름> + _date
     ```
   - 코드

     ```text
     <테이블 이름> + _code
     ```
   - 숫자

     ```text
     <테이블 이름> + _no
     ```
   - boolean 타입 (tinyint unsigned 0,1 로 표현)

     ```text
     is_ + <컬럼 이름>
     ```

### 약어에 대한 정의서

#### 접미사

- 너무 긴 단어 중 약어로 충분한 기능을 하는 단어는 약속하에 사용한다.

|  |  |  |  |
| --- | --- | --- | --- |
|  | **대상** | **규칙** | **예외사항** |
| 1 | PK 값 | <table\_name>+\_id |  |
| 2 | number | \_no |  |
| 3 | address | \_addr |  |
| 4 | episode | ep |  |
| 5 | transaction | tx |  |
| 6 | count | cnt |  |
| 7 | authentication | auth |  |
| 8 | introduce | intro |  |

- 약어 규칙 최소한으로 유지

### 인덱스 네이밍 규칙

1. 인덱스를 만들 **테이블**과 **포함되는 컬럼**을 조건 **순서에 맞게 기술**한다. **접미사**는 대문자

   - <table\_name>\_<column1>\_<column2>\_… \_IDX
   - 예) actor 테이블의 first\_name, last\_name, last\_update 컬럼을 가지는 복합인덱스

     ```text
     actor_first_name_last_name_last_update_IDX
     ```
2. 인덱스는 **접미사**로 **\_IDX**를 가진다.

   - 예)

     ```text
     book_like_user_id_IDX
     ```

### 데이터 타입에 대한 정의

1. boolean 값은 Y,N 의 char값이 아닌 tinyint 0,1 값을 사용한다. (MySQL 기본 – Python이나 PHP에서 0을 null로 처리할 때는 char(1) 'Y', 'N'을 사용한다.)
2. 인덱스가 필요 없는(검색조건이 아닌) 1000자 이상의 데이터를 저장하는 컬럼은 Text를 사용하며, 데이터 길이에 따라 text 타입을 나눈다.

|  |  |
| --- | --- |
| TINYTEXT | 256 bytes |
| TEXT | 65,535 bytes → 64kb |
| MEDIUMTEXT | 16,777,215 bytes → 16MB |
| LONGTEXT | 4,294,967,295 bytes → 4GB |

예) 길지 않은 url 정보 → tinytext or text, 덩치가 큰 JSON → mediumtext or logtext

3. 고정 자릿수는 CHAR(n)를 가변은 VARCHAR(n)을 사용한다.
4. 돈, 캐시 관련 회계/정산 데이터를 저장하는 컬럼은 DECIMAL(10,2)를 사용한다.
5. Join에 키가 되는 컬럼들은 int 계열(tinyint, smallint, int, bigint)로 하며, 조인되는 컬럼간 데이터 타입을 동일하게 맞춘다.
6. 음수를 사용하지 않는 컬럼은 unsigned 옵션을 사용한다.
7. 숫자 데이터의 자릿수 고정이 필요한 경우 int(n)의 zerofill 옵션을 사용한다.
8. 인덱스가 잡히는 컬럼은 되도록 NULL 사용을 지양한다. 별도의 테이블에서 JOIN으로 풀 것을 권장하지만, 사이즈가 작거나, 사용처가 적은 데이터는 null을 허용한다.

---

이 규칙이 정답은 아니며, 많은 데이터베이스 기본서적에서도 각자 다른 네이밍 규칙에 맞춰 표기를 합니다.

저 같은 경우에도 자바스크립트와 함께 많이 쓰는 MongoDB를 설계할 때는 카멜 케이스를 자주 씁니다. 그리고 필드의 이름도 데이터로 들어가는 MongoDB의 경우는 약어를 많이 정의해 두고 사용합니다.
