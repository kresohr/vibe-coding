import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// --- Constants ---
const DIM_ICON = '📏';
const SNAP_THRESHOLD = 0.2;
const BOX_HELPER_COLOR_INACTIVE = 0xaaaaaa; // Grey for inactive boxes during drag
const BOX_HELPER_COLOR_ACTIVE = 0x0000ff;   // Blue for the selected object's box

// --- Global Variables ---
let scene, camera, renderer, orbitControls, transformControls;
// Modified structure: Added boxHelper
let loadedObjects = []; // { object: THREE.Object3D, initialSize: THREE.Vector3, listItem: HTMLElement, boxHelper: THREE.BoxHelper | null }
let selectedObjectData = null; // { object: ..., initialSize: ..., listItem: ..., boxHelper: ... }
let raycaster, mouse;
let objectNameCounter = 0;
let isDraggingTransform = false; // General flag for gizmo dragging

// --- DOM References ---
const container = document.getElementById('container');
const fileInput = document.getElementById('fileInput');
const objectListElement = document.getElementById('objectList');
const loadingSpinnerElement = document.getElementById('loadingSpinner');

// --- Initialization ---
init();
animate();

// --- Helper Functions ---

function showSpinner() { if (loadingSpinnerElement) loadingSpinnerElement.style.display = 'block'; }
function hideSpinner() { if (loadingSpinnerElement) loadingSpinnerElement.style.display = 'none'; }

function getObjectAABB(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    return box;
}

function getObjectDimensions(object) {
    const box = getObjectAABB(object);
    return box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getSize(new THREE.Vector3());
}

function formatDimensions(size) {
    return `W:${size.x.toFixed(2)} H:${size.y.toFixed(2)} D:${size.z.toFixed(2)}`;
}

function updateListItemContent(objectData) {
    if (!objectData || !objectData.listItem) return;
    const currentDims = getObjectDimensions(objectData.object);
    const dimsString = formatDimensions(currentDims);
    objectData.listItem.innerHTML = `
        <span class="object-name" title="${objectData.object.name}">${objectData.object.name}</span>
        <span class="object-dims">${dimsString}</span>
        <button class="edit-dims-btn" data-uuid="${objectData.object.uuid}" title="Edit Dimensions">${DIM_ICON}</button>
    `;
    if (selectedObjectData && selectedObjectData.object === objectData.object) {
        objectData.listItem.classList.add('selected');
    }
}

// Update individual BoxHelper visibility and color
function updateBoxHelperState(objectData, isSelected, isDragging) {
    if (!objectData || !objectData.boxHelper) return;

    const helper = objectData.boxHelper;
    if (isSelected) {
        helper.material.color.setHex(BOX_HELPER_COLOR_ACTIVE);
        helper.visible = true; // Selected is always visible
    } else {
        helper.material.color.setHex(BOX_HELPER_COLOR_INACTIVE);
        helper.visible = isDragging; // Others only visible during drag
    }
    helper.update(); // Make sure it's up-to-date
}


function findObjectData(object) { return loadedObjects.find(data => data.object === object); }
function findObjectDataByUuid(uuid) { return loadedObjects.find(data => data.object.uuid === uuid); }

// --- Core Functions ---

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcccccc);
    scene.fog = new THREE.FogExp2(0xcccccc, 0.002);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 5, 10); camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting & Grid (Unchanged)
    const ambientLight = new THREE.AmbientLight(0x606060, 2); scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); directionalLight.position.set(1, 1, .5).normalize(); scene.add(directionalLight);
    const gridHelper = new THREE.GridHelper(50, 50); scene.add(gridHelper);

    // OrbitControls (Unchanged)
    orbitControls = new OrbitControls(camera, renderer.domElement); orbitControls.enableDamping = true;

    // TransformControls Setup
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', event => {
        const isStartingDrag = event.value;
        orbitControls.enabled = !isStartingDrag;
        isDraggingTransform = isStartingDrag; // Update global flag

        // Update BoxHelper visibility for all objects based on drag state
        const isTranslateMode = transformControls.getMode() === 'translate';
        loadedObjects.forEach(data => {
            updateBoxHelperState(data, data === selectedObjectData, isDraggingTransform && isTranslateMode);
        });

        if (!isStartingDrag && selectedObjectData) { // Drag ended
             updateListItemContent(selectedObjectData); // Update list dimensions
        }
    });
    transformControls.addEventListener('objectChange', () => {
        // Let TransformControls move the object first based on mouse input
        if (isDraggingTransform && selectedObjectData) {
             if (transformControls.getMode() === 'translate') {
                 applySnapAdjustment(selectedObjectData.object); // Check and apply snap *after* gizmo move
             } else if (transformControls.getMode() === 'scale') {
                 handleScaleGroundSnap(selectedObjectData.object);
             }
              // Update the selected object's box helper immediately as it changes
             if (selectedObjectData.boxHelper) {
                selectedObjectData.boxHelper.update();
             }
        }
    });
    scene.add(transformControls);

    // Raycaster, Mouse, Listeners... (Unchanged)
    raycaster = new THREE.Raycaster(); mouse = new THREE.Vector2();
    window.addEventListener('click', onMouseClick, false);
    window.addEventListener('keydown', onKeyDown, false);
    objectListElement.addEventListener('click', onListClick, false);
    window.addEventListener('resize', onWindowResize, false);
    fileInput.addEventListener('change', handleFileSelect, false);
}

