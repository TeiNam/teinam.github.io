---
date: 2024-07-28 14:56:08 +0900
title: "쿠버네티스와 EKS에서의 데이터베이스 영속성: PV, StorageClass, EBS 비교 분석"
category: database
excerpt: "EKS 위 작은 데이터베이스에 RDS 를 붙이기 아까울 때, PersistentVolume·StorageClass·Amazon EBS 로 컨테이너 데이터를 남기는 방법을 비용·백업·가용성 기준으로 비교합니다."
last_modified_at: 2026-09-20
---

## RDS 사용하기는 아깝고, EKS 올리기엔 불안한 컨테이너 데이터베이스

EKS 에 올라가는 작은 서비스나 Superset·Airflow 같은 솔루션의 메타 정보를 담을 DB 하나 때문에 RDS 인스턴스를 따로 띄우는 것은 비용이 아깝습니다. 그런데 컨테이너로 그냥 올리면 파드가 종료될 때 데이터가 같이 사라집니다. 그래서 DB 컨테이너에는 파드와 수명이 분리된 스토리지를 마운트해야 합니다.

쿠버네티스는 이 목적으로 PersistentVolume(PV), PersistentVolumeClaim(PVC), StorageClass(SC) 를 제공하고, Amazon EKS 에서는 그 뒤를 Amazon EBS 같은 AWS 스토리지가 받습니다. 이 글에서는 세 가지를 비용·백업·고가용성 측면에서 비교합니다.

> **NOTE** — 동작 설명은 Amazon EKS 표준 지원 버전인 쿠버네티스 1.34·1.35·1.36 을 기준으로 합니다. EKS 는 마이너 버전마다 표준 지원 14개월, 이어서 연장 지원 12개월을 제공합니다.

## 스토리지 옵션 비교

먼저 세 가지의 특징을 표로 정리합니다.

| 측면 | PersistentVolume | StorageClass | Amazon EBS |
| --- | --- | --- | --- |
| 비용 | 백엔드 스토리지 가격을 그대로 따름 | 필요한 용량만 동적으로 할당 | 프로비저닝한 용량·IOPS 단위 과금 |
| 백업 | 백엔드가 지원하는 방식 | CSI 스냅샷 컨트롤러를 따로 설치 | 스냅샷 내장, AWS Backup 연동 |
| 고가용성 | 백엔드 기능에 따라 다름 | `allowedTopologies` 로 AZ 를 제한 | 볼륨 하나는 단일 AZ 안에서만 |
| 성능 | 백엔드에 따라 다름 | 클래스별 파라미터로 조절 | gp3·io2 Block Express 등 타입 선택 |
| 확장성 | 수동 확장 | `allowVolumeExpansion` 으로 PVC 확장 | 크기·IOPS·처리량 온라인 변경 |
| 관리 복잡성 | PV 를 직접 만들고 지움 | 정책만 정의하면 자동 생성 | 드라이버 애드온과 IAM 권한 필요 |

세 가지는 서로 대체재가 아닙니다. PVC 가 필요한 용량을 요청하고, StorageClass 가 그 요청을 어느 드라이버로 어떻게 만들지 정하고, 그 결과로 EBS 볼륨과 PV 가 생깁니다. 이제 각각을 자세히 보겠습니다.

## 1. PersistentVolume 과 PersistentVolumeClaim

PersistentVolume 은 관리자가 미리 프로비저닝하거나 StorageClass 를 통해 동적으로 프로비저닝하는 클러스터의 스토리지 조각입니다. 파드는 PV 를 직접 참조하지 않고 PVC 로 요청하며, 바인딩된 PVC 를 볼륨으로 마운트합니다.

### 장점

- 스토리지와 사용을 분리해 관리하기 쉽습니다.
- NFS, iSCSI, 클라우드 블록 스토리지 등 다양한 백엔드를 CSI 드라이버로 붙일 수 있습니다.
- 데이터 수명을 파드 수명과 분리할 수 있습니다.

### 단점

- PV 를 직접 만드는 방식은 용량·AZ·재사용을 사람이 관리해야 합니다.
- 볼륨 수가 늘어나면 남은 볼륨을 추적하기 어려워집니다.

### 비용과 백업, 고가용성

PV 자체는 과금 대상이 아니고, 비용과 내구성은 뒤에 있는 스토리지가 결정합니다. 온프레미스라면 하드웨어 투자, 클라우드라면 해당 서비스의 가격 정책을 그대로 따릅니다. 백업도 마찬가지로 백엔드가 스냅샷을 지원하는지에 달려 있고, 지원하지 않으면 덤프 같은 별도 수단을 마련해야 합니다.

### StatefulSet 이 만드는 PVC 의 수명

데이터베이스는 보통 Deployment 가 아니라 StatefulSet 으로 띄웁니다. StatefulSet 의 `volumeClaimTemplates` 에 PVC 템플릿을 적으면 파드마다 전용 PVC 가 만들어지고, 파드가 재시작해도 같은 PVC 에 다시 붙습니다. 안정 버전 API 인 `apps/v1` 을 씁니다.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  # selector, template 은 생략
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: ebs-gp3
        resources:
          requests:
            storage: 20Gi
