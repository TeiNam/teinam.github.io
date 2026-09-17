---
date: 2022-06-11 22:19:35 +0900
title: "Aurora v1 EOL을 대처 하는 우리의 자세 (feat. MySQL 5.6)"
category: mysql
excerpt: "Aurora v1 EOL을 대처 하는 우리의 자세 (feat. MySQL 5.6) End of Life! 그렇게 EOL 입니다. MySQL 5.6을 기반으로 하는 AWS의 Aurora v1 버전의 EOL 소식이 들려오고 있습니다. AWS Aurora v1 EOL 소식 2023년..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Aurora MySQL v1(5.6) 은 2023-02-28 로 표준 지원이 끝나 deprecated 처리되었고, 후속으로 소개한 v2(5.7) 도 2024-10-31 에 표준 지원이 종료됐다. 다가올 EOL 대응을 다룬 예고성 글이라 2026-09 기준 실무 가치가 없다.

![](/assets/img/wp/2019/04/mysql_PNG19.png)

## Aurora v1 EOL을 대응하는 우리의 자세 (feat. MySQL 5.6)

End of Life!

그렇게 EOL입니다.

MySQL 5.6을 기반으로 하는 AWS의 Aurora v1 버전의 EOL 소식이 발표되었습니다.

[AWS Aurora v1 EOL 소식](https://docs.aws.amazon.com/ko_kr/AmazonRDS/latest/AuroraUserGuide/Aurora.MySQL56.EOL.html "AWS Aurora v1 EOL 소식")

2023년 2월을 끝으로 더 이상 공식적인 패치 및 기술 지원은 없습니다. 이번 EOL 이슈는 Oracle이 MySQL 5.6의 EOL을 이미 발표했기 때문에, 해당 버전을 베이스로 하는 Aurora v1 버전 역시 EOL이 결정되었습니다.

![](/assets/img/wp/2022/06/화면-캡처-2022-06-11-213009.png)

2023년 2월이면 MySQL 5.6 EOL보다 2년이나 더 생명 연장을 한 케이스입니다. 다음 버전인 MySQL 5.7 버전은 2023년 10월을 끝으로 EOL입니다. MySQL 5.7을 베이스로 사용하는 Aurora v2 역시 2년의 유예기간을 가져갈지 궁금합니다.

위의 Aurora EOL 링크를 타고 들어가면 다음과 같은 글을 확인할 수 있습니다.

![](/assets/img/wp/2022/06/화면-캡처-2022-06-11-213852.png)

유지보수 모드와 관계없이 묻지도 따지지도 않고 자동으로 업그레이드됩니다.

MySQL 5.6에서 5.7 버전은 상당한 변화가 있었던 버전업이었기 때문에, 기존에 Aurora v1을 사용하고 있다면 주의가 필요합니다.

옵티마이저가 5.6은 RBO, 5.7부터는 CBO로 변경되었습니다. 복잡한 SQL이라면 손을 봐야 한다는 이야기입니다. 업그레이드 전에 사용 중인 쿼리들을 수집하고 분석하고 5.7 베이스로 튜닝하는 업무가 진행되어야 합니다.

주요 변경 사항을 확인해 보겠습니다.

### Aurora v1 (MySQL 5.6 Base) to Aurora v2 (MySQL 5.7 Base)

#### MySQL 5.6 to 5.7

Aurora MySQL의 베이스가 되는 MySQL 5.7에서 새로운 기능들입니다.

- JSON Support
- Multi-source Replication
- Optimizer Cost Model(CBO) ← 5.6 규칙 기반 최적화 (Role-based optimizer, RBO)
- Query Rewrite Plugin
- Sys Schema
- GIS Spatial Extensions
- InnoDB Transparent Page Level Compression (테이블 압축)
- InnoDB Native Partitioning → (5.7 파티셔닝 테이블에 대한 ICP 지원)

### MySQL과 Aurora의 차이점

MySQL을 베이스로 하고 있지만, Aurora에서는 지원되지 않는 기능들이 있습니다. 다음 기능은 MySQL 5.7.12에서 지원되지만 Aurora MySQL 5.7에서는 현재 지원되지 않는 기능들입니다.

- 그룹 복제 플러그인 (GTID)
- 페이지 크기 증가 (고정값 사용)
- 시작 시 InnoDB 버퍼 풀 로딩
- InnoDB 풀 텍스트 구문 분석기 플러그인
- 멀티 소스 복제
- 온라인 버퍼 풀 크기 조정
- 암호 확인 플러그인
- 쿼리 다시 쓰기 플러그인
- 복제 필터링
- CREATE TABLESPACE SQL 문
- X 프로토콜 (Document store 기능)

## 주요 변경 사항

### in 쿼리 메모리 제한 사항

→ 0으로 변경 (설정 OFF)

MySQL 5.6에서 5.7로 업데이트 시 아래와 같이 IN 절 개수는 똑같은데 버전업만으로 테이블 풀스캔이 발생할 수 있습니다. 이는 5.7에 새롭게 추가된 `range_optimizer_max_mem_size` 때문인데, 쿼리 자체를 메모리에 올리는 것 또한 메모리 제한이 되도록 제한한 옵션입니다.

[IN쿼리가 인덱스를 타지 않는 현상](https://dev.mysql.com/doc/refman/5.7/en/range-optimization.html#range-optimization-memory-use)

결론적으로는 해당 옵션이 만약 0이 아닌 값이 설정되어 있다면, 그 값을 초과했을 경우 테이블 풀스캔 혹은 이외의 인덱스를 태우게 됩니다.

5.6에서 5.7로 올릴 경우 IN 절을 과하게 사용하는 쿼리가 있다면 해당 쿼리를 꼭 사전 성능 테스트를 수행해보고 테이블 풀스캔이 발생한다면

- `range_optimizer_max_mem_size`를 0으로 변경 (설정 OFF)
- IN에 맞게 사이즈 조절

중 하나를 선택해서 설정하시길 추천드립니다.

### Union Query Limit 변경

union 쿼리에서 limit를 사용할 때 변경해야 할 사항이 있습니다. MySQL 5.6 이전에는 `select …. limit 1 union select …` 처럼 사용이 가능했었지만, MySQL 5.7부터는 select 쿼리들을 `()` 안에 묶어주고 union을 해야 합니다.

자세한 내용은 웹사이트를 확인하시면 됩니다.

<https://dev.mysql.com/doc/refman/5.7/en/union.html>

### Join View 이슈

join view 사용에서도 확인해야 할 사항이 있습니다.

view를 사용하면서 insert, update, delete를 할 때 사용 제약이 있습니다. view에서 join을 사용하면 delete를 할 수 없습니다. MySQL 5.6에서는 가능했습니다.

<https://dev.mysql.com/doc/refman/5.7/en/view-updatability.html>

### SQL\_MODE 변경

기본값

```text
The default SQL mode in MySQL 5.7 includes these modes: 
ONLY_FULL_GROUP_BY, STRICT_TRANS_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO, NO_AUTO_CREATE_USER and NO_ENGINE_SUBSTITUTION
```

- **STRICT\_TRANS\_TABLES**:  
  엄격한 모드. 유효하지 않거나 누락된 데이터가 있는 명령문은 비 트랜잭션 스토리지 엔진 및 유효하지 않거나 누락된 데이터가 첫 번째 행이 아닌 여러 행에 영향을 미치는 명령문의 경우를 제외하고는 중단 및 롤백됩니다.
- **NO\_ZERO\_IN\_DATE**:  
  연도가 0이 아니지만 날짜의 월 또는 일 부분이 0인 날짜는 허용하지 않습니다. 예를 들어 이 설정을 사용하면 '0000-00-00'이 허용되지만 '1970-00-10'또는 '1929-01-00'은 허용되지 않습니다.
- **NO\_ZERO\_DATE**:  
  엄격 모드에서 '0000-00-00'을 유효한 날짜로 불허
- **ERROR\_FOR\_DIVISION\_BY\_ZERO**:  
  설정하지 않으면 0으로 나누기가 NULL을 반환합니다. 설정하면 1/0으로 열을 업데이트하려고 시도하면 오류를 반환하고 경고도 반환합니다.
- **NO\_AUTO\_CREATE\_USER**:  
  인증 정보를 지정하지 않으면 `GRANT`를 사용하여 자동으로 사용자를 생성하지 못합니다.
- **NO\_ENGINE\_SUBSTITUTION**:  
  설정하지 않으면, `CREATE TABLE` 시에 지정한 스토리지 엔진이 사용할 수 없는 것이라면 경고가 표시되고 기본 스토리지 엔진으로 테이블을 생성합니다.
- **ONLY\_FULL\_GROUP\_BY**:  
  group by를 사용하면서 group by에서 사용하지 않는 컬럼을 select나 order by에서 사용하면 에러가 발생

SQL 모드 `ONLY_FULL_GROUP_BY`는 TRADITIONAL 모드의 일부이며 5.7부터 기본적으로 활성화됩니다. 특히 `ONLY_FULL_GROUP_BY` 옵션은 `HAVING`이나 `ORDER BY` 목록이 `GROUP BY` 절에서 명명되지 않았거나 기능적으로 종속되지 않은 집계되지 않은 열을 참조하는 쿼리를 거부하며 에러를 리턴합니다. 최신 버전의 MySQL로 마이그레이션한 후 이러한 문제를 자주 겪습니다.

물론 꺼버리면 5.6과 동일한 쿼리를 사용할 수 있겠지만, 5.7의 EOL도 얼마 남지 않은 시점에서 계속 쌓아두기만 할 수는 없습니다.

이것을 해결하는 방법은

- SQL 쿼리 다시 작성
- 해당 옵션을 끄고 사용하기
- 집계 함수의 사용

등이 있지만 역시 가장 좋은 방법은 SQL-92 표준을 준수하여 다시 SQL을 작성하는 방법입니다.

버전이 크게 바뀌는 단계에서는 많은 파라미터가 사라지고, 생성됩니다.

기존의 파라미터를 승계하면 특별한 변화 없이 사용할 수도 있겠지만, 성능이나 여러 가지 또 다른 문제를 마주할 수 있습니다. 결국 해당 버전에 최적화 작업을 한 번 거쳐주는 것이 가장 좋은 방법이지 않을까 생각합니다.
