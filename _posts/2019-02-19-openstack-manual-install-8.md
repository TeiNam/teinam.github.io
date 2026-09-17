---
date: 2019-02-19 20:56:13 +0900
title: "오픈스택 수동 설치 실습 #.8"
category: dbops
excerpt: "오픈스택 수동 설치 실습 #.8 – Nova : Compute API Compute (Nova) 오픈스택 컴퓨트 (Nova)는 IaaS 시스템의 주가 되는 부분인 클라우드 컴퓨팅 패브릭 컨트롤러(fabric controller)입니다. 컴퓨터 자원의 풀을 관리하고 자동화하도록 설계…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — Nova 가 컴퓨트 파브릭 컨트롤러로서 스케줄러·컨덕터·컴퓨트로 나뉘는 설명은 여전히 유효합니다. 다만 본문에 나오는 nova-consoleauth 와 nova-placement-api 는 현재 Nova 에 없고, Placement 는 Stein 에서 별도 프로젝트로 분리됐으며 2025.2 부터 compute·metadata API 는 WSGI 로만 배포됩니다.

![](/assets/img/wp/2019/02/99426A335C4455FE1E6E6E.jpg)

## Nova 개요

![](/assets/img/wp/2019/02/9978663D5C44581E162423.jpg)

오픈스택 컴퓨트(Nova)는 IaaS 시스템의 주요 부분인 클라우드 컴퓨팅 패브릭 컨트롤러(fabric controller)입니다. 컴퓨터 자원 풀을 관리하고 자동화하도록 설계했으며, 베어 메탈(Bare metal)과 고성능 컴퓨팅(HPC) 구성뿐 아니라 널리 사용되는 가상화 기술들과 함께 동작할 수 있습니다. 하이퍼바이저 기술(가상 머신 모니터)로 KVM, VMware, Xen 중 하나를 선택할 수 있으며, 여기에 Hyper-V 및 LXC 같은 리눅스 컨테이너 기술을 함께 사용할 수 있습니다.

Nova는 Python으로 작성했으며 Eventlet(병행 프로그래밍용), Kombu(AMQP 통신용), SQLAlchemy(데이터베이스 접속용) 같은 여러 외부 라이브러리를 사용합니다. 컴퓨트의 아키텍처는 사유 하드웨어 및 소프트웨어 요구 사항 없이 표준 하드웨어에서 수평적 확장을 하기 위해 설계했으며, 레거시 시스템 및 서드파티 기술과 연동하는 기능을 제공합니다.

기업 수준 인프라스트럭처로의 통합이 확산되면서 일반적으로 오픈스택의 성능을 모니터링하는 것과 특히 Nova의 성능을 측정하는 것이 규모 면에서 매우 중요한 이슈가 되었습니다. 종단 간 성능을 모니터링하려면 Nova, Keystone, Neutron, Cinder, Swift 등의 서비스로부터 메트릭을 추적하는 것뿐 아니라, 메시지 전달을 위해 오픈스택 서비스들이 사용하는 RabbitMQ의 모니터링이 필요합니다.

OpenStack Compute에서는 인증은 OpenStack Identity로, 디스크와 서버 이미지는 OpenStack Image 서비스로, 사용자와 관리자 인터페이스는 OpenStack 대시보드로 상호작용합니다. 이미지 접근은 프로젝트와 사용자에 대해 제한합니다. Quota는 프로젝트당 제한을 말합니다(예: 인스턴스 개수). OpenStack Compute는 표준 하드웨어에서 수평적 확장이 가능하며, 실행하는 인스턴스 이미지를 다운받을 수 있습니다.

## Nova 구성 요소

OpenStack Compute는 다음 부분과 구성 요소로 이루어져 있습니다.

### nova-api 서비스

최종 사용자에 대한 compute API 호출을 허용하고 응답합니다. 이 서비스는 OpenStack Compute API, Amazon EC2 API, 권한이 있는 사용자에 대한 특정 Admin API 관리 작업을 지원합니다. 몇 가지 정책을 적용하고 인스턴스를 실행하는 등의 오케스트레이션 작업을 수행합니다.

