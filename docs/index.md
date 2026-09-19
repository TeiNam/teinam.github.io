---
title: Docs
permalink: /docs/
breadcrumb: Docs
description: 한 편짜리 글로 흩어지면 찾기 어려운 기준 문서들.
---

기준으로 삼고 반복해서 들춰 보는 문서를 모읍니다. 시점이 있는 기록은 [Writing]({{ '/writing/' | relative_url }}) 에, 일과 커리어는 [Career]({{ '/career/' | relative_url }}) 에 있습니다.

## Database

분량이 큰 문서는 여러 쪽으로 나눈 **가이드**입니다. 가이드에 들어가면 왼쪽 목록이 그 가이드의 쪽 목록으로 바뀌고, 쪽 아래에 이전·다음 링크가 붙습니다. 문서 전체에서 낱말을 찾을 때는 헤더의 검색(`⌘K`)을 씁니다.

| 문서 | 구성 | 내용 |
| --- | --- | --- |
| [표준 데이터베이스 운영관리 지침서]({{ '/docs/database/ops/' | relative_url }}) | 5쪽 가이드 | 데이터베이스를 관리하는 기준점. 조문과 클라우드·공공시스템 부칙 |
| [MySQL for Developers]({{ '/docs/database/mysql-for-developers/' | relative_url }}) | 10쪽 가이드 | 개발자가 지킬 원칙과 안티패턴. 콜레이션·인덱스·트랜잭션과 락·드라이버 |
| [MySQL 초기 설치 체크리스트]({{ '/docs/database/mysql-install-checklist/' | relative_url }}) | 13쪽 가이드 | 처음 설치할 때 기본값으로 두면 안 되는 파라미터 |
| [데이터베이스 선택 가이드]({{ '/docs/database/choosing-a-database/' | relative_url }}) | 10쪽 가이드 | 요구를 먼저 정하고 고르는 순서. 모델·라이선스·분석 계층·로그 저장소 |
| [데이터베이스 네이밍 규칙]({{ '/docs/database/naming/' | relative_url }}) | 10쪽 가이드 | MySQL·PostgreSQL 공통 식별자·제약·타입 명명 규칙 |
| [데이터 암호화]({{ '/docs/database/encryption/' | relative_url }}) | 한 쪽 | 개인정보 암호화의 법정 의무와 DB 적용 방식 |
| [MongoDB 샤드 재구동 순서]({{ '/docs/database/mongodb-shard-restart/' | relative_url }}) | 한 쪽 | 밸런서·mongos·샤드·config 종료와 기동 런북 |
| [데이터 3법]({{ '/docs/database/data-3-law/' | relative_url }}) | 한 쪽 | DB 설계·운영에 걸리는 조문 좌표 |

<!--
  문서를 추가하면 _data/docs_nav.yml 에도 넣어야 사이드바에 뜬다.
  가이드로 나누려면 front matter 에 guide·order 두 줄만 주면 된다 — _layouts/docs.html 이
  같은 guide 를 가진 쪽을 order 로 정렬해 사이드바와 이전·다음을 만든다.
-->
