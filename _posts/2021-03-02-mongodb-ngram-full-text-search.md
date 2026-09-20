---
date: 2021-03-02 10:18:01 +0900
title: "MongoDB에서 n-gram Full text Search 이용하기"
category: mongodb
excerpt: "MongoDB Community Edition의 text 인덱스는 한국어를 지원하지 않습니다. Percona Server for MongoDB는 n-gram 기반 전문 검색을 추가 기능으로 제공하여 한국어 검색을 지원합니다."
last_modified_at: 2026-09-20
---

## MongoDB의 한국어 전문 검색 문제

MongoDB Community Edition의 `text` 인덱스는 한국어를 지원하지 않습니다. MongoDB 8.0 기준으로 `text` 인덱스가 지원하는 언어는 15개 유럽 언어(영어, 프랑스어, 독일어, 스페인어 등)뿐이며, 한국어·일본어·중국어 같은 CJK 언어는 포함되지 않습니다.

`text` 인덱스는 단어 단위 토큰화와 스테밍을 기반으로 동작하는데, 한국어는 조사가 붙는 교착어 특성상 이 방식으로 정확한 검색이 어렵습니다. 예를 들어 "서울"을 검색할 때 "서울은", "서울이", "서울에서" 같은 변형을 모두 찾아야 하는데, `text` 인덱스는 이를 처리할 수 없습니다.

## Percona Server for MongoDB의 n-gram 지원

Percona Server for MongoDB는 MongoDB Community Edition의 드롭인 대체품으로, 엔터프라이즈 기능을 추가로 제공합니다. 그중 하나가 n-gram 기반 전문 검색입니다. Percona 3.4 버전부터 n-gram이 정식 기능으로 포함되었고, 2026년 9월 현재 Percona Server for MongoDB 8.0에도 유지되고 있습니다.

## n-gram이란?

n-gram은 텍스트를 고정 길이 n개의 문자 단위로 분할하는 토큰화 방식입니다. 예를 들어 "서울시"를 bigram(n=2)으로 분할하면 "서울", "울시"가 됩니다. 이 방식은 언어의 형태소 구조를 몰라도 부분 문자열 매칭이 가능하므로 한국어·일본어·중국어처럼 띄어쓰기가 불분명하거나 형태 변화가 복잡한 언어에서 효과적입니다.

n-gram은 검색 시스템 외에도 자연어 처리, 오타 보정, 유사 문자열 검색 등 다양한 분야에서 사용됩니다. n 값이 1이면 unigram, 2면 bigram, 3이면 trigram이라 부릅니다.

## Percona MongoDB vs MongoDB Community Edition

Percona Server for MongoDB는 무료이며, MongoDB Community Edition에 없는 엔터프라이즈 기능 일부를 제공합니다.

| 기능 | Percona Server | MongoDB Community | MongoDB Enterprise |
| --- | --- | --- | --- |
| **n-gram 전문 검색** | ✅ | ❌ | ❌ |
| In-Memory 스토리지 엔진 | ✅ | ❌ | ✅ |
| 암호화(Encryption-at-Rest) | ✅ (Vault 연동) | ❌ | ✅ (KMIP) |
| Hot Backup | ✅ | ❌ | ✅ |
| LDAP/Kerberos 인증 | ✅ | ❌ | ✅ |
| Audit Logging | ✅ | ❌ | ✅ |

웹이나 애플리케이션에서 한국어 검색이 중요하다면 Percona의 n-gram 지원이 유용한 선택지가 될 수 있습니다.

## Percona MongoDB에서 n-gram 사용하기

인덱스를 생성할 때 `default_language` 파라미터를 `ngram`으로 설정합니다.

```javascript
db.articles.createIndex({ content: "text" }, { default_language: "ngram" })
```

n-gram은 특수 문자도 개별 토큰으로 처리하므로, 날짜나 코드처럼 특수 문자가 포함된 문자열도 이스케이프 없이 검색할 수 있습니다.

```javascript
db.articles.find({ $text: { $search: "2021-02-12" } })
```

## MongoDB Search: 현재 권장 방식

MongoDB는 현재 `text` 인덱스와 `$text` 연산자보다 MongoDB Search를 권장합니다. MongoDB Search는 Atlas에서 관리형으로 제공되며, 자체 관리형 배포에서는 MongoDB 8.3.4 이상에서 별도 `mongot` 프로세스를 통해 사용할 수 있습니다.

MongoDB Search는 한국어를 포함한 41개 언어를 지원하며, 한국어 전용 분석기(`lucene.korean`, `lucene.nori`)와 CJK 공통 분석기(`lucene.cjk`)를 제공합니다. n-gram 토크나이저(`nGram`, `edgeGram`)도 사용할 수 있어 부분 문자열 검색이나 자동완성 구현이 가능합니다.

```javascript
// MongoDB Search 인덱스 정의 예시
{
  "mappings": {
    "fields": {
      "content": {
        "type": "string",
        "analyzer": "lucene.korean"
      }
    }
  }
}

// $search 쿼리
db.articles.aggregate([
  {
    $search: {
      text: { query: "서울", path: "content" }
    }
  }
])
```

> **NOTE** — 자체 관리형 MongoDB Search는 8.3.4 이상에서만 지원되며, 별도 `mongot` 프로세스 설치와 구성이 필요합니다. Atlas에서는 MongoDB Search가 관리형 서비스로 제공되어 별도 설정 없이 사용할 수 있습니다.

## 정리

MongoDB Community Edition의 `text` 인덱스는 한국어를 지원하지 않습니다. 한국어 전문 검색이 필요하다면 다음 선택지를 고려할 수 있습니다:

- **Percona Server for MongoDB**: n-gram 기반 전문 검색을 무료로 제공하며, MongoDB Community Edition과 호환됩니다.
- **MongoDB Search**: MongoDB가 권장하는 최신 전문 검색 솔루션으로, 한국어 전용 분석기와 고급 검색 기능을 제공합니다. Atlas 관리형 또는 자체 관리형(8.3.4+)으로 사용 가능합니다.
- **애플리케이션 레벨 n-gram**: 애플리케이션에서 직접 n-gram을 생성해 배열 필드로 저장하고 멀티키 인덱스로 검색하는 방식도 가능하지만, 도큐먼트 크기 증가와 인덱스 키 폭증(`indexMaxNumGeneratedKeysPerDocument` 기본값 100,000 제한)을 고려해야 합니다.
