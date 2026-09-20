---
date: 2021-04-29 10:18:32 +0900
title: "MongoDB Index #.6 TTL Index"
category: mongodb
excerpt: "Date 필드 값으로 도큐먼트를 자동 삭제하는 TTL 인덱스의 동작 원리와 60초 삭제 주기, 제약 사항, collMod로 만료 시간을 바꾸는 방법을 정리했습니다."
last_modified_at: 2026-09-20
---

TTL(Time To Live) 인덱스는 도큐먼트가 가진 Date 타입 필드 값을 기준으로 유효기간이 지난 도큐먼트를 자동으로 지우는 단일 필드 인덱스입니다. `mongod` 안에서 도는 백그라운드 스레드가 인덱스에 들어 있는 날짜 값을 읽고 만료된 도큐먼트를 삭제합니다. 삭제를 위해 존재하는 인덱스지만, 일반 인덱스와 똑같이 질의에도 쓸 수 있습니다. 공식 문서는 머신이 만들어내는 이벤트 데이터, 로그, 세션 정보처럼 일정 기간만 남겨 두면 되는 데이터를 용도로 듭니다.

자동 삭제는 인덱스 필드 값이 Date 타입이거나 Date 타입 원소를 가진 배열일 때만 동작합니다. 배열이라면 안에 든 날짜 중 가장 이른 값으로 만료 시점을 계산합니다.

## TTL 인덱스와 Capped 컬렉션

| 구분 | TTL 인덱스 | Capped 컬렉션 |
| --- | --- | --- |
| 삭제 기준 | 필드의 날짜 값 | 지정한 용량 초과 |
| 용량이 차지 않으면 | 만료된 도큐먼트를 지웁니다 | 아무것도 지우지 않습니다 |
| 삭제 방식 | 조건에 맞는 도큐먼트를 찾아 지웁니다 | 가장 오래된 쪽을 덮어씁니다 |
| 기준 필드를 갱신하면 | 만료가 그만큼 미뤄집니다 | 해당 없음 |

오래전에 생성한 도큐먼트라도 TTL 인덱스의 기준 필드가 최신 날짜로 계속 갱신되면 만료 기간 안쪽에 머물러 삭제되지 않습니다. 반면 capped 컬렉션은 시간이 아무리 지나도 용량이 차지 않으면 데이터를 지우지 않습니다. 대신 capped 컬렉션은 가장 오래된 쪽부터 밀어내기만 하므로 지울 대상을 찾는 과정이 없고, TTL 인덱스는 조건에 맞는 도큐먼트를 찾아서 지우기 때문에 한 번에 많은 양이 만료되면 부하가 생길 수 있습니다.

MongoDB 8.0 문서는 대체로 TTL 인덱스가 capped 컬렉션보다 성능과 유연성 면에서 낫다고 적고, capped 컬렉션을 만들기 전에 TTL 인덱스로 대신할 수 있는지 먼저 따져 보라고 권합니다. capped 컬렉션의 제약도 예전과 다릅니다. 5.0.7부터는 삭제 메서드로 capped 컬렉션의 도큐먼트를 직접 지울 수 있고, 업데이트는 금지가 아니라 할당된 공간을 넘길 수 있으니 피하라는 권고 사항입니다.

## 인덱스 만들기

다음 예제는 `lastModifiedDate` 필드 값이 현재보다 3600초 이전이면 백그라운드 스레드가 도큐먼트를 삭제하도록 합니다.

```javascript
db.eventlog.createIndex( { "lastModifiedDate": 1 }, { expireAfterSeconds: 3600 } )
```

판단 기준을 코드로 옮기면 이렇습니다.

```javascript
if ( lastModifiedDate + 3600 < NOW ) {
    delete()
}
```

`expireAfterSeconds`는 기준 필드의 시점부터 얼마나 지나면 만료로 볼지를 초 단위로 지정합니다. 값의 범위는 0 이상 2147483647 이하입니다. 초 단위로 환산하기 번거롭다면 계산식을 그대로 넣어도 됩니다.

```javascript
db.eventlog.createIndex( { "lastModifiedDate": 1 }, { expireAfterSeconds: 60*60 } )
```

1시간은 `60*60`, 하루는 `60*60*24`로 적을 수 있습니다.

활용 예를 하나 들면, 마지막 로그인 시각을 담는 `lastLoginDate` 필드에 TTL 인덱스를 만들고 만료 기간을 3개월로 잡아 둡니다. 3개월 동안 로그인하지 않아 `lastLoginDate`가 갱신되지 않은 도큐먼트는 삭제되므로, 도큐먼트가 없는 사용자를 휴면 계정으로 처리할 수 있습니다.

> **NOTE** — 이미 데이터가 쌓인 컬렉션에 TTL 인덱스를 새로 만들면 한꺼번에 만료되는 도큐먼트가 아주 많을 수 있습니다. 공식 문서는 이 경우 트래픽이 적은 시간대에 인덱스를 만들거나, 인덱스를 만들기 전에 대상 도큐먼트를 나눠서 미리 지우라고 권합니다.

