---
date: 2019-08-09 03:53:50 +0900
title: "Database를 위한 디스크와 파일시스템 최적화"
category: dbops
excerpt: "Disk & File System for Database DB 서버의 디스크 영역이나 파일시스템은 DB를 설계하는데 있어 매우 중요합니다. DB의 성능은 DIsk I/O와 CPU, Memory의 성능과 밀접하게 연관이 있으며, 하드웨어의 성능도 중요하지만 OS 튜닝부분도 중요합니다…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — noop·cfq·anticipatory 스케줄러와 elevator= 부팅 파라미터는 blk-mq 전환 이후 커널에서 사라졌고, 현재 커널 문서에 남은 I/O 스케줄러는 mq-deadline(deadline)·bfq·kyber·none 이며 설정은 sysfs·udev 규칙·TuneD 로 한다. CentOS 7 기준 grubby/grub2-mkconfig 예시도 2024-06-30 EOL 이후 환경과 맞지 않는다.

![](/assets/img/wp/2019/02/수정됨_fcfdee7682c7e8e8a9a10b10f770b890.png)

**Disk & File System for Database**

DB 서버의 디스크 영역이나 파일시스템은 DB를 설계할 때 매우 중요합니다. DB 성능은 Disk I/O와 CPU, Memory 성능과 밀접하게 연관되며, 하드웨어 성능도 중요하지만 OS 튜닝 부분도 중요합니다.

**Kernel Disk I/O scheduler**

커널 디스크 I/O 스케줄러 값 조정을 통해 디스크의 read/write 방식을 선택한다.

아래 명령으로 현재 사용 중인 스케줄러를 확인한다.

```bash
root# cat /sys/block/${device_name}/queue/scheduler
noop deadline [cfg]
```

스케줄러 타입은 4가지가 있습니다.

- noop
- deadline
- cfq
- anticipatory

사용 중인 스케줄러는 [ ]로 표시되어 있습니다.

1) noop scheduler

- - No Operation. 아무것도 하지 않는 스케줄러.
  - 주로 지능형 RAID 컨트롤러가 있거나, SSD를 사용하거나, 반도체 디스크 등 고성능 디스크를 사용할 경우 쓰이는 스케줄러로 커널은 아무것도 하지 않는 것이 부하를 줄일 수 있다는 기반으로 선택

2) Deadline

- - I/O 대기 시간의 한계점(deadline)을 마련하고, 그것에 가까워진 것부터 먼저 처리하므로 과도한 디스크 탐색을 예방합니다.
  - 처리량보다 지연에 최적화된 스케줄링을 하며, 읽기 및 쓰기를 모두 균형 있게 처리합니다.
  - 몇몇 프로세스가 많은 수의 I/O를 발생시키는 환경에 적합하기 때문에 데이터베이스 파일 시스템에 많이 쓰입니다.
  - SSD에 가장 적합합니다.

3) CFQ (Completetly Fair Queuing)

- - 리눅스 Fedora Core 커널 패키지의 기본 스케줄러로, 이 스케줄러의 목표는 Head 탐색을 최소화하는 것에 있습니다.
  - 프로세스마다 I/O 대기열을 가지고 최대한 균등하게 예약을 합니다.
  - 많은 프로세스들이 작은 크기의 I/O를 많이 발생시킬 때 사용하면 좋습니다.

4) anticipatory

- - 발생하는 I/O 요청에서 향후 발생할 I/O 요청의 위치를 예측하고 위치가 먼 I/O 요청 처리를 중지하고 위치가 가까운 I/O 요청을 처리하는 방식입니다.
  - 지연 시간을 줄이고 처리량을 향상하는 것이 목적입니다.
  - HDD와 비슷한 구조로 동작합니다. I/O를 기다려 모아서 처리하는 성질이 있어 지연 시간은 많아질 가능성도 있습니다.

커널 디스크 I/O 스케줄러를 "elevator" 라고도 합니다.

각 디바이스의 스케줄러는 다음과 같은 명령으로 수동 변경한다.

```bash
root# echo deadline > /sys/block/${device_name}/queue/scheduler
```

하지만 위 명령으로는 하나의 디바이스 스케줄러만 변경할 수 있고, 여러 개의 디바이스를 가진 장비라면 여러 번 실행해야 하는 번거로움이 있습니다.

CentOS 7에서는 아래 명령으로 스케줄러를 변경한다.

```bash
root# grubby --update-kernel=ALL --args="elevator=deadline"


```

또는 /etc/default/grub 을 편집하여 아래 값을 넣어준다.

```bash
GRUB_CMDLINE_LINUX_DEFAULT="elevator=deadline"
```

