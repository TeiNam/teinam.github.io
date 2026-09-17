---
date: 2019-02-19 23:12:27 +0900
title: "오픈스택 수동 설치 실습 #.14"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.14 – Cinder block storage 서비스 설치 Cinder – LVM을 이용한 스토리지 노드 구성 오픈스택 블록 스토리지(Cinder)는 오픈스택 컴퓨트 인스턴스에 사용할 지속적인 블록 레벨 스토리지 장치들을 제공합니다. 블록 스토리지 시스…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Cinder 를 LVM 백엔드로 붙이는 개념은 지금도 통용되지만, 본문의 cinderv2(volumev2) 서비스 등록과 Rocky·CentOS 7 패키지 절차는 현재 릴리스와 맞지 않습니다.

![](/assets/img/wp/2019/02/99BCDE445C4FD73F09CB9F.jpg)

**OpenStack 수동 설치 실습 #.14 – Cinder block storage 서비스 설치**

**Cinder – LVM을 이용한 스토리지 노드 구성**

> **전제조건:**
> - OpenStack Rocky 설치 완료
> - Controller, Compute, Storage 노드 구성
> - PostgreSQL, RabbitMQ, Keystone 설정 완료
> - Storage 노드에 `/dev/sdb` 추가 블록 디바이스 준비

![](/assets/img/wp/2019/02/99E6CD475C4FD84D0A900A.png)

OpenStack 블록 스토리지(Cinder)는 OpenStack Compute 인스턴스에 사용할 지속적인 블록 레벨 스토리지 장치들을 제공합니다. 블록 스토리지 시스템은 블록 장치들을 서버에 작성, 부착, 제거하는 일을 관리하며, 블록 스토리지 볼륨들은 클라우드 사용자들이 자신만의 스토리지의 필요한 부분을 관리하기 위한 대시보드 및 OpenStack Compute와 완전히 연동됩니다. 로컬 리눅스 서버 스토리지뿐 아니라 Ceph, 클라우드바이트, Coraid, EMC(ScaleIO, VMAX, VNX and XtremIO), GlusterFS, 히타치 데이터 시스템, IBM 스토리지(IBM DS8000, Storwize 계열, SAN 볼륨 컨트롤러, XIV 스토리지 시스템, GPFS), 리눅스 LIO, 넷앱, 넥센타, 님블 스토리지, Scality, 솔리드파이어, HP (스토어버추얼, 3PAR 스토어서브 계열), 퓨어 스토리지를 포함한 스토리지 플랫폼들을 사용합니다. 블록 스토리지는 데이터베이스 스토리지, 확장 가능 파일 시스템과 같은 성능에 민감한 시나리오에 적절하며, 서버에 로우 블록 레벨 스토리지 접근을 제공합니다. 스냅샷 관리는 블록 스토리지 볼륨에 저장된 데이터를 백업하는 강력한 기능을 제공하며, 스냅샷들은 새로운 블록 스토리지 볼륨들을 만들거나 복원할 수 있습니다.

## Controller 노드 설치

데이터베이스 설정:

```bash
# su - postgres
$ psql
```

```sql
postgres=# create role cinder with login;
postgres=# create database cinder;
postgres=# grant ALL PRIVILEGES ON DATABASE cinder TO cinder;
postgres=# alter user cinder with encrypted password 'cinder';
```

키스톤 인증 불러오기:

```bash
# . admin-openrc
```

cinder 유저 생성 및 admin 권한 추가:

```bash
# openstack user create --domain default --password-prompt cinder
# openstack role add --project service --user cinder admin
```

cinderv2와 cinderv3 서비스 생성:

```bash
# openstack service create --name cinderv2 \
  --description "OpenStack Block Storage" volumev2
 
# openstack service create --name cinderv3 \
  --description "OpenStack Block Storage" volumev3
```

endpoint 생성:

```bash
# openstack endpoint create --region RegionOne \
  volumev2 public http://controller:8776/v2/%\(project_id\)s
 
# openstack endpoint create --region RegionOne \
  volumev2 internal http://controller:8776/v2/%\(project_id\)s
 
# openstack endpoint create --region RegionOne \
  volumev2 admin http://controller:8776/v2/%\(project_id\)s
 
# openstack endpoint create --region RegionOne \
  volumev3 public http://controller:8776/v3/%\(project_id\)s
 
# openstack endpoint create --region RegionOne \
  volumev3 internal http://controller:8776/v3/%\(project_id\)s
 
# openstack endpoint create --region RegionOne \
  volumev3 admin http://controller:8776/v3/%\(project_id\)s
```

