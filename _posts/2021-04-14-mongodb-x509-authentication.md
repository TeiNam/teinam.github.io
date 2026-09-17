---
date: 2021-04-14 09:30:47 +0900
title: "MongoDB의 x.509 인증"
category: mongodb
excerpt: "MongoDB의 x.509 인증 x.509는 암호학에서 공개키 인증서와 인증 알고리즘의 표준 가운데에서 공개 키 기반의(PKI)의 ITU-T 표준입니다. x.509 시스템에서는 CA는 x.500 규약에 따라 서로 구별되는 공개키를 가진 인증서를 발행합니다. 한 조직의 인증된 Roo…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — 자체 CA 발급과 `--tlsMode requireTLS`·`--clusterAuthMode x509`·`$external` 사용자 생성 절차는 현재도 유효합니다(SSL 옵션은 4.2 에서 TLS 옵션으로 대체). 접속 예시의 `mongo` 는 6.0 에서 제거됐으므로 `mongosh` 로 바꿔 실행해야 하며, 7.0 부터는 인증서 속성 매핑용 `net.tls.clusterAuthX509` 옵션이 추가됐습니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

### MongoDB의 x.509 인증

x.509는 암호학에서 공개키 인증서와 인증 알고리즘의 표준 가운데 공개 키 기반(PKI)의 ITU-T 표준이다. x.509 시스템에서 CA는 x.500 규약에 따라 서로 구별되는 공개키를 가진 인증서를 발행한다. 1996년에 확장 기능을 이용해 데이터를 추가할 수 있는 v3가 발표되어 현재까지 사용 중이다. x.509는 엄격한 수직 구조를 채택했으며, 하나의 인증기관을 정점으로 하는 트리 구조를 갖추고 있다.

MongoDB에서 x.509 인증서를 사용할 때 가장 많이 보는 인증서 파일의 확장자는 다음과 같다.

- .CRT – CRT 암호화된 인증서. 보통 개인키와 함께 주는 파일
- .CER – CER 암호화된 인증서. 복수의 인증서도 가능
- .PEM – (Privacy Enhanced Mail) Base64로 인코딩된 인증서. "—–BEGIN CERTIFICATE—–"와 "—–END CERTIFICATE—–" 사이에 들어간다

x.509의 경우 신뢰할 수 있는 인증기관(CA)이 모든 인증서에 서명해야 한다. 서명은 인증서의 명명된 소유자가 해당 인증서와 연결된 공개 키를 소유함을 인증한다. CA는 중간자 공격을 방지하는 신뢰할 수 있는 제3자 역할을 한다. MongoDB의 복제 셋 각 멤버는 데이터를 교환하려면 다른 멤버와 인증해야 하며, 클라이언트 역시 통신하는 프라이머리 및 세컨더리와 인증해야 한다.

#### Replica Set keyfile 인증

MongoDB의 복제 셋을 구성하고 나서 인증(security.authorization)을 활성화하면 데이터베이스를 재시작하거나 멤버를 추가할 때 멤버 간 인증을 위한 keyfile이 필요하다. 키 파일은 최소한의 보안 형태이며 테스트 또는 개발 환경에 가장 적합하다. 프로덕션 환경의 경우 x.509 인증서 사용을 권장한다.

> **전제조건**: MongoDB 복제 셋이 구성되어 있어야 하며, 인증이 아직 활성화되지 않은 상태여야 한다.

keyfile을 적용하는 방법은 다음과 같다.

인증이 없는 복제 셋에서 작업한다.

```bash
$ mkdir /var/lib/mongo/keys

$ openssl rand -base64 756 > /var/lib/mongo/keys/replset.key
$ chmod 400 /var/lib/mongo/keys/replset.key
```

설정 파일에 등록 (/etc/mongod.conf)

```yaml
security:
  authorization: enabled
  keyFile: /var/lib/mongo/keys/replset.key
```

