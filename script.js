// ===== 基本設定 =====
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // 空色

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 10);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 50;
controls.minDistance = 2;

// ライト設定
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(20, 20, 20);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 100;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
scene.add(directionalLight);

// ===== グリッド =====
let gridVisible = true;
const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

// ===== ブロック定義 =====
const BLOCK_TYPES = {
    1: { name: '草', color: 0x7CB342 },
    2: { name: '土', color: 0x8D6E63 },
    3: { name: '石', color: 0x616161 },
    4: { name: '砂', color: 0xFFD54F },
    5: { name: '木', color: 0x8D6E63 }
};

// ===== ワールドデータ =====
const world = {};
let currentBlockType = 1;
let currentAction = 'place';
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 初期地面作成
for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
        const key = `${x},0,${z}`;
        world[key] = { type: 1, mesh: null };
    }
}

// ===== ブロック作成関数 =====
function createBlock(type) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: BLOCK_TYPES[type].color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function addBlock(x, y, z, type) {
    const key = `${x},${y},${z}`;
    if (world[key]) return; // 既にブロックがある場合は何もしない

    const block = createBlock(type);
    block.position.set(x, y, z);
    scene.add(block);
    
    world[key] = { type: type, mesh: block };
}

function removeBlock(x, y, z) {
    const key = `${x},${y},${z}`;
    if (!world[key]) return;

    scene.remove(world[key].mesh);
    delete world[key];
}

// 初期ワールド構築
function buildWorld() {
    for (const key in world) {
        const [x, y, z] = key.split(',').map(Number);
        const block = createBlock(world[key].type);
        block.position.set(x, y, z);
        scene.add(block);
        world[key].mesh = block;
    }
}

// ===== レイキャスト =====
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getIntersection(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    const objects = [];
    for (const key in world) {
        if (world[key].mesh) {
            objects.push(world[key].mesh);
        }
    }
    
    const intersects = raycaster.intersectObjects(objects);
    return intersects.length > 0 ? intersects[0] : null;
}

// ===== マウスイベント =====
let isMouseDown = false;

canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    isMouseDown = true;
    
    const intersection = getIntersection(event);
    if (!intersection) return;

    const position = intersection.object.position;
    const face = intersection.face;
    const normal = face.normal.clone();
    const action = isMobile ? currentAction : (event.button === 0 ? 'place' : (event.button === 2 ? 'break' : null));

    if (action === 'place') {
        const newX = Math.round(position.x + normal.x);
        const newY = Math.round(position.y + normal.y);
        const newZ = Math.round(position.z + normal.z);

        // 範囲制限
        if (Math.abs(newX) <= 15 && Math.abs(newZ) <= 15 && newY >= 0 && newY <= 20) {
            addBlock(newX, newY, newZ, currentBlockType);
        }
    } else if (action === 'break') {
        const x = Math.round(position.x);
        const y = Math.round(position.y);
        const z = Math.round(position.z);

        // 地面（y=0）は破壊不可
        if (y > 0) {
            removeBlock(x, y, z);
        }
    }
});

canvas.addEventListener('pointerup', () => {
    isMouseDown = false;
});

// 右クリックメニューを無効化
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// ===== UI イベント =====
const hud = document.getElementById('hud');
const blockButtons = hud.querySelectorAll('.block-btn');
const gridToggle = document.getElementById('gridToggle');
const placeBtn = document.getElementById('placeBtn');
const breakBtn = document.getElementById('breakBtn');

// ブロック選択
blockButtons.forEach(button => {
    button.addEventListener('click', () => {
        const type = parseInt(button.dataset.type);
        currentBlockType = type;
        updateActiveButton();
    });
});

function updateActiveButton() {
    blockButtons.forEach(button => {
        const type = parseInt(button.dataset.type);
        button.classList.toggle('active', type === currentBlockType);
    });
}

if (placeBtn && breakBtn) {
    placeBtn.addEventListener('click', () => {
        currentAction = 'place';
        updateActionButtons();
    });
    breakBtn.addEventListener('click', () => {
        currentAction = 'break';
        updateActionButtons();
    });
}

function updateActionButtons() {
    if (!placeBtn || !breakBtn) return;
    placeBtn.classList.toggle('active', currentAction === 'place');
    breakBtn.classList.toggle('active', currentAction === 'break');
}

// グリッド切替
gridToggle.addEventListener('click', () => {
    gridVisible = !gridVisible;
    gridHelper.visible = gridVisible;
});

// ===== キーボード操作 =====
document.addEventListener('keydown', (event) => {
    const key = event.key;
    
    if (key >= '1' && key <= '5') {
        currentBlockType = parseInt(key);
        updateActiveButton();
    } else if (key.toLowerCase() === 'g') {
        gridVisible = !gridVisible;
        gridHelper.visible = gridVisible;
    }
});

// ===== リサイズ対応 =====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== ゲームループ =====
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// ===== 初期化 =====
buildWorld();
updateActiveButton();
updateActionButtons();
animate();

console.log('まいくら風ボクセルビルダーが起動しました！');
console.log('操作方法:');
console.log('- 左クリック: ブロック設置');
console.log('- 右クリック: ブロック破壊');
console.log('- 1-5キー: ブロック種類選択');
console.log('- Gキー: グリッド表示切替');