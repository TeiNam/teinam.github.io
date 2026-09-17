---
date: 2019-02-18 14:07:23 +0900
title: "PostgreSQL 이란?"
category: postgresql
excerpt: "Postgres 버전 4.2를 기반으로 하는 개체 관계 데이터베이스 관리 시스템 (ORDBMS) 이며, UC 버클리 컴퓨터 공학부에서 개발, 오리지널 버클리 코드에서 유래된 오픈소스 입니다. SQL 표준 지원. 복합쿼리 외래키 트리거 업데이트 가능한 뷰 트랜잭션 무결성 멀티버전..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 백그라운드 프로세스 목록에 stats collector 가 들어 있는데, 누적 통계는 15 에서 공유 메모리로 이동하면서 별도 통계 수집 프로세스가 사라졌다(stats_temp_directory 도 제거). 그 밖의 구조 설명과 work_mem/maintenance_work_mem/temp_buffers 기본값은 그대로 유효하다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

> **전제조건:** PostgreSQL 9.x 이상 환경 기준. 데이터베이스 기초 개념 이해 필요.

Postgres 버전 4.2를 기반으로 하는 개체 관계 데이터베이스 관리 시스템 (ORDBMS) 이며,  
UC 버클리 컴퓨터 공학부에서 개발, 오리지널 버클리 코드에서 유래된 오픈소스입니다.  
SQL 표준을 지원합니다.

- 복합쿼리
- 외래키
- 트리거
- 업데이트 가능한 뷰
- 트랜잭션 무결성
- 멀티버전 동시성 제어

PostgreSQL은 여러 방법으로 확장할 수 있습니다.

- 데이터타입
- 함수
- 연산자
- 집계함수
- 인덱스 메소드
- 프로시저 언어

※ 라이센스가 자유롭기 때문에 누구든 자유롭게 PostgreSQL을 상업적으로 사용, 수정 배포할 수 있습니다.  
단, PostgreSQL은 오픈 소스 프로젝트이기 때문에 장애 발생 및 버그에 대한 처리가 쉽지 않습니다.  
사용자 커뮤니티를 통해 자신의 지식을 기부하고, 메일링 리스트를 통해 다른 사람의 도움을 받아야 합니다.

## 데이터베이스 구조

PostgreSQL의 물리적 구조는 매우 단순합니다. Shared Memory, 적은 수의 백그라운드 프로세스, 데이터 파일로 구성되어 있습니다.

### Shared Memory

#### Shared Buffer

Shared Buffer의 목적은 DISK I/O를 최소화하는 것입니다. 그러기 위해서는 아래 항목을 만족해야 합니다.

- 매우 큰 버퍼를 빠르게 액세스해야 합니다 (수백GB 단위)
- 많은 사용자가 동시에 접근할 때 경합을 최소화해야 합니다
- 자주 사용되는 블록은 최대한 오랫동안 버퍼 내에 있어야 합니다

#### WAL 버퍼

WAL 버퍼는 데이터베이스의 변경 사항을 잠시 저장하는 버퍼입니다. WAL 버퍼 내에 저장된 내용은 정해진 시점에서 WAL 파일로 기록됩니다. 백업 및 복구 관점에서 WAL 파일은 매우 중요하고, 오라클에서 Redo의 개념과 비슷한 부분이 있습니다.

### 프로세스 유형

- Postmaster (Daemon) 프로세스
- Background 프로세스
- Backend 프로세스
- Client 프로세스

#### Postmaster 프로세스

PostgreSQL를 구동할 때 가장 먼저 시작되는 프로세스입니다. 초기 기동 시 복구 작업, Shared Memory 초기화 작업, 백그라운드 프로세스 구동 작업을 수행합니다. 클라이언트 프로세스의 접속 요청이 있을 때 Backend 프로세스를 생성합니다.

#### Background 프로세스

Autovacuum launcher를 제외하면 오라클과 비슷한 백그라운드 프로세스들이 존재합니다.

- `logger`: 에러 메시지를 로그 파일에 기록합니다
- `checkpointer`: 체크포인트 발생 시 dirty 버퍼를 파일에 기록합니다
- `writer`: 주기적으로 dirty 버퍼를 파일에 기록합니다
- `wal writer`: WAL 버퍼 내용을 WAL 파일에 기록합니다
- `autovacuum launcher`: Vacuum이 필요한 시점에 autovacuum worker를 fork 합니다
- `archiver`: Archive Log 모드일 때 WAL 파일을 지정된 디렉토리에 복사합니다
- `stats collector`: 세션 수행 정보 (`pg_stat_activity`)와 테이블 사용 통계 정보 (`pg_stat_all_tables`)와 같은 DBMS 사용 통계 정보를 수집합니다

#### Backend 프로세스

Backend 프로세스의 최대 개수는 `max_connections` 파라미터로 설정 가능하며, 기본값은 100입니다. Backend 프로세스는 사용자 프로세스의 쿼리 요청을 수행한 후 결과를 전송하는 역할을 수행합니다. 쿼리 수행에 몇 가지 메모리 구조가 필요한데, 이것을 통칭해서 로컬 메모리라고 합니다.

**로컬 메모리 관련 주요 파라미터:**

- `work_mem`: 정렬 작업, Bitmap 작업, 해시 조인과 Merge 조인 작업 시에 사용되는 공간. 기본값은 4MB
- `maintenance_work_mem`: Vacuum 및 create index 작업 시에 사용되는 공간. 기본값은 64MB
- `temp_buffers`: Temporary 테이블을 저장하기 위한 공간. 기본값은 8MB
