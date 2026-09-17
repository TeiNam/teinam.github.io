---
date: 2021-11-23 14:54:56 +0900
title: "Redis 요약 정리"
category: redis
excerpt: "레디스에 대해서는 오랜만에 글을 정리하는 것 같네요. 최근 레디스에 대해 정리하면서 간단하게 요약 했던 내용들입니다. 아마 다른 분들이 우아한 레디스를 보고 정리한 내용들하고 큰 차이가 없는 정도이고, 그냥 아는 선에서 정리한 내용입니다. ..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — Sentinel 과 Cluster 비교, SDOWN/ODOWN, RDB/AOF, 컬렉션 크기·싱글스레드 주의사항 등 개념 설명은 2026년 9월에도 대체로 유효하며 "Cluster 는 0번 DB만 사용 가능"도 여전히 맞습니다. 다만 Hash Slot 은 CRC-16 값을 16385 가 아니라 **16384** 로 모듈 연산합니다(슬롯 총수 16384개). 용어도 master/slave·`slaveof` 대신 primary/replica·`replicaof` 를 쓰며, Ziplist 관련 튜닝 항목은 Redis 7.0 부터 `hash-max-listpack-entries` 등 listpack 계열 파라미터로 대체되었습니다. Redis 8 의 io-threads 기반 멀티스레드 I/O 와 새 복제 방식(복제 버퍼 최대 35% 감소)이 추가되어 일부 성능 주의사항은 완화되었습니다.

![Redis 로고](/assets/img/wp/2019/09/redis.png)

레디스에 대해서는 오랜만에 글을 정리하는 것 같네요. 최근 레디스에 대해 정리하면서 요약했던 내용들입니다. 아마 다른 분들이 우아한 레디스를 보고 정리한 내용들하고 큰 차이가 없는 정도이고, 그냥 아는 선에서 정리한 내용입니다.

## Redis Cluster와 Sentinel의 차이점

### Sentinel

- Redis의 고가용성(HA) 솔루션
- Master/Slave 리플리케이션
- Sentinel의 프로세스
  - redis와 별도의 프로세스
  - 안정적인 운영을 위해서 최소 3개 이상은 Sentinel 인스턴스 필요(failover를 위한 과반수 이상 Vote 필요)
  - M/S 동작에 대한 모니터링과 문제 발생시 Auto Failover
  - Sentinel을 통해 접근
- Failover 동작방식
  - Sentinel 인스턴스 과반수 이상이 Master 장애를 감지하면 Slave 중 하나를 Master로 승격시키고 기존의 Master는 Slave로 강등.
  - Slave가 여러 개 있을 경우 Slave가 새로운 Master로부터 데이터를 받을 수 있도록 재구성.
  - 과반수 이상으로 결정하는 이유는 만약 어느 sentinel이 단순히 네트워크 문제로 master와 연결되지 않을 수 있는데, 그 때 실제로 Master는 다운되지 않았으나 연결이 끊긴 sentinel은 Master가 다운되었다고 판단할 수 있기 때문
  - `SDOWN`: Subjectively down(주관적 다운)
    - Sentinel에서 주기적으로 Master에게 보내는 `PING`과 `INFO` 명령의 응답이 3초(`down-after-milliseconds`에서 설정한 값) 동안 오지 않으면 주관적 다운으로 인지. 센티널 한 대에서 판단한 것으로, 주관적 다운만으로는 장애조치를 진행하지 않음.
  - `ODOWN`: Objectively down(객관적 다운)
    - 설정한 quorum 이상의 Sentinel에서 해당 Master가 다운되었다고 인지하면 객관적 다운으로 인정하고 장애 조치를 진행.
