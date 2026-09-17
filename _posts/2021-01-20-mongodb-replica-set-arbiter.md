---
date: 2021-01-20 16:17:56 +0900
title: "MongoDB Replica Set에 Arbiter 추가 및 멤버 제거"
category: mongodb
excerpt: "MongoDB Replica Set에 Arbiter 추가 및 멤버 제거 아비터 추가하기 mongodb를 사양이 낮은 남는 서버나 다른 용도의 서버에 mongod을 띄웁니다. 한 노드에 여러개의 mongod를 포트만 다르게 해서 구동할 수 있습니다. 아비터로 쓸 mongod의 con…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — MongoDB 5.3 부터 하나의 레플리카 셋에 아비터를 2개 이상 두는 구성은 기본적으로 거부되므로(`allowMultipleArbiters=true` 필요) 본문처럼 아비터 인스턴스를 여러 개 붙이는 방식은 그대로 쓸 수 없습니다. 설정 파일의 `storage.journal.enabled` 도 6.1 이후 제거된 옵션입니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

### MongoDB Replica Set에 Arbiter 추가 및 멤버 제거

#### 아비터 추가하기

MongoDB를 사양이 낮은 남는 서버나 다른 용도의 서버에 mongod를 띄웁니다. 한 노드에 여러 개의 mongod를 포트만 다르게 해서 구동할 수 있습니다.

아비터로 쓸 mongod의 config 파일을 작성합니다.

1번 아비터 (mongod01.conf)

```yaml
$ vi /etc/mongod01.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/
# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod01.log
# Where and how to store data.
storage:
  dbPath: /var/lib/mongo/arb01
  journal:
    enabled: true
    commitIntervalMs: 200
#  engine:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1
      journalCompressor: snappy
      directoryForIndexes: false
    collectionConfig:
      blockCompressor: snappy
    indexConfig:
      prefixCompression: true
# how the process runs
processManagement:
  fork: true  # fork and run in background
  pidFilePath: /var/run/mongodb/mongod01.pid  # location of pidfile
  timeZoneInfo: /usr/share/zoneinfo
# network interfaces
net:
  port: 27017
  bindIp: 0.0.0.0  # Enter 0.0.0.0,:: to bind to all IPv4 and IPv6 addresses or, alternatively, use the net.bindIpAll setting.
setParameter:
  enableLocalhostAuthBypass: false
#security:
#operationProfiling:
replication:
  replSetName: "rs0"
#sharding:
## Enterprise-Only Options
#auditLog:
#snmp:
```

2번 아비터 (mongod02.conf)

```yaml
$ vi /etc/mongod02.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/
# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod02.log
# Where and how to store data.
storage:
  dbPath: /var/lib/mongo/arb02
  journal:
    enabled: true
    commitIntervalMs: 200
#  engine:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1
      journalCompressor: snappy
      directoryForIndexes: false
    collectionConfig:
      blockCompressor: snappy
    indexConfig:
      prefixCompression: true
# how the process runs
processManagement:
  fork: true  # fork and run in background
  pidFilePath: /var/run/mongodb/mongod02.pid  # location of pidfile
  timeZoneInfo: /usr/share/zoneinfo
# network interfaces
net:
  port: 27018
  bindIp: 0.0.0.0  # Enter 0.0.0.0,:: to bind to all IPv4 and IPv6 addresses or, alternatively, use the net.bindIpAll setting.
setParameter:
  enableLocalhostAuthBypass: false
#security:
#operationProfiling:
replication:
  replSetName: "rs0"
#sharding:
## Enterprise-Only Options
#auditLog:
#snmp:
```

1번과 2번의 설정 파일을 비교해보면 log 파일명, dbpath, pid 파일 이름, 포트 등이 다릅니다.

```bash
$ mongod -f /etc/mongod01.conf
$ mongod -f /etc/mongod02.conf
```

둘 다 구동해 주고 `ps -ef | grep mongod`로 두 개의 프로세스가 올라와 있는지 확인합니다.

확인되면 프라이머리 노드로 접속합니다.

`rs.addArb()` 명령으로 추가합니다. 한 번에 두 개가 진행되지 않으니 하나씩 진행합니다.

