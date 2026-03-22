(function () {
  var LN_STYLE = 'font-size:9px;padding:0 20px 0 4px;margin-right:12px;';
  var PRE_STYLE = 'padding-left:16px;';

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(function () {
      if (btn) {
        var icon = btn.querySelector('.material-symbols-outlined');
        var orig = icon ? icon.textContent : '';
        if (icon) icon.textContent = 'check';
        btn.classList.add('text-green-600');
        setTimeout(function () {
          if (icon) icon.textContent = orig || 'content_copy';
          btn.classList.remove('text-green-600');
        }, 1200);
      }
    });
  }

  const loginSection = document.getElementById('login-section');
  const searchSection = document.getElementById('search-section');
  const resultsSection = document.getElementById('results-section');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const resultsList = document.getElementById('results-list');
  const resultsTitle = document.getElementById('results-title');
  const resultsLoading = document.getElementById('results-loading');
  const resultsEmpty = document.getElementById('results-empty');
  const btnLogout = document.getElementById('btn-logout');
  const sidebarUsername = document.getElementById('sidebar-username');
  const detailSection = document.getElementById('detail-section');
  const detailPath = document.getElementById('detail-path');
  const detailCode = document.getElementById('detail-code');
  const detailRepo = document.getElementById('detail-repo');
  const detailFilepath = document.getElementById('detail-filepath');
  const btnBackSearch = document.getElementById('btn-back-search');
  const headerBack = document.getElementById('header-back');
  const detailLinkBitbucket = document.getElementById('detail-link-bitbucket');
  const detailLinkSidebar = document.getElementById('detail-link-sidebar');
  const headerSearchWrap = document.getElementById('header-search-wrap');
  const searchHero = document.getElementById('search-hero');
  const detailBreadcrumb = document.getElementById('detail-breadcrumb');
  const detailFileTypeBadge = document.getElementById('detail-file-type-badge');
  const explorerRoot = document.querySelector('.explorer-root');
  const explorerChildren = document.getElementById('explorer-children');
  const explorerPlaceholder = document.getElementById('explorer-placeholder');
  const explorerRootLabel = document.getElementById('explorer-root-label');
  const appShell = document.getElementById('app-shell');

  var lastSearchQuery = '';
  var lastByFile = {};
  var lastRawResults = [];
  var currentDetailFile = null;
  var SEARCH_HISTORY_KEY = 'my-tools-search-history';
  var SEARCH_HISTORY_MAX = 10;

  function getSearchHistory() {
    try {
      var s = localStorage.getItem(SEARCH_HISTORY_KEY);
      return s ? JSON.parse(s) : [];
    } catch (_) { return []; }
  }

  function saveSearchHistory(arr) {
    try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(arr)); } catch (_) {}
  }

  function addToSearchHistory(q) {
    if (!q || !q.trim()) return;
    var h = getSearchHistory();
    h = h.filter(function (x) { return x !== q.trim(); });
    h.unshift(q.trim());
    saveSearchHistory(h.slice(0, SEARCH_HISTORY_MAX));
  }

  function renderSearchHistory() {
    var list = document.getElementById('search-history-list');
    var dropdown = document.getElementById('search-history-dropdown');
    if (!list || !dropdown) return;
    var h = getSearchHistory();
    list.innerHTML = '';
    if (h.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }
    h.forEach(function (term) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#37373d] flex items-center gap-2';
      el.innerHTML = '<span class="material-symbols-outlined text-slate-400 text-base">history</span><span class="truncate">' + escapeHtml(term) + '</span>';
      el.addEventListener('click', function () {
        if (searchInput) {
          searchInput.value = term;
          searchInput.focus();
          doSearch();
          hideSearchHistoryDropdown();
        }
      });
      list.appendChild(el);
    });
  }

  function showSearchHistoryDropdown() {
    var dropdown = document.getElementById('search-history-dropdown');
    if (dropdown && getSearchHistory().length) {
      renderSearchHistory();
      dropdown.classList.remove('hidden');
    }
  }

  function hideSearchHistoryDropdown() {
    var dropdown = document.getElementById('search-history-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  }

  function resetAppState() {
    if (headerBack) headerBack.classList.add('hidden');
    lastSearchQuery = '';
    lastByFile = {};
    lastRawResults = [];
    if (searchInput) searchInput.value = '';
    var fr = document.getElementById('filters-row');
    if (fr) fr.classList.add('hidden');
    if (resultsList) resultsList.innerHTML = '';
    if (resultsTitle) resultsTitle.textContent = 'Search results';
    if (resultsLoading) resultsLoading.classList.add('hidden');
    if (resultsEmpty) resultsEmpty.classList.add('hidden');
    if (resultsSection) resultsSection.classList.add('hidden');
    if (detailSection) detailSection.classList.add('hidden');
    if (searchSection) searchSection.classList.remove('hidden');
    if (searchHero) searchHero.classList.remove('hidden');
    renderExplorerTree(null);
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  function applyUrlSearch() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && searchInput) {
      searchInput.value = q;
      doSearch();
    }
  }

  function showLogin() {
    resetAppState();
    if (loginSection) loginSection.classList.remove('hidden');
    if (appShell) {
      appShell.classList.add('hidden');
      appShell.classList.remove('flex');
    }
    if (searchSection) searchSection.classList.add('hidden');
    if (resultsSection) resultsSection.classList.add('hidden');
    if (detailSection) detailSection.classList.add('hidden');
    if (sidebarUsername) {
      sidebarUsername.textContent = '—';
      const next = sidebarUsername.nextElementSibling;
      if (next) next.textContent = 'Not signed in';
    }
  }

  function showAuthenticated(username) {
    if (loginSection) loginSection.classList.add('hidden');
    if (appShell) {
      appShell.classList.remove('hidden');
      appShell.classList.add('flex');
    }
    if (searchSection) searchSection.classList.remove('hidden');
    if (detailSection) detailSection.classList.add('hidden');
    if (btnLogout) btnLogout.classList.remove('hidden');
    if (headerSearchWrap) headerSearchWrap.classList.remove('hidden');
    if (searchHero) searchHero.classList.remove('hidden');
    if (resultsSection) resultsSection.classList.add('hidden');
    if (sidebarUsername) {
      sidebarUsername.textContent = username && username.trim() ? username.trim() : 'Signed in';
      const next = sidebarUsername.nextElementSibling;
      if (next) next.textContent = 'Bitbucket';
    }
  }

  function setLoginError(msg) {
    if (!loginError) return;
    loginError.textContent = msg || '';
    loginError.classList.toggle('hidden', !msg);
  }

  async function checkAuth() {
    try {
      const r = await fetch('/api/me', { credentials: 'include' });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        showAuthenticated(data.username);
        return true;
      }
    } catch (_) {}
    showLogin();
    return false;
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setLoginError('');
      const username = document.getElementById('login-username').value.trim();
      const token = document.getElementById('login-token').value;
      if (!username || !token) {
        setLoginError('Please enter username and token.');
        return;
      }
      try {
        const r = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, token }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setLoginError(data.error || 'Login failed.');
          return;
        }
        showAuthenticated(username);
      } catch (err) {
        setLoginError('Network error. Try again.');
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      } catch (_) {}
      showLogin();
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightQuery(text, query) {
    if (!query || !text) return escapeHtml(text);
    var escaped = escapeHtml(text);
    try {
      var re = new RegExp('(' + escapeRegex(query) + ')', 'gi');
      return escaped.replace(re, '<span class="highlight-match">$1</span>');
    } catch (e) {
      return escaped;
    }
  }

  function highlightQueryInHtml(html, query) {
    if (!query || !html || typeof html !== 'string') return html;
    try {
      var re = new RegExp('(' + escapeRegex(query) + ')', 'gi');
      return html.replace(re, '<span class="highlight-match">$1</span>');
    } catch (e) {
      return html;
    }
  }

  function getLanguageFromPath(path) {
    if (!path) return null;
    var ext = path.split('.').pop().toLowerCase();
    if (path.toLowerCase().endsWith('.csproj')) return 'markup';
    var map = { cs: 'csharp', vb: 'vbnet', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', json: 'json', html: 'markup', htm: 'markup', xml: 'markup', css: 'css', scss: 'css', py: 'python', md: 'markdown', yaml: 'yaml', yml: 'yaml' };
    return map[ext] || null;
  }

  function getFileTypeClass(path) {
    if (!path) return '';
    var p = path.toLowerCase();
    if (p.endsWith('.csproj')) return 'file-type-csproj';
    if (p.endsWith('.cs')) return 'file-type-cs';
    if (p.endsWith('.vb')) return 'file-type-vb';
    return '';
  }

  function syntaxHighlightLine(raw, lang) {
    if (typeof Prism === 'undefined' || !lang || !Prism.languages[lang]) return escapeHtml(raw);
    try {
      return Prism.highlight(raw, Prism.languages[lang], lang);
    } catch (e) {
      return escapeHtml(raw);
    }
  }

  function renderExplorerTree(byFile) {
    if (!explorerChildren || !explorerPlaceholder) return;
    lastByFile = byFile || {};
    if (explorerPlaceholder.parentNode) explorerPlaceholder.remove();
    explorerChildren.innerHTML = '';
    if (!byFile || Object.keys(byFile).length === 0) {
      if (explorerRootLabel) explorerRootLabel.textContent = 'wigos-dev';
      var ph = document.createElement('div');
      ph.id = 'explorer-placeholder';
      ph.className = 'px-6 py-2 text-slate-400 dark:text-slate-500 italic';
      ph.textContent = 'Run a search to see files';
      explorerChildren.appendChild(ph);
      return;
    }
    if (explorerRootLabel) explorerRootLabel.textContent = 'Repositories';
    var repos = {};
    Object.keys(byFile).forEach(function (key) {
      var file = byFile[key];
      var repo = file.repo;
      if (!repos[repo]) repos[repo] = [];
      repos[repo].push(file);
    });
    var excludedRepos = ['tfs', 'tfs-migration'];
    Object.keys(repos).filter(function (r) { return excludedRepos.indexOf(r) === -1; }).sort().forEach(function (repo) {
      var files = repos[repo];
      var repoRow = document.createElement('div');
      repoRow.className = 'explorer-repo flex items-center gap-2 px-6 py-1 hover:bg-slate-200 dark:hover:bg-[#2a2d2e] rounded-sm cursor-pointer group';
      repoRow.setAttribute('data-expanded', 'true');
      repoRow.innerHTML = '<span class="material-symbols-outlined expand-icon text-slate-500 text-sm">expand_more</span><span class="material-symbols-outlined text-primary text-sm">folder</span><span class="text-slate-600 dark:text-slate-400 truncate">' + escapeHtml(repo) + '</span>';
      var repoChildren = document.createElement('div');
      repoChildren.className = 'explorer-repo-children pl-2';
      files.forEach(function (file) {
        var name = file.path.split('/').pop() || file.path;
        var key = file.repo + '|' + file.path;
        var fileTypeClass = getFileTypeClass(file.path || '');
        var fileRow = document.createElement('div');
        fileRow.className = 'flex items-center gap-2 px-6 py-1 hover:bg-slate-200 dark:hover:bg-[#2a2d2e] rounded-sm cursor-pointer explorer-file border-l-2 border-transparent hover:border-primary/50 ' + fileTypeClass;
        fileRow.setAttribute('data-key', key);
        fileRow.innerHTML = '<span class="material-symbols-outlined explorer-file-icon text-sm shrink-0">description</span><span class="text-slate-600 dark:text-slate-300 truncate">' + escapeHtml(name) + '</span>';
        fileRow.addEventListener('click', function (e) {
          e.stopPropagation();
          scrollToResultCard(key);
        });
        repoChildren.appendChild(fileRow);
      });
      repoRow.addEventListener('click', function (e) {
        e.stopPropagation();
        var expanded = repoRow.getAttribute('data-expanded') === 'true';
        repoRow.setAttribute('data-expanded', !expanded);
        var icon = repoRow.querySelector('.expand-icon');
        if (icon) icon.textContent = expanded ? 'chevron_right' : 'expand_more';
        repoChildren.classList.toggle('hidden', expanded);
      });
      explorerChildren.appendChild(repoRow);
      explorerChildren.appendChild(repoChildren);
    });
  }

  function getFilteredResults() {
    var ext = (document.getElementById('filter-extension') || {}).value || '';
    var branch = ((document.getElementById('filter-branch') || {}).value || '').trim().toLowerCase();
    var repo = (document.getElementById('filter-repo') || {}).value || '';
    return lastRawResults.filter(function (r) {
      if (ext && (!r.path || !r.path.toLowerCase().endsWith(ext))) return false;
      if (branch && (!r.branch || r.branch.toLowerCase().indexOf(branch) === -1)) return false;
      if (repo && r.repo !== repo) return false;
      return true;
    });
  }

  function populateRepoFilter(results) {
    var select = document.getElementById('filter-repo');
    if (!select) return;
    var repos = {};
    (results || []).forEach(function (r) { if (r.repo) repos[r.repo] = true; });
    var opts = Object.keys(repos).sort();
    select.innerHTML = '<option value="">Repo: todos</option>' + opts.map(function (r) { return '<option value="' + escapeHtml(r) + '">' + escapeHtml(r) + '</option>'; }).join('');
  }

  function applyFiltersAndRender() {
    var filtered = getFilteredResults();
    var filtersRow = document.getElementById('filters-row');
    if (filtersRow) filtersRow.classList.toggle('hidden', lastRawResults.length === 0);
    renderResults(filtered, lastSearchQuery);
  }

  function exportResults(format) {
    var data = getFilteredResults();
    if (data.length === 0) return;
    var q = lastSearchQuery || 'search';
    var filename = 'bitbucket-search-' + q.replace(/[^a-z0-9]/gi, '-').substring(0, 30) + '.' + format;
    if (format === 'csv') {
      var header = 'repo,path,line,branch,fragment,link\n';
      var rows = data.map(function (r) {
        var frag = (r.fragment || '').replace(/"/g, '""').replace(/\n/g, ' ');
        return '"' + (r.repo || '').replace(/"/g, '""') + '","' + (r.path || '').replace(/"/g, '""') + '",' + (r.line != null ? r.line : '') + ',"' + (r.branch || '').replace(/"/g, '""') + '","' + frag + '","' + (r.link || '').replace(/"/g, '""') + '"';
      }).join('\n');
      var blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8' });
    } else {
      var blob = new Blob([JSON.stringify({ query: lastSearchQuery, count: data.length, results: data }, null, 2)], { type: 'application/json' });
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderResults(results, query) {
    if (!resultsList) return;
    if (query != null) lastSearchQuery = query || '';
    resultsList.innerHTML = '';
    if (!results || results.length === 0) {
      if (resultsTitle) resultsTitle.textContent = 'Search results (0)';
      if (resultsEmpty) {
        resultsEmpty.classList.remove('hidden');
        resultsList.classList.add('hidden');
      }
      renderExplorerTree(null);
      return;
    }
    if (resultsEmpty) resultsEmpty.classList.add('hidden');
    resultsList.classList.remove('hidden');
    if (resultsTitle) resultsTitle.textContent = 'Search results (' + results.length + ')';

    var byFile = {};
    results.forEach(function (r) {
      var key = r.repo + '|' + r.path;
      if (!byFile[key]) byFile[key] = { repo: r.repo, path: r.path, link: r.link, branch: r.branch, lines: [] };
      if (r.line != null) byFile[key].lines.push({ line: r.line, fragment: r.fragment });
    });
    renderExplorerTree(byFile);

    Object.values(byFile).forEach(function (file) {
      var card = document.createElement('div');
      card.setAttribute('data-result-repo', file.repo);
      card.setAttribute('data-result-path', file.path);
      card.className = 'rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary/40 transition-colors overflow-hidden result-card';
      var repoPath = file.repo + ' / ' + file.path;
      card.innerHTML =
        '<div class="flex items-start justify-between gap-4 p-4 pb-2">' +
        '  <div class="min-w-0 flex-1">' +
        '    <p class="font-semibold text-slate-900 dark:text-white truncate text-sm">' + escapeHtml(repoPath) + '</p>' +
        '    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">' + escapeHtml(file.repo) + '</p>' +
        '  </div>' +
        '  <div class="flex items-center gap-2 shrink-0">' +
        '    <button type="button" class="btn-copy-path p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#37373d] text-slate-500 dark:text-slate-400" title="Copiar ruta" data-copy="' + escapeHtml(file.repo + '/' + file.path) + '" aria-label="Copiar"><span class="material-symbols-outlined text-sm">content_copy</span></button>' +
        '    <a href="' + escapeHtml(file.link) + '" target="_blank" rel="noopener" class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#37373d] text-[#0052CC] shrink-0" title="Ver en Bitbucket" aria-label="Ver en Bitbucket"><svg width="18" height="18" viewBox="0 0 32 32" fill="currentColor"><path d="M2.65 5.24A2.52 2.52 0 002 7.45v17.1a2.52 2.52 0 00.65 2.21 2.57 2.57 0 001.9.75h23.9a2.57 2.57 0 001.9-.75 2.52 2.52 0 00.65-2.21V7.45a2.52 2.52 0 00-.65-2.21 2.57 2.57 0 00-1.9-.75H4.55a2.57 2.57 0 00-1.9.75zM16 20.16a5.79 5.79 0 01-5.75-5.82l.09-7.13 3.55 14.45h4.22l3.55-14.45.09 7.13A5.79 5.79 0 0116 20.16zm10.37-14.2l-2.13 12.73-.06.49a5.78 5.78 0 01-4.06 3.85 5.8 5.8 0 01-4.26-.06 5.78 5.78 0 01-4-3.79l-2.15-12.78 1.93-.33 2.14 12.73a3.84 3.84 0 002.71 2.56 3.82 3.82 0 002.86-.06 3.84 3.84 0 002.67-2.5l2.14-12.73z"/></svg></a>' +
        '  </div>' +
        '</div>' +
        '<div class="code-block rounded-b-lg"><div class="code-inner">';
      var lang = getLanguageFromPath(file.path || '');
      var langClass = lang ? ' language-' + lang : '';
      (file.lines || []).slice(0, 10).forEach(function (l) {
        var raw = (l.fragment || '').replace(/\t/g, '  ');
        var frag = syntaxHighlightLine(raw, lang);
        frag = highlightQueryInHtml(frag, query);
        card.innerHTML +=
          '<div class="code-line">' +
          '<span class="ln" style="' + LN_STYLE + '">' + (l.line != null ? escapeHtml(String(l.line)) : '') + '</span>' +
          '<span class="code-pre" style="' + PRE_STYLE + '"><code class="code-content ' + langClass + '">' + frag + '</code></span>' +
          '</div>';
      });
      if ((file.lines || []).length > 10) {
        card.innerHTML += '<div class="code-line"><span class="ln" style="' + LN_STYLE + '"></span><span class="code-pre" style="' + PRE_STYLE + '"><code class="code-content text-slate-500">+' + (file.lines.length - 10) + ' more</code></span></div>';
      }
      card.innerHTML += '</div></div>';
      card.addEventListener('click', function (e) {
        if (!e.target.closest('.btn-copy-path') && !e.target.closest('a')) showDetail(file);
      });
      card.style.cursor = 'pointer';
      resultsList.appendChild(card);
    });
  }

  function scrollToResultCard(key) {
    if (!resultsList) return;
    var parts = key.split('|');
    var repo = parts[0];
    var path = parts.slice(1).join('|');
    var cards = resultsList.querySelectorAll('[data-result-repo]');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-result-repo') === repo && cards[i].getAttribute('data-result-path') === path) {
        cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        cards[i].classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'dark:ring-offset-[#1e1e1e]');
        setTimeout(function (el) {
          return function () { el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'dark:ring-offset-[#1e1e1e]'); };
        }(cards[i]), 1800);
        break;
      }
    }
  }

  function showDetail(file) {
    if (!file || !detailSection) return;
    currentDetailFile = file;
    if (searchSection) searchSection.classList.add('hidden');
    if (resultsSection) resultsSection.classList.add('hidden');
    var repoPath = (file.repo || '') + ' / ' + (file.path || '');
    if (detailPath) detailPath.textContent = repoPath;
    if (detailBreadcrumb) detailBreadcrumb.textContent = repoPath;
    if (detailFileTypeBadge) detailFileTypeBadge.classList.add('hidden');
    if (detailRepo) detailRepo.textContent = file.repo || '—';
    if (detailFilepath) detailFilepath.textContent = file.path || '—';
    var link = file.link || '#';
    if (detailLinkBitbucket) detailLinkBitbucket.href = link;
    if (detailLinkSidebar) detailLinkSidebar.href = link;
    if (detailCode) {
      var lines = file.lines || [];
      var query = lastSearchQuery;
      var lang = getLanguageFromPath(file.path || '');
      if (lines.length === 0) {
        detailCode.innerHTML = '<span class="text-slate-500">(no line content)</span>';
      } else {
        detailCode.innerHTML = '<div class="code-inner">' + lines
          .map(function (l) {
            var num = l.line != null ? escapeHtml(String(l.line)) : '';
            var raw = (l.fragment || '').replace(/\t/g, '  ');
            var frag = syntaxHighlightLine(raw, lang);
            frag = highlightQueryInHtml(frag, query);
            return '<div class="code-line"><span class="ln" style="' + LN_STYLE + '">' + num + '</span><span class="code-pre" style="' + PRE_STYLE + '"><code class="code-content ' + (lang ? ' language-' + lang : '') + '">' + frag + '</code></span></div>';
          })
          .join('') + '</div>';
      }
    }
    if (headerBack) headerBack.classList.remove('hidden');
    detailSection.classList.remove('hidden');
  }

  function hideDetail() {
    if (headerBack) headerBack.classList.add('hidden');
    if (detailSection) detailSection.classList.add('hidden');
    if (resultsSection) resultsSection.classList.remove('hidden');
    if (searchSection) searchSection.classList.remove('hidden');
    if (searchHero) searchHero.classList.add('hidden');
  }

  function goToHome() {
    if (headerBack) headerBack.classList.add('hidden');
    if (detailSection) detailSection.classList.add('hidden');
    if (searchSection) searchSection.classList.remove('hidden');
    if (searchHero) searchHero.classList.remove('hidden');
    if (resultsSection) resultsSection.classList.add('hidden');
  }

  if (btnBackSearch) btnBackSearch.addEventListener('click', hideDetail);
  if (headerBack) headerBack.addEventListener('click', hideDetail);

  var btnCopyPath = document.getElementById('btn-copy-path');
  if (btnCopyPath) btnCopyPath.addEventListener('click', function () {
    if (currentDetailFile) copyToClipboard(currentDetailFile.repo + '/' + currentDetailFile.path, btnCopyPath);
  });

  if (resultsList) resultsList.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-copy-path');
    if (btn && btn.dataset.copy) copyToClipboard(btn.dataset.copy, btn);
  });

  var headerLogo = document.getElementById('header-logo');
  if (headerLogo) headerLogo.addEventListener('click', function () {
    resetAppState();
  });

  if (explorerRoot) {
    explorerRoot.addEventListener('click', function () {
      var expanded = explorerRoot.getAttribute('data-expanded') === 'true';
      explorerRoot.setAttribute('data-expanded', !expanded);
      var icon = explorerRoot.querySelector('.expand-icon');
      if (icon) icon.textContent = expanded ? 'chevron_right' : 'expand_more';
      if (explorerChildren) explorerChildren.classList.toggle('hidden', expanded);
    });
  }

  async function doSearch() {
    const q = searchInput && searchInput.value.trim();
    if (!q) return;
    if (searchHero) searchHero.classList.add('hidden');
    if (resultsSection) resultsSection.classList.remove('hidden');
    if (resultsLoading) resultsLoading.classList.remove('hidden');
    if (resultsList) resultsList.innerHTML = '';
    if (resultsEmpty) resultsEmpty.classList.add('hidden');
    if (resultsTitle) resultsTitle.textContent = 'Search results';

    try {
      const r = await fetch('/api/search?q=' + encodeURIComponent(q), { credentials: 'include' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        lastRawResults = [];
        applyFiltersAndRender();
        if (resultsTitle) resultsTitle.textContent = 'Error: ' + (data.error || r.status);
        return;
      }
      lastRawResults = data.results || [];
      populateRepoFilter(lastRawResults);
      document.getElementById('filter-extension') && (document.getElementById('filter-extension').value = '');
      document.getElementById('filter-branch') && (document.getElementById('filter-branch').value = '');
      document.getElementById('filter-repo') && (document.getElementById('filter-repo').value = '');
      applyFiltersAndRender();
      addToSearchHistory(q);
      if (window.history && window.history.replaceState) {
        var newUrl = window.location.pathname + '?q=' + encodeURIComponent(q);
        window.history.replaceState({ q: q }, '', newUrl);
      }
    } catch (err) {
      lastRawResults = [];
      applyFiltersAndRender();
      if (resultsTitle) resultsTitle.textContent = 'Error: network failed';
    } finally {
      if (resultsLoading) resultsLoading.classList.add('hidden');
    }
  }

  var filterExtension = document.getElementById('filter-extension');
  var filterBranch = document.getElementById('filter-branch');
  var filterRepo = document.getElementById('filter-repo');
  if (filterExtension) filterExtension.addEventListener('change', applyFiltersAndRender);
  if (filterBranch) filterBranch.addEventListener('input', applyFiltersAndRender);
  if (filterRepo) filterRepo.addEventListener('change', applyFiltersAndRender);

  var btnExport = document.getElementById('btn-export');
  var exportDropdown = document.getElementById('export-dropdown');
  if (btnExport && exportDropdown) {
    btnExport.addEventListener('click', function (e) {
      e.stopPropagation();
      exportDropdown.classList.toggle('hidden');
    });
    document.querySelectorAll('.export-format').forEach(function (btn) {
      btn.addEventListener('click', function () {
        exportResults(btn.dataset.format || 'csv');
        exportDropdown.classList.add('hidden');
      });
    });
  }
  document.addEventListener('click', function () {
    if (exportDropdown) exportDropdown.classList.add('hidden');
  });

  if (searchBtn) searchBtn.addEventListener('click', doSearch);
  if (searchInput) {
    searchInput.addEventListener('focus', showSearchHistoryDropdown);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        hideSearchHistoryDropdown();
        doSearch();
      } else if (e.key === 'Escape') hideSearchHistoryDropdown();
    });
  }
  document.addEventListener('click', function (e) {
    var wrap = document.getElementById('header-search-wrap');
    var dropdown = document.getElementById('search-history-dropdown');
    if (dropdown && !dropdown.contains(e.target) && wrap && !wrap.contains(e.target)) hideSearchHistoryDropdown();
  });

  // ── Portal navigation ──────────────────────────────────────────────────────
  var currentApp = 'bitbucket-search';

  function activateApp(appId) {
    currentApp = appId;
    // Toggle portal-app visibility
    document.querySelectorAll('.portal-app').forEach(function (el) {
      el.classList.toggle('active', el.id === 'app-' + appId);
    });
    // Toggle portal-nav-item active state
    document.querySelectorAll('.portal-nav-item[data-app]').forEach(function (btn) {
      btn.classList.toggle('portal-nav-active', btn.dataset.app === appId);
    });
  }

  document.querySelectorAll('.portal-nav-item[data-app]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateApp(btn.dataset.app);
    });
  });
  // ── End portal navigation ──────────────────────────────────────────────────

  checkAuth().then(function (ok) {
    if (ok) applyUrlSearch();
  });
})();
