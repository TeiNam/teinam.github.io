---
date: 2026-09-30 00:00:00 +0900
title: "“DB 페일오버는 1초라는데” 애플리케이션은 왜 DB를 못 찾을까?"
category: mysql
excerpt: "Aurora MySQL 페일오버를 19개 JDBC 구성으로 동시에 관찰했습니다. 약 2초와 약 30분으로 갈린 쓰기 복구, 옛 writer 재접속, 에러 없는 쓰기 정지를 실제 기록으로 살펴보고, 반복별 측정 자료를 CSV로 함께 공개합니다."
last_modified_at: 2026-09-30
---
DB 클러스터가 새 쓰기 인스턴스(writer)를 승격했는데도 애플리케이션의 쓰기가 계속 실패할 수 있습니다. 이런 실패 중에는 연결이 살아 있고 읽기도 성공하는데 쓰기만 거부되는 경우도 있습니다.

직접 측정해 보니 실제로 이런 일이 일어났습니다. 같은 Aurora MySQL 클러스터에 연결한 애플리케이션들이 같은 페일오버(failover)를 겪었습니다. 어떤 구성은 약 2초 만에 쓰기가 다시 성공했고 어떤 구성은 약 30분이 걸렸습니다. 오래 멈춘 구성은 **읽기 인스턴스(reader)로 강등된 옛 writer에 다시 연결해 그 연결을 계속 사용**하고 있었습니다.[^experiment]

제목의 **“1초”가 무엇을 잰 값인지부터 구분해야 합니다. 이 기록에서 1초 미만이었던 것은 페일오버 명령이 반환되기까지의 시간이었습니다.** DB 내부 전환이나 서비스 복구가 1초 안에 끝났다는 뜻은 아닙니다. 이 글에서 **애플리케이션의 복구**는 새 writer가 생긴 뒤 애플리케이션이 그 writer에서 실제 쓰기에 다시 성공하는 것입니다.

이 글은 두 가지 질문에 답합니다. 페일오버가 끝났는데 애플리케이션은 왜 쓰지 못할까요? 운영 중인 서비스에서는 무엇을 확인해야 할까요?

**이 글에서 알 수 있는 것**(수동 페일오버 S1 기준)

- AWS Advanced JDBC Wrapper(기존 드라이버를 감싸 새 writer를 직접 찾는 AWS 드라이버, 이하 Wrapper)를 쓴 구성은 약 2초 만에 새 writer에서 쓰기에 다시 성공했습니다.
- DNS·타임아웃을 조정한 일반 드라이버는 약 10초 만에 새 writer로 돌아왔습니다.
- 기본값 일반 드라이버는 옛 writer에 남아 길게 관찰한 반복에서 약 30분 뒤에야 쓰기가 복구됐습니다. 커넥션 풀은 그 연결을 고장으로 보지 않았습니다.

JDBC URL에 따라 페일오버 복구 시간이 달라진다는 사례를 보고 드라이버·DNS·커넥션 풀(connection pool) 설정을 바꿔 가며 직접 측정했습니다.

가벼운 JDBC 부하를 걸고 수동 페일오버 10회(S1), reader 삭제 2회(S2), Blue/Green 전환(S3)을 관찰했습니다. Blue/Green 전환은 DB 사용자(`probe`·`admin`)별로 1회씩입니다. 반복별 요약 자료는 11절에 CSV로 공개합니다.

이 실측 결과로 참고 사례의 복구 시간이나 운영 환경의 문제를 설명하지는 않습니다. 장기 트랜잭션, 네트워크 단절, 높은 동시성, ORM·Spring Boot 설정 바인딩, RDS Proxy는 측정 범위에 없습니다. reader 삭제는 2회, Blue/Green은 사용자별 1회뿐이어서 그 결과는 복구 시간을 일반화할 근거가 되지 않습니다.

이 글의 측정일과 문서 조사 기준일은 2026년 9월 28일입니다.

## 1. 먼저 알아 둘 개념은 무엇일까요

이 글은 DB 서버 내부보다 애플리케이션과 DB 사이의 연결 경로를 따라갑니다. 이 경로에 나오는 용어부터 정리합니다.

Aurora 클러스터에는 쓰기를 받는 writer와 읽기만 받는 reader가 있습니다. 애플리케이션은 보통 인스턴스 주소를 직접 쓰지 않고 클러스터가 제공하는 DNS 이름(endpoint)으로 연결합니다. 페일오버가 일어나면 이 이름이 가리키는 인스턴스가 바뀝니다.

{% include diagram.html src="aurora-endpoints-basics.svg" caption="애플리케이션은 DNS 이름으로 연결하고, 페일오버 때 그 이름이 가리키는 대상이 바뀝니다" %}

| 용어 | 쉬운 설명 |
| --- | --- |
| writer | 클러스터에서 쓰기를 받는 인스턴스입니다. 이 실험의 클러스터에는 writer가 1대 있었습니다. |
| reader | 읽기만 받는 인스턴스입니다. reader에 쓰기를 보내면 read-only 오류가 돌아옵니다. |
| cluster endpoint | 현재 writer를 가리키는 DNS 이름입니다. writer가 바뀌면 이 이름이 가리키는 IP 주소도 바뀝니다.[^endpoint] |
| reader endpoint(`cluster-ro`) | reader들에 읽기 연결을 나눠 주는 DNS 이름입니다.[^endpoints-overview] 페일오버 중에도 다른 reader는 이 이름으로 들어온 읽기를 계속 처리할 수 있습니다.[^ha] |
| 페일오버(failover) | writer 역할을 다른 인스턴스로 넘기는 동작입니다. Aurora MySQL은 이때 옛 writer와 새 writer가 될 reader를 재시작합니다.[^ha] 이 실험에서 옛 writer는 reader로 강등됐습니다. |
| JDBC 드라이버 | Java 애플리케이션이 DB와 SQL을 주고받게 해 주는 라이브러리입니다. 이 글에서는 MySQL Connector/J와 MariaDB Connector/J를 썼습니다. |
| 커넥션 풀(HikariCP) | DB 연결을 미리 만들어 두고, 애플리케이션에 빌려준 뒤 돌려받는 구성 요소입니다. 이 글의 모든 구성은 HikariCP를 썼습니다. |
| `maxLifetime` | 풀에 있는 연결 하나가 살아 있을 수 있는 최대 시간입니다. 이 시간이 지난 연결은 새 연결로 교체됩니다. HikariCP 7.1.0의 기본값은 30분입니다.[^hikari-config] |
| JVM DNS 캐시(TTL) | JVM이 DNS 조회 결과를 기억해 두는 시간입니다. 이 시간이 지나야 이름을 다시 조회합니다. 일부 Java 설정에서는 JVM을 재시작할 때까지 DNS 항목을 갱신하지 않습니다.[^dns-ttl] |
| AWS Advanced JDBC Wrapper | 기존 JDBC 드라이버를 감싸서 쓰는 AWS의 드라이버입니다. 클러스터 구성(토폴로지)을 따로 확인해 새 writer를 찾습니다.[^failover2] 이 글에서는 줄여서 Wrapper라고 부릅니다. |
| Blue/Green 배포 | 운영 중인 환경(blue) 옆에 복제로 맞춰 둔 새 환경(green)을 두고, 전환(스위치오버, switchover) 때 서비스 대상을 green으로 옮기는 방식입니다. 전환 뒤에도 옛 blue는 남습니다.[^blue-green] |
| read-only 오류(1836) | 읽기 전용 상태인 노드가 쓰기를 거부할 때 돌려주는 오류입니다. 이 글의 기록에서는 SQLState(JDBC 예외에 담기는 표준 오류 분류 값) `HY000`, 오류 코드 `1836`, 메시지 `Running in read-only mode`로 남았습니다. |
| 일반 드라이버 | Wrapper나 `aurora` 스킴 없이 MySQL·MariaDB Connector/J에 cluster endpoint URL을 그대로 쓴 구성입니다. |
| `aurora` 스킴 | MariaDB Connector/J 2.7에서 JDBC URL을 `jdbc:mysql:aurora://`로 시작해 Aurora 전용 동작을 켜는 방식입니다. 3.0.3에서 제거됐습니다.[^mariadb] |