```json
> rs.addArb("mongodb0a:27017")
{
        "ok" : 1,
        "$clusterTime" : {
                "clusterTime" : Timestamp(1611125667, 1),
                "signature" : {
                        "hash" : BinData(0,"AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
                        "keyId" : NumberLong(0)
                }
        },
        "operationTime" : Timestamp(1611125667, 1)
}

> rs.addArb("mongodb0a:27018")
{
        "ok" : 1,
        "$clusterTime" : {
                "clusterTime" : Timestamp(1611125731, 1),
                "signature" : {
                        "hash" : BinData(0,"AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
                        "keyId" : NumberLong(0)
                }
        },
        "operationTime" : Timestamp(1611125703, 1)
}
```

`rs.conf()`로 확인합니다.

```json
rs0:PRIMARY> rs.conf()
{
        "_id" : "rs0",
        "version" : 4,
        "term" : 1,
        "protocolVersion" : NumberLong(1),
        "writeConcernMajorityJournalDefault" : true,
        "members" : [
                {
                        "_id" : 0,
                        "host" : "mongodb01:27017",
                        "arbiterOnly" : false,
                        "buildIndexes" : true,
                        "hidden" : false,
                        "priority" : 2,
                        "tags" : {

                        },
                        "slaveDelay" : NumberLong(0),
                        "votes" : 1
                },
                {
                        "_id" : 1,
                        "host" : "mongodb02:27017",
                        "arbiterOnly" : false,
                        "buildIndexes" : true,
                        "hidden" : false,
                        "priority" : 1,
                        "tags" : {

                        },
                        "slaveDelay" : NumberLong(0),
                        "votes" : 1
                },
                {
                        "_id" : 2,
                        "host" : "mongodb03:27017",
                        "arbiterOnly" : false,
                        "buildIndexes" : true,
                        "hidden" : false,
                        "priority" : 1,
                        "tags" : {

                        },
                        "slaveDelay" : NumberLong(0),
                        "votes" : 1
                },
                {
                        "_id" : 3,
                        "host" : "mongodb0a:27017",
                        "arbiterOnly" : true,
                        "buildIndexes" : true,
                        "hidden" : false,
                        "priority" : 0,
                        "tags" : {

                        },
                        "slaveDelay" : NumberLong(0),
                        "votes" : 1
                },
                {
                        "_id" : 4,
                        "host" : "mongodb0a:27018",
                        "arbiterOnly" : true,
                        "buildIndexes" : true,
                        "hidden" : false,
                        "priority" : 0,
                        "tags" : {

                        },
                        "slaveDelay" : NumberLong(0),
                        "votes" : 1
                }
        ],
        "settings" : {
                "chainingAllowed" : true,
                "heartbeatIntervalMillis" : 2000,
                "heartbeatTimeoutSecs" : 10,
                "electionTimeoutMillis" : 10000,
                "catchUpTimeoutMillis" : -1,
                "catchUpTakeoverDelayMillis" : 30000,
                "getLastErrorModes" : {

                },
                "getLastErrorDefaults" : {
                        "w" : 1,
                        "wtimeout" : 0
                },
                "replicaSetId" : ObjectId("5ff56f6c04715ea0b73976f7")
        }
}
```

3번, 4번을 보면 arbiterOnly라는 항목에 true 값을 가진 노드가 2개 추가되었습니다.

replica set을 구성하는 데 홀수 구성을 유지하기 위해 프라이머리 1대, 세컨더리 2대, 아비터 2대로 구성한 예시입니다.

실제로는 이렇게 많이 하는 경우는 드뭅니다. 하나의 노드에 아비터를 30대씩 띄워서 쓰는 곳도 있으니까요. 서버 자원과 시스템 환경에 맞게 구성하면 됩니다.

#### 레플리카셋 멤버 제거

멤버를 제거하는 절차는 아래와 같습니다.

1. 제거할 멤버의 mongod을 중지
2. 프라이머리에 접속
3. `rs.remove("mongod03:27017")` or `rs.remove("mongod3.example.net")`

레플리카셋에 대한 구성은 여기서 마무리하겠습니다.

##### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
