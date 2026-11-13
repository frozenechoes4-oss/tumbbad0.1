import * as THREE from 'three';

export interface LanternRig {
  group: THREE.Group;
  ambientLight: THREE.PointLight;
  spotLight: THREE.SpotLight;
  spotTarget: THREE.Object3D;
  flameCore: THREE.Mesh;
}

export interface HastarRig {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  head: THREE.Group;
  auraLight: THREE.PointLight;
}

export function buildHandheldLantern(isSoftwareGl: boolean): LanternRig {
  const group = new THREE.Group();
  group.position.set(0.36, -0.32, -0.56);

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0x7c5c28,
    metalness: 0.88,
    roughness: 0.28,
  });

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x1b1613,
    metalness: 0.72,
    roughness: 0.58,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffe4b5,
    roughness: 0.12,
    metalness: 0.0,
    transparent: true,
    opacity: isSoftwareGl ? 0.32 : 0.42,
    depthWrite: false,
  });

  // 1. Base oil saucer (Lathe-like stacked cylinders)
  const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.098, 0.032, 12), brassMat);
  basePlate.position.y = -0.105;
  group.add(basePlate);

  const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.045, 12), darkIronMat);
  reservoir.position.y = -0.07;
  group.add(reservoir);

  // 2. Glass chimney
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.062, 0.135, 12), glassMat);
  glass.position.y = 0.015;
  glass.renderOrder = 2;
  group.add(glass);

  // 3. Four vertical guard ribs
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.155, 6), brassMat);
    rib.position.set(Math.cos(angle) * 0.066, 0.015, Math.sin(angle) * 0.066);
    group.add(rib);
  }

  // 4. Domed chimney cap + bail handle
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.058, 12), brassMat);
  cap.position.y = 0.108;
  group.add(cap);

  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.005, 6, 14, Math.PI), darkIronMat);
  bail.position.y = 0.132;
  group.add(bail);

  // 5. Inner flame core
  const flameCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd26a })
  );
  flameCore.scale.set(0.85, 1.35, 0.85);
  flameCore.position.y = -0.005;
  group.add(flameCore);

  // 6. Warm PointLight + Directional SpotLight
  const ambientLight = new THREE.PointLight(0xff9b3d, 1.4, 12, 1.8);
  ambientLight.position.set(0, 0.04, 0);
  group.add(ambientLight);

  const spotLight = new THREE.SpotLight(0xffae4a, 2.8, 30, Math.PI / 4.8, 0.58, 1.4);
  spotLight.position.set(0, 0.02, 0);
  spotLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    spotLight.shadow.mapSize.set(1024, 1024);
    spotLight.shadow.bias = -0.0005;
    spotLight.shadow.normalBias = 0.02;
  }

  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0, -10);
  group.add(spotLight);

  return { group, ambientLight, spotLight, spotTarget, flameCore };
}

