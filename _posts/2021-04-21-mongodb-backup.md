---
date: 2021-04-21 00:04:57 +0900
title: "MongoDB Backup"
category: mongodb
excerpt: "MongoDB Backup MongoDB는 기본적으로 레플리카 셋(복제 셋)을 구성하기 때문에 1차적으로 장애에 대한 대응이 빠른편에 속합니다. 프라이머리가 장애가 난 경우 노드간의 투표를 통해 세컨더리 DB를 프라이머리로 선출하여 장애가 발생한 프라이머리를 대체합니다. 하지만 어…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 핵심 사실 세 가지가 현재 문서와 다릅니다 — (1) WiredTiger 볼륨 백업은 데이터 파일과 저널을 별도 볼륨에 "두어야 한다"가 아니라 "같은 볼륨일 필요가 없다"이며 이 경우 `db.fsyncLock()` 으로 쓰기를 멈춰야 합니다, (2) mongodump/mongorestore 는 현재도 샤드 클러스터를 지원하되 밸런서 중지·크로스 샤드 트랜잭션/DDL 중단이 전제이고 `--oplog` 만 쓸 수 없습니다, (3) Database Tools 는 4.4 부터 서버와 분리 릴리스되어 현재 100.18.0 이고 지원 서버는 4.2~9.0 입니다(본문의 100.3.1/3.6~4.4 아님).

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB Backup

MongoDB는 기본적으로 레플리카 셋(복제 셋)을 구성하기 때문에 1차적으로 장애 대응이 빠른편에 속한다.

프라이머리가 장애가 난 경우 노드 간의 투표로 세컨더리 DB를 프라이머리로 선출하여 장애가 발생한 프라이머리를 대체한다.

하지만 어떤 일이 발생할지는 모르는 것이기 때문에 항상 별도의 백업을 가져가는 것이 운영에서 좋은 대비책이다.

MongoDB를 백업하는 방법에는 여러 방법이 있다. 그중에 MongoDB에서 가장 권고하는 방법은 논리 볼륨 관리자(LVM, Logical Volume Manager) 스냅샷이다.

### LVM 스냅샷

파일시스템 스냅샷이라고도 한다. 시스템 레벨에서 백업을 진행하는 방식으로 MongoDB의 데이터 파일을 보관하는 볼륨의 복사본을 만드는 방법이다. 스냅샷 백업은 신속하고 안정적으로 동작한다.

MongoDB 3.2 이전에는 WiredTiger를 사용하여 MongoDB 인스턴스의 LVM 볼륨 백업을 생성하려면 데이터 파일과 journal이 동일한 볼륨에 있어야 했다.

하지만 MongoDB 3.2 이후 버전에서는 MongoDB 인스턴스의 데이터 파일과 journal 파일이 별도의 볼륨에 구성해야 하는 것으로 변경되었다.

그리고 일관된 백업을 생성하려면 데이터베이스를 잠가야하며 백업 프로세스 중에 데이터베이스의 모든 쓰기를 일시 중단해야한다.

스냅샷은 라이브 데이터와 특수 스냅샷 볼륨 사이에 포인터를 생성해 동작한다. 이러한 포인터는 이론적으로 'Hard Link'와 동일하다. 작업 데이터가 스냅샷에서 벗어나면 스냅샷 프로세스는 쓰기 시 복사 전략을 사용한다. 즉, 스냅샷은 수정된 데이터만을 저장하게 된다.

스냅샷을 찍기 위해 사전에 `db.fsyncLock()`을 명령을 실행해야하는데, 해당 명령어가 실행되면 모든 쓰기를 플러시하고 데이터베이스 단위로 잠금상태로 바뀐다. 백업 프로세스 동안 읽기 쓰기 작업이 중지되기 때문에 프라이머리에서 실행해서는 안되고, 읽기 작업이 없는 히든 세컨더리를 이용하는 것이 좋다.

스냅샷을 이용한 백업은 다음과 같은 절차를 따른다.

