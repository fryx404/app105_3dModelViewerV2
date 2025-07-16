import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

/**
 * 3D Model Viewer V2 - 3Dモデルビューアー
 * GLB, GLTF, FBX, OBJファイルの表示に対応
 */
class BlendFileViewer {
    constructor() {
        // ========================================
        // プロパティ初期化
        // ========================================
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        
        // オブジェクト選択とハイライト
        this.selectedObject = null;
        this.highlightEdges = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // アウトライナー
        this.outlinerExpanded = new Set();
        
        // 表示モード
        this.displayMode = 'material'; // 'material', 'wireframe', 'solid'
        this.originalMaterials = new Map();
        
        // 背景色
        this.currentBackgroundColor = '#1a1a1a';
        
        this.init();
    }

    // ========================================
    // 初期化メソッド
    // ========================================
    
    init() {
        this.setupScene();
        this.setupEventListeners();
        this.animate();
    }

    setupScene() {
        const viewport = document.getElementById('viewport');
        
        // シーン作成
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.currentBackgroundColor);

        // カメラ作成
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight, 
            0.1,
            1000
        );
        this.camera.position.set(5, 5, 5);
        
        // レンダラー作成
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        viewport.appendChild(this.renderer.domElement);
        
        // コントロール設定
        this.setupControls();
        
        // ライティング設定
        this.setupLighting();
        
        // 環境設定
        this.setupEnvironment();
        
        // キーボード操作設定
        this.setupKeyboardControls();
        
        // リサイズイベント
        window.addEventListener('resize', () => this.onWindowResize());
        
        // 背景色UIを初期化
        this.updateBackgroundPreview();
        this.updateColorPicker();
        this.updatePresetColorButtons();
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 100;
        this.controls.maxPolarAngle = Math.PI;
        
        // カスタムマウスコントロール
        this.setupCustomMouseControls();
    }

    setupCustomMouseControls() {
        const canvas = this.renderer.domElement;
        let isRightDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let isShiftPressed = false;
        
        // Shiftキーの状態追跡
        const handleKeyDown = (event) => {
            if (event.key === 'Shift') isShiftPressed = true;
        };
        
        const handleKeyUp = (event) => {
            if (event.key === 'Shift') isShiftPressed = false;
        };
        
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        
        // マウスイベント
        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 2) {
                isRightDragging = true;
                previousMousePosition = { x: event.clientX, y: event.clientY };
                this.controls.enablePan = false;
                event.preventDefault();
            }
        });
        
        canvas.addEventListener('mousemove', (event) => {
            if (isRightDragging) {
                const deltaX = event.clientX - previousMousePosition.x;
                const deltaY = event.clientY - previousMousePosition.y;
                
                this.handleCustomPan(deltaX, deltaY, isShiftPressed);
                
                previousMousePosition = { x: event.clientX, y: event.clientY };
                event.preventDefault();
            }
        });
        
        canvas.addEventListener('mouseup', (event) => {
            if (event.button === 2) {
                isRightDragging = false;
                this.controls.enablePan = true;
                event.preventDefault();
            }
        });
        
        canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    handleCustomPan(deltaX, deltaY, isShiftPressed) {
        const panSpeed = 0.01;
        const zoomSpeed = 0.05;
        
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        
        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, this.camera.up).normalize();
        
        const up = new THREE.Vector3();
        up.crossVectors(right, cameraDirection).normalize();
        
        if (isShiftPressed) {
            // 前後移動
            const forwardMovement = cameraDirection.clone().multiplyScalar(deltaY * zoomSpeed);
            this.camera.position.add(forwardMovement);
            this.controls.target.add(forwardMovement);
        } else {
            // 上下左右移動
            const horizontalMovement = right.clone().multiplyScalar(-deltaX * panSpeed);
            const verticalMovement = up.clone().multiplyScalar(deltaY * panSpeed);
            
            this.camera.position.add(horizontalMovement);
            this.camera.position.add(verticalMovement);
            this.controls.target.add(horizontalMovement);
            this.controls.target.add(verticalMovement);
        }
        
        this.controls.update();
    }

    setupLighting() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
        
        // 主光源
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        this.scene.add(directionalLight);
        
        // 補助光
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-5, 3, -5);
        this.scene.add(fillLight);
        
        // 背面光
        const backLight = new THREE.DirectionalLight(0xffffff, 0.2);
        backLight.position.set(0, 3, -10);
        this.scene.add(backLight);
    }

    setupEnvironment() {
        // グリッド
        const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x333333);
        this.scene.add(gridHelper);
        
        // 軸ヘルパー
        const axesHelper = new THREE.AxesHelper(1);
        this.scene.add(axesHelper);
    }

    setupKeyboardControls() {
        window.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT') return;
            
            const moveSpeed = 0.5;
            const camera = this.camera;
            const target = this.controls.target;
            
            switch (event.key.toLowerCase()) {
                case 'r':
                    this.resetCamera();
                    break;
                case 'arrowup':
                    camera.position.y += moveSpeed;
                    target.y += moveSpeed;
                    break;
                case 'arrowdown':
                    camera.position.y -= moveSpeed;
                    target.y -= moveSpeed;
                    break;
                case 'arrowleft':
                    camera.position.x -= moveSpeed;
                    target.x -= moveSpeed;
                    break;
                case 'arrowright':
                    camera.position.x += moveSpeed;
                    target.x += moveSpeed;
                    break;
            }
            
            this.controls.update();
        });
    }

    // ========================================
    // イベントリスナー設定
    // ========================================
    
    setupEventListeners() {
        // ファイル選択関連
        this.setupFileEvents();
        
        // UI操作関連
        this.setupUIEvents();
        
        // 3D操作関連
        this.setup3DEvents();
    }

    setupFileEvents() {
        const fileInput = document.getElementById('file-input');
        const dropZone = document.querySelector('.file-drop-zone');
        const loadButton = document.querySelector('.file-drop-zone button');
        
        loadButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadFile(e.target.files[0]);
            }
        });
        
        // ドラッグ&ドロップ
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.loadFile(e.dataTransfer.files[0]);
            }
        });
    }

    setupUIEvents() {
        // エラー閉じる
        document.getElementById('error-close').addEventListener('click', () => {
            this.hideError();
        });
        
        // カメラリセット
        document.getElementById('reset-camera').addEventListener('click', () => {
            this.resetCamera();
        });

        // オブジェクトフォーカス
        document.getElementById('focus-object').addEventListener('click', () => {
            this.focusOnSelectedObject();
        });
        
        // 新しいファイル読み込み
        document.getElementById('load-new-file').addEventListener('click', () => {
            this.showFileSelection();
        });

        // アウトライナー閉じる
        const outlinerToggle = document.getElementById('outliner-toggle');
        if (outlinerToggle) {
            outlinerToggle.addEventListener('click', () => {
                this.toggleOutliner();
            });
        }

        // 表示モード切り替え
        document.querySelectorAll('.display-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setDisplayMode(mode);
            });
        });

        // 背景色変更
        const colorPicker = document.getElementById('bg-color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.setBackgroundColor(e.target.value);
            });
        }

        // プリセット色選択
        document.querySelectorAll('.preset-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.setBackgroundColor(color);
            });
        });

        // 背景色リセット
        const resetBgBtn = document.getElementById('reset-bg-color');
        if (resetBgBtn) {
            resetBgBtn.addEventListener('click', () => {
                this.setBackgroundColor('#1a1a1a');
            });
        }
    }

    setup3DEvents() {
        // オブジェクト選択
        this.renderer.domElement.addEventListener('click', (event) => {
            this.onObjectClick(event);
        });
    }

    // ========================================
    // ファイル読み込み関連メソッド
    // ========================================
    
    loadFile(file) {
        const filename = file.name;
        const extension = filename.toLowerCase().split('.').pop();
        
        this.showLoading();
        this.clearModel();
        
        const loader = this.getLoader(extension);
        if (!loader) {
            this.showError('サポートされていないファイル形式です。GLB、GLTF、FBX、OBJファイルを選択してください。');
            return;
        }
        
        const url = URL.createObjectURL(file);
        
        if (extension === 'obj') {
            this.loadOBJWithMTL(url, filename);
        } else {
            this.loadModel(loader, url, filename);
        }
    }

    getLoader(extension) {
        const loaders = {
            'glb': GLTFLoader,
            'gltf': GLTFLoader,
            'fbx': FBXLoader,
            'obj': OBJLoader
        };
        
        return loaders[extension] ? new loaders[extension]() : null;
    }

    loadOBJWithMTL(objUrl, filename) {
        const mtlLoader = new MTLLoader();
        const objLoader = new OBJLoader();
        
        const baseName = filename.replace('.obj', '');
        const mtlFilename = baseName + '.mtl';
        
        mtlLoader.load(
            mtlFilename,
            (materials) => {
                materials.preload();
                objLoader.setMaterials(materials);
                this.loadModel(objLoader, objUrl, filename);
            },
            undefined,
            () => {
                this.loadModel(objLoader, objUrl, filename);
            }
        );
    }

    loadModel(loader, url, filename) {
        loader.load(
            url,
            (result) => {
                this.onModelLoaded(result, filename);
                URL.revokeObjectURL(url);
            },
            (progress) => {
                console.log('Loading progress:', progress);
            },
            (error) => {
                console.error('Loading error:', error);
                this.showError('ファイルの読み込みに失敗しました。ファイルが破損しているか、対応していない形式の可能性があります。');
                URL.revokeObjectURL(url);
            }
        );
    }

    onModelLoaded(result, filename) {
        let model;
        
        if (result.scene) {
            // GLTF形式
            model = result.scene;
            if (result.animations && result.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(model);
                result.animations.forEach((clip) => {
                    this.mixer.clipAction(clip).play();
                });
            }
        } else {
            // FBX、OBJ形式
            model = result;
            if (result.animations && result.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(model);
                result.animations.forEach((clip) => {
                    this.mixer.clipAction(clip).play();
                });
            }
        }
        
        this.model = model;
        this.scene.add(model);
        
        this.normalizeModel();
        this.fitCameraToModel();
        this.updateFileInfo(filename);
        this.showModelUI();
        this.hideLoading();
        this.applyDisplayMode();
    }

    // ========================================
    // モデル処理メソッド
    // ========================================
    
    normalizeModel() {
        if (!this.model) return;
        
        // バウンディングボックス計算
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // 中心に移動
        this.model.position.sub(center);
        
        // 適切なサイズに調整
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const scale = 8 / maxDim;
            this.model.scale.multiplyScalar(scale);
        }
        
        // 影の設定とマテリアル保存
        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                if (child.material) {
                    this.originalMaterials.set(child.uuid, child.material);
                    
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach((material) => {
                        if (material.isMeshStandardMaterial) {
                            material.envMapIntensity = 1;
                        }
                    });
                }
            }
        });
    }

    clearModel() {
        if (this.model) {
            this.scene.remove(this.model);
            this.model = null;
        }
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }
        this.selectedObject = null;
        this.originalMaterials.clear();
        this.removeHighlight();
        this.displayMode = 'material';
        
        // 背景色をデフォルトに戻す
        this.setBackgroundColor('#1a1a1a');
    }

    // ========================================
    // カメラ制御メソッド
    // ========================================
    
    fitCameraToModel() {
        if (!this.model) return;
        
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2;
        
        this.camera.position.set(distance, distance * 0.8, distance);
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
    }

    resetCamera() {
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        
        if (this.model) {
            this.fitCameraToModel();
        }
    }

    focusOnSelectedObject() {
        if (this.selectedObject && this.selectedObject.isMesh) {
            const box = new THREE.Box3().setFromObject(this.selectedObject);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = this.camera.fov * (Math.PI / 180);
            const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2;
            
            const currentPos = this.camera.position.clone();
            const direction = currentPos.sub(center).normalize();
            const newPosition = center.clone().add(direction.multiplyScalar(distance));
            
            this.animateCamera(newPosition, center);
        }
    }

    animateCamera(targetPosition, targetLookAt) {
        const startPosition = this.camera.position.clone();
        const startLookAt = this.controls.target.clone();
        
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            this.camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
            this.controls.target.lerpVectors(startLookAt, targetLookAt, easeProgress);
            
            this.controls.update();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    // ========================================
    // オブジェクト選択関連メソッド
    // ========================================
    
    onObjectClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        
        const visibleIntersects = intersects.filter(intersect => {
            const object = intersect.object;
            
            if (object.type === 'LineSegments' && object === this.highlightEdges) {
                return false;
            }
            
            return this.isObjectVisible(object);
        });
        
        if (visibleIntersects.length > 0) {
            const object = visibleIntersects[0].object;
            this.selectObjectFromOutliner(object);
        } else {
            this.deselectObject();
        }
    }

    isObjectVisible(object) {
        let current = object;
        
        while (current) {
            if (!current.visible) {
                return false;
            }
            current = current.parent;
            
            if (current === this.scene) {
                break;
            }
        }
        
        return true;
    }

    selectObjectFromOutliner(object) {
        this.selectedObject = object;
        this.updateOutliner();
        this.addHighlight(object);
        this.updateFocusButton();
    }

    deselectObject() {
        this.selectedObject = null;
        this.removeHighlight();
        this.updateOutliner();
        this.updateFocusButton();
    }

    // ========================================
    // ハイライト表示メソッド
    // ========================================
    
    addHighlight(object) {
        this.removeHighlight();
        
        if (object && object.isMesh && object.geometry) {
            const edges = new THREE.EdgesGeometry(object.geometry);
            const lineMaterial = new THREE.LineBasicMaterial({ 
                color: 0x00ff00,
                linewidth: 2
            });
            
            this.highlightEdges = new THREE.LineSegments(edges, lineMaterial);
            
            this.highlightEdges.position.copy(object.position);
            this.highlightEdges.rotation.copy(object.rotation);
            this.highlightEdges.scale.copy(object.scale);
            
            if (object.parent) {
                object.parent.add(this.highlightEdges);
            } else {
                this.scene.add(this.highlightEdges);
            }
        }
    }

    removeHighlight() {
        if (this.highlightEdges) {
            if (this.highlightEdges.parent) {
                this.highlightEdges.parent.remove(this.highlightEdges);
            }
            this.highlightEdges = null;
        }
    }

    // ========================================
    // UI更新メソッド
    // ========================================
    
    updateFileInfo(filename) {
        const extension = filename.toLowerCase().split('.').pop();
        let objectCount = 0;
        let materialCount = 0;
        let polygonCount = 0;
        let vertexCount = 0;
        
        if (this.model) {
            const materials = new Set();
            this.model.traverse((child) => {
                if (child.isMesh) {
                    objectCount++;
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => materials.add(mat.uuid));
                    }
                    
                    if (child.geometry) {
                        const geometry = child.geometry;
                        if (geometry.index) {
                            polygonCount += geometry.index.count / 3;
                        } else if (geometry.attributes.position) {
                            polygonCount += geometry.attributes.position.count / 3;
                        }
                        
                        if (geometry.attributes.position) {
                            vertexCount += geometry.attributes.position.count;
                        }
                    }
                }
            });
            materialCount = materials.size;
        }
        
        document.getElementById('file-name').textContent = filename;
        document.getElementById('file-format').textContent = extension.toUpperCase();
        document.getElementById('object-count').textContent = objectCount;
        document.getElementById('material-count').textContent = materialCount;
        document.getElementById('polygon-count').textContent = Math.floor(polygonCount).toLocaleString();
        document.getElementById('vertex-count').textContent = vertexCount.toLocaleString();
    }

    updateFocusButton() {
        const focusButton = document.getElementById('focus-object');
        if (focusButton) {
            if (this.selectedObject && this.selectedObject.isMesh) {
                focusButton.disabled = false;
                focusButton.title = `${this.selectedObject.name || 'オブジェクト'}にフォーカス`;
            } else {
                focusButton.disabled = true;
                focusButton.title = 'オブジェクトを選択してください';
            }
        }
    }

    // ========================================
    // アウトライナー関連メソッド
    // ========================================
    
    updateOutliner() {
        const outlinerTree = document.getElementById('outliner-tree');
        outlinerTree.innerHTML = '';
        
        if (this.model) {
            this.createOutlinerNode(this.model, outlinerTree, 0);
        }
    }

    createOutlinerNode(object, parent, depth) {
        const item = document.createElement('div');
        item.className = 'outliner-item';
        item.dataset.objectId = object.uuid;
        
        // 展開/折りたたみトグル
        const toggle = document.createElement('div');
        toggle.className = 'outliner-toggle';
        if (object.children.length > 0) {
            toggle.textContent = this.outlinerExpanded.has(object.uuid) ? '▼' : '▶';
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleOutlinerNode(object.uuid);
            });
        } else {
            toggle.style.visibility = 'hidden';
        }
        
        // オブジェクトアイコン
        const icon = document.createElement('div');
        icon.className = 'outliner-icon';
        icon.innerHTML = this.getObjectIcon(object);
        
        // オブジェクト名
        const name = document.createElement('div');
        name.className = 'outliner-name';
        name.textContent = object.name || object.type || 'Object';
        
        // 表示/非表示トグル
        const visibility = document.createElement('div');
        visibility.className = 'outliner-visibility';
        visibility.innerHTML = object.visible ? 
            '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>' :
            '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';
        
        visibility.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleObjectVisibility(object);
        });
        
        // 要素の組み立て
        item.appendChild(toggle);
        item.appendChild(icon);
        item.appendChild(name);
        item.appendChild(visibility);
        
        // クリックイベント
        item.addEventListener('click', () => {
            this.selectObjectFromOutliner(object);
        });
        
        // 選択状態の表示
        if (this.selectedObject === object) {
            item.classList.add('selected');
        }
        
        // 非表示オブジェクトの表示
        if (!object.visible) {
            item.classList.add('hidden-object');
        }
        
        parent.appendChild(item);
        
        // 子オブジェクトの処理
        if (object.children.length > 0 && this.outlinerExpanded.has(object.uuid)) {
            const childContainer = document.createElement('div');
            childContainer.className = 'outliner-children';
            
            object.children.forEach(child => {
                this.createOutlinerNode(child, childContainer, depth + 1);
            });
            
            parent.appendChild(childContainer);
        }
    }

    getObjectIcon(object) {
        const icons = {
            mesh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
            group: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
            light: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z"/></svg>',
            camera: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM21 6h-2.5l-1.83-2H7.33L5.5 6H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>',
            default: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
        };
        
        if (object.isMesh) return icons.mesh;
        if (object.isGroup) return icons.group;
        if (object.isLight) return icons.light;
        if (object.isCamera) return icons.camera;
        return icons.default;
    }

    toggleOutlinerNode(objectId) {
        if (this.outlinerExpanded.has(objectId)) {
            this.outlinerExpanded.delete(objectId);
        } else {
            this.outlinerExpanded.add(objectId);
        }
        this.updateOutliner();
    }

    toggleObjectVisibility(object) {
        object.visible = !object.visible;
        
        if (!object.visible && this.selectedObject) {
            if (this.isDescendantOf(this.selectedObject, object) || this.selectedObject === object) {
                this.deselectObject();
            }
        }
        
        this.updateOutliner();
    }

    isDescendantOf(child, parent) {
        let current = child.parent;
        while (current) {
            if (current === parent) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    toggleOutliner() {
        const outliner = document.getElementById('outliner');
        outliner.classList.toggle('hidden');
    }

    // ========================================
    // 表示モード関連メソッド
    // ========================================
    
    setDisplayMode(mode) {
        this.displayMode = mode;
        this.updateDisplayModeButtons();
        this.applyDisplayMode();
    }

    // ========================================
    // 背景色変更関連メソッド
    // ========================================
    
    setBackgroundColor(color) {
        this.currentBackgroundColor = color;
        
        // シーンの背景色を更新
        if (this.scene) {
            this.scene.background = new THREE.Color(color);
        }
        
        // UI更新
        this.updateBackgroundPreview();
        this.updateColorPicker();
        this.updatePresetColorButtons();
    }

    updateBackgroundPreview() {
        const preview = document.getElementById('current-bg-preview');
        if (preview) {
            preview.style.background = this.currentBackgroundColor;
        }
    }

    updateColorPicker() {
        const colorPicker = document.getElementById('bg-color-picker');
        if (colorPicker) {
            colorPicker.value = this.currentBackgroundColor;
        }
    }

    updatePresetColorButtons() {
        document.querySelectorAll('.preset-color-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.color === this.currentBackgroundColor) {
                btn.classList.add('active');
            }
        });
    }

    updateDisplayModeButtons() {
        document.querySelectorAll('.display-mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeButton = document.getElementById(`${this.displayMode}-mode`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
        
        this.updateCurrentModeIndicator();
    }

    updateCurrentModeIndicator() {
        const iconElement = document.getElementById('current-mode-icon');
        const textElement = document.getElementById('current-mode-text');
        const indicatorElement = document.getElementById('current-mode-indicator');
        
        const modeConfig = {
            material: { icon: '🎨', text: 'マテリアル', color: 'bg-blue-600' },
            wireframe: { icon: '🔲', text: 'ワイヤーフレーム', color: 'bg-green-600' },
            solid: { icon: '⚫', text: 'ソリッド', color: 'bg-gray-600' }
        };
        
        const config = modeConfig[this.displayMode];
        if (config) {
            iconElement.textContent = config.icon;
            textElement.textContent = config.text;
            indicatorElement.className = `inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white ${config.color}`;
        }
    }

    applyDisplayMode() {
        if (!this.model) return;
        
        this.model.traverse((child) => {
            if (child.isMesh && child.material) {
                const originalMaterial = this.originalMaterials.get(child.uuid);
                if (!originalMaterial) return;
                
                switch (this.displayMode) {
                    case 'material':
                        child.material = originalMaterial;
                        this.setWireframe(child.material, false);
                        break;
                        
                    case 'wireframe':
                        child.material = originalMaterial;
                        this.setWireframe(child.material, true);
                        break;
                        
                    case 'solid':
                        const solidMaterial = new THREE.MeshLambertMaterial({ 
                            color: 0x808080,
                            wireframe: false
                        });
                        child.material = solidMaterial;
                        break;
                }
            }
        });
    }

    setWireframe(material, wireframe) {
        if (Array.isArray(material)) {
            material.forEach(mat => {
                if (mat.wireframe !== undefined) mat.wireframe = wireframe;
            });
        } else {
            if (material.wireframe !== undefined) material.wireframe = wireframe;
        }
    }

    // ========================================
    // UI表示制御メソッド
    // ========================================
    
    showFileSelection() {
        document.getElementById('file-selection').classList.remove('hidden');
        document.getElementById('controls-info').classList.add('hidden');
        document.getElementById('file-info').classList.add('hidden');
        document.getElementById('camera-controls').classList.add('hidden');
        document.getElementById('new-file-button').classList.add('hidden');
        document.getElementById('outliner').classList.add('hidden');
        document.getElementById('display-mode').classList.add('hidden');
        document.getElementById('background-controls').classList.add('hidden');
        
        this.clearModel();
    }

    showModelUI() {
        document.getElementById('file-selection').classList.add('hidden');
        document.getElementById('controls-info').classList.remove('hidden');
        document.getElementById('file-info').classList.remove('hidden');
        document.getElementById('camera-controls').classList.remove('hidden');
        document.getElementById('new-file-button').classList.remove('hidden');
        document.getElementById('outliner').classList.remove('hidden');
        document.getElementById('display-mode').classList.remove('hidden');
        document.getElementById('background-controls').classList.remove('hidden');
        
        this.updateOutliner();
        this.updateDisplayModeButtons();
        this.updateFocusButton();
        this.updateBackgroundPreview();
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('file-selection').classList.add('hidden');
        document.getElementById('error-message').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('error-text').textContent = message;
        document.getElementById('error-message').classList.remove('hidden');
        this.hideLoading();
    }

    hideError() {
        document.getElementById('error-message').classList.add('hidden');
        if (!this.model) {
            document.getElementById('file-selection').classList.remove('hidden');
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ========================================
    // メインループ
    // ========================================
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // アニメーション更新
        if (this.mixer) {
            this.mixer.update(this.clock.getDelta());
        }
        
        // コントロール更新
        this.controls.update();
        
        // レンダリング
        this.renderer.render(this.scene, this.camera);
    }
}

// ========================================
// アプリケーション開始
// ========================================
new BlendFileViewer(); 