document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const apiOverride = params.get('api');
  const isLocalContext = location.hostname.includes('localhost') || location.hostname === '127.0.0.1' || location.protocol === 'file:';
  const API_BASE = apiOverride || (isLocalContext ? 'http://localhost:3001' : 'https://rocparts-api.onrender.com');
  const useLegacyUi = params.has('legacy');
  const useNewUi = !useLegacyUi;
  const debugMode = params.has('debug');
  const searchPartsBtn = document.getElementById('searchPartsBtn');
  const searchModelsBtn = document.getElementById('searchModelsBtn');
  const getDiagramsBtn = document.getElementById('getDiagramsBtn');
  const resultsContainer = document.getElementById('results-container');
  const errorContainer = document.getElementById('error-container');
  const apiStatusContainer = document.getElementById('api-status-container');
  const toggleJson = document.getElementById('toggleJson');
  const cartContainer = document.getElementById('cart-container');
  const tabs = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const floatingCartButton = document.getElementById('floating-cart-button');
  const floatingCartBadge = document.getElementById('floating-cart-badge');

  // Cart state
  let cart = loadCartFromStorage();
  renderCart();
  updateCartIconBadge();
  ensureFloatingCartVisibility();

  if (floatingCartBadge) {
    floatingCartBadge.style.display = 'none';
  }
  if (floatingCartButton) {
    floatingCartButton.addEventListener('click', () => {
      window.location.href = 'cart.html';
    });
    window.addEventListener('scroll', () => {
      ensureFloatingCartVisibility();
    });
  }

  // Unified header wiring (new UI default)
  if (useNewUi) {
    const headerAnchor = document.getElementById('unified-header-anchor');
    if (headerAnchor) {
      const hasInputs = headerAnchor.querySelector('#uh-model-q') && headerAnchor.querySelector('#uh-part-q');
      if (!hasInputs) {
        headerAnchor.innerHTML = `
          <div class="search-grid" data-prebuilt="true">
            <div class="search-card">
              <div class="search-label">Model lookup</div>
              <div class="search-control">
                <input id="uh-model-q" type="text" placeholder="Model number (partial ok)" autocomplete="off">
                <button id="uh-find-models" type="button">
                  <span>Find models</span>
                </button>
              </div>
              <p class="search-hint">Partial numbers welcome — we auto-select the first match.</p>
            </div>
            <div class="search-card">
              <div class="search-label">Part search</div>
              <div class="search-control">
                <input id="uh-part-q" type="text" placeholder="Part number (no brand needed)" autocomplete="off">
                <button id="uh-find-part" type="button">
                  <span>Search part</span>
                </button>
              </div>
              <p class="search-hint">We search across all manufacturers to find a verified match.</p>
            </div>
          </div>`;
      }

      const modelInput = document.getElementById('uh-model-q');
      const partInput = document.getElementById('uh-part-q');
      const modelBtn = document.getElementById('uh-find-models');
      const partBtn = document.getElementById('uh-find-part');

      if (modelBtn) {
        modelBtn.addEventListener('click', () => {
          const q = modelInput ? modelInput.value.trim() : '';
          if (!q) return;
          document.getElementById('modelSearch').value = q;
          searchModelsBtn.click();
          const btn = Array.from(tabs).find(b => b.getAttribute('data-tab') === 'diagrams-tab');
          if (btn) btn.click();
        });
      }
      if (modelInput) {
        modelInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && modelBtn) modelBtn.click();
        });
      }
      if (partBtn) {
        partBtn.addEventListener('click', async () => {
          const pn = partInput ? partInput.value.trim() : '';
          if (!pn) return;
          clearContainers();
          try {
            const res = await fetch(`${API_BASE}/api/part-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partNumber: pn }) });
            const data = await res.json();
            if (!res.ok) {
              console.error('Part search failed', data);
              showError(`Part not found. ${data && data.triedMfgCodes ? 'Tried: ' + data.triedMfgCodes.join(', ') : ''}`);
              return;
            }
            showError('');
            openPartDrawerFromGetPartsInfo(data);
          } catch (err) {
            console.error(err);
            showError('Part not found (network error).');
          }
        });
      }
      if (partInput) {
        partInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && partBtn) partBtn.click();
        });
      }
    }

    const mfgEl = document.getElementById('mfgCode');
    const pnEl = document.getElementById('partNumber');
    if (mfgEl && mfgEl.parentElement) {
      mfgEl.parentElement.style.display = 'none';
    }
    if (pnEl) pnEl.placeholder = 'Part number (no brand needed)';
  }

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
      clearContainers();
    });
  });

  const runPartSearch = async () => {
    const partField = document.getElementById('partNumber');
    const partNumber = partField ? partField.value.trim() : '';
    clearContainers();

    if (!partNumber) {
      showError('Please enter a part number.');
      return;
    }

    try {
      const body = { partNumber };
      const res = await fetch(`${API_BASE}/api/part-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        showError(`Part not found. ${data && data.triedMfgCodes ? 'Tried: ' + data.triedMfgCodes.join(', ') : ''}`);
        return;
      }
      showError('');
      displayResults(data, 'parts');
    } catch (error) {
      console.error('Error:', error);
      showError('An error occurred while fetching parts info.');
    }
  };

  if (searchPartsBtn) {
    searchPartsBtn.addEventListener('click', runPartSearch);
  }

  const partField = document.getElementById('partNumber');
  if (partField) {
    partField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        runPartSearch();
      }
    });
  }

  searchModelsBtn.addEventListener('click', () => {
    const modelNumber = document.getElementById('modelSearch').value;

    clearContainers();

    if (!modelNumber) {
      showError('Please enter a model number (partial ok).');
      return;
    }

    fetch(`${API_BASE}/api/model-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelNumber })
    })
      .then(response => response.json())
      .then(data => {
        displayResults(data, 'models');
        const first = Array.isArray(data) && data.length ? data[0] : null;
        if (first) {
          document.getElementById('selectedModelNumber').value = first.modelNumber || '';
          document.getElementById('selectedModelId').value = first.modelId || '';
        }
      })
      .catch(error => {
        console.error('Error:', error);
        showError('An error occurred while searching models.');
      });
  });

  getDiagramsBtn.addEventListener('click', () => {
    const modelNumber = document.getElementById('selectedModelNumber').value;
    const modelId = document.getElementById('selectedModelId').value;

    clearContainers();

    if (!modelNumber || !modelId) {
      showError('Please provide both Selected Model Number and Model ID.');
      return;
    }

    fetch(`${API_BASE}/api/get-diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelNumber, modelId })
    })
      .then(response => response.json())
      .then(data => {
        displayResults(data, 'diagrams');
        const first = Array.isArray(data) && data.length ? data[0] : null;
        if (first && first.diagramId) {
          selectDiagram(first.diagramId, first.diagramLargeImage, first.sectionName);
          setSelectedCard(first.diagramId);
        }
      })
      .catch(error => {
        console.error('Error:', error);
        showError('An error occurred while fetching diagrams.');
      });
  });


  function clearContainers() {
    resultsContainer.innerHTML = '';
    showError('');
    apiStatusContainer.innerHTML = '';
  }

  function showError(message) {
    if (!errorContainer) return;
    if (!message) {
      errorContainer.innerHTML = '';
      return;
    }
    errorContainer.innerHTML = `<div class="alert">${message}</div>`;
  }

  function displayResults(data, type) {
    const title = type === 'parts' ? 'Parts Info' :
      type === 'models' ? 'Model Search Results' :
        type === 'diagrams' ? 'Diagrams' :
          type === 'diagram-parts' ? 'Diagram Parts' : 'API Response';

    // Raw JSON (optional)
    if (toggleJson && toggleJson.checked) {
      apiStatusContainer.innerHTML = `<h3>${title} (Raw)</h3><pre>${JSON.stringify(data, null, 2)}</pre>`;
    } else {
      apiStatusContainer.innerHTML = '';
    }

    // Structured rendering
    if (type === 'parts') {
      renderPartsResult(data);
      return;
    }
    if (type === 'models') {
      renderModelsResult(Array.isArray(data) ? data : []);
      return;
    }
    if (type === 'diagrams') {
      renderDiagramsResult(Array.isArray(data) ? data : []);
      return;
    }
    if (type === 'diagram-parts') {
      renderDiagramPartsResult(data && typeof data === 'object' ? data : {});
      return;
    }

    resultsContainer.innerHTML = `<div class="card"><div>Unknown response</div></div>`;
  }

  function renderPartsResult(data) {
    const part = data && data.partData ? data.partData : null;
    const locations = part && Array.isArray(part.availableLocation) ? part.availableLocation : [];
    const subParts = Array.isArray(data && data.subPartData) ? data.subPartData : [];
    const availableQty = getPartAvailableQty(part, locations);

    const header = `
            <div class="card">
                <h3>Part</h3>
                <div><strong>${sanitize(part && part.partNumber)}</strong> — ${sanitize(part && part.partDescription)}</div>
                <div>Retail Price: $${sanitize(part && part.retailPrice)} | Qty On Hand: ${sanitize(part && part.quantityOnHand)}</div>
        <div style="margin-top:8px;">
          <button class="btn-primary" data-role="add-to-cart" data-part-number="${escapeAttr(part && part.partNumber)}" data-part-description="${escapeAttr(part && part.partDescription)}" data-price="${escapeAttr(part && (part.retailPrice || part.partPrice || '0'))}">Add to Cart</button>
        </div>
            </div>
        `;

    const locationsTable = locations.length ? `
            <div class="card">
                <h3>Available Locations</h3>
                <table class="table table--responsive">
                  <thead><tr><th>Location</th><th>Name</th><th>Qty</th></tr></thead>
                  <tbody>
                    ${locations.map(loc => `
                      <tr>
                        <td data-label="Location">${sanitize(loc.locationId)}</td>
                        <td data-label="Name">${sanitize(loc.locationName)}</td>
                        <td data-label="Qty">${sanitize(loc.availableQuantity)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
            </div>
        ` : '';

    const subPartsTable = subParts.length ? `
            <div class="card">
                <h3>Sub Parts</h3>
                <table class="table table--responsive">
                  <thead><tr><th>Part #</th><th>Desc</th><th>Price</th><th>Retail</th><th>QOH</th><th>Cart</th></tr></thead>
                  <tbody>
                    ${subParts.map(sp => `
                      <tr>
                        <td data-label="Part #">${sanitize(sp.partNumber)}</td>
                        <td data-label="Desc">${sanitize(sp.partDescription)}</td>
                        <td data-label="Price">${sanitize(sp.partPrice)}</td>
                        <td data-label="Retail">${sanitize(sp.retailPrice)}</td>
                        <td data-label="QOH">${sanitize(sp.quantityOnHand)}</td>
                        <td data-label="Cart"><button class="btn-primary" data-role="add-to-cart" data-part-number="${escapeAttr(sp.partNumber)}" data-part-description="${escapeAttr(sp.partDescription)}" data-price="${escapeAttr(sp.partPrice || sp.retailPrice || '0')}">Add</button></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
            </div>
        ` : '';

    resultsContainer.innerHTML = `${header}${locationsTable}${subPartsTable}`;
  }

  function renderModelsResult(models) {
    if (!models.length) {
      resultsContainer.innerHTML = `<div class="card">No models found.</div>`;
      return;
    }
    const table = `
            <div class="card">
              <h3>Models</h3>
              <table class="table table--responsive">
                <thead><tr><th>Model #</th><th>Description</th><th>Mfg</th>${useNewUi ? '' : '<th>Model ID</th><th>Select</th>'}</tr></thead>
                <tbody>
                  ${models.map((m, idx) => `
                    <tr data-role="model-row" data-model-number="${escapeAttr(m.modelNumber)}" data-model-id="${escapeAttr(m.modelId)}">
                      <td data-label="Model #">${sanitize(m.modelNumber)}</td>
                      <td data-label="Description">${sanitize(m.modelDescription)}</td>
                      <td data-label="Mfg">${sanitize(m.mfg)}</td>
                      ${useNewUi ? '' : `<td data-label="Model ID">${sanitize(m.modelId)}</td><td data-label="Select"><button data-role=\"pick-model\" data-model-number=\"${escapeAttr(m.modelNumber)}\" data-model-id=\"${escapeAttr(m.modelId)}\">Use</button></td>`}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
        `;
    resultsContainer.innerHTML = table;

    // When new UI, make row click select and load diagrams automatically
    if (useNewUi) {
      const rows = resultsContainer.querySelectorAll('[data-role="model-row"]');
      rows.forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          const modelNumber = row.getAttribute('data-model-number') || '';
          const modelId = row.getAttribute('data-model-id') || '';
          document.getElementById('selectedModelNumber').value = modelNumber;
          document.getElementById('selectedModelId').value = modelId;
          getDiagramsBtn.click();
          const btn = Array.from(tabs).find(b => b.getAttribute('data-tab') === 'diagrams-tab');
          if (btn) btn.click();
        });
      });
    }
  }

  function renderDiagramsResult(diagrams) {
    const grid = `
          <div class="split">
            <div>
              <h3>Diagrams</h3>
              <div id="diagram-list" class="grid">
                ${diagrams.map(d => `
                  <div class="card diagram-card" data-role="diagram-card" data-diagram-id="${escapeAttr(d.diagramId)}" data-large="${escapeAttr(d.diagramLargeImage)}" data-section-name="${escapeAttr(d.sectionName)}">
                    <img src="${API_BASE}/api/image-proxy?url=${encodeURIComponent(d.diagramSmallImage || '')}" alt="${escapeAttr(d.sectionName)}" />
                    <!-- caption and select hidden per spec -->
                  </div>
                `).join('')}
              </div>
            </div>
            <div id="diagram-viewer">
              <div class="viewer-title" id="viewer-title" style="display:none"></div>
              <div class="card"><div id="diagram-preview-note">Select a diagram to preview</div><img id="diagram-preview-img" style="display:none; max-width:100%; height:auto;" /></div>
              <div id="diagram-parts-container"></div>
            </div>
          </div>
        `;
    resultsContainer.innerHTML = grid;
  }

  function renderDiagramPartsResult(partsObj) {
    const rows = Object.values(partsObj || {}).map(p => ({
      itemNumber: p.itemNumber || '',
      partNumber: p.partNumber || '',
      partDescription: p.partDescription || '',
      price: p.price || '',
      listPrice: p.listPrice || '',
      qtyTotal: p.qtyTotal || '',
      stock101: p.stock && (p.stock['101'] || p.stock[101]) || '',
      url: p.url || ''
    }));
    rows.sort((a, b) => {
      const ai = parseInt((a.itemNumber || '').replace(/\D/g, ''), 10);
      const bi = parseInt((b.itemNumber || '').replace(/\D/g, ''), 10);
      if (Number.isNaN(ai) && Number.isNaN(bi)) return 0;
      if (Number.isNaN(ai)) return 1;
      if (Number.isNaN(bi)) return -1;
      return ai - bi;
    });

    const table = `
          <div class="card">
            <h3>Diagram Parts</h3>
            <table class="table table--responsive">
              <thead><tr><th>Item</th><th>Part #</th><th>Description</th><th>Price</th><th>Qty</th><th>Link</th><th>Cart</th></tr></thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td data-label="Item">${sanitize(r.itemNumber)}</td>
                    <td data-label="Part #">${sanitize(r.partNumber)}</td>
                    <td data-label="Description">${sanitize(r.partDescription)}</td>
                    <td data-label="Price">$${formatMoney(r.listPrice)}</td>
                    <td data-label="Qty">${sanitize(r.qtyTotal)}</td>
                    <td data-label="Link">${r.url ? `<a href="${escapeAttr(r.url)}" target="_blank">View</a>` : ''}</td>
                    <td data-label="Cart"><button data-role="add-to-cart" data-part-number="${escapeAttr(r.partNumber)}" data-part-description="${escapeAttr(r.partDescription)}" data-price="${escapeAttr(r.listPrice)}" ${(isRowAvailable(r) ? '' : 'disabled')}>Add</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
    resultsContainer.innerHTML = table;
  }

  // Click handlers for dynamic content
  resultsContainer.addEventListener('click', (e) => {
    const target = e.target;
    if (target && target.getAttribute('data-role') === 'pick-model') {
      const modelNumber = target.getAttribute('data-model-number') || '';
      const modelId = target.getAttribute('data-model-id') || '';
      document.getElementById('selectedModelNumber').value = modelNumber;
      document.getElementById('selectedModelId').value = modelId;
      if (useNewUi) {
        getDiagramsBtn.click();
      }
    }
    if (target && target.getAttribute('data-role') === 'pick-diagram') {
      const diagramId = target.getAttribute('data-diagram-id') || '';
      const large = target.getAttribute('data-large') || '';
      const sectionName = target.getAttribute('data-section-name') || '';
      selectDiagram(diagramId, large, sectionName);
      setSelectedCard(diagramId);
    }
    if (target && target.closest && target.closest('[data-role="diagram-card"]')) {
      const card = target.closest('[data-role="diagram-card"]');
      const diagramId = card.getAttribute('data-diagram-id') || '';
      const large = card.getAttribute('data-large') || '';
      const sectionName = card.getAttribute('data-section-name') || '';
      selectDiagram(diagramId, large, sectionName);
      setSelectedCard(diagramId);
    }
    if (target && target.getAttribute && target.getAttribute('data-role') === 'add-to-cart') {
      const partNumber = target.getAttribute('data-part-number') || '';
      const partDescription = target.getAttribute('data-part-description') || '';
      const priceStr = target.getAttribute('data-price') || '0';
      const price = parseFloat(priceStr) || 0;
      addToCart({ partNumber, partDescription, price, qty: 1 });
      // Do not open drawer; per spec just add silently
      try {
        const btn = target.closest('button');
        if (btn) {
          const old = btn.textContent;
          btn.disabled = true; btn.textContent = 'Added';
          setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 1000);
        }
      } catch (e) { }
    }
  });

  // Cart interactions
  cartContainer.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;
    if (target.getAttribute('data-role') === 'cart-inc') {
      const idx = parseInt(target.getAttribute('data-index') || '-1', 10);
      updateCartQty(idx, +1);
    }
    if (target.getAttribute('data-role') === 'cart-dec') {
      const idx = parseInt(target.getAttribute('data-index') || '-1', 10);
      updateCartQty(idx, -1);
    }
    if (target.getAttribute('data-role') === 'cart-remove') {
      const idx = parseInt(target.getAttribute('data-index') || '-1', 10);
      removeFromCart(idx);
    }
    if (target.getAttribute('data-role') === 'cart-clear') {
      clearCart();
    }
  });

  function selectDiagram(diagramId, largeUrl, sectionName) {
    const proxied = `${API_BASE}/api/image-proxy?url=${encodeURIComponent(largeUrl || '')}`;
    showDiagramPreview(proxied);
    const title = document.getElementById('viewer-title');
    if (title) {
      if (sectionName) {
        title.textContent = sectionName;
        title.style.display = 'block';
      } else {
        title.style.display = 'none';
      }
    }
    const modelNumber = document.getElementById('selectedModelNumber').value;
    const modelId = document.getElementById('selectedModelId').value;
    if (!modelNumber || !modelId || !diagramId) {
      return;
    }
    fetchAndRenderDiagramParts(modelNumber, modelId, diagramId);

    // Auto-scroll to parts list on mobile for better UX
    if (window.innerWidth <= 900) {
      setTimeout(() => {
        const partsContainer = document.getElementById('diagram-parts-container');
        if (partsContainer) {
          partsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }
  }

  function setSelectedCard(diagramId) {
    const cards = document.querySelectorAll('.diagram-card');
    cards.forEach(c => c.classList.remove('is-selected'));
    const chosen = Array.from(cards).find(c => (c.getAttribute('data-diagram-id') || '') === String(diagramId));
    if (chosen) {
      chosen.classList.add('is-selected');
      chosen.scrollIntoView({ block: 'nearest' });
    }
  }

  function fetchAndRenderDiagramParts(modelNumber, modelId, diagramId) {
    const partsContainer = document.getElementById('diagram-parts-container');
    if (partsContainer) {
      partsContainer.innerHTML = '<div class="card">Loading parts…</div>';
    }
    fetch(`${API_BASE}/api/get-diagram-parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelNumber, modelId, diagramId })
    })
      .then(response => response.json())
      .then(data => renderDiagramPartsInViewer(data && typeof data === 'object' ? data : {}))
      .catch(error => {
        console.error('Error:', error);
        if (partsContainer) partsContainer.innerHTML = '<div class="card">Failed to load parts.</div>';
      });
  }

  function renderDiagramPartsInViewer(partsObj) {
    const container = document.getElementById('diagram-parts-container');
    if (!container) return;
    const rows = Object.values(partsObj || {}).map(p => ({
      itemNumber: p.itemNumber || '',
      partNumber: p.partNumber || '',
      partDescription: p.partDescription || '',
      price: p.price || '',
      listPrice: p.listPrice || '',
      qtyTotal: p.qtyTotal || '',
      stock101: p.stock && (p.stock['101'] || p.stock[101]) || '',
      url: p.url || ''
    }));
    rows.sort((a, b) => {
      const ai = parseInt((a.itemNumber || '').replace(/\D/g, ''), 10);
      const bi = parseInt((b.itemNumber || '').replace(/\D/g, ''), 10);
      if (Number.isNaN(ai) && Number.isNaN(bi)) return 0;
      if (Number.isNaN(ai)) return 1;
      if (Number.isNaN(bi)) return -1;
      return ai - bi;
    });
    const uniqueItems = Array.from(new Set(rows.map(r => r.itemNumber).filter(Boolean)));
    const toolbar = `
          <div class="quick-toolbar">
            <div class="chip-row" id="item-chips">
              ${uniqueItems.slice(0, 50).map(n => `<button class="chip" data-role="chip-item" data-item="${escapeAttr(n)}">${sanitize(n)}</button>`).join('')}
            </div>
          </div>`;

    const table = `
          ${toolbar}
          <div class="card">
            <h3>Find Parts</h3>
            <table class="table table--responsive" id="parts-table">
              <thead><tr><th>Diagram #</th><th>Part #</th><th>Description</th><th>Price</th><th>Availability</th><th style="width:120px; text-align:center;">Add</th></tr></thead>
              <tbody>
                ${rows.map((r, idx) => `
                  <tr data-role="part-row" data-item="${escapeAttr(r.itemNumber)}">
                    <td data-label="Diagram #">${sanitize(r.itemNumber)}</td>
                    <td data-label="Part #" class="mono">${sanitize(r.partNumber)}</td>
                    <td data-label="Description">${sanitize(r.partDescription)}</td>
                    <td data-label="Price">$${formatMoney(r.listPrice)}</td>
                    <td data-label="Availability" data-role="availability-col" data-part="${escapeAttr(r.partNumber)}">...</td>
                    <td data-label="Add" style="text-align:center;">
                      <button class="btn-small" data-role="add-to-cart" data-part-number="${escapeAttr(r.partNumber)}" data-part-description="${escapeAttr(r.partDescription)}" data-price="${escapeAttr(r.listPrice)}" ${(parseInt(r.qtyTotal || '0', 10) > 0 ? '' : 'disabled')}>Add</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
    container.innerHTML = table;

    // Compute stock column (our inventory + Youngstown)
    annotateStockColumns(rows);
    // Hook up chips to jump to rows
    const chips = document.querySelectorAll('[data-role="chip-item"]');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        const item = chip.getAttribute('data-item') || '';
        const row = Array.from(document.querySelectorAll('[data-role="part-row"]')).find(r => (r.getAttribute('data-item') || '') === item);
        if (row) {
          row.classList.add('part-row--highlight');
          row.scrollIntoView({ block: 'center' });
          setTimeout(() => row.classList.remove('part-row--highlight'), 1200);
        }
      });
    });
  }

  async function annotateStockColumns(rows) {
    try {
      const res = await fetch(`${API_BASE}/api/our-inventory`);
      const inv = await res.json();
      const oursList = (inv && Array.isArray(inv.parts) ? inv.parts : []).map(p => String(p).trim().toUpperCase());
      const ours = new Set(oursList);
      window.__ours = oursList;
      document.querySelectorAll('[data-role="availability-col"]').forEach(td => {
        const pn = (td.getAttribute('data-part') || '').toUpperCase();
        const row = rows.find(r => String(r.partNumber).toUpperCase() === pn) || {};
        const qty = parseInt(row.qtyTotal || '0', 10) || 0;
        // Show a single Availability value: number if >0, else "NA"
        td.textContent = qty > 0 ? String(qty) : 'NA';
      });
    } catch (e) {
      document.querySelectorAll('[data-role="availability-col"]').forEach(td => td.textContent = '');
    }
  }

  function showDiagramPreview(url) {
    const img = document.getElementById('diagram-preview-img');
    const note = document.getElementById('diagram-preview-note');
    if (!img || !note) return;
    if (url) {
      img.src = url;
      img.style.display = 'block';
      note.style.display = 'none';
    } else {
      img.style.display = 'none';
      note.style.display = 'block';
    }
  }

  // Drawer helpers (new UI)
  async function openPartDrawerByNumber(partNumber) {
    try {
      const res = await fetch(`${API_BASE}/api/part-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partNumber }) });
      const data = await res.json();
      if (!res.ok) {
        errorContainer.innerHTML = `Part not found. ${data && data.triedMfgCodes ? 'Tried: ' + data.triedMfgCodes.join(', ') : ''}`;
        return;
      }
      openPartDrawerFromGetPartsInfo(data);
    } catch (e) {
      errorContainer.innerHTML = 'Part not found (network error).';
    }
  }

  function openPartDrawerFromGetPartsInfo(data) {
    const part = data && data.partData ? data.partData : null;
    const locations = part && Array.isArray(part.availableLocation) ? part.availableLocation : [];
    const subParts = Array.isArray(data && data.subPartData) ? data.subPartData : [];
    const code = (data && data.return && (data.return.retCode || (data.return.commonResult && data.return.commonResult.code))) || '';
    const statusOk = String(code).trim() === '200';
    const overlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('part-drawer');
    if (!overlay || !drawer) return;
    overlay.style.display = 'block';
    drawer.style.display = 'block';
    overlay.onclick = closeDrawer;
    drawer.innerHTML = `
      <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:8px;">
        <h3>Part Details</h3>
        <button id="drawer-close" class="btn-link">Close</button>
      </div>
      <div class="kv" style="margin-bottom:8px;">
        <div class="k">Part #</div><div><strong>${sanitize(part && part.partNumber)}</strong></div>
        <div class="k">Description</div><div>${sanitize(part && part.partDescription)}</div>
        <div class="k">Price</div><div>$${formatMoney(part && part.retailPrice)}</div>
        <div class="k">On Hand</div><div>${sanitize(part && part.quantityOnHand)}${statusOk ? '' : ' (unverified)'}${!statusOk ? `<span class=\"muted\"> — API retCode ${sanitize(code)}</span>` : ''}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; margin:10px 0;">
        <input id="drawer-qty" type="number" min="1" value="1" style="width:80px; padding:8px; border:1px solid var(--border); border-radius:8px;" />
        <button id="drawer-add" data-part-number="${escapeAttr(part && part.partNumber)}" data-part-description="${escapeAttr(part && part.partDescription)}" data-price="${escapeAttr(part && part.retailPrice)}">Add to Cart</button>
      </div>
      
    `;
    const closeBtn = document.getElementById('drawer-close');
    if (closeBtn) closeBtn.onclick = closeDrawer;
    const addBtn = document.getElementById('drawer-add');
    if (addBtn) {
      addBtn.onclick = () => {
        const qtyInput = document.getElementById('drawer-qty');
        const qty = Math.max(1, parseInt(qtyInput && qtyInput.value ? qtyInput.value : '1', 10) || 1);
        const partNumber = addBtn.getAttribute('data-part-number') || '';
        const partDescription = addBtn.getAttribute('data-part-description') || '';
        const price = parseFloat(addBtn.getAttribute('data-price') || '0') || 0;
        addToCart({ partNumber, partDescription, price, qty });
        closeDrawer();
      };
    }
  }

  function closeDrawer() {
    const overlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('part-drawer');
    if (overlay) overlay.style.display = 'none';
    if (drawer) drawer.style.display = 'none';
  }

  function sanitize(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toFixed(2);
  }

  function computeStatusForDrawer(part) {
    // Basic mirror of table logic: prefer our inventory; fallback to Youngstown QOH
    const pn = (part && part.partNumber ? String(part.partNumber) : '').toUpperCase();
    // Best effort: read cached list if annotateStockColumns fetched it already
    try {
      const cached = window.__ours || [];
      if (cached.includes(pn)) return 'In Stock';
    } catch (e) { }
    const qoh = parseInt(part && part.quantityOnHand || '0', 10) || 0;
    return qoh > 0 ? 'Available' : 'Special Order';
  }

  function escapeAttr(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isRowAvailable(row) {
    const qty = parseInt(row.qtyTotal || '0', 10);
    const stock = parseInt(row.stock101 || '0', 10);
    return (qty > 0) || (stock > 0);
  }

  function getPartAvailableQty(part, locations) {
    if (!part) return 0;
    const qoh = parseInt(part.quantityOnHand || '0', 10);
    if (!Number.isNaN(qoh) && qoh > 0) return qoh;
    if (Array.isArray(locations) && locations.length) {
      return locations.reduce((sum, loc) => sum + (parseInt(loc.availableQuantity || '0', 10) || 0), 0);
    }
    return 0;
  }

  function loadCartFromStorage() {
    try {
      const raw = localStorage.getItem('vandv_cart');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveCartToStorage() {
    try {
      localStorage.setItem('vandv_cart', JSON.stringify(cart));
    } catch (e) {
      // ignore
    }
  }

  function addToCart(item) {
    const idx = cart.findIndex(i => i.partNumber === item.partNumber);
    if (idx >= 0) {
      cart[idx].qty += item.qty || 1;
    } else {
      cart.push({ partNumber: item.partNumber, partDescription: item.partDescription, price: item.price || 0, qty: item.qty || 1 });
    }
    saveCartToStorage();
    renderCart();
    updateCartIconBadge();
    triggerCartPulse();
  }

  function updateCartQty(index, delta) {
    if (index < 0 || index >= cart.length) return;
    cart[index].qty = Math.max(1, (cart[index].qty || 1) + delta);
    saveCartToStorage();
    renderCart();
    updateCartIconBadge();
  }

  function removeFromCart(index) {
    if (index < 0 || index >= cart.length) return;
    cart.splice(index, 1);
    saveCartToStorage();
    renderCart();
    updateCartIconBadge();
  }

  function clearCart() {
    cart = [];
    saveCartToStorage();
    renderCart();
    updateCartIconBadge();
  }

  function updateCartIconBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    const count = cart.reduce((s, i) => s + (i.qty || 1), 0);
    if (count > 0) { badge.style.display = 'inline-block'; badge.textContent = String(count); }
    else { badge.style.display = 'none'; }
    if (floatingCartBadge) {
      if (count > 0) {
        floatingCartBadge.style.display = 'inline-flex';
        floatingCartBadge.textContent = String(count);
      } else {
        floatingCartBadge.style.display = 'none';
      }
    }
    ensureFloatingCartVisibility();
  }

  function renderCart() {
    if (!cartContainer) return;
    if (!cart.length) {
      cartContainer.innerHTML = `<div class="cart-header"><strong>Cart</strong><span>0 items</span></div><div class="muted">Your cart is empty.</div>`;
      return;
    }
    const subtotal = cart.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 1), 0);
    const itemsHtml = cart.map((i, idx) => `
      <div class="cart-item">
        <div><strong>${sanitize(i.partNumber)}</strong><div style="color:var(--muted); font-size:12px;">${sanitize(i.partDescription || '')}</div></div>
        <div>$${(Number(i.price || 0)).toFixed(2)}</div>
        <div>
          <button class="btn-link" data-role="cart-dec" data-index="${idx}">−</button>
          <span>${sanitize(i.qty)}</span>
          <button class="btn-link" data-role="cart-inc" data-index="${idx}">+</button>
        </div>
        <div><button class="btn-link" data-role="cart-remove" data-index="${idx}">Remove</button></div>
      </div>
    `).join('');
    cartContainer.innerHTML = `
      <div class="cart-header">
        <strong>Cart</strong>
        <div>
          <span style="margin-right:10px;">Items: ${cart.length}</span>
          <span><strong>Subtotal:</strong> $${subtotal.toFixed(2)}</span>
        </div>
      </div>
      <div class="cart-items">${itemsHtml}</div>
      <div class="cart-actions">
        <div class="cart-summary">
          <strong>Subtotal:</strong> $${subtotal.toFixed(2)}
        </div>
        <button class="btn-secondary" data-role="cart-clear">Clear Cart</button>
        <button class="btn-primary" id="checkoutBtn">Checkout</button>
      </div>
    `;

    const btn = document.getElementById('checkoutBtn');
    if (btn) {
      btn.addEventListener('click', onCheckoutClick, { once: true });
    }
  }

  async function onCheckoutClick() {
    try {
      if (!window.Stripe) {
        alert('Stripe.js not loaded');
        return;
      }
      const cfgRes = await fetch(`${API_BASE}/api/stripe-config`);
      const cfg = await cfgRes.json();
      if (!cfg.publishableKey) throw new Error('Missing publishable key');
      const stripe = window.Stripe(cfg.publishableKey);
      const payload = { items: cart.map(i => ({ partNumber: i.partNumber, partDescription: i.partDescription, price: i.price, qty: i.qty })) };
      const res = await fetch(`${API_BASE}/api/checkout/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data && data.details ? data.details : 'Failed to create session');
      const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
      if (error) alert(error.message);
    } catch (e) {
      console.error(e);
      alert('Checkout failed: ' + (e && e.message ? e.message : 'Unknown error'));
    }
  }

  function ensureFloatingCartVisibility() {
    if (!floatingCartButton) return;
    const itemCount = cart.reduce((s, i) => s + (i.qty || 1), 0);
    const scrolled = window.scrollY > 180;
    if (scrolled || itemCount > 0) {
      floatingCartButton.style.display = 'flex';
    } else {
      floatingCartButton.style.display = 'none';
    }
  }

  function triggerCartPulse() {
    const nodes = [];
    const cartLink = document.getElementById('cart-link');
    if (cartLink) nodes.push(cartLink);
    if (floatingCartButton) nodes.push(floatingCartButton);
    nodes.forEach((el) => {
      el.classList.remove('is-pulsing');
      void el.offsetWidth;
      el.classList.add('is-pulsing');
      setTimeout(() => el.classList.remove('is-pulsing'), 420);
    });
  }
});
