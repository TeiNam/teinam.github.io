---
title: "계정과 인증"
permalink: /docs/database/mysql-install-checklist/accounts-auth/
breadcrumb: "Docs / Database / MySQL 초기 설치 체크리스트"
description: "MySQL 초기 설치 — 계정과 인증 플러그인"
updated: 2026-09-19
guide: mysql-install-checklist
order: 6
nav_title: "계정과 인증"
---

설치 직후에 남아 있는 기본 계정과 권한을 정리하고, 어떤 인증 플러그인으로 커넥션을 받을지 정하는 절이다. 계정 정리는 설치 직후에 끝내고, 인증 플러그인은 클라이언트 드라이버 버전과 함께 결정한다.

### 설치 직후 해야 할 일

- MySQL 설치는 슈퍼유저 계정 `'root'@'localhost'` **하나만** 만든다. 함께 `mysql.proxies_priv` 에 `''@''` 를 대상으로 PROXY 권한을 부여하는 행이 존재한다.
- `mysqld --initialize` 는 임의의 초기 비밀번호를 생성해 **만료 상태로 표시**하고 서버 에러 로그에 기록한다. RPM 설치는 에러 로그, macOS 설치기는 다이얼로그로 알려 준다. `--initialize-insecure` 는 비밀번호 없이 만들고 경고를 로그에 남긴다.
- `mysql_secure_installation` 이 하는 일은 네 가지다.
  - `root` 계정에 비밀번호를 설정한다.
  - 로컬 호스트 밖에서 접근 가능한 `root` 계정을 제거한다.
  - 익명 사용자 계정을 제거한다.
  - `test` 데이터베이스와 `test_` 로 시작하는 이름의 DB 에 누구나 접근하게 하는 권한을 제거한다.
- `validate_password` 가 설치되지 않았으면 설치 여부를 묻는다. `--use-default` 로 비대화식 실행도 된다.

```bash
mysql_secure_installation
```

- 애플리케이션 계정에는 `CONNECTION_ADMIN` 이나 `SUPER` 를 주지 않는다. 문서도 이 권한을 관리자에게만 부여하고 일반 사용자에게는 부여하지 말라고 적는다.
- 8.2.0 부터 DB 권한 부여에서 `%` 와 `_` 와일드카드가 deprecated 다. 스키마 이름을 그대로 적는다.

### 비밀번호 정책

8.4 에서 `validate_password` 플러그인이 **컴포넌트로 재구현**됐다. 플러그인은 deprecated 이고 장래 제거 대상이다. 둘을 동시에 설치하면 컴포넌트가 우선하고, 컴포넌트가 없으면 플러그인으로 폴백한다.

```sql
INSTALL COMPONENT 'file://component_validate_password';
```

전환 순서는 네 단계다.

1. 컴포넌트를 설치한다.
2. 변수명을 점 표기(`validate_password.length` 등)로 교체한다.
3. `UNINSTALL PLUGIN validate_password` 를 실행한다.
4. 서버를 재시작한다.

| 변수 | 기본값 |
|---|---|
| `validate_password.policy` | `1`(MEDIUM) |
| `validate_password.length` | `8` |
| `validate_password.mixed_case_count` | `1` |
| `validate_password.number_count` | `1` |
| `validate_password.special_char_count` | `1` |
| `validate_password.check_user_name` | `ON` |
| `validate_password.dictionary_file` | 빈 값(사전 검사 없음) |

- 전부 전역 범위이고 동적 변경이 가능하다.
- `length` 는 `number_count + special_char_count + 2*mixed_case_count` 보다 작게 내릴 수 없다.
- 정책을 위반하면 `ERROR 1819 (HY000): Your password does not satisfy the current policy requirements` 가 난다.
- 해시로 지정한 비밀번호는 검사 대상이 아니다. 원본 값이 없어 검사할 수 없기 때문이다.

### 인증 플러그인과 구 드라이버

- `caching_sha2_password` 가 기본 인증 플러그인이다. 8.4 에서는 `authentication_policy` 변수가 기본 플러그인을 결정하며 그 기본이 `caching_sha2_password` 다. `default_authentication_plugin` 은 8.0.27 에서 deprecated 됐고 **8.4.0 에서 제거**됐다.
- `mysql_native_password` 는 **8.0.34 deprecated → 8.4 기본 비활성 → 9.0.0 제거**다. 8.4 서버에는 내장돼 있지만 꺼져 있고 `--mysql-native-password=ON` 으로만 켤 수 있다. 8.4 이상 클라이언트도 기본적으로 `caching_sha2_password` 를 쓴다.
- 꺼진 상태에서 해당 플러그인 계정으로 접속하면 `ERROR 1045 (28000): Access denied for user ...` 가 나고, 그 플러그인으로 계정을 만들거나 바꾸려 하면 `ERROR 1524 (HY000): Plugin 'mysql_native_password' is not loaded` 가 난다.
- `caching_sha2_password` 계정으로 접속하려면 **보안 연결이거나, RSA 키 페어로 비밀번호를 교환할 수 있는 비암호화 연결**이어야 한다. 서버는 기본적으로 공개키를 클라이언트에 보내지 않으므로 평문 TCP 클라이언트는 `ERROR 2061 (HY000): Authentication plugin 'caching_sha2_password' reported error: Authentication requires secure connection.` 을 만난다. `--get-server-public-key` 또는 `--server-public-key-path` 가 필요하다.
- 캐시는 재시작하면 남지 않는다. 계정 생성, 비밀번호 변경, `RENAME USER`, `FLUSH PRIVILEGES` 이후 첫 접속에서 다시 요구된다.
- 8.4.0 이상은 TLSv1.2·TLSv1.3 을 지키지 않거나, 순방향 비밀성을 제공하지 않거나, SHA2·AEAD 를 쓰지 않는 암호군을 허용하지 않는다.
- 드라이버를 먼저 올린다. `mysql_native_password` 를 켜서 버티는 임시 대응은 9.0.0 에서 끝난다.

### `local_infile`

- **기본 비활성**이다. 런타임에 켤 수 있다.
- 문서가 드는 위험은 두 가지다. 악의적으로 패치된 서버는 클라이언트 사용자가 읽을 수 있는 파일 전부에 접근할 수 있고, 웹 서버가 클라이언트인 환경에서는 사용자가 `LOAD DATA LOCAL` 로 웹 서버 프로세스가 읽을 수 있는 파일을 읽어낼 수 있다.
- 서버와 클라이언트 양쪽이 모두 허용해야 동작한다. 아니면 `ERROR 3950 (42000): Loading local data is disabled; this must be enabled on both the client and server side` 가 난다. 바이너리 배포판의 클라이언트 라이브러리는 `ENABLED_LOCAL_INFILE` 를 끈 상태로 빌드된다.
- 꼭 써야 한다면 `--load-data-local-dir` 로 디렉터리를 한정한다(경로 비교는 대소문자를 구분한다). 신뢰할 수 없는 서버를 피하려면 `--ssl-mode=VERIFY_IDENTITY` 와 CA 인증서를 함께 쓴다.
