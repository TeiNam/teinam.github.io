---
layout: page
title: Work
permalink: /work/
subtitle: 만든 것과 다뤄 온 것.
---

## 프로젝트

| 이름 | 한 일 | 스택 |
| --- | --- | --- |
| [easy-rdbms](https://github.com/TeiNam/easy-rdbms) | AI 에이전트가 스키마를 설계할 때 놓치는 결정을 설계 시점으로 앞당기는 Claude Code·Codex 플러그인 | Shell · MySQL / PostgreSQL / SQLite |
| [table-define-exporter](https://github.com/TeiNam/table-define-exporter) | 테이블 정의서를 Excel·Markdown·SQL DDL 로 내보내는 CLI | Rust · MySQL 5.7+ / PostgreSQL 13–17 |
| [aws-mysql-monitor](https://github.com/TeiNam/aws-mysql-monitor) | RDS·Aurora 슬로우 쿼리 실시간 모니터. 실행 계획·CloudWatch 지표·Bedrock 튜닝 조언을 한 화면에 | Rust · RDS / Aurora MySQL 8.0+ |
| [rds-cost-calculator](https://github.com/TeiNam/rds-cost-calculator) | 인스턴스 사양 목록을 AWS Pricing API 로 조회해 월·연 비용 리포트 생성 | Python |
| [rds_exporter](https://github.com/TeiNam/rds_exporter) | RDS exporter | Rust |
| [kiro-with-harness](https://github.com/TeiNam/kiro-with-harness) | Kiro 에 하네스 엔지니어링 적용하기 | JavaScript |
| [tech-writer-skills](https://github.com/TeiNam/tech-writer-skills) | IT 기술 문서를 작성·윤문하는 Claude 스킬. 한국어·영어 양방향 | JavaScript |
| [oracle-migration-analyzer](https://github.com/TeiNam/oracle-migration-analyzer) | Oracle 마이그레이션 분석 | Python |
| [mongo-mcp-server](https://github.com/TeiNam/mongo-mcp-server) | MongoDB MCP 서버 (SSE) | Python |

전체 목록은 [github.com/TeiNam](https://github.com/TeiNam) 에 있습니다.

### easy-rdbms

AI 에이전트는 애플리케이션 코드는 잘 쓰는데 스키마에서 조용히 어긋난다. `SERIAL` PK, 예약어인 `users` 테이블명, 금액에 `FLOAT`, 무분별한 `CASCADE` — 전부 첫날에는 맞고 열두 달 뒤에 비싸진다. 함수는 다시 쓰면 되지만 10억 행 테이블의 PK 는 몇 주짜리 마이그레이션 프로젝트다.

그 결정들을 아직 공짜일 때, 즉 설계 시점으로 앞당긴다. 데이터베이스 선택, 명명 규칙, 3NF/BCNF 모델링, 스키마 리뷰를 다룬다.

### table-define-exporter

`information_schema` 와 시스템 카탈로그에서 메타데이터를 모아 테이블 정의서를 만든다.

[sizzlei/TD-EXPORT](https://github.com/sizzlei/TD-EXPORT)(Go)를 원작자 허락을 받아 Rust 로 재구현한 포트다. 원본 출력 형식을 바이트 단위로 호환하면서 PostgreSQL 지원, 파셜 인덱스·배열 타입 보존, FK N+1 쿼리 제거, 병렬 메타데이터 수집을 더했다.

### aws-mysql-monitor

React UI 를 바이너리에 심어 ECS 태스크 하나로 뜬다. IAM 인증으로 1초 주기 수집, CloudWatch 로그에서 슬로우 로그 백필, 지표는 15분 주기. Bedrock 호출은 버튼을 눌렀을 때만 나간다.

## 경력

<!-- 회사 · 직무 · 기간 · 한 일 -->
