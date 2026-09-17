---
date: 2020-04-03 11:24:04 +0900
title: "MongoDB 4.2 설치 on CentOS 7"
category: mongodb
excerpt: "MongoDB 4.2 버전 설치 (Community Edition) 2020년 4월 3일 현재 가장 최신 버전의 MongoDB는 4.2 버전입니다. 물론 MongoDB 공홈에는 4.4 버전의 설치 문서까지 올라와 있습니다. 아직 stable 버전이 아니기 때문에 4.2 버전으로 설…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — MongoDB 4.2 는 2023-04-30 지원 종료됐고 CentOS 7 도 2024-06-30 EOL 이라 이 설치 절차 자체를 그대로 쓸 수 없습니다. 또한 예시에 나오는 `mongo` 셸은 6.0 에서 제거되어 `mongosh` 로 대체됐고, 설정 파일의 `storage.journal.enabled` 는 6.1 이후 제거되어 7.0+ 에서는 같은 mongod.conf 로 기동되지 않습니다(현재 지원 버전은 7.0/8.0/8.3).

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB 4.2 버전 설치 (Community Edition)

> **전제조건**: CentOS 7, root 권한, yum 사용 가능

2020년 4월 3일 현재 가장 최신 버전의 MongoDB는 4.2 버전이다. MongoDB 공식 홈페이지에는 4.4 버전의 설치 문서까지 올라와 있다. 아직 stable 버전이 아니므로 4.2 버전으로 설치를 진행한다.

### Yum을 통한 설치

YUM 레포지토리에 mongodb 4.2 repo를 추가해 줍니다.

`vi /etc/yum.repos.d/mongo.repo`

```ini
[mongodb-org-4.2]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/$releasever/mongodb-org/4.2/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-4.2.asc
```

`yum install -y mongodb-org`

