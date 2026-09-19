---
date: 2019-03-22 21:03:51 +0900
title: "[Playbook] SSH authorized_keys 등록"
category: database
excerpt: "Ansible 마스터 노드에서 각각의 호스트에 ssh rsa key 전파 authorized_key 모듈을 이용합니다. root 유저로 할 경우 아래와 같이 진행합니다. — – name: Create authority between server and nodes hosts: cep…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — authorized_key 모듈은 ansible-core 에 포함되지 않고 ansible.posix 컬렉션으로 분리되어, 현재 문서는 FQCN ansible.posix.authorized_key 사용과 ansible-galaxy collection install ansible.posix 를 안내한다. 플레이북의 나머지 흐름은 유효하다.

## Ansible 마스터 노드에서 각 호스트에 SSH RSA 키 전파

**전제조건:** Ansible 설치 완료, 인벤토리 파일 준비, 대상 호스트에 초기 SSH 접근 가능

`authorized_key` 모듈을 이용한다.

### root 유저로 실행

root 유저로 할 경우 아래와 같이 진행한다.

{% raw %}
```yaml
---
- name: Create authority between server and nodes
  hosts: ceph
  connection: local
  serial: 1
  gather_facts: no

  tasks:
    - name: ssh-keyscan for known_hosts file
      command: /usr/bin/ssh-keyscan -t ecdsa {{ ansible_host }}
      register: keyscan

    - name: input key
      lineinfile:
        path: ~/.ssh/known_hosts
        line: "{{ item }}"
        create: yes
      with_items:
        - "{{ keyscan.stdout_lines }}"

    - name: ssh-keygen for authorized_keys file
      command: "ssh-keygen -b 2048 -t rsa -f ~/.ssh/id_rsa -q -N ''"
      ignore_errors: yes

    - name: Set authorized key taken from file
      authorized_key:
        user: root
        state: present
        key: "{{ lookup('file', '/root/.ssh/id_rsa.pub') }}"
```
{% endraw %}

```bash
$ ansible-playbook -i inventory add_sshauthkey.yml -k
```

### 일반 유저로 실행

root 유저가 아닐 경우 플레이북 맨 아래 `/root/.ssh/id_rsa.pub`를 `~/.ssh/id_rsa.pub`로 바꾼다.

### 재실행

인벤토리 파일에 IP만 추가하면 몇 번이든 다시 실행해도 키 값이 없는 노드에만 RSA 키를 등록한다.

처음 RSA 키를 넣는 작업이므로 `-k` 옵션을 넣어서 비밀번호를 입력해야 SSH 접속이 가능하다.
