---
date: 2019-02-19 22:38:42 +0900
title: "오픈스택 수동 설치 실습 #.11"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.11 – Neutron 네트워크 설치 : Linux Bridge를 이용한 Provider 네트워크 구성 Controller 노드 OpenStack 네트워킹 (neutron)은 가상 네트워킹 인프라 (VNI)에 대한 모든 네트워킹 측면과 OpenStack…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Neutron 의 네트워크·서브넷·라우터 추상화 설명은 유효하지만, 실습이 쓰는 Linux Bridge 메커니즘 드라이버는 현재 Neutron 공식 문서의 ML2 지원 목록에서 빠졌고 Open vSwitch 와 OVN 이 표준 구현입니다.

![오픈스택 네트워크 노드 구성도](/assets/img/wp/2019/02/992FE5475C486F8C14E55A.jpg)

**오픈스택 수동 설치 실습 #.11 – Neutron 네트워크 설치 : Linux Bridge를 이용한 Provider 네트워크 구성**

## Controller 노드

![Neutron 아키텍처 다이어그램](/assets/img/wp/2019/02/99F712495C4975750AB60E.png)

OpenStack 네트워킹 (neutron)은 가상 네트워킹 인프라 (VNI)의 모든 네트워킹 측면과 OpenStack 환경에서 물리 네트워킹 인프라 (PNI)의 접근 레이어 측면을 관리합니다. OpenStack 네트워킹은 firewall, load balancer, virtual private network (VPN) 같은 서비스를 포함하며, 진보한 가상 네트워크 토폴리지를 생성하여 tenant를 활성화합니다.

네트워킹에서는 객체 추상화로 네트워크, 서브넷, 라우터를 제공합니다. 각 추상화는 물리적인 구성에 대응하여 모방하는 기능이 들어있습니다: 네트워크는 서브넷이 포함되어 있고, 다른 서브넷과 네트워크 간의 트래픽은 라우터로 나눠집니다.

각 라우터는 네트워크에 연결하는 하나의 게이트웨이를 갖고, 여러 인터페이스가 서브넷에 연결됩니다. 서브넷은 같은 라우터 내에 연결된 다른 서브넷 상의 머신에 액세스할 수 있습니다.

임의로 주어진 네트워킹 셋업은 하나 이상의 외부 네트워크를 갖습니다. 다른 네트워크와 달리, 외부 네트워크는 단지 가상으로 정의된 네트워크를 의미하지 않습니다. 이 대신, OpenStack 설치 바깥으로 접근 가능한 뷰의 물리, 외부 네트워크 슬라이스를 나타냅니다. 외부 네트워크의 IP 주소는 바깥 네트워크 상의 임의의 물리적인 객체에서 액세스할 수 있습니다. 외부 네트워크가 바깥 네트워크로의 뷰를 나타내기에, DHCP가 해당 네트워크에서는 비활성화됩니다.

외부 네트워크 뿐만 아니라, 임의의 네트워킹 셋업은 하나 이상의 내부 네트워크를 갖습니다. 이러한 소프트웨어 정의 네트워크는 VM에 직접 연결됩니다. 대상 네트워크에 직접 연결된 VM은 임의의 주어진 내부 네트워크, 또는 인터페이스로 비슷한 라우터에 연결된 서브넷 상의 VM에서만 액세스할 수 있습니다.

외부 네트워크에서 VM에 접근하거나, 그 반대의 경우에도 네트워크 사이의 라우터가 필요합니다. 각 라우터는 네트워크에 연결된 하나의 게이트웨이와 서브넷에 연결된 여러 인터페이스로 구성됩니다. 물리적 라우터와 같이 동일한 라우터에 연결된 다른 서브넷의 머신에 접근할 수 있고, 머신에서 라우터의 게이트웨이로 외부 네트워크에 접근할 수 있습니다.

또한, 외부 네트워크를 내부 네트워크와 연결하도록 IP 주소를 할당할 수 있습니다. 하위 네트워크에 어떤 포트가 연결되든 이 연결을 포트라고 합니다. 외부 네트워크 IP 주소를 가상 머신의 포트에 할당할 수 있습니다. 이 방법으로 외부 네트워크의 실체가 가상 머신에 접근할 수 있습니다.

네트워킹은 시큐리티 그룹을 지원합니다. 시큐리티 그룹은 그룹내에서 방화벽 규칙을 정의하여 관리자를 활성화합니다. VM은 하나에서 여러 시큐리티 그룹을 가질 수 있으며, 시큐리티 그룹에서 포트를 막거나 열고, 포트 범위, VM 트래픽 타입 등의 규칙을 적용할 수 있습니다.