function handleScaleGroundSnap(obj) { // Keep object bottom on grid while scaling
    obj.updateMatrixWorld(true);
    const currentBox = getObjectAABB(obj);
    if (!currentBox.isEmpty()) { obj.position.y -= currentBox.min.y; }
}

// --- Revised Snapping Logic ---
function applySnapAdjustment(sourceObject) {
    if (!sourceObject) return;

    const sourceBox = getObjectAABB(sourceObject);
    if (sourceBox.isEmpty()) return;

    let bestSnapDelta = null;
    let minSnapDistSq = SNAP_THRESHOLD * SNAP_THRESHOLD;

    // 1. Check against other objects
    for (const targetData of loadedObjects) {
        if (targetData.object === sourceObject) continue;
        const targetBox = getObjectAABB(targetData.object);
        if (targetBox.isEmpty()) continue;

        const checks = [
            { axis: 'x', delta: targetBox.min.x - sourceBox.max.x }, { axis: 'x', delta: targetBox.max.x - sourceBox.min.x },
            { axis: 'z', delta: targetBox.min.z - sourceBox.max.z }, { axis: 'z', delta: targetBox.max.z - sourceBox.min.z },
            { axis: 'y', delta: targetBox.min.y - sourceBox.max.y }, { axis: 'y', delta: targetBox.max.y - sourceBox.min.y },
        ];

        for (const check of checks) {
            const distSq = check.delta * check.delta;
            if (distSq < minSnapDistSq) {
                let overlaps = false; // Check overlap on other axes
                if (check.axis === 'x') { overlaps = sourceBox.min.y < targetBox.max.y && sourceBox.max.y > targetBox.min.y && sourceBox.min.z < targetBox.max.z && sourceBox.max.z > targetBox.min.z; }
                else if (check.axis === 'z') { overlaps = sourceBox.min.y < targetBox.max.y && sourceBox.max.y > targetBox.min.y && sourceBox.min.x < targetBox.max.x && sourceBox.max.x > targetBox.min.x; }
                else { overlaps = sourceBox.min.x < targetBox.max.x && sourceBox.max.x > targetBox.min.x && sourceBox.min.z < targetBox.max.z && sourceBox.max.z > targetBox.min.z; }

                if (overlaps) { minSnapDistSq = distSq; bestSnapDelta = { axis: check.axis, delta: check.delta }; }
            }
        }
    }

    // 2. Check against ground plane (Y=0)
    const groundDist = sourceBox.min.y;
    const groundDistSq = groundDist * groundDist;
    if (groundDistSq < minSnapDistSq && Math.abs(groundDist) < SNAP_THRESHOLD) {
         bestSnapDelta = { axis: 'y', delta: -groundDist };
    }

    // 3. Apply the adjustment *if* a snap was found
    if (bestSnapDelta !== null) {
        const snapVector = new THREE.Vector3();
        snapVector[bestSnapDelta.axis] = bestSnapDelta.delta;
        sourceObject.position.add(snapVector); // Apply the snap offset
        sourceObject.updateMatrixWorld(true); // Update matrix immediately
    }
}
// --- End Snapping Logic ---

