---
date: 2019-02-19 22:59:44 +0900
title: "오픈스택 수동 설치 실습 #.12"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.12 – Neutron 네트워크 설치 : Linux Bridge를 이용한 Provider 네트워크 구성 Compute 노드 Neutron 패키지 설치 # yum -y install openstack-neutron-linuxbridge ebtables i…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — openstack-neutron-linuxbridge 로 컴퓨트 노드를 구성하는 절차인데, Linux Bridge 드라이버는 현재 Neutron ML2 문서에서 다루지 않으며 OVS·OVN 기준으로 재작성돼 있습니다. Rocky·CentOS 7 패키지 전제도 유효하지 않습니다.

오픈스택 수동 설치 실습 #.12 – Neutron 네트워크 설치 : Linux Bridge를 이용한 Provider 네트워크 구성

![](/assets/img/wp/2019/02/999FA84A5C4F0D7D3CF2FF.jpg)

Compute 노드에서 Neutron을 설정합니다.

![](/assets/img/wp/2019/02/99C5EF4A5C4F0DE219D5B4.png)

## Neutron 패키지 설치

```bash
# yum -y install openstack-neutron-linuxbridge ebtables ipset
```

## neutron.conf 파일 수정

```bash
# vi /etc/neutron/neutron.conf

[DEFAULT]
# ...
transport_url = rabbit://openstack:RABBIT_PASS@controller

[DEFAULT]
# ...
auth_strategy = keystone

[keystone_authtoken]
# ...
www_authenticate_uri = http://controller:5000
auth_url = http://controller:5000
memcached_servers = controller:11211
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = neutron
password = NEUTRON_PASS

[oslo_concurrency]
# ...
lock_path = /var/lib/neutron/tmp
```

## linuxbridge_agent.ini 파일 수정

```bash
# vi /etc/neutron/plugins/ml2/linuxbridge_agent.ini

[linux_bridge]
physical_interface_mappings = provider:PROVIDER_INTERFACE_NAME

[vxlan]
enable_vxlan = false

[securitygroup]
# ...
enable_security_group = true
firewall_driver = neutron.agent.linux.iptables_firewall.IptablesFirewallDriver
```

## nova.conf 수정

```bash
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
password = NEUTRON_PASS
```

## Nova-compute 재시작

```bash
# systemctl restart openstack-nova-compute.service
```

## Neutron 서비스 시작

```bash
# systemctl enable neutron-linuxbridge-agent.service
# systemctl start neutron-linuxbridge-agent.service
```

Neutron 설치를 완료했습니다.

## Controller 노드에서 확인

![](/assets/img/wp/2019/02/9901DF505C4F127B06390E.png)

Compute 노드에서 Keystone 인증 파일(admin-openrc)을 생성하고 `openstack network agent list` 명령으로 확인합니다.

![](/assets/img/wp/2019/02/99A6BA495C4F225C232F5D.png)