비교한 구성은 모두 19개입니다. 구성 이름은 접두어와 번호로 이뤄집니다.

| 접두어 | 뜻 | 예 |
| --- | --- | --- |
| `d` | 기본값 구성: 드라이버와 커넥션 풀을 기본값으로 둔 구성 | `d01` MySQL 9.7 기본값 |
| `t` | 튜닝 구성: DNS·타임아웃·풀을 조정한 구성 | `t03` MariaDB 2.7 튜닝 |
| `v` | 변형 구성: 튜닝 구성을 바탕으로 일부 설정을 바꾼 비교용 구성 | `v01` t03 + DNS TTL -1 |

시나리오 이름도 세 가지입니다.

- **S1**: 수동 페일오버를 10회 반복했습니다. 이 글의 중심 결과입니다.
- **S2**: reader를 삭제하는 시험을 2회 했습니다. 결과는 9절 끝에 있습니다.
- **S3**: Blue/Green 전환을 사용자별로 1회씩 관찰했습니다.

## 2. 페일오버가 끝났다는 시간은 무엇을 뜻할까요

“페일오버에 걸린 시간”은 무엇을 쟀는지에 따라 값이 다릅니다. 시작점과 끝점이 서로 다르기 때문입니다.

실험에서는 `aws rds failover-db-cluster` 명령으로 페일오버를 요청했습니다. 명령은 0.4~0.5초 만에 반환됐고 RDS의 페일오버 시작·완료 이벤트는 이와 별도로 기록됐습니다.

| 측정 대상 | 이번 기록 | 의미 |
| --- | --- | --- |
| CLI 호출부터 명령 반환까지 | 0.402~0.508초, 10회 | 페일오버 요청을 보낸 명령의 실행 시간 |
| RDS의 페일오버 시작·완료 이벤트 간격 | 6.386~11.660초, 10회 | RDS가 기록한 두 이벤트의 시각 차이 |
| DB 자체가 쓰기를 받을 수 없었던 시간 | 별도 측정하지 않음 | 서버의 SQL 처리 가능 상태를 독립적으로 확인해야 하는 값 |
| 애플리케이션의 쓰기 공백 | 구성에 따라 약 2초~30분, 일부 미복구 | 클라이언트에서 성공한 쓰기가 얼마나 오래 끊겼는지 |

S1 페일오버에서는 명령이 반환된 직후를 사건 종료 시각으로 기록했습니다. 공개 자료의 CLI 반환 시간은 CLI를 호출한 시각과 이 종료 시각의 차이입니다. 이 값을 “DB 페일오버가 0.5초에 끝났다”고 읽으면 안 됩니다. RDS 이벤트 간격도 DB의 모든 읽기·쓰기가 멈춘 시간과 같다고 볼 수 없습니다.[^event-time]

표의 네 값은 시작점과 종료 조건이 서로 다릅니다. 그래서 RDS 이벤트가 약 9초 간격으로 남았는데 Wrapper의 쓰기 공백이 약 2초였다고 해도 모순이 아닙니다. 반대로 RDS의 완료 이벤트가 남았다는 사실만으로는 애플리케이션이 복구됐는지 가리지 못합니다.

## 3. 같은 페일오버를 어떻게 관찰했을까요

구성마다 결과를 공정하게 비교하려면 모든 구성이 같은 사건을 겪어야 합니다. 그래서 비교 구성 19개를 각각 별도 JVM으로 동시에 실행하고 그 상태에서 페일오버를 10회 반복했습니다.[^experiment]

| 항목 | 환경 |
| --- | --- |
| DB | Aurora MySQL `8.0.mysql_aurora.3.13.0`, `db.r7g.large` writer 1대 + reader 1대(reader 삭제 시험은 reader 2대로 시작) |
| 실행 환경 | 서울 리전, 같은 VPC의 EC2 `t4g.large`, Amazon Linux 2023, Corretto 21 |
| 드라이버 | MySQL Connector/J 9.7.0, MariaDB Connector/J 2.7.15·3.5.10 |
| Wrapper·커넥션 풀 | AWS Advanced JDBC Wrapper 4.4.0, HikariCP 7.1.0 |
| 부하 | 구성마다 200ms 주기의 쓰기·읽기 루프. reader 전용 구성 1개는 읽기만 수행 |
| 반복·관찰 | 매번 JVM 재기동 후 60초 워밍업. 8회는 360초, 2회는 2,100초 관찰 |

이 글에서는 측정 JVM을 실행한 이 EC2를 **runner**라고 부릅니다.

쓰기 루프는 풀에서 연결을 빌린 뒤, 그 연결로 응답한 노드의 정보를 조회하고 `INSERT`를 실행했습니다. 읽기 루프는 다음 쿼리로 응답한 노드와 연결 상태를 남겼습니다.

```sql
-- 응답한 인스턴스, 물리 연결, Aurora의 읽기 전용 상태를 함께 기록합니다.
SELECT @@aurora_server_id,
       @@hostname,
       CONNECTION_ID(),
       @@innodb_read_only;
```

결과를 읽으려면 용어 두 개가 필요합니다.

- **쓰기 공백**: 성공한 쓰기와 다음 성공한 쓰기 사이의 간격 가운데 가장 긴 값입니다. 사건 직전의 마지막 성공부터 관찰 종료까지를 봅니다. 중간에 성공 한 건이 끼면 장애 구간이 나뉠 수 있습니다.[^s1]
- **미복구**: 관찰이 끝날 때까지 쓰기가 한 번도 다시 성공하지 않은 반복입니다.

이 두 값을 해석할 때의 주의점(정상 상태의 간격, 미복구 값의 의미, 부하의 한계)은 11절에 모았습니다.

## 4. 같은 DB에서 쓰기 복구는 얼마나 갈렸을까요

결론부터 말하면 같은 DB 사건인데도 쓰기가 다시 성공하는 시점이 구성마다 크게 달랐습니다. 아래 표는 기본값 구성과 튜닝 구성(DNS·타임아웃·커넥션 풀을 조정한 구성)을 비교한 결과입니다.

표의 수치는 복구된 반복의 **중앙값(최솟값~최댓값)**이고 단위는 초입니다. 미복구로 표시한 칸을 뺀 나머지 칸은 각각 10회 결과입니다. 미복구 칸에 함께 적은 2,100초 관찰 값은 2회의 최솟값~최댓값입니다.[^s1]

| 드라이버·접속 방식 | 기본값 구성 | 튜닝 구성 |
| --- | --- | --- |
| MySQL 9.7, 일반 cluster URL (`d01`·`t01`) | 360초 관찰 8회 미복구 · 2,100초 관찰 2회 1,763~1,803(약 30분) | 10.7 (5.6~10.8) |
| MariaDB 2.7, 일반 cluster URL (`d02`·`t03`) | 360초 관찰 8회 미복구 · 2,100초 관찰 2회 1,762~1,780(약 30분) | 10.5 (5.5~10.6) |
| MariaDB 3.5, 일반 cluster URL (`d04`·`t04`) | 360초 관찰 8회 미복구 · 2,100초 관찰 2회 1,791~1,802(약 30분) | 10.6 (5.6~10.7) |
| MariaDB 2.7, `aurora` 스킴 (`d03`·`t02`, `t02`는 `cluster-ro` 병용) | 16.1 (15.5~16.5) | 8.4 (3.3~14.1) |
| Wrapper + MySQL 9.7 (`d05`·`t05`) | 2.0 (1.7~2.9) | 1.8 (1.6~2.6) |
| Wrapper + MariaDB 3.5 (`d06`·`t06`) | 1.8 (1.7~2.8) | 1.6 (1.5~2.5) |

표 위쪽 세 줄의 기본값 구성은 360초 관찰에서 8회 모두 복구되지 않았습니다. 관찰을 2,100초로 늘린 나머지 두 반복에서는 모두 복구됐습니다. 세 구성의 장기 관찰 결과 6건은 **1,761.7~1,803.2초**, 약 29~30분이었습니다. 짧게 관찰한 24건의 미복구 결과는 이 범위나 중앙값에 넣지 않았습니다. 관찰 길이별 값과 나머지 7개 구성의 결과는 11절에 있습니다.

