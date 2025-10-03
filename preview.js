document.addEventListener("DOMContentLoaded", async () => {
    const previews = {
        "flying-car-preview": { url: "FlyingCarReview.html", paragraphIndex: 1 },
        "truss-preview": { url: "truss.html", paragraphIndex: 0 },
        "swipt-preview": { url: "SWIPT.html", paragraphIndex: 1 },  // Extract the abstract paragraph
        "portfolio-preview": { url: "PortfolioOptimizer.html", paragraphIndex: 0 },  // Extract the first paragraph from the overview
        "robot-preview": { url: "RobotConfigurationSpace.html", paragraphIndex: 0 },  // Extract the project overview
        "socket-preview": { url: "SocketCpp.html", paragraphIndex: 0 },  // Extract the project overview paragraph
        "smbus-preview": { url: "SMBusProtocol.html", paragraphIndex: 0 },  // Extract the SMBus overview
        "uart-i2c-preview": { url: "UartVsI2c.html", paragraphIndex: 0 },  // Extract the serial communication overview
        "performance-engineering-preview": { url: "PerformanceEngineering.html", paragraphIndex: 0 },  // Extract the introduction paragraph
        "camera-calibration-preview": { url: "CameraCalibration.html", paragraphIndex: 0 }  // Extract the introduction paragraph
    };

    for (const [previewId, config] of Object.entries(previews)) {
        const container = document.getElementById(previewId);
        if (!container) continue;

        try {
            const res = await fetch(config.url);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            
            const text = await res.text();
            
            // Try to find article first, then main content section
            let contentMatch = text.match(/<article[\s\S]*?<\/article>/i);
            if (!contentMatch) {
                // For truss.html, look for the main content section (lg:col-span-2)
                contentMatch = text.match(/<section class="lg:col-span-2[\s\S]*?<\/section>/i);
                if (!contentMatch) {
                    // Fallback to any section
                    contentMatch = text.match(/<section[\s\S]*?<\/section>/i);
                }
            }
            
            if (contentMatch) {
                const contentHTML = contentMatch[0];
                const pMatches = [...contentHTML.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
                
                if (pMatches.length > config.paragraphIndex) {
                    container.innerHTML = pMatches[config.paragraphIndex][1];
                } else {
                    container.textContent = "Preview not available.";
                }
            } else {
                container.textContent = "Preview not available.";
            }
        } catch (e) {
            container.textContent = "Error loading preview.";
            console.error(`Preview error for ${previewId}:`, e);
        }
    }
});