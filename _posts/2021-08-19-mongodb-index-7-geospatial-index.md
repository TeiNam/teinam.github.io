---
date: 2021-08-19 14:54:52 +0900
title: "MongoDB Index #.7 Geospatial Index"
category: mongodb
excerpt: "MongoDB 공간 인덱스 2dsphere와 2d의 차이, GeoJSON 타입과 좌표 순서, $near·$geoWithin·$geoNear의 인덱스 요구 조건을 MongoDB 8.0 기준으로 정리했습니다."
updated: 2026-09-20
---

MongoDB는 공간 인덱스를 두 가지 제공합니다. `2dsphere` 는 구체(sphere) 위의 도형을 해석하는 쿼리를 지원하고, `2d` 는 평면 위의 도형을 해석하는 쿼리를 지원합니다.

`2d` 인덱스는 레거시 좌표쌍(legacy coordinate pairs)을 위한 것입니다. 평면 유클리드 좌표계에서 계산하기 때문에 좌표가 구체를 따라 감기지(wrap) 않고, GeoJSON 오브젝트를 대상으로는 쿼리할 수 없습니다. 지구 위의 위치를 다룬다면 데이터를 GeoJSON으로 저장하고 `2dsphere` 인덱스를 쓰는 쪽이 맞습니다. 구면 데이터에 `2d` 인덱스를 쓰면 틀린 결과나 에러가 나올 수 있습니다. 극지방을 넘어가며 감기는 구면 쿼리를 `2d` 인덱스가 지원하지 않는 것이 그 예입니다.

두 인덱스는 내부 색인 방식도 다릅니다. `2d` 인덱스는 2차원 평면을 사분면으로 재귀적으로 나누고 각 사분면에 두 비트 값을 붙여 geohash 값을 계산한 뒤, 그 geohash 값을 색인합니다. 정밀도를 높이려면 사분면을 다시 하위 사분면으로 나누고 상위 값에 하위 값을 이어 붙입니다. `2dsphere` 인덱스는 `mongod` 가 GeoJSON 도형을 내부 표현으로 변환해 색인하는데, 그 결과가 큰 값의 배열이 될 수 있습니다. 그래서 서버는 도큐먼트 하나가 만들 수 있는 인덱스 키 개수를 `indexMaxNumGeneratedKeysPerDocument` 로 제한합니다. 기본값은 키 10만 개이고, 이보다 많은 키를 요구하는 연산은 실패합니다.

한때 `geoHaystack` 인덱스도 있었지만 MongoDB 5.0에서 제거됐습니다. 공식 문서는 대신 `2d` 인덱스를 쓰라고 안내하고, 5.0으로 올린 뒤 `featureCompatibilityVersion` 을 `5.0` 으로 설정하면 남아 있던 `geoHaystack` 인덱스가 삭제된다고 적습니다. 같은 릴리스에서 `geoSearch` 명령도 제거됐고, 대안은 공간 쿼리 연산자 중 하나입니다.

`2dsphere` 인덱스에는 버전이 있습니다. 2.4에 버전 1이 나왔고, 2.6에서 버전 2가, 3.2에서 버전 3이 도입됐습니다. MongoDB 8.0 문서 기준으로 3.2 이후에 만드는 `2dsphere` 인덱스는 버전 3이 기본값입니다. 공식 문서는 호환성 때문에 필요한 경우가 아니면 항상 기본 버전을 쓰라고 권고합니다.

## GeoJSON 데이터 타입

