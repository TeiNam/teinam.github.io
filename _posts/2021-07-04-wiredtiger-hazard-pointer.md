---
date: 2021-07-04 10:53:37 +0900
title: "WiredTiger의 Hazard Pointer"
category: mongodb
excerpt: "WiredTiger 가 캐시 페이지를 이빅션 대상에서 빼는 판단에 쓰는 Hazard Pointer 의 자료 구조와 통계 이름을 현행 소스 기준으로 정리합니다."
updated: 2026-09-20
---

WiredTiger 는 캐시에 올라온 페이지를 지금 내려도 되는지 판단하는 데 Hazard Pointer 를 씁니다. 어떤 스레드가 그 페이지를 아직 보고 있으면 이빅션 스레드는 그 페이지를 건너뜁니다. 이 글에서는 그 판단이 어떤 자료 구조로 이뤄지는지, 그리고 결과를 어떤 통계로 볼 수 있는지 정리합니다.

> **NOTE** — 소스 인용은 WiredTiger 개발 브랜치 기준이고, 공개 API 문서는 11.3.1 이 현행입니다. MongoDB 는 WiredTiger 를 기본 스토리지 엔진으로 쓰지만 번들된 WiredTiger 버전은 서버 릴리스마다 다릅니다.

## Hazard Pointer

Hazard Pointer 는 잠금 없이 공유 자원을 읽게 해 주는 기법입니다. 잠금 대신 메모리를 더 써서, 지금 이 자원을 해제해도 되는지를 판단합니다.

- 자원을 가리키는 포인터를 담는 배열을 두고, 각 슬롯은 특정 자원의 포인터를 담거나 비어 있습니다.
- 스레드는 자원에 접근하기 전에 자기 슬롯에 그 자원의 포인터를 기록합니다.
- 접근이 끝나면 자기 슬롯을 비웁니다.
- 자원을 해제하려는 쪽은 배열을 훑어 그 자원을 가리키는 슬롯이 남아 있는지 확인합니다. 하나라도 남아 있으면 해제하지 않습니다.

핵심은 쓰기 권한의 분리입니다. 슬롯을 고쳐 쓰는 것은 그 슬롯의 주인 스레드뿐이고, 나머지 스레드는 읽기만 합니다. 그래서 배열을 잠그지 않아도 됩니다.

## WiredTiger 에서의 구현

WiredTiger 에서는 세션마다 Hazard Pointer 배열을 하나 갖습니다. 한 세션은 커서를 여러 개 열 수 있고 열린 커서는 여러 페이지를 동시에 참조할 수 있으므로, 참조 중인 페이지마다 항목이 하나씩 필요합니다.

```c
/*
 * WT_HAZARD --
 *	A hazard pointer.
 */
struct __wt_hazard {
    wt_shared WT_REF *ref; /* Page reference */
#ifdef HAVE_DIAGNOSTIC
    const char *func; /* Function/line hazard acquired */
    int line;
#endif
};

struct __wt_hazard_array {
/* The hazard pointer array grows as necessary, initialize with 250 slots. */
#define WT_SESSION_INITIAL_HAZARD_SLOTS 250
    wt_shared WT_HAZARD *arr;      /* The hazard pointer array */
    wt_shared uint32_t inuse;      /* Number of array slots potentially in-use */
    wt_shared uint32_t num_active; /* Number of array slots containing an active hazard pointer */
    uint32_t size;                 /* Allocated size of the array */
};

/* struct __wt_session_impl 안 */
#define WT_SESSION_FIRST_USE(s) ((s)->hazards.arr == NULL)
    WT_HAZARD_ARRAY hazards;
```

항목이 담는 것은 페이지 구조체가 아니라 `WT_REF` 입니다. 페이지의 메모리 주소가 아니라 트리에서 그 페이지 자리를 가리키는 참조를 잡아 둡니다. 진단 빌드(`HAVE_DIAGNOSTIC`) 에서는 어느 함수 몇 번째 줄에서 잡았는지도 함께 기록합니다.

배열은 250 슬롯으로 시작해 모자라면 두 배로 늘어납니다. 빈 슬롯을 찾을 때는 first-fit 으로 넣고, 놓아줄 때는 해당 슬롯만 비우므로 배열 중간에 구멍이 생길 수 있습니다. 그래서 `inuse` 와 `num_active` 를 따로 둡니다. 배열을 훑는 쪽은 `inuse` 까지만 보면 활성 항목을 모두 볼 수 있습니다.

