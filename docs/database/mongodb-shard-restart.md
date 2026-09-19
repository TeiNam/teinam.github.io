---
title: "MongoDB 샤드 클러스터 재구동 순서"
permalink: /docs/database/mongodb-shard-restart/
breadcrumb: "Docs / Database"
description: "MongoDB 8.0 기준 클러스터 전체 정지·기동 런북. 밸런서·mongos·샤드·config 서버의 순서와 단계별 확인"
updated: 2026-09-20
redirect_from:
  - /writing/mongodb-shard-cluster-restart-order/
---

> **INFO** — 기준과 적용 범위
>
> 기준 버전은 **MongoDB 8.0** 이고, 7.0 에서만 달라지는 지점은 본문에 버전을 붙여 표시한다.
> 이 문서는 **클러스터 전체를 정지하고 다시 올리는** 절차다. 무중단 롤링 재시작과 비계획 복구는
> 과반 유지 규칙과 확인 항목이 달라 이 절차로 대체할 수 없다.
> JavaScript 명령은 모두 `mongosh` 에서 실행한다. 레거시 `mongo` 셸은 6.0 에서 제거됐고, 6.0 자체도
> 2025-07-31 에 EOL 을 지났다.

샤드 클러스터 전체를 껐다 켜는 단일 공식 튜토리얼은 없고, 아래 순서는 배포·복원·백업·가용성 문서가 서술하는 동작에서 도출한 것이다.

순서를 지켜야 하는 이유는 두 가지다. 밸런서를 멈추는 `sh.stopBalancer()` 는 `mongos` 에서만 실행되므로 라우터를 먼저 내리면 밸런서를 정지할 수단이 사라진다. 그리고 config 서버는 남은 구성요소가 자기 종료를 깨끗하게 마치는 데 필요하므로 마지막에 내린다. 종료는 밸런서 → mongos → 샤드 → config 서버 순서이고, 기동은 그 역순이다.

## 전제와 접속 지점

### 전제

이 절차는 **dedicated config server 를 전제한다.** 8.0 부터는 config 서버가 애플리케이션 데이터까지 저장하는 **config shard** 구성이 가능하고, 이때는 config 서버 역할이 기존 샤드의 레플리카 셋에 합쳐져 아래 "샤드 종료"와 "config 서버 종료"가 같은 노드를 가리킨다. 시작 전에 확인한다.

```javascript
sh.isConfigShardEnabled()   // 출력에 enabled: true 면 config shard
db.adminCommand({ listShards: 1 })["shards"].find(element => element._id === "config")
```

`_id: "config"` document 가 나오면 config shard 다.

인증이 켜져 있으면 `db.shutdownServer()` 는 인증된 연결에서 실행해야 하고 `shutdown` 권한이 필요하다. 내장 역할 `hostManager` 가 이 권한을 가진다. 인증이 꺼져 있으면 localhost 인터페이스로 접속한 클라이언트에서만 실행된다(예: `mongosh --host "127.0.0.1"`).

> **WARNING** — 샤드에 직접 붙는 작업이다
>
> 이 절차의 종료 단계는 각 샤드와 config 서버에 직접 접속해 명령을 실행한다. 8.0 에는 이런 정비를 위한
> `directShardOperations` 역할이 있고, 이 역할로 명령을 실행하면 **클러스터가 정상 동작을 멈추거나 데이터가
> 손상될 수 있다**는 경고가 붙는다. 정비 목적으로만 쓰고, 작업이 끝나면 역할 사용을 멈춘다.

### 어디에 접속해 실행하는가

| 명령 | 접속 지점 |
|---|---|
| `sh.stopBalancer()` · `sh.startBalancer()` · `sh.status()` · `sh.getBalancerState()` | 클러스터의 아무 `mongos` |
| `db.getSiblingDB("admin").shutdownServer()` | 종료할 노드에 직접 접속한 셸 |
| `rs.status()` · `db.hello()` · `rs.printSecondaryReplicationInfo()` | 대상 레플리카 셋의 멤버 |
| `systemctl` · `mongod` · `mongos` | 해당 호스트의 OS 셸 |

`sh.*` 메서드를 `mongod` 에서 실행하면 에러가 난다. 공식 밸런서 관리 절차가 매번 "클러스터의 아무 `mongos` 에 접속한다"로 시작하는 이유다.

## 사전 점검

