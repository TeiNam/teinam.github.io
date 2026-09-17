---
date: 2019-11-15 04:08:19 +0900
title: "Character Set and Collation"
category: mysql
excerpt: "Character Set DB에서 Character Set이란, 데이터베이스에서 사용하는 문자와 encording 집합입니다. DB를 생성 할때 흔히 지정해주는 문자셋으로 UTF-8, euckr 같은 것들이 있으며, 각 문자가 컴퓨터에 저장될 때 어떠한 코드로 저장될지에 대한 규칙…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 문자셋과 콜레이션 개념 설명은 유효하지만 기본값 서술이 낡았습니다. MariaDB 는 11.6 부터 기본 문자셋이 utf8mb4, 기본 콜레이션이 utf8mb4_uca1400_ai_ci 로 바뀌었고(그 이전은 latin1/latin1_swedish_ci), MySQL 에서 utf8mb3 와 그 별칭 utf8 은 deprecated 상태입니다.

![](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

## Character Set

DB에서 Character Set이란, 데이터베이스에서 사용하는 문자와 encoding 집합입니다. DB를 생성할 때 흔히 지정해주는 문자셋으로 UTF-8, euckr 같은 것들이 있으며, 각 문자가 컴퓨터에 저장될 때 어떠한 코드로 저장될지에 대한 규칙의 집합을 의미합니다.

Character Set 내용은 Oracle을 기준으로 정리해둔것이 있으니 참고하시기 바랍니다.(<https://rastalion.dev/archives/361>)

latin1(2byte), utf8(가변3byte), utf8mb4(가변4byte)는 저장공간의 크기입니다.

MariaDB에서 기본 문자 집합은 latin1이고 기본 데이터 정렬(collation)은 latin1\_swedish\_ci입니다 (그러나 일부 배포판에서는 다를 수 있습니다). 지원되는 문자 세트 및 데이터 정렬에서 MariaDB가 지원하는 전체 문자 세트 및 데이터 정렬 목록을 보거나 SHOW CHARACTER SET 및 SHOW COLLATION 명령을 사용하여 서버에서 지원되는 문자를 확인할 수 있습니다.

UTF-8은 처음에 가변 4byte로 설계되었습니다. 그러나 전세계 모든 언어문자를 다 카운트 했을때 3byte가 안된다는 사실을 알게 되었고, MySQL, MariaDB에서는 공간절약+속도향상을 위해서 UTF-8을 가변3byte로 설계하였습니다.

현재는 Emoji 같은 새로운 문자가 나오면서 UTF-8의 남은 영역을 사용하기 위해 MySQL, MariaDB에서 가변4byte 자료형인 utf8mb4를 추가하였습니다(2010년 3월). 기존 utf8 시스템을 utf8mb4로 바꾸어도 값의 손실은 없습니다. Emoji 문자열의 저장을 지원하지 않으려면 굳이 utf8mb4를 사용하지 않아도 됩니다. 이 경우 데이터베이스에 텍스트 값 저장 전에 필터링을 하기 바랍니다.

## Collation

특정 문자 집합을 비교하고 정렬하는 규칙입니다. character set 안에서 character들을 비교하기 위한 rule 정의이기도 하며, 텍스트 데이터를 정렬(ORDER BY)할 때 사용합니다. 즉 text 계열 자료형에서만 사용할 수 있는 속성입니다.

예를 들어, 문자 집합의 하위 집합은 문자 A, B 및 C로 구성될 수 있습니다. 기본 데이터 정렬은 A, B, C의 오름차순으로 나타나는 것으로 정의할 수 있습니다. 다른 문자를 고려하면 더 복잡해집니다.

Binary collation은 대문자 A와 소문자 a를 다르게 평가하여 특정 방식으로 정렬합니다. case-insensitive collation은 대소문자를 구분하지 않기 때문에 대문자 A와 소문자 a가 동등하게 평가합니다. 또한, 독일 전화번호부 데이터 정렬은 ue와 ü의 문자를 동등하게 평가합니다.

문자 집합에는 이와 관련된 여러 데이터 정렬이 있을 수 있지만 각 데이터 정렬은 하나의 문자 집합에만 연결됩니다. MariaDB에서 문자 집합 이름은 항상 데이터 정렬 이름의 일부입니다.

예를 들어 latin1\_german1\_ci 데이터 정렬은 latin1 문자 집합에만 적용됩니다.

각 문자 집합에는 하나의 기본 데이터 정렬이 있습니다. latin1 기본 데이터 정렬은 latin1\_swedish\_ci입니다.

예를 들어, 기본적으로 문자 y는 x와 z 사이에 있으며 리투아니아에서는 i와 k 사이에 정렬되어 있습니다. 마찬가지로 독일어 전화 번호부 순서는 독일어 사전 순서와 다르므로 동일한 문자 집합을 공유하지만 데이터 정렬이 다릅니다.
