---
date: 2019-04-26 15:43:39 +0900
title: "Docker를 이용해 PostgreSQL 설치"
category: postgresql
excerpt: "Docker를 이용해 PostgreSQL 설치 도커가 설치 되어 있는 상태에서 아래의 명령으로 설치 해줍니다. 우선 컨테이너를 PostgreSQL 공식 도커 허브에서 내려 받습니다. $ docker pull postgres:9.6.11 그리고 도커를 실행 해줍니다. $ docker…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 9.6.11(2021-11-11 EOL) 을 전제하며, 본문 명령의 `--volume $A:$B /home/postgres/pgdata:/data` 는 플레이스홀더와 실제 경로가 섞여 그대로 실행되지 않습니다. 2019-03-02·2019-07-21 글과 내용이 중복입니다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## Docker를 이용해 PostgreSQL 설치

> **전제조건:** Docker가 설치되어 있어야 합니다.

Docker가 설치된 상태에서 아래 명령으로 PostgreSQL을 설치합니다.

우선 컨테이너를 PostgreSQL 공식 도커 허브에서 내려받습니다.

```bash
$ docker pull postgres:9.6.11
```

그리고 도커를 실행합니다.

```bash
$ docker run \
  -e PGDATA=/data/pgdata \
  --volume $A:$B /home/postgres/pgdata:/data \
  -e POSTGRES_INITDB_ARGS="--data-checksums -E utf8 --no-locale" \
  --name postgres96 \
  --publish 5432:5432 \
  postgres:9.6.11
```

**옵션 설명:**

- `PGDATA`: 도커 안에서 PostgreSQL 클러스터가 생성되는 경로입니다.
- `--volume $A:$B`:
  - `$A`: 실제 OS의 클러스터 데이터가 올라가는 경로
  - `$B`: 컨테이너 안에 생성되는 경로
  - 이 옵션을 지정하면 DB 생성 후 설정 파일을 수정하기 쉽습니다.

더 다양한 옵션을 주고 바로 DB를 생성할 수도 있습니다.

`docker run`으로 생성하고 나면 로그 화면에서 빠져나오지 않을 것입니다. `Ctrl+C`로 중지하고,

```bash
$ docker ps -a
```

로 ID를 확인한 후에

```bash
$ docker start <ID>
```

또는

```bash
$ docker start <Docker_name>
```

로 시작하면 됩니다.
