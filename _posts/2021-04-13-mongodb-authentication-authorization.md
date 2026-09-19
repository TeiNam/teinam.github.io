---
date: 2021-04-13 11:30:49 +0900
title: "MongoDB의 인증과 권한"
category: mongodb
excerpt: "MongoDB 클러스터에서 권한을 활성화하면 인증이 적용되고 사용자는 역할에 따라 권한이 부여된 작업만 가능합니다. Community 버전은 SCRAM과 x.509를 지원하고, Enterprise 버전은 LDAP, Kerberos, OIDC를 추가로 지원합니다."
updated: 2026-09-20
---

MongoDB 클러스터에서 권한을 활성화하면 인증이 적용되고 사용자는 역할에 따라 권한이 부여된 작업만 가능합니다.

## MongoDB의 인증 메커니즘

Community 버전은 **SCRAM**(Salted Challenge Response Authentication Mechanism)과 **x.509** 인증서 인증을 지원합니다.

- **SCRAM**: MongoDB의 기본 인증 메커니즘입니다. SCRAM-SHA-1과 SCRAM-SHA-256 두 가지 변형을 지원하며, MongoDB 사용자를 만들고 패스워드를 생성하면 클라이언트에서 ID/password를 통해 접속할 수 있습니다. SCRAM-SHA-256은 서버 측 패스워드 해싱을 요구하고 더 강력한 보안을 제공합니다.

- **x.509**: 디지털 인증서를 사용한 인증입니다. x.509 공개키 기반(PKI) 표준을 사용해 공개 키가 제출자의 것인지 검증하며, 클라이언트 인증과 레플리카 셋·샤드 클러스터의 내부 인증 모두에 사용할 수 있습니다. TLS/SSL 연결이 필요합니다.

Enterprise 버전은 추가로 **Kerberos**, **LDAP**, **OpenID Connect(OIDC)** 인증을 지원합니다.

- **Kerberos**: 대규모 클라이언트/서버 시스템을 위한 업계 표준 프로토콜로, 티켓이라는 단기 토큰을 사용합니다.
- **LDAP**: Lightweight Directory Access Protocol 서비스를 통한 프록시 인증입니다. MongoDB 8.0부터 deprecated 되었으며 향후 버전에서 제거될 예정입니다.
- **OIDC**: OAuth2 위에 구축된 인증 레이어로, MongoDB와 서드파티 IdP 간 싱글 사인온을 가능하게 합니다.

> **NOTE** — Percona Server for MongoDB는 Kerberos와 LDAP 인증을 무료로 제공합니다.

## 권한

MongoDB는 권한을 부여할 때 미리 만들어진 내장 역할(built-in roles)을 부여하거나, 사용자가 직접 역할을 만들어서 권한을 부여할 수 있습니다. 역할은 정의된 데이터베이스에 적용되며 컬렉션 수준까지 세밀한 권한을 부여할 수 있습니다.

### 데이터베이스 단위 역할 (모든 데이터베이스에 부여 가능)

- **read**: 모든 비시스템 컬렉션과 특정 시스템 컬렉션의 데이터를 읽을 수 있습니다.
- **readWrite**: 모든 비시스템 컬렉션과 특정 시스템 컬렉션의 데이터를 읽고 수정할 수 있습니다.
- **dbAdmin**: 스키마 관련 작업, 인덱싱, 통계 수집 같은 데이터베이스 관리 작업을 수행할 수 있습니다. 사용자와 역할 관리 권한은 포함하지 않습니다.
- **userAdmin**: 현재 데이터베이스에서 역할과 사용자를 생성하고 수정할 수 있습니다. `admin` 데이터베이스에 부여하면 사실상 슈퍼유저 권한을 갖게 됩니다.
- **dbOwner**: `readWrite`, `dbAdmin`, `userAdmin` 역할의 권한을 모두 포함합니다.

### 클러스터 관리 역할 (admin 데이터베이스에만 부여 가능)

- **clusterManager**: 레플리카 셋과 샤딩 설정을 포함한 클러스터 관리 및 모니터링 작업을 수행할 수 있습니다.
- **clusterMonitor**: MongoDB 모니터링 도구를 위한 클러스터 읽기 전용 접근 권한을 제공합니다.
- **hostManager**: 서버를 모니터링하고 관리할 수 있는 권한을 제공합니다.
- **clusterAdmin**: `clusterManager`, `clusterMonitor`, `hostManager` 역할의 권한과 `dropDatabase` 권한을 포함합니다.

### 백업 및 복원 역할 (admin 데이터베이스에만 부여 가능)