| 점검 | 명령 |
|---|---|
| 클러스터 전체 상태 | `sh.status()` 또는 `sh.status(true)` |
| config shard 여부 (8.0+) | `sh.isConfigShardEnabled()` |
| 샤드 ID 목록 | `db.adminCommand({ listShards: 1 })` |
| 멤버 상태 | `rs.status()` |
| 프라이머리 판별 | `db.hello()` 의 `isWritablePrimary` |
| 복제 지연 | `rs.printSecondaryReplicationInfo()` |
| 밸런서 상태 | `sh.getBalancerState()` · `sh.isBalancerRunning()` |
| 메타데이터 정합성 기준선 (7.0+) | `db.runCommand( { checkMetadataConsistency: 1 } )` |

`sh.status()` 는 청크가 20개 이상이면 상세를 생략한다. `sh.status(true)` 는 활성 mongos 인스턴스 상세까지 출력한다.

> **IMPORTANT** — 복제 지연이 크면 프라이머리가 종료되지 않는다
>
> 프라이머리는 step down 전에 `timeoutSecs` 만큼 electable 노드가 따라잡기를 기다린다. 프라이머리로부터
> 10초 안에 들어오는 세컨더리가 없으면 `mongod` 는 종료하지 않겠다는 메시지를 반환한다. 종료 전에
> `rs.printSecondaryReplicationInfo()` 로 지연을 확인하고 크면 먼저 회수한다. 여기서 막힌다고 `force: true`
> 로 도피하면 미복제 쓰기가 롤백될 수 있다.

### 진행 중 인덱스 빌드

인덱스 빌드가 돌고 있으면 `db.shutdownServer()` 가 실패한다. admin 데이터베이스를 대상으로 확인한다.

```javascript
db.getSiblingDB("admin").aggregate( [
   { $currentOp : { idleConnections: true } },
   { $match: { $or: [
       { "op": "command", "command.createIndexes": { $exists: true } },
       { "op": "none", "msg": /^Index Build/ }
   ] } }
] )
```

결과가 한 건도 나오지 않으면 진행 중인 빌드가 없다. 이 파이프라인은 커서를 돌려주므로 문서가 하나라도 나오면 그 내용에서 대상 네임스페이스를 확인한다.

commit quorum 기본값은 `"votingMembers"` 다. 데이터를 가진 투표 노드가 닿지 않게 되면 빌드가 그 노드가 돌아올 때까지 **hang** 할 수 있다. 빌드 중에 노드를 하나 내리는 것만으로 나머지 노드의 빌드가 멈춘다. 진행 중인 빌드를 `killOp` 으로 정리해서는 안 된다.

### 진행 중 resharding

```javascript
db.getSiblingDB("admin").aggregate([
  { $currentOp: { allUsers: true, localOps: false } },
  { $match: { type: "op",
      "originatingCommand.reshardCollection": "<database>.<collection>" } }
])
```

진행 정보는 `totalOperationTimeElapsedSecs` 와 `remainingOperationTimeEstimatedSecs` 로 나온다. 남은 시간은 새 resharding 이 시작되면 `-1` 이고, 값이 갱신되는 것을 보려면 파이프라인을 계속 실행해야 한다. resharding 은 최소 5분이 걸리고 config 서버 프라이머리가 항상 코디네이터이며, commit 단계에 들어가면 `abortReshardCollection` 으로 끝낼 수 없다. **resharding 중에는 클러스터를 내리지 않는다.**

8.0 의 `moveCollection` · `unshardCollection` 도 최소 5분이 걸리고, 진행 중에는 `addShard` · `removeShard` · `dropDatabase` 와 config 서버 전환이 막힌다. 중단은 `abortMoveCollection` · `abortUnshardCollection` 이다.

## 종료 순서

### 1. 밸런서 정지

`mongos` 에 접속해 실행한다. `sh.stopBalancer()` 는 `mongos` 에서만 실행되고 `mongod` 에서 실행하면 에러가 난다. 즉 밸런서 정지는 **mongos 가 살아 있어야 가능한 선행 단계**이고, 라우터를 내리기 전에 끝내야 한다.

```javascript
sh.stopBalancer()
db.adminCommand( { balancerStop: 1 } )   // 드라이버·스크립트용 동등 커맨드
```

옵션은 `timeout`(기본 60000 ms)과 `interval`(밸런싱 라운드 정지 확인 주기)이다. 둘 다 생략하면 밸런서를 무기한 비활성화하고, 전체 정지에서는 이 동작이 맞다. 7.0 이상에서는 밸런서를 멈추면 **AutoMerger 도 함께 비활성화**된다.

