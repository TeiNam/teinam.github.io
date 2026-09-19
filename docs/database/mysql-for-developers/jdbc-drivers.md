---
title: "8. JDBC Driver / Connector 선택"
permalink: /docs/database/mysql-for-developers/jdbc-drivers/
breadcrumb: "Docs / Database / MySQL for Developers"
description: "MySQL 개발 가이드 — JDBC 드라이버 선택과 커넥션 풀 설정"
updated: 2026-09-20
guide: mysql-for-developers
order: 8
nav_title: "JDBC 드라이버"
---

### 8.1 드라이버 비교표

> **WARNING** — 2026-09-19 KST 기준
>
> 드라이버 이름과 버전은 조사 시점 기준이다. `Aurora JDBC Driver`(`awslabs/aws-mysql-jdbc`)는 **End of Support** 상태이고, Aurora 대상 래퍼의 정식 명칭은 **AWS Advanced JDBC Wrapper**다. 항목별로 근거 시점이 다른 경우에는 해당 칸에 표시했다.

| 특성 | MySQL Connector/J | MariaDB Connector/J | AWS Advanced JDBC Wrapper |
| --- | --- | --- | --- |
| **대상 서버** | Connector/J 26.7은 **MySQL 8.4 이상** | MariaDB 서버 | Aurora MySQL·PostgreSQL |
| **Read/Write 분리** | Source-Replica Replication 구성 제공 | Replication mode | 전용 플러그인 제공 |
| **다중 호스트** | 멀티호스트 URL · DNS SRV 지원 | 멀티호스트 URL | 클러스터 토폴로지 기반 호스트 선택 |
| **페일오버** | 멀티호스트 Failover 구성 | Aurora 전용 로직 제거(2026-08 조사 기준) | Enhanced Failure Monitoring(EFM) 플러그인 |
| **권장 버전** | 검증 시점의 최신 GA (26.7.x) | 순수 MariaDB 대상이면 3.5.x | 4.4.0 (2026-08-20) |
| **좌표·성격** | `com.mysql:mysql-connector-j` | MariaDB 서버 대상 드라이버 | `software.amazon.jdbc:aws-advanced-jdbc-wrapper` — 기반 커넥터를 감싸는 래퍼 |

### 8.2 Connector/J의 멀티호스트 연결 — 세션이 바뀐다

Connector/J는 멀티호스트 구성으로 Failover, Load Balancing, Source-Replica Replication을 제공하고 DNS SRV 조회도 지원한다. 개발자가 반드시 알아야 할 것은 그 구성에서 **세션이 갈아 끼워진다**는 점이다.

> "Each of the underlying physical connections has its own session … **Every switch between physical connections means a switch between sessions**."

> "Within a transaction boundary, there are no switches between physical connections. **Beyond a transaction boundary, there is no guarantee that a switch does not occur.**"

즉 트랜잭션 안에서는 물리 연결이 바뀌지 않지만, **트랜잭션 경계를 넘으면 바뀌지 않는다는 보장이 없다.** 다음 코드는 멀티호스트 구성에서 조용히 실패할 수 있다.

- `SET @var := ...`로 세션 변수를 만들고 다음 트랜잭션에서 읽는 코드
- `CREATE TEMPORARY TABLE`로 만든 임시 테이블을 뒤 트랜잭션에서 참조하는 코드
- 한 세션에서 준비한 prepared statement를 트랜잭션 경계 밖에서 재사용하는 코드

세션에 의존하는 상태는 **같은 트랜잭션 안에서 만들고 쓰고 버린다.**

> **TIP** — 타임아웃 기본값이 무한 대기다
>
> - `socketTimeout` 기본값은 **0**, 즉 네트워크 소켓 연산에 타임아웃이 없다. 그대로 두면 응답 없는 서버를 무한히 기다린다
> - `connectTimeout` 기본값도 **0**이다
> - `tcpKeepAlive` 기본값은 **true**다
> - 페일오버를 감지하려면 `socketTimeout`과 `connectTimeout`에 업무 허용 시간에 맞는 값을 명시한다. 기본값에 기대면 감지 자체가 일어나지 않는다

### 8.3 드라이버 페일오버 감지 주의사항

> **DANGER** — 핵심 이슈
>
> - **MariaDB Connector/J**: 3.0.3(2023-09)부터 Aurora 전용 페일오버 로직이 제거됐다. 2.7.x 고정 사용 권고는 유효하지 않고, Aurora 환경에서는 MariaDB Connector를 단독으로 쓰지 말고 **AWS Advanced JDBC Wrapper와 결합**한다. 이 항목은 **2026-08 조사 기준**이며 적용 전에 MariaDB 공식 문서에서 재확인한다.
> - **MySQL Connector/J**: 단독 사용 시 기본 설정에서 페일오버 감지가 오래 걸린다. 자주 인용되는 "최대 15분"과 `tcp_retries2` 조정은 **MySQL 공식 문서가 아니라 리눅스 커널 파라미터와 클라우드 벤더 안내에서 온 값**이다. 그대로 믿지 말고 대상 환경에서 실제 감지 시간을 측정한다.
>     - `socketTimeout`을 업무 허용 시간에 맞는 낮은 값으로 명시한다(기본값 0 = 무한 대기)
>     - `connectTimeout`을 함께 설정한다
>     - OS 레벨 재전송 타임아웃(`tcp_retries2`) 조정은 커널 문서와 벤더 가이드를 근거로 결정한다
>     - Aurora라면 **AWS Advanced JDBC Wrapper의 Enhanced Failure Monitoring(EFM)** 을 도입해 드라이버가 능동적으로 노드 상태를 감시하게 한다