1. db.fsyncLock();
2. System 레벨의 스냅샷
3. db.fsyncUnlock();
4. 스냅샷 언마운트 후 별도의 저장

이런식으로 진행하기 때문에 스냅샷을 저장할 공간과 별도의 스토리지 또는 저장매체가 필요하다. 샤드된 클러스터라면 `db.fsyncLock()` 하기 전에 `sh.stopBalancer()`를 실행 해줘야하고 `db.fsyncUnlock()` 후에 `sh.startBalancer()`를 해줘야 한다.

#### LVM 스냅샷 백업 테스트

우선 데이터파일 파티션과 journal 파티션을 분리해야한다. LVM으로 각각의 경로를 분할한다.

```plaintext
/dev/mapper/lvm02-db_data   30G   33M   30G   1% /var/lib/mongo
/dev/mapper/lvm03-journal   10G   33M   10G   1% /journal
```

journal은 파티션을 독립한 후에 소프트 링크로 연결해준다.

```bash
$ ln -s /journal /var/lib/mongo/
```

3.2 버전 이상에서는 이런식으로 파티션 분할을 해줘야 LVM 스냅샷 백업이 가능하다.

```bash
root@DBTestShard:/var/lib/mongo]# ls -l
total 64
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 collection-0--7324270282965169064.wt
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 collection-2--7324270282965169064.wt
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 collection-4--7324270282965169064.wt
drwx------. 2 mongod mongod   48 Apr 20 11:18 diagnostic.data
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 index-1--7324270282965169064.wt
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 index-3--7324270282965169064.wt
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 index-5--7324270282965169064.wt
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 index-6--7324270282965169064.wt
lrwxrwxrwx. 1 mongod mongod    8 Apr 20 10:52 journal -> /journal
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 _mdb_catalog.wt
-rw-------. 1 mongod mongod    5 Apr 20 11:18 mongod.lock
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 sizeStorer.wt
-rw-------. 1 mongod mongod  114 Apr 20 11:18 storage.bson
-rw-------. 1 mongod mongod   47 Apr 20 11:18 WiredTiger
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 WiredTigerHS.wt
-rw-------. 1 mongod mongod   21 Apr 20 11:18 WiredTiger.lock
-rw-------. 1 mongod mongod 1122 Apr 20 11:18 WiredTiger.turtle
-rw-------. 1 mongod mongod 4096 Apr 20 11:18 WiredTiger.wt
root@DBTestShard:/var/lib/mongo]# 
root@DBTestShard:/var/lib/mongo]# 
root@DBTestShard:/var/lib/mongo]# cd /journal/
root@DBTestShard:/journal]# ls -l
total 307200
-rw-------. 1 mongod mongod 104857600 Apr 20 11:18 WiredTigerLog.0000000001
-rw-------. 1 mongod mongod 104857600 Apr 20 11:18 WiredTigerPreplog.0000000001
-rw-------. 1 mongod mongod 104857600 Apr 20 11:18 WiredTigerPreplog.0000000002
```

journal은 MongoDB의 dbPath 경로 밑에 생성되기 때문에 따로 패스를 지정해줄 방법이 없다. 따라서 파티션을 분할하여 위와 같은 방식으로 ln 명령으로 분할처리를 해주게 된다. 실제로 MongoDB의 공홈에는 분할하라고 나오지 어떻게 분할하는지를 안내하지 않는다.

실제로 MongoDB jira나 스택 오버플로우에서 해당 문제 답변으로 소프트링크를 이용하라고 답변이 많이 올라온다.

백업 테스트를 진행하기 전에 더미 데이터를 밀어 넣었다. name, job title, phone, email 이렇게 4개 필드로 구성된 랜덤 데이터 3000만건을 밀어 넣었다. name 필드에 인덱스를 생성해줬구요. 1000건씩 잘라서 넣는다.

