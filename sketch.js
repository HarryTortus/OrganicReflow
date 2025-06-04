// Global variables for P5.js sketch
let curves = []; // Array to hold all active curves
let freezeGrowth = false; // Controls if curves grow
let versionNumber = "1.1 - Tangent Repulsion"; // Version of the app

// Settings object to control the behavior of the curves and repulsion
const settings = {
    numInitialCurves: 3, // Number of curves to start with
    segmentLength: 20, // Length of each new segment added to a curve
    repulsionRadius: 70, // Radius within which other segments repel a growing tip
    repulsionStrength: 0.1, // How strongly segments repel each other (angular adjustment)
    randomness: 0.5, // How much randomness is introduced into the growth direction (0-1)
    growthRate: 3, // Number of new segments to attempt adding per frame
    maxSegmentsPerCurve: 300, // Maximum number of segments a single curve can have
    lineThickness: 1, // Stroke weight for drawing curves
    lineColor: '#4c6121', // Default line color if dynamic color is off
    backgroundColor: '#ede3df', // Background color of the canvas
    freeze: false, // Freeze growth (similar to your previous app's freeze)
    dynamicColor: true, // Use dynamic HSB color based on curve properties
    hueShift: 180, // Base hue for dynamic coloring
    hueRangeWidth: 270 // Range of hues for dynamic coloring
};

// --- Helper Functions ---

/**
 * Updates the visual fill of a range slider based on its current value.
 * This provides a visual indication of the slider's progress.
 * @param {HTMLInputElement} inputElement - The range input element.
 */
function updateRangeSliderFill(inputElement) {
    if (!inputElement) return;
    const min = parseFloat(inputElement.min || 0);
    const max = parseFloat(inputElement.max || 1);
    const value = parseFloat(inputElement.value);
    const percentage = ((value - min) / (max - min)) * 100;
    inputElement.style.setProperty('--range-progress', `${percentage}%`);
}

// --- Curve and Segment Classes ---

/**
 * Represents a single segment of a curve.
 */
class Segment {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle; // Direction of the segment (tangent)
    }
}

/**
 * Represents a single organic curve composed of multiple segments.
 */
class Curve {
    constructor(startX, startY, startAngle) {
        this.segments = [];
        this.segments.push(new Segment(startX, startY, startAngle));
        this.active = true; // Whether the curve is still growing
        this.hue = random(360); // Initial hue for dynamic coloring
    }

