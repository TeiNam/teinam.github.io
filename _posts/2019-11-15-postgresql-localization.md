---
date: 2019-11-15 03:36:59 +0900
title: "PostgreSQL Localization"
category: postgresql
excerpt: "PostgreSQL Localization 로케일 지원은 initdb를 이용해 클러스터를 구성하면 자동으로 초기화 됩니다. 특별히 옵션을 넣지 않으면 en_US.UTF8로 설정이 됩니다. LC_COLLATE String 정렬 순서 LC_CTYPE 문자 분류 (어떤글자인지, 대문자도…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — LC_* 카테고리, initdb 로케일 결정, C 로케일과 LIKE 인덱스 관계 설명은 현재도 유효하다. 다만 15 부터 ICU, 17 부터 builtin 로케일 프로바이더가 추가돼 CREATE DATABASE 에 LOCALE_PROVIDER·ICU_LOCALE·BUILTIN_LOCALE 옵션이 있고, 16 에서 읽기 전용 변수 lc_collate/lc_ctype 이 제거됐다.

## PostgreSQL Localization

> **전제조건:** PostgreSQL 9.1 이상, initdb 실행 권한

- 로케일 지원은 initdb를 이용해 클러스터를 구성하면 자동으로 초기화됩니다.
- 옵션을 지정하지 않으면 en\_US.UTF8로 설정됩니다.

|  |  |
| --- | --- |
| LC\_COLLATE | String 정렬 순서 |
| LC\_CTYPE | 문자 분류 (어떤 글자인지, 대문자도 동일한지) |
| LC\_MESSAGES | 메시지 언어 |
| LC\_MONETARY | 통화 형식 |
| LC\_NUMERIC | 숫자 형식 |
| LC\_TIME | 날짜 및 시간 형식 |

**예:** 로케일을 한국으로 설정하되 통화 형식은 달러를 쓴다면, `initdb --locale=ko_KR --lc-monetary=en_US`로 클러스터를 구성하면 됩니다.

PostgreSQL에서 C 또는 POSIX가 아닌 다른 로케일을 사용할 때의 단점은 성능입니다. 문자 처리가 느려지고 LIKE에서 사용되는 일반 인덱스를 사용하지 못합니다. 이러한 이유로, 실제로 필요한 경우에만 로케일을 사용해야 합니다.

C가 아닌 로케일에서 LIKE 절을 사용한 인덱스를 PostgreSQL이 이용하려면 몇 가지 커스텀 연산자 클래스가 존재해야 합니다. 이것은 로케일 비교 규칙은 무시하면서 엄격한 문자별 비교를 수행하는 인덱스의 생성을 허용합니다. 다른 방법은 C 콜레이션을 사용하여 인덱스를 생성하는 것입니다.

시스템에 로케일 지원이 안 되는 것처럼 하고 싶으면 특수한 로케일 이름인 C 또는 동등하게 POSIX를 사용해야 합니다.

일부 로케일 카테고리는 데이터베이스가 생성될 때 고정된 값이어야 합니다.

서로 다른 데이터베이스에 대해 서로 다른 설정을 사용할 수는 있지만, 데이터베이스가 생성된 다음에는 설정을 변경할 수 없습니다.

인덱스 정렬 순서에 영향을 미치므로 고정된 상태로 유지되어야 하며, 데이터베이스 운영 중 변경하면 인덱스 손상이 발생합니다.

initdb에서 선택된 값은 postgresql.conf에 작성되어 서버 시작 시 기본값으로 사용됩니다. 이 값을 postgresql.conf에서 제거하면 서버가 실행 환경에서 설정을 상속받습니다.

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
