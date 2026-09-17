---
date: 2021-03-02 10:18:01 +0900
title: "MongoDB에서 n-gram Full text Search 이용하기"
category: mongodb
excerpt: "Percona MongoDB MongoDB를 헤비하게 사용하던 K사에 다니셨던 지인분이 MongoDB 커뮤니티를 사용할 것이라면 Percona MongoDB를 사용해보는건 어떻겠냐고 추천을 해주셨습니다. K사에서도 Percona 버전을 사용했다고 하시더군요. Percona Mong…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — Percona Server for MongoDB 8.0 에도 ngram 전문 검색이 유지되어 접근법 자체는 유효합니다. 다만 기능 비교표와 링크는 4.4 시절 기준이며, 현재는 Atlas 및 자체 관리형 배포에서 MongoDB Search/Vector Search 를 쓰는 선택지도 있습니다.

## Percona MongoDB

MongoDB를 헤비하게 사용하던 K사에 다니셨던 지인분이 MongoDB 커뮤니티를 사용할 것이라면 Percona MongoDB를 사용해보는 건 어떠냐고 권장하셨습니다. K사에서도 Percona 버전을 사용했다고 하시더군요. Percona MongoDB를 추천받게 된 계기는 이렇습니다.

MongoDB의 전문 검색(Full Text Search, FTS) 기능 중 한글 검색에 대한 이슈 때문이었습니다. 기본적으로 형태소 분석 방식을 사용하는 MongoDB의 한글 검색 지원기능은 그리 만족스러운 수준은 아닙니다.

그런 얘기가 오가던 중, K사에서도 3.2버전에서 n-gram을 커스터마이징 해서 사용하다, 3.4 버전에서 Percona MongoDB에서 n-gram FTS가 정식으로 내재화 되었다고 하였습니다.

### n-gram 이란?

n-gram 알고리즘은 통계와 확률을 바탕으로 한 색인 분석 등에 널리 쓰이는 방식으로 초기 검색사이트가 취한 색인 검색 알고리즘의 하나입니다. 개념이 무척 직관적이고 빠르기 때문에 여러 학문에 적용하기 쉽습니다. 예를 들어 검색시스템에서 키워드 추출이라든지, 악성코드의 API 추출이라든지 다방면에서 사용되고 있죠.

n-gram 알고리즘은 n개의 문자열 크기만큼의 창(window)을 만들어 문자열을 왼쪽에서 오른쪽으로 한 단위씩 움직이며 추출되는 시컨스의 집합의 출현 빈도수를 기록합니다. 이때 n은 얼마만큼의 단위로 잘라낼지를 나타내는 지표인데, 이 값이 1이면 unigram, 2이면 bigram, 3이면 trigram이라 부르며, 그 값은 더 커질 수 있습니다.

딥러닝에서도 자연어처리를 위해 많이 사용합니다. RDBMS로 구성된 환경에서도 n-gram을 사용하여 검색엔진을 사용하면, 오타나 비슷한 단어로 검색을 한다거나 하는 것이 가능해집니다.

### Percona MongoDB vs MongoDB Community Ver.

우선 Percona server for MongoDB 역시 Community 버전처럼 Percona에서 무료로 지원합니다. 커뮤니티버전에 비해 장점이 많은 대신 문제가 발생 했을 때, Percona의 지원을 받아야 할 수도 있습니다.

다음은 Percona MongoDB와 Community 버전의 차이점 입니다.

|  |  |  |
| --- | --- | --- |
|  | **PSMDB** | **MongoDB** |
| Storage Engines | [WiredTiger](https://docs.mongodb.org/manual/core/wiredtiger/) (default)  [Percona Memory Engine](https://www.percona.com/doc/percona-server-for-mongodb/LATEST/inmemory.html#inmemory) | [WiredTiger](https://docs.mongodb.org/manual/core/wiredtiger/) (default)  [In-Memory](https://docs.mongodb.com/v4.4/core/inmemory/) (Enterprise only) |
| Encryption-at-Rest | Key server = Hashicorp Vault  Fully opensource | Key server = KMIP  Enterprise only |
| [Hot Backup](https://www.percona.com/doc/percona-server-for-mongodb/LATEST/hot-backup.html#hot-backup) | YES (replicaset) | NO |
| LDAP Authentication | Simple LDAP Auth  (legacy) [External SASL Authentication](https://www.percona.com/doc/percona-server-for-mongodb/LATEST/authentication.html#ext-auth) | Enterprise only  Enterprise only |
| LDAP Authorization | YES | Enterprise only |
| Kerberos Authentication | YES | Enterprise only |
| [Audit Logging](https://www.percona.com/doc/percona-server-for-mongodb/LATEST/audit-logging.html#audit-log) | YES | Enterprise only |
| Log redaction | YES | Enterprise only |
| SNMP Monitoring | NO | Enterprise only |

MongoDB에서는 엔터프라이즈 버전에서만 사용가능한 몇가지 요소들을 Percona MongoDB에서는 무료로 사용할 수 있습니다. In-Memory 스토리지 엔진이라던가,  암호화 기능, HotBackup 기능, LDAP 인증 및 Audit이나 SNMP 모니터링까지 가능합니다.

또, 표에는 없는 n-gram FTS를 내재하고 있기 때문에 웹이나 애플리케이션 단에서 검색 기능이 중요하다면 n-gram을 내재한 Percona MongoDB의 선택도 좋을 것 같습니다.

### Percona MongoDB에서 n-gram FTS를 적용하는 방법

인덱스를 생성할 때 default_language 파라미터를 ngram으로 설정해줍니다.

```json
> db.collection.createIndex({name:"text"}, {default_language: "ngram"})
```

ngram 검색 알고리즘은 특수 문자를 개별 용어처럼 처리합니다. 따라서 텍스트 색인을 쿼리할 때 검색 문자열 내 특수 문자를 이스케이프할 필요가 없습니다. 예를 들어 2021-02-12 날짜가 포함된 문서를 검색하려면 다음을 지정하십시오.

```json
> db.collection.find({ $text: { $search: "2021-02-12" } })
```

아마 MongoDB를 사용하는 많은 분들이 한글 FTS의 성능이나 지원에 대해 부족하다고 생각하는 경우가 많을 것입니다. Percona MongoDB를 이용하는 것도 하나의 대안이 될 것입니다.