같은 세 드라이버의 튜닝 구성은 중앙값이 약 10초였습니다. Wrapper를 쓴 구성은 기본값에서도 약 2초였습니다.

여기서 말하는 튜닝에서는 `maxLifetime` 외에 다른 값도 함께 바꿨습니다. 튜닝 구성에 공통으로 적용한 값은 다음과 같습니다.

- JVM DNS TTL 5초
- 드라이버 `connectTimeout` 3초·`socketTimeout` 10초
- HikariCP `connectionTimeout` 5초·`validationTimeout` 2초·`maxLifetime` 50초·`keepaliveTime` 30초·최대 풀 크기 4

기본값 구성의 최대 풀 크기는 10이었습니다.

드라이버별 추가 설정은 공개 자료에 있습니다.[^settings]

여러 값을 한꺼번에 바꿨으므로 이 표만으로 어느 설정 하나가 차이를 만들었다고 단정할 수는 없습니다. 다만 **같은 DB 사건을 겪어도 클라이언트 구성에 따라 쓰기가 다시 성공하는 시점이 크게 달랐다**는 사실은 확인할 수 있습니다.

## 5. 새 writer가 생겼는데 왜 옛 writer에 연결될까요

페일오버 뒤의 여러 단계가 동시에 끝나지 않기 때문입니다. 그 틈에 새 연결이 옛 writer의 주소로 향할 수 있습니다.

cluster endpoint는 현재 writer를 가리키는 DNS 이름입니다. 페일오버로 writer가 바뀌면 이 이름이 가리키는 대상도 바뀝니다. AWS 문서도 커넥션 풀을 사용할 때는 캐시된 DNS 정보를 갱신하거나 그 TTL을 줄이도록 안내합니다.[^endpoint]

그런데 페일오버 뒤에는 네 가지 일이 따로 진행됩니다.

- 서버의 역할이 바뀝니다(옛 writer는 reader가 되고 reader 하나가 writer가 됩니다).
- cluster endpoint의 DNS가 갱신됩니다.
- JVM이 주소를 다시 조회합니다.
- JDBC 드라이버가 새 연결을 맺습니다.

새 연결을 시작할 때 받은 주소가 옛 writer의 주소라면 DNS가 나중에 갱신돼도 그 연결 시도는 옛 노드로 향할 수 있습니다. Wrapper의 초기 연결 플러그인(`initialConnection`)도 이 상황을 다룹니다.[^initial-connection]

첫 번째 페일오버의 기록에 이 흐름이 드러납니다. 아래 시간은 일반 MariaDB 2.7 튜닝 구성(`t03`)에서 첫 실패 연산이 시작된 시각을 기준으로 맞춘 값입니다.

| 경과 | 관찰 |
| --- | --- |
| +1.6초 | runner의 DNS 조회에서 새 writer가 처음 관찰됨 |
| +5.3초 | 일반 MariaDB 2.7 튜닝 구성의 첫 쓰기 응답: 새 writer에서 성공 |
| +10.4초 | 일반 MariaDB 2.7 기본값 구성(`d02`)의 첫 쓰기 응답: 옛 writer에서 read-only 오류 |

{% include diagram.html src="aurora-first-failover-timeline.svg" caption="첫 페일오버: 튜닝 구성은 +5.3초에 새 writer, 기본값 구성은 +10.4초에 옛 writer" %}

기본값 구성은 연결이 끊긴 직후 다시 연결을 시도했고 약 10초 뒤 reader가 된 옛 writer에 연결됐습니다. 첫 반복에서 이후의 쓰기는 계속 같은 물리 연결 `98` 하나에서 거부됐습니다. 물리 연결은 DB 서버와 맺은 실제 연결 하나이며 `CONNECTION_ID()` 값으로 구분합니다. 로그의 핵심 필드를 추리면 다음과 같습니다.[^dns-path]

```text
server_id = jdbc-test-1
conn_id   = 98
read_only = 1
sql_state = HY000
err_code  = 1836
err_msg   = (conn=98) Running in read-only mode
```

`server_id`는 응답한 인스턴스, `conn_id`는 물리 연결 번호입니다. `read_only = 1`과 오류 코드 `1836`은 이 노드가 읽기 전용이어서 쓰기를 거부했다는 기록입니다.

일반 드라이버 기본값 구성 세 개(`d01`·`d02`·`d04`)는 30회 모두, JVM DNS를 무기한 캐시한 구성(`v01`, 6절)은 10회 모두 옛 writer에 연결된 채 머물렀습니다. 그동안 읽기는 성공하고 쓰기는 거부됐습니다.

반면 DNS·타임아웃을 조정한 일반 드라이버 세 구성에서는 30회 모두 새 writer로 복구됐고 옛 writer에 닿은 쓰기는 없었습니다. 성공 시점은 runner에서 DNS 변경을 관찰한 뒤였습니다.

{% include diagram.html src="aurora-failover-recovery-paths.svg" caption="끊긴 연결이 새 writer에 닿는 세 경로 — 옛 writer에 남으면 쓰기만 계속 실패합니다" %}

재시도하는 동안 짧은 DNS TTL이 지나 새 주소를 얻었다고 해석할 수는 있습니다. 하지만 DNS TTL과 두 연결 타임아웃을 하나씩 떼어 본 대조 실험은 없습니다. **어느 값이 결정적이었는지는 이 결과만으로는 가릴 수 없습니다.** runner의 DNS 조회도 약 1초 간격의 표본이며 각 JVM이 실제로 사용한 DNS 캐시를 직접 읽은 기록은 아닙니다.

## 6. 커넥션 풀은 왜 읽기 전용으로 계속 연결할까요

커넥션 풀이 보기에는 read-only가 된 옛 writer와의 연결에 아무 문제가 없기 때문입니다. 실패한 것은 쓰기 쿼리이고 연결 자체에는 오류가 없습니다.

응답하는 옛 writer와의 연결은 커넥션 풀의 기본 연결 검증(연결이 살아 있는지 확인하는 검사)을 통과할 수 있습니다. HikariCP 7.1.0은 이 검증에 JDBC의 `Connection.isValid()`를 사용합니다. 이 검사를 통과했다고 해서 현재 노드가 writer라는 보장은 없습니다.[^hikari-validation]

HikariCP는 SQL 예외가 났다고 해서 매번 그 연결을 폐기하지는 않습니다. 기본 설정에서는 SQLState와 일부 오류 코드로 연결이 고장 났는지 판정합니다. SQLState가 `08`로 시작하는 연결 오류이거나 미리 정해 둔 SQLState·오류 코드 목록에 해당하면 그 연결을 폐기합니다. 이번에 반복된 `HY000`·오류 코드 `1836` 조합은 이 기본 폐기 조건에 해당하지 않습니다.[^hikari-eviction]

이번 기록에서는 다음 과정이 되풀이됐습니다.

1. 애플리케이션이 풀에서 연결을 빌립니다.
2. 연결된 옛 writer가 노드 조회에 응답합니다.
3. `INSERT`는 read-only 오류로 실패합니다.
4. 연결은 풀로 반환되고 다시 사용됩니다.

{% include diagram.html src="hikari-connection-reuse.svg" caption="read-only 오류가 나도 연결은 풀로 돌아가, 수명이 끝날 때까지 다시 쓰일 수 있습니다" %}

기본값 구성이 쓰기를 복구하기까지 걸린 약 30분은 HikariCP의 기본 `maxLifetime=1800000`(30분)과 비슷합니다. 연결 수명이 끝나 새 연결로 교체되면서 복구됐을 가능성이 있습니다. 다만 수명 만료로 연결을 닫았다는 로그는 이번 기록에 없으므로 이 설명은 **추정**입니다.

`maxLifetime`을 복구 시간의 상한으로 볼 근거는 없습니다. 이 값은 연결의 최대 수명을 정할 뿐이고 애플리케이션이 빌려 쓰고 있는 연결은 수명이 다 돼도 풀이 바로 끊지 않습니다.[^hikari-lifetime]

