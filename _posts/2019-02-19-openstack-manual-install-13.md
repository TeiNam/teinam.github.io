---
date: 2019-02-19 23:04:07 +0900
title: "오픈스택 수동 설치 실습 #.13"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.13 – Horizon 대시보드 설치 Horizon 대시보드 설치 오픈스택 대시보드(Horizon)는 관리자와 사용자들에게 클라우드 기반 자원 배치의 접근, 제공, 자동화를 위한 그래픽 인터페이스를 제공합니다. 과금, 모니터링, 추가 관리 도구와 같은…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Horizon 대시보드의 역할과 local_settings 기반 설정 방식은 남아 있지만, 예시의 OPENSTACK_API_VERSIONS 에 있는 volume 2 는 이미 지난 세대이고 openstack-dashboard 패키지는 EOL 된 Rocky·CentOS 7 저장소 기준입니다.

![](/assets/img/wp/2019/02/99E491505C4F13401DE150.jpg)

오픈스택 대시보드(Horizon)는 관리자와 사용자에게 클라우드 기반 자원 배치의 접근, 제공, 자동화를 위한 그래픽 인터페이스를 제공합니다. 과금, 모니터링, 추가 관리 도구와 같은 서드파티 제품과 서비스를 수용합니다. 대시보드는 또한 이용하기 원하는 서비스 제공자 및 기타 상용 벤더를 위해 브랜드화가 가능하며, 대시보드는 사용자가 오픈스택 자원과 상호작용할 수 있는 여러 방법 가운데 하나입니다. 개발자는 네이티브 오픈스택 API나 EC2 호환 API를 사용하여 자원을 관리하기 위해 액세스를 자동화하거나 도구를 빌드할 수 있습니다.

## Horizon 대시보드 패키지 설치

```bash
# yum -y install openstack-dashboard
```

## local_settings 파일 수정

```bash
# vi /etc/openstack-dashboard/local_settings

# 대시보드 호스트를 추가합니다.
ALLOWED_HOSTS = ['*']

# 오픈스택 API의 버전들을 설정 합니다.
OPENSTACK_API_VERSIONS = {
#    "data-processing": 1.1,
    "identity": 3,
    "image": 2,
    "volume": 2,
}

# 오픈스택의 멀티 도메인을 사용가능하게 합니다.
OPENSTACK_KEYSTONE_MULTIDOMAIN_SUPPORT = True

# Keystone의 기본 도메인을 'Default'로 설정합니다.
OPENSTACK_KEYSTONE_DEFAULT_DOMAIN = 'Default' 


# SESSION_ENGINE을 설정합니다.
SESSION_ENGINE = 'django.contrib.sessions.backends.cache'

# Memcached 정보를 설정합니다.
CACHES = {
    'default': {
         'BACKEND': 'django.core.cache.backends.memcached.MemcachedCache',
         'LOCATION': 'controller:11211',
    }
}


# 오픈스택 대시보드를 실행할 컨트롤러 노드의 관리용 IP를 OPENSTACK_HOST에 설정합니다.
OPENSTACK_HOST = "controller"

# 오픈스택의 Keystone URL을 설정합니다.
OPENSTACK_KEYSTONE_URL = "http://%s:5000/v3" % OPENSTACK_HOST

# 오픈스택의 Keystone 기본권한을 설정합니다.
OPENSTACK_KEYSTONE_DEFAULT_ROLE = "_member_"

# Provider 네트워크를 선택하여 linuxbridge를 이용한다면 l3 네트워킹 서비스 지원을 사용안함으로 설정합니다.
OPENSTACK_NEUTRON_NETWORK = {
    ...
    'enable_router': False,
    'enable_quotas': False,
    'enable_distributed_router': False,
    'enable_ha_router': False,
    'enable_lb': False,
    'enable_firewall': False,
    'enable_vpn': False,
    'enable_fip_topology_check': False,
}

# 타임존을 설정합니다.
TIME_ZONE = "Asia/Seoul"
```

## openstack-dashboard.conf 파일 수정

```conf
# vi /etc/httpd/conf.d/openstack-dashboard.conf

WSGIDaemonProcess dashboard
WSGIProcessGroup dashboard
WSGISocketPrefix run/wsgi
WSGIApplicationGroup %{GLOBAL}
```

## 서비스 재시작

```bash
# systemctl restart httpd.service memcached.service
```

인터넷 브라우저에서 http://10.0.0.11/dashboard 로 접속하면 로그인 화면이 뜹니다.

![오픈스택 대시보드 로그인 화면](/assets/img/wp/2019/02/990F264C5C4F241D0A037E.png)

admin 계정으로 로그인을 해보면,

![관리자 대시보드 개요 화면](/assets/img/wp/2019/02/995AE5485C4F2434240E13.png)

개요 화면이 보이고, 내부 정보가 보입니다.

이러면 설치가 완료된 것입니다.
