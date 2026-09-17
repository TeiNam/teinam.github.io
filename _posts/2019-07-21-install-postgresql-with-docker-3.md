---
date: 2019-07-21 12:36:49 +0900
title: "Docker를 이용한 PostgreSQL 설치"
category: postgresql
excerpt: "Docker를 이용해 PostgreSQL 설치 요즘은 도커를 이용해서 DB설치를 많이 합니다. 그런데 주의 사항은 대부분의 DB 제공자는 도커위에 DB운영을 추천하지는 않습니다. 도커로 DB를 운영하려면 신중히 고려한 후에 결정하셔야 합니다. 성능 문제나 도커와 DB를..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 'DB 를 컨테이너로 운영할 때 신중히 판단하라'는 경고는 여전히 타당하지만, 예제가 EOL(2021-11-11) 된 postgres:9.6.11 을 고정합니다. 2026-09 현재 최신 메이저는 PostgreSQL 18 입니다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

## Docker로 PostgreSQL 설치

> **주의:** 대부분의 DB 제공자는 Docker 위에 DB 운영을 추천하지 않는다. Docker로 DB를 운영하려면 신중히 고려한 후 결정해야 한다.

**전제조건:** Docker가 설치되어 있어야 한다.

성능 문제나 Docker와 DB를 둘 다 잘 다루지 못하면 관리가 번거롭다. 주로 서비스용이 아닌 개발·테스트 환경이나 가벼운 애플리케이션 DB에서 Docker 운영을 한다.

### 컨테이너 내려받기

PostgreSQL 공식 Docker 허브에서 컨테이너를 내려받는다.

```bash
$ docker pull postgres:9.6.11
```

### Docker 실행

```bash
$ docker run \
-e PGDATA=/data/pgdata \
--volume /home/postgres/pgdata:/data \
-e POSTGRES_INITDB_ARGS="--data-checksums -E utf8 --no-locale" \
--name postgres96 \
--publish 5432:5432 \
postgres:9.6.11
```

`PGDATA`는 Docker 안에서 PostgreSQL 클러스터가 생성되는 경로다.

`--volume` 옵션은 다음과 같이 동작한다:
- `$A` (왼쪽): 실제 OS의 클러스터 데이터가 올라가는 경로
- `$B` (오른쪽): 컨테이너 안에 생성되는 경로

이 경로를 지정하면 DB 생성 후 설정 파일을 수정하기 쉽다. 더 다양한 옵션으로 DB를 바로 생성할 수도 있다.

`docker run`으로 생성하면 로그 화면에서 빠져나오지 않는다. `Ctrl+C`로 중지한 후,

```bash
$ docker ps -a
```

로 ID를 확인하고

```bash
$ docker start <ID>
```

로 시작하면 된다.