    /**
     * Attempts to grow the curve by adding a new segment.
     * Incorporates tangent-based repulsion from other curves and canvas boundaries.
     * @param {Array<Curve>} allCurves - All active curves on the canvas for repulsion calculation.
     */
    grow(allCurves) {
        if (!this.active || this.segments.length >= settings.maxSegmentsPerCurve) {
            this.active = false; // Deactivate if max segments reached
            return;
        }

        const lastSegment = this.segments[this.segments.length - 1];
        let currentAngle = lastSegment.angle;

        // Add some randomness to the direction
        currentAngle += map(random(), 0, 1, -settings.randomness, settings.randomness);

        // Initialize total repulsion vector
        let totalRepulsionVector = createVector(0, 0);

        // Calculate tangent-based repulsion force from other curves
        for (let otherCurve of allCurves) {
            if (otherCurve === this) continue; // Don't repel from self

            for (let otherSegment of otherCurve.segments) {
                const distSq = distSq(lastSegment.x, lastSegment.y, otherSegment.x, otherSegment.y);

                if (distSq < settings.repulsionRadius * settings.repulsionRadius) {
                    const d = sqrt(distSq);
                    if (d === 0) continue; // Avoid division by zero if points are identical

                    // Vector from the other segment to the current growing tip
                    const vecToTip = createVector(lastSegment.x - otherSegment.x, lastSegment.y - otherSegment.y);

                    // Tangent vector of the other segment
                    const otherTangent = p5.Vector.fromAngle(otherSegment.angle);

                    // Normal vector to the other segment's tangent (pointing "outward" from the curve)
                    // We can pick one direction for the normal, e.g., +90 degrees (HALF_PI)
                    const otherNormal = p5.Vector.fromAngle(otherSegment.angle + HALF_PI);

                    // Project vecToTip onto the otherNormal to find the repulsion component
                    // This determines how much the tip is on the "repel" side of the other curve
                    const repulsionComponent = vecToTip.dot(otherNormal);

                    // Only repel if the tip is on the "outward" side of the other curve's normal
                    // A small positive value ensures it's on the correct side
                    if (repulsionComponent > 0.1) { // Adjusted threshold for more stable repulsion
                        // Calculate force magnitude: stronger when closer, and proportional to repulsionComponent
                        const forceMagnitude = settings.repulsionStrength * (1 - d / settings.repulsionRadius) * repulsionComponent;

                        // Add the repulsion force in the direction of the normal
                        totalRepulsionVector.add(otherNormal.copy().setMag(forceMagnitude));
                    }
                }
            }
        }

        // Calculate repulsion from canvas boundaries
        const boundaryRepulsionStrength = 0.05; // Adjustable
        const boundaryMargin = 50; // Distance from edge to start repelling

        // Left boundary
        if (lastSegment.x < boundaryMargin) {
            totalRepulsionVector.x += boundaryRepulsionStrength * (1 - lastSegment.x / boundaryMargin);
        }
        // Right boundary
        if (lastSegment.x > width - boundaryMargin) {
            totalRepulsionVector.x -= boundaryRepulsionStrength * (1 - (width - lastSegment.x) / boundaryMargin);
        }
        // Top boundary
        if (lastSegment.y < boundaryMargin) {
            totalRepulsionVector.y += boundaryRepulsionStrength * (1 - lastSegment.y / boundaryMargin);
        }
        // Bottom boundary
        if (lastSegment.y > height - boundaryMargin) {
            totalRepulsionVector.y -= boundaryRepulsionStrength * (1 - (height - lastSegment.y) / boundaryMargin);
        }

        // Apply total repulsion vector to the current angle
        if (totalRepulsionVector.magSq() > 0.0001) { // Only apply if there's a significant repulsion
            currentAngle = atan2(sin(currentAngle) + totalRepulsionVector.y, cos(currentAngle) + totalRepulsionVector.x);
        }

        // Calculate new position
        const newX = lastSegment.x + cos(currentAngle) * settings.segmentLength;
        const newY = lastSegment.y + sin(currentAngle) * settings.segmentLength;

        // Check if new segment goes too far out of bounds, deactivate curve if it does
        const safetyMargin = 10;
        if (newX < -safetyMargin || newX > width + safetyMargin || newY < -safetyMargin || newY > height + safetyMargin) {
            this.active = false;
            return;
        }

        // Check for self-intersection (simplified - still point-based for simplicity)
        // This is a very basic check and can be improved for more robust collision detection
        const minSelfDistSq = (settings.segmentLength * 0.5) * (settings.segmentLength * 0.5); // Prevent immediate self-intersection
        for (let i = 0; i < this.segments.length - 2; i++) { // Check against all but the last two segments
            const oldSegment = this.segments[i];
            const d = distSq(newX, newY, oldSegment.x, oldSegment.y);
            if (d < minSelfDistSq) {
                this.active = false; // Deactivate if self-intersection detected
                return;
            }
        }

        this.segments.push(new Segment(newX, newY, currentAngle));
    }

    /**
     * Draws the curve on the canvas.
     */
    draw() {
        noFill();
        strokeWeight(settings.lineThickness);

        if (settings.dynamicColor) {
            colorMode(HSB, 360, 100, 100);
            // Map the curve's hue to a range around the hueShift setting
            let finalHue = (this.hue + settings.hueShift) % 360;
            stroke(finalHue, 80, 90); // Use a fixed saturation and brightness for consistency
        } else {
            colorMode(RGB, 255, 255, 255);
            stroke(settings.lineColor);
        }

        beginShape();
        for (let i = 0; i < this.segments.length; i++) {
            vertex(this.segments[i].x, this.segments[i].y);
        }
        endShape();
    }
}

