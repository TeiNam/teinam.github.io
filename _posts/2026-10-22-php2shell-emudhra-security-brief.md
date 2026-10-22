---
date: 2026-10-22 00:00:00 +0900
title: "PHP2Shell 긴급 패치, 같은 주 인증서 사건에 Python·Node.js·Java·Go도 대응"
category: issue
subcategory: 보안
excerpt: "PHP가 인증 없는 원격 코드 실행 취약점 2건(PHP2Shell)을 예정보다 하루 앞당겨 고쳤습니다. 같은 주 eMudhra 중간 CA 8개의 개인키가 공개키만으로 복원되는 상태였다는 사실이 드러나 Python·Node.js·Go가 릴리스를, OpenJDK가 보안 권고를 냈습니다. 2026년 10월 20~22일 언어 런타임 보안 이슈를 정리합니다."
last_modified_at: 2026-10-22
permalink: /issue/:title/
---

PHP 프로젝트가 10월 21일(UTC) 인증 없이 원격 코드 실행(RCE)으로 이어질 수 있는 취약점 2건을 고친 PHP 8.5.12·8.4.27·8.3.36·8.2.35를 내놨습니다. ‘PHP2Shell’로 불리는 이 취약점은 웹 요청을 처리하는 모든 PHP 설치에 영향을 줍니다. Apache `mod_php`에서는 요청 하나로 애플리케이션 코드가 실행되기도 전에 공격이 시작되는 익스플로잇이 시연됐습니다.[^phpnet-adv] 같은 주에는 인증 기관 eMudhra의 중간 인증서 8개 개인키가 공개키만으로 복원되는 상태였다는 사실이 드러났습니다. 이 일로 Python·Node.js·Go가 보안 릴리스를, OpenJDK가 보안 권고를 잇달아 냈습니다.

이 글은 2026년 10월 20일부터 22일(KST)까지 발표된 언어 런타임과 그 생태계의 보안 이슈를 정리한 것입니다. 시각은 UTC로 적고 필요한 곳에 한국 시간을 함께 적었습니다. 각 벤더 권고는 이후에도 갱신될 수 있습니다.

## PHP2Shell, CVE 번호 유출로 패치 하루 앞당겨

두 취약점은 CVE-2026-109618과 CVE-2026-109619입니다. CVSS(취약점 심각도 점수) v4.0 기준으로 둘 다 9.2점입니다.[^ghsa-618][^ghsa-619]

- **CVE-2026-109618**: 메모리 부족(OOM) 처리가 요청 내부 데이터를 일부만 초기화한 상태에서 PHP를 멈출 수 있습니다. 이때 요청 정리 단계가 그 불완전한 데이터를 정상 데이터로 처리할 수 있습니다.[^phpnet-adv]
- **CVE-2026-109619**: 요청이 쓰던 내부 상태가, 그 상태가 가리키던 메모리가 해제된 뒤에도 남을 수 있습니다. 같은 워커가 처리하는 다음 요청이 초기화 전에 이 상태를 쓸 수 있습니다(use-after-free, 해제된 메모리 재사용).[^phpnet-adv] 이 취약점으로는 원격 코드 실행과 함께 워커 메모리 노출도 가능합니다.[^ghsa-619] 노출된 메모리에는 다른 요청이나 서버의 비밀번호, 인증 토큰, API 키, 인증서가 들어 있을 수 있습니다.[^wiz]

php.net은 PHP-FPM, Apache `mod_php`, `php-cgi`, FrankenPHP, LiteSpeed를 모두 영향 범위로 보고 그중 `mod_php`의 위험이 가장 크다고 밝혔습니다.[^phpnet-adv] PHP-FPM도 109618의 영향을 받을 수 있는 것으로 분류됐지만 완전한 익스플로잇이 시연되지는 않았습니다.[^ghsa-618] Wiz에 따르면 지난 10년 동안 나온 모든 PHP 버전이 두 취약점 가운데 적어도 하나의 영향을 받습니다. 그 범위는 PHP 5.4까지 거슬러 올라갑니다.[^wiz] 지원이 끝난 7.4·8.0·8.1에는 공식 릴리스 대신 최소한의 소스 백포트가 제공됐습니다.[^phpnet-adv]

