---
date: 2019-09-19 15:29:08 +0900
title: "Redis #.1 소개 및 설치"
category: redis
excerpt: "Redis 는 모든 데이터를 메모리에 두는 인메모리 Key-Value 저장소로, 복제와 RDB·AOF 영속성을 제공하며 캐시·메시지 큐·세션 저장소로 널리 쓰입니다."
updated: 2026-09-20
---

## Redis 란?

Redis 는 인메모리 Key-Value 데이터 저장소입니다. 모든 데이터를 메모리에 상주시키고 이벤트 기반 비동기 네트워크 I/O 로 요청을 처리해, 디스크를 오가는 저장소보다 응답 지연이 짧습니다. 데이터의 가용성과 영속성을 위해 복제(replication) 기능과 RDB(Redis DB), AOF(Append Only File) 방식의 저장 옵션을 제공합니다.

RDBMS 의 캐시 솔루션, Message Queue, Remote Dictionary, Shared Memory 용도로 널리 쓰입니다. 데이터베이스 앞단에 Redis 를 두고 자주 읽는 데이터를 캐싱해 응답 속도를 개선하며, 트랜잭션 없이 빠르게 읽어야 하는 메타데이터·설정 정보·세션 저장소로도 활용합니다.

Redis 는 단순한 Key-Value 맵이지만, 다양한 데이터 구조(String, List, Set, Sorted Set, Hash, Stream 등)를 지원합니다. Blocking Queue, Stack, Publish-Subscribe 시스템으로도 동작하며, 대부분의 프로그래밍 언어에 클라이언트 라이브러리가 있습니다.

## 버전과 라이선스

2026년 9월 기준 Redis Open Source 의 최신 계열은 8.10 입니다. 8.x 는 짝수 마이너 버전(8.0 → 8.2 → 8.4 → 8.6 → 8.8 → 8.10)으로만 올라가고, 이전 마이너 계열에도 패치 릴리스가 계속 나옵니다. 7.x 도 보안 수정을 받고 있으며, 7.4.11 이 2026-08-17 에 보안 패치로 배포되었습니다.

### 라이선스 변화와 Valkey 포크

Redis 는 7.2 까지 BSD-3-Clause 였고, 2024년 3월에 라이선스를 바꿨습니다.

| 버전 | 제품명 | 라이선스 |
|---|---|---|
| ≤ 7.2 | Redis (Open Source) | BSD-3-Clause |
| 7.4 ~ 7.8.x | Redis Community Edition | RSALv2 또는 SSPLv1 (택1) |
| ≥ 8.0.0 | Redis Open Source | RSALv2 또는 SSPLv1 또는 AGPLv3 (택1) |

AGPLv3 는 Redis 8 정식 출시와 함께 선택지로 추가되었습니다. 세 라이선스 중 **AGPLv3 만 OSI 승인 오픈소스 라이선스**이고, RSALv2 와 SSPLv1 은 소스가 공개된 source-available 라이선스이지만 오픈소스 정의에는 부합하지 않습니다.

- **RSALv2**: 비카피레프트 라이선스이지만, 매니지드 서비스로 Redis 기능을 제3자에게 제공하는 것을 금지합니다.
- **SSPLv1**: GPLv3 기반 카피레프트. 서비스로 제공할 때 수정본과 관리 계층 소스까지 SSPL 로 공개해야 합니다.
- **AGPLv3**: 네트워크 조항이 추가된 GPLv3. 네트워크로 상호작용하는 사용자에게도 소스 제공 의무가 있습니다.

라이선스 변경에 대응해 2024년에 **Valkey** 포크가 등장했습니다. Valkey 는 Redis 7.2.4 를 포크했고 BSD 라이선스를 유지하며, 최신 안정 버전은 9.1.2(2026-09-01)입니다. 포크 시점의 흔적이 남아 `INFO` 는 여전히 `redis_version:7.2.4` 를 보고합니다.

> **WARNING** — Redis 7.2 이하를 수정해 네트워크 서버로 제공하던 경우, 8.x 로 올리면 그 서버 사용자에게 수정 소스를 제공할 의무가 생깁니다. 공식 라이선스 문서가 이 경우를 명시적으로 짚습니다.

## 설치

공식 문서는 배포판 패키지(APT·RPM), Snap, Docker, macOS Homebrew 를 설치 경로로 안내합니다. Windows 용 네이티브 빌드는 없고, WSL2 에서 Linux 패키지를 설치하거나 Windows 호환 파트너인 Memurai 를 쓰는 두 가지를 안내합니다.

