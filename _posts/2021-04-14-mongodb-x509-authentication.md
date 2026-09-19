---
date: 2021-04-14 09:30:47 +0900
title: "MongoDB의 x.509 인증"
category: mongodb
excerpt: "MongoDB 복제 셋의 멤버 간 인증과 클라이언트 인증을 x.509 인증서로 설정하는 절차를, 자체 CA 생성부터 MONGODB-X509 접속까지 정리합니다."
updated: 2026-09-20
---

x.509 는 공개키 기반 구조(PKI)에서 공개키 인증서의 형식과 검증 방법을 정한 ITU-T 표준입니다. x.509 체계에서 CA 는 x.500 규약에 따라 서로 구별되는 이름과 공개키를 담은 인증서를 발행합니다. 1996년에 확장 필드로 데이터를 덧붙일 수 있는 v3 가 나왔고 지금도 v3 를 씁니다. 신뢰 구조는 하나의 인증기관을 정점으로 하는 트리입니다.

MongoDB 에서 x.509 인증서를 다룰 때 자주 보는 파일 확장자는 다음과 같습니다.

- `.crt` — 인증서. 보통 개인키와 함께 배포하는 파일입니다.
- `.cer` — 인증서. 여러 장을 담을 수 있습니다.
- `.pem` — (Privacy Enhanced Mail) Base64 로 인코딩한 인증서입니다. `-----BEGIN CERTIFICATE-----` 와 `-----END CERTIFICATE-----` 사이에 본문이 들어갑니다.

x.509 에서는 신뢰할 수 있는 인증기관(CA)이 모든 인증서에 서명합니다. 서명은 인증서에 적힌 소유자가 그 인증서의 공개키를 실제로 가지고 있음을 보증하고, CA 는 중간자 공격을 막는 제3자 역할을 합니다. MongoDB 복제 셋의 멤버는 데이터를 주고받기 전에 서로를 인증해야 하고, 클라이언트도 접속하는 프라이머리·세컨더리와 인증해야 합니다.

## Replica Set keyfile 인증

복제 셋에 인증을 켜려면 멤버끼리 서로를 확인할 수단이 필요합니다. 가장 간단한 수단이 keyfile 입니다. 공식 문서는 keyfile 을 관리성과 암호학적 강도가 제한된 방식으로 보고 테스트·개발 환경에만 쓰라고 적으며, 운영 환경에는 x.509 인증서를 권합니다.

> **NOTE** — 전제조건: MongoDB 복제 셋이 구성되어 있고, 인증이 아직 켜지지 않은 상태여야 합니다.

인증이 없는 복제 셋에서 키 파일을 만듭니다. 키의 길이는 6자에서 1024자 사이여야 하고 base64 문자만 쓸 수 있습니다. 아래 명령은 756바이트를 base64 로 인코딩해 1024자 문자열을 만듭니다.

```bash
$ mkdir /var/lib/mongo/keys

$ openssl rand -base64 756 > /var/lib/mongo/keys/replset.key
$ chown mongod:mongod /var/lib/mongo/keys/replset.key
$ chmod 400 /var/lib/mongo/keys/replset.key
```

유닉스 계열에서는 키 파일에 그룹·기타 권한이 있으면 mongod 가 기동하지 않습니다. 소유자도 mongod 를 실행하는 계정이어야 합니다.

설정 파일(`/etc/mongod.conf`)에 등록합니다.

```yaml
security:
  authorization: enabled
  keyFile: /var/lib/mongo/keys/replset.key
```

`security.keyFile` 을 지정하면 멤버 간 인증과 역할 기반 접근 제어가 함께 켜지므로 `security.authorization` 은 없어도 같은 결과가 됩니다. 명시해 두면 설정 파일만 보고 인증 상태를 확인할 수 있습니다.

그리고 모든 멤버에 같은 파일을 복사합니다.

```bash
$ scp /var/lib/mongo/keys/replset.key mongodb02:/var/lib/mongo/keys/
```

복사한 파일도 소유자와 권한을 똑같이 맞추고 설정 파일에 등록합니다. 모든 멤버를 순차적으로 재시작하면 admin 계정이나 일반 계정으로 로그인이 됩니다. 레거시 `mongo` 셸은 6.0 에서 제거됐으므로 `mongosh` 를 씁니다.

```bash
$ mongosh -u "dba" --authenticationDatabase "admin" --port 27018
```

키 파일 생성과 적용은 [MongoDB 보안 인증을 설정 했을때 Key 파일 생성 및 적용 방법](/writing/mongodb-keyfile-setup/)에서 더 자세히 다뤘습니다.

## 멤버와 클라이언트를 인증하기 위한 x.509 인증서 사용

