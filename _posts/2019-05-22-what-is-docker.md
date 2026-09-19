---
date: 2019-05-22 13:46:24 +0900
title: "Docker 란?"
category: etc
excerpt: "Docker는 컨테이너 기술을 활용해 애플리케이션을 패키징하고 배포하는 오픈소스 플랫폼입니다. 리눅스 커널 기능과 Union 파일시스템을 결합해 격리된 실행 환경을 제공합니다."
updated: 2026-09-20
---

Docker는 `Namespace`, `cgroups`, `SELinux`, `AppArmor` 프로파일을 비롯한 여러 리눅스 커널 기능을 Union 파일시스템과 결합해 이미지를 모듈 방식으로 구성합니다. WORA(Write-Once-Run-Anywhere) 원칙을 실현할 수 있고, 여러 프로세스가 협업하는 분산 시스템을 구축할 수 있으며 확장성이 뛰어납니다.

Docker Engine은 현재 `overlay2`를 기본 스토리지 드라이버로 사용합니다. 이전에 사용되던 `AUFS`는 v19.03에서 deprecated되고 v24.0에서 제거되었습니다.

성능이 뛰어나고 어디서나 복제할 수 있는 구조를 지원하는 동시에, 애플리케이션 개발의 네 가지 핵심 특성을 제공합니다.

- 자율성 (autonomy)
- 분산화 (decentralization)
- 병렬성 (parallelism)
- 격리성 (isolation)

마이크로서비스 아키텍처가 널리 보급되면서 도커가 더욱 부각되고 있습니다. 구글, VMWare, MS을 비롯한 대기업들이 자사의 인프라스트럭처에 도커를 활용 중입니다.

마이크로서비스란 소프트웨어 시스템을 개발하고 구성하는 방법 중 하나로, 각 서비스를 독립적인 배포 단위로 구성하는 아키텍처를 가지고 있습니다. `scale up`이 아닌 부하 분산 처리 방식인 `scale out`에 맞춰 설계되어 있기 때문에 독립적인 배포 단위로 도커 컨테이너를 선택하는 경우가 많습니다.

도커는 분산 환경을 구축하는 클라우드 서비스와 잘 어울리며, 주요 클라우드 프로바이더들은 모두 컨테이너 실행 환경을 관리하는 서비스를 제공합니다. 아마존의 엘라스틱 컨테이너 서비스, MS의 애저 컨테이너 인스턴스, 구글의 GCP K8s 엔진 같은 서비스들이 있습니다.

Docker의 목적은 컨테이너 표준화로 얻을 수 있는 장점을 IT로 가져오는 것입니다. 개발자는 다양한 환경에서 반복 테스트를 거치지 않아도 되므로 개발에 집중할 수 있습니다.

Docker Engine은 컨테이너를 운영하기 위한 빠르고 간편한 인터페이스를 제공하여 시스템 운영에서도 효율적입니다. Docker Engine은 Apache License 2.0으로 배포되는 오픈소스이며, Docker Hub는 다운로드할 수 있는 컨테이너 이미지를 제공합니다.

Docker Desktop은 Docker CLI, Docker Engine, Compose 등을 포함한 개발 환경입니다. Docker Desktop은 직원 250명 미만이면서 연 매출 1천만 달러 미만인 소규모 조직, 개인, 교육, 비상업적 오픈소스 프로젝트에서는 무료로 사용할 수 있습니다. 이 기준을 초과하는 조직에서 상업적으로 사용하는 경우 유료 구독이 필요합니다.

Docker와 VM은 모두 가상화 기술에 해당하지만, Docker는 OS 커널을 공유하면서 애플리케이션 수준의 격리를 제공합니다. VM에 비해 리소스 사용량이 적고 시작 속도가 빠르지만, VM이 제공하는 OS 수준의 완전한 격리를 대체할 수는 없습니다.

![도커 아키텍처 비교](/assets/img/wp/2019/05/docker.png)

## Docker 컨테이너의 장점

- **빠른 애플리케이션 배포**: 컨테이너는 VM보다 시작 속도가 빠르고 배포가 간편합니다.
- **이식성**: Docker 컨테이너는 호환성 문제를 신경 쓰지 않고 다양한 환경에서 동일하게 동작합니다.
- **쉬운 공유**: Docker Hub 같은 공용 레지스트리나 사설 레지스트리를 통해 이미지를 공유할 수 있습니다.
- **효율적인 자원 사용**: 이미지 레이어를 공유하므로 디스크 사용량과 네트워크 대역폭이 절약됩니다.
- **재사용성**: 레이어 구조 덕분에 버전 관리가 쉽고 이전 버전으로 되돌리기도 간편합니다.

## Docker 아키텍처

Docker Engine은 클라이언트-서버 구조로 동작합니다. `docker` CLI 클라이언트가 REST API를 통해 `dockerd` 데몬에 명령을 전달하고, 데몬이 컨테이너, 이미지, 네트워크, 볼륨을 관리합니다.

Docker는 내부적으로 `containerd`를 고수준 컨테이너 런타임으로, `runc`를 저수준 런타임으로 사용합니다. containerd는 원래 Docker 내부 컴포넌트였으나 CNCF에 기부되어 독립 프로젝트가 되었고, Kubernetes의 CRI(Container Runtime Interface) 호환 런타임으로 채택되었습니다.

## Kubernetes와 Docker

Kubernetes는 v1.20에서 컨테이너 런타임으로서의 Docker 지원을 deprecated하고, v1.24에서 dockershim을 완전히 제거했습니다. Kubernetes는 CRI를 구현하지 않는 Docker 대신 containerd나 CRI-O 같은 CRI 호환 런타임을 직접 사용합니다. Docker로 빌드한 이미지는 OCI 표준이므로 Kubernetes에서 그대로 사용할 수 있습니다.

## Docker Compose

애플리케이션을 여러 컨테이너로 구성할 때는 Docker Compose를 사용합니다. Python 기반의 `docker-compose`(v1)는 더 이상 유지보수되지 않으며, Go로 재작성되어 Docker CLI에 통합된 `docker compose`(v2)로 대체되었습니다.
