const sections = [...document.querySelectorAll('.doc-section')];
const navLinks = [...document.querySelectorAll('.nav-link')];
const tocNav = document.getElementById('tocNav');
const sidebar = document.getElementById('sidebar');
const menuButton = document.getElementById('menuButton');
const modal = document.getElementById('searchModal');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

document.body.classList.add('js-ready');

function currentId() {
  const id = location.hash.slice(1);
  return sections.some((section) => section.id === id) ? id : 'overview';
}

function showSection(id) {
  sections.forEach((section) => section.classList.toggle('active', section.id === id));
  navLinks.forEach((link) => link.classList.toggle('active', link.hash === `#${id}`));
  const section = document.getElementById(id);
  document.title = `${section.dataset.title} · Kraddle Format`;
  buildToc(section);
  sidebar.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function buildToc(section) {
  const headings = [...section.querySelectorAll('h2[id]')];
  tocNav.innerHTML = headings.length
    ? headings.map((heading, index) => `<a class="${index === 0 ? 'active' : ''}" href="#${section.id}:${heading.id}" data-heading="${heading.id}">${heading.textContent}</a>`).join('')
    : '<span class="toc-empty">Section overview</span>';

  tocNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    const heading = document.getElementById(link.dataset.heading);
    heading?.scrollIntoView({ behavior: 'smooth' });
    tocNav.querySelectorAll('a').forEach((item) => item.classList.toggle('active', item === link));
  }));
}

window.addEventListener('hashchange', () => showSection(currentId()));
showSection(currentId());

menuButton.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.copy-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = button.parentElement.querySelector('code').textContent;
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1200);
  });
});

function openSearch() {
  modal.hidden = false;
  searchInput.value = '';
  renderResults('');
  requestAnimationFrame(() => searchInput.focus());
}

function closeSearch() {
  modal.hidden = true;
}

function renderResults(query) {
  const normalized = query.trim().toLowerCase();
  const matches = sections.filter((section) => !normalized || section.textContent.toLowerCase().includes(normalized));
  searchResults.innerHTML = matches.length
    ? matches.map((section) => {
        const text = section.querySelector('.lead')?.textContent || section.textContent.trim();
        return `<a class="search-result" href="#${section.id}"><strong>${section.dataset.title}</strong><span>${text}</span></a>`;
      }).join('')
    : '<div class="search-result"><strong>No results</strong><span>Try a different term.</span></div>';
  searchResults.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeSearch));
}

document.getElementById('searchTrigger').addEventListener('click', openSearch);
document.querySelector('.search-backdrop').addEventListener('click', closeSearch);
searchInput.addEventListener('input', () => renderResults(searchInput.value));
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }
  if (event.key === 'Escape' && !modal.hidden) closeSearch();
});
