---
date: 2019-09-19 15:29:08 +0900
title: "Redis #.1 소개 및 설치"
category: redis
excerpt: "Redis는 인메모리 Key-Value 데이터 저장소입니다. 모든 데이터를 메모리에 상주시켜 빠른 읽기와 쓰기를 제공하며, 이벤트 기반 비동기 네트워크 I/O 로 초당 수만 건 이상의 요청을 처리할 수 있습니다. 데이터의 가용성과 영속성을 위해 복제(replication) 기능과 RD…"
updated: 2026-09-17
---

> **다시 씀 (2026-09)** — 2019년에 쓴 글을 2026년 9월 기준으로 새로 썼습니다. 버전·명령·기본값을 현재 Redis 문서에 맞췄습니다.

![](/assets/img/wp/2019/09/redis.png)

## Redis 란?

Redis는 인메모리 Key-Value 데이터 저장소입니다. 모든 데이터를 메모리에 상주시켜 빠른 읽기와 쓰기를 제공하며, 이벤트 기반 비동기 네트워크 I/O 로 초당 수만 건 이상의 요청을 처리할 수 있습니다. 데이터의 가용성과 영속성을 위해 복제(replication) 기능과 RDB(Redis DB), AOF(Append Only File) 방식의 저장 옵션을 제공합니다.

RDBMS의 캐시 솔루션, Message Queue, Remote Dictionary, Shared Memory 용도로 널리 쓰입니다. 많은 기업에서 데이터베이스 앞단에 Redis 를 두고 자주 읽는 데이터를 캐싱해 응답 속도를 개선하며, 트랜잭션 없이 빠르게 읽어야 하는 메타데이터·설정 정보·세션 저장소로도 활용합니다.

Redis 는 단순한 Key-Value 맵이지만, 다양한 데이터 구조(String, List, Set, Sorted Set, Hash, Stream 등)를 지원합니다. Blocking Queue, Stack, Publish-Subscribe 시스템으로도 동작할 수 있으며, 광범위한 클라이언트 라이브러리로 대부분의 프로그래밍 언어를 지원합니다.

## 버전과 라이선스

2026년 9월 현재 Redis Open Source 의 최신 안정 릴리스는 **8.10.1**(2026-08-17 배포)입니다. Redis 8.0 은 2025년 5월에 출시되었으며, 8.x 계열은 짝수 마이너 버전(8.0 → 8.2 → 8.4 → 8.6 → 8.8 → 8.10)으로만 릴리스됩니다. Redis 7.x 는 여전히 보안 패치를 받고 있으며, 7.2.16 과 7.4.11 이 2026-08-17 에 함께 배포되었습니다.

### 라이선스 변화와 Valkey 포크

Redis 는 2024년까지 BSD-3-Clause 라이선스를 유지했으나, 2024년에 라이선스가 변경되었습니다.

| 버전 | 제품명 | 라이선스 |
|---|---|---|
| ≤ 7.2 | Redis (Open Source) | BSD-3-Clause |
| 7.4 ~ 7.8.x | Redis Community Edition | RSALv2 또는 SSPLv1 (택1) |
| ≥ 8.0.0 | Redis Open Source | RSALv2 또는 SSPLv1 또는 AGPLv3 (택1) |

세 라이선스 중 **AGPLv3 만 OSI 승인 오픈소스 라이선스**입니다. RSALv2 와 SSPLv1 은 source-available 이며 오픈소스 정의에 부합하지 않습니다.

- **RSALv2**: 비카피레프트 라이선스이지만, 매니지드 서비스로 Redis 기능을 제3자에게 제공하는 것을 금지합니다.
- **SSPLv1**: GPLv3 기반 카피레프트. 서비스로 제공할 때 수정본과 관리 계층 소스까지 SSPL 로 공개해야 합니다.
- **AGPLv3**: 네트워크 조항이 추가된 GPLv3. 네트워크로 상호작용하는 사용자에게도 소스 제공 의무가 있습니다.

이 라이선스 변화에 대응해 Linux Foundation 산하에서 **Valkey** 포크가 2024년에 등장했습니다. Valkey 는 Redis 7.2.4 를 포크했으며 BSD 라이선스를 유지합니다. 현재 Valkey 최신 안정 버전은 9.1.2(2026-09-01)입니다. Valkey 는 Redis OSS 2.x ~ 7.2.x 와 프로토콜·RDB/AOF·설정 파일 형식이 호환되며, 기존 Redis 클라이언트 라이브러리를 그대로 사용할 수 있습니다. 다만 **Redis Community Edition 7.4 이상과는 데이터 파일이 비호환**입니다.

> **주의:** Redis 7.2 이하를 수정해 네트워크 서버로 제공하던 경우, 8.x 로 업그레이드하면 그 서버 사용자에게 수정 소스를 제공해야 합니다.

## 설치

Redis 공식 배포 경로는 APT, RPM, Docker, macOS Homebrew, Snap 등을 지원합니다. Windows 는 공식 경로로 Docker 만 제공되며, Memurai 가 Redis 8.2 RC1 프리뷰를 별도 제공합니다.

### APT (Ubuntu / Debian)

```bash
sudo apt-get install lsb-release curl gpg
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
sudo chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt-get update
sudo apt-get install redis
```

