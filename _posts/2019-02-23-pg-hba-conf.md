---
date: 2019-02-23 02:16:00 +0900
title: "pg_hba.conf"
category: postgresql
excerpt: "pg_hba.conf – PostgreSQL의 인증관련 설정 파일 ( HBA : host-based authentication 호스트 기반의 인증 약어 ) 1) $PGDATA 에 존재. (클러스터홈) 2) PostgreSQL의 pg_hba.conf 파일을 통해 외부접근에 대한 처리…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 인증 방식 목록에 현재 존재하지 않는 crypt·krb4·krb5 가 있고, 권장 방식인 scram-sha-256 이 빠져 있다. md5 는 공식적으로 deprecated 상태이며 향후 제거 예정이다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## pg_hba.conf

PostgreSQL의 인증 관련 설정 파일 (HBA: host-based authentication 호스트 기반 인증 약어)

1. `$PGDATA` 디렉토리에 있습니다 (클러스터 홈).
2. `pg_hba.conf`로 외부 접근을 제어하기보다는 배제하는 것이 좋습니다. `pg_hba.conf`로 외부 접근을 허용하면 PostgreSQL 인증 처리 부하로 성능이 저하될 수 있으므로, OS 수준의 iptables나 앞단의 방화벽, 보안 장비에서 통제해야 합니다.
3. 접근 호스트와 데이터 전송 방식, 암호화 전송 방식을 설정합니다.
4. 계정 정보는 PostgreSQL 카탈로그 테이블 `pg_user`에서 관리하므로 계정 권한, 패스워드 변경은 실시간으로 적용되지만, 클라이언트 접근 방식이나 암호 전달 방식은 `pg_ctl reload` 또는 `pg_ctl restart` 명령으로 `pg_hba.conf`를 다시 로드해야 합니다. `restart`는 불편하지만, 불법 접근을 빠르게 차단하여 PostgreSQL 서버 부담을 줄이고 성능을 유지하기 위한 방법입니다.

## pg_hba.conf 내용

```conf
## TYPE DATABASE USER ADDRESS METHOD
## IPv4 local connections:
host all all 127.0.0.1/32 md5
## IPv6 local connections:
host all all ::1/128 md5
## Allow replication connections from localhost, by a user with the
## replication privilege.
#host replication enterprisedb 127.0.0.1/32 md5
#host replication enterprisedb ::1/128 md5
```

## 환경설정

### 1. Host Type

Host Type은 접근자의 접근 위치와 통신 암호화를 설정합니다. `local`, `host`, `hostssl`, `hostnossl`을 지원합니다.

`local`은 localhost로 오인할 수 있지만, Unix Domain Socket을 통한 접속을 의미하므로 주의하세요.

`hostssl`은 SSL 인증서 기반 암호화 통신만 지원하며 localhost, 127.0.0.1 같은 TCP/IP 접속에 해당합니다. `hostnossl`은 SSL 접속이 불가능하며 TCP/IP 통신을 지원합니다.

`host`나 `hostssl`로 설정한 상태에서 SSL 기능을 사용하려면 PostgreSQL 컴파일 시 `--with-openssl` 옵션을 지정해야 하며, `postgresql.conf`에 `ssl=true`로 설정해야 합니다.

### 2. Database Name

특정 데이터베이스 접속을 제한할 수 있으며 쉼표로 여러 DB 접근을 제어할 수 있습니다. 모든 DB 접근을 허용하려면 `all`로 설정하면 됩니다. 설정할 DB가 수십 개라면 `@dblist.txt` 형식으로 설정하고 `dblist.txt`를 `$PGDATA` 디렉토리에 넣으면 됩니다.

### 3. User Name

계정 설정은 쉼표로 구분할 수 있으며, `@파일명` 형식으로 파일을 만들어 처리할 수도 있습니다. PostgreSQL 계정 그룹 카탈로그 테이블 `pg_group` 또는 `create_group` 명령으로 그룹을 만들어 계정들을 하위(SYSID)로 묶었을 때는 `+` 기호를 붙인 그룹명으로 설정하면 해당 그룹의 모든 접근이 가능합니다.

### 4. CIDR-ADDRESS or IP-Mask

IPv4 CIDR로 해당 C Class 전체 접근을 허용할 경우: `xxx.xxx.xxx.0/24`  
특정 IP 접근을 허용할 경우: `xxx.xxx.xxx.xxx/32`

### 5. Authentication Method

