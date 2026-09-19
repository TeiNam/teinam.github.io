---
date: 2019-09-19 20:58:55 +0900
title: "Redis #.2 트랜잭션과 데이터 타입"
category: redis
excerpt: "문자열 키를 읽고 쓰는 SET·GET 부터 MULTI·EXEC·DISCARD·WATCH 트랜잭션, Hash·List·Set 자료형의 주요 명령까지 redis-cli 예제로 정리합니다."
updated: 2026-09-20
---

## SET 과 GET

가장 기본이 되는 명령은 문자열 키에 값을 쓰고 읽는 SET 과 GET 입니다.

- **SET**: 키에 값을 저장합니다. 키와 값, 두 개의 인자가 필요합니다.
- **GET**: SET 으로 저장한 값을 읽습니다.

간단하게 웹 주소를 단축하는 키 값을 추가해 봅니다.

```redis
127.0.0.1:6379> set ral https://rastalion.dev
OK
127.0.0.1:6379> get ral
"https://rastalion.dev"
```

여러 키를 읽을 때는 GET 을 반복하는 대신 MGET 을 씁니다. 서버 왕복이 한 번으로 줄어 네트워크 트래픽도 줄어듭니다.

```redis
127.0.0.1:6379> set gog https://google.co.kr
OK
127.0.0.1:6379> set nav https://www.naver.com
OK
127.0.0.1:6379> mget ral gog nav
1) "https://rastalion.dev"
2) "https://google.co.kr"
3) "https://www.naver.com"
127.0.0.1:6379>
```

MGET 은 여러 키를 받아서 요청한 키 순서대로 값을 배열로 반환합니다.

## 숫자 연산

공식 문서는 문자열 타입의 값을 바이트 시퀀스로 설명합니다. 숫자만 담긴 문자열은 INCR 계열 명령이 정수로 해석해 계산합니다.

```redis
127.0.0.1:6379> set number 1
OK
127.0.0.1:6379> incr number
(integer) 2
127.0.0.1:6379> get number
"2"
127.0.0.1:6379>
```

GET 은 number 를 문자열로 반환하지만, INCR 은 같은 값을 정수로 읽고 1을 증가시킵니다.

- **INCR**: 값에 1을 더함
- **DECR**: 값에서 1을 뺌
- **INCRBY**: 지정한 정수를 더함
- **DECRBY**: 지정한 정수를 뺌

## 트랜잭션

- **MULTI**: 트랜잭션을 시작합니다. 이후 입력한 명령은 실행되지 않고 큐에 쌓이며 QUEUED 를 응답합니다.
- **EXEC**: 큐에 쌓인 명령을 순서대로 실행하고, 각 명령의 응답을 배열로 반환합니다.
- **DISCARD**: 큐를 비우고 트랜잭션 문맥에서 빠져나옵니다.
- **WATCH**: 지정한 키를 감시해서 EXEC 실행을 조건부로 만듭니다.

공식 문서는 트랜잭션이 두 가지를 보장한다고 적습니다. 첫째, 트랜잭션 안의 명령은 직렬화되어 순서대로 실행되고 다른 클라이언트의 요청이 그 중간에 끼어들지 않습니다. 둘째, EXEC 를 호출하기 전에 연결이 끊기면 어떤 명령도 실행되지 않고, EXEC 가 서버에 도달하면 모든 명령이 실행됩니다.

```redis
127.0.0.1:6379> multi
OK
127.0.0.1:6379> set fb https://facebook.com
QUEUED
127.0.0.1:6379> incrby number 10
QUEUED
127.0.0.1:6379> exec
1) OK
2) (integer) 12
127.0.0.1:6379> get number
"12"
127.0.0.1:6379> mget number fb
1) "12"
2) "https://facebook.com"
127.0.0.1:6379>
```

### 오류가 나는 두 지점

명령이 실패할 수 있는 지점은 두 곳입니다.

첫째는 큐에 쌓는 단계입니다. 명령 이름이 틀렸거나 인자 개수가 맞지 않는 문법 오류, `maxmemory` 설정에 걸린 메모리 부족이 여기에 해당합니다. 문법 오류가 있는 명령은 큐에 들어가지도 않습니다.

