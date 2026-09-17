---
date: 2021-02-24 11:43:16 +0900
title: "MongoDB의 일반 계정 생성"
category: mongodb
excerpt: "MongoDB의 일반 계정 생성 다른 데이터베이스도 그렇고, 서버를 사용하기 위한 OS에서도 그렇고 가장 기본이 되는 보안중에 하나가 유저계정과 패스워드 입니다. MariaDB나 PostgreSQL도 마찬가지 이지만, 기본적으로 DB를 생성하면 사용할 계정을 생성해 줘야합니다. M…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — db.createUser()·db.createRole()·passwordPrompt() 와 인증 데이터베이스 개념은 현재도 동일합니다. 다만 전제 버전으로 잡은 4.2/4.4 는 EOL 이고 예제 프롬프트 `mongo>` 는 6.0 에서 제거된 레거시 셸이므로 `mongosh` 로 바꿔 실행해야 합니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB의 일반 계정 생성

> **전제조건:** MongoDB 4.2+ 설치 완료, mongod 서비스 구동 중, admin 계정 설정 완료 (미설정 시 [MongoDB 4.2 admin 계정 설정하기](/writing/mongodb-42-admin-account/ "MongoDB 4.2 admin 계정 설정하기") 참조).

다른 데이터베이스도 그렇고, 서버를 사용하기 위한 OS에서도 그렇고 가장 기본이 되는 보안 중 하나가 사용자 계정과 패스워드입니다. MariaDB나 PostgreSQL도 마찬가지지만, 기본적으로 DB를 생성하면 사용할 계정을 생성해야 합니다.

MongoDB의 경우 보안을 위해 가장 먼저 해야 하는 것이 Admin 계정을 생성하는 것인데, Admin 계정을 생성하지 않고 기본 포트인 27017 포트를 이용해 DB를 사용한다면 각종 해킹 위험에 노출되어 있는 상태라고 볼 수 있습니다.

MongoDB 서버에 포트만 열려 있으면, 계정 정보를 넣지 않아도 admin 권한으로 로그인할 수 있기 때문인데, 해커가 들어와서 DB 데이터를 지우고 돈을 요구하는 경우도 발생합니다.

일반 계정을 생성하기 위해서는 admin 계정을 먼저 생성해야 하는데, admin 계정을 생성하고 계정 로그인을 적용하는 방법은 [MongoDB 4.2 admin 계정 설정하기](/writing/mongodb-42-admin-account/ "MongoDB 4.2 admin 계정 설정하기")에서 설명했습니다.

admin 계정을 활성화한 후에 일반 계정을 생성하면 됩니다.

### MongoDB의 Authentication

```yaml
security:
  authorization: enabled
```

mongod.conf 파일에 해당 부분을 활성화하면 MongoDB 서버 간 통신을 위한 내부 인증뿐만 아니라 사용자의 로그인을 위한 인증까지 모두 활성화됩니다.

해당 기능을 활성화한 상태에서 MongoDB를 구동하게 되면 단순히 OS 셸에서 mongo 명령어로 접속했을 때 MongoDB로 접속은 가능하나, 내부에 있는 데이터 확인이나 모든 use나 로그인 관련 명령어를 제외하고는 동작하지 않게 됩니다.

이 부분은 나중에 shard cluster의 보안 인증에서 매우 중요한 부분이니 나중에 다시 다룰 예정입니다.

MongoDB의 자체적인 사용자 인증은 다른 DBMS와 같이 ID/Password 기반 인증을 사용하는데, MongoDB 서버는 인증 데이터베이스 정보를 추가로 요구합니다. 사용자를 생성할 때 반드시 특정 데이터베이스로 이동해서 생성해야 하는데, 이때 데이터베이스를 인증 데이터베이스(Authentication Database)라고 합니다. 인증 데이터베이스는 사용자 계정으로 로그인할 때 인증을 위해서만 필요하기 때문에 하나의 데이터베이스만 존재할 수 있습니다.

### 계정 생성

일반적인 계정 생성 명령어는 아래와 같습니다.

```js
mongo> use admin
mongo> db.createUser({ user: "testuser", pwd: passwordPrompt(), roles: [ "dbAdmin" ] })
```

계정을 생성하기 위해 use admin 명령으로 admin DB로 이동했는데, 이 admin db가 인증 데이터베이스가 되는 것입니다. 꼭 admin 데이터베이스를 사용하지 않고 자신이 생성한 데이터베이스를 사용해도 됩니다.

MongoDB 서버의 사용자 계정은 인증 데이터가 달라지면 다른 계정으로 인식합니다. 아래 예제와 같이 2개의 사용자 계정을 생성했다면 사용자 계정과 패스워드가 같더라도, MongoDB는 다른 계정으로 인식합니다.

