---
date: 2020-02-27 10:51:01 +0900
title: "WordPress Redis object cache 적용기"
category: redis
excerpt: "WordPress Redis object cache 적용기 워드프레스는 플러그인이 많아지거나, 스킨이 무거울 경우 속도가 많이 느려지는 경우가 있습니다. 제 블로그의 스킨도 무거운 편이고, 플러그인도 제법 많아 로딩 속도를 개선하기 위해서 Redis Object Cache를 적용해…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 전제한 스택이 모두 지원 종료 구간입니다: Redis 5.0.7 소스 빌드는 현재 8.10.1, PHP 7.3 은 2021년 12월 보안 지원 종료, CentOS 7 은 2024년 6월 EOL 입니다. phpredis 확장도 `nicolasff/phpredis` 가 아니라 `phpredis/phpredis` 로 이전되어 보통 `pecl install redis` 로 설치하며, `no-debug-non-zts-20180731` 확장 경로는 PHP 7.3 전용이라 PHP 8.x 에서는 달라집니다. `maxmemory` 와 `allkeys-lfu` 설정 및 플러그인 적용 흐름 자체는 여전히 유효합니다.

![Redis 로고](/assets/img/wp/2019/09/redis.png)

**WordPress Redis object cache 적용기**

워드프레스는 플러그인이 많아지거나, 스킨이 무거울 경우 속도가 느려지는 경우가 있다. 제 블로그의 스킨도 무거운 편이고, 플러그인도 여러 개 설치되어 있어 로딩 속도를 개선하기 위해 Redis Object Cache를 적용해 보았다.

> **전제조건**
> - CentOS/RHEL 7+ 또는 동등한 Linux 배포판
> - PHP 7.3+ (소스 설치 또는 패키지 설치)
> - 루트 또는 sudo 권한
> - 기본 컴파일 도구 (`make`, `gcc`)

**Redis 5.0.7 소스 설치 및 실행**

```bash
wget http://download.redis.io/releases/redis-5.0.7.tar.gz
tar zxvf redis-5.0.7.tar.gz

cd redis-5.0.7

make
```

`redis.conf` 수정

Redis가 호스트 노드의 메모리를 마구 사용하지 않도록 Max memory 값을 제한한다.

```ini
vi redis.conf

maxmemory  256mb
maxmemory-policy  allkeys-lfu
```

호스트 노드의 메모리 여유분에 따라 max 값을 조정해야 한다.

Redis 구동

```bash
src/redis-server &
```

Redis는 백그라운드 명령 없이 구동하면 세션을 지속적으로 물고 있고, 세션이 끊어지면 Redis 서버가 종료된다. `&`을 붙여 백그라운드 실행을 한다.

**php에 Redis 모듈 연동**

기존에 `php7.3`을 소스 설치하여 사용 중이기 때문에 `yum`으로 `php-redis-perl` 패키지 추가가 아닌 수동으로 컴파일하였다.

```bash
wget https://github.com/nicolasff/phpredis/zipball/master -O phpredis.zip
unzip phpredis.zip
cd phpredis-phpredis-c3ca003/

$PHP_HOME/php/bin/phpize
./configure --with-php-config=<$PHP_HOME>/bin/php-config
make && make install
```

`$PHP_HOME`은 PHP가 소스 설치되어 있는 경로다. `$PHP_HOME`은 그대로 사용하면 안 되고 본인의 PHP 설치 경로를 지정해야 한다.

`phpize`를 먼저 실행 후 컴파일한다.

`php/bin`의 경로가 기본 경로가 아니기 때문에 `--with-php-config` 옵션을 추가했다.

`php.ini`에 아래 내용을 추가한다.

```ini
vi php.ini

[redis]
extension=$PHP_HOME/lib/php/extensions/no-debug-non-zts-20180731/redis.so
session.save_handler = redis
session.save_path = "tcp://127.0.0.1:6379"
```

PHP를 재구동하기 전에 워드프레스 설정파일인 `wp-config.php`에 아래와 같은 내용을 추가한다.

```php
define( 'WP_CACHE_KEY_SALT', 'rastalion.me' );
define( 'WP_CACHE', true );
```

`rastalion.me` 부분에는 적용할 블로그의 도메인을 추가하면 된다.

`php-fpm` 재구동

```bash
systemctl restart php-fpm
```

**플러그인 설치**

워드프레스 플러그인에 Redis object cache를 검색해보면 바로 나온다. 설치 후 활성화하고 Setting을 눌러 enable 버튼을 누르면

![Redis Object Cache 플러그인 연결 상태 화면](/assets/img/wp/2020/02/캡처.png)

Connected 상태로 나오는 것을 보니 정상적으로 캐시 적용이 되었다.

페이지 로딩 속도의 체감이 조금은 빨라진 듯하다.
