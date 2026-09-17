---
date: 2019-09-18 04:44:30 +0900
title: "K8s kubeadm을 이용한 설치 #.1 Master Node 구성하기"
category: dbops
excerpt: "쿠버네티스 설치 CentOS7, Docker 19.03.2, Kubernetes 1.15.3 VMware Workstation CentOS 7 설치 처음 설치시 swap 영역을 구성하지 않습니다. 저는 PXE 서버에 리눅스 킥스타트를 만들어 놓은것이 있어서 그 걸로 VM에 배포합니…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Kubernetes 1.24 에서 dockershim 이 제거되어 이 글의 Docker 19.03 런타임 전제는 더 이상 유효하지 않고(containerd 또는 CRI-O 필요), yum 저장소 packages.cloud.google.com 은 2023-09-13 에 동결되어 pkgs.k8s.io 로 대체되었습니다. CentOS 7 은 2024-06-30 EOL, Calico 매니페스트도 docs.projectcalico.org v3.9 대신 Tigera Operator 기반(v3.32)으로 바뀌었으며 현재 안정 버전은 1.37(2026-08-26) 입니다.

![](/assets/img/wp/2019/09/kubernetes-logo.png)

## 쿠버네티스 설치

CentOS7, Docker 19.03.2, Kubernetes 1.15.3

VMware Workstation

## CentOS 7 설치

처음 설치시 swap 영역을 구성하지 않습니다.

저는 PXE 서버에 리눅스 킥스타트를 만들어 놓은것이 있어서 그 걸로 VM에 배포합니다.

킥스타트는 기본적으로 selinux와 firewalld를 사용하지 않게 구성했습니다.

하지만 일반적으로 CentOS위에 설치하는 경우 아래와 같이 사전 구성을 합니다.

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

```text
#/dev/mapper/centos-swap swap                    swap    defaults        0 0
```

그리고 한번 재구동을 해줍니다.

```bash
shutdown -r now
```

## Docker 설치

Docker stable 버전 설치하는 법을 바로 전에 포스팅 했었습니다. [[CentOS&RHEL] Docker stable 버전 설치](/writing/docker-stable-install-centos-rhel/ "[CentOS&RHEL] Docker stable 버전 설치")

같은 방식으로 진행하고 19.03 버전을 설치합니다. Kubernetes 공홈 기준 Docker 버전은 아직 18.09 였습니다. (2019.09.18)

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

## control-plane 노드 설치

```bash
kubeadm init --pod-network-cidr=10.224.0.0/16
```

