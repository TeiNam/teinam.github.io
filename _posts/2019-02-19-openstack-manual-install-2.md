---
date: 2019-02-19 01:23:59 +0900
title: "오픈스택 수동 설치 실습 #.2"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.2 – 네트워크 구성에 대한 이해 오픈스택을 처음 설치 하는 분들이 이 부분을 처음에 안 짚고 가면 나중에 Neutron 설치 부분에서 멘붕이 올 수 있습니다. 네트워크를 어떻게 해야하지? 라는..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — Management·Private·Storage·External 네트워크 구분과 Provider·Self-service 구성의 차이는 현재 설치 가이드에서도 그대로 쓰이는 개념입니다. 다만 지금 Neutron 문서의 표준 구현은 Open vSwitch 와 OVN 이며, OVN 은 L2 에이전트 없이 자체 L3·DHCP·메타데이터를 제공합니다.

![](/assets/img/wp/2019/02/99CE9C4A5C41B5C01A84F9.jpg)

## 오픈스택 수동 설치 실습 #.2 – 네트워크 구성 이해

오픈스택을 처음 설치하는 분들이 이 부분을 처음에 안 짚고 가면 나중에 Neutron 설치 부분에서 멘붕이 올 수 있습니다.

네트워크를 어떻게 해야 하지? 라는 의문이 들 겁니다.

![](/assets/img/wp/2019/02/9908684C5C41B5FB229589.png)

본 네트워크 레이아웃은 가장 최소한의 네트워크 레이아웃입니다.

그런데 Neutron을 설치하면서 두 가지 상황을 마주하게 됩니다. Provider Network와 Self-service Network 구성입니다.

## 네트워크의 종류

**Management Network** – 각 요소 간 네트워크입니다. 서로 API를 호출하는 데 사용합니다. Compute, Network, Control Node, 그리고 스토리지와 연결되어 있습니다.

**Private Network** – VM의 네트워크를 구성하는 데 사용하는 네트워크입니다. GRE, VxLAN 등의 기술이 사용됩니다. Compute, Network Node 간에 연결되어 있습니다. 이 Private Network는 Tunnel Network, Overlay Network, VM Data Network 등으로 불리기도 합니다.

**Storage Network** – 블록 스토리지용 네트워크로 Compute Node와 스토리지 간에 연결되어 있습니다.

**External Network** – Horizon 접속 또는 유저들이 VM에 접속하기 위한 네트워크로 Network 및 Control Node 간에 연결되어 있습니다.

그런데 네트워크를 Neutron 상에서 설정하기 위한 방식으로 나눌 수도 있습니다.

**Provider Network** – 서비스 제공자가 구축한 네트워크입니다. 이 네트워크는 인터넷에 연결되어 있는 네트워크입니다. 그래서 앞서 이야기한 External Network에 대응합니다.

**Self-Service Network** – 사용자가 직접 VM을 위해 구축한 네트워크입니다. Provider Network를 기반으로 GRE, VxLAN 등의 터널링을 통해 구축합니다.

그럼 두 가지 레이아웃을 비교해 봅시다.

![](/assets/img/wp/2019/02/99C99A475C41B66115310B.png)

![](/assets/img/wp/2019/02/998A96475C41B6610618DD.png)

뭔가 다르죠?

Open vSwitch를 구성하면 가상 스위치가 노드에 생성됩니다.

랜 포트는 하나지만, 이를 통해 여러 개의 NIC가 서비스될 수 있습니다.

Self-service Network는 터널링 구성을 통해 Compute 노드가 생성한 VM끼리 통신할 수 있고, 사설 IP 대역을 이용하므로 공인 IP 사용이 줄어듭니다. Floating IP를 구성하면 외부 인터넷 망과도 통신할 수 있습니다. Floating 설정이 없으면 터널링 네트워크는 클라우드 내부에서만 통신이 가능합니다.

어떻게 네트워크를 구성할 것인가는 사전 기획 단계에서 충분히 논의되어야 하고, 실습 환경에서는 원하시는 대로 진행하시면 됩니다.