```bash
yum install -y mongodb-org
Loaded plugins: fastestmirror, langpacks
Determining fastest mirrors
 * base: data.aonenetworks.kr
 * extras: ftp.kaist.ac.kr
 * updates: data.aonenetworks.kr
base                                                                                                                                                                                                                | 3.6 kB  00:00:00
extras
mongodb-org-4.2
updates
Resolving Dependencies
--> Running transaction check
---> Package mongodb-org.x86_64 0:4.2.5-1.el7 will be installed
--> Processing Dependency: mongodb-org-tools = 4.2.5 for package: mongodb-org-4.2.5-1.el7.x86_64
--> Processing Dependency: mongodb-org-mongos = 4.2.5 for package: mongodb-org-4.2.5-1.el7.x86_64
--> Processing Dependency: mongodb-org-shell = 4.2.5 for package: mongodb-org-4.2.5-1.el7.x86_64
--> Processing Dependency: mongodb-org-server = 4.2.5 for package: mongodb-org-4.2.5-1.el7.x86_64
--> Running transaction check
---> Package mongodb-org-mongos.x86_64 0:4.2.5-1.el7 will be installed
---> Package mongodb-org-server.x86_64 0:4.2.5-1.el7 will be installed
---> Package mongodb-org-shell.x86_64 0:4.2.5-1.el7 will be installed
---> Package mongodb-org-tools.x86_64 0:4.2.5-1.el7 will be installed
--> Finished Dependency Resolution

Dependencies Resolved

===========================================================================================================================================================================================================================================
 Package                                                       Arch                                              Version                                                  Repository                                                  Size
===========================================================================================================================================================================================================================================
Installing:
 mongodb-org                                                   x86_64                                            4.2.5-1.el7                                              mongodb-org-4.2                                            5.8 k
Installing for dependencies:
 mongodb-org-mongos                                            x86_64                                            4.2.5-1.el7                                              mongodb-org-4.2                                             14 M
 mongodb-org-server                                            x86_64                                            4.2.5-1.el7                                              mongodb-org-4.2                                             25 M
 mongodb-org-shell                                             x86_64                                            4.2.5-1.el7                                              mongodb-org-4.2                                             17 M
 mongodb-org-tools                                             x86_64                                            4.2.5-1.el7                                              mongodb-org-4.2                                             62 M

Transaction Summary
===========================================================================================================================================================================================================================================
Install  1 Package (+4 Dependent packages)

Total download size: 119 M
Installed size: 283 M
Downloading packages:
  고: /var/cache/yum/x86_64/7/mongodb-org-4.2/packages/mongodb-org-4.2.5-1.el7.x86_64.rpm: Header V3 RSA/SHA1 Signature, key ID 058f8b6b: NOKEY                                                          ]  0.0 B/s |    0 B  --:--:-- ETA
Public key for mongodb-org-4.2.5-1.el7.x86_64.rpm is not installed
(1/5): mongodb-org-4.2.5-1.el7.x86_64.rpm                                                                                                                                                                           | 5.8 kB  00:00:00
(2/5): mongodb-org-mongos-4.2.5-1.el7.x86_64.rpm                                                                                                                                                                    |  14 MB  00:00:01
(3/5): mongodb-org-shell-4.2.5-1.el7.x86_64.rpm                                                                                                                                                                     |  17 MB  00:00:00
(4/5): mongodb-org-tools-4.2.5-1.el7.x86_64.rpm                                                                                                                                                                     |  62 MB  00:00:01
(5/5): mongodb-org-server-4.2.5-1.el7.x86_64.rpm                                                                                                                                                                    |  25 MB  00:00:03
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
Total                                                                                                                                                                                                       28 MB/s | 119 MB  00:00:04
Retrieving key from https://www.mongodb.org/static/pgp/server-4.2.asc
Importing GPG key 0x058F8B6B:
 Userid     : "MongoDB 4.2 Release Signing Key <packaging@mongodb.com>"
 Fingerprint: e162 f504 a20c df15 827f 718d 4b7c 549a 058f 8b6b
 From       : https://www.mongodb.org/static/pgp/server-4.2.asc
Running transaction check
Running transaction test
Transaction test succeeded
Running transaction
  Installing : mongodb-org-tools-4.2.5-1.el7.x86_64                                                                                                                                                                                    1/5
  Installing : mongodb-org-mongos-4.2.5-1.el7.x86_64                                                                                                                                                                                   2/5
  Installing : mongodb-org-shell-4.2.5-1.el7.x86_64                                                                                                                                                                                    3/5
  Installing : mongodb-org-server-4.2.5-1.el7.x86_64                                                                                                                                                                                   4/5
Created symlink from /etc/systemd/system/multi-user.target.wants/mongod.service to /usr/lib/systemd/system/mongod.service.
  Installing : mongodb-org-4.2.5-1.el7.x86_64                                                                                                                                                                                          5/5
  Verifying  : mongodb-org-server-4.2.5-1.el7.x86_64                                                                                                                                                                                   1/5
  Verifying  : mongodb-org-4.2.5-1.el7.x86_64                                                                                                                                                                                          2/5
  Verifying  : mongodb-org-shell-4.2.5-1.el7.x86_64                                                                                                                                                                                    3/5
  Verifying  : mongodb-org-mongos-4.2.5-1.el7.x86_64                                                                                                                                                                                   4/5
  Verifying  : mongodb-org-tools-4.2.5-1.el7.x86_64                                                                                                                                                                                    5/5

Installed:
  mongodb-org.x86_64 0:4.2.5-1.el7

Dependency Installed:
  mongodb-org-mongos.x86_64 0:4.2.5-1.el7                    mongodb-org-server.x86_64 0:4.2.5-1.el7                    mongodb-org-shell.x86_64 0:4.2.5-1.el7                    mongodb-org-tools.x86_64 0:4.2.5-1.el7

Complete!
```

### Default directory 생성

```bash
mkdir -p /var/lib/mongo
mkdir -p /var/log/mongodb
```

`/var/lib/mongo`는 데이터베이스(DB)의 기본적인 엔진과 파일들이 설치되는 경로이며 파라미터 값 변경을 통해 바꿀 수 있습니다. 특별한 설정이 없다면, 기본 경로를 사용합니다.

`/var/log/mongodb`는 MongoDB의 로그 파일이 쌓이는 경로입니다. 역시 파라미터 값 변경을 통해 바꿀 수 있습니다.

### 권한 부여

```bash
chown -R mongod:mongod <directory>
```

생성한 디렉토리에 데이터를 쓰기 위해서는 mongod 라는 유저와 그룹 권한을 부여해야 합니다. 유저와 그룹은 yum 설치를 통해 기본으로 생성이 됩니다.

### MongoDB의 설정 파일

Yum으로 설치가 완료되면 `/etc/mongod.conf` 라는 MongoDB의 설정 파일이 생성 됩니다.

