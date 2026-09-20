---
date: 2020-03-24 12:26:02 +0900
title: "MariaDB의 XA Transactions"
category: mysql
excerpt: "여러 리소스에 걸친 트랜잭션을 하나로 묶는 분산 트랜잭션과 그 표준 인터페이스인 XA, 그리고 MariaDB 가 XA 를 어떻게 구현하고 어떤 제약을 두는지 정리합니다."
updated: 2026-09-20
---

## 분산 트랜잭션이란

글로벌 트랜잭션(Global transaction)이라고도 부릅니다. 여러 개의 분산된 리소스(예: 프린터 드라이버, 데이터베이스) 각각에 대한 트랜잭션을 하나의 트랜잭션으로 묶은 것입니다. 이 경우 리소스 하나가 실패하면 전체를 rollback 합니다.

Distributed Transaction Processing(DTP) 아키텍처는 여러 애플리케이션이 트랜잭션 매니저를 거쳐 서로 다른 리소스 매니저가 제공하는 리소스를 공유하게 해 주는 표준 아키텍처를 뜻합니다.

## XA 표준

XA 는 2PC(2 phase commit)로 분산 트랜잭션을 처리하기 위해 X/Open 이 명시한 표준입니다. 분산 트랜잭션 환경에서 트랜잭션 매니저와 리소스 매니저 사이의 통신을 담당하는 표준화된 인터페이스를 가리킵니다. Oracle, Tibero, DB2 같은 벤더가 이 인터페이스에 맞는 구현을 제공합니다.

{% include diagram.html src="xa-architecture.svg" caption="X/Open DTP 아키텍처. 애플리케이션이 트랜잭션 매니저를 거쳐 여러 리소스 매니저와 XA 인터페이스로 통신합니다." %}

글로벌 트랜잭션을 사용하는 응용 프로그램은 하나 혹은 그 이상의 리소스 매니저(Resource Manager)와 트랜잭션 매니저(Transaction Manager)를 포함합니다.

리소스 매니저는 일반적으로 컴퓨터 혹은 서버의 공유 리소스를 관리하며 트랜잭션 리소스에 대한 접근을 제공합니다. 공유 리소스의 예로는 프린터, 데이터베이스가 있고 리소스 매니저에는 DBMS 가 포함됩니다.

트랜잭션 매니저는 글로벌 트랜잭션의 일부인 트랜잭션 리소스들을 통합(coordination)합니다. 각 리소스 매니저별로 `XID` 를 생성해 트랜잭션 진행을 관리하고, 전체 리소스 매니저의 트랜잭션을 commit 하거나 rollback 합니다. 그 과정에서 각각의 트랜잭션을 다루는 리소스 매니저와 정보를 주고받습니다.

글로벌 트랜잭션에 포함된 개별 로컬 트랜잭션을 트랜잭션 브랜치(transaction branch)라고 합니다. 리소스가 DB 라면 각 브랜치는 DBMS 내부의 로컬 트랜잭션이고, 글로벌 트랜잭션과 그 브랜치들은 naming scheme 으로 구별합니다.

글로벌 트랜잭션을 실행할 때는 2PC 를 사용합니다. 2PC 는 글로벌 트랜잭션의 브랜치들이 수행하는 action 뒤에 일어납니다.

- 1st Phase — 모든 트랜잭션 브랜치가 준비되는 단계입니다. 트랜잭션 매니저가 각 데이터베이스 노드에 prepare 를 요청하고, 노드는 commit 을 준비하지만 변경을 적용하지는 않습니다.
- 2nd Phase — 트랜잭션 매니저가 참여한 모든 노드의 prepare 응답을 기다립니다. 하나라도 실패하면 rollback, 모두 성공하면 commit 을 보내 변경을 확정합니다.

## MariaDB 의 XA 구현

MariaDB 의 XA 구현은 X/Open CAE 문서인 Distributed Transaction Processing: The XA Specification 을 기반으로 합니다.

XA 트랜잭션은 트랜잭션 매니저(애플리케이션)가 여러 리소스를 포함하는 트랜잭션을 제어하는 분산 트랜잭션을 위해 설계됐습니다. 분리된 여러 트랜잭션 리소스가 하나의 글로벌 트랜잭션에 묶여 한 그룹으로 동작한다는 뜻입니다. 트랜잭션 리소스는 대부분 RDBMS 지만 다른 종류일 수도 있습니다.