```text
[init] Using Kubernetes version: v1.15.3
[preflight] Running pre-flight checks
  [WARNING IsDockerSystemdCheck]: detected "cgroupfs" as the Docker cgroup driver. The recommended driver is "systemd". Please follow the guide at https://kubernetes.io/docs/setup/cri/
  [WARNING SystemVerification]: this Docker version is not on the list of validated versions: 19.03.2. Latest validated version: 18.09
  [WARNING Hostname]: hostname "kube-master-01" could not be reached
  [WARNING Hostname]: hostname "kube-master-01": lookup kube-master-01 on 192.168.10.1:53: no such host
[preflight] Pulling images required for setting up a Kubernetes cluster
[preflight] This might take a minute or two, depending on the speed of your internet connection
[preflight] You can also perform this action in beforehand using 'kubeadm config images pull'
[kubelet-start] Writing kubelet environment file with flags to file "/var/lib/kubelet/kubeadm-flags.env"
[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"
[kubelet-start] Activating the kubelet service
[certs] Using certificateDir folder "/etc/kubernetes/pki"
[certs] Generating "ca" certificate and key
[certs] Generating "apiserver-kubelet-client" certificate and key
[certs] Generating "apiserver" certificate and key
[certs] apiserver serving cert is signed for DNS names [kube-master-01 kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local] and IPs [10.96.0.1 192.168.10.11]
[certs] Generating "front-proxy-ca" certificate and key
[certs] Generating "front-proxy-client" certificate and key
[certs] Generating "etcd/ca" certificate and key
[certs] Generating "etcd/server" certificate and key
[certs] etcd/server serving cert is signed for DNS names [kube-master-01 localhost] and IPs [192.168.10.11 127.0.0.1 ::1]
[certs] Generating "etcd/peer" certificate and key
[certs] etcd/peer serving cert is signed for DNS names [kube-master-01 localhost] and IPs [192.168.10.11 127.0.0.1 ::1]
[certs] Generating "etcd/healthcheck-client" certificate and key
[certs] Generating "apiserver-etcd-client" certificate and key
[certs] Generating "sa" key and public key
[kubeconfig] Using kubeconfig folder "/etc/kubernetes"
[kubeconfig] Writing "admin.conf" kubeconfig file
[kubeconfig] Writing "kubelet.conf" kubeconfig file
[kubeconfig] Writing "controller-manager.conf" kubeconfig file
[kubeconfig] Writing "scheduler.conf" kubeconfig file
[control-plane] Using manifest folder "/etc/kubernetes/manifests"
[control-plane] Creating static Pod manifest for "kube-apiserver"
[control-plane] Creating static Pod manifest for "kube-controller-manager"
[control-plane] Creating static Pod manifest for "kube-scheduler"
[etcd] Creating static Pod manifest for local etcd in "/etc/kubernetes/manifests"
[wait-control-plane] Waiting for the kubelet to boot up the control plane as static Pods from directory "/etc/kubernetes/manifests". This can take up to 4m0s
[apiclient] All control plane components are healthy after 37.502229 seconds
[upload-config] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace
[kubelet] Creating a ConfigMap "kubelet-config-1.15" in namespace kube-system with the configuration for the kubelets in the cluster
[upload-certs] Skipping phase. Please see --upload-certs
[mark-control-plane] Marking the node kube-master-01 as control-plane by adding the label "node-role.kubernetes.io/master=''"
[mark-control-plane] Marking the node kube-master-01 as control-plane by adding the taints [node-role.kubernetes.io/master:NoSchedule]
[bootstrap-token] Using token: <bootstrap-token>
[bootstrap-token] Configuring bootstrap tokens, cluster-info ConfigMap, RBAC Roles
[bootstrap-token] configured RBAC rules to allow Node Bootstrap tokens to post CSRs in order for nodes to get long term certificate credentials
[bootstrap-token] configured RBAC rules to allow the csrapprover controller automatically approve CSRs from a Node Bootstrap Token
[bootstrap-token] configured RBAC rules to allow certificate rotation for all node client certificates in the cluster
[bootstrap-token] Creating the "cluster-info" ConfigMap in the "kube-public" namespace
[addons] Applied essential addon: CoreDNS
[addons] Applied essential addon: kube-proxy

Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

Then you can join any number of worker nodes by running the following on each as root:

kubeadm join <master-ip>:<master-port> --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

맨 마지막 줄은 다른 곳에다 잘 복사해두시기 바랍니다. worker 노드를 추가할때 필요 합니다.

토큰은 24시간의 제한시간이 있고, 유효시간이 지나면 kubeadm create token 명령을 통해 재발급 할 수 있습니다.

–pod-network-cidr=<IP> 의 IP대역대는 현재 사용하는 네트워크와 동일해서는 안됩니다. 해당 옵션은 Pod들이 가지는 IP가 됩니다.

–apiserver-advertise-address=<Master IP>  옵션을 추가 할 수도 있습니다. IPv6를 통한 쿠버네티스 배포를 원한다면 해당옵션으로 IPv6로 구성 할 수도 있습니다.

root가 아닌 유저로 쿠버네티스를 설치했다면 아래의 명령어를 순서대로 실행합니다.

```bash
mkdir -p $HOME/.kube
cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
chown $(id -u):$(id -g) $HOME/.kube/config
```

## CNI 구성

저는 CNI로 flannel를 사용하지 않고 calico를 사용할 예정입니다.

```bash
kubectl apply -f https://docs.projectcalico.org/v3.9/manifests/calico.yaml
```

```text
configmap/calico-config created
customresourcedefinition.apiextensions.k8s.io/felixconfigurations.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/ipamblocks.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/blockaffinities.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/ipamhandles.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/ipamconfigs.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/bgppeers.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/bgpconfigurations.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/ippools.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/hostendpoints.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/clusterinformations.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/globalnetworkpolicies.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/globalnetworksets.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/networkpolicies.crd.projectcalico.org created
customresourcedefinition.apiextensions.k8s.io/networksets.crd.projectcalico.org created
clusterrole.rbac.authorization.k8s.io/calico-kube-controllers created
clusterrolebinding.rbac.authorization.k8s.io/calico-kube-controllers created
clusterrole.rbac.authorization.k8s.io/calico-node created
clusterrolebinding.rbac.authorization.k8s.io/calico-node created
daemonset.apps/calico-node created
serviceaccount/calico-node created
deployment.apps/calico-kube-controllers created
serviceaccount/calico-kube-controllers created
```

아래의 명령으로 Pod들이 실행 중인지 확인 할 수 있습니다.

```bash
watch kubectl get pods --all-namespaces