`mongod.conf` 파일의 내용을 아래와 같이 수정한다.

```yaml
# mongod.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/

# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /data_vol02/mongodb/log/mongod.log

# Where and how to store data.
storage:
  dbPath: /data_vol02/mongodb/db
  journal:
    enabled: true
    commitIntervalMs: 200
#  engine:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 2
      journalCompressor: snappy
      directoryForIndexes: false
    collectionConfig:
      blockCompressor: snappy
    indexConfig:
      prefixCompression: true

# how the process runs
processManagement:
  fork: true  # fork and run in background
  pidFilePath: /var/run/mongodb/mongod.pid  # location of pidfile
  timeZoneInfo: /usr/share/zoneinfo

# network interfaces
net:
  port: 27017
  bindIp: 127.0.0.1  # Enter 0.0.0.0,:: to bind to all IPv4 and IPv6 addresses or, alternatively, use the net.bindIpAll setting.

setParameter:
  enableLocalhostAuthBypass: false

#security:

#operationProfiling:

#replication:

#sharding:

## Enterprise-Only Options

#auditLog:

#snmp:
```

MongoDB의 configuration 포맷은  key = value 형식의 텍스트였는데 2.6버전에서 YAML 형식으로 변경되었습니다.

system log 설정 부분이다.

```yaml
systemLog:
  destination: file
  logAppend: true
  path: /data_vol02/mongodb/log/mongod.log
```

저는 경로를 변경해서 설치 했습니다.

경로를 지정하지 않거나, syslog로 지정하면 런타임의 standard output으로 출력합니다. 이외에도 quiet, verbosity, traceAllExceptions 등의 다양한 옵션이 있습니다.

`logAppend` 의 경우는 Default 는 false 입니다. true 일 경우에는 존재하는 파일의 맨 아래부분에 새로운 기록이 추가 됩니다. false 일 경우에는 존재하는 것들을 백업하고 새로운 로그파일을 작성합니다.

storage Engine 설정부분이다.

MongoDB의 storage engine은 3.2 버전부터 wiredTiger 엔진을 기본으로 사용해 왔다. 4.2 버전부터는 MMAPv1 스토리지 엔진은 더 이상 사용할 수 없다.

In-Memory 스토리지 엔진은 엔터프라이즈 에디션에서만 사용할 수 있다.

```yaml
storage:
   wiredTiger:
      engineConfig:
         cacheSizeGB: <number>
         journalCompressor: <string>
         directoryForIndexes: <boolean>
         maxCacheOverflowFileSizeGB: <number>
      collectionConfig:
         blockCompressor: <string>
      indexConfig:
         prefixCompression: <boolean>
```

기본 값으로 MongoDB는 cache 설정을 하지 않으면 Physical Memory에서 1GB를 뺀 값의 50%를 사용한다.

> 50% of (Total RAM Size – 1GB)

이 계산 값이 256MB보다 작으면 256MB를 사용한다.

`journal`은 저널링을 할 때 사용할 journal 의 허용여부 및 journal 의 commitInterval 등을 지정할 수 있습니다.

`journalCompressor`는 journal을 어떤 방식으로 압축할 것인지, 아니면 압축을 하지 않을 것인지를 지정하는 부분입니다.

`journalCompressor` 옵션은 4가지가 있습니다. 기본값은 snappy입니다.

- none
- snappy
- zlib
- zstd (4.2버전부터 추가)

`directoryForIndexes`는 인덱스를 dbpath와 분리하는 옵션입니다. 기본값은 false입니다.

MongoDB는 index라는 서브 디렉토리에 색인을 저장하고, collection이라는 서브 디렉토리에 콜렉션 데이터를 저장합니다.

true로 설정하는 경우 인덱스의 서브디렉토리로 인덱스를 분리 할 수 있는데, 운영중에는 심볼릭링크를 사용하여 분리할수 있고, 후에 MongoDB를 종료한 상태에서 분리된 경로를 심볼릭 링크를 사용한 경로로 옮겨주면 됩니다.

processManagement 옵션

```yaml
processManagement:
   fork: <boolean>
   pidFilePath: <string>
   timeZoneInfo: <string>
```

