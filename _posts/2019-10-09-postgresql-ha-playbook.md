---
date: 2019-10-09 00:50:47 +0900
title: "[Playbook] PostgreSQL 다중화 구성"
category: postgresql
excerpt: "PostgreSQL 다중화 구성 미리 /etc/hosts 파일에 pgsql01,02,03의 ip를 넣어줬습니다. inventory [master] pgsql01 [slave] pgsql02 pgsql03 . . . [postgres:children] master slave ansi…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 플레이북이 standby 에 recovery.conf(standby_mode)를 생성하는데 12 이후에는 서버가 기동하지 않는다. pg_basebackup -R 로 standby.signal + postgresql.auto.conf 를 만드는 방식으로 바꿔야 하고, wal_keep_segments 는 13 에서 wal_keep_size 로 대체됐다. 대상 버전(10/11)과 EL7 pgdg repo 도 모두 지원 종료 상태다.

![PostgreSQL 다중화 아키텍처](/assets/img/wp/2019/03/6ae3881c84d526d859ed64f1edfce04bbcaa6359.png)

## PostgreSQL 다중화 구성

### 전제조건
- PostgreSQL 10 또는 11 (9.6 미지원)
- CentOS/RHEL 7 (pgdg-redhat-repo 사용)
- `/etc/hosts`에 `pgsql01`, `pgsql02`, `pgsql03` 호스트명과 IP 매핑 설정 필요
- 마스터-슬레이브 스트리밍 복제 구성

### 앤서블 인벤토리 구성

`/etc/hosts` 파일에 각 노드의 IP를 설정한다.

```ini
[master]
pgsql01

[slave]
pgsql02
pgsql03
.
.
.

[postgres:children]
master
slave
ansible_user=root
ansible_password=<mypassword>
```

### 설치 명령

버전은 10 또는 11을 지정할 수 있다.

```bash
ansible-playbook -i inventory inst_psql.yml --extra-vars "version=11"
```

### 플레이북 전체

{% raw %}
```yaml
---
- name: PostgreSQL install
  hosts: postgres
  gather_facts: yes
  vars:
    pgsql_ver: "{{ version }}"
    pgdata: "/var/lib/pgsql/{{ pgsql_ver }}"
    pg_bin: "pgsql-{{ pgsql_ver }}"
  tasks:
    - name: Add postgres Group
      group:
        name: postgres
        gid: 5001
        state: present
    - name: Add Postgres User
      user:
        name: postgres
        shell: /bin/bash
        uid: 5001
        group: postgres
        home: /home/postgres
    - name: create directory
      file:
        path: "{{ pgdata }}"
        state: directory
        owner: postgres
        group: postgres
    - name: Setting bash_profile
      blockinfile:
        path: /home/postgres/.bash_profile
        block: |
          [ -f /etc/profile ] && source /etc/profile
          export PGDATA={{ pgdata }}/data
          # If you want to customize your settings,
          # Use the file below. This is not overridden
          # by the RPMS.
          [ -f /home/postgres/.pgsql_profile ] && source /home/postgres/.pgsql_profile
          export PS1="\[\e[32;1m\]\u@\[\e[34;1m\]\h:\[\e[31;1m\]\w]$ \[\e[0m\]"
          export PATH=$PATH:$HOME/bin:/usr/{{ pg_bin }}/bin
          alias vi='vim'
    - name: install postgresql pgdg repository
      yum:
        name: https://download.postgresql.org/pub/repos/yum/reporpms/EL-7-x86_64/pgdg-redhat-repo-latest.noarch.rpm
        state: present
    - name: install postgresql
      yum:
        name:
          - postgresql{{ pgsql_ver }}
          - postgresql{{ pgsql_ver }}-server
          - postgresql{{ pgsql_ver }}-contrib
        state: present
- name: Master setup
  hosts: master
  become: yes
  become_user: postgres
  vars:
    pgdata_path: /var/lib/pgsql/{{ pgsql_ver }}/data
    shared_buffer: "{{ (ansible_memory_mb.real.total / 2048) |round(0,'common')|int|abs }}"
  tasks:
    - name: PostgreSQL initdb
      shell: "/usr/pgsql-{{ pgsql_ver }}/bin/initdb -D {{ pgdata_path }}"
    - name: set postgresql.conf
      replace:
        path: "{{ pgdata_path }}/postgresql.conf"
        regexp: "{{ item.regexp1 }}"
        replace: "{{ item.replace }}"
      with_items:
        - { regexp1: '#wal_level = replica', replace: 'wal_level = replica' }
        - { regexp1: '#work_mem = 4MB', replace: 'work_mem = 20MB' }
        - { regexp1: '#maintenance_work_mem = 64MB', replace: 'maintenance_work_mem = 512MB' }
        - { regexp1: '#archive_mode = off', replace: 'archive_mode = on' }
        - { regexp1: "#archive_command = ''", replace: "archive_command = 'true'" }
        - { regexp1: "#listen_addresses = 'localhost'", replace: "listen_addresses = '*'" }
        - { regexp1: 'max_connections = 100', replace: 'max_connections = 300' }
        - { regexp1: 'shared_buffers = 128MB', replace: 'shared_buffers = {{ shared_buffer }}GB' }
        - { regexp1: 'max_wal_size = 1GB', replace: 'max_wal_size = 2GB' }
        - { regexp1: 'min_wal_size = 80MB', replace: 'min_wal_size = 2GB' }
        - { regexp1: '#max_wal_senders = 10', replace: 'max_wal_senders = 4' }
        - { regexp1: '#wal_keep_segments = 0', replace: 'wal_keep_segments = 10' }
        - { regexp1: '#hot_standby = on', replace: 'hot_standby = on' }
        - { regexp1: "log_line_prefix = '%m \\[%p\\] '", replace: "log_line_prefix = '%t %u@%r/%d \\[%p\\] '" }
        - { regexp1: "log_filename = 'postgresql-%a.log'", replace: "log_filename = 'pglog-%Y%m%d%H.log'" }
    - name: set pg_hba.conf
      lineinfile:
        path: '{{ pgdata_path }}/pg_hba.conf'
        line: "{{ item.line1 }}"
      with_items:
        - { line1: "host    all             all             0.0.0.0/0               md5" }
        - { line1: "host    replication     postgres        192.168.10.0/24         trust" }
    - name: Start Database
      shell: "/usr/pgsql-{{ pgsql_ver }}/bin/pg_ctl start -D {{ pgdata_path }}"
- name: Slave Setup
  hosts: slave
  become: yes
  become_user: postgres
  vars:
    pgdata_path: /var/lib/pgsql/{{ pgsql_ver }}/data
  tasks:
    - name: to Slave bakcup streaming
      shell: "/usr/pgsql-{{ pgsql_ver }}/bin/pg_basebackup -h pgsql01 -U postgres -D {{ pgdata_path }} -X stream -P"
    - name: create recovery.conf
      file:
        path: "{{ pgdata_path }}/recovery.conf"
        owner: postgres
        group: postgres
        state: touch
    - name: recovery.conf setup
      blockinfile:
        path: "{{ pgdata_path }}/recovery.conf"
        block: |
          recovery_target_timeline = 'latest'
          standby_mode = on
          primary_conninfo = 'host=pgsql01 port=5432 user=postgres'
    - name: start slave database
      shell: "/usr/pgsql-{{ pgsql_ver }}/bin/pg_ctl start -D {{ pgdata_path }}"
```
{% endraw %}

### 주요 설정 값

`shared_buffer`는 총 메모리의 절반을 사용한다. 이 값은 플레이북에서 `ansible_memory_mb.real.total / 2048`로 자동 산출된다.