밸런싱 라운드가 진행 중이면 작업은 밸런싱 완료를 기다린다. 정지는 즉시 이뤄지지 않고 진행 중인 청크 이동을 마친 뒤 이후 라운드를 멈춘다. 따라서 **정지 완료를 확인하는 단계가 필요하다.** 먼저 밸런서가 다시 시작되지 않는지 본다.

```javascript
sh.getBalancerState()   // false
```

이 메서드는 밸런서가 활성화되어 있는지만 보고 실제로 데이터를 옮기는 중인지는 보지 않는다. 진행 중인 마이그레이션까지 확인하려면 `sh.isBalancerRunning()` 을 폴링한다.

```javascript
use config
while( sh.isBalancerRunning().mode != "off" ) { print("waiting..."); sleep(1000); }
```

> **WARNING** — 반환값은 document 다
>
> `sh.isBalancerRunning()` 은 boolean 이 아니라 document 를 반환한다. `while( sh.isBalancerRunning() )`
> 처럼 반환값 자체를 조건으로 쓰면 밸런서가 멈춘 뒤에도 항상 참이 되어 루프가 끝나지 않는다.
> 공개된 밸런서 관리 페이지와 파일시스템 스냅샷 백업 페이지의 대기 루프 스니펫은 이 점에서 다르다.
> 문서화된 반환 형식과 맞는 **`.mode != "off"` 형태**를 쓰고 `!sh.isBalancerRunning()` 같은 부정형
> 단축은 쓰지 않는다.

`mode` 가 `"off"` 면 밸런서 스레드가 멈춰 청크 밸런싱이 일어날 수 없는 상태이고, `"full"` 이면 스레드가 돌고 있다는 뜻이다. 같은 document 의 `inBalancerRound` 는 현재 라운드 진행 여부, `numBalancerRounds` 는 config 서버 기동 이후 라운드 수이며 config 서버를 재시작하면 `0` 으로 초기화된다.

`sh.status()` 의 balancer 섹션도 실용적이다. 활성 마이그레이션이 없으면 `Collections with active migrations` 필드가 출력에 **나타나지 않는다.**

```text
balancer:
      Currently enabled:  yes
      Currently running:  yes
      Collections with active migrations:
              config.system.sessions started at Fri May 15 2020 17:38:12 GMT-0400 (EDT)
      Failed balancer rounds in last 5 attempts:  0
```

`Failed balancer rounds in last 5 attempts` 는 청크 마이그레이션이 실패할 때 올라가고, `Migration Results for the last 24 hours` 는 밸런서가 시작하지 않은 마이그레이션까지 포함한다. 컬렉션 단위 확인은 `sh.balancerCollectionStatus(<ns>)` 다. 정상이면 `{ "balancerCompliant": true, "ok": 1 }` 이고, 아니면 `firstComplianceViolation` 에 원인이 담긴다.

> **IMPORTANT** — 밸런서만 멈추면 되는 것이 아니다
>
> 일관된 상태로 클러스터를 세우려면 **밸런서 정지 · 쓰기 중지 · 스키마 변환 작업 중지** 세 가지가 필요하다.
> 청크 마이그레이션, resharding, 스키마 마이그레이션이 모두 불일치를 만들 수 있고, 밸런서 정지는 이 중
> **청크 마이그레이션만** 덮는다. resharding · `moveCollection` · `unshardCollection` 은 밸런서와 별개로
> 돌기 때문에 사전 점검에서 따로 확인한다.

밸런서를 오래 꺼 두면 샤드가 불균형해져 성능이 떨어지므로 기동 후 재시작 단계를 빠뜨리지 않는다.

### 2. mongos 종료

각 `mongos` 에 직접 접속해 종료한다. `mongos` 는 영속 상태를 유지하지 않고 재시작으로 상태나 데이터를 잃지 않으므로 라우터 사이의 순서는 상관없다.

게이트는 **모든 라우터가 내려갔는지**다. 종료 대상 호스트 목록과 대조해 하나도 남지 않았는지 확인한 뒤 다음 단계로 간다. 살아 있는 `mongos` 가 하나라도 있으면 쓰기가 계속 들어와 다음 단계에서 샤드 프라이머리가 step down 하지 못한다.

```javascript
db.getSiblingDB("admin").shutdownServer({ "timeoutSecs": 60 })
```

