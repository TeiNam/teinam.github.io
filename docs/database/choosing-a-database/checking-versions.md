---
title: "버전과 현황을 확인하는 경로"
permalink: /docs/database/choosing-a-database/checking-versions/
breadcrumb: "Docs / Database / 데이터베이스 선택 가이드"
description: "DB 선택 — 버전·현황 확인 경로"
updated: 2026-09-20
guide: choosing-a-database
order: 9
nav_title: "현황 확인 경로"
---

버전 숫자는 몇 달이면 낡는다. **확인 경로**는 그보다 오래 유효하다. 그리고 경로에는 함정이 있어서, 경로를 모르면 틀린 값을 자신 있게 적게 된다.

| 함정 | 실제 확인 경로 |
| --- | --- |
| TiDB 의 `releases/latest` 가 최고 버전이 아니다 | 릴리스 목록 전체를 버전으로 정렬해서 본다 |
| Neo4j 의 GitHub Releases 가 2017년에 멈춰 있다 | 태그 목록을 본다 |
| MySQL 은 9.7 다음이 26.7 이다 | 캘린더 버저닝 전환을 전제로 본다 |
| CockroachDB 는 `releases/latest` 가 응답하지 않는다 | 벤더 문서의 릴리스 페이지를 본다 |

하나씩 보면 이렇다.

- **TiDB** — `releases/latest` 는 v7.5.8(2026-09-17)을 가리키지만 릴리스된 것 중 최고 버전은 v8.5.8(2026-08-27)이다. 7.5 LTS 유지 패치가 8.5 계열보다 **나중에** 배포되기 때문에 "가장 최근 릴리스" 와 "가장 높은 버전" 이 갈린다. LTS 계열을 함께 유지하는 제품은 모두 이 패턴을 보일 수 있다.
- **Neo4j** — GitHub Releases 의 최신 항목이 2017년 `3.2.0-alpha08` 이다. 릴리스 API 를 근거로 쓰면 9년 전 알파 버전을 현재 버전으로 적게 된다. 실제 버전은 태그에 있고 확인된 값은 `2026.08.1` 이다. 버전 체계도 캘린더 버저닝으로 바뀌었다.
- **MySQL** — 9.7 LTS 다음 계열이 26.7 이다. 숫자 크기로 비교하면 건너뛴 것처럼 보이지만 캘린더 버저닝 전환이다. 26.10.0 은 Early Access 단계이므로 "가장 높은 숫자" 를 그대로 최신 안정 버전으로 쓸 수 없다.
- **CockroachDB** — GitHub 의 `releases/latest` 경로로는 버전을 확인할 수 없다. 이 문서도 CockroachDB 의 최신 버전을 적지 않았다.

라이선스와 폐기 여부는 버전과 다른 경로로 확인한다.

- **라이선스는 저장소의 라이선스 파일 자체를 본다.** ScyllaDB 의 경우 저장소 루트의 파일명이 `LICENSE-ScyllaDB-Source-Available.md` 라서 파일 목록만 봐도 성격이 드러난다. 제품 소개 페이지의 "오픈소스" 표현과 라이선스 원문이 다를 수 있으므로 원문을 읽는다.
- **분할 라이선스는 디렉터리 단위로 확인한다.** TimescaleDB 는 `tsl/` 안팎으로 라이선스가 갈린다. 저장소 최상위의 LICENSE 파일 하나만 보면 틀린다.
- **폐기 여부는 벤더의 deprecation 문서에서 확인한다.** Atlas Device SDKs(Realm)가 사례다. MongoDB 공식 문서는 2024년 9월부로 Atlas Device SDKs 가 deprecated 되었고 **2025-09-30 에 end-of-life 에 도달해 제거**된다고 적는다. 함께 종료된 것이 App Services Authentication 과 사용자 관리, Authentication Triggers, Wire Protocol, Data Access Permissions(Rules and Roles)다. 남은 것은 온디바이스 데이터베이스이고, 이것은 오픈소스 프로젝트로 계속 존재한다 — 동기화 기능을 뺀 community 브랜치가 C++, Flutter, Kotlin, .NET, JavaScript, Swift 로 제공된다. 즉 **로컬 데이터베이스로서는 남았지만 관리형 동기화 제품은 사라졌다.** 기기 내부 저장이 요구라면 SQLite 를 기준으로 두고, 동기화가 필요하면 그 계층을 따로 설계한다.
- **지원 종료 시점은 제품의 라이프사이클 표에서 본다.** 이 문서에 적힌 MongoDB 8.3 의 EOL 2029-10-31, MySQL 8.0 의 2026-04-21 Sustaining Support 전환, PostgreSQL 의 메이저당 5년 같은 값이 그 표에서 나온다. 신규 구축이라면 버전 선택 전에 이 표를 먼저 본다.

마지막으로, 릴리스가 멈춘 제품을 후보에서 걸러내는 기준도 같은 경로에서 나온다. Riak 은 GitHub 최신 릴리스가 `riak-3.2.0`(2023-01-01)으로 3년 8개월째 새 릴리스가 없다. 반대로 OrientDB 는 3.2.56(2026-09-02)으로 릴리스가 이어지고 있다. 이름의 친숙함이나 과거 평판이 아니라 **마지막 릴리스 날짜**가 신규 후보 자격을 정한다.
