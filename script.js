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

// 動物データ
// 移動や方向を管理するため、各要素は { mesh, direction, speed, changeCountdown } を保持する
const animals = [];

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

// 指定したx,z座標で一番高いブロックのY座標を取得
function getHighestBlockY(x, z) {
    for (let y = 20; y >= -1; y--) {
        if (world[`${x},${y},${z}`]) {
            return y;
        }
    }
    return -1;
}

// ===== 動物 =====
// シンプルな四足動物モデルを作成
function createAnimalModel(color) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshLambertMaterial({ color });

    // 体
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), bodyMaterial);
    body.position.y = 0.75; // 脚の上に乗せる
    body.castShadow = true;
    group.add(body);

    // 頭
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), bodyMaterial);
    head.position.set(0.7, 0.8, 0);
    head.castShadow = true;
    group.add(head);

    // 脚
    const legGeometry = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const legPositions = [
        [-0.35, 0.25, -0.2],
        [0.35, 0.25, -0.2],
        [-0.35, 0.25, 0.2],
        [0.35, 0.25, 0.2]
    ];
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeometry, bodyMaterial);
        leg.position.set(...pos);
        leg.castShadow = true;
        group.add(leg);
    });

    return group;
}

function spawnAnimal() {
    const colors = [0xffffff, 0xffc0cb, 0xffd27f];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const animalMesh = createAnimalModel(color);

    const x = Math.floor(Math.random() * 21) - 10;
    const z = Math.floor(Math.random() * 21) - 10;
    const groundY = getHighestBlockY(x, z);
    animalMesh.position.set(x, groundY + 0.5, z); // 地形に合わせて配置
    scene.add(animalMesh);

    const theta = Math.random() * Math.PI * 2;
    animals.push({
        mesh: animalMesh,
        direction: new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)),
        speed: 0.02 + Math.random() * 0.01,
        changeCountdown: Math.floor(Math.random() * 200 + 100)
    });
}

// 動物の移動処理
function updateAnimals() {
    animals.forEach(animal => {
        const newX = animal.mesh.position.x + animal.direction.x * animal.speed;
        const newZ = animal.mesh.position.z + animal.direction.z * animal.speed;

        const currentX = Math.round(animal.mesh.position.x);
        const currentZ = Math.round(animal.mesh.position.z);
        const currentGround = getHighestBlockY(currentX, currentZ);

        const targetX = Math.round(newX);
        const targetZ = Math.round(newZ);
        const targetGround = getHighestBlockY(targetX, targetZ);

        if (targetGround - currentGround > 1 || world[`${targetX},${targetGround + 1},${targetZ}`]) {
            animal.direction.x *= -1;
            animal.direction.z *= -1;
        } else {
            animal.mesh.position.x = newX;
            animal.mesh.position.z = newZ;
            animal.mesh.position.y = targetGround + 0.5;
        }

        // 向きを進行方向に合わせる
        animal.mesh.rotation.y = Math.atan2(animal.direction.z, animal.direction.x);

        // 範囲外に出たら方向転換
        if (animal.mesh.position.x < -10 || animal.mesh.position.x > 10) {
            animal.direction.x *= -1;
            animal.mesh.position.x = THREE.MathUtils.clamp(animal.mesh.position.x, -10, 10);
        }
        if (animal.mesh.position.z < -10 || animal.mesh.position.z > 10) {
            animal.direction.z *= -1;
            animal.mesh.position.z = THREE.MathUtils.clamp(animal.mesh.position.z, -10, 10);
        }

        // ランダムに方向転換
        animal.changeCountdown--;
        if (animal.changeCountdown <= 0) {
            const theta = Math.random() * Math.PI * 2;
            animal.direction.set(Math.cos(theta), 0, Math.sin(theta));
            animal.changeCountdown = Math.floor(Math.random() * 200 + 100);
        }
    });
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
const spawnAnimalBtn = document.getElementById('spawnAnimal');
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

if (spawnAnimalBtn) {
    spawnAnimalBtn.addEventListener('click', () => {
        spawnAnimal();
    });
}

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
    updateAnimals();
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
console.log('- 🐄ボタン: 動物スポーン');