`db.shutdownServer()` 는 admin 데이터베이스를 대상으로 실행해야 한다. 5.0 이상에서 `mongod` 와 `mongos` 는 종료 전에 **quiesce period** 에 들어가 진행 중인 작업이 끝날 시간을 준다. `mongos` 는 5.0 부터 `timeoutSecs` 를 quiesce period 로 쓴다(5.0 미만은 즉시 종료한다). 종료 중인 노드에는 클라이언트가 새 연결을 열 수 없다.

드라이버나 스크립트에서는 커맨드 형태(`db.adminCommand( { shutdown: 1, timeoutSecs: <int>, comment: <any> } )`)를 쓴다. `comment` 는 로그와 profiler, `currentOp` 출력에 함께 남아 작업 추적에 쓸 수 있다.

### 3. 샤드 레플리카 셋 종료

레플리카 셋 안에는 순서가 있다. **세컨더리를 먼저, 프라이머리를 마지막에** 내린다. 각 멤버에 접속해 역할을 먼저 판별한다.

```javascript
db.hello().isWritablePrimary   // false = 세컨더리, true = 프라이머리
```

`isWritablePrimary` 가 `false` 인 멤버부터 종료한다. 같은 레플리카 셋의 다른 멤버 목록은 `rs.status()` 로 확인한다.

```javascript
db.getSiblingDB("admin").shutdownServer({ "timeoutSecs": 60 })
```

기본 `timeoutSecs` 값은 문서 사이에 다르게 적혀 있으므로 이 런북은 기본값에 의존하지 않고 위처럼 필요한 값을 직접 명시한다.

세컨더리를 모두 내리면 프라이머리는 과반이 오프라인이 된 것을 감지한 뒤 **자동으로 step down 한다.** `db.hello()` 가 `isWritablePrimary: false` 를 반환하면 그때 `mongod` 를 안전하게 종료한다. 프라이머리 교체를 직접 통제해야 한다면 `rs.stepDown(300)` 을 쓴다. 300초를 지정하면 그 멤버가 5분 동안 다시 프라이머리로 선출되지 않는다.

프라이머리 종료는 세컨더리로 step down 시도 → quiesce period → 남은 연산 종료 → 종료 순으로 진행된다. step down 이 실패하면 커맨드 경로에서는 `force` 필드가 `true` 일 때만 종료 단계를 계속한다.

> **WARNING** — `force: true` 는 마지막 수단이다
>
> 강제 종료는 진행 중인 작업을 중단시키고 예상치 못한 동작을 낳을 수 있다. 특히 **프라이머리를 강제
> 종료하면 세컨더리로 복제되지 않은 쓰기가 롤백될 수 있다.** 인덱스 빌드 때문에 종료가 실패하는
> 경우에는 `force: true` 로 빌드 진행 상태를 디스크에 저장할 수 있고, `mongod` 는 재시작할 때 저장된
> 체크포인트에서 빌드를 이어받는다. 이 재개는 한 번만 보장된다.

### 4. config 서버 종료

config 레플리카 셋도 세컨더리 먼저, 프라이머리 마지막으로 내린다. 판별과 명령은 샤드와 동일하다.

```javascript
db.hello().isWritablePrimary
db.getSiblingDB("admin").shutdownServer({ "timeoutSecs": 60 })
```

config 서버를 가장 마지막에 두는 근거는 네 가지 동작에서 도출된다.

- 밸런서 정지 자체가 config 서버 프라이머리로의 쓰기다. config 서버에 쓸 때 MongoDB 는 write concern `"majority"` 를, 읽을 때는 read concern `"majority"` 를 쓴다.
- 밸런서 프로세스는 `mongos` 에서 **config 레플리카 셋의 프라이머리 멤버로 옮겨졌다.** 밸런서는 그 프라이머리에서 돈다.
- 청크 마이그레이션 커밋이 config 서버 접속에 실패하면 `moveChunk commit failed` 와 `ERROR: TERMINATING` 이 기록되고, **해당 샤드 레플리카 셋의 프라이머리가 데이터 일관성을 지키기 위해 스스로 종료한다.**
- config 레플리카 셋이 프라이머리를 잃고 새로 선출하지 못하면 메타데이터가 **read only** 가 된다. 샤드 데이터는 읽고 쓸 수 있지만 청크 마이그레이션과 분할이 멈춘다. config 서버가 전부 사용 불가가 되면 **클러스터가 동작하지 못하는 상태가 될 수 있다.**

즉 config 서버는 다른 구성요소가 자기 종료를 깨끗하게 마치기 위해 필요한 쪽이므로 마지막이다.

