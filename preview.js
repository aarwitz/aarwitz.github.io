document.addEventListener("DOMContentLoaded", async () => {
    // Auto-discover all preview containers
    const previewContainers = document.querySelectorAll('[id$="-preview"]');
    
    for (const container of previewContainers) {
        const previewId = container.id;
        
        // Find the parent article element to get the URL
        const linkElement = container.closest('a');
        if (!linkElement) continue;
        
        const url = linkElement.getAttribute('href');
        if (!url || url.startsWith('#')) continue;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            
            const text = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            
            // Extract content - try article first, then main sections
            let contentElement = doc.querySelector('article .prose, article');
            if (!contentElement) {
                contentElement = doc.querySelector('section.lg\\:col-span-2, main, section');
            }
            
            if (contentElement) {
                // Extract text content - get first substantial paragraph
                const paragraphs = contentElement.querySelectorAll('p');
                let previewText = '';
                
                for (const p of paragraphs) {
                    const text = p.textContent.trim();
                    // Skip short paragraphs, get one with substance
                    if (text.length > 100) {
                        previewText = text;
                        break;
                    }
                }
                
                // Truncate to reasonable preview length
                if (previewText.length > 300) {
                    previewText = previewText.substring(0, 300) + '...';
                }
                
                // Extract first image or video
                let mediaElement = contentElement.querySelector('img, video');
                let mediaSrc = null;
                let mediaType = null;
                let posterSrc = null;
                
                if (mediaElement) {
                    if (mediaElement.tagName === 'VIDEO') {
                        const source = mediaElement.querySelector('source');
                        mediaSrc = source ? source.getAttribute('src') : mediaElement.getAttribute('src');
                        posterSrc = mediaElement.getAttribute('poster');
                        
                        // If no poster attribute, try to infer poster filename
                        if (!posterSrc && mediaSrc) {
                            const baseName = mediaSrc.replace(/\.(webm|mp4)$/i, '');
                            posterSrc = `${baseName}-poster.jpg`;
                        }
                        
                        mediaType = 'video';
                    } else {
                        mediaSrc = mediaElement.getAttribute('src');
                        mediaType = 'image';
                    }
                }
                
                // Create preview layout with text on left, media on right
                if (mediaSrc && mediaType) {
                    container.innerHTML = `
                        <div class="flex gap-4">
                            <div class="flex-1 text-sm leading-relaxed opacity-0 animate-fade-in">
                                ${previewText}
                            </div>
                            <div class="w-32 h-24 flex-shrink-0 rounded overflow-hidden bg-[#0d1117] opacity-0 animate-fade-in" style="animation-delay: 0.1s">
                                ${mediaType === 'video' 
                                    ? `<video autoplay loop muted playsinline preload="none" ${posterSrc ? `poster="${posterSrc}"` : ''} class="w-full h-full object-cover bg-[#0d1117]">
                                           <source src="${mediaSrc}" type="video/webm">
                                       </video>`
                                    : `<img src="${mediaSrc}" alt="Preview" class="w-full h-full object-cover">`
                                }
                            </div>
                        </div>
                    `;
                } else {
                    container.innerHTML = `
                        <div class="text-sm leading-relaxed opacity-0 animate-fade-in">
                            ${previewText}
                        </div>
                    `;
                }
                
                // Trigger animation
                setTimeout(() => {
                    const elements = container.querySelectorAll('.animate-fade-in');
                    elements.forEach(el => el.style.opacity = '1');
                }, 50);
                
            } else {
                container.textContent = "Preview not available.";
            }
        } catch (e) {
            container.textContent = "Error loading preview.";
            console.error(`Preview error for ${previewId}:`, e);
        }
    }
});

// Add CSS animation for fade-in effect
if (!document.querySelector('#preview-animations')) {
    const style = document.createElement('style');
    style.id = 'preview-animations';
    style.textContent = `
        .animate-fade-in {
            transition: opacity 0.6s ease-in;
        }
    `;
    document.head.appendChild(style);
}