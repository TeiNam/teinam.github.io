---
date: 2019-02-19 21:43:28 +0900
title: "오픈스택 수동 설치 실습 #.9"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.9 – Controller 노드에 Nova 설치 Nova 설치 준비 SQL DB에 접속하여 nova, placement 2개의 유저를 생성합니다. DB계정에 대한 password는 보기 편하게 user와 동일하게 설정 했습니다. Database nova…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Placement DB 와 서비스를 Nova 설치의 일부로 다루는 구성은 Rocky 까지만 맞습니다. Placement 는 Stein(19.0.0)에서 별도 저장소·서비스로 분리되었고 nova-placement-api 는 사라졌습니다.

![](/assets/img/wp/2019/02/994D04335C445E232D8149.jpg)

## 오픈스택 수동 설치 실습 #.9 – Controller 노드에 Nova 설치

### Nova 설치 준비

SQL DB에 접속하여 nova, placement 2개의 유저를 생성합니다. DB 계정 password는 user와 동일하게 설정했습니다.

Database nova, nova-api, nova_cell0, placement 4개의 DB를 생성합니다.

```bash
# su - postgres
$ psql
```

```sql
postgres=# create database nova;
postgres=# create database nova_api;
postgres=# create database nova_cell0;
postgres=# create database placement;

postgres=# create role nova with login;
postgres=# create role placement with login;

postgres=# grant all privileges on database nova to nova;
postgres=# grant all privileges on database nova_api to nova;
postgres=# grant all privileges on database nova_cell0 to nova;
postgres=# grant all privileges on database placement to placement;

postgres=# alter user nova with encrypted password 'nova';
postgres=# alter user placement with encrypted password 'placement';
```

### Keystone 인증 불러오기

```bash
# . admin-openrc
```

### Nova 유저 및 서비스 설정

Nova 유저를 생성합니다.

```bash
# openstack user create --domain Default --password-prompt nova
```

Nova 유저에 admin 권한을 줍니다.

```bash
# openstack role add --project service --user nova admin
```

Nova 서비스 엔티티 생성

```bash
$ openstack service create --name nova \
  --description "OpenStack Compute" compute
```

Compute API 엔드포인트 생성

```bash
$ openstack endpoint create --region RegionOne \
  compute public http://controller:8774/v2.1

$ openstack endpoint create --region RegionOne \
  compute internal http://controller:8774/v2.1

$ openstack endpoint create --region RegionOne \
  compute admin http://controller:8774/v2.1
```

### Placement 서비스 설정

Placement 서비스 유저 생성

```bash
# openstack user create --domain Default --password-prompt placement
```

Placement 서비스 유저에 admin 권한부여

```bash
# openstack role add --project service --user placement admin
```

Placement 서비스 생성

```bash
# openstack service create --name placement \
  --description "Placement API" placement
```

Placement API 엔드포인트 생성

```bash
$ openstack endpoint create --region RegionOne \
  placement public http://controller:8778

$ openstack endpoint create --region RegionOne \
  placement internal http://controller:8778

$ openstack endpoint create --region RegionOne \
  placement admin http://controller:8778
```

### Nova 패키지 설치 및 설정

```bash
# yum install openstack-nova-api openstack-nova-conductor \
  openstack-nova-console openstack-nova-novncproxy \
  openstack-nova-scheduler openstack-nova-placement-api
```

```ini
# vi /etc/nova/nova.conf

[DEFAULT]
# ...
enabled_apis = osapi_compute,metadata
transport_url = rabbit://openstack:RABBIT_PASS@controller
my_ip = 10.0.0.11

[api_database]
# ...
connection = postgresql://nova:nova@controller/nova_api

[database]
# ...
connection = postgresql://nova:nova@controller/nova

[placement_database]
# ...
connection = postgresql://placement:placement@controller/placement

[api]
# ...
auth_strategy = keystone

[keystone_authtoken]
# ...
auth_url = http://controller:5000/v3
memcached_servers = controller:11211
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = nova
password = NOVA_PASS

[vnc]
enabled = true
# ...
server_listen = 10.0.0.11
server_proxyclient_address = 10.0.0.11

[oslo_concurrency]
# ...
lock_path = /var/lib/nova/tmp

[placement]
# ...
region_name = RegionOne
project_domain_name = Default
project_name = service
auth_type = password
user_domain_name = Default
auth_url = http://controller:5000/v3
username = placement
password = PLACEMENT_PASS
```

Placement API 설정에 15째줄에 아래 내용을 추가합니다.

```apache
# vi /etc/httpd/conf.d/00-nova-placement-api.conf

  <Directory /usr/bin>
    Require all granted
  </Directory>
```

```bash
# semanage port -a -t http_port_t -p tcp 8778
```

### Nova 데이터베이스 초기화

Nova-api DB와 placement DB에 배포

```bash
# su -s /bin/bash nova -c "nova-manage api_db sync"
```

cell0 데이터베이스 등록

```bash
# su -s /bin/bash nova -c "nova-manage cell_v2 map_cell0"
```

cell1 cell 생성

```bash
# su -s /bin/sh -c "nova-manage cell_v2 create_cell --name=cell1 --verbose" nova
```

Nova DB에 배포

```bash
# su -s /bin/bash nova -c "nova-manage db sync"
```

Nova 리스트에 cell0과 cell1을 등록

```bash
# su -s /bin/bash nova -c "nova-manage cell_v2 create_cell --name cell1"
```

### Nova 서비스 시작

httpd 재시작

```bash
# systemctl restart httpd
```

Nova 서비스 생성 및 자동실행 등록

```bash
# for service in api consoleauth conductor scheduler novncproxy; do 
systemctl start openstack-nova-$service 
systemctl enable openstack-nova-$service 
done
```

![](/assets/img/wp/2019/02/9923E2505C45CF8A1B0C85.png)

Controller 노드에 Nova 설치가 끝났습니다.

이어서 Compute 노드에 Nova를 설치해야 합니다.