fork의 기본값은 false이지만, yum으로 설치하고 나면 true로 설정된 것을 확인할 수 있다. mongod, mongos는 기본적으로 daemon형태로 구동되지 않는데, ture로 되어 있는 경우 백그라운드에서 데몬을 활성화 시킵니다.

윈도우 버전에서는 지원하는 않는 설정값입니다.

이 밖에도 너무 많은 옵션이 있기 때문에 자세한 내용은 MongoDB 공식 홈페이지에서 확인하는 것이 좋습니다. 그리고 버전업이 될때마다 없어지는 값과 새로 생기는 값이 있으니 새버전이 릴리즈되면 한번씩 비교해보는 것도 좋겠습니다.

[MongoDB 공식 홈페이지, Documentation Page 바로가기](https://docs.mongodb.com/manual/reference/configuration-options/#processmanagement-options)

### MongoDB의 구동

YUM을 이용해 설치하면 CentOS 7 버전에서는 특별한 세팅 없이도 systemctl 명령을 통해 MongoDB를 구동할 수 있습니다.

```bash
systemctl start mongod
systemctl status mongod
systemctl stop mongod
systemctl enable mongod
systemctl disable mongod
systemctl restart mongod
```

MongoDB를 구동하면 처음에 경고 문구가 뜨며 Mongo shell로 접속을 합니다.

```
root@opendb01:/data_vol02/mongodb/db]# mongo
MongoDB shell version v4.2.5
connecting to: mongodb://127.0.0.1:27017/?compressors=disabled&gssapiServiceName=mongodb
Implicit session: session { "id" : UUID("d1a36dbd-c078-4d05-98c5-c70c91665858") }
MongoDB server version: 4.2.5
Server has startup warnings:
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten]
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] ** WARNING: Access control is not enabled for the database.
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] **          Read and write access to data and configuration is unrestricted.
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten]
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten]
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] ** WARNING: /sys/kernel/mm/transparent_hugepage/enabled is 'always'.
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] **        We suggest setting it to 'never'
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten]
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] ** WARNING: /sys/kernel/mm/transparent_hugepage/defrag is 'always'.
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] **        We suggest setting it to 'never'
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten]
---
Enable MongoDB's free cloud-based monitoring service, which will then receive and display
metrics about your deployment (disk utilization, CPU, operation statistics, etc).

The monitoring data will be available on a MongoDB website with a unique URL accessible to you
and anyone you share the URL with. MongoDB may use this information to make product
improvements and to suggest MongoDB products and deployment options to you.

To enable free monitoring, run the following command: db.enableFreeMonitoring()
To permanently disable this reminder, run the following command: db.disableFreeMonitoring()
---

>
```

```
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] ** WARNING: /sys/kernel/mm/transparent_hugepage/enabled is 'always'.
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] **        We suggest setting it to 'never'
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten]
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] ** WARNING: /sys/kernel/mm/transparent_hugepage/defrag is 'always'.
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] **        We suggest setting it to 'never'
```

해당 경고문을 제거하기 위해서는

```
[root@opendb01:/data_vol02/mongodb/db]# echo never > /sys/kernel/mm/transparent_hugepage/enabled

[root@opendb01:/data_vol02/mongodb/db]# echo never > /sys/kernel/mm/transparent_hugepage/defrag
```

확인해보면

```
cat /sys/kernel/mm/transparent_hugepage/enabled

always madvise [never]
```

[always]의 대괄호가 사라지고 never 부분에 [ ] 가 생겨있습니다.

그리고 mongod를 재구동하면 해당 경고 문구들은 사라집니다.

```
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] ** WARNING: Access control is not enabled for the database.
2020-04-03T09:29:12.353+0900 I  CONTROL  [initandlisten] **          Read and write access to data and configuration is unrestricted.
```

이부분은 엑세스 인증 부분인데 mongoDB를 설치하면 기본적으로 admin이라는 db가 생성됩니다. 이 admin db에 앞으로 생성할 db와 user를 관리할 수 있는 administrator 계정을 생성합니다.  
그리고 나서 administrator 계정을 통해 작업할 db와 그 db에 접근 가능한 user 계정을 만듭니다. 이후 user 계정으로 접속해 db 작업을 진행합니다. 그리고 mongod 실행 옵션에 –auth 옵션을 넣어주면 사라집니다.

`/usr/lib/systemd/system/mongod.service` 수정

```ini
ExecStart=/usr/bin/mongod $OPTIONS --auth
```
