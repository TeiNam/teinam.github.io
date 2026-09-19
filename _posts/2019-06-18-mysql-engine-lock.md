---
date: 2019-06-18 21:49:35 +0900
title: "MySQL Engine Lock"
category: mysql
excerpt: "MySQL에서 사용하는 Lock은 크게 스토리지 엔진 레벨과 MySQL 엔진 레벨로 나눌 수 있습니다. MySQL 엔진 레벨의 Lock은 모든 스토리지 엔진에 영향을 미치지만, 스토리지 엔진 레벨의 Lock은 스토리지 엔진 간 상호 영향을 미치지 않습니다."
updated: 2026-09-20
---

MySQL에서 사용하는 Lock은 크게 스토리지 엔진 레벨과 MySQL 엔진 레벨로 나눌 수 있습니다. MySQL 엔진 레벨의 Lock은 모든 스토리지 엔진에 영향을 미치지만, 스토리지 엔진 레벨의 Lock은 스토리지 엔진 간 상호 영향을 미치지 않습니다.

## Global Lock

글로벌 Lock은 `FLUSH TABLES WITH READ LOCK` 명령으로만 획득할 수 있으며, MySQL에서 제공하는 Lock 중 가장 범위가 큽니다. 글로벌 Lock을 획득하면 다른 세션에서 `SELECT`를 제외한 DDL이나 DML을 실행할 때 글로벌 Lock이 해제될 때까지 대기 상태로 남습니다.

글로벌 Lock이 영향을 미치는 범위는 MySQL 서버 전체입니다. MyISAM이나 Memory 테이블에 대해 `mysqldump`로 일관된 백업을 받을 때 사용됩니다.

### FLUSH TABLES WITH READ LOCK

`FLUSH TABLES WITH READ LOCK` 명령은 실행과 동시에 MySQL 서버에 존재하는 모든 테이블에 Lock을 겁니다. 명령이 실행되기 전에 테이블이나 레코드에 Lock을 거는 SQL이 있다면 해당 트랜잭션이 끝날 때까지 기다려야 합니다.

장시간 실행되는 쿼리와 `FLUSH TABLES WITH READ LOCK`이 겹치면 데이터베이스 성능이 저하되고 DDL이 오랜 시간 대기 상태에 빠질 수 있습니다. 운영 중인 서버에서는 사용하지 않는 것을 권장합니다.

## Table Lock

테이블 단위로 설정되는 Lock이며, 명시적 또는 묵시적으로 획득할 수 있습니다. 명시적으로는 `LOCK TABLES table_name [READ | WRITE]` 명령으로 특정 테이블의 Lock을 획득할 수 있습니다.

묵시적인 테이블 Lock은 MyISAM이나 Memory 테이블에 데이터를 변경하는 쿼리를 실행하면 자동으로 발생합니다. 쿼리가 실행되는 동안 자동으로 획득했다가 작업이 완료되면 반환합니다.

InnoDB는 스토리지 엔진 차원에서 레코드 기반의 Lock을 제공하기 때문에 단순 데이터 변경 쿼리(DML)로는 테이블 Lock을 획득하지 않습니다. DDL은 테이블 Lock을 획득합니다.

> **NOTE** — MyISAM은 MySQL 8.4에서 파티셔닝을 지원하지 않으며 기본 스토리지 엔진이 아닙니다. 새 테이블은 InnoDB를 권장합니다.

## User Lock

`GET_LOCK()` 함수를 이용해 임의로 Lock을 걸 수 있습니다. `RELEASE_LOCK()` 함수로 반환하고, `IS_FREE_LOCK()` 함수로 Lock 상태를 조회할 수 있습니다.

데이터베이스 객체에 거는 Lock이 아니라 임의의 문자열에 대한 Lock입니다. 자주 사용하지는 않지만, 배치 프로그램처럼 한꺼번에 많은 레코드를 변경하는 쿼리나 여러 세션이 동일 데이터를 변경하거나 참조하는 경우 동시성을 제어하는 용도로 사용할 수 있습니다.

## Metadata Lock

데이터베이스 객체(테이블, 뷰, 저장 프로시저 등)의 메타데이터를 보호하기 위해 자동으로 획득되는 Lock입니다. 테이블을 사용하는 트랜잭션이 진행 중일 때 다른 세션이 해당 테이블의 구조를 변경하지 못하도록 막습니다.

예를 들어 트랜잭션에서 테이블을 조회하는 동안 다른 세션이 `ALTER TABLE`이나 `DROP TABLE`을 실행하면 메타데이터 Lock 때문에 대기하게 됩니다. 객체 이름을 변경하는 작업도 메타데이터 Lock을 획득하며, 작업이 완료되면 자동으로 반환됩니다.
