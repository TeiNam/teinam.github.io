---
title: "9. MySQL 릴리스 정책"
permalink: /docs/database/mysql-for-developers/release-policy/
breadcrumb: "Docs / Database / MySQL for Developers"
description: "MySQL 개발 가이드 — 릴리스 트랙과 업그레이드 시 깨지는 것"
updated: 2026-09-20
guide: mysql-for-developers
order: 9
nav_title: "릴리스 정책"
---

### 9.1 Innovation 과 LTS

> **INFO** — 2023-07(8.0 이후)부터 MySQL은 두 트랙으로 나뉘었다
>
> 실무에서 "최신 버전 사용"을 권장할 때, 어떤 트랙의 최신 버전인지가 중요하다.

| 구분 | Innovation | LTS (Long-Term Support) |
| --- | --- | --- |
| **성격** | 신기능 우선 릴리스 | 안정성 우선, 첫 LTS 릴리스에서만 기능 추가·제거 이후 고정 |
| **지원 기간** | 짧음 (다음 Innovation으로 빠르게 교체) | Oracle Lifetime Support 정책 — **Premier 5년 + Extended 3년** |
| **동작 변화** | 마이너 버전 간에도 동작(behavior) 변경 가능 | 동일 LTS 시리즈 내에서는 동작 변경 없음 |
| **적합 대상** | 빠른 CI/CD, 자동화 테스트가 잘 갖춰진 개발 환경 | 운영 환경, 장기 안정성이 중요한 서비스 |
| **순차 버전 시절의 대표 버전** | 9.0 ~ 9.6 | **8.4.x**(첫 LTS) · **9.7.x**(두 번째이자 마지막 순차 LTS) |
| **업그레이드 경로** | 같은 메이저 내 Innovation 간 직접 업그레이드 가능 (예: 9.0 → 9.1) | 메이저가 다른 Innovation 간 직접 업그레이드 불가 → 가까운 LTS를 거쳐야 함 (예: 8.3 → **8.4(LTS)** → 9.0). LTS → 다음 LTS는 지원(예: **8.4.x → 9.7.x**), LTS 시리즈 건너뛰기는 불가 |

> **DANGER** — 흔한 혼동: "9.7 = Innovation 최신"은 오해
>
> MySQL **9.7.x는 8.4에 이은 두 번째 LTS**다. 공식 매뉴얼도 "8.4.x LTS → 9.7.x LTS" 업그레이드 경로를 명시한다. 9.0~9.6이 Innovation 트랙이고 **9.7부터 다시 LTS로 고정**되는 구조다(8.1~8.3 Innovation → 8.4 LTS 패턴의 반복). 따라서 "최신 9.x = Innovation"이라고 뭉뚱그리면 안 되고, **9.7 이상은 LTS로 취급**해야 한다.

### 9.2 캘린더 버저닝 전환 — 순차 버전은 9.7에서 끝났다

2026년의 버전 번호는 더 이상 순차 체계가 아니다.

> "MySQL 9.7 was **the final release line using the sequential versioning model**. Subsequent MySQL Innovation and LTS releases use **calendar versioning in the YY.M.P format**."

> "MySQL 26.7.0, representing the July 2026 release, is **the first valid calendar-versioned MySQL release**."

- 버전 형식은 **`YY.M.P`** 다. `26.7.0`은 2026년 7월 릴리스를 뜻한다
- **캘린더 버전만으로는 트랙을 알 수 없다.** 공식 문서가 "A calendar version does not determine whether a release is an Innovation or LTS release"라고 못 박는다. 숫자가 크다고 LTS인 것도, Innovation인 것도 아니다. 각 릴리스의 성격은 해당 릴리스 노트에서 확인한다
- 릴리스 노트의 표기를 그대로 읽는다. 예를 들어 **26.10.0(2026-09-18)** 은 릴리스 노트에 **"Early Access Release"** 로 표기된다. 번호만 보고 운영에 올릴 대상으로 취급하면 안 된다
- 계보 규칙이 하나 더 있다 — **순차 버전의 마지막 LTS 계열인 `MySQL 9.7.x LTS`만 첫 캘린더 버전 호환 계보로 직접 업그레이드할 수 있다.** 8.4 LTS를 쓰고 있으면 9.7을 경유해야 캘린더 계보로 들어간다

### 9.3 8.0의 현재 상태

- **2026년 4월 21일부로 MySQL 8.0은 Oracle Sustaining Support 적용 대상이다.** 즉 새 패치·보안 수정을 기대할 수 있는 단계가 지났다
- 공식 안내가 제시하는 업그레이드 대상은 **MySQL 8.4 LTS 또는 9.7 LTS**다
- 8.0에서 8.4로 올릴 때는 기능 제거와 기본값 변경이 함께 따라온다. 9.5에 개발 코드가 부딪히는 지점을 정리했다

