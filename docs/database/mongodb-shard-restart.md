---
title: "MongoDB 샤드 클러스터 재구동 순서"
permalink: /docs/database/mongodb-shard-restart/
breadcrumb: "Docs / Database"
description: "밸런서·mongos·샤드·config 서버의 종료와 기동 순서"
updated: 2026-09-19
redirect_from:
  - /writing/mongodb-shard-cluster-restart-order/
---

> **INFO** — 셸
>
> 아래 JavaScript 명령은 `mongosh` 에서 실행한다. 레거시 `mongo` 셸은 **6.0 에서 제거**됐다.

샤드 클러스터는 샤드 클러스터에 등록된 Replica Set과 Config 서버 등 다양한 리소스가 물려 있기 때문에 재구동 절차에도 신경을 써야 합니다.

## MongoDB Shard Cluster 종료

1. mongos 종료  
   1.1 밸런서 비활성화  
   밸런서를 비활성화하여 청크 마이그레이션을 중지합니다. 마이그레이션이 진행 중인 경우 밸런서는 중지하기 전에 진행 중인 마이그레이션을 완료해야 합니다. 마이그레이션 완료 전까지 메타데이터 쓰기 작업을 하면 안 됩니다.

   
```javascript
sh.stopBalancer()
```

   1.2 mongos 종료  
   admin 데이터베이스에 접근하여 각각의 mongos 라우터를 종료합니다.

   
```javascript
use admin
db.shutdownServer()
```

2. Shard Replica Set 종료  
   샤드에 포함되어 있는 레플리카 셋을 종료합니다.

   
```javascript
db.shutdownServer()
```

3. Config 서버 종료  
   샤드에 포함된 Config 서버를 종료합니다.

   
```javascript
db.shutdownServer()
```

## MongoDB Shard Cluster 구동

1. Config 서버 구동  
   systemctl 또는 설정 파일을 사용하여 구동합니다.

   
```bash
$ systemctl start mongod

or 

$ mongod --config <path-to-config-file>
```

2. Replica Set 구동  
   샤드에 포함된 Replica Set을 구동합니다.

   
```bash
$ systemctl start mongod

or 

$ mongod --shardsvr --replSet <replSetname> --dbpath <path> --bind_ip localhost,<hostname(s)|ip address(es)>

or 

$ mongod --config <path-to-config-file>
```

3. mongos 라우터 구동  
   3.1 mongos 구동  
   mongos 라우터를 구동합니다.

   
```bash
$ mongos --config <path-to-config-file>
```

   3.2 밸런서 시작

   
```javascript
mongos> sh.startBalancer()
```

이러한 절차로 MongoDB의 샤드 클러스터를 재구동합니다. 항상 순서를 주의해야 합니다.

> **주의:** IP 변경 작업이나 서버 단의 변경 작업이 있다면, 설정 파일이나 레플리카 셋의 구성 설정을 변경해야 하니 주의하시기 바랍니다.
