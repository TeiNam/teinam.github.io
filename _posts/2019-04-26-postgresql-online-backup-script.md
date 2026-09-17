---
date: 2019-04-26 16:32:32 +0900
title: "PostgreSQL 온라인 백업 스크립트"
category: postgresql
excerpt: "PostgreSQL 온라인 백업용 스크립트 입니다. Crontab에 걸어서 사용하면 됩니다. 해당 스크립트는 PostgreSQL DB의 wal_level 이 logical or replica or hot_standby 일 경우에만 사용 가능합니다. pg_backup.sh ## Po…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 스크립트가 pg_start_backup('backup',true)/pg_stop_backup() 배타적 백업 모드에 의존한다. 15 에서 배타적 백업 모드가 제거되고 함수가 pg_backup_start()/pg_backup_stop() 으로 개명돼 그대로 실행하면 실패한다.

![PostgreSQL 로고](/assets/img/wp/2019/02/postgresql-logo_7SyLG2o.png)

PostgreSQL 온라인 백업용 스크립트입니다.

Crontab에 걸어서 사용하면 됩니다.

해당 스크립트는 PostgreSQL DB의 wal_level이 logical or replica or hot_standby 일 경우에만 사용 가능합니다.

[**pg\_backup.sh**](https://github.com/TeiNam/database/blob/master/pg_backup.sh)

```bash
## PostgreSQL 백업 스크립트
## 해당 스크립트는 PostgreSQL DB의 wal_level 이 logical or replica or hot_standby 일 경우에만 사용 가능합니다.
## 작성자 : Rastalion
## rastalion.me

###해당부분은 백업할 DB 서버의 정보에 맞게 직접 채워넣어야 합니다.

### DB의 superuser  (postgres)
DB_USER=

### 백업이 받아지는 경로
BACKUP_DIR=

### DATA 경로
DATA_DIR=

### 테이블 스페이스들이 있는 경로
TBS_DIR=

### archive_command에 의해 파일이 복사 되는 경로
ARCHIVE_DIR=


###아래 부분은 수정 금지

###DB 백업
export DATEVAR=`date +%Y%m%d`
export FILE_NAME=$DATEVAR

if [ -d $BACKUP_DIR/$FILE_NAME ];
  then
    echo "Directory exist"
  else
    echo "Making a backup directory"
    mkdir -p $BACKUP_DIR/$FILE_NAME
fi

RECOVERY_STATUS=`psql -t -U $DB_USER -c "select pg_is_in_recovery();" | head -n 1`
if [[ "$RECOVERY_STATUS" =~ "f" ]]; 
  then
    ###DB 백업 시작
    echo "begin Backup"
    psql -U $DB_USER -c "select pg_start_backup('backup',true);"
    ###백업대상 Copy
    echo "Copy Database"
    cp -a $DATA_DIR $BACKUP_DIR/$FILE_NAME/
    cp -a $TBS_DIR $BACKUP_DIR/$FILE_NAME/
    cd $BACKUP_DIR/$FILE_NAME
    tar -zcvf $BACKUP_DIR/data_`date +%Y%m%d`.tar.gz ./*
    cd $BACKUP_DIR
    rm -rf $FILE_NAME
    ###DB 백업 종료
    echo "end backup"
    psql -U $DB_USER -c "select pg_stop_backup();"
  else
    echo "wal_level fault"
fi
###아카이브 백업
ARCHIVE_STAUS=`psql -t -U $DB_USER -c "show archive_mode;" | head -n 1`
if [[ "$ARCHIVE_STAUS" =~ "on" ]];
  then
    echo "DB archive mode = on"
    cd $ARCHIVE_DIR
    tar -zcvf $BACKUP_DIR/arch_`date +%Y%m%d`.tar.gz ./*
    ### ARCHIVE영역삭제 3일 지난것만 삭제
    if [ -z $(find $ARCHIVE_DIR -type f -mtime +3) ];
      then
        echo "There are no archives"
      else
        echo "Delete Archvie over 3days"
        find $ARCHIVE_DIR/* -type f -mtime +3 -exec rm -f {} \;
      fi
    else
      echo " DB archive mode = off"
fi

### 오래된 백업 삭제
if [ -z $(find $BACKUP_DIR -type f -mtime +3) ];
  then
    echo "There are no backup files"
  else
    echo "Delete Backup files over 3days"
    find $BACKUP_DIR/*.gz -type f -mtime +3 -exec rm -f {} \;
fi
```
