---
date: 2022-12-16 02:24:07 +0900
title: "AWS RDS Blue/Green 배포 테스트"
category: mysql
excerpt: "AWS RDS Blue/Green 배포 테스트 하다가 티켓도 안 올렸는데 AWS 프리미엄 서포트 팀한테 사과 메일 받고 테스트 마친 썰 풉니다(?) AWS RDS Blue/Green 배포 시스템이 베타 버전으로 얼마전 공개 되었습니다. 우선 베타 버전임에도 AWS에서 당당하게..."
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — Blue/Green 배포는 베타를 벗어나 Aurora MySQL·PostgreSQL·Aurora Global Database 까지 지원하고 RDS Proxy·smart driver 연동과 switchover 가드레일이 추가되었다. 'binlog_format 이 MIXED 여야 하고 ROW/STATEMENT 는 안 된다' 는 서술도 현재 문서와 다르며, AWS 는 어떤 포맷이든 동작하되 ROW 를 권장한다고 명시한다.

![](/assets/img/wp/2019/04/mysql_PNG19.png)

## AWS RDS Blue/Green 배포 테스트

하다가 티켓도 안 올렸는데 AWS 프리미엄 서포트 팀한테 사과 메일 받고 테스트 마친 썰 풉니다(?)

AWS RDS Blue/Green 배포 시스템이 베타 버전으로 얼마 전 공개되었습니다. 우선 베타 버전임에도 AWS에서 당당하게 내놓은 이유는 2023년 2월 28일로 서비스가 종료되는 MySQL 5.6 기반인 Aurora MySQL v1 때문일 거라 생각이 드네요. 실제로 이 Blue/Green 배포 방식은 개발에서도 많이 쓰는 방식이고, AWS가 내놓은 이번 RDS 블루/그린 배포 서비스는 버전 업그레이드 배포 시 번거롭게 수동으로 작업해야 하는 부분들을 모두 자동화해 놓았습니다.

