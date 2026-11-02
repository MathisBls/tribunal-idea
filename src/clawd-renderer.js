const MODEL_URL = '/models/tribunal.glb';
const JUDGE_VARIANT = 'juge';
const CLERK_VARIANT = 'gestion';
const MEMBER_VARIANTS = ['nego', 'directeur', 'client', 'tech', 'gestion'];
const VARIANT_BY_PERSONA_ID = {
    'end-user': 'client',
    'product-owner': 'nego',
    'lead-dev': 'tech',
    security: 'directeur',
    support: 'gestion',
    finance: 'directeur',
    designer: 'nego',
    devil: 'client',
};
const HIDDEN_PROP_PATTERN = /_(gavel_handle|gavel_head|folder|laptop_base|laptop_screen|laptop_glow|notepad|key|keyring)$/;
const TINTED_MATERIAL_PATTERN = /^(jacket|collar)_/;
const RENDER_SIZE_PX = 160;
const FRAME_INTERVAL_MS = 1000 / 30;
const CAMERA_FOV = 30;
const CAMERA_FRAMING = 1.08;

let enginePromise = null;
const avatars = new Set();
let lastFrameAt = 0;
let isLooping = false;

function hashText(text) {
    let hash = 2166136261;
    for (const character of text) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
    return hash >>> 0;
}

export function pickVariant(persona) {
    const personaId = persona?.id;
    if (persona?.character) return persona.character;
    if (personaId === 'president') return JUDGE_VARIANT;
    if (personaId === 'clerk') return CLERK_VARIANT;
    return VARIANT_BY_PERSONA_ID[personaId] ?? MEMBER_VARIANTS[hashText(personaId ?? '?') % MEMBER_VARIANTS.length];
}

async function createEngine() {
    const THREE = await import('three');
    const {GLTFLoader} = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    gltf.scene.updateMatrixWorld(true);
    const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
    renderer.setPixelRatio(1);
    renderer.setSize(RENDER_SIZE_PX, RENDER_SIZE_PX, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return {THREE, renderer, model: gltf.scene};
}

function buildAvatarScene({THREE, model}, variant, toneColor) {
    const source = model.getObjectByName(`char_${variant}`);
    if (!source) return null;
    const figure = source.clone(true);
    figure.position.set(0, 0, 0);
    figure.rotation.set(0, 0, 0);
    figure.traverse((object) => {
        if (!object.isMesh) return;
        if (HIDDEN_PROP_PATTERN.test(object.name)) object.visible = false;
        if (TINTED_MATERIAL_PATTERN.test(object.material.name) && toneColor) {
            object.material = object.material.clone();
            object.material.color = new THREE.Color(toneColor);
        }
    });
    const pivot = new THREE.Group();
    pivot.add(figure);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    figure.traverse((object) => {
        if (object.isMesh && object.visible) box.expandByObject(object);
    });
    const body = figure.getObjectByName(`${variant}_body`);
    const bodyCenter = body ? new THREE.Box3().setFromObject(body).getCenter(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    figure.position.set(-bodyCenter.x, -box.min.y, -bodyCenter.z);

    const scene = new THREE.Scene();
    scene.add(pivot);
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a2a1c, 1.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(2, 4, 5);
    scene.add(keyLight);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.01, 100);
    const height = Math.max(size.x, size.y);
    const distance = (height * CAMERA_FRAMING) / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
    camera.position.set(0, size.y * 0.95, distance);
    camera.lookAt(0, size.y * 0.48, 0);

    const findPart = (suffix) => figure.getObjectByName(`${variant}_${suffix}`);
    return {
        scene,
        camera,
        pivot,
        arms: [findPart('arm_-1'), findPart('arm_1')].filter(Boolean),
        baseHeight: size.y,
    };
}

function animate(avatar, time) {
    const {rig, phase} = avatar;
    const t = time / 1000 + phase;
    if (avatar.isSpeaking) {
        rig.pivot.rotation.y = Math.sin(t * 2.2) * 0.25;
        rig.pivot.position.y = Math.abs(Math.sin(t * 7)) * rig.baseHeight * 0.06;
        const squash = Math.sin(t * 14) * 0.04;
        rig.pivot.scale.set(1 - squash, 1 + squash, 1 - squash);
        rig.arms.forEach((arm, index) => {
            arm.rotation.z = Math.sin(t * 9 + index * Math.PI) * 0.6;
        });
    } else {
        rig.pivot.rotation.y = Math.sin(t * 0.7) * 0.45;
        rig.pivot.position.y = Math.sin(t * 2) * rig.baseHeight * 0.012;
        rig.pivot.scale.set(1, 1 + Math.sin(t * 2) * 0.01, 1);
        rig.arms.forEach((arm, index) => {
            arm.rotation.z = Math.sin(t * 1.3 + index) * 0.12;
        });
    }
}

function renderFrame(time) {
    if (avatars.size === 0) {
        isLooping = false;
        return;
    }
    requestAnimationFrame(renderFrame);
    if (time - lastFrameAt < FRAME_INTERVAL_MS) return;
    lastFrameAt = time;
    enginePromise.then(({renderer}) => {
        for (const avatar of avatars) {
            if (!avatar.rig || !avatar.isVisible) continue;
            animate(avatar, time);
            renderer.render(avatar.rig.scene, avatar.rig.camera);
            const context = avatar.canvas.getContext('2d');
            context.clearRect(0, 0, avatar.canvas.width, avatar.canvas.height);
            context.drawImage(renderer.domElement, 0, 0, avatar.canvas.width, avatar.canvas.height);
        }
    });
}

const visibilityObserver =
    typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
              for (const entry of entries) {
                  for (const avatar of avatars) if (avatar.canvas === entry.target) avatar.isVisible = entry.isIntersecting;
              }
          });

/**
 * Draws an animated Clawd from the courtroom model into the canvas, sharing one WebGL context between all avatars.
 */
export function mountClawd(canvas, {variant, toneColor, seed}) {
    enginePromise ??= createEngine();
    const avatar = {canvas, rig: null, isSpeaking: false, isVisible: true, phase: (hashText(seed ?? variant) % 1000) / 100};
    avatars.add(avatar);
    visibilityObserver?.observe(canvas);
    enginePromise
        .then((engine) => {
            if (avatars.has(avatar)) avatar.rig = buildAvatarScene(engine, variant, toneColor);
        })
        .catch((error) => {
            console.warn('Clawd avatar unavailable', error);
            avatars.delete(avatar);
        });
    if (!isLooping) {
        isLooping = true;
        requestAnimationFrame(renderFrame);
    }
    return {
        setSpeaking: (isSpeaking) => {
            avatar.isSpeaking = isSpeaking;
        },
        unmount: () => {
            avatars.delete(avatar);
            visibilityObserver?.unobserve(canvas);
        },
    };
}
