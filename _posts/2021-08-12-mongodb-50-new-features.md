---
date: 2021-08-12 15:07:59 +0900
title: "[번역] MongoDB 5.0 New Features"
category: mongodb
excerpt: "MongoDB 5.0이 2021년 7월 MongoDB.live 이벤트에서 출시됐습니다. 네이티브 시계열 컬렉션, 라이브 리샤딩, Versioned API, 윈도 함수 등이 추가됐습니다. 5.0은 2024년 10월 지원이 종료됐고, 2026년 9월 기준 현행 버전은 8.0입니다."
last_modified_at: 2026-09-20
---

2021년 7월 MongoDB.live 이벤트에서 MongoDB 5.0이 출시됐습니다. 네이티브 시계열 컬렉션, MongoDB Atlas Serverless 데이터베이스, Atlas Search 개선, Atlas Data Lake 통합, 모바일 데이터 솔루션 Realm 개선이 포함됐습니다. 5.0은 개발자 생산성 향상과 하이브리드 환경 배포, 보안 및 개인정보 보호 관리 기능을 강화했습니다.

MongoDB 5.0은 2024년 10월 31일 지원이 종료됐습니다. 2026년 9월 기준 현행 버전은 8.0이며, 6.0은 2025년 7월 31일 지원 종료됐습니다.

## 네이티브 시계열 컬렉션

시계열 데이터는 시간 흐름에 따라 처리되며 수집률이 높아 관리가 어렵습니다. 데이터 양이 많고 작은 업데이트에도 순서가 뒤집힐 수 있어 시간 기반 필터를 많이 사용합니다.

MongoDB 5.0은 IoT와 금융 분석을 위한 네이티브 시계열 컬렉션을 도입했습니다. **Clustered Indexing**과 **Window Function** (`$setWindowFields`)을 추가해 시계열 애플리케이션 구축을 지원했습니다. 스토리지 효율을 위해 스키마를 자동 최적화하며, 일반 컬렉션과 함께 배치해 혼합 워크로드를 처리할 수 있습니다. 자동 데이터 수명 주기 관리로 실시간 분석, 시각화, 온라인 보관, 자동 만료를 지원합니다.

5.0 이후 시계열 컬렉션은 계속 발전했습니다. 6.0에서 샤딩 지원이 추가됐고, 7.0에서 문서 삭제 및 업데이트 명령(`deleteOne`, `updateOne`, `updateMany`)이 지원됐습니다. 8.0에서는 `bucketRoundingSeconds`와 `bucketMaxSpanSeconds` 파라미터로 버킷 경계 제어가 추가됐습니다.

## 라이브 리샤딩

샤딩은 데이터를 여러 서버에 분산 저장하는 기법입니다. 클러스터가 더 큰 데이터 세트를 처리하고 동시 요청을 분산할 수 있게 합니다.

MongoDB 5.0은 라이브 리샤딩(live resharding)을 도입했습니다. `reshardCollection` 명령으로 다운타임 없이 샤드 키를 변경할 수 있습니다. 워크로드가 성장하거나 데이터 분포가 변할 때 샤드 키를 재설정해 밸런스를 맞출 수 있습니다.

## Versioned API (현재 Stable API)

MongoDB 5.0은 Versioned API를 도입했습니다. 애플리케이션 수명 주기를 데이터베이스 업그레이드 주기와 분리해 호환성을 보장하는 메커니즘입니다. 데이터베이스가 업그레이드되더라도 애플리케이션 코드를 변경하지 않고 계속 실행할 수 있습니다.

이후 Versioned API는 Stable API로 명칭이 변경됐습니다. 연결 시 `apiVersion`, `apiStrict`, `apiDeprecationErrors` 파라미터로 사용할 API 버전과 호환성 수준을 명시할 수 있습니다.

## 다중 클라우드 보안

MongoDB 5.0은 다중 클라우드 환경에서 클라이언트 측 필드 수준 암호화(Client-Side Field Level Encryption, CSFLE)를 지원합니다. 특정 필드를 클라이언트에서 암호화해 데이터베이스 서버가 평문을 보지 못하게 합니다. 상시 감사 및 인증서 교체가 지원되어 애플리케이션 중단 없이 보안 태세를 유지할 수 있습니다.

## MongoDB Atlas 서버리스

MongoDB 5.0 출시와 함께 MongoDB Atlas 서버리스 인스턴스가 프리뷰로 제공됐습니다. 사용자는 클라우드 리전을 선택하고 바로 구축을 시작할 수 있으며, 용량 계획과 프로비저닝 작업이 줄어듭니다.

## 그 밖의 개선

MongoDB 5.0의 기타 개선 사항입니다.

- **Atlas Search** — Function Scoring으로 문서 필드에 수학 공식을 적용해 검색 순위를 조정할 수 있습니다. 검색 인덱스별 동의어 정의도 지원합니다.
- **Realm** — 모바일 데이터 솔루션 Realm이 개선되어 실시간 점수, 플레이어 통계 같은 게임 데이터를 저장하고 장치 간 자동 동기화할 수 있습니다.
- **MongoDB Charts + Atlas Data Lake** — MongoDB Charts가 Atlas Data Lake와 통합되어 Amazon S3에 저장된 데이터를 이동·복제·변환 없이 시각화할 수 있습니다.
- **mongo 셸 deprecated** — 레거시 `mongo` 셸이 deprecated 됐습니다. 새로운 `mongosh` 셸을 권장하며, 레거시 셸은 6.0에서 제거됐습니다.
- **날짜 연산자 추가** — `$dateAdd`, `$dateDiff`, `$dateTrunc`, `$getField`, `$setField` 등 새로운 집계 연산자가 추가됐습니다.

원글 출처 (<https://analyticsindiamag.com/mongodb-5-0-new-features-updates-explained/>)