릴리스는 원래 10월 22일 14:00 UTC로 잡혀 있었습니다. 그런데 20일 15:00 UTC쯤 CVE 번호가 잘못된 릴리스 시각, 잘못된 CVSS 10.0점과 함께 온라인에 퍼졌습니다. PHP 프로젝트는 같은 날 19:30 UTC에 사전 공지를 앞당겨 게시하고 릴리스를 21일 14:00 UTC(KST 21일 23:00)로 하루 당겼습니다. 기술적 세부 내용은 유출되지 않았습니다.[^phpf]

결함의 뿌리는 오래됐습니다. PHP 프로젝트는 2024년에 이미 OOM 처리 문제의 근본 원인을 찾았지만 당시에는 실제 공격 경로를 찾지 못했습니다. 2026년 8월 11일 보안 회사 Calif의 연구자가 같은 근본 원인으로 조건 없는 원격 코드 실행이 가능하다고 보고했고 OpenAI도 같은 날 독립적으로 같은 근본 원인을 보고했습니다. Wiz는 8월 24일 추가 공격 경로를 보고했습니다.[^phpf]

{% include diagram.html src="php2shell-timeline.svg" caption="PHP2Shell의 발견·보고부터 패치 릴리스까지의 경과입니다" %}

## 공개 나흘 전 공격 시도 관측, 장비 내장 PHP도 영향

Amazon 위협 인텔리전스는 공개 4일 전인 10월 17일 자사 허니팟 MadPot에서 PHP2Shell 공격 시도를 관측했다고 밝혔습니다. 이 시도가 실제 시스템에서 성공했을지는 아직 분석 중입니다.[^aws] 미국 사이버보안·인프라보안청(CISA)은 21일 경보 게시 시점에 악용 사례를 관측하지 못했다면서도 즉시 패치를 강하게 권고했습니다. 바로 업데이트할 수 없는 PHP 시스템은 오프라인으로 전환하라고 했습니다.[^cisa] Cloudflare는 21일 03:02 UTC부터 무료·유료 WAF(웹 방화벽) 고객 모두에게 기본 차단 규칙을 적용했습니다.[^cloudflare-php]

PHP는 네트워크 장비의 관리 화면처럼 제품 안에 내장된 경우가 많아 장비 벤더들도 영향 조사에 나섰습니다. Palo Alto Networks는 PAN-OS 12.2·12.1·11.2·11.1·10.2 전 버전과 Panorama 전 버전이 영향을 받는다고 밝혔습니다. 수정판은 아직 나오지 않았고 Threat Prevention 서명과 관리 인터페이스 접근 제한을 완화책으로 제시했습니다.[^panw] 10월 22일 각사 권고 기준으로 Fortinet은 제품 10개를 조사하고 있습니다.[^fortinet] Cisco는 제품 13개와 클라우드 서비스 12개를 조사 중이며 아직 영향이 확인된 제품은 없다고 밝혔습니다.[^cisco-php] 두 회사의 목록은 수시로 바뀌고 있습니다.

국내에서는 과학기술정보통신부가 22일 낮 12시(KST)를 기해 민간 분야 사이버위기 경보를 ‘관심’에서 ‘주의’로 올렸습니다.[^msit][^newsis] 한국인터넷진흥원(KISA)은 같은 날 보호나라에 기업 보안 대응 수칙을 게시했습니다. 인터넷에 공개된 서버부터 조치하고 PHP가 내장된 장비·솔루션과 PHP가 포함된 Windows용 설치 패키지, 외부에서 받아 쓰는 컨테이너 이미지도 따로 확인하라는 내용입니다. 침해 흔적을 발견하면 서버를 끄거나 재시작하지 말고 외부 접속만 차단한 뒤 보호나라로 신고하라고 안내했습니다. 로그·실행 중인 프로그램 목록·네트워크 연결 정보를 보존하고 업데이트와 재시작, 웹셸 제거, 인증 정보 교체로 조치하라고 했습니다.[^kisa]