- **backup**: `mongodump`를 사용해 인스턴스를 백업하거나 백업 에이전트를 사용하는 데 필요한 클러스터 전체 읽기 권한을 제공합니다.
- **restore**: 백업으로부터 데이터를 복원하는 데 필요한 클러스터 전체 쓰기 권한을 제공합니다.

### 전체 데이터베이스 역할 (admin 데이터베이스에만 부여 가능)

- **readAnyDatabase**: `local`과 `config`를 제외한 모든 데이터베이스에서 `read` 권한과 클러스터 전체 `listDatabases` 권한을 갖습니다.
- **readWriteAnyDatabase**: `local`과 `config`를 제외한 모든 데이터베이스에서 `readWrite` 권한과 클러스터 전체 `listDatabases` 권한을 갖습니다.
- **userAdminAnyDatabase**: `local`과 `config`를 제외한 모든 데이터베이스에서 `userAdmin` 권한을 갖습니다. 자신에게 모든 권한을 부여할 수 있어 사실상 슈퍼유저입니다.
- **dbAdminAnyDatabase**: `local`과 `config`를 제외한 모든 데이터베이스에서 `dbAdmin` 권한과 클러스터 전체 `listDatabases` 권한을 갖습니다.

### 슈퍼유저 역할 (admin 데이터베이스에만 부여 가능)

- **root**: 위의 모든 역할이 제공하는 권한을 결합한 것으로, 모든 리소스에 대한 접근 권한을 갖습니다.
- **__system**: 내부용 역할로 모든 리소스에 대한 모든 작업을 수행할 수 있습니다. 사용자에게 부여하지 마십시오.

## 접근 제어 활성화

MongoDB는 기본적으로 접근 제어가 비활성화되어 있습니다. 다음 방법 중 하나로 활성화할 수 있습니다.

**명령줄 옵션:**

```bash
mongod --auth --dbpath /var/lib/mongodb
```

**설정 파일 (권장):**

`/etc/mongod.conf` 파일에 다음을 추가합니다.

```yaml
security:
  authorization: enabled
```

설정 후 `mongod`를 재시작하면 모든 클라이언트가 인증을 거쳐야 합니다.

### 레플리카 셋과 샤드 클러스터

레플리카 셋이나 샤드 클러스터에서는 **내부 인증**(internal authentication)을 추가로 설정해야 합니다. 멤버들이 서로 인증할 수 있도록 keyFile 또는 x.509 인증서를 사용합니다. 내부 인증을 활성화하면 클라이언트 접근 제어도 자동으로 활성화됩니다.

**keyFile 예제:**

```yaml
security:
  keyFile: /path/to/keyfile
replication:
  replSetName: myReplSet
```

레플리카 셋 구성 시에는 복제 구성을 먼저 진행한 후 인증과 권한을 설정하는 것이 좋습니다. 복제셋 구성 후에는 클러스터 관련 역할(`clusterManager`, `clusterMonitor` 등)을 적절히 부여해야 합니다.

### Localhost Exception

접근 제어를 활성화한 직후, 사용자가 하나도 없으면 **localhost exception**이 적용됩니다. 이는 로컬호스트 인터페이스를 통해 연결했을 때 첫 번째 사용자를 생성할 수 있는 제한된 접근을 허용합니다.

- `mongod` 인스턴스에 사용자나 역할이 하나도 없을 때만 적용됩니다.
- localhost(루프백 인터페이스)에서의 연결만 허용합니다.
- 첫 번째 사용자나 역할을 생성하면 exception이 즉시 닫힙니다.
- 샤드 클러스터에서는 각 샤드와 `mongos`에 개별적으로 적용되므로, `mongos`를 통해 사용자를 생성해도 각 샤드의 exception은 여전히 열려 있습니다.

첫 번째 사용자는 `admin` 데이터베이스에 `userAdmin` 또는 `userAdminAnyDatabase` 권한으로 생성해야 합니다.

```javascript
use admin
db.createUser({
  user: "myUserAdmin",
  pwd: passwordPrompt(),
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})
```

사용자 생성 및 권한 부여에 대한 자세한 내용은 [MongoDB의 일반 계정 생성](/writing/mongodb-create-user/) 포스트를 참고하세요.

## 참고 자료

- [MongoDB Manual - Authentication](https://www.mongodb.com/docs/manual/core/authentication/)
- [MongoDB Manual - Authorization](https://www.mongodb.com/docs/manual/core/authorization/)
- [MongoDB Manual - Built-In Roles](https://www.mongodb.com/docs/manual/reference/built-in-roles/)
- [MongoDB Manual - Enable Access Control](https://www.mongodb.com/docs/manual/tutorial/enable-authentication/)
- 도서: MongoDB 완벽가이드
