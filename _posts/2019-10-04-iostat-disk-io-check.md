---
date: 2019-10-04 17:45:56 +0900
title: "Disk I/O Check를 위한 iostat 사용법"
category: dbops
excerpt: "Disk I/O 체크를 위한 iostat 사용법 DB를 운영하면서, DB의 성능 분석을 위해 Disk I/O 점검을 하는 경우가 많습니다. Linux의 sysstat 패키지안에 있는 iostat을 이용하여 I/O 체크를 할 수 있습니다. $ iostat -xtmdz -p ALL..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — sysstat 12 이후 avgrq-sz 는 areq-sz(단위 sector→KiB), avgqu-sz 는 aqu-sz 로 이름이 바뀌었고 svctm 은 12.1.2(2018-12)에서 삭제되어 본문 컬럼 목록·설명이 현재 iostat 출력과 다르다. 현행 man 페이지는 %util 을 RAID·SSD 같은 병렬 처리 장치에서 포화 지표로 읽지 말라고 경고한다.

![](/assets/img/wp/2019/02/수정됨_fcfdee7682c7e8e8a9a10b10f770b890.png)

## Disk I/O 체크를 위한 iostat 사용법

> **전제 환경:** Linux (sysstat 패키지 필요)

데이터베이스(DB)를 운영하면서 DB 성능 분석을 위해 디스크 입출력(I/O) 점검을 하는 일이 자주 있습니다. Linux의 sysstat 패키지에 포함된 iostat 명령으로 입출력을 점검합니다.

```bash
$ iostat -xtmdz -p ALL 3 | tee disk_iostat.log

Device: rrqm/s wrqm/s r/s w/s rMB/s wMB/s avgrq-sz avgqu-sz await r_await w_await svctm %util
vda 0.00 3.67 0.00 1.00 0.00 0.15 306.67 0.00 1.33 0.00 1.33 1.33 0.13
vda1 0.00 3.67 0.00 1.00 0.00 0.15 306.67 0.00 1.33 0.00 1.33 1.33 0.13
vdb 0.00 0.00 0.00 3.00 0.00 0.02 16.00 0.00 0.67 0.00 0.67 0.33 0.10
vdb1 0.00 0.00 0.00 3.00 0.00 0.02 16.00 0.00 0.67 0.00 0.67 0.33 0.10
```

- rrqm/s : 디바이스 큐에 대기중인 초당 읽기 요청의 건수
- wrqm/s : 디바이스 큐에 대기중인 초당 쓰기 요청의 건수
- r/s : 디바이스에 요청한 초당 읽기 요청의 건수
- w/s : 디바이스에 요청한 초당 쓰기 요청의 건수
- rsec/s : 디바이스에서 초당 읽어들인 섹터의 갯수
- wsec/s : 디바이스에서 초당 기록한 섹터의 갯수
- avgrq-sz : 디바이스에 요청한 초당 평균 데이터의 크기
- avgqu-sz : 디바이스에 요청한 초당 평균 큐 길이
- await : 디바이스에서 처리되기 위해서 요청된 I/O 평균 시간(밀리초, 1/1000초). 큐에서 소요된 시간과 처리된 시간이 합쳐져 출력
- svctm : 디바이스에서 처리한 I/O 평균 시간 (밀리초, 1/1000초)
- %util : 디바이스에서 요청한 I/O 작업을 수행하기 위해 사용한 CPU 시간 비율. 이 값이 100%에 가까워지면 디바이스가 한계에 도달했다고 보면 된다

추가로 hdparm 명령을 사용하면 디스크 캐시 유무에 따른 성능 차이를 측정할 수 있습니다.

```bash
$ hdparm -tT /dev/vd*
```

- -t 옵션은 버퍼되어 있지 않은 데이터를 읽는 속도를 체크
- -T옵션은 버퍼된 데이터를 읽는 속도를 체크
- 두 옵션을 함께 사용하며 현재 속도차이가 얼마인지 알 수 있음.
