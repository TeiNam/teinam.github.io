---
layout: page
title: About
permalink: /about/
subtitle: 데이터베이스 신뢰성과 데이터 모델링을 다룹니다.
description: DBRE 를 지향하는 teinam(RastaLion) 의 소개. 시스템·네트워크에서 데이터베이스로 옮겨 온 경로, 일하는 방식, 이 블로그를 읽을 때의 전제.
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

데이터 모델링이 주 업무입니다. 스키마를 그리기 전에 그 서비스의 비즈니스 로직을 이해하는 일이 먼저라고 보고, 데이터 보호와 데이터 품질을 같은 무게로 다룹니다.

거쳐 온 회사와 직무, 만든 것들은 [Work]({{ '/work/' | relative_url }}) 에 정리해 두었습니다.

## 지나온 길

시스템 엔지니어로 시작했습니다. 네트워크를 공부하며 CCNA·CCNP·CCDP 를 취득하고 CCIE 를 준비했고, OpenStack 으로 사설 클라우드를 다뤘습니다.

그 뒤 데이터베이스로 옮겨 Oracle, MySQL, PostgreSQL, MongoDB 를 차례로 맡았습니다. 지금은 그 경험을 클라우드 위에서 다시 쓰고 있습니다. 관심은 데이터 분석과 Kafka 기반 데이터 처리 쪽으로 이어져 있습니다.

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

맡은 범위에만 머무르지 않습니다. 데이터베이스는 어느 팀이든 쓰는 것이라, 알고 있는 것을 팀 밖으로 꺼내 놓는 편이 전체에 이득이라고 봅니다. 이 블로그도 그 연장입니다.

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

