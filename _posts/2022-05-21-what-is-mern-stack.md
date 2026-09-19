---
date: 2022-05-21 01:20:29 +0900
title: "MERN Stack 이란?"
category: mongodb
excerpt: "MERN Stack 이란? 최근 MongoDB에 대한 자료들을 찾아보다 보면 해외 사이트들에서 쉽게 접할 수 있는 단어입니다. 꽤 인기있는 것으로 Udemy 같은 온라인 교육 사이트에는 MERN Stack에 대한 통합 교육과정도 업로드 되고 있습니다. MERN은 스택을 구성하는..."
updated: 2026-09-17
---

## MERN Stack 이란?

MongoDB 자료를 찾아보면 해외 사이트에서 자주 등장하는 단어입니다. Udemy 같은 온라인 교육 사이트에는 MERN Stack 통합 교육과정도 업로드되고 있습니다.

MERN은 스택을 구성하는 4가지 핵심 기술을 따서 MongoDB, Express, React, Node를 나타냅니다.

- MongoDB – document database
- Express.js – Node.js web framework
- React.js – a client-side JavaScript framework
- Node.js – the premier JavaScript web server

Express.js 및 Node.js는 중간(응용 프로그램) 계층을 구성합니다. Express.js는 서버 측 웹 프레임워크이며 Node.js는 JavaScript 서버 플랫폼입니다. 어떤 변형을 선택하든 ME(RVA)N으로 JavaScript 및 JSON 기반 애플리케이션을 구축할 수 있습니다.

- R – React.js
- V – Vue.js
- A – Angular.js

## MERN Stack은 어떻게 동작할까요?

MERN 아키텍처를 사용하면 JavaScript 및 JSON으로 3-tier 아키텍처(프론트엔드, 백엔드, 데이터베이스)를 구성할 수 있습니다.

![MERN Stack 아키텍처 다이어그램](/assets/img/wp/2022/05/mern-stack-b9q1kbudz0.jpg)

### React.js Frontend

MERN 스택의 가장 앞단은 React.js입니다. 동적 HTML을 클라이언트 단에서 생성하는 선언적 JavaScript 프레임워크입니다. React.js를 사용하면 간단한 구성 요소로 복잡한 인터페이스를 구축하고, 백엔드 서버의 데이터에 연결해 HTML로 렌더링할 수 있습니다.

React.js의 강점은 최소한의 코드로 Data-Driven 기반 인터페이스를 처리하는 것입니다. 최신 웹 프레임워크에서 기대할 수 있는 모든 기능을 갖추고 있습니다.

### Express.js and Node.js Server Tier

다음 레벨은 Node.js 서버 내부에서 실행되는 Express.js 서버 측 프레임워크입니다. Express.js는 스스로를 "Node.js를 위한 빠르고, 의견이 없는, 미니멀리스트 웹 프레임워크"라고 칭하고 있습니다. Express.js는 URL 라우팅(서버 기능과 수신 URL 일치)과 HTTP 요청 및 응답 처리 모델을 제공합니다.

React.js 프론트 엔드에서 XML HTTP 요청(XHR), GET 또는 POST를 작성해 애플리케이션을 구동하는 Express.js 기능에 연결할 수 있습니다. 이러한 기능은 MongoDB 데이터베이스의 데이터에 액세스하고 업데이트하기 위해, MongoDB의 Node.js 드라이버를 이용하여 순차적으로 Promises를 사용하는 콜백을 이용합니다.

### MongoDB Database Tier

애플리케이션이 데이터(사용자 프로필, 콘텐츠, 댓글, 업로드, 이벤트 등)를 저장하는 경우 React.js, Express.js 및 Node.js만큼 쉽게 작업할 수 있는 데이터베이스가 필요합니다. 바로 여기에서 MongoDB가 등장합니다.

React.js 프론트 엔드에서 생성된 JSON 문서가 유효하다는 가정하에 Express.js 서버로 전달되어 문서를 처리하고, 후에 데이터를 검색하기 위해 MongoDB에 직접 저장할 수 있습니다.

## MERN은 풀스택 솔루션

MERN은 프론트 엔드 디스플레이 계층(React.js), 애플리케이션 계층(Express.js 및 Node.js), 데이터베이스 계층(MongoDB)을 포함한 기존의 3계층 아키텍처 패턴을 따르는 Full Stack입니다. 입문용으로 많이 선택하는 APM(Apache-PHP-MySQL)을 대체할 수 있는 Full Stack 솔루션이 될 수 있습니다.

### MERN 스택을 선택하는 이유는 무엇일까?

MERN 스택의 루트에 있는 문서 데이터베이스인 MongoDB부터 시작하겠습니다. MongoDB는 기본적으로 JSON 데이터를 저장하도록 설계되었으며(기술적으로 BSON이라는 JSON의 이진 버전을 사용함) 명령줄 인터페이스에서 쿼리 언어(MQL 또는 MongoDB 쿼리 언어)에 이르기까지 모든 것이 JSON 및 JavaScript를 기반으로 합니다.

MongoDB는 Node.js와 호환성이 좋으며, 애플리케이션의 모든 계층에서 JSON 데이터를 저장, 조작 및 표현할 수 있습니다. 클라우드 네이티브 애플리케이션의 경우 MongoDB Atlas는 선택한 클라우드 콘솔에서 몇 번의 버튼 클릭만으로 자동 크기 조정 MongoDB 클러스터를 제공합니다.

Express.js(Node.js에서 실행) 및 React.js는 MERN Full Stack을 이용해 전부를 JavaScript/JSON 애플리케이션으로 구축할 수 있습니다. Express.js는 HTTP 요청 및 응답을 래핑하고 URL을 서버 측 기능에 매핑합니다. React.js는 HTML로 대화형 사용자 인터페이스를 구축하고 원격 서버와 통신하기 위한 프론트엔드 JavaScript 프레임워크입니다. 이 조합은 JSON 데이터가 앞에서 뒤로 자연스럽게 흐르므로 구축이 빠르고 디버그가 간단하다는 것을 의미합니다. 또한 전체 시스템을 이해하려면 하나의 프로그래밍 언어와 JSON 문서 구조만 알면 됩니다.

MERN은 특히 React.js 경험이 있는 사람들이 빠르게 웹 애플리케이션을 개발할 때 선택하는 스택입니다.

## MERN 사용 사례

모든 웹 스택과 마찬가지로 MERN에서 원하는 모든 것을 구축할 수 있지만 JSON이 많고 클라우드 네이티브이며 동적 웹 인터페이스가 있는 경우에 가장 이상적입니다.

몇 가지 예는 다음과 같습니다.

- 워크플로 관리
- 뉴스 집계
- Todo 앱 및 캘린더
- 대화형 포럼/소셜 제품 등