### DNS 캐시를 고정하면 연결이 새로 갱신되어도 쓰기에 연결되지 않습니다.

연결을 새로 만들어도 새 연결이 옛 주소로 향하면 소용이 없습니다. 이를 확인하려고 일반 MariaDB 2.7 튜닝 구성에서 **JVM DNS TTL만 `-1`, 즉 무기한 캐시로 바꾼 구성**(`v01`)도 실행했습니다. `maxLifetime`은 50초로 유지했습니다.

이 구성은 10회 모두 관찰 종료까지 쓰기가 복구되지 않았습니다. 장기 관찰 두 번에서 쓰기 공백은 각각 2,088.0초·2,088.2초 이상이었습니다. 그동안 응답한 물리 연결은 각각 164개·153개였지만 새로 만든 연결에서도 응답한 노드는 모두 같은 옛 writer였습니다.[^dns-infinite]

JVM이 DNS 조회 결과를 캐시하는 시간은 Java 보안 속성 `networkaddress.cache.ttl`로 정합니다. AWS의 JVM DNS 가이드는 이 값을 5초로 설정하는 방법을 안내합니다. 이 실험에서는 JVM이 처음 DNS를 조회하기 전에 `Security.setProperty()`로 이 속성을 설정했습니다. 설정하지 않았을 때의 기본 TTL 값은 이번 기록에 없습니다.[^dns-ttl]

### `maxLifetime`만으로 복구 시간을 계산할 수는 없었습니다

일반 MariaDB 2.7 튜닝 구성에서 다른 값은 그대로 두고 `maxLifetime`만 바꾼 결과입니다. 각 구성은 10회씩 측정했습니다.

| 설정값 | 풀의 런타임 값 | 쓰기 공백 중앙값 |
| --- | --- | --- |
| 35초 | 35초 | 10.5초 |
| 50초 | 50초 | 10.5초 |
| 70초 | 70초 | 10.5초 |
| 20초 | **1,800초로 변경** | 10.5초 |

수명 값을 바꿔도 결과는 거의 같았습니다. 이 구성들은 옛 writer에 연결되지 않고 연결 수명보다 짧은 시간 안에 새 writer로 복구됐습니다. “쓰기 공백은 항상 연결 수명에 몇 초를 더한 값”이라는 공식을 만들 근거는 없습니다. 옛 writer에 남은 구성과 새 writer를 찾은 구성은 복구 경로부터 달랐습니다.

20초 설정이 30분으로 바뀐 것은 HikariCP 7.1.0의 설정값 검사 규칙 때문입니다. 이 버전은 0이 아닌 `maxLifetime`이 30초보다 작으면 기본값으로 되돌립니다. 10회 모두 기동 로그에 아래 메시지가 남았고 풀의 런타임 값도 1,800초였습니다.[^hikari-config]

```text
maxLifetime is less than 30000ms, setting to default 1800000ms.
```

설정 파일에 적힌 값뿐 아니라 **실제로 생성된 풀의 값**을 확인해야 하는 이유입니다.

## 7. Wrapper는 새 writer를 어떻게 찾을까요

Wrapper의 `failover2` 플러그인은 cluster endpoint의 DNS 변경만 기다리지 않습니다. 별도 토폴로지 모니터링 구성 요소로 클러스터 구성을 확인해 새 writer를 찾고 그 writer로 연결을 다시 맺습니다.[^failover2]

이번 S1 실험에서 기반 드라이버만 다른 두 Wrapper 구성은 중앙값이 기본값에서 2.0초·1.8초, 튜닝에서 1.8초·1.6초로, 두 경우 모두 0.2초 차이였습니다.

MariaDB Connector/J 2.7의 `aurora` 스킴도 비교했습니다. 하지만 그 결과를 모든 MariaDB 드라이버에 적용할 수는 없습니다. 3.0.3 릴리스 노트에 Aurora 전용 지원을 제거했다고 적혀 있기 때문입니다. URL을 바꾸기 전에 실제 드라이버와 버전을 확인해야 합니다.[^mariadb]

Wrapper도 URL만 바꾼다고 기존 애플리케이션의 장애 처리가 모두 끝나지는 않습니다. 두 가지가 더 필요합니다.

- Wrapper 아래에서 실제로 DB와 통신할 기반 JDBC 드라이버가 필요합니다.
- 재연결 뒤 애플리케이션에 전달되는 예외를 처리해야 합니다.

이번 Wrapper 구성에서 주로 나온 예외는 `FailoverSuccessSQLException`이었습니다. 연결이 다른 노드로 전환됐음을 알리는 예외이며 방금 실행하던 업무의 성공 여부와는 별개입니다.[^failover-exceptions]

Wrapper를 HikariCP와 함께 쓰려고 튜닝 구성에는 AWS 예제의 다음 값을 적용했습니다.[^wrapper-hikari]

```properties
# HikariCP 속성: Wrapper의 페일오버 예외를 처리하는 구현체입니다.
exceptionOverrideClassName=software.amazon.jdbc.util.HikariCPSQLException
```

업무 재시도는 따로 설계해야 합니다. 트랜잭션 도중 연결이 끊기면 그 처리가 성공했는지 알 수 없는 경우가 생길 수 있습니다. 이때 연결이 복구됐다는 이유만으로 쓰기를 무조건 다시 실행할 수는 없습니다. 중복 실행을 막는 식별자와 처리 결과 확인이 필요합니다. 이 측정의 쓰기는 짧은 자동 커밋이며 업무 트랜잭션의 재시도는 측정 범위에 없습니다.

## 8. 에러가 0건인데도 쓰기가 멈출 수 있을까요

멈출 수 있습니다. 예외가 발생하지 않은 채 한 연산이 오래 걸리면 에러 건수에는 아무것도 나타나지 않습니다.

`t02`는 MariaDB 2.7의 `aurora` 스킴에 cluster endpoint와 `cluster-ro`를 함께 넣은 튜닝 구성입니다. 이 구성은 10회 중 8회에서 쓰기·읽기 에러가 모두 0건이었습니다.

그런데 이 8회에서 DB에 기록된 연속 행 사이의 최대 시각 간격은 **중앙값 8.4초, 범위 3.3~14.2초**였습니다. 200ms마다 쓰도록 만든 루프인데 모든 반복에서 1초가 넘는 공백이 생겼습니다.[^silent-stall]

| 에러가 없었던 8회에서 측정한 항목 | 결과 |
| --- | --- |
| 쓰기·읽기 예외 | 각 반복 0건 |
| DB의 연속 기록 시각 간격 | 최대 14.2초 |
| 클라이언트에서 성공한 연산 한 건의 소요 시간 | 최대 약 14.0초 |

예외 없이 연산 하나가 최대 약 14초 걸리는 동안, 다음 쓰기 시도도 진행되지 않았습니다. 예외가 나지 않았으므로 예외 카운터에는 이 대기 시간이 나타나지 않았습니다.

이 실험에서는 예외 건수와 함께 연산 지연, 성공 쓰기의 간격, DB에 저장된 행의 시각을 확인했습니다. DB 행의 시각은 클라이언트 완료 시각과 함께 봐야 기록 사이의 공백과 응답 지연을 구분할 수 있습니다.

반대로 Wrapper 구성에서는 페일오버 예외가 났어도 더 짧은 시간 안에 다음 쓰기가 성공했습니다. **에러 건수만 비교하면, 에러가 0건인 반복에서 쓰기가 최대 약 14초 멈춘 구성이 에러를 내고 더 빨리 복구한 구성보다 나아 보입니다.**

## 9. Blue/Green 전환 뒤에는 어느 클러스터에 썼을까요

Blue/Green 전환은 같은 클러스터 안에서 writer를 바꾸는 페일오버와 다릅니다. 서비스 대상이 아예 다른 클러스터로 옮겨 가고 전환 뒤에도 옛 blue 환경이 남습니다.[^blue-green] 옛 blue에 남은 애플리케이션이 어떻게 동작하는지가 중요합니다.