![](https://docs.aws.amazon.com/images/AmazonRDS/latest/UserGuide/images/blue-green-deployment.png)

AWS RDS의 블루/그린 배포는 실제 클러스터를 복제하여 새로운 버전으로 업그레이드한 후 binlog(binary log)로 두 클러스터를 동기화합니다. Blue에는 그대로 운영 데이터 및 애플리케이션 연결이 가능하여 다운 타임을 최소화한 인스턴스 버전업을 제공합니다. 블루/그린 배포를 위해서는 반드시 Blue 쪽 클러스터에 binlog 옵션이 MIXED로 켜져 있어야 합니다. ROW, Statement에서는 안 됩니다. Aurora는 클러스터 파라미터에서 `binlog_format`을 수정해 줘야 합니다.

![](/assets/img/wp/2022/12/스크린샷-2022-12-09-오후-4.20.16.png)

Binlog를 사용하기 때문에 DDL 같은 스키마 변형점이 오게 되거나 Slave로 설정된 Green 영역에서 오브젝트들을 수정하거나 대량의 데이터 입출력이 발생하면 싱크가 깨지는 일이 발생하기 때문에 어디까지나 베타 버전에서는 Green은 버전업 배포용으로 사용하는 게 좋을 것 같습니다.

AWS RDS Aurora의 최대 단점 중 하나죠. binlog 사용 시 데이터베이스 성능의 30~40% 정도가 감소하는 것은 널리 알려진 사실입니다. 많은 벤치와 실제 사용 측정치를 소개한 블로그들이 제법 있습니다. 이는 Aurora가 사용하는 RW/RO 동기화 방식이 MySQL과는 전혀 다른 데서 오는 문제로, 실제로 AWS Aurora의 binlog 기본 옵션은 False, 즉 사용하지 않음입니다. 그렇기 때문에 Static 파라미터인 binlog를 켜기 위해 재부팅 혹은 페일오버 과정을 거쳐야 하며, binlog가 켜져야만 Blue/Green 배포가 가능한 상태로 들어섭니다.

AWS가 RDS의 Blue/Green을 내놓은 이유는 Aurora v1 (MySQL 5.6 Base)의 EOL 때문이라고 했는데, Aurora v1에서 v2로 업그레이드하려면 사전에 최소 1.22.3 버전까지 마이너 버전을 끌어올려야 합니다. 우리 회사 1.22.2… 아 귀찮…

실제로 업그레이드를 해야 하는 상황이기 때문에 정말 모든 수단을 테스트해 봐야 했고, 아직 베타 버전이지만 Blue/Green 배포 테스트에 열을 올리게 되었다는 이야기입니다.

### 실제 배포 테스트

실제 운영 서버에서는 아직 테스트를 할 수 없고 테스트 인스턴스를 스냅샷에서 복원하여 테스트를 진행했습니다.

![](/assets/img/wp/2022/12/스크린샷-2022-12-09-오후-4.48.20.png)

클러스터를 선택하고 작업에 가면 '블루/그린 배포 생성 - 베타' 메뉴가 생겼습니다. 메뉴를 누르면 아래와 같은 화면으로 넘어가면서 각종 설정으로 블루/그린을 배포하게 됩니다.

![](/assets/img/wp/2022/12/스크린샷-2022-12-09-오후-4.49.32.png)

실제 배포가 끝나고 나면 데이터베이스 화면에서 아래와 같이 나오게 됩니다.

![](/assets/img/wp/2022/12/스크린샷-2022-12-09-오후-5.24.50.png)

실제 작업은 동일 버전의 클러스터와 1개의 인스턴스를 생성하고, 그 후 버전 업그레이드를 진행하며, 마지막으로 업그레이드된 버전에서 리더 인스턴스를 추가하게 됩니다.

이 동안 Blue는 그대로 사용할 수 있습니다.

이런 방법으로 기록은 못했지만 처음 테스트했던 5.7에서 8 버전으로 Blue/Green 배포 테스트는 아주 잘 됐었습니다.

그런데 5.6에서 5.7로 가는 테스트를 진행하는 동안 Blue/Green 배포까지는 잘 되는데, 전환이 안 되는 문제가 발생했습니다. 뭐가 문제인지 알 수가 없어 세 번이나 인스턴스를 새로 복원해서 다른 환경에서 테스트하게 되었습니다.

1. 리더 인스턴스 없이 배포
2. 처음 성공했던 5.6 스냅샷을 5.7로 바로 복원해서 8 버전으로 배포
3. 5.6을 5.7로 블루/그린 배포 후 8 버전까지 Green을 올리고 전환

이후 진행된 모든 테스트가 전환 작업에서 에러가 발생하는 이슈가 발생했습니다.

![](/assets/img/wp/2022/12/스크린샷-2022-12-09-오후-6.08.59.png)

황당… 뭐가 원인인가 봤더니 binlog로 slave 싱크가 되지 않는 것을 발견하게 되었네요.

그래서 수동으로 Blue/Green을 배포하는 AWS의 블로그 포스팅(<https://aws.amazon.com/ko/blogs/database/performing-major-version-upgrades-for-amazon-aurora-mysql-with-minimum-downtime/>)을 따라 수동으로 Binlog 동기화 설정을 해 줬음에도 전환이 실패하였고, 그 상태로 하루 일과를 마무리하고 퇴근을 하게 되었네요.

다음날

출근했을 때 이런 메일이 와 있었습니다.

> Dear Amazon RDS customer,
>
> Greetings from AWS Premium Support.
>
> Your Aurora Read Replica 'blue-green-uptest-v2-cluster-green-2nhl24', part of the blue green deployment 'blue-green-uptest' is failing to replicate the primary cluster due to a missing binlog "mysql-bin-changelog.000001". Based on our investigation, it is caused by a gap in the primary cluster's binary logs. We suggest you make a write to your primary cluster, then re-create the blue green deployment.
>
> We apologize for the inconvenience caused and continue to strive to improve our customer experience with Amazon RDS.
>
> If you have any further questions or require any guidance, please do not hesitate to contact the AWS Support team. We are available on AWS Developer Community [1] or by contacting AWS Premium Support [2].

하하하…

블루/그린 배포로 자동 처리되는 binlog 동기화 세팅에 binlog를 켠 상태에서 아무런 쓰기 작업을 하지 않으면, 초기 binlog에 공백이 발생하여 전환이 안 되는 버그가 있으니 쓰기 작업을 한 후 다시 블루/그린을 배포하라. 미안하다.

많은 클라우드 엔지니어들이 일하면서 AWS의 메일을 받겠지만 AWS에서 저렇게 먼저 apologize라는 단어를 써서 이런 메일을 쓰는 경우는 진짜 처음 봤기 때문에 다들 옆에서 "와 블로그 감이다"라고 이야기들을 하네요.

실제로 처음 했던 5.7 to 8이 잘 됐던 이유는 Blue 쪽에 쓰기 작업을 진행했기 때문이었던 거였고 이런 이유로 첫 테스트가 성공했을 거라고는 상상도 못했기 때문에 뒤에 진행한 쓰기 작업이 없었던 세 번의 테스트가 실패로 끝나고 말았던 것이었죠.

실제 메일을 받고 그대로 실행했을 때

![](/assets/img/wp/2022/12/스크린샷-2022-12-12-오전-11.37.43.png)

이렇게 배포를 거쳐 전환을 하면

![](/assets/img/wp/2022/12/스크린샷-2022-12-13-오후-1.33.14.png)

기존 Blue 인스턴스에 `-old`가 붙고, 신규 Green 인스턴스가 기존 원본인 Blue의 인스턴스명과 엔드포인트를 그대로 가져오게 됩니다. 그리고 블루/그린 마킹이 사라지고, 서로 분리가 됩니다.

그런데 아직 베타 버전이기 때문에 전환을 하고 나면 old 인스턴스를 다시 원래대로 되돌리는 방법이 없습니다. (!) 야.. 바로 복원이 안 되면 이게 무슨 블루/그린이야?! .. 그래서 베타…

여튼 이렇게 Blue/Green 테스트는 무사히 마치게 되었고, Aurora v1의 EOL을 앞두고 이런 방법도 가능하다는 테스트 결과를 얻었지만, 결국 우리는 다운 타임을 가지고 스냅샷 후 수동으로 업그레이드하는 방법을 선택할지도 모릅니다…

시간이 없다…

처음 앱이 만들어질 때 우선 만들고 보자는 마인드로 개발 DB를 그대로 운영으로 올렸기 때문에 VPC도 디폴트고… 모델링도, 도메인 분리도 다 엉망인 상태기 때문에…

우선 버전업을 하고 나서 천천히 고도화 작업을 진행하게 될 것 같습니다. 가비지 데이터는 죽이고 기존 데이터를 살려서 신규 정규화 모델에 이관하고 새로 개발하는 것이 다음 목표가 되었습니다.

험난한 여정이네요. 후후…
