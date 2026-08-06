document.addEventListener('DOMContentLoaded', async () => {
  const target = document.getElementById('site-header');
  if (!target) {
    loadSiteSystem();
    return;
  }
  try {
    const res = await fetch('header.html'); // relative path, not "/header.html"
    if (!res.ok) throw new Error('Header fetch failed: ' + res.status);
    target.innerHTML = await res.text();
  } catch (err) {
    console.error('Could not load header:', err);
  } finally {
    loadSiteSystem();
  }
});

function loadSiteSystem() {
  if (!document.querySelector('link[href="site-system.css"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'site-system.css';
    document.head.appendChild(css);
  }

  if (!document.querySelector('script[src="site-system.js"]')) {
    const script = document.createElement('script');
    script.src = 'site-system.js';
    script.defer = true;
    document.body.appendChild(script);
  }
}
