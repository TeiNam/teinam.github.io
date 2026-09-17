---
date: 2020-07-02 17:31:59 +0900
title: "MariaDB 10.5 Galera Cluster 설정"
category: mysql
excerpt: "MariaDB 10.5 Galera Cluster 설정 MariaDB가 10.5 버전이 정식으로 릴리즈 되서 오늘(2020.07.02) 기준 10.5.4 버전을 내려 받을수 있습니다. 10.5 버전부터 Galera의 wsrep gtid를 지원합니다. 따라서 wsrep gtid를 이…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — MariaDB 10.5.4 + CentOS 7.8 + yum 레포 전제인데, 10.5 는 커뮤니티 지원이 2025-06-24 에, CentOS 7 은 2024-06-30 에 종료되었다. 설정 자체(mariabackup SST, wsrep gtid)는 개념이 유지되지만 레포 경로와 패키지 버전은 재현 불가다.

![](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

## MariaDB 10.5 Galera Cluster 설정

> **전제조건**
> - CentOS 7.8 (원문 검증 환경)
> - yum 패키지 관리자
> - 네트워크로 연결된 3대의 노드 (사설 IP 할당됨)
> - MariaDB 10.5 (wsrep GTID 지원 최소 버전), 문서 기준 10.5.4

MariaDB 10.5 버전이 정식 릴리즈되어 2020년 7월 2일 기준 10.5.4 버전을 내려받을 수 있다.

10.5 버전부터 Galera의 wsrep GTID(Global Transaction ID — Galera 클러스터의 트랜잭션 추적 식별자)를 지원한다.

따라서 wsrep GTID를 이용한 Galera Cluster를 세팅해보겠다.

이 가이드는 CentOS 7.8에서 구성했다.

**업데이트**

2020년 7월 20일: Galera Cluster 설정 부분을 rsync에서 mariabackup으로 변경했다.

### 1. 10.5 repository 추가

```ini
vi /etc/yum.repos.d/mariadb.repo

[mariadb]
name = MariaDB
baseurl = http://yum.mariadb.org/10.5/centos74-amd64
gpgkey=https://yum.mariadb.org/RPM-GPG-KEY-MariaDB
gpgcheck=1
```

### 2. yum을 이용한 MariaDB 설치

> **주의:** 보안 이슈로 root 계정으로 설치하는 것은 권장하지 않습니다. 하지만 테스트 용도이므로 root 계정으로 진행합니다.

```bash
$ yum install MariaDB-server MariaDB-backup

Loaded plugins: fastestmirror
Loading mirror speeds from cached hostfile
 * base: mirror.kakao.com
 * extras: mirror.kakao.com
 * updates: mirror.kakao.com
Resolving Dependencies
--> Running transaction check
---> Package MariaDB-backup.x86_64 0:10.5.4-1.el7.centos will be installed
--> Processing Dependency: MariaDB-common for package: MariaDB-backup-10.5.4-1.el7.centos.x86_64
---> Package MariaDB-server.x86_64 0:10.5.4-1.el7.centos will be installed
--> Processing Dependency: MariaDB-client for package: MariaDB-server-10.5.4-1.el7.centos.x86_64
--> Running transaction check
---> Package MariaDB-client.x86_64 0:10.5.4-1.el7.centos will be installed
---> Package MariaDB-common.x86_64 0:10.5.4-1.el7.centos will be installed
--> Processing Dependency: MariaDB-compat for package: MariaDB-common-10.5.4-1.el7.centos.x86_64
--> Running transaction check
---> Package MariaDB-compat.x86_64 0:10.5.4-1.el7.centos will be installed
--> Finished Dependency Resolution

Dependencies Resolved

===========================================================================================================================================================================================================================================
 Package                                                    Arch                                               Version                                                           Repository                                           Size
===========================================================================================================================================================================================================================================
Installing:
 MariaDB-backup                                             x86_64                                             10.5.4-1.el7.centos                                               mariadb                                             6.8 M
 MariaDB-server                                             x86_64                                             10.5.4-1.el7.centos                                               mariadb                                              26 M
Installing for dependencies:
 MariaDB-client                                             x86_64                                             10.5.4-1.el7.centos                                               mariadb                                              13 M
 MariaDB-common                                             x86_64                                             10.5.4-1.el7.centos                                               mariadb                                              81 k
 MariaDB-compat                                             x86_64                                             10.5.4-1.el7.centos                                               mariadb                                             2.2 M

Transaction Summary
===========================================================================================================================================================================================================================================
Install  2 Packages (+3 Dependent packages)

Total download size: 48 M
Installed size: 48 M
Is this ok [y/d/N]: y
Downloading packages:
(1/5): MariaDB-backup-10.5.4-1.el7.centos.x86_64.rpm                                                                                                                                                                | 6.8 MB  00:00:07
(2/5): MariaDB-common-10.5.4-1.el7.centos.x86_64.rpm                                                                                                                                                                |  81 kB  00:00:00
(3/5): MariaDB-compat-10.5.4-1.el7.centos.x86_64.rpm                                                                                                                                                                | 2.2 MB  00:00:02
(4/5): MariaDB-client-10.5.4-1.el7.centos.x86_64.rpm                                                                                                                                                                |  13 MB  00:00:12
(5/5): MariaDB-server-10.5.4-1.el7.centos.x86_64.rpm                                                                                                                                                                |  26 MB  00:00:21
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
Total                                                                                                                                                                                                      1.5 MB/s |  48 MB  00:00:31
Running transaction check
Running transaction test
Transaction test succeeded
Running transaction
  Installing : MariaDB-compat-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               1/5
  Installing : MariaDB-common-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               2/5
  Installing : MariaDB-client-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               3/5
  Installing : MariaDB-server-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               4/5


Two all-privilege accounts were created.
One is root@localhost, it has no password, but you need to
be system 'root' user to connect. Use, for example, sudo mysql
The second is mysql@localhost, it has no password either, but
you need to be the system 'mysql' user to connect.
After connecting you can set the password, if you would need to be
able to connect as any of these users with a password and without sudo

See the MariaDB Knowledgebase at https://mariadb.com/kb or the
MySQL manual for more instructions.

Please report any problems at https://mariadb.org/jira

The latest information about MariaDB is available at https://mariadb.org/.
You can find additional information about the MySQL part at:
https://dev.mysql.com
Consider joining MariaDB's strong and vibrant community:
Get Involved

  Installing : MariaDB-backup-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               5/5
  Verifying  : MariaDB-backup-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               1/5
  Verifying  : MariaDB-client-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               2/5
  Verifying  : MariaDB-common-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               3/5
  Verifying  : MariaDB-compat-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               4/5
  Verifying  : MariaDB-server-10.5.4-1.el7.centos.x86_64                                                                                                                                                                               5/5

Installed:
  MariaDB-backup.x86_64 0:10.5.4-1.el7.centos                                                                          MariaDB-server.x86_64 0:10.5.4-1.el7.centos

Dependency Installed:
  MariaDB-client.x86_64 0:10.5.4-1.el7.centos                                   MariaDB-common.x86_64 0:10.5.4-1.el7.centos                                   MariaDB-compat.x86_64 0:10.5.4-1.el7.centos

Complete!
```

### 3. 노드별 설정

각 노드별로 `my.cnf.d/server.cnf` 설정을 추가한다.

#### Node 01

```ini
[mysqld]
bind-address                    = 0.0.0.0
character-set-server            = utf8
datadir                         = /var/lib/mysql

#innodb
default-storage-engine          = InnoDB
innodb_buffer_pool_size         = 4G
innodb_flush_method             = O_DIRECT
innodb_log_buffer_size          = 16M
innodb_log_file_size            = 256M
innodb_io_capacity              = 6000
innodb_io_capacity_max          = 6000

##logs
slow_query_log                  = ON
long_query_time                 = 10
log_error                       = /var/lib/mysql/mysqld.err

##limits
join_buffer_size                = 1M
read_buffer_size                = 256K
tmp_table_size                  = 256M
max_heap_table_size             = 256M
lock_wait_timeout               = 300
innodb_monitor_enable           = all
performance_schema              = ON

innodb_flush_log_at_trx_commit  = 0


[galera]
# Mandatory settings
wsrep_on                        = ON
wsrep_provider                  = /usr/lib64/galera-4/libgalera_smm.so
wsrep_provider_options          = gcache.size=1024M
wsrep_cluster_address           = gcomm://172.16.70.42,172.16.70.43,172.16.70.44
binlog_format                   = row
wsrep_forced_binlog_format      = row
wsrep_gtid_mode                 = 1
innodb_autoinc_lock_mode        = 2
innodb_doublewrite              = 1
query_cache_size                = 0
wsrep_gtid_domain_id            = 1
wsrep_debug                     = 0
wsrep_cluster_name              = galera-cluster
wsrep_node_address              = 172.16.70.42
wsrep_node_name                 = mariadb01
wsrep_sst_method                = mariabackup
wsrep_sst_auth                  = mysql:
wsrep_sst_receive_address       = 172.16.70.42
wsrep_log_conflicts             = 1
wsrep_slave_threads             = 4
log_slave_updates
```

#### Node 02

```ini
[mysqld]
bind-address                    = 0.0.0.0
character-set-server            = utf8
datadir                         = /var/lib/mysql
#innodb
default-storage-engine          = InnoDB
innodb_buffer_pool_size         = 4G
innodb_flush_method             = O_DIRECT
innodb_log_buffer_size          = 16M
innodb_log_file_size            = 256M
innodb_io_capacity              = 6000
innodb_io_capacity_max          = 6000
##logs
slow_query_log                  = ON
long_query_time                 = 10
log_error                       = /var/lib/mysql/mysqld.err
##limits
join_buffer_size                = 1M
read_buffer_size                = 256K
tmp_table_size                  = 256M
max_heap_table_size             = 256M
lock_wait_timeout               = 300
innodb_monitor_enable           = all
performance_schema              = ON
innodb_flush_log_at_trx_commit  = 0
[galera]
# Mandatory settings
wsrep_on                        = ON
wsrep_provider                  = /usr/lib64/galera-4/libgalera_smm.so
wsrep_provider_options          = gcache.size=1024M
wsrep_cluster_address           = gcomm://172.16.70.42,172.16.70.43,172.16.70.44
binlog_format                   = row
wsrep_forced_binlog_format      = row
wsrep_gtid_mode                 = 1
innodb_autoinc_lock_mode        = 2
innodb_doublewrite              = 1
query_cache_size                = 0
wsrep_gtid_domain_id            = 1
wsrep_debug                     = 0
wsrep_cluster_name              = galera-cluster
wsrep_node_address              = 172.16.70.43
wsrep_node_name                 = mariadb02
wsrep_sst_method                = mariabackup
wsrep_sst_auth                  = mysql:
wsrep_sst_receive_address       = 172.16.70.43
wsrep_log_conflicts             = 1
wsrep_slave_threads             = 4
log_slave_updates
```

#### Node 03

```ini
[mysqld]
bind-address                    = 0.0.0.0
character-set-server            = utf8
datadir                         = /var/lib/mysql
#innodb
default-storage-engine          = InnoDB
innodb_buffer_pool_size         = 4G
innodb_flush_method             = O_DIRECT
innodb_log_buffer_size          = 16M
innodb_log_file_size            = 256M
innodb_io_capacity              = 6000
innodb_io_capacity_max          = 6000
##logs
slow_query_log                  = ON
long_query_time                 = 10
log_error                       = /var/lib/mysql/mysqld.err
##limits
join_buffer_size                = 1M
read_buffer_size                = 256K
tmp_table_size                  = 256M
max_heap_table_size             = 256M
lock_wait_timeout               = 300
innodb_monitor_enable           = all
performance_schema              = ON
innodb_flush_log_at_trx_commit  = 0
[galera]
# Mandatory settings
wsrep_on                        = ON
wsrep_provider                  = /usr/lib64/galera-4/libgalera_smm.so
wsrep_provider_options          = gcache.size=1024M
wsrep_cluster_address           = gcomm://172.16.70.42,172.16.70.43,172.16.70.44
binlog_format                   = row
wsrep_forced_binlog_format      = row
wsrep_gtid_mode                 = 1
innodb_autoinc_lock_mode        = 2
innodb_doublewrite              = 1
query_cache_size                = 0
wsrep_gtid_domain_id            = 1
wsrep_debug                     = 0
wsrep_cluster_name              = galera-cluster
wsrep_node_address              = 172.16.70.44
wsrep_node_name                 = mariadb03
wsrep_sst_method                = mariabackup
wsrep_sst_auth                  = mysql:
wsrep_sst_receive_address       = 172.16.70.44
wsrep_log_conflicts             = 1
wsrep_slave_threads             = 4
log_slave_updates
```

### 4. 클러스터 구동

**1번 노드에서만** `galera_new_cluster` 명령으로 구동하고, 나머지 노드에서는 `systemctl start mariadb` 명령으로 구동합니다.

1. **Node 01에서 클러스터 초기화**

   ```bash
   $ galera_new_cluster
   ```

2. **Node 01에서 mariabackup 계정 설정**

   `galera_new_cluster` 실행 후 Node 01에서 mariabackup을 이용할 계정을 설정한다.

   mysql 계정으로 진행하며, 비밀번호 대신 unix-socket을 이용한 로그인을 사용한다.

   ```sql
   alter user 'mysql'@'localhost' IDENTIFIED VIA unix_socket;
   GRANT RELOAD, PROCESS, LOCK TABLES, REPLICATION CLIENT ON *.* TO 'mysql'@'localhost';
   ```

3. **Node 02, 03에서 MariaDB 구동**

   ```bash
   $ systemctl start mariadb
   ```

### 5. 클러스터 확인

MariaDB에 mysql로 접속해 아래 명령을 실행하면 클러스터링 결과를 확인할 수 있다.

```sql
MariaDB [(none)]> SHOW STATUS LIKE 'wsrep_cluster_size';
+--------------------+-------+
| Variable_name      | Value |
+--------------------+-------+
| wsrep_cluster_size | 3     |
+--------------------+-------+
1 row in set (0.015 sec)
```

`wsrep_cluster_size` 값이 3이면 Galera Cluster 구성이 완료된 것이다.
