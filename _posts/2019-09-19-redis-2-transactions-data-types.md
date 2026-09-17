---
date: 2019-09-19 20:58:55 +0900
title: "Redis #.2 트랜잭션과 데이터 타입"
category: redis
excerpt: "SET 과 GET SET : 키 값을 추가 할 수 있음. 항상 Key-Value로 된 두개의 매개변수를 필요로 함. GET : SET으로 입력한 값을 읽을때 사용. 간단하게 웹 주소를 단축하는 키 값을 추가해 봅니다. 127.0.0.1:6379>..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — SET/GET/MGET/INCR/MULTI/EXEC/DISCARD 와 List·Hash·Set 기본 동작은 Redis 8.10 에서도 그대로 유효하지만, 예제에 쓰인 `HMSET` 은 Redis 4.0 부터, `RPOPLPUSH`/`BRPOPLPUSH` 는 Redis 6.2 부터 폐기 예고되어 각각 `HSET`, `LMOVE`/`BLMOVE` 로 대체되었습니다. "키 하나당 2^23개 또는 40억 개"는 부정확하며 컬렉션 최대 원소 수는 2^32-1(약 42.9억)이고, 현재 Redis 는 Stream(5.0)·JSON·Time series·확률형 자료구조·Vector set 까지 기본 제공합니다.

**SET과 GET**

- **SET**: 키 값을 추가할 수 있다. Key-Value 쌍 두 개의 매개변수가 필요하다.
- **GET**: SET으로 입력한 값을 읽을 때 사용한다.

간단하게 웹 주소를 단축하는 키 값을 추가해 봅니다.

```redis
127.0.0.1:6379> set ral https://rastalion.dev
OK
127.0.0.1:6379> get ral
"https://rastalion.dev"
```

네트워크 트래픽을 줄이기 위해 get 명령을 mget 명령으로 대체하여 여러 쌍의 key-value를 불러올 수 있습니다.

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

mget은 여러 개의 키를 받아서 관련 값을 정렬 리스트로 반환합니다.

**숫자 연산**

Redis는 모든 값을 문자열로 저장합니다. 그러나 문자열로 된 숫자를 정수(integer)로 인식하고 처리해주는 연산을 제공합니다.

```redis
127.0.0.1:6379> set number 1
OK
127.0.0.1:6379> incr number
(integer) 2
127.0.0.1:6379> get number
"2"
127.0.0.1:6379>
```

incr 명령을 통해 숫자 값에 1을 더할 수 있습니다. get 명령은 number를 문자열로 반환하지만, incr은 정수로 인식하고 1을 증가시킵니다.

- **incr**: 숫자 값에 1을 증가
- **decr**: 숫자 값에 1을 감소
- **incrby**: 지정한 정수를 더함
- **decrby**: 지정한 정수를 뺌

**트랜잭션**

- **multi**: 여러 명령을 하나의 블록으로 묶어두고 큐에 쌓아둡니다.
- **exec**: multi에 쌓아둔 큐를 실행합니다.
- **discard**: multi 큐에 쌓아둔 트랜잭션을 중지합니다.

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

discard 명령을 실행한 후 exec를 실행하면 큐에 쌓였던 명령들이 실행되지 않습니다. 트랜잭션을 취소하는 개념인데, RDBMS의 commit 전 rollback과 메커니즘은 다르지만 비슷한 개념입니다.

**데이터 타입**

Redis는 여러 가지 데이터 타입을 처리할 수 있습니다. List, Hash, Set, Sorted Set 데이터 타입이 존재하며, Redis의 데이터 타입들은 키 하나당 2^23개 또는 40억 개 이상의 값을 가질 수 있습니다. Redis의 명령들은 다음 형태의 이름을 갖습니다. Set 명령들은 S로 시작, Hash는 H, Sorted Set은 Z로 시작합니다. 리스트 명령들은 연산 방향에 따라 왼쪽 L, 오른쪽 R로 시작합니다.

**Hash**

