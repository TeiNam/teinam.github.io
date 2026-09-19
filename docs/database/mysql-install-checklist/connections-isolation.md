---
title: "커넥션과 격리 수준"
permalink: /docs/database/mysql-install-checklist/connections-isolation/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 커넥션과 격리 수준"
updated: 2026-09-19
guide: mysql-install-checklist
order: 8
nav_title: "커넥션과 격리"
---

동시에 몇 개의 커넥션을 받고, 트랜잭션이 서로의 변경을 어디까지 보게 할지 정하는 절이다. 커넥션 한도는 OS 파일 디스크립터 한도와 함께 올려야 실제로 적용된다. 격리 수준은 기동 옵션 `--transaction-isolation` 이나 `SET TRANSACTION` 으로 정한다.

### 커넥션

`max_connections` 의 기본값은 공식 문서 안에서도 표기가 엇갈린다. 숫자를 외워 두는 대신 운영할 서버에서 직접 조회한다.

```sql
SELECT @@GLOBAL.max_connections;
```

- 서버는 실제로 `max_connections + 1` 개의 클라이언트 커넥션을 허용한다. 여분 한 자리는 `CONNECTION_ADMIN` 권한(또는 deprecated 된 `SUPER`)을 가진 계정 몫이다. 커넥션이 포화된 상태에서 관리자가 접속할 때 이 자리를 쓴다.
- `max_connections` 를 올리면 `mysqld` 가 필요한 파일 디스크립터 수도 늘어난다. **필요한 개수를 확보하지 못하면 서버가 `max_connections` 값을 낮춘다.** OS 한도와 `open_files_limit` 을 함께 올려야 설정한 값이 실제로 적용된다.
- 한계를 정하는 요소는 스레드 라이브러리 품질, 전체 RAM, 커넥션당 RAM, 워크로드, 목표 응답시간, 파일 디스크립터 수다. 문서는 Linux 나 Solaris 가 통상 500~1000 개의 동시 접속을, RAM 이 넉넉하고(문서 표현은 "many gigabytes of RAM") 커넥션당 부하가 낮으면 10,000 개까지 감당한다고 적는다.
- 한도를 넘기면 `Connection_errors_max_connections` 상태 변수가 늘고 `Too many connections` 에러가 난다.
- `thread_cache_size` 는 기동 시 서버가 값을 자동 산정하며, 명시 설정으로 덮어쓸 수 있다. `0` 은 캐싱을 비활성화한다. 관측은 `Threads_cached` 와 `Threads_created` 로 한다.
- `wait_timeout` 은 `28800`(8시간)이다. 아무 일도 없으면 서버가 8시간 후 커넥션을 닫고, 그 뒤 클라이언트는 `MySQL server has gone away` 를 본다. `interactive_timeout` 은 대화형 세션에 같은 역할을 한다. 두 값은 `SHOW VARIABLES LIKE '%timeout%';` 로 확인한다.
- 문서가 제시하는 대응은 두 가지다. 마지막 쿼리 후 오래 지났으면 `mysql_ping()` 으로 확인하거나, `wait_timeout` 을 실질적으로 만료되지 않을 값으로 두는 것이다. 커넥션 풀 크기 산정에 대한 공식 권고는 문서에 없다.
- `max_allowed_packet` 기본값은 64MB 다.

### 격리 수준

- **InnoDB 의 기본 격리 수준은 `REPEATABLE READ`** 다. 기동 옵션 `--transaction-isolation` 이나 `SET TRANSACTION` 으로 바꾼다. 현재 값은 `SELECT @@GLOBAL.transaction_isolation;` 으로 확인한다.
- `REPEATABLE READ` — 같은 트랜잭션 안의 일관된 읽기는 첫 읽기가 만든 스냅샷을 본다. 락킹 읽기와 `UPDATE`·`DELETE` 는 유니크 인덱스에 유니크 검색 조건일 때 찾은 인덱스 레코드만 잠그고 그 앞의 갭은 잠그지 않는다. 그 밖의 조건일 때는 스캔한 인덱스 범위를 갭 락이나 넥스트키 락으로 잠근다.
- `READ COMMITTED` — 같은 트랜잭션 안에서도 각 일관된 읽기가 자기만의 새 스냅샷을 만든다. 인덱스 레코드만 잠그고 앞의 갭은 잠그지 않으며, 갭 락은 외래 키 제약 검사와 중복 키 검사에만 쓰인다. 갭 락이 없으므로 **팬텀 행 문제가 생길 수 있다.** 조건에 맞지 않는 행의 락을 바로 풀어 데드락 확률을 크게 낮추지만 없어지지는 않는다. `UPDATE` 는 semi-consistent read 를 쓴다.
- 복제 제약이 있다. **`READ COMMITTED` 에서는 행 기반 바이너리 로깅만 지원된다.** `binlog_format=MIXED` 와 함께 쓰면 서버가 자동으로 행 기반 로깅을 쓴다.
- 문서가 적는 선택 기준은 ACID 준수가 중요한 핵심 데이터 작업에는 기본값 `REPEATABLE READ` 로 높은 일관성을 강제하고, 대량 리포팅 같은 상황에서는 `READ COMMITTED` 로 일관성 규칙을 완화하는 것이다. "`READ COMMITTED` 를 권장한다"는 문장은 공식 문서에 없다.
- 하나의 `REPEATABLE READ` 트랜잭션에서 락킹 문장과 비락킹 문장을 섞지 않는다. 그런 경우에는 보통 `SERIALIZABLE` 이 필요하다.