### 8.4 드라이버 선택 권장

| 드라이버 | 권장 여부 | 비고 |
| --- | --- | --- |
| **MySQL Connector/J** | 추천 (단독 사용 시 방어 로직 필요) | **Connector/J 26.7은 MySQL 8.4 이상을 지원**하므로 8.0 서버 환경은 올리기 전에 지원 범위를 확인해야 한다. JDBC 4.2 구현이며 4.3 전용 메서드는 `SQLFeatureNotSupportedException`을 던진다. JRE 8 이상이 필요하다. Maven 좌표는 `com.mysql:mysql-connector-j`다. `socketTimeout`·`connectTimeout`을 반드시 명시한다 |
| **MariaDB Connector/J** | Aurora 목적 단독 사용 비권장 | 3.0.3(2023-09)부터 Aurora 페일오버 지원 제거. 순수 MariaDB 서버 대상이면 3.5.x, 2.7.x는 신규 도입 금지 (2026-08 조사 기준) |
| **Aurora JDBC Driver** (`awslabs/aws-mysql-jdbc`) | 신규 도입 금지 · 기능 개발 종료 | **End of Support (2024-07-25)**. 이후로는 보안·중대 수정만 받으며 새 기능은 AWS Advanced Wrapper에서 구현된다. 리포지터리는 여전히 공개 상태이므로 "사라진 드라이버"는 아니지만, 신규 프로젝트에 넣을 이유가 없다 |
| **AWS Advanced JDBC Wrapper** | 최우선 추천 (Aurora) | `software.amazon.jdbc:aws-advanced-jdbc-wrapper` 4.4.0 (2026-08-20). EFM, Read/Write Split, IAM·Secrets Manager 인증, Aurora Global Database의 리전 간 failover·switchover, RDS Multi-AZ, Blue/Green 지원 |

> **INFO** — AWS Advanced JDBC Wrapper 4.x에서 추가된 것
>
> - **4.4.0** — XA/JTA 분산 트랜잭션 지원(`AwsWrapperXADataSource`), read/write splitting 플러그인을 단일 구현으로 통합(`autoSimpleReadWriteSplitting` 등 추가), Secrets Manager의 비밀 로테이션 구간 재시도 옵션, `assumeWriteTransaction`
> - **4.3.0** — Blue/Green 전환 전 준비 상태 로깅
> - **4.2.0** — SQL 파싱 기반 `autoReadWriteSplitting`, `lowestLoadByCpu`·`lowestLoadByLag` 호스트 선택기
> - **4.1.0** — Aurora Global Database의 접근 가능 리전 지원
> - **4.0.0 (2026-05)** — KMS 클라이언트 사이드 암호화 플러그인

> **NOTE** — 참고
>
> [AWS 공식 블로그](https://aws.amazon.com/blogs/database/using-the-mariadb-jdbc-driver-with-amazon-aurora-with-mysql-compatibility/)도 "MariaDB Connector/J 3.0.3부터 Aurora 미지원 → AWS Advanced JDBC Wrapper 권장"으로 안내한다.

### 8.5 커넥션 풀과 `wait_timeout`

커넥션 풀 설정을 정할 때 기준이 되는 서버 동작이 하나 있다.

> "By default, the server closes the connection after **eight hours** if nothing has happened."

이 8시간이 `wait_timeout`(값 28800)이다. 서버가 idle 커넥션을 닫은 뒤 애플리케이션이 그 커넥션을 풀에서 꺼내 쓰면 클라이언트는 다음 에러를 본다.

```text
MySQL server has gone away
```

공식 권고는 두 갈래다 — 마지막 쿼리 이후 오래 지났으면 커넥션에 **`mysql_ping()`을 하거나**, `wait_timeout`을 실질적으로 타임아웃되지 않을 만큼 **높게 두라**는 것이다. JDBC 풀에서 이 두 권고에 대응하는 것이 각각 **검증 쿼리(validation query)** 와 **커넥션 최대 수명(max-lifetime)** 설정이다.

실무 기준은 간단하다 — **풀의 커넥션 최대 수명을 서버의 `wait_timeout`보다 짧게 잡는다.** 서버가 먼저 끊는 상황을 만들지 않으면 `gone away`는 애초에 발생하지 않는다. 이 설정값 자체는 공식 문서의 규범이 아니라 풀 구현체의 설정이므로, 쓰고 있는 풀의 문서를 함께 본다.

```sql
-- 대상 서버에서 실측한다. 문서에 적힌 기본값을 그대로 믿지 않는다
SHOW VARIABLES LIKE 'wait_timeout';
SELECT @@GLOBAL.max_connections;
```

> **WARNING** — 커넥션 수 한도에 관한 두 가지 사실
>
> - 관리자용 예비 커넥션이 하나 더 있어서 실제 허용 한도는 **`max_connections + 1`** 이다
> - **파일 디스크립터가 부족하면 서버가 `max_connections`를 자동으로 낮춘다.** 설정 파일에 적은 값이 실제 값과 다를 수 있으므로, 풀 크기를 정하기 전에 실측값을 확인한다
> - `interactive_timeout`의 기본값은 배포판·설정에 따라 다르므로 서버에서 직접 확인한다

> **INFO** — Aurora MySQL
>
> Aurora는 `interactive_timeout`과 `wait_timeout` 중 **더 작은 값**으로 모든 idle 세션을 끊는다. 대화형 클라이언트 기준으로 `interactive_timeout`만 넉넉하게 잡아 두면 의도한 효과가 나지 않는다. 두 값을 함께 맞춘다.

---
