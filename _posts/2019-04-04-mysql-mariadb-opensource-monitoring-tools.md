---
date: 2019-04-04 20:46:53 +0900
title: "MySQL, MariaDB 오픈소스 모니터링 툴"
category: mysql
excerpt: "Percona PMM server 페르코나는 MySQL 개발 하던 사람들이 나와서 MySQL 관련 컨설팅을 하면서 MySQL 강화 버전인 Percona-Server를 제공하는 회사입니다. Percona-server는 xtraDB 라는 InnoDB 강화 버전의 엔진을 탑재한 MySQ…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — PMM 1.17 기준 글로, 현행은 PMM 3.x(3.0.0 2025-01-30, 3.9.1 2026-08-19)입니다. 데이터 컨테이너 생성과 pmm-admin add linux:metrics 같은 1.x 설치·등록 절차는 더 이상 동작하지 않습니다.

![Percona PMM](/assets/img/wp/2019/04/mysql_PNG19.png)

## Percona PMM Server

Percona는 MySQL 개발 하던 사람들이 나와서 MySQL 관련 컨설팅을 하면서 MySQL 강화 버전인 Percona Server를 제공하는 회사입니다.

Percona Server는 xtraDB라는 InnoDB 강화 버전의 엔진을 탑재한 MySQL 기반의 DB입니다.

Percona에서는 MySQL이나 MariaDB에서 사용할 수 있는 무료 모니터링 툴을 제공하는데, 그것이 PMM Server입니다.

Grafana를 이용해 시각화하며, 템플릿 자체를 Percona에서 미리 만들어서 제공합니다.

MongoDB나 PostgreSQL도 모니터링이 가능하다고 하는데 PostgreSQL은 약간 설정하는 방법이 다르고, 여기서는 다루지 않겠습니다.

## Percona PMM Server 설치

설치는 Docker로 진행합니다.

```bash
$ docker pull percona/pmm-server:latest
```

데이터 컨테이너 생성

```bash
$ docker create -v /opt/prometheus/data -v /opt/consul-data -v /var/lib/mysql --name pmm-data percona/pmm-server
```

데이터 컨테이너만 있으면, PMM Server 컨테이너가 버전업이 되어도 지난 데이터를 가지고 올라옵니다.

PMM Server 실행

```bash
$ docker run -d -p 8000:80 --volumes-from pmm-data --name pmm-server --restart always percona/pmm-server
```

모니터링 데이터의 보관 주기를 설정하고자 한다면 docker run 옵션에 `-e METRICS_RETENTION=192h` (시간) 옵션을 주면 됩니다.

서버의 8000 포트를 이용해서 모니터링 화면을 볼 수 있습니다.

![PMM Server 대시보드](/assets/img/wp/2019/04/1.png)

PMM Server를 올리면 PMM Server가 올라간 장비의 OS 자원 사용량을 기본적으로 모니터링할 수 있습니다.

저의 경우는 Synology NAS의 Docker로 올렸기 때문에, Synology NAS 서버의 자원 사용량을 볼 수 있습니다.

## PMM Client 설치

모니터링할 서버 및 DB가 설치된 서버에 rpm 방식으로 설치하여 세팅하면 됩니다.

agent가 PMM Server에 데이터를 전송하는 방식이며, Client에서 PMM Server 연결은 기본값은 80포트입니다(도커에서 80:80으로 포트를 설정했다면 80번으로 통신합니다).

저 같은 경우는 8000번으로 설치했기 때문에 8000번으로 통신합니다.