function handleFileSelect(event) {
    // ... (File reading, dimension prompting, scaling - unchanged) ...
    const file = event.target.files[0]; if (!file || !file.name.toLowerCase().endsWith('.obj')) { if(file) alert("Please select a .obj file."); fileInput.value = ''; return; } showSpinner(); const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const objLoader = new OBJLoader(); const object = objLoader.parse(e.target.result);
            const initialBox = getObjectAABB(object); const initialSize = initialBox.isEmpty() ? new THREE.Vector3(1e-6, 1e-6, 1e-6) : initialBox.getSize(new THREE.Vector3()); if (initialSize.x === 0) initialSize.x = 1e-6; if (initialSize.y === 0) initialSize.y = 1e-6; if (initialSize.z === 0) initialSize.z = 1e-6;
            const desiredWidthStr = prompt(`Enter desired Width (X) for ${file.name} [Detected: ${initialSize.x.toFixed(2)}]`, initialSize.x.toFixed(2)); if (desiredWidthStr === null) { hideSpinner(); fileInput.value = ''; return; } const desiredHeightStr = prompt(`Enter desired Height (Y) for ${file.name} [Detected: ${initialSize.y.toFixed(2)}]`, initialSize.y.toFixed(2)); if (desiredHeightStr === null) { hideSpinner(); fileInput.value = ''; return; } const desiredDepthStr = prompt(`Enter desired Depth (Z) for ${file.name} [Detected: ${initialSize.z.toFixed(2)}]`, initialSize.z.toFixed(2)); if (desiredDepthStr === null) { hideSpinner(); fileInput.value = ''; return; } const desiredWidth = parseFloat(desiredWidthStr), desiredHeight = parseFloat(desiredHeightStr), desiredDepth = parseFloat(desiredDepthStr); if (isNaN(desiredWidth) || isNaN(desiredHeight) || isNaN(desiredDepth) || desiredWidth <= 0 || desiredHeight <= 0 || desiredDepth <= 0) { alert("Invalid input..."); hideSpinner(); fileInput.value = ''; return; }
            const scaleX = desiredWidth / initialSize.x, scaleY = desiredHeight / initialSize.y, scaleZ = desiredDepth / initialSize.z; object.scale.set(scaleX, scaleY, scaleZ);
            objectNameCounter++; object.name = `Object ${objectNameCounter} (${file.name.replace(/\.[^/.]+$/, "")})`; object.traverse(child => { if (child instanceof THREE.Mesh) { child.material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8, metalness: 0.2 }); child.castShadow = true; child.receiveShadow = true; } });
            const scaledBox = getObjectAABB(object); if (!scaledBox.isEmpty()) { const center = scaledBox.getCenter(new THREE.Vector3()); object.position.set(-center.x, -scaledBox.min.y, -center.z); } else { object.position.set(0, 0, 0); }

            // --- Create and Store BoxHelper ---
            const boxHelper = new THREE.BoxHelper(object, BOX_HELPER_COLOR_INACTIVE); // Start inactive
            boxHelper.material.linewidth = 1.5;
            boxHelper.visible = false; // Initially hidden
            scene.add(boxHelper);
            // ---

            scene.add(object);
            const listItem = document.createElement('li'); listItem.dataset.objectUuid = object.uuid; objectListElement.appendChild(listItem);
            // Store the helper in the object data
            const objectData = { object, initialSize, listItem, boxHelper }; // Added boxHelper
            loadedObjects.push(objectData);
            updateListItemContent(objectData);
            console.log(`Loaded ${object.name}. Initial: ${initialSize.x.toFixed(2)},${initialSize.y.toFixed(2)},${initialSize.z.toFixed(2)}.`);
            selectObject(object);

        } catch (error) { console.error("Error parsing/processing OBJ:", error); alert("Failed to load/process OBJ. Check console."); }
        finally { hideSpinner(); fileInput.value = ''; }
    };
    reader.onerror = (e) => { console.error("FileReader error:", e); alert("Error reading file."); hideSpinner(); fileInput.value = ''; };
    reader.readAsText(file);
}

function onMouseClick(event) { // Raycasting/Selection (no major changes needed here)
    if (event.target.closest('#info') || event.target === fileInput || isDraggingTransform) return;
    if (event.target !== renderer.domElement) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1; mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersectableObjects = loadedObjects.map(data => data.object);
    const intersects = raycaster.intersectObjects(intersectableObjects, true);
    if (intersects.length > 0) {
        let clickedRootObject = intersects[0].object;
        while (clickedRootObject.parent !== null && !intersectableObjects.includes(clickedRootObject)) { clickedRootObject = clickedRootObject.parent; }
        if (intersectableObjects.includes(clickedRootObject)) { selectObject(clickedRootObject); } else { deselectObject(); }
    } else { deselectObject(); }
}

function onListClick(event) { // List Clicks (Unchanged)
    const target = event.target; const listItem = target.closest('li'); if (!listItem) return;
    const uuid = listItem.dataset.objectUuid; const objectData = findObjectDataByUuid(uuid); if (!objectData) return;
    if (target.classList.contains('edit-dims-btn')) { event.stopPropagation(); console.log("Edit dims for:", objectData.object.name); promptAndSetDimensions(objectData); }
    else { selectObject(objectData.object); }
}

function selectObject(object) {
    const data = findObjectData(object);
    if (!data) return;
    if (selectedObjectData && selectedObjectData.object === object) return;

    deselectObject(); // Deselect previous, handles hiding old helper

    selectedObjectData = data;
    selectedObjectData.listItem.classList.add('selected');
    transformControls.attach(selectedObjectData.object);
    setTransformMode('translate');

    // Update the newly selected object's helper state
    updateBoxHelperState(selectedObjectData, true, isDraggingTransform);

    console.log("Selected:", selectedObjectData.object.name);
}

