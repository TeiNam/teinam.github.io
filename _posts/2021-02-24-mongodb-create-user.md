---
date: 2021-02-24 11:43:16 +0900
title: "MongoDB의 일반 계정 생성"
category: mongodb
excerpt: "admin 계정을 활성화한 MongoDB에서 용도에 맞는 일반 계정과 사용자 정의 역할을 mongosh로 만드는 방법을 정리합니다."
last_modified_at: 2026-09-20
---

> **전제조건:** MongoDB 8.0 이상 설치 완료, mongod 구동 중, admin 사용자 생성과 접근 제어 활성화 완료. 접근 제어를 켜는 절차는 공식 문서의 [Enable Access Control](https://www.mongodb.com/docs/manual/tutorial/enable-authentication/ "Enable Access Control on Self-Managed Deployments")에 있습니다. 아래 예제는 모두 `mongosh`에서 실행합니다.

다른 데이터베이스도 그렇고, 서버를 사용하기 위한 OS에서도 그렇고 가장 기본이 되는 보안 중 하나가 사용자 계정과 패스워드입니다. MariaDB나 PostgreSQL도 마찬가지지만, 기본적으로 DB를 생성하면 사용할 계정을 생성해야 합니다.

MongoDB에서 보안을 위해 가장 먼저 해야 하는 일은 admin 계정을 만들고 접근 제어를 켜는 것입니다. 접근 제어를 켜지 않은 MongoDB는 접속한 클라이언트를 인증하지 않기 때문에, 포트에 닿을 수 있는 누구나 모든 데이터를 읽고 지울 수 있습니다. 해커가 들어와서 DB 데이터를 지우고 돈을 요구하는 사고가 실제로 발생합니다.

기본 설정에서는 `net.bindIp`가 `localhost`라서 외부에서 바로 접속하지는 못합니다. 공식 Debian·Red Hat 패키지로 설치했을 때도 `bind_ip`가 `127.0.0.1`로 설정됩니다. 다만 다른 서버의 애플리케이션이 접속해야 해서 외부 인터페이스에 바인딩하는 순간, 접근 제어를 켜지 않은 상태는 그대로 노출이 됩니다.

admin 계정을 활성화한 후에 일반 계정을 생성하면 됩니다.

### MongoDB의 Authentication

```yaml
security:
  authorization: enabled
```

mongod.conf 파일에 해당 부분을 활성화하면 MongoDB 서버 간 통신을 위한 내부 인증뿐만 아니라 사용자의 로그인을 위한 인증까지 모두 활성화됩니다.

이 기능을 켠 상태에서 MongoDB를 구동하면, OS 셸에서 `mongosh` 명령으로 접속하는 것 자체는 됩니다. 하지만 인증하기 전에는 데이터 조회 같은 명령이 거부되고, 데이터베이스를 전환하거나 로그인하는 명령만 동작합니다.

이 부분은 shard cluster의 보안 인증에서 매우 중요하기 때문에 나중에 다시 다룰 예정입니다.

MongoDB의 자체적인 사용자 인증은 다른 DBMS와 같이 ID/Password 기반 인증을 사용하는데, MongoDB 서버는 인증 데이터베이스 정보를 추가로 요구합니다. 사용자를 생성할 때 반드시 특정 데이터베이스로 이동해서 생성해야 하는데, 이때 데이터베이스를 인증 데이터베이스(Authentication Database)라고 합니다. 사용자 정보는 그 데이터베이스에 저장되기 때문에, 한 계정의 인증 데이터베이스는 하나뿐입니다.

기본 인증 메커니즘은 SCRAM입니다. MongoDB는 SCRAM 계열로 `SCRAM-SHA-1`과 `SCRAM-SHA-256`을 지원하며, 그 밖에 x.509 인증서 인증을 제공합니다.

### 계정 생성

일반적인 계정 생성 명령어는 아래와 같습니다.

```js
use admin
db.createUser({ user: "testuser", pwd: passwordPrompt(), roles: [ "dbAdmin" ] })
```

계정을 생성하기 위해 `use admin` 명령으로 admin DB로 이동했는데, 이 admin db가 인증 데이터베이스가 되는 것입니다. 꼭 admin 데이터베이스를 사용하지 않고 자신이 생성한 데이터베이스를 사용해도 됩니다.

`db.createUser()`에 넘기는 문서는 다음 필드를 받습니다.

| 필드 | 설명 |
| --- | --- |
| `user` | 사용자 이름 |
| `pwd` | 비밀번호. `$external`에 만드는 계정에는 필요하지 않습니다 |
| `roles` | 부여할 역할 배열. 빈 배열도 가능합니다 |
| `customData` | 사원번호처럼 계정에 함께 저장할 임의 정보 |
| `authenticationRestrictions` | 접속을 허용할 IP 또는 CIDR 범위 |
| `mechanisms` | `SCRAM-SHA-1`, `SCRAM-SHA-256` |
| `passwordDigestor` | 비밀번호를 서버가 다이제스트할지(`server`) 클라이언트가 할지(`client`) |

> **NOTE** — `mechanisms`를 생략하면 `SCRAM-SHA-1`과 `SCRAM-SHA-256`이 모두 등록됩니다. `SCRAM-SHA-256`은 서버가 비밀번호를 다이제스트해야 하므로 `passwordDigestor`를 기본값인 `server`로 두어야 합니다.

MongoDB 서버의 사용자 계정은 인증 데이터가 달라지면 다른 계정으로 인식합니다. 아래 예제와 같이 2개의 사용자 계정을 생성했다면 사용자 계정과 패스워드가 같더라도, MongoDB는 다른 계정으로 인식합니다.

```js
use test01
db.createUser({ user: "test01", pwd: passwordPrompt(), roles: [ "readWrite" ] })
```

```js
use admin
db.createUser({ user: "test01", pwd: passwordPrompt(), roles: [ "readWrite" ] })
```

두 계정은 사용자 계정과 패스워드가 같지만, 계정 인증 데이터베이스 정보가 다르기 때문에 다른 계정으로 인식하게 됩니다.

### MongoDB의 역할(Role)

일반 계정은 admin 권한을 가져서는 안 됩니다. 단순히 데이터를 읽어가는 read 권한이나, 개발에 필요한 readWrite 권한만 부여하거나 각 사용자 용도에 맞는 권한을 부여해야 합니다.

MongoDB는 역할(role) 기반의 권한 부여 방식을 사용하는데, 이 역할이라는 것은 특정 리소스의 액션을 미리 매핑해 둔 것입니다. 어떤 액션에 어떤 명령이 포함되는지는 [privilege actions 매뉴얼](https://www.mongodb.com/docs/manual/reference/privilege-actions/ "privilege actions 매뉴얼")에서 확인할 수 있습니다.

MongoDB의 명령은 하나의 액션에 종속되어 있지 않기 때문에 주의해야 합니다. 예를 들어 `aggregate`는 입력 컬렉션을 읽을 권한이 필요하고, 파이프라인에 `$out`이나 `$merge`가 들어가면 대상 컬렉션에 쓸 권한까지 필요합니다. `bypassDocumentValidation` 옵션도 `$out`이나 `$merge`를 지정할 때만 적용됩니다.

MongoDB에는 기본적으로 내장되어 있는 역할이 있으며, 사용자가 생성하는 것도 가능합니다. 자체 관리 배포에서 제공하는 내장 역할은 다음과 같습니다.

| 범주 | 내장 역할 |
| --- | --- |
| 데이터베이스 사용자 | `read`, `readWrite` |
| 데이터베이스 관리 | `dbAdmin`, `dbOwner`, `userAdmin` |
| 클러스터 관리 | `clusterAdmin`, `clusterManager`, `clusterMonitor`, `hostManager` |
| 백업·복구 | `backup`, `restore` |
| 전체 데이터베이스 | `readAnyDatabase`, `readWriteAnyDatabase`, `dbAdminAnyDatabase`, `userAdminAnyDatabase` |
| 슈퍼유저 | `root` |

데이터베이스 사용자 역할과 데이터베이스 관리 역할은 모든 데이터베이스에 있고, 나머지는 admin 데이터베이스에만 있습니다. `read`는 시스템 컬렉션을 제외한 컬렉션의 읽기 권한을 줍니다. `readWrite`는 `read`의 권한에 더해 데이터를 수정하고 컬렉션과 인덱스를 만들거나 지울 수 있습니다. `dbAdmin`은 스키마 작업·인덱스·통계 수집 같은 관리 작업을 하지만 사용자와 역할 관리 권한은 없고, 컬렉션에 대한 `find` 권한도 포함하지 않습니다. `dbOwner`는 `readWrite`·`dbAdmin`·`userAdmin`을 합친 역할이고, `clusterAdmin`은 `clusterManager`·`clusterMonitor`·`hostManager`를 합친 역할입니다. Atlas는 자체 관리 배포와 다른 내장 역할 목록을 쓰기 때문에, Atlas 클러스터라면 Atlas 쪽 목록을 확인해야 합니다.

> **WARNING** — `userAdmin`은 자신에게 어떤 권한이든 부여할 수 있는 역할입니다. admin 데이터베이스 범위로 `userAdmin`이나 `dbOwner`를 주면 사실상 클러스터 슈퍼유저를 넘기는 것과 같습니다.

`root`는 `readWriteAnyDatabase`·`dbAdminAnyDatabase`·`userAdminAnyDatabase`·`clusterAdmin`·`backup`·`restore`를 모두 합친 역할이므로 일반 계정에 부여하지 않습니다.

### 새로운 사용자 정의 역할 만들기

아래는 새로운 역할을 만드는 명령입니다.

```js
db.createRole({
  role: "serviceDev",
  privileges: [],
  roles: [
    { role: "readWrite", db: "test01" }
  ]
})
```

역할을 만들 때 두 가지 방법이 있습니다. 위 예제처럼 `roles` 필드에 기존 역할을 맵핑하는 방법이 있고, 아래처럼 `privileges` 필드에 액션을 직접 부여해서 만드는 방식이 있습니다.

```js
db.createRole({
  role: "serviceDev",
  privileges: [
    { resource: { db: "test01", collection: "" }, actions: [ "find", "update", "insert", "remove" ] }
  ],
  roles: []
})
```

역할은 `db.createRole()` 명령을 이용하며, 생성된 사용자 역할에 새로운 액션을 추가하거나 제거하는 작업은 `db.grantPrivilegesToRole()` 명령과 `db.revokePrivilegesFromRole()` 명령으로 가능합니다.

### 사용자 정의 역할을 이용해 계정 생성하기

아래는 개발용 계정을 만드는 예제입니다.

우선 역할을 만들어줍니다.

```js
use admin
db.createRole({
  role: "DevOps",
  privileges: [],
  roles: [
    { role: "readWrite", db: "test01" }
  ]
})
```

개발용 계정은 DB와 컬렉션 정보를 읽을 수 있어야 하며, 새로운 컬렉션 및 도큐먼트를 생성할 수 있어야 합니다. 그래서 readWrite 역할을 계정이 접속하여 사용하고자 하는 DB에 부여했습니다.

```js
db.createUser({
  user: "DevOps",
  pwd: passwordPrompt(),
  roles: [ { role: "DevOps", db: "admin" } ]
})
```

DevOps라는 사용자 정의 역할을 이용해 사용자를 생성했습니다. 역할을 admin 데이터베이스에서 만들었으므로 `roles`에도 `db: "admin"`으로 적어야 합니다. 다른 데이터베이스 이름을 적으면 그 데이터베이스의 같은 이름 역할을 찾기 때문에 의도한 권한이 붙지 않습니다.

`passwordPrompt()`를 이용하면 직접 패스워드를 입력할 수 있는 보안 Prompt를 사용할 수 있으며, 입력하는 암호가 화면에 노출되지 않습니다. 다만 이 함수를 써도 비밀번호는 서버로 평문 전송되므로, TLS 전송 암호화를 함께 적용해야 합니다.

이렇게 생성된 계정으로 client tool에서는 계정, 패스워드, 인증DB 정보만 가지고 접근할 수 있고, 터미널에서는 아래와 같은 명령으로 접속합니다.

```bash
mongosh --username "DevOps" --authenticationDatabase "admin"
```

`--password`를 생략하면 mongosh가 패스워드를 물어보고, 입력하는 동안 화면에 표시하지 않습니다.

MongoDB 계정과 역할을 설정하는 방법을 알아보았습니다.

#### 참고 자료

도서: Real MongoDB

MongoDB Manual: [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/ "MongoDB Manual")
