---
date: 2019-11-15 03:36:59 +0900
title: "PostgreSQL Localization"
category: postgresql
excerpt: "PostgreSQL 로케일 지원은 initdb를 이용해 클러스터를 구성하면 자동으로 초기화됩니다. 옵션을 지정하지 않으면 환경 변수에서 상속되며, 환경 변수가 없으면 C 로케일로 설정됩니다."
updated: 2026-09-20
---

로케일 지원은 `initdb`를 이용해 클러스터를 구성하면 자동으로 초기화됩니다. `initdb`는 실행 환경의 로케일 설정을 기본으로 사용합니다. 환경 변수(`LC_ALL`, `LC_COLLATE`, `LANG` 등)가 설정되지 않았다면 `C` 로케일로 기본값이 설정됩니다.

| 카테고리 | 설명 |
| --- | --- |
| `LC_COLLATE` | String 정렬 순서 |
| `LC_CTYPE` | 문자 분류 (어떤 글자인지, 대문자도 동일한지) |
| `LC_MESSAGES` | 메시지 언어 |
| `LC_MONETARY` | 통화 형식 |
| `LC_NUMERIC` | 숫자 형식 |
| `LC_TIME` | 날짜 및 시간 형식 |

**예:** 로케일을 한국으로 설정하되 통화 형식은 달러를 쓴다면, `initdb --locale=ko_KR --lc-monetary=en_US`로 클러스터를 구성하면 됩니다.

## 로케일 프로바이더

PostgreSQL 15부터 로케일 프로바이더를 선택할 수 있습니다. 프로바이더는 로케일 동작을 정의하는 라이브러리를 지정합니다.

| 프로바이더 | 설명 |
| --- | --- |
| `libc` | 운영체제 C 라이브러리 로케일 사용 (기본값) |
| `icu` | 외부 ICU 라이브러리 사용 (빌드 시 ICU 지원 필요) |
| `builtin` | 내장 연산 사용 (PostgreSQL 17+). `C`, `C.UTF-8`, `PG_UNICODE_FAST` 로케일만 지원 |

**ICU 프로바이더 장점:**
- 운영체제와 데이터베이스 인코딩과 무관하게 동작
- 플랫폼 간 이식 시 동일한 결과 보장
- BCP 47 언어 태그로 다양한 콜레이션 옵션 지원

**예제:**
```sql
-- ICU 프로바이더로 데이터베이스 생성
CREATE DATABASE mydb
    LOCALE_PROVIDER = icu
    ICU_LOCALE = 'ko-KR'
    TEMPLATE = template0;

-- builtin 프로바이더로 데이터베이스 생성 (PostgreSQL 17+)
CREATE DATABASE fastdb
    LOCALE_PROVIDER = builtin
    BUILTIN_LOCALE = 'C.UTF-8'
    ENCODING = 'UTF8'
    TEMPLATE = template0;
```

PostgreSQL에서 C 또는 POSIX가 아닌 다른 로케일을 사용할 때의 단점은 성능입니다. 문자 처리가 느려지고 LIKE에서 사용되는 일반 인덱스를 사용하지 못합니다. 이러한 이유로, 실제로 필요한 경우에만 로케일을 사용해야 합니다.

C가 아닌 로케일에서 LIKE 절을 사용한 인덱스를 PostgreSQL이 이용하려면 몇 가지 커스텀 연산자 클래스가 존재해야 합니다. 이것은 로케일 비교 규칙은 무시하면서 엄격한 문자별 비교를 수행하는 인덱스의 생성을 허용합니다. 다른 방법은 C 콜레이션을 사용하여 인덱스를 생성하는 것입니다.

시스템에 로케일 지원이 안 되는 것처럼 하고 싶으면 특수한 로케일 이름인 C 또는 동등하게 POSIX를 사용해야 합니다.

## 로케일 카테고리 변경 가능 여부

`LC_COLLATE`와 `LC_CTYPE`는 데이터베이스 생성 시 고정됩니다. 이들은 인덱스 정렬 순서에 영향을 미치므로 변경할 수 없으며, 데이터베이스 운영 중 변경하면 인덱스 손상이 발생합니다. 서로 다른 데이터베이스는 서로 다른 `LC_COLLATE`/`LC_CTYPE` 설정을 가질 수 있지만, 생성 후에는 변경할 수 없습니다.

나머지 로케일 카테고리(`LC_MESSAGES`, `LC_MONETARY`, `LC_NUMERIC`, `LC_TIME`)는 언제든지 변경 가능합니다. 이들은 서버 구성 파라미터로 제공되며, `initdb`에서 선택된 값은 `postgresql.conf`에 기본값으로 작성됩니다. `postgresql.conf`에서 제거하면 서버가 실행 환경에서 설정을 상속받습니다.

> **NOTE** — PostgreSQL 16부터 `lc_collate`와 `lc_ctype`는 서버 파라미터가 아니라 데이터베이스 속성입니다. `SHOW lc_collate;` 명령은 오류를 발생시킵니다. 대신 `pg_database` 카탈로그를 조회합니다:
>
> ```sql
> SELECT datcollate, datctype
> FROM pg_database
> WHERE datname = current_database();
> ```

리눅스가 처음부터 ko\_KR.UTF8로 설정되어 있다면, initdb 시 옵션을 넣지 않아도 ko\_KR.UTF8로 설정됩니다.

로케일 설정은 다음과 같은 SQL 기능에 영향을 줍니다.

1. order by를 사용한 쿼리에서 정렬 순서 또는 텍스트 데이터에서 표준 비교 연산자
2. upper 및 lower, initcap 함수
3. 패턴 일치 연산자 (LIKE, SIMILAR TO 및 POSIX 스타일 정규식). 대소문자 비구분 일치 및 문자 클래스 정규식에 의한 문자 분류에 모두 영향을 미치는 로케일.
4. TO\_CHAR 계열 함수
5. LIKE 절을 사용한 인덱스 사용 능력

## 데이터베이스별로 각각 다른 언어셋 구성하기

```sql
postgres=# create database test_kr
with
template=template0
encoding='EUC_KR'
LC_COLLATE='POSIX'
LC_CTYPE='ko_KR.euckr'
tablespace=test_kr
connection limit=999;
CREATE DATABASE

postgres=# \l
                                  List of databases
   Name    |   Owner   | Encoding |   Collate   |    Ctype    |   Access privileges   
-----------+-----------+----------+-------------+-------------+-----------------------
 postgres  | postgres  | UTF8     | en_US.UTF-8 | en_US.UTF-8 | 
 template0 | postgres  | UTF8     | en_US.UTF-8 | en_US.UTF-8 | =c/postgres          +
           |           |          |             |             | postgres=CTc/postgres
 template1 | postgres  | UTF8     | en_US.UTF-8 | en_US.UTF-8 | =c/postgres          +
           |           |          |             |             | postgres=CTc/postgres
 test_kr   | postgres  | EUC_KR   | C           | ko_KR.euckr | 
 testdb    | test_user | UTF8     | en_US.UTF-8 | en_US.UTF-8 | 
(5 rows)
```