### APT (Ubuntu / Debian)

Redis 가 직접 운영하는 APT 저장소를 등록해 설치합니다.

```bash
sudo apt-get install lsb-release curl gpg
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
sudo chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt-get update
sudo apt-get install redis
```

저장소 주소에 `lsb_release -cs` 가 들어가므로 배포판 코드네임에 맞는 패키지가 자동으로 선택됩니다. 설치하면 Redis 가 바로 기동하고 재부팅 후에도 올라옵니다. 자동 실행이 안 되면 직접 켭니다.

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### RPM (Red Hat / Rocky Linux)

공식 문서는 Red Hat 계열에 대해 별도 저장소 설정 없이 배포판 패키지를 설치하도록 안내합니다.

```bash
sudo yum install redis
sudo systemctl enable redis
sudo systemctl start redis
```

서비스 이름은 설치 경로에 따라 `redis` 또는 `redis-server` 로 갈립니다. `systemctl` 에는 설치한 쪽 이름을 씁니다.

### Docker

모든 OS 공통 quick start 입니다.

```bash
docker run -d --name redis -p 6379:6379 redis
```

공식 이미지의 `latest` 태그는 **8.10.1 / Debian trixie** 를 가리킵니다. Alpine 기반은 `redis:alpine` 또는 `redis:8.10.1-alpine` 으로 받을 수 있고, 태그를 생략하면 Alpine 이 아니라 Debian 이미지가 내려옵니다.

영속 데이터를 호스트 경로에 저장하려면 볼륨을 붙입니다.

```bash
docker run --name redis -d -v /your/dir:/data redis redis-server --appendonly yes
```

`--appendonly yes` 는 AOF 방식으로 데이터를 저장하겠다는 의미입니다. 데이터는 컨테이너 내 `/data` 에 쌓이므로, 호스트 디렉터리를 마운트해 두면 컨테이너를 재생성해도 데이터가 남습니다.

### macOS

```bash
brew install redis
brew services start redis
```

### 소스 빌드

소스 tarball 은 공식 다운로드 페이지에서 받습니다. 버전 번호가 붙지 않은 `redis-stable.tar.gz` 가 항상 최신 안정 버전을 가리키고, 압축을 풀면 버전 없는 `redis-stable` 디렉터리가 나옵니다. 다운로드한 파일은 `redis-hashes` 저장소의 다이제스트로 검증할 수 있습니다.

```bash
wget https://download.redis.io/redis-stable.tar.gz
tar -xzvf redis-stable.tar.gz
cd redis-stable
make
sudo make install
```

`make install` 은 빌드까지 수행한 뒤 `redis-server`·`redis-cli`·`redis-benchmark` 와 모듈 `.so` 파일을 `/usr/local/bin` 과 `/usr/local/lib/redis/modules` 에 복사합니다. 경로는 `PREFIX` 로 바꾸고, `make uninstall PREFIX=/usr/local` 로 되돌립니다. 이미 빌드해 둔 결과만 설치하려면 `sudo make install SKIP_BUILD=1` 을 씁니다.

달라진 것은 빌드에 필요한 도구입니다. Redis 8 부터 Query Engine·JSON·TimeSeries·확률형 자료구조가 본체의 구성 요소로 들어왔고, 릴리스 tarball 에는 이 모듈 소스가 함께 들어 있습니다. `make` 는 코어와 모듈을 한 번에 컴파일하므로 C 컴파일러만으로는 끝나지 않습니다.

- GCC 또는 Clang
- **LLVM 21**
- **CMake 3.25 이상 3.31.6 이하** — CMake 4.x 는 지원하지 않고 빌드가 실패합니다
- **Rust 1.94**
- OpenSSL, Python 3, 각종 개발 라이브러리(`-dev` 패키지)

의존성 설치는 `make bootstrap` 이 대신합니다. OS 를 감지해 각 모듈의 전제 패키지를 설치하며, 무엇이 빠졌는지만 보려면 `make bootstrap list`, 실행될 명령만 보려면 `make bootstrap dry-run` 을 씁니다.

> **WARNING** — `make bootstrap` 은 시스템 패키지를 설치하면서 컴파일러·CMake·LLVM 같은 공용 도구의 기존 버전을 덮어쓸 수 있어, 새로 만든 머신이나 컨테이너에서만 권장됩니다. 또 없거나 너무 낮은 CMake 만 설치하고 이미 깔린 4.x 를 내려주지는 않으므로, CMake 4.x 를 기본 제공하는 배포판에서는 `pip3 install 'cmake==3.31.6'` 로 먼저 고정해야 합니다.

