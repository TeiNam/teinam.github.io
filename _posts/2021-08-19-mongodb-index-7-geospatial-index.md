---
date: 2021-08-19 14:54:52 +0900
title: "MongoDB Index #.7 Geospatial Index"
category: mongodb
excerpt: "이전 포스트 공간 검색 인덱스 (Geospatial Index) MongoDB의 공간 검색 인덱스는 2d와 2dsphere 두 가지 타입의 공간 검색 인덱스를 지원합니다. 2d 인덱스는 2.2버전에 도입되었으나 현재는 거의 사용되지 않고 있습니다. 2d 인덱스의 경우 geohash…"
updated: 2026-09-17
---

이전 포스트

MongoDB Index #.6 TTL Index

이전 포스트   TTL(Time To Live) Index TTL 인덱스는 도큐먼트가 가진 Date 타입의 필드값을 보고 설정된 TTL Monitor 쓰레드의 삭제 주기에 따라 도큐먼트의 유효기간을 체크하여, 더 이상 유효하지 않은 도큐먼트를 자동으로 삭제하는 기능의 인덱스입니다. TTL...

## 공간 검색 인덱스 (Geospatial Index)

MongoDB의 공간 검색 인덱스는 2d와 2dsphere 두 가지 타입의 공간 검색 인덱스를 지원한다. 2d 인덱스는 2.2버전에 도입되었으나 현재는 거의 사용되지 않고 있다. 2d 인덱스는 geohash 알고리즘으로 동작하고, 2dsphere 인덱스는 S2 Geometry 알고리즘으로 동작한다. S2 Geometry는 구글에서 개발한 알고리즘으로 Hilbert curve와 Quad-Tree를 기반으로 한다. MongoDB의 메뉴얼을 보면 geoHaystack Index라는 것도 존재 했으나 거의 사용되지 않아 MongoDB 5.0 버전부터는 기능을 제거하였다. MongoDB의 2dsphere 인덱스는 MongoDB 3.2 버전부터 3버전을 기본 버전으로 채택하고 있다.