{% include diagram.html src="aurora-bluegreen-old-blue.svg" caption="전환 뒤 옛 blue에 남은 애플리케이션은 읽기를 계속하고, 쓰기는 권한에 따라 갈립니다" %}

이 실험에서는 비특권 사용자 `probe`와 마스터 사용자 `admin`으로 Blue/Green 전환을 한 번씩 관찰했습니다. 두 전환은 서로 다른 배포에서 진행했으므로 사용자 권한만 바꾼 대조 실험으로 보지는 않습니다.

### `probe` 실행: 옛 blue에서 읽기만 계속 성공했습니다

`probe` 실행에서는 기본값 구성 6개와 JVM DNS 무기한 캐시 구성(`v01`) 1개가 옛 blue에 남았습니다. 이 7개 구성은 600초 관찰 종료까지 쓰기가 복구되지 않았습니다. 읽기는 전환 완료 이후에도 구성마다 약 2,668건이 옛 blue에서 성공했습니다. 이 6개 기본값 구성에는 **Wrapper를 사용하되 `bg`(Blue/Green 전환을 처리하는 플러그인)를 추가하지 않은 구성**도 포함됩니다.[^s3]

같은 실행의 MariaDB `aurora` 튜닝 구성에서는 쓰기가 green으로 옮겨 간 뒤에도 옛 blue reader에서 10건의 읽기가 1.8초에 걸쳐 성공했습니다. 여기서 측정한 것은 옛 blue가 응답했다는 사실입니다. 읽기 쿼리는 노드 정보를 조회했으므로 업무 데이터가 실제로 얼마나 오래된 값이었는지는 측정하지 않았습니다.

### `admin` 실행: 옛 blue에 쓰기가 성공했습니다

`admin` 실행에서는 더 눈여겨봐야 할 결과가 나왔습니다. 옛 blue에 남은 7개 구성은 전환 완료 이후 **각각 2,672~2,673행을 옛 blue에 기록**했습니다. 같은 구간에 이 구성들이 green에 기록한 행은 없었습니다. 클라이언트에서는 쓰기가 다시 성공했지만 서비스가 옮겨 간 클러스터에 기록된 것은 아니었습니다.[^s3-admin]

당시 옛 blue의 관찰값은 `read_only=1`, `super_read_only=0`, `innodb_read_only=0`이었고 `admin`에는 `CONNECTION_ADMIN` 권한이 있었습니다. MySQL 문서상 이 권한을 가진 사용자는 `read_only`의 쓰기 제한을 받지 않습니다. 이 조건은 옛 blue에서 실제로 쓰기가 성공한 결과와 맞아떨어집니다.[^read-only]

따라서 복구를 확인할 때는 **응답한 노드·클러스터가 어디인지, 실제로 어디에 기록됐는지**를 봐야 합니다. 읽기 성공, 쓰기 성공, `@@innodb_read_only=0`만으로는 애플리케이션이 새 운영 환경으로 옮겨 갔는지까지 알 수 없습니다.

Blue/Green의 메타데이터 권한도 양쪽에서 확인해야 합니다. Wrapper 문서는 비특권 사용자에게 필요한 권한을 blue와 green 모두에 준비하도록 안내합니다. Wrapper 튜닝 구성(`t05`·`t06`)의 쓰기 공백은 `probe` 실행 35.7초, `admin` 실행 4.1초였습니다(11절 표). 이번 기록에는 배포 생성 후 blue에 `mysql.rds_topology` 조회 권한을 부여한 사실이 남아 있습니다. 하지만 green의 권한을 직접 검증한 기록은 없습니다. 사용자별 Wrapper 전환 시간 차이를 권한 하나 때문이라고 볼 근거는 없습니다.[^bg-permissions]

### reader 삭제는 페일오버와 다르게 진행됐습니다

reader 삭제(S2)도 따로 두 번 시험했습니다. 이때는 `cluster-ro`를 함께 넣지 않은 MariaDB `aurora` 구성(`v05`)도 읽기 에러가 0건이었습니다.

삭제 요청을 받은 reader는 요청 뒤 약 400초까지 응답했습니다(마지막 성공 읽기 기준). 구성마다 남은 reader로 읽기를 옮긴 시점은 달랐습니다. `t02`·`v07`은 요청 뒤 25~72초에, `v05`·`v06`은 약 390~400초에 남은 reader로 읽기를 옮겼습니다. 한 장애 시나리오의 결과만으로는 모든 토폴로지 변경을 예측하지 못합니다.[^s2]

## 10. 운영에서는 복구가 멈춘 지점을 어떻게 찾을까요

복구가 멈춘 지점을 찾으려면 DB 이벤트, 주소 조회, 연결 재사용, 실제 쓰기를 단계별로 따로 봐야 합니다. 이번 측정 결과를 기준으로 먼저 살펴볼 항목은 다음과 같습니다.

| 확인할 것 | 확인하는 이유 |
| --- | --- |
| 실제 드라이버 버전·클래스·URL·플러그인 | Aurora 토폴로지를 인식하는 연결인지, 해당 버전이 그 스킴을 지원하는지 확인 |
| JVM DNS 설정과 재접속 대상 | 연결을 새로 만들어도 옛 노드로 돌아가는지 확인 |
| 풀의 런타임 설정 | 설정 파일 값이 그대로 적용됐는지 확인 |
| 오류 코드·응답 노드·연결 ID | 연결 고장인지, 응답 가능한 읽기 전용 노드에 남았는지 구분 |
| 쓰기 공백·연산 지연·실제 기록 위치 | 예외 없는 대기와 옛 클러스터로의 쓰기까지 확인 |
| 실제 서비스와 같은 권한·부하·트랜잭션 | 가벼운 측정 루프에서 보이지 않은 운영 동작을 검증 |

타임아웃 설정은 이름이 비슷해도 기다리는 대상이 다릅니다.[^timeouts]

| 설정 | 무엇을 기다리나 | 튜닝 구성의 값 |
| --- | --- | --- |
| JDBC `connectTimeout` | DB와 새 연결을 맺는 시간 | 3초 |
| JDBC `socketTimeout` | 네트워크 소켓 작업의 응답 대기 | 10초 |
| HikariCP `connectionTimeout` | 풀에서 연결을 빌리려고 기다리는 시간 | 5초 |

이번 일반 드라이버 구성에서 최초 실패 연산은 0.3초 이내에 연결이 끊겼음을 알리는 오류(connection reset·EOF·socket 오류)로 끝났습니다. 이 0.3초는 실패한 연산의 소요 시간일 뿐 DB 장애 발생부터 감지까지를 따로 잰 값과는 다릅니다. 관찰한 10초대 복구를 `socketTimeout=10000`이 발동한 결과라고 해석할 근거는 없습니다.

실험에 쓴 3초·5초·10초를 그대로 운영의 정답으로 삼지 않습니다. 각 서비스의 정상 쿼리 시간과 요청 제한 시간에 맞춰 값을 정하고 그 값으로 다시 측정해야 합니다.

## 11. 측정 자료는 어떻게 읽을까요

본문의 수치는 아래 공개 자료의 반복별 요약에서 나왔습니다. 구성 이름의 접두어는 1절에서 설명한 대로 `d`가 기본값, `t`가 튜닝, `v`가 비교용 변형 구성입니다. 측정 행을 넣은 테이블과 데이터베이스의 이름도 `probe`지만 사용자 `probe`와는 별개입니다.

