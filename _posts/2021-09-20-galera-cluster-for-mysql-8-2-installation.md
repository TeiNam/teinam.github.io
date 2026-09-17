---
date: 2021-09-20 23:32:01 +0900
title: "Galera cluster for MySQL 8 – #.2 installation"
category: mysql
excerpt: "Galera Cluster & MySQL 8 설치 설치환경 CPU: 2 core RAM: 4GB OS: CentOS 7 yum을 이용해 패키지 설치를 진행합니다. CentOS 7버전이 아직까지는 가장 안정적인 버전으로 많이 사용하기 때문에 7로 진행했습니다. 필수 패키지 설치 yu…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — CentOS 7(2024-06-30 EOL) 에서 releases.galeracluster.com 의 galera-4.9 / mysql-wsrep-8.0.25 레포를 받는 절차인데, 배포 채널이 MariaDB 로 이관되고 현재 릴리즈는 8.4.11-26.28-GA 라 이 설치 순서를 그대로 따를 수 없다. MySQL 용 Galera 자체가 2026-09-30 유지보수 종료 대상이다.

![](/assets/img/wp/2019/04/mysql_PNG19.png)

### Galera Cluster & MySQL 8 설치

- 설치환경
- CPU: 2 core
- RAM: 4GB
- OS: CentOS 7

`yum`을 이용해 패키지 설치를 진행합니다. 작성 시점(2021년)에 CentOS 7버전이 가장 널리 사용되는 안정적인 버전이라 7로 진행했습니다.

**필수 패키지 설치**

```bash
yum install ncurses ncurses-devel ncurses-libs openssl openssl-devel glibc bison make cmake readline gcc gcc-c++ wget autoconf automake libtool* libmcrypt* git patchelf libtirpc* rpcgen numactl numactl-devel ncurses-compat-libs libaio libaio-devel
```

MySQL을 설치하기전에 필요한 패키지를 먼저 설치합니다.

**selinux 설정 해제**

`vi /etc/selinux/config`

```ini
# This file controls the state of SELinux on the system.
# SELINUX= can take one of these three values:
#     enforcing - SELinux security policy is enforced.
#     permissive - SELinux prints warnings instead of enforcing.
#     disabled - No SELinux policy is loaded.
SELINUX=permissive
# SELINUXTYPE= can take one of three values:
#     targeted - Targeted processes are protected,
#     minimum - Modification of targeted policy. Only selected processes are protected.
#     mls - Multi Level Security protection.
SELINUXTYPE=targeted
```

`setenforce 0` 을 해주거나 재부팅

**firewalld 해제**

`systemctl stop firewalld`

`systemctl disable firewalld`

제가 방화벽을 끄는 이유는 그냥 귀찮아서 입니다. 실제 사용 환경에서는 방화벽 설정을 해줘야 하는데, 방법은 아래와 같습니다. 해당 포트는 SST(State Snapshot Transfer, 4444), IST(Incremental State Transfer, 4568), 그룹 커뮤니케이션(4567)에 사용됩니다.

```bash
firewall-cmd --permanent --add-service=mysql
success
firewall-cmd --permanent --add-port={4567,4568,4444}/tcp
success
firewall-cmd --reload
```

**hosts 파일 수정**

각각의 노드에 /etc/hosts 에 들어가서 갈레라 클러스터에 등록될 모든 노드의 ip와 호스트명을 기입해줍니다.

`vi /etc/hosts`

```text
192.168.254.145 mysql8-g01
192.168.254.146 mysql8-g02
192.168.254.147 mysql8-g03
```

**yum repository 생성**

`vi /etc/yum.repos.d/galera.repo`

```ini
[galera]
name = Galera
baseurl = https://releases.galeracluster.com/galera-4.9/centos/7/x86_64
gpgkey = https://releases.galeracluster.com/GPG-KEY-galeracluster.com
gpgcheck = 1

[mysql-wsrep]
name = MySQL-wsrep
baseurl = http://releases.galeracluster.com/mysql-wsrep-8.0.25-26.7/centos/7/x86_64/
gpgkey = https://releases.galeracluster.com/GPG-KEY-galeracluster.com
gpgcheck = 1
```

**yum 패키지를 통한 Galera 및 MySQL 8 설치**

