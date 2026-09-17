---
date: 2019-09-18 05:20:37 +0900
title: "K8s kubeadm을 이용한 설치 #.2 Worker Node Join"
category: dbops
excerpt: "Worker Node Join 일반적으로 Kubeadm, kubectl, kubelet을 설치하는 것까지는 마스터를 구성 할 때와 동일합니다. CentOS 7 설치 # setenforce 0 # sed -i ‘s/^SELINUX=enforcing$/SELINUX=permissive…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 마스터 편과 동일하게 Docker 런타임(1.24 에서 dockershim 제거)과 packages.cloud.google.com 저장소(2023-09-13 동결, pkgs.k8s.io 로 이전), CentOS 7(2024-06-30 EOL) 전제가 모두 무효입니다. kubeadm join 흐름 자체는 유지되지만 사전 준비 절차를 전면 교체해야 합니다.

![Kubernetes 로고](/assets/img/wp/2019/09/kubernetes-logo.png)

## Worker Node Join

> **전제조건:** CentOS 7 환경, Kubernetes 마스터 노드 구성 완료

Kubeadm, kubectl, kubelet을 설치하는 것까지는 마스터 구성과 동일합니다.

## CentOS 7 설치

```bash
# setenforce 0
# sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config

# cat <<EOF >  /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF

# systemctl stop firewalld
# systemctl disable firewalld
```

만약 swap을 구성했다면

```bash
swapoff -a
```

/etc/fstab 안의 swap 구성부분을 주석 처리(#) 해줍니다.

```bash
#/dev/mapper/centos-swap swap                    swap    defaults        0 0
```

그리고 한번 재구동을 해줍니다.

```bash
shutdown -r now
```

## Docker 설치

```bash
# yum install -y yum-utils device-mapper-persistent-data lvm2
# yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
# yum install docker-ce docker-ce-cli containerd.io
# systemctl start docker && systemctl enable docker
```

## Kubernetes 레포지토리 구성

```bash
cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF
```

## kubeadm, kubelet 및 kubectl 설치

```bash
yum install -y kubelet kubeadm kubectl --disableexcludes=kubernetes

systemctl enable --now kubelet
```

## Worker Node Join

마스터 노드를 구성했을 때 kubeadm init 명령을 실행하면 명령 출력 끝에 다음과 같은 join 명령이 표시됩니다.

```bash
kubeadm join <master-ip>:<master-port> --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

해당 명령을 그대로 사용합니다. 실제 예제:

```bash
kubeadm join 192.168.10.11:6443 --token <your-token> \
    --discovery-token-ca-cert-hash sha256:<your-hash>
```

> **주의:** 실제 토큰과 해시는 마스터 노드 초기화 시 출력된 값을 사용합니다.

Worker 노드 01, 02에서 모두 실행합니다.

worker01에서 실행

```bash
[preflight] Running pre-flight checks
  [WARNING IsDockerSystemdCheck]: detected "cgroupfs" as the Docker cgroup driver. The recommended driver is "systemd". Please follow the guide at https://kubernetes.io/docs/setup/cri/
  [WARNING SystemVerification]: this Docker version is not on the list of validated versions: 19.03.2. Latest validated version: 18.09
  [WARNING Hostname]: hostname "kube-worker-01" could not be reached
  [WARNING Hostname]: hostname "kube-worker-01": lookup kube-worker-01 on 192.168.10.1:53: no such host
[preflight] Reading configuration from the cluster...
[preflight] FYI: You can look at this config file with 'kubectl -n kube-system get cm kubeadm-config -oyaml'
[kubelet-start] Downloading configuration for the kubelet from the "kubelet-config-1.15" ConfigMap in the kube-system namespace
[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"
[kubelet-start] Writing kubelet environment file with flags to file "/var/lib/kubelet/kubeadm-flags.env"
[kubelet-start] Activating the kubelet service
[kubelet-start] Waiting for the kubelet to perform the TLS Bootstrap...

This node has joined the cluster:
* Certificate signing request was sent to apiserver and a response was received.
* The Kubelet was informed of the new secure connection details.

Run 'kubectl get nodes' on the control-plane to see this node join the cluster.
```

1번에서 실행후에 마스터 노드에서 kubectl get nodes 명령으로 확인 하면

```bash
root@kube-master-01:~]# kubectl get nodes
NAME             STATUS     ROLES    AGE   VERSION
kube-master-01   Ready      master   81m   v1.15.3
kube-worker-01   NotReady   <none>   14s   v1.15.3
```

2번에서 추가로 실행후에 확인해보면

```bash
root@kube-master-01:~]# kubectl get nodes
NAME             STATUS   ROLES    AGE     VERSION
kube-master-01   Ready    master   85m     v1.15.3
kube-worker-01   Ready    <none>   3m44s   v1.15.3
kube-worker-02   Ready    <none>   53s     v1.15.3
```

worker 노드 2개가 추가 되었음을 알 수 있습니다.
