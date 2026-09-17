---
date: 2019-11-15 02:32:19 +0900
title: "InnoDB dirty pages"
category: mysql
excerpt: "Dirty pages? Row 값을 업데이트하면 MySQL은 Buffer Pool에서 Row값을 업데이트 하여 Page를 Dirty로 표시합니다. 변경 사항은 바이너리 로그에도 기록되므로 충돌이 발생하면 MySQL이 로그를 재생하고 데이터가 손실되지 않습니다. 바이너리 로그에 쓰는…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 더티 페이지와 체크포인트 개념은 유효하지만 파라미터 서술이 낡았습니다. innodb_log_file_size 는 innodb_redo_log_capacity 로 대체되어 deprecated 이고, 인용된 srv_master_thread() 코드는 5.x InnoDB 기준입니다. innodb_max_dirty_pages_pct 의 현행 기본값은 확인 불가입니다(글의 75 는 5.x 시절 값).

![MySQL 로고](/assets/img/wp/2019/05/CxvR4Rax_400x400.jpg)

## Dirty pages?

Row 값을 업데이트하면 MySQL은 Buffer Pool에서 Row 값을 업데이트하여 Page를 Dirty로 표시합니다. 변경 사항은 바이너리 로그에도 기록되므로 충돌이 발생하면 MySQL이 로그를 재생하고 데이터가 손실되지 않습니다. 바이너리 로그에 쓰는 작업은 append-only로 동작하지만, 실제 업데이트에는 Random write가 발생하며, Random write는 속도가 느립니다. MySQL은 buffer pool에 새 데이터를 로드해야 할 때 dirty page를 디스크로 flush합니다. 따라서 InnoDB에서 dirty page를 갖는 것은 정상적인 일입니다. InnoDB의 전반적인 성능을 향상시키기 위한 수행 방식입니다.

## innodb_max_dirty_pages_pct

0~99.999의 값을 설정할 수 있고 default 값은 75입니다. `innodb_max_dirty_pages_pct = 75` 기본값에서는 InnoDB의 Buffer pool의 dirty page 비중이 75%가 되면 `innodb_io_capacity` 파라미터로 정한 값만큼 한번에 페이지를 flush합니다. 이 값을 너무 낮추면 자주 dirty page를 flush하지만, Buffer pool의 효율성이 떨어지고 Disk I/O가 많아집니다. Buffer pool의 사이즈가 작고 늘릴 수 없는 경우라면 `innodb_max_dirty_pages_pct`의 값을 크게 하여 체크포인트를 지연시킬 수 있습니다. 반대로 너무 높으면 Redo file이 가득 차서 더 이상 기록할 수 없는 현상이 발생할 수도 있습니다. `innodb_max_dirty_pages_pct = 0`으로 설정하면 강제로 dirty page를 비웁니다. 성능 개선을 위해 이 값을 조정하는 것보다는 `innodb_buffer_pool_size`를 늘리거나, `innodb_log_file_size`를 늘리는 것이 더 효과적일 수 있습니다.

## innodb_log_file_size

InnoDB의 redo 사이즈를 결정하는데, 그럼 redo의 크기를 키우면 정말로 성능 향상이 있을까요? Oracle의 경우 redo log의 I/O가 빈번히 발생하는 경우, Wait event에서 Log file sync에 대한 이벤트가 증가하여 Disk I/O에 대한 영향으로 나타나 성능 저하를 가져오기도 합니다. 그럴 때 redo의 크기가 작아서 log file sync가 빈번히 발생하는 것이라면, redo를 크게 늘려서 I/O를 줄이는 방법을 사용하기도 합니다. 실제로 MySQL이나 MariaDB에서도 `innodb_log_file_size`를 크게 조정하면 read+write 워크로드에서의 중요한 성능 향상 요소가 됩니다.

## in depth with Dirty Pages Level

실제로 `innodb_max_dirty_pages_pct` 값을 조정하는 것보다 `innodb_log_file_size`를 조정하는 편이 좋은 이유는 따로 있습니다. `innodb/srv/srv0srv.c`를 소스 코드를 열어보면 dirty page의 백분율을 확인하는 코드는 `srv_master_thread()` 함수의 일부입니다. dirty page 레벨이 요청된 값을 초과할 때마다 `buf_flush_batch()` 함수가 dirty page를 디스크 스토리지로 플러시하기 위해 호출됩니다.

Dirty page 레벨이 필요한 값을 초과하면 이 부분에서 `buf_flush_batch()`가 호출됩니다.

