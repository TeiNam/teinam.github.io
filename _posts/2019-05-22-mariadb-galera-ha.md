---
date: 2019-05-22 20:35:21 +0900
title: "MariaDB Galera를 이용한 다중화 구성"
category: mysql
excerpt: "MariaDB Galera를 이용한 다중화 구성 장애를 대비한 이중화 구성은 안정적인 서비스를 위한 최선책입니다. DB 역시 요즘은 HA 구성에서 Master-Master 구성을 가지는 다중화 기능으로 변화하고 있습니다. Oracle은 오래전부터 RAC라는 Active-Active…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — MariaDB 10.3(커뮤니티 지원 2023-05-25 종료)과 CentOS 7(2024-06-30 EOL) 전제라 그대로 재현할 수 없다. 현재 지원 버전은 11.4/11.8/12.3 LTS 이고, Galera 4(10.4.6+)에서는 SST 기본 권장이 rsync 가 아니라 mariabackup 이다.

![](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

## MariaDB Galera를 이용한 다중화 구성

장애를 대비한 이중화 구성은 서비스 가용성을 높인다. DB 역시 요즘은 HA 구성에서 Master-Master 구성을 가지는 다중화 기능으로 변화하고 있습니다. Oracle은 오래전부터 RAC라는 Active-Active 구조의 클러스터링 시스템을 가지고 있었고, MariaDB와 MySQL은 기존의 Replication 방식이 아닌 Galera를 이용한 클러스터 구성이 새로 등장 했습니다. 그래서 그 갈레라 제가 한번 설치해 봤습니다… CentOS 7에 MariaDB 10.3 버전으로 3노드 구성을 했습니다. 모든 노드에 MariaDB를 설치 합니다.

### MariaDB Repository 설치

```bash
$ curl -sS https://downloads.mariadb.com/MariaDB/mariadb_repo_setup | sudo bash
```

### MariaDB Yum 설치

```bash
yum install mariadb mariadb-server
```

### MariaDB 파라미터 설정 및 갈레라 구성

Node01

```ini
vi /etc/my.cnf.d/server.cnf

# this is only for the mysqld standalone daemon
[mysqld]
#innodb
default-storage-engine          = InnoDB
innodb_buffer_pool_size         = 512M
innodb_flush_method             = O_DIRECT
innodb_log_buffer_size          = 16M
innodb_log_file_size            = 256M
innodb_io_capacity              = 2000
innodb_io_capacity_max          = 6000
innodb_flush_log_at_trx_commit  = 2

##logs
slow_query_log                  = ON
long_query_time                 = 10

## limits
join_buffer_size                = 1M
read_buffer_size                = 256K
read_rnd_buffer                 = 1M
tmp_table_size                  = 256M
max_heap_table_size             = 256M
lock_wait_timeout               = 300

innodb_monitor_enable           = all
performance_schema              = ON

#
# * Galera-related settings
#
[galera]
# Mandatory settings
wsrep_on=ON
wsrep_provider=/usr/lib64/galera/libgalera_smm.so
wsrep_cluster_address="gcomm://192.168.10.181,192.168.10.182,192.168.10.183"
binlog_format=row
default_storage_engine=InnoDB
innodb_autoinc_lock_mode=2
wsrep_cluster_name='mariadb-cluster'
wsrep_node_address='192.168.10.181'
wsrep_node_name='mariadb01'
wsrep_sst_method=rsync
wsrep_sst_auth=root:password
wsrep_sst_receive_address=192.168.10.181
wsrep_provider_options="gcache.recover=yes"
```

Node02

```ini
[galera]
# Mandatory settings
wsrep_on=ON
wsrep_provider=/usr/lib64/galera/libgalera_smm.so
wsrep_cluster_address="gcomm://192.168.10.181,192.168.10.182,192.168.10.183"
binlog_format=row
default_storage_engine=InnoDB
innodb_autoinc_lock_mode=2
wsrep_cluster_name='mariadb-cluster'
wsrep_node_address='192.168.10.182'
wsrep_node_name='mariadb02'
wsrep_sst_method=rsync
wsrep_sst_auth=root:password
wsrep_sst_receive_address=192.168.10.182
wsrep_provider_options="gcache.recover=yes"
```

Node03

```ini
[galera]
# Mandatory settings
wsrep_on=ON
wsrep_provider=/usr/lib64/galera/libgalera_smm.so
wsrep_cluster_address="gcomm://192.168.10.181,192.168.10.182,192.168.10.183"
binlog_format=row
default_storage_engine=InnoDB
innodb_autoinc_lock_mode=2
wsrep_cluster_name='mariadb-cluster'
wsrep_node_address='192.168.10.183'
wsrep_node_name='mariadb03'
wsrep_sst_method=rsync
wsrep_sst_auth=root:password
wsrep_sst_receive_address=192.168.10.183
wsrep_provider_options="gcache.recover=yes"
```

mysqld 부분은 세 노드 모두 똑같이 설정합니다.

기본값으로 올리기 보다는 몇가지 튜닝을 적용한 값인데, 기본적으로 Zabbix나 애플리케이션이 붙을때를 위해 약간의 조정을 해주는 겁니다. 서버의 사양에 따라 많고 다양한 파라미터 적용값이 있지만 VM 테스트에서 기본적으로 적용한 값이고, percona-pmm 모니터링을 위한 설정을 몇가지 추가 했습니다.

갈레라 부분의 변경한 파라미터 값의 의미를 알아보도록 하죠.

**[galera]**  
**Mandatory settings**  
**wsrep_on=ON**  
갈레라 클러스터를 활성화합니다.

**wsrep_provider=/usr/lib64/galera/libgalera_smm.so**  
libgalera_smm.so 라이브러리의 위치를 지정해 줍니다. `find / -name libgalera_smm.so` 명령으로 위치를 찾을 수 있습니다.

**wsrep_cluster_address="gcomm://192.168.10.181,192.168.10.182,192.168.10.183"**  
클러스터에 포함될 노드의 ip를 적어줍니다.

**wsrep_cluster_name='mariadb-cluster'**  
갈레라 클러스터의 이름을 지정해 줍니다.

**wsrep_node_address='192.168.10.181'**  
각각의 노드가 가진 localhost의 IP를 적어줍니다.

**wsrep_node_name='mariadb01'**  
각각의 노드의 호스트네임을 적어줍니다.

**wsrep_sst_method=rsync**  
노드간 sync 방식을 지정해 줍니다.

**wsrep_sst_auth=root:password**  
rsync에 사용할 계정과 패스워드를 적어줍니다.

**wsrep_provider_options="gcache.recover=yes"**  
갈레라 클러스터중 노드가 종료되었을때 깨진 클러스터를 재구성하지 않고 DB를 되살리기 위한 옵션입니다.

### 마스터가 될 첫번째 cluster 노드 (doner) 의 구동

```bash
/etc/init.d/mysql start --wsrep-new-cluster
```

첫번째 노드만 `--wsrep-new-cluster` 옵션을 이용해 구동해 줍니다.

Galera 4 버전에서는 `galera_new_cluster` 명령을 사용합니다.

```bash
$ galera_new_cluster
```

나머지 노드에서는 `systemctl start mysqld` (mariadb) 하면 됩니다.

### 갈레라 클러스터 확인

```sql
MariaDB [(none)]> show variables like '%wsrep_cluster%';
+-----------------------+------------------------------------------------------+
| Variable_name         | Value                                                |
+-----------------------+------------------------------------------------------+
| wsrep_cluster_address | gcomm://192.168.10.181,192.168.10.182,192.168.10.183 |
| wsrep_cluster_name    | mariadb-cluster                                      |
+-----------------------+------------------------------------------------------+
```

### 갈레라 클러스터의 전체 재구동

갈레라 클러스터는 모든 노드가 종료되었을시 일반적인 명령을 통해 정상적으로 구동되지 않습니다. rsync 혹은 Xtrabackup(mariabackup)을 이용할 경우 아래와 같은 순서로 구동할 수 있습니다.

1. 마스터가 될 노드의 `wsrep_cluster_address="gcomm://192.168.10.181,192.168.10.182,192.168.10.183"` 부분을 모두 지워 `wsrep_cluster_address="gcomm://"` 로 만듭니다 (ip를 다 지우고).
2. `wsrep_provider_options="gcache.recover=yes"` 옵션을 추가하고 `/etc/init.d/mysql start --wsrep-new-cluster` 명령으로 DB를 구동합니다.
3. 두번째 노드는 `wsrep_cluster_address="gcomm://192.168.10.181"` 부분을 master node의 ip만 기입한 채 `wsrep_provider_options="gcache.recover=yes"` 옵션을 주고 기동 시킵니다.
4. 세번째 노드는 `wsrep_cluster_address="gcomm://192.168.10.181,192.168.10.182"` 부분을 master node와 두번째 노드의 ip를 기입하고 `wsrep_provider_options="gcache.recover=yes"` 옵션을 주고 기동 시킵니다.
5. 세 노드가 모두 올라오면 각 노드의 옵션을 `wsrep_cluster_address="gcomm://192.168.10.181,192.168.10.182,192.168.10.183"` 로 바꾸고 순서대로 하나씩 내렸다가 올립니다.

```sql
MariaDB [(none)]> show variables like '%wsrep_cluster%';
+-----------------------+------------------------------------------------------+
| Variable_name         | Value                                                |
+-----------------------+------------------------------------------------------+
| wsrep_cluster_address | gcomm://192.168.10.181,192.168.10.182,192.168.10.183 |
| wsrep_cluster_name    | mariadb-cluster                                      |
+-----------------------+------------------------------------------------------+
```

이 상태에서 다시 조회 했을때 위와 같이 조회가 되면 갈레라 구성이 살아납니다.

mysqldump를 SST 옵션으로 사용할 경우 해당 상황에서 노드를 부팅하기 위한 파라미터가 있습니다.

- `pc.wait_prim=no`: 무기한으로 기본 컴포넌트를 기다린다(mysqldump를 SST복제 방식으로 요청합니다).
- `pc.bootstrap=1`: 기본 노드를 부트스트랩한다(비어있는 'gcomm://' 값으로 노드가 시작하는것을 막는다).

갈레라 설정에 아래와 같이 설정하면 사용할 수 있습니다.

```ini
gcomm://192.168.10.181?pc.waitprim=no&pc.bootstrap=1,192.168.10.182,192.168.10.183
```

### 스플릿 브레인 상태에서의 복구

갈레라 클러스터에서 다수의 노드(N/2+1)에서 장애가 발생하면 성능 저하 상태에 빠지거나 장애가 발생합니다. 이러한 현상을 스플릿 브레인이라고 합니다. 스플릿 브레인 상태의 클러스터에서 장애 노드를 재구동 하고 싶다면 아래와 같은 절차로 진행을 합니다. 살아있는 노드에 접속하여 다음과 같은 명령을 실행합니다.

```sql
MariaDB [(none)]> SHOW STATUS LIKE 'wsrep_last_committed';
```

해당 명령으로 가장 높은 값을 가진 노드를 찾으면 가장 높은 값을 지닌 노드에 접속하여 쿼럼을 다시 설정합니다.

```sql
MariaDB [(none)]> SET GLOBAL wsrep_provider_options='pc.bootstrap=1';
MariaDB [(none)]> SET GLOBAL wsrep_provider_options='pc.ignore_quorum=0';
```

이 방법을 통해 해당 노드를 마스터로 변경할 수 있고, 다른 노드들이 새로운 마스터와 동기화를 시작합니다. 갈레라 클러스터를 완전히 복구한 후에는 해당 값들을 반드시 원상복구 해줘야 합니다.

### 오라클 RAC와의 차이점

오라클 RAC는 하나의 스토리지를 여러 노드가 공유해서 사용합니다. 어느 노드에서 작업이 이루어 져도 같은 디스크에 쓰기 때문에 작업후 추가적으로 동기화 작업이 일어나지 않습니다. MariaDB나 MySQL에서 갈레라를 통한 다중화 구성은 Master-Master 구성이 맞긴 하지만 한 노드의 작업이 이루어지면 다른 노드에는 해당 결과 값을 복사를 해서 동기화하는 과정을 거치기 때문에, 노드가 늘어나면 DB의 리소스 여유가 생기고 작업에 대한 부담이 줄어드는 오라클과 달리, MariaDB는 노드가 늘어날수록 동기화의 시간이 더 소요 되고 성능적인 저하 발생합니다. 또 갈레라 클러스터 구성 상태에서 create table, database 같은 DDL 작업에 있어서 다소 무리가 있기 때문에 RLU 방식의 롤링 업그레이드를 직접 해주는 것을 권장합니다.