계정 패스워드를 서버로 어떻게 전송할지 정하는 설정입니다. PostgreSQL Server와 Client 접속 시 Client가 접속하면 `pg_hba.conf`를 검색해 해당 접속의 접근 허용을 확인하고, 확인되면 Auth.Method에 설정된 암호화 방식으로 패스워드를 전송하라는 응답 메시지를 보내 Client가 Server로 로그인하는 방식입니다.

- `trust`: 패스워드 없이 접근 가능
- `reject`: 거부
- `md5`: 패스워드를 md5로 암호화해서 전송
- `crypt`: crypt로 암호화해서 전송 (PostgreSQL 7.2 이후 사용 안 함, 이전 버전 호환용)
- `password`: 텍스트로 패스워드 전송
- `krb4`, `krb5`: Kerberos V4, V5 지원
- `ident`: 접속 클라이언트 OS 사용자 이름 확인
- `pam`: PAM(Pluggable Authentication Modules) 서비스를 사용한 인증

## 설정 예제

```conf
## 로컬 시스템상의 모든 사용자가 임의의 데이터베이스에
## 임의의 데이터베이스 사용자명으로 Unix 도메인 소켓을 사용해 접속하는 것을 허가
## (로컬 접속에서는 디폴트).
##
## TYPE DATABASE USER CIDR-ADDRESS METHOD
local all all trust
```

```conf
## 로컬 loopback의 TCP/IP 접속을 사용하는 것은 위와 같다.
##
## TYPE DATABASE USER CIDR-ADDRESS METHOD
host all all 127.0.0.1/32 trust
```

```conf
## 분리된 netmask 열을 사용하고 있는 것을 제외하고 위와 같다.
## TYPE DATABASE USER IP-ADDRESS IP-MASK METHOD
host all all 127.0.0.1 255.255.255.255 trust
```

```conf
## IP주소 192.168.93.x를 가지는 모든 호스트의 모든 사용자가,
## ident가 그 접속에 대해 보고하는 사용자명(전형적으로는 Unix 사용자명)으로
## 데이터베이스 "postgres"에 접속하는 것을 허가.
##
## TYPE DATABASE USER CIDR-ADDRESS METHOD
host postgres all 192.168.93.0/24 ident sameuser
```

```conf
## 사용자의 패스워드가 올바르게 입력되었을 경우,
## 호스트 192.168.12.10부터의 사용자가 데이터베이스 "postgres"에 접속하는 것을 허가
##
## TYPE DATABASE USER CIDR-ADDRESS METHOD
host postgres all 192.168.12.10/32 md5
```

```conf
## 선행하는 "host"행이 없으면, 이 2행에 의해 192.168.54.1으로 접속 시도는
## 모두 거부(이 항목이 최초로 일치되기 때문에).
## 다만, 인터넷상의 다른 모든 장소로부터의 Kerberos 5 접속은 허가.
## 제로 마스크는, 호스트 IP주소의 비트를 고려하지 않고
## 어느 호스트라도 조합할 수 있는 것을 의미합니다.
##
## TYPE DATABASE USER CIDR-ADDRESS METHOD
host all all 192.168.54.1/32 reject
host all all 0.0.0.0/0 krb5
```

```conf
## 192.168.x.x 호스트로부터의 사용자가, ident 검사를 통과하는 경우,
## 어느 데이터베이스라도 접속을 허가. 만약, 예를 들면, ident가 "bryanh"라고 인정해
## "bryanh"가 PostgreSQL의 사용자 "guest1"로서
## 접속 요구를 내는 경우, "bryanh"는 "guest1"로 접속이 허가된다고 합니다.
## 맵 "omicron"에 대한 기재사항이 pg_ident.conf에 있으면 접속을 허가.
##
## TYPE DATABASE USER CIDR-ADDRESS METHOD
host all all 192.168.0.0/16 ident omicron
```

```conf
## 로컬 접속에 대해서, 이하의 단 3행 밖에 기재가 없는 경우, 로컬 사용자는
## 자신의 데이터베이스(데이터베이스 사용자명과 같은 이름의 데이터베이스)에게만 접속 허가.
## 다만 관리자와 롤 "support"의 멤버는 모든 데이터베이스에 접속 가능.
## $PGDATA/admins 파일은 관리자의 리스트를 포함한다.
## 모든 경우에 패스워드가 필요.
##
## TYPE DATABASE USER CIDR-ADDRESS METHOD
local sameuser all md5
local all @admins md5
local all +support md5
```

```conf
## 위의 마지막 2행은 1개의 행으로 정리하는 것이 가능.
local all @admins,+support md5
```

```conf
## 데이터베이스의 열에는 리스트나 파일명도 사용할 수 있지만, 그룹은 사용할 수 없다.
local db1,db2,@demodbs all md5
```
