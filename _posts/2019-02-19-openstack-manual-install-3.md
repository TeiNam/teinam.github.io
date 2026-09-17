---
date: 2019-02-19 01:31:22 +0900
title: "오픈스택 수동 설치 실습 #.3"
category: dbops
excerpt: "오픈스택 설치 실습 #.3 – 사전에 각각의 노드에 준비해야 할 것들 저는 일단 controller, compute1, block1 이렇게 3개의 노드를 준비했습니다. 각각 3개의 노드에 /etc/hosts 파일을 수정해서 넣어주고, 서로간에 Ping이 가는지 확인해 봅시다. ※…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — `yum -y install centos-release-openstack-rocky` 는 EOL 된 CentOS 7 저장소와 EOL 된 Rocky 릴리스를 전제로 하므로 지금은 설치되지 않습니다. hosts 등록과 chrony 시간 동기화 개념 자체는 유효하지만 패키지 단계는 재현 불가입니다.

![](/assets/img/wp/2019/02/993CC1375C41BE46153DA6.jpg)

**오픈스택 설치 실습 #.3 – 사전에 각각의 노드에 준비해야 할 것들**

저는 일단 controller, compute1, block1 이렇게 3개의 노드를 준비했습니다.

각각 3개의 노드에 /etc/hosts 파일을 수정해서 넣어주고, 서로간에 Ping이 가는지 확인해 봅시다.

※ controller, compute1, block1 에서 모두 설정

```bash
# vi /etc/hosts

# controller
10.0.0.11       controller

# compute1
10.0.0.31       compute1

# block1
10.0.0.41       block1
```

![](/assets/img/wp/2019/02/990BEE465C41C1A40520BF.png)

핑이 잘 갑니다.

**NTP 설정하기**

CentOS 7 설치시에 NTP 옵션을 준 것을 기억하시나요? 그렇다면 각 서버에는 chrony 데몬이 설치되어 있을 겁니다. 설치가 안되어 있다면, `yum install chrony` 명령으로 설치합니다.

chrony 데몬은 RHEL 7버전부터 선택된 기존의 ntpd를 대체하는 시간 동기화 데몬입니다. 네트워크에서 일시 중단되거나 간헐적으로 연결이 끊어지는 시스템 (모바일 및 가상 서버 등)에 가장 적합한 데몬입니다.

▶ chrony의 장점

1) 24 시간 운영되지 않는 데스크톱이나 시스템에서 유용하게 사용되는 시간 및 주파수 오류를 최소화하기 위해 시간 대신 단 몇 분만에 빠른 동기화가 가능합니다.

2) 클록 주파수의 급격한 변화에 대한보다 나은 대응은 클록 주파수가 불안정한 가상 머신이나 클럭 주파수를 일정하게 유지하지 않는 절전 기술에 유용합니다.

3) 초기 동기화 후에는 시스템 시간을 필요로하는 응용 프로그램에 영향을 미치지 않도록 시계를 단계별로 조정하지 마십시오.

4) 일시적인 비대칭 지연을 처리 할 때 안정성이 좋아집니다 (예 : 링크가 대량 다운로드로 포화 된 경우).

5) 주기적으로 서버를 폴링 할 필요가 없으므로 네트워크 연결이 간헐적으로 연결된 시스템은 여전히 ​​신속하게 클록을 동기화 할 수 있습니다.

chrony 데몬으로 controller 노드는 NTP 서버에서 시간을 가져오고, 각각의 노드는 controller 노드에서 시간을 가져오도록 설정합니다.

chrony.conf 파일을 열어 해당 부분의 주석을 제거하고 값을 수정합니다.

※ controller 에서 설정

```bash
# vi /etc/chrony.conf

# Allow NTP client access from local network.
allow 10.0.0.0/24
```

※ compute1, block1 각각의 노드에서 설정

```bash
# vi /etc/chrony.conf

#server 0.centos.pool.ntp.org iburst
#server 1.centos.pool.ntp.org iburst
#server 2.centos.pool.ntp.org iburst
#server 3.centos.pool.ntp.org iburst
server controller iburst
```

※ 모든 노드에서 실행

```bash
# systemctl enable chronyd.service 
# systemctl restart chronyd.service
```

설정이 완료되면 각각의 노드에서 `chronyc sources` 명령으로 확인할 수 있습니다.

![](/assets/img/wp/2019/02/9931F74F5C41C7581D0297.png)

controller 노드는 ntp 서버에서, 각각의 노드는 controller 노드에서 시간을 받아오는 걸 확인할 수 있습니다.

**오픈스택 패키지 설치하기**

※ 모든 노드에서 실행 (controller, compute1, block1 )

```bash
# yum -y install centos-release-openstack-rocky 
# yum -y upgrade
# yum -y install python-openstackclient
# yum -y install openstack-selinux
```

이제 오픈스택 설치 준비가 완료되었습니다.
