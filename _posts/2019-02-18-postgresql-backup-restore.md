---
date: 2019-02-18 19:53:06 +0900
title: "PostgreSQL 백업 및 복원"
category: postgresql
excerpt: "PostgreSQL 백업 및 복원 PostgreSQL 데이터를 백업하는 3가지 방법 1. SQL 덤프 2. 파일 시스템 레벨 백업 3. 연속 아카이빙 1. SQL 덤프 pg_dump 사용 덤프 백업 $ pg_dump dbname > outfile – pg_dump..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — SQL 덤프·파일시스템 백업 부분은 유효하지만, PITR 절차가 pg_start_backup()/pg_stop_backup() 과 recovery.conf 에 의존한다. 배타적 백업 모드는 15 에서 제거되고 함수명이 pg_backup_start()/pg_backup_stop() 으로 바뀌었으며, recovery.conf 는 12 에서 제거돼 postgresql.conf + recovery.signal 로 대체됐다. pg_xlog 디렉터리도 10 부터 pg_wal 이다.

![](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

PostgreSQL 데이터를 백업하는 3가지 방법

1. SQL 덤프  
2. 파일 시스템 레벨 백업  
3. 연속 아카이빙

## 1. SQL 덤프

pg\_dump 사용

덤프 백업

```bash
$ pg_dump dbname > outfile
```

– pg\_dump 는 최신 버전에서 다시 로드한다.  
– 32bit -> 64bit 서버로 이동할 수 있는 유일한 방법이다.  
– 한번에 하나의 데이터베이스만 백업할 수 있다.

덤프 복원

```bash
$ psql dbname < infile
```

– 새로운 환경에서 복원하게 되면 dbname 부분의 들어가는 데이터베이스가 자동으로 생성 되지 않기 때문에, 미리 사용자가 같은 이름의 데이터베이스를 생성 해줘야 한다.  
– SQL 덤프를 복원하기 전에 덤프된 데이터베이스의 개체를 소유하고 있거나 개체 권한이 부여된 모든 사용자가 이미 존재해야 한다.  
– 덤프 복원은 에러가 나도 계속 진행하기 때문에 –set ON\_ERROR\_STOP=on 옵션을 주면 에러 발생 시 psql을 종료한다.  
– pg\_dump로 생성된 덤프는 template0에 상대적이다. 이것은 template1을 통해 추가된 언어, 프로시저 등도 pg\_dump에 의해 덤프된다는 것을 의미한다. 결과적으로 복원 시, 커스터마이즈된 template1을 사용하는 경우 template0으로부터 비어있는 데이터베이스를 생성해야 한다.  
– 파이프에 쓰거나, 파이프에서 읽어 오는 pg\_dump 및 psql의 기능은 데이터베이스를 특정 서버에서 다른 서버로 직접 덤프를 가능하게 한다.

```bash
$ pg_dump -h host1 dbname | psql -h host2 dbname
```

pg\_dumpall 사용

– pg\_dump는 한 번에 하나의 데이터베이스만 덤프하며, role 또는 테이블스페이스 정보는 덤프하지 않는다.

백업

```bash
$ pg_dumpall > outfile
```

복원

```bash
$ psql -f infile postgres
```

– 실제로 시작한 기존 데이터베이스 이름을 지정할 수 있지만 비어 있는 클러스터로 로딩한 경우 postgres를 일반적으로 사용해야 한다.  
– 클러스터 차원의 데이터는 pg\_dumpall –globals-only 옵션을 사용하여 단독 덤프할 수 있다.

거대 데이터베이스 처리

– 일부 운영체제는 거대 pg\_dump 출력 파일을 생성할 때 최대 파일 크기 제한이 있다. pg\_dump는 표준 출력으로 사용할 수 있어, 유닉스 툴로 이런 문제의 가능성을 피할 수 있다.

◆ 압축 덤프 사용

gzip을 이용한 덤프

```bash
$ pg_dump dbnam | gzip > filename.gz
```

리로드

```bash
$ gunzip -c filename.gz | psql dbname
```

◆ split 사용

1GB 단위로 분할 백업

```bash
$ pg_dump dbname | split -b 1024m – filename
```

리로드

```bash
$ cat filename* | psql dbname
```

◆ pg\_dump의 커스텀 덤프 형식 사용

– 설치된 zlib 압축 라이브러리를 사용하여 PostgreSQL을 시스템에서 빌드한 경우 출력 파일에 쓸 때 커스텀 덤프 형식이 데이터를 압축한다.  
– 덤프파일 크기는 gzip과 비슷하지만 테이블을 선택적으로 복원할 수 있다는 장점이 있다.

백업

```bash
$ pg_dump -Fc dbname > filename
```

복원 : psql이 아닌 pg\_restore를 이용해 복원한다.

```bash
$ pg_restore -d dbname filename
```

◆ pg\_dump의 병렬 덤프 기능 사용

– 거대 데이터베이스의 덤프 속도를 높이기 위하여 병렬 모드를 사용할 수 있다.  
– 병렬 덤프는 "디렉토리" 아카이브 형식에서만 지원한다.

백업

```bash
$ pg_dump -j <number> -F d -f out.dir dbname
```

복원

```bash
pg_resote -j 를 이용하여 복원할 수 있다.
```

## 2. 파일 시스템 레벨 백업

– 시스템 레벨에서 백업을 하는 것인데, 정상적인 백업을 위해서는 반드시 DB를 shutdown 해야 한다. 복원도 마찬가지.

```bash
tar -cf backup.tar /usr/local/pgsql/data
```

– 파일 시스템 백업은 전체 데이터베이스 클러스터의 완전한 백업 및 복원에서만 동작한다.

## 3. 연속 아카이빙 및 PITR

– PostgreSQL은 클러스터의 데이터 디렉토리의 pg\_xlog/ 서브 디렉토리에 WAL를 항상 유지관리한다. 이 로그에는 데이터 파일에서 일어난 모든 변경 내용이 기록된다.  
– 복구가 필요한 경우, 파일 시스템 백업을 복원한 이후, 백업된 WAL 파일로부터 리플레이로 시스템을 현재 상태로 불러온다. (오라클 Hot backup 복원 후 archive 적용하는 것과 비슷한 개념이다.)  
– 일반 파일 시스템 백업과 마찬가지로, 전체 데이터베이스 클러스터 복원만 지원한다.

### 베이스 백업

– pg\_base 를 이용한 백업

1) WAL 아카이빙이 활성화 되어 있는지 확인한다.  
2) 슈퍼유저로 데이터베이스에 연결하고 다음 명령을 실행한다.  
SELECT pg\_start\_backup('label');  
여기서 label은 백업 작업의 식별을 위한 string이다.  
기본적으로 pg\_start\_backup은 완료 되는데 체크포인트를 수행하기 때문에 시간이 오래걸린다.  
백업을 가능한 빨리 시작하고 싶다면, 다음을 사용하는 것이 좋다.  
SELECT pg\_start\_backup('label',ture);  
체크포인트를 강제한다.  
3) tar 또는 cpio 같은 편리한 파일 시스템 백업툴을 사용하여 백업을 수행한다.  
4) 슈퍼유저로 데이터베이스에 접속 후에 명령을 실행한다.  
SELECT pg\_stop\_backup();  
5) 백업을 아카이브 하는 중에 WAL 세그먼트가 활성화 되면 백업이 끝이 난다.

