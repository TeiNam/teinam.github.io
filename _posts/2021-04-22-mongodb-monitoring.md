---
date: 2021-04-22 09:00:54 +0900
title: "MongoDB Monitoring"
category: mongodb
excerpt: "MongoDB Monitoring MongoDB를 모니터링 하는데 있어서 가장 중요한 부분은 메모리를 체크하는 것입니다. 일반적으로 많은 데이터베이스에서 클라이언트가 데이터를 요청하면 디스크에서 메모리에 적재하여 읽기 혹은 변경작업을 진행합니다. 디스크에서 메모리로 페이지를 복사하…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 무료 클라우드 모니터링(`db.enableFreeMonitoring()`)은 MongoDB 7.0 에서 폐지되어 더 이상 쓸 수 없고, 동시 실행 티켓도 7.0 부터 서버가 동적으로 조정하므로 "읽기/쓰기 각 128개" 및 "티켓 0 = 과부하" 판단 기준은 더 이상 맞지 않습니다(지표명도 8.0 에서 `queues.execution` 으로 변경). 본문의 Ops Manager 4.4.11 은 지원 종료 버전이며 현재는 Ops Manager 8.0 계열입니다. mongotop/mongostat 는 현재 Database Tools 로 별도 배포됩니다.

![MongoDB 모니터링](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB Monitoring

MongoDB를 모니터링할 때 가장 중요한 부분은 메모리를 체크하는 것입니다. 많은 데이터베이스는 클라이언트가 데이터를 요청하면 디스크에서 메모리에 적재합니다. 메모리에서 읽기·쓰기 작업을 진행합니다. 디스크에서 메모리로 페이지를 복사하는 작업은 매우 시간이 오래걸리는 작업이며, 따라서 데이터베이스가 디스크로부터 페이지를 복사하는 빈도가 낮을수록 좋습니다. MongoDB 역시 메모리 상에서 거의 모든 연산을 수행하는 것이 디스크 I/O를 피하는 핵심이며, 인덱스역시 메모리에 상주하기 때문에 메모리 크기는 MongoDB 성능에 많은 영향을 미칩니다. 그렇기 때문에 MongoDB의 메모리 사용 추적은 모니터링에 있어 가장 중요한 부분을 차지합니다.

MongoDB는 세가지 타입의 메모리를 사용합니다.

1. **Resident (상주 메모리):** mongod 프로세스에서 사용하는 물리적 메모리의 메가 바이트 수입니다. 표준 배포에서 상주 메모리는 WiredTiger 캐시에서 사용하는 메모리 양과 mongod 프로세스에서 사용하는 다른 메모리 구조 전용 메모리입니다. 기본적으로 WiredTiger를 사용하는 mongod는 전체 메모리의 50%를 캐시로 예약합니다. 정상 상태에서 WiredTiger는 캐시 사용량을 80%로 제한합니다. 예를 들어 서버에 16GB의 메모리가있는 경우 WiredTiger는 캐시에 8GB를 사용할 수 있고 정상 상태에서는 약 6.5GB를 사용해야한다고 가정합니다.
2. **Virtual (가상 메모리):** mongod 프로세스에서 사용하는 가상 메모리의 메가 바이트 수입니다. 여기에는 전체 MongoDB 프로세스에 대한 가상 메모리가 포함됩니다. 저널링을 설정 한 경우 일반적으로 매핑 된 메모리 크기의 두 배가됩니다.
3. **Mapped (대응 메모리):** WiredTiger 스토리지 엔진은 메모리 매핑 파일을 사용하지 않습니다.

MongoDB는 데이터를 메모리상에 페이징하면 상주 메모리에 추가됩니다. MongoDB는 해당 페이지의 주소를 제공받는데, 이는 램에 있는 페이지의 실제 주소가 아닌 가상주소입니다. MongoDB는 이를 커널에 전달하고, 커널은 페이지가 실제로 어디 있는지 찾습니다. 이런 방식을 사용하기 때문에 커널이 메모리에서 페이지를 제거하더라도 여전히 주소로 페이지에 접근할 수 있습니다. MongoDB는 커널에 메모리를 요청하고, 커널은 페이지 캐시를 살펴보고 페이지가 없음을 확인하면, 페이지 폴트를 발생시켜 해당 페이지를 메모리에 복사한 후 MongoDB에 반환합니다.

### 페이지 폴트(Page Fault) 추적

페이지 폴트 횟수는, MongoDB에서 찾는 데이터가 얼마나 자주 램에 존재하지 않았는지 알려줍니다. 페이지 폴트가 많아도 디스크에서 많은 페이지 폴트를 처리 할 수 있거나, 애플리케이션이 디스크 탐색 지연을 처리할 수 있다면 페이지 폴트가 많이 발생해도 특별히 문제가 되지는 않습니다. 반면 처리할수 없다면 메모리를 사이즈를 늘리거나, 디스크를 SSD로 교체해야 합니다.

페이지 폴트시 디스크로 기록되는 데이터는 LRU 로직에 의해서 결정이 됩니다. 그래서, 자주 안쓰는 데이터가 디스크로 기록되는데, 일반적인 애플리케이션에서 자주 쓰는 데이터의 비율은 그리 크지 않습니다. 예를 들어 게시판이나 블로그만을 생각해보더라도, 앞의 1~10 페이지 정도가 많이 보게 되지 뒤의 데이터를 잘 보지는 않습니다. 자주 접근되는 데이터를 "HOT DATA"라고 합니다. 이 HOT DATA가 메모리에 집중되도록 KEY를 설계하는 것이 핵심입니다. 쓸데없이 전체 데이터를 스캔 하는 등의 작업을 하게 되면, 100% 페이지 폴트가 발생하기 때문에, 컬렉션 스캔 등이 필요한 시나리오는 별도의 인덱스를 만들어서 사용하는 등의 전략이 필요합니다.

시간의 흐름에 따라 페이지 폴트 횟수를 추적하면, 애플리케이션이 특정 횟수의 페이지 폴트에도 정상 동작을 확인할 수 있고, 시스템이 처리할 수 있는 페이지 폴트 횟수 기준을 세웁니다.

페이지 폴트는 두 가지 타입이 있습니다.

- **Hard Page Fault:** 문제의 페이지가 실제 메모리에없고 디스크에서 가져와야 할 때 트리거됩니다.
- **Soft Page Fault:** 이는 페이지가 메모리의 다른 위치에 있거나 전환 상태에있을 때 발생합니다.

실제로 페이지 폴트를 모니터링 할 때 체크하는 부분은 하드 페이지 폴트입니다.

다음은 페이지 폴트 통계를 확일 할 수 있는 커맨드인데, 서버 시작 이후 MongoDB가 디스크에 접근한 횟수를 나타냅니다.

```javascript
> db.adminCommand({"serverStatus": 1}).extra_info
{
        "note" : "fields vary by platform",
        "user_time_us" : NumberLong("2512869347"),
        "system_time_us" : NumberLong(1698074895),
        "maximum_resident_set_kb" : NumberLong(38940),
        "input_blocks" : NumberLong(368),
        "output_blocks" : NumberLong(3595696),
        "page_reclaims" : NumberLong(4477259),
        "page_faults" : NumberLong(4),
        "voluntary_context_switches" : NumberLong(24288125),
        "involuntary_context_switches" : NumberLong(139110)
}
```

개발 장비에서 조회를 하다 보니 "page\_faults" : NumberLong(4) 로 총 4번으로 나옵니다.

### 성능 추적

CPU는 일반적으로 MongoDB의 입출력 범위입니다. WiredTiger 스토리지 엔진은 멀티 쓰레드를 지원하며, 이전 MMAP 스토리지 엔진과 비교할 때 CPU 메트릭 전체에서 사용량 수준이 더 높습니다. 즉, 효율적으로 사용한다고 이해할 수 있습니다. 사용자 또는 시스템 시간이 100%에 접근한다면 자주 사용하는 쿼리의 인덱스가 누락된 것이 가장 흔한 원인입니다.

WiredTiger 스토리지 엔진은 도큐먼트 수준의 동시성을 제공하며, 이는 동일한 컬렉션에 여러 개의 쓰기가 동시에 일어나는 것을 허용합니다. 티켓팅 시스템은 기아 상태를 피하려고 사용 중인 스레드 수를 제어합니다. 읽기 및 쓰기 작업에 대한 티켓을 발급하는데 기본적으로 각각 128개씩 사용이 가능합니다. 이후 새로운 읽기나 쓰기 작업은 큐(Queue)에 추가됩니다. serverStatus의 wiredTiger.concurrentTransactions.read.available 과 wiredTiger.concurrentTransactions.write.available 필드는 사용 가능한 티켓수가 0에 도달하는 시점을 추적하는데 사용하며, 0이되면 이후 들어오는 작업은 대기하게 됩니다.

### MongoDB가 기본적으로 제공하는 모니터링

MongoDB의 커뮤니티 버전을 설치하면 `db.enableFreeMonitoring()`명령을 사용해 무료로 모니터링을 제공한다고 출력됩니다.

```javascript
> db.enableFreeMonitoring()
{
        "state" : "enabled",
        "message" : "To see your monitoring data, navigate to the unique URL below. Anyone you share the URL with will also be able to view this page. You can disable monitoring at any time by running db.disableFreeMonitoring().",
        "url" : "https://cloud.mongodb.com/freemonitoring/cluster/VZPMIISGO4PHPOKPLJWPYJWW3BULAGRO",
        "userReminder" : "",
        "ok" : 1
}
```

실제로 사용하면 모니터링을 할수 있는 웹 주소가 나오며, 웹 브라우저를 이용해 접속하면 아래와 같은 화면이 나옵니다.

![MongoDB 무료 모니터링 대시보드 화면](/assets/img/wp/2021/04/스크린샷-2021-04-21-오전-11.31.09.png)

이 툴로 기본적인 항목을 체크합니다.

### Precona PMM2

MySQL 및 MongoDB의 fork 버전을 제공하는 Percona 사의 무료 오픈소스 모니터링 툴입니다. 프로메테우스와 그라파나를 통해 제작되었고, 도커를 이용해 설치가 가능합니다.

PMM은 이전 포스트(오픈소스 모니터링 툴 PMM2)를 참고하세요

오픈소스 모니터링 툴 PMM2 (MySQL, MariaDB, PostgreSQL, Mongo)

Percona Monitoring and Management 2 PMM은 Percona에서 프로메테우스와 그라파나를 이용해 무료로 배포하고 있는 모니터링 툴입니다. (https://www.percona.com/software/database-tools/percona-monitoring-and-management) 최근에 2버전으로 업데이트가 되면서 기존 1.7버전과는 많은 것이 바뀌었습니다. MariaDB의 Galera Cluster 모니터링 뿐만아니라, PostgreSQL 모니터링도 정식으로 지원하기...

### MongoDB OpsManager

MongoDB Ops Manager는 MongoDB 인프라를 자동화·모니터링·백업할 수 있습니다. Ops Manager Automation을 사용하면 MongoDB 노드 및 클러스터를 구성하고 유지 관리할 수 있습니다.

![Ops Manager 아키텍처 다이어그램](https://docs.opsmanager.mongodb.com/current/_images/how-it-works-ops.png)

![MongoDB 로고](https://webassets.mongodb.com/_com_assets/cms/mongodb-for-giant-ideas-bbab5c3cf8.png)

MongoDB Ops Manager Download

Monitor, automate, and backup your data center with MongoDB's Ops Manager. Download and use for free here.

모니터링의 데이터베이스를 MongoDB로 사용합니다. Ops Manager가 요구하는 MongoDB 사양은 다음과 같습니다.

|  |  |
| --- | --- |
| System Memory | 15 GB |
| Disk Capacity | 50 GB in `/` (The root directory of this host) |
| Host OS Permissions | `root` |
| Host OS | Red Hat Enterprise Linux 8.0 |

MongoDB를 우선 설치하고 OpsManager가 이용할 DB의 경로 생성 및 설정 파일을 작성합니다.

```bash
$ sudo mkdir -p /data/appdb
$ sudo chown -R mongod:mongod /data
```

`vi /etc/mongod.conf`

```yaml
systemLog:
  destination: file
  path: "/data/appdb/mongodb.log"
  logAppend: true
storage:
  dbPath: "/data/appdb"
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1
processManagement:
  fork: true
  timeZoneInfo: /usr/share/zoneinfo
  pidFilePath: /var/run/mongodb/mongod.pid
net:
  bindIp: 127.0.0.1
  port: 27017
setParameter:
  enableLocalhostAuthBypass: false
```

그리고 OpsManager를 Download 합니다.

```bash
$ wget https://downloads.mongodb.com/on-prem-mms/rpm/mongodb-mms-4.4.11.100.20210330T2227Z-1.x86_64.rpm
```

그리고 패키지 설치

```bash
$ sudo yum localinstall mongodb-mms-4.4.11.100.20210330T2227Z-1.x86_64.rpm
```

설치가 완료되면 아래 명령으로 구동을 합니다.

```bash
$ service mongodb-mms start

Generating new Ops Manager private key...
Starting pre-flight checks
Successfully finished pre-flight checks

Migrate Ops Manager data
   Running migrations...[  OK  ]
Starting Ops Manager server
   Instance 0 starting............[  OK  ]
Starting pre-flight checks
Successfully finished pre-flight checks

Start Backup Daemon...[  OK  ]
```

OK 가 떨어지면 해당 서버의 IP:8080 포트를 통해 로그인 할 수 있는 화면이 나오며 사용할 계정으로 가입하고 메일 세팅을 하고 진행하면 됩니다.

![](/assets/img/wp/2021/04/스크린샷-2021-04-21-오후-3.47.13.png)

이런 툴이 있다 정도만 알려드리는거니 세팅이나 활용 방안에 대해서는 다음 기회를 통해 진행해보도록 하겠습니다.

### mongotop

mongotop은 MongoDB 인스턴스 mongod가 데이터를 읽고 쓰는 데 소비하는 시간을 추적하는 방법을 제공합니다. mongotop은 컬렉션 별 통계를 제공합니다. 기본적으로 mongotop은 1 초마다 값을 반환합니다.

mongo 셸이 아닌 시스템 명령 줄에서 mongotop을 실행합니다. mongos에서는 사용할 수 없습니다.

- general options:  
  `--help` : 사용법 출력  
  `--version` : mongostat 버전 확인
- verbosity options:  
  `-v`, `--verbose` : 상세한 로그 출력 ( 각각의 로우 출력 때마다 각 서버의 시간 출력 예제. -vvvvv)  
  `--quiet` : 모든 로그 출력 숨김
- connection options:  
  `-h`, `--host`= : 몽고DB 호스트 접속 (setname/host1,host2 for replica sets : rs1/192.168.0.112)  
  `--port`= : 서버포트 (–host hostname:port)
- authentication options:  
  `-u`, `--username`= : 인증유저  
  `-p`, `--password`= : 패스워드  
  `--authenticationDatabase`= : 인증유저 접근하는 DB  
  `--authenticationMechanism`= : 인증유저 방식
- output options:  
  `--locks` : DB마다 락이 있는지 출력  
  `-n`, `--rowcount`= : 출력 라인 수 ( 0 : 무한 )  
  `--json` : json 방식으로 출력

```bash
$ mongotop -u "dba" --authenticationDatabase admin
2021-04-21T15:54:58.864+0900    WARNING: On some systems, a password provided directly using --password may be visible to system status programs such as `ps` that may be invoked by other users. Consider omitting the password to provide it via stdin, or using the --config option to specify a configuration file with the password.
2021-04-21T15:54:58.908+0900    connected to: mongodb://localhost/

                    ns    total    read    write    2021-04-21T15:54:59+09:00
    admin.system.roles      0ms     0ms      0ms                             
    admin.system.users      0ms     0ms      0ms                             
  admin.system.version      0ms     0ms      0ms                             
config.system.sessions      0ms     0ms      0ms                             
   config.transactions      0ms     0ms      0ms                             
  local.system.replset      0ms     0ms      0ms                             
             test.test      0ms     0ms      0ms                             
   test.testCollection      0ms     0ms      0ms                             

                    ns    total    read    write    2021-04-21T15:55:00+09:00
    admin.system.roles      0ms     0ms      0ms                             
    admin.system.users      0ms     0ms      0ms                             
  admin.system.version      0ms     0ms      0ms                             
config.system.sessions      0ms     0ms      0ms                             
   config.transactions      0ms     0ms      0ms                             
  local.system.replset      0ms     0ms      0ms                             
             test.test      0ms     0ms      0ms                             
   test.testCollection      0ms     0ms      0ms                             

                    ns    total    read    write    2021-04-21T15:55:01+09:00
    admin.system.roles      0ms     0ms      0ms                             
    admin.system.users      0ms     0ms      0ms                             
  admin.system.version      0ms     0ms      0ms                             
config.system.sessions      0ms     0ms      0ms                             
   config.transactions      0ms     0ms      0ms                             
  local.system.replset      0ms     0ms      0ms                             
             test.test      0ms     0ms      0ms                             
   test.testCollection      0ms     0ms      0ms  

...
..
.
.
.
```

## mongostat

mongostat 유틸리티는 현재 실행중인 mongod 또는 mongos 인스턴스의 상태에 대한 정보를 제공합니다. mongostat는 기능적으로 UNIX / Linux 파일 시스템 유틸리티 vmstat와 유사하지만 mongod 및 mongos 인스턴스에 대한 데이터를 제공합니다.

mongo 셸이 아닌 시스템 명령 줄에서 mongostat를 실행합니다.

- general options:  
  `--help` : 사용법 출력  
  `--version` : mongostat 버전 확인
- verbosity options:  
  `-v`, `--verbose` : 상세한 로그 출력 ( 각각의 로우 출력 때마다 각 서버의 시간 출력 예제. -vvvvv)  
  `--quiet` : 모든 로그 출력 숨김
- connection options:  
  `-h`, `--host`= : 몽고DB 호스트 접속 (setname/host1,host2 for replica sets : rs1/192.168.0.112)  
  `--port`= : 서버포트 (–host hostname:port)
- authentication options:  
  `-u`, `--username`= : 인증유저  
  `-p`, `--password`= : 패스워드  
  `--authenticationDatabase`= : 인증유저 접근하는 DB  
  `--authenticationMechanism`= : 인증유저 방식
- stat options:  
  `--noheaders` : 컬럼명은 출력 안함  
  `-n`, `--rowcount`= : 출력 라인 수 ( 0 : 무한 )  
  `--discover` : 모든 리플리카 셋 통계 출력  
  `--http` : 기본적인 db 접속을 대신해 HTTP 사용  
  `--all` : all optional fields  
  `--json` : json 방식으로 출력

```bash
$ mongostat -u "dba" --authenticationDatabase admin
Enter password:

insert query update delete getmore command dirty  used flushes vsize  res qrw arw net_in net_out conn                time
    *0    *0     *0     *0       0     0|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   111b   42.1k    8 Apr 21 16:03:33.596
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   113b   43.0k    8 Apr 21 16:03:34.585
    *0    *0     *0     *0       0     0|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   111b   42.4k    8 Apr 21 16:03:35.586
    *0    *0     *0     *0       0     0|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   111b   42.4k    8 Apr 21 16:03:36.588
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   163b   42.7k    8 Apr 21 16:03:37.589
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   112b   42.6k    8 Apr 21 16:03:38.587
    *0    *0     *0     *0       0     0|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   111b   42.4k    8 Apr 21 16:03:39.588
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   112b   42.5k    8 Apr 21 16:03:40.587
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   112b   42.5k    8 Apr 21 16:03:41.586
    *0    *0     *0     *0       0     4|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   360b   43.4k    8 Apr 21 16:03:42.585
insert query update delete getmore command dirty  used flushes vsize  res qrw arw net_in net_out conn                time
    *0    *0     *0     *0       0     0|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   111b   42.2k    8 Apr 21 16:03:43.591
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   112b   42.6k    8 Apr 21 16:03:44.588
    *0    *0     *0     *0       0     0|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   111b   42.5k    8 Apr 21 16:03:45.588
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   112b   42.5k    8 Apr 21 16:03:46.587
    *0    *0     *0     *0       0     1|0  0.0% 74.7%       0 2.27G 849M 0|0 1|0   163b   42.7k    8 Apr 21 16:03:47.588
```

#### 참고 자료

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")

도서: MongoDB 완벽가이드

도서: Real MongoDB
