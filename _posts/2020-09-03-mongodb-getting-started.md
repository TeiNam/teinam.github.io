---
date: 2020-09-03 11:58:24 +0900
title: "MongoDB 시작하기"
category: mongodb
excerpt: "MongoDB 시작하기 데이터베이스 생성 만들고자 하는 데이터베이스 명을 use 뒤에 넣어줍니다. 바로 생성되는 것은 아니고 use database 후에 collection이 생성이 되면 database가 따라서 생성이 됩니다. Database의 이름을 변경하는 명령어는 존재하지…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — use, show dbs, db.dropDatabase(), db.getCollectionInfos(), db.serverStatus() 는 현재도 동일하게 동작합니다. 예제는 레거시 `mongo` 셸(6.0 에서 제거) 기준이고 출력에 찍힌 4.4.0 은 2024-02-29 EOL 버전이므로 `mongosh` 와 지원 버전(7.0 이상)으로 다시 확인해야 합니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

### MongoDB 시작하기

#### 데이터베이스 생성

생성할 데이터베이스 명을 use 뒤에 입력합니다. 바로 생성되지 않으며, use database 후에 collection이 생성되면 database가 생성됩니다.  
Database의 이름을 변경하는 명령어는 존재하지 않으며, 생성과 삭제만 가능합니다.

```bash
> use mydata
switched to db mydata

> db.createCollection("myCollections", { capped: true, size: 10000 })
{ "ok" : 1 }
}
```

이렇게 데이터베이스로 이동해서 collection을 생성하면 데이터베이스가 생성됩니다.

#### 데이터베이스 조회

show dbs로 조회한다. 생성된 데이터베이스의 목록과 사용 중인 용량을 보여준다.

```bash
> show dbs
admin   0.000GB
board   0.000GB
config  0.000GB
local   0.000GB
myData  0.000GB
testDB  0.000GB
```

db 명령으로 현재 접속되어 있는 데이터베이스를 알 수 있다.

```bash
> db
myData
```

#### 데이터베이스 삭제

use database 명령으로 생성된 해당 데이터베이스로 접속합니다. db.dropDatabase() 명령으로 데이터베이스를 삭제한다.

```bash
> use mydata
switched to db myData

> db.dropDatabase()
{ "dropped" : "myData", "ok" : 1 }

> show dbs 
admin 0.000GB 
config 0.000GB 
local 0.000GB 
testDB 0.000GB
```

#### 데이터베이스 상태 조회

- db.getCollectionInfos() – 현재 데이터베이스의 컬렉션들의 정보를 리스트로 반환합니다. 이름과 타입, UUID 정보를 얻습니다.

  
```json
> db.getCollectionInfos()
[
  {
    "name" : "myCollections",
    "type" : "collection",
    "options" : {
      "capped" : true,
      "size" : 10240
    },
    "info" : {
      "readOnly" : false,
      "uuid" : UUID("bde5b4cf-3a11-4028-a85a-c16b6b164601")
    },
    "idIndex" : {
      "v" : 2,
      "key" : {
        "_id" : 1
      },
      "name" : "_id_"
    }
  }
]
```

- db.serverStatus() – 호스트, 프로세스ID, LOCK 옵션, 스토리지 엔진 이름, 스토리지 엔진 통계와 같은 정보를 제공합니다.

  
```json
> db.serverStatus()
{
  "host" : "proj.rastalion.me",
  "version" : "4.4.0",
  "process" : "mongod",
  "pid" : NumberLong(16185),
  "uptime" : 560450,
  "uptimeMillis" : NumberLong(560450136),
  "uptimeEstimate" : NumberLong(560450),
  "localTime" : ISODate("2020-09-03T02:54:10.144Z"),
  "asserts" : {
    "regular" : 0,
    "warning" : 0,
    "msg" : 0,
    "user" : 65,
    "rollovers" : 0
  },
  "connections" : {
    "current" : 1,
    "available" : 51199,
    "totalCreated" : 5,
    "active" : 1,
    "exhaustIsMaster" : 0,
    "awaitingTopologyChanges" : 0
  },

생략....
```

- db.stats() – 데이터베이스 내의 컬렉션, 뷰, 오브젝트의 개수와 크기에 대한 통계를 제공합니다.

  
```json
> db.stats()
{
  "db" : "myData",
  "collections" : 1,
  "views" : 0,
  "objects" : 0,
  "avgObjSize" : 0,
  "dataSize" : 0,
  "storageSize" : 4096,
  "indexes" : 1,
  "indexSize" : 4096,
  "totalSize" : 8192,
  "scaleFactor" : 1,
  "fsUsedSize" : 3541184512,
  "fsTotalSize" : 990588170240,
  "ok" : 1
}
```

데이터베이스 생성과 조회, 삭제하는 법을 알아봤습니다. 다음 포스팅에서는 컬렉션에 대한 명령어들을 알아볼 예정입니다.

현재 MongoDB를 공부하면서 참고하는 것들입니다.

- MongoDB 공홈 및 Webinar
- 맛있는 MongoDB (도서)
- MongoDB in Action (도서)
- Real MongoDB (도서)
- Node.js와 flentd를 활용하여 배우는 오픈소스 몽고DB (도서)