## 임시 완화책은 취약점마다 다릅니다

PHP 보안 권고는 109618에 대해 패치만이 완전한 완화책이라고 밝혔습니다.[^ghsa-618] php.net이 제시한 임시 완화책은 두 취약점이 서로 다릅니다.[^phpnet-adv][^ghsa-619]

| 대상 | 임시 완화책 |
| --- | --- |
| CVE-2026-109619 | `session.upload_progress.enabled=0`으로 바꾸고 모든 워커를 재시작합니다. PHP 8.5의 `fatal_error_backtraces=0`, PHP-FPM의 `pm.max_requests=1`도 추가 완화책입니다. |
| CVE-2026-109618 | `memory_limit=-1`로 PHP 자체 메모리 한도를 없애고 상한은 cgroup으로 겁니다(`RLIMIT_AS`·`RLIMIT_DATA`는 쓰지 않습니다). `php_admin_value`처럼 애플리케이션이 덮어쓰지 못하는 방식으로 설정합니다. `post_max_size`를 업로드가 없으면 8M, 있으면 32M 정도로 낮추고 프록시에서 요청 크기를 제한합니다. |

`session.upload_progress.enabled=0` 하나만으로는 109618을 막지 못합니다. 일부 배포판과 LTS 벤더는 수정 사항을 자기 버전에 백포트해 제공합니다.[^phpnet-adv] 그래서 패키지로 설치한 PHP는 버전 번호만 보지 말고 배포판 보안 공지로 수정 여부를 확인하는 편이 정확합니다. 터미널의 `php -v`는 CLI용 PHP의 버전이라 웹 서버가 쓰는 PHP-FPM이나 `mod_php`와 다를 수 있다는 점도 주의해야 합니다.

Searchlight Cyber(Assetnote)는 호스트가 두 취약점에 노출됐는지 확인하는 오픈소스 도구 `php2shell-scanner`를 공개했습니다. 이 도구는 대상 서버에 실제로 OOM 상황을 일으켜 확인하는 방식이라 그 자체로 위험이 따른다는 지적이 나왔습니다.[^scanner-news] 저장소에는 `memory_limit`가 낮은 환경에서 패치된 버전도 취약하다고 잘못 판정할 수 있다는 경고가 적혀 있습니다.[^scanner]

## eMudhra 중간 CA 키 8개, 공개키로 복원 가능

인증 기관 eMudhra가 운영하는 중간 CA(인증서에 서명하는 하위 인증 기관) 인증서 8개의 개인키가 노출됐습니다. 이 개인키들은 처음부터 잘못 생성돼 있어서 누구나 공개된 인증서만으로 개인키를 복원할 수 있었습니다.[^emudhra-page] 8개 모두 타원곡선 개인키 값 `d`가 256보다 작았습니다.[^psf] 정상적인 키라면 `d`는 수십 자리에 이르는 큰 수 가운데 무작위로 골라야 합니다. 반면 256보다 작으면 1부터 255까지 차례로 대입해 보는 것만으로 키를 찾을 수 있습니다.

키를 가진 공격자는 아무 도메인의 인증서든 위조해 서버를 사칭하고 통신을 가로채거나 바꿀 수 있습니다.[^cloudflare-emudhra] Python 소프트웨어 재단(PSF)은 `python.org`와 `pypi.org`에 대한 중간자 공격도 가능하다고 안내했습니다.[^psf]

