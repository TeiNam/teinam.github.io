---
date: 2019-06-20 01:40:52 +0900
title: "PGPOOL-II 를 이용한 PostgreSQL 클러스터링 구성"
category: postgresql
excerpt: "PGPOOL-II 를 이용한 PostgreSQL 클러스터링 구성 PGPOOL-II ? Pgpool-II는 PostgreSQL 서버와 PostgreSQL 데이터베이스 클라이언트 사이에 위치하는 프록시 소프트웨어입니다. 다음 기능을 제공합니다. Connection Pooling Loa…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — pgpool-II 4.0 + EL7 yum repo + pgpool-II-pg11 패키지 기준이다. 현재 안정 버전은 4.7.x(2026-06 시점)이고, 설치 기반인 CentOS 7 은 2024-06-30 EOL 이며 연동 대상인 PostgreSQL 11 도 지원이 끝났다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## PGPOOL-II를 이용한 PostgreSQL 클러스터링 구성

## PGPOOL-II란?

Pgpool-II는 PostgreSQL 서버와 PostgreSQL 데이터베이스 클라이언트 사이에 위치하는 프록시 소프트웨어입니다. 다음 기능이 있습니다.

- Connection Pooling
- Load Balancing
- Automated fail over
- Replication
- Limiting Exceeding Connections

### Connection Pooling

Pgpool-II는 PostgreSQL 서버와의 연결을 유지하고 같은 등록 정보 (예 : 사용자 이름, 데이터베이스, 프로토콜 버전)를 가진 새로운 연결이 들어올 때마다 이 연결을 다시 사용합니다. 연결 오버 헤드를 줄이고 시스템의 전체 처리량을 향상시킵니다.

### Load Balancing

데이터베이스가 복제되면 (복제 모드 또는 마스터 / 슬레이브 모드로 실행되므로) 모든 서버에서 SELECT 쿼리를 수행하면 동일한 결과가 반환됩니다. Pgpool-II는 각 PostgreSQL 서버의 부하를 줄이기 위해 복제 기능을 이용합니다. 사용 가능한 서버에 SELECT 쿼리를 배포하여 시스템의 전체 처리량을 향상시킵니다. 이상적인 시나리오에서는 읽기 성능이 PostgreSQL 서버의 수에 비례하여 향상 될 수 있습니다. 부하 분산은 많은 읽기 전용 쿼리를 동시에 많은 사용자가 실행하는 시나리오에서 가장 효과적입니다.

### Automated fail over

데이터베이스 서버 중 하나가 다운되거나 복구 할 수 없게되면 Pgpool-II는 데이터베이스 서버를 분리하고 나머지 데이터베이스 서버를 사용하여 작업을 계속합니다. 시간 초과 및 재시도를 포함한 자동화 된 장애 조치를 도와주는 정교한 기능이 있습니다.

### Replication

Pgpool-II는 여러 PostgreSQL 서버를 관리 할 수 ​​있습니다. 복제 기능을 활성화하면 두 개 이상의 PostgreSQL 클러스터에서 실시간 백업을 생성 할 수 있으므로 해당 클러스터 중 하나에서 장애가 발생해도 중단없이 서비스를 계속할 수 있습니다. Pgpool-II에는 기본 복제기능이 있습니다. 그러나 사용자는 PostgreSQL 자체적인 스트리밍 복제를 포함한 외부 솔루션의 복제 기능을 사용할 수 있습니다.

### Limiting Exceeding Connections

 PostgreSQL과의 동시 접속의 최대 세션에 제한이 있어 최대 세션에 이르면 신규 접속은 거부됩니다. 그러나 이 최대 연결 수를 늘리면 자원 소비가 증가하고 전체 시스템 성능에 부정적인 영향을줍니다. Pgpool-II에는 최대 연결 수에 제한이 발생해도 커넥션 풀에 의한 접속 오류를 반환하는 대신 큐에 쌓아두고 세션을 대기시킵니다.

