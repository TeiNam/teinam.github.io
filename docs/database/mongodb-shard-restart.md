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

샤드 클러스터는 등록된 Replica Set 과 Config 서버 등 여러 리소스가 물려 있어, 재구동 절차의 순서를 지켜야 한다.

## 종료 순서

1. **mongos 종료**

   1.1 밸런서를 비활성화해 청크 마이그레이션을 중지한다. 마이그레이션이 진행 중이면 밸런서는 중지되기 전에 그것을 마친다. 마이그레이션이 끝나기 전에는 메타데이터 쓰기 작업을 하지 않는다.

   ```javascript
   sh.stopBalancer()
   ```

   1.2 admin 데이터베이스에 접근해 각 mongos 라우터를 종료한다.

   ```javascript
   use admin
   db.shutdownServer()
   ```

2. **Shard Replica Set 종료** — 샤드에 포함된 레플리카 셋을 종료한다.

   ```javascript
   db.shutdownServer()
   ```

3. **Config 서버 종료** — 샤드에 포함된 Config 서버를 종료한다.

   ```javascript
   db.shutdownServer()
   ```

## 기동 순서

종료의 역순이다.

1. **Config 서버 기동** — systemctl 또는 설정 파일로 기동한다.

   ```bash
   $ systemctl start mongod

   # 또는
   $ mongod --config <path-to-config-file>
   ```

2. **Replica Set 기동** — 샤드에 포함된 Replica Set 을 기동한다.

   ```bash
   $ systemctl start mongod

   # 또는
   $ mongod --shardsvr --replSet <replSetname> --dbpath <path> --bind_ip localhost,<hostname(s)|ip address(es)>

   # 또는
   $ mongod --config <path-to-config-file>
   ```

3. **mongos 라우터 기동**

   3.1 mongos 라우터를 기동한다.

   ```bash
   $ mongos --config <path-to-config-file>
   ```

   3.2 밸런서를 다시 시작한다.

   ```javascript
   sh.startBalancer()
   ```

> **IMPORTANT** — 순서를 바꾸지 않는다
>
> 밸런서 → mongos → 샤드 → Config 서버 순으로 내리고, 기동은 그 역순이다. IP 를 바꾸거나 서버 구성을 변경했다면
> 설정 파일과 레플리카 셋 구성도 함께 고쳐야 한다.
