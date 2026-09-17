---
date: 2021-04-29 10:18:32 +0900
title: "MongoDB Index #.6 TTL Index"
category: mongodb
excerpt: "이전 포스트 TTL(Time To Live) Index TTL 인덱스는 도큐먼트가 가진 Date 타입의 필드값을 보고 설정된 TTL Monitor 쓰레드의 삭제 주기에 따라 도큐먼트의 유효기간을 체크하여, 더 이상 유효하지 않은 도큐먼트를 자동으로 삭제하는 기능의 인덱스입니다. T…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — TTL 인덱스의 동작 조건과 `ttlMonitorSleepSecs` 조정 방법은 현재도 동일합니다. 예제 프롬프트가 레거시 `mongo` 셸 기준이고, 5.3 이후에는 clustered collection 의 `expireAfterSeconds` 로 별도 TTL 인덱스를 대체할 수도 있습니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

이전 포스트

MongoDB Index #.5 Full Text Search Index

이전 포스트   Full Text Search Index (전문 검색 인덱스) DBMS에서 일반적으로 전문 검색 엔진을 구축할 때 사용하는 알고리즘은 크게 두가지로 나눌수 있습니다. 하나는 형태소 분석(어근 분석, stemming)과 N-Gram 2가지로 나뉘어집니다. 명사와 조사 사이를 띄어쓰기를...

## TTL(Time To Live) Index

TTL 인덱스는 도큐먼트가 가진 Date 타입의 필드값을 보고 설정된 TTL Monitor 쓰레드의 삭제 주기에 따라 도큐먼트의 유효기간을 체크한다. 더 이상 유효하지 않은 도큐먼트를 자동으로 삭제하는 기능의 인덱스다. TTL Monitor 쓰레드가 지정된 시간 간격(Default 1분)으로 한 번씩 체크하여 지정된 시간보다 오래된 도큐먼트를 찾아 삭제한다. 이렇듯 삭제를 위해 사용되는 인덱스이기 때문에 쿼리의 검색 성능 향상을 위한 인덱스는 아니지만, 일반 인덱스처럼 검색에 사용할 수도 있다.

TTL인덱스는 필드 값이 Date 타입이거나, Date 타입의 엘리먼트를 가지는 배열 필드만 자동 삭제가 실행된다. TTL인덱스가 Capped 컬렉션과 다른 점은 다음과 같다. Capped 컬렉션은 지정한 용량을 초과한 경우 오래된 데이터만 자동으로 삭제되며, 시간이 지나도 용량이 차지 않는다면 삭제되지 않는다. 또 Capped 컬렉션은 Insert를 제외한 다른 도큐먼트 변경 작업을 할 수 없다. 반면 TTL인덱스는 오래전에 생성한 도큐먼트라도, TTL 인덱스의 기준이 되는 필드가 최신 날짜로 업데이트 되어 expire 기간 안쪽에 지속적으로 위치하게 되면 그 도큐먼트는 삭제되지 않는다. 또한 가장 오래된 데이터를 삭제하는 capped는 별도의 데이터를 찾는 과정이 없어 부하가 거의 없으나, TTL 인덱스의 경우 조건을 찾아 삭제하는 동작이 수행되는 것(Task 방식)이기 때문에 많은 양의 데이터가 TTL Monitor 쓰레드에 의해 삭제가 된다면 부하가 발생할 수도 있다.

다음 예제는 lastModifiedDate 필드의 값이 현재 시점보다 3600초가 지난 시점이면 TTL Monitor 쓰레드가 자동으로 도큐먼트를 삭제한다.

```javascript
> db.eventlog.createIndex( { "lastModifiedDate": 1 }, { expireAfterSeconds: 3600 } )
```

코드로 표현하면 아래와 같다.

```javascript
if ( lastModifiedDate + 3600 < NOW ) {
    delete()
}
```

expireAfterSeconds의 값은 현재 시점으로부터 얼만큼 지난 시점이 되는것 이다. expireAfterSeconds 값이 0이면 바로 지금 지우는 작업을 하라는 뜻이 된다. Date 타입의 데이터가 미래 시간을 설정되어 있다면, 시간이 지나 그 값이 지금이 되는 순간 삭제가 되는 것이다.

초 단위로 넣는게 어렵다면 계산식을 넣어도 동작한다.

```javascript
> db.eventlog.createIndex( { "lastModifiedDate": 1 }, { expireAfterSeconds: 60*60 } )
```

1시간은 `60*60`, 하루는 `60*60*24`로 기입할 수 있다.

TTL 인덱스를 다음과 같이 활용할 수 있다.

마지막 로그인 정보를 기록하는 컬렉션을 생성하고, Date 타입 값을 가진 lastLoginDate 필드를 생성한다. lastLoginDate 필드에 TTL 인덱스를 생성하고,  TTL의 삭제 주기는 3개월로 잡아두면, 로그인을 하지 않아 lastLoginDate의 값이 갱신되지 않는 도큐먼트는 삭제되며, 도큐먼트가 삭제되어 정보가 없는 유저를 자동으로 휴면계정 처리한다.

하나의 컬렉션에 여러개의 TTL 인덱스를 생성할 수도 있으며, 복합 인덱스는 사용할 수 없다.

TTL 인덱스는 Date 타입을 가진 값에서만 동작하며, 다른 타입이 입력되어 있는 경우 해당 도큐먼트는 삭제하지 않는다. 따라서 TTL가 걸려있더라도 해당 컬렉션에 지우지 말아야 할 도큐먼트가 있다면 'NONE' 같은 문자로 값을 대체하면 되는데 만약 `schema validation` 레벨을 `error`로 설정하고 타입 값을 date로 고정하면 다른 문자를 넣을 수 없으니 주의하기 바란다. 그런 경우에는 매우 큰 날짜 값을 입력해서 삭제를 막을 수도 있다.