```redis
127.0.0.1:6379> multi
OK
127.0.0.1:6379> incr a b c
(error) ERR wrong number of arguments for 'incr' command
```

Redis 2.6.5 부터는 서버가 이 오류를 기억해 두고, EXEC 시점에 트랜잭션 실행을 거부하면서 오류를 반환하고 큐를 폐기합니다. 즉 큐잉 단계에서 한 번 실패하면 그 트랜잭션은 전체가 실행되지 않습니다.

둘째는 EXEC 이후 실행 단계입니다. 문자열 키에 리스트 명령을 쓰는 것처럼 자료형이 맞지 않는 연산이 여기에 해당합니다. 이때 Redis 는 나머지 명령을 멈추지 않습니다. 실패한 명령 자리에 오류 응답이 들어간 배열을 그대로 돌려주고, 다른 명령은 모두 실행됩니다.

```redis
127.0.0.1:6379> multi
OK
127.0.0.1:6379> set a abc
QUEUED
127.0.0.1:6379> lpop a
QUEUED
127.0.0.1:6379> exec
1) OK
2) (error) WRONGTYPE Operation against a key holding the wrong kind of value
```

### 롤백은 없습니다

공식 문서는 Redis 가 트랜잭션 롤백을 지원하지 않는다고 명시합니다. 롤백을 지원하면 Redis 의 단순함과 성능이 크게 희생된다는 이유입니다. 그래서 위 예제에서 LPOP 이 실패해도 앞서 실행된 SET 은 되돌아가지 않습니다. 부분 실패를 감지하고 보정하는 일은 애플리케이션 몫입니다.

DISCARD 는 롤백이 아닙니다. EXEC 를 호출하기 전에, 아직 실행되지 않은 큐를 버리는 명령입니다.

```redis
127.0.0.1:6379> multi
OK
127.0.0.1:6379> set twt https://twitter.com
QUEUED
127.0.0.1:6379> decrby number 5
QUEUED
127.0.0.1:6379> discard
OK
127.0.0.1:6379> exec
(error) ERR EXEC without MULTI
127.0.0.1:6379>
```

DISCARD 로 큐가 비워지고 트랜잭션 문맥에서도 빠져나왔기 때문에, 이어서 EXEC 를 보내면 진행 중인 트랜잭션이 없다는 오류가 돌아옵니다. RDBMS 의 rollback 과 이름이 비슷해 보이지만, 커밋된 변경을 되돌리는 것이 아니라 아직 실행하지 않은 명령을 버리는 동작입니다.

### WATCH 로 낙관적 락 걸기

값을 읽어서 계산한 뒤 다시 쓰는 작업은 MULTI 만으로는 안전하지 않습니다. 값을 읽는 GET 은 트랜잭션 밖에서 일어나므로, 읽은 시점과 EXEC 사이에 다른 클라이언트가 값을 바꿀 수 있습니다.

WATCH 는 이 구간을 감시합니다. WATCH 이후 EXEC 가 도달하기 전에 감시 중인 키가 하나라도 바뀌면 트랜잭션 전체가 취소되고 EXEC 는 nil 을 반환합니다. 여기서 말하는 변경에는 다른 클라이언트의 쓰기뿐 아니라 키 만료와 방출(eviction)도 포함됩니다.

```redis
127.0.0.1:6379> watch number
OK
127.0.0.1:6379> get number
"12"
127.0.0.1:6379> multi
OK
127.0.0.1:6379> set number 13
QUEUED
127.0.0.1:6379> exec
1) OK
```

EXEC 가 nil 을 반환하면 값을 다시 읽고 처음부터 반복합니다. 이런 방식을 낙관적 락(optimistic locking)이라고 부릅니다. EXEC 를 보내면 성공 여부와 무관하게 감시가 모두 해제되고, 트랜잭션을 포기할 때는 UNWATCH 로 직접 해제할 수 있습니다.

