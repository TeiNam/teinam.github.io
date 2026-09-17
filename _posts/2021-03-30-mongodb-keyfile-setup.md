---
date: 2021-03-30 10:02:09 +0900
title: "MongoDB 보안 인증을 설정 했을때 Key 파일 생성 및 적용 방법"
category: mongodb
excerpt: "MongoDB 보안 인증을 설정 했을때 Key 파일 생성 및 적용 방법 MongoDB를 디폴트로 설치했을 경우 보안에 대한 아무런 조치가 되어 있지 않기 때문에 그냥 기본 값으로 사용하면 해킹 쉽게 노출된다고 할 수 있습니다. 27017..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — `openssl rand -base64 756` → `chmod 400` → `security.keyFile` 등록으로 멤버 간 인증을 설정하는 절차는 현재도 그대로 유효합니다. 전제조건의 MongoDB 4.2 는 이미 지원 종료됐고(현재 지원은 7.0/8.0/8.3), 공식 문서는 keyfile 을 최소 수준으로 보고 운영 환경에는 x.509 를 권장합니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB 보안 인증을 설정 했을때 Key 파일 생성 및 적용 방법

> **주의:** MongoDB를 디폴트 설정으로 설치하면 보안에 대한 아무런 조치가 되어 있지 않습니다. 27017 포트 스캔으로 접근하면 username/password 없이도 DB에 admin 권한으로 접근할 수 있으므로, 해커들이 DB 내용을 전부 삭제하고 데이터는 자신이 보관하고 있으니 비트코인을 입금하라는 경우도 있을 정도로 보안이 취약합니다.

**전제조건**: MongoDB 4.2 이상, Linux 서버 환경, openssl 패키지 설치, sudo 권한

반드시 admin 계정을 생성하고 `security.authorization: enabled`를 설정해서 사용하세요. admin 계정을 생성하는 법은 아래 링크를 참고하세요.

MongoDB 4.2 admin 계정 설정하기

MongoDB admin 4.2 계정 설정하기 MongoDB 아틀라스 배포가 아닌, Linux서버에 직접 패키지를 올려 설치하게 되면, Authentication이 없습니다. 저 역시 CentOS7에 커뮤니티를 올려서 사용하고 있어서, 처음에는 /etc/mongo.conf 안의 Bind IP 설정이 허용하는대로 모든 접속을 허용합니다....

`security.authorization: enabled`를 설정하게 되면 레플리카 셋이나 샤드 클러스터를 설정하는데, 암호화된 key를 필요로 하게 됩니다.

MongoDB의 레플리카 셋에 사용할 key를 생성해보도록 하겠습니다.

```bash
openssl rand -base64 756 > <path-to-keyfile>
chmod 400 <path-to-keyfile>
```

일단 기본 명령은 위와 같습니다. openssl 패키지를 이용하여 생성합니다.

chmod 명령을 이용해 권한을 400으로 바꿔주고, 생성된 키파일을 각각의 레플리카 셋 멤버의 노드에 복사 해줍니다.

아래는 생성부터 배포까지 예제 입니다.

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

각각의 노드에서 설정 파일에 키를 적용합니다. 레플리카 셋의 모든 멤버에 설정을 해줘야 합니다.

`vi /etc/mongod.conf`

```yaml
security:
  authorization: enabled
  keyFile: /var/lib/mongo/mongo_repl.key
```

이런식으로 키를 설정해줘야만 보안 설정이 된 상태에서 레플리카셋 또는 샤드 클러스터를 생성할 수 있습니다.
