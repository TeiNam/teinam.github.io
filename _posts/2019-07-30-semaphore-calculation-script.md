---
date: 2019-07-30 11:49:05 +0900
title: "시스템 사양에 맞는 세마포어 값 계산해주는 스크립트"
category: dbops
excerpt: "시스템 사양에 맞는 세마포어 값 계산해주는 스크립트 shmmax, shmall 계산 DB를 설치하고 사용 할 때, 많이 수정하는 OS 커널 파라미터 입니다. postgresql 이나, mysql의 max_connections 값을 조정하거나 오라클을 설치할 때도 기본적으로 수정을…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — 스크립트의 shmmax/shmall 계산식 자체는 그대로 동작하지만, PostgreSQL 은 기본적으로 익명 mmap 공유 메모리를 사용해 공식 문서가 '기본 공유 메모리 설정으로 충분하다'고 명시한다(shared_memory_type=sysv 로 되돌린 경우만 예외). System V 공유 메모리를 쓰는 Oracle 계열에는 여전히 유효하다.

![](/assets/img/wp/2019/02/수정됨_fcfdee7682c7e8e8a9a10b10f770b890.png)

## 시스템 사양에 맞는 세마포어 값 계산해주는 스크립트

### shmmax, shmall 계산

DB를 설치하고 사용할 때 많이 수정하는 OS 커널 파라미터입니다.

PostgreSQL이나 MySQL의 max_connections 값을 조정하거나 Oracle을 설치할 때도 기본적으로 수정을 합니다.

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

출처: <https://gist.github.com/redterror/6732387>
