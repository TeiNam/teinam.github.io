---
date: 2019-03-13 00:21:38 +0900
title: "Kolla-ansible 배포 레지스트리 구축: rocky"
category: dbops
excerpt: "오픈스택 공식 홈페이지에 있는 있는 순서대로 진행을 하면 kolla-ansible precheck 부분에서 진행이 안되는 경우가 발생합니다. docker registry 부분이 설정이 맞지 않아 docker SDK 버전 체크 부분에서 진행 되지 않습니다. 또, 공홈에는 Contro…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 현재 kolla-ansible 은 venv 에 `pip install git+https://opendev.org/openstack/kolla-ansible` 로 설치하고 이미지 배포판은 debian·rocky·ubuntu 만 지원하며, 글에 나오는 python2-pip, `python setup.py install`, kolla_install_type, centos 이미지, openstack_release: rocky 는 모두 사라졌습니다. Docker 도 CentOS 7 을 지원하지 않아(현재 CentOS Stream 9·10만 지원) 이 배포 레지스트리 구성은 재현 불가입니다.

![OpenStack](/assets/img/wp/2019/02/openstack.jpg)

[오픈스택 공식 홈페이지](https://www.openstack.org/)의 순서대로 진행하면 `kolla-ansible precheck` 부분에서 진행이 안 되는 경우가 있다.

Docker registry 설정이 맞지 않아 Docker SDK 버전 체크 부분에서 멈춘다.

또한, 공식 문서는 Controller 노드에서 배포를 진행하는데, Deploy 서버를 구축해 Control·Compute를 따로 관리할 수도 있다.

이 글에서는 별도 배포 서버를 구축한다.

## Deploy Node

### 의존성 설치

```bash
$ yum -y install epel-release
$ yum -y update
$ yum -y install python2-pip wget 
$ pip install -U pip
$ yum install ansible
$ pip install -U ansible
```

### Docker 설치

Docker로 Private registry를 구축할 예정이므로 먼저 Docker를 설치한다.

```bash
$ curl -sSL https://get.docker.io | bash
$ mkdir -p /etc/systemd/system/docker.service.d

$ tee /etc/systemd/system/docker.service.d/kolla.conf <<-'EOF'
[Service]
MountFlags=shared
EOF

$ systemctl daemon-reload
$ systemctl restart docker
```

### Docker Registry 구축

레지스트리 컨테이너로 Docker registry를 구축한다.

```bash
$ mkdir -p /app/docker/registry
$ docker run -d -p 4000:5000 -v /app/docker/registry:/var/lib/registry --restart=always --name registry registry:2.7.1
$ docker ps -a
```

### Kolla 설치

```bash
$ pip install kolla --ignore-installed PyYAML
$ pip install kolla-ansible
$ cp -r /usr/share/kolla/etc_examples/kolla /etc/

$ git clone https://github.com/openstack/kolla
$ git clone https://github.com/openstack/kolla-ansible

$ pip install -r kolla/requirements.txt
$ pip install -r kolla-ansible/requirements.txt

$ cd kolla-ansible
$ python setup.py install
$ cd ..
$ cp -r kolla-ansible/etc/kolla/* /etc/kolla
```

### 컨테이너 내려받기

내려받기 전에 `/etc/kolla/globals.yml` 파일을 수정한다. 수정해야 하는 부분은 다음과 같다.

```yaml
kolla_base_distro: "centos"
kolla_install_type: "source"
openstack_release: "rocky"
network_interface: "enp6s0"   # 배포 서버의 네트워크 인터페이스 이름으로 수정
```

> **주의:** 위 항목들은 반드시 수정해야 `kolla-ansible`로 컨테이너를 pull할 수 있다.

```bash
$ kolla-ansible pull -vvv
$ docker images
```

`pull`을 실행하면 OpenStack 컨테이너들이 로컬 registry에 저장된다.

아래 명령으로 tag를 수정해 push한다.

```bash
$ docker images | grep kolla | grep -v local | awk '{print $1,$2}' | while read -r image tag; do
docker tag ${image}:${tag} localhost:4000/${image}:${tag}
docker push localhost:4000/${image}:${tag}
done

$ curl -XGET http://localhost:4000/v2/_catalog
```

```json
{"repositories":["kolla/centos-binary-chrony","kolla/centos-binary-cron","kolla/centos-binary-fluentd","kolla/centos-binary-glance-api","kolla/centos-binary-haproxy","kolla/centos-binary-heat-api","kolla/centos-binary-heat-api-cfn","kolla/centos-binary-heat-engine","kolla/centos-binary-horizon","kolla/centos-binary-keepalived","kolla/centos-binary-keystone","kolla/centos-binary-keystone-fernet","kolla/centos-binary-keystone-ssh","kolla/centos-binary-kolla-toolbox","kolla/centos-binary-mariadb","kolla/centos-binary-memcached","kolla/centos-binary-neutron-dhcp-agent","kolla/centos-binary-neutron-l3-agent","kolla/centos-binary-neutron-metadata-agent","kolla/centos-binary-neutron-openvswitch-agent","kolla/centos-binary-neutron-server","kolla/centos-binary-nova-api","kolla/centos-binary-nova-compute","kolla/centos-binary-nova-conductor","kolla/centos-binary-nova-consoleauth","kolla/centos-binary-nova-libvirt","kolla/centos-binary-nova-novncproxy","kolla/centos-binary-nova-placement-api","kolla/centos-binary-nova-scheduler","kolla/centos-binary-nova-ssh","kolla/centos-binary-openvswitch-db-server","kolla/centos-binary-openvswitch-vswitchd","kolla/centos-binary-rabbitmq","kolla/centos-source-chrony","kolla/centos-source-cron","kolla/centos-source-fluentd","kolla/centos-source-glance-api","kolla/centos-source-haproxy","kolla/centos-source-heat-api","kolla/centos-source-heat-api-cfn","kolla/centos-source-heat-engine","kolla/centos-source-horizon","kolla/centos-source-keepalived","kolla/centos-source-keystone","kolla/centos-source-keystone-fernet","kolla/centos-source-keystone-ssh","kolla/centos-source-kolla-toolbox","kolla/centos-source-mariadb","kolla/centos-source-memcached","kolla/centos-source-neutron-dhcp-agent","kolla/centos-source-neutron-l3-agent","kolla/centos-source-neutron-metadata-agent","kolla/centos-source-neutron-openvswitch-agent","kolla/centos-source-neutron-server","kolla/centos-source-nova-api","kolla/centos-source-nova-compute","kolla/centos-source-nova-conductor","kolla/centos-source-nova-consoleauth","kolla/centos-source-nova-libvirt","kolla/centos-source-nova-novncproxy","kolla/centos-source-nova-placement-api","kolla/centos-source-nova-scheduler","kolla/centos-source-nova-ssh","kolla/centos-source-openvswitch-db-server","kolla/centos-source-openvswitch-vswitchd","kolla/centos-source-rabbitmq"]}
```

위와 같이 catalog를 조회할 수 있으면 성공이다. 이 예시는 source와 binary를 모두 구축해 목록이 길다.

## Target Node

배포 대상 서버에도 Docker를 설치한다. 타겟 노드의 Docker 옵션은 다음과 같이 설정한다.

```bash
$ curl -sSL https://get.docker.io | bash
$ echo 'INSECURE_REGISTRY="--insecure-registry 192.168.122.71:4000"' > /etc/sysconfig/docker

$ tee /etc/systemd/system/docker.service <<-'EOF'
# CentOS
[Service]
MountFlags=shared
EnvironmentFile=/etc/sysconfig/docker
ExecStart=/usr/bin/docker daemon $INSECURE_REGISTRY
EOF

$ systemctl daemon-reload
$ systemctl restart docker
```

`INSECURE_REGISTRY="--insecure-registry"` 값의 IP 주소는 Deploy 서버의 IP다.

```bash
$ docker pull kolla/centos-binary-kolla-toolbox:3.0.1
```

위 명령으로 해당 노드에 컨테이너를 pull할 수 있다.

OpenStack 운영 중 필요한 컨테이너를 언제든 추가할 수 있다.