- failover시 주의 사항
  - `get-master-addr-by-namez`
    - Master, Slave 모두 다운되었을 때 Sentinel에 접속해 Master 서버 정보를 요청하면 다운된 서버 정보를 리턴한다. 따라서 `INFO sentinel` 명령으로 마스터의 status를 확인해야 한다.
  - Slave → Master 승격 안되는 경우
    - Slave다운 → Master다운 → 다운된 Slave재시작되면 이 서버는 Master로 전환되지 않는다. Slave의 `redis.conf`에 자신이 복제로 되어 있고, sentinel도 복제라고 인식하고 있기 때문이다. 해결책은 Slave가 시작하기 전에 `redis.conf`에서 `slaveof`를 삭제하는 것이다.
  - Failover Timeout 만큼 write 연산 실패
    - 데이터량에 따른 최적의 Failover Timeout값을 찾고 `sentinel.conf`에 적용해야 한다.
- 단일 인스턴스를 사용하는 것과 마찬가지로 Redis의 모든 기능을 사용할 수 있음
- One Master 구조이기 때문에 사이즈가 커지면 scale-up을 해야함.

### Cluster

- Redis가 자체적으로 지원하는 클러스터링 시스템
- 고가용성(HA) 및 Sharding 지원
  - 모든 데이터는 Master 단위로 샤딩되고 Slave 단위로 복제.
  - Master 마다 최소 하나 이상의 Slave를 권장
- 클러스터 단위의 HA 구성 (Master Cluster/ Slave Cluster)
  - Master 노드가 Shutdown 되면 gossip protocol을 이용해 상태를 확인하고, Slave중 하나를 Master로 승격.
  - gossip protocol: Redis 노드간에 직접 연결되어 상태를 확인, Redis Client가 이용하는 Port번호보다 10000높은 port 번호를 이용
  - 기존의 Master가 재구동되면 Master로 승격된 Slave의 새로운 Slave로 자동 구성됨.
  - 과반수 이상의 노드가 다운되면 Cluster가 깨짐.
  - Replication은 Async 방식으로 동작하기 때문에 데이터 정합성이 깨질 수 있는데, Master가 된 Data를 기준으로 정합성을 맞춰야 함.
- Hash Slot을 이용해 데이터를 Sharding
  - Hash Slot: CRC-16 Hash Function을 이용해 key를 정수로 변환하고 해당 정수값을 16385로 모듈 연산한 값
  - Cluster는 16384개의 Hash Slot을 가지며, Master Cluster에 자유롭게 할당(Master 노드의 수만큼 16384의 슬롯을 분할)
  - 저장된 key를 hashslot으로 맵핑하기 위한 테이블을 가지고 있기 때문에 추가적인 Memory Overhead가 발생, key의 숫자가 많아질수록 이러한 현상이 두드러짐.
  - 최대 1000개까지 확장 가능
  - 노드 추가/삭제시 운영 중단 없이 Hash Slot 재구성 가능
  - failover가 발생한다면, 슬레이브가 마스터로 승격할 때까지, 문제가 발생한 마스터로 할당된 Hash Slot의 키는 사용할 수 없음.
  - Key 이동 시에 해당 Key에 일시적인 Lock이 발생
  - 쿼리를 받은 노드가 해당 쿼리를 분석
    - 해당 키를 자기 자신이 갖고있다면 바로 찾아서 값을 리턴
    - 그렇지 않은경우 해당 키를 저장하고 있는 노드의 정보를 리턴 (클라이언트는 이 정보를 토대로 쿼리를 다시 보내야함)
- Redis Cluster를 지원하는 Client를 사용해야 샤드에 맞는 데이터 액세스가 가능 (predixy 등)
  - 클라이언트가 redis에 데이터를 요청했을 때, 올바르지 않은 master node에 요청하면 해당 데이터가 저장된 위치를 알려주고 client에게 알려주고 client는 제대로 된 주소에 다시 요청한다.
- Redis Cluster는 오직 0번 데이터베이스만 사용가능.(단일 인스턴스 처럼 0~15의 복수의 데이터베이스 사용이 불가능)
- Hash Slot 테이블에 의한 메모리 사용량 증가
- 마이그레션 관리가 필요
- 라이브러리 구현이 필요

### Redis 샤딩

