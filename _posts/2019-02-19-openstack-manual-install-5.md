---
date: 2019-02-19 10:34:01 +0900
title: "오픈스택 수동 설치 실습 #.5"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.5 – Message Queue, Memcached, etcd Message Queue 인 RabbitMQ는 Controller 노드에서만 실행됩니다. RabbitMQ는 간단하게 말하면 표준 AMQP (Advanced Message Queueing Pr…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — RabbitMQ·Memcached·etcd 를 컨트롤러에 두는 구성은 지금도 같지만, CentOS 7 의 yum 패키지와 Python 2 기반 python-memcached 를 쓰는 설치 명령은 현재 배포판에서 그대로 동작하지 않습니다.

![](/assets/img/wp/2019/02/997CA4505C41E36E21E079.jpg)

**오픈스택 수동 설치 실습 #.5 – Message Queue, Memcached, etcd**

Message Queue 인 RabbitMQ는 Controller 노드에서만 실행됩니다.

RabbitMQ는 표준 AMQP (Advanced Message Queueing Protocol) 메시지 브로커 소프트웨어(message broker software) 오픈소스입니다.

RabbitMQ를 이해하기 위해서는 우선 MQ(Message Queuing)에 대한 이해가 필요합니다. 프로그래밍에서 MQ는 프로세스 또는 프로그램 인스턴스가 데이터를 서로 교환할때 사용하는 방법이죠. 이때 데이터를 교환할때 시스템이 관리하는 메시지 큐를 이용하는 것이 특징입니다.

서로 다른 프로세스나 프로그램 사이에 메시지를 교환할때 AMQP(Advanced Message Queueing Protocol)를 이용합니다. AMQP는 메시지 지향 미들웨어를 위한 open standard application layer protocol 입니다. AMQP를 이용하면 다른 벤더 사이에 메시지를 전송하는 것이 가능한데 JMS (Java Message Service)가 API를 제공하는것과 달리 AMQP는 wire-protocol을 제공합니다. wire-protocol은 octet stream을 이용해서 다른 네트워크 사이에 데이터를 전송할 수 있는 포맷인데 AMQP가 이를 사용합니다.

이러한 복잡한 설명과 달리 RabbitMQ 튜토리얼에서는 RabbitMQ를 매우 비유적으로 설명하고 있습니다. 편지를 작성하여 받는 사람에게 보낼 우체통, 우체국, 우편배달부가 있듯, post box, post office and postman이라고 비유합니다.

오픈스택에서는 RabbitMQ를 이용하여 각 모듈간의 API 통신을 합니다.

## RabbitMQ 설치

```bash
# yum -y install rabbitmq-server

# systemctl enable rabbitmq-server.service
# systemctl start rabbitmq-server.service
```

RABBIT\_PASS에는 openstack이 RabbitMQ 사용에 사용할 패스워드를 입력해주시기 바랍니다.

```bash
# rabbitmqctl add_user openstack <RABBIT_PASS>
Creating user "openstack" ...

# rabbitmqctl set_permissions openstack ".*" ".*" ".*"
Setting permissions for user "openstack" in vhost "/" ...
```

Memcached는 controller 노드에서만 실행됩니다.

Memcached는 범용 분산 캐시 시스템입니다. 외부 데이터 소스(예: 데이터베이스나 API)의 읽기 횟수를 줄이기 위해 데이터와 객체를 RAM에 캐시 처리함으로써 동적 데이터베이스 드리븐 웹사이트의 속도를 높이기 위해 종종 사용됩니다. Memcached는 BSD 허가서로 라이선스되는 자유-오픈 소스 소프트웨어입니다. Memcached는 유닉스 계열 운영 체제(적어도 리눅스와 macOS), 마이크로소프트 윈도우에서 실행되며, libevent 라이브러리에 의존합니다.

## Memcached 설치

```bash
# yum -y install memcached python-memcached
```

```bash
# vi /etc/sysconfig/memcached

OPTIONS="-l 127.0.0.1,::1,controller".
```

```bash
# systemctl enable memcached.service
# systemctl start memcached.service
```

etcd는 go언어와 Raft프레임워크 이용해 작성된 오픈소스 key-value 저장소로 대규모 Docker 클러스터링에 있어서 컨테이너를 유기적으로 연동시키고 액세스하기 위한 세련된 아키텍처를 제공합니다.

좀 더 설명하자면 OS에 배당된 IP어드레스에 비해 탑재된 컨테이너의 수는 엄청나게 많은데, 이러한 컨테이너에 접근하기 위해서는 IP어드레스 이외의 효율적인 어드레싱 수단을 필요로 하게 됩니다. etcd는 이러한 어드레싱을 HTTP/JSON을 이용해 구현하고 있으며 빠른 성능과 암호화 제공 등으로 현재 Docker 사용자에게 주목받고 있습니다.

etcd는 직접 물리서버에 설치도 가능하고, Vagrant,Amazon EC2, Azure, QEMU/KVM, VMware그리고 OpenStack에 이르기까지 요즘 인기있는 가상화/클라우드 플랫폼을 충실하게 지원하고 있습니다. 특히, docker를 이용한 대규모 클러스터링 구현은 vagrant에 의존하지 않고는 무척 고된작업이 되어버릴 것이며, 지금부터 docker를 이용한 클러스터링에 관심을 가지고 사용해 보려는 사용자에게는 익혀두면 크게 도움이 될 것입니다.

## etcd 설치

```bash
# yum -y install etcd
```

```bash
# vi /etc/etcd/etcd.conf

[Member]
ETCD_DATA_DIR="/var/lib/etcd/default.etcd"
ETCD_LISTEN_PEER_URLS="http://10.0.0.11:2380"
ETCD_LISTEN_CLIENT_URLS="http://10.0.0.11:2379"
ETCD_NAME="controller"

[Clustering]
ETCD_INITIAL_ADVERTISE_PEER_URLS="http://10.0.0.11:2380"
ETCD_ADVERTISE_CLIENT_URLS="http://10.0.0.11:2379"
ETCD_INITIAL_CLUSTER="controller=http://10.0.0.11:2380"
ETCD_INITIAL_CLUSTER_TOKEN="etcd-cluster-01"
ETCD_INITIAL_CLUSTER_STATE="new"
```

```bash
# systemctl enable etcd 
# systemctl start etcd
```