MariaDB 에서 XA 트랜잭션은 이를 지원하는 스토리지 엔진에서만 쓸 수 있습니다. 공식 문서는 적어도 InnoDB, SPIDER, MyRocks 가 지원한다고 적습니다.

예전에는 `innodb_support_xa` 를 0 으로 설정해 InnoDB 의 XA 지원을 끌 수 있었습니다. 이 변수는 MariaDB 10.2 에서 deprecated 됐고 10.3.0 에서 제거됐으므로, 지금은 XA 가 항상 지원되며 끄는 방법이 없습니다. 이 변수가 켜져 있을 때 보장하던 것, 즉 바이너리 로그에 기록되는 순서를 실제 데이터베이스 변경 순서와 일치시키는 동작은 복제와 재해 복구의 전제라서 이제 조건 없이 적용됩니다.

이 글이 언급하는 10.4 와 10.5 는 각각 2024년 6월과 2025년 6월에 커뮤니티 지원이 끝났습니다. 현재 유지되는 LTS 계열은 10.11, 11.4, 11.8, 12.3 이고 그 위로 분기 단위 롤링 릴리스인 13.x 가 있습니다.

XA 트랜잭션도 일반 트랜잭션처럼 접근한 테이블에 Metadata Lock 을 겁니다.

하나의 글로벌 트랜잭션은 그 안에서 트랜잭션되는 여러 action 을 포함하며, 한 그룹으로 commit 되거나 한 그룹으로 rollback 됩니다. 덕분에 여러 ACID 트랜잭션이 하나의 글로벌 트랜잭션의 구성원으로 묶여, ACID 보장이 개별 트랜잭션보다 한 단계 위에서 성립합니다. XA 트랜잭션은 최소 REPEATABLE READ 격리 수준을 요구하고, 공식 문서는 분산 트랜잭션에는 SERIALIZABLE 을 쓰라고 권합니다.

상태가 맞지 않을 때 나오는 오류는 다음과 같습니다.

- XA 트랜잭션을 동시에 두 개 이상 시작하려 하면 1400 오류(SQLSTATE 'XAE09')가 납니다.
- 일반 트랜잭션이 유효한 동안 XA 트랜잭션을 시작해도 같은 오류가 납니다.
- XA 트랜잭션이 유효한 동안 일반 트랜잭션을 시작하려 하면 1399 오류(SQLSTATE 'XAE07')가 납니다.
- 일반 트랜잭션에서 내재적 COMMIT 을 유발하는 문장은 XA 트랜잭션이 유효할 때 1400 오류(SQLSTATE 'XAE09')를 냅니다. 대체로 DDL 이 여기 해당하며 `SHUTDOWN` 만 예외입니다.

### 스토리지 엔진의 XA 지원 확인

엔진별 XA 지원 여부는 쿼리로 확인할 수 있습니다.

```sql
MariaDB [(none)]> SELECT engine, support, transactions, xa FROM information_schema.engines;
+--------------------+---------+--------------+------+
| engine             | support | transactions | xa   |
+--------------------+---------+--------------+------+
| SPIDER             | YES     | YES          | NO   |
| MRG_MyISAM         | YES     | NO           | NO   |
| MEMORY             | YES     | NO           | NO   |
| Aria               | YES     | NO           | NO   |
| MyISAM             | YES     | NO           | NO   |
| SEQUENCE           | YES     | YES          | NO   |
| InnoDB             | DEFAULT | YES          | YES  |
| PERFORMANCE_SCHEMA | YES     | NO           | NO   |
| CSV                | YES     | NO           | NO   |
+--------------------+---------+--------------+------+
```

출력은 그 서버에 설치되고 활성화된 엔진 구성에 따라 달라지므로, 판단은 자신의 서버에서 조회한 결과로 합니다.

## XA 구문과 상태 전이

SQL 수준 인터페이스는 `XA` 로 시작하는 문장들입니다.