문자열 키 하나를 조건부로 갱신하는 경우라면 Redis 8.4 부터 더 간단한 방법이 있습니다. `SET` 의 `IFEQ` 옵션은 값이 기대한 값과 같을 때만 갱신하고, `DELEX` 는 값이 바뀌지 않았을 때만 삭제합니다. 공식 문서는 이 방식이 WATCH 보다 단순하고 빠르다고 적습니다.

### 스크립트와 함수

공식 문서는 트랜잭션으로 할 수 있는 일은 스크립트로도 할 수 있고, 보통 스크립트가 더 단순하고 빠르다고 적습니다. `EVAL` 로 실행하는 Lua 스크립트는 트랜잭션처럼 동작하므로, 읽고 판단해서 쓰는 로직을 한 덩어리로 묶을 때 쓸 수 있습니다. Redis 7.0 부터는 `FUNCTION LOAD` 로 서버에 라이브러리를 등록해 두고 `FCALL` 로 호출하는 Redis Functions 도 선택지입니다.

## 데이터 타입

Redis 는 여러 자료형을 기본으로 제공합니다. 공식 문서가 Redis Open Source 의 자료형으로 나열하는 것은 다음과 같습니다.

| 자료형 | 설명 |
| --- | --- |
| String | 바이트 시퀀스. Bitmap·Bitfield 로 비트 단위 연산 |
| List | 삽입 순서를 유지하는 문자열 목록 |
| Set | 중복이 없고 정렬되지 않은 문자열 모음 |
| Sorted Set | 점수(score)로 순서를 유지하는 고유 문자열 모음 |
| Hash | 필드-값 쌍의 모음 |
| Stream | 추가만 가능한 로그 |
| Geospatial index | 반경이나 사각 범위로 위치 검색 |
| JSON | 계층 구조를 갖는 배열과 객체 |
| Time series | 타임스탬프가 붙은 데이터 포인트 |
| Vector set | 벡터 유사도 검색 |
| 확률형 자료형 | Bloom filter, Cuckoo filter, Count-min sketch, HyperLogLog, t-digest, Top-K |
| Array | 인덱스로 접근하는 희소 시퀀스 |

Stream 은 Redis 5.0 에서 추가되었습니다. JSON·Time series·확률형 자료형은 예전에 모듈로 따로 설치해야 했지만, Redis 8.0 이 Redis Stack 과 Community Edition 을 Redis Open Source 하나로 합치면서 모듈 없이 쓸 수 있게 되었습니다. Vector set 은 그 8.0 에서 베타로 추가된 자료형이고, Array 는 8.8 에서 추가되었습니다.

명령 이름에는 규칙이 있습니다. Set 명령은 S, Hash 는 H, Sorted Set 은 Z 로 시작합니다. List 명령은 연산 방향에 따라 왼쪽이 L, 오른쪽이 R 로 시작합니다.

컬렉션 하나가 담을 수 있는 원소 수에도 상한이 있습니다. 공식 문서는 Set 하나의 최대 크기를 2^32 - 1, 곧 4,294,967,295 멤버로 적습니다.

## Hash

여러 속성을 가진 데이터는 키 이름에 콜론(:)을 넣어 구분하는 관례로 표현할 수 있습니다. 이 방식은 속성마다 키를 하나씩 쓰게 됩니다.

```redis
127.0.0.1:6379> MSET user:lion:name "Rasta Lion" user:lion:password qwer1234
OK
127.0.0.1:6379> MGET user:lion:name user:lion:password
1) "Rasta Lion"
2) "qwer1234"
```

Hash 를 쓰면 키 하나 안에 필드-값 쌍을 모아 둘 수 있습니다. HSET 은 필드-값 쌍을 여러 개 받고, 새로 추가된 필드 개수를 반환합니다.

```redis
127.0.0.1:6379> HSET user:cat name "Rasta Cat" password 1234qwer
(integer) 2
127.0.0.1:6379> HVALS user:cat
1) "Rasta Cat"
2) "1234qwer"
127.0.0.1:6379>
```

> **NOTE** — 예전 글과 예제에서 자주 보이는 `HMSET` 은 Redis 4.0 에서 폐기 예고되었습니다. HSET 이 같은 일을 하므로 HSET 을 씁니다. 반환값은 `HMSET` 이 `OK`, HSET 은 추가된 필드 개수라는 점이 다릅니다.

