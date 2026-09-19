---
date: 2019-03-22 21:03:51 +0900
title: "[Playbook] SSH authorized_keys 등록"
category: etc
excerpt: "Ansible 마스터 노드에서 각 호스트에 SSH RSA 키를 전파합니다. ansible.posix.authorized_key 모듈을 이용하며, ansible.posix 컬렉션 설치가 필요합니다."
updated: 2026-09-20
---

## Ansible 마스터 노드에서 각 호스트에 SSH RSA 키 전파

**전제조건:**
- Ansible 설치 완료
- 인벤토리 파일 준비
- 대상 호스트에 초기 SSH 접근 가능
- `ansible.posix` 컬렉션 설치 (`ansible-galaxy collection install ansible.posix`)

`ansible.posix.authorized_key` 모듈을 사용합니다. Ansible 2.10부터 이 모듈은 `ansible-core`에 포함되지 않고 `ansible.posix` 컬렉션으로 분리됐습니다.

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
      loop: "{{ keyscan.stdout_lines }}"

    - name: ssh-keygen for authorized_keys file
      command: "ssh-keygen -b 2048 -t rsa -f ~/.ssh/id_rsa -q -N ''"
      ignore_errors: yes

    - name: Set authorized key taken from file
      ansible.posix.authorized_key:
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

### 주요 옵션

- `state: present` (기본값) — 키 추가, `state: absent`로 키 제거 가능
- `manage_dir: true` (기본값) — `~/.ssh` 디렉토리와 파일의 소유자·권한 자동 관리
- `exclusive: false` (기본값) — `true`로 설정 시 지정한 키만 남기고 나머지 제거 (주의: 루프와 함께 사용 시 각 반복마다 exclusive 적용)

### 재실행

인벤토리 파일에 IP만 추가하면 몇 번이든 다시 실행해도 키 값이 없는 노드에만 RSA 키를 등록합니다. `authorized_key` 모듈은 멱등성을 보장합니다.

처음 RSA 키를 넣는 작업이므로 `-k` 옵션을 넣어서 비밀번호를 입력해야 SSH 접속이 가능합니다.
