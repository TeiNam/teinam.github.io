---
date: 2021-03-19 10:50:45 +0900
title: "MongoDB to ElasticSearch Realtime sync"
category: mongodb
excerpt: "MongoDB to ElasticSearch Realtime sync 이기종 DB간의 데이터 동기화는 여러가지 방법이 있습니다. CDC를 이용하는 방법, 카프카를 이용하는 방법 등 여러가지가 있고, MongoDB에서 ElasticSearch 로 데이터를 동기화 하는 방법 역시 Lo…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Monstache 최신 릴리스는 v6.8.0 으로 본문의 v6.7.4·Go 1.16 조합은 오래되었고, 설정 예시가 전제하는 MongoDB 4.x 도 모두 EOL 입니다. 동기화 아키텍처(change stream + direct read) 자체는 여전히 통용됩니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

### MongoDB to ElasticSearch Realtime sync

이기종 DB 간 데이터 동기화 방법에는 CDC, Kafka 등 여러 방식이 있다. MongoDB에서 ElasticSearch로 데이터를 동기화하는 방법 역시 Logstash를 비롯한 여러 선택지가 있다.

MongoDB에서 ElasticSearch로 데이터를 동기화하기로 결정한 이유는 크게 두 가지다.

**첫째, MongoDB의 ngram 검색 부재**

**둘째, 누적 데이터 처리**

Percona MongoDB를 사용하면 ngram 문제도 해결되고, Percona fork에서 제공하는 다양한 기능을 무료로 사용할 수 있다. 하지만 미묘하게 다른 설정과, 문제 발생 시 Percona에 의존해야 한다는 단점 때문에 Percona MongoDB 선택을 망설였다.

그래서 ElasticSearch에 실시간 동기화를 통해 검색용 컬렉션을 ElasticSearch로 보내고 전문 검색엔진 기능을 활용하기로 했다.

두 번째는 누적 데이터 처리다. 로그성 수집 데이터처럼 쌓이는 컬렉션에서 너무 많은 데이터가 쌓이면 운영 DB에 결코 좋지 않다. MongoDB가 샤딩으로 분산 처리를 잘하지만, 샤드된 클러스터에서는 aggregation 쿼리가 샤드 특성을 타는 경우가 많다. 운영 DB에 로그성 누적 데이터를 위해 샤드를 늘리는 것도 비효율적이다. 데이터 누적과 누적된 데이터 분석, 통계 작업을 운영 DB에서 할 수 없기에 처음부터 분산하기로 결정했다.

ElasticSearch를 선택한 이유는 동일하게 분산 처리에 강하고, DB보다는 검색엔진으로 제품을 내세울 정도로 강력한 검색 기능을 가지며, Kibana를 통한 시각화가 쉽고, MongoDB와 동일하게 JSON 데이터를 저장하기 때문이다.

MongoDB에서 업데이트가 일어나지 않는 로그성 누적 데이터를 쌓는 컬렉션을 Capped로 생성한 다음, 해당 컬렉션에 쌓이는 데이터를 ElasticSearch로 보낸다. 애플리케이션 서버는 MongoDB에서 직접 검색하지 않고, ElasticSearch에서 검색한 다음 ObjectID만 결과로 반환받아 해당 ObjectID로 MongoDB에서 필요한 데이터를 가져오는 방식이다.

HashTag가 누구에 의해 언제 어디에 인용되었는지를 기록하는 컬렉션에서 기간별, 이용자별, 태그가 인용된 포스트 검색 등 다양한 검색 기능을 갖춰야 했다. 조건에 맞는 검색은 ElasticSearch로 해서 ObjectID만 골라 데이터를 로딩할 수 있게 처리한 구조다.

#### Monstache

동기화에 사용한 툴은 Monstache다.

**Monstache**

Realtime sync from MongoDB to Elasticsearch.

다음은 Monstache에서 제공하는 기능이다.

