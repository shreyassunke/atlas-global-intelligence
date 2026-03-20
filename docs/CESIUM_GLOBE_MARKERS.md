# Cesium globe markers — depth testing

## Hollow Earth bug

If lat/lng **billboards** or **labels** use `disableDepthTestDistance: Number.POSITIVE_INFINITY` (or any value that turns off depth testing for the whole frustum), markers on the **far side** of the globe will draw **through** the Earth.

## Required policy

- Use **`GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE`** from `CesiumGlobe.jsx` (value `0`) for every `BillboardCollection.add()`, `Entity.billboard`, and `Entity.label` that sits on the globe.
- Do **not** use `Number.POSITIVE_INFINITY` here to work around terrain clipping — if markers clip terrain, raise `height` / altitude or adjust terrain settings instead.

## Reference

- [Cesium Billboard#disableDepthTestDistance](https://cesium.com/learn/cesiumjs/ref-doc/Billboard.html#disableDepthTestDistance)