export function buildHastarModel(shadowDiscTex: THREE.Texture): HastarRig {
  const group = new THREE.Group();

  const fleshMat = new THREE.MeshStandardMaterial({
    color: 0x160303,
    emissive: 0x260202,
    emissiveIntensity: 0.9,
    roughness: 0.34,
    metalness: 0.12,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0x3b1f1b,
    roughness: 0.68,
    metalness: 0.05,
  });

  const loinMat = new THREE.MeshStandardMaterial({
    color: 0x120907,
    roughness: 0.92,
    metalness: 0.0,
  });

  // Grounded contact shadow disc
  const shadowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 20),
    new THREE.MeshBasicMaterial({
      map: shadowDiscTex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.02;
  group.add(shadowPlane);

  // Lower pelvis + tattered wrap
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.05, 10), loinMat);
  pelvis.position.y = 0.72;
  pelvis.castShadow = true;
  group.add(pelvis);

  // Hunched gaunt torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.27, 1.65, 10), fleshMat);
  torso.position.set(0, 1.95, 0.08);
  torso.rotation.x = 0.16;
  torso.castShadow = true;
  group.add(torso);

  // Spine/rib ridges along torso
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.34 - i * 0.03, 0.045, 6, 12), boneMat);
    rib.rotation.x = Math.PI / 2 + 0.16;
    rib.position.set(0, 1.6 + i * 0.28, 0.04 + i * 0.03);
    group.add(rib);
  }

  // Shoulders
  const leftShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), fleshMat);
  leftShoulder.position.set(-0.52, 2.65, 0.15);
  const rightShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), fleshMat);
  rightShoulder.position.set(0.52, 2.65, 0.15);
  group.add(leftShoulder, rightShoulder);

  // Articulated Head Group
  const head = new THREE.Group();
  head.position.set(0, 3.12, 0.28);

  const cranium = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 1), fleshMat);
  cranium.scale.set(0.92, 1.15, 1.05);
  cranium.castShadow = true;
  head.add(cranium);

  // Twin curved horn-like ridges
  const hornGeo = new THREE.ConeGeometry(0.08, 0.36, 7);
  const leftHorn = new THREE.Mesh(hornGeo, boneMat);
  leftHorn.position.set(-0.22, 0.38, -0.05);
  leftHorn.rotation.z = 0.38;
  leftHorn.rotation.x = -0.25;
  const rightHorn = new THREE.Mesh(hornGeo, boneMat);
  rightHorn.position.set(0.22, 0.38, -0.05);
  rightHorn.rotation.z = -0.38;
  rightHorn.rotation.x = -0.25;
  head.add(leftHorn, rightHorn);

  // Glowing predatory eyes
  const eyeGeo = new THREE.SphereGeometry(0.068, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a00 });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.15, 0.06, 0.37);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.15, 0.06, 0.37);
  head.add(leftEye, rightEye);

  group.add(head);

  // Elongated dragging arms with clawed hands
  const buildArm = (side: -1 | 1): THREE.Group => {
    const armRoot = new THREE.Group();
    armRoot.position.set(side * 0.56, 2.6, 0.15);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 1.2, 8), fleshMat);
    upperArm.position.set(0, -0.58, 0.1);
    upperArm.rotation.x = -0.2;
    upperArm.castShadow = true;
    armRoot.add(upperArm);

    const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 1.25, 8), fleshMat);
    foreArm.position.set(0, -1.65, 0.34);
    foreArm.rotation.x = -0.35;
    foreArm.castShadow = true;
    armRoot.add(foreArm);

    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.28, 5), boneMat);
      claw.position.set(c * 0.06, -2.28, 0.58);
      claw.rotation.x = -2.5;
      armRoot.add(claw);
    }

    return armRoot;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  group.add(leftArm, rightArm);

  // Eerie crimson aura around Hastar
  const auraLight = new THREE.PointLight(0xff1408, 1.8, 9, 1.6);
  auraLight.position.set(0, 2.4, 0.3);
  group.add(auraLight);

  return { group, leftArm, rightArm, head, auraLight };
}

export function buildMudraCoin(
  coinMat: THREE.MeshStandardMaterial,
  glyphMat: THREE.MeshStandardMaterial,
  shadowDiscTex: THREE.Texture
): { group: THREE.Group; spinMesh: THREE.Group } {
  const group = new THREE.Group();

  // Contact shadow disc
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({
      map: shadowDiscTex,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.68;
  group.add(shadow);

  const spinMesh = new THREE.Group();

  // 1. Main Mudra coin body
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.07, 20), coinMat);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  spinMesh.add(disc);

  // 2. Raised ornate border ring
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.036, 8, 22), coinMat);
  spinMesh.add(rim);

  // 3. Central engraved square sacred seal
  const seal = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.09), glyphMat);
  seal.rotation.z = Math.PI / 4;
  spinMesh.add(seal);

  group.add(spinMesh);

  // 4. Warm golden shimmer point light
  const glow = new THREE.PointLight(0xffc933, 1.25, 5.2, 1.8);
  group.add(glow);

  return { group, spinMesh };
}

export function buildDoughDecoy(): THREE.Group {
  const decoyGroup = new THREE.Group();

  const doughMat = new THREE.MeshStandardMaterial({
    color: 0xe6ca9b,
    roughness: 0.78,
    metalness: 0.02,
  });

  const tilakMat = new THREE.MeshStandardMaterial({
    color: 0xb51a14,
    emissive: 0x500805,
    roughness: 0.5,
  });

  // 1. Sculpted dough torso
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.38, 12), doughMat);
  body.castShadow = true;
  decoyGroup.add(body);

  // 2. Pinched head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), doughMat);
  head.position.y = 0.27;
  head.castShadow = true;
  decoyGroup.add(head);

  // 3. Stubby outstretched arms
  const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.24, 8);
  const leftArm = new THREE.Mesh(armGeo, doughMat);
  leftArm.position.set(-0.18, 0.08, 0);
  leftArm.rotation.z = 1.05;
  const rightArm = new THREE.Mesh(armGeo, doughMat);
  rightArm.position.set(0.18, 0.08, 0);
  rightArm.rotation.z = -1.05;
  decoyGroup.add(leftArm, rightArm);

  // 4. Crimson tilak mark
  const tilak = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), tilakMat);
  tilak.position.set(0, 0.29, 0.13);
  decoyGroup.add(tilak);

  // 5. Warm attraction glow
  const glow = new THREE.PointLight(0xffb347, 1.6, 8, 1.6);
  glow.position.y = 0.35;
  decoyGroup.add(glow);

  return decoyGroup;
}