키 문제는 10월 17일 브라우저 루트 프로그램에 보고됐습니다. Firefox와 Chrome은 같은 날 해당 중간 CA를 차단했고 Apple은 19일, Microsoft는 20일에 뒤따랐습니다.[^emudhra-page] Chrome 루트 프로그램에 따르면 8개 중 TLS 서버 인증서를 발급하는 6개 CA에 연결된 인증서는 17일 차단 전까지 CT(인증서 투명성) 로그에 기록된 적이 없습니다. 따라서 이 CA들이 발급한 위조 인증서는 Chrome이나 CT를 강제하는 브라우저에서 기본 설정으로 신뢰될 수 없었습니다. 나머지 2개는 코드 서명용 CA입니다. Chrome은 이 중간 CA들에 서명한 eMudhra 루트 인증서를 Chrome Root Store 버전 43에서 제거할 예정입니다.[^chrome]

## 언어마다 대응이 달랐던 이유

브라우저는 빨리 막았지만 브라우저가 아닌 TLS 클라이언트 프로그램은 저마다 다른 신뢰 저장소(믿기로 한 인증서 목록)를 씁니다. 그래서 언어마다 고쳐야 할 곳이 달랐습니다.

{% include diagram.html src="emudhra-trust-stores.svg" caption="클라이언트마다 신뢰 저장소가 달라 고친 곳도 다릅니다" %}

- **Python**: pip는 운영체제 인증서 목록에 더해 자기가 내장한 `certifi`의 목록을 항상 함께 읽고 이를 끄는 공식 방법이 없습니다. PSF 공지 스레드에서 Christian Heimes는 pip 업데이트만이 확실한 해결책이라고 설명했습니다. PSF가 안내한 최소 버전은 `certifi` 2026.10.19, `pip` 26.2.2, `uv` 0.13.4, `sigstore` 4.5.1, `pixi` 0.82.1입니다.[^psf] 21일에는 함께 설치되는 pip를 26.2.2(certifi 2026.10.19 포함)로 올린 Python 3.15.1·3.14.9·3.13.17이 앞당겨 나왔습니다.[^cpython]
- **Node.js**: 21일 보안 릴리스 22.23.4·24.22.1·26.12.1에 eMudhra 사건에 맞춘 내장 CA 인증서 목록 갱신이 들어갔습니다.[^node]
- **Java**: OpenJDK 권고는 이 사건을 CVE-2026-91403(CVSS 9.1)으로 다룹니다. 영향 버전은 27.0.1, 25.0.5, 21.0.13, 17.0.21, 11.0.33, 8u512와 그 이전입니다. Arch Linux, Debian, Devuan, Fedora, Gentoo, Oracle Linux, RHEL, Ubuntu의 OpenJDK 패키지는 운영체제 인증서를 쓰므로 운영체제 인증서 갱신으로 충분합니다. FreeBSD·Homebrew 패키지는 직접 업데이트해야 합니다. 독립형 런타임은 가능한 한 빨리 업데이트하라고 권고했습니다.[^openjdk] 권고에 수정 버전 번호는 없어서 배포처의 수정 빌드를 확인해야 합니다.
- **Go**: CVE-2026-111943(GO-2026-6809)으로 `crypto/x509`에 신뢰할 수 없게 된 중간 인증서 차단 목록이 추가됐습니다. 수정 버전은 Go 1.26.10과 1.27.3입니다.[^go] 차단 목록이 표준 라이브러리 코드에 들어 있으므로 이미 배포한 Go 프로그램은 새 툴체인으로 다시 빌드해야 적용됩니다.

## Node.js 취약점 10개, pypdf 2건도

Node.js 21일 보안 릴리스는 eMudhra 대응 외에 자체 취약점 10개(HIGH 4, MEDIUM 3, LOW 3)를 고쳤습니다.[^node] HIGH 4개는 다음과 같습니다.

- CVE-2026-111497: Brotli 디코더의 범위 밖 쓰기로 원격 코드 실행
- CVE-2026-105482: `dns.resolve`가 NUL 문자가 든 이름을 잘라 처리
- CVE-2026-105483: IP를 전각 숫자로 쓰면 TLS 인증서 호스트명 검사를 우회(26·24 라인)
- CVE-2026-106069: 호스트가 느슨하게 IP로 해석될 때 TLS 인증서 호스트명 검사를 우회