> **WARNING** — 실무 적용 시 주의
>
> - 운영 DB는 **LTS 트랙**을 기본으로 고려한다. 현재 선택지는 **8.4.x**(성숙한 첫 LTS)와 **9.7.x**(두 번째 LTS)이며, 8.0에 머물러 있다면 이전 계획을 먼저 세운다
> - AWS RDS·Aurora for MySQL은 자체 지원 버전 로드맵을 따로 갖고 있으므로, MySQL 커뮤니티 버전의 트랙과 AWS의 지원 버전이 반드시 일치하지는 않는다 — 마이그레이션 전에 AWS 지원 버전 목록을 별도로 확인한다
> - 캘린더 버전 릴리스를 검토할 때는 해당 릴리스 노트에서 트랙과 Early Access 여부를 먼저 확인한다

### 9.4 커넥터 버전은 서버 버전과 다르게 읽는다

- **Connector/J 26.7은 MySQL 8.4 이상을 지원한다.** 커넥터 버전이 서버 버전 번호를 따라간다고 해서 지원되는 서버 범위가 모든 버전을 포함하지는 않는다. 8.0 서버를 쓰는 환경은 커넥터를 최신으로 올리기 전에 지원 범위를 먼저 확인해야 한다
- **서버 9.7.x와 Connector/J 9.7.0은 버전 숫자만 같을 뿐 성격이 다르다.** 서버 쪽 LTS 여부와 커넥터의 지원 범위는 별개로 확인한다
- 커넥터는 JDBC 4.2를 구현하며 4.3 전용 메서드는 `SQLFeatureNotSupportedException`을 던진다. 실행에는 JRE 8 이상이 필요하다

### 9.5 업그레이드 시 개발 코드가 부딪히는 지점

8.0에서 8.4 이상으로 올릴 때 **애플리케이션과 스키마가 직접 영향을 받는** 변화만 모았다.

- **인증 플러그인**: `mysql_native_password`는 8.0.34에서 deprecated, **8.4에서 기본 비활성**, **9.0.0에서 제거**됐다. 8.4에서 해당 플러그인 계정으로 접속하면 `ERROR 1045 (28000)`이고, 그 플러그인으로 계정을 만들거나 바꾸려 하면 `ERROR 1524 (HY000): Plugin 'mysql_native_password' is not loaded`다. 활성화 방법은 기동 옵션 `--mysql-native-password=ON` 하나뿐이다
- **기본 플러그인은 `caching_sha2_password`** 이며 `authentication_policy`로 결정된다. 이 플러그인 계정은 **보안 연결이거나 RSA 키 교환을 지원하는 연결**이어야 한다. 평문 TCP 클라이언트는 `ERROR 2061 (HY000): ... Authentication requires secure connection.`을 받으므로 `--get-server-public-key`가 필요하다
- 8.4.0 이상은 TLSv1.2·TLSv1.3을 준수하지 않거나 순방향 비밀성을 제공하지 않거나 SHA2·AEAD를 쓰지 않는 암호군을 거부한다
- **스키마**: `restrict_fk_on_non_standard_key=ON`이 기본값이라 비유니크·부분 키를 참조하는 FK 생성이 막힌다 (6.4 참고)
- **쿼리 결과**: `GROUP BY`의 `ASC`·`DESC` 한정자는 8.0.13에서 제거됐고 암묵 정렬에 기대면 결과가 달라진다 — `ORDER BY`를 명시한다 (4.5 참고)
- **문자셋**: `utf8mb3`와 별칭 `utf8`은 deprecated다 (3.1 참고)
- **업그레이드 차단 조건**: `FLOAT`·`DOUBLE` 컬럼에 `AUTO_INCREMENT`가 있으면 업그레이드가 `ER_WRONG_FIELD_SPEC`으로 실패한다. 올리기 전에 찾아 고친다
- **기동 실패**: 제거된 시스템 변수를 설정 파일에 남겨 두면 서버가 뜨지 않는다 — `expire_logs_days`(→ `binlog_expire_logs_seconds`), `default_authentication_plugin`(→ `authentication_policy`), `transaction_write_set_extraction`, `log_bin_use_v1_events` 등이다. 공식 문서의 표현은 "Attempting to set any of them in MySQL 8.4 raises an error"다
- **문법 오류가 되는 것**: `LOCK TABLES ... WRITE`의 `LOW_PRIORITY`, 파티셔닝 키에 인덱스 프리픽스 지정, 시스템 변수에 `NULL` 지정
- **도구·클라이언트**: `mysql_upgrade`·`mysqlpump`·`mysql_ssl_rsa_setup`이 제거됐다. `mysql` 클라이언트는 이제 **주석을 보존**한다(과거 동작은 `--skip-comments`) — 주석에 힌트를 넣어 두었다면 서버까지 전달된다
- **비밀번호 검증**: `validate_password`가 플러그인에서 **컴포넌트**로 옮겨졌고 변수명이 점 표기(`validate_password.length`)로 바뀌었다

출처: [MySQL 8.4 Reference Manual — MySQL Releases: Innovation and LTS](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html), [MySQL Connector/J — Connector/J Versions](https://dev.mysql.com/doc/connector-j/en/connector-j-versions.html), [Oracle MySQL EOL Notice](https://www.mysql.com/support/eol-notice.html)
