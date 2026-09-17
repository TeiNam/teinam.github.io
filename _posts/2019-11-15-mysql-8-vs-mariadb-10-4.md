---
date: 2019-11-15 03:02:44 +0900
title: "MySQL 8 vs MariaDB 10.4"
category: mysql
excerpt: "MySQL 8 MariaDB 10.4 Storage Engines FEDERATED MEMORY InnoDB Performance_Schema MyISAM MRG_MYISAM BLACKHOLE CSV ARCHIVE Default Installation (8) CSV MRG_MyIS…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 비교 대상 두 버전이 모두 지원 종료됐습니다(MariaDB 10.4 는 2024-06-18, MySQL 8.0 은 확장 지원까지 2026-04-30 종료). 현행 비교라면 MySQL 8.4/9.7 LTS 와 MariaDB 11.8/12.3 LTS 기준으로 다시 봐야 하며, TokuDB 등 표에 있는 플러그인은 이미 사라진 것도 있습니다.

## MySQL 8 vs MariaDB 10.4

![MySQL과 MariaDB 비교 이미지](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

|  |  |  |
| --- | --- | --- |
|  | **MySQL 8** | **MariaDB 10.4** |
| **Storage Engines** | - FEDERATED - MEMORY - InnoDB - Performance\_Schema - MyISAM - MRG\_MYISAM - BLACKHOLE - CSV - ARCHIVE | Default Installation (8)  - CSV - MRG\_MyISAM - MEMORY - Aria - MyISAM - SEQUENCE - InnoDB - PERFORMANCE\_SCHEMA   Plugins (6)   - TokuDB - RocksDB - Spider - Connect - OQGRAPH - Mroonga |
| **Clustering Options** | InnoDB Cluster which consists of:  - Group Replication (available as a plugin) - MySQL Shell - MySQL Router | MariaDB Galera Cluster:  - Galera 4 (available in a separate package) |
| **Routing & Proxy** | - MySQL Router (GPLv2) [CE/EE] - 3rd Party ProxySQL | - Maxscale (2.X versions are using the BSL licence) |
| **Security and Encryption** | (Data-at-Rest) Encryption  - MySQL System Tablespace Encryption - General Tablespace Encryption - Undo log - Redo log - Binary and relay log encryption - Audit log - Keyring   - keyring\_file   - keyring\_encrypted\_file [E]   - keyring\_okv [E]   - keyring\_aws [E]   - HashiCorp Vault Keyring [E] | (TDE) Transparent Data Encryption  - Everything including all tables - Individual tables - Everything, excluding individual tables   Key Management and Encryption Plugin   - Data-at-rest with Encryption Key Management - File Key Management - AWS Key Management - Eperi Key Management - Plugin API |
| **Security and Encryption  – HC Vault** | In MySQL 8.0.18 available as an Enterprise plugin 3rd Party   - Percona Server 5.7 and 8.0 | MariaDB 10.4 has a feature request |
| **Data Masking** | MySQL Enterprise Data Masking and De-Identification [EE only feature] 3rd Party:   - Inexpensive Datamasking for MySQL with ProxySQL [CE] | Data masking by using MaxScale proxy |
| **Auditing** | MySQL Enterprise Audit [EE] 3rd Party   - Percona Audit Log Plugin | MariaDB Audit Plugin |
| **Backup and Recovery** | - Mysqldump - Mysqlpump - MySQL Enterprise Backup [EE] - The Clone Plugin (8.0.17)   3rd Party   - Percona XtraBackup [CE] - Mydumper | - Mysqldump - Mariabackup   3rd Party   - Mydumper |
| **Key Default Variables** | innodb\_autoinc\_lock\_mode=2 log\_bin=ON  max\_allowed\_packet=64M  open\_files\_limit=10000  Query cache removed:  [*Check MySQL Blog*](https://mysqlserverteam.com/mysql-8-0-retiring-support-for-the-query-cache/)  table\_open\_cache\_instances=16  table\_open\_cache=4000  thread\_cache\_size=9  binlog\_format=ROW  binlog\_group\_commit\_sync\_delay  DEPRECATED  log\_slave\_updates=ON  sync\_binlog=1  sql\_mode=ONLY\_FULL\_GROUP\_BY,STRICT\_TRANS\_TABLES,  NO\_ZERO\_IN\_DATE, NO\_ZERO\_DATE,  ERROR\_FOR\_DIVISION\_BY\_ZERO,  NO\_ENGINE\_SUBSTITUTION | innodb\_autoinc\_lock\_mode=1 log\_bin=OFF  max\_allowed\_packet=16M  open\_files\_limit=4186  query\_cache\_type=off  But  query\_cache\_limit=1M  table\_open\_cache\_instances=8  table\_open\_cache=2000  thread\_cache\_size=151  binlog\_format=MIXED  —  innodb\_locks\_unsafe\_for\_binlog  log\_slave\_updates=OFF  sync\_binlog=0  sql\_mode=STRICT\_TRANS\_TABLES,  ERROR\_FOR\_DIVISION\_BY\_ZERO,  NO\_AUTO\_CREATE\_USER,  NO\_ENGINE\_SUBSTITUTION |
