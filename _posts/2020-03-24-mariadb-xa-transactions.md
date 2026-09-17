---
date: 2020-03-24 12:26:02 +0900
title: "MariaDB의 XA Transactions"
category: mysql
excerpt: "분산 트랜잭션(Distributed Transactions)이란? 글로벌 트랜잭션(Global transaction)이라고도 불리며 여러개의 분산된 리소스들(ex: 프린터 드라이버, 데이터베이스 등) 각각에 대한 트랜잭션들을 하나의 트랜잭션으로 묶은 것을 의미합니다. 이 경우 하나…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — 분산 트랜잭션·2PC·XA 인터페이스 설명과 Internal/External XA 구분은 지금도 유효합니다. 다만 innodb_support_xa 로 XA 를 끄는 방법은 MySQL 8.0 에서 변수 자체가 제거돼 통하지 않으며(MariaDB 최신 버전의 상태는 확인 불가), 엔진 목록은 10.4 시절 기준입니다.

![MariaDB 로고](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

#### 분산 트랜잭션(Distributed Transactions)이란?

글로벌 트랜잭션(Global transaction)이라고도 불리며 여러 개의 분산된 리소스들(예: 프린터 드라이버, 데이터베이스 등) 각각에 대한 트랜잭션들을 하나의 트랜잭션으로 묶은 것을 의미합니다. 이 경우 하나의 리소스가 실패하면 전체를 rollback 합니다.

Distributed Transaction Processing(DTP) 아키텍처는 여러 Application이 Transaction Manager로 여러 다른 Resource Manager가 제공하는 리소스를 공유할 수 있게 해주는 표준 아키텍처 또는 인터페이스를 의미합니다.

#### XA?

XA는 2PC(2 phase commit)를 통한 분산 트랜잭션 처리를 위한 X/Open에서 명시한 표준입니다. XA는 분산 트랜잭션 환경에서 트랜잭션 매니저와 리소스 매니저 사이의 통신을 담당하는 하나의 표준화된 인터페이스를 의미합니다. Oracle, Tibero, DB2 등 벤더사별로 해당 interface에 맞는 동작을 구현해서 제공하고 있습니다. 즉 `xa_open`의 경우 오라클은 내부적으로 oracle server에 connection을 맺는 코드를 구현합니다. Oracle의 분산 트랜잭션은 2PC 방식으로 DB Link를 통해 구현합니다.

![XA 아키텍처 다이어그램](/assets/img/wp/2020/03/xa.png)

글로벌 트랜잭션을 사용하는 응용 프로그램들은 하나 혹은 그 이상의 리소스 매니저(Resource Manager)와 트랜잭션 매니저(Transaction Manager)를 포함합니다.

리소스 매니저는 일반적으로 컴퓨터 혹은 서버의 공유 리소스를 관리하며 트랜잭션 리소스들에 대한 접근을 제공합니다. 공유 리소스의 예시로는 프린터기, Database 등이 있으며 리소스 매니저에는 DBMS가 포함됩니다.

트랜잭션 매니저는 글로벌 트랜잭션의 부분인 트랜잭션 리소스들을 통합(coordination)합니다. 각 리소스 매니저별로 `XID`를 생성하여 transaction 진행을 관리하고 전체 리소스 매니저들의 트랜잭션을 commit 하거나 rollback 하는 기능을 수행합니다. 트랜잭션 매니저는 각각의 트랜잭션을 다루는 리소스 매니저와 정보를 주고받습니다.

글로벌 트랜잭션이 포함하는 개별적인 로컬 트랜잭션을 트랜잭션 브런치(Transaction branches)라고 합니다. 리소스가 DB인 경우 각 branch는 DBMS 내부의 로컬 트랜잭션을 의미하며, 글로벌 트랜잭션과 그 브런치들은 naming scheme에 의해 구별됩니다.

글로벌 트랜잭션을 실행하기 위해서는 2PC(2 phase commit)를 사용합니다. 2PC는 글로벌 트랜잭션의 branch들이 수행하는 action들 뒤에 발생합니다.

- 1st Phase – 모든 트랜잭션 브런치들이 준비가 되는 단계로, 각 트랜잭션 매니저가 데이터베이스 노드에 commit을 하기 위한 prepare 메시지를 보내 commit을 준비하는 단계입니다.
- 2nd Phase – 트랜잭션 매니저가 참여한 모든 데이터베이스 노드로부터 prepare 완료 메시지를 받을 때까지 대기하며, prepare 메시지 중 하나라도 OK가 아니라면 rollback, 모두 OK라면 commit 메시지를 보냅니다.

#### MariaDB에서 XA 구현

MariaDB의 XA 구현은 X/Open CAE 문서인 Distributed transaction processing: XA Specification을 기반으로 구현되어 있습니다.

XA 트랜잭션은 트랜잭션 관리자(애플리케이션)가 여러 리소스를 포함하는 트랜잭션을 제어하는 분산 트랜잭션을 허용하도록 설계되었습니다. 분산 트랜잭션을 허용한다는 것은 여러 개의 분리된 트랜잭션 리소스들이 하나의 글로벌(global) 트랜잭션에 포함되어 하나의 그룹으로 트랜잭션 동작을 하는 것을 의미합니다. 트랜잭션 리소스들은 대부분 RDBMS의 것들이지만 다른 리소스가 될 수도 있습니다.

MariaDB에서 XA 트랜잭션은 이를 지원하는 스토리지 엔진에서만 사용할 수 있습니다. 적어도 InnoDB, TokuDB, SPIDER 및 MyRocks가 지원합니다. InnoDB의 경우 `innodb_support_xa` 서버 시스템 변수를 0으로 설정하여 XA 트랜잭션을 비활성화할 수 있습니다.

MariaDB에서는 쿼리 조회로 스토리지 엔진에 따라 XA 지원 여부를 확인할 수 있습니다.

###### MariaDB 엔진 조회

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

XA 트랜잭션은 일반 트랜잭션과 마찬가지로 액세스하는 테이블에서 Metadata Locks를 발생시킵니다.

하나의 글로벌 트랜잭션은 그 안에서 트랜잭션되는 몇 가지 action들을 포함합니다. 글로벌 트랜잭션은 하나의 그룹으로 성공적으로 Commit되거나, 하나의 그룹으로 rollback됩니다. 이러한 동작을 기반으로 ACID 속성을 "up a level"로 하여 여러 개의 ACID 트랜잭션들이 하나의 글로벌 트랜잭션의 구성원들로서 조화를 이루어 수행됩니다. XA 트랜잭션을 사용하기 위해선 최소 REPEATABLE READ 수준의 격리 레벨을 요구합니다. 그러나 분산 트랜잭션을 사용해야 하는 경우에는 SERIALIZABLE 수준의 격리 레벨을 사용해야 합니다.

- 하나 이상의 XA 트랜잭션을 동시에 시작하려고 하면 1400 오류가 발생합니다 (SQLSTATE 'XAE09').
- 일반 트랜잭션이 적용되는 동안 XA 트랜잭션을 시작하려고 할 때 동일한 오류가 발생합니다.
- XA 트랜잭션이 적용되는 동안 일반 트랜잭션을 시작하려고 하면 1399 오류 (SQLSTATE 'XAE07')가 발생합니다.
- XA 트랜잭션이 유효한 경우 일반 트랜잭션에 대해 내재된 COMMIT를 발생시키는 명령문은 1400 오류 (SQLSTATE 'XAE09')를 생성합니다.

#### Internal XA vs External XA

XA 트랜잭션은 MariaDB에서 오버로드된 용어입니다. 스토리지 엔진이 XA를 지원하는 경우 다음 중 하나 또는 둘 다를 의미할 수 있습니다.

- MariaDB의 내부 2단계 커밋 API를 지원합니다. 이것은 사용자에게 투명성을 보장합니다. MariaDB의 internal transaction coordinator log가 이러한 트랜잭션 조정을 처리할 수 있기 때문에 이를 "Internal XA"라고 합니다.
- XA START, XA PREPARE, XA COMMIT 등과 같은 XA 트랜잭션을 지원합니다. 이 기능을 올바르게 사용하려면 external transaction coordinator를 사용해야 하기 때문에 이를 "External XA"라고 합니다.

#### Transaction Coordinator Log

두 개 이상의 XA 지원 가능한 스토리지 엔진이 사용 가능한 경우 Transaction Coordinator Log를 사용할 수 있어야 합니다.  
Transaction Coordinator Log에는 두 가지 구현 방식이 있습니다.

- 이진 로그 기반 Transaction Coordinator Log
- 메모리 매핑된 파일 기반 Transaction Coordinator Log

서버에서 이진 로그가 활성화된 경우 서버는 이진 로그 기반 트랜잭션 코디네이터 로그를 사용합니다. 그렇지 않으면 메모리 매핑된 파일 기반 트랜잭션 코디네이터 로그를 사용합니다.

#### XA function

XA의 c언어 interface는 아래와 같습니다.

| 함수 | 설명 |
| --- | --- |
| `xa_open` | 리소스 매니저(Resource Manager)에 접속한다. |
| `xa_close` | 리소스 매니저에서 데이터베이스 접속을 해제한다. |
| `xa_start` | `XID` 값을 주고 새로운 트랜잭션을 시작하거나, 이미 존재하는 트랜잭션에 현재 프로세스를 연결한다. |
| `xa_end` | `XID`의 TX에서 현재 프로세스를 분리한다. |
| `xa_rollback` | `XID`의 TX를 롤백한다. |
| `xa_prepare` | `XID`의 TX에 대한 커밋을 준비한다. Two-phase commit의 First Phase이다. |
| `xa_commit` | `XID`의 TX에 대한 커밋을 완료한다. Two-phase commit의 Second Phase이다. |
| `xa_recover` | prepare 상태인 트랜잭션의 목록을 검사하여 커밋이나 롤백을 수행한다. |
| `xa_forget` | `XID`의 TX가 이미 처리된 경우 로그 기록을 삭제한다. |

#### Galera Cluster에서 이슈

MariaDB Galera Cluster는 XA 트랜잭션을 지원하지 않습니다. 그러나 MariaDB Galera Cluster 빌드에는 wsrep이라는 내장 플러그인이 포함되어 있습니다. MariaDB 10.4.3 이전에는 이 플러그인이 내부적으로 XA 가능 스토리지 엔진으로 간주되었습니다. MariaDB Galera Cluster에서는 실제 XA를 지원하는 스토리지 엔진이 InnoDB뿐이지만, external XA transaction 지원을 통해 XA 트랜잭션이 가능한 경우도 있습니다.