MEDIUM 가운데 CVE-2026-106074는 `crypto.randomUUID()`와 `randomInt()`의 엔트로피 캐시가 사용자가 만든 시작 스냅샷(user-land startup snapshot)과 단일 실행 파일(SEA)에 저장되는 문제입니다. 이 때문에 그 스냅샷이나 SEA로 시작한 프로세스가 모두 같은 값을 반복합니다.[^node]

PDF를 다루는 Python 라이브러리 pypdf에서도 서비스 거부(DoS) 취약점 2건이 21일 CVE로 게시됐습니다. CVE-2026-113789는 조작된 PDF의 폼 필드를 가져올 때 메모리를 과하게 쓰거나 실행이 오래 걸리는 문제로 6.21.0에서 고쳐졌습니다.[^pypdf-1] CVE-2026-113792는 순환 구조의 개요(outline)가 든 PDF에서 `PdfWriter.find_outline_item`이 무한 루프에 빠지는 문제로 6.20.1에서 고쳐졌습니다.[^pypdf-2] 6.21.0으로 올리면 두 건이 모두 해결됩니다.

## 같은 주의 다른 패치

- **Oracle**: 20일 정기 패치(CPU)로 33개 제품군에 보안 업데이트 1,295건을 냈습니다. 고유 CVE는 1,209개이고 Java SE 관련은 55건입니다.[^oracle]
- **Cisco Expressway**: 21일 CVE-2026-76466(CVSS 9.8)을 고쳤습니다. 인증 없는 원격 공격자가 root 권한으로 OS 명령을 실행할 수 있는 취약점입니다. 수정 버전은 X15.5.20이고 우회책은 없습니다. PHP2Shell과는 별개입니다.[^cisco-exp]
- **nginx**: 14일 나온 1.30.6·1.31.7이 고친 취약점 가운데 F5가 CVSS v4.0 9.2점을 매긴 CVE-2026-15176·97205·93479에 대해, 싱가포르 사이버보안청(CSA)이 21일 경보를 냈습니다.[^nginx][^csa]

## 지금 확인할 것

| 해당 환경 | 조치 |
| --- | --- |
| 인터넷에 노출된 PHP, 특히 `mod_php` | 8.5.12·8.4.27·8.3.36·8.2.35로 즉시 패치. 불가하면 두 CVE의 완화책을 모두 적용하거나 오프라인 전환 |
| PHP가 내장된 장비·패키지·컨테이너 이미지 | 목록을 만들고 벤더 권고 추적 |
| 침해 흔적 | 끄지 말고 외부 접속만 차단, 보호나라 신고, API 키·토큰 교체 |
| pip를 쓰는 서버·이미지·파이프라인 | pip 26.2.2·certifi 2026.10.19 이상, 이미지 재빌드 |
| Node.js | 22.23.4·24.22.1·26.12.1 |
| 독립형 JDK, FreeBSD·Homebrew OpenJDK | 배포처 수정 빌드로 업데이트 |
| Go로 빌드한 프로그램 | Go 1.26.10·1.27.3으로 다시 빌드 |
| 외부 PDF를 pypdf로 처리 | pypdf 6.21.0 이상 |

## 생각: 도구는 양쪽 손에 함께 쥐어집니다

여기서부터는 이번 주 사건을 보며 든 개인적인 생각입니다.

2024년에 원인을 찾고도 공격 경로를 찾지 못해 묻혀 있던 결함이 2년 뒤 원격 코드 실행으로 이어졌습니다.[^phpf] 그 과정에는 AI가 깊이 들어와 있었습니다. Wiz는 프론티어 AI 모델이 오래된 결함을 익스플로잇으로 바꾸는 장벽을 크게 낮췄다고 썼습니다. 예전 같으면 세계적인 수준의 팀이 몇 달 걸렸을 작업을 연구자 한 명이 일주일 만에 끝냈다고도 했습니다.[^wiz] 같은 주 Node.js의 원격 코드 실행 취약점(CVE-2026-111497)도 OpenAI Codex Security 팀 명의로 보고됐습니다.[^node]