[https://www.percona.com/downloads/pmm-client/LATEST/](https://www.percona.com/downloads/pmm-client/LATEST/%20)에서 최신버전을 구할 수 있으며 현재 최신버전은 1.17.1입니다.

```bash
[root@client ~]# rpm -ivh pmm-client-1.0.4-1.x86_64.rpm
```

기본 설치 경로는 `/usr/local/percona`입니다.

```bash
[root@client ~]# wget https://www.percona.com/downloads/pmm/1.17.1/binary/redhat/7/x86_64/pmm-client-1.17.1-1.el7.x86_64.rpm
[root@client ~]# rpm -ivh pmm-client-1.17.1-1.el7.x86_64.rpm
```

클라이언트를 받고 설치를 진행합니다.

## PMM Server 등록

pmm-admin config –client-name 클라이언트 호스트네임 –server PMM Server IP –bind-address 사설 IP –client-address 클라이언트 IP

```bash
[root@client ~]# pmm-admin config --client-name app.rastalion.me --server 192.168.10.115:8000 --client-address 192.168.10.102
OK, PMM server is alive.

PMM Server      | 192.168.10.115:8000 
Client Name     | app.rastalion.me
Client Address  | 192.168.10.102
```

클라이언트가 사설 IP를 사용한다면, `--bind-address` 옵션을 주셔야 합니다.

클라이언트 서버에 모니터링용 사설 IP와 서비스용 공인 IP가 같이 설치되어 있다면, 추가적으로 `--client-address` 옵션을 주면 됩니다.

## 모니터링 서비스 등록하기

모니터링 서비스 영역에는 총 4가지가 있습니다.

- linux:metrics : 시스템 자체의 모니터링
- mysql:metrics : MySQL 인스턴스의 모니터링
- mysql:queries : 쿼리 모니터링
- mongodb:metrics : MongoDB 인스턴스의 모니터링

이 외에 SET로 구성된 것도 있습니다.

- mysql : linux:metrics + mysql:metrics + mysql:queries
- mongodb : linux:metrics + mongodb:metrics

개별적으로 하나씩 등록해도 되지만 간단하게 mysql이나 mongodb 같은 셋트 영역을 사용하면 됩니다.

Linux만 등록할 때

```bash
[root@client ~]# pmm-admin add linux:metrics 
OK, now monitoring this system.
[root@client ~]# pmm-admin list
pmm-admin 1.17.1

PMM Server      | 192.168.10.115:8000 
Client Name     | app.rastalion.me
Client Address  | 192.168.10.102
Service Manager | linux-systemd

-------------- ----------------- ----------- -------- ------------ --------
SERVICE TYPE   NAME              LOCAL PORT  RUNNING  DATA SOURCE  OPTIONS 
-------------- ----------------- ----------- -------- ------------ --------
linux:metrics  app.rastalion.me  42000       YES      -
```

```bash
[root@client ~]# pmm-admin check-network
PMM Network Status

Server Address | 192.168.10.115:8000
Client Address | 192.168.10.102

* System Time
NTP Server (0.pool.ntp.org)         | 2019-04-04 11:22:15 +0000 UTC
PMM Server                          | 2019-04-04 11:22:15 +0000 GMT
PMM Client                          | 2019-04-04 20:22:15 +0900 KST
PMM Server Time Drift               | OK
PMM Client Time Drift               | OK
PMM Client to PMM Server Time Drift | OK

* Connection: Client --> Server
-------------------- -------      
SERVER SERVICE       STATUS       
-------------------- -------      
Consul API           OK
Prometheus API       OK
Query Analytics API  OK

Connection duration | 712.638µs
Request duration    | 7.894641ms
Full round trip     | 8.607279ms


* Connection: Client <-- Server
-------------- ----------------- --------------------- ------- ---------- ---------
SERVICE TYPE   NAME              REMOTE ENDPOINT       STATUS  HTTPS/TLS  PASSWORD 
-------------- ----------------- --------------------- ------- ---------- ---------
linux:metrics  app.rastalion.me  192.168.10.102:42000  OK      YES        -      
```

만약 pmm-admin check-network 명령을 쳤을 때 status가 Down으로 보일 때는 방화벽 체크를 해줘야 합니다.

server-client 통신에 42000번 포트가 막혀있기 때문입니다.

MySQL이나 MariaDB를 모니터링할 때는 42002포트가 기본값이며, MongoDB는 42003번, add 옵션으로 등록할 때 포트를 변경할 수도 있습니다.

![모니터링 그래프](/assets/img/wp/2019/04/2.png)

모니터링이 쌓이면 그래프가 보이기 시작합니다.
