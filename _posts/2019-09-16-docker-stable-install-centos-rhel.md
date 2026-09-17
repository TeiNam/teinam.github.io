---
date: 2019-09-16 21:52:58 +0900
title: "[CentOS&RHEL] Docker stable 버전 설치"
category: dbops
excerpt: "Docker 엔진 설치 (CentOS, RHEL 기준) 필수 패키지 설치 yum install -y yum-utils device-mapper-persistent-data lvm2 Docker Repository 설치 yum-config-manager –add-repo https:…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 저장소 URL(download.docker.com/linux/centos/docker-ce.repo) 은 그대로지만, 공식 문서는 CentOS Stream 9/10 만 지원하며 명령이 `dnf config-manager` 와 `dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin` 로 바뀌었습니다. 본문 대상인 CentOS 7 은 2024-06-30 EOL 이고, 링크한 docs.docker.com/install/ 경로도 /engine/install/ 로 이동했습니다.

![Docker](/assets/img/wp/2019/04/docker_facebook_share.png)

## Docker 엔진 설치 (CentOS, RHEL 기준)

Docker 공식 문서의 내용을 빠른 참조를 위해 정리했다. 자세한 내용은 [CentOS Docker CE 설치 가이드](https://docs.docker.com/install/linux/docker-ce/centos/)를 참고한다.

### 필수 패키지 설치

```bash
yum install -y yum-utils device-mapper-persistent-data lvm2
```

### Docker Repository 설치

```bash
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
```

### Docker 엔진 설치

```bash
yum install docker-ce docker-ce-cli containerd.io
```

다른 OS의 설치 방법은 [Docker 공식 설치 가이드](https://docs.docker.com/install/)를 참고한다.
