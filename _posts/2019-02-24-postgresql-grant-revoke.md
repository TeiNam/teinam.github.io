---
date: 2019-02-24 16:21:53 +0900
title: "PostgreSQL 권한 부여 및 해제"
category: postgresql
excerpt: "Grant & Revoke Grant – user,group 혹은 모든 user들에게 해당 객체에 대한 사용권한을 승인합니다. Synopsis : GRANT privilege [,…] ON object [,…] TO { PUBLIC | GROUP group | username} p…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — RULE 권한은 8.2 에서 제거됐고 권한 약어 설명도 틀렸다(w 는 UPDATE 만, DELETE 는 d). 현재 테이블 권한은 SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN 이며 컬럼 단위 GRANT 도 가능하다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## Grant & Revoke

### Grant

사용자, 그룹 또는 모든 사용자에게 해당 객체의 사용권한을 승인합니다.

**Synopsis:**

```sql
GRANT privilege [,…] ON object [,…]  
TO { PUBLIC | GROUP group | username}
```

**privilege**

**SELECT:** 특정 TABLE/VIEW의 column access를 승인

**INSERT:** 특정 TABLE의 모든 column에 데이터 삽입 권한을 승인

**UPDATE:** 특정 TABLE의 모든 column 갱신 권한을 승인

**DELETE:** 특정 TABLE의 row 삭제 권한을 승인

**RULE:** 특정 TABLE/VIEW의 rule을 정의하는 권한을 승인

**ALL:** 모든 권한을 승인합니다.

**object**

access를 승인하는 객체의 이름입니다. 다음과 같은 객체가 있습니다:

Table  
Sequence  
View  
Index

**PUBLIC**

모든 사용자를 승인합니다.

**GROUP group**

사용 권한을 획득할 그룹을 지정합니다. 그룹은 명시적으로 생성되어 있어야 합니다.

**username**

사용권한을 획득할 사용자명입니다. PUBLIC은 모든 사용자에게 적용됩니다.

**Notes**

psql에서 "\z"를 사용하여 존재하는 객체의 permission을 참조할 수 있습니다.

permission 정보의 형식:

username=arwR: 사용자에게 승인된 권한

group gname=arwR: GROUP에게 승인된 권한

=arwR: 모든 사용자에게 승인된 권한

권한 약어:

a: INSERT privilege  
r: SELECT privilege  
w: UPDATE/DELETE privilege  
R: RULE privilege  
arwR: ALL privilege

예제:

```sql
postgres=# GRANT INSERT ON imsi_table TO PUBLIC;
postgres=# GRANT ALL ON imsi_table TO test_user;
```

### Revoke

사용자, 그룹 또는 모든 사용자로부터 객체의 사용권한을 무효화합니다.

**Synopsis:**

```sql
REVOKE privilege [,…]  
ON object [,…]  
FROM { PUBLIC | GROUP gname | username }
```

**privilege**

SELECT, INSERT, UPDATE, DELETE, RULE, ALL

**object**

적용될 수 있는 객체: table, view, sequence, index

**group**

privilege를 취소할 그룹명

**username**

권한을 취소할 사용자명

**PUBLIC**

모든 사용자

예제:

```sql
postgres=# REVOKE INSERT ON imsi_table FROM PUBLIC;
```