| 파일 | 내용 | 행 수 |
| --- | --- | --- |
| [s1-failover-iterations.csv](/assets/data/aurora-failover/s1-failover-iterations.csv) | S1 페일오버 10회 × 19구성, 반복별 지표 | 190 |
| [s2-reader-delete-iterations.csv](/assets/data/aurora-failover/s2-reader-delete-iterations.csv) | S2 reader 삭제 2회 × 19구성 | 38 |
| [s3-bluegreen-probe-iterations.csv](/assets/data/aurora-failover/s3-bluegreen-probe-iterations.csv) | S3 Blue/Green, 비특권 사용자 `probe` | 19 |
| [s3-bluegreen-admin-iterations.csv](/assets/data/aurora-failover/s3-bluegreen-admin-iterations.csv) | S3 Blue/Green, 마스터 사용자 `admin` | 19 |
| [s3-bluegreen-rows-after-switchover.csv](/assets/data/aurora-failover/s3-bluegreen-rows-after-switchover.csv) | S3 Blue/Green, 전환 완료 뒤 클러스터별 측정 테이블(`probe`) 기록 행 수(`run`·`arm`·`old_blue_rows`·`green_rows`) | 38 |
| [events.csv](/assets/data/aurora-failover/events.csv) | 반복별 사건: 관찰 창, CLI 반환 시간, writer 변경, 지운 reader, RDS 페일오버 이벤트 간격, cluster endpoint DNS 변경 시각 | 14 |
| [arms.csv](/assets/data/aurora-failover/arms.csv) | 19개 구성의 드라이버·JDBC URL·설정 전체 | 19 |

`s3-bluegreen-rows-after-switchover.csv`의 행 수는 DB에서 집계했습니다. probe 실행은 옛 blue 행이 모두 0이고 green 행 수는 집계하지 않아 비어 있습니다.

S1·S2·S3의 반복별 지표 파일(`*-iterations.csv`)은 같은 열을 씁니다. 주요 열의 뜻은 다음과 같습니다.

| 열 | 뜻 |
| --- | --- |
| `write_s` | 연속한 두 성공 쓰기 사이의 최대 간격(초) |
| `write_recovered` | 관찰 창 안에서 쓰기가 다시 성공했는지. `False`이면 `write_s`는 하한 |
| `read_s`·`read_recovered` | 읽기에 대한 같은 두 값 |
| `server_gap_s` | DB에 기록된 연속 행의 최대 시각 간격(초) |
| `err_write`·`err_read` | 관찰 창의 쓰기 실패 수, 읽기 실패 수 |
| `err_ro` | 관찰 창의 실패 연산(읽기·쓰기) 가운데 오류 코드 1836·1290 또는 read-only 메시지로 판정한 수 |
| `ro_write_fail` | 실패한 쓰기 가운데 응답 노드가 `innodb_read_only=1`로 기록된 수(노드 상태 기준) |
| `new_write_conns` | 사건 뒤 쓰기에 새로 쓰인 물리 연결 수 |
| `old_host_reads`·`old_host_span_s` | S3에서 스위치오버 완료 뒤 옛 blue가 응답한 읽기 수와 그 기간(초) |
| `stall_max_ms` | 에러 없이 가장 오래 걸린 연산의 소요 시간(ms) |
| `window_s` | 관찰 창의 길이(초) |

연산마다 한 줄씩 남긴 원시 연산 로그(약 570MB)는 공개하지 않고 반복별 요약만 공개합니다.

### 수치를 읽을 때 주의할 점

**쓰기 공백은 순수한 DB 정지 시간이 아닙니다.** 쓰기 공백은 연속한 두 성공 쓰기의 완료 시각 사이에서 가장 긴 간격입니다. 계산 범위는 사건 직전 마지막 성공부터 관찰 종료까지입니다. 정상 상태에도 약 0.2초의 간격이 있습니다. DB에 저장된 `ts`의 연속 행 간격도 함께 기록했습니다. `ts`는 측정 테이블에 행을 넣을 때 `NOW(6)`으로 남긴 시각이라 커밋 완료 시각과는 다릅니다.

**미복구 값은 하한입니다.** 관찰 종료까지 쓰기가 돌아오지 않은 반복은 미복구로 표시했습니다. 예를 들어 “360초 관찰에서 미복구”는 쓰기 공백이 정확히 360초였다는 뜻이 아닙니다. 실제 실패는 페일오버 요청보다 늦게 시작됐고 관찰을 끝낸 뒤 언제 복구됐는지도 알 수 없기 때문입니다.

**부하는 가볍습니다.** 측정 루프는 한 연산이 오래 걸리면 다음 실행을 늦추고 밀린 실행은 건너뜁니다. 운영 서비스처럼 요청이 계속 쌓일 때의 대기열이나 사용자 응답 시간까지 측정한 실험은 아닙니다.

### 구성별 결과

S1 페일오버의 쓰기 공백(초)을 관찰 길이별로 나눈 표입니다. 값은 중앙값(최솟값~최댓값)입니다. “미복구 8회 ≥337.8”은 8회 모두 관찰 종료까지 복구되지 않았고 그중 가장 짧은 공백 하한이 337.8초라는 뜻입니다.

| 구성 | 360초 관찰(1~8회) | 2,100초 관찰(9~10회) |
| --- | --- | --- |
| `d01` MySQL 9.7 기본값 | 미복구 8회 ≥337.8 | 1,782.9 (1,762.6~1,803.2) |
| `d02` MariaDB 2.7 기본값 | 미복구 8회 ≥337.9 | 1,770.9 (1,761.7~1,780.0) |
| `d03` MariaDB 2.7 `aurora` 기본값 | 16.1 (15.5~16.5) | 16.1 (15.8~16.5) |
| `d04` MariaDB 3.5 기본값 | 미복구 8회 ≥338.0 | 1,796.4 (1,790.7~1,802.1) |
| `d05` Wrapper+MySQL 기본값 | 2.0 (1.7~2.3) | 2.4 (1.9~2.9) |
| `d06` Wrapper+MariaDB 기본값 | 1.8 (1.7~1.9) | 2.3 (1.9~2.8) |
| `t01` MySQL 9.7 튜닝 | 10.7 (5.6~10.8) | 10.8 (10.8~10.8) |
| `t02` MariaDB 2.7 `aurora`+`cluster-ro` 튜닝 | 8.4 (3.3~10.7) | 11.2 (8.2~14.1) |
| `t03` MariaDB 2.7 튜닝 | 10.5 (5.5~10.6) | 10.6 (10.5~10.6) |
| `t04` MariaDB 3.5 튜닝 | 10.6 (5.6~10.7) | 10.7 (10.6~10.7) |
| `t05` Wrapper+MySQL 튜닝 | 1.7 (1.6~2.0) | 2.3 (2.0~2.6) |
| `t06` Wrapper+MariaDB 튜닝 | 1.6 (1.5~1.8) | 2.1 (1.7~2.5) |
| `v01` t03 + DNS TTL -1 | 미복구 8회 ≥338.0 | 미복구 2회 ≥2,088.0 |
| `v02` t03 + maxLifetime 35초 | 10.5 (5.5~10.6) | 10.6 (10.5~10.7) |
| `v03` t03 + maxLifetime 70초 | 10.5 (5.5~10.6) | 10.5 (10.5~10.5) |
| `v04` t03 + maxLifetime 20초 | 10.4 (5.5~10.6) | 10.5 (10.5~10.5) |
| `v05` t02에서 `cluster-ro` 제외 | 8.4 (3.1~13.4) | 11.1 (8.2~13.9) |
| `v06` t05 + 읽기 분리 플러그인 | 1.6 (1.5~3.3) | 2.2 (1.8~2.6) |
| `v07` MySQL `cluster-ro` 읽기 전용 (읽기) | 5.5 (5.4~5.5) | 5.5 (5.5~5.5) |

S2 reader 삭제 2회의 읽기 공백(초)과 회차별 읽기 에러 수입니다. 표에 실은 구성은 두 종류입니다. reader로 읽기를 보낸 구성(`t02`·`v05`·`v06`의 읽기 전용 풀, `v07`의 `cluster-ro`)과, 비교를 위해 cluster endpoint로 읽은 `d03`·`t05`입니다. 나머지 구성도 읽기 공백 0.2초, 읽기 에러 0건이었습니다.

| 구성 | 읽기 공백 | 읽기 에러(회차별) |
| --- | --- | --- |
| `t02` MariaDB 2.7 `aurora`+`cluster-ro` 튜닝 | 0.2 (0.2~0.2) | 0·0 |
| `v05` t02에서 `cluster-ro` 제외 | 0.2 (0.2~0.2) | 0·0 |
| `v06` t05 + 읽기 분리 플러그인 | 0.4 (0.4~0.4) | 1·1 |
| `v07` MySQL `cluster-ro` 읽기 전용 | 0.2 (0.2~0.2) | 0·0 |
| `d03` MariaDB 2.7 `aurora` 기본값 | 0.2 (0.2~0.2) | 0·0 |
| `t05` Wrapper+MySQL 튜닝 | 0.2 (0.2~0.2) | 0·0 |