Pgpool-II는 PostgreSQL의 백엔드 및 프론트 엔드 프로토콜을 말하며 백엔드와 프론트 엔드간에 메시지를 중계합니다. 따라서 데이터베이스 어플리케이션 (frontend)은 Pgpool-II가 실제 PostgreSQL 서버라고 생각하고 서버 (백엔드)는 Pgpool-II를 클라이언트 중 하나로 간주합니다. Pgpool-II는 서버와 클라이언트 모두에게 투명하기 때문에 Pgpool-II에서 소스 코드를 거의 변경하지 않고도 기존 데이터베이스 응용 프로그램을 사용할 수 있습니다.

Pgpool-II는 리눅스, 솔라리스, FreeBSD, 대부분의 유닉스 계열 아키텍쳐에서 작동합니다. Windows는 지원되지 않습니다. 지원되는 PostgreSQL 서버 버전은 6.4 이상입니다. PostgreSQL 7.3 이전 버전을 사용하는 경우 Pgpool-II의 일부 기능을 사용할 수 없습니다. 하지만 어쨌든 그런 오래된 버전을 사용해서는 안됩니다. 또한 모든 PostgreSQL 서버가 동일한 주요 버전을 사용하고 있는지 확인해야합니다.

**Pgpool-II 설치**

현재 나와 있는 버전은 4.0 버전이고, <http://www.pgpool.net/mediawiki/index.php/Downloads> 해당 경로에서 rpm 설치 파일을 받을 수 있습니다.

아래의 명령어는 해당 서버에 pgpool-II의 yum repo를 설치하는 명령어 입니다.

```bash
root# yum install http://www.pgpool.net/yum/rpms/4.0/redhat/rhel-7-x86_64/pgpool-II-release-4.0-1.noarch.rpm
```

실제로 레포지토리가 설치가 되면 yum을 이용해 버전에 맞는 pgpool-II을 설치할 수 있습니다.

```bash
root# yum install pgpool-II-pg11 pgpool-II-pg11-extensions
```

extensions의 기능