모듈을 빼고 코어만 만들려면 `make build redis` 를 씁니다. 그 밖의 빌드 옵션은 다음과 같습니다.

- `make BUILD_TLS=yes` — TLS 지원(`libssl-dev` 필요)
- `make USE_SYSTEMD=yes` — systemd 연동(`libsystemd-dev` 필요)
- `make BUILD_COMPRESSION=yes` — zstd 복제 압축(8.10 부터, `libzstd-dev` 필요)
- `make test` — 테스트 실행. TLS 빌드라면 `./utils/gen-test-certs.sh` 로 인증서를 만든 뒤 `./runtest --tls`

설치 없이 빌드 디렉터리에서 바로 띄울 수도 있습니다. tarball 에는 모듈 설정이 `redis.conf` 에 이미 들어 있으므로 `./src/redis-server redis.conf` 로 실행합니다. git 저장소를 클론했다면 `make modules-update` 로 모듈 소스를 받아야 하고, 이때 생성되는 `redis-full.conf` 를 인자로 넘깁니다.

소스 빌드는 의존성 관리가 까다로우므로 패키지나 공식 Docker 이미지를 쓰는 편이 안전합니다. 직접 빌드해야 한다면 저장소에 포함된 `docker/Dockerfile.noble`(Ubuntu 24.04) 에 전제조건이 모두 들어 있어 그 컨테이너 안에서 빌드하는 방법을 공식 문서가 권합니다.

## 기본 설정

배포되는 `redis.conf` 에는 다음 세 줄이 주석 없이 들어 있습니다.

```ini
bind 127.0.0.1 -::1
protected-mode yes
port 6379
```

`bind` 지시자를 지정하지 않으면 Redis 는 호스트의 모든 네트워크 인터페이스에서 연결을 받습니다. 그래서 설정 파일은 IPv4·IPv6 루프백만 듣도록 `bind` 를 켠 상태로 배포됩니다. 포트는 기본 6379 이고, 클러스터 모드면 16379, Sentinel 은 26379 를 추가로 씁니다. `requirepass` 는 주석 처리돼 있어 기본 상태에는 비밀번호가 없습니다.

설치 직후 원격 접속이 막히는 지점이 여기입니다. `protected-mode` 는 기본값이 `yes` 이고, 모든 인터페이스를 듣는 기본 설정에 비밀번호까지 없으면 Redis 는 루프백(127.0.0.1, ::1, 유닉스 소켓) 연결만 받습니다. 다른 주소에서 들어온 요청에는 무엇이 문제이고 어떻게 설정해야 하는지 설명하는 오류를 돌려줍니다. 이 동작은 3.2.0 부터 들어갔습니다.

원격에서 붙여야 하면 `bind` 로 들을 인터페이스를 지정하고 `requirepass` 나 ACL 로 인증을 설정하는 것이 정석입니다. `protected-mode no` 로 끄는 방법은 인증을 붙일 수 없는 환경에서만 쓰고, 그때도 방화벽으로 포트를 막아야 합니다. 인터넷에 그대로 노출된 Redis 는 `FLUSHALL` 한 번으로 데이터 전체가 지워질 수 있습니다.

## 구동 확인

`redis-cli` 로 접속해 확인합니다. 인자 없이 실행하면 localhost 6379 에 붙어 대화형 모드로 들어갑니다.

```bash
redis-cli
```

접속 후:

```text
127.0.0.1:6379> ping
PONG
127.0.0.1:6379> set hello world
OK
127.0.0.1:6379> get hello
"world"
127.0.0.1:6379>
```

`ping` 에 `PONG` 이 돌아오면 정상 구동입니다. `set` 과 `get` 으로 데이터를 저장하고 조회할 수 있습니다.

백그라운드로 띄우려면 데몬 옵션을 주거나 서비스로 실행합니다.

```bash
redis-server --daemonize yes
```

프로세스 확인:

```bash
ps -ef | grep redis
```

Docker 컨테이너에 CLI 로 들어가려면:

```bash
docker exec -it redis redis-cli
```

여기까지 `PONG` 을 받으면 설치가 끝난 것입니다.

## 다음 편에서

Redis 의 자료형(String, List, Set, Sorted Set, Hash, Stream)과 트랜잭션, Sort 명령, 키 만료와 데이터베이스 개념, Pub/Sub 패턴을 이어지는 편에서 다룹니다.
