---
date: 2019-06-18 21:49:35 +0900
title: "MySQL Engine Lock"
category: mysql
excerpt: "MySQL Engine Lock MySQL에서 사용하는 Lock은 크게 스토리지 엔지 레벨과 MySQL 엔진 레벨로 나눌수 있습니다. MySQL 엔진 레벨의 Lock은 모든 스토리지 엔진에 영향을 미치게 되지만, 스토리지 엔진 레벨의 Lock은 스토리지 엔진 간 상호 영향을..."
updated: 2026-09-17
---

## MySQL Engine Lock

MySQL에서 사용하는 Lock은 크게 스토리지 엔진 레벨과 MySQL 엔진 레벨로 나눌 수 있습니다. MySQL 엔진 레벨의 Lock은 모든 스토리지 엔진에 영향을 미치게 되지만, 스토리지 엔진 레벨의 Lock은 스토리지 엔진 간 상호 영향을 미치지 않습니다.

## Global Lock

글로벌 Lock은 `FLUSH TABLES WITH READ LOCK` 명령으로만 획득할 수 있으며, MySQL에서 제공하는 Lock 중 가장 범위가 큽니다. 글로벌 Lock을 획득하면 다른 세션에서 `SELECT`를 제외한 DDL 문장이나 DML 문장을 실행하는 경우 글로벌 Lock이 해제될 때까지 해당 문장이 대기 상태로 남습니다.

글로벌 Lock이 영향을 미치는 범위는 MySQL 서버 전체이며, MyISAM이나 Memory 테이블에 대해 `mysqldump`로 백업을 받을 때 글로벌 Lock을 사용합니다.

### FLUSH TABLES WITH READ LOCK

`FLUSH TABLES WITH READ LOCK` 명령은 실행과 동시에 MySQL 서버에 존재하는 모든 테이블에 Lock을 겁니다. 명령이 실행되기 전에 테이블이나 레코드에 Lock을 거는 SQL 문장이 있다면 그 트랜잭션이 끝날 때까지 기다려야 합니다.

장시간 실행되는 SQL과 `FLUSH TABLES WITH READ LOCK` 명령이 중복되면 DB의 성능 저하 및 DDL 문장이 오랜 시간 실행되지 못하고 대기 상태에 빠지기도 합니다. 되도록 운영 중인 서버에서는 사용하지 않는 것을 권장합니다.

## Table Lock

테이블 단위로 설정되는 Lock이며, 명시적 또는 묵시적으로 테이블 Lock을 획득합니다. 명시적으로는 `LOCK TABLES table_name [READ | WRITE]` 명령으로 특정 테이블의 Lock을 획득할 수 있습니다.

묵시적인 테이블 Lock은 MyISAM이나 Memory 테이블에 데이터가 변경되는 쿼리를 실행하면 자동으로 발생합니다. 쿼리가 실행되는 동안 자동으로 획득했다가 작업이 완료되면 다시 반환합니다.

InnoDB의 경우 스토리지 엔진 차원에서 레코드 기반의 Lock을 제공하기 때문에 단순 데이터 변경 쿼리(DML)에 의해서는 테이블 Lock을 획득하지 않습니다. DDL 문장에는 Lock을 획득합니다.

## User Lock

`GET_LOCK()` 함수를 이용해 임의로 Lock을 걸 수 있습니다. `RELEASE_LOCK()` 함수를 이용해 반환하고, `IS_FREE_LOCK()` 함수를 이용해 User Lock을 조회할 수 있습니다.

데이터베이스 객체에 거는 Lock이 아니라 특정 사용자에게 Lock을 거는 것인데, 자주 사용하지는 않습니다. 배치 프로그램처럼 한꺼번에 많은 레코드를 변경하는 쿼리, 다른 사용자 간에 동일 데이터를 변경하거나 참조하는 경우 User Lock을 이용해 해결할 수 있습니다.

## Name Lock

데이터베이스 객체의 이름을 변경하는 경우 획득합니다(Table, View 등). 객체의 이름을 변경하는 작업을 하면 자동으로 획득했다가 완료되면 반환합니다.
