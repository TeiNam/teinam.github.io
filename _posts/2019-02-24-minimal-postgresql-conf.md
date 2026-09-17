---
date: 2019-02-24 15:43:47 +0900
title: "DB 운영을 위한 최소 postgresql.conf 설정"
category: postgresql
excerpt: "postgresql.conf PostgreSQL의 환경변수를 지정해주는 설정파일. 오라클의 파라미터 파일과 비슷한 역할을 합니다. postgres.conf 파일 안에는 다양하고 많은 설정 값들이 있는데, 아래의 설정 값 정도만 설정하면 싱글 DB를 운영하는데 있어 크게 문제될 사항…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — checkpoint_segments(9.5 에서 max_wal_size 로 대체)와 stats_temp_directory(15 에서 제거)를 권장 설정으로 제시한다. wal_level 기본값도 현재는 replica 다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

**postgresql.conf**

PostgreSQL의 환경변수를 지정해주는 설정파일. 오라클의 파라미터 파일과 비슷한 역할을 합니다.  
postgresql.conf 파일 안에는 다양하고 많은 설정 값들이 있는데, 아래의 설정 값 정도만 설정하면 싱글 DB 운영에 충분합니다.

listen\_addresses = '\*' # 로컬 호스트 밖에서의 접속 허용  
shared\_buffers = 3GB # 물리 메모리 2/3 ~ 1/4  
checkpoint\_segments = 128 # 2GB redo 로그, 9.4 이하에서  
max\_wal\_size = 2GB # 2GB redo 로그, 9.5 이상에서  
min\_wal\_size = 2GB # 2GB redo 로그, 9.5 이상에서  
wal\_level = logical # 일단 최대 자세하게  
archive\_mode = on # 아카이빙 기능은 켜두고,  
archive\_command = 'true' # 아카이빙을 임시로 사용 안함  
log\_destination = 'stderr' # pg\_log 에 로그 남김  
logging\_collector = on # 자체 로그 프로세스 사용  
log\_line\_prefix = '%t %u@%r/%d(%c 또는 %p)' # 좀 더 자세히  
stats\_temp\_directory = '/run/shm' # 실시간 통계 정보는 공유 메모리로  
effective\_cache\_size = 4GB # 물리 메모리 1/2  (9.4 이하)

> **참고:** 더 자세한 설정 값들은 별도 문서로 정리하겠습니다.
