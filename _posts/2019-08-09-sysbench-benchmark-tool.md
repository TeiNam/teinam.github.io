---
date: 2019-08-09 00:30:17 +0900
title: "Sysbench : MariaDB, MySQL, PostgreSQL Benchmark Tool."
category: database
excerpt: "sysbench 는 MySQL·MariaDB·PostgreSQL 과 CPU·메모리·파일 I/O 성능을 함께 측정하는 벤치마크 도구이고, 최신 릴리스는 2020년 4월에 나온 1.0.20 입니다."
last_modified_at: 2026-09-20
---

## Sysbench란?

시스템과 데이터베이스 성능을 함께 측정하는 벤치마크 도구입니다. MySQL 내부 프로젝트로 시작해 Lua 스크립트를 지원하는 0.5 까지 나왔다가 오랜 기간 개발이 멈췄고, 2016년에 다시 개발이 시작되어 1.0 계열로 이어졌습니다. 최신 릴리스는 2020년 4월 24일에 나온 1.0.20 이고 그 뒤로 새 릴리스는 없습니다. 저장소 개발 브랜치의 버전은 1.1.0 이지만 정식 릴리스로 나오지 않았으므로, 지금 설치해서 쓰는 것은 사실상 1.0.20 입니다. 이 글의 옵션과 기본값은 모두 1.0.20 기준입니다.