`yum install galera-4 mysql-wsrep-8.0`

설치되는 패키지는 아래와 같습니다.

```text
===============================================================================
 Package                                                      Version          
===============================================================================
Installing:
 galera-4                                                     26.4.9-1.el7     
 mysql-wsrep-8.0                                              8.0.25-26.7.el7  
 mysql-wsrep-libs                                             8.0.25-26.7.el7  
     replacing  mariadb-libs.x86_64 1:5.5.68-1.el7
 mysql-wsrep-libs-compat                                      8.0.25-26.7.el7  
     replacing  mariadb-libs.x86_64 1:5.5.68-1.el7
Installing for dependencies:
 boost-program-options                                        1.53.0-28.el7    
 lsof                                                         4.87-6.el7       
 mysql-wsrep-client                                           8.0.25-26.7.el7  
 mysql-wsrep-client-plugins                                   8.0.25-26.7.el7  
 mysql-wsrep-common                                           8.0.25-26.7.el7  
 mysql-wsrep-server                                           8.0.25-26.7.el7  
 socat                                                        1.7.3.2-2.el7    
 stunnel                                                      4.56-6.el7       

Transaction Summary
===============================================================================
```

그리고 재구동시 `mysqld` 가 자동으로 구동되지 않게 설정을 바꿔줍니다.

`systemctl disable mysqld`

Galera에서 제공하는 mysql-wsrep 패키지를 이용해 MySQL 8 버전을 설치하기 때문에 별도로 MySQL 8의 repository를 구성할 필요가 없습니다. 이 글을 작성 시점(2021.09.20)에 Galera에서 제공하는 MySQL의 버전은 8.0.25 버전이며, 정식 MySQL 레포에서 받을수 있는 버전은 8.0.26 입니다.

### Galera Cluster 구성하기

1번 노드에서 먼저 설정을 합니다.

`vi /etc/my.cnf`

```ini
[mysqld]
datadir=/var/lib/mysql
socket=/var/lib/mysql/mysql.sock

log-error=/var/log/mysqld.log
pid-file=/var/run/mysqld/mysqld.pid

user=mysql

bind-address="0.0.0.0"

binlog_format=ROW

default_storage_engine=InnoDB
innodb_autoinc_lock_mode=2
innodb_flush_log_at_trx_commit=0
innodb_buffer_pool_size=2G

wsrep_on=ON
wsrep_provider=/usr/lib64/galera-4/libgalera_smm.so
wsrep_cluster_address="gcomm://mysql8-g01,mysql8-g02,mysql8-g03"
wsrep_provider_options="gcache.size=300M; gcache.page_size=300M;"
wsrep_cluster_name="galera-cluster"
wsrep_node_name="mysql8-g01"
wsrep_node_address="mysql8-g01"
wsrep_sst_method="clone"
```

Galera Cluster 구성에 필요한 가장 기본적인 세팅값만 넣은 것입니다. 기본 설정값 중 주요 설정 네 가지를 확인합니다.

`innodb_autoinc_lock_mode=2`

auto-increment의 위한 InnoDB의 잠금 모드가 interleaved lock 모드로 설정되어야 auto-increment의 안정성을 보장합니다. 값을 2로 설정합니다. 이 값을 변경하게 되면 AUTO\_INCREMENT 열있는 테이블에서 Insert가 실패할 수 있습니다. innodb\_autoinc\_lock\_mode가 기존 잠금 모드(즉, 값 0) 또는 연속 잠금 모드(즉, 값 1)로 설정되면 Galera Cluster에서 해결할 수 없는 Deadlock이 발생하고 시스템이 무응답상태로 빠집니다.

`innodb_flush_log_at_trx_commit=0`

성능 향상을 위해 InnoDB 로그 버퍼의 기록방시이 커밋이 끝났을때 기록되는 방식이 아닌 매 초당 기록하는 방식으로 변경해야 합니다. innodb\_flush\_log\_at\_trx\_commit 값을 0 또는 2로 설정하면 성능이 향상되지만 잠재적인 문제도 발생할 수도 있기 때문에 주의해야 합니다. 운영체제 충돌 또는 정전은 트랜잭션의 마지막 순간을 기록하지 못할 수도 있습니다. 일반적으로 다른 노드에서 이 데이터를 복구할 수 있지만 클러스터가 동시에 다운되는 경우 데이터가 손실될 수 있습니다.

