---
date: 2019-02-24 15:46:43 +0900
title: "CentOS 7 에서 방화벽에 PostgreSQL 리스너 포트 등록하기"
category: postgresql
excerpt: "접근제어 PostgreSQL은 pg_hba.conf를 통해 접근제어를 할 수 있으나, 성능상의 이슈로 인해 OS단이나 방화벽 장비, 보안장비에서 제어하는 것을 추천 한다고 했습니다. CentOS 7 에서는 새로나온 Firewalld 와 기존의 iptables 모두 사용 가능 합니다…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — firewall-cmd·iptables 명령 자체는 지금도 동작하지만 전제 OS 인 CentOS 7 이 2024-06-30 EOL 이라 설치·운영 기준으로 삼을 수 없다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

**접근제어**

PostgreSQL은 pg_hba.conf를 통해 접근제어를 할 수 있으나, 성능상의 이슈로 인해 OS단이나 방화벽 장비, 보안장비에서 제어하는 것을 추천합니다.

CentOS 7에서는 새로 나온 Firewalld와 기존의 iptables 모두 사용 가능합니다.

**firewalld 의 설정**

```bash
# firewall-cmd --permanent --zone=trusted --add-source=<Client IP address>/32
# firewall-cmd --permanent --zone=trusted --add-port=5432/tcp
# firewall-cmd --reload
```

**iptables 설정**

```bash
# iptables -A INPUT -p tcp -s 0/0 --sport 1024:65535 -d <Server IP address> --dport 5432 -m state --state NEW,ESTABLISHED -j ACCEPT
# iptables -A OUTPUT -p tcp -s <Server IP address> --sport 5432 -d 0/0 --dport 1024:65535 -m state --state ESTABLISHED -j ACCEPT
```
