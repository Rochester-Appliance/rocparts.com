document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'http://localhost:3001';
    const searchPartsBtn = document.getElementById('searchPartsBtn');
    const searchModelsBtn = document.getElementById('searchModelsBtn');
    const getDiagramsBtn = document.getElementById('getDiagramsBtn');
    const resultsContainer = document.getElementById('results-container');
    const errorContainer = document.getElementById('error-container');
    const apiStatusContainer = document.getElementById('api-status-container');
    const toggleJson = document.getElementById('toggleJson');
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

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

    searchPartsBtn.addEventListener('click', () => {
        const mfgCode = document.getElementById('mfgCode').value;
        const partNumber = document.getElementById('partNumber').value;

        clearContainers();

        if (!mfgCode || !partNumber) {
            errorContainer.innerHTML = 'Please enter both a manufacturer code and a part number.';
            return;
        }

        fetch(`${API_BASE}/api/get-parts-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mfgCode, partNumber })
        })
            .then(response => response.json())
            .then(data => displayResults(data, 'parts'))
            .catch(error => {
                console.error('Error:', error);
                errorContainer.innerHTML = 'An error occurred while fetching parts info.';
            });
    });

    searchModelsBtn.addEventListener('click', () => {
        const modelNumber = document.getElementById('modelSearch').value;

        clearContainers();

        if (!modelNumber) {
            errorContainer.innerHTML = 'Please enter a model number (partial ok).';
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
                errorContainer.innerHTML = 'An error occurred while searching models.';
            });
    });

    getDiagramsBtn.addEventListener('click', () => {
        const modelNumber = document.getElementById('selectedModelNumber').value;
        const modelId = document.getElementById('selectedModelId').value;

        clearContainers();

        if (!modelNumber || !modelId) {
            errorContainer.innerHTML = 'Please provide both Selected Model Number and Model ID.';
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
                errorContainer.innerHTML = 'An error occurred while fetching diagrams.';
            });
    });


    function clearContainers() {
        resultsContainer.innerHTML = '';
        errorContainer.innerHTML = '';
        apiStatusContainer.innerHTML = '';
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

        const header = `
            <div class="card">
                <h3>Part</h3>
                <div><strong>${sanitize(part && part.partNumber)}</strong> — ${sanitize(part && part.partDescription)}</div>
                <div>Price: $${sanitize(part && part.partPrice)} | Retail: $${sanitize(part && part.retailPrice)} | Qty On Hand: ${sanitize(part && part.quantityOnHand)}</div>
                <div>Flags: Discontinued ${sanitize(part && part.discontinued)}, Hazmat ${sanitize(part && part.hazmat)}, Oversize ${sanitize(part && part.oversize)}</div>
            </div>
        `;

        const locationsTable = locations.length ? `
            <div class="card">
                <h3>Available Locations</h3>
                <table class="table">
                  <thead><tr><th>Location</th><th>Name</th><th>Qty</th></tr></thead>
                  <tbody>
                    ${locations.map(loc => `
                      <tr>
                        <td>${sanitize(loc.locationId)}</td>
                        <td>${sanitize(loc.locationName)}</td>
                        <td>${sanitize(loc.availableQuantity)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
            </div>
        ` : '';

        const subPartsTable = subParts.length ? `
            <div class="card">
                <h3>Sub Parts</h3>
                <table class="table">
                  <thead><tr><th>Part #</th><th>Desc</th><th>Price</th><th>Retail</th><th>QOH</th></tr></thead>
                  <tbody>
                    ${subParts.map(sp => `
                      <tr>
                        <td>${sanitize(sp.partNumber)}</td>
                        <td>${sanitize(sp.partDescription)}</td>
                        <td>${sanitize(sp.partPrice)}</td>
                        <td>${sanitize(sp.retailPrice)}</td>
                        <td>${sanitize(sp.quantityOnHand)}</td>
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
              <table class="table">
                <thead><tr><th>Model #</th><th>Description</th><th>Mfg</th><th>Model ID</th><th>Select</th></tr></thead>
                <tbody>
                  ${models.map((m, idx) => `
                    <tr data-role="model-row" data-model-number="${escapeAttr(m.modelNumber)}" data-model-id="${escapeAttr(m.modelId)}">
                      <td>${sanitize(m.modelNumber)}</td>
                      <td>${sanitize(m.modelDescription)}</td>
                      <td>${sanitize(m.mfg)}</td>
                      <td>${sanitize(m.modelId)}</td>
                      <td><button data-role="pick-model" data-model-number="${escapeAttr(m.modelNumber)}" data-model-id="${escapeAttr(m.modelId)}">Use</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
        `;
        resultsContainer.innerHTML = table;
    }

    function renderDiagramsResult(diagrams) {
        const grid = `
          <div class="split">
            <div>
              <h3>Diagrams</h3>
              <div id="diagram-list" class="grid">
                ${diagrams.map(d => `
                  <div class="card diagram-card" data-role="diagram-card" data-diagram-id="${escapeAttr(d.diagramId)}" data-large="${escapeAttr(d.diagramLargeImage)}" data-section-name="${escapeAttr(d.sectionName)}">
                    <img src="${sanitize(d.diagramSmallImage)}" alt="${escapeAttr(d.sectionName)}" />
                    <div><strong>${sanitize(d.sectionName)}</strong></div>
                    <div>ID: ${sanitize(d.diagramId)}</div>
                    <button data-role="pick-diagram" data-diagram-id="${escapeAttr(d.diagramId)}" data-large="${escapeAttr(d.diagramLargeImage)}" data-section-name="${escapeAttr(d.sectionName)}">Select</button>
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
            <table class="table">
              <thead><tr><th>Item</th><th>Part #</th><th>Description</th><th>Price</th><th>Retail</th><th>Qty</th><th>Stock(101)</th><th>Link</th></tr></thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td>${sanitize(r.itemNumber)}</td>
                    <td>${sanitize(r.partNumber)}</td>
                    <td>${sanitize(r.partDescription)}</td>
                    <td>${sanitize(r.price)}</td>
                    <td>${sanitize(r.listPrice)}</td>
                    <td>${sanitize(r.qtyTotal)}</td>
                    <td>${sanitize(r.stock101)}</td>
                    <td>${r.url ? `<a href="${escapeAttr(r.url)}" target="_blank">View</a>` : ''}</td>
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
    });

    function selectDiagram(diagramId, largeUrl, sectionName) {
        showDiagramPreview(largeUrl);
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
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <input id="parts-filter" type="text" placeholder="Filter parts (item #, part #, description)" style="flex:1; padding:8px; border:1px solid #e5e7eb; border-radius:6px;" />
            </div>
            <div class="chip-row" id="item-chips">
              ${uniqueItems.slice(0, 50).map(n => `<button class="chip" data-role="chip-item" data-item="${escapeAttr(n)}">${sanitize(n)}</button>`).join('')}
            </div>
          </div>`;

        const table = `
          ${toolbar}
          <div class="card">
            <h3>Diagram Parts</h3>
            <table class="table" id="parts-table">
              <thead><tr><th>Item</th><th>Part #</th><th>Description</th><th>Price</th><th>Retail</th><th>Qty</th><th>Stock(101)</th><th>Link</th></tr></thead>
              <tbody>
                ${rows.map((r, idx) => `
                  <tr data-role="part-row" data-item="${escapeAttr(r.itemNumber)}">
                    <td>${sanitize(r.itemNumber)}</td>
                    <td>${sanitize(r.partNumber)}</td>
                    <td>${sanitize(r.partDescription)}</td>
                    <td>${sanitize(r.price)}</td>
                    <td>${sanitize(r.listPrice)}</td>
                    <td>${sanitize(r.qtyTotal)}</td>
                    <td>${sanitize(r.stock101)}</td>
                    <td>${r.url ? `<a href="${escapeAttr(r.url)}" target="_blank">View</a>` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        container.innerHTML = table;

        // Hook up filter
        const filterInput = document.getElementById('parts-filter');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                const q = filterInput.value.toLowerCase();
                document.querySelectorAll('#parts-table tbody tr').forEach(tr => {
                    const text = tr.textContent.toLowerCase();
                    tr.style.display = text.includes(q) ? '' : 'none';
                });
            });
        }

        // Hook up chips
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

    function sanitize(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
});