### nova-api-metadata 서비스

인스턴스에서의 메타데이터 요청을 허용합니다. nova-api-metadata 서비스는 일반적으로 nova-network를 설치할 때와 다중 호스트 모드를 실행할 때 사용합니다. 더 자세한 내용은 OpenStack Administrator Guide의 Metadata service 부분을 참고하십시오.

### nova-compute 서비스

Worker 데몬은 가상화 API를 이용하여 가상 머신 인스턴스를 생성하고 종료시킵니다. 예를 들어:

- XenServer/XCP에서 사용하는 XenAPI
- KVM 또는 QEMU에서 사용하는 libvirt
- VMware에서 사용하는 VMwareAPI

이 프로세싱은 상당히 복잡합니다. 기본적으로 데몬이 큐에 들어온 작업을 허용하고 KVM 인스턴스를 시스템 명령어로 실행하며, 데이터베이스에 관련 상태값을 업로드합니다.

### nova-scheduler 서비스

큐로부터 가상 머신 인스턴스 요청을 받고, 어떤 compute 서버 호스트에서 실행할 것인지를 결정합니다.

### nova-conductor 모듈

nova-compute 서비스와 데이터베이스 상호작용을 중재합니다. nova-compute 서비스에 의한 클라우드 데이터베이스 직접 접근을 제거합니다. nova-conductor 모듈은 수평적 확장이 가능합니다. 그러나 nova-compute 서비스가 작동 중인 노드에서는 배포하면 안 됩니다. 더 자세한 내용은 Configuration Reference Guide를 확인하십시오.

### nova-cert 모듈

X509 인증서에 대한 nova-cert 서비스를 제공하는 서버 데몬입니다. euca-bundle-image에 대한 인증서를 생성하여 사용합니다. EC2 API를 사용할 때만 필요합니다.

### nova-network worker 데몬

nova-compute 서비스에서 유사한 큐에 대한 네트워킹 작업을 허용하고 네트워크를 조정합니다. IPtable 규칙을 수정하거나 브리지 인터페이스를 설정하는 등의 작업을 합니다.

### nova-consoleauth 데몬

콘솔 프록시를 제공하는 사용자에 대한 인증 토큰을 제공합니다. nova-novncproxy와 nova-xvpvncproxy를 참고하십시오. 이 서비스는 콘솔 프록시 작업이 작동되고 있어야 합니다. 클러스터 구성에서 nova-consoleauth 서비스에 대한 두 종류 프록시를 실행할 수 있습니다. 자세한 내용은 About nova-consoleauth를 살펴봅니다.

> **주의:** 해당 데몬은 18.0.0 버전인 Rocky 버전부터 제거되었고 더 이상 제공되지 않습니다.

### nova-novncproxy 데몬

VNC 연결로 작동 중인 인스턴스 접근에 대한 프록시를 제공합니다. 브라우저 기반의 novnc 클라이언트를 제공합니다.

### nova-spicehtml5proxy 데몬

SPICE 연결로 작동 중인 인스턴스 접근에 대한 프록시를 제공합니다. 브라우저 기반의 HTML5 클라이언트를 제공합니다.

### nova-xvpvncproxy 데몬

VNC 연결로 작동 중인 인스턴스 접근에 대한 프록시를 제공합니다. OpenStack 전용 Java 클라이언트를 제공합니다.

### nova-cert 데몬

X509 인증서를 다룹니다.

### nova 클라이언트

테넌트 관리자나 최종 사용자가 명령을 제공하는 클라이언트입니다.

### 큐

데몬 간 메시지를 전달하기 위한 중앙 허브입니다. 일반적으로 RabbitMQ로 구현되며, Zero MQ 같은 다른 AMQP 메시징 큐로도 구현할 수 있습니다.

### SQL 데이터베이스

클라우드 인프라에 대한 구축 중과 작동 중인 상태를 저장합니다. 다음 내용을 포함합니다:

- 사용 가능한 인스턴스 타입
- 사용 중인 인스턴스
- 사용 가능한 네트워크
- 프로젝트