게이트는 **종료 대상 노드가 모두 내려갔는지**다. 이 단계가 끝나면 클러스터 전체가 정지 상태이므로 확인할 상대 노드가 남지 않는다. 각 호스트에서 프로세스가 끝났는지와 종료 로그가 clean shutdown 으로 끝났는지를 직접 본다. 여기서 비정상 종료가 섞였다면 기동 뒤 「계획 정비와 비계획 재시작」 절의 확인 항목을 함께 돌린다.

## 기동 순서

### 1. config 서버 기동

패키지로 설치한 환경이라면 **운영체제의 init 시스템으로 프로세스를 관리하는 것이 공식 권고다.** 어느 init 시스템인지 먼저 판별한다.

```bash
ps --no-headers -o comm 1    # systemd 면 systemctl, init 이면 service
```

```bash
sudo systemctl start mongod
sudo systemctl status mongod     # 프로세스가 정상 기동했는지 확인
sudo systemctl enable mongod     # 재부팅 후 자동 시작
```

`mongodb-org-server` 패키지는 `mongod` 데몬과 함께 init 스크립트, 설정 파일 `/etc/mongod.conf` 를 제공한다. `Failed to start mongod.service: Unit mongod.service not found.` 가 나오면 `sudo systemctl daemon-reload` 를 먼저 실행한다. init 시스템이 없는 tarball·컨테이너 환경에서는 설정 파일을 지정해 직접 띄운다.

```bash
mongod --config /etc/mongod.conf
```

> **IMPORTANT** — 수동 기동은 실행 사용자가 달라진다
>
> init 시스템은 유닛 파일이 지정한 사용자로 프로세스를 띄운다. 배포판에 따라 `mongod`(RHEL·SUSE·Amazon)
> 또는 `mongodb`(Ubuntu·Debian)다. 셸에서 직접 띄우면 셸을 실행한 사용자가 되므로 데이터·로그 디렉터리
> 소유권이 어긋날 수 있고, 실행 사용자를 바꿀 때는 두 디렉터리 권한도 함께 고쳐야 한다. 설정 파일
> 변경은 기동 시점에 적용되므로 기동 중에 파일을 고쳤다면 재시작해야 반영된다.

여기에 **게이트를 둔다.** `rs.status()` 로 config 레플리카 셋이 올라와 프라이머리를 선출한 것을 확인한 뒤 다음 단계로 간다. 로그는 `/var/log/mongodb/mongod.log` 를 보고, 수동 기동이면 `[initandlisten] waiting for connections on port 27017` 줄로 기동 성공을 확인한다.

### 2. 샤드 레플리카 셋 기동

각 샤드의 모든 멤버를 기동한다. 명령은 config 서버와 같고, 설정 파일이 샤드 역할과 레플리카 셋 이름을 들고 있어야 한다.

```yaml
sharding:
  clusterRole: shardsvr
replication:
  replSetName: <shard replica set name>
storage:
  dbPath: <data directory>
net:
  bindIp: localhost,<hostname(s)|ip address(es)>
```

`mongod` 와 `mongos` 는 기본적으로 localhost 에만 바인딩하므로, `net.bindIp` 를 지정하지 않으면 원격 클라이언트가 접속할 수 없다.

게이트는 `rs.status()` 다. 프라이머리가 선출됐는지, 그리고 세컨더리가 **`RECOVERING` 에서 `SECONDARY` 로 전이**했는지 확인한 뒤 다음 단계로 간다.

### 3. mongos 기동

```bash
mongos --config <path-to-config-file>
```

설정 파일의 `sharding.configDB` 에는 config 레플리카 셋 이름과 멤버가 최소 하나 `<replSetName>/<host:port>` 형식으로 들어 있어야 한다. `mongos` 는 기동할 때 config 데이터베이스 사본을 받아와 라우팅을 시작한다. 이것이 config 서버를 먼저 올리는 이유다. 기동한 `mongos` 는 config 서버에 30초마다 ping 을 보내고, `active mongoses` 는 최근 60초 이내에 ping 한 인스턴스를 센다.

게이트는 **`mongos` 접속**이다. 다음 단계의 첫 명령 `sh.status()` 가 `mongos` 접속 셸을 전제하므로, 셸이 붙는지 확인한 뒤 넘어간다. `sh.status(true)` 의 `active mongoses` 로 올라온 라우터 수를 세어 기동한 개수와 맞춘다.

### 4. 밸런서 재시작

**`mongos` 에 접속해 실행한다.** `sh.startBalancer()` 는 `mongod` 에서 실행하면 에러가 난다.

