// Scroll reveal
const reveals = document.querySelectorAll('.reveal');
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
}, { threshold: 0.1 });
reveals.forEach(r => io.observe(r));

// FAQ
function toggleFaq(el) {
  const item = el.parentElement;
  const wasOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
}

// Credit pack selection
function selectCredit(el) {
  document.querySelectorAll('.credit-pack').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

// Toast
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// Smooth nav highlight on scroll
const sections = document.querySelectorAll('section[id], div[id]');
window.addEventListener('scroll', () => {
  const y = window.scrollY + 100;
  sections.forEach(s => {
    const link = document.querySelector(`.nav-links a[href="#${s.id}"]`);
    if (!link) return;
    const inView = s.offsetTop <= y && s.offsetTop + s.offsetHeight > y;
    link.style.color = inView ? 'var(--accent)' : '';
  });
});