※ 오라클 Hot backup과 동일한 개념으로 보면 된다.

### 연속 아카이브 백업을 사용한 복구

1) 서버가 실행중인 경우 서버를 중지한다.  
2) 공간에 여유가 있는 경우 필요할 때를 대비하여 전체 클러스터 데이터 디렉토리와 테이블스페이스를 임시 위치에 복사한다. 시스템 다운 정에 아카이브되지 않은 로그가 포함되었을 수 있는 클러스터의 pg\_xlog 서브디렉토리의 내용을 최소한이라도 따로 저장해두어야 한다.  
3) 사용 중인 클러스터 데이터 디렉토리 아래 및 테이블스페이스의 root 디렉토리 아래의 모든 기본 파일 및 서브 디렉토리를 삭제한다.  
4) 데이터베이스 파일을 파일 시스템 백업으로부터 복원한다. 올바른 소유권 확인 및 pg\_tblspc의 심볼릭 링크가 바른지 확인.  
5) pg\_xlog/ 밑에 오래된 파일 시스템 백업에서 온 로그를 삭제한다.  
6) pg\_xlog/ 2단계에서 저장된 아카이브되지 않은 WAL 세그먼트 파일이 있을 경우 pg\_xlog/에 복사한다.  
7) 클러스터 데이터 디렉토리에서 복구 명령 파일 recovery.conf를 생성한다. pg\_hba.conf를 수정하여 복구하는 동안 접속을 막는다.  
8) 서버를 시작한다. 서버가 복구모드로 들어가고 아카이브된 WAL 파일로 읽기가 진행된다. 복구가 완료 되면 recovery.conf의 이름을 recovey.done 으로 변경하고 다시 복구 모드로 들어가지 않게 바꿔준다.  
9) 데이터베이스의 내용을 확인하고 pg\_hba.conf 를 복원하여 사용자 연결을 확인한다.