**무조건 시작하지 않는다.** `sh.status()` 로 먼저 확인하고, 밸런서가 돌고 있지 않을 때만 시작한다.

```javascript
sh.status()                              // balancer 섹션 확인
sh.startBalancer()                       // 꺼져 있을 때만
db.adminCommand( { balancerStart: 1 } )  // 드라이버·스크립트용 동등 커맨드
```

`sh.startBalancer()` 는 `balancerStart` 를 백그라운드로 실행하고 **즉시 리턴한다.** 호출이 끝난 것을 시작으로 오해하면 안 되므로 상태를 확인한다.

```javascript
sh.getBalancerState()   // true
```

7.0 이상에서는 밸런서를 시작하면 **AutoMerger 도 다시 활성화된다.** 종료 단계에서 함께 꺼진 쪽이 여기서 복구되므로 이 단계를 빠뜨리면 AutoMerger 가 꺼진 채 남는다. 재활성화 직후 바로 균형을 맞추기 시작하지는 않고, 밸런싱은 다음 밸런서 라운드에서 시작된다.

## 기동 후 검증

| 순서 | 명령 | 확인할 것 |
|---|---|---|
| 1 | `rs.status()` | 프라이머리 선출, `RECOVERING` → `SECONDARY` 승격 |
| 2 | `sh.status()` | `shards[].state` 가 `1`, `active mongoses` 수 |
| 3 | `sh.getBalancerState()` · `sh.isBalancerRunning()` | `true`, `mode: "full"` |
| 4 | `rs.printSecondaryReplicationInfo()` | 복제 지연 회수 |
| 5 | `db.runCommand({ checkMetadataConsistency: 1 })` | 7.0 이상, 불일치 없음 |
| 6 | 임시 샤드 컬렉션 | 삽입과 라우팅 성공 |
| 7 | `/var/log/mongodb/mongod.log` | 기동 경고·에러 |

`shards[].state` 는 샤드가 shard aware 일 때 `1` 이고 아니면 `0` 이다. `numBalancerRounds` 는 config 서버 재시작으로 `0` 이 되므로 `0` 에서 증가하면 라운드가 다시 도는 것이다. `checkMetadataConsistency` 는 `firstBatch` 가 비어 있으면 불일치가 없다는 뜻이다. 불일치가 있으면 `type` 과 `description`, `details` 로 유형이 나온다.

마지막으로 라우팅을 태워 본다. 임시 샤드 컬렉션에 테스트 데이터를 넣고 각 샤드 프라이머리에 셸을 붙여 `db.collection.find()` 로 데이터가 보이는지 확인한다.

> **WARNING** — 청크 분할로 정상 여부를 판정하지 않는다
>
> 6.0.3 부터 **automatic chunk splitting 이 수행되지 않는다.** auto-splitting 커맨드는 남아 있지만 실제
> 동작을 하지 않는다. 판정 기준은 마이그레이션 라운드가 다시 도는지와 라우팅이 성공하는지다.

## 순서를 어기면 무슨 일이 생기는가

| 어긴 것 | 결과 |
|---|---|
| mongos 를 먼저 내림 | `sh.stopBalancer()` 를 실행할 곳이 없다. `mongod` 에서 실행하면 에러가 난다 |
| 밸런서를 끄지 않음 | 청크가 이동하는 중이라 백업·스냅샷이 불완전하거나 중복 데이터를 갖는다 |
| 마이그레이션 종료 전에 내림 | `moveChunk commit failed... ERROR: TERMINATING` 뒤 샤드 프라이머리가 스스로 종료한다 |
| config 일부를 먼저 내림 | 메타데이터가 read only 가 되고 청크 마이그레이션·분할이 멈춘다 |
| config 전부를 먼저 내림 | 클러스터가 동작하지 못하는 상태가 될 수 있다 |
| 레플리카 셋 과반을 동시에 내림 | 프라이머리가 step down 하고, 새 프라이머리 선출까지 쓰기가 불가능하다 |
| 프라이머리를 `force` 로 내림 | 세컨더리로 복제되지 않은 쓰기가 롤백될 수 있다 |
| 인덱스 빌드 중에 내림 | 종료가 실패하고, 다른 노드를 내리면 남은 빌드가 hang 할 수 있다 |
| resharding 중에 내림 | commit 단계면 abort 할 수 없다. 리소스가 부족하면 공간 부족으로 종료된다 |
| `kill -9` 로 내림 | unclean shutdown 이 되어 데이터 파일 유효성이 깨질 수 있다 |

