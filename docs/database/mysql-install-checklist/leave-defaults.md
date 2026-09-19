---
title: "처음엔 손대지 않아도 되는 파라미터"
permalink: /docs/database/mysql-install-checklist/leave-defaults/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 기본값으로 두는 파라미터"
updated: 2026-09-19
guide: mysql-install-checklist
order: 10
nav_title: "손대지 않을 것"
---

건드려야 할 것처럼 보이지만, 근거 없이 올리면 오히려 손해가 나는 값들이다.

- `sort_buffer_size` — `ORDER BY`·`GROUP BY` 정렬에 쓰는 세션 단위 버퍼다. 정렬 쿼리가 많고 `sort_merge_passes` 가 크면 늘려 볼 수 있지만, 잘못 잡으면 성능이 떨어지고 메모리 소비가 늘어난다. 적정값을 산정할 근거가 없으면 기본값을 바꾸지 않는다.
- `join_buffer_size` — 기본값은 256KB 다. 인덱스가 없는 전체 테이블 조인에 커넥션당 할당되므로, 늘리기보다 조인에 인덱스를 먼저 추가한다. 인덱스를 추가할 수 없으면 해당 쿼리에서만 세션 값으로 올린다.
- `read_buffer_size` — MyISAM 에만 적용되고 InnoDB 에는 영향이 없다.
- `read_rnd_buffer_size` — 정렬 후 정렬된 순서로 행을 읽을 때 쓰이며 InnoDB 도 사용한다. 클라이언트마다 할당되므로 전역값을 올리기보다 큰 쿼리를 실행하는 세션에서만 올린다.
- `cte_max_recursion_depth` — 기본값은 1000 이다(8.0.3 도입). 전역값을 낮추기보다 쿼리 단위 제한이 부작용이 적다. `max_execution_time`, `MAX_EXECUTION_TIME` 힌트, `SET_VAR` 힌트로 제한한다.
- `innodb_file_per_table` — InnoDB 는 기본적으로 테이블별 테이블스페이스에 테이블을 만든다. 전역 범위에서 동적 변경이 가능하다. 테이블을 지우거나 비우면 공간이 OS 로 반환되고 테이블 단위 백업·이관도 가능하다. 대신 테이블마다 파일 핸들과 파일 디스크립터를 유지하므로, 테이블 수가 매우 많으면 부담이 된다. 기본값을 유지한다.
- `innodb_autoinc_lock_mode` — 기본값은 `2`(interleaved)이고 동적 변경이 불가하다. 행 기반 복제와의 호환을 위해 정해진 기본값이므로, 문장 기반 복제를 쓰지 않는다면 바꿀 이유가 없다.
