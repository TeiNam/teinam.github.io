---
title: "문자셋 · 콜레이션 · 시간대"
permalink: /docs/database/mysql-install-checklist/charset-timezone/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 문자셋·콜레이션·시간대"
last_modified_at: 2026-09-19
guide: mysql-install-checklist
order: 3
nav_title: "문자셋·시간대"
---

문자 데이터를 어떤 인코딩으로 저장하고 어떤 기준으로 같다고 판정할지, 시각을 어느 시간대로 해석할지 정하는 절이다. 세 항목 모두 초기 구축 때 결정한다. 서버 기본 문자셋을 나중에 바꾸면 기존 객체와 새로 만드는 객체의 설정이 갈린다.

### 문자셋

- 서버 기본 문자셋은 `character_set_server`, 서버 기본 콜레이션은 `collation_server` 로 정한다. 8.0 이상의 기본값은 각각 **`utf8mb4`** 와 **`utf8mb4_0900_ai_ci`** 다. 8.0 에서 `latin1` 과 `latin1_swedish_ci` 로부터 바뀐 값이다.
- 즉 8.0 이상을 새로 세운다면 문자셋은 이미 원하는 값이다. 오래된 설정 파일이나 문서에서 복사해 온 `utf8`·`utf8mb3` 지정만 제거한다.
- `utf8mb3` 는 deprecated 다. 8.0.x 와 8.4.x LTS 계열 수명 동안은 지원되지만 장래 메이저 릴리스에서 제거될 것으로 문서가 예고한다. `CHARACTER SET` 절 밖의 용법(`--character-set-server=utf8mb3`, `SET NAMES 'utf8mb3'`, `_utf8mb3 'a'`)도 함께 deprecated 다.
- `utf8` 은 `utf8mb3` 의 deprecated 별칭이다. 출력에서는 `utf8` 과 `utf8_` 접두어가 `utf8mb3` 와 `utf8mb3_` 로 표기된다.
- 사용 중에 서버 기본 문자셋을 바꾸면 이미 만들어진 객체와 새로 만드는 객체의 문자셋이 갈리므로, 처음 구축할 때 정해 둔다.

```ini
[mysqld]
character_set_server = utf8mb4
collation_server     = utf8mb4_0900_ai_ci
```

### 콜레이션과 한국어

기본 콜레이션 `utf8mb4_0900_ai_ci` 는 UCA 9.0.0 가중치 키와 CLDR v30 을 기반으로 한다. 악센트와 대소문자를 구분하지 않으며, 이름의 `_0900`·`_ai`·`_ci` 가 그 뜻이다. 특정 언어에 맞춘 콜레이션이 아니라 보조 문자까지 포함해 기본 순서로 정렬한다. pad 속성은 `NO PAD` 여서 `'a'` 와 `'a '` 가 서로 다른 문자열로 비교된다.

한국어와 관련된 문제는 실재한다. MySQL Bug #111331 은 `'가나다'`, `'ㄱㅏ나다'`, `'ㄱㅏㄴㅏㄷㅏ'` 세 행을 넣고 `WHERE name = '가나다'` 를 실행하면 `utf8mb4_0900_ai_ci` 테이블이 **세 행 모두**를 반환한다고 보고한다. 같은 조건에서 `utf8mb4_general_ci` 테이블은 한 행만 반환한다.

```sql
SELECT '가나다' COLLATE utf8mb4_0900_ai_ci  = 'ㄱㅏㄴㅏㄷㅏ' COLLATE utf8mb4_0900_ai_ci  AS ai_ci,
       '가나다' COLLATE utf8mb4_general_ci = 'ㄱㅏㄴㅏㄷㅏ' COLLATE utf8mb4_general_ci AS general_ci;
```

앞 컬럼은 `1`, 뒤 컬럼은 `0` 을 돌려준다. 호환 자모로 분해한 표기와 완성형이 같은 가중치를 갖기 때문이며, Oracle 은 이를 UCA 표준을 그대로 구현한 결과로 보고 "Not a Bug" 으로 닫았다. 규격상 서로 다른 grapheme cluster 를 가진 두 문자열이 동일하다고 판정될 수 있다는 것이 답변의 요지다.

여기서 범위를 정확히 잡아야 한다.

