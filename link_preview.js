// Link Preview System - Inspired by gwern.net
// Shows content preview on first click, actual navigation on second click or via button

class LinkPreviewSystem {
    constructor() {
        this.previewCache = new Map();
        this.currentPreview = null;
        this.prefetchQueue = new Map(); // Track ongoing prefetch requests
        this.hoverTimeout = null;
        this.previewStack = []; // Track nested previews for gwern-style recursive previewing
        console.log('LinkPreviewSystem initialized');
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('DOM loaded, attaching listeners');
                this.attachListeners();
            });
        } else {
            console.log('DOM already loaded, attaching listeners');
            this.attachListeners();
        }
    }

    attachListeners(container = document) {
        console.log('Attaching click listeners to container:', container === document ? 'document' : 'preview');
        
        // Get all internal HTML links and external links
        const attachToLinks = () => {
            // Internal .html links without target attribute
            const internalLinks = container.querySelectorAll('a[href$=".html"]:not([target])');
            // External links (http/https) without target attribute
            const externalLinks = container.querySelectorAll('a[href^="http://"]:not([target]), a[href^="https://"]:not([target])');
            
            const links = [...internalLinks, ...externalLinks];
            console.log(`Found ${internalLinks.length} internal links and ${externalLinks.length} external links to attach to`);
            
            links.forEach(link => {
                // Skip if already has handlers attached
                if (link._previewHandlerAttached) {
                    return;
                }
                
                // Skip header links (only in main document, not in previews)
                if (container === document && link.closest('#site-header')) {
                    console.log('Skipping header link:', link.href);
                    return;
                }
                
                // Mark as having handlers attached
                link._previewHandlerAttached = true;
                
                // Create and store the click handler
                link._previewHandler = (e) => {
                    const href = link.getAttribute('href');
                    
                    console.log('Link clicked:', href, 'previewShown:', link.dataset.previewShown);
                    
                    // Skip anchor links
                    if (href.startsWith('#')) return;
                    
                    // Check if this link already has a preview shown
                    if (link.dataset.previewShown === 'true') {
                        console.log('Second click - allowing navigation');
                        return;
                    }
                    
                    // First click - show preview
                    console.log('First click - preventing default and showing preview');
                    e.preventDefault();
                    e.stopPropagation();
                    this.showPreview(href, link);
                };
                
                // Create and store the hover handler for prefetching (background caching)
                link._hoverHandler = (e) => {
                    const href = link.getAttribute('href');
                    
                    // Skip anchor links
                    if (href.startsWith('#')) return;
                    
                    // Mark as hovering
                    link._isHovering = true;
                    
                    // Clear any existing timeout
                    if (this.hoverTimeout) {
                        clearTimeout(this.hoverTimeout);
                    }
                    
                    // Wait 300ms before prefetching (avoid fetching on quick mouseovers)
                    this.hoverTimeout = setTimeout(() => {
                        console.log('Hover timeout reached, prefetching for:', href);
                        // Pass link element and shouldShowOnComplete=true to show preview when ready
                        this.prefetchContent(href, link, true);
                    }, 300);
                };
                
                // Clear timeout on mouse leave
                link._leaveHandler = () => {
                    // Mark as not hovering
                    link._isHovering = false;
                    
                    if (this.hoverTimeout) {
                        clearTimeout(this.hoverTimeout);
                        this.hoverTimeout = null;
                    }
                };
                
                link.addEventListener('mouseenter', link._hoverHandler);
                link.addEventListener('mouseleave', link._leaveHandler);
                
                // Click handler shows preview (with loading state if not cached)
                link.addEventListener('click', link._previewHandler);
                console.log('Attached handlers to:', link.href);
            });
        };
        
        // Attach initially
        attachToLinks();
        
        // Re-attach if DOM changes (for dynamically loaded content)
        const observer = new MutationObserver(() => {
            console.log('DOM mutated, re-attaching listeners');
            attachToLinks();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Close preview on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentPreview) {
                this.closePreview();
            }
        });
    }

    async showPreview(url, linkElement) {
        // Determine if this is an external link
        const isExternal = url.startsWith('http://') || url.startsWith('https://');
        
        // Check cache first
        let content = this.previewCache.get(url);
        
        if (!content) {
            // Check if a prefetch is already in progress
            const prefetchInProgress = this.prefetchQueue.get(url);
            
            if (prefetchInProgress) {
                // Show loading indicator while waiting for prefetch to complete
                if (isExternal) {
                    this.showLoadingPreview(url, linkElement);
                }
                
                // Wait for the prefetch to complete
                await prefetchInProgress;
                
                // Get the cached content (should be there now)
                content = this.previewCache.get(url);
            }
            
            if (!content) {
                // No prefetch in progress and no cache, so fetch now
                if (isExternal) {
                    this.showLoadingPreview(url, linkElement);
                }
                
                try {
                    if (isExternal) {
                        // For external links, use CORS proxies
                        content = await this.fetchExternalPreview(url);
                    } else {
                        // For internal links, fetch directly
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                        const html = await response.text();
                        content = this.extractContent(html, url);
                    }
                    this.previewCache.set(url, content);
                } catch (error) {
                    console.error('Preview fetch error:', error);
                    // On error, just navigate normally
                    window.location.href = url;
                    return;
                }
            }
        }

        this.renderPreview(content, url, linkElement);
    }

    async prefetchContent(url, linkElement = null, shouldShowOnComplete = false) {
        // Don't prefetch if already cached or currently being fetched
        if (this.previewCache.has(url) || this.prefetchQueue.has(url)) {
            console.log('Prefetch skipped (already cached or in progress):', url);
            // If already cached and we should show it, show it now
            if (this.previewCache.has(url) && shouldShowOnComplete && linkElement) {
                this.renderPreview(this.previewCache.get(url), url, linkElement);
            }
            return;
        }
        
        console.log('Prefetching:', url);
        
        const isExternal = url.startsWith('http://') || url.startsWith('https://');
        
        // Create a promise for this prefetch
        const prefetchPromise = (async () => {
            try {
                let content;
                if (isExternal) {
                    content = await this.fetchExternalPreview(url);
                } else {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                    const html = await response.text();
                    content = this.extractContent(html, url);
                }
                this.previewCache.set(url, content);
                console.log('Prefetch successful:', url);
                
                // If we should show on complete and link element is provided, show the preview
                if (shouldShowOnComplete && linkElement) {
                    // Check if user is still hovering by seeing if this link's hover state is active
                    const isStillHovering = linkElement._isHovering;
                    if (isStillHovering) {
                        console.log('User still hovering, showing preview automatically');
                        this.renderPreview(content, url, linkElement);
                    }
                }
            } catch (error) {
                console.error('Prefetch error:', url, error);
            } finally {
                this.prefetchQueue.delete(url);
            }
        })();
        
        this.prefetchQueue.set(url, prefetchPromise);
    }

    showLoadingPreview(url, linkElement) {
        // Create a simple loading preview
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        
        const loadingContent = {
            title: 'Loading Preview...',
            excerpt: '',
            fullContent: `
                <div class="text-center py-12 px-4">
                    <div class="mb-6">
                        <svg class="w-16 h-16 mx-auto text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-semibold text-white mb-3">Fetching content...</h3>
                    <p class="text-gray-400 mb-2 text-sm">Loading preview from</p>
                    <p class="text-blue-400 font-medium mb-4">${this.escapeHtml(domain)}</p>
                    <div class="max-w-md mx-auto">
                        <div class="bg-[#0d1117] rounded-lg p-4 border border-gray-700">
                            <div class="flex items-center justify-center space-x-2">
                                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                            </div>
                            <p class="text-sm text-gray-400 mt-3">This may take 10-15 seconds...</p>
                        </div>
                    </div>
                </div>
            `,
            archiveNote: null
        };
        
        this.renderPreview(loadingContent, url, linkElement, true); // true = isLoading
    }

    async fetchExternalPreview(url) {
        console.log('Fetching external preview for:', url);
        
        // Try multiple approaches to get preview content
        
        // Approach 1: Try to fetch directly (will work for sites with permissive CORS)
        try {
            console.log('Attempting direct fetch...');
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                const content = this.extractContent(html, url);
                console.log('Direct fetch successful!');
                return content;
            }
        } catch (error) {
            console.log('Direct fetch failed (expected due to CORS):', error.message);
        }
        
        // Approach 2: Try CORS proxy services
        const corsProxies = [
            {
                name: 'AllOrigins',
                url: (targetUrl) => `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
                extractHtml: (data) => data.contents,
                timeout: 12000 // 12 second timeout
            },
            {
                name: 'CORS Anywhere (Heroku)',
                url: (targetUrl) => `https://cors-anywhere.herokuapp.com/${targetUrl}`,
                extractHtml: (data) => data,
                timeout: 8000 // 8 second timeout
            }
        ];
        
        for (const proxy of corsProxies) {
            try {
                console.log(`Trying ${proxy.name} proxy...`);
                const proxyUrl = proxy.url(url);
                console.log('Proxy URL:', proxyUrl);
                
                // Create a timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`${proxy.name} timeout after ${proxy.timeout}ms`)), proxy.timeout);
                });
                
                // Race between fetch and timeout
                const response = await Promise.race([
                    fetch(proxyUrl),
                    timeoutPromise
                ]);
                
                console.log(`${proxy.name} response status:`, response.status);
                
                if (!response.ok) {
                    throw new Error(`${proxy.name} returned ${response.status}`);
                }
                
                const data = await response.json();
                const html = proxy.extractHtml(data);
                
                if (!html || html.length < 100) {
                    throw new Error('Retrieved HTML too short or empty');
                }
                
                console.log(`Successfully fetched via ${proxy.name}, HTML length:`, html.length);
                
                // Extract content
                const content = this.extractContent(html, url);
                content.archiveNote = `Content fetched via ${proxy.name} proxy`;
                
                console.log(`${proxy.name} fetch successful!`);
                return content;
                
            } catch (error) {
                console.error(`${proxy.name} fetch failed:`, error);
                // Continue to next proxy
            }
        }
        
        // Approach 3: Try Archive.org Wayback Machine
        try {
            console.log('Trying Archive.org Wayback Machine...');
            const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
            console.log('Availability URL:', availabilityUrl);
            
            const availResponse = await fetch(availabilityUrl);
            console.log('Availability response status:', availResponse.status);
            
            if (!availResponse.ok) {
                throw new Error(`Wayback API returned ${availResponse.status}`);
            }
            
            const availData = await availResponse.json();
            console.log('Availability data:', availData);
            
            if (!availData.archived_snapshots || !availData.archived_snapshots.closest) {
                throw new Error('No archived snapshot available');
            }
            
            const snapshotUrl = availData.archived_snapshots.closest.url;
            console.log('Found snapshot:', snapshotUrl);
            
            // Try to fetch the archived page via CORS proxy
            for (const proxy of corsProxies) {
                try {
                    console.log(`Trying to fetch Archive.org snapshot via ${proxy.name}...`);
                    const proxyUrl = proxy.url(snapshotUrl);
                    
                    const snapshotResponse = await fetch(proxyUrl);
                    if (!snapshotResponse.ok) continue;
                    
                    const data = await snapshotResponse.json();
                    const html = proxy.extractHtml(data);
                    
                    if (!html || html.length < 100) continue;
                    
                    console.log('Successfully fetched snapshot HTML, length:', html.length);
                    
                    // Extract content from archived page
                    const content = this.extractContent(html, url);
                    
                    // Add a note that this is from Archive.org
                    const timestamp = availData.archived_snapshots.closest.timestamp;
                    const archiveDate = new Date(timestamp.slice(0, 4) + '-' + timestamp.slice(4, 6) + '-' + timestamp.slice(6, 8));
                    content.archiveNote = `Archived snapshot from ${archiveDate.toLocaleDateString()} (via ${proxy.name})`;
                    
                    console.log('Archive.org fetch successful!');
                    return content;
                    
                } catch (error) {
                    console.error(`Failed to fetch snapshot via ${proxy.name}:`, error);
                    continue;
                }
            }
            
            throw new Error('Could not fetch Archive.org snapshot via any proxy');
            
        } catch (error) {
            console.error('Archive.org fetch failed:', error);
        }
        
        // Approach 4: Create a metadata-only preview with better UX
        console.log('All fetch methods failed, falling back to metadata preview...');
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const path = urlObj.pathname;
        
        // Try to extract a title from the URL
        let urlTitle = path.split('/').filter(p => p).pop() || domain;
        urlTitle = urlTitle.replace(/_/g, ' ').replace(/-/g, ' ');
        urlTitle = urlTitle.charAt(0).toUpperCase() + urlTitle.slice(1);
        
        return {
            title: urlTitle || 'External Link',
            excerpt: '',
            fullContent: `
                <div class="text-center py-8 px-4">
                    <div class="mb-6">
                        <svg class="w-20 h-20 mx-auto text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
                        </svg>
                    </div>
                    <h3 class="text-2xl font-semibold text-white mb-3">${this.escapeHtml(urlTitle)}</h3>
                    <p class="text-gray-400 mb-2 text-sm">External link from</p>
                    <p class="text-blue-400 font-medium mb-6">${this.escapeHtml(domain)}</p>
                    
                    <div class="bg-[#0d1117] rounded-lg p-5 border border-gray-700 mb-6 max-w-2xl mx-auto">
                        <p class="text-xs text-gray-500 mb-2 uppercase tracking-wide">Full URL</p>
                        <p class="text-sm text-blue-300 break-all">${this.escapeHtml(url)}</p>
                    </div>
                    
                    <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 max-w-xl mx-auto mb-6">
                        <p class="text-sm text-yellow-200">
                            <strong>Preview unavailable:</strong> Could not fetch content due to CORS restrictions and proxy failures.
                        </p>
                    </div>
                    
                    <p class="text-sm text-gray-400">
                        Click <strong class="text-white">"Visit Full Page"</strong> below or click the original link again to open the external site.
                    </p>
                </div>
            `,
            archiveNote: null // Don't show archive note for unavailable previews
        };
    }

    extractContent(html, url) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Detect site type for better extraction
        const urlObj = new URL(url);
        const isWikipedia = urlObj.hostname.includes('wikipedia.org');
        const isMathWorld = urlObj.hostname.includes('mathworld.wolfram.com');
        
        let article = null;
        let title = '';
        let infoboxHtml = '';
        let leadImageHtml = '';
        
        // Site-specific extraction logic
        if (isWikipedia) {
            // Wikipedia-specific selectors
            article = doc.querySelector('#mw-content-text') || 
                     doc.querySelector('#bodyContent') ||
                     doc.querySelector('.mw-parser-output');
            title = doc.querySelector('#firstHeading')?.textContent || 
                   doc.querySelector('h1')?.textContent || 
                   doc.querySelector('title')?.textContent?.split('-')[0]?.trim() || 
                   'Wikipedia Article';
            
            // Extract infobox (the summary box on the right side of Wikipedia articles)
            const infobox = article?.querySelector('.infobox');
            if (infobox) {
                const infoboxClone = infobox.cloneNode(true);
                // Remove edit links and other clutter
                infoboxClone.querySelectorAll('.mw-editsection, script, style').forEach(el => el.remove());
                infoboxHtml = `<div class="wikipedia-infobox">${infoboxClone.innerHTML}</div>`;
            }
            
            // Extract the lead/main image
            const mainImage = article?.querySelector('.infobox img') || 
                             article?.querySelector('img[class*="thumb"]') ||
                             article?.querySelector('figure img') ||
                             article?.querySelector('img');
            
            if (mainImage) {
                const imgSrc = mainImage.getAttribute('src') || mainImage.getAttribute('data-src');
                if (imgSrc) {
                    // Make sure we use absolute URLs
                    let fullImgSrc = imgSrc;
                    if (imgSrc.startsWith('//')) {
                        fullImgSrc = 'https:' + imgSrc;
                    } else if (imgSrc.startsWith('/')) {
                        fullImgSrc = 'https://en.wikipedia.org' + imgSrc;
                    }
                    
                    const imgAlt = mainImage.getAttribute('alt') || title;
                    const imgCaption = mainImage.closest('figure')?.querySelector('figcaption')?.textContent || '';
                    
                    leadImageHtml = `
                        <div class="wikipedia-lead-image">
                            <img src="${fullImgSrc}" alt="${this.escapeHtml(imgAlt)}" loading="lazy" />
                            ${imgCaption ? `<p class="image-caption">${this.escapeHtml(imgCaption)}</p>` : ''}
                        </div>
                    `;
                }
            }
            
            // Extract table of contents (section structure)
            let tocHtml = '';
            const headings = article?.querySelectorAll('h2, h3');
            if (headings && headings.length > 0) {
                tocHtml = '<div class="wikipedia-toc"><h3>Contents</h3><ul>';
                let currentH2List = null;
                
                headings.forEach((heading, index) => {
                    // Skip headings after a certain point to keep TOC concise
                    if (index > 15) return;
                    
                    const headingText = heading.textContent.replace(/\[edit\]/g, '').trim();
                    // Skip common footer sections
                    if (['References', 'External links', 'Notes', 'Bibliography', 'See also', 'Further reading'].includes(headingText)) {
                        return;
                    }
                    
                    // Get the section anchor from the heading's parent or sibling
                    let sectionId = heading.id || heading.querySelector('.mw-headline')?.id || '';
                    if (!sectionId && heading.querySelector('.mw-headline')) {
                        sectionId = heading.querySelector('.mw-headline').getAttribute('id');
                    }
                    
                    // Create Wikipedia section URL
                    const urlObj = new URL(url);
                    const sectionUrl = sectionId 
                        ? `${urlObj.origin}${urlObj.pathname}#${sectionId}`
                        : '';
                    
                    if (heading.tagName === 'H2') {
                        // Close previous H2's sublist if exists
                        if (currentH2List) {
                            tocHtml += '</ul></li>';
                            currentH2List = null;
                        }
                        if (sectionUrl) {
                            tocHtml += `<li class="toc-h2"><a href="${sectionUrl}" class="toc-link">${this.escapeHtml(headingText)}</a>`;
                        } else {
                            tocHtml += `<li class="toc-h2">${this.escapeHtml(headingText)}`;
                        }
                        currentH2List = true;
                    } else if (heading.tagName === 'H3' && currentH2List) {
                        // Only show H3 if we're inside an H2
                        if (currentH2List === true) {
                            tocHtml += '<ul>';
                            currentH2List = 'has-children';
                        }
                        if (sectionUrl) {
                            tocHtml += `<li class="toc-h3"><a href="${sectionUrl}" class="toc-link">${this.escapeHtml(headingText)}</a></li>`;
                        } else {
                            tocHtml += `<li class="toc-h3">${this.escapeHtml(headingText)}</li>`;
                        }
                    }
                });
                
                // Close any open lists
                if (currentH2List === 'has-children') {
                    tocHtml += '</ul>';
                }
                if (currentH2List) {
                    tocHtml += '</li>';
                }
                
                tocHtml += '</ul></div>';
            }
            
            // Get only the intro paragraphs (before first H2)
            const allElements = Array.from(article.children);
            const firstH2Index = allElements.findIndex(el => el.tagName === 'H2');
            const introElements = firstH2Index > 0 
                ? allElements.slice(0, firstH2Index)
                : allElements.slice(0, 5); // Fallback to first 5 elements
            
            // Build intro content
            let introContent = '';
            let paraCount = 0;
            const maxParas = 3; // Only first 3 paragraphs
            
            for (const el of introElements) {
                // Only include paragraphs for intro
                if (el.tagName !== 'P') continue;
                if (paraCount >= maxParas) break;
                
                const text = el.textContent.trim();
                if (text.length < 20) continue; // Skip very short paragraphs
                
                const clone = el.cloneNode(true);
                // Remove references, edit links, etc
                clone.querySelectorAll('.reference, .mw-editsection, sup').forEach(el => el.remove());
                
                // Fix relative links
                clone.querySelectorAll('a[href^="/"]').forEach(link => {
                    link.href = 'https://en.wikipedia.org' + link.getAttribute('href');
                });
                
                introContent += clone.outerHTML;
                paraCount++;
            }
            
            return {
                title: title.trim(),
                excerpt: '',
                fullContent: introContent + tocHtml,
                infobox: infoboxHtml,
                leadImage: leadImageHtml
            };
            
        } else if (isMathWorld) {
            // MathWorld-specific selectors
            article = doc.querySelector('#content') || doc.querySelector('article');
            title = doc.querySelector('h1')?.textContent || 'MathWorld Article';
        } else {
            // Generic extraction
            article = doc.querySelector('article') ||
                     doc.querySelector('main') ||
                     doc.querySelector('.prose') ||
                     doc.querySelector('#content') ||
                     doc.querySelector('.content');
            title = doc.querySelector('h1')?.textContent || 
                   doc.querySelector('title')?.textContent || 
                   'Preview';
        }
        
        if (!article) {
            console.warn('Could not find main content area');
            return {
                title: title || 'Preview',
                excerpt: 'Content extraction failed - main content area not found.',
                fullContent: '<p class="text-gray-400">Unable to extract content from this page.</p>',
                infobox: '',
                leadImage: ''
            };
        }

        // For non-Wikipedia sites, use the old extraction logic
        const selectorsToRemove = [
            '.navbox', '.navigation', '.sidebar', '.infobox',
            '.reference', '.reflist', '.citations', '.footer',
            'nav', 'aside', '.toc', '#toc', '.mw-editsection',
            'style', 'script', 'noscript', '.printfooter',
            '.catlinks', '.mw-jump-link', '#siteSub', '#contentSub',
            '.mbox', '.ambox', '.hatnote', '.dablink'
        ];
        
        selectorsToRemove.forEach(selector => {
            article.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Get first few paragraphs
        const allElements = Array.from(article.children);
        const firstHeadingIndex = allElements.findIndex(el => 
            el.tagName === 'H2' || el.tagName === 'H3'
        );
        
        const leadElements = firstHeadingIndex > 0 
            ? allElements.slice(0, firstHeadingIndex)
            : allElements.slice(0, 10);

        // Build the preview content
        let fullContent = '';
        let charCount = 0;
        const maxChars = 3000;
        
        for (const el of leadElements) {
            if (charCount >= maxChars) break;
            
            const text = el.textContent.trim();
            if (text.length < 10) continue;
            
            const clone = el.cloneNode(true);
            selectorsToRemove.forEach(selector => {
                clone.querySelectorAll(selector).forEach(unwanted => unwanted.remove());
            });
            
            fullContent += clone.outerHTML;
            charCount += text.length;
        }

        return {
            title: title.trim(),
            excerpt: '',
            fullContent: fullContent,
            infobox: infoboxHtml,
            leadImage: leadImageHtml
        };
    }

    renderPreview(content, url, linkElement, isLoading = false) {
        // Create archive note if present
        const archiveNoteHtml = content.archiveNote 
            ? `<div class="link-preview-archive-note">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
                   </svg>
                   <span>${this.escapeHtml(content.archiveNote)}</span>
               </div>`
            : '';

        // If updating existing preview (from loading to loaded), just update the content
        if (this.currentPreview && this.currentPreview.parentNode) {
            const container = this.currentPreview.querySelector('.link-preview-container');
            if (container) {
                console.log('Updating existing preview modal with loaded content');
                container.innerHTML = `
                    <div class="link-preview-header">
                        <h2 class="link-preview-title">${this.escapeHtml(content.title)}</h2>
                        <button class="link-preview-close" aria-label="Close preview">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    ${archiveNoteHtml}
                    <div class="link-preview-body">
                        ${content.infobox ? `<div class="link-preview-infobox-column">${content.infobox}</div>` : ''}
                        <div class="link-preview-main-column">
                            ${content.leadImage || ''}
                            <div class="link-preview-content prose max-w-none text-gray-300">
                                ${content.fullContent}
                            </div>
                        </div>
                    </div>
                    <div class="link-preview-footer">
                        <a href="${url}" class="link-preview-visit-btn">
                            <span>Visit Full Page</span>
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                            </svg>
                        </a>
                    </div>
                `;
                
                // Re-attach preview system to links in the updated content
                this.attachListeners(this.currentPreview);
                
                // Re-attach event listeners
                const backdrop = this.currentPreview.querySelector('.link-preview-backdrop');
                const closeBtn = container.querySelector('.link-preview-close');
                
                // Remove old listeners if they exist
                if (backdrop._clickHandler) {
                    backdrop.removeEventListener('click', backdrop._clickHandler);
                }
                if (closeBtn._clickHandler) {
                    closeBtn.removeEventListener('click', closeBtn._clickHandler);
                }
                
                // Add new listeners
                backdrop._clickHandler = () => this.closePreview();
                closeBtn._clickHandler = () => this.closePreview();
                backdrop.addEventListener('click', backdrop._clickHandler);
                closeBtn.addEventListener('click', closeBtn._clickHandler);
                
                console.log('Preview content updated, modal staying open');
                return;
            }
        }

        // Close any existing preview before creating a new one
        this.closePreview();

        // Create new preview modal
        console.log('Creating new preview modal');
        const modal = document.createElement('div');
        modal.className = 'link-preview-modal';
        modal.innerHTML = `
            <div class="link-preview-backdrop"></div>
            <div class="link-preview-container">
                <div class="link-preview-header">
                    <h2 class="link-preview-title">${this.escapeHtml(content.title)}</h2>
                    <button class="link-preview-close" aria-label="Close preview">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                ${archiveNoteHtml}
                <div class="link-preview-body">
                    ${content.infobox ? `<div class="link-preview-infobox-column">${content.infobox}</div>` : ''}
                    <div class="link-preview-main-column">
                        ${content.leadImage || ''}
                        <div class="link-preview-content prose max-w-none text-gray-300">
                            ${content.fullContent}
                        </div>
                    </div>
                </div>
                <div class="link-preview-footer">
                    <a href="${url}" class="link-preview-visit-btn">
                        <span>Visit Full Page</span>
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                        </svg>
                    </a>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Track this preview in the stack
        this.previewStack.push(modal);
        this.currentPreview = modal;

        // Position the preview intelligently based on link location
        this.positionPreview(modal, linkElement);

        // Attach preview system to links WITHIN this preview (gwern-style recursive previewing!)
        this.attachListeners(modal);

        // Add event listeners
        modal.querySelector('.link-preview-backdrop').addEventListener('click', () => this.closePreview());
        modal.querySelector('.link-preview-close').addEventListener('click', () => this.closePreview());
        
        // Mark the original link as preview-shown for second click behavior
        linkElement.dataset.previewShown = 'true';
        
        // Reset the flag when preview is closed
        modal.addEventListener('preview-closed', () => {
            linkElement.dataset.previewShown = 'false';
        });

        // Animate in
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    }

    positionPreview(modal, linkElement) {
        const container = modal.querySelector('.link-preview-container');
        const linkRect = linkElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Check if this is a nested preview (link is inside another preview)
        const isNested = linkElement.closest('.link-preview-modal') !== null;
        const parentPreview = isNested ? linkElement.closest('.link-preview-modal') : null;
        
        // Get container dimensions (it's in the DOM but not visible yet)
        const containerWidth = Math.min(700, viewportWidth * 0.9);
        const containerHeight = Math.min(viewportHeight * 0.8, 600);
        
        const padding = 20;
        const verticalOffset = 10; // Small offset below the link
        const nestedOffset = 30; // Additional offset for nested previews
        
        // Calculate horizontal position
        let left, right;
        
        if (isNested) {
            // For nested previews, try to position to the side of the parent
            const parentRect = parentPreview.querySelector('.link-preview-container').getBoundingClientRect();
            
            // Try to position to the right of parent
            if (parentRect.right + nestedOffset + containerWidth <= viewportWidth - padding) {
                left = parentRect.right + nestedOffset;
            } 
            // Or to the left of parent
            else if (parentRect.left - nestedOffset - containerWidth >= padding) {
                right = viewportWidth - parentRect.left + nestedOffset;
            }
            // Or slightly offset from parent
            else {
                left = Math.min(parentRect.left + nestedOffset, viewportWidth - containerWidth - padding);
            }
        } else {
            // Original positioning logic for first-level previews
            // Try right side first
            if (linkRect.right + padding + containerWidth <= viewportWidth - padding) {
                // Position to the right of the link
                left = linkRect.right + padding;
            } else if (linkRect.left - padding - containerWidth >= padding) {
                // Position to the left of the link
                right = viewportWidth - linkRect.left + padding;
            } else {
                // Center horizontally if link is too centered
                left = Math.max(padding, (viewportWidth - containerWidth) / 2);
            }
        }
        
        // Calculate vertical position
        let top, bottom;
        
        if (isNested) {
            // For nested previews, try to align with the link vertically
            const parentRect = parentPreview.querySelector('.link-preview-container').getBoundingClientRect();
            
            // Try to align top with the link
            if (linkRect.top + containerHeight <= viewportHeight - padding) {
                top = linkRect.top;
            }
            // Or align bottom
            else if (linkRect.bottom - containerHeight >= padding) {
                top = linkRect.bottom - containerHeight;
            }
            // Or slightly offset from parent top
            else {
                top = Math.max(padding, parentRect.top + nestedOffset);
            }
        } else {
            // Original vertical positioning for first-level previews
            if (linkRect.bottom + verticalOffset + containerHeight <= viewportHeight - padding) {
                // Position below the link
                top = linkRect.bottom + verticalOffset;
            } else if (linkRect.top - verticalOffset - containerHeight >= padding) {
                // Position above the link
                bottom = viewportHeight - linkRect.top + verticalOffset;
            } else {
                // Center vertically and ensure link is still visible
                if (linkRect.top < viewportHeight / 2) {
                    // Link is in top half, position preview below it
                    top = Math.min(linkRect.bottom + verticalOffset, viewportHeight - containerHeight - padding);
                } else {
                    // Link is in bottom half, position preview above it
                    top = Math.max(padding, linkRect.top - containerHeight - verticalOffset);
                }
            }
        }
        
        // Apply positioning
        if (left !== undefined) {
            container.style.left = `${left}px`;
        } else if (right !== undefined) {
            container.style.right = `${right}px`;
        }
        
        if (top !== undefined) {
            container.style.top = `${top}px`;
        } else if (bottom !== undefined) {
            container.style.bottom = `${bottom}px`;
        }
        
        // Set max dimensions
        container.style.maxWidth = `${containerWidth}px`;
        container.style.maxHeight = `${containerHeight}px`;
    }

    closePreview() {
        if (!this.currentPreview) return;

        const previewToClose = this.currentPreview;
        
        // Remove from stack
        const index = this.previewStack.indexOf(previewToClose);
        if (index > -1) {
            this.previewStack.splice(index, 1);
        }
        
        // Update currentPreview to the topmost remaining preview
        this.currentPreview = this.previewStack.length > 0 
            ? this.previewStack[this.previewStack.length - 1] 
            : null;

        previewToClose.classList.remove('active');
        
        // Dispatch custom event
        previewToClose.dispatchEvent(new CustomEvent('preview-closed'));
        
        setTimeout(() => {
            if (previewToClose && previewToClose.parentNode) {
                previewToClose.parentNode.removeChild(previewToClose);
            }
        }, 300); // Match transition duration
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the preview system
console.log('Starting LinkPreviewSystem initialization...');
const previewSystem = new LinkPreviewSystem();
console.log('LinkPreviewSystem instance created:', previewSystem);

// Add a visible indicator that the system loaded
window.addEventListener('load', () => {
    console.log('Window loaded. Preview system ready.');
});
