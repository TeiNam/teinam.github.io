---
date: 2021-07-04 10:53:37 +0900
title: "WiredTiger의 Hazard Pointer"
category: mongodb
excerpt: "WiredTiger의 Hazard Pointer WiredTiger에서 Hazard Pointer는 메모리 페이지가 퇴거 될 수 있는지 여부를 관리하는 데 사용됩니다. 이 포스팅에서는 Hazard Pointer의 구현 프로세스를 분석합니다. Hazard Pointer Hazard…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 참고** — Hazard Pointer 로 이빅션 대상 페이지를 보호하는 메커니즘 설명 자체는 스토리지 엔진 내부 원리라 버전과 무관하게 읽을 수 있습니다. 다만 기준으로 삼은 MongoDB 4.4/WiredTiger 10.0.1 은 지원 종료(2024-02) 버전이고 링크된 레퍼런스도 보관 문서이며, 최신 WiredTiger 소스와의 세부 구조 차이는 확인 불가입니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## WiredTiger의 Hazard Pointer

> **전제조건:** MongoDB 4.4·WiredTiger 10.0.1 기준

WiredTiger에서 Hazard Pointer는 메모리 페이지가 퇴거(eviction)될 수 있는지 여부를 관리하는 데 사용된다. 이 포스팅에서는 Hazard Pointer의 구현 프로세스를 분석한다.

### Hazard Pointer

Hazard Pointer는 다중 스레드 환경에서 자원에 잠금 없이 액세스하는 방법이다. space-time-changing 방식으로 구현되어 있다.

- 각 자원에 Hazard Pointer 배열을 할당하고 배열의 크기는 스레드 수와 같으며 각 항목은 특정 자원의 포인터를 포함하거나 비어 있다.
- 스레드가 자원에 액세스할 때마다 스레드에 해당하는 Hazard Pointer를 수정한다. Hazard Pointer에 포함된 자원 포인터에 자원을 할당한다.
- 스레드가 액세스를 완료하면 스레드의 Hazard Pointer가 Null로 설정된다.
- 자원을 삭제하려면 Hazard Pointer 배열을 탐색하여 여전히 자원을 가리키는 다른 스레드의 Hazard Pointer가 있는지 확인해야 한다. Hazard Pointer가 가리키는 자원이 있으면 삭제할 수 없다.

### WiredTiger에서 사용

MongoDB 4.4 버전에서는 WiredTiger 10.0.1 버전의 스토리지 엔진을 사용한다. 자세한 내용은 WiredTiger의 [레퍼런스 가이드](https://source.wiredtiger.com/mongodb-4.4/index.html)를 참고하시기 바란다.

WiredTiger에서 Hazard Pointer는 메모리 페이지를 메모리에서 디스크로 플러시할 수 있는지 여부를 결정하는 데 사용된다.

세션은 임의 수의 열린 커서를 가질 수 있으며, 열린 커서는 한 번에 여러 페이지에 접근할 수 있고, 커서는 페이지가 제거되지 않도록 각각의 페이지에 Hazard Pointer가 필요하다.

```c
struct __wt_hazard {
WT_PAGE *page;               /* 메모리 페이지 개체 */
#ifdef HAVE_DIAGNOSTIC
const char *file; /* File/line where hazard acquired */
int line;
#endif
};

struct WT_COMPILER_TYPE_ALIGN(WT_CACHE_LINE_ALIGNMENT) __wt_session_impl {

/*
* Hazard pointers.
*
* session의 hazard 비어있으며， 이 것은 처음 사용 한다는 것을 나타냄
*/

#define WT_SESSION_FIRST_USE(s) \
((s)->hazard == NULL)

uint32_t hazard_size;       /* 할당된 hazard pointer의 크기. */
uint32_t nhazard;           /* 사용된 hazard pointer의 수 */
WT_HAZARD *hazard;          /* Hazard Pointer 정렬 */
};
```

여기에서 각 세션에서 WT\_HAZARD 배열이 정의되고 크기는 hazard\_size임을 알 수 있다. hazard\_size는 생성 시 session\_count가 할당을 확인하므로 각 스레드가 배열에 고유한 인덱스를 가진다. 메모리 페이지를 운영하기 위해 메모리 페이지의 포인터를 해당 스레드에 해당하는 Hazard Pointer에 할당한다. 스레드는 자신의 스레드 인덱스에 해당하는 Hazard Pointer만 수정할 수 있으므로 다른 스레드로 수정되지 않는다. 모든 스레드가 다른 모든 스레드의 Hazard Pointer 사용을 읽을 수 있으므로 잠금 없이 세션 -> Hazard 배열을 수정하는 것이 안전하다.

메모리 페이지를 디스크에 덤프할 수 있는지 여부를 결정하고 싶을 때 세션 -> Hazard 배열을 순회할 수 있다. 스레드가 메모리 페이지를 계속 사용 중이면 플러시할 수 없다.

```c
/*
* __wt_page_hazard_check --
* Return if there's a hazard pointer to the page in the system.
*/

static inline WT_HAZARD *
__wt_page_hazard_check(WT_SESSION_IMPL *session, WT_PAGE *page)
{
WT_CONNECTION_IMPL *conn;
WT_HAZARD *hp;
WT_SESSION_IMPL *s;
uint32_t i, j, hazard_size, max, session_cnt;

conn = S2C(session);

/*
* No lock is required because the session array is fixed size, but it
* may contain inactive entries. We must review any active session
* that might contain a hazard pointer, so insert a barrier before
* reading the active session count. That way, no matter what sessions
* come or go, we'll check the slots for all of the sessions that could
* have been active when we started our check.
*/

WT_STAT_FAST_CONN_INCR(session, cache_hazard_checks);
WT_ORDERED_READ(session_cnt, conn->session_cnt);
for (s = conn->sessions, i = 0, j = 0, max = 0;
i < session_cnt; ++s, ++i) {
if (!s->active)
continue;
WT_ORDERED_READ(hazard_size, s->hazard_size);
if (s->hazard_size > max) {
max = s->hazard_size;
WT_STAT_FAST_CONN_SET(session,
cache_hazard_max, max);
}
for (hp = s->hazard; hp < s->hazard + hazard_size; ++hp) {
++j;
if (hp->page == page) {
WT_STAT_FAST_CONN_INCRV(session,
cache_hazard_walks, j);
return (hp);
}
}
}
WT_STAT_FAST_CONN_INCRV(session, cache_hazard_walks, j);
return (NULL);
}
```

### hazard.c (github)

<https://github.com/wiredtiger/wiredtiger/blob/master/src/support/hazard.c>
