---
date: 2021-01-08 14:15:50 +0900
title: "MongoDB Replica Set 세부 설정값 조정하기"
category: mongodb
excerpt: "Replica Set 세부 설정값 조정하기 복제에 관련된 설정된 값들, 현재 적용된 값을 확인하기 위해 지난 포스팅(MongoDB Replica Set 구성하기)에서 rs.conf() 명령어를 사용하면 된다고 했습니다. rs0:PRIMARY> rs.conf() { “_id” : “…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 필드 설명표의 `slaveDelay` 는 5.0 부터 `secondaryDelaySecs` 로 이름이 바뀌었고, `settings.getLastErrorDefaults`/`getLastErrorModes` 로 기본 write concern 을 지정하는 방식은 5.0 부터 불가하며 `setDefaultRWConcern` 을 써야 합니다. `priority`·`votes`·`hidden`·`buildIndexes` 와 readPreference 5종 설명은 현재도 유효합니다.

![MongoDB Replica Set](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## Replica Set 세부 설정값 조정하기

복제 관련 설정값과 현재 적용된 값을 확인하려면, 지난 포스팅([MongoDB Replica Set 구성하기](/writing/mongodb-replica-set-setup/ "MongoDB Replica Set 구성하기"))에서 소개한 `rs.conf()` 명령어를 사용하면 됩니다.

```bash
rs0:PRIMARY> rs.conf()
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

이렇게 확인할 수 있습니다.

|  |  |
| --- | --- |
| **필드** | **설명** |
| \_id | 구성원 멤버를 구분하는 값으로 0부터 시작하고, 멤버가 추가될 때 마다 1씩 증가해서 설정해야 한다. |
| arbiterOnly | 기본값은 false. 구성원을 arbiter로 설정하는 경우 true로 설정한다. |
| buildIndexes | priority가 0이 아닐때 기본값은 true. Primary를 따라 인덱스를 백업할 것인지를 정한다. |
| hidden | 기본값은 false. true로 바꾸면 드라이버가 구성원에 대한 명령을 내릴수 없고, isMaster() 명령으로 구성원의 정보를 확인할 수도 없다. |
| priority | 장애시 primary 선출을 위한 선거가 열렸을때 해당 구성원이 Primary로 선출될 상대적인 가능성을 의미한다. 값이 0인 경우 절대 Primary가 될 수 없다. |
| tags | 태그 도큐먼트를 넣어서 복제 구성원을 그룹에 따라 나눌수 있다. 태그를 이용하면 WriteConcern시 이용할 수 있다. |
| slaveDelay | 기본값은 0. Secondary가  Primary로부터 동기화 할 때 일정시간 딜레이를 가지고, 설정된 시간만큼 데이터를 유지한다. 딜레이 설정을 하게되면 priority 값은 0이 되어야 한다. |
| votes | 투표권은 기본적으로 구성원당 1표씩 가지고 있다. 이 값에 따라 선거 발생시 해당 구성원의 투표수가 결정된다. |

복제 옵션 값은 복제를 구성한 후에도 변경할 수 있으며, `rs.reconfig(<option>)`으로 변경합니다.

아래는 첫번째 구성원의 우선순위를 높이는 예제입니다.

```bash
rs0:PRIMARY> cfg=rs.conf();
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
rs0:PRIMARY> cfg.members[0].priority = 2;
2
rs0:PRIMARY> rs.reconfig(cfg);
{
  "ok" : 1,
  "$clusterTime" : {
    "clusterTime" : Timestamp(1610077259, 1),
    "signature" : {
      "hash" : BinData(0,"AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      "keyId" : NumberLong(0)
    }
  },
  "operationTime" : Timestamp(1610077259, 1)
}
rs0:PRIMARY> rs.conf();
{
  "_id" : "rs0",
  "version" : 2,
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

### 새로운 구성원 추가하기

`rs.add()` 명령어를 이용하여 추가할 수 있습니다.

```bash
> rs.add(
  {
    _id: <int>,
    host: <string>,
    arbiterOnly: <boolean>,
    buildIndexes: <boolean>,
    hidden: <boolean>,
    priority: <number>,
    tags: <document>,
    slaveDelay: <int>,
    votes: <number>
  }
)
```

### 구성원 제거 하기

`rs.remove()` 명령을 이용합니다.

```bash
> rs.remove("<hostname or ip or domain name")
```

### readPreference 설정

Secondary 노드가 동기화한 데이터를 읽기 작업에 활용하여 Primary의 부하를 분산할 수 있도록 설정하는 옵션입니다.

[![read Preference 모드 다이어그램](/assets/img/wp/2021/01/스크린샷-2021-01-08-오후-12.52.31.png)](https://docs.mongodb.com/manual/core/read-preference/)

read Preference

기본값일 때는 모든 작업이 Primary에서 동작합니다. 하지만 readPreference를 설정하면 읽기 작업을 Secondary에서 처리할 수 있습니다.

4.4 버전부터는 샤드 클러스터에 대한 hedged read를 지원합니다. hedged read를 사용하면 mongos 인스턴스는 쿼리 된 각 샤드 당 2 개의 복제본 세트 구성원으로 읽기 작업을 라우팅하고 샤드 당 첫 번째 응답자의 결과를 반환 할 수 있습니다.

nearest 옵션을 사용하면, 해당 구성원이 Primary인지 Secondary인지에 관계없이 네트워크 대기 시간이 가장 짧은 복제본 세트의 구성원에서 읽기 작업을 합니다.

readPreference 설정은 실제로 클라이언트의 드라이버에서 설정하는 것이기 때문에 개발 환경마다 설정하는 방법이 조금씩 다를 수 있습니다. 각 개발 언어별로 설정하는 법은 MongoDB API 문서([https://docs.mongodb.com/drivers/](https://docs.mongodb.com/drivers/ "https://docs.mongodb.com/drivers/"))에서 확인하시면 됩니다.

아래는 node.js에서 mongoose 모듈을 이용해 설정하는 방법입니다. (예제 출처: 맛있는 몽고DB 7장 복제)

```javascript
var opts = {
  replSet: {readPreference: 'ReadPreference.NEAREST'}
};
mongoose.connect('mongodb://<연결 주소> ', opts);
```

커서나 컬렉션을 불러올 때 readPreference 옵션을 사용하여 읽기 분산을 처리할 수 있습니다.

MongoDB의 공식 문서에 따르면 readPreference 옵션은 5가지가 있습니다.

- **primary**: 기본값이며, Primary 구성원으로부터 값을 읽고 오며, 딜레이 없이 데이터 수정 및 삽입 작업이 가능합니다.
- **primaryPreferred**: Primary 구성원으로부터 우선적으로 데이터를 읽어옵니다. 특별히 Primary 쪽의 읽기 작업이 밀려있지 않으면 Primaey에서 데이터를 가져오기 때문에 변경사항을 바로 확인 할 수 있습니다. 읽기가 밀려 있는 상태라면 Secondary에서 데이터를 읽어옵니다.
- **secondary**: 모든 읽기 작업을 Secondary 에서 처리합니다.
- **secondaryPreferred**: 우선적으로 읽기 작업이 발생하면 Secondary에 작업을 요청합니다. 하지만 모든 Secondary에서 작업이 밀려 있는 경우 Primary에 읽기 작업을 요청합니다.
- **nearest**: 해당 구성원이 Primary인지 Secondary인지에 관계없이 네트워크 대기 시간이 가장 짧은 복제본 세트의 구성원에서 읽기 작업을 합니다.

#### 참고 자료

도서 : 맛있는 몽고DB

도서: Real MongoDB

도서: 오픈소스 몽고DB

도서: MongoDB in Action

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