네트워킹에서 사용하는 각 플러그인은 각자의 개념을 갖고 있습니다. VNI 및 OpenStack 환경을 운영하는데 필수는 아니지만, 이러한 개념에 대한 이해는 네트워킹 셋업을 도와줍니다. 모든 네트워킹 설치는 코어 플러그인과 보안 그룹 플러그인 (또는 No-Op 보안 그룹 플러그인)을 사용합니다. 추가로 Firewall-as-a-Service (FWaaS) 및 Load-Balancer-as-a-Service (LBaaS)를 사용할 수 있습니다.

## Neutron 설치: Controller 노드

```bash
# su - postgres
$ psql
```

Neutron 데이터베이스 생성

```sql
postgres=# create role neutron with login;

postgres=# create database neutron;

postgres=# grant ALL PRIVILEGES ON DATABASE neutron TO neutron;

postgres=# alter user neutron with encrypted password 'neutron';
```

Keystone 인증 불러오기

```bash
# . admin-openrc
```

Neutron 계정 생성 및 admin 권한 부여

```bash
# openstack user create --domain Default --password-prompt neutron
# openstack role add --project service --user neutron admin
```

Neutron 서비스 생성

```bash
# openstack service create --name neutron \
  --description "OpenStack Networking" network
```

Neutron 엔드포인트 생성

```bash
# openstack endpoint create --region RegionOne \
  network public http://controller:9696

# openstack endpoint create --region RegionOne \
  network internal http://controller:9696

# openstack endpoint create --region RegionOne \
  network admin http://controller:9696
```

Neutron 패키지 설치

```bash
# yum install openstack-neutron openstack-neutron-ml2 \
  openstack-neutron-linuxbridge ebtables
```

neutron.conf 파일 수정

```ini
# vi /etc/neutron/neutron.conf

[DEFAULT]
# ...
transport_url = rabbit://openstack:open1234@controller
auth_strategy = keystone

[keystone_authtoken]
# ...
www_authenticate_uri = http://controller:5000
auth_url = http://controller:5000
memcached_servers = controller:11211
auth_type = password
project_domain_name = default
user_domain_name = default
project_name = service
username = neutron
password = open1234

[oslo_concurrency]
# ...
lock_path = /var/lib/neutron/tmp
```

linuxbridge-agent.ini 수정

```ini
# vi /etc/neutron/plugins/ml2/linuxbridge_agent.ini

[linux_bridge]
physical_interface_mappings = provider:ens33 <-- bridge로 설정했던 공유기에서 ip받아오는 NIC

[vxlan]
enable_vxlan = false

[securitygroup]
# ...
enable_security_group = true
firewall_driver = neutron.agent.linux.iptables_firewall.IptablesFirewallDriver
```

nova.conf 수정

```ini
# vi /etc/nova/nova.conf

[neutron]
# ...
url = http://controller:9696
auth_url = http://controller:5000
auth_type = password
project_domain_name = Default
user_domain_name = Default
region_name = RegionOne
project_name = service
username = neutron
password = open1234
```

ml2-conf.ini 링크

```bash
# ln -s /etc/neutron/plugins/ml2/ml2_conf.ini /etc/neutron/plugin.ini
```

Neutron DB Sync

```bash
# su -s /bin/sh -c "neutron-db-manage --config-file /etc/neutron/neutron.conf \
  --config-file /etc/neutron/plugins/ml2/ml2_conf.ini upgrade head" neutron
```

Nova 재시작

```bash
# systemctl restart openstack-nova-api.service
```

Neutron 서비스 등록 및 시작

```bash
# systemctl enable neutron-server.service \
  neutron-linuxbridge-agent.service neutron-dhcp-agent.service \
  neutron-metadata-agent.service

# systemctl start neutron-server.service \
  neutron-linuxbridge-agent.service neutron-dhcp-agent.service \
  neutron-metadata-agent.service
```

L3 에이전트 서비스 등록 및 시작

```bash
# systemctl enable neutron-l3-agent.service
# systemctl start neutron-l3-agent.service
```

확인 (DHCP나 Metadata 에이전트가 올라오는데 약간의 시간이 소요되니 잠깐 기다리면 올라옵니다.)

![Neutron 서비스 상태 확인 화면](/assets/img/wp/2019/02/99113B4E5C487BE82EB8FA.png)