HVALS 는 해시에 저장된 값만 반환합니다. 필드 이름은 HKEYS, 필드와 값을 함께 읽으려면 HGETALL 을 씁니다. 필드 하나만 읽을 때는 HGET 에 필드 이름을 지정합니다.

```redis
127.0.0.1:6379> HGET user:cat password
"1234qwer"
```

Document 타입 DB 인 MongoDB 와 달리 Redis 의 Hash 는 중첩되지 않습니다. Hash 는 문자열 값만 저장할 수 있고, 값 자리에 다른 Hash 를 넣을 수 없습니다. List 도 마찬가지로 중첩할 수 없습니다.

- **HDEL**: Hash 필드 삭제
- **HINCRBY**: 정수 필드의 값을 주어진 값만큼 증가
- **HLEN**: Hash 의 필드 개수 조회

이 밖에도 명령이 많습니다. 전체 목록은 <https://redis.io/commands> 를 참고하시기 바랍니다.

## List

List 는 순서를 가진 값의 목록이라서 Queue 와 Stack 모두로 동작할 수 있습니다. Queue 는 FIFO(first in, first out), Stack 은 LIFO(last in, first out) 로 동작합니다. 리스트 중간에 값을 끼워 넣거나, 크기를 제한하거나, 리스트 사이에 값을 옮기는 연산도 있습니다.

```redis
127.0.0.1:6379> RPUSH lion:wishlist gog fb nav
(integer) 3

127.0.0.1:6379> LLEN lion:wishlist
(integer) 3

127.0.0.1:6379> LRANGE lion:wishlist 0 -1
1) "gog"
2) "fb"
3) "nav"
127.0.0.1:6379>
```

- **RPUSH**: 리스트 오른쪽(끝)에 값을 추가
- **LLEN**: 리스트의 크기를 출력
- **LRANGE**: 시작과 끝 위치를 지정해 리스트의 일부를 읽음

List 연산의 인덱스는 0부터 시작합니다. 맨 왼쪽 첫 번째 요소가 1이 아니라 0입니다. 음수 인덱스는 끝(오른쪽)에서 앞쪽(왼쪽)으로 세는 위치를 뜻하며, -1이 맨 끝입니다.

- **LREM**: 주어진 키에서 일치하는 값을 삭제합니다. 삭제할 개수를 함께 지정하며, 0을 주면 일치하는 값을 모두 삭제합니다. 음수를 주면 맨 끝에서부터 개수만큼 삭제합니다.

```redis
127.0.0.1:6379> LREM lion:wishlist 0 nav
(integer) 1
127.0.0.1:6379>
```

- **LPOP**: 리스트 왼쪽(앞)에서 값을 꺼냄

```redis
127.0.0.1:6379> LPOP lion:wishlist
"gog"
127.0.0.1:6379>
```

wishlist 리스트에서 값을 꺼내 basket 리스트로 옮겨 보겠습니다. 리스트 사이에서 값을 옮기는 명령은 LMOVE 입니다.

```redis
127.0.0.1:6379> LMOVE lion:wishlist lion:basket RIGHT LEFT
"fb"
127.0.0.1:6379> LPOP lion:basket
"fb"
```

wishlist 의 맨 끝에 있던 fb 가 basket 의 맨 앞으로 이동했습니다. LMOVE 는 꺼내는 쪽과 넣는 쪽 방향을 각각 LEFT 또는 RIGHT 로 지정하므로 네 가지 조합을 모두 쓸 수 있고, 두 키가 같으면 리스트 회전이 됩니다.

> **NOTE** — 오른쪽에서 꺼내 왼쪽에 넣는 조합만 제공했던 `RPOPLPUSH` 는 Redis 6.2 에서 폐기 예고되었습니다. 공식 문서는 LMOVE 가 그 자리를 대신하며 `LMOVE source destination RIGHT LEFT` 가 `RPOPLPUSH` 와 같다고 적습니다.

### Blocking 명령