```javascript
faker.locale = "en"

const STEPCOUNT = 1000; //total 3000 * 1000 = 3000000

function isRandomBlank(blankWeight) {
    return Math.random() * 100 <= blankWeight;
};

for (let i = 0; i < 3000; i++) {
    db.getCollection("test").insertMany(
        _.times(STEPCOUNT, () => {
            return {
                "name": faker.name.findName(),
                "job": faker.random.word(),
                "phone": faker.random.word(),
                "email": faker.internet.email()
            }
        })
    )

    console.log("test:test", `${(i + 1) * STEPCOUNT} docs inserted`);
}
```

실제 리눅스 상에 보이는 용량은 아래처럼 늘었다.

```plaintext
/dev/mapper/lvm02-db_data   30G  410M   30G   2% /var/lib/mongo
/dev/mapper/lvm03-journal   10G  333M  9.7G   4% /journal

> show dbs
admin 0.000GB
config 0.000GB
local 0.000GB
test 0.286GB
```

실제 스냅샷 백업을 진행해보겠다. 백업을 진행하기전에 데이터파일이 있는 LVM에 공간이 충분히 있어야 한다.

`db.fsyncLock()` 명령으로 쓰기를 플러싱하고 데이터베이스 수준의 잠금을 설정한다.

```javascript
> db.fsyncLock();
{
        "info" : "now locked against writes, use db.fsyncUnlock() to unlock",
        "lockCount" : NumberLong(1),
        "seeAlso" : "http://dochub.mongodb.org/core/fsynccommand",
        "ok" : 1
}
```

그리고 System 레벨로 나와서, 즉 OS 터미널로 돌아와서 root 권한으로 실행을 한다.

```bash
root:~]# lvcreate --size 100m --snapshot --name pmdb-snap01 /dev/lvm02/db_data 
  Logical volume "pmdb-snap01" created.
```

–size 100m 이라는 옵션은 스냅샷의 한도를 100m으로 지정해준다. 이 크기는 디스크에 있는 총 데이터 양이 아니라 /dev/lvm02/db\_data의 현재 상태와 스냅샷(/dev/lvm02/pmdb-snap01)의 차이의 양을 반영한다. 명령이 반환 되면 스냅샷이 생성된 것이다.

스냅샷이 끝나면 바로 `db.fsyncUnlock()`으로 잠금을 해제하여 데이터베이스를 다시 사용가능 상태로 돌려 놓는다.

```javascript
> db.fsyncUnlock();
{ "info" : "fsyncUnlock completed", "lockCount" : NumberLong(0), "ok" : 1 }
```

그리고 생성한 스냅샷을 다른 저장 매체에 저장할 수 있게 압축과정을 거쳐 파일로 변환한다. 파일 압축은 반드시 스냅샷이 `umount` 된 상태에서 진행되어야 한다.

```bash
# dd if=/dev/lvm02/pmdb-snap01 | gzip > pmdb-snap01.gz
62914560+0 records in
62914560+0 records out
32212254720 bytes (32 GB) copied, 200.858 s, 160 MB/s
```

실제로 제가 백업을 할때는 1000만건 정도 더 넣어서 데이터가 늘어난 상태이고, `df -h`로 확인 했을때, 데이터파일의 전체 크기가 492MB, 압축 파일은 359M로 생성되었다.

백업 과정을 네트워크 스토리지에 진행하던 로컬에 진행하고 다른 곳으로 복사하던 상관 없다. 각자 맞는 백업 정책에 따라 진행하면 된다. MongoDB 공홈의 권고사항이 LVM을 이용한 스냅샷 백업이며,

스냅샷 백업에서 중요한 포인트는

1. journal 파티션의 독립
2. 운영에 지장이 없는 히든 세컨더리 혹은 세컨더리에서 진행

이다.

#### 스냅샷 백업의 복원 절차

스냅샷에서 백업을 복원하는 건 어렵지 않다.

```bash
root:~]# lvcreate --size 1G --name pmdb-new lvm04
root:~]# gzip -d -c pmdb-snap01.zip | dd of=/dev/lvm04/pmdb-new
root:~]# mount /dev/lvm04/pmdb-new /var/lib/mongo
```