배열이 커질 때 이전 버퍼를 곧바로 해제하지 않는다는 점도 중요합니다. 다른 스레드가 그 버퍼를 읽는 중일 수 있으므로 `WT_GEN_HAZARD` 세대(generation) 를 넘긴 뒤에 회수합니다.

배열 길이를 직접 지정하는 설정은 현행 WiredTiger 설정 레퍼런스에 없습니다. `hazard_max` 라는 이름은 통계 쪽(`cache_hazard_max`) 에만 남아 있습니다.

세션이 닫힐 때 남은 항목은 정리됩니다. 놓아주지 않은 Hazard Pointer 가 남으면 그 페이지는 계속 이빅션 대상에서 빠지기 때문입니다.

## 이빅션과 맞물리는 지점

Hazard Pointer 가 막는 것은 페이지를 디스크에 쓰는 일이 아니라 **메모리에서 페이지를 치우는 일**입니다. 판단 기준은 `WT_REF` 의 상태 값입니다. 페이지가 메모리에 올라와 있으면 `WT_REF_MEM` 이고, 이빅션 스레드는 페이지를 내리기 전에 상태를 `WT_REF_LOCKED` 로 바꿉니다.

두 스레드는 이 상태 값을 통해 서로를 봅니다.

- 사용자 스레드는 Hazard Pointer 를 기록한 뒤 상태가 여전히 `WT_REF_MEM` 인지 다시 확인합니다. 이미 잠겨 있으면 실패로 처리하고 물러납니다.
- 이빅션 스레드는 잠근 뒤 Hazard Pointer 배열을 확인합니다. 그 페이지를 가리키는 항목이 있으면 이빅션을 포기하고 페이지를 원래 상태로 돌려놓습니다.

이빅션 대상이 될 수 없는 파일(`WT_BTREE_NO_EVICT`) 은 이 과정을 아예 건너뜁니다. 페이지가 내려갈 일이 없으면 보호할 필요도 없기 때문입니다.

확인을 수행하는 함수는 `src/support/hazard.c` 의 `__wt_hazard_check` 입니다.

```c
/*
 * __wt_hazard_check --
 *	Return if there's a hazard pointer to the page in the system.
 */
WT_HAZARD *
__wt_hazard_check(WT_SESSION_IMPL *session, WT_REF *ref, WT_SESSION_IMPL **sessionp);
```

이 함수는 활성 세션들의 Hazard Pointer 배열을 순회하면서 인자로 받은 `WT_REF` 와 같은 참조를 담은 항목을 찾습니다. 찾으면 그 항목을 돌려주고, 세 번째 인자를 넘긴 호출자에게는 그 항목을 들고 있는 세션까지 알려줍니다. 끝까지 없으면 `NULL` 을 돌려주고, 이때 이빅션을 진행해도 안전합니다. 순회하는 동안에는 배열이 회수되지 않도록 `WT_GEN_HAZARD` 세대 안에서 돕니다.

## 통계로 확인하기

WiredTiger 는 이 경로를 네 가지 통계로 내보냅니다. 아래 이름은 WiredTiger 통계 레퍼런스에 적힌 설명 문자열 그대로입니다.

| 통계 이름 | 의미 |
| --- | --- |
| `cache: hazard pointer check calls` | 확인 함수를 호출한 횟수 |
| `cache: hazard pointer check entries walked` | 확인하면서 훑은 슬롯 수의 누적 |
| `cache: hazard pointer maximum array length` | 관찰된 사용 중 슬롯 수의 최대치 |
| `cache: hazard pointer blocked page eviction` | Hazard Pointer 때문에 이빅션이 막힌 횟수 |

마지막 항목이 늘어난다면 이빅션 스레드가 고른 페이지를 다른 스레드가 쓰고 있어 헛걸음한 것입니다. 앞의 두 항목은 확인 비용을 봅니다. 훑은 슬롯 수가 호출 횟수에 비해 크게 늘어나면 세션들이 잡고 있는 항목이 많아 배열 순회가 길어진 것입니다.

## 참고

- [WiredTiger API 문서 (11.3.1)](https://source.wiredtiger.com/11.3.1/index.html)
- [src/support/hazard.c](https://github.com/wiredtiger/wiredtiger/blob/develop/src/support/hazard.c)