- pgpool-recovery : Online Recovery를 위한 Extension.
- pgpool-adm : [PCP Command](http://www.pgpool.net/docs/latest/en/html/pcp-commands.html)들을 실행하기 위한 Extention.
- pgpool-regclass : 이 Extension은 9.4 이하 버젼의 PostgreSQL을 PGPool로 연결할 때 Table명 중복 시 예외 처리를 위한 Extension. 9.4 이상의 PostgreSQL 설치되어 있는 경우는 설치 되지 않음.

### pgpool.conf 설정

<http://www.pgpool.net/docs/latest/en/html/setting-up-pgpool-conf.html> 페이지를 참고 하면 pgpool.conf의 다양한 샘플을 확인 할 수 있습니다.

|  |  |
| --- | --- |
| **Operation mode** | **Configuration file name** |
| Streaming replication mode | pgpool.conf.sample-stream |
| Replication mode | pgpool.conf.sample-replication |
| Master slave mode | pgpool.conf.sample-master-slave |
| Raw mode | pgpool.conf.sample |
| Logical replication mode | pgpool.conf.sample-logical |

이전 [포스팅](/writing/postgresql-replication-ha/)에서 streaming replication을 이용해 3 node Act-Std-Std 구성을 했기 때문에 pgpool.conf.sample-stream 파일을 이용해서 설정을 해보록 하겠습니다.

```conf
root# vi /etc/pgpool-II/pgpool.conf

#------------------------------------------------------------------------------
# CONNECTIONS
#------------------------------------------------------------------------------

# - pgpool Connection Settings -

listen_addresses = '*'
port = 9999
socket_dir = '/tmp'

# - pgpool Communication Manager Connection Settings -

pcp_listen_addresses = '*'
pcp_port = 9898
pcp_socket_dir = '/tmp'
listen_backlog_multiplier = 2
serialize_accept = off

# - Backend Connection Settings -

backend_hostname0 = '192.168.10.241'
backend_port0 = 5432
backend_weight0 = 1
backend_data_directory0 = '/var/lib/pgsql/11/data'
backend_flag0 = 'ALLOW_TO_FAILOVER'

backend_hostname1 = '192.168.10.242'
backend_port1 = 5432
backend_weight1 = 1
backend_data_directory1 = '/var/lib/pgsql/11/data'
backend_flag1 = 'ALLOW_TO_FAILOVER'

backend_hostname2 = '192.168.10.243'
backend_port2 = 5432
backend_weight2 = 1
backend_data_directory2 = '/var/lib/pgsql/11/data'
backend_flag2 = 'ALLOW_TO_FAILOVER'


#------------------------------------------------------------------------------
# FILE LOCATIONS
#------------------------------------------------------------------------------

pid_file_name = '/var/run/pgpool/pgpool.pid'
logdir = '/tmp'


#------------------------------------------------------------------------------
# REPLICATION MODE
#------------------------------------------------------------------------------

replication_mode = on
replicate_select = on
insert_lock = off
lobj_lock_table = ''


#------------------------------------------------------------------------------
# LOAD BALANCING MODE
#------------------------------------------------------------------------------

load_balance_mode = on
ignore_leading_white_space = on
white_function_list = ''
black_function_list = 'currval,lastval,nextval,setval'
black_query_pattern_list = ''
database_redirect_preference_list = ''
app_name_redirect_preference_list = ''
allow_sql_comments = off
disable_load_balance_on_write = 'transaction' 


#------------------------------------------------------------------------------
# MASTER/SLAVE MODE
#------------------------------------------------------------------------------

master_slave_mode = on
master_slave_sub_mode = 'stream'

# - Streaming -

sr_check_period = 10
sr_check_user = 'postgres'
sr_check_password = ''
sr_check_database = 'postgres'
delay_threshold = 10000000
```

Postgresql.conf 파일과 마찬가지로 각각의 파라미터 값 옆에 주석으로 해당 파라미터의 설명이 나와 있습니다.

Backend Connection Settings 에서 3 Node 구성이기 때문에 각각의 노드의 정보를 구성해 주었습니다.

- pgpool Connection Settings : 외부에서 pgpool로 접속할 때 사용할 접속 정보. PGPool을 통해 접속할 떄는 9999을 사용하며, Unix Domain Socket을 사용할 때는 Default Path를 통해 통신이 이루어집니다. app단에서 DB에 접속할때 9999포트를 통해 DB에 접속하여 문제가 발생하지 않습니다. 5432 포트를 이용해 특정 노드의 데이터만 변경하면 싱크에 문제가 발생합니다.
- Backend Connection Setting : Clustering에 포함된 PostgreSQL Server Connection 정보와 Data File path를 알립니다. 뒤에 붙는 Postfix 숫자에 의해 서버들을 구분합니다. 여기서 설정하는 backend-weight 값에 의해 Load Balance 시에 Request 들이 분산 비율이 결정됩니다. 0번, 1번, 2번 노드를 동일하게 1로 설정했기 때문에 각 서버는 1:1:1로 Request를 받게 됩니다. 그리고, 추후 Failover 기능을 추가하기 위해 backend\_flag을 'ALLOW\_TO\_FAILOVER'로 설정합니다.
- FILE LOCATIONS : RHEL7에서는 pid file 이름은 기본값을 설정하면 되고, Log Folder은 각자 편한 위치에 설정하면 됩니다. 단, Log Folder는 직접 만들어 줘야 합니다. 자동으로 만들어지지 않습니다. 그리고 이 Log Folder에는 pgpool\_status 라는 파일 1개만 생성됩니다.
- LOAD BALANCING MODE : load balance 기능 사용을 위해 load\_balance\_mode를 'on'으로 변경합니다.
- MASTER/SLAVE MODE : 현재 Streaming Replication을 사용하고 있기 때문에 master\_slave\_mode는 'on'으로, master\_slave\_sub\_mode는 'stream'으로 합니다.
- Streaming : Streaming Replication 상태 체크를 위한 설정이다. 기본값인 10초마다 postgres 계정으로 상태 Check 합니다.

pgpool.conf는 모든 노드에서 동일한 설정을 해주면 됩니다.

Pgpool-II를 구동하기전에 각 노드에서 pg\_hba.conf 파일을 체크 해줍니다.

```conf
$ vi pg_hba.conf

# "local" is for Unix domain socket connections only
local   all             all                                     trust
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
host    all             all             192.168.10.241/32       trust
# IPv6 local connections:
host    all             all             ::1/128                 trust
# Allow replication connections from localhost, by a user with the
# replication privilege.
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host    replication     replica_user    192.168.10.0/24         trust

# Pgpool
host    all             postgres        192.168.10.0/24         trust
```

각 노드에서 자신의 IP로 접속할 수 있게 각 노드별로 자신의 IP를

Node1: host all all 192.168.10.241/32 trust

Node2: host all all 192.168.10.242/32 trust

Node3: host all all 192.168.10.243/32 trust

그리고

host all postgres 192.168.10.0/24 trust

추가해줍니다.

```bash
root# systemctl enable pgpool
root# systemctl start pgpool
root# systemctl status pgpool
```

Pgpool-II를 systemctl에 등록하고 구동해줍니다.

Master Node

```text
root@psql01:/tmp]# systemctl status pgpool
● pgpool.service - Pgpool-II
   Loaded: loaded (/usr/lib/systemd/system/pgpool.service; disabled; vendor preset: disabled)
   Active: active (running) since Thu 2019-06-20 01:02:18 KST; 11s ago
 Main PID: 11025 (pgpool)
   CGroup: /system.slice/pgpool.service
           ├─11025 /usr/bin/pgpool -f /etc/pgpool-II/pgpool.conf -n
           ├─11026 pgpool: wait for connection request
           ├─11027 pgpool: wait for connection request
           ├─11028 pgpool: wait for connection request
           ├─11029 pgpool: wait for connection request
           ├─11030 pgpool: wait for connection request
           ├─11031 pgpool: wait for connection request
           ├─11032 pgpool: wait for connection request
           ├─11033 pgpool: wait for connection request
           ├─11034 pgpool: wait for connection request
           ├─11035 pgpool: wait for connection request
           ├─11036 pgpool: wait for connection request
           ├─11037 pgpool: wait for connection request
           ├─11038 pgpool: wait for connection request
           ├─11039 pgpool: wait for connection request
           ├─11040 pgpool: wait for connection request
           ├─11041 pgpool: wait for connection request
           ├─11042 pgpool: wait for connection request
           ├─11043 pgpool: wait for connection request
           ├─11044 pgpool: wait for connection request
           ├─11045 pgpool: wait for connection request
           ├─11046 pgpool: wait for connection request
           ├─11047 pgpool: wait for connection request
           ├─11048 pgpool: wait for connection request
           ├─11049 pgpool: wait for connection request
           ├─11050 pgpool: wait for connection request
           ├─11051 pgpool: wait for connection request
           ├─11052 pgpool: wait for connection request
           ├─11053 pgpool: wait for connection request
           ├─11054 pgpool: wait for connection request
           ├─11055 pgpool: wait for connection request
           ├─11056 pgpool: wait for connection request
           ├─11057 pgpool: wait for connection request
           ├─11059 pgpool: PCP: wait for connection request
           ├─11060 pgpool: worker process
           ├─11061 pgpool: health check process(0)
           ├─11063 pgpool: health check process(1)
           └─11064 pgpool: health check process(2)

Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  Setting up socket for 0.0.0.0:9999
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  Setting up socket for :::9999
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  find_primary_node_repeatedly: waiting for finding a primary node
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  find_primary_node: primary node is 0
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  find_primary_node: standby node is 1
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  find_primary_node: standby node is 2
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  pgpool-II successfully started. version 4.0.5 (torokiboshi)
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  node status[0]: 1
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  node status[1]: 2
Jun 20 01:02:18 psql01 pgpool[11025]: 2019-06-20 01:02:18: pid 11025: LOG:  node status[2]: 2
```

Standby Node2

```text
root@psql02:/tmp]# systemctl status pgpool
● pgpool.service - Pgpool-II
   Loaded: loaded (/usr/lib/systemd/system/pgpool.service; enabled; vendor preset: disabled)
   Active: active (running) since Thu 2019-06-20 01:02:21 KST; 19s ago
  Process: 10180 ExecStop=/usr/bin/pgpool -f /etc/pgpool-II/pgpool.conf $STOP_OPTS stop (code=exited, status=0/SUCCESS)
 Main PID: 10212 (pgpool)
   CGroup: /system.slice/pgpool.service
           ├─10212 /usr/bin/pgpool -f /etc/pgpool-II/pgpool.conf -n
           ├─10213 pgpool: wait for connection request
           ├─10214 pgpool: wait for connection request
           ├─10215 pgpool: wait for connection request
           ├─10216 pgpool: wait for connection request
           ├─10217 pgpool: wait for connection request
           ├─10218 pgpool: wait for connection request
           ├─10219 pgpool: wait for connection request
           ├─10220 pgpool: wait for connection request
           ├─10221 pgpool: wait for connection request
           ├─10222 pgpool: wait for connection request
           ├─10223 pgpool: wait for connection request
           ├─10224 pgpool: wait for connection request
           ├─10225 pgpool: wait for connection request
           ├─10226 pgpool: wait for connection request
           ├─10227 pgpool: wait for connection request
           ├─10228 pgpool: wait for connection request
           ├─10229 pgpool: wait for connection request
           ├─10230 pgpool: wait for connection request
           ├─10231 pgpool: wait for connection request
           ├─10232 pgpool: wait for connection request
           ├─10233 pgpool: wait for connection request
           ├─10234 pgpool: wait for connection request
           ├─10235 pgpool: wait for connection request
           ├─10236 pgpool: wait for connection request
           ├─10237 pgpool: wait for connection request
           ├─10238 pgpool: wait for connection request
           ├─10239 pgpool: wait for connection request
           ├─10240 pgpool: wait for connection request
           ├─10241 pgpool: wait for connection request
           ├─10242 pgpool: wait for connection request
           ├─10243 pgpool: wait for connection request
           ├─10244 pgpool: wait for connection request
           ├─10246 pgpool: PCP: wait for connection request
           ├─10247 pgpool: worker process
           ├─10248 pgpool: health check process(0)
           ├─10249 pgpool: health check process(1)
           └─10250 pgpool: health check process(2)

Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  Setting up socket for 0.0.0.0:9999
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  Setting up socket for :::9999
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  find_primary_node_repeatedly: waiting for finding a primary node
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  find_primary_node: primary node is 0
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  find_primary_node: standby node is 1
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  find_primary_node: standby node is 2
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  pgpool-II successfully started. version 4.0.5 (torokiboshi)
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  node status[0]: 1
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  node status[1]: 2
Jun 20 01:02:21 psql02 pgpool[10212]: 2019-06-20 01:02:21: pid 10212: LOG:  node status[2]: 2
```

Standby Node 3

```text
root@psql03:/tmp]# systemctl status pgpool
● pgpool.service - Pgpool-II
   Loaded: loaded (/usr/lib/systemd/system/pgpool.service; enabled; vendor preset: disabled)
   Active: active (running) since Thu 2019-06-20 01:02:23 KST; 28s ago
  Process: 9983 ExecStop=/usr/bin/pgpool -f /etc/pgpool-II/pgpool.conf $STOP_OPTS stop (code=exited, status=0/SUCCESS)
 Main PID: 9997 (pgpool)
   CGroup: /system.slice/pgpool.service
           ├─ 9997 /usr/bin/pgpool -f /etc/pgpool-II/pgpool.conf -n
           ├─ 9998 pgpool: wait for connection request
           ├─ 9999 pgpool: wait for connection request
           ├─10000 pgpool: wait for connection request
           ├─10001 pgpool: wait for connection request
           ├─10002 pgpool: wait for connection request
           ├─10003 pgpool: wait for connection request
           ├─10004 pgpool: wait for connection request
           ├─10005 pgpool: wait for connection request
           ├─10006 pgpool: wait for connection request
           ├─10007 pgpool: wait for connection request
           ├─10008 pgpool: wait for connection request
           ├─10009 pgpool: wait for connection request
           ├─10010 pgpool: wait for connection request
           ├─10011 pgpool: wait for connection request
           ├─10012 pgpool: wait for connection request
           ├─10013 pgpool: wait for connection request
           ├─10014 pgpool: wait for connection request
           ├─10015 pgpool: wait for connection request
           ├─10016 pgpool: wait for connection request
           ├─10017 pgpool: wait for connection request
           ├─10018 pgpool: wait for connection request
           ├─10019 pgpool: wait for connection request
           ├─10020 pgpool: wait for connection request
           ├─10021 pgpool: wait for connection request
           ├─10022 pgpool: wait for connection request
           ├─10023 pgpool: wait for connection request
           ├─10024 pgpool: wait for connection request
           ├─10025 pgpool: wait for connection request
           ├─10026 pgpool: wait for connection request
           ├─10027 pgpool: wait for connection request
           ├─10028 pgpool: wait for connection request
           ├─10029 pgpool: wait for connection request
           ├─10031 pgpool: PCP: wait for connection request
           ├─10032 pgpool: worker process
           ├─10033 pgpool: health check process(0)
           ├─10034 pgpool: health check process(1)
           └─10035 pgpool: health check process(2)

Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  Setting up socket for 0.0.0.0:9999
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  Setting up socket for :::9999
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  find_primary_node_repeatedly: waiting for finding a primary node
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  find_primary_node: primary node is 0
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  find_primary_node: standby node is 1
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  find_primary_node: standby node is 2
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  pgpool-II successfully started. version 4.0.5 (torokiboshi)
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  node status[0]: 1
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  node status[1]: 2
Jun 20 01:02:23 psql03 pgpool[9997]: 2019-06-20 01:02:23: pid 9997: LOG:  node status[2]: 2
```

**Pgpool 동작 체크**

5432 포트로 접속을 하면 각각의 DB로 접속이 됩니다.

9999 포트로 접속을 하면 pgpool을 이용해 접속을 합니다.

```text
postgres@psql01:~]$ psql -h localhost -p 9999 -U postgres
psql (11.3)
Type "help" for help.

postgres=# show pool_nodes;
 node_id |    hostname    | port | status | lb_weight |  role   | select_cnt | load_balance_node | replication_delay | last_status_change  
---------+----------------+------+--------+-----------+---------+------------+-------------------+-------------------+---------------------
 0       | 192.168.10.241 | 5432 | up     | 0.333333  | primary | 0          | true              | 0                 | 2019-06-20 01:04:47
 1       | 192.168.10.242 | 5432 | up     | 0.333333  | standby | 0          | false             | 0                 | 2019-06-20 01:04:47
 2       | 192.168.10.243 | 5432 | up     | 0.333333  | standby | 0          | false             | 0                 | 2019-06-20 01:04:47
(3 rows)
```

lb\_weight 는 각 노드의 처리량을 나타냅니다.

각 노드의 backend\_weight 옵션 값들을 1로 잡았기에 1:1:1 비율로 분산 하면서 0.33 씩 나눠가진거라고 보시면 됩니다.

실제로 9999 포트로 접속을 하면 모든 값이 마스터노드 기준으로 나옵니다. 스탠바이 노드에서 접속을 해도 마스터 노드의 결과 값이 나옵니다.

show pool\_nodes; 명령은 pgpool을 통해서 접속했을때만 사용이 가능합니다.

Pgpool-II를 이용한 클러스터 구성은 완료 되었습니다. 다음번에는 pgpool-setup 명령을 가지고 구성하는 법을 해보겠습니다.
