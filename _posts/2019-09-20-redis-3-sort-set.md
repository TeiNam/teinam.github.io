---
date: 2019-09-20 01:14:59 +0900
title: "Redis #.3 Sort Set"
category: redis
excerpt: "Sort SET Sort SET은 Redis가 가진 각각의 데이터 타입들의 특성을 고루 가지고 있습니다. List 처럼 정렬되며, Set처럼 고유한 값들을 갖습니다. Hash 처럼 키 필드와 값의 쌍으로된 데이터를 갖지만, 문자열 대신 값의 순서를 나타내는 지수(score)를..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — ZADD·ZINCRBY·ZRANGE·ZUNIONSTORE·ZINTERSTORE 및 WEIGHTS/AGGREGATE 옵션 설명은 현재도 정확합니다. 다만 예제의 `ZREVRANGE`, `ZRANGEBYSCORE`, `ZREVRANGEBYSCORE` 는 Redis 6.2 부터 폐기 예고되어 `ZRANGE ... REV` / `ZRANGE ... BYSCORE` 로 대체되었습니다.

![Redis 로고](/assets/img/wp/2019/09/redis.png)

**Sort SET**

Sort SET은 Redis가 가진 각 데이터 타입의 특성을 고루 가진다. List처럼 정렬되며, Set처럼 고유한 값을 갖는다. Hash처럼 키 필드와 값의 쌍으로 된 데이터를 갖지만, 문자열 대신 값의 순서를 나타내는 지수(score)를 사용한다. Sort SET은 무작위로 액세스하는 우선순위 큐(priority queue)와 비슷하다. 내부적으로 Sort SET은 값을 정렬된 상태로 유지한다. 따라서 데이터를 추가할 때 Sort SET의 소요시간은 log(N)의 시간이 필요하다. N은 Set 크기이다.

학생의 학점을 저장하는 Sort SET을 만들어 보겠습니다.

```bash
127.0.0.1:6379> ZADD score 100 lion 90 cat 10 eundoon 80 hols
(integer) 4
127.0.0.1:6379>
```

Redis Key값 (=score) 다음에 점수와 이름을 값으로 넣어줬습니다. 이 같은 경우에는 점수가 Sort SET의 지수가 됩니다.

ZINCRBY 명령으로 점수를 추가하여 수정 할 수 있습니다.

Set에서 값을 읽어올때 RANGE 명령을 사용했듯이, Sort SET에서는 ZRANGE 명령을 사용합니다. List 타입의 LRANGE 명령처럼 지정한 위치의 값을 호출합니다. Sort SET의 경우 지수(score)가 가장 작은것부터 큰 순으로 정렬이 되어 위치가 결정 됩니다. 따라서 점수가 제일 낮은 학생을 알려면 인덱스를 0으로 놓고 출력하고자 하는 학생 수 만큼 인덱스 값을 주면 됩니다.

```bash
127.0.0.1:6379> ZRANGE score 0 4
1) "eundoon"
2) "hols"
3) "cat"
4) "lion"
127.0.0.1:6379>
```

점수가 큰 순으로 조회하면서 점수도 같이 출력하고 싶을 때는 ZREVRANGE 명령을 사용하고 WITHSCORES 옵션을 줍니다.

```bash
127.0.0.1:6379> ZREVRANGE score 0 -1 withscores
1) "lion"
2) "100"
3) "cat"
4) "90"
5) "hols"
6) "80"
7) "eundoon"
8) "10"
127.0.0.1:6379>
```

- **ZRANGEBYSCORE** : 조건에 맞는 값만 호출. 범위 값으로 양수, 음수, 무한대 모두 줄수 있음.

  
```bash
127.0.0.1:6379> ZRANGEBYSCORE score -inf inf
1) "eundoon"
2) "hols"
3) "cat"
4) "lion"
127.0.0.1:6379>
```

- **ZREVRANGEBYSCORE** : ZRANGEBYSCORE의 역순으로 출력.
- **ZREMRANGEBYRANK** : rank 별로 값을 삭제.
- **ZREMRANGBYSCORE** : 지수별로 값을 삭제.

**집합의 연산**

- **ZUNIONSTORE** : 합집합을 포함하는 Key를 생성
- **ZINTERSTORE** : 교집합을 포함하는 Key를 생성

※ aggregate 옵션은 각 weight(가중치가 적용된 score)를 분석 및 합계하는 생략 가능한 옵션입니다. Sort SET의 값에 가중치를 줘서 새로운 값을 산출하기 위해 줄수 있는 옵션입니다.

```bash
127.0.0.1:6379> ZADD votes 2 hols 0 eundoon 10 cat

127.0.0.1:6379> ZUNIONSTORE importance 2 score votes WEIGHTS 2 1 AGGREGATE SUM
(integer) 4
127.0.0.1:6379> ZRANGEBYSCORE importance -inf inf WITHSCORES
1) "eundoon"
2) "20"
3) "hols"
4) "162"
5) "cat"
6) "190"
7) "lion"
8) "200"
127.0.0.1:6379>
```

투표 Sort SET을 만들고, 점수와 투표의 합집합을 가지고 점수에 2배 가중치를 줘서 결과값을 출력해 봤습니다.