MongoDB는 공간 데이터를 [GeoJSON](https://geojson.org/) 타입으로 저장합니다. GeoJSON 오브젝트를 대상으로 하는 공간 쿼리는 항상 구체 기반으로 계산하며, 이때 MongoDB는 WGS84 기준계를 사용합니다.

위치 정보는 보통 GPS로 받는 위도·경도 좌표입니다. 좌표 체계는 WGS84 하나만 있는 것이 아니라 국가별로 자국 특성을 반영해 설계한 것들이 여럿 있습니다. 이런 좌표 체계를 SRS(Spatial Reference System) 또는 CRS(Coordinate Reference System)라고 부르고, 특정 좌표계를 가리키는 식별자를 SRID(Spatial Reference System Identifier)라고 합니다. MongoDB의 공간 쿼리는 이 가운데 전 세계를 한 번에 나타낼 수 있는 [WGS84](https://spatialreference.org/ref/epsg/4326/)를 기준으로 동작합니다.

MongoDB가 지원하는 GeoJSON 오브젝트는 일곱 가지입니다.

- Point
- LineString
- Polygon
- MultiPoint
- MultiLineString
- MultiPolygon
- GeometryCollection

이 가운데 뒤의 네 가지(MultiPoint, MultiLineString, MultiPolygon, GeometryCollection)는 `2dsphere` 인덱스 버전 2 이상을 요구합니다. 버전 3이 기본값이므로 별도로 버전을 낮추지 않았다면 일곱 가지 모두 쓸 수 있습니다.

GeoJSON 포맷은 서브 도큐먼트 형태이며 `type` 과 `coordinates` 필드를 갖습니다. `coordinates` 는 배열 타입이고 **항상 경도(longitude)를 먼저, 위도(latitude)를 나중에** 배치합니다. 경도는 -180에서 180 사이, 위도는 -90에서 90 사이여야 합니다. 이 좌표는 구체를 따라 감기므로 -179.9와 179.9는 서로 가까운 이웃입니다.

```json
location: {
      type: "Point",
      coordinates: [-73.856077, 40.848447]
}
```

이 서브 도큐먼트가 도큐먼트 안에 들어갑니다. 나머지 타입의 적재 예시는 다음과 같습니다.

GeoJSON LineString

```json
{
  type: "LineString",
  coordinates: [ [ 40, 5 ], [ 41, 6 ] ]
}
```

GeoJSON Polygon

```json
{
  type: "Polygon",
  coordinates: [ [ [ 0 , 0 ] , [ 3 , 6 ] , [ 6 , 1 ] , [ 0 , 0  ] ] ]
}
```

Polygon의 각 링은 최소 네 개의 좌표쌍을 가진 닫힌 LineString(LinearRing)이어야 하고, 첫 좌표와 마지막 좌표가 같아야 합니다. 링이 하나면 스스로 교차할 수 없습니다. 링이 여러 개면 첫 링이 외곽 링이고, 내부 링은 외곽 링 안에 완전히 들어가야 하며 서로 교차하거나 겹치거나 변을 공유할 수 없습니다.

GeoJSON MultiPoint

```json
{
  type: "MultiPoint",
  coordinates: [
     [ -73.9580, 40.8003 ],
     [ -73.9498, 40.7968 ],
     [ -73.9737, 40.7648 ],
     [ -73.9814, 40.7681 ]
  ]
}
```

GeoJSON MultiLineString

```json
{
  type: "MultiLineString",
  coordinates: [
     [ [ -73.96943, 40.78519 ], [ -73.96082, 40.78095 ] ],
     [ [ -73.96415, 40.79229 ], [ -73.95544, 40.78854 ] ],
     [ [ -73.97162, 40.78205 ], [ -73.96374, 40.77715 ] ],
     [ [ -73.97880, 40.77247 ], [ -73.97036, 40.76811 ] ]
  ]
}
```

GeoJSON MultiPolygon

```json
{
  type: "MultiPolygon",
  coordinates: [
     [ [ [ -73.958, 40.8003 ], [ -73.9498, 40.7968 ], [ -73.9737, 40.7648 ], [ -73.9814, 40.7681 ], [ -73.958, 40.8003 ] ] ],
     [ [ [ -73.958, 40.8003 ], [ -73.9498, 40.7968 ], [ -73.9737, 40.7648 ], [ -73.958, 40.8003 ] ] ]
  ]
}
```

GeoJSON GeometryCollection

```json
{
  type: "GeometryCollection",
  geometries: [
     {
       type: "MultiPoint",
       coordinates: [
          [ -73.9580, 40.8003 ],
          [ -73.9498, 40.7968 ],
          [ -73.9737, 40.7648 ],
          [ -73.9814, 40.7681 ]
       ]
     },
     {
       type: "MultiLineString",
       coordinates: [
          [ [ -73.96943, 40.78519 ], [ -73.96082, 40.78095 ] ],
          [ [ -73.96415, 40.79229 ], [ -73.95544, 40.78854 ] ],
          [ [ -73.97162, 40.78205 ], [ -73.96374, 40.77715 ] ],
          [ [ -73.97880, 40.77247 ], [ -73.97036, 40.76811 ] ]
       ]
     }
  ]
}
```

GeometryCollection은 여러 타입의 GeoJSON 오브젝트를 한 도큐먼트에 담는 타입입니다. 다른 타입과 달리 `coordinates` 대신 `geometries` 필드를 씁니다.

## 공간 인덱스 만들기

공간 인덱스를 만드는 기본 명령입니다.

```javascript
db.collection.createIndex( { <location field> : "2dsphere" } )
```

레거시 좌표쌍을 다뤄야 한다면 `"2d"` 를 지정합니다. 여기서는 `2dsphere` 만 다룹니다.

공간 데이터를 적재합니다. `db.collection.insert()` 는 mongosh에서 deprecated로 표시돼 있어서 `insertOne()` 을 씁니다.

```javascript
db.places.insertOne(
   {
      loc : { type: "Point", coordinates: [ -73.97, 40.77 ] },
      name: "Central Park",
      category : "Parks"
   }
)
db.places.insertOne(
   {
      loc : { type: "Point", coordinates: [ -73.88, 40.78 ] },
      name: "La Guardia Airport",
      category : "Airport"
   }
)
```

공간 정보가 담긴 필드에 인덱스를 만듭니다.

```javascript
db.places.createIndex( { loc : "2dsphere" } )
```

`2dsphere` 인덱스를 건 필드에는 GeoJSON 데이터나 레거시 좌표쌍, 즉 도형 데이터만 들어갈 수 있습니다. 도형이 아닌 값을 그 필드에 넣으려 하면 실패하고, 도형이 아닌 값이 이미 들어 있는 필드에는 `2dsphere` 인덱스를 만들 수 없습니다.

> **NOTE** — 공간 인덱스는 항상 sparse 입니다. `sparse` 옵션을 지정해도 MongoDB가 무시합니다. 인덱스 대상 필드가 없거나 `null` 이거나 빈 배열인 도큐먼트는 인덱스 엔트리를 갖지 않습니다.

## 컴파운드 인덱스

일반 필드와 공간 필드를 묶어 컴파운드 인덱스를 만들 수 있습니다.

```javascript
db.places.insertOne({
  name: "카페",
  type: "coffee",
  loc: { type: "Point",
         coordinates: [127.044521, 37.555363] }
})

db.places.insertOne({
  name: "식당",
  type: "restaurant",
  loc: { type: "Point",
         coordinates: [126.975164, 37.555922] }
})
```

이런 데이터라면 다음과 같이 컴파운드 인덱스를 만들 수 있습니다.

```javascript
db.places.createIndex( { type: 1, loc: "2dsphere" } )
```

카페나 식당으로 검색 조건을 좁히면 필요 없는 데이터를 걸러낸 뒤 공간 조건을 적용할 수 있습니다.

컴파운드 인덱스를 만들 때 두 타입의 차이가 드러납니다. 컴파운드 `2dsphere` 인덱스는 위치 필드와 위치가 아닌 필드를 여러 개 참조할 수 있습니다. 반면 컴파운드 `2d` 인덱스는 위치 필드 하나와 다른 필드 하나만 참조할 수 있고, 첫 필드가 위치 필드여야 합니다. 어느 쪽이든 도큐먼트를 인덱스에 올릴지 결정하는 것은 공간 필드뿐입니다.

## 공간 데이터를 조회하는 방법

공간 쿼리에 쓰는 연산자는 `$geoIntersects`, `$geoWithin`, `$near`, `$nearSphere` 네 가지이고, 집계 파이프라인에는 `$geoNear` 스테이지가 있습니다. 인덱스 요구 조건이 서로 다릅니다.

| 연산자 | 공간 인덱스 | 비고 |
| --- | --- | --- |
| `$near` | 필수 | GeoJSON 점은 `2dsphere`, 레거시 좌표쌍은 `2d` |
| `$nearSphere` | 필수 | 거리순으로 정렬된 결과를 반환합니다 |
| `$geoWithin` | 불필요 | 인덱스가 있으면 성능이 좋아집니다 |
| `$geoIntersects` | 불필요 | `2dsphere` 인덱스가 지원합니다 |
| `$geoNear` | 필수 | 집계 파이프라인의 첫 스테이지여야 합니다 |

`$near` 와 `$nearSphere` 는 공간 인덱스를 요구합니다. 둘 다 결과를 거리순으로 정렬해서 돌려주는데, 여기에 `sort()` 를 걸면 MongoDB가 정렬을 한 번 더 수행합니다. 큰 컬렉션에서는 이 두 번째 정렬이 성능을 떨어뜨립니다. 순서가 중요하지 않다면 정렬하지 않는 `$geoWithin` 을 쓰는 편이 낫습니다. 또 두 연산자는 특수 인덱스를 요구하기 때문에 다른 특수 인덱스를 요구하는 연산자와 함께 쓸 수 없습니다. `$text` 와 조합하는 것이 그 예입니다. 두 연산자는 매치 실행(Match Execution) 연산자라서 집계 파이프라인에서는 쓸 수 없습니다. 집계에서 근접 검색이 필요하면 `$geoNear` 스테이지를 씁니다.

> **NOTE** — MongoDB 8.0부터 `$near`, `$nearSphere`, `$geoNear` 는 지정한 GeoJSON 점의 타입이 `Point` 인지 검증합니다. 다른 타입을 넘기면 에러를 반환합니다.

`$geoWithin` 은 공간 인덱스를 요구하지 않습니다. 다만 인덱스가 있으면 쿼리 성능이 나아지고, `2dsphere` 와 `2d` 모두 `$geoWithin` 을 지원합니다.

GeoJSON 오브젝트를 조건으로 줄 때는 `$geometry` 로 감쌉니다.

```json
{
   <location field>: {
      $geoWithin: {
         $geometry: {
            type: <"Polygon" or "MultiPolygon"> ,
            coordinates: [ <coordinates> ]
         }
      }
   }
}
```

레거시 좌표쌍을 평면에서 다룰 때는 `$geometry` 대신 도형 연산자(shape operator)를 씁니다. 쓸 수 있는 도형 연산자는 `$box`, `$polygon`, 원을 정의하는 `$center`, 구체 위의 원을 정의하는 `$centerSphere` 네 가지입니다. 거리 제한은 `$near` 와 `$nearSphere` 에 `$maxDistance` 와 `$minDistance` 로 줍니다. `$maxDistance` 는 두 인덱스 모두에서 쓸 수 있고, `$minDistance` 는 `2dsphere` 인덱스를 쓰는 쿼리에서만 쓸 수 있습니다. 거리 단위는 GeoJSON 점이면 미터, 레거시 좌표쌍이면 라디안입니다. `$uniqueDocs` 는 현행 공간 쿼리 연산자 목록에 없습니다.

`$geoNear` 는 집계 파이프라인 스테이지이고 공간 인덱스를 요구합니다. 파이프라인의 첫 스테이지여야 하며, 계산한 거리를 담을 필드를 `distanceField` 로 반드시 지정해야 합니다. 컬렉션에 공간 인덱스가 둘 이상 있으면 어느 필드로 거리를 계산할지 `key` 옵션으로 지정해야 하고, 지정하지 않으면 에러가 납니다. 공간 인덱스가 하나뿐이면 그 필드를 암묵적으로 사용합니다.

> **WARNING** — 링이 하나인 Polygon의 면적이 반구보다 크면 MongoDB의 커스텀 CRS(`urn:x-mongodb:crs:strictwinding:EPSG:4326`)를 반시계 방향 권선으로 함께 지정해야 합니다. 지정하지 않으면 `$geoWithin` 이 여집합 도형을 대상으로 쿼리합니다. 링이 여러 개인 Polygon이나 MultiPolygon은 면적이 반구보다 크면 항상 여집합 도형을 대상으로 쿼리합니다.

## 제약 사항

공간 인덱스에는 알아 둘 제약이 몇 가지 있습니다.

- 공간 인덱스는 쿼리를 커버할 수 없습니다.
- 공간 인덱스를 샤드 키로 쓸 수 없습니다. 다른 필드를 샤드 키로 삼으면 샤딩된 컬렉션에도 공간 인덱스를 만들 수 있습니다.
- `2d` 인덱스는 collation 옵션을 지원하지 않고 바이너리 비교만 합니다. simple 이 아닌 collation을 가진 컬렉션에 `2d` 인덱스를 만들려면 `{ collation: { locale: "simple" } }` 을 명시해야 합니다.
- `2d` 인덱스는 좌표쌍 완전 일치 검색의 성능을 개선하지 못합니다. 그런 쿼리에는 해당 필드에 일반 오름차순·내림차순 인덱스를 만드는 편이 낫습니다.
- 시계열 컬렉션에서는 `$near` 와 `$nearSphere` 를 쓸 수 없습니다. `2dsphere` 인덱스를 대상으로 공간 데이터를 정렬하려면 `$geoNear` 스테이지를 써야 합니다.

## 참고 자료

MongoDB Manual: [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/)

Geospatial Queries: [https://www.mongodb.com/docs/manual/geospatial-queries/](https://www.mongodb.com/docs/manual/geospatial-queries/)

도서: Real MongoDB

도서: MongoDB 완벽가이드