`moveChunk commit failed` 로 샤드 프라이머리가 종료된 경우, 청크 마이그레이션 실패는 사용자가 직접 해결해야 한다.

## 실패 시 대처

### 노드가 올라오지 않을 때

| 상황 | 상태와 대처 |
|---|---|
| 샤드 멤버 1개 불가 | 프라이머리였으면 새 프라이머리를 선출한다. 3멤버 셋이면 나머지 2개가 전체 사본을 갖는다 |
| 샤드 전체 불가 | 그 샤드 데이터만 사용 불가다. 애플리케이션이 부분 결과를 다룰 수 있어야 한다 |
| config 서버 1개 불가 | 프라이머리였으면 새 프라이머리를 선출한다 |
| config 프라이머리 선출 실패 | 메타데이터가 read only 가 되고 마이그레이션·분할이 멈춘다 |
| config 서버 전부 불가 | 클러스터가 동작하지 못하는 상태가 될 수 있다 |
| mongos 1개 불가 | 다른 애플리케이션 서버는 계속 접근한다. 상태가 없으므로 재시작하면 된다 |
| 멤버 간 통신 실패 | 각 호스트에서 `mongosh --host <peer> --port <port>` 로 **양방향** 확인한다 |

응답하지 않는 `mongod` 는 `kill -SIGUSR2 <pid>` 로 스레드별 backtrace 를 로그에 남길 수 있다. 정상 프로세스에 이 신호를 보내면 프로세스가 교착에 빠질 수 있다.

### 밸런서가 다시 켜지지 않을 때

| 원인 | 확인과 대처 |
|---|---|
| 밸런싱 윈도우 밖 | `use config; db.settings.find( { _id: "balancer" } )` 로 윈도우를 확인한다 |
| 두 윈도우를 함께 설정 | `activeWindowDOW` 만 유효하고 `activeWindow` 는 무시된다 |
| 윈도우 제거 | `db.settings.updateOne( { _id : "balancer" }, { $unset : { activeWindow : true } } )` |
| 타임존 착오 | 시작·정지 시각은 config 레플리카 셋 프라이머리의 시간대로 평가된다 |
| `stopped` 상태 | 이 상태에서는 활성화되지 않는다. `sh.startBalancer()` 를 실행한다 |
| 컬렉션 단위로 꺼짐 | `sh.status()` 의 `balancing` · `allowMigrations` 를 본다 |
| `mongod` 에서 실행 | `sh.startBalancer()` 는 `mongod` 에서 실행하면 에러가 난다 |

`activeWindowDOW` 를 제거할 때도 개별 `$unset` 이 필요하다. 컬렉션 단위 설정은 config 데이터베이스에서도 확인한다.

```javascript
db.getSiblingDB("config").collections.findOne({_id : "<ns>"}).noBalance
```

`true` 면 비활성, `false` 면 현재는 활성이고 과거에 비활성이었던 이력이 있다는 뜻이다. 출력이 없으면 활성이고 이력도 없다. 컬렉션 단위 마이그레이션은 `sh.enableMigrations()` · `sh.disableMigrations()` 로 제어한다.

### 라우팅이 이상할 때

```text
could not initialize cursor across all shards because : stale config detected
```

`mongos` 중 하나가 클러스터 메타데이터 캐시를 아직 갱신하지 않았을 때 나온다. 모든 `mongos` 가 캐시를 새로 읽을 때까지 경고가 반복된다. 특정 인스턴스가 캐시를 강제로 갱신하게 하려면 `flushRouterConfig` 를 실행한다.

```javascript
db.adminCommand( { flushRouterConfig: "<db.collection>" } )   // 특정 컬렉션
db.adminCommand("flushRouterConfig")                          // 전체
```

이 커맨드는 `mongos` 와 `mongod` 양쪽에서 쓸 수 있지만 **정규 단계가 아니다.** 라우팅 테이블 캐시 관리는 클러스터가 자동으로 처리하고, `movePrimary` · `dropDatabase` · `db.collection.getShardDistribution()` 후에는 필요하지 않다. `stale config detected` 가 반복될 때의 대처로만 쓴다.

## 계획 정비와 비계획 재시작

### 종료 경로가 다르다