새로운 LVM을 생성하고, 압축파일의 내용을 `dd` 명령으로 새로운 파티션에 복사한 후 MongoDB의 `dbPath`에 마운트한 후 구동을 하면 된다.

### 데이터 파일 복사를 통한 백업

일단 절차는 스냅샷과 절차는 동일하다.

`db.fsyncLock()` 명령이후 LVM 스냅샷을 찍는 것이 아니고, dbPath 안에 있는 데이터 파일을 통채로 복사하는 방법이다. 스냅샷과 다른 점은 cp 명령을 이용한다는 점과 mongod의 구동 옵션중 –directoryperdb 옵션을 사용하면 모든 데이터베이스가 아닌 개별적으로 백업이 가능하다는 점이다.

> **주의:** 파일을 복원할 파티션은 비어 있어야 하며, 개별 데이터베이스 복원 시 정확한 디렉토리명을 기입해야 한다.

```bash
> db.fsyncLock();

$ cp /var/lib/mongo/* /backup/

> db.fsyncUnlock();
```

### mongodump 사용

mongodump는 단일 서버의 백업 방법이다. 이 도구를 이용하면 디렉토리 단위로 저장되는 BSON 파일이 생성된다. 하지만 mongodump는 백업과 복원 모두 속도가 느리며, 복제 셋을 백업하는 데 문제가 있다. 속도는 느린편이지만, 개별 데이터베이스, 컬렉션, 컬렉션의 서브셋을 백업하기 좋다. 기존에는 mongodump가 MongoDB의 버전과 동일하게 릴리즈 되었으나, MongoDB 4.4 버전부터는 MongoDB와 별개로 릴리즈되며, 현재 100.3.1 버전이 릴리즈 되었으며, 해당 툴이 지원하가능한 DB의 버전은 3.6부터 4.4 버전까지이다.

기본적으로 mongodump는 4개의 쓰레드를 사용하는데, 자원이 충분한 서버라면 `--numParallelCollections` 옵션으로 사용할 쓰레드의 개수를 늘릴 수 있다.

mongodump로 백업을 실행하면 실행하고 있는 현재 디렉토리에 dump 디렉토리를 생성한다. `--out`옵션을 사용해 백업을 덤프 할 디렉토리를 지정할 수 있다. 데이터 파일을 이용해 데이터를 덤프하기 때문에, 데이터베이스가 `shutdown` 상태여도 사용이 가능하다.

`--query` 옵션을 이용해 JSON 쿼리로 특정 값 만을 추출할 수 있다. 4.2 버전부터는 확장된 JSONv2 쿼리 형식이여야 하며, 중괄호는 작은 따옴표(single quotes) ('{ … }')로 묶어야 한다. –query 옵션을 사용하여 timestamp를 이용하여 OpLog로부터 시점 복구도 가능하다.

mongodump를 이용한 백업을 진행하는 동안에는 쓰기 작업이 가능하다. 예를 들어 mongodump가 데이터베이스의 A라는 값을 덤프를 마치고 뒷 부분 백업을 진행하는 동안에 다른 사용자가 A를 삭제하면 mongodump로 백업이 끝난 시점에 데이터가 원본 서버와 다른 상태가 될 수도 있다.

이러한 상황을 피하기 위해서 mongodump는 oplog가 활성화 되어 있다면 `--oplog` 옵션을 이용할 수 있다. `--oplog` 옵션은 덤프가 발생하는 동안 해당 서버에서 발생하는 모든 작업 내용을 추적하고 oplog.bson으로 생성되는 덤프에 OpLog의 내용이 같이 기록되어 백업이 복원될때 같이 재생이 된다. 즉, 원본 서버의 데이터의 특정 시점 스냅샷을 얻을수 있다고 보면 된다. mongos에서는 해당 옵션은 사용이 불가능하며, 레플리카 셋의 멤버들의 로컬 서버에서 직접 접속해서 진행해야 한다.

mongodump는 readPreference를 지원하고 있으며 해당 옵션을 이용해 세컨더리를 사용할 수 있다.

