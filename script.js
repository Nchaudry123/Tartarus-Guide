const canvas = document.getElementById("earthCanvas");
const experience = document.getElementById("experience");
const locationPin = document.getElementById("locationPin");
const locationReadout = document.getElementById("locationReadout");
const pinLabel = document.getElementById("pinLabel");
const phaseLabel = document.getElementById("phaseLabel");
const altitudeLabel = document.getElementById("altitudeLabel");
const rootStyle = document.documentElement.style;

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
window.scrollTo(0, 0);

const fallbackLocation = {
  lat: 37.7749,
  lon: -122.4194,
  accuracy: null,
  label: "San Francisco preview",
};

const state = {
  lat: fallbackLocation.lat,
  lon: fallbackLocation.lon,
  accuracy: fallbackLocation.accuracy,
  hasPreciseLocation: false,
  scroll: 0,
  side: "origin",
  flipProgress: 0,
  flipTarget: 0,
};

const hasThree = Boolean(window.THREE);
let scene;
let camera;
let renderer;
let earthGroup;
let globe;
let clouds;
let atmosphere;
let stars;
let nebula;
let orbitLines;
let sunGlow;
let nightLights;
let marker;
let markerGlow;
let startQuaternion;
let targetQuaternion;

if (hasThree) {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x020307, 1);

  earthGroup = new THREE.Group();
  scene.add(earthGroup);
  startQuaternion = new THREE.Quaternion();
  targetQuaternion = new THREE.Quaternion();

  globe = new THREE.Mesh(
    new THREE.SphereGeometry(2.05, 224, 224),
    new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x24496b,
      shininess: 24,
      normalScale: new THREE.Vector2(0.75, 0.75),
    })
  );
  earthGroup.add(globe);

  nightLights = new THREE.Mesh(
    new THREE.SphereGeometry(2.055, 192, 192),
    new THREE.MeshBasicMaterial({
      color: 0xffd9a3,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  earthGroup.add(nightLights);

  clouds = new THREE.Mesh(
    new THREE.SphereGeometry(2.078, 160, 160),
    new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    })
  );
  earthGroup.add(clouds);

  atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(2.14, 128, 128),
    new THREE.MeshBasicMaterial({
      color: 0x82c9ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
    })
  );
  earthGroup.add(atmosphere);

  stars = createStarfield();
  scene.add(stars);
  nebula = createSpaceDust();
  scene.add(nebula);
  sunGlow = createSunGlow();
  scene.add(sunGlow);
  orbitLines = createOrbitLines();
  earthGroup.add(orbitLines);

  marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  earthGroup.add(marker);

  markerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0xf6d48f,
      transparent: true,
      opacity: 0.5,
    })
  );
  earthGroup.add(markerGlow);

  const sun = new THREE.DirectionalLight(0xffffff, 2.75);
  sun.position.set(-3.2, 2.1, 4.9);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x58718e, 0.36));

  const textureLoader = new THREE.TextureLoader();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  loadTexture(textureLoader, "./assets/earth-day-8k.jpg", (texture) => {
    prepareTexture(texture, maxAnisotropy, true);
    globe.material.map = texture;
    globe.material.needsUpdate = true;
    document.body.classList.add("three-ready");
  });
  loadTexture(textureLoader, "./assets/earth-night-8k.jpg", (texture) => {
    prepareTexture(texture, maxAnisotropy, true);
    nightLights.material.map = texture;
    nightLights.material.needsUpdate = true;
  });
  loadTexture(textureLoader, "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg", (texture) => {
    prepareTexture(texture, maxAnisotropy, false);
    globe.material.specularMap = texture;
    globe.material.needsUpdate = true;
  });
  loadTexture(textureLoader, "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg", (texture) => {
    prepareTexture(texture, maxAnisotropy, false);
    globe.material.normalMap = texture;
    globe.material.needsUpdate = true;
  });
  loadTexture(textureLoader, "./assets/earth-clouds-8k.jpg", (texture) => {
    prepareTexture(texture, maxAnisotropy, true);
    clouds.material.map = texture;
    clouds.material.needsUpdate = true;
  });
}

function prepareTexture(texture, anisotropy, useColorEncoding) {
  if (useColorEncoding) {
    texture.encoding = THREE.sRGBEncoding;
  }
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
}

function createStarfield() {
  const group = new THREE.Group();
  group.add(createStarLayer(5200, 0.014, 0.62, 18, 44));
  group.add(createStarLayer(1500, 0.026, 0.78, 11, 28));
  group.add(createStarLayer(260, 0.052, 0.88, 8, 18));
  return group;
}