```sql
XA {START|BEGIN} xid [JOIN|RESUME]
XA END xid [SUSPEND [FOR MIGRATE]]
XA PREPARE xid
XA COMMIT xid [ONE PHASE]
XA ROLLBACK xid
XA RECOVER [FORMAT=['RAW'|'SQL']]
```

각 문장은 트랜잭션의 상태를 바꾸고, 상태가 그다음에 할 수 있는 동작을 결정합니다.

{% include diagram.html src="xa-states.svg" caption="XA 문장과 상태 전이. PREPARED 만 영속 상태이고, IDLE 에서는 PREPARE 를 건너뛰는 1-phase 경로가 열려 있습니다." %}

| 문장 | 상태 전이 |
| --- | --- |
| `XA START xid` | `NON-EXISTING` → `ACTIVE` |
| `XA END xid` | `ACTIVE` → `IDLE` |
| `XA PREPARE xid` | `IDLE` → `PREPARED` |
| `XA COMMIT xid` | `PREPARED` → 종료 |
| `XA COMMIT xid ONE PHASE` | `IDLE` → 종료 |
| `XA ROLLBACK xid` | `IDLE` 또는 `PREPARED` → 종료 |
| `XA RECOVER` | 전이 없음, `PREPARED` 목록 조회 |

존재하지 않는 트랜잭션은 `NON-EXISTING` 상태입니다. 현재 상태에서 허용되지 않는 문장을 실행하면 1399 오류(XAE07, `XAER_RMFAIL`)가 나면서 어떤 상태였는지 알려 줍니다.

`JOIN` 과 `RESUME` 키워드는 1398 오류(XAE05, `XAER_INVAL`)를 냅니다. 예외가 하나 있습니다. `XA END xid` 바로 뒤에 같은 `xid` 로 `XA START xid RESUME` 을 실행하면 `XA END` 를 되돌려 `IDLE` 에서 `ACTIVE` 로 돌아갑니다. `XA END` 의 `SUSPEND [FOR MIGRATE]` 는 아무 효과가 없습니다.

`XA PREPARE` 로 넘어간 트랜잭션은 영속적으로 저장되어 접속 종료와 서버 크래시를 견디며, 명시적으로 commit 하거나 rollback 해야 사라집니다.

> **WARNING** — MariaDB 10.5 부터 `XA PREPARE` 는 XA 명세대로 트랜잭션을 영속화합니다. 그 이전에는 클라이언트가 접속을 끊으면 prepared 트랜잭션이 자동으로 rollback 됐습니다. 다만 서버가 크래시되거나 kill 된 경우에는 rollback 되지 않아 XA 보장을 어겼고, 다른 XA 참여자가 이미 commit 을 확정한 상태라면 데이터가 어긋날 수 있었습니다. 접속이 끊기면 rollback 되기를 기대하는 애플리케이션은 10.5 이상에서 트랜잭션이 `PREPARED` 상태로 계속 남습니다. 그런 동작이 필요하면 XA 대신 일반 트랜잭션을 쓰는 편이 낫습니다.

### xid 의 구성

`xid` 는 세 부분으로 나뉘고 첫 번째만 필수입니다.

| 구성 요소 | 의미 |
| --- | --- |
| `gtrid` | 글로벌 트랜잭션 식별자, 인용된 문자열 |
| `bqual` | 로컬 트랜잭션 식별자, 인용된 문자열 |
| `formatID` | 앞 두 값의 형식을 나타내는 부호 없는 정수, 생략하면 1 |

MariaDB 는 이 값들을 해석하지 않고 트랜잭션을 식별하는 데만 씁니다. 유효한 트랜잭션들의 `xid` 는 서로 달라야 합니다. 공식 문서는 `gtrid` 와 `bqual` 의 길이 상한을 적어 두지 않았습니다.

### 2PC 실행과 복구

```sql
XA START 'test';
INSERT INTO t VALUES (1,2);
XA END 'test';
XA PREPARE 'test';
XA COMMIT 'test';
```

`XA COMMIT 'test' ONE PHASE` 를 쓰면 `XA PREPARE` 없이 `IDLE` 상태에서 1-phase commit 을 합니다.

