---
date: 2019-05-15 15:01:29 +0900
title: "PostgreSQL 온라인 적용 가능 파라미터 확인"
category: postgresql
excerpt: "PostgreSQL 파라미터는 재시작이 필요한 것과 reload만으로 적용 가능한 것으로 나뉩니다. pg_settings.context로 확인할 수 있습니다."
last_modified_at: 2026-09-20
---

PostgreSQL 파라미터(postgresql.conf)는 재시작이 필요한 것과 reload만으로 적용 가능한 것으로 나뉩니다.

## context로 적용 방법 확인

특정 파라미터의 적용 방법을 알고 싶으면 `pg_settings`의 `context` 열을 확인합니다.

```sql
SELECT name, setting, context 
FROM pg_settings
WHERE name = 'archive_command';
```

`context` 값은 변경 난이도 순서로 7가지입니다.

| context 값 | 의미 |
|-----------|-----|
| `internal` | 변경 불가 (컴파일·initdb 시점에 결정) |
| `postmaster` | 재시작 필요 |
| `sighup` | reload로 적용 (기존 세션에도 반영) |
| `superuser-backend` | reload 또는 연결 시점 설정 (superuser) |
| `backend` | reload 또는 연결 시점 설정 (모든 사용자) |
| `superuser` | SET 명령으로 세션 단위 변경 (superuser) |
| `user` | SET 명령으로 세션 단위 변경 (모든 사용자) |

실무에서 자주 보는 것은 `postmaster`(재시작 필요)와 `sighup`(reload 가능)입니다.

재시작이 필요한 파라미터를 모두 보려면:

```sql
SELECT name, setting, context 
FROM pg_settings
WHERE context = 'postmaster';
```

reload로 적용 가능한 파라미터만 보려면:

```sql
SELECT name, setting, context 
FROM pg_settings
WHERE context = 'sighup';
```

## 파라미터 변경 방법

### 1) 설정 파일 직접 편집

`postgresql.conf`를 편집한 후 reload 또는 restart로 적용합니다.

```bash
# reload (sighup context 파라미터에만 유효)
pg_ctl reload
```

또는 psql에서:

```sql
SELECT pg_reload_conf();
```

재시작이 필요한 파라미터(`postmaster` context)는:

```bash
pg_ctl restart
```

### 2) ALTER SYSTEM 명령

SQL로 파라미터를 변경하는 방법입니다. `postgresql.auto.conf` 파일에 기록되며, `postgresql.conf`보다 우선순위가 높습니다.

```sql
-- 파라미터 설정
ALTER SYSTEM SET work_mem = '16MB';

-- 적용 (sighup context는 reload, postmaster context는 restart 필요)
SELECT pg_reload_conf();

-- 설정 제거 (postgresql.conf 값으로 복원)
ALTER SYSTEM RESET work_mem;
```

> **NOTE** — `postgresql.auto.conf`는 기계가 관리하는 파일이므로 직접 편집하지 않습니다. `ALTER SYSTEM`으로만 수정합니다.

## 재시작 필요 여부 확인

`postmaster` context 파라미터를 변경한 후 reload를 실행하면, 변경은 기록되지만 즉시 적용되지 않습니다. `pending_restart` 열로 재시작 대기 중인 파라미터를 확인할 수 있습니다.

```sql
SELECT name, setting, pending_restart
FROM pg_settings
WHERE pending_restart;
```

`pending_restart`가 `true`인 파라미터는 서버를 재시작해야 적용됩니다.