function createStarLayer(count, size, opacity, minRadius, maxRadius) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const offset = index * 3;
    positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
    positions[offset + 1] = radius * Math.cos(phi);
    positions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta) - 7;

    const warmth = Math.random();
    colors[offset] = 0.72 + warmth * 0.28;
    colors[offset + 1] = 0.78 + warmth * 0.18;
    colors[offset + 2] = 0.9 + warmth * 0.1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
}

function createSpaceDust() {
  const group = new THREE.Group();
  const texture = createDustTexture();
  const placements = [
    { x: -5.8, y: 2.2, z: -8.4, scale: 7.8, opacity: 0.18, rotation: -0.35 },
    { x: 5.2, y: -1.6, z: -9.5, scale: 9.5, opacity: 0.12, rotation: 0.24 },
    { x: 0.4, y: 4.1, z: -10.8, scale: 8.8, opacity: 0.09, rotation: 0.08 },
  ];

  placements.forEach((placement) => {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0x9fb7d1,
      transparent: true,
      opacity: placement.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(placement.x, placement.y, placement.z);
    sprite.scale.set(placement.scale, placement.scale * 0.55, 1);
    sprite.material.rotation = placement.rotation;
    group.add(sprite);
  });

  return group;
}

function createOrbitLines() {
  const group = new THREE.Group();
  const rings = [
    { radius: 2.23, opacity: 0.18, rotation: [0.6, 0.05, 0.12] },
    { radius: 2.34, opacity: 0.12, rotation: [1.05, -0.3, -0.18] },
    { radius: 2.5, opacity: 0.08, rotation: [0.25, 0.84, 0.34] },
  ];

  rings.forEach((ring) => {
    const points = [];
    for (let index = 0; index <= 192; index += 1) {
      const angle = (index / 192) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xb7dbff,
      transparent: true,
      opacity: ring.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.rotation.set(...ring.rotation);
    group.add(line);
  });

  return group;
}

function createSunGlow() {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 512;
  glowCanvas.height = 512;
  const context = glowCanvas.getContext("2d");
  const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.16, "rgba(255,232,184,0.32)");
  gradient.addColorStop(0.42, "rgba(118,178,255,0.1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.encoding = THREE.sRGBEncoding;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.54,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  sprite.position.set(-4.6, 3.3, -5.2);
  sprite.scale.set(4.6, 4.6, 1);
  return sprite;
}

function createDustTexture() {
  const size = 512;
  const dustCanvas = document.createElement("canvas");
  dustCanvas.width = size;
  dustCanvas.height = size;
  const context = dustCanvas.getContext("2d");

  const gradient = context.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.26)");
  gradient.addColorStop(0.35, "rgba(130, 168, 214, 0.12)");
  gradient.addColorStop(0.7, "rgba(60, 84, 120, 0.035)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  for (let i = 0; i < 700; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const alpha = Math.random() * 0.045;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(dustCanvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function loadTexture(loader, url, onLoad) {
  loader.load(url, onLoad, undefined, () => {
    if (url.includes("earth-day")) {
      document.body.classList.remove("three-ready");
    }
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function normalizeLongitude(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function antipode(lat, lon) {
  return {
    lat: -lat,
    lon: normalizeLongitude(lon + 180),
  };
}

function interpolateLongitude(start, end, amount) {
  const delta = normalizeLongitude(end - start);
  return normalizeLongitude(start + delta * amount);
}

function formatCoord(value, axis) {
  const suffix = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(5)} ${suffix}`;
}

function latLonToVector3(lat, lon, radius = 2.09) {
  if (!hasThree) return null;
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function activeTarget() {
  const anti = antipode(state.lat, state.lon);
  const antiProgress = easeInOut(state.flipProgress);

  if (antiProgress <= 0) {
    return {
      lat: state.lat,
      lon: state.lon,
      label: "your location",
      coords: `${formatCoord(state.lat, "lat")}, ${formatCoord(state.lon, "lon")}`,
      isAntipode: false,
    };
  }

  return {
    lat: lerp(state.lat, anti.lat, antiProgress),
    lon: interpolateLongitude(state.lon, anti.lon, antiProgress),
    label: antiProgress > 0.72 ? "antipode" : "crossing through Earth",
    coords: `${formatCoord(anti.lat, "lat")}, ${formatCoord(anti.lon, "lon")}`,
    isAntipode: antiProgress > 0.72,
  };
}

function targetRotationFor(lat, lon) {
  if (!hasThree) return null;
  const surface = latLonToVector3(lat, lon, 1).normalize();
  return new THREE.Quaternion().setFromUnitVectors(surface, new THREE.Vector3(0, 0, 1));
}

function updateLocationCopy() {
  const anti = antipode(state.lat, state.lon);
  const source = `${formatCoord(state.lat, "lat")}, ${formatCoord(state.lon, "lon")}`;
  const target = `${formatCoord(anti.lat, "lat")}, ${formatCoord(anti.lon, "lon")}`;

  if (state.hasPreciseLocation) {
    const accuracy = state.accuracy ? ` within about ${Math.round(state.accuracy)} m` : "";
    locationReadout.textContent = `Location locked${accuracy}. ${source}.`;
  } else {
    locationReadout.textContent = "Requesting location. Previewing San Francisco until permission is granted.";
  }
}

function updateStageCopy(target) {
  const source = `${formatCoord(state.lat, "lat")}, ${formatCoord(state.lon, "lon")}`;
  const anti = antipode(state.lat, state.lon);
  const antiCoords = `${formatCoord(anti.lat, "lat")}, ${formatCoord(anti.lon, "lon")}`;
  const accuracy = state.accuracy ? ` within about ${Math.round(state.accuracy)} m` : "";

  if (!state.hasPreciseLocation) {
    pinLabel.textContent = target.isAntipode ? "return to preview" : state.scroll > 0.82 ? "open preview antipode" : "preview location";
    locationReadout.textContent = target.isAntipode
      ? `Preview antipode. ${antiCoords}. Click the marker to return.`
      : state.scroll > 0.82
        ? `Preview location. ${source}. Click the marker to see the other side.`
        : `Preview location. ${source}. Allow location access for your exact position.`;
    return;
  }

  pinLabel.textContent = target.isAntipode ? "return to location" : state.scroll > 0.82 ? "open otherside" : target.label;

  if (!target.isAntipode) {
    locationReadout.textContent = state.scroll > 0.82
      ? `Your location${accuracy}. ${source}. Click the marker to reveal the antipode.`
      : `Your location${accuracy}. ${source}.`;
    return;
  }

  locationReadout.textContent = `OtherSide. ${antiCoords}. Click the marker to return to your location.`;
}

function updateMissionHud(target) {
  if (target.isAntipode) {
    phaseLabel.textContent = "otherside";
  } else if (state.flipProgress > 0.04) {
    phaseLabel.textContent = "transit";
  } else {
    phaseLabel.textContent = state.hasPreciseLocation ? "origin" : "preview";
  }

  if (state.scroll < 0.28) {
    altitudeLabel.textContent = "high orbit";
  } else if (state.scroll < 0.74) {
    altitudeLabel.textContent = "approach";
  } else {
    altitudeLabel.textContent = "surface hover";
  }
}

function toggleOtherSide() {
  if (state.scroll < 0.82) return;
  state.side = state.side === "origin" ? "antipode" : "origin";
  state.flipTarget = state.side === "antipode" ? 1 : 0;
}

function setLocation(lat, lon, accuracy = null, precise = true) {
  state.lat = clamp(lat, -90, 90);
  state.lon = normalizeLongitude(lon);
  state.accuracy = accuracy;
  state.hasPreciseLocation = precise;
  if (marker && markerGlow) {
    marker.position.copy(latLonToVector3(state.lat, state.lon));
    markerGlow.position.copy(marker.position);
  }
  updateLocationCopy();
}

function requestLocation() {
  if (!navigator.geolocation) {
    locationReadout.textContent = "Geolocation is unavailable. Showing a San Francisco preview.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      setLocation(latitude, longitude, accuracy, true);
    },
    () => {
      setLocation(fallbackLocation.lat, fallbackLocation.lon, null, false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 14000,
    }
  );
}

function updateScrollProgress() {
  const distance = experience.offsetHeight - window.innerHeight;
  state.scroll = clamp(window.scrollY / Math.max(distance, 1), 0, 1);
  const drift = easeInOut(state.scroll);
  const uiReveal = easeInOut(clamp((state.scroll - 0.12) / 0.32, 0, 1));
  const journeyProgress = state.scroll * (1 - state.flipProgress) + state.flipProgress;
  rootStyle.setProperty("--scroll-progress", state.scroll.toFixed(4));
  rootStyle.setProperty("--journey-progress", journeyProgress.toFixed(4));
  rootStyle.setProperty("--ui-reveal", uiReveal.toFixed(4));
  rootStyle.setProperty("--space-drift", `${(-42 + drift * 84).toFixed(2)}px`);
}

function resize() {
  if (!renderer || !camera) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function projectMarker() {
  if (!marker || !camera) {
    locationPin.classList.toggle("is-visible", state.scroll > 0.72 && state.hasPreciseLocation);
    return;
  }
  const worldPosition = new THREE.Vector3();
  marker.getWorldPosition(worldPosition);
  const projected = worldPosition.clone().project(camera);
  const focus = easeInOut(clamp((state.scroll - 0.5) / 0.5, 0, 1));
  const projectedX = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const projectedY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  const x = projectedX * (1 - focus) + window.innerWidth * 0.5 * focus;
  const y = projectedY * (1 - focus) + window.innerHeight * 0.48 * focus;
  const visible = state.scroll > 0.5;

  locationPin.style.left = `${clamp(x, 26, window.innerWidth - 26)}px`;
  locationPin.style.top = `${clamp(y, 26, window.innerHeight - 26)}px`;
  locationPin.classList.toggle("is-visible", visible);
}

function render() {
  updateScrollProgress();

  if (!renderer || !scene || !camera) {
    requestAnimationFrame(render);
    return;
  }

  state.flipProgress += (state.flipTarget - state.flipProgress) * 0.055;
  if (Math.abs(state.flipTarget - state.flipProgress) < 0.001) {
    state.flipProgress = state.flipTarget;
  }

  const travel = easeInOut(state.scroll);
  const locate = easeInOut(clamp(state.scroll / 0.96, 0, 1));
  const flipEase = easeInOut(state.flipProgress);
  const introSpin = (1 - locate) * (Math.PI * 2.15) + flipEase * Math.PI * 0.55;
  const targetPoint = activeTarget();
  const target = targetRotationFor(targetPoint.lat, targetPoint.lon);

  if (marker && markerGlow) {
    marker.position.copy(latLonToVector3(targetPoint.lat, targetPoint.lon));
    markerGlow.position.copy(marker.position);
  }

  camera.position.z = 3.42 + Math.sin(Math.min(state.scroll, 0.32) / 0.32 * Math.PI) * 0.9 + locate * 0.32 + Math.sin(flipEase * Math.PI) * 0.76;
  camera.position.y = 1.56 - travel * 1.18 + Math.sin(flipEase * Math.PI) * 0.14;
  earthGroup.position.y = -1.96 + travel * 1.42;
  earthGroup.scale.setScalar(1.5 - travel * 0.06 - Math.sin(flipEase * Math.PI) * 0.08);
  startQuaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(72), introSpin, 0, "XYZ"));
  targetQuaternion.copy(target);
  earthGroup.quaternion.slerpQuaternions(startQuaternion, targetQuaternion, locate);
  clouds.rotation.y += 0.00075;
  orbitLines.rotation.z += 0.0005;
  orbitLines.children.forEach((line, index) => {
    line.material.opacity = (0.05 + (1 - locate) * 0.1) * (1 - index * 0.18);
  });
  nightLights.material.opacity = 0.07 + (1 - locate) * 0.08;
  atmosphere.material.opacity = 0.14 + locate * 0.04;
  stars.rotation.y += 0.00008 + state.scroll * 0.00008;
  stars.rotation.x = travel * -0.045;
  nebula.rotation.z = travel * 0.035;
  nebula.position.x = (state.scroll - 0.5) * -0.42;
  nebula.position.y = travel * 0.18;
  sunGlow.material.opacity = 0.42 - travel * 0.12;
  sunGlow.position.x = -4.6 + travel * 0.42;
  marker.visible = locate > 0.42;
  markerGlow.visible = marker.visible;

  updateStageCopy(targetPoint);
  updateMissionHud(targetPoint);
  projectMarker();
  locationPin.classList.toggle("is-ready", state.scroll > 0.82 && state.flipProgress < 0.02);
  locationPin.setAttribute("aria-label", state.side === "origin" ? "Go to the other side" : "Return to your location");
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener("resize", resize);
window.addEventListener("scroll", updateScrollProgress, { passive: true });
locationPin.addEventListener("click", toggleOtherSide);

setLocation(fallbackLocation.lat, fallbackLocation.lon, null, false);
resize();
requestLocation();
render();
