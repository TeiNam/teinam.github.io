---
date: 2021-01-06 17:33:13 +0900
title: "MongoDB Replica Set 구성하기"
category: mongodb
excerpt: "MongoDB 레플리카 셋 구성하기 MongoDB의 레플리카 셋 구성 기능은 데이터베이스의 고가용성 환경을 위해 필요한 기술입니다. DB 노드의 장애가 발생하거나, DB에 문제가 발생하는 경우에도 빠르게 장애에 대응하여 복구하는 시간을 줄일수 있는 장점을 갖게 합니다. MongoD…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 레플리카 셋 개념과 `rs.initiate()`·`rs.conf()` 절차는 현재도 유효하지만, 세컨더리 읽기용 `rs.slaveOk()`(=본문의 rs.slave0k)는 legacy `mongo` 셸 명령이며 mongosh 에서는 read preference 를 `secondary`/`secondaryPreferred` 로 지정하면 별도 호출이 필요 없습니다. `db.isMaster()` 대신 `db.hello()`, 출력의 `slaveDelay` 필드는 5.0 부터 `secondaryDelaySecs` 로 바뀌었습니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB 레플리카 셋 구성하기

MongoDB의 레플리카 셋 구성 기능은 데이터베이스의 고가용성 환경을 위해 필요한 기술입니다. DB 노드의 장애가 발생하거나, DB에 문제가 발생하는 경우에도 빠르게 장애에 대응하여 복구하는 시간을 줄일수 있는 장점을 갖게 합니다. MongoDB는 자체적인 기능으로 복제 기능을 지원합니다.

레플리카 셋의 가장 큰 목적은 서비스중인 MongoDB 인스턴스에 문제가 생겼을 때, 레플리카 셋의 구성원 중의 하나인 복제 노드가 장애 노드를 즉시 대체하는 것입니다. 어떠한 상황에서도 클라이언트와 DB와의 통신은 지속적으로 동작할 수 있도록 구성하는 가장 기본적인 물리적인 DB 설계 방식입니다.

MongoDB의 복제를 수행하기 위해서는 여러 mongod 인스턴스가 모인 레플리카 셋(묶음)이 필요로 합니다. 레플리카 셋의 구성원이 되면 서로의 정보를 동기화 합니다.

레플리카 셋은 세가지 역할로 구성원을 나눌수 있습니다.

- **프라이머리**: 클라이언트에서 DB로 읽기 및 쓰기 작업을 한다.
- **세컨더리**: 프라이머리로부터 데이터를 동기화 한다.
- **아비터**: 데이터를 동기화하지는 않으며 레플리카 셋의 복구를 돕는 역할을 한다.

레플리카 셋 안에서 구성원들 사이에는 주기적으로 10초에 한번씩 ping을 보내 서로의 노드를 확인하는 작업을 합니다. 이러한 작업은 MongoDB에서도 Heartbeat이라고 부르며, 이 기능을 통해 노드 및 DB의 장애를 파악합니다. 장애가 발견되면 세컨더리 노드중에 하나를 프라이머리로 올리게되는데 이때 투표권을 가진 노드들이 프라이머리로 올리게 될 노드를 결정하여 프라이머리로 승급시키게 됩니다.

MongoDB의 레플리카 셋 역시 최소 3대 이상의 구성원을 가지는 것을 권장하며, 홀수로 노드의 수를 늘리는 것을 권장하고 있습니다. 프라이머리의 장애를 감지했을때, 레플리카 셋이 프라이머리와 세컨더리 둘만으로 구성되어 있는 경우에는 프라이머리에서 장애가 발생했을때 세컨더리 노드만 남게되면 레플리카 셋의 다수의 멤버 투표를 할수 없는 상황이 만들어지고 세컨더리는 고립된 노드로 남기 때문에 레플리카 셋이 정상적으로 동작하지 않게 됩니다. 그래서 레플리카 셋은 최소 3개의 세트로 구성을 해야합니다.

만약 상황이 여의치 않을때 DB로 사용할 수 있는 노드가 2개로 제한되어 있으면, 기타 다른 용도의 노드에 아비터를 구성해 선거권만 주면 2대의 DB노드로도 레플리카 셋을 구성하는 것은 가능합니다. PostgreSQL의 포크인 EDB에서도 비슷한 기능이 있는데, 실제 데이터를 가지고 있지 않아도, 한개 노드가 장애가 발생 했을시 과반수 이상의 투표권을 가지는 노드가 존재하게 되서 세컨더리 노드를 프라이머리로 올리는 선거인단 역할을 하게 됩니다. 데이터를 쌓지 않기 때문에 어플리케이션 노드 또는 다른 용도의 노드에 아비터만 올려서 적은 리소스로도 사용이 가능합니다. 그러나 제 개인적인 경험으로는 실제 몽고를 구축해서 사용하는 곳에서 아비터를 구성해서 사용하는 곳은 본적이 없었습니다.

