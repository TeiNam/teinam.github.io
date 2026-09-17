---
date: 2019-03-02 12:57:49 +0900
title: "Docker를 이용해 PostgreSQL 설치"
category: postgresql
excerpt: "Docker를 이용해 PostgreSQL 설치 도커가 설치 되어 있는 상태에서 아래의 명령으로 설치 해줍니다. 우선 컨테이너를 PostgreSQL 공식 도커 허브에서 내려 받습니다. # docker pull postgres:9.6.11 그리고 도커를 실행 해줍니다. # docker…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — docker pull/run·PGDATA·볼륨 마운트 절차 자체는 지금도 동작하지만, 고정한 postgres:9.6.11 은 2021-11-11 에 EOL 되어 보안 패치가 없습니다. 2026-09 현재 지원 메이저는 14~18(최신 18.6)입니다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## Docker를 이용한 PostgreSQL 설치

> **전제조건:** Docker가 설치되어 있어야 합니다.

### 컨테이너 이미지 다운로드

우선 PostgreSQL 공식 도커 허브에서 컨테이너 이미지를 내려받습니다.

```bash
# docker pull postgres:9.6.11
```

### 컨테이너 실행

다음 명령으로 PostgreSQL 컨테이너를 실행합니다.

```bash
# docker run \
-e PGDATA=/data/pgdata \
--volume /home/postgres/pgdata:/data \
-e POSTGRES_INITDB_ARGS="--data-checksums -E utf8 --no-locale" \
--name postgres96 \
--publish 5432:5432 \
postgres:9.6.11
```

PGDATA는 도커 안에서 PostgreSQL 클러스터가 생성되는 경로입니다.

–volume $A:$B

$A – 실제 OS의 클러스터 데이터가 올라가는 경로

$B – 컨테이너 안에 생성되는 경로

이 볼륨을 설정해야 DB 생성 후 설정 파일을 수정하기 쉽습니다.

더 다양한 옵션으로 바로 DB를 생성할 수도 있습니다.

### 컨테이너 백그라운드 실행

`docker run`으로 생성하고 나면 로그 화면에서 빠져나오지 않을 겁니다. 그냥 `ctrl+c`로 중지하고,

```bash
# docker ps -a
```

로 컨테이너 ID를 확인한 후에

```bash
# docker start <ID>
```

를 실행하면 됩니다.