- Supports up to and including the latest versions of Elasticsearch and MongoDB
- Single binary with a light footprint
- Support for MongoDB change streams and aggregation pipelines
- Pre built Docker [containers](https://hub.docker.com/r/rwynn/monstache/tags/)
- Optionally filter the set of collections to sync
- Advanced support for sharded MongoDB clusters including auto-detection of new shards
- Direct read mode to do a full sync of collections in addition to tailing the oplog
- Transform and filter documents before indexing using Golang plugins or JavaScript
- Index the content of GridFS files
- Support for propogating hard/soft document deletes
- Support for propogating database and collection drops as index deletes
- Optional custom document routing in Elasticsearch
- Stateful resume feature
- Time machine feature to track document changes over time
- Worker and Clustering modes for High Availability
- Support for [rfc7396](https://tools.ietf.org/html/rfc7396) JSON merge patches
- Systemd support
- Optional http server to get access to liveness, stats, profiling, etc

Logstash보다 간단한 설정으로 DB 간 동기화를 구성할 수 있다.

##### 설정 방법

> **전제조건:** 서버에 Go 1.16+ 설치 필요

**최신 버전 Go 받기**

```bash
$ wget https://golang.org/dl/go1.16.2.linux-amd64.tar.gz
```

**Go 설치**

```bash
$ tar -C /usr/local -xzf go1.16.2.linux-amd64.tar.gz
$ export PATH=$PATH:/usr/local/go/bin
$ go version
go version go1.16.2 linux/amd64
```

**Monstache 설치**

```bash
$ wget https://github.com/rwynn/monstache/releases/download/v6.7.4/monstache-98f8bc6.zip
$ unzip monstache-98f8bc6.zip
```

파일을 받아 압축을 푼 후 경로 안에 들어가면 여러 OS 폴더로 나뉘어 있고, 그 안에 monstache 파일이 있다.

`/usr/local/bin` 밑으로 복사했다.

```bash
$ cp monstache /usr/local/bin/
```

**Monstache 설정파일 생성 및 설정**

설정 파일 관리를 위해 Monstache 폴더를 만든다.

```bash
$ cd ~
$ mkdir monstache
$ cd monstache
```

설정 파일을 생성한다.

```bash
$ vi mongo-elastic.toml
```

```toml
# connection settings

# connect to MongoDB using the following URL
mongo-url = "mongodb://<USERNAME>:<PASSWORD>@10.100.170.45:27017"
# connect to the Elasticsearch REST API at the following node URLs
elasticsearch-urls = ["http://10.100.170.61:9200"]

# frequently required settings

# if you need to seed an index from a collection and not just listen and sync changes events
# you can copy entire collections or views from MongoDB to Elasticsearch
direct-read-namespaces = ["db.hashTags", "db.keywords"]

# if you want to use MongoDB change streams instead of legacy oplog tailing use change-stream-namespaces
# change streams require at least MongoDB API 3.6+
# if you have MongoDB 4+ you can listen for changes to an entire database or entire deployment
# in this case you usually don't need regexes in your config to filter collections unless you target the deployment.
# to listen to an entire db use only the database name.  For a deployment use an empty string.
change-stream-namespaces = ["db.hashTags", "db.keywords"]

# additional settings

# compress requests to Elasticsearch
gzip = true

# generate indexing statistics
stats = true

# index statistics into Elasticsearch
index-stats = true

# use 4 go routines concurrently pushing documents to Elasticsearch
elasticsearch-max-conns = 4

# propogate dropped collections in MongoDB as index deletes in Elasticsearch
dropped-collections = false

# propogate dropped databases in MongoDB as index deletes in Elasticsearch
dropped-databases = false

# in Elasticsearch with a newer version. Elasticsearch is preventing the old docs from overwriting new ones.
replay = false

# resume processing from a timestamp saved in a previous run
resume = false

# do not validate that progress timestamps have been saved
resume-write-unsafe = true

# override the name under which resume state is saved
resume-name = "default"

# use a custom resume strategy (tokens) instead of the default strategy (timestamps)
# tokens work with MongoDB API 3.6+ while timestamps work only with MongoDB API 4.0+
resume-strategy = 1

# print detailed information including request traces
verbose = true

index-as-update = false

index-oplog-time = false

index-files = false

file-highlighting = false
```

> **주의:** 위 설정에서 `<USERNAME>`과 `<PASSWORD>`를 실제 MongoDB 인증 정보로 교체하세요.

주요 설정은 `direct-read-namespaces`다. namespace는 MongoDB의 `dbName.collectionName` 규칙으로 지정해야 한다.

namespace를 기준으로 동기화 대상을 정하므로 컬렉션명만 주면 동기화되지 않는다.

Monstache 설정 파일 파라미터는 [Configuration 페이지](https://rwynn.github.io/monstache-site/config/)에서 확인할 수 있다.

이 정도 설정으로 동기화하는 데 문제가 없다.

`index-as-update` 파라미터는 기본값이 `false`다. `true`로 바꾸면 MongoDB에서 컬렉션 업데이트 시 ElasticSearch에서도 새 데이터를 쌓는 구조가 아닌 해당 데이터를 업데이트로 처리한다.

ElasticSearch에서는 DB명을 index라고 부르므로 차이점을 인지해야 한다.

**Monstache 구동**

foreground에서 실행하면 터미널 종료 시 구동이 멈추므로 background에서 실행한다.

```bash
$ nohup monstache -f mongo-elastic.toml 2>&1 &
```

프로세스는 여러 개 띄울 수 있다. 업데이트가 필요한 컬렉션은 `index-as-update`를 `true`, 로그성 데이터는 `false`로 설정한 설정파일을 따로 만들어 각각 동기화할 수 있다.

MongoDB와 ElasticSearch를 실시간 동기화하는 법을 알아봤다.

Monstache는 Docker 이미지도 제공하며, 실제 데이터 동기화 작업이 빠르다.