`innodb_buffer_pool_size=122M`

innodb\_buffer\_pool\_size 매개변수를 통해 이 메모리 버퍼를 구성할 수 있습니다. 기본값은 128MB입니다. 일반적으로 사용하지 않는 메모리의 70~80%를 InnoDB Buffer Pool로 설정하지만, Galera Cluster가 사용하는 메모리 영역을 위해 싱글 인스턴스로 사용하는 MySQL 보다 5% 정도 축소해서 설정해야합니다. 자신의 환경에 맞게 설정해주면 됩니다.

`wsrep_sst_method="clone"`

새로 생긴 SST Method 입니다. Galera에서는 rsync보다 빠르고, DDL 작업 시에만 donor를 blocking한다고 설명하고 있기 때문에 xtrabackup을 대체하지 않을까 싶습니다.

**Galera Cluster 초기 구동**

1번 노드에서는 bootstrap 명령으로 mysqld를 실행합니다. `--wsrep-new-cluster` 옵션은 해당 노드를 새로운 클러스터로 시작하게 하는 옵션입니다.

`mysqld_bootstrap --wsrep-new-cluster`

그리고 `mysql_secure_installation`으로 root의 패스워드를 바꿔줘야 합니다. mysql 설치하고 나서 발급받는 입시 비밀번호는 `/var/log/mysqld.log` 에서 확인할 수 있습니다.

mysql에 root로 접속해서 Galera Cluster에서 동기화에 사용될 계정을 생성해 줍니다. 계정명은 원하는 대로 설정하시면 됩니다.

```bash
mysql -uroot -p
Enter password: 
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 17
Server version: 8.0.25 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> create user 'galera'@'%' identified by '<password>' ;
mysql> grant all privileges on *.* to 'galera'@'%';
mysql> flush privileges;
```

<password> 에는 자신만의 암호를 넣어주시기 바랍니다.

1번 노드에서 galera 계정을 이용하기 위해 DB를 재구동을 할 것인데, my.cnf 파일을 열어 `wsrep_sst_auth=galera:password` 를 추가 해줍니다.

```ini
datadir=/var/lib/mysql
socket=/var/lib/mysql/mysql.sock

log-error=/var/log/mysqld.log
pid-file=/var/run/mysqld/mysqld.pid

user=mysql

bind-address="0.0.0.0"

binlog_format=ROW

default_storage_engine=InnoDB
innodb_autoinc_lock_mode=2
innodb_flush_log_at_trx_commit=0
innodb_buffer_pool_size=2G

wsrep_on=ON
wsrep_provider=/usr/lib64/galera-4/libgalera_smm.so
wsrep_cluster_address="gcomm://mysql8-g01,mysql8-g02,mysql8-g03"
wsrep_provider_options="gcache.size=300M; gcache.page_size=300M;"
wsrep_cluster_name="galera-cluster"
wsrep_node_name="mysql8-g01"
wsrep_node_address="mysql8-g01"
wsrep_sst_method="clone"
wsrep_sst_auth=galera:password
```

`systemctl stop mysqld`

`mysqld_bootstrap --wsrep-new-cluster`

**2, 3번 노드 설정**

2, 3번 노드의 my.cnf도 동일하게 설정해주면 됩니다.

2번 노드

```ini
datadir=/var/lib/mysql
socket=/var/lib/mysql/mysql.sock

log-error=/var/log/mysqld.log
pid-file=/var/run/mysqld/mysqld.pid

user=mysql

bind-address="0.0.0.0"

binlog_format=ROW

default_storage_engine=InnoDB
innodb_autoinc_lock_mode=2
innodb_flush_log_at_trx_commit=0
innodb_buffer_pool_size=2G

wsrep_on=ON
wsrep_provider=/usr/lib64/galera-4/libgalera_smm.so
wsrep_cluster_address="gcomm://mysql8-g01,mysql8-g02,mysql8-g03"
wsrep_provider_options="gcache.size=300M; gcache.page_size=300M;"
wsrep_cluster_name="galera-cluster"
wsrep_node_name="mysql8-g02"
wsrep_node_address="mysql8-g02"
wsrep_sst_method="clone"
wsrep_sst_auth=galera:password
```