## 제약 사항

- TTL 인덱스는 단일 필드 인덱스입니다. 복합 인덱스는 TTL을 지원하지 않고 `expireAfterSeconds` 옵션을 무시합니다.
- `_id` 필드는 TTL 인덱스를 지원하지 않습니다. `_id` 안에 생성 시각 정보가 들어 있어도 그렇습니다. TTL을 쓰려면 Date 타입 필드를 따로 둬야 합니다.
- 인덱스 필드에 날짜 값이 없거나 필드 자체가 없는 도큐먼트는 만료되지 않습니다.
- 같은 필드에 TTL이 아닌 단일 필드 인덱스가 이미 있으면 키 명세가 같고 옵션만 다른 인덱스를 새로 만들 수 없습니다. 이때는 5.1부터 `collMod`로 기존 인덱스를 TTL 인덱스로 전환할 수 있습니다.
- capped 컬렉션에는 7.1부터 TTL 인덱스를 만들 수 있습니다. 그 이전 버전에서는 만들 수 없었습니다.

하나의 컬렉션에 TTL 인덱스를 여러 개 두는 것은 가능합니다.

Date 타입이 아닌 값이 들어 있는 도큐먼트는 만료되지 않으므로, 같은 컬렉션에 지우면 안 되는 도큐먼트가 있다면 그 필드에 `NONE` 같은 문자열을 넣어 삭제를 피할 수 있습니다. 다만 `schema validation` 레벨을 `error`로 두고 타입을 date로 고정해 두면 문자열을 넣을 수 없습니다. 그런 경우에는 아주 먼 미래의 날짜 값을 넣어 삭제를 막습니다.

## 특정 시각에 만료시키기

`expireAfterSeconds`를 `0`으로 주면 기준 필드의 날짜가 과거가 되는 순간 만료로 처리됩니다. 도큐먼트마다 지워질 시각을 직접 지정하는 방식입니다.

```javascript
db.log_events.createIndex( { "expireAt": 1 }, { expireAfterSeconds: 0 } )
```

```javascript
db.log_events.insertOne( { "expireAt": new Date('July 22, 2013 14:00:00'), "logEvent": 2 } )
```

`expireAt`에 미래 시각을 넣어 두면 그 시각이 지나는 순간 삭제 대상이 됩니다. 공식 문서도 특정 시각 만료를 이 방식으로 안내합니다.

## expireAfterSeconds 값 변경

`createIndex()`로는 기존 인덱스의 `expireAfterSeconds`를 바꿀 수 없습니다. 인덱스를 지우고 다시 만드는 방법도 있지만, `collMod` 명령으로 재생성 없이 값만 바꿀 수 있습니다.

```javascript
db.runCommand( {
  "collMod": "cache",
  "index": {
    "keyPattern": { "lastLoginDate": 1 },
    "expireAfterSeconds": 60*60*24
  }
} )
```

`expireAfterSeconds`만 바꾸는 작업은 인덱스를 전부 다시 만들지 않습니다. 다만 값을 줄이면 그 즉시 삭제 대상이 되는 도큐먼트가 크게 늘어 삭제 작업이 몰릴 수 있습니다. 공식 문서는 값을 줄이기 전에 대상 도큐먼트를 작은 묶음으로 나눠 직접 지우는 방식을 권합니다.

## 삭제 주기와 삭제 과정

만료된 도큐먼트를 지우는 백그라운드 작업은 60초마다 실행됩니다. 그래서 만료 시점과 실제 삭제 시점 사이에는 간격이 생깁니다. 인덱스 생성이 끝난 뒤 삭제가 시작되기까지도 0초에서 60초가 걸립니다. 삭제에 걸리는 시간은 `mongod`의 부하에 따라 달라지므로, 만료된 데이터가 60초보다 더 오래 남아 있을 수도 있습니다. TTL 인덱스는 만료 즉시 삭제를 보장하지 않습니다.

삭제 과정은 TTL 인덱스를 하나씩 돌면서 진행됩니다. 한 인덱스에서 5만 건을 지우거나, 1초를 쓰거나, 만료된 도큐먼트를 모두 지우면 다음 인덱스로 넘어갑니다. 모든 TTL 인덱스를 한 바퀴 돌면 서브패스(sub-pass)가 끝나고 남은 대상을 확인하는 새 서브패스가 시작됩니다. 모든 TTL 인덱스에서 지울 수 있는 도큐먼트를 다 지우면 한 패스(pass)가 완료됩니다. 이 작업은 단일 스레드로 돌기 때문에 부하가 높거나 만료 대상이 많으면 시간이 더 걸립니다. 또한 큰 삭제 하나에 시간을 다 쓰지 않도록 60초마다 진행 중인 삭제 루프를 끊고 서브패스를 새로 시작합니다.