#### 

#### 프라이머리

레플리카 셋에서 프라이머리 노드는 단 하나만 존재 할 수 있습니다. 프라이머리만이 직접적으로 클라이언트와 정보를 주고 받기 때문에 프라이머리가 장애가 발생하거나 네트워크에 문제가 발생하면 실제 레플리카 셋이 구성되어 있더라도 세컨더리가 프라이머리로 올라오는 동안 실제 데이터를 읽고 쓰는 것이 일시적으로 중단될 수 있습니다.

#### 세컨더리

세컨더리의 가장 중요한 역할은 프라이머리 노드로부터 데이터를 동기화 하고, 장애시 프라이머리로의 역할 전환에 있습니다. 두번째, 프라이머리의 장애 상황에서 어떤 세컨더리 노드를 프라이머리로 올릴것인지 투표권을 가지고 있습니다.

세번째, 클라이언트의 읽기 작업을 분담할 수 있습니다. 이 것은 여타 다른 오픈소스 DBMS들 역시 가지고 있는 기능인데, DB의 작업들이 대부분 읽기에서 많이 발생하기 때문에 읽기 작업을 복제노드로 분산시켜 DB의 읽기 부하를 줄이는 역할을 합니다. 하지만 프라이머리와 세컨더리의 동기화 시간을 즉각적이지 않기 때문에 실시간 반영이 필요한 부분에서는 적용하기가 다소 어려운 부분이 있고, 실시간 반영이 필요하지 않는 부분에 있어서는 읽기 작업에 대한 역할을 세컨더리에 분산시켜 부하를 줄일수 있습니다.

마지막으로는 지연된 읽기 복제 기능입니다. 실제 프라이머리에 쓰기 작업을 발생하여 데이터가 생성되어도 일정시간 간격을 두고 복제를 진행하기 때문에 사람의 실수를 방지하고, 패치나 배치 작업 이후 DB를 되돌려야 하는 상황이 발생 했을때 지연된 시간만큼 원래 데이터로 복구가 가능해 집니다. 또 지연된 복제 기능으로 구성된 세컨더리 노드는 투표권이 없고, 장애 발생시 세컨더리 노드가 가지는 기능인 예비 프라이머리 노드의 역할을 하지 않습니다. 오로지 수동으로만 프라이머리로 승격이 가능합니다.

#### 아비터

아비터 노드의 역할은 위에서 설명했듯이 레플리카 셋을 3대 이상의 홀수로 구성할 수 없을시, 투표권만을 가지고 레플리카 셋을 모니터링하는 역할을 합니다.

레플리카 셋은 하나의 구역에 구성하는 것보다는 되도록이면 서로의 환경에서 독립하여 여러 지역으로 분산하는 것이 좋습니다.

### 레플리카 셋의 선거

레플리카 셋의 선거방법은 '구성원의 과반이 동의하는 것'을 기반으로 하고 있습니다. 2대의 노드로 구성했을 경우 프라이머리의 장애 발생시 세컨더리 노드가 혼자만 남기 때문에 heartbeat 역시 동작할 수 없는 환경이 되고, 선거에 동의할 노드가 1대밖에 남아있지 않게 되기 때문에 선거 자체가 열리지 않게 됩니다. 그리고 두대가 정상적으로 구동되더라도, 프라이머리 스스로가 heartbeat로 인식할 수 있는 구성원 수가 과반이 아니기 때문에 자동으로 세컨더리로 전환되게 됩니다. 그렇기 때문에 최소 레플리카 셋은 최소 3대의 노드로 구성하는 것입니다.

레플리카 셋으로 구성된 MongoDB에서 장애가 발생하면 우선순위가 가장 높은 세컨더리 노드에서 선거를 개최하고 프라이머리 후보가 됩니다. 이후 세컨더리 구성원들과 아비터 구성원들이 찬성표를 전달합니다. 과반이 넘으면 후보로 올라섰던 세컨더리가 프라이머리가 되고 선거가 종료됩니다.

