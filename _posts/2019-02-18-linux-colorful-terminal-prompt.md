---
date: 2019-02-18 19:35:38 +0900
title: "리눅스 터미널에서 프롬프트를 컬러풀하게 사용하는 법"
category: database
excerpt: "흑백 화면인 리눅스 터미널 화면을 컬러로 바꾸고, 서버마다 색상을 다르게 세팅하면 작업 할 때에도 서버가 헷갈려서 실수 할 일이 조금 더 줄어듭니다. # yum -y install vim # vi .bash_profile export PS1=”\\[\\e[36;1m\\]\\u@\\[\\e[3…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — PS1 색상 이스케이프와 TERM 설정 방식은 2026-09 현재도 동일하게 동작한다. 설치 예시의 yum 은 CentOS 7(2024-06-30 EOL) 기준이며 RHEL 9·Rocky 9 계열은 dnf 를 쓴다.

흑백 화면인 리눅스 터미널 화면을 컬러로 바꾸고, 서버마다 색상을 다르게 설정하면 작업할 때 서버가 헷갈려서 실수할 일이 조금 더 줄어듭니다.

```bash
# yum -y install vim
# vi .bash_profile

export PS1="\[\e[36;1m\]\u@\[\e[32;1m\]\h:\[\e[31;1m\]\w]# \[\e[0m\]"
export TERM=linux
alias vi='vim $*'
```

vim이 없다면 yum으로 설치합니다.