`XA RECOVER` 는 `PREPARED` 상태인 트랜잭션을 `formatID`, `gtrid_length`, `bqual_length`, `data` 네 칼럼으로 보여 줍니다. 어느 커넥션이 만들었는지는 가리지 않지만, 다른 커넥션이 시작한 트랜잭션을 commit 하거나 rollback 할 수는 없습니다. 1-phase commit 트랜잭션은 `PREPARED` 를 거치지 않으므로 목록에 나타나지 않습니다. 트랜잭션 코디네이터가 만든 이진 `xid` 는 `XA RECOVER FORMAT='SQL'` 로 조회하면 `XA COMMIT` 이나 `XA ROLLBACK` 에 그대로 붙여 쓸 수 있는 형태로 나옵니다.

## Internal XA 와 External XA

XA 트랜잭션은 MariaDB 에서 중의적으로 쓰이는 용어입니다. 스토리지 엔진이 XA 를 지원한다고 할 때 다음 중 하나 또는 둘 다를 뜻할 수 있습니다.

- MariaDB 의 내부 2단계 커밋 API 를 지원합니다. 사용자에게는 드러나지 않습니다. MariaDB 의 internal transaction coordinator log 가 이런 트랜잭션의 조정을 처리할 수 있어 "Internal XA" 라고 부릅니다.
- `XA START`, `XA PREPARE`, `XA COMMIT` 같은 문장을 지원합니다. 이 기능을 제대로 쓰려면 외부 트랜잭션 코디네이터가 필요해서 "External XA" 라고 부릅니다.

## Transaction Coordinator Log

XA 가능 스토리지 엔진이 두 개 이상 활성화돼 있으면 Transaction Coordinator Log 를 쓸 수 있어야 합니다. 구현은 두 가지입니다.

- 이진 로그 기반 Transaction Coordinator Log
- 메모리 매핑된 파일 기반 Transaction Coordinator Log

서버에서 이진 로그가 활성화돼 있으면 이진 로그 기반 코디네이터 로그를, 그렇지 않으면 메모리 매핑된 파일 기반 코디네이터 로그를 사용합니다.

## XA 인터페이스 함수

XA 의 C 언어 인터페이스는 아래와 같습니다.

| 함수 | 설명 |
| --- | --- |
| `xa_open` | 리소스 매니저(Resource Manager)에 접속합니다. |
| `xa_close` | 리소스 매니저에서 데이터베이스 접속을 해제합니다. |
| `xa_start` | `XID` 값을 주고 새 트랜잭션을 시작하거나, 이미 있는 트랜잭션에 현재 프로세스를 연결합니다. |
| `xa_end` | `XID` 의 트랜잭션에서 현재 프로세스를 분리합니다. |
| `xa_rollback` | `XID` 의 트랜잭션을 롤백합니다. |
| `xa_prepare` | `XID` 의 트랜잭션에 대한 커밋을 준비합니다. 2PC 의 first phase 입니다. |
| `xa_commit` | `XID` 의 트랜잭션에 대한 커밋을 완료합니다. 2PC 의 second phase 입니다. |
| `xa_recover` | prepare 상태인 트랜잭션 목록을 검사해 커밋이나 롤백을 수행합니다. |
| `xa_forget` | `XID` 의 트랜잭션이 이미 처리된 경우 로그 기록을 삭제합니다. |

## Galera Cluster 에서의 제약

MariaDB Galera Cluster 는 XA 트랜잭션을 지원하지 않습니다. 그런데 Galera Cluster 빌드에는 `wsrep` 이라는 내장 플러그인이 들어 있고, MariaDB 10.4.3 이전에는 이 플러그인이 내부적으로 XA 가능 스토리지 엔진으로 취급됐습니다. 그래서 external XA 를 실제로 지원하는 엔진은 InnoDB 뿐인데도 XA 가능 엔진이 둘 이상인 상태가 되어, 서버가 기본적으로 트랜잭션 코디네이터 로그를 쓰도록 강제됐고 성능에 영향을 줄 수 있었습니다.

10.4.3 부터 `wsrep` 은 복제 플러그인으로 바뀌어 XA 가능 스토리지 엔진으로 취급되지 않고, 코디네이터 로그를 강제하지도 않습니다. 현재 지원되는 계열은 모두 10.4.3 보다 새로우므로 이 성능 부담은 남아 있지 않습니다.