공식적으로 테스트된 플랫폼은 Ubuntu 22.04(Jammy), 24.04(Noble), 26.04(Resolute Raccoon), Debian 12.13(Bookworm), 13.4(Trixie), Rocky Linux 8.10/9.7/10.1, AlmaLinux 8.10/9.7/10.1, Alpine 3.23, macOS 14.8.4(Sonoma)/15.7.4(Sequoia)/26.3(Tahoe)(Intel·ARM 모두)입니다.

### RPM (Rocky Linux / AlmaLinux)

공식 RPM 저장소는 **rockylinux8 과 rockylinux9** 만 제공됩니다. CentOS 7 은 2024-06-30 에 EOL 되었으며 Redis 공식 지원 목록에 없습니다.

`/etc/yum.repos.d/redis.repo` 생성:

```ini
[Redis]
name=Redis
baseurl=http://packages.redis.io/rpm/rockylinux9
enabled=1
gpgcheck=1
```

설치:

```bash
curl -fsSL https://packages.redis.io/gpg > /tmp/redis.key
sudo rpm --import /tmp/redis.key
sudo yum install redis
```

### Docker

모든 OS 공통 quick start:

```bash
docker run -d --name redis -p 6379:6379 redis
```

공식 이미지 태그는 Debian trixie 베이스가 기본입니다. `latest` 태그는 **8.10.1 / Debian trixie** 를 가리킵니다. Alpine 이미지는 `redis:alpine` 또는 `redis:8.10.1-alpine` 으로 사용할 수 있습니다.

영속 데이터를 호스트 경로에 저장하려면:

```bash
docker run --name redis -d -v /your/dir:/data redis redis-server --appendonly yes
```

`--appendonly yes` 옵션은 AOF 방식으로 데이터를 저장하겠다는 의미입니다. 데이터는 기본적으로 컨테이너 내 `/data` 에 저장되며, 호스트 디렉토리를 마운트하면 컨테이너를 재생성해도 데이터를 유지할 수 있습니다.

### 소스 빌드

Redis 8.x 는 예전처럼 `make && make install` 로 끝나지 않습니다. 다음 의존성이 필요합니다:

- GCC 또는 Clang
- **LLVM 21**
- **CMake 3.25 이상 3.31.6 이하** (CMake 4.x 는 빌드 실패)
- **Rust 1.94**
- OpenSSL, Python 3, 각종 개발 라이브러리(`-dev` 패키지)

의존성 설치는 `make bootstrap` 명령으로 자동화되어 있습니다:

```bash
wget https://github.com/redis/redis/archive/refs/tags/8.10.1.tar.gz
tar xzf 8.10.1.tar.gz
cd redis-8.10.1
make bootstrap
make modules-update
make -j "$(nproc)"
```

> **주의:** 위 URL은 GitHub이 자동 생성하는 태그 아카이브(git 소스 트리)입니다. 번들 모듈(Search/JSON/TimeSeries 등) 설정을 자동 생성하려면 `make modules-update` 단계가 필요합니다.

> **주의:** `make bootstrap` 은 OS 를 감지해 컴파일러·CMake·LLVM 같은 공용 도구를 설치하며, 기존 버전을 덮어쓸 수 있습니다. Ubuntu 26.04 처럼 CMake 4.x 를 기본 제공하는 배포판에서는 `pip3 install 'cmake==3.31.6'` 로 미리 고정해야 합니다.

빌드 옵션:

- `make BUILD_TLS=yes` — TLS 지원(`libssl-dev` 필요)
- `make USE_SYSTEMD=yes` — systemd 연동(`libsystemd-dev` 필요)
- `make BUILD_COMPRESSION=yes` — zstd 복제 압축(8.10 이상)
- `make test` — 테스트 실행

빌드가 끝나면 `./src/redis-server redis-full.conf` 로 실행합니다 (git 소스는 `modules-update`가 생성한 `redis-full.conf` 사용). README 에 `make install` 단계는 없으므로 `./src/` 에서 직접 실행하거나 패키지 배포를 이용해야 합니다.

**권장 사항:** 소스 빌드는 의존성 관리가 까다로우므로, 가능하면 패키지 배포나 공식 Docker 이미지를 사용하는 것이 안전합니다. Docker 빌드 환경을 참고하려면 `docker/Dockerfile.noble` (Ubuntu 24.04 기준) 을 보면 전제조건 전부가 포함된 컨테이너 설정이 있습니다.

### macOS

```bash
brew install redis
brew services start redis
```

## 구동 확인

Redis 를 기본 포트 6379 로 실행한 뒤, `redis-cli` 로 접속해 테스트합니다.

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

`ping` 명령에 `PONG` 이 반환되면 정상 구동입니다. `set` 과 `get` 명령으로 데이터를 저장하고 조회할 수 있습니다.

백그라운드로 실행하려면:

```bash
redis-server &
```

프로세스 확인:

```bash
ps -ef | grep redis
```

Docker 컨테이너에서 CLI 로 접근하려면:

```bash
docker exec -it redis redis-cli
```

정상적으로 `PONG` 을 받으면 설치가 완료된 것입니다.

## 다음 편에서

Redis 의 다양한 자료형(String, List, Set, Sorted Set, Hash, Stream)과 트랜잭션, Sort 명령, 키 만료와 데이터베이스 개념, Pub/Sub 패턴을 이어지는 편에서 다룰 예정입니다.