S2 Geometry 알고리즘은 나중에 다시 정리하도록 하고, MongoDB에서 사용하는 공간 검색 인덱스를 알아본다. 우선 MongoDB는 공간 데이터를 위해서 [GeoJSON](https://geojson.org/ "https://geojson.org/") 데이터 타입을 사용한다. [GeoJSON](https://geojson.org/ "https://geojson.org/") 데이터 타입을 사용하는 쿼리는 항상 구체(sphere)기반의 계산을 한다. 위치 정보는 일반적으로 GPS로부터 수신받는 위도와 경도 좌표로 구성된 데이터(WGS-84)인데, 위치정보는 WGS-84 뿐만 아니라 국가별로 자국의 특성을 고려해서 설계된 여러 자표 체계가 존재한다. 이러한 좌표 체계를 SRS(Spatial Reference System) 또는 CRS(Coordinate Reference System)라고 하며, 특정 좌표계를 지칭하기 위한 식별자가 정의되어 있는데 이를 SRID(Spatial Reference System Identifier)라고 한다. 현재 MongoDB는 전세계를 한 번에 나타낼 수 있는 [WGS84](https://spatialreference.org/ref/epsg/4326/ "WGS84") 좌표계만 지원한다.

MongoDB에서 지원하는 GeoJSON 오브젝트는 다음과 같다.

- Point (MongoDB 2.4 이상)
- LineString (MongoDB 2.4 이상)
- Polygon (MongoDB 2.4 이상)
- MultiPoint (MongoDB 2.6 이상)
- MultiLineString (MongoDB 2.6 이상)
- MultiPolygon (MongoDB 2.6 이상)
- GeometryCollection (MongoDB 2.6 이상)

2dsphere 인덱스 2버전때부터 지원하던 오브젝트들이며, 3버전이 채택된 이후에도 추가 사항 없이 동일한 오브젝트들을 지원한다. GeoJSON 포맷은 서브 도큐먼트 형태이며, type과 coordinates 필드를 갖는다. coordinates 필드는 배열(Array) 타입으로 항상 경도(longitude)와 위도(latitude) 순서로 배치한다. 경도는 -180에서 180사이, 위도는 -90에서 90 사이의 값으로 정의되어야 한다. 다음은 GeoJSON의 Point 오브젝트에 대한 예시이다.

```json
location: {
      type: "Point",
      coordinates: [-73.856077, 40.848447]
}
```

해당 부분이 도큐먼트 안에 서브 도큐먼트 형식으로 들어가게 된다. 다음은 GeoJSON 오브젝트들의 데이터 적재 예시이다.

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

GeometryCollection은 다양한 타입의 GeoJSON 오브젝트를 하나의 도큐먼트에 넣는 것이다.

### 공간 검색 인덱스 생성하기

공간 인덱스를 생성하는 기본적인 명령어이다.

```bash
db.collection.createIndex( { <location field> : "2dsphere" } )
```

2d는 현재 거의 사용하지 않으니 넘어가겠다.

ex>

공간 데이터 적재

```javascript
db.places.insert(
   {
      loc : { type: "Point", coordinates: [ -73.97, 40.77 ] },
      name: "Central Park",
      category : "Parks"
   }
)
db.places.insert(
   {
      loc : { type: "Point", coordinates: [ -73.88, 40.78 ] },
      name: "La Guardia Airport",
      category : "Airport"
   }
)
```

공간 인덱스 생성

```javascript
db.places.createIndex( { loc : "2dsphere" } )
```

공간 정보가 담긴 필드에 대해 2dsphere 인덱스를 생성하면 된다.

### 컴파운드 인덱스

MongoDB는 일반 컬럼과 GeoJSON 필드의 공간 인덱스를 묶어서 결합 인덱스를 생성한다.

```json
> db.place.insert({
  name: "카페",
  type: "coffee",
  loc: { type: "Point",
         coordinates" [127.044521, 37.555363]}
})

> db.place.insert({
  name: "식당",
  type: "restaurant",
  loc: { type: "Point",
         coordinates" [126.975164, 37.555922]}
})
```

이런 식으로 데이터가 들어간 경우 다음과 같이 복합 인덱스를 만들 수 있다.

```json
> db.places.createIndex( { type: 1, loc: "2dsphere" } )
```

카페나 식당으로 검색 조건을 주었을 때 불필요한 데이터를 제거하고 필요한 조건의 공간 정보를 가져올 수 있어 성능적으로 많은 이득을 볼 수 있다.

### 공간 검색 데이터를 조회하는 방법

공간 검색에서 사용하는 지정자는 여러 가지가 있다.

`$box` , `$center` , `$centerSphere` , `$geometry` , `$maxDistance` , `$minDistance` , `$polygon` , `$uniqueDocs`

공간 지정자들은 앞서 4가지 옵션에서 구동된다.

`$geoIntersects` , `$geoWithin` , `$near` , `$nearSphere`

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

`$geometry`는 GeoJSON 오브젝트 타입을 지정할 때 앞에 놓는다.

그리고 각각의 지정자는 선택자와 결합하여 사용한다.

- `$geoWithin` : `$box`, `$center`, `$centerSphere`, `$polygon`, `$uniqueDocs`
- `$near`, `$nearSphere` : `$maxDistance`, `$minDistance`, `$uniqueDocs`

MongoDB의 공간 검색 인덱스의 성능은 다른 DB에 비해 매우 뛰어난 편이다. 대용량 데이터 셋을 처리하는 데 있어서도 PostGIS보다 나은 성능을 보여준다. 공간 검색 서비스나 지리 정보 서비스 등을 구축해야 한다면 MongoDB가 매우 좋은 선택지가 될 수 있다.

#### 참고 자료

MongoDB Manual: [https://docs.mongodb.com/manual/](https://docs.mongodb.com/manual/ "https://docs.mongodb.com/manual/")

도서: Real MongoDB

도서: MongoDB 완벽가이드