이번에 AI를 썼다고 밝혀진 쪽은 결함을 찾아 고친 쪽이었습니다. 10월 17일 관측된 공격 시도에 AI가 쓰였는지는 알려지지 않았습니다. 마음에 걸리는 건 같은 능력이 공격하는 쪽에도 그대로 주어진다는 점입니다. Amazon은 AI를 활용한 분석 덕분에 패치 diff나 보안 권고를 실제로 동작하는 익스플로잇으로 바꾸는 비용이 싸졌다고 썼습니다.[^aws] 패치가 공개되는 순간부터 공격자도 같은 diff를 읽습니다. 그 diff를 무기로 바꾸는 시간은 점점 짧아질 것입니다.

사람은 쓸모 있는 도구를 손에 넣으면 그것으로 무언가를 만들어 왔습니다. 그리고 그 도구로 남을 해치는 사람도 언제나 함께 나왔습니다. AI도 다르지 않다고 봅니다. 결함을 찾아 고치게 해 주는 모델은 같은 결함을 찾아 공격하게도 해 줍니다. 다른 점은 속도와 규모입니다. 숙련된 소수만 할 수 있던 일을 더 많은 사람이 더 빨리 할 수 있게 된 것으로 보입니다.

물론 이번 주 사건이 모두 AI와 관련된 것은 아닙니다. 같은 주의 eMudhra 사건은 인증 기관이 키를 잘못 생성한 데서 비롯됐고 이를 루트 프로그램에 알린 것은 한 개인 보고자였습니다.[^emudhra-page] 그래도 운영하는 입장에서 분명해진 것이 있습니다. “다음 정기 점검 때 올리자”는 패치 일정은 점점 위험해집니다. 그리고 장비에 내장된 PHP, 이미지에 구워진 pip, 오래전에 빌드한 Go 바이너리처럼 목록에 없는 것은 패치할 수도 없습니다. PHP Foundation은 올해 초 Alpha-Omega와 함께 Anthropic의 Claude Mythos로 PHP를 스캔했고 이후 보고와 익스플로잇 검증에 OpenAI의 Daybreak Red 같은 도구를 더했다고 밝혔습니다.[^phpf] 공격자가 빨라진 만큼 방어하는 쪽도 같은 도구를 손에 쥐고 목록 관리와 빠른 패치라는 기본기를 더 단단히 해야 합니다.

## 참고 자료

