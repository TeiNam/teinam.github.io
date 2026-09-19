---
date: 2019-08-09 00:30:17 +0900
title: "Sysbench : MariaDB, MySQL, PostgreSQL Benchmark Tool."
category: database
excerpt: "Sysbench ? 시스템 성능을 측정할 수 있는 툴로, MySQL에서 내부 프로젝트로 만들다가 Lua 스크립트를 적용한 0.5 버전까지 나왔다가 오랜기간 개발이 중지 되었습니다. 2016년에 다시 개발이 시작되었고 현재 1.0 버전대 개발이 진행중입니다. 기존에는 소스코드를 이용…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — sysbench 최신 릴리스는 여전히 1.0.20(2020-04)이고 1.1 정식 릴리스가 없어 본문의 옵션 표와 prepare/run/cleanup 사용법은 그대로 유효하다. 설치 예시의 CentOS·yum 은 CentOS 7 EOL(2024-06-30) 이후 RHEL 9 계열 dnf 로 바꿔야 한다.

## Sysbench란?

시스템 성능을 측정하는 툴로, MySQL 내부 프로젝트로 시작해 Lua 스크립트를 지원하는 0.5 버전까지 나왔다가 오랜 기간 개발이 중지되었다. 2016년에 다시 개발이 시작되었고 현재 1.0 버전대 개발이 진행 중이다. 기존에는 소스코드로 설치하는 방식이 많았지만, 현재는 yum 레포지토리로 설치할 수 있다. 시스템뿐만 아니라 MySQL, MariaDB, PostgreSQL 성능 평가가 가능하다. 오라클은 Swingbench를 많이 쓰고, MariaDB는 sysbench나 DBT2(<https://dev.mysql.com/downloads/benchmarks.html>) 등을 사용한다.

## Binary package 설치

> **주의:** 다음 명령은 인터넷에서 스크립트를 다운받아 즉시 실행한다. 스크립트 내용을 확인하거나 신뢰할 수 있는 출처인지 검증하세요.

```bash
curl -s https://packagecloud.io/install/repositories/akopytov/sysbench/script.rpm.sh | sudo bash
sudo yum -y install sysbench
```

이 명령은 CentOS 기준이다.

## General Syntax

```bash
sysbench [options]... [testname] [command]
```

다음은 일반적인 테스트 명령과 그 목적이다.

- **prepare**: 테스트에 필요한 준비 조치를 수행한다(예: fileio 테스트를 위해 필요한 파일을 디스크에 작성하거나 데이터베이스 벤치마크를 위해 테스트 데이터베이스를 작성).
- **run**: testname 인수로 지정된 실제 테스트를 실행한다. 이 명령은 모든 테스트에서 제공된다.
- **cleanup**: 테스트를 생성한 테스트에서 테스트 실행 후 임시 데이터를 제거한다.
- **help**: testname 인수로 지정된 테스트의 사용법 정보를 표시한다. 여기에는 테스트에서 제공하는 전체 명령 목록이 포함되므로 사용 가능한 명령을 확인하는 데 사용한다.

## Command Line Option

| **Option** | **Description** | **Default value** |
| --- | --- | --- |
| `--threads` | 작업할 스레드의 수 | 1 |
| `--events` | 총 요청 수 제한. 0(기본값)은 제한이 없음을 의미 | 0 |
| `--time` | 총 실행 시간 제한(초). 0은 제한이 없음을 의미 | 10 |
| `--warmup-time` | 벤치마킹 초기 시간을 통계에서 제외하고 싶을 때 유용. 막 구동된 시스템을 벤치마크할 때 CPU / 데이터베이스 / 페이지 및 기타 캐시가 초기값에 가까울 때 캐시를 채우고 사용률을 예열하는 데 사용 | 0 |
| `--rate` | 모든 스레드가 평균적으로 초당 수행해야 하는 이벤트(트랜잭션) 수. 0(기본값)은 무제한 비율을 의미 | 0 |
| `--thread-init-timeout` | 작업자 스레드가 초기화될 때까지의 대기 시간(초) | 30 |
| `--thread-stack-size` | 각 스레드의 스택 크기 | 32k |
| `--report-interval` | 지정된 간격(초)으로 중간 통계를 정기적으로 보고. 이 옵션으로 생성된 통계는 누적이 아니라 간격 별. 0은 중간 보고서를 비활성화 | 0 |
| `--debug` | 디버그 정보 출력 | off |
| `--validate` | 가능한 경우 테스트 결과의 검증을 수행 | off |
| `--help` | 일반 구문 또는 지정된 테스트의 도움말을 출력 | off |
| `--verbosity` | 세부 정보 수준(0: 중요한 메시지만, 5: 디버그) | 4 |
| `--percentile` | sysbench는 처리된 모든 요청의 실행 시간을 측정해 최소, 평균 및 최대 실행 시간 같은 통계 정보를 표시한다. 대부분의 벤치마크에서 일부 백분위 수와 일치하는 요청 실행 시간 값을 아는 것이 유용하다(예: 95% 백분위 수는 가장 긴 요청의 5%를 삭제하고 나머지 요청에서 최대값을 선택함을 의미). 이 옵션으로 백분위 수의 쿼리 실행 시간을 계산할 수 있다. | 95 |
| `--luajit-cmd` | LuaJIT 제어 명령을 수행. 이 옵션은 luajit -j와 동일. 자세한 내용은 LuaJIT 문서를 참조 |  |

## Random Number Option

sysbench는 주어진 확률 분포에 따라 난수를 생성하는 여러 알고리즘을 제공한다. 아래 표에는 해당 알고리즘을 제어하는 옵션이 나와 있다.

| **Option** | **Description** | **Default value** |
| --- | --- | --- |
| `--rand-type` | 난수 분포 {uniform, gaussian, special, pareto, zipfian}. 기본적으로 사용. 벤치마크 스크립트는 기본 배포를 사용하거나 이를 명시적으로 지정(즉, 기본값 재정의)하도록 선택할 수 있다. | special |
| `--rand-seed` | 난수 생성기 seed. 0이면 현재 시간이 RNG seed로 사용 | 0 |
| `--rand-spec-iter` | 특수 분포 반복 횟수 | 12 |
| `--rand-spec-pct` | 특별한 값이 특별 분포에 속하는 전체 범위의 백분율 | 1 |
| `--rand-spec-res` | 특수 분포에 사용할 특수값의 백분율 | 75 |
| `--rand-pareto-h` | shape parameter for the Pareto distribution | 0.2 |
| `--rand-zipfian-exp` | shape parameter ((θ)theta) for the Zipfian distribution | 0.8 |

## 사용 예제

yum으로 패키지를 설치하면 `/usr/share/sysbench/` 경로 밑에 lua 스크립트가 생성되어 있다.

lua 스크립트로 원하는 벤치마크를 실행할 수 있다.

**준비 단계 (데이터 생성):**

```bash
sysbench /usr/share/sysbench/oltp_read_only.lua --threads=16 --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test --mysql-user=root --mysql-password=<password> --mysql-port=3306 --tables=10 --table-size=1000000 --time=30 prepare
```

**정리 단계 (테스트 데이터 삭제):**

```bash
sysbench /usr/share/sysbench/oltp_read_only.lua --threads=16 --events=0 --time=300 --mysql-socket=/var/lib/mysql/mysql.sock --mysql-db=test --mysql-user=root --mysql-password=<password> --mysql-port=3306 --tables=10 --table-size=1000000 --range_selects=off --db-ps-mode=disable --report-interval=1 cleanup
```