| 항목 | `db.shutdownServer()` · `shutdown` | `SIGTERM`(`systemctl stop` 등) |
|---|---|---|
| `mongod` quiesce 길이 | `timeoutSecs` 필드 | `shutdownTimeoutMillisForSignaledShutdown` |
| `mongos` quiesce 길이 | `timeoutSecs` 필드 | `mongosShutdownTimeoutMillisForSignaledShutdown` |
| step down 실패 시 | `force: true` 일 때만 종료를 계속한다 | 항상 종료를 계속한다 |

계획 정비에서는 커맨드 경로가 낫다. `timeoutSecs` 로 대기 예산을 직접 통제할 수 있고, step down 이 실패하면 멈춰 준다. `systemctl stop mongod` 는 SIGTERM 경로이므로 서버 파라미터에 의존하고 **step down 이 실패해도 종료를 강행한다.**

### clean shutdown 을 보장하는 수단

clean shutdown 에서 `mongod` 는 대기 중인 작업을 모두 마치고, 데이터를 데이터 파일로 flush 하고, 모든 데이터 파일을 닫는다. 그 외의 종료는 unclean 이고 데이터 파일의 유효성을 훼손할 수 있다. 허용되는 수단은 네 가지다.

- `db.shutdownServer()`
- `mongod --shutdown` (Linux 전용)
- `CTRL-C` (`--fork` 없이 인터랙티브로 실행 중일 때)
- `kill <pid>` 또는 `kill -2 <pid>` (Linux·macOS 전용)

> **WARNING** — `kill -9` 를 쓰지 않는다
>
> `kill -9`(`SIGKILL`)로 `mongod` 를 종료해서는 안 된다. 위 네 가지 수단 중 하나를 쓴다.

### 비계획 종료 뒤에 확인할 것

| 항목 | 확인 방법 |
|---|---|
| 메타데이터 정합성 (7.0+) | `db.runCommand({ checkMetadataConsistency: 1 })` |
| 롤백 | 복제되지 않은 쓰기가 롤백됐는지 본다 |
| 인덱스 빌드 재개 | 로그의 `"Index build: wrote resumable state to disk"` · `"Found index from unfinished build"` |
| initial sync 필요 여부 | oplog 가 유효하지 않으면 세컨더리가 initial sync 를 수행한다 |
| orphan 문서 | `sh.status()` 의 `shardedDataDistribution.shards[].numOrphanedDocs` |

메타데이터 불일치의 원인에는 수동 개입과 업그레이드·다운그레이드 같은 정비 작업이 들어가고, 결과는 잘못된 쿼리 결과나 데이터 손실이다. 계획 정비였더라도 중간에 강제 종료가 섞였다면 이 항목들을 확인한다.

### 세 시나리오를 구분한다

| 시나리오 | 성질 |
|---|---|
| 클러스터 전체 정지 | 이 문서의 절차다. 과반 상실을 걱정하지 않는다 |
| 롤링 재시작 | 과반 유지가 필수다. 세컨더리를 하나씩, 프라이머리는 `rs.stepDown(300)` 후 마지막 |
| 비계획 복구 | 종료 절차가 없었다. 정합성·롤백·initial sync·인덱스 빌드 재개를 추가로 확인한다 |

롤링 재시작에서 세컨더리 2개를 동시에 재부팅하면 투표 가능한 멤버의 과반이 깨진다. 프라이머리는 step down 해 세컨더리가 되고, 셋은 새 프라이머리를 뽑지 못한다. 이때 프라이머리는 클라이언트 연결을 닫지 않지만, 새 프라이머리가 선출되기 전까지 클라이언트는 레플리카 셋에 쓸 수 없다.

## 이 절차에 넣지 않는 것

| 항목 | 이유 |
|---|---|
| `fsyncLock()` · `fsyncUnlock()` | 파일시스템 스냅샷 백업용이다. `db.shutdownServer()` 가 이미 clean shutdown 을 보장한다 |
| `skipShardingConfigurationChecks` · `disableLogicalSessionCacheRefresh` · `sharding.clusterRole` 주석 처리 | standalone 정비 시나리오 전용이다. 재구동에 섞으면 클러스터 구성을 망친다 |
| `flushRouterConfig` 를 정규 단계로 | 라우팅 테이블 캐시 관리는 클러스터가 자동으로 처리한다 |
| 청크 분할 여부로 검증 | 6.0.3 부터 automatic chunk splitting 이 수행되지 않는다 |
| `killOp` 으로 인덱스 빌드 정리 | 레플리카 셋·샤드 클러스터에서 금지된 조작이다 |
| 정상 프로세스에 `SIGUSR2` | 정상 `mongod` 에 보내면 프로세스가 교착에 빠질 수 있다 |