- 데이터 분산
  - Consistent Hashing 아키텍처를 사용
  - 일반 모듈러 해싱은 서버가 장애/추가 될 때마다 여러 서버에서 걸쳐 데이터 리밸런싱이 일어난다.
  - Consistent Hashing은 자기 해시보다 크고 가장 근접한 해시를 가진 서버 찾아간다. 따라서 서버 장애/추가 될 때에 N분의 1만큼만 이동하게 된다.
  - Consistent Hashing도 실제 부하를 아주 균등하게 나누지는 않음. Adaptive Consistent Hashing을 이용해 볼 수도 있음
- 샤딩
  - Range: 특정 Range를 정의하고 속하는 Range에 저장 → 데이터가 일정 Range에 몰리거나 비어있을 수 있다.
  - Modular를 사용할 경우 하나씩 추가하면 데이터 리밸런싱이 빈번하게 발생하므로 \*2만큼 늘려준다면, 규칙적으로 데이터들이 이동한다.
  - Indexed: 해당 key가 어디에 저장되어야 할 관리 서버가 따로 존재, 단 인덱스 서버가 죽으면 심각한 장애

## Data Persistence (데이터 영속성)

- In-Memory DB이지만 디스크에 기록하는 기능이 있음
- 메모리를 여유있게 유지해야 함
- 영속성 유지가 필요하면 Slave에서만 진행
- 정기적인 Migration이 필요

- RDB
  - 주기적으로 point-in-time snapshot을 생성
  - 작은 단일 파일로 저장
  - 부모 프로세스는 자식 프로세스를 Fork. Fork된 프로세스에서 Persist I/O 처리
  - restart 시간이 짧음
  - 멈췄을때 데이터 유실 가능성이 있음

- AOF (Append Only File)
  - 모든 Write Operation을 Log로 기록하고, 재시작 시점에 Replay
  - 데이터 양이 많아지면 해당 시점의 데이터셋을 만들어낼수도록 하는 최소한의 log 들만 남기고 압축한다.
  - 읽기 쉬운 포맷이지만 RDB보다 용량이 큼
  - Write 요청이 많을 때 RDB보다 반응성이 느림

## Redis 사용시 주의사항

- Collection 안에 너무 많은 아이템 사용금지 (1만개 이하)
- Expire는 아이템 단위가 아닌 Collection 단위로 동작
- 철저한 메모리 관리 필요. Redis는 자기가 사용하는 정확한 메모리 양을 모름. 파편화가 발생함으로 모니터링 및 관리가 필수
- 작은 인스턴스 여러개로 사용할 것. Write가 많은 Redis는 메모리를 두 배까지 사용할 수 있으며, 그 경우 퍼포먼스가 극단적으로 떨어짐
- Hash, Sorted Set, Set은 메모리 사용이 많음. Ziplist 사용하면 속도는 떨어지나 메모리 관리에서 이점이 있음
- 싱글 스레드이므로 시간이 오래걸리는 명령어에 주의 (`KEYS`, `FLUSHALL`, `FLUSHDB`, Delete Collections, Get All Collections), 데이터 호출시엔 1000개 이하 권장
- Replication 사용시 주의사항
  - now()는 Master와 Slave에서 다른 결과를 출력할 수 있음.
  - `redis-cli –rdb` 명령은 메모리 스냅샷을 가지고 오기 때문에 서버가 죽을수 있음
  - Replication lag이 일정 이상 발생하는 경우 커넥션을 끊고 다시 연결하는 과정에 많은 부하가 발생할 수 있음
- `redis.conf` 권장 설정
  - `Maxclient`: 5000
  - `RDB/AOF`: off
  - 특정 커맨드 Disable (못사용하게 설정 파일에서 막을수 있음)
  - 전체 장애의 90% 이상이 `KEYS`와 `SAVE` 설정을 사용해서 발생 (`save` 설정은 1초안에 키가 N개 바뀌면 dump하라는 설정)

여기까지 레디스에 대한 요약 정리입니다. 핵심적인건 다 담은것 같네요.