### ※ recovery.conf

예제 파일. /usr/pgsql-9.6/share/recovery.conf.sample을 이용하여 만들 수 있다.

#### 아카이브 복구 설정

restore\_command (string)

– WAL 파일 시리즈의 아카이브된 세그먼트의 검색을 실행하는 로컬 쉘 명령.  
– 아카이브 복구에 필요하지만 스트리밍 복제의 경우는 옵션.  
– string의 %f 는 아카이브에서 검색할 파일 이름으로 교체되고, %p 는 서버의 복사 대상 경로로 교체된다.

```bash
restore_command = 'cp /data/pgsql/archvie/%f "%p"'
```

archive\_cleanup\_command (string)

– 모든 restartingpoint에서 실행되는 쉘 명령을 지정한다.  
– 스탠바이 서버에서 더 이상 필요로 하지 않는 오래된 아카이브 WAL 파일을 클린업하는 메카니즘을 제공하는 것.  
– %r 은 마지막 유효 재시작 지점이 있는 파일의 이름으로 교체된다.

```bash
archive_cleanup_command = 'pg_archivecleanup /data/pgsql/archive %r'
```

recovery\_end\_command (string)

– 복구 종료 시에 한 번만 실행되는 쉘 명령을 지정한다. 이 매개변수는 옵션이다.

#### 복구 타깃 설정

recovery\_target = 'immediate'

– 온라인 백업에서 복원하는 경우 이것은 백업이 종료된 지점을 의미한다.  
– 현재 다른 매개변수는 없다.

recovery\_target\_name (string)

– 이 매개변수는 지명된 복원 지점(pg\_create\_restore\_point()를 사용하여 생성)을 복구가 진행되는 지점으로 지정.

recovery\_target\_time (timestamp)

– 이 매개변수는 타임스탬프를 복구가 진행되는 지점으로 지정한다.  
– 정밀한 정지 지점은 recovery\_target\_inclusive의 영향도 받는다

recovery\_target\_xid (string)

– 트랜잭션 ID를 복구가 진행되는 지점으로 지정한다.  
– 복구되는 트랜잭션은 지정된 것 이전에 커밋된 트랜잭션이다.

다음 옵션은 복구 타깃을 추가로 지정하며, 타깃에 도달 했을때, 발생하는 것에 영향을 끼친다.

recovery\_target\_inclusive (boolean)

– 지정된 복구 타깃 직후에 중지 할 것인지, 직전에 중지 할 것인지 지정한다.  
– 기본값은 ture.

recovery\_target\_timeline (string)

– 특정한 타임라인으로의 복구를 지정한다.  
– 기본값은 베이스 백업을 가져왔을 때 현재였던 동일한 타임라인을 따라 복구하는 것이다.  
– 이것을 lastest로 설정하면 아카이브의 최신 타임라인으로 복구 되며, 스탠바이 서버에 유용하다.