TTL 작업이 실행하는 삭제는 다른 삭제와 마찬가지로 포그라운드에서 동작합니다. 6.1부터는 여러 도큐먼트의 삭제를 묶어서 처리하고, `explain` 결과에 `BATCHED_DELETE` 스테이지가 나타납니다.

### 삭제 주기 파라미터

주기는 서버 파라미터 `ttlMonitorSleepSecs`가 결정하고 기본값은 60입니다. 기동 시점과 런타임 모두에서 바꿀 수 있습니다. 현재 값은 다음 명령으로 확인합니다.

```javascript
db.adminCommand( { getParameter: 1, ttlMonitorSleepSecs: 1 } )
```

```javascript
{ ttlMonitorSleepSecs: 60, ok: 1 }
```

레플리카 셋이나 샤드 클러스터에서는 응답에 `clusterTime`, `operationTime` 같은 클러스터 메타데이터 필드가 함께 붙습니다.

주기를 10분으로 늘리려면 `setParameter`로 값을 바꿉니다. 응답의 `was` 필드가 바뀌기 전 값입니다.

```javascript
db.adminCommand( { setParameter: 1, ttlMonitorSleepSecs: 600 } )
```

```javascript
{ was: 60, ok: 1 }
```

다만 이 파라미터는 공식 파라미터 레퍼런스에 실려 있지 않고, 서버 소스는 용도를 테스트라고 적어 둡니다. 운영 클러스터에서 주기를 늘려 삭제를 미루는 설정은 권장 경로가 아닙니다.

### TTL Monitor 켜고 끄기

백그라운드 스레드의 사용 여부는 `ttlMonitorEnabled` 파라미터가 결정하고 기본값은 `true`입니다. 설정 파일(`/etc/mongod.conf`)이나 `mongod` 구동 옵션으로 지정할 수 있습니다.

```yaml
setParameter:
    ttlMonitorEnabled: false
```

```bash
$ mongod --setParameter ttlMonitorEnabled=false
```

재구동 없이 런타임에 바꾸는 것도 가능합니다.

```javascript
db.adminCommand( { setParameter: 1, ttlMonitorEnabled: false } )
```

> **WARNING** — 공식 문서는 MongoDB 지원팀의 안내가 없다면 운영 `mongod`를 `ttlMonitorEnabled` 비활성 상태로 돌리지 말라고 못박습니다. TTL 인덱스에 의존하는 내부 시스템 동작까지 영향을 받습니다.

### 로그와 지표 확인

TTL 스레드의 작업은 기본 설정에서 로그에 남지 않습니다. 삭제 작업이 부하를 일으키는지 보려면 `index` 컴포넌트의 로그 상세도를 올립니다.

```javascript
db.setLogLevel(1, "index")
```

이렇게 하면 구조화 로그에서 컴포넌트가 `INDEX`, 컨텍스트가 `TTLMonitor`인 항목으로 동작 기록과 삭제에 걸린 시간을 확인할 수 있습니다. 진행 중인 삭제는 `db.currentOp()` 출력에도 나타나고, 누적 지표는 `serverStatus`의 `metrics.ttl.deletedDocuments`, `metrics.ttl.passes`, `metrics.ttl.subPasses`로 볼 수 있습니다.

## 레플리카 셋에서의 삭제 동작

TTL 백그라운드 스레드는 멤버가 프라이머리 상태일 때만 도큐먼트를 삭제합니다. 세컨더리 상태에서는 스레드가 대기합니다. 프라이머리가 수행한 삭제는 일반 `delete`와 동일하게 복제되어 세컨더리에 적용되므로, 세컨더리에서 TTL 스레드가 따로 돌 필요가 없습니다.

## 시계열 컬렉션의 만료

시계열 컬렉션은 TTL 인덱스 대신 컬렉션 옵션으로 만료 기간을 받습니다. `expireAfterSeconds` 컬렉션 옵션은 시계열 컬렉션과 clustered 컬렉션에서만 쓸 수 있습니다.

```javascript
db.createCollection( "weather24h", {
  timeseries: { timeField: "timestamp", metaField: "sensor", granularity: "hours" },
  expireAfterSeconds: 86400
} )
```

7.0부터는 시계열 컬렉션의 `metaField`에 `partialFilterExpression`을 걸어 일부 데이터만 더 짧게 만료시키는 부분 TTL 인덱스도 만들 수 있습니다. 그 이전 버전에서는 `timeField`에만 TTL 인덱스를 만들 수 있었습니다. 시계열 컬렉션에서는 버킷 안의 도큐먼트가 모두 만료될 때 버킷 단위로 삭제되며, 기준은 버킷의 마지막 타임스탬프에 `expireAfterSeconds`를 더한 시점입니다.

## 참고 자료

MongoDB Manual: [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/)

도서: Real MongoDB

도서: MongoDB 완벽가이드