function deselectObject() {
    if (selectedObjectData) {
        selectedObjectData.listItem.classList.remove('selected');
        // Hide the helper of the object being deselected
        updateBoxHelperState(selectedObjectData, false, false); // Mark as not selected, not dragging

        console.log("Deselected:", selectedObjectData.object.name);
        transformControls.detach();
        selectedObjectData = null;
    }
     // Ensure drag state is reset if deselection happens abnormally
     if (isDraggingTransform) {
         isDraggingTransform = false;
         orbitControls.enabled = true;
         // Hide all other helpers if drag was interrupted
         loadedObjects.forEach(data => {
             if (data !== selectedObjectData) { // Check against null selectedObjectData
                updateBoxHelperState(data, false, false);
             }
         });
     }
}

function onKeyDown(event) { // Keyboard Shortcuts (Unchanged)
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    if (event.key.toLowerCase() === 'escape') { deselectObject(); return; }
    if (!selectedObjectData) return;
    switch (event.key.toLowerCase()) {
        case 't': setTransformMode('translate'); break;
        case 'r': setTransformMode('rotate'); break;
        case 's': setTransformMode('scale'); break;
        case 'd': promptAndSetDimensions(selectedObjectData); break;
    }
}

function setTransformMode(mode) { // Gizmo Mode (Unchanged)
    if (!transformControls || !selectedObjectData) return;
    transformControls.setMode(mode);
    if (mode === 'translate') { transformControls.showX = true; transformControls.showY = true; transformControls.showZ = true; }
    else if (mode === 'rotate') { transformControls.showX = false; transformControls.showY = true; transformControls.showZ = false; }
    else if (mode === 'scale') { transformControls.showX = true; transformControls.showY = true; transformControls.showZ = true; }

     // Update box helper visibility when switching modes (e.g., hide others if switching from translate)
     const isTranslate = mode === 'translate';
     loadedObjects.forEach(data => {
         updateBoxHelperState(data, data === selectedObjectData, isDraggingTransform && isTranslate);
     });
}

function promptAndSetDimensions(objectData) { // Edit Dimensions (Unchanged logic, but updates helper)
    if (!objectData) return;
    const object = objectData.object; const initialSize = objectData.initialSize; const currentSize = getObjectDimensions(object);
    const desiredWidthStr = prompt(`EDIT Width (X) [Current: ${currentSize.x.toFixed(2)}]`, currentSize.x.toFixed(2)); if (desiredWidthStr === null) return; const desiredHeightStr = prompt(`EDIT Height (Y) [Current: ${currentSize.y.toFixed(2)}]`, currentSize.y.toFixed(2)); if (desiredHeightStr === null) return; const desiredDepthStr = prompt(`EDIT Depth (Z) [Current: ${currentSize.z.toFixed(2)}]`, currentSize.z.toFixed(2)); if (desiredDepthStr === null) return; const desiredWidth = parseFloat(desiredWidthStr), desiredHeight = parseFloat(desiredHeightStr), desiredDepth = parseFloat(desiredDepthStr); if (isNaN(desiredWidth) || isNaN(desiredHeight) || isNaN(desiredDepth) || desiredWidth <= 0 || desiredHeight <= 0 || desiredDepth <= 0) { alert("Invalid input..."); return; }
    const scaleX = desiredWidth / initialSize.x, scaleY = desiredHeight / initialSize.y, scaleZ = desiredDepth / initialSize.z; const currentX = object.position.x, currentZ = object.position.z; object.scale.set(scaleX, scaleY, scaleZ);
    const newBox = getObjectAABB(object); if (!newBox.isEmpty()) { object.position.set(currentX, -newBox.min.y, currentZ); } else { object.position.x = currentX; object.position.z = currentZ; }

    updateListItemContent(objectData);
    if (objectData.boxHelper) objectData.boxHelper.update(); // Update helper after dimension change

    console.log(`Dimensions EDITED for ${object.name}: W=${desiredWidth}, H=${desiredHeight}, D=${desiredDepth}.`);
}

function onWindowResize() { // Resize (Unchanged)
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();

    // Update non-selected box helpers in the main loop if they are visible during drag
    // (Selected object's helper is updated more immediately in objectChange)
    if (isDraggingTransform && transformControls.getMode() === 'translate') {
        loadedObjects.forEach(data => {
            if (data !== selectedObjectData && data.boxHelper && data.boxHelper.visible) {
                 data.boxHelper.update();
            }
        });
    }

    renderer.render(scene, camera);
}