또 아래와 같은 명령으로도 설정한다.

```bash
root# grub2-mkconfig -o /boot/efi/EFI/centos/grub.cfg
```

elevator 설정 변경으로 모든 디바이스에 일괄 적용됩니다. 데이터베이스나 SSD 사용 시 권장 옵션은 Deadline이기 때문에 Deadline으로 예제를 들었습니다.

**Partition Alignment**

디스크 연산 횟수를 제한하기 위해 논리적 블록 파티션과 물리적 블록을 맞추는 것입니다.

parted 명령으로 디바이스를 설정할 때 optimal 옵션을 줘서 설정합니다. optimal 옵션은 최상의 성능을 위한 최고의 파티션 정렬을 한다는 의미입니다.

```bash
device=/dev/sdc
parted -s -a optimal $device mklabel gpt
parted -s -a optimal $device mkpart primary xfs 0% 100%
```

**SSD TRIM 활성화 및 최적화**

리눅스 커널 2.6.33 이상 버전에서는 SSD의 TRIM 기능을 활성화한다. Btrfs, ext4, jfs, xfs 파일 시스템은 TRIM을 사용한다.

TRIM을 활성화하는 방법은 아래와 같습니다.

```bash
root# vi /etc/fstab

/dev/sdb1  /data  xfs  rw,discard.,errors=remount-ro 0 1
```

discard 옵션을 추가해서 TRIM을 활성화한다.

또한, 파일시스템을 메모리에 할당하여 SSD의 불필요한 사용을 제한한다.

df -h 명령으로 몇 개의 tmpfs를 확인한다.

```bash
root@db:~]# df -h
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda3       458G  5.6G  452G   2% /
devtmpfs        3.9G     0  3.9G   0% /dev
tmpfs           3.9G     0  3.9G   0% /dev/shm
tmpfs           3.9G  8.8M  3.9G   1% /run
tmpfs           3.9G     0  3.9G   0% /sys/fs/cgroup
/dev/sda1       506M  151M  356M  30% /boot
tmpfs           791M     0  791M   0% /run/user/1000
tmpfs           791M     0  791M   0% /run/user/0
```

- /dev: 디렉토리에는 모든 장치에 대한 특수 장치 파일이 들어 있음
- /dev/shm: 공유 메모리 할당을 포함
- /run: 시스템 로그에 사용
- /sys/fs/cgroup: 특정 프로세스의 리소스 사용을 제한, 감시 및 설명하는 커널 기능인 cgroup에 사용

tmpfs는 메모리에 상주하는 영역으로 Ramdisk와 같다고 보시면 됩니다.

/etc/fstab을 처음 열어보면 tmpfs 값이 없지만 tmpfs 관련 설정을 넣으면 크기와 사용량 제한 설정을 한다.

```bash
tmpfs  /tmp  tmpfs  size=512m  default,noatime,mode=1777  0 0
```

**Swap**

스왑 영역은 메모리가 부족한 경우 디스크에 swap으로 할당된 영역에 메모리 대신 메모리처럼 디스크에 쓰는 것입니다. 메모리가 아닌 디스크를 사용하는 것이기 때문에 속도가 매우 느립니다. 리눅스는 기본적으로 swap을 사용하는 것을 좋아하기 때문에, 데이터가 메모리 대신 디스크에 swap되는 것을 막는 것이 좋습니다.

/etc/sysctl.conf 파일에 swappiness 파라미터를 추가해줍니다.

```bash
root# vi /etc/sysctl.conf

vm.swappiness=0

root# sysctl -p
```

**File System Option**

현재 버전의 리눅스에서는 xfs가 가장 좋은 파일시스템이라고 합니다. 하지만 실제로 속도 면에서는 ext4가 xfs보다 조금 빠릅니다.

```bash
/devv/sdb1  /data  ext4  rw,noatime,nodiratime,data=writeback,discard  0 1
```

ext4에서 noatime 옵션을 주면 파일과 폴더에 접근 시간을 비활성화해 마지막 접근 시간 정보를 쓰는 것을 막는다. Disk I/O가 높은 환경에서는 디스크 접근 자체를 줄일 수 있기 때문에 I/O가 줄어드는 효과를 본다.

data=writeback 옵션은 오직 메타데이터만 저널링하는 것을 의미합니다. 자체 트랜잭션 로그를 가지고 있는 DB들 (InnoDB, oracle 등)은 같은 일을 반복할 필요가 없기 때문입니다. 안전성을 위한다면 data=ordered를 사용해 메타데이터 전에 데이터를 쓸 수 있다.
