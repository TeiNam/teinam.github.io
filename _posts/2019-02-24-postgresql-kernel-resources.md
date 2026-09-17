---
date: 2019-02-24 16:24:27 +0900
title: "PostgreSQL 커널 리소스 관리"
category: postgresql
excerpt: "공유 메모리 및 세마포어 공유 메모리 및 세마포어는 통칭 “System V IPC”라고 합니다. 윈도우 외에, PostgreSQL이 이러한 기능에 대한 자체적인 구현을 제공하는 경우 PostgreSQL을 실행하기 위해 이러한 기능이 요구됩니다. PostgreSQL은 서버 사본별로…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 리눅스는 System V 대신 POSIX 세마포어를 쓰므로 SEMMNS 조정 설명이 맞지 않고, 현재 공식 산식은 max_connections 합산식이 아니라 num_os_semaphores 기반(ceil(num_os_semaphores/16)*17)이다. autovacuum_max_workers 대신 autovacuum_worker_slots 가 슬롯을 결정한다. SHMMAX 48바이트 서술과 huge page 언급은 유효하다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

**공유 메모리 및 세마포어**

> **전제조건:** 이 설정은 Linux 시스템을 기준으로 하며, root 권한이 필요합니다.

공유 메모리 및 세마포어는 통칭 "System V IPC"라고 합니다. 윈도우 외에, PostgreSQL이 System V IPC에 대한 자체적인 구현을 제공하는 경우 PostgreSQL을 실행하기 위해 System V IPC가 요구됩니다.

PostgreSQL은 서버 사본별로 System V 공유 메모리 수 바이트가 필요합니다. (64비트 플랫폼의 경우 보통 48바이트)

서버 사본은 다수 실행 중이거나 다른 애플리케이션도 System V 공유 메모리를 사용중인 경우 바이트 단위의 공유 메모리 최대 크기인 SHMMAX를 늘려야 하거나 시스템 차원(system-wide)의 System V 공유 메모리인 SHMALL을 늘려야 할 수 있습니다. SHMALL은 여러 시스템에서 바이트 단위가 아니라 페이지 단위로 처리된다는 점에 유의해야 합니다.

PostgreSQL은 16개 한 세트로, 허용된 연결당 (max_connections) 및 autovacuum worker 프로세스당(autovacuum_max_workers) 1개의 세마포어를 사용합니다. 시스템에서 세마포어 최대 수는 SEMMNS에 의해 설정되며, 따라서 최소한 max_connection + autovacuum_max_workers + 각각 허용된 16개의 연결에 1추가 + worker여야 합니다. 각각의 세트마다 다른 애플리케이션에서 사용되는 세마포어 세트와의 충돌을 감지하기 위한 "매직 넘버"가 17번째 세마포어에 포함되어 있습니다.

SEMMNS는 최소한 `ceil((max_connection + autovacuum_max_workers + 4) / 16) * 17`에 다른 애플리케이션의 여유분을 더한 값이어야 합니다.

**리눅스에서의 세마포어**

최대 세그먼트 크기 기본값은 32MB 이며, 최대 총 크기 기본값은 2097152 페이지 입니다. "huge page"를 이용한 특수 커널 구성일 때 외에는 페이지는 거의 항상 4096바이트 입니다. (확인하려면 `getconf PAGE_SIZE`를 사용합니다).

공유 메모리 크기설정은 sysctl 인터페이스를 통해 변경이 가능합니다. 예를 들어, 16GB를 허용하려면 다음과 같이 합니다.

```bash
# sysctl -w kernel.shmmax=17179869184
# sysctl -w kernem.shmall=4194304
```

또한, /etc/sysctl.conf 파일에서 리부팅 사이에서도 이 설정을 보존할 수 있습니다.