```js
> use test01
> db.createUser({ user: "test01", pwd: "mypassword", roles: [ "readWrite" ]})
```

```js
> use admin
> db.createUser({ user: "test01", pwd: "mypassword", roles: [ "readWrite" ]})
```

두 계정은 사용자 계정과 패스워드가 같지만, 계정 인증 데이터베이스 정보가 다르기 때문에 다른 계정으로 인식하게 됩니다.

### MongoDB의 역할(Role)

일반 계정은 admin 권한을 가져서는 안 됩니다. 단순히 데이터를 읽어가는 read 권한이나, 개발에 필요한 readWrite 권한만 부여하거나 각 사용자 용도에 맞는 권한을 부여해야 합니다.

MongoDB는 역할(role) 기반의 권한 부여 방식을 사용하는데, 이 역할(role)이라는 것은 특정 리소스의 액션을 미리 매핑해 둔 것입니다.

MongoDB 매뉴얼([https://docs.mongodb.com/manual/reference/privilege-actions/index.html](https://docs.mongodb.com/manual/reference/privilege-actions/index.html "privileges action 매뉴얼"))을 보면 어떤 액션에 어떤 명령어들이 포함되어 있는지 확인할 수 있습니다.

MongoDB의 명령어는 하나의 액션에 종속되어 있지 않기 때문에 주의해야 합니다. 예를 들면 `aggregation` 명령의 경우 bypassDocumentValidation과 FIND, 그리고 INSERT 액션이 필요합니다.

MongoDB의 역할(role)은 미리 정의된 액션을 묶어서 하나의 그룹으로 만든 것입니다.

MongoDB에는 기본적으로 내장되어 있는 역할(role)이 있으며, 사용자가 생성하는 것도 가능합니다. MongoDB가 미리 정의해 둔 기본적인 역할이 다수 존재하고, 버전별로 조금씩 다르기 때문에 해당 버전의 매뉴얼(<https://docs.mongodb.com/manual/reference/built-in-roles/index.html>)을 참고하시기 바랍니다.

4.4 버전에서는 read, readWrite, dbAdmin, dbOwner, userAdmin, clusterAdmin, clusterManager 등의 role을 제공합니다.

### 새로운 사용자 정의 역할 만들기

아래는 새로운 역할(role)을 만드는 명령입니다.

```js
db.createRole(
  {
  role: "serviceDev",
  privileges: [],
  roles: [
    { role: "readWrite", db: "test01"}
  ]
  }
)
```

역할을 만들 때 두 가지 방법이 있습니다. 위 예제처럼 `roles` 필드에 기존 역할을 맵핑하는 방법이 있고, 아래처럼 `privileges` 필드에 액션을 직접 부여해서 만드는 방식이 있습니다.

```js
db.createRole(
  {
  role: "serviceDev",
  privileges: [
          { resource: { db: "test01", collection: "" }, actions: [ "find", "update", "insert", "remove" ]},
  roles: []
  }
)
```

역할은 `db.createRole()` 명령을 이용하며, 생성된 사용자 역할에 새로운 액션을 추가하거나 제거하는 작업은 `db.grantPrivilegesToRole()` 명령과 `db.revokePrivilegesFromRole()` 명령으로 가능합니다.

### 사용자 정의 역할을 이용해 계정 생성하기

아래는 개발용 계정을 만드는 예제입니다.

우선 Role을 만들어줍니다.

```js
mongo> use admin
mongo> db.createRole(
  {
  role: "DevOps",
  privileges: [],
  roles: [
    { role: "readWrite", db: "test01"}
  ]
  }
)
```

개발용 계정은 DB와 컬렉션 정보를 읽을 수 있어야 하며, 새로운 컬렉션 및 도큐먼트를 생성할 수 있어야 합니다. 그래서 readWrite role을 계정이 접속하여 사용하고자 하는 DB에 부여했습니다.

```js
db.createUser(
  {
    user: "DevOps",
    pwd: passwordPrompt(),                        // or cleartext password
    roles: [ {role: "DevOps", db: "test01"} ]
  }
)
```

DevOps라는 사용자 정의 역할을 이용해 사용자를 생성했습니다. passwordPrompt()를 이용하면 직접 패스워드를 입력할 수 있는 보안 Prompt를 사용할 수 있으며, 입력하는 암호가 노출되지 않습니다.

이렇게 생성된 계정으로 client tool에서는 계정, 패스워드, 인증DB 정보만 가지고 접근할 수 있고, 터미널에서는 아래와 같은 명령으로 접속합니다.

```bash
$ mongo -u "DevOps" --authenticationDatabase "admin"
Enter password:
```

MongoDB 계정과 역할을 설정하는 방법을 알아보았습니다.

#### 참고 자료

도서: Real MongoDB

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