논리적으로 키 필드를 구분하는 대신, Key-Value 쌍으로 된 데이터를 포함하는 Hash를 생성할 수 있습니다. 키 필드를 나타낼 때는 콜론(:)을 사용합니다. 해시는 키 필드를 사용하므로 키 자체의 값을 주지 않아도 됩니다.

```redis
127.0.0.1:6379> MSET user:lion:name "Rasta Lion" user:lion:password qwer1234
OK
127.0.0.1:6379> MGET user:lion:name user:lion:password
1) "Rasta Lion"
2) "qwer1234"
```

Hash를 사용해서 MSET을 이용하면 아래와 같습니다. 결과물은 위와 같습니다.

```redis
127.0.0.1:6379> HMSET user:cat name "Rasta Cat" password 1234qwer
OK
127.0.0.1:6379> HVALS user:cat
1) "Rasta Cat"
2) "1234qwer"
127.0.0.1:6379>
```

HVALS를 이용하면 모든 해시 키를 읽을 수 있습니다. 또는 해시 키를 지정하여 하나의 값만 읽을 수도 있습니다.

```redis
127.0.0.1:6379> HGET user:cat password
"1234qwer"
```

Document 타입의 DB인 MongoDB와는 다르게 Redis의 Hash는 중첩될 수 없습니다. List 타입의 데이터 타입에서도 중첩은 불가능합니다. Hash는 문자열 값만 저장할 수 있습니다. Hash의 값으로 다른 Hash를 저장하는 것도 불가능합니다.

- **HDEL**: Hash 필드의 삭제
- **HINCRBY**: 정수 필드의 값을 주어진 값만큼 증가
- **HLEN**: Hash의 필드 개수 조회

이 밖에도 다른 명령이 많이 있습니다. 명령어는 <https://redis.io/commands>를 참고하시기 바랍니다.

**List**

여러 개의 순서적인 값을 포함하여, Queue와 Stack 모두로 동작할 수 있습니다. Queue는 FIFO(first in, first out) 알고리즘으로 동작하며, Stack은 LIFO(last in, first out) 알고리즘으로 동작합니다. List는 복잡한 동작을 수행할 수 있습니다. 리스트 중간에 데이터를 끼워 넣거나, 크기를 제한하거나, 리스트들 간의 값을 옮길 수도 있습니다.

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
- **LRANGE**: 첫 번째와 마지막의 위치를 지정하여 리스트의 부분 값을 읽음

Redis의 모든 List 연산에서는 0을 기준으로 하는 인덱스를 사용합니다. 맨 왼쪽, 첫 번째 요소가 1이 아닌 0으로 시작합니다. 인덱스 값이 음수인 경우는 끝(오른쪽)에서 앞쪽(왼쪽)으로 오면서 나타내는 위치를 의미합니다. -1은 맨 끝(오른쪽)입니다.

- **LREM**: 주어진 키로부터 일치하는 값을 삭제합니다. 이때 삭제할 일치 값들의 개수를 표기해야 합니다. 0을 주면 일치하는 모든 값을 삭제합니다. 음수를 주면 맨 끝에서부터 개수만큼 삭제합니다.

```redis
127.0.0.1:6379> LREM lion:wishlist 0 nav
(integer) 1
127.0.0.1:6379>
```

- **LPOP**: 리스트의 왼쪽(앞)부터 호출

```redis
127.0.0.1:6379> LPOP lion:wishlist
"gog"
127.0.0.1:6379>
```

RPUSH, RPOP, LPUSH, LPOP 명령들을 조합해서 원하는 값만 출력할 수도 있습니다.

wishlist 리스트에서 값을 호출해 다른 basket 리스트에 넣어 보겠습니다.

```redis
127.0.0.1:6379> RPOPLPUSH lion:wishlist lion:basket
"fb"
127.0.0.1:6379> lpop lion:basket
"fb"
```

wishlist의 맨 끝에 있던 fb가 RPOPLPUSH 명령에 의해 basket의 맨 앞으로 이동되었습니다.

RPOPLPUSH만 명령어가 존재하며, RPOPRPUSH, LPOPLPUSH, LPOPRPUSH 같은 명령어는 존재하지 않습니다. 해당 조합 명령은 CLI에서는 불가능하며, Redis를 지원하는 프로그래밍 언어에서 멀티 블록을 엮어서 실행하면 됩니다.