// --- P5.js Core Functions ---

/**
 * Initializes the P5.js canvas and sets up initial curves.
 */
function setup() {
    console.log("Organic Reflow: p5.js setup() called.");
    const canvasPlaceholder = document.getElementById('p5-canvas-placeholder');
    if (!canvasPlaceholder) {
        console.error("Organic Reflow FATAL: #p5-canvas-placeholder not found!");
        return;
    }
    const c = createCanvas(1, 1); // Start with a small canvas, will be resized by windowResized
    c.parent(canvasPlaceholder);
    console.log("Organic Reflow: Canvas created and parented.");

    strokeCap(ROUND); // Rounded caps for lines

    // Initialize UI controls
    if (!setupControls()) {
        console.error("Organic Reflow: setupControls() reported an issue. UI might be incomplete.");
    }
    // Update all range slider fills initially
    document.querySelectorAll('.controls input[type="range"]').forEach(updateRangeSliderFill);

    // Initial resize to fit the container
    windowResized();
    resetSketch(); // Call reset to initialize curves
    console.log("Organic Reflow: p5.js setup() finished.");
}

/**
 * The main animation loop.
 * Updates and draws curves.
 */
function draw() {
    background(settings.backgroundColor); // Clear background each frame

    if (!settings.freeze) {
        // Attempt to grow active curves
        for (let i = curves.length - 1; i >= 0; i--) {
            const curve = curves[i];
            if (curve.active) {
                for (let j = 0; j < settings.growthRate; j++) {
                    curve.grow(curves);
                    if (!curve.active) break; // Stop growing if deactivated during this frame
                }
            } else {
                // If a curve becomes inactive, for now, we keep it to see the full pattern.
                // If you want to remove them, uncomment the line below:
                // curves.splice(i, 1);
            }
        }

        // Add new curves if needed (e.g., if too few active curves)
        // This simple logic ensures we always have at least one active curve, up to numInitialCurves
        if (curves.filter(c => c.active).length < settings.numInitialCurves) {
            addNewCurve();
        }
    }

    // Draw all curves
    for (let curve of curves) {
        curve.draw();
    }
}

/**
 * Resizes the canvas when the window is resized.
 * Adapts to fullscreen mode.
 */
function windowResized() {
    console.log("Organic Reflow: windowResized() called.");
    const mainTitle = document.getElementById('mainTitle');
    const controlsPanel = document.getElementById('controlsPanel');
    const sketchContainer = document.getElementById('sketch-container');
    const siteFooter = document.getElementById('site-footer');

    if (!mainTitle || !controlsPanel || !sketchContainer || !siteFooter) {
        console.error("Organic Reflow: windowResized - One or more critical layout elements not found. Aborting resize.");
        if (typeof resizeCanvas === 'function') resizeCanvas(100, 100);
        if (typeof background === 'function') background(220);
        return;
    }

    let newCanvasWidth, newCanvasHeight;
    const CANVAS_MARGIN_BOTTOM = 20;

    if (document.fullscreenElement) {
        document.body.classList.add('fullscreen-active');
        newCanvasWidth = window.innerWidth;
        newCanvasHeight = window.innerHeight;
    } else {
        document.body.classList.remove('fullscreen-active');

        newCanvasWidth = sketchContainer.clientWidth;

        const bodyStyle = window.getComputedStyle(document.body);
        const bodyVerticalPadding = parseFloat(bodyStyle.paddingTop || 0) + parseFloat(bodyStyle.paddingBottom || 0);
        const titleStyle = window.getComputedStyle(mainTitle);
        const titleHeight = mainTitle.offsetHeight + parseFloat(titleStyle.marginTop || 0) + parseFloat(titleStyle.marginBottom || 0);
        const controlsPanelStyle = window.getComputedStyle(controlsPanel);
        const controlsHeight = controlsPanel.offsetHeight + parseFloat(controlsPanelStyle.marginTop || 0) + parseFloat(controlsPanelStyle.marginBottom || 0);
        const footerStyle = window.getComputedStyle(siteFooter);
        const footerTotalHeight = siteFooter.offsetHeight + parseFloat(footerStyle.marginTop || 0) + parseFloat(footerStyle.marginBottom || 0);

        const availableVerticalSpaceForCanvas = window.innerHeight -
            bodyVerticalPadding -
            titleHeight -
            controlsHeight -
            footerTotalHeight -
            CANVAS_MARGIN_BOTTOM;

        let desiredSquareHeight = newCanvasWidth;
        if (desiredSquareHeight > availableVerticalSpaceForCanvas) {
            newCanvasHeight = availableVerticalSpaceForCanvas;
        } else {
            newCanvasHeight = desiredSquareHeight;
        }

        newCanvasWidth = Math.max(50, newCanvasWidth);
        newCanvasHeight = Math.max(50, newCanvasHeight);
    }

    if (typeof resizeCanvas === 'function') {
        resizeCanvas(newCanvasWidth, newCanvasHeight);
    }
    if (typeof background === 'function' && settings && settings.backgroundColor) {
        background(settings.backgroundColor);
    }
    console.log("Organic Reflow: windowResized() finished, canvas: " + newCanvasWidth + "x" + newCanvasHeight);
}

