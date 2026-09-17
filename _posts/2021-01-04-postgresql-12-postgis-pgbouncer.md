---
date: 2021-01-04 18:05:16 +0900
title: "PostgreSQL 12 설치 및 PostGIS 설치 (+ pgbouncer 설정)"
category: postgresql
excerpt: "오랜만에 포스팅입니다. 늦은 나이에 대학 수업에 직장 야근이 늘다보니 번아웃이 와서 한참 손을 놔버렸었습니다… 학기가 끝나니까 뭔가 빡세게 공부했던 하루하루가 확 풀어져 버려서 느슨하게 되어 버렸네요. 다시금 달려봐야 할것 같네요. PostGIS 요즘은 새..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — PostgreSQL 12 는 2024-11 지원 종료(현재 지원 범위는 14~18, 최신 GA 18)이고 설치 환경인 CentOS 7 도 EOL 이라 EL7 pgdg repo·postgis31_12 패키지를 쓸 수 없다. pgbouncer 1.15.0 소스 빌드 예시도 오래됐다(현재 1.25.x, CVE 수정 포함). PostGIS 는 현재 3.6/3.7 계열이다.

[![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)](https://www.postgresql.org/)

오랜만에 포스팅입니다.

늦은 나이에 대학 수업에 직장 야근이 늘다보니 번아웃이 와서 한참 손을 놔버렸었습니다…

학기가 끝나니까 뭔가 빡세게 공부했던 하루하루가 확 풀어져 버려서 느슨하게 되어 버렸네요. 다시금 달려봐야 할것 같네요.

## PostGIS

요즘은 새 회사로 이직을 해서 서비스를 개발중인 곳에서 DB업무를 진행하게 되었습니다.

지도 기반으로 하는 서비스다 보니 공간 인덱스 고민이 깊어졌습니다. 장기적으로는 글로벌 서비스를 준비하다 보니 공간 정보 데이터베이스 선정에서 고민이 많았습니다.

인스타그램은 PostgreSQL과 카산드라를 사용하는 대표적인 글로벌 SNS 서비스 기업인데 인스타를 많이 참고하다가, 공간 인덱스 문제에 도달하다 보니 또 인스타그램을 참고해서 구성했던것들이 많이 어려워졌습니다.

최종적으로는 PostGIS와 MongoDB를 저울질하다가 MongoDB를 선택하게 되었습니다.

PostGIS를 설정해보긴 했는데, 설정했던 시간과 기록이 아쉬워서 포스팅을 남기게 되었습니다.

PostGIS는 PostgreSQL의 플러그인중에 하나로, 공간 데이터를 관리하고 처리하는 소프트웨어입니다.

주요 기능은 공간 데이터 관리, 공간 데이터 연산, 분석, 공간 인덱스 지원 등이 있습니다.

공간 인덱스란 특정 좌표를 찍어 지도에서 사용자가 원하는 데이터를 검색할 때 사용한다고 보면 됩니다.

카카오 택시같이 지도 내에 있는 택시를 검색해서 호출한다거나, 네이버 지도에서 식당이나 카페를 검색하는 것과 같은 작업을 할 때 사용합니다.

PostGIS의 홈페이지는 [http://www.postgis.net/](http://www.postgis.net/ "http://www.postgis.net/") 이며 여기에서 PostGIS를 다운받을 수 있습니다.

### PostgreSQL 12 설치

PostgreSQL 설치 방법은 어렵지 않습니다. 12버전을 선택한 건 AWS RDS에서 현재 최종 지원 버전이라 선택했습니다.

테스트 설치는 CentOS 7 버전에서 진행했습니다.

필수 패키지 설치

```bash
# epel release 설치
$ yum install -y epel-release
$ yum install libevent-devel openssl-devel
```

Yum 레포지토리 설치

```bash
# Install the repository RPM:
$ yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-7-x86_64/pgdg-redhat-repo-latest.noarch.rpm
```

PostgreSQL 설치 및 PostGIS 설치

```bash
# Install PostgreSQL:
$ yum install -y postgresql12-server postgresql12-contrib postgis31_12
```

yum으로 postgresql를 설치하고 나면 postgres 계정과 그룹이 생성됩니다.

.bash_profile에 아무것도 들어 있지 않으니 보기 좋게 바꿔줍니다.

```bash
# add .bash_profile

export PS1="\[\e[32;1m\]\u@\[\e[34;1m\]\h:\[\e[31;1m\]\w]$ \[\e[0m\]"
export PATH=$PATH:$HOME/bin:/usr/pgsql-12/bin
alias vi='vim'
```

initdb 명령으로 Database 엔진을 구성합니다.

그리고 systemctl에 서비스를 등록합니다.

```bash
# Optionally initialize the database and enable automatic start:
$ /usr/pgsql-12/bin/postgresql-12-setup initdb
$ systemctl enable postgresql-12
$ systemctl start postgresql-12
```

PostGIS의 권장 메모리 세팅 값이 있습니다.

```ini
# postgresql.conf
work_mem=256MB
maintenance_work_mem = 1GB
```

PostgreSQL 구성이 완료되었다면 extension 설치로 PostGIS를 사용할 수 있습니다.

PostGIS를 사용할 DB를 구성하고 접속한 후에 extension을 설치해도 되고 template에 설치하고 template db를 통해 배포할 수도 있습니다.

```sql
# postgis 모듈 설치
> CREATE EXTENSION postgis;
> CREATE EXTENSION postgis_raster;
> CREATE EXTENSION postgis_topology;
```

이렇게 PostGIS를 설치하고 공간 정보를 저장할 수 있습니다.

PostGIS 사용 방법은 자세히 번역된 국내 자료가 없습니다. [http://www.postgis.net/](http://www.postgis.net/ "http://www.postgis.net/") 에서 공식문서를 참고하시기 바랍니다.

### PGbouncer

PostgreSQL은 직접 커넥션 풀을 관리하지 못합니다. Oracle은 WAS 단에서 JDBC 같은 드라이버에서 커넥션 풀을 관리하기 때문에 오라클만 접해본 분들이라면 커넥션 풀 관리에 고민을 하게 됩니다.

그래서 사용할 수 있는 것이 pgbouncer입니다.

pgbouncer는 DB에 직접 접속하지 않고, pgbouncer를 거쳐 DB를 접속하게 하며, 그 사이에서 커넥션 풀을 관리합니다.

```bash
# pgbouncer 설치
$ wget https://www.pgbouncer.org/downloads/files/1.15.0/pgbouncer-1.15.0.tar.gz
$ tar xvfz pgbouncer-1.15.0.tar.gz
$ cd pgbouncer-1.15.0
$ ./configure --prefix=/usr/local
$ make
$ make install
```

버전 확인

```bash
# 버전 확인
$ pgbouncer -V
```

pgbouncer.ini 설정

접속할 DB 정보를 넣어주고, pgbouncer가 사용할 port를 설정합니다.

users.txt 파일에 유저와 패스워드를 적어 사용할 유저를 기입합니다.

```ini
# pgbouncer.ini

[databases]
pg_test = host=localhost port=5432 dbname=pg_test
postgres = host=localhost port=5432 dbname=postgres

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = users.txt
logfile = pgbouncer.log
pidfile = pgbouncer.pid
admin_users = postgres
ignore_startup_parameters = extra_float_digits
```

```text
# users.txt
"pgbouncer" "pg1234"
```

그리고 pgbouncer가 DB에 접속할 수 있도록 pg_hba.conf 파일을 수정하면 pgbouncer의 포트를 이용해 클라이언트에서 접속이 가능합니다.

pgbouncer 구동

```bash
# pgbouncer 구동
$ pgbouncer -d pgbouncer.ini
```

pgbouncer를 여러 가지 고민해 보고 싶긴했지만, 이제 MongoDB에 열정을 쏟아야 할 시간이 되었기 때문에 여기서 정리를 마칩니다.

pgbouncer 및 PostgreSQL의 커넥션 풀 글은 잘 정리한 분의 블로그로 대체합니다.

Delivery Hero의 DBA를 하고계시는 분의 블로그인데 딜리버리가 국내에서 PostgreSQL를 가장 헤비하게 쓰는 업체 중에 하나이기 때문에 좋은 글이 가끔 올라옵니다.

[https://medium.com/@choonghyun.lee](https://medium.com/@choonghyun.lee "https://medium.com/@choonghyun.lee")

그럼 오늘의 포스팅은 이만~