cinder 패키지 설치:

```bash
# yum -y install openstack-cinder
```

cinder.conf 파일 수정:

```bash
# vi /etc/cinder/cinder.conf 

[database]
connection = postgresql://cinder:cinder@controller/cinder

[DEFAULT]
transport_url = rabbit://openstack:RABBIT_PASS@controller
auth_strategy = keystone
my_ip = 10.0.0.11
enable_v3_api = True

[keystone_authtoken]
auth_uri = http://controller:5000
auth_url = http://controller:5000
memcached_servers = controller:11211
auth_type = password
project_domain_id = default
user_domain_id = default
project_name = service
username = cinder
password = CINDER_PASS

[oslo_concurrency]
lock_path = /var/lib/cinder/tmp
```

블록 스토리지 데이터베이스 배포:

```bash
# su -s /bin/sh -c "cinder-manage db sync" cinder
```

## Compute 노드 설정

nova.conf 파일 수정:

```bash
# vi /etc/nova/nova.conf

[cinder]
os_region_name = RegionOne
```

nova 서비스 재시작:

```bash
# systemctl restart openstack-nova-api.service
```

## Controller 노드 마무리

keystone에 Volume API 버전 추가:

```bash
# echo "export OS_VOLUME_API_VERSION=3" >> ~/admin-openrc
```

cinder 서비스 등록 및 시작:

```bash
# systemctl enable openstack-cinder-api.service openstack-cinder-scheduler.service
# systemctl start openstack-cinder-api.service openstack-cinder-scheduler.service
```

![](/assets/img/wp/2019/02/99A8DB425C4FDE0923E878.png)

## Storage 노드 설치 (LVM 이용)

> **참고:** Storage 노드는 Ceph, NFS, iSCSI 등 다양한 백엔드 스토리지로 설치할 수 있습니다. 이 가이드에서는 VM 환경에 적합한 LVM으로 진행합니다.

필요 패키지 설치:

```bash
# yum -y install centos-release-openstack-rocky
# yum -y upgrade
# yum -y install python-openstackclient
# yum -y install openstack-selinux
# yum -y install python-psycopg2
```

lvm 패키지 설치:

```bash
# yum install lvm2 device-mapper-persistent-data
```

lvm 서비스 등록 및 시작:

```bash
# systemctl enable lvm2-lvmetad.service
# systemctl start lvm2-lvmetad.service
```

pv 볼륨 설정:

```bash
# pvcreate /dev/sdb
Physical volume "/dev/sdb" successfully created
```

vg 볼륨 설정:

```bash
# vgcreate cinder-volumes /dev/sdb
Volume group "cinder-volumes" successfully created
```

lvm.conf 수정:

```bash
# vi /etc/lvm/lvm.conf

devices {
...
filter = [ "a/sdb/", "r/.*/"]
```

cinder 패키지 설치:

```bash
# yum -y install openstack-cinder targetcli python-keystone python2-crypto
```

cinder.conf 파일 수정:

```bash
# vi /etc/cinder/cinder.conf

[database]
connection = postgresql://cinder:cinder@controller/cinder

[DEFAULT]
transport_url = rabbit://openstack:RABBIT_PASS@controller
auth_strategy = keystone
my_ip = 10.0.0.41
enabled_backends = lvm
glance_api_servers = http://controller:9292
enable_v3_api = True

[keystone_authtoken]
auth_uri = http://controller:5000
auth_url = http://controller:5000
memcached_servers = controller:11211
auth_type = password
project_domain_id = default
user_domain_id = default
project_name = service
username = cinder
password = CINDER_PASS

[lvm]
volume_driver = cinder.volume.drivers.lvm.LVMVolumeDriver
volume_group = cinder-volumes
iscsi_protocol = iscsi
iscsi_helper = lioadm
target_ip_address = 10.0.0.41
volumes_dir = $state_path/volumes

[oslo_concurrency]
lock_path = /var/lib/cinder/tmp
```

> **참고:** `[lvm]` 섹션은 기본 설정에 없으므로 위 내용을 추가합니다.

cinder 서비스 등록 및 시작:

```bash
# systemctl enable openstack-cinder-volume.service target.service
# systemctl start openstack-cinder-volume.service target.service
```

controller 노드에서 서비스 확인:

![](/assets/img/wp/2019/02/991467465C4FF23D37AD60.png)

볼륨 설정이 완료되었습니다.

Cinder 설치가 완료되어 OpenStack 코어 컴포넌트 설치가 마무리되었습니다.