데이터베이스 벤치마크용 `oltp_*` Lua 스크립트 외에 파일시스템(`fileio`), CPU(`cpu`), 메모리(`memory`), 스레드 스케줄러(`threads`), POSIX 뮤텍스(`mutex`) 벤치마크가 내장되어 있습니다. 데이터베이스 드라이버는 `--db-driver` 로 고르고, 공식 빌드 옵션이 제공하는 것은 MySQL 과 PostgreSQL 입니다. MariaDB 는 MySQL 드라이버로 접속합니다. 오라클 쪽에서는 Swingbench 를 많이 쓰고, MySQL 계열에서는 sysbench 와 DBT2(<https://dev.mysql.com/downloads/benchmarks.html>) 를 씁니다.

## 설치

패키지 저장소를 추가하는 설치 스크립트가 공식 문서에 나와 있습니다.

> **WARNING** — `curl | sudo bash` 는 내려받은 스크립트를 검증 없이 root 권한으로 실행합니다. 스크립트를 파일로 저장해 내용을 확인한 뒤 실행하는 편이 안전합니다.

Debian·Ubuntu 계열은 deb 스크립트를 씁니다.

```bash
curl -s https://packagecloud.io/install/repositories/akopytov/sysbench/script.deb.sh | sudo bash
sudo apt -y install sysbench
```

RHEL·CentOS·Fedora 계열은 rpm 스크립트를 씁니다. 패키지 관리자가 `yum` 인 배포판에서는 `dnf` 자리에 `yum` 을 씁니다.

```bash
curl -s https://packagecloud.io/install/repositories/akopytov/sysbench/script.rpm.sh | sudo bash
sudo dnf -y install sysbench
```

> **NOTE** — packagecloud 저장소에 올라온 가장 새 빌드는 1.0.20-1 이고, 대상 배포판은 Debian jessie~buster, Ubuntu xenial~focal, Fedora 29~31, Enterprise Linux 7~8 까지입니다. 그보다 새 배포판에서는 이 저장소를 추가해도 설치할 패키지가 없으므로 배포판 자체 저장소나 소스 빌드를 씁니다.

배포판 저장소도 같은 1.0.20 을 담고 있어서, 최신 릴리스를 놓치지 않으면서 설치가 더 간단합니다.

| 저장소 | 설치 명령 | 제공 버전 |
| --- | --- | --- |
| Debian trixie | `apt install sysbench` | 1.0.20+ds-7 |
| Fedora 43~45 | `dnf install sysbench` | 1.0.20 |
| EPEL 8·9·10 | `dnf install sysbench` | 1.0.20 |

macOS 는 `brew install sysbench` 로 설치합니다.

소스 빌드는 다음 순서입니다.

```bash
./autogen.sh
./configure
make -j
make install
```

PostgreSQL 드라이버가 필요하면 `./configure --with-pgsql` 로 빌드하고, MySQL 지원을 빼려면 `--without-mysql` 을 씁니다. 빌드 전에 `make`·`automake`·`libtool`·`pkg-config`·`libaio` 개발 패키지가 필요하고, 드라이버별로 MySQL(또는 MariaDB) 클라이언트 개발 패키지와 `libpq` 개발 패키지가 추가로 필요합니다.

## 기본 문법

```bash
sysbench [options]... [testname] [command]
```

`testname` 자리에는 내장 테스트 이름(`fileio`·`cpu`·`memory`·`threads`·`mutex`), 번들 Lua 스크립트 이름(`oltp_read_only` 등), 또는 직접 만든 Lua 스크립트 경로를 적습니다. 생략하거나 `-` 를 적으면 표준 입력으로 받은 Lua 스크립트를 실행합니다.

`command` 는 다음 네 가지입니다.

- **prepare**: 테스트에 필요한 준비 작업을 합니다. `fileio` 는 측정에 쓸 파일을 디스크에 만들고, 데이터베이스 벤치마크는 테스트 테이블과 데이터를 만듭니다.
- **run**: `testname` 으로 지정한 테스트를 실제로 실행합니다. 모든 테스트가 이 명령을 제공합니다.
- **cleanup**: 테스트가 만든 임시 데이터를 지웁니다.
- **help**: `testname` 으로 지정한 테스트의 사용법을 출력합니다. 그 테스트가 제공하는 명령 목록이 함께 나오므로, 쓸 수 있는 명령을 확인할 때 씁니다.

제공하는 명령은 테스트마다 다릅니다. 일반 옵션은 `sysbench --help`, 테스트별 옵션은 `sysbench <testname> help` 로 확인합니다.

## 번들 Lua 스크립트

패키지로 설치하면 다음 스크립트가 함께 들어옵니다.

- `oltp_read_only`·`oltp_write_only`·`oltp_read_write` — 읽기 전용, 쓰기 전용, 읽기·쓰기 혼합 트랜잭션
- `oltp_point_select` — 단건 SELECT
- `oltp_insert`·`oltp_delete` — INSERT 전용, DELETE 전용
- `oltp_update_index`·`oltp_update_non_index` — 인덱스 컬럼 UPDATE, 비인덱스 컬럼 UPDATE
- `bulk_insert`·`select_random_points`·`select_random_ranges`

`oltp_common.lua` 는 위 스크립트들이 공유하는 공통 코드라서 단독으로 실행하지 않습니다.

## 공통 옵션

| Option | Description | Default |
| --- | --- | --- |
| `--threads` | 작업 스레드 수 | 1 |
| `--events` | 총 이벤트 수 제한. 0 은 무제한 | 0 |
| `--time` | 총 실행 시간 제한(초). 0 은 무제한 | 10 |
| `--warmup-time` | 지정한 초 동안의 통계를 버립니다. 캐시가 비어 있는 구간을 측정에서 빼고 싶을 때 씁니다 | 0 |
| `--rate` | 전체 스레드가 초당 처리할 평균 이벤트 수. 0 은 무제한 | 0 |
| `--thread-stack-size` | 스레드별 스택 크기 | 64K |
| `--report-interval` | 중간 통계를 출력할 간격(초). 누적이 아니라 구간별 값입니다. 0 은 비활성 | 0 |
| `--forced-shutdown` | `--time` 을 넘긴 뒤 강제 종료까지 기다릴 초 | off |
| `--percentile` | 지연 통계에 계산할 백분위(1~100). 0 이면 백분위 계산을 끕니다 | 95 |
| `--histogram` | 결과에 지연 히스토그램을 출력 | off |
| `--verbosity` | 로그 상세도(0: 치명적 메시지만, 5: 디버그) | 3 |
| `--debug` | 디버그 정보 출력 | off |
| `--validate` | 가능한 경우 테스트 결과를 검증 | off |
| `--luajit-cmd` | LuaJIT 제어 명령 실행. `luajit -j` 와 같습니다 | |
| `--help` | 일반 문법 또는 지정한 테스트의 도움말 출력 | off |

작업 스레드 초기화 대기 시간은 소스에 30초로 고정되어 있고 명령줄 옵션으로 노출되지 않습니다. 옵션 이름의 `-` 와 `_` 는 같게 취급하므로 `--table-size` 와 `--table_size` 는 같은 옵션입니다.

## 난수 옵션

sysbench 는 주어진 확률 분포에 따라 난수를 생성하는 여러 알고리즘을 제공합니다. 아래 옵션으로 그 알고리즘을 제어합니다.

| Option | Description | Default |
| --- | --- | --- |
| `--rand-type` | 기본 난수 분포 {uniform, gaussian, special, pareto} | special |
| `--rand-seed` | 난수 생성기 seed. 0 이면 현재 시간을 seed 로 씁니다 | 0 |
| `--rand-spec-iter` | 난수 생성에 사용할 반복 횟수 | 12 |
| `--rand-spec-pct` | special 분포에서 특수값으로 취급할 값의 비율(%) | 1 |
| `--rand-spec-res` | special 분포에서 특수값을 뽑을 비율(%) | 75 |
| `--rand-pareto-h` | pareto 분포의 h 파라미터 | 0.2 |

1.0.20 이 받는 분포는 위 네 가지입니다. 개발 브랜치에는 zipfian 분포와 `--rand-zipfian-exp` 옵션이 들어오고 기본 분포가 uniform 으로 바뀌었지만, 릴리스에는 아직 포함되지 않았습니다. 벤치마크 스크립트는 기본 분포를 그대로 쓰거나, 스크립트에서 분포를 명시해 기본값을 덮어쓸 수 있습니다.

## 데이터베이스 접속 옵션

| Option | Description | Default |
| --- | --- | --- |
| `--db-driver` | 사용할 드라이버. `help` 를 주면 목록을 출력 | mysql |
| `--db-ps-mode` | prepared statement 사용 여부 {auto, disable} | auto |
| `--mysql-host` | 서버 호스트 | localhost |
| `--mysql-port` | 서버 포트 | 3306 |
| `--mysql-socket` | 유닉스 소켓 경로 | 없음 |
| `--mysql-user` / `--mysql-password` | 접속 계정 / 비밀번호 | sbtest / 빈 값 |
| `--mysql-db` | 대상 데이터베이스 | sbtest |
| `--mysql-ignore-errors` | 무시할 에러 코드 목록 | 1213,1020,1205 |

`--db-driver` 기본값이 mysql 인 것은 MySQL 지원을 포함해 빌드한 경우입니다. PostgreSQL 은 `--db-driver=pgsql` 로 고르고, 드라이버별 옵션은 `sysbench <testname> help` 로 확인합니다.

## 사용 예제

패키지로 설치하면 번들 Lua 스크립트가 `/usr/share/sysbench/` 에 들어갑니다. 스크립트 경로를 그대로 적어도 되고, 번들 스크립트는 이름만 적어도 sysbench 가 찾아 줍니다.

`--tables` 는 만들 테이블 수(기본 1), `--table-size` 는 테이블당 행 수(기본 10000)입니다. `--range_selects=off` 를 주면 범위 SELECT 를 모두 빼고, `--skip-trx=on` 을 주면 명시적 트랜잭션 없이 AUTOCOMMIT 으로 실행합니다.

**1단계 · prepare — 테스트 데이터 생성:**

```bash
sysbench /usr/share/sysbench/oltp_read_only.lua --threads=16 --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test --mysql-user=root --mysql-password=<password> --mysql-port=3306 --tables=10 --table-size=1000000 --time=30 prepare
```

테이블 10개에 각각 100만 행을 만듭니다. prepare 는 병렬로 동작하므로 `--threads=16` 이 테이블 생성에도 적용됩니다.

**2단계 · run — 벤치마크 실행:**

```bash
sysbench /usr/share/sysbench/oltp_read_only.lua --threads=16 --events=0 --time=300 --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test --mysql-user=root --mysql-password=<password> --mysql-port=3306 --tables=10 --table-size=1000000 --range_selects=off --db-ps-mode=disable --report-interval=1 run
```

이벤트 수 제한 없이 300초 동안 실행하고 1초 간격으로 중간 통계를 출력합니다. `--range_selects=off` 로 범위 SELECT 를 빼서 단건 조회만 측정하고, `--db-ps-mode=disable` 로 prepared statement 를 끕니다. prepare 때와 같은 `--tables`·`--table-size` 를 줘야 스크립트가 같은 테이블 구성을 전제로 질의를 만듭니다.

**3단계 · cleanup — 테스트 데이터 삭제:**

```bash
sysbench oltp_read_only --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test --mysql-user=root --mysql-password=<password> --tables=10 cleanup
```

cleanup 은 `sbtest1` 부터 `--tables` 개수만큼 테이블을 DROP 합니다. prepare 때와 같은 `--tables` 값을 줘야 남는 테이블이 없습니다.

## 결과 읽기

run 이 끝나면 누적 결과가 네 묶음으로 나옵니다.

- **SQL statistics** — `queries performed` 아래에 read·write·other·total 질의 수가, 그 다음에 `transactions` 와 `queries` 의 총계와 초당 처리량(`per sec.`)이 나옵니다. 흔히 tps·qps 라고 부르는 값이 여기입니다. `ignored errors` 는 `--mysql-ignore-errors` 로 무시한 에러 수입니다.
- **General statistics** — `total time` 과 `total number of events`.
- **Latency (ms)** — `min`·`avg`·`max`·`sum` 과 `--percentile` 로 지정한 백분위 값입니다. 기본값이면 `95th percentile` 로 표시되고, `--percentile=0` 이면 `percentile stats: disabled` 로 표시됩니다.
- **Threads fairness** — 스레드별 이벤트 수와 실행 시간의 평균·표준편차입니다. 특정 스레드에 부하가 몰렸는지 확인할 때 봅니다.

측정값은 서버 하드웨어·스토리지·설정에 따라 크게 달라집니다. 다른 환경의 수치와 비교하려면 sysbench 버전, 사용한 스크립트, `--threads`·`--tables`·`--table-size`, 서버 버전과 주요 설정을 함께 기록해 두어야 비교가 성립합니다.
