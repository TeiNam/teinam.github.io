---
date: 2019-02-23 01:42:04 +0900
title: "UID 일관 변경"
category: dbops
excerpt: "Linux나 Unix 에서 RAC나 HA 구성중에 양쪽 노드에 유저명은 같은데 UID가 다르면 설치가 안되는 경우가 발생. 이중화 작업에는 항상 UID를 맞춰줘야 합니다. UID가 같지 않을경우 일괄 변경 하는 방법 $ usermod -u 501 oracle..."
updated: 2026-09-17
---

![](/assets/img/wp/2019/02/수정됨_fcfdee7682c7e8e8a9a10b10f770b890.png)

> **전제조건:** root 권한이 필요합니다.

Linux나 Unix에서 RAC나 HA 구성 중에 양쪽 노드에 유저명은 같은데 UID가 다르면 설치가 안 되는 경우가 발생합니다.

이중화 작업에는 항상 UID를 맞춰야 합니다.

UID가 같지 않을 경우 일괄 변경하는 방법

```bash
$ usermod -u 501 oracle
```

위와 같이 바꿔주면 기존에 oracle 계정으로 생성했던 파일들이 전부 유저명이 아닌 UID로 표시됩니다.

그럴 경우

```bash
$ find / -user 502 -exec chown -h oracle {} \;
```

기존 502번으로 되어 있던 권한이 oracle로 변경되고 id를 확인해 보면 501로 바뀝니다.

```bash
$ find / -user oracle -exec chgrp -h dba {} \;
```

이렇게 하면 그룹을 일괄 변경할 수 있습니다.