S3 Blue/Green 사용자별 1회의 쓰기 공백(초)과, `probe` 실행에서 스위치오버 완료부터 관찰 종료까지 옛 blue가 응답한 읽기 수입니다. `admin`의 `d01~d06`·`v01` 값은 옛 blue에 쓰기가 다시 성공할 때까지의 공백이며 green으로 복구된 시간과는 별개입니다.

| 구성 | probe 쓰기 공백 | admin 쓰기 공백 | 옛 blue 읽기(probe) |
| --- | --- | --- | --- |
| `d01` MySQL 9.7 기본값 | 미복구 ≥582.5 | 22.0 (옛 blue에 기록) | 2,668건 |
| `d02` MariaDB 2.7 기본값 | 미복구 ≥582.5 | 21.8 (옛 blue에 기록) | 2,668건 |
| `d03` MariaDB 2.7 `aurora` 기본값 | 미복구 ≥582.6 | 21.9 (옛 blue에 기록) | 2,668건 |
| `d04` MariaDB 3.5 기본값 | 미복구 ≥582.7 | 22.0 (옛 blue에 기록) | 2,668건 |
| `d05` Wrapper+MySQL 기본값 | 미복구 ≥582.7 | 22.2 (옛 blue에 기록) | 2,669건 |
| `d06` Wrapper+MariaDB 기본값 | 미복구 ≥582.5 | 20.7 (옛 blue에 기록) | 2,669건 |
| `t01` MySQL 9.7 튜닝 | 14.5 | 14.4 | 0건 |
| `t02` MariaDB 2.7 `aurora`+`cluster-ro` 튜닝 | 14.5 | 21.0 (옛 blue에 61행 기록 뒤 green) | 10건 |
| `t03` MariaDB 2.7 튜닝 | 17.6 | 14.5 | 0건 |
| `t04` MariaDB 3.5 튜닝 | 14.5 | 14.4 | 0건 |
| `t05` Wrapper+MySQL 튜닝 | 35.7 | 4.1 | 0건 |
| `t06` Wrapper+MariaDB 튜닝 | 35.7 | 4.1 | 0건 |
| `v01` t03 + DNS TTL -1 | 미복구 ≥582.6 | 20.9 (옛 blue에 기록) | 2,669건 |
| `v02` t03 + maxLifetime 35초 | 14.4 | 14.5 | 0건 |
| `v03` t03 + maxLifetime 70초 | 14.4 | 14.2 | 0건 |
| `v04` t03 + maxLifetime 20초 | 14.4 | 14.4 | 0건 |
| `v05` t02에서 `cluster-ro` 제외 | 35.1 | 35.7 | 0건 |
| `v06` t05 + 읽기 분리 플러그인 | 35.7 | 4.1 | 0건 |
| `v07` MySQL `cluster-ro` 읽기 전용 (읽기) | 12.5 | 12.4 | 0건 |

### 측정 코드는 어떻게 동작했을까요

측정 코드는 구성마다 JVM 하나를 띄우고 그 안에 HikariCP 풀을 만들어 200ms 주기의 쓰기·읽기 루프를 돌립니다. 연결을 쓸 수 있는지는 드라이버로 보낸 실제 쿼리가 성공했는지로 확인합니다. 쓰기는 응답 노드를 조회한 뒤 `INSERT`를 실행하고 읽기는 3절의 노드 조회 쿼리를 실행합니다. 페일오버·reader 삭제·Blue/Green 전환 같은 사건은 AWS CLI로 일으킵니다.

## 정리

같은 Aurora MySQL 페일오버에서 쓰기 복구는 약 2초에서 약 30분까지 갈렸습니다. Wrapper 구성은 약 2초, DNS·타임아웃을 조정한 일반 드라이버는 약 10초, 기본값 일반 드라이버는 옛 writer에 남아 약 30분이 걸렸습니다.

오래 걸린 구성에서 애플리케이션이 DB를 못 찾은 것은 아니었습니다. 애플리케이션은 reader로 강등된 옛 writer에 정상적으로 연결돼 읽기는 성공하고 쓰기만 거부당하는 상태에 머물렀습니다. 커넥션 풀의 기본 연결 검증과 예외 판정은 그 연결을 고장으로 보지 않았습니다. JVM DNS를 무기한 캐시로 바꾼 구성(`v01`, 10회 시험)에서는 연결을 새로 만들어도 옛 주소로 돌아갔습니다.

복구를 판정할 때는 명령 반환 시간이나 RDS 이벤트, 에러 건수만 보지 않습니다. 애플리케이션의 복구 완료 조건에는 **새 writer에서 의도한 쓰기가 성공했는지, 기대한 데이터가 새 운영 환경에 기록됐는지**를 포함해야 합니다. DB 이벤트부터 주소 조회, 연결 재사용, 실제 쓰기까지 이어서 보면 같은 페일오버가 어떤 애플리케이션에는 2초이고 다른 애플리케이션에는 30분이 된 이유를 찾을 수 있습니다. 운영 중인 서비스에서는 다음을 먼저 확인합니다(전체 항목은 10절 표).

- 실제 드라이버·URL·플러그인(Wrapper 여부)
- JVM DNS TTL
- 풀의 런타임 값(HikariCP 7.1.0에서 0이 아닌 `maxLifetime`이 30초 미만이면 30분으로 바뀜, 6절)
- 쓰기 공백과 실제 기록 위치

## 참고 자료

