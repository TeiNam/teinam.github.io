---
date: 2019-09-27 11:21:17 +0900
title: "Process 별로 CPU, MEM 사용량 모니터링"
category: dbops
excerpt: "Process 별로 CPU, MEM 사용량 모니터링 특별히 모니터링 툴이라던가 다른 방법이 없을때 OS에서 ps 명령을 가지고 모니터링하는 방법입니다. #!/bin/bash LOG_FILE=test.log while true do date >> $LOG_FILE ps -U post…"
updated: 2026-09-17
---

![](/assets/img/wp/2019/02/수정됨_fcfdee7682c7e8e8a9a10b10f770b890.png)

## Process 별로 CPU, MEM 사용량 모니터링

특별히 모니터링 툴이나 다른 방법이 없을 때 OS에서 `ps` 명령으로 모니터링하는 방법입니다.

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
