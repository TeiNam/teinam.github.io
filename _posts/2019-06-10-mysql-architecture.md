---
date: 2019-06-10 01:03:48 +0900
title: "MySQL 아키텍쳐"
category: mysql
excerpt: "MySQL 아키텍쳐 MySQL은 크게 “MySQL” 엔진과 “스토리지 엔진”으로 구성 되어 있습니다. MySQL 엔진은 클라이언트의 접속 및 쿼리 요청을 처리하는 커넥션 핸들러와 SQL 파서와 전처리기, 그리고 쿼리의 최적환된 실행을 위한 옵티마이저가 중심을 이루고 있습니다. 성능…"
updated: 2026-09-17
---

![MySQL 로고](/assets/img/wp/2019/04/mysql_PNG19.png)

**MySQL 아키텍쳐**

MySQL은 크게 MySQL 엔진과 스토리지 엔진으로 구성되어 있습니다.

![MySQL 아키텍처 다이어그램: 파서·옵티마이저·스토리지 엔진 계층 구조](/assets/img/wp/2019/06/PSEA_diagram.jpg)

MySQL 엔진은 클라이언트의 접속 및 쿼리 요청을 처리하는 커넥션 핸들러, SQL 파서와 전처리기, 그리고 쿼리의 최적화된 실행을 위한 옵티마이저가 중심을 이룹니다. InnoDB의 Buffer Pool 같은 보조 저장소 기능을 제공합니다. MySQL은 표준 SQL(ANSI SQL-92) 문법을 지원하기 때문에 표준 문법으로 작성된 쿼리는 타 DBMS와 호환됩니다. 일반 RDBMS에서 제공하는 대부분의 접근법을 모두 지원합니다. C API, JDBC, ODBC, .NET의 표준 드라이버를 제공하므로 C/C++, PHP, JAVA, Python 등 모든 언어로 MySQL 서버에서 쿼리를 사용할 수 있습니다.

MySQL은 스토리지 엔진을 플러그인 방식으로 사용하는 구조를 가지므로 사용자가 필요에 따라 원하는 스토리지 엔진으로 DB를 구성할 수 있습니다. 5.5 버전 이후 InnoDB를 가장 많이 사용하며, 그 전에는 MyISAM 스토리지 엔진을 많이 사용했습니다. MySQL 엔진이 SQL을 분석하거나 최적화하고 DB의 두뇌처럼 동작한다면, 스토리지 엔진은 실제 데이터를 디스크 스토리지에 저장하거나 디스크에서 읽어오는 일을 담당합니다. MySQL 엔진은 하나이지만 스토리지 엔진은 동시에 여러 개를 사용할 수 있으며, 테이블이 사용할 스토리지 엔진을 지정하여 해당 테이블의 읽기/쓰기 동작을 정의한 스토리지 엔진으로 처리합니다. MySQL 엔진이 스토리지 엔진에 읽기/쓰기 요청을 할 때 핸들러 요청을 하는데, 핸들러 API로 MySQL 엔진과 스토리지 엔진 사이에서 데이터를 주고받습니다.

**MySQL Thread**

MySQL은 프로세스 기반이 아니라 스레드 기반으로 작동하며, 크게 Foreground Thread와 Background Thread로 구분합니다.

**Foreground Thread (Client Thread)** – Foreground Thread는 MySQL 서버에 접속한 클라이언트 수만큼 존재하며, 주로 각 클라이언트 사용자가 요청하는 쿼리를 처리합니다. 사용자가 작업을 마치고 세션이 종료되면 해당 스레드는 Thread Pool(캐시)로 돌아갑니다. 이때 이미 스레드 캐시에 일정 개수 이상의 대기 중인 스레드가 있으면 스레드 캐시에 넣지 않고 스레드를 종료시켜 일정 개수의 스레드만 캐시에 존재하게 합니다. 데이터를 MySQL의 데이터 버퍼 또는 캐시로부터 가져오며, 버퍼나 캐시에 없는 경우에는 직접 디스크의 데이터나 인덱스로부터 데이터를 읽어와서 작업을 처리합니다. MyISAM 테이블은 디스크 쓰기 작업까지 Foreground Thread가 처리하지만, InnoDB 테이블은 데이터 버퍼나 캐시까지만 Foreground Thread가 처리하고, 버퍼에서 디스크로 기록하는 작업은 Background Thread가 처리합니다.

