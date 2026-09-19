---
date: 2019-08-29 11:21:38 +0900
title: "(root) FAILED to open PAM security session (Permission denied)"
category: etc
excerpt: "crond 실행 시 발생하는 PAM 세션 에러입니다. /etc/pam.d/password-auth에 session required pam_unix.so 설정이 누락된 경우 발생합니다."
updated: 2026-09-20
---

```text
(root) FAILED to open PAM security session (Permission denied)
```

`/var/log/cron` 로그에 위와 같은 에러 메시지가 발생하면서 `crond` 실행이 되지 않는 경우입니다.

> **WARNING** — PAM 설정을 잘못 편집하면 모든 로그인이 불가능해질 수 있습니다. 작업 전에 반드시 `/etc/pam.d/` 디렉토리 전체를 백업하고, 현재 SSH 세션을 유지한 채로 새 세션에서 설정을 테스트합니다.

## 원인

cron은 `/etc/pam.d/password-auth` (또는 `/etc/pam.d/crond`) PAM 설정을 참조합니다. 이 파일에 세션 관리 모듈 설정이 누락되면 PAM이 세션을 열 수 없습니다.

## 해결

`/etc/pam.d/password-auth` 파일에 다음 설정이 있는지 확인합니다:

```text
session required pam_unix.so
```

이 설정이 없으면 파일 끝에 추가합니다. 일반적으로 PAM 스택에서 `session` 라인은 `auth`와 `account` 라인 뒤에 위치합니다.

## 관련 모듈

- `pam_unix.so` — 기본 Unix 인증 및 세션 관리 모듈. 세션 열기/닫기를 syslog에 기록합니다.
- `pam_limits.so` — `/etc/security/limits.conf`에서 자원 제한을 읽어 적용합니다. 설정이 잘못되거나 파일을 읽을 수 없으면 세션이 실패합니다.

설정 변경 후 시스템 재시작 없이 즉시 적용됩니다. 변경 사항을 테스트하려면 새 SSH 세션을 열어 로그인을 확인합니다.