그리고 모든 멤버에 복사한다.

```bash
$ scp /var/lib/mongo/keys/mongo_repl.key mongodb02:/var/lib/mongo/keys/
```

똑같이 400으로 권한을 변경하고, 설정 파일 안에도 등록한다.

그리고 모든 멤버를 순차적으로 재시작하면 admin 계정이나 일반 계정을 추가했을 때도 로그인이 정상적으로 된다.

```bash
$ mongo -u "dba" --authenticationDatabase "admin" --port 27018
```

MongoDB 보안 인증을 설정했을 때 Key 파일 생성 및 적용 방법

MongoDB를 기본으로 설치했을 경우 보안에 대한 조치가 되어 있지 않기 때문에 기본값으로 사용하면 해킹에 노출될 수 있다. 27017...

#### 멤버와 클라이언트를 인증하기 위한 x.509 인증서 사용

![x.509 인증서 기반 인증](https://webassets.mongodb.com/_com_assets/cms/image00-ff4b83ec8f.png)

복제 셋의 x.509 인증을 위한 신뢰 계층

운영 환경에서 MongoDB 배포는 단일 인증 기관에서 생성하고 서명한 유효한 인증서를 사용해야 한다. 독립적인 인증 기관을 생성하고 유지하거나, 다른 TLS/SSL 공급 업체에서 생성한 인증서를 사용해야 한다. MongoDB 4.2 버전부터 SSL이 TLS로 대체되며 더 이상 지원하지 않는다. 하지만 이전 버전에서 SSL 설정 방법은 4.2 이상 버전에서 TLS 설정과 거의 동일하다. TLS 설정에 대한 설명은 [MongoDB 네트워크 제한 설정 및 TLS 설정](/writing/mongodb-networks/) 포스팅에서 다룬 적 있으니 참고하기 바란다.

자체적으로 CA를 생성하는 작업은 인프라팀 SE가 담당하는 업무이므로 DBA나 개발자는 거의 할 일이 없을 것이다.

##### 자체 CA 생성하기

root-ca-openssl.cnf 파일을 생성하고 openssl req 명령으로 루트 인증서를 생성한다.

```ini
# for the CA policy
[ policy_rastalion ]
countryName                             = KR
organizationName                        = rastalion.me
organizationalUnitName                  = devops
commonName                              = rastalion.me
emailAddress                            = <optional>
    
[ req ]		
default_bits                            = 4096
default_md                              = sha256
default_keyfile                         = server-key.pem
distinguished_name                      = req_dn
req_extensions 	                        = v3_req
x509_extensions	                        = v3_ca
    
[ v3_req ]		
subjectKeyIdentifier                    = hash
basicConstraints.                       = CA:FALSE
keyUsage                                = critical, digitalSignature, KeyEncripherment
nsComment                               = "OpenSSL Generated Certificate"
extendedKeyUsage                        = serverAuth, clientAuth

[req_dn ]
countryName                             = KR
countryName_default                     = KR
countryName_min                         = 2
countryName_max                         = 2

# 회사명 입력
organizationName             	        = rastalion.me
organizationName_default     	        = rastalion.me
 
# 부서 입력
organizationalUnitName                  = devops
organizationalUnitName_default          = devops
 
# SSL 서비스할 domain 명 입력
commonName                              = rsatalion.me
commonName_default                      = rastalion.me
commonName_max                          = 64 
 
[ v3_ca ]
# Extensions for a typical CA

basicConstraints                        = critical, CA:TRUE
subjectKeyIdentifier                    = hash
authorityKeyIdentifier	                = keyid:always, issuer:always
keyUsage                                = critical, keyCertSign, cRLSign
```

```bash
$ openssl req -new -x509 -days 3652 -key root-ca.key -out root-ca.crt -config root-ca-openssl.cnf -subj "$db_prefix/CN=ROOTCA"
```

root CA를 생성한 후 멤버와 클라이언트 인증서에 서명하기 위한 중간 CA를 생성한다.

```bash
$ openssl req -new -key mongo-ca.key -out mongo-ca.csr -config root-ca-openssl.cnf -subj "$dn_prefix/CN=CA-MONGO"
$ openssl x509 -req -days 3652 -in mongo-ca.csr -CA root-ca.crt -CAkey root-ca.key -set_serial 01 -out mongo-ca.crt -extfile root-ca-openssl.cnf -extensions v3_ca

$ cat root-ca.crt > root-ca.pem
$ cat mongo-ca.crt >> root-ca.pem
```

중간 CA 생성 후 멤버 인증서를 생성한다. 노드마다 각자의 hostname으로 설정하는 것을 기본으로 한다.

```bash
$ openssl genrsa -out ${host}.key 4096 
$ openssl req -new -key ${host}.key -out ${host}.csr -config root-ca-openssl.cnf -subj "$dn_prefix/OU=$ou_member/CN=${host}"
$ openssl x509 -req -days 365 -in ${host}.csr -CA mongo-ca.crt -CAkey mongo-ca.key -CAcreateserial -out ${host}.crt -extfile root-ca-openssl.cnf -extensions v3_req

$ cat ${host}.crt > ${host}.pem
$ cat ${host}.key >> ${host}.pem
```

클라이언트 인증서를 생성한다.

```bash
$ openssl genrsa -out ${client_host}.key 4096 
$ openssl req -new -key ${client_host}.key -out ${client_host}.csr -config root-ca-openssl.cnf -subj "$dn_prefix/OU=$ou_client/CN=${client_host}" 
$ openssl x509 -req -days 365 -in ${client_host}.csr -CA mongo-ca.crt -CAkey mongo-ca.key -CAcreateserial -out ${client_host}.crt -extfile root-ca-openssl.cnf -extensions v3_req 

$ cat ${client_host}.crt > ${client_host}.pem 
$ cat ${client_host}.key >> ${client_host}.pem
```

#### mongod의 실행 옵션

- `--tlsMode`
- `--clusterAuthMode`
- `--tlsCAFile`
- `--tlsCertificateKeyFile`

```bash
$ mongod --replSet rs1 --port 27018 --tlsMode requireTLS --clusterAuthMode x509 --tleCAFile root-ca.pem --tlsCertificateKeyFile ${host}.pem --tlsClusterFile ${host}.pem --fork --logpath /vat/log/mongodb/mongod.log
```

이런 식으로 옵션을 주어서 mongod를 실행하거나, 설정 파일(/etc/mongod.conf)에 미리 지정해서 `systemctl start mongod`로 시작하면 된다.

그리고 인증서로 관리자를 생성한다.

```bash
$ openssl x509 -in ${client_host}.pem -inform PEM -subject -nameopt RFC2253 | grep subject

subject= CN=${client_host},OU=<MyClients>,O=<MyDomain>,C=KR
```

mongo 셸에서 관리자를 생성한다.

```javascript
> db.getSiblingDB("$external").runCommand(
   {
       createUser: "subject= CN=${client_host},OU=<MyClients>,O=<MyDomain>,C=KR",
       role: [ "root" ]
   }
)
```

$external 데이터베이스를 사용했으며, 클라이언트 인증서의 소유자를 사용자명으로 지정했다.

클라이언트에서 MongoDB에 접속할 때는 관리자를 생성한 인증서를 사용하면 된다.

```bash
$ mongo --norc --tls --tlsCertificateKeyFile ${client_host}.pem --tlsCAFile root-ca.pem --authenticationDatabase "\$external\" --authenticationMechanism MONGODB-X509
```

> **주의**: 실제 운영에서는 root-ca.key와 mongo-ca.key를 암호로 보호해야 한다.

##### 참고 자료

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/)

도서: MongoDB 완벽가이드