**Background Thread** – MySQL의 스토리지 엔진 중 InnoDB에서는 많은 작업이 Background Thread에서 처리됩니다. Insert Buffer를 병합하는 스레드, 로그를 디스크로 기록하는 스레드, InnoDB Buffer Pool의 데이터를 디스크에 기록하는 스레드, 데이터를 버퍼로 가져오는 스레드, Lock이나 Deadlock을 모니터링하는 스레드, 이런 멀티스레드를 총괄하는 메인 스레드 등이 있습니다. InnoDB의 Background Thread는 멀티스레드 방식으로 동작하며, 성능 향상을 위해 스레드별로 역할이 나뉘어져 있습니다. 데이터를 읽는 작업은 주로 Foreground Thread에서 이루어지기 때문에 Read Thread의 개수를 지정하는 `innodb_read_io_threads`의 값을 크게 설정할 필요는 없으나, Write Thread는 많은 작업을 처리하기 때문에 내장 Disk의 경우 `innodb_write_io_threads`의 값을 2~4, 성능이 좋은 SAN 스토리지나 SSD를 이용하는 경우 4 이상으로 설정하여 저장 장치를 충분히 활용하는 것이 좋습니다.

**Memory 할당 및 사용 구조**

MySQL에서 사용되는 메모리 공간은 크게 글로벌 메모리 영역과 로컬 메모리 영역으로 구분합니다. 글로벌 메모리 영역은 MySQL 데몬이 실행되면 무조건 OS로부터 할당받습니다. cnf 파일에 설정해 둔 파라미터 값만큼 할당받는다고 보면 됩니다.

글로벌 메모리 영역 – 일반적으로 클라이언트 스레드와 무관하게 하나의 메모리 공간만 할당되며, 필요에 따라 2개 이상의 공간을 할당받을 수도 있습니다. 글로벌 영역의 개수와 상관없이 모든 스레드에 의해 공유되는 영역입니다.

로컬 메모리 영역 – 세션 메모리 영역이라고 하며, MySQL 서버상에 존재하는 클라이언트 스레드가 쿼리를 처리하는 데 사용하는 메모리 영역입니다. Connection 버퍼, Sort 버퍼, Result 버퍼, Read 버퍼, Join 버퍼, 랜덤 Read 버퍼 등이 있습니다. 각 클라이언트 스레드별로 독립적으로 할당되며, 공유되어 사용되지 않습니다. 세션이 활성화된 동안 계속 열려 있는 Connection 버퍼처럼 계속 사용되는 공간이 있고, 반대로 Sort 버퍼나 Join 버퍼의 경우 쿼리가 실행될 때만 공간을 할당했다가 완료되면 할당된 공간을 반환합니다.

**플러그인 스토리지 엔진**

MySQL의 가장 독특한 구조가 스토리지 엔진의 플러그인 모델입니다. 스토리지 엔진뿐만 아니라 전문 검색 엔진을 위한 Parser도 플러그인 형태로 사용할 수 있습니다. MySQL 엔진이 스토리지 엔진을 조정하기 위해 사용하는 것이 위에 설명한 핸들러입니다. 스토리지 엔진 중 무엇을 사용하느냐에 따라 성능 차이가 발생하기도 하고, 용도에 따라 데이터를 읽고 쓰는 데 있어서 작업 처리 방식이 많이 달라집니다.

```sql
MariaDB [(none)]> show engines;
+--------------------+---------+---------------------+--------------+------+------------+
| Engine             | Support | Comment             | Transactions | XA   | Savepoints |
+--------------------+---------+---------------------+--------------+------+------------+
| MRG_MyISAM         | YES     | Collection of id... | NO           | NO   | NO         |
| CSV                | YES     | Stores tables as... | NO           | NO   | NO         |
| MEMORY             | YES     | Hash based, stor... | NO           | NO   | NO         |
| MyISAM             | YES     | Non-transactiona... | NO           | NO   | NO         |
| Aria               | YES     | Crash-safe table... | NO           | NO   | NO         |
| InnoDB             | DEFAULT | Supports transac... | YES          | YES  | YES        |
| PERFORMANCE_SCHEMA | YES     | Performance Sche... | NO           | NO   | NO         |
| SEQUENCE           | YES     | Generated tables... | YES          | NO   | YES        |
+--------------------+---------+---------------------+--------------+------+------------+
```

Support 컬럼을 보면 현재 DB에 포함된 스토리지 엔진은 YES라고 나옵니다. DEFAULT의 경우 옵션을 주지 않고 테이블이나 DB를 생성했을 때 사용하는 기본 스토리지 엔진입니다. 5.5 버전 이후에는 기본값으로 InnoDB를 사용합니다. 원하는 스토리지 엔진이 없는 경우에는 플러그인 형태로 빌드된 스토리지 엔진 라이브러리를 내려받아서 넣으면 사용할 수 있습니다.