**Blocking List**

BRPOP: 호출할 값이 생성되기 전까지 Blocking을 하는 명령어입니다. 값을 호출하기 위한 키와 타임아웃 시간(초)이 필요합니다.

창을 두 개 띄워서 각각 redis-cli로 접속합니다.

1번 윈도우

```redis
127.0.0.1:6379> BRPOP stock 300
```

타임아웃은 5분이며 5분 동안 값이 stock에 들어오지 않으면 종료됩니다.

2번 윈도우에서 값 입력

```redis
127.0.0.1:6379> LPUSH stock "50EA warehousing"
(integer) 1
127.0.0.1:6379>
```

입력과 동시에 1번 윈도우에서

```redis
127.0.0.1:6379> BRPOP stock 300
1) "stock"
2) "50EA warehousing"
(62.65s)
127.0.0.1:6379>
```

2번 윈도우에서 입력한 메시지가 출력되면서, Blocking된 시간이 함께 출력됩니다.

BLPOP, BRPOPLPUSH 등의 Blocking 명령어들이 있습니다.

**SET**

Set은 중복된 값이 없고 정렬되지 않은 데이터 모음입니다. 두 개 이상의 키 값들 간의 Union이나 Intersection 같은 복잡한 연산을 수행할 때 필요합니다. 하나의 공통 키를 갖는 집합을 만들고자 하며, SADD 명령을 사용해서 값을 추가할 수 있습니다.

- **SADD**: Set 생성
- **SMEMBERS**: Set이 가진 값을 출력
- **SINTER**: 교집합
- **SDIFF**: 차집합
- **SUNION**: 합집합

```redis
127.0.0.1:6379> SADD blog rastalion.me umount.net
(integer) 2
127.0.0.1:6379>
```

blog라는 Set에 두 개의 값이 추가되었습니다. SMEMBERS라는 명령어로 blog Set 안에 포함된 값을 조회할 수 있습니다.

```redis
127.0.0.1:6379> SMEMBERS blog
1) "rastalion.me"
2) "umount.net"
127.0.0.1:6379>
```

homepage라는 Set을 추가합니다.

```redis
127.0.0.1:6379> SADD homepages rastalion.me facebook.com
(integer) 2
127.0.0.1:6379> SMEMBERS homepages
1) "facebook.com"
2) "rastalion.me"
127.0.0.1:6379>
```

SINTER라는 명령어를 사용하면 두 개의 Set 사이에 교집합을 찾을 수 있습니다.

```redis
127.0.0.1:6379> SINTER blog homepages
1) "rastalion.me"
127.0.0.1:6379>
```

SDIFF를 이용하면 앞의 Set에서 뒤의 Set을 뺀 나머지 값을 찾을 수 있습니다.

```redis
127.0.0.1:6379> SDIFF blog homepages
1) "umount.net"
127.0.0.1:6379>
```

SUNION으로 두 개 Set에 값을 모두 출력할 수도 있습니다.

```redis
127.0.0.1:6379> SUNION blog homepages
1) "facebook.com"
2) "rastalion.me"
3) "umount.net"
127.0.0.1:6379>
```

- **SUNIONSTORE**: 합집합의 결과 값을 새로운 Set으로 저장
- **SINTERSTORE**: 교집합의 결과 값을 새로운 Set으로 저장
- **SDIFFSTORE**: 차집합의 결과 값을 새로운 Set으로 저장

```redis
127.0.0.1:6379> SUNIONSTORE favorite blog homepages
(integer) 3
127.0.0.1:6379> SMEMBERS favorite
1) "facebook.com"
2) "rastalion.me"
3) "umount.net"
127.0.0.1:6379>
```

- **SMOVE**: 한 Set의 값들을 다른 Set으로 이동
- **SCARD**: Set의 값 개수를 카운트
- **SPOP**: Set에서 무작위로 값을 호출
- **SREM**: Set에서 값을 삭제

List와 달리 Set은 Blocking 명령이 없습니다.
