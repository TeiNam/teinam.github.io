---
date: 2021-09-03 00:18:47 +0900
title: "시놀로지 NAS와 Docker를 이용한 간단한 MySQL 8 테스트 환경 구축"
category: mysql
excerpt: "시놀로지 NAS와 Docker를 이용한 간단한 MySQL 8 테스트 환경 구축 다른건 아니고 NAS의 남는 자원으로 MySQL 공부할 겸 테스트 환경을 만들었습니다. docker를 이용해서 8.0.4 구성을 했네요. docker run –name mysql8 –volume /vol…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — mysql:8.0.4 는 GA(8.0.11) 이전 개발 릴리스이고, MySQL 8.0 계열 자체가 2026-04-30 확장 지원 종료(최종 8.0.46)로 EOL 되었습니다 — 현재는 8.4 LTS 또는 9.7 LTS 를 써야 합니다. 시놀로지 DSM 의 Docker 패키지 명칭·구성 변경 여부는 이번 조사에서 확인 불가입니다.

![MySQL 로고](/assets/img/wp/2019/04/mysql_PNG19.png)

## 시놀로지 NAS와 Docker를 이용한 간단한 MySQL 8 테스트 환경 구축

다른건 아니고 NAS의 남는 자원으로 MySQL 공부할 겸 테스트 환경을 만들었습니다.

docker를 이용해서 8.0.4 구성을 했네요.

```bash
docker run --name mysql8 --volume /volume1/docker/mysql8/mysql:/var/lib/mysql --volume /volume1/docker/mysql8/etc:/etc/mysql -e MYSQL_ROOT_PASSWORD=secret -p 13306:3306 -d mysql:8.0.4 \
--ulimit nofile=262144:262144 \
--max_connections=4096 \
--general_log=1 \
--general_log_file=/var/lib/mysql/general.log \
--innodb_print_all_deadlocks=1 \
--log_error=/var/lib/mysql/error.log
```

공유기에서 13306을 포트포워딩해서 어디서든 접속해서 테스트할 수 있게 했습니다.

![DBeaver 접속 화면](/assets/img/wp/2021/09/1.png)

DBeaver에서 접속이 잘되는 것을 확인했습니다.

모델링과 MySQL 8 공부를 좀 해봐야겠습니다.