[^phpnet-adv]: [PHP — Security advisory: Critical remote code execution vulnerabilities, update now](https://www.php.net/archive/2026.php#2026-10-21-5). 수정 버전, 두 취약점의 원인, 영향 SAPI와 `mod_php` 위험도, EOL 버전 소스 백포트, 배포판 백포트, 취약점별 완화책.
[^ghsa-618]: [GHSA-w8hw-w9fx-j79w — RCE via OOM corruption (CVE-2026-109618)](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w). OOM 처리 결함의 상세, CVSS 벡터, PHP-FPM 영향 판단, 패치만이 완전한 완화라는 설명.
[^ghsa-619]: [GHSA-6wmf-4rv5-p3rp — RCE via stale global state (CVE-2026-109619)](https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp). use-after-free·메모리 노출·원격 코드 실행, 추가 완화 설정.
[^phpf]: [The PHP Foundation — Today's PHP Security Release, and How We're Strengthening PHP Security](https://thephp.foundation/blog/2026/10/21/todays-php-security-release-and-how-were-strengthening-php-security/). 2026-10-21. 2024년의 근본 원인 발견, Calif·OpenAI·Wiz의 보고 경위, CVE 번호 유출과 릴리스 시각 변경, 보안 작업에 쓰는 AI 도구.
[^wiz]: [Wiz Research — PHP2Shell: AI uncovers critical RCE vulnerabilities affecting 70% of the Internet](https://www.wiz.io/blog/php2shell-php-rce). 2026-10-21. 영향 버전 범위(PHP 5.4 이후), 워커 메모리 노출로 드러날 수 있는 비밀값, 익스플로잇 개발에 쓴 AI 모델.
[^aws]: [Amazon Threat Intelligence identifies PHP2Shell exploitation prior to public disclosure in MadPot](https://aws.amazon.com/blogs/security/amazon-threat-intelligence-identifies-php2shell-exploitation-prior-to-public-disclosure-in-madpot/). 2026-10-21. 10월 17일의 공격 시도 관측, 성공 여부 분석 중, AI가 익스플로잇 제작 비용에 주는 영향.
[^cisa]: [CISA — Critical Vulnerabilities in PHP Require Immediate Patching](https://www.cisa.gov/news-events/alerts/2026/10/21/critical-vulnerabilities-php-require-immediate-patching). 2026-10-21. 즉시 패치 권고, 업데이트 불가 시 오프라인 전환, 게시 시점 악용 미관측.
[^cloudflare-php]: [Cloudflare — Cloudflare deploys protections against php2shell vulnerability](https://blog.cloudflare.com/php-vulnerabilities-waf-protection/). 2026-10-21. 무료·유료 WAF 기본 차단 시작 시각.
[^kisa]: [KISA 보호나라 — PHP 보안취약점(PHP2Shell) 관련 기업 보안 대응 수칙](https://www.boho.or.kr/kr/bbs/view.do?bbsId=B0000133&pageIndex=1&nttId=72230&menuNo=205020). 2026-10-22. 점검 대상, 우선순위, 침해 시 격리·신고·증거 확보·조치 순서.
[^panw]: [Palo Alto Networks — Impact of Critical Vulnerabilities in PHP (CVE-2026-109618, CVE-2026-109619) on Palo Alto Networks Products](https://security.paloaltonetworks.com/CVE-2026-109618). 2026-10-21. PAN-OS·Panorama 영향 버전, 수정 예정, 완화책.
[^fortinet]: [FortiGuard PSIRT — PHP core RCE vulnerability patches (CVE-2026-109618 and CVE-2026-109619)](https://fortiguard.fortinet.com/psirt/FG-IR-26-186). Fortinet 제품의 영향 조사 현황.
[^cisco-php]: [Cisco — Vulnerabilities in PHP Affecting Cisco Products: October 2026](https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-php-october26-Jj384Daq). 조사 중인 제품·클라우드 서비스, 영향 확인 제품 없음.
[^scanner-news]: [Help Net Security — New PHP2Shell scanner checks your hosts for CVE-2026-109618 and CVE-2026-109619](https://www.helpnetsecurity.com/2026/10/22/php2shell-scanner-tool/). 2026-10-22. Searchlight Cyber의 점검 도구 공개와 OOM 유발 방식의 위험.
[^scanner]: [assetnote/php2shell-scanner](https://github.com/assetnote/php2shell-scanner). 점검 도구 저장소. 낮은 `memory_limit` 환경의 오탐 경고.
[^emudhra-page]: [eMudhra Intermediate CA Compromise](https://emudhra.we-have-a-problem.com/). 2026-10-20. 중간 CA 8개 개인키 노출, 잘못된 키 생성, 보고와 브라우저별 차단 일자.
[^chrome]: [Chrome Root Program — Compromised eMudhra Intermediate Certificates (mozilla.dev-security-policy)](https://groups.google.com/a/mozilla.org/g/dev-security-policy/c/0R3XLJL6FuE). 2026-10-20. TLS용 중간 CA 6개와 코드 서명용 2개, CT 로그 기록 없음, Chrome Root Store 버전 43의 루트 제거 예정.
[^cloudflare-emudhra]: [Cloudflare — 8 eMudhra certificates are compromised. Here's what you need to know](https://blog.cloudflare.com/emudhra-certificate-compromise). 2026-10-20. 위조 인증서로 가능한 서버 사칭과 통신 가로채기.
[^psf]: [Python Discourse — Information for Python users regarding eMudhra / emSign CA certificate security incident](https://discuss.python.org/t/information-for-python-users-regarding-emudhra-emsign-ca-certificate-security-incident/109576). 2026-10-20. 패키지별 최소 버전. pip의 내장 `certifi` 동작과 중간 CA 개인키 `d < 256`은 같은 스레드의 Christian Heimes 답글.
[^cpython]: [Python 3.15.1, 3.14.9 and 3.13.17 are out](https://discuss.python.org/t/python-3-15-1-3-14-9-and-3-13-17-are-out/109595). 2026-10-21. 내장 pip를 26.2.2로 올린 보안 릴리스.
[^node]: [Node.js — Wednesday, October 21, 2026 Security Releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). 2026-10-21. 수정 버전, 취약점 10개의 심각도·영향 라인, 의존성 갱신, 보고자.
[^openjdk]: [OpenJDK Vulnerability Advisory: 2026/10/21](https://openjdk.org/groups/vulnerability/advisories/2026-10-21). 2026-10-21. CVE-2026-91403, 영향 버전, 운영체제 제공 패키지별 대응.
[^go]: [Go Vulnerability Database — Vulnerability Report: GO-2026-6809](https://pkg.go.dev/vuln/GO-2026-6809). 2026-10-21. CVE-2026-111943, `crypto/x509` 차단 목록, 수정 버전 1.26.10·1.27.3.
[^pypdf-1]: [GHSA-6vvc-x485-93v7 — pypdf](https://github.com/py-pdf/pypdf/security/advisories/GHSA-6vvc-x485-93v7). CVE-2026-113789(CVE 게시 2026-10-21). 폼 필드 추출 시 과도한 자원 사용, 수정 버전 6.21.0.
[^pypdf-2]: [GHSA-qfv9-64jg-mh7p — pypdf](https://github.com/py-pdf/pypdf/security/advisories/GHSA-qfv9-64jg-mh7p). CVE-2026-113792(CVE 게시 2026-10-21). 순환 outline의 무한 루프, 수정 버전 6.20.1.
[^oracle]: [Tenable — Oracle October 2026 Critical Patch Update Addresses 1209 CVEs](https://www.tenable.com/blog/oracle-october-2026-critical-patch-update-addresses-1209-cves). 2026-10-20. 보안 업데이트 수, 고유 CVE 수, Java SE 건수.
[^msit]: [정책브리핑 — 과기정통부, 웹사이트 개발 언어 'PHP' 보안 취약점 관련 긴급 보안 업데이트 및 기술적 조치 당부](https://www.korea.kr/briefing/pressReleaseView.do?newsId=156786135). 2026-10-22. 과학기술정보통신부 보도자료. 민간 분야 사이버위기 경보 ‘관심’→‘주의’ 상향.
[^newsis]: [뉴시스 — 과기정통부, 'PHP 취약점' 비상대응 체계 가동…"보안 업데이트 시급"](https://www.newsis.com/view/NISX20261022_0003836737). 2026-10-22. 경보 상향 시각(낮 12시).
[^cisco-exp]: [Cisco 보안 권고 — Cisco Expressway Series Remote Code Execution Vulnerability](https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-vcs-static-cred-hr7EWZ8t). 2026-10-21 16:00 GMT. CVE-2026-76466, 수정 버전 X15.5.20.
[^nginx]: [nginx security advisories](https://nginx.org/en/security_advisories.html). nginx 1.30.6 stable·1.31.7 mainline(2026-10-14)에서 고친 취약점 목록.
[^csa]: [CSA Singapore — Critical Vulnerabilities in F5 NGINX Products (AL-2026-150)](https://www.csa.gov.sg/alerts-and-advisories/alerts/al-2026-150). 2026-10-21. nginx 취약점 3건의 영향 제품과 버전.
