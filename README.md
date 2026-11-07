# MapDrive

3D car driving on real cities. It works **out of the box with no API key**, using OpenStreetMap 3D buildings, or
with **Google Photorealistic 3D Tiles** (the Google Earth mesh) if you have a Cesium ion token or a Google key.

- OpenStreetMap buildings, roads, water and parks from [OpenFreeMap](https://openfreemap.org) vector tiles (free, no key),
  decoded with [@mapbox/vector-tile](https://github.com/mapbox/vector-tile-js) in a Web Worker
- Three.js + [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) (NASA-AMMOS) to stream the 3D tiles
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) for fast raycasts against the city mesh, which power ground following and wall collisions
- Ferrari 458 model from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf)
- OSM services: OSRM (snap to road), Nominatim (search / street names), Leaflet + OSM tiles (minimap)

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/ (deploy to Vercel, Netlify, GitHub Pages…)
npm test           # physics, spawn and helper unit tests (Vitest, no browser needed)
npm run lint       # ESLint
npm run check      # lint + test + build: run before committing
```

Pick a map source on the setup screen:

| Option | How to get it | Cost |
|---|---|---|
| **OpenStreetMap** (default) | Nothing: just press Start | Free, no key, no sign-up |
| **Google Maps API key** | Google Cloud Console → enable **Map Tiles API** → Credentials → API key | Billing account required. Has a monthly free tier; check the current Map Tiles pricing |
| **Cesium ion token** | Free account at ion.cesium.com → Asset Depot → add **Google Photorealistic 3D Tiles** (asset 2275207) → Access Tokens | Free community tier (with usage limits) |

The Google and Cesium options are optional. You can also put the key in `.env.local` (see `.env.example`) so it is pre-filled.
The key is stored only in the browser's localStorage.

> Restrict the Google key to your own domain (HTTP referrers) in the Cloud Console,
> because the key is visible in the browser.

## Controls

| Key | Action |
|---|---|
| W / ↑ | gas |
| S / ↓ | brake, then reverse |
| A D / ← → | steer |
| Space | handbrake (drift) |
| Shift | boost |
| C | camera: chase / far / bumper / drone |
| R | reset the car onto the nearest road |
| G | ghost mode (drive through walls and trees) |
| P | change paint |
| M | mute |
| H | hide help |
| Mouse drag | look around |
| Minimap click | teleport there |
| Search box | go to any place (Enter) |

A gamepad is also supported: RT gas, LT brake, left stick steer, A handbrake, X boost.

## How it works

```
src/
  main.js                 entry: setup screen -> Game
  config.js               presets, quality levels, saved settings
  game/
    Game.js               wires everything together, runs the frame loop
    Spawner.js            teleport: snap to road -> re-centre world -> wait for tiles -> release car
    ChaseCamera.js        chase / far / bumper / drone camera, keeps out of walls
    Input.js              keyboard + gamepad -> Controls snapshot
    StreetNameTracker.js  throttled reverse-geocoding while driving
    createStage.js        renderer, scene, sky, fog, lights
  vehicle/
    CarPhysics.js         arcade simulation (no rendering, unit-tested)
    CarModel.js           Ferrari glTF, materials, wheels; mirrors CarPhysics each frame
    CarAudio.js           synthesized engine / screech / crash sounds
    gearbox.js            virtual gears for the sound and the HUD
  world/
    providers.js          OSM / Google / Cesium ion: each builds its world; add a provider here
    World.js              Google 3D tiles streaming, ray queries, lat/lon <-> local frame
    lazyBvh.js            builds a BVH only for meshes that rays actually reach
    osm/
      OsmWorld.js         same interface as World, built from OpenStreetMap vector tiles
      osmTile.worker.js   fetch + decode + triangulate tiles off the main thread
      tileGeometry.js     extruded buildings (outward walls, roofs), road ribbons, water, parks
      projection.js       local tangent plane + Web Mercator tile math
  services/geo.js         OSRM + Nominatim calls
  ui/                     Hud, SetupScreen, SearchBox, Minimap, DOM helpers
test/                     Vitest specs + a fake world (ground, wall, ramp, wedge) for the physics
```

- **Local frame:** both worlds put the spawn point at the origin with +Y up, +Z north and +X west, so driving happens
  in an ordinary flat-ish frame. Google tiles do this with `ReorientationPlugin`; OSM uses a local tangent plane.
- **OSM world:** streams zoom-14 tiles within 2 km of the camera and unloads them past 3 km. The ground is a flat plane
  at y = 0, so there are no hills in this mode. Buildings use their mapped `render_height`. Unmapped areas are mostly
  flat roads.
- **CarPhysics:** a bicycle model handles steering, grip and handbrake drift, plus engine, brake and drag. Each frame
  it casts 4 rays down (one per wheel) for ride height, pitch and roll, and 5 rays forward across the leading bumper.
  Anything steeper than about 57° counts as a wall, so the car slides along it. All it needs from the world is
  `cast(origin, direction, far)`, which is how the tests drive it on a fake world.
- **Adding a tile provider:** add an entry to `world/providers.js` and a key field with `data-provider` /
  `data-setting` attributes in `index.html`. Nothing else branches on the provider.

In the Google mode, the photogrammetry is one merged mesh, with no separate "road" or "building" objects. Parked cars, trees and
overpasses are solid bumps, so use **G (ghost)** or **R (reset)** when you get stuck.

## Attribution / terms

- Google 3D Tiles: show the Google logo and the data attributions that the app displays at the bottom left. Read
  the [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies) before you publish.
  Tile content must not be cached or downloaded beyond what the policies allow.
- OpenStreetMap data: © OpenStreetMap contributors (ODbL), served by OpenFreeMap with the OpenMapTiles schema. Keep the
  credit line the app shows at the bottom left.
- OSM tiles, Nominatim and OSRM are shared community servers, fine for personal or demo use. For real traffic, use
  your own instance or a commercial provider (MapTiler, Stadia, etc.).
- The Ferrari 458 Italia model by vicent091036 on Sketchfab, as used in the three.js examples. Check the license on
  Sketchfab before you use it commercially.
