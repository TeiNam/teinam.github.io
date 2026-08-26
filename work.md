---
layout: page
title: Work
permalink: /work/
subtitle: 데이터베이스를 다루다 필요해서 만든 것들.
---

## 데이터베이스 도구

### [easy-rdbms](https://github.com/TeiNam/easy-rdbms)

Claude Code·Codex 플러그인. AI 에이전트는 애플리케이션 코드는 잘 쓰는데 스키마에서 조용히 어긋난다는 관찰에서 출발했다. `SERIAL` PK, 예약어인 `users` 테이블명, 금액에 `FLOAT`, 무분별한 `CASCADE` — 전부 첫날에는 맞고 열두 달 뒤에 비싸진다. 함수는 다시 쓰면 되지만 10억 행 테이블의 PK 는 몇 주짜리 마이그레이션 프로젝트다.

그 결정들을 아직 공짜일 때, 즉 설계 시점으로 앞당긴다. 데이터베이스 선택, 명명 규칙, 3NF/BCNF 모델링, 스키마 리뷰를 다룬다.

`Shell` · MySQL / PostgreSQL / SQLite · MIT

### [table-define-exporter](https://github.com/TeiNam/table-define-exporter)

MySQL·PostgreSQL 테이블 정의서를 Excel(`.xlsx`), Markdown, SQL DDL 로 내보내는 CLI. `information_schema` 와 시스템 카탈로그에서 메타데이터를 모은다.

[sizzlei/TD-EXPORT](https://github.com/sizzlei/TD-EXPORT)(Go)를 원작자 허락을 받아 Rust 로 재구현한 포트다. 원본 출력 형식을 바이트 단위로 호환하면서 PostgreSQL 지원, 파셜 인덱스·배열 타입 보존, FK N+1 쿼리 제거, 병렬 메타데이터 수집을 더했다.

`Rust` · MySQL 5.7+ / PostgreSQL 13–17 · MIT

## AWS 운영

### [aws-mysql-monitor](https://github.com/TeiNam/aws-mysql-monitor)

RDS MySQL·Aurora MySQL 의 슬로우 쿼리를 실시간으로 잡는 모니터. 실행 계획, CloudWatch 지표, Bedrock 기반 튜닝 조언을 한 곳에서 본다. React UI 를 바이너리에 심어 ECS 태스크 하나로 뜬다.

IAM 인증으로 1초 주기 수집, CloudWatch 로그에서 슬로우 로그 백필, 지표는 15분 주기. Bedrock 호출은 버튼을 눌렀을 때만 나간다.

`Rust` · RDS / Aurora MySQL 8.0+

### [rds-cost-calculator](https://github.com/TeiNam/rds-cost-calculator)

RDS·DMS·ElastiCache 인스턴스 사양을 마크다운 목록으로 적어두면 AWS Pricing API 로 공식 단가를 조회해 인스턴스별 월·연 비용, 서비스별 소계, 총계를 마크다운 리포트로 뽑는다.

`Python`

### [rds_exporter](https://github.com/TeiNam/rds_exporter)

Rust 로 만든 RDS exporter.

`Rust`

## 그 밖에

- [kiro-with-harness](https://github.com/TeiNam/kiro-with-harness) — Kiro 에 하네스 엔지니어링 적용하기
- [tech-writer-skills](https://github.com/TeiNam/tech-writer-skills) — IT 기술 문서를 작성·윤문하는 Claude 스킬. 한국어·영어 양방향
- [oracle-migration-analyzer](https://github.com/TeiNam/oracle-migration-analyzer) — Oracle 마이그레이션 분석
- [mongo-mcp-server](https://github.com/TeiNam/mongo-mcp-server) — MongoDB MCP 서버 (SSE)

전체 목록은 [github.com/TeiNam](https://github.com/TeiNam) 에 있습니다.

## 함께 보기

- [데이터베이스 네이밍 규칙]({{ '/docs/database/naming/' | relative_url }}) — easy-rdbms 가 강제하는 규칙의 근거
- [표준 데이터베이스 운영관리 지침서]({{ '/docs/database/ops/' | relative_url }})
- [글]({{ '/writing/' | relative_url }})
