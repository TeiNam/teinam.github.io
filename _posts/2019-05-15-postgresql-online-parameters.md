---
date: 2019-05-15 15:01:29 +0900
title: "PostgreSQL 온라인 적용 가능 파라미터 확인"
category: postgresql
excerpt: "PostgreSQL 온라인 적용 가능 파라미터 확인 PostgreSQL의 파라미터 (postgresql.conf) 중에 반드시 restart로 적용해야 하는 파라미터가 있는가 하면, reload만으로도 적용 가능한 파라미터가 있습니다. 만약 archive_command 파라미터의…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — pg_settings.context 로 restart/reload 여부를 판별하는 방법은 현재도 유효하다. 단 reload 컨텍스트 값은 'signup' 이 아니라 'sighup' 이며(본문 오타), ALTER SYSTEM 으로 설정을 바꾸는 방법이 빠져 있다.

## PostgreSQL 온라인 적용 가능 파라미터 확인

PostgreSQL의 파라미터 (postgresql.conf) 중에 반드시 restart로 적용해야 하는 파라미터가 있는가 하면,

reload로 적용 가능한 파라미터가 있습니다.

만약 archive\_command 파라미터의 restart, reload 여부를 알고 싶다면,

```sql
select name, setting, context from pg_settings
where name = 'archive_command';
```

name 조건에 파라미터 값을 주면 확인이 가능합니다.

context 결과 값에 postmaster 가 나온다면 restart 가 필요하며, signup이 나온다면 reload로 적용이 가능합니다.

postmaster가 조건인 결과값을 모두 보고 싶다면,

```sql
select name, setting, context from pg_settings
where context = 'postmaster';
```

or context = 'signup' 을 조건으로 주면 restart, reload 여부를 알 수 있습니다.

```bash
$ pg_ctl reload
$ pg_ctl restart
```

로 적용하거나, reload 가 가능한 파라미터라면

psql 접속 후

```sql
postgres=# SELECT pg_reload_conf();
```

명령으로 적용할 수 있습니다.
