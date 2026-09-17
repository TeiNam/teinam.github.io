---
date: 2021-03-29 13:37:10 +0900
title: "MongoDB 네트워크 제한 설정 및 TLS 설정"
category: mongodb
excerpt: "MongoDB 네트워크 제한 설정 MongoDB도 다른 DB들 처럼 DB단에서 IP 접근을 제어할 수 있습니다. MongoDB의 설정 파일을 보면 net: 으로 시작하는 네트워크 관련 설정을 할 수 있는 부분이 있습니다. /etc/mongod.conf # network interf…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — `net.tls.*` 옵션 설명(mode·certificateKeyFile·CAFile·disabledProtocols 등)은 현재 문서와 대체로 일치하지만, 함께 나열된 `net.serviceExecutor` 는 5.0 에서 제거됐고 `net.tls.FIPSMode` 는 6.0 부터 Community 에디션에서 제거됐습니다. `net.maxIncomingConnections` 기본값도 65536 이 아니라 8.1(및 8.0.16, 7.0.31)부터 Windows 1,000,000 / Linux `(RLIMIT_NOFILE/2)*0.8` 로 바뀌었습니다.

![MongoDB 네트워크 설정 다이어그램](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB 네트워크 제한 설정

MongoDB도 다른 DB들 처럼 DB단에서 IP 접근을 제어할 수 있습니다.

MongoDB의 설정 파일을 보면 `net:` 으로 시작하는 네트워크 관련 설정 부분이 있습니다.

`/etc/mongod.conf`

```yaml
# network interfaces
net:
  port: 27017
  bindIp: 127.0.0.1
```

처음 설치하고 설정 파일에 들어가면 딱 저 만큼의 옵션 밖에 없습니다. 3.6 버전부터 mongos와 mongod의 기본 설정값은 127.0.0.1로 localhost입니다.

MongoDB의 네트워크 관련 설정 값은 아래와 같습니다.

```yaml
net:
   port: <int>
   bindIp: <string>
   bindIpAll: <boolean>
   maxIncomingConnections: <int>
   wireObjectCheck: <boolean>
   ipv6: <boolean>
   unixDomainSocket:
      enabled: <boolean>
      pathPrefix: <string>
      filePermissions: <int>
   tls:
      certificateSelector: <string>
      clusterCertificateSelector: <string>
      mode: <string>
      certificateKeyFile: <string>
      certificateKeyFilePassword: <string>
      clusterFile: <string>
      clusterPassword: <string>
      CAFile: <string>
      clusterCAFile: <string>
      CRLFile: <string>
      allowConnectionsWithoutCertificates: <boolean>
      allowInvalidCertificates: <boolean>
      allowInvalidHostnames: <boolean>
      disabledProtocols: <string>
      FIPSMode: <boolean>
   compression:
      compressors: <string>
   serviceExecutor: <string>
```

### net.port

MongoDB에서 사용하는 port를 설정합니다.

- mongos와 mongod 인스턴스의 기본 포트는 27017 입니다.
- 만약 mongod가 샤드(shard) 클러스터로 되어 있다면 27018을 사용합니다.
- config 서버의 멤버는 27019를 기본으로 사용합니다.

### net.bindIp

MongoDB에 접근을 허용할 IP를 설정할 수 있습니다.

```yaml
net: 
  port: 27017 
  bindIp: 127.0.0.1, 192.168.0.2, 192.168.0.3
```

이런식으로 ip를 나열해 허용할 IP들을 설정할 수 있습니다.

ipv4의 ip 뿐만 아니라, ipv6나 socket을 설정할 수도 있습니다.

```yaml
net:
  bindIp: localhost,/tmp/mongod.sock

net:
  bindIp: localhost, 2001:0DB8:e132:ba26:0d5c:2774:e7f9:d513
```

물론 ipv6를 사용하기 위해서는 ipv6 파라미터를 true로 설정해야 합니다.

모든 IPv4 및 IPv6 주소에 바인딩하려면 0.0.0.0, :: 을 입력하거나 MongoDB 4.2부터 asterisk "\*" (YAML 별칭 노드와 구별하기 위해 별표를 따옴표로 묶음)로 시작합니다. 또는 net.bindIpAll 설정을 사용하면 됩니다.

```yaml
net:
  bindIpAll: true
```

localhost가 아닌 다른 IP를 바인딩하기 전에 무단 액세스로부터 접근을 보호할 수 있는 최소한의 보안설정을 했는지 먼저 체크 해야 합니다.

### net.maxIncomingConnections

mongo 또는 mongod가 허용하는 최대 동시 연결 수입니다. 기본값은 65536입니다. 이 설정은 운영 체제에 구성된 최대 연결 추적 임계 값보다 높으면 효과가 없습니다.

이 설정은 mongos에 커넥션을 맺고 끊지 않고 계속 유지하는 클라이언트가있는 경우 유용합니다. 이 경우 maxIncomingConnections를 클라이언트가 생성하는 최대 연결 수 또는 연결 풀의 최대 크기보다 약간 높은 값으로 설정합니다. 이렇게 해야  MongoDB가 개별 샤드에서 연결 스파이크를 일으키는 것을 방지합니다. 스파이크는 분할 된 클러스터의 작업 및 메모리 할당에 문제가 될 수 있습니다.

### net.wireObjectCheck

기본값은 true입니다. true 인 경우 mongod 또는 mongos 인스턴스는 수신시 클라이언트의 모든 요청을 검증하여 클라이언트가 MongoDB 데이터베이스에 잘못된 BSON을 삽입하지 못하도록합니다.

하위 문서 중첩 수준이 높은 객체의 경우 net.wireObjectCheck는 성능에 약간의 영향을 줄 수 있습니다.

## MongoDB TLS 보안 인증 설정

MongoDB의 4.2 버전 부터 TLS 옵션을 지원하기 시작했는데, 이 부분은 MongoDB의 DBA Certification에 문제로 나오는 부분이라 조금 정리 해봤습니다.

TLS 옵션은 이전 SSL 옵션과 동일한 기능을 제공합니다. 기존의 SSL 옵션으로 사용하던 설정 파일은 모두 4.2버전에서 Deprecated 되었습니다.

## net.tls Options

```yaml
net:
   tls:
      mode: <string>
      certificateKeyFile: <string>
      certificateKeyFilePassword: <string>
      certificateSelector: <string>
      clusterCertificateSelector: <string>
      clusterFile: <string>
      clusterPassword: <string>
      CAFile: <string>
      clusterCAFile: <string>
      CRLFile: <string>
      allowConnectionsWithoutCertificates: <boolean>
      allowInvalidCertificates: <boolean>
      allowInvalidHostnames: <boolean>
      disabledProtocols: <string>
      FIPSMode: <boolean>
```

### net.tls.mode

모든 네트워크 연결에 사용되는 TLS를 활성화합니다. net.tls.mode 설정은 다음 네가지 방식이 지원됩니다.

| 값 | 설명 |
| --- | --- |
| disabled | TLS를 사용하지 않음 |
| allowTLS | 서버 간 연결은 TLS를 사용하지 않습니다. 들어오는 연결의 경우 서버는 TLS와 비 TLS를 모두 허용합니다. |
| preferTLS | 서버 간 연결은 TLS를 사용합니다. 들어오는 연결의 경우 서버는 TLS와 비 TLS를 모두 허용합니다. |
| requireTLS | 서버는 TLS 암호화 연결 만 사용하고 수락합니다. |

만약 `--tlsCAFile` 또는 `tls.CAFile`이 지정되지 않고 `x.509` 인증을 사용하지 않는 경우 TLS 사용 서버에 연결할 때 시스템 전체 CA 인증서 저장소가 사용됩니다.

`x.509` 인증을 사용하는 경우 `--tlsCertificateSelector`를 사용하지 않는 한 `--tlsCAFile` 또는 `tls.CAFile`을 지정해야합니다.

### net.tls.certificateKeyFile

TLS 인증서와 키를 모두 포함하는 .pem 파일의 경로를 지정합니다.

Mac이나 Window에서는 인증서 저장소에 인증서 파일을 지정할 수 있고 리눅스의 경우 pem의 위치를 지정해줍니다.

Windows 또는 macOS에서 TLS가 활성화 된 경우 `net.tls.certificateKeyFile` 또는 `net.tls.certificateSelector`를 지정해야합니다.

> 중요!
>
> Windows에서만 MongoDB 4.0 이상은 암호화 된 PEM 파일을 지원하지 않습니다. mongod는 암호화 된 PEM 파일이 있는 경우 시작할 수 없습니다. Windows에서 TLS에 사용할 인증서를 안전하게 저장하고 액세스하려면 `net.tls.certificateSelector`를 사용해야합니다.

### net.tls.certificateKeyFilePassword

인증서 키 파일 (예 : certificateKeyFile)의 암호를 해독하기위한 암호입니다. 인증서 키 파일이 암호화되었을 때만 `net.tls.certificateKeyPassword` 옵션을 사용합니다.

### net.tls.certificateSelector

`net.tls.certificateKeyFile`의 대안으로 Windows 및 macOS에서 사용할 수 있습니다. TLS / SSL에 사용할 운영 체제의 인증서 저장소에서 일치하는 인증서를 선택하기 위해 인증서 속성을 지정합니다.

`net.tls.certificateKeyFile` 및 `net.tls.certificateSelector` 옵션은 상호 배타적입니다. 둘 중 하나만 지정할 수 있습니다.

`net.tls.certificateSelector`는 `<property> = <value>` 형식의 인수를 허용합니다.

| Property | Value type | Description |
| --- | --- | --- |
| subject | ASCII string | 인증서의 주체 이름 또는 일반 이름 |
| thumbprint | hex string | SHA-1 digest 로 공개 키를 식별하는 데 사용되는 16 진수로 표시되는 byte sequence. "thumbprint"는 때로 "fingerprint"라고도 함 |

시스템 SSL 인증서 저장소를 사용하는 경우 OCSP (온라인 인증서 상태 프로토콜)를 사용하여 인증서의 해지 상태를 확인합니다.

mongod는 운영 체제의 보안 인증서 저장소에서 CA 인증서를 검색합니다. 이 인증서는 TLS 인증서의 전체 체인을 확인하는 데 필요합니다. 특히 보안 인증서 저장소에는 루트 CA와 TLS 인증서에 대한 전체 인증서 체인을 구축하는 데 필요한 중간 CA 인증서가 포함되어야 합니다. net.tls.CAFile 또는 net.tls.clusterFile을 사용하여 루트 및 중간 CA 인증서를 지정하면 안됩니다. 예를 들어 TLS 인증서가 단일 루트 CA 인증서로 서명 된 경우 보안 인증서 저장소에는 해당 루트 CA 인증서가 포함되어야 합니다. TLS 인증서가 중간 CA 인증서로 서명 된 경우 보안 인증서 저장소에는 중간 CA 인증서와 루트 CA 인증서가 포함되어야 합니다.

### net.tls.clusterFile

클러스터 또는 복제 세트의 멤버십 인증을위한 x.509 인증서 키 파일이 포함된 .pem 파일을 지정합니다. `net.tls.clusterFile`이 내부 클러스터 인증을위한 .pem 파일 또는 대체 `net.tls.clusterCertificateSelector`를 지정하지 않으면 클러스터는 `certificateKeyFile` 설정에 지정된 .pem 파일 또는 `net.tls.certificateSelector`에서 반환 된 인증서를 사용합니다.

x.509 인증을 사용하는 경우 `--tlsCertificateSelector`를 사용하지 않는 한 `--tlsCAFile` 또는 `tls.CAFile`을 지정해야합니다.

### net.tls.clusterPassword

`--sslClusterFile`로 지정된 x.509 인증서 키 파일의 암호를 해독하기위한 암호. 인증서 키 파일이 암호화되었을 때만 `net.tls.clusterPassword` 옵션을 사용합니다.

### net.tls.clusterCertificateSelector

내부 x.509 구성원 인증에 사용할 운영 체제의 보안 인증서 저장소에서 일치하는 인증서를 선택하는 인증서 속성을 지정합니다. `net.tls.clusterFile` 및 `net.tls.clusterCertificateSelector` 옵션은 상호 배타적입니다. 둘 중 하나만 지정할 수 있습니다.

`net.tls.clusterFile`의 대안으로 Windows 및 macOS에서 사용할 수 있습니다.

`net.tls.clusterCertificateSelector`는 `<property> = <value>` 형식의 인수를 허용합니다.

| Property | Value type | Description |
| --- | --- | --- |
| subject | ASCII string | 인증서의 주체 이름 또는 일반 이름 |
| thumbprint | hex string | SHA-1 digest 로 공개 키를 식별하는 데 사용되는 16 진수로 표시되는 byte sequence. "thumbprint"는 때로 "fingerprint"라고도 함 |

4.4 버전 부터는 mongod 와 mongos는 제시된 x.509 인증서가 mongod 와 mongos의 호스트 시스템 시간의 30 일 이내에 만료될 예정이라면 로그에  경고 내용을 기록합니다.

mongod는 운영 체제의 보안 인증서 저장소에서 CA 인증서를 검색합니다. 이 인증서는 클러스터 인증서의 전체 체인을 확인하는 데 필요합니다. 특히 보안 인증서 저장소에는 클러스터 인증서에 대한 전체 인증서 체인을 구축하는 데 필요한 루트 CA 및 중간 CA 인증서가 포함되어야합니다. `net.tls.CAFile` 또는 `net.tls.clusterCAFile`을 사용하여 루트 및 중간 CA 인증서를 지정하면 안됩니다. 예를 들어 클러스터 인증서가 단일 루트 CA 인증서로 서명 된 경우 보안 인증서 저장소에는 해당 루트 CA 인증서가 포함되어야 합니다. 클러스터 인증서가 중간 CA 인증서로 서명 된 경우 보안 인증서 저장소에는 중간 CA 인증서와 루트 CA 인증서가 포함되어야 합니다.

### net.tls.CAFile

인증 기관의 루트 인증서 체인이 포함 된 .pem 파일을 지정합니다.

### net.tls.clusterCAFile

연결을 설정하는 클라이언트가 제시 한 인증서의 유효성을 검사하는 데 사용되는 인증 기관의 루트 인증서 체인이 포함 된 .pem 파일입니다. 상대 또는 절대 경로를 사용하여 .pem 파일의 파일 이름을 지정합니다.

`net.tls.clusterCAFile`을 사용하려면 `net.tls.CAFile`이 설정되어 있어야합니다. `net.tls.clusterCAFile`이 연결을 설정하는 클라이언트의 인증서 유효성을 검사하기위한 .pem 파일을 지정하지 않으면 클러스터는 `net.tls.CAFile` 옵션에 지정된 .pem 파일을 사용합니다. `net.tls.clusterCAFile`을 사용하면 별도의 인증 기관을 사용하여 TLS 핸드 셰이크의 클라이언트-서버 및 서버-클라이언트 부분을 확인할 수 있습니다.

4.0부터 macOS 또는 Windows에서는 PEM 키 파일 대신 운영 체제의 보안 저장소에있는 인증서를 사용할 수 있습니다. 보안 저장소를 사용할 때 `net.tls.clusterCAFile`을 지정할 필요는 없지만, 수동으로 위치를 지정할 수도 있습니다.

### net.tls.allowConnectionsWithoutCertificates

인증서를 제공하지 않는 클라이언트의 경우 mongos 또는 mongod는 연결을 설정할 때 TLS / SSL 인증서 유효성 검사를 우회합니다. 하지만 인증서를 제시하는 클라이언트의 경우 mongos 또는 mongod는 CAFile에 지정된 루트 인증서 체인을 사용하여 인증서 유효성 검사를 수행하고 유효하지 않은 인증서가있는 클라이언트는 거부합니다. mongos 또는 mongod에 인증서를 제공하지 않거나 제공 할 수없는 클라이언트를 포함하는 혼합 배포가있는 경우 `net.tls.allowConnectionsWithoutCertificates` 옵션을 사용합니다.

### net.tls.allowInvalidCertificates

클러스터의 다른 서버에서 TLS 인증서에 대한 유효성 검사를 활성화하거나 비활성화하고 잘못된 인증서를 사용할 때에도 연결할 수 있게 하는 설정입니다.  x.509 인증을 사용할 때 –`-tlsAllowInvalidCertificates` 또는 `tls.allowInvalidCertificates : true`를 지정하는 경우 잘못된 인증서는 TLS 연결은 가능하지만, 인증이 되지는 않습니다. `net.tls.allowInvalidCertificates` 설정을 사용하면 MongoDB는 잘못된 인증서 사용에 관한 경고를 로그에 기록합니다.

### net.tls.allowInvalidHostnames

기본값은 fslse이며, 값을 true로 바꾸면 MongoDB는 TLS 인증서의 호스트 이름 유효성 검사를 비활성화하여 해당 인증서의 호스트 이름이 지정된 호스트 이름과 일치하지 않는 경우에도 mongo가 MongoDB 인스턴스에 연결할 수 있습니다.

### net.tls.disabledProtocols

TLS로 실행되는 MongoDB 서버가 특정 프로토콜을 사용하는 수신 연결을 수락하지 못하도록합니다. 여러 프로토콜을 지정하려면 쉼표로 구분 된 프로토콜 목록을 작성하면 됩니다.

`net.tls.disabledProtocols`는 TLS1\_0, TLS1\_1, TLS1\_2 및 4.0.4 (및 3.6.9) 버전부터 TLS1\_3 프로토콜을 인식합니다.

macOS에서는 TLS1\_1을 비활성화하고 TLS1\_0과 TLS1\_2를 모두 활성화 된 상태로 둘 수 없습니다. 다른 둘 중 하나 이상을 비활성화 해야합니다 (예 : TLS1\_0, TLS1\_1). 여러 프로토콜을 나열 하려면 쉼표로 구분 된 프로토콜 목록으로 지정하십시오. 예 : TLS1\_0, TLS1\_1.  
인식 할 수없는 프로토콜을 지정하면 서버가 시작되지 않습니다. 지정된 비활성화 된 프로토콜은 기본 비활성화 된 프로토콜을 재정의 합니다. 버전 4.0부터 MongoDB는 시스템에서 TLS 1.1+를 사용할 수있는 경우 TLS 1.0 사용을 비활성화 합니다. 비활성화 된 TLS 1.0을 활성화 하려면 `net.tls.disabledProtocols`에 `none`을 지정합니다.

복제 세트 및 분할 된 클러스터의 구성원은 공통된 프로토콜을 하나 이상 사용해야합니다.