3번 노드

```ini
datadir=/var/lib/mysql
socket=/var/lib/mysql/mysql.sock

log-error=/var/log/mysqld.log
pid-file=/var/run/mysqld/mysqld.pid

user=mysql

bind-address="0.0.0.0"

binlog_format=ROW

default_storage_engine=InnoDB
innodb_autoinc_lock_mode=2
innodb_flush_log_at_trx_commit=0
innodb_buffer_pool_size=2G

wsrep_on=ON
wsrep_provider=/usr/lib64/galera-4/libgalera_smm.so
wsrep_cluster_address="gcomm://mysql8-g01,mysql8-g02,mysql8-g03"
wsrep_provider_options="gcache.size=300M; gcache.page_size=300M;"
wsrep_cluster_name="galera-cluster"
wsrep_node_name="mysql8-g03"
wsrep_node_address="mysql8-g03"
wsrep_sst_method="clone"
wsrep_sst_auth=galera:password
```

그리고 2, 3번 노드에서 아래의 명령으로 DB를 구동해줍니다.

`systemctl start mysqld`

**Galera Cluster 확인하기**

```sql
mysql> show variables like '%wsrep_cluster%';
+-------------------------+------------------------------------------+
| Variable_name           | Value                                    |
+-------------------------+------------------------------------------+
| wsrep_cluster_address   | gcomm://mysql8-g01,mysql8-g02,mysql8-g03 |
| wsrep_cluster_name      | galera-cluster                           |
| wsrep_cluster_server_id | 1                                        |
+-------------------------+------------------------------------------+
3 rows in set (0.01 sec)

mysql> show variables like 'wsrep%';
```

`show variables like '%wsrep_cluster%';`

`show variables like 'wsrep%';`

**DDL 테스트**

1번 노드에서 DB를 생성합니다.

```
mysql> create database test02;
Query OK, 1 row affected (0.02 sec)

mysql> show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test01             |
| test02             |
+--------------------+
6 rows in set (0.00 sec)
```

2번, 3번 노드에서 확인

```
mysql> show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test01             |
| test02             |
+--------------------+
6 rows in set (0.00 sec)
```

1번에서 생성한 DB가 2,3번 노드에서도 확인 가능합니다.

이렇게 Galera Cluster for MySQL 8의 구성은 완료했습니다.

MariaDB는 엔터프라이즈 사용시 xpand 라는 새로운 Multi-write scale-out 툴을 출시 했습니다. 그래서인지 Galera 공식 홈페이지에는 MySQL 8 지원 내용이 많습니다. MariaDB에 대한 내용은 별로 없구요. MariaDB 커뮤니티 버전은 여전히 Galera Cluster를 공식 클러스터링 툴로 표기해 놓았습니다.

InnoDB Cluster는 실제 레퍼런스가 거의 없는 편이고, xtradb cluster는 Percona에 의지를 해야하는 편입니다. Galera Cluster가 오히려 더 레퍼런스가 많고 자료가 많은 편입니다. 그리고 clone 이라는 SST Method가 추가된 만큼 갈레라의 성능도 기대하고 있습니다.

다음 포스팅에서는 Galera Cluster Manager를 설치해서 관리하는 것을 해보겠습니다.

Galera cluster for MySQL 8 - #.1 Architecture

Galera cluster Galera cluster는 코더십이 만든 동기식 멀티 마스터 복제 기법입니다. 인증 기반 복제(Certification-Based Replication) 방식을 사용하며, 데이터의 완전성을 자동으로 관리해줍니다. 그리고 현재 Galera cluster는 MySQL, MariaDB 그리고 Percona XtraDB 까지도 클러스터를 구성할 수 있습니다....

Galera cluster for MySQL 8 – #.3 동기화 성능

Galera cluster for MySQL 8 동기화 성능 Galera 매니저를 테스트 해보려고 했는데, 온프렘에서는 잘 안되더군요. 기존의 클러스터가 추가가 안되서 설치만하고 등록이 안되더군요. AWS에서는 Galera 매니저를 맨처음에 설치하고 매니저에서 Galera + wrsep MySQL8 버전을 EC2로...
