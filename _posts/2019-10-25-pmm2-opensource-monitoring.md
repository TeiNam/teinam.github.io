---
date: 2019-10-25 22:03:45 +0900
title: "오픈소스 모니터링 툴 PMM2 (MySQL, MariaDB, PostgreSQL, Mongo)"
category: mysql
excerpt: "Percona Monitoring and Management 2 PMM은 Percona에서 프로메테우스와 그라파나를 이용해 무료로 배포하고 있는 모니터링 툴입니다. (https://www.percona.com/software/database-tools/percona-monitori…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — PMM 2.0.1 기준 설치 절차로, 현행은 PMM 3.x(3.0.0 2025-01-30, 3.9.1 2026-08-19)입니다. percona/pmm-server:2 이미지와 데이터 컨테이너 방식 대신 PMM 3 설치·마이그레이션 문서를 따라야 합니다.

![MySQL/PMM 로고](/assets/img/wp/2019/04/mysql_PNG19.png)

**Percona Monitoring and Management 2**

PMM은 Percona에서 프로메테우스와 그라파나를 이용해 무료로 배포하고 있는 모니터링 툴입니다. (<https://www.percona.com/software/database-tools/percona-monitoring-and-management>)

최근에 2버전으로 업데이트가 되면서 기존 1.7버전과는 많은 것이 바뀌었습니다.

> **전제조건:**
> - Docker 설치 필요
> - CentOS/RHEL 등 yum 기반 시스템 (클라이언트 설치)
> - 모니터링 대상 DB가 이미 설치·구동 중이어야 함 (MySQL, PostgreSQL, MongoDB)

MariaDB의 Galera Cluster 모니터링 뿐만아니라, PostgreSQL 모니터링도 정식으로 지원하기 시작하여, postgres\_exporter 를 따로 설치할 필요가 없어 졌습니다.

PMM2에서는 Linux Node, MySQL(MariaDB), PostgreSQL, MongoDB의 모니터링이 가능합니다.

아래는 노드의 정보를 보여주는 Node Summary 화면입니다.

![Node Summary 대시보드](/assets/img/wp/2019/10/pmm.png)

인스턴스 오버뷰에서 모든 DB 인스턴스의 자원 사용률을 한 번에 볼 수 있습니다.

아래는 MySQL의 인스턴스 오버뷰입니다.

![MySQL Instance Overview 대시보드](/assets/img/wp/2019/10/mysql.png)

우측 상단에 MySQL을 눌러보면 InnoDB, MyISAM 같은 스토리지 엔진의 정보도 체크할 수 있고, 퍼포먼스 스키마의 정보를 조회하거나, Slow query를 조회할 수 있습니다.

아래는 PostgreSQL의 인스턴스 서머리 모니터링 화면입니다.

![PostgreSQL Instance Summary 대시보드](/assets/img/wp/2019/10/psql.png)

개별 인스턴스가 가지는 자원 효율을 모니터링합니다.

기존의 1.7 버전과 설치 방법이 조금 바뀌었습니다. PMM-Server는 Docker로 올리는 것은 비슷합니다. Data 컨테이너를 추가하고, 서버 컨테이너를 올려서 구동합니다. 특별히 설정값을 바꾸지 않아도 모니터링 데이터를 30일을 기본 보관주기로 유지합니다.

**PMM-Server 설치**

docker 이미지 받기

```bash
$ docker pull percona/pmm-server:2
```

글 작성 기준 최신 버전은 2.0.1이었습니다.

Data 컨테이너 생성

```bash
$ docker create \
   -v /srv \
   --name pmm-data \
   percona/pmm-server:2 /bin/true
```

PMM-Server 구동

```bash
$ docker run -d \
   -p 80:80 \
   -p 443:443 \
   --volumes-from pmm-data \
   --name pmm-server \
   --restart always \
   percona/pmm-server:2
```

기존 버전과 달라진 점은 https를 설정해주지 않아도 기본으로 사용할 수 있습니다. http, https 모두 사용가능합니다.

기존의 사용중인 버전이 있다면, Docker 이미지를 업데이트하여 버전업이 가능합니다. (참고 : <https://www.percona.com/doc/percona-monitoring-and-management/2.x/install/docker-upgrading.html>)

PMM-Server를 구동한 후 그라파나 웹에 접속하면 로그인 화면이 뜹니다. 초기 패스워드는 admin/admin이며, 처음 로그인하면 암호 변경을 합니다.

**PMM-Client 설치**

기존 클라이언트가 있다면 역시 삭제 해주는게 좋습니다.

그리고 클라이언트 에이전트의 설정 방식은 완전히 바뀌었기 때문에 반드시 새 문서를 참고 하시기 바랍니다.

PMM Repo 추가

```bash
$ yum install https://repo.percona.com/yum/percona-release-latest.noarch.rpm
```

Percona Release 설정

```bash
$ percona-release disable all
$ percona-release enable original release
```

PMM-Client 설치

```bash
$ yum install pmm2-client
```

**PMM-Client 에이전트 설정하기**

1.7 버전에서 사용하던 –server-address 옵션이 사라졌습니다.

```bash
$ pmm-admin config --server-insecure-tls --server-url=https://admin:admin@192.168.100.1:443
```

–server-url=https://admin:MyPassword@<ip address>:Port 이런식으로 옵션을 주면 클라이언트 에이전트에 모니터링 서버가 등록됩니다.

```bash
# pmm-admin config --server-insecure-tls --server-url=https://admin:admin@192.168.100.1:443
Checking local pmm-agent status...
pmm-agent is running.
Registering pmm-agent on PMM Server...
Registered.
Configuration file /usr/local/percona/pmm-agent.yaml updated.
Reloading pmm-agent configuration...
Configuration reloaded.
Checking local pmm-agent status...
pmm-agent is running.
```

에이전트가 등록되면 기본적으로 Linux 서버에 대한 모니터링은 자동으로 이루어집니다.

```bash
$ pmm-admin add mysql --query-source=slowlog --username=pmm --password=pmm 127.0.0.1:3306
```

MySQL DB에 PMM유저를 생성해줍니다.

```sql
create user 'pmm'@'127.0.0.1' identified by 'pmm123';
grant all privileges on *.* to 'pmm'@'127.0.0.1' identified by 'pmm123';
GRANT SELECT, PROCESS, SUPER, REPLICATION CLIENT, RELOAD ON *.* TO 'pmm'@'127.0.0.1' IDENTIFIED BY 'pmm123' WITH MAX_USER_CONNECTIONS 10;
GRANT SELECT, UPDATE, DELETE, DROP ON performance_schema.* TO 'pmm'@'127.0.0.1';
flush privileges;
```

MySQL을 등록하는 옵션입니다. –query-source=slowlog 옵션을 줘야 slow-query를 모니터링 할 수 있습니다.

MySQL이나 MariaDB는 'root'@'127.0.0.1' 접속 권한 설정을 반드시 줘야 합니다.

특별히 인스턴스 이름을 지정해주지 않으면 <node>-mysql 이라는 이름으로 PMM-Server에 등록이 됩니다.

```bash
# pmm-admin add mysql --query-source=perfschema --username=pmm --password=pmm <name> 127.0.0.1:3306
MySQL Service added.
Service ID  : /service_id/a89191d4-7d75-44a9-b37f-a528e2c4550f
Service name: ps-mysql
```

퍼포먼스 스키마를 사용한다면 –query-source 옵션에 쿼리 소스를 Perfschema에서 가져올 수 있습니다. 인스턴스 네임을 원하는 이름으로 등록하고자 한다면, <name>부분에  DB명을 넣어주면 됩니다.

MongoDB를 모니터에 등록하고자 한다면 절차는 똑같습니다. MongoDB 클러스터를 모니터링 하는 옵션과 더 자세한 사항은 Percona 홈페이지를 참고 하시면 됩니다.

```bash
$ pmm-admin add mongodb  --username=pmm  --password=pmm 127.0.0.1:27017
```

PostgreSQL을 등록하려면 몇가지 Setting을 해주는게 좋습니다.

pg\_stat\_statements 설정을 해야 slow query 모니터링 및 더 많은 정보를 가져옵니다. (설정 방법 : </writing/pg-stat-statements/>)

```bash
$ yum install postgresql96-contrib

$ vi postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
track_activity_query_size = 2048
pg_stat_statements.track = all
```

postgresql<version>-contrib을 반드시 설치해주고, Shared\_preload\_libraries에 pg\_stat\_statements를 넣고 DB를 재구동 해줍니다. (pg\_ctl stop / start)

Public schema에 확장기능을 설치합니다.

```sql
postgres=# CREATE EXTENSION pg_stat_statements SCHEMA public;
```

에이전트 등록 방법은 MySQL과 비슷합니다.

slow query를 모니터링 하고 싶다면, 에이전트 등록시에 –query-source=pgstatements 옵션을 추가 해줍니다.

```bash
# pmm-admin add postgresql --username=pmm --password=pmm postgres 127.0.0.1:5432
PostgreSQL Service added.
Service ID  : /service_id/28f1d93a-5c16-467f-841b-8c014bf81ca6
Service name: postgres
```

psql로 접속해서 track\_io\_timing 설정을 변경해줍니다. track\_io\_timing 설정이 활성화 된 경우에만 읽기 및 쓰기 시간 통계 캡처가 가능합니다.

```sql
postgres=# ALTER SYSTEM SET track_io_timing=ON;
postgres=# SELECT pg_reload_conf();
```

Cacti나 다른 상용 모니터링 툴에 못지 않게 우수한 화면 구성과 풍부한 모니터링 정보를 제공합니다. 자빅스처럼 설정이 어렵지도 않습니다.

오픈소스 DB들 뿐만 아니라 Linux으로 된 VM 모니터링에도 사용할 수 있으니 PMM2는 유용한 선택이 될 것입니다.
