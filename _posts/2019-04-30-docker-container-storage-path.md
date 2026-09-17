---
date: 2019-04-30 19:49:56 +0900
title: "Docker 기본 컨테이너 저장 경로 변경"
category: dbops
excerpt: "Docker 기본 컨테이너 저장 경로 변경 기본적으로 docker는 / (root 파티션) 아래에 기본 저장 경로를 가지고 있습니다. 만약 데이터를 쌓는 컨테이너를 포함하게 되면, 무한정 늘어나는 컨테이너 때문에 파티션 Full 발생에 의한 장해를 겪을 수..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 제시한 `dockerd daemon -g /new/path/docker` 는 두 옵션 모두 제거되었습니다 — `docker daemon` 서브커맨드는 v17.12, `-g`/`--graph` 는 v23.0 에서 삭제되고 `--data-root`(또는 /etc/docker/daemon.json 의 data-root)로 대체되었습니다. 또한 유닛 파일 직접 편집보다 systemd drop-in 또는 daemon.json 이 권장됩니다.

![Docker](/assets/img/wp/2019/04/docker_facebook_share.png)

**Docker 기본 컨테이너 저장 경로 변경**

기본적으로 docker는 / (root 파티션) 아래에 기본 저장 경로를 가지고 있습니다.

만약 데이터를 쌓는 컨테이너를 포함하게 되면, 무한정 늘어나는 컨테이너 때문에 파티션 Full 발생에 의한 장애를 겪을 수 있습니다.

현재 버전(Docker-ce 18버전 이상)을 설치하면 /lib/systemd/system/docker.service 부분이 생깁니다.

해당 부분을 vi 로 편집해 줍니다.

```ini
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
BindsTo=containerd.service
After=network-online.target firewalld.service containerd.service
Wants=network-online.target
Requires=docker.socket

[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
ExecReload=/bin/kill -s HUP $MAINPID
TimeoutSec=0
RestartSec=2
Restart=always

# Note that StartLimit* options were moved from "Service" to "Unit" in systemd 229.
# Both the old, and new location are accepted by systemd 229 and up, so using the old location
# to make them work for either version of systemd.
StartLimitBurst=3
...
...
...
...
```

이렇게 안쪽 내용이 보입니다.

변경 부분은 ExecStart 부분입니다. -g 옵션을 주고, docker 컨테이너가 저장될 경로를 지정해 주면 됩니다.

FROM:  
ExecStart=/usr/bin/dockerd daemon -H fd://

TO:  
ExecStart=/usr/bin/dockerd daemon -g /new/path/docker -H fd://

그리고 나서 `systemctl restart docker` 해주면 됩니다.
