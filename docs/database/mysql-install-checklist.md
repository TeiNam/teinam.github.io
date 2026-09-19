---
title: "MySQL 초기 설치 체크리스트"
permalink: /docs/database/mysql-install-checklist/
breadcrumb: "Docs / Database"
description: "MySQL 을 처음 설치할 때 기본값으로 두면 안 되는 파라미터"
updated: 2026-09-19
guide: mysql-install-checklist
order: 0
nav_title: "개요"
redirect_from:
  - /writing/mysql-first-install-checklist/
---

> **INFO** — 유효 범위와 버전 기준선
>
> 값은 MySQL 8.4 LTS 매뉴얼을 기준으로 적었고, 8.0 과 다른 항목은 버전을 함께 표기했다.
> **MySQL 8.0 은 2026-04-21 부로 Oracle Sustaining Support 로 이관되어 Premier·Extended 지원이 끝났다.**
> 공식 문서가 안내하는 업그레이드 대상은 8.4 LTS 또는 9.7 LTS 이므로, 신규 구축이라면 이 두 계열에서 고른다.
>
> - LTS 계열은 Premier 5년과 Extended 3년을 지원하고, Innovation 계열은 다음 Innovation 릴리스가 나올 때까지만 지원된다.
> - LTS 업그레이드는 한 단계씩만 지원된다. 8.4 에서 9.7 로는 갈 수 있지만, LTS 계열을 건너뛰는 경로는 지원되지 않는다.
> - 9.7 은 순차 버전 번호를 쓰는 마지막 LTS 계열이고, 이후 릴리스는 `YY.M.P` 형식의 캘린더 버저닝을 쓴다. 첫 캘린더 버전은 2026년 7월 릴리스인 26.7.0 이다. 캘린더 버전 번호만으로는 그 릴리스가 Innovation 인지 LTS 인지 구분되지 않는다.
> - 용량 단위 표기(`MB`·`MiB`)는 MySQL 매뉴얼 원문을 따른다.

처음 MySQL 을 구성하는 개발자나 스타트업은 대부분 기본값을 그대로 두고 시작한다. 그런데 기본값은 "어디서나 기동되는 값"이지 "우리 서비스에 맞는 값"이 아니다. 서비스가 커진 뒤에 데이터 정합성이나 무결성 문제가 드러나면 이미 쌓인 데이터를 안은 채로 되돌려야 하므로 비용이 몇 배로 든다. 초기화 시점에만 정할 수 있어서 아예 되돌릴 수 없는 값도 있다.

그래서 이 문서는 MySQL 을 새로 세울 때마다 위에서부터 짚어 가는 순서로 배치했다. 되돌릴 수 없는 항목이 맨 앞이고, 운영 중에 바꿀 수 있는 항목이 뒤쪽이다. DB 가 맡는 역할에 따라 답이 갈리는 항목은 판단 기준을 함께 적었다. 예외는 보안 하드닝이다. 설치 직후에 해야 하는 작업이지만 계정·인증 항목과 함께 봐야 하므로 「계정과 인증」 절에 모아 두었다.

## 이 가이드의 구성

1. [초기화 전용 값](/docs/database/mysql-install-checklist/initialize-only/) — 나중에 바꾸려면 재구축이 필요한 파라미터
2. [SQL_MODE](/docs/database/mysql-install-checklist/sql-mode/) — STRICT 계열과 TRADITIONAL 의 실제 구성
3. [문자셋·시간대](/docs/database/mysql-install-checklist/charset-timezone/) — utf8mb4 기본값, utf8mb3 제거 예정, 시간대 표기
4. [내구성과 복제](/docs/database/mysql-install-checklist/durability-replication/) — sync_binlog 와 innodb_flush_log_at_trx_commit
5. [바이너리 로그](/docs/database/mysql-install-checklist/binary-log/) — 포맷·보존 기간·용량 계산
6. [계정과 인증](/docs/database/mysql-install-checklist/accounts-auth/) — caching_sha2_password 전환과 mysql_native_password 제거
7. [메모리](/docs/database/mysql-install-checklist/memory/) — 버퍼풀과 세션 단위 버퍼의 구분
8. [커넥션과 격리](/docs/database/mysql-install-checklist/connections-isolation/) — max_connections 실측, 타임아웃, 격리 수준
9. [로깅](/docs/database/mysql-install-checklist/logging/) — 에러·슬로우 쿼리 로그와 시각 표기
10. [손대지 않을 것](/docs/database/mysql-install-checklist/leave-defaults/) — 근거 없이 바꾸면 손해인 값들
11. [8.4 업그레이드](/docs/database/mysql-install-checklist/upgrade-to-8-4/) — 제거된 파라미터와 기동 실패 지점
12. [RDS · Aurora](/docs/database/mysql-install-checklist/aws-rds-aurora/) — 파라미터 그룹 수식, 적용되지 않는 값, 수정 불가 값