mongodump를 이용해 받은 백업은 mongorestore 툴을 사용하여 복원이 가능하며, 데이터베이스를 백업했을때 `--oplog`옵션을 사용했다면, mongorestore 사용시 `--oplogReplay` 옵션을 사용해야 한다. 또, 복원전에 컬렉션을 삭제하려면 `--drop`옵션을 사용하면 된다.

호환성을 위해 mongodump와 mongorestore는 동일한 버전을 사용하는 것이 좋다.

MongoDB 4.2 이후 버전에서는 샤드 클러스터를 백업하고 복원하는데 mongodump와 mongorestore는 사용할 수 없다. 왜냐하면 샤드 전체에 걸쳐 트랜잭션의 원자성을 유지하지 못하기 때문이다.

또, 유니크 인덱스를 사용중인 컬렉션을 백업해야한다면 mongodump/mongorestore가 아닌 다른 종류의 백업을 권고하고 있다. 유니크 인덱스를 사용하면, 데이터를 복제하는 동안 데이터가 '유니크 인덱스 제약 조건'을 위반하는 방식으로 변경되서는 안되기 때문이다. 가장 안전한 방법은 데이터를 'freeze'하고 백업을 수행하는 방법이다.

그 밖에도 [MongoDB docs](https://docs.mongodb.com/v4.2/reference/program/mongodump/)에서 더 많은 옵션을 확인할 수 있다.

### 샤드 클러스터 백업

샤드 클러스터가 활성 상태인 동안에는 데이터베이스를 완벽하게 백업할 수 있는 방법이 없다. 특정 시점의 클러스터 전체 스냅샷을 생성할 수 없기 때문이다. 따라서 샤드 클러스터를 백업할 때는 config 서버와 복제 셋을 별도로 백업하는 데 중점을 둬야 한다.

샤드 클러스터에서 백업 또는 복원을 해야한다면 밸런서를 중지해야하며, 청크 단위로 움직이는 상황에서는 일관된 스냅샷을 얻을 수 없다. 대부분의 경우 클러스터 내에서 하나의 샤드만 복원하면 되는 경우가 많기 때문에, 까다로운 경우가 아니면 샤드의 백업으로부터 해당 샤드만 복원하면 된다.

만약 백업 시점과 운영 서버 사이의 시점에 차이가 크고, 해당 기간동안 청크가 움직였다면, config 서버 백업으로 청크의 움직임을 추적할 수 있다. 하지만 이 방법은 단일 샤드를 복원하는 방법보다 어렵기 때문에 샤드를 복원하고 청크 내 데이터를 포기하는 편이 나을수도 있다.

### Percona 온라인 백업

Percona에서 fork한 MongoDB를 사용한다면, Percona에서 제공하는 온라인 백업 기능을 이용할 수 있다. `db.fsyncLock()`을 이용하는 방법은 고가용성에 영향을 미치기도 한다. Percona MongoDB에는 Hotbackup 기능을 구현해 놓았는데, wriedTiger 스토리지 엔진의 체크포인트 기능을 활용하여 wiredTiger 스토리지 엔진에서 백업용 체크포인트를 실행하고 데이터 파일의 복사가 완료될 때까지 백업 체크포인트를 종료하지 않는 방식으로 구현한 것이다. 다만 파일 복사 시간동안 데이터 변경이 많아지면, 각 컬렉션의 데이터 파일의 크기가 몇배로 커질수도 있고 이러한 경우, Disk Full 이 발생할 수도 있기 때문에 주의를 기울여야 한다. 한번 커져버린 데이터 파일은 컴팩션이나 컬렉션 리빌드를 수행하지 않으면 원래 크기로 줄일 수 없다.

MongoDB의 여러 백업 방법을 알아보았다. 자신의 환경에서 충분히 테스트를 진행하고 백업 정책이나, 구성에 맞는 백업 방식을 선택하면 좋을것 같다.

#### 참고 자료

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")

도서: MongoDB 완벽가이드

도서: Real MongoDB
