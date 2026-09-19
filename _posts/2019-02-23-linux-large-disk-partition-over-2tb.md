---
date: 2019-02-23 01:35:54 +0900
title: "리눅스에서 2TB 이상 대용량 디스크 파티션 사용"
category: etc
excerpt: "MBR 파티션 테이블은 512바이트 섹터에서 2TiB (2.20TB)로 제한됩니다. GPT 파티션 테이블로 변경하면 2TiB를 넘는 디스크를 사용할 수 있습니다."
updated: 2026-09-20
---

MBR 파티션 테이블은 32비트 LBA 주소 지정을 사용하기 때문에 512바이트 섹터에서 최대 2TiB (2.20TB)로 제한됩니다. 2TiB를 넘는 디스크를 사용하려면 GPT (GUID Partition Table) 파티션 테이블로 변경해야 합니다.

## MBR 파티션의 2TiB 한계

MBR 파티션 테이블을 사용하면 디스크가 5TB라도 파티션은 2TiB까지만 인식됩니다.

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

sdc3을 보면 2TiB로 제한되는 것을 확인할 수 있습니다.

## GPT 파티션 테이블로 변경

`parted` 명령으로 GPT 파티션을 생성합니다. `fdisk` 도 GPT를 지원하지만, 여기서는 `parted` 를 사용합니다.

```bash
# parted /dev/sdc
GNU Parted 3.1
Using /dev/sdc
Welcome to GNU Parted! Type 'help' to view a list of commands.
(parted) 
 
(parted) mklabel gpt                                                      
Warning: The existing disk label on /dev/sdc will be destroyed and all data on this disk will be lost. Do you want to continue?
Yes/No? yes
 
(parted) unit TB                            <----- 표시 단위 설정 (기본 MB), GB 또는 TB 사용 가능
 
(parted) mkpart primary 0.00TB 5.50TB
 
(parted) print                                                            
Model: VMware Virtual disk (scsi)
Disk /dev/sdc: 5.50TB
Sector size (logical/physical): 512B/512B
Partition Table: gpt
Disk Flags:

Number  Start   End     Size    File system  Name     Flags
 1      0.00TB  5.50TB  5.50TB               primary

(parted) quit
```

## 파일시스템 생성 및 마운트

파티션을 생성한 후에는 파일시스템을 생성하고 마운트합니다.

```bash
# mkfs.xfs /dev/sdc1
# mkdir -p /mnt/data
# mount /dev/sdc1 /mnt/data
```

영구 마운트를 위해 `/etc/fstab` 에 UUID로 등록합니다. `blkid` 로 UUID를 확인합니다.

```bash
# blkid /dev/sdc1
/dev/sdc1: UUID="a1b2c3d4-..." TYPE="xfs"

# vi /etc/fstab
UUID=a1b2c3d4-...  /mnt/data  xfs  defaults  0 0
```

디스크 경로(`/dev/sdc1`)가 아닌 UUID를 사용하면 디스크 순서가 바뀌어도 안정적으로 마운트됩니다.
