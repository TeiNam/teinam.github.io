---
date: 2019-02-19 22:31:55 +0900
title: "오픈스택 수동 설치 실습 #.10"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.10 – Compute 노드에 Nova 설치 노바 패키지 설치 # yum -y install openstack-nova-compute nova.conf 파일 수정 # vi /etc/nova/nova.conf [DEFAULT] # define own IP…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 컴퓨트 노드에 nova-compute 를 올리고 my_ip·transport_url·VNC 를 설정하는 골격은 유지되지만, openstack-nova-compute 패키지는 EOL 된 Rocky·CentOS 7 저장소 기준입니다. 현재 릴리스에서는 Placement 연동과 API 배포 방식이 달라 설정 항목을 다시 확인해야 합니다.

![](/assets/img/wp/2019/02/99B3CE385C4469C6110AD4.jpg)

**오픈스택 수동 설치 실습 #.10 – Compute 노드에 Nova 설치**

> **전제:** Controller 노드(10.0.0.11)에 Keystone·Glance·Placement 설치 완료, Compute 노드(10.0.0.31) 네트워크 설정 완료

## 노바 패키지 설치

```bash
# yum -y install openstack-nova-compute
```

## nova.conf 파일 수정

```ini
# vi /etc/nova/nova.conf

[DEFAULT]
# define own IP address
my_ip = 10.0.0.31
state_path = /var/lib/nova
enabled_apis = osapi_compute,metadata
log_dir = /var/log/nova
# RabbitMQ connection info
transport_url = rabbit://openstack:open1234@10.0.0.11

[api]
auth_strategy = keystone

# enable VNC
[vnc]
enabled = True
server_listen = 0.0.0.0
server_proxyclient_address = 10.0.0.31
novncproxy_base_url = http://10.0.0.11:6080/vnc_auto.html

# Glance connection info
[glance]
api_servers = http://10.0.0.11:9292

[oslo_concurrency]
lock_path = $state_path/tmp

# Keystone auth info
[keystone_authtoken]
www_authenticate_uri = http://10.0.0.11:5000
auth_url = http://10.0.0.11:5000/v3
memcached_servers = 10.0.0.11:11211
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = nova
password = NOVA_PASS

[placement]
auth_url = http://10.0.0.11:5000/v3
os_region_name = RegionOne
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = placement
password = PLACEMENT_PASS

[wsgi]
api_paste_config = /etc/nova/api-paste.ini
```

nova.conf에 libvirt 라는 항목이 있습니다.

```bash
$ egrep -c '(vmx|svm)' /proc/cpuinfo
```

해당 명령을 실행 했을때, 0 (Zero)가 나온다면, qemu로 설정을 해줘야 합니다.

1 or 더 큰수가 나올 경우에는 다른 하이퍼바이저를 사용 할 수 있습니다. vm환경에다 설치할 경우 0 (Zero)가 나올겁니다.

```ini
[libvirt]
# ...
virt_type = qemu
```

※ Nova Compute 서비스가 실패 하는 경우 /var/log/nova/nova-compute.log 를 체크 했을때, AMQP(메시지 큐 프로토콜) server on controller:5672 is unreachable 이 나온다면 방화벽 같은 항목에서 5672 포트가 막혀있는 것이니 확인 해주세요.

## Nova 서비스 생성 및 자동실행 등록

```bash
# systemctl start openstack-nova-compute
# systemctl enable openstack-nova-compute
```

## Controller 노드에서 확인

아래 항목은 Controller 노드에서 확인합니다.

```bash
$ . admin-openrc
```

### Compute Host 찾기

```bash
# su -s /bin/bash nova -c "nova-manage cell_v2 discover_hosts"
```

![nova-manage cell_v2 discover_hosts 실행 결과](/assets/img/wp/2019/02/99845D4E5C45D1932684E1.png)

Compute 노드 설치가 완료되었습니다.