- 문제의 성격은 "한글을 못 알아본다"가 아니라 **분해형 표기까지 같은 값으로 매칭된다**는 것이다. 정상적인 완성형 한글끼리 잘못 매칭된다는 근거는 공개된 자료에 없다.
- **`utf8mb4_ko_0900_ai_ci` 는 존재하지 않는다.** 8.4 와 26.7 매뉴얼의 언어별 콜레이션 표 어디에도 한국어 항목이 없다. 참고로 일본어는 `_ai_ci` 형태가 없고 `utf8mb4_ja_0900_as_cs` 와 `utf8mb4_ja_0900_as_cs_ks` 만 제공된다.
- 공식 문서에 "한국어라면 이 콜레이션을 쓰라"는 권고는 없다. 아래 권고는 확인된 사실에서 끌어낸 판단이다.

`utf8mb4_general_ci` 로 내리는 선택에는 대가가 따른다.

- `general_ci` 는 확장·축약·무시문자를 지원하지 않고 문자 사이의 1:1 비교만 하는 레거시 콜레이션이다. 문서 표현은 빠르지만 "slightly less correct" 다.
- `general_ci` 는 `PAD SPACE` 여서 `'a' = 'a '` 가 참이 된다. 후행 공백이 의미를 갖는 데이터라면 비교 의미 자체가 달라진다.
- 8.0·8.4 기본 스키마로 만들어진 객체와 조인할 때 콜레이션 혼용 문제를 만날 수 있다.

권고 방향은 이렇다. **서버 기본값 `utf8mb4_0900_ai_ci` 를 유지하고, 완성형과 분해형을 엄격히 구분해야 하는 컬럼만 컬럼 단위로 `utf8mb4_0900_as_cs` 또는 `utf8mb4_0900_bin` 을 지정한다.** 로그인 ID, 고유 코드처럼 동일성 판정이 곧 식별인 컬럼이 대상이다.

```sql
CREATE TABLE members (
  login_id VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  PRIMARY KEY (login_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

컬럼에 지정한 콜레이션이 의도대로 동작하는지는 앞의 `COLLATE` 비교 쿼리로 배포 전에 확인한다. 그리고 분해형 입력이 애초에 들어오지 않게 애플리케이션에서 입력을 NFC 로 정규화하는 것이 근본 대응이다. 이는 MySQL 문서의 권고가 아니라 유니코드 처리의 일반 원칙이다.

### 시간대

- `time_zone` 의 초기값은 `'SYSTEM'` 이고, 서버 시간대가 시스템 시간대와 같다는 뜻이다.
- `SYSTEM` 에는 비용이 있다. 시간대 계산이 필요한 모든 함수 호출이 현재 시스템 시간대를 알아내려고 시스템 라이브러리를 호출하고, 이 호출이 전역 뮤텍스로 보호되어 경합이 생길 수 있다.
- **시간대 테이블은 설치 과정에서 만들어지지만 적재되지는 않는다.** 이름 형태의 시간대는 이 테이블이 채워져 있을 때만 쓸 수 있고, 그렇지 않으면 `ERROR 1298 (HY000): Unknown or incorrect time zone: 'UTC'` 가 난다. `'Asia/Seoul'` 은 물론 이름 형태의 `'UTC'` 도 실패한다. 오프셋 표기 `'+00:00'` 은 테이블이 필요 없다. `CONVERT_TZ()` 도 이름을 쓰면 테이블이 필요하다.

```sql
SELECT COUNT(*) FROM mysql.time_zone_name;
```

적재 명령은 `mysql` 스키마의 기존 시간대 테이블을 덮어쓴다.

```bash
mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root -p mysql
```

- 적재 후에는 서버를 재시작해야 한다. `mysqld` 가 조회한 시간대 정보를 캐싱하기 때문이다. `zoneinfo` 가 있는 시스템에서는 다운로드용 시간대 패키지를 쓰지 말라는 경고가 문서에 있다.
- 명시 설정은 옵션 파일의 `default-time-zone='timezone'` 또는 `SET GLOBAL time_zone` 으로 한다. 후자는 `SYSTEM_VARIABLES_ADMIN` 권한이 필요하고, 오프셋으로 지정할 때 범위는 `'-13:59'` 부터 `'+14:00'` 이다.
- 국내 전용 서비스는 `Asia/Seoul` 로 두고, 여러 지역을 상대하는 서비스는 `UTC` 로 두고 표시 시점에 변환한다.

```ini
[mysqld]
default-time-zone = 'Asia/Seoul'
```