또, \_id 값에 날짜 정보가 들어 있지만, \_id 필드에는 TTL 인덱스를 생성할 수 없다. 따라서 TTL 인덱스를 사용하고자 한다면 별도의 Date 타입 필드를 생성해야 한다.

### TTL Monitor 쓰레드의 삭제주기 변경

위에서 TTL Monitor는 1분 주기로 실행된다고 설명했다. 실제로 아래와 같은 명령으로 확인한다.

```json
PRIMARY> db.adminCommand({getParameter:1, ttlMonitorSleepSecs: 1})
{
        "ttlMonitorSleepSecs" : 60,
        "ok" : 1,
        "$gleStats" : {
                "lastOpTime" : Timestamp(0, 0),
                "electionId" : ObjectId("7fffffff0000000000000008")
        },
        "lastCommittedOpTime" : Timestamp(1619656884, 1),
        "$configServerState" : {
                "opTime" : {
                        "ts" : Timestamp(1619656890, 1),
                        "t" : NumberLong(6)
                }
        },
        "$clusterTime" : {
                "clusterTime" : Timestamp(1619656890, 1),
                "signature" : {
                        "hash" : BinData(0,"1qUFUqoVDVSh8yPkppDfZ5XNYoM="),
                        "keyId" : NumberLong("6945254695099170837")
                }
        },
        "operationTime" : Timestamp(1619656884, 1)
}
```

60초에 한번 깨어나서 실행된다는 것을 알 수 있다.

TTL Monitor 쓰레드의 실행 주기를 변경하고자 한다면 `ttlMonitorSleepSecs` 파라미터 값을 조정하면 된다. 10분 단위로 TTL Monitor가 실행되게 변경해 보겠다.

```json
PRIMARY> db.adminCommand({setParameter:1, ttlMonitorSleepSecs: 600})
{
        "was" : 60,
        "ok" : 1,
        "$gleStats" : {
                "lastOpTime" : Timestamp(0, 0),
                "electionId" : ObjectId("7fffffff0000000000000008")
        },
        "lastCommittedOpTime" : Timestamp(1619657144, 1),
        "$configServerState" : {
                "opTime" : {
                        "ts" : Timestamp(1619657150, 1),
                        "t" : NumberLong(6)
                }
        },
        "$clusterTime" : {
                "clusterTime" : Timestamp(1619657150, 1),
                "signature" : {
                        "hash" : BinData(0,"f6M3PMjLYdHeaWckpVxMy0n/HPo="),
                        "keyId" : NumberLong("6945254695099170837")
                }
        },
        "operationTime" : Timestamp(1619657144, 1)
}
```

### TTL 인덱스의 expireAfterSeconds 값 변경

TTL 인덱스를 생성 했을때 설정한 시간 값을 변경하고 싶다면 인덱스를 삭제하고 재생성 하는 방법도 있지만, 아래와 같은 방법으로 재생성 없이 변경도 가능하다.

```javascript
> db.runCommend( {"collMod": "someapp.cache", "index" : { "keyPattern" : { "lastLoginDate": 1}, "expireAfterSeconds":  60*60*24 } } );
```

### TTL Monitor 쓰레드 정지 및 시작

TTL Monitor 쓰레드를 사용한다고 설정하는 파라미터는 `ttlMonitorEnabled` 인데 기본 값은 `ture` 이다.

MongoDB의 설정 파일 (/etc/mongod.conf) 파일안데 설정할 수도 있고, mongod의 구동 옵션으로도 설정할 수 있다.

```yaml
setParameter:
    ttlMonitorEnabled: false
```

```bash
$ mongod --setParameter ttlMonitorEnabled=false
```

그리고 MongoDB를 재구동하지 않고, 동적 변환이 가능한 파라미터이기 때문에 명령어로도 변경할 수 있다.

```javascript
> db.adminCommand( { setParameter: 1, ttlMonitorEnabled: false } )
```

### TTL Monitor의 로그 확인

기본적으로 TTL Monitor 쓰레드의 작업은 MongoDB의 로그에 기록하지 않는다. 따라서 TTL Monitor 쓰레드의 삭제 작업에서 부하가 걸리는지 확인하려면 로그를 활성화해서 확인해야 한다.

```javascript
> db.setLogLevel(1, "index")
```

이렇게 설정하면 MongoDB의 로그에 [TTLMonitor] 동작 기록을 체크할 수 있고, TTL 작업이 삭제하는데 걸린 시간도 확인할 수 있다.

### 레플리카 셋에서 TTL 인덱스의 삭제 동작

TTL 인덱스는 Primary에서만 동작한다. 실제로 secondary에서는 TTL Monitor 쓰레드가 동작하지 않으며, 실제 동작이 MongoDB의 `delete`와 동일하기 때문에 삭제된 명령 및 기록은 OpLog에 기록되어 Secondary로 전송되게 된다. 따라서 OpLog에 의해 데이터가 움직이는 Secondary는 TTL Monitor의 동작이 필요 없다.

다음 포스트

MongoDB Index #.7 Geospatial Index

이전 포스트   공간 검색 인덱스 (Geospatial Index) MongoDB의 공간 검색 인덱스는 2d와 2dsphere 두 가지 타입의 공간 검색 인덱스를 지원합니다. 2d 인덱스는 2.2버전에 도입되었으나 현재는 거의 사용되지 않고 있습니다. 2d 인덱스의 경우 geohash 알고리즘에...

#### 참고 자료

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")

도서: Real MongoDB

도서: MongoDB 완벽가이드
