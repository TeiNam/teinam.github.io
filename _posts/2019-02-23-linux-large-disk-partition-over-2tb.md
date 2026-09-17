---
date: 2019-02-23 01:35:54 +0900
title: "리눅스에서 2TB 이상 대용량 디스크 파티션 사용"
category: dbops
excerpt: "리눅스에서는 일반 파티션의 사이즈는 2TB로 제한 되어 있습니다. 이 것을 GPT 타입으로 변경해야 2TB보다 큰 파티션을 사용할 수 있습니다. 일반적으로 파티셔닝을 하면 아래처럼 됩니다. [root@backup-test ~]# fdisk -l /dev/sdc Disk /dev/s…"
updated: 2026-09-17
---

리눅스에서는 일반 파티션의 사이즈는 2TB로 제한되어 있습니다 (root 권한 필요).  
이것을 GPT 타입으로 변경해야 2TB보다 큰 파티션을 사용할 수 있습니다.

일반적으로 파티셔닝을 하면 아래처럼 됩니다.

```bash
[root@backup-test ~]# fdisk -l /dev/sdc
Disk /dev/sdc: 5497.6 GB, 5497558138880 bytes, 10737418240 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk label type: dos
Disk identifier: 0xbb438cb0
 
   Device Boot      Start         End      Blocks   Id  System
/dev/sdc1            2048    10487807     5242880   83  Linux
/dev/sdc2        10487808    52430847    20971520   83  Linux
/dev/sdc3        52430848  4294967294  2121268223+  83  Linux
```

sdc3을 보면 2TB로 제한되어버립니다.

변경하려는 디스크를 선택합니다.

```bash
# parted /dev/sdc
GNU Parted 3.1
Using /dev/sdc
Welcome to GNU Parted! Type 'help' to view a list of commands.
(parted) 
 
(parted) mklabel gpt                                                      
Warning: The existing disk label on /dev/sdc will be destroyed and all data on this disk will be lost. Do you want to continue?
Yes/No? yes
 
(parted) unit TB                            <----- 최소 용량을 설정하는 명령 (기본 MB) GB or TB
 
(parted) mkpart primary 0.00TB 5.50TB
 
(parted) print                                                            
Model: VMware Virtual disk (scsi)
Disk /dev/sdc: 5.50TB
Sector size (logical/physical): 512B/512B
Partition Table: gpt
Disk Flags:
```
