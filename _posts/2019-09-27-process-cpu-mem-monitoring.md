---
date: 2019-09-27 11:21:17 +0900
title: "Process 별로 CPU, MEM 사용량 모니터링"
category: etc
excerpt: "모니터링 툴이 없을 때 ps 명령으로 프로세스별 CPU·메모리 사용량을 주기적으로 기록하는 스크립트입니다. RSS는 물리 메모리, VSZ는 가상 메모리, %cpu는 프로세스 수명 전체의 평균입니다."
updated: 2026-09-20
---

모니터링 툴이 없을 때 `ps` 명령으로 프로세스별 자원 사용량을 주기적으로 기록하는 방법입니다.

```bash
#!/bin/bash
LOG_FILE=test.log
while true
do
date >> $LOG_FILE
ps -U postgres -o user,pid,ppid,rss,pcpu,pmem,size,vsize,time,cmd --sort -rss >> $LOG_FILE
sleep 3
done
```

로그 파일에 3초마다 특정 프로세스 소유자의 프로세스 자원 사용량을 기록합니다.

## 출력 필드 설명

- `rss` — 물리 메모리 사용량 (Resident Set Size, KiB). 공유 메모리는 각 프로세스에 중복 계산됩니다.
- `vsize` / `size` — 가상 메모리 크기 (KiB)
- `pcpu` / `%cpu` — **프로세스 수명 전체의 CPU 사용률 평균**. 순간 값이 아닙니다. 순간 값이 필요하면 `top`이나 `pidstat`을 사용합니다.
- `pmem` / `%mem` — 물리 메모리 사용 비율
- `time` — 누적 CPU 시간

## 공유 메모리 중복 계산

여러 프로세스가 공유하는 메모리(shared libraries 등)는 각 프로세스의 RSS에 모두 포함되므로, RSS를 합산하면 실제 메모리 사용량보다 큽니다. 정확한 메모리 사용량을 측정하려면 `/proc/<pid>/smaps_rollup`의 `Pss` (Proportional Set Size) 필드를 확인합니다.

cgroup v2 환경에서는 `memory.current`가 컨테이너 전체의 메모리 사용량을 제공합니다.
