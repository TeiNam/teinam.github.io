---
date: 2021-04-13 11:30:49 +0900
title: "MongoDB의 인증과 권한"
category: mongodb
excerpt: "MongoDB의 인증과 권한 MongoDB 클러스터에서 권한을 활성화하면, 인증이 적용되고 사용자는 역할에 따라 권한이 부여된 작업만 가능합니다. MongoDB의 인증 매커니즘 커뮤니티 버전은 SCRAM(SCRAM-SHA-1, SCRAM-SHA-256)과 x.509 인증서 인증을…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — SCRAM/x.509 인증과 내장 role 목록(read, readWrite, dbAdmin, clusterManager, root 등), `security.authorization` 활성화 방법은 현재도 유효합니다. 다만 5.3 부터 클러스터 내부 인증에는 SCRAM-SHA-1 을 쓸 수 없고 SCRAM-SHA-256 만 지원됩니다.

## MongoDB의 인증과 권한

MongoDB 클러스터에서 권한을 활성화하면, 인증이 적용되고 사용자는 역할에 따라 권한이 부여된 작업만 가능합니다.

### MongoDB의 인증 메커니즘

커뮤니티 버전은 SCRAM(Salted Challenge Response Authentication Mechanism, SCRAM-SHA-1, SCRAM-SHA-256)과 x.509 인증서 인증을 지원합니다. SCRAM이 디폴트로 사용되며 SCRAM-SHA-256는 MongoDB 4.0 이상 버전에서 지원합니다. MongoDB의 DB 사용자를 만들고 패스워드를 생성하면 클라이언트에서 `ID/password`를 통해 접속이 가능한데 이것이 SCRAM을 이용해 로그인하는 방법입니다. x.509 디지털 인증서는 x.509 공개키 기반(PKI) 표준을 사용해 공개 키가 제출자의 것인지 검증합니다.

엔터프라이즈 에디션에는 Kerberos 인증과 LDAP 인증을 지원합니다. 하지만 Percona MongoDB(Percona Server for MongoDB)에서는 Kerberos와 LDAP 인증을 무료로 사용할 수 있습니다.

### 권한

모든 데이터베이스에서 사용자에게 용도에 맞는 권한을 부여할 수 있는 기능이 있으므로, 대부분 grant, revoke 명령을 통해 이미 생성되어 있는 역할을 권한으로 부여하고, 회수할 수 있습니다. MongoDB 역시 권한을 부여할 때 미리 만들어진 역할을 부여할 수도 있고, 사용자가 직접 역할을 만들어서 권한을 부여할 수도 있습니다. MongoDB를 설치하면 미리 만들어져 있는 몇 가지 역할이 있습니다.

- **read** : 모든 비시스템 컬렉션 및 `system.indexes`, `system.js`, `system.namespace`와 같은 시스템 컬렉션의 데이터를 읽을 수 있는 권한
- **readWrite**: 동일한 권한을 부여하면, 모든 비시스템 컬렉션 및 `system.js` 컬렉션의 데이터를 수정할 수 있는 권한
- **dbAdmin**: 스키마 관련 작업, 인덱싱, 통계 수집과 같은 관리 작업에 대한 권한. 사용자와 역할 관리에 대한 권한은 없음
- **userAdmin**: 현재 데이터베이스에서 역할과 사용자를 생성하고 수정
- **dbOwner**: `readWrite`, `dbAdmin`, `userAdmin` 역할이 부여한 권한을 모두 포함
- **clusterManager**: 클러스터상에서 관리와 모니터링 작업을 할 수 있는 권한
- **clusterMonitor**: MongoDB 클라우드 매니저와 옵스 매니저 모니터링 에이전트 같은 모니터링 도구에 대한 읽기 전용 접근 권한
- **hostManager**: 서버를 모니터링하고 관리할 수 있는 권한
- **clusterAdmin**: `clusterManager`, `clusterMonitor`, `hostManager` 역할이 부여한 권한과 `dropDatabase` 권한을 포함
- **backup**: MongoDB 클라우드 매니저 백업 에이전트 혹은 옵스 매니저 백업 에이전트를 사용하는 권한이나, `mongodump`를 사용해 `mongod` 인스턴스를 백업하는 권한
- **restore**: `system.profile` 컬렉션 데이터를 포함하지 않는 백업으로부터 데이터를 복원하는데 필요한 권한
- **readAnyDatabase**: local과 config를 제외한 모든 데이터베이스에서 `read`와 동일한 권한과 클러스터 전체에 대한 `listDatabases` 권한을 가짐
- **readWriteAnyDatabase**: local과 config를 제외한 모든 데이터베이스에서 `readWrite`와 동일한 권한과 클러스터 전체에 대한 `listDatabases` 권한을 가짐
- **userAdminAnyDatabase**: local과 config를 제외한 모든 데이터베이스에서 `userAdmin`과 동일한 권한을 가진다. (사실상 superuser)
- **dbAdminAnyDatabase**: local과 config를 제외한 모든 데이터베이스에서 `dbAdmin`과 동일한 권한을 가지며 클러스터 전체에 대한 `listDatabases` 권한을 가짐
- **root**: 모든 리소스에 대한 접근 권한을 가짐

MongoDB의 인증과 권한을 기본적으로 활성화되어 있지 않습니다. `mongod` 명령에 `--auth` 옵션을 사용하거나 MongoDB의 구성파일(`/etc/mongod.conf`)의 `security.authorization` 설정에 `enabled` 값을 설정해 활성화해야 합니다.

`createUser` 명령 사용 시 권한을 부여하는 방법은 아래 포스팅을 참고하시기 바랍니다.

<!-- TODO: 링크 추가 - MongoDB 4.2 admin 계정 설정하기 -->
MongoDB 4.2 admin 계정 설정하기

MongoDB admin 4.2 계정 설정하기 MongoDB 아틀라스 배포가 아닌, Linux서버에 직접 패키지를 올려 설치하게 되면, Authentication이 없습니다. 저 역시 CentOS7에 커뮤니티를 올려서 사용하고 있어서, 처음에는 /etc/mongo.conf 안의 Bind IP 설정이 허용하는대로 모든 접속을 허용합니다....

<!-- TODO: 링크 추가 - MongoDB의 일반 계정 생성 -->
MongoDB의 일반 계정 생성

MongoDB의 일반 계정 생성 다른 데이터베이스도 그렇고, 서버를 사용하기 위한 OS에서도 그렇고 가장 기본이 되는 보안중에 하나가 유저계정과 패스워드 입니다. MariaDB나 PostgreSQL도 마찬가지 이지만, 기본적으로 DB를 생성하면 사용할 계정을 생성해 줘야합니다. MongoDB의 경우 보안을...

MongoDB의 replica set을 구성 할 때에는 복제 구성을 먼저 진행한 후에 인증과 권한을 생성하는 것이 좋습니다. 복제셋을 구성한 후에는 cluster에 관련된 권한을 줘야 합니다.

#### 참고 자료

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")

도서: MongoDB 완벽가이드
