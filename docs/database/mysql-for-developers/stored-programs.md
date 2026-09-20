---
title: "7. Stored Procedure · Trigger · Event Scheduler 사용 자제"
permalink: /docs/database/mysql-for-developers/stored-programs/
breadcrumb: "Docs / Database / MySQL for Developers"
description: "MySQL 개발 가이드 — 스토어드 프로그램을 피하는 근거"
last_modified_at: 2026-09-20
guide: mysql-for-developers
order: 7
nav_title: "Stored Program"
---

> **WARNING** — MySQL에서는 특히 주의
>
> MySQL의 stored program 캐시는 **연결(세션) 단위**라 연결 간에 공유되지 않는다.

| 문제 영역 | 상세 |
| --- | --- |
| **유지보수** | 비즈니스 로직 분산, 디버깅 기능 없음 |
| **이식성** | DBMS 종속, 버전 호환성 문제 |
| **성능** | 캐싱 솔루션(Redis 등) 통합 어려움, Scale-Out 제한 |
| **생산성** | 버전 관리·테스트·배포 자동화 부족, 협업 어려움 |
| **로직 중복** | 앱 코드와 SP 간 동일 로직 중복 → 일관성 저하 |
| **보안** | 권한 관리 복잡(DEFINER/INVOKER 혼동), 문자열 연결로 동적 SQL을 조립하면 인젝션 위험 |

이 표에서 공식 문서가 직접 뒷받침하는 것은 두 줄이다 — **"There are no stored routine debugging facilities."** 그리고 아래 7.1의 세션 단위 캐시다. 이식성·생산성·로직 중복은 실무에서 굳어진 기준이며, MySQL 매뉴얼에 대응 서술이 없다.

### 7.1 세션 단위 캐시라는 구조적 한계

서버는 스토어드 프로그램을 내부 구조로 변환해 캐시한다. 문제는 그 캐시의 범위다.

> "Stored programs (stored procedures and functions, triggers, and events). In this case, the server converts and caches **the entire program body**. The `stored_program_cache` system variable indicates the approximate number of stored programs the server caches **per session**."

> "The server maintains caches for prepared statements and stored programs **on a per-session basis**. Statements cached for one session are **not accessible to other sessions**. When a session ends, the server **discards** any statements cached for it."

- **세션 로컬 캐시**: 스토어드 프로그램은 각 세션에서 변환·캐시되고, 그 세션에서만 재사용되며, 세션이 끝나면 폐기된다. 세션 경계를 넘어 공유되는 컴파일 캐시는 없다. 타 DBMS의 전역 캐시와 비교하는 서술은 이 문서의 범위 밖이다
- **커넥션 풀과의 궁합**: 풀이 연결을 자주 만들고 버리면 새 세션마다 변환 비용이 다시 든다. 반대로 장수 연결을 재사용하는 풀에서는 두 번째 호출부터 캐시가 살아 있어 비용이 크지 않다
- **정리**: "매 호출마다 무조건 재컴파일"은 과장이다. 정확한 서술은 **전역 공유 캐시가 없다는 구조적 한계**이고, 이것이 위의 유지보수·이식성 문제와 겹쳐 SP 남용을 피하는 근거가 된다
- 캐시 개수 한도는 `stored_program_cache`로 정해진다. 값은 문서의 숫자를 믿지 말고 대상 서버에서 확인한다 — `SELECT @@GLOBAL.stored_program_cache;`

> **INFO** — 메타데이터가 바뀌면 다시 파싱한다
>
> DDL, `FLUSH TABLES`, table definition cache에서의 축출로 참조 객체의 메타데이터가 바뀌면 서버가 **자동으로 재파싱(reprepare)** 한다. 공식 문서의 표현은 "Reparsing is automatic, but to the extent that it occurs, **diminishes prepared statement and stored program performance**"다. 재시도는 최대 3회이며 실패하면 에러가 된다. 즉 스키마를 자주 바꾸는 환경에서는 세션 캐시의 이득이 더 줄어든다.

### 7.2 공식 문서가 명시한 제약

- **동적 SQL은 프로시저에서만 된다.** `PREPARE`를 쓰는 동적 SQL은 스토어드 프로시저에서만 가능하고, **스토어드 함수와 트리거에서는 불가능하다.** 함수 안에서 조건을 조립해 쿼리를 만들려는 설계는 문법 단계에서 막힌다
- **스토어드 함수는 실행 전에 테이블 락을 잡는다.** 공식 문서의 표현은 같은 테이블을 갱신하는 스토어드 함수들이 **병렬로 실행되지 않는다**는 것이다. 반면 스토어드 프로시저는 테이블 수준 락을 잡지 않는다. 표의 "Scale-Out 제한"을 공식 근거로 말할 수 있는 지점이 여기다
- **디버깅 기능이 없다.** 로직을 SP로 옮기는 순간 IDE 디버거·스택 트레이스·단위 테스트 도구를 포기한다
- 8.4에서 권한이 재편됐다 — `SET_USER_ID` 권한이 제거되고 `SET_ANY_DEFINER`·`ALLOW_NONEXISTENT_DEFINER`로 분리됐다. `DEFINER`를 지정해 오던 배포 스크립트는 업그레이드 시 권한을 다시 부여해야 한다

### 7.3 트리거와 이벤트의 함정

트리거는 "DB가 알아서 해 주는 동기화"처럼 보이지만, 돌지 않는 경우가 공식 문서에 나열돼 있다.

- **"Triggers are not activated by foreign key actions."** FK `ON DELETE CASCADE`로 지워진 행에는 감사·동기화 트리거가 실행되지 않는다. 1장의 반정규화 동기화, 6.4의 FK 논의와 직접 이어지는 정합성 함정이다
- **행 기반 복제에서는 소스에서 실행된 문장 때문에 레플리카의 트리거가 작동하지 않는다**(문장 기반 복제에서는 작동한다). 8.4의 기본 `binlog_format`은 `ROW`이므로, "레플리카에서도 트리거가 돌 것"이라는 가정은 기본 설정에서 틀린다
- **트리거 캐시는 기반 객체의 메타데이터 변경을 감지하지 못한다.** 공식 서술대로 트리거가 **낡은 메타데이터로 동작**할 수 있다
- 트리거와 함수는 **호출 문장이 이미 사용(읽거나 쓰기)하고 있는 테이블을 수정할 수 없다.** 명시적·암묵적 커밋이나 롤백 문장도 쓸 수 없고, 결과셋을 반환하는 문장도 불가능하며, 재귀도 안 된다
- `mysql`·`INFORMATION_SCHEMA`·`performance_schema` 테이블에는 트리거를 만들 수 없다

Event Scheduler에도 같은 계열의 제약이 있다.

- **"Events do not support times later than the end of the Unix Epoch; this is approximately the beginning of the year 2038."** 2.3의 Y2038 문제와 같은 상한이다. 2038년 이후의 일정을 이벤트로 예약할 수 없다
- 이벤트 본문은 **매 실행마다 새 연결**에서 실행된다. 세션 변수·임시 테이블·카운터 같은 세션 상태가 실행 사이에 남지 않는다
- `LOCK TABLES` 중에는 이벤트 관련 DDL을 실행할 수 없고, 이벤트 안에서 이벤트·루틴·트리거를 생성·변경·삭제할 수 없다
- 실행 시점이 1~2초 지연될 수 있다. 초 단위 정확도가 필요한 스케줄에는 쓰지 않는다
- Aurora MySQL v3에서 `event_scheduler`는 **클러스터 레벨 파라미터로만** 수정할 수 있다

---
