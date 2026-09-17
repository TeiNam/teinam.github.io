---
date: 2019-02-19 01:15:51 +0900
title: "오픈스택 수동 설치 실습 #.1"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.1 – OS 준비 일단 오픈스택을 수동으로 설치를 해보면 오픈스택을 이해하기에 조금 더 도움이 됩니다. 그러니 VM 환경에다가 구축 실습을 해봅니다. 설치 버전은 rocky 버전으로 가장 최신 버전이며, 설치하면서..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — OpenStack Rocky 는 2023년 8월 16일 EOL 되었고 CentOS 7 도 2024년 6월 30일 지원이 끝났습니다. 두 전제가 모두 사라져 이 OS 준비 절차대로는 실습을 시작할 수 없습니다.

![](/assets/img/wp/2019/02/99855C355C419CA40A333E.jpg)

**오픈스택 수동 설치 실습 #.1 – OS 준비**

일단 오픈스택을 수동으로 설치를 해보면 오픈스택을 이해하기에 조금 더 도움이 됩니다. 그러니 VM 환경에다가 구축 실습을 해봅니다. 설치 버전은 rocky 버전으로 가장 최신 버전이며, 설치하면서 부분별로 함께 설명하겠습니다.

<https://docs.openstack.org/rocky/install/>

해당 공식 설치 문서를 참고하여 진행합니다.

CentOS 7 버전을 이용해 OS를 준비해 보겠습니다.

하드웨어 설정에 controller 노드의 용량은 RAM 4GB, HDD 50GB 입니다.

compute 노드는 RAM 2GB, HDD 50GB 입니다.

![](/assets/img/wp/2019/02/9935FA365C419DF30639BF.png)

![](/assets/img/wp/2019/02/99277F365C419DF32E83BE.png)

보안 정책을 꺼줍니다.

![](/assets/img/wp/2019/02/9920C0365C419DF40766F5.png)

KDUMP도 꺼버립니다.

![](/assets/img/wp/2019/02/999EA5365C419DF4359192.png)

네트워크 인터페이스 카드(NIC) 설정입니다.

ens32는 Bridge 네트워크로 Provider Network가 될 부분입니다. DHCP로 놔두어도 상관 없습니다.

![](/assets/img/wp/2019/02/999A5C365C419DF435F3DE.png)

![](/assets/img/wp/2019/02/992217365C419DF507461E.png)

![](/assets/img/wp/2019/02/9936EC365C419DF506A024.png)

![](/assets/img/wp/2019/02/9961B1395C419DF6062D32.png)

ens33은 NAT로 구성했습니다.

VM의 네트워크 매니저에서 10.0.0.0/24 대역으로 구성했습니다. Management Network로 구성될 부분입니다.

![](/assets/img/wp/2019/02/998CC9395C419DF60FF901.png)

![](/assets/img/wp/2019/02/99F82A395C419DF642F379.png)

![](/assets/img/wp/2019/02/993114395C419DF70866A7.png)

![](/assets/img/wp/2019/02/999D86395C419DF70E45EC.png)

파티션은 원하는 대로 설정해도 되고, 그냥 기본으로 설치해도 됩니다.

용량은 50GB 할당 했습니다.

![](/assets/img/wp/2019/02/991480395C419DF709BC75.png)

네트워크 통신이 된다면 NTP도 되겠죠?

![](/assets/img/wp/2019/02/994D11395C419DF80725B1.png)

설치되는 동안 ROOT의 패스워드를 설정해주고 완료 되면, Reboot 합니다.

![](/assets/img/wp/2019/02/99E04D395C419DF80B138A.png)

![](/assets/img/wp/2019/02/995BDE3E5C419F60118DBE.png)

미니멀로 설치 했기 때문에 터미널 모드로 부팅합니다.

편한 작업을 위한 SSH 설정을 위해 sshd\_config 파일을 수정해 줍니다.

```bash
# vi /etc/ssh/sshd_config
```

PermitRootLogin yes

해당 부분 주석 해제

```bash
# vi /etc/selinux/config

SELINUX=disable
```

이 부분은 선택입니다. 오픈스택은 SELINUX를 사용해 보안 설정을 할 수 있기 때문에 사용하기도 합니다. 그런데 저는 MariaDB가 아닌 PostgreSQL을 기본 DB로 선택할 것이기 때문에 SELINUX가 PostgreSQL에서 문제가 발생 할 수있는 여지가 있어 해제하고 설치를 진행합니다.

```bash
# yum -y install net-tools vim
```

ifconfig 같은 명령이나 vim이 없기 때문에 설치를 진행 합니다.

프로파일을 수정합니다.

```bash
# vi .bash_profile
```

아래 항목을 추가해서 노드가 헷갈리지 않게 합니다.

그리고 기본 에디터를 vim으로 사용하기 위해 설정을 해줍니다.

```bash
export PS1="\[\e[36;1m\]\u@\[\e[32;1m\]\h:\[\e[31;1m\]\w]# \[\e[0m\]"
export TERM=linux
alias vi='vim $*'
```

그리고 SELINUX 설정을 적용하기 위해 재부팅을 한번 해줍니다.

Controller Node의 준비가 끝났습니다.

이와 같은 방식으로 Compute Node와 Block Storage Node, Network Node를 준비하시면 됩니다.

Block Storage Node와 Network Node는 옵션입니다. 최소 controller와 compute만 있어도 설치는 가능합니다.

VM을 복사해서 hostname과 ip를 바꿔서 만들어도 상관 없습니다.

![](/assets/img/wp/2019/02/99C5FC425C41AEE51B458F.png)

.bash\_profile의 프롬프트 설정 부분의 가운데 숫자 (export PS1 …. 32->33) 변경하니 노드의 색이 바뀌었습니다.

두 노드를 왔다 갔다 하면서도 쉽게 구분 할수 있겠죠?