```

주의할 점은 정리 동작입니다. StatefulSet 을 지우거나 레플리카를 줄여도 쿠버네티스는 그 PVC 와 볼륨을 함께 지우지 않습니다. 공식 문서는 자동 삭제보다 데이터 안전이 더 중요하기 때문이라고 설명합니다. 그래서 StatefulSet 만 지우고 잊으면 EBS 볼륨이 그대로 남아 매달 요금이 나갑니다. `kubectl get pvc` 로 확인하고 직접 지워야 합니다.

정리를 자동화하려면 `.spec.persistentVolumeClaimRetentionPolicy` 를 씁니다. `apps/v1` StatefulSet 스펙의 필드이며 `whenDeleted` 와 `whenScaled` 에 각각 `Retain` 또는 `Delete` 를 줄 수 있고, 기본값은 둘 다 `Retain` 입니다.

```yaml
spec:
  persistentVolumeClaimRetentionPolicy:
    whenDeleted: Retain
    whenScaled: Delete
```

이 정책은 StatefulSet 이 삭제되거나 스케일 다운되어 파드가 사라지는 경우에만 적용됩니다. 노드 장애로 파드가 없어진 경우에는 PVC 가 남고, 대체 파드가 같은 볼륨에 다시 붙습니다. StatefulSet 이 만든 PVC 의 자동 정리는 쿠버네티스 1.32 에 들어갔으므로, 현재 EKS 표준 지원 버전에서는 모두 쓸 수 있습니다.

## 2. StorageClass (SC)

StorageClass 는 관리자가 제공하는 스토리지의 "클래스"를 기술하는 방법입니다. 어떤 프로비저너를 쓸지, 어떤 파라미터로 볼륨을 만들지, PVC 를 지웠을 때 볼륨을 어떻게 할지를 한곳에 모읍니다.

### 장점

- 동적 볼륨 프로비저닝을 지원합니다.
- 스토리지 타입과 성능 특성을 추상화해 PVC 쪽 매니페스트를 단순하게 유지합니다.
- 클라우드 제공업체의 스토리지 서비스와 CSI 드라이버로 연결됩니다.

### 단점

- 드라이버 설치와 권한 설정 등 초기 구성이 필요합니다.
- 쓸 수 있는 파라미터는 드라이버가 정하므로 백엔드마다 다릅니다.

### EKS 에서 쓰는 gp3 StorageClass

EBS 볼륨을 동적으로 받으려면 프로비저너가 `ebs.csi.aws.com` 인 StorageClass 가 필요합니다. EBS CSI 드라이버는 `type` 을 지정하지 않으면 gp3 볼륨을 만들지만, 클래스에 명시해 두면 의도가 드러납니다.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

이 네 줄이 운영 결과를 좌우합니다.

- `volumeBindingMode` — 비워 두면 `Immediate` 가 적용되어 PVC 를 만드는 즉시 볼륨이 생깁니다. `WaitForFirstConsumer` 는 그 PVC 를 쓰는 파드가 스케줄될 때까지 볼륨 생성을 미룹니다.
- `reclaimPolicy` — 지정하지 않으면 `Delete` 입니다. PVC 를 지우면 동적으로 만들어진 볼륨까지 지워집니다. 데이터를 남기려면 `Retain` 으로 둡니다.
- `allowVolumeExpansion` — `true` 여야 PVC 의 요청 용량을 키워 볼륨을 확장할 수 있습니다. 줄이는 것은 불가능합니다.
- `encrypted` — 드라이버 기본값은 `false` 이므로 암호화가 필요하면 직접 켭니다.

클러스터에 기본 StorageClass 가 있는지는 `kubectl get storageclass` 로 확인합니다. `storageclass.kubernetes.io/is-default-class: "true"` 애노테이션이 붙은 클래스가 PVC 에 `storageClassName` 을 적지 않았을 때 쓰입니다. EKS Auto Mode 는 StorageClass 를 만들어 주지 않으므로 직접 만들어야 하고, 이때 프로비저너는 `ebs.csi.eks.amazonaws.com` 입니다.

> **WARNING** — EBS 볼륨은 만들어진 가용 영역 하나에만 속합니다. AWS 문서는 볼륨과 인스턴스가 같은 가용 영역에 있어야 한다고 적습니다. `Immediate` 로 먼저 만든 볼륨이 a 존에 있는데 파드가 c 존 노드로 스케줄되면 마운트가 실패하고 파드는 `Pending` 에 머뭅니다. 노드 그룹이 여러 AZ 에 걸쳐 있다면 `WaitForFirstConsumer` 를 쓰거나 `allowedTopologies` 로 AZ 를 고정합니다.

## 3. Amazon EBS (Elastic Block Store)

EBS 는 AWS 의 블록 스토리지 서비스입니다. 쿠버네티스는 1.23 부터 AWS EBS 의 CSI 마이그레이션을 기본으로 켰고, 현행 쿠버네티스 볼륨 문서의 in-tree 볼륨 타입 목록에 AWS EBS 는 들어 있지 않습니다. EKS 에서 EBS 볼륨을 쓰려면 Amazon EBS CSI 드라이버를 설치해야 합니다.

### 드라이버 설치와 IAM 권한

AWS 는 EBS CSI 드라이버를 EKS 애드온으로 설치하라고 권고합니다. 애드온 이름은 `aws-ebs-csi-driver` 이고, 클러스터가 요구하는 플랫폼 버전은 다음 명령으로 확인합니다.

```bash
aws eks describe-addon-versions --addon-name aws-ebs-csi-driver
```

드라이버는 EC2 API 를 호출하므로 IAM 권한이 필요합니다. AWS 는 EKS Pod Identity 를 권하며, 서비스 어카운트용 IAM 역할(IRSA)도 쓸 수 있습니다. 관리형 정책 `AmazonEBSCSIDriverPolicyV2` 를 붙인 역할을 만들어 애드온에 연결하면, 애드온이 `kube-system` 네임스페이스에 `ebs-csi-controller-sa` 서비스 어카운트를 만들어 사용합니다.

권한이 없으면 볼륨이 생기지 않고 `kubectl describe pvc` 에 다음 문구가 찍힙니다.

```text
failed to provision volume with StorageClass
could not create volume in EC2: UnauthorizedOperation
```

스냅샷 기능을 쓰려면 CSI 스냅샷 컨트롤러를 먼저 설치해야 합니다. EKS Auto Mode 클러스터에서는 EBS CSI 컨트롤러를 설치하지 않아도 되지만, 블록 스토리지가 별도 프로비저너 `ebs.csi.eks.amazonaws.com` 로 동작하며 `ebs.csi.aws.com` 이 만든 볼륨과 따로 관리됩니다. 기존 볼륨을 Auto Mode 로 옮기려면 스냅샷을 거쳐야 합니다.

### 제약

- Fargate 파드에는 EBS 볼륨을 마운트할 수 없습니다. 컨트롤러는 Fargate 노드에서 실행할 수 있지만, 노드 DaemonSet 은 EC2 인스턴스에서만 실행됩니다.
- EBS 볼륨과 EBS CSI 드라이버는 EKS Hybrid Nodes 와 호환되지 않습니다.
- 애드온 지원 범위는 최신 버전과 그 직전 버전입니다.

### 비용

EBS 는 프로비저닝한 용량 기준으로 과금하므로, 파드를 내려도 볼륨이 남아 있으면 요금이 계속 나갑니다. gp3 는 용량과 IOPS·처리량을 따로 지정할 수 있어 성능과 비용을 나눠 조절하기 좋습니다. 스냅샷은 증분으로 저장되므로 세대마다 전체 용량이 중복 과금되지는 않습니다.

### 백업

스냅샷 기능이 서비스에 내장돼 있고 AWS Backup 과 연동해 정책으로 관리할 수 있습니다. 쿠버네티스 쪽에서 `VolumeSnapshot` 리소스로 다루려면 앞서 말한 CSI 스냅샷 컨트롤러가 필요합니다.

### 고가용성

내구성은 볼륨 타입마다 다릅니다. AWS 문서는 gp2·gp3·io1·st1·sc1 을 99.8~99.9%(연간 장애율 0.1~0.2%), io2 Block Express 를 99.999%(연간 장애율 0.001%) 로 적습니다.

내구성과 AZ 장애 대비는 다른 문제입니다. 볼륨은 단일 AZ 자원이므로 AZ 하나가 죽으면 그 볼륨에 붙은 DB 파드를 다른 AZ 에서 되살릴 수 없습니다. AZ 장애까지 견뎌야 한다면 데이터베이스 자체의 복제를 구성하거나, 복제와 장애 조치를 서비스가 맡아 주는 RDS 를 선택하는 편이 낫습니다.

## 결론

스토리지 솔루션을 고를 때는 워크로드 특성, 필요한 성능, 예산, 운영 팀의 숙련도를 함께 봐야 합니다.

- **PersistentVolume 과 PVC** 는 데이터 수명을 파드와 분리하는 계층입니다. PV 를 손으로 만드는 방식은 온프레미스나 특수한 요구가 있을 때로 남겨 두는 편이 좋습니다.
- **StorageClass** 는 그 생성을 자동화하는 규칙입니다. EKS 에서는 `volumeBindingMode` 와 `reclaimPolicy` 를 잘못 잡으면 마운트 실패나 데이터 삭제로 이어지므로 먼저 확인합니다.
- **Amazon EBS** 는 EKS 에서 가장 손이 덜 가는 백엔드지만, CSI 드라이버 애드온과 IAM 권한이 전제이고 볼륨이 단일 AZ 에 묶입니다.

작은 메타 DB 하나를 컨테이너로 두는 것은 합리적인 선택입니다. 다만 영속성은 볼륨을 붙이는 데서 끝나지 않고 복구를 해 보는 데서 끝납니다. 운영에 넣기 전에 PVC 를 지웠을 때 볼륨이 어떻게 되는지, 스냅샷에서 되살린 볼륨으로 DB 가 기동하는지 소규모로 확인해 보시기 바랍니다.
