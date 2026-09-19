---
date: 2019-07-30 11:58:33 +0900
title: "MariaDB, MySQL max_connections 값 변경"
category: mysql
excerpt: "MySQL/MariaDB의 동시 접속 상한인 max_connections를 올리려면 데이터베이스 설정뿐 아니라 OS의 파일 디스크립터 한도도 함께 조정해야 합니다. systemd 환경에서는 서비스 유닛의 LimitNOFILE를 설정합니다."
updated: 2026-09-20
---

> **NOTE** — 이 글은 MySQL 8.4 LTS 및 MariaDB 기준으로 작성되었습니다. systemd로 관리되는 환경(대부분의 최신 Linux 배포판)을 기준으로 합니다.

## max_connections의 의미

`max_connections`는 MySQL/MariaDB가 허용하는 동시 클라이언트 접속 수의 상한입니다. 기본값은 MySQL 8.4 기준 **151**입니다.

접속이 `max_connections`를 초과하면 클라이언트는 다음 에러를 받습니다:

```text
ERROR 1040 (HY000): Too many connections
```

### 관리자 접속 슬롯

MySQL은 실제로 **`max_connections` + 1**개의 접속을 허용합니다. 추가 슬롯은 `CONNECTION_ADMIN` 권한(또는 deprecated된 `SUPER` 권한)을 가진 계정만 사용할 수 있습니다. 서버가 포화 상태일 때 관리자가 접속해 `SHOW PROCESSLIST` 같은 명령으로 문제를 진단할 수 있도록 하기 위함입니다.

```sql
-- 관리자 계정에 CONNECTION_ADMIN 권한 부여
GRANT CONNECTION_ADMIN ON *.* TO 'admin'@'localhost';
```

> **NOTE** — MySQL 8.0부터 `SUPER` 권한은 deprecated되었고, `CONNECTION_ADMIN`, `SYSTEM_VARIABLES_ADMIN` 등 여러 동적 권한으로 쪼개졌습니다.

### MariaDB의 별도 관리 포트

MariaDB는 관리자 슬롯 대신 **접속 전용 포트**를 하나 더 열 수 있습니다. `extra_port`로 포트를 지정하고 `extra_max_connections`로 그 포트의 접속 수를 제한합니다. 둘 다 기동 전에 설정 파일에 넣어야 하고, 접속할 때 클라이언트의 `-P`로 포트를 지정합니다.

```ini
[mysqld]
extra_port = 8385
extra_max_connections = 10
```

이 포트는 스레드 풀을 쓰지 않고 예전의 접속당 스레드 방식으로 동작합니다. 그래서 스레드 풀이 전부 막혀 정문으로 들어갈 수 없을 때도 접속이 됩니다. MySQL에는 이 기능이 없습니다.

기본값은 제품과 빌드에 따라 다르므로, 운영 중인 서버에서는 값을 가정하지 말고 `SHOW VARIABLES LIKE 'max_connections'`로 직접 확인합니다.

## 접속 수를 결정하는 요소

`max_connections`를 올리려고 할 때 다음 요소들이 실제 상한을 결정합니다:

1. **파일 디스크립터** — 각 접속은 파일 디스크립터를 소비합니다. `open_files_limit`과 OS의 `ulimit -n`(또는 systemd `LimitNOFILE`)이 충분해야 합니다.
2. **메모리** — 각 접속은 커넥션 버퍼(`read_buffer_size`, `sort_buffer_size` 등)를 소비합니다. 접속 수를 무작정 늘리면 메모리 부족이 발생할 수 있습니다.
3. **스레드 경합** — 접속 수가 많아지면 스레드 스케줄링 오버헤드가 증가합니다.

## 설정 방법

### 1. 데이터베이스 설정

`/etc/my.cnf` 또는 `/etc/my.cnf.d/server.cnf`에 다음을 추가합니다:

```ini
[mysqld]
max_connections = 500
```

### 2. systemd 서비스 제한 조정

파일 디스크립터 한도를 올리기 위해 systemd 서비스 오버라이드를 생성합니다:

```bash
# MySQL
sudo mkdir -p /etc/systemd/system/mysqld.service.d
sudo vi /etc/systemd/system/mysqld.service.d/override.conf

# 또는 MariaDB
sudo mkdir -p /etc/systemd/system/mariadb.service.d
sudo vi /etc/systemd/system/mariadb.service.d/override.conf
```

다음 내용을 추가합니다:

```ini
[Service]
LimitNOFILE=10000
```

> **IMPORTANT** — systemd로 시작되는 서비스는 `/etc/security/limits.conf` 설정을 따르지 않습니다. 반드시 systemd 서비스 유닛에 `LimitNOFILE`을 설정해야 합니다.

### 3. 변경사항 적용

```bash
sudo systemctl daemon-reload
sudo systemctl restart mysqld   # 또는 mariadb
```

### 4. 확인

```sql
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'open_files_limit';
```

## 주의사항

- **커넥션 풀링 사용** — 애플리케이션 레벨에서 커넥션 풀을 사용하면 데이터베이스 접속 수를 줄일 수 있습니다.
- **메모리 계산** — 접속당 메모리 사용량을 계산하여 시스템 메모리를 초과하지 않도록 합니다.
- **모니터링** — `SHOW STATUS LIKE 'Max_used_connections'`로 실제 사용된 최대 접속 수를 확인하여 적절한 값을 설정합니다.
