---
date: 2021-02-02 09:30:01 +0900
title: "MongoDB 기준필드가 다른 도큐먼트 동시에 업데이트"
category: mongodb
excerpt: "MongoDB 기준필드가 다른 도큐먼트 동시에 업데이트 MongoDB는 Insert 작업을 하거나 Update를 하거나 할때 여러개의 도큐먼트를 동시에 처리할 수 있는 insertMany, updateMany라는 명령어가 있습니다. 다수의 도큐먼트에 업데이트시 $set 연산자를 이…"
updated: 2026-09-17
---

> **검증 노트 (2026-09) · 주의** — 본문 핵심 예제인 `db.collection.update()` 는 `mongosh` 에서 deprecated 되어 updateOne/updateMany/findOneAndUpdate/bulkWrite 로 대체해야 합니다. 결론부의 bulkWrite 방식 자체는 현재도 유효합니다.

![](/assets/img/wp/2020/04/37_2019081518484308.jpg)

## MongoDB 기준필드가 다른 도큐먼트 동시에 업데이트

MongoDB는 Insert나 Update 작업 시 여러 도큐먼트를 동시에 처리할 수 있는 insertMany, updateMany 명령어가 있습니다.

다수의 도큐먼트 업데이트 시 $set 연산자로 기준 필드를 정하고 updateMany 명령으로 일괄 업데이트를 실행할 수 있습니다.

```javascript
> db.users.updateMany({name: "James"},{$set:{salary:50000}})
```

이런 식으로 명령어를 사용하면 이름이 James인 도큐먼트의 샐러리 필드를 일괄적으로 50000으로 업데이트합니다.

하지만 같은 컬렉션인데 기준 필드가 다르고, 동시에 다른 필드값을 업데이트한다면 updateMany 명령으로는 수정이 불가능합니다.

다음은 follows 컬렉션에서 한 계정이 다른 사람을 팔로우했을 때, 자신의 follows 도큐먼트에는 following에 팔로우한 유저를 기록하고, 팔로우당한 유저의 도큐먼트에는 followers에 팔로우한 사람을 기록하는 예제입니다.

```javascript
var fwr_email = "anna@naver.com"
var fwi_email = "elsa@icloud.com"
db.follows.update(
    {_id: db.follows.findOne({_id:fwi_email})._id}, 
    {$inc: {"counts.followers_cnt": 1}, $push: {followers: db.users.findOne({email: fwr_email}).username}}
)
db.follows.update(
    {_id: db.follows.findOne({_id:fwr_email})._id}, 
    {$inc: {"counts.followings_cnt": 1}, $push: {followings: db.users.findOne({email: fwi_email}).username}}
)
```

계정 email을 변수로 받아서, 각각의 도큐먼트에서 하나는 followers, 다른 하나는 followings를 업데이트하면서 각각의 카운트에 1을 더해 팔로워, 팔로잉 수를 기록합니다.

```json
> db.follows.find().pretty()
{
        "_id" : "anna@naver.com",
        "followers" : [ ],
        "followings" : [
                "elsa"
        ],
        "counts" : {
                "followers_cnt" : 0,
                "followings_cnt" : 1
        }
}
{
        "_id" : "elsa@icloud.com",
        "followers" : [
                "anna"
        ],
        "followings" : [ ],
        "counts" : {
                "followers_cnt" : 1,
                "followings_cnt" : 0
        }
}
```

실제로 위 명령은 update를 두 번 하는 것인데, 이를 하나의 커맨드로 처리하기 위해 아래와 같이 바꿀 수 있습니다.

```javascript
var fwr_email = "anna@naver.com"
var fwi_email = "elsa@icloud.com"
db.follows.bulkWrite(
  [
    {
      updateOne: 
        {
          "filter": {_id: db.follows.findOne({_id:"elsa@icloud.com"})._id}, 
          "update": {$inc: {"counts.followers_cnt": 1}, $push: {followers: db.users.findOne({email: fwr_email}).username}}
        }
     },
     {
      updateOne: 
        {
          "filter": {_id: db.follows.findOne({_id:"anna@naver.com"})._id}, 
          "update": {$inc: {"counts.followings_cnt": 1}, $push: {followings: db.users.findOne({email: fwi_email}).username}}
        }
     }
  ]
)
```

bulkWrite를 이용하는 방법인데, bulkWrite는 동시에 여러 명령을 수행하는 역할을 합니다. 같은 결과를 하나의 스택으로 처리할 수 있습니다.

업데이트뿐만 아니라 인서트와 업데이트를 동시에 처리할 수도 있고, 삽입, 수정, 삭제를 한 번에 진행할 수도 있습니다.

bulkWrite에서 실행할 수 있는 명령은 아래와 같습니다.

- insertOne
- insertMany
- updateOne
- updateMany
- replaceOne
- deleteOne
- deleteMany

자세한 내용은 MongoDB docs의 bulkWrite([https://docs.mongodb.com/manual/core/bulk-write-operations/](https://docs.mongodb.com/manual/core/bulk-write-operations/ "bulkWrite")) 부분을 참고하시면 됩니다.

#### 참고 자료

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")