```c
***********************************************************************
The master thread controlling the server. */

os_thread_ret_t
srv_master_thread(
/*==============*/

 ...

                  if (UNIV_UNLIKELY(buf_get_modified_ratio_pct()
                                    > srv_max_buf_pool_modified_pct)) {

                          /* Try to keep the number of modified pages in the
                          buffer pool under the limit wished by the user */

                          n_pages_flushed = buf_flush_batch(BUF_FLUSH_LIST,
                                                            PCT_IO(100),
                                                            ut_dulint_max);

                          /* If we had to do the flush, it may have taken
                          even more than 1 second, and also, there may be more
                          to flush. Do not sleep 1 second during the next
                          iteration of this loop. */

                          skip_sleep = TRUE;
                  }

 ...
```

이 부분에서 지난 10초 동안 I/O 활동이 낮고 `innodb_extra_dirty_writes`가 활성화된 경우 `buf_flush_batch()`가 호출됩니다(기본적으로 활성화됨).

```c
...

          /* ---- We perform the following code approximately once per
          10 seconds when there is database activity */

#ifdef MEM_PERIODIC_CHECK
          /* Check magic numbers of every allocated mem block once in 10
          seconds */
          mem_validate_all_blocks();
#endif
          /* If i/os during the 10 second period were less than 200% of
           capacity, we assume that there is free disk i/o capacity
           available, and it makes sense to flush srv_io_capacity pages.

           Note that this is done regardless of the fraction of dirty
           pages relative to the max requested by the user. The one second
           loop above requests writes for that case. The writes done here
           are not required, and may be disabled. */

          n_pend_ios = buf_get_n_pending_ios() + log_sys->n_pending_writes;
          n_ios = log_sys->n_log_ios + buf_pool->n_pages_read
                  + buf_pool->n_pages_written;
          if (srv_extra_dirty_writes &
              n_pend_ios < 3 && (n_ios - n_ios_very_old < PCT_IO(200))) {

                  srv_main_thread_op_info = "flushing buffer pool pages";
                  buf_flush_batch(BUF_FLUSH_LIST, PCT_IO(100), ut_dulint_max);

                  srv_main_thread_op_info = "flushing log";
                  /* No fsync when srv_flush_log_at_trx_commit  1 */
                  log_buffer_flush_maybe_sync();
                  srv_async_flush++;
          }
 ...
```

Master thread가 Purge 되면 여기서 loop 됩니다.

```c
         /* We run a full purge every 10 seconds, even if the server
         were active */

         n_pages_purged = 1;
         last_flush_time = time(NULL);

         while (n_pages_purged) {
                 if (srv_fast_shutdown && srv_shutdown_state > 0) {
                         goto background_loop;
                 }

                 srv_main_thread_op_info = "purging";
                 n_pages_purged = trx_purge();

                 current_time = time(NULL);

                 if (difftime(current_time, last_flush_time) > 1) {
                         srv_main_thread_op_info = "flushing log";

                         log_buffer_flush_to_disk();
                         last_flush_time = current_time;
                         srv_sync_flush++;
                 }
         }
...
```

그러나 Trace를 떠보면 실제로 `buf_flush_batch()`가 호출되어 dirty page flush가 일어나는 경우는 잘 없습니다. flushing은 주로 `log_check_margins()` 함수에 의해 호출됩니다. 공간이 충분히 빨리 확보되지 않으면 `buf_flush_free_margin()` 함수가 호출됩니다.

`innodb_max_dirty_pages_pct` 값이 높은 경우 buffer pool은 더 잘 관리되지만 데이터베이스 페이지 레벨이 계속 증가함에 따라 여전히 공간이 낭비됩니다. 공간이 부족한 경우 `buf_flush_free_margin()` 함수가 호출되며 flush가 발생합니다.

`innodb_max_dirty_pages_pct` 값이 낮은 경우, 마스터 스레드가 페이지를 충분히 빠르게 flush하며, buffer pool 내에 공간이 낭비되지 않습니다. 그리고 로그 파일 내에 누락된 공간이 줄어듭니다. 대신 Buffer pool의 효율성이 떨어지고 Disk I/O가 많아집니다. 처리량이 많아질 경우 Buffer pool의 효율이 떨어지고 Disk I/O가 많아진다는 것은 큰 장애 포인트가 될 수 있습니다. 그러니 `innodb_max_dirty_pages_pct` 값을 조정할 때는 주의해야 합니다.
