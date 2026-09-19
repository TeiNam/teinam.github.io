---
date: 2021-03-30 10:02:09 +0900
title: "MongoDB 보안 인증을 설정 했을때 Key 파일 생성 및 적용 방법"
category: mongodb
excerpt: "MongoDB 레플리카 셋과 샤드 클러스터에서 멤버 간 내부 인증에 사용하는 keyfile을 생성하고 적용하는 방법을 정리합니다. openssl로 키를 생성하고 권한을 설정한 뒤 각 노드에 배포하는 절차를 다룹니다."
updated: 2026-09-20
---

## 개요

> **주의:** MongoDB를 디폴트 설정으로 설치하면 보안에 대한 아무런 조치가 되어 있지 않습니다. 기본 포트(27017)로 접근하면 username/password 없이도 DB에 admin 권한으로 접근할 수 있으므로, 해커들이 DB 내용을 전부 삭제하고 데이터는 자신이 보관하고 있으니 비트코인을 입금하라는 경우도 있을 정도로 보안이 취약합니다.

**전제조건**: MongoDB 7.0 이상(현행 지원: 7.0/8.0/8.3), Linux 서버 환경, openssl 패키지 설치, sudo 권한

MongoDB 레플리카 셋이나 샤드 클러스터를 구성할 때 멤버 간 내부 인증(internal authentication)을 위해 keyfile을 사용합니다. keyfile을 활성화하면 멤버 간 인증뿐만 아니라 **클라이언트 접근 제어(authorization)도 자동으로 활성화됩니다.** 따라서 keyfile을 적용하기 전에 admin 계정을 먼저 생성해야 합니다. admin 계정 생성 방법은 [MongoDB의 일반 계정 생성](/writing/mongodb-create-user/)을 참고하세요.

> **NOTE** — 공식 문서는 keyfile을 테스트·개발 환경용 최소 보안 수준으로 보고, 운영 환경에는 X.509 인증서를 권장합니다. X.509는 mTLS를 사용해 멤버별 신원을 확인하며, 공유 비밀(shared secret) 없이 인증합니다.

## keyfile 생성

MongoDB 레플리카 셋에 사용할 keyfile을 생성합니다.

```bash
openssl rand -base64 756 > <path-to-keyfile>
chmod 400 <path-to-keyfile>
```

openssl로 1024자 길이의 base64 문자열을 생성합니다. keyfile 요구사항:

- **길이:** 6~1024자 (공백 문자는 자동 제거되므로 실제 문자 수는 그 이하)
- **문자:** base64 세트만 허용 (`A-Z`, `a-z`, `0-9`, `+`, `/`, `=`)
- **파일 권한:** UNIX에서는 소유자만 읽을 수 있어야 합니다(`chmod 400`). 그룹이나 전체 권한이 있으면 mongod 기동이 실패합니다. Windows에서는 권한 체크를 하지 않습니다.
- **배포:** 레플리카 셋의 **모든 멤버가 같은 keyfile 내용**을 가져야 합니다.

생성된 keyfile을 각 레플리카 셋 멤버 노드에 복사합니다.

## 배포 예제

아래는 생성부터 배포까지 예제입니다.

```bash
$ openssl rand -base64 756 > /var/lib/mongo/mongo_repl.key
$ chmod 400 /var/lib/mongo/mongo_repl.key

세컨더리로 키 배포
$ scp /var/lib/mongo/mongo_repl.key mongo-rs02:/var/lib/mongo/
$ scp /var/lib/mongo/mongo_repl.key mongo-rs03:/var/lib/mongo/

2번 노드
$ chmod 400 /var/lib/mongo/mongo_repl.key
$ chown mongod.mongod /var/lib/mongo/mongo_repl.key

3번 노드
$ chmod 400 /var/lib/mongo/mongo_repl.key
$ chown mongod.mongod /var/lib/mongo/mongo_repl.key
```

## 설정 파일 적용

각 노드의 설정 파일(`/etc/mongod.conf`)에 keyfile 경로를 등록합니다. 레플리카 셋의 모든 멤버에 설정을 적용해야 합니다.

```yaml
security:
  authorization: enabled
  keyFile: /var/lib/mongo/mongo_repl.key
```

**중요:** `security.keyFile`을 설정하면 다음 두 가지가 동시에 활성화됩니다.

1. **멤버 간 내부 인증** — 레플리카 셋 멤버끼리 인증
2. **클라이언트 접근 제어** — `mongosh` 같은 클라이언트도 사용자 계정으로 인증해야 함

따라서 keyfile을 적용하기 전에 admin 계정을 먼저 생성하고, 재시작 후에는 `mongosh`에서 `-u`/`-p` 옵션으로 인증해서 접속해야 합니다. 첫 사용자는 localhost exception을 통해 생성할 수 있습니다.

설정을 마친 뒤 각 노드를 롤링 재시작(세컨더리부터, 프라이머리를 마지막에)해서 변경사항을 적용합니다.