NAMESPACE     NAME                                      READY   STATUS    RESTARTS   AGE
kube-system   calico-kube-controllers-f78989564-f96sw   1/1     Running   0          54s
kube-system   calico-node-wcn9q                         1/1     Running   0          54s
kube-system   coredns-5c98db65d4-d4k47                  1/1     Running   0          85s
kube-system   coredns-5c98db65d4-fzrvm                  1/1     Running   0          85s
kube-system   etcd-kube-master-01                       1/1     Running   0          35s
kube-system   kube-apiserver-kube-master-01             1/1     Running   0          33s
kube-system   kube-controller-manager-kube-master-01    1/1     Running   0          18s
kube-system   kube-proxy-ts8gc                          1/1     Running   0          85s
kube-system   kube-scheduler-kube-master-01             1/1     Running   0          31s
```

READY와 STATUS가 1/1 Running으로 변경되면 Ctrl-C 명령으로 watch를 끊고 나옵니다.

쿠버네티스 클러스터의 특정 노드에 taint를 지정할 수 있습니다. taint를 설정한 노드에는 포드가 스케줄링되지 않습니다. taint가 걸린 노드에 포드들을 스케줄링 하려면 toleration으로 지정해야 합니다.

taint는 cordon이나 draint처럼 모든 포드가 스케줄링 되지 않게 막는건 아니고, toleration을 이용한 특정 포드들만 실행하게 하고 다른 포드들은 들어오지 못하게 하는 역할을 합니다. 주로 노드를 지정된 역할만 하게할 때 사용합니다. DB용 포드를 띄워서 노드 전체의 CPU나 RAM자원을 독점해서 사용하게 할 수 있습니다. GPU가 있는 노드에는 다른 포드들은 실행되지 않고, 실제로 GPU를 사용하는 포드들만 실행시키도록 설정할 수도 있습니다.

taint는 키, 값, 효과의 3가지로 구성됩니다. 다음과 같은 형식입니다.

```bash
kubectl taint nodes 노드 이름 키=값:효과
```

다음과 같이 taint를 지정합니다.

```bash
kubectl taint nodes --all node-role.kubernetes.io/master-

node/<your hostname> untainted
```

아래와 같은 명령으로 쿠버네티스 클러스터에 마스터 노드가 있는지 확인 할 수 있습니다.

```bash
kubectl get nodes -o wide

NAME             STATUS   ROLES    AGE    VERSION   INTERNAL-IP     EXTERNAL-IP   OS-IMAGE                KERNEL-VERSION               CONTAINER-RUNTIME
kube-master-01   Ready    master   2m6s   v1.15.3   192.168.10.11   <none>        CentOS Linux 7 (Core)   3.10.0-1062.1.1.el7.x86_64   docker://19.3.2
```

Single-host 쿠버네티스 클러스터의 마스터 노드 설치가 끝났습니다.
