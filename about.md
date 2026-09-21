---
layout: page
title: About
permalink: /about/
subtitle: AWS ProServe 에서 Database Architect 로 일합니다. 데이터베이스 신뢰성과 데이터 모델링을 다룹니다.
description: AWS ProServe 의 Database Architect teinam(RastaLion) 의 소개. Oracle·오픈소스·클라우드를 거친 경로, 다뤄 온 일, 보유 자격, 일하는 방식.
# jekyll-seo-tag 의 homepage_or_about? 는 about 을 홈과 같이 묶어 WebSite 로 찍는다.
# 그러면 WebSite 엔터티가 두 URL 에 생겨 어느 쪽이 사이트인지 흐려진다.
seo:
  type: AboutPage
---
{%- comment %} URL 을 Liquid 변수로 먼저 조립한다. 마크다운 본문에 도메인과 Liquid 여는
   괄호가 붙어 있으면 마크다운 포매터가 그것을 벌거벗은 URL 로 보고 자동 링크로 감싸
   버려 Liquid 가 깨진다 — 실제로 한 번 깨졌다. 주석 안에도 여는 괄호를 쓰면 안 된다.
{% endcomment -%}
{%- capture mail_url %}mailto:{{ site.email }}{% endcapture -%}
{%- capture gh_url %}https://github.com/{{ site.social.github }}{% endcapture -%}
{%- capture li_url %}https://www.linkedin.com/in/{{ site.social.linkedin }}{% endcapture -%}
{%- assign rss_url = '/feed.xml' | relative_url -%}

RastaLion 이라는 닉네임을 씁니다.

DBA 로 시작했지만 지향하는 쪽은 DBRE(Database Reliability Engineer, 데이터베이스 신뢰성 엔지니어)입니다. 두 이름을 가르는 것은 다루는 제품이 아니라 책임의 범위라고 봅니다. 쿼리와 파라미터를 보는 일에서 멈추지 않고, 데이터가 서비스 안에서 어떻게 흐르고 어디서 깨지는지까지 따라가는 쪽입니다.

## 지금 하는 일

AWS ProServe 에서 Database Architect 로 일합니다(2025년 7월~). 데이터베이스 모더나이제이션과 마이그레이션 프로젝트를 맡고, CDC 를 포함한 데이터베이스 과제를 다룹니다.

스키마를 그리기 전에 그 서비스의 비즈니스 로직을 이해하는 일이 먼저라고 보고, 데이터 보호와 데이터 품질을 같은 무게로 다룹니다.

## 지나온 길

시스템 엔지니어로 시작했습니다. 네트워크를 공부하며 CCNA·CCNP·CCDP 를 취득하고 CCIE 를 준비했고, 그 뒤 Oracle DB 엔지니어로 데이터베이스 업무를 시작했습니다. Exadata 와 ZDLRA 를 다루던 시기입니다.

2018년, 오라클 엔지니어 생활을 거쳐 오픈소스 데이터베이스를 해야겠다고 판단했습니다. MariaDB·MySQL·PostgreSQL·MongoDB·Redis 를 차례로 맡았고, 같은 시기에 OpenStack 으로 사설 클라우드를 다뤘습니다. 그것이 계기가 되어 OCI 와 AWS 를 본격적으로 쓰기 시작했습니다.

그 뒤로는 Aurora MySQL 과 MongoDB 가 주 무대였고, GraphDB 도 함께 다뤘습니다.

거쳐 온 회사와 만든 것들은 [Work]({{ '/work/' | relative_url }}) 에 정리해 두었습니다.

## 다뤄 온 일

- **운영과 신뢰성** — 성능 모니터링, 백업·복구, 버전 관리
- **데이터 모델링** — 기존 로직을 리버스 엔지니어링해 개선 모델을 잡는 일부터, 신규 플랫폼의 장기 모델 설계까지
- **데이터 플랫폼** — CDC, ETL/ELT 파이프라인, DW, 데이터 레이크 설계와 구축
- **감사와 정책** — Lead DBA 로 IPO·ISMS 감사를 대응했고, DB 운영·보안 정책과 데이터 품질 표준·검증 규칙을 세웠습니다
- **비용** — FinOps 관점에서 지속 가능한 DB 사용 비용 관리
- **도구** — Python·Rust 로 자동화·연동 도구를 직접 만들어 씁니다

관심은 데이터 분석과 Kafka 기반 데이터 처리로 이어지고, AI·ML·Vector DB 를 데이터베이스에 접목하는 쪽을 보고 있습니다.

## 자격

<ul class="badges">
{%- for b in site.data.badges %}
  <li>
    <a href="{{ b.url }}" rel="noopener">
      <img src="{{ b.image | relative_url }}" alt="{{ b.name }}" width="96" height="96" loading="lazy">
      <span class="b-name">{{ b.name }}</span>
      <span class="b-meta">{{ b.issued }}{% if b.expires %} → {{ b.expires }}{% else %} · 만료 없음{% endif %}</span>
    </a>
  </li>
{%- endfor %}
</ul>

유효한 것만 싣습니다. 각 배지는 [Credly](https://www.credly.com/users/rastalion/badges) 검증 페이지로 연결됩니다.

## 일하는 방식

사람과 협업을 존중합니다. 직급으로 일을 밀어붙이는 방식은 쓰지 않습니다. 다만 잘못된 관행에는 단호하게 반응합니다 — 오래됐다는 것은 근거가 아닙니다.

판단은 문서로 남깁니다. 명확한 커뮤니케이션과 구조화된 문서가 결정을 빠르게 만든다고 보고, 그렇게 일해 왔습니다.

맡은 범위에만 머무르지 않습니다. 데이터베이스는 어느 팀이든 쓰는 것이라, 알고 있는 것을 팀 밖으로 꺼내 놓는 편이 전체에 이득이라고 봅니다. 운영과 고객 지원을 개선하는 전사 과제를 이끈 것도 같은 이유였습니다. 이 블로그도 그 연장입니다.

## 여기서 다루는 것

- **데이터베이스** — 릴리스 노트, 엔진 내부 동작, 운영에서 실제로 부딪힌 것들
- **데이터 엔지니어링** — 수집부터 적재까지, 파이프라인을 굴러가게 만드는 설계와 트레이드오프
- **AI / 머신러닝** — 모델을 서비스에 붙일 때 데이터 쪽에서 생기는 문제와 해법

## 커뮤니티

- **Opensource Database** — 카카오톡 오픈채팅을 운영합니다.
- **Open Infra Engineer Group** — 운영진으로 참여합니다. [invite.o3g.org](https://invite.o3g.org/)

## 이 블로그를 읽을 때

- 관심 있는 분야를 공부하고 정리하려고 쓰는 곳입니다.
- 글에 적은 설정값과 예제는 절대적인 값이 아닙니다. 버전과 환경이 다르면 결과도 달라지므로, 각자의 환경에서 확인한 뒤 적용해야 합니다.
- 운영 환경에 그대로 적용해서 생긴 문제는 책임지지 않습니다. 버전과 환경을 먼저 확인해 주세요.
- 도서와 인터넷 자료를 참고해 쓴 글이 있습니다. 저작권에 걸리는 부분이 있으면 메일로 알려 주시면 바로 조치하겠습니다.

## 연락

- 메일 — [{{ site.email }}]({{ mail_url }})
- GitHub — [@{{ site.social.github }}]({{ gh_url }})
- LinkedIn — [{{ site.social.linkedin }}]({{ li_url }})
- 새 글 알림 — [RSS]({{ rss_url }})
