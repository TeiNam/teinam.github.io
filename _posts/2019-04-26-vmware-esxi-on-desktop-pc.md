---
date: 2019-04-26 16:01:36 +0900
title: "Desktop PC에 VMWare ESXI를 설치 하기"
category: dbops
excerpt: "데스크탑 PC 자체를 하나의 VMWare 환경으로 구성 할 때 ESXI를 PC 설치 해버리면, 해당 PC에서 가상화 환경을 할당 할 수 있습니다. 윈도우를 빼버리고 VMWare를 바로 PC 올린다고 생각하시면 됩니다. ESXI 자체는 리눅스로 되어 있습니다...."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 글이 만드는 ESXi 5.5~6.5 커스텀 ISO 대상 버전은 모두 지원이 끝났고(6.5·6.7 은 2022년 10월, 7.0 은 2025년 10월 종료), 현재 일반 지원 대상은 8.0 과 9.x 입니다. ESXi-Customizer-PS 배포 페이지도 스스로 outdated 를 명시하며 GitHub(VFrontDe-Org/ESXi-Customizer-PS)로 옮겨졌고, 무료 ESXi 는 Broadcom 인수 이후 8.0 Update 3e ISO 형태로 Broadcom 포털에서만 제공됩니다. 무료판 중단·재개의 정확한 공식 발표 시점은 1차 출처로 확인 불가입니다.

![](/assets/img/wp/2019/04/Esxi-Logo.png)

> **전제조건**  
> - Windows 환경에서 PowerShell 실행 권한 필요
> - PowerCLI 설치 필요 ([설치 가이드](https://docs.vmware.com/kr/VMware-vSphere/6.7/com.vmware.esxi.install.doc/GUID-F02D0C2D-B226-4908-9E5C-2E783D41FE2D.html))
> - 대상 하드웨어의 랜카드·SATA 드라이버 정보 파악 필요

데스크탑 PC 자체를 하나의 VMware 환경으로 구성할 때, ESXi를 PC에 직접 설치하면 해당 PC에서 가상화 환경을 할당할 수 있습니다.

윈도우를 빼버리고 VMware를 바로 PC에 올린다고 생각하시면 됩니다.

ESXi 자체는 리눅스 기반입니다.

우선 아래 사이트에서 스크립트를 내려받습니다.

<https://www.v-front.de/p/esxi-customizer-ps.html>

ESXi-Customizer-PS-v2.5.1.ps1

이걸 실행하려면 PowerCLI가 있어야 하니 다운받아 설치합니다.

[PowerCLI 설치하는 법](https://docs.vmware.com/kr/VMware-vSphere/6.7/com.vmware.esxi.install.doc/GUID-F02D0C2D-B226-4908-9E5C-2E783D41FE2D.html)

PowerShell에서 실행할 수 있게 실행 권한을 변경한 다음 PowerCLI를 실행합니다.

데스크탑에 설치하려면 랜카드와 SATA 드라이버가 필요합니다.

인텔 기가 이더넷 카드라면 net-igb

```powershell
PowerCLI D:\Esxi>. D:\ESXi-Customizer-PS-v2.5.1.ps1 -v55 -vft -load sata-xahci,net-igb
```

![](/assets/img/wp/2019/04/9917C63359FFCA223E.png)

이미지를 만들어줍니다.

옵션별 버전

-v50 : Create the latest ESXi 5.0 ISO

-v51 : Create the latest ESXi 5.1 ISO

-v55 : Create the latest ESXi 5.5 ISO

-v60 : Create the latest ESXi 6.0 ISO

-v65 : Create the latest ESXi 6.5 ISO

※ -vft는 https://www.v-front.de 에서 가져온다는 뜻입니다.

자세한 옵션은 https://www.v-front.de/p/esxi-customizer-ps.html 참조.

모든 과정을 거치고 나면 ISO 파일이 생성되는데, 그걸로 부팅해서 설치를 진행하면 됩니다.

설치한 IP로 웹 접속을 하면 해당 버전에 맞는 vSphere를 내려받는 경로가 보입니다.

vSphere를 사용하면 ESXi 서버에 접속해서 VM을 생성할 수 있습니다.
