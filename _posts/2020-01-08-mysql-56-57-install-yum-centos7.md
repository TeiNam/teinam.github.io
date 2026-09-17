---
date: 2020-01-08 03:35:09 +0900
title: "Yum을 통한 MySQL 5.6 & 5.7 설치 on CentOS 7"
category: mysql
excerpt: "Yum을 통한 MySQL 5.6 & 5.7 설치 on CentOS 7 MySQL 5.6 yum install http://dev.mysql.com/get/mysql-community-release-el7-5.noarch.rpm MySQL 5.7 yum install https://…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — MySQL 5.6(2021-02-28)과 5.7(2023-10-31)이 모두 지원 종료됐고 CentOS 7 도 2024-06-30 로 보안 지원이 끝났습니다. 글에 나온 mysql-community-release / mysql57-community-release el7 저장소 RPM 경로도 더 이상 설치 기준이 아닙니다.

![](/assets/img/wp/2019/04/mysql_PNG19.png)

**Yum을 통한 MySQL 5.6 & 5.7 설치 on CentOS 7**

MySQL 5.6

```bash
yum install http://dev.mysql.com/get/mysql-community-release-el7-5.noarch.rpm
```

MySQL 5.7

```bash
yum install https://dev.mysql.com/get/mysql57-community-release-el7-11.noarch.rpm
```

Installation & setting

```bash
yum install mysql-community-server
```

```bash
systemctl enable mysqld
systemctl start mysqld
```

Yum으로 설치하고 mysql을 처음 구동하면, 초기 root 패스워드는 랜덤으로 생성됩니다. 초기 패스워드는 아래와 같은 명령으로 확인 가능합니다.

```bash
grep 'password' /var/log/mysqld.log

root@mysql57_02:~]# grep 'password' /var/log/mysqld.log
2020-01-07T18:21:05.473168Z 1 [Note] A temporary password is generated for root@localhost: <generated-temporary-password>
```

root 패스워드와 보안 설정을 위해 다음 명령을 실행합니다.

```bash
mysql_secure_installation
```

```text
Securing the MySQL server deployment.

Enter password for user root: 

The existing password for the user account root has expired. Please set a new password.

New password: 

Re-enter new password: 
The 'validate_password' plugin is installed on the server.
The subsequent steps will run with the existing configuration
of the plugin.
Using existing password for root.

Estimated strength of the password: 100 
Change the password for root ? ((Press y|Y for Yes, any other key for No) : y

New password: 

Re-enter new password: 

Estimated strength of the password: 100 
Do you wish to continue with the password provided?(Press y|Y for Yes, any other key for No) : y
By default, a MySQL installation has an anonymous user,
allowing anyone to log into MySQL without having to have
a user account created for them. This is intended only for
testing, and to make the installation go a bit smoother.
You should remove them before moving into a production
environment.

Remove anonymous users? (Press y|Y for Yes, any other key for No) : y
Success.


Normally, root should only be allowed to connect from
'localhost'. This ensures that someone cannot guess at
the root password from the network.

Disallow root login remotely? (Press y|Y for Yes, any other key for No) : n

 ... skipping.
By default, MySQL comes with a database named 'test' that
anyone can access. This is also intended only for testing,
and should be removed before moving into a production
environment.


Remove test database and access to it? (Press y|Y for Yes, any other key for No) : y
 - Dropping test database...
Success.

 - Removing privileges on test database...
Success.

Reloading the privilege tables will ensure that all changes
made so far will take effect immediately.

Reload privilege tables now? (Press y|Y for Yes, any other key for No) : y
Success.

All done!
```

처음 실행하면 임시 패스워드로 로그인 할 수 있고, 로그인하자마자 패스워드가 exprie 되었다고 나옵니다.

새로운 패스워드를 입력하는 창이 나오고, 입력하면 root 패스워드를 바꿀것인지 또 묻습니다.

Remove anonymous users? (Press y|Y for Yes, any other key for No) : y

anonymous 계정을 제거할 건지 묻습니다. 인증된 계정만 접속되어야 합니다.

Disallow root login remotely? (Press y|Y for Yes, any other key for No) : n

원격으로 root 계정 로그인을 차단할 것인지 묻습니다.

Remove test database and access to it? (Press y|Y for Yes, any other key for No) : y

Test DB를 삭제하고 접속 제한할 것인지를 묻습니다.

Reload privilege tables now? (Press y|Y for Yes, any other key for No) : y

설정한 것들을 저장할 것인지 묻습니다.

**Password 설정**

MySQL 5.7 버전부터는 대문자와 특수기호를 사용하는 패스워드 정책이 기본으로 적용되어 있습니다.

파라미터를 수정하여 예전에 사용하던 패스워드를 사용할 수 있게 변경할 수 있습니다.

우선 아래 명령으로 패스워드 관련 파라미터 값들을 확인해 보겠습니다.

```sql
mysql> SHOW VARIABLES LIKE 'validate_password%';
+--------------------------------------+--------+
| Variable_name                        | Value  |
+--------------------------------------+--------+
| validate_password_check_user_name    | OFF    |
| validate_password_dictionary_file    |        |
| validate_password_length             | 8      |
| validate_password_mixed_case_count   | 1      |
| validate_password_number_count       | 1      |
| validate_password_policy             | MEDIUM |
| validate_password_special_char_count | 1      |
+--------------------------------------+--------+
7 rows in set (0.00 sec)
```

각각의 파라미터들은 아래와 같은 내용을 의미합니다.

- validate\_password\_length = 8 : 패스워드 8자리 이상 사용
- validate\_password\_mixed\_case\_count = 1: 대문자를 1개 이상 사용
- validate\_password\_number\_count = 1: 숫자를 1개 이상 사용
- validate\_password\_special\_char\_count = 1: 특수기호 1개 이상 사용

그리고 validate\_password\_policy = MEDIUM 으로 되어 있는걸 확인 할 수 있습니다.

MEDIUM으로 되어 있는 경우 관련 파라미터 값들을 모두 적용하겠다는 의미입니다. LOW로 바꿔주면 자릿수 제한, 대문자 사용, 숫자 사용, 특수기호 사용해 대한 정책이 해제됩니다.

my.cnf 안에 아래와 같이 추가 합니다.

```text
vi /etc/my.cnf

.
.
.
#Password Policy
validate_password_policy = LOW
default_password_lifetime = 0
```

제한 없이 패스워드를 사용할 수 있습니다.

그럼 패스워드를 바꿔 보겠습니다.

```sql
mysql -uroot -p
Enter password: 
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 2
Server version: 5.7.28 MySQL Community Server (GPL)

Copyright (c) 2000, 2019, Oracle and/or its affiliates. All rights reserved.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> 
mysql> 
mysql> set password=password('mypassword');
Query OK, 0 rows affected, 1 warning (0.00 sec)

mysql> flush privileges;
Query OK, 0 rows affected (0.00 sec)

mysql>
```

mysql> set password=password(‘mypassword’);

패스워드 설정으로 설정한 패스워드를 통해 DB에 접근할 수 있습니다.

MySQL 8이 나온 시점이지만, 5.6 그리고 5.7을 사용하는 업체도 아직 많고, 테스트 용도로 설치할 필요가 있을수도 있고, 호환성이나 여러 이유로 구버전이 필요하는 경우가 있어서 개인적으로 정리를 해보았습니다.