우선순위가 높고 가장 최신의 정보를 가지고 있는 세컨더리가 프라이머리 후보가 됩니다. 하나의 레플리카 셋은 50개까지 구성원을 가질수 있지만, 투표권을 가지는 노드는 최대 7개까지만 구성할 수 있습니다. 선거가 끝나고 선출된 프라이머리 보다 최신의 데이터를 가진 세컨더리가 있는 경우 해당 구성원은 새로운 프라이머리에 맞춰 데이터를 Rollback 합니다. 이렇게 하지 않으면 세컨더리와 프라이머리가 가진 정보가 달라 동기화가 되지 않기 때문입니다. 이 Rollback에 의해 데이터가 손실되는 경우가 발생 할 수 있으니, WrtieConcern을 옵션을 조정해서 쓰기 작업에 대한 Rollback를 방지할 수 있습니다.

### 레플리카 셋 구성하기

`/etc/mongod.conf` 파일에 아래와 같은 내용을 설정해 줍니다.

> **주의:** Bind IP 0.0.0.0 모든 노드에 대한 접속을 허용하는 것인데 보안에 취약할 수 있으니 반드시 DB에 암호 설정을 하고 진행하시기 바랍니다.

```yaml
replication:
   replSetName: "rs0"
net:
   bindIp: 0.0.0.0
```

mongo에 접속해서 `rs.initiate()` 라는 명령으로 레플리카 셋을 구성할 것인데 이 명령어는 반드시 하나의 노드에서 한번만 실행해야 합니다.

```bash
> rs.initiate( {
   _id : "rs0",
   members: [
      { _id: 0, host: "mongodb01:27017" },
      { _id: 1, host: "mongodb02:27017" },
      { _id: 2, host: "mongodb03:27017" }
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

설정이 완료되었습니다.

\_id: "<레플리카 셋 이름>"

host: "구성원들의 ip 또는 도메인 주소"

를 넣으면 됩니다.

레플리카 셋의 정보를 `rs.conf()` 명령을 통해 아래와 같이 확인할 수 있습니다.

```json
> rs.conf()
{
  "_id" : "rs0",
  "version" : 1,
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
      "priority" : 1,
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

어떤 노드가 프라이머리가 되었는지 확인해 볼까요? `rs.isMaster()` 명령으로 확인이 가능합니다.

```json
> db.isMaster()
{
  "topologyVersion" : {
    "processId" : ObjectId("5ff56d3c04715ea0b73976cc"),
    "counter" : NumberLong(6)
  },
  "hosts" : [
    "mongodb01:27017",
    "mongodb02:27017",
    "mongodb03:27017"
  ],
  "setName" : "rs0",
  "setVersion" : 1,
  "ismaster" : true,
  "secondary" : false,
  "primary" : "mongodb01:27017",
  "me" : "mongodb01:27017",
  "electionId" : ObjectId("7fffffff0000000000000001"),
  "lastWrite" : {
    "opTime" : {
      "ts" : Timestamp(1609920445, 1),
      "t" : NumberLong(1)
    },
    "lastWriteDate" : ISODate("2021-01-06T08:07:25Z"),
    "majorityOpTime" : {
      "ts" : Timestamp(1609920445, 1),
      "t" : NumberLong(1)
    },
    "majorityWriteDate" : ISODate("2021-01-06T08:07:25Z")
  },
  "maxBsonObjectSize" : 16777216,
  "maxMessageSizeBytes" : 48000000,
  "maxWriteBatchSize" : 100000,
  "localTime" : ISODate("2021-01-06T08:07:31.852Z"),
  "logicalSessionTimeoutMinutes" : 30,
  "connectionId" : 6,
  "minWireVersion" : 0,
  "maxWireVersion" : 9,
  "readOnly" : false,
  "ok" : 1,
  "$clusterTime" : {
    "clusterTime" : Timestamp(1609920445, 1),
    "signature" : {
      "hash" : BinData(0,"AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      "keyId" : NumberLong(0)
    }
  },
  "operationTime" : Timestamp(1609920445, 1)
}
```

확인해보니 MongoDB01이 프라이머리가 되었습니다.

1번 노드에서 mongo에 접속하면 아래와 같이 나옵니다.

```text
rs0:PRIMARY>
```

2,3번 노드에서는 세컨더리라고 표기 됩니다.

```text
rs0:SECONDARY>
```

세컨더리 노드에서는 Mongo Shell을 이용할 수 없기 때문에 `rs.slave0k()`명령어를 입력해야 shell을 사용할 수 있습니다.

```bash
rs0:SECONDARY> rs.slave0k()
```

이렇게 레플리카 셋 구성을 완료 했습니다.  
다음 포스팅은 레플리카 셋의 config를 변경하는 법과 세컨더리 노드를 읽기 노드로 설정하는 법을 포스팅할 예정입니다.

#### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
