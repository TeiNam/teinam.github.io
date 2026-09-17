---
date: 2019-08-29 11:21:38 +0900
title: "(root) FAILED to open PAM security session (Permission denied)"
category: dbops
excerpt: "(root) FAILED to open PAM security session (Permission denied) /var/log/cron 로그에 위와 같은 에러메세지가 뜨면서 crond 실행 자체가 안되는 경우 cron은 pam.d/password-auth 쪽 인증을 가져옵니다.…"
updated: 2026-09-17
---

```
(root) FAILED to open PAM security session (Permission denied)
```

`/var/log/cron` 로그에 위와 같은 에러 메시지가 발생하면서 `crond` 실행이 되지 않는 경우입니다.

cron은 `/etc/pam.d/password-auth` 쪽 인증을 가져옵니다.

해당 파일에 다음 설정이 없으면 위와 같은 에러 메시지를 출력하며 cron이 계정 인증에 실패합니다:

```
session required pam_unix.so
```