BRPOP 은 꺼낼 값이 생기기 전까지 블로킹하는 명령입니다. 키와 타임아웃(초)이 필요합니다.

창을 두 개 띄워서 각각 redis-cli 로 접속합니다.

1번 윈도우

```redis
127.0.0.1:6379> BRPOP stock 300
```

타임아웃은 300초, 곧 5분입니다. 5분 동안 stock 에 값이 들어오지 않으면 종료됩니다.

2번 윈도우에서 값을 넣습니다.

```redis
127.0.0.1:6379> LPUSH stock "50EA warehousing"
(integer) 1
127.0.0.1:6379>
```

입력과 동시에 1번 윈도우에 결과가 출력됩니다.

```redis
127.0.0.1:6379> BRPOP stock 300
1) "stock"
2) "50EA warehousing"
(62.65s)
127.0.0.1:6379>
```

2번 윈도우에서 입력한 값과 함께 블로킹된 시간이 출력됩니다. 반대 방향으로 기다리는 BLPOP, LMOVE 의 블로킹 형태인 BLMOVE(6.2), 여러 리스트 중 하나에서 꺼내는 BLMPOP(7.0) 도 있습니다. `BRPOPLPUSH` 역시 6.2 에서 폐기 예고되었으므로 BLMOVE 를 씁니다.

## Set

Set 은 중복된 값이 없고 정렬되지 않은 데이터 모음입니다. 두 개 이상의 키 사이에서 합집합이나 교집합 같은 집합 연산을 할 때 씁니다.

- **SADD**: Set 에 값을 추가
- **SMEMBERS**: Set 이 가진 값을 출력
- **SINTER**: 교집합
- **SDIFF**: 차집합
- **SUNION**: 합집합

```redis
127.0.0.1:6379> SADD blog rastalion.me umount.net
(integer) 2
127.0.0.1:6379>
```

blog 라는 Set 에 값 두 개가 추가되었습니다. SMEMBERS 로 blog Set 에 포함된 값을 조회합니다.

```redis
127.0.0.1:6379> SMEMBERS blog
1) "rastalion.me"
2) "umount.net"
127.0.0.1:6379>
```

homepages 라는 Set 을 하나 더 만듭니다.

```redis
127.0.0.1:6379> SADD homepages rastalion.me facebook.com
(integer) 2
127.0.0.1:6379> SMEMBERS homepages
1) "facebook.com"
2) "rastalion.me"
127.0.0.1:6379>
```

SINTER 로 두 Set 의 교집합을 찾습니다.

```redis
127.0.0.1:6379> SINTER blog homepages
1) "rastalion.me"
127.0.0.1:6379>
```

SDIFF 는 앞의 Set 에서 뒤의 Set 을 뺀 나머지를 반환합니다.

```redis
127.0.0.1:6379> SDIFF blog homepages
1) "umount.net"
127.0.0.1:6379>
```

SUNION 으로 두 Set 의 값을 모두 출력할 수도 있습니다.

```redis
127.0.0.1:6379> SUNION blog homepages
1) "facebook.com"
2) "rastalion.me"
3) "umount.net"
127.0.0.1:6379>
```

- **SUNIONSTORE**: 합집합 결과를 새로운 Set 으로 저장
- **SINTERSTORE**: 교집합 결과를 새로운 Set 으로 저장
- **SDIFFSTORE**: 차집합 결과를 새로운 Set 으로 저장

```redis
127.0.0.1:6379> SUNIONSTORE favorite blog homepages
(integer) 3
127.0.0.1:6379> SMEMBERS favorite
1) "facebook.com"
2) "rastalion.me"
3) "umount.net"
127.0.0.1:6379>
```

- **SMOVE**: 한 Set 의 값을 다른 Set 으로 이동
- **SCARD**: Set 의 값 개수를 카운트
- **SPOP**: Set 에서 무작위로 값을 꺼냄
- **SREM**: Set 에서 값을 삭제

List 와 달리 Set 에는 블로킹 명령이 없습니다. 값이 들어올 때까지 기다려야 한다면 List 의 BRPOP·BLMOVE 나 Sorted Set 의 BZPOPMIN·BZPOPMAX 를 씁니다.