// --- UI Control Setup ---

/**
 * Sets up event listeners for all UI controls.
 * @returns {boolean} True if all critical elements were found, false otherwise.
 */
function setupControls() {
    console.log("Organic Reflow: setupControls() started.");
    let allElementsFoundCritical = true;
    const getEl = (id, isCritical = false) => {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`Organic Reflow: HTML Element with ID '${id}' not found.`);
            if (isCritical) {
                allElementsFoundCritical = false;
                console.error(`Organic Reflow: CRITICAL HTML Element with ID '${id}' not found.`);
            }
        }
        return el;
    };

    // Critical control IDs (ensure these exist for basic functionality)
    const criticalControlIds = [
        'numInitialCurves', 'segmentLength', 'repulsionRadius', 'repulsionStrength',
        'randomness', 'growthRate', 'maxSegmentsPerCurve', 'lineThickness',
        'freeze', 'dynamicColor', 'fixedLineColorControl', 'dynamicColorHueShiftControl',
        'lineColor', 'hueShift', 'backgroundColor', 'reset', 'fullscreenButton'
    ];
    criticalControlIds.forEach(id => getEl(id, true));

    const hueShiftColorSwatch = getEl('hueShiftColorSwatch', false);
    const versionDisplayEl = getEl('versionDisplay', false);

    if (!allElementsFoundCritical) {
        console.error("Organic Reflow: One or more CRITICAL control elements missing. Setup aborted.");
        return false;
    }

    // Display version number
    if (versionDisplayEl) {
        versionDisplayEl.textContent = `v${versionNumber}`;
    }

    // Initialize control values from settings and update slider fills
    Object.keys(settings).forEach(key => {
        const input = getEl(key);
        if (input) {
            try {
                if (input.type === 'checkbox') {
                    input.checked = settings[key];
                } else if (typeof input.value !== 'undefined') {
                    input.value = settings[key];
                }
                updateRangeSliderFill(input); // Update slider fill for initial value
            } catch (e) {
                console.error(`Organic Reflow: Error setting value/checked for input #${key}:`, e);
            }
        }
    });

    // Get references to dynamic color controls
    const fixedLineColorControl = getEl('fixedLineColorControl');
    const dynamicColorHueShiftControl = getEl('dynamicColorHueShiftControl');

    // Function to toggle visibility of color controls
    function toggleColorControls() {
        if (fixedLineColorControl && dynamicColorHueShiftControl) {
            if (settings.dynamicColor) {
                fixedLineColorControl.style.display = 'none';
                dynamicColorHueShiftControl.style.display = 'flex';
            } else {
                fixedLineColorControl.style.display = 'flex';
                dynamicColorHueShiftControl.style.display = 'none';
            }
        }
    }
    toggleColorControls(); // Call initially

    // Update value displays for sliders and color swatch
    function updateLabels() {
        getEl('numInitialCurves-value').textContent = settings.numInitialCurves;
        getEl('segmentLength-value').textContent = settings.segmentLength;
        getEl('repulsionRadius-value').textContent = settings.repulsionRadius;
        getEl('repulsionStrength-value').textContent = Number(settings.repulsionStrength).toFixed(2);
        getEl('randomness-value').textContent = Number(settings.randomness).toFixed(2);
        getEl('growthRate-value').textContent = settings.growthRate;
        getEl('maxSegmentsPerCurve-value').textContent = settings.maxSegmentsPerCurve;
        getEl('lineThickness-value').textContent = Number(settings.lineThickness).toFixed(1);

        // Update hue shift color swatch
        if (hueShiftColorSwatch) {
            colorMode(HSB, 360, 100, 100);
            const displayHue = settings.hueShift;
            hueShiftColorSwatch.style.backgroundColor = color(displayHue, 80, 90).toString();
            colorMode(RGB, 255, 255, 255); // Reset to RGB for general P5 operations
        }
    }
    updateLabels(); // Call initially

    // Event listeners for range sliders
    document.querySelectorAll('.controls input[type="range"]').forEach(input => {
        input.addEventListener('input', (e) => {
            let value = parseFloat(e.target.value);
            // Handle specific settings that might need different parsing or display
            if (e.target.id === 'repulsionStrength' || e.target.id === 'randomness' || e.target.id === 'lineThickness') {
                settings[e.target.id] = value;
            } else {
                settings[e.target.id] = parseInt(value);
            }
            updateRangeSliderFill(e.target); // Update fill on input
            updateLabels(); // Update value display
        });
    });

    // Event listeners for color inputs
    getEl('lineColor').addEventListener('input', (e) => {
        settings.lineColor = e.target.value;
    });
    getEl('backgroundColor').addEventListener('input', (e) => {
        settings.backgroundColor = e.target.value;
    });
    getEl('hueShift').addEventListener('input', (e) => {
        settings.hueShift = parseInt(e.target.value);
        updateLabels(); // Update color swatch
    });

    // Event listeners for checkboxes
    getEl('freeze').addEventListener('change', (e) => {
        settings.freeze = e.target.checked;
    });
    getEl('dynamicColor').addEventListener('change', (e) => {
        settings.dynamicColor = e.target.checked;
        toggleColorControls(); // Toggle visibility of color controls
    });

    // Reset button
    getEl('reset').addEventListener('click', () => {
        resetSketch();
    });

    // Fullscreen button
    getEl('fullscreenButton').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    // Listen for fullscreen change events to trigger windowResized
    document.addEventListener('fullscreenchange', windowResized);
    document.addEventListener('mozfullscreenchange', windowResized);
    document.addEventListener('webkitfullscreenchange', windowResized);
    document.addEventListener('msfullscreenchange', windowResized);

    console.log("Organic Reflow: setupControls() finished.");
    return true;
}

/**
 * Resets the sketch by clearing all curves and re-initializing them.
 * This is called when the "Reset" button is clicked.
 */
function resetSketch() {
    curves = []; // Clear existing curves
    for (let i = 0; i < settings.numInitialCurves; i++) {
        addNewCurve();
    }
    background(settings.backgroundColor); // Clear the canvas
    console.log("Organic Reflow: Sketch reset. New curves initialized.");
}

/**
 * Adds a new curve to the canvas at a random starting position and direction.
 */
function addNewCurve() {
    const startX = random(width);
    const startY = random(height);
    const startAngle = random(TWO_PI);
    curves.push(new Curve(startX, startY, startAngle));
}
