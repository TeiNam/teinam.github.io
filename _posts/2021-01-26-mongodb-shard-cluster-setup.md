---
date: 2021-01-26 01:16:47 +0900
title: "MongoDB Shard Cluster 구성하기"
category: mongodb
excerpt: "MongoDB Shard Cluster 구성하기 MongoDB를 선택하는 큰 이유중에 하나는 바로 클라우드 환경에서 Scale-Out을 통한 부하 분산을 처리하기 위한 것이죠. MongoDB는 제 지인 말로 샤딩에, 샤딩을 위한, 샤딩에 의한! 데이터베이스라고 합니다. 자체적으로…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — config 서버를 레플리카 셋(`clusterRole: configsvr`)으로 구성하고 mongos 를 띄우는 큰 흐름은 여전히 맞지만, 이 글의 핵심인 샤드별 P-S-A(아비터 포함) 구성은 현재 공식 문서가 경고하는 구성입니다 — 샤드는 `w: majority` 쓰기를 사용하므로 데이터 보유 세컨더리가 빠지면 가용성을 잃습니다. 접속 예시의 `mongo` 셸은 6.0 에서 제거(`mongosh` 사용), `storage.journal.enabled` 는 6.1 이후 제거됐고, 8.0 부터는 전용 config 서버 대신 config shard 를 쓰는 선택지도 있습니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

### MongoDB Shard Cluster 구성하기

MongoDB를 선택하는 큰 이유중에 하나는 바로 클라우드 환경에서 Scale-Out을 통한 부하 분산을 처리하기 위한 것이죠. MongoDB는 제 지인 말로 샤딩에, 샤딩을 위한, 샤딩에 의한! 데이터베이스라고 합니다.

자체적으로 Shard Cluster 기능을 제공하기 때문에 샤드를 구성해보도록 하겠습니다.

![](/assets/img/wp/2021/01/스크린샷-2021-01-25-오후-6.10.04.png)

MongoDB Shard Cluster 구성 예시

제가 구성할 방법은 이런식으로 P-S-A 레플리카 셋 3개 세트와, Config 서버와 Mongos 통합 노드 3대, 총 10대의 노드를 가지고 구성할 예정입니다.

우선 P-S-A 구성을 하는데, Arbiter 서버는 한대만 구성하여 3개의 인스턴스를 각자 다른 포트로 올려 구동할 것 입니다. Arbiter 노드는 리소스를 많이 차지 않기 때문에 몇대를 올려서 사용해도 크게 무리가 없습니다.

#### Primary, Secondary 설정

Hostname에 ip는 `/etc/hosts` 파일에 자신이 사용할 ip와 함께 미리 정의 해두시기 바랍니다.

- **Primary hostname:** mongodbp01, mongodbp02, mongodbp03
- **Secondary hostname:** mongodbs01, mongodbs02, mongodbs03
- **Arbiter hostname:** monogarb

레플리카셋 구성

- rs0 – mongodbp01:27018, mongodbs01:27018, mongoarb:27021
- rs1 – mongodbp02:27018, mongodbs02:27018, mongoarb:27022
- rs2 – mongodbp03:27018, mongodbs03:27018, mongoarb:27023

MongoDB의 기본 포트 번호는 다음과 같습니다. [공식 Document](https://docs.mongodb.com/manual/reference/default-mongodb-port/) 참조.

- 27017 : MongoDB의 기본 포트 번호이자 샤드를 구성할 때 mongos가 이용하는 포트 번호
- 27018 : 샤드를 구성할 때 샤드 서버들이 사용하는 포트번호
- 27019 : Config 서버들이 사용하는 포트 번호

```yaml
$ vi /etc/mongod.conf
# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/
# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
# Where and how to store data.
storage:
  dbPath: /var/lib/mongo
  journal:
    enabled: true
    commitIntervalMs: 200
#  engine:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 4
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
  port: 27018
  bindIp: 0.0.0.0  # Enter 0.0.0.0,:: to bind to all IPv4 and IPv6 addresses or, alternatively, use the net.bindIpAll setting.
setParameter:
  enableLocalhostAuthBypass: false
#security:
#operationProfiling:
replication:
  replSetName: "rs0"
sharding:
  clusterRole: shardsvr
## Enterprise-Only Options
#auditLog:
#snmp:
```

replSetName: "rs0" 부분을 각 레플리카 셋에 맞게 수정합니다. 포트는 27018번을 사용합니다.

기존의 레플리카 설정과 거의 동일 합니다. 중요한 부분은 아래와 같이 샤드 서버로 사용할 것이라고 정의해주는 부분입니다.

```yaml
sharding: 
  clusterRole: shardsvr
```

#### Arbiter 설정

```yaml
$ vi /etc/mongod01.conf
# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/
# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod_arb01.log
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
  pidFilePath: /var/run/mongodb/mongod_arb01.pid  # location of pidfile
  timeZoneInfo: /usr/share/zoneinfo
# network interfaces
net:
  port: 27021
  bindIp: 0.0.0.0  # Enter 0.0.0.0,:: to bind to all IPv4 and IPv6 addresses or, alternatively, use the net.bindIpAll setting.
setParameter:
  enableLocalhostAuthBypass: false
#security:
#operationProfiling:
replication:
  replSetName: "rs0"
sharding:
  clusterRole: shardsvr
## Enterprise-Only Options
#auditLog:
#snmp:
```

Arbiter는 총 3대의 인스턴스를 올려야 하기 때문에 Port 번호는 27021,27022,27023 이렇게 3개의 포트 번호를 사용하여 올려줍니다. 그리고 각각의 mongod\_arb01.conf 안의 arb01 부분들을 02, 03 번으로 수정하여 생성해줍니다.

```bash
$ mongod -f /etc/mongod_arb01.conf
$ mongod -f /etc/mongod_arb02.conf
$ mongod -f /etc/mongod_arb03.conf
```

이렇게 3개의 Arbiter 노드를 구동합니다.

#### 레플리카 셋 구성

```javascript
> rs.initiate( {
   _id : "rs0",
   members: [
      { _id: 0, host: "mongodbp01:27018" },
      { _id: 1, host: "mongodbs01:27018" },
      { _id: 2, host: "mongoarb:27021", arbiterOnly:true }
   ]
})
{
  "ok" : 1,
  "$clusterTime" : {
    "clusterTime" : Timestamp(1609920364, 1),
    "signature" : {
      "hash" : BinData(0,"AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      "keyId" : NumberLong(0)
    }
  },
  "operationTime" : Timestamp(1609920364, 1)
}
```

rs0 ~ rs2 번까지 반복해서 3개의 레플리카 세트를 구성 완료합니다.

#### Config 서버 구성하기

Config 서버는 P-S-S의 3개 노드 레플리카 셋으로 구성합니다. 이번 테스트에서는 라우터 역할을 하는 mongos와 같은 노드에 Config 서버를 구성할 예정입니다.

mongos & config 서버들의 hostname

- mongosc01
- mongosc02
- mongosc03

Config 서버의 설정 파일 mongod\_cfg.conf 입니다.

```yaml
$ vi /etc/mongod_cfg.conf
# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/
# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod_cfg.log
# Where and how to store data.
storage:
  dbPath: /var/lib/mongo/cfg
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
  pidFilePath: /var/run/mongodb/mongod_cfg.pid  # location of pidfile
  timeZoneInfo: /usr/share/zoneinfo
# network interfaces
net:
  port: 27019
  bindIp: 0.0.0.0  # Enter 0.0.0.0,:: to bind to all IPv4 and IPv6 addresses or, alternatively, use the net.bindIpAll setting.
setParameter:
  enableLocalhostAuthBypass: false
#security:
#operationProfiling:
replication:
  replSetName: "cfgrepl"
sharding:
  clusterRole: configsvr
## Enterprise-Only Options
#auditLog:
#snmp:
```

주목해야할 부분은 아래입니다.

```yaml
replication: 
  replSetName: "cfgrepl" 
sharding: 
  clusterRole: configsvr
```

반드시 레플리카셋으로 구성하고, 레플리카 셋의 이름이 존재해야합니다. 그리고 configsvr로 샤드 설정을 해줘야합니다. 샤드서버와 다른 포트 번호가 필요합니다.

```bash
$ mongod -f /etc/mongod_cfg.conf
```

명령어를 통해 각각의 Config 서버를 구동합니다.

아니면 다음과 같은 명령어로 conf 파일에 설정없이 구동할 수도 있습니다.

```bash
mongod \
    --configsvr \
    --replSet "cfgrepl" \
    --dbpath /var/lib/mongo/cfg \
    --bind_ip_all
    --port 27019 \
    --fork --logpath /var/log/mongodb/mongo_cfg.log --logappend
```

Config 서버의 Primary에서만 한번 실행합니다.

```javascript
rs.initiate( {
   _id : "cfgrepl",
   members: [
      { _id: 0, host: "mongosc01:27019"},
      { _id: 1, host: "mongosc02:27019"},
      { _id: 2, host: "mongosc03:27019"}
   ]
})
```

#### mongos의 구동

mongos 는 일종의 Software Router입니다. yum을 통해 mongodb를 설치하고나면 같이 설치되는 패키지에 mongos 라는 패키지가 같이 설치됩니다.

mongos의 설정 파일입니다.

mongos.conf 수정

```yaml
# mongos.conf
    
sharding:
    configDB: "cfgrepl/mongosc01:27019,mongosc02:27019,mongosc03:27019"

systemLog:
    destination: file
    logAppend: true
    path: /var/log/mongodb/mongos.log
processManagement:
    fork: true

net:
    port: 27017
    bindIpAll: true
```

mongos 구동하기

```bash
$ mongos -f /etc/mongos.conf
```

#### 샤드 서버 추가하기

샤드 서버는 arbiter를 제외하고 Primary와 Secondary만을 추가 해줍니다.

아래와 같은 명령어로 mongos에 접속할 수 있습니다.

```bash
$ mongo localhost:27017
mongos>
```

그럼 일번적인 mongo shell과는 다르게 `mongos>` 이렇게 뜹니다.

```javascript
mongos> sh.addShard("rs0/mongodbp01:27018,mongodbs01:27018")
mongos> sh.addShard("rs1/mongodbp02:27018,mongodbs02:27018")
mongos> sh.addShard("rs2/mongodbp03:27018,mongodbs03:27018")
```

이렇게 해서 shard 서버가 정상 등록이 되면 이제부터는 샤드키를 설정해 컬렉션의 데이터를 분산 처리할 수 있습니다.

설정 완료 후 DB에 접속은 mongos의 hostname이나 ip를 이용해 27017 포트로 접속이 가능해 집니다.

샤드의 상태 확인은 `sh.status()` 명령으로 가능합니다.

샤드 설정은 이렇게 마무리 되었고, 다음 포스팅에서 샤드키를 정하고, 실제로 데이터가 분산되어 들어가는지 테스트 해보겠습니다.

##### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
