---
date: 2019-07-30 11:49:05 +0900
title: "시스템 사양에 맞는 세마포어 값 계산해주는 스크립트"
category: database
excerpt: "System V 공유 메모리 파라미터(shmmax, shmall)를 시스템 메모리 기준으로 계산하는 스크립트입니다. PostgreSQL은 기본 설정에서 mmap을 사용하므로 필요하지 않지만, Oracle이나 PostgreSQL의 shared_memory_type=sysv 설정 시 유용합니다."
updated: 2026-09-20
---

## 공유 메모리 파라미터 계산 스크립트

### 적용 대상

이 스크립트는 **System V 공유 메모리**를 사용하는 데이터베이스의 `shmmax`, `shmall` 값을 계산합니다.

**PostgreSQL**: 기본 설정(`shared_memory_type = mmap`)에서는 익명 mmap 공유 메모리를 사용하므로 이 스크립트가 필요하지 않습니다. `shared_memory_type = sysv`로 명시한 경우에만 적용됩니다.

**Oracle 계열**: System V 공유 메모리를 사용하므로 여전히 유효합니다.

### shmsetup.sh

```bash
#!/bin/bash
# http://archives.postgresql.org/pgsql-admin/2010-05/msg00285.php
# Output lines suitable for sysctl configuration based
# on total amount of RAM on the system.  The output
# will allow up to 50% of physical memory to be allocated
# into shared memory.

# On Linux, you can use it as follows (as root):
#
# ./shmsetup >> /etc/sysctl.conf
# sysctl -p

# Early FreeBSD versions do not support the sysconf interface
# used here.  The exact version where this works hasn't
# been confirmed yet.

page_size=`getconf PAGE_SIZE`
phys_pages=`getconf _PHYS_PAGES`

if [ -z "$page_size" ]; then
  echo Error:  cannot determine page size
  exit 1
fi

if [ -z "$phys_pages" ]; then
  echo Error:  cannot determine number of memory pages
  exit 2
fi

shmall=`expr $phys_pages / 2`
shmmax=`expr $shmall \* $page_size`

echo \# Maximum shared segment size in bytes
echo kernel.shmmax = $shmmax
echo \# Maximum number of shared memory segments in pages
echo kernel.shmall = $shmall
```

### 파라미터 설명

- `kernel.shmmax` — 단일 공유 메모리 세그먼트의 최대 크기 (바이트)
- `kernel.shmall` — 시스템 전체 공유 메모리의 최대 크기 (페이지 수)

스크립트는 물리 메모리의 50%를 공유 메모리로 할당할 수 있도록 값을 계산합니다.

### 적용 방법

```bash
./shmsetup.sh >> /etc/sysctl.conf
sysctl -p
```

### System V 세마포어

PostgreSQL의 세마포어 요구량은 `postgres -D $PGDATA -C num_os_semaphores` 명령으로 확인할 수 있습니다. Linux와 FreeBSD는 POSIX 세마포어를 사용하므로 커널 제한이 없습니다.

출처: <https://gist.github.com/redterror/6732387>