[^experiment]: [반복별 사건 기록(CSV)](/assets/data/aurora-failover/events.csv). S1 페일오버 10회, S2 reader 삭제 2회, S3 Blue/Green 사용자별 1회의 관찰 창·CLI 반환 시간·writer 변경. 구성별 지표 파일은 11절에 정리했습니다.
[^event-time]: [반복별 사건 기록(CSV)](/assets/data/aurora-failover/events.csv). CLI 반환 시간은 `event_api_s`, RDS 이벤트 간격은 `Started cross AZ failover`와 `Completed customer initiated failover`의 `Date` 차이인 `rds_failover_events_s`입니다. RDS 이벤트 간격의 중앙값은 9.203초입니다. 명령 반환 시각을 사건 종료로 보는 것은 S1의 기록 방식이며, S3는 별도 완료 상태를 기다립니다.
[^s1]: [S1 페일오버 반복별 지표(CSV)](/assets/data/aurora-failover/s1-failover-iterations.csv). 표의 기본값 행은 `d01~d06`, 튜닝 행은 `t01~t06`이고, 쓰기 공백은 `write_s` 열입니다. 도중에 성공 한 건이 끼면 장애 구간이 나뉠 수 있어, 실패 구간과 이후 지속적인 성공도 함께 확인해야 합니다.
[^settings]: [19개 구성의 드라이버·JDBC URL·설정(CSV)](/assets/data/aurora-failover/arms.csv). MariaDB 2.7 일반 스킴은 `usePipelineAuth=false`, `useBatchMultiSend=false`, 3.5 튜닝 구성은 `disablePipeline=true`입니다. Wrapper 튜닝은 `initialConnection,auroraConnectionTracker,failover2,efm2,bg`, `failureDetectionTime=6000`, `failureDetectionInterval=1000`, `failureDetectionCount=2`, `clusterTopologyRefreshRateMs=5000`, `clusterId=jdbc-test`와 HikariCP 예외 처리 설정을 사용했습니다. 이 값 전체가 AWS의 일괄 권장 설정이라는 뜻은 아닙니다.
[^endpoint]: AWS, [Cluster endpoints for Amazon Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Endpoints.Cluster.html). writer 변경 시 endpoint가 가리키는 IP 변경과 DNS 캐시 관리 안내.
[^ha]: AWS, [High availability for Amazon Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html). Aurora MySQL 페일오버 때 writer와 새 writer가 될 reader만 재시작되고, 다른 reader는 reader endpoint로 들어온 쿼리를 계속 처리한다는 설명.
[^endpoints-overview]: [Amazon Aurora endpoint connections](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.Endpoints.html). reader endpoint로 연결하면 Aurora가 Aurora Replica들 사이에 연결을 분산(connection-balancing)합니다.
[^initial-connection]: AWS Advanced JDBC Wrapper 4.4.0, [Aurora Initial Connection Strategy Plugin](https://github.com/aws/aws-advanced-jdbc-wrapper/blob/4.4.0/docs/using-the-jdbc-driver/using-plugins/UsingTheAuroraInitialConnectionStrategyPlugin.md). DNS 갱신 중 옛 노드에 연결되는 상황과 초기 연결 처리.
[^dns-path]: [반복별 사건 기록(CSV)](/assets/data/aurora-failover/events.csv). 반복별 cluster endpoint DNS 변경 시각은 `cluster_dns_change_s` 열에 있고, 본문의 경과 시간과 연결 `98`의 필드는 공개하지 않은 연산 로그에서 추렸습니다. DNS 변경과 연결 끊김의 상대 비교는 runner 시계 기준입니다. CLI 호출 시각은 로컬 Mac, 연산·DNS 조회 시각은 runner에서 기록했으므로 호출 기준 비교에는 두 시계의 오차가 들어갈 수 있습니다. 두 시계의 차이는 이번 기록에 없습니다.
[^hikari-validation]: HikariCP 7.1.0, [`PoolBase.java`](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-7.1.0/src/main/java/com/zaxxer/hikari/pool/PoolBase.java), `isConnectionDead()`의 JDBC4 검증.
[^hikari-eviction]: HikariCP 7.1.0, [`ProxyConnection.java`](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-7.1.0/src/main/java/com/zaxxer/hikari/pool/ProxyConnection.java), `checkException()` 및 `ERROR_STATES`·`ERROR_CODES`.
[^hikari-lifetime]: HikariCP 7.1.0, [README의 `maxLifetime`·`connectionTimeout`](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-7.1.0/README.md). 사용 중인 연결의 수명 만료 처리와 풀 대기 시간의 의미.
[^dns-infinite]: [S1 페일오버 반복별 지표(CSV)](/assets/data/aurora-failover/s1-failover-iterations.csv). `v01`의 10회 결과이며, 장기 관찰은 9·10회차입니다. 164개·153개는 사건 이후 응답 노드가 기록된 물리 연결 ID 수입니다.
[^dns-ttl]: AWS, [Set the JVM TTL for DNS name lookups](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/jvm-ttl-dns.html); Oracle Java 21, [`InetAddress`의 주소 캐시 설명](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/InetAddress.html). 5초는 JVM 캐시 설정이며 DNS 반영부터 쓰기 성공까지의 복구 시간 보장이 아닙니다.
[^hikari-config]: HikariCP 7.1.0, [`HikariConfig.java`](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-7.1.0/src/main/java/com/zaxxer/hikari/HikariConfig.java), `validateNumerics()`와 기본 `MAX_LIFETIME`. 실측은 S1 `v04` 구성의 기동 로그와 풀 런타임 값입니다.
[^failover2]: AWS Advanced JDBC Wrapper 4.4.0, [Failover Plugin v2](https://github.com/aws/aws-advanced-jdbc-wrapper/blob/4.4.0/docs/using-the-jdbc-driver/using-plugins/UsingTheFailover2Plugin.md), 토폴로지 모니터링과 writer 확인.
[^mariadb]: MariaDB, [Connector/J 3.0.3 Release Notes](https://mariadb.com/docs/release-notes/connectors/java/3.0/3.0.3), Aurora 지원 제거. 비교한 2.7.15의 `aurora` 스킴은 `jdbc:mysql:aurora://`이며 MySQL Connector/J의 기능을 뜻하지 않습니다.
[^failover-exceptions]: AWS Advanced JDBC Wrapper 4.4.0, [Failover Plugin의 예외와 복구 처리](https://github.com/aws/aws-advanced-jdbc-wrapper/blob/4.4.0/docs/using-the-jdbc-driver/using-plugins/UsingTheFailoverPlugin.md). `08S02`·`FailoverSuccessSQLException`과 트랜잭션 결과가 불명확한 `08007`의 처리 구분.
[^wrapper-hikari]: AWS Advanced JDBC Wrapper 4.4.0, [`HikariFailoverExample.java`](https://github.com/aws/aws-advanced-jdbc-wrapper/blob/4.4.0/examples/HikariExample/src/main/java/software/amazon/HikariFailoverExample.java). HikariCP와 Wrapper를 함께 쓸 때 `exceptionOverrideClassName`을 설정하는 공식 예제.
[^silent-stall]: [S1 페일오버 반복별 지표(CSV)](/assets/data/aurora-failover/s1-failover-iterations.csv). `t02`에서 에러가 0건인 반복은 1·2·4·5·6·7·8·10회차이며, DB 연속 행 간격은 `server_gap_s`, 에러 없이 가장 오래 걸린 연산은 `stall_max_ms` 열입니다. `ts`는 `NOW(6)`으로 기록한 시각이고, 클라이언트 완료 시각은 연산 시작 시각과 단조 시계로 잰 소요 시간으로 구성됩니다.
[^blue-green]: AWS, [Switching a blue/green deployment](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/blue-green-deployments-switching.html). 스위치오버 절차와 전환 후 이전 운영 환경의 상태.
[^s3]: [S3 Blue/Green 비특권 사용자 반복별 지표(CSV)](/assets/data/aurora-failover/s3-bluegreen-probe-iterations.csv). 옛 blue에 남은 7개 구성은 `d01~d06`, `v01`이고, green 쓰기와 옛 blue 읽기가 함께 관찰된 구성은 `t02`입니다. 옛 blue의 읽기 수(`old_host_reads`)는 스위치오버 완료부터 관찰 종료까지 집계했습니다.
[^s3-admin]: [S3 Blue/Green 마스터 사용자 반복별 지표(CSV)](/assets/data/aurora-failover/s3-bluegreen-admin-iterations.csv), [스위치오버 완료 뒤 클러스터별 기록 행 수(CSV)](/assets/data/aurora-failover/s3-bluegreen-rows-after-switchover.csv). 옛 blue에 남은 7개 구성은 `probe` 실행과 같은 `d01~d06`, `v01`이며, 옛 blue의 행 수는 두 번째 파일에서 스위치오버 완료부터 관찰 종료까지 집계했습니다.
[^read-only]: MySQL 8.0 Reference Manual, [`read_only`·`super_read_only`](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_read_only). `CONNECTION_ADMIN`의 예외와 `super_read_only`의 추가 제한. S1에서 관찰한 Aurora의 `innodb_read_only=1`·오류 1836은 S3 옛 blue의 변수 조합(`innodb_read_only=0`)과 다릅니다.
[^bg-permissions]: AWS Advanced JDBC Wrapper 4.4.0, [Blue/Green Plugin — Connecting with non-admin users](https://github.com/aws/aws-advanced-jdbc-wrapper/blob/4.4.0/docs/using-the-jdbc-driver/using-plugins/UsingTheBlueGreenPlugin.md#connecting-with-non-admin-users). 배포 생성 전에 권한을 준비하거나, 생성 후라면 green에도 별도로 부여하도록 안내합니다.
[^s2]: [S2 reader 삭제 반복별 지표(CSV)](/assets/data/aurora-failover/s2-reader-delete-iterations.csv). `cluster-ro`가 없는 비교 구성은 `v05`, 있는 구성은 `t02`이며 둘 다 읽기 에러가 0건이었습니다. 삭제 후에도 인스턴스가 응답한 기간과 각 구성의 이탈 시점은 다릅니다.
[^timeouts]: MySQL Connector/J, [Networking properties](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-networking.html); HikariCP 7.1.0 [README](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-7.1.0/README.md). S1의 일반 드라이버 6개 구성(`d01`·`d02`·`d04`·`t01`·`t03`·`t04`) × 10회에서 최초 실패 연산의 소요 시간 최댓값은 292ms였습니다.
