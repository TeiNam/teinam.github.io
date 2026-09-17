---
date: 2019-02-19 10:45:04 +0900
title: "오픈스택 수동 설치 실습 #.6"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.6 – Keystone 인증 설치 사용자가 대시보드로 오픈스택을 사용할 때 반드시 거쳐야 할 과정이 있는데 바로 인증입니다. 오픈스택에서 Keystone은 모든 서비스를 관장하는 위치에 있습니다. Keystone은 타인이나 해커에게서 시스템을 안전하게…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Keystone 이 인증·서비스 카탈로그를 담당하는 역할과 DB 생성 후 db_sync 하는 흐름은 유지되지만, Rocky·CentOS 7 패키지를 전제로 한 명령과 설정 경로는 현재 릴리스(2026.1)와 어긋납니다.

![](/assets/img/wp/2019/02/997A91455C41EF960A289B.jpg)

## 오픈스택 수동 설치 실습 #.6 – Keystone 인증 설치

## 전제조건

- OpenStack Controller 노드 구성 완료
- PostgreSQL 데이터베이스 설치 및 실행 중
- `controller` 호스트명이 `/etc/hosts`에 등록되어 있어야 함

사용자가 대시보드로 오픈스택을 사용할 때 반드시 거쳐야 할 과정이 있는데 바로 인증입니다. 오픈스택에서 Keystone은 모든 서비스를 관장하는 위치에 있습니다. Keystone은 타인이나 해커에게서 시스템을 안전하게 보호하고 사용자 등록, 삭제, 권한 관리, 사용자가 접근할 수 있는 서비스 포인트 관리까지 전반적인 사용자 인증을 관리합니다.

![](/assets/img/wp/2019/02/9934F7475C41F0842AB98A.jpg)

Keystone 위치를 보면 서비스 백단에서 오픈스택의 모든 서비스를 관장하고 있습니다.

## Keystone 설치

데이터베이스에 접속하여 keystone 데이터베이스 및 유저를 생성합니다. 이 예제에서는 데이터베이스 계정의 password를 user와 동일하게 설정했습니다.

```bash
# su - postgres
$ psql
```

keystone 데이터베이스 및 유저 생성

```sql
postgres=# create role keystone with login;
postgres=# create database keystone;
postgres=# grant ALL PRIVILEGES ON DATABASE keystone TO keystone;
postgres=# alter user keystone with encrypted password 'keystone';
```

keystone 계정으로 데이터베이스 접속이 되는지 확인합니다.

![](/assets/img/wp/2019/02/992847345C41F2510BF463.png)

다시 root로 돌아와서 keystone을 설치합니다.

```bash
# yum -y install openstack-keystone httpd mod_wsgi
```

keystone.conf 파일 수정

```bash
# vi /etc/keystone/keystone.conf

[database]
# ...
connection = postgresql://keystone:keystone@controller/keystone

[token]
# ...
provider = fernet
```

지금부터는 `tail -f /var/log/keystone/keystone.log`로 keystone 인증 과정을 확인합니다. 로그에 에러 메시지가 나타난다면 어딘가 잘못된 부분이 있는 것입니다. 해당 에러를 확인하고, 에러 메시지가 나오지 않게 조치한 후 진행해야 합니다.

Keystone 데이터베이스 인증

```bash
# su -s /bin/sh -c "keystone-manage db_sync" keystone
```

Fernet 키 저장소 초기화

```bash
# keystone-manage fernet_setup --keystone-user keystone --keystone-group keystone
# keystone-manage credential_setup --keystone-user keystone --keystone-group keystone
```

인증서비스 bootstrap

> **주의:** `<ADMIN_PASS>` 부분에 admin 계정의 패스워드를 입력합니다.

```bash
# keystone-manage bootstrap --bootstrap-password <ADMIN_PASS> \
  --bootstrap-admin-url http://controller:5000/v3/ \
  --bootstrap-internal-url http://controller:5000/v3/ \
  --bootstrap-public-url http://controller:5000/v3/ \
  --bootstrap-region-id RegionOne
```

httpd server 설정

```bash
# vi /etc/httpd/conf/httpd.conf

ServerName controller
```

wsgi-keystone.conf를 httpd 설정 폴더 밑에 링크합니다.

```bash
# ln -s /usr/share/keystone/wsgi-keystone.conf /etc/httpd/conf.d/
```

httpd 서비스 등록 및 시작

```bash
# systemctl enable httpd.service
# systemctl start httpd.service
```

keystone 인증값을 스크립트로 만듭니다.

> **주의:** `<ADMIN_PASS>` 부분에 admin 유저의 패스워드를 입력합니다.

```bash
# vi admin-openrc

export OS_PROJECT_DOMAIN_NAME=Default
export OS_USER_DOMAIN_NAME=Default
export OS_PROJECT_NAME=admin
export OS_USERNAME=admin
export OS_PASSWORD=<ADMIN_PASS>
export OS_AUTH_URL=http://controller:5000/v3
export OS_IDENTITY_API_VERSION=3
export OS_IMAGE_API_VERSION=2
export PS1="\[\e[36;1m\]\u@\[\e[32;1m\]\h:\[\e[31;1m\]\w(keystone)]# \[\e[0m\]"
```

인증값을 불러옵니다.

![](/assets/img/wp/2019/02/9965C5415C41F8E541AEAA.png)

![](/assets/img/wp/2019/02/9923554C5C41FD4D1EB8D9.png)

> **주의:** httpd status에서 wsgi를 불러와야 정상입니다.

keystone-manage bootstrap 과정에서 Default domain은 만들어져서 이미 존재합니다. (대문자 주의)

Default Domain 값을 가진 프로젝트 생성

```bash
$ openstack project create --domain Default \
  --description "Service Project" service
```

![](/assets/img/wp/2019/02/99A3EC435C41FAE20BCAF8.png)

admin 유저의 인증 토큰 만들기

```bash
$ openstack --os-auth-url http://controller:5000/v3 \
  --os-project-domain-name Default --os-user-domain-name Default \
  --os-project-name admin --os-username admin token issue
```

![](/assets/img/wp/2019/02/99B92D4C5C41FB9D392E32.png)

```bash
$ . admin-openrc
$ openstack token issue
```

![](/assets/img/wp/2019/02/99517F465C41FC29046EAD.png)

Keystone 인증 설치가 완료되었습니다.