export function buildCourtyardPillar(
  stoneMat: THREE.MeshStandardMaterial,
  brassMat: THREE.MeshStandardMaterial
): THREE.Group {
  const pillar = new THREE.Group();

  // 1. Stepped plinth base
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 1.85), stoneMat);
  plinth.position.y = 0.275;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  pillar.add(plinth);

  // 2. Main stone shaft
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.32, 6.8, 1.32), stoneMat);
  shaft.position.y = 3.95;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  pillar.add(shaft);

  // 3. Brass collar band
  const collar = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.22, 1.48), brassMat);
  collar.position.y = 7.15;
  pillar.add(collar);

  // 4. Flared stone capital
  const capital = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.65, 1.78), stoneMat);
  capital.position.y = 7.58;
  capital.castShadow = true;
  pillar.add(capital);

  return pillar;
}

export function buildExitGate(
  stoneMat: THREE.MeshStandardMaterial,
  woodMat: THREE.MeshStandardMaterial,
  brassMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial
): THREE.Group {
  const gateGroup = new THREE.Group();
  gateGroup.position.set(0, 0, 17.35);

  // 1. Stone Jambs flanking doorway (never freestanding!)
  const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.95, 5.4, 0.9), stoneMat);
  leftJamb.position.set(-2.15, 2.7, 0);
  leftJamb.castShadow = true;
  leftJamb.receiveShadow = true;

  const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.95, 5.4, 0.9), stoneMat);
  rightJamb.position.set(2.15, 2.7, 0);
  rightJamb.castShadow = true;
  rightJamb.receiveShadow = true;

  // 2. Carved Stone Lintel
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.9, 1.05), stoneMat);
  lintel.position.set(0, 5.35, 0);
  lintel.castShadow = true;
  gateGroup.add(leftJamb, rightJamb, lintel);

  // 3. Double Teak Doors
  const doorGeo = new THREE.BoxGeometry(1.66, 4.85, 0.26);
  const leftDoor = new THREE.Mesh(doorGeo, woodMat);
  leftDoor.position.set(-0.85, 2.425, 0);
  const rightDoor = new THREE.Mesh(doorGeo, woodMat);
  rightDoor.position.set(0.85, 2.425, 0);
  gateGroup.add(leftDoor, rightDoor);

  // 4. Iron Cross Straps & Brass Ring Knockers
  for (const h of [1.2, 2.6, 3.9]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 0.3), ironMat);
    strap.position.set(0, h, 0);
    gateGroup.add(strap);
  }

  const knockerGeo = new THREE.TorusGeometry(0.18, 0.032, 8, 16);
  const leftKnocker = new THREE.Mesh(knockerGeo, brassMat);
  leftKnocker.position.set(-0.38, 2.1, -0.18);
  const rightKnocker = new THREE.Mesh(knockerGeo, brassMat);
  rightKnocker.position.set(0.38, 2.1, -0.18);
  gateGroup.add(leftKnocker, rightKnocker);

  // 5. Overhead Porch Lantern Fixture + Warm Light
  const porchCage = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.34, 6), brassMat);
  porchCage.position.set(0, 4.65, -0.75);
  const porchFlame = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc14d })
  );
  porchFlame.position.set(0, 4.63, -0.75);
  gateGroup.add(porchCage, porchFlame);

  const doorLight = new THREE.PointLight(0xffaa38, 2.2, 11, 1.6);
  doorLight.position.set(0, 4.5, -0.8);
  gateGroup.add(doorLight);

  return gateGroup;
}

export function buildBrazierPost(
  stoneMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial
): THREE.Group {
  const post = new THREE.Group();

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.15, 8), stoneMat);
  pedestal.position.y = 0.575;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  post.add(pedestal);

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.18, 0.25, 10), ironMat);
  bowl.position.y = 1.25;
  post.add(bowl);

  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6b1a })
  );
  ember.scale.set(1.2, 0.7, 1.2);
  ember.position.y = 1.36;
  post.add(ember);

  return post;
}