![x.509 인증서 기반 인증](https://webassets.mongodb.com/_com_assets/cms/image00-ff4b83ec8f.png)

복제 셋의 x.509 인증을 위한 신뢰 계층

운영 환경이라면 하나의 인증기관이 발급하고 서명한 유효한 인증서를 써야 합니다. 인증기관을 직접 만들어 운영하거나 외부 TLS 공급업체의 인증서를 받습니다. 하나의 복제 셋 또는 샤드 클러스터에 속한 모든 멤버의 인증서는 같은 CA 가 발급해야 합니다.

MongoDB 4.2 부터 TLS 관련 옵션 이름이 `ssl` 계열에서 `tls` 계열로 바뀌었습니다. `--sslMode`·`--sslPEMKeyFile`·`net.ssl.mode` 같은 이전 이름도 같은 기능으로 남아 있지만, 공식 문서는 `tls` 옵션을 쓰라고 안내합니다. 아래 예시는 모두 `tls` 계열 이름을 씁니다.

인증서가 만족해야 하는 조건은 용도에 따라 갈립니다.

- 멤버 인증서끼리는 Organization(`O`)·Organizational Unit(`OU`)·Domain Component(`DC`) 중 최소 하나가 비어 있지 않아야 하고, 그 값이 멤버 전체에서 정확히 일치해야 합니다. `OU` 를 여러 개 넣으면 목록까지 같아야 합니다.
- Subject Alternative Name(SAN) 항목 중 하나가 다른 멤버가 쓰는 호스트명과 일치해야 합니다. SAN 이 없으면 MongoDB 는 Common Name 으로 비교하지만 이 방식은 RFC 2818 에서 폐기됐고, 5.0 부터는 SAN 이 없는 인증서로 기동하면 경고가 남습니다.
- 클라이언트 인증서는 `O`·`OU`·`DC` 중 최소 하나가 멤버 인증서와 달라야 하고, subject 전체도 멤버 인증서와 달라야 합니다. 인증서 하나가 사용자 하나에 대응하므로 사용자마다 다른 인증서가 필요합니다.

> **WARNING** — 클라이언트 인증서의 `O`·`OU`·`DC` 가 멤버 인증서와 정확히 같으면 그 접속은 클러스터 멤버로 받아들여집니다. 전체 권한이 부여되고 로그에는 경고만 남습니다. 세 값의 조합은 멤버 인증서만 쓰도록 분리해 두어야 합니다.

`keyUsage` 와 `extendedKeyUsage` 는 넣지 않아도 되는 확장이지만, 넣는다면 용도에 맞아야 합니다.

| 용도 | keyUsage | extendedKeyUsage |
| --- | --- | --- |
| `tlsCertificateKeyFile` | digitalSignature, keyEncipherment, keyAgreement | serverAuth |
| `tlsClusterFile` | digitalSignature | clientAuth |
| 두 옵션에 같은 파일 | 위 두 줄의 합 | clientAuth, serverAuth |
| 클라이언트 | digitalSignature | clientAuth |

`O`·`OU`·`DC` 로 멤버 자격을 판정하는 방식이 맞지 않는 인증서를 쓴다면, 7.0 에 추가된 `net.tls.clusterAuthX509.attributes` 로 판정에 쓸 DN 속성을 직접 지정하거나 `net.tls.clusterAuthX509.extensionValue` 로 MongoDB 클러스터 멤버십 확장 OID 값을 쓰도록 바꿀 수 있습니다. DN 이 다른 새 인증서로 무중단 교체할 때는 `tlsX509ClusterAuthDNOverride` 파라미터에 이전 DN 을 넣어 두 DN 을 모두 인정하게 합니다.

인증기관을 직접 만드는 작업은 보통 인프라 담당자의 몫이라 DBA 나 개발자가 직접 할 일은 많지 않습니다.

### 자체 CA 생성하기

`root-ca-openssl.cnf` 파일을 만들고 `openssl req` 로 루트 인증서를 생성합니다. 이 파일에는 `[ req ]` 와 확장 섹션만 있으면 됩니다. `[ policy_… ]` 섹션은 `openssl ca` 명령이 읽는 것이라 여기서는 쓰이지 않습니다.

```ini
[ req ]
default_bits                            = 4096
default_md                              = sha256
default_keyfile                         = server-key.pem
distinguished_name                      = req_dn
req_extensions                          = v3_req
x509_extensions                         = v3_ca

[ req_dn ]
countryName                             = KR
countryName_default                     = KR
countryName_min                         = 2
countryName_max                         = 2

# 회사명
organizationName                        = rastalion.me
organizationName_default                = rastalion.me

# 부서
organizationalUnitName                  = devops
organizationalUnitName_default          = devops

# 인증서를 쓸 domain 명
commonName                              = rastalion.me
commonName_default                      = rastalion.me
commonName_max                          = 64

[ v3_req ]
subjectKeyIdentifier                    = hash
basicConstraints                        = CA:FALSE
keyUsage                                = critical, digitalSignature, keyEncipherment, keyAgreement
nsComment                               = "OpenSSL Generated Certificate"
extendedKeyUsage                        = serverAuth, clientAuth

[ v3_ca ]
# Extensions for a typical CA

basicConstraints                        = critical, CA:TRUE
subjectKeyIdentifier                    = hash
authorityKeyIdentifier                  = keyid:always, issuer:always
keyUsage                                = critical, keyCertSign, cRLSign
```

확장 섹션의 이름과 값은 OpenSSL 이 아는 철자여야 합니다. `basicConstraints` 뒤에 마침표가 붙으면 `unknown extension name`, `keyEncipherment` 를 잘못 적으면 `unknown bit string argument` 가 나면서 `openssl req` 와 `openssl x509` 가 인증서를 만들지 않고 멈춥니다.

subject 에 반복해서 쓸 값은 변수로 잡아 둡니다.

```bash
$ dn_prefix="/C=KR/O=rastalion.me/OU=devops"
$ ou_member="member"
$ ou_client="client"
```

`openssl req` 는 `-key` 로 넘긴 키 파일이 이미 있어야 하므로 CA 키를 먼저 만듭니다.

```bash
$ openssl genrsa -out root-ca.key 4096
$ openssl req -new -x509 -days 3652 -key root-ca.key -out root-ca.crt \
    -config root-ca-openssl.cnf -subj "$dn_prefix/CN=ROOTCA"
```

루트 CA 를 만든 뒤 멤버와 클라이언트 인증서에 서명할 중간 CA 를 만듭니다.

```bash
$ openssl genrsa -out mongo-ca.key 4096
$ openssl req -new -key mongo-ca.key -out mongo-ca.csr \
    -config root-ca-openssl.cnf -subj "$dn_prefix/CN=CA-MONGO"
$ openssl x509 -req -days 3652 -in mongo-ca.csr -CA root-ca.crt -CAkey root-ca.key \
    -set_serial 01 -out mongo-ca.crt -extfile root-ca-openssl.cnf -extensions v3_ca

$ cat root-ca.crt > root-ca.pem
$ cat mongo-ca.crt >> root-ca.pem
```

중간 CA 로 멤버 인증서를 만듭니다. 노드마다 자기 hostname 을 CN 과 SAN 에 넣습니다.

```bash
$ openssl genrsa -out ${host}.key 4096
$ openssl req -new -key ${host}.key -out ${host}.csr -config root-ca-openssl.cnf \
    -addext "subjectAltName = DNS:${host}" \
    -subj "$dn_prefix/OU=$ou_member/CN=${host}"
$ openssl x509 -req -days 365 -in ${host}.csr -CA mongo-ca.crt -CAkey mongo-ca.key \
    -CAcreateserial -copy_extensions copy -out ${host}.crt

$ cat ${host}.crt > ${host}.pem
$ cat ${host}.key >> ${host}.pem
```

`openssl x509 -req` 는 CSR 에 담긴 확장을 기본적으로 버립니다. `-copy_extensions copy` 를 주면 CSR 의 확장을 서명된 인증서로 옮기므로, 호스트마다 다른 SAN 을 `-addext` 로 CSR 에 넣고 그대로 서명할 수 있습니다. 이 옵션은 OpenSSL 3.0 이상에서 쓸 수 있습니다. `[ v3_req ]` 의 나머지 확장도 `req_extensions` 로 CSR 에 실려 함께 넘어가므로, 서명할 때 `-extfile` 을 다시 지정하지 않아도 됩니다.

클라이언트 인증서는 `OU` 만 바꿔 같은 방식으로 만듭니다.

```bash
$ openssl genrsa -out ${client_host}.key 4096
$ openssl req -new -key ${client_host}.key -out ${client_host}.csr -config root-ca-openssl.cnf \
    -addext "subjectAltName = DNS:${client_host}" \
    -subj "$dn_prefix/OU=$ou_client/CN=${client_host}"
$ openssl x509 -req -days 365 -in ${client_host}.csr -CA mongo-ca.crt -CAkey mongo-ca.key \
    -CAcreateserial -copy_extensions copy -out ${client_host}.crt

$ cat ${client_host}.crt > ${client_host}.pem
$ cat ${client_host}.key >> ${client_host}.pem
```

mongod 를 띄우기 전에 체인과 용도를 확인합니다. 두 명령이 `OK` 를 내지 않으면 인증서 쪽을 먼저 고쳐야 합니다.

```bash
$ openssl verify -CAfile root-ca.pem -purpose sslserver ${host}.crt
$ openssl verify -CAfile root-ca.pem -purpose sslclient ${client_host}.crt
```

## mongod 실행 옵션

- `--tlsMode` — `requireTLS` 로 두면 TLS 연결만 받습니다.
- `--clusterAuthMode` — `x509` 로 두면 멤버 간 인증에 인증서를 씁니다.
- `--tlsCAFile` — 제시된 인증서를 검증할 CA 파일입니다. x.509 인증을 쓸 때는 반드시 지정해야 합니다.
- `--tlsCertificateKeyFile` — 클라이언트에 제시할 인증서와 키입니다.
- `--tlsClusterFile` — 멤버 간 인증에 쓸 인증서와 키입니다. 지정하지 않으면 `--tlsCertificateKeyFile` 의 인증서를 씁니다.

```bash
$ mongod --replSet rs1 --port 27018 --dbpath /var/lib/mongo \
    --bind_ip localhost,${host} \
    --tlsMode requireTLS --clusterAuthMode x509 \
    --tlsCAFile root-ca.pem --tlsCertificateKeyFile ${host}.pem --tlsClusterFile ${host}.pem \
    --fork --logpath /var/log/mongodb/mongod.log
```

mongod 는 기본적으로 localhost 에만 바인딩하므로, 다른 멤버와 클라이언트가 붙어야 하면 `--bind_ip` 에 호스트명이나 IP 를 넣습니다. 이렇게 옵션을 직접 주고 실행하거나, 설정 파일(`/etc/mongod.conf`)의 `net.tls.*` 와 `security.clusterAuthMode` 에 같은 값을 적고 `systemctl start mongod` 로 시작하면 됩니다.

다음은 인증서로 관리자를 만드는 차례입니다. 먼저 클라이언트 인증서의 subject 를 RFC2253 형식으로 뽑습니다.

```bash
$ openssl x509 -in ${client_host}.pem -inform PEM -subject -nameopt RFC2253 -noout

subject=CN=app01.rastalion.me,OU=client,OU=devops,O=rastalion.me,C=KR
```

`mongosh` 에서 관리자를 만듭니다.

```javascript
db.getSiblingDB("$external").runCommand(
    {
        createUser: "CN=app01.rastalion.me,OU=client,OU=devops,O=rastalion.me,C=KR",
        roles: [ { role: "root", db: "admin" } ]
    }
)
```

사용자 이름은 RFC2253 형식의 subject 문자열 그대로입니다. 출력 머리말인 `subject=` 는 이름에 포함하지 않습니다. 역할은 `roles` 필드에 문서 형태로 적고 `db` 를 함께 지정합니다. `roles: [ "root" ]` 처럼 문자열만 주면 `createUser` 를 실행한 데이터베이스인 `$external` 에서 역할을 찾기 때문에 `root` 를 찾지 못합니다.

인증 데이터베이스로는 `$external` 을 씁니다. 인증서 하나는 사용자 하나에 대응하므로, 같은 인증서로 여러 사용자를 인증할 수는 없습니다.

클라이언트에서 접속할 때는 관리자를 만들 때 쓴 인증서를 그대로 제시합니다.

```bash
$ mongosh --norc --tls --tlsCertificateKeyFile ${client_host}.pem --tlsCAFile root-ca.pem \
    --authenticationDatabase '$external' --authenticationMechanism MONGODB-X509
```

`$external` 은 셸이 변수로 치환하지 않도록 단일 인용부호로 감쌉니다.

> **NOTE** — `--tlsAllowInvalidCertificates` 나 `net.tls.allowInvalidCertificates: true` 를 켜면 유효하지 않은 인증서로도 TLS 연결은 맺어지지만, 그 인증서로 인증은 되지 않습니다. 접속이 되는데 인증만 실패하면 이 옵션을 먼저 확인합니다.

> **WARNING** — 운영 환경에서는 `root-ca.key` 와 `mongo-ca.key` 를 암호로 보호하고 mongod 호스트와 분리해 보관해야 합니다. 다만 멤버 인증서의 키 파일까지 암호로 보호하는 경우, Windows 의 mongod 는 암호화된 PEM 파일을 지원하지 않아 기동에 실패합니다.

## 참고 자료

- MongoDB Manual — [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/)
- Self-Managed X.509 Authentication — [https://www.mongodb.com/docs/manual/core/security-x.509/](https://www.mongodb.com/docs/manual/core/security-x.509/)
- 도서: MongoDB 완벽가이드
