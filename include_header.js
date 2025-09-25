document.addEventListener('DOMContentLoaded', async () => {
  const target = document.getElementById('site-header');
  if (!target) return;
  try {
    const res = await fetch('header.html'); // relative path, not "/header.html"
    if (!res.ok) throw new Error('Header fetch failed: ' + res.status);
    target.innerHTML = await res.text();
  } catch (err) {
    console.error('Could not load header:', err);
  }
});