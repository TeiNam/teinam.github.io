---
date: 2020-05-18 16:50:31 +0900
title: "MongoDB 4.2 admin 계정 설정하기"
category: mongodb
excerpt: "MongoDB admin 4.2 계정 설정하기 MongoDB 아틀라스 배포가 아닌, Linux서버에 직접 패키지를 올려 설치하게 되면, Authentication이 없습니다. 저 역시 CentOS7에 커뮤니티를 올려서 사용하고 있어서, 처음에는 /etc/mongo.conf 안의 B…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — `db.createUser()`·`passwordPrompt()`·`security.authorization: enabled` 는 현재도 그대로 유효하지만, 접속에 쓰인 `mongo` 셸은 6.0 에서 제거되어 `mongosh` 를 써야 하고 4.2 는 이미 지원 종료(2023-04)입니다. 본문 mongod.conf 예시의 `storage.journal.enabled` 는 6.1 이후 제거된 옵션입니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB admin 4.2 계정 설정하기

MongoDB 아틀라스 배포가 아닌 Linux 서버에 직접 패키지를 설치하면 Authentication이 비활성화되어 있습니다.

CentOS 7에 커뮤니티 에디션을 설치해 사용하는 경우, 처음에는 `/etc/mongo.conf` 파일의 Bind IP 설정이 허용하는 대로 모든 접속을 허용합니다.

OS의 Firewalld 데몬이 떠 있다면, Firewall에서 따로 포트 및 서비스를 허용하도록 추가해야 합니다. 내부망에서만 접속하거나 앞단에 방화벽 장비가 있으면 OS 단에서는 중지해도 됩니다.

일단 DB에 누구나 접근이 가능하면 안 되기 때문에 Authentication 설정을 해보도록 하겠습니다.

### Admin 계정 생성

OS 터미널에서 mongodb로 접속하여 `use admin` 명령으로 admin DB로 이동한 후 아래와 같이 작성합니다.

```bash
$ mongo
MongoDB shell version v4.2.6
connecting to: mongodb://127.0.0.1:27017/?compressors=disabled&gssapiServiceName=mongodb
Implicit session: session { "id" : UUID("c8dfe45a-84c0-48c3-99e4-39b65a85780c") }
MongoDB server version: 4.2.6
> use admin
switched to db admin
> db.createUser(
...   {
...     user: "admin",
...     pwd: passwordPrompt(), // or cleartext password
...     roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ]
...   }
... )
Enter password:
Successfully added user: {
	"user" : "admin",
	"roles" : [
		{
			"role" : "userAdminAnyDatabase",
			"db" : "admin"
		},
		"readWriteAnyDatabase"
	]
}
> db.auth("admin",passwordPrompt())
Enter password:
1
>
>
> show dbs
admin   0.000GB
config  0.000GB
local   0.000GB
>
```

기존에 admin DB는 존재하지만 admin 계정이 활성화되어 있지 않은 상태에서 admin 이라는 이름으로 계정을 설정한 것입니다.

admin 계정을 생성하는 방법은 몇 가지가 있는데, 아래와 같은 방식으로 생성하면 모든 데이터베이스에 읽고 쓰기가 가능한 계정이 생성됩니다.

```js
use admin

db.createUser(
  { 
     user: "admin", 
     pwd: passwordPrompt(), // or cleartext password 
     roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ] 
  }
)
```

하지만 이 경우 clusterManager 같은 role은 포함하지 않으며, 레플리카 셋이나 샤드 클러스터를 사용할 때는 clusterManager라는 role을 따로 부여해야 합니다. 또 Database drop 같은 명령은 먹히지 않습니다.

슈퍼 유저로 DB를 관리하는 총 책임자라면 다음과 같이 root 권한을 줘서 생성할 수도 있습니다.

```js
use admin

db.createUser(
{
    user: "dba",
    pwd: passwordPrompt(), // or cleartext password 
    roles: [ "root" ]
})
```

이 경우 정말 모든 권한을 가진 슈퍼 유저 계정으로 생성됩니다.

### security.authorization 옵션 활성화

/etc/mongo.conf 파일 안에 해당 옵션을 활성화시켜야 authentication이 동작하기 때문에 파일을 수정해야 합니다.

해당 옵션을 변경하면 MongoDB를 재구동해야 하니 주의하시기 바랍니다.

```yaml
# mongod.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/

# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

# Where and how to store data.
storage:
  dbPath: /var/lib/mongo
  journal:
    enabled: true
    commitIntervalMs: 200

#  engine:
#  wiredTiger:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 4
      journalCompressor: snappy
      directoryForIndexes: false
    collectionConfig:
      blockCompressor: snappy
    indexConfig:
      prefixCompression: true

# how the process runs
processManagement:
  fork: true  # fork and run in background
  pidFilePath: /var/run/mongodb/mongod.pid  # location of pidfile
  timeZoneInfo: /usr/share/zoneinfo

# network interfaces
net:
  port: 27017
  bindIp: 0.0.0.0  # Enter 0.0.0.0,:: to bind to all IPv4 and IPv6 addresses or, alternatively, use the net.bindIpAll setting.


security:
  authorization: enabled
```

security 부분의 주석을 제거하고 `authorization: enabled` 옵션을 넣어 줍니다.

```bash
$ systemctl restart mongod
```

admin 계정으로 접속하는 방법은 아래와 같습니다.

```bash
$ mongo -u "admin" -p <your_password> --authenticationDatabase "admin"

or 

$ mongo -u "admin" -p --authenticationDatabase "admin"
MongoDB shell version v4.2.6
Enter password:
```

또는 mongo shell 안에서 접속할 수 있습니다.

반드시 admin DB로 이동하고 접속을 해야 합니다.

```bash
use admin

> db.auth("admin", "<your_password>" )
1

or

> db.auth("admin",passwordPrompt())
Enter password:
1
```

만약 ReplicaSet과 샤드 클러스터를 이용해야 한다면 계정에 clusterManager 권한을 부여해야 합니다.

```json
db.grantRolesToUser("admin",["clusterManager"])
```

부여하지 않은 경우 아래와 같이 에러 메시지가 출력됩니다.

```json
rs0:PRIMARY> rs.status()
{
        "operationTime" : Timestamp(1614210287, 1),
        "ok" : 0,
        "errmsg" : "not authorized on admin to execute command { replSetGetStatus: 1.0, lsid: { id: UUID(\"de909cab-8b2e-486e-8d86-7a2186fb9d74\") }, $clusterTime: { clusterTime: Timestamp(1614210287, 1), signature: { hash: BinData(0, 16C2216301B5095CC9983E10935EF967B4F2C650), keyId: 6932979901905502211 } }, $db: \"admin\" }",
        "code" : 13,
        "codeName" : "Unauthorized",
        "$clusterTime" : {
                "clusterTime" : Timestamp(1614210287, 1),
                "signature" : {
                        "hash" : BinData(0,"FsIhYwG1CVzJmD4Qk175Z7TyxlA="),
                        "keyId" : NumberLong("6932979901905502211")
                }
        }
}
```
