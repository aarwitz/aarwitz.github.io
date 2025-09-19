document.addEventListener("DOMContentLoaded", async () => {
    const previewContainer = document.getElementById("flying-car-preview");
    try {
        const res = await fetch("FlyingCarReview.html");
        const text = await res.text();
        // Extract the <article> block
        const articleMatch = text.match(/<article[\s\S]*?<\/article>/i);
        if (articleMatch) {
            const articleHTML = articleMatch[0];
            // Find all <p> tags inside <article>
            const pMatches = [...articleHTML.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
            if (pMatches.length > 1) {
                // Use the second <p> (index 1)
                previewContainer.innerHTML = pMatches[1][1];
            } else {
                previewContainer.textContent = "Preview not available.";
            }
        } else {
            previewContainer.textContent = "Preview not available.";
        }
    } catch (e) {
        previewContainer.textContent = "Error loading preview.";
    }
});