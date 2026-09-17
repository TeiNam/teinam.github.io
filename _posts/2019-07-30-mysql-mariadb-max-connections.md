---
date: 2019-07-30 11:58:33 +0900
title: "MariaDB, MySQL max_connections 값 변경"
category: mysql
excerpt: "MariaDB, MySQL max_connections 값 변경 max_connections 값이 작으면 그냥 변경해도 변경이 됩니다. 그러나 1000 이상의 값을 가지게 되면 에러가 떨어지면서 적용하려면 OS 커널 파라미터의 튜닝이 필요합니다. # vi /etc/my.cnf.d/…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — systemd 서비스에 LimitNOFILE drop-in 을 두고 open_files_limit 을 올리는 절차는 현행 systemd 배포판에서도 유효합니다. 다만 /etc/security/limits.d/90-nproc.conf 는 EL6 시절 경로이고 systemd 로 기동되는 데몬에는 limits.conf 가 적용되지 않으므로, 서비스 drop-in 설정만으로 충분합니다.

![](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

## MariaDB, MySQL max_connections 값 변경

> **전제:** Linux (systemd), MariaDB/MySQL, root 권한

max_connections 값이 1000 미만이면 변경할 수 있습니다. 그러나 1000 이상으로 설정하려면 에러가 발생하며, OS 커널 파라미터를 튜닝해야 합니다.

## vi /etc/my.cnf.d/server.cnf

```bash
open_files_limit = 4096
max_connections = 2000
```

## vi /usr/lib/systemd/system/mariadb.service.d/limit_nofile.conf

```ini
[Service]
LimitNOFILE=4096
```

## systemctl daemon-reload
## systemctl restart mariadb

## vi /etc/sysctl.conf

```bash
fs.file-max = 65536
```

## sysctl -p

## vi /etc/security/limits.conf

```bash
*        soft        nproc        40960
*        hard        nproc        40960
*        soft        nofile       40960
*        hard        nofile       40960
```

## vi /etc/security/limits.d/90-nproc.conf

```bash
*        soft        nproc        40960
*        hard        nproc        40960
*        soft        nofile       40960
*        hard        nofile       40960
```

## systemctl restart mariadb
