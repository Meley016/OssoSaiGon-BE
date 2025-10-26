// public/js/admin/products.js
// Assumes fetch endpoints:
// GET /api/categories, /api/colors, /api/sizes
// GET/POST/PUT/DELETE /api/products
// POST /api/products/import (form multipart)

(() => {
  const maxVariantImages = 6;
  let categories = [], colors = [], sizes = [];
  let currentPage = 1, limit = 12, totalPages = 1;
  let view = 'grid'; // grid | table

  // DOM shortcuts
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // Panels and controls
  const panelCreate = $('#panel-create');
  const panelImport = $('#panel-import');
  const panelList = $('#panel-list');
  const tabCreate = $('#tab-create');
  const tabImport = $('#tab-import');
  const tabList = $('#tab-list');
  const viewGridBtn = $('#viewGrid');
  const viewTableBtn = $('#viewTable');

  // Init
  async function init() {
    hookTabs();
    await loadLookups();
    bindCreateForm();
    bindImportForm();
    bindListControls();
    showPanel('list');
    toggleView('grid');
    loadProducts();
  }

  function hookTabs() {
    tabCreate.addEventListener('click', () => showPanel('create'));
    tabImport.addEventListener('click', () => showPanel('import'));
    tabList.addEventListener('click', () => showPanel('list'));
    viewGridBtn.addEventListener('click', () => toggleView('grid'));
    viewTableBtn.addEventListener('click', () => toggleView('table'));
  }

  function showPanel(name) {
    panelCreate.style.display = name === 'create' ? '' : 'none';
    panelImport.style.display = name === 'import' ? '' : 'none';
    panelList.style.display = name === 'list' ? '' : 'none';
  }

  function toggleView(v) {
    view = v;
    $('#gridView').style.display = v === 'grid' ? '' : 'none';
    $('#tableView').style.display = v === 'table' ? '' : 'none';
    viewGridBtn.style.opacity = v === 'grid' ? 1 : 0.6;
    viewTableBtn.style.opacity = v === 'table' ? 1 : 0.6;
  }

  async function loadLookups() {
    const [catRes, colRes, sizeRes] = await Promise.all([
      fetch('/api/categories'), fetch('/api/colors'), fetch('/api/sizes')
    ]);
    categories = catRes.ok ? await catRes.json() : [];
    colors = colRes.ok ? await colRes.json() : [];
    sizes = sizeRes.ok ? await sizeRes.json() : [];

    // Fill selects
    const addOptions = (el, items, addEmpty = true) => {
      if (!el) return;
      el.innerHTML = (addEmpty ? `<option value="">--Chọn--</option>` : '') +
        items.map(i => `<option value="${i._id}">${i.name}</option>`).join('');
    };
    addOptions($('#categorySelect'), categories, true);
    addOptions($('#edit-category'), categories, true);
    addOptions($('#filterCategory'), categories, true);
  }

  // --- VARIANT ROW HELPERS (used by create + edit) ---
  function createVariantRow({ colorId='', sizeId='', quantity=0, price=0, images=[] } = {}) {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>
        <select name="variantColor[]" class="ant-input">${colors.map(c => `<option value="${c._id}" ${c._id===colorId?'selected':''}>${c.name}</option>`).join('')}</select>
      </td>
      <td>
        <select name="variantSize[]" class="ant-input">${sizes.map(s => `<option value="${s._id}" ${s._id===sizeId?'selected':''}>${s.name}</option>`).join('')}</select>
      </td>
      <td><input type="number" name="variantStock[]" min="0" class="ant-input" value="${quantity}"></td>
      <td><input type="number" name="variantPrice[]" min="1" step="1" class="ant-input" value="${price}"></td>
      <td style="position:relative;">
        <input type="file" name="variantImageFile[]" accept="image/*" multiple class="variant-file-input">
        <div class="image-preview"></div>
        <div class="small">Tối đa ${maxVariantImages} ảnh, ảnh đầu là bìa</div>
      </td>
      <td><button type="button" class="btn-remove-variant btn-small">Xóa</button></td>
    `;

    const input = tr.querySelector('.variant-file-input');
    const preview = tr.querySelector('.image-preview');

    // render existing images (when editing)
    (images || []).forEach(src => {
      const wrapper = document.createElement('div');
      wrapper.className = 'img-wrap';
      wrapper.style.position = 'relative';
      wrapper.innerHTML = `<img src="${src}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #ddd;"><button type="button" class="remove-img btn-small" style="position:absolute;top:-6px;right:-6px;">x</button>`;
      preview.appendChild(wrapper);
      wrapper.querySelector('.remove-img').addEventListener('click', () => {
        wrapper.remove();
        updateFileAvailability();
      });
    });

    const updateFileAvailability = () => {
      const count = preview.children.length;
      input.disabled = count >= maxVariantImages;
    };
    updateFileAvailability();

    input.addEventListener('change', e => {
      const files = Array.from(e.target.files);
      if (preview.children.length + files.length > maxVariantImages) {
        alert(`Tối đa ${maxVariantImages} ảnh mỗi biến thể!`);
        input.value = '';
        return;
      }
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          const wrapper = document.createElement('div');
          wrapper.className = 'img-wrap';
          wrapper.style.position = 'relative';
          wrapper.innerHTML = `<img src="${ev.target.result}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #ddd;"><button type="button" class="remove-img btn-small" style="position:absolute;top:-6px;right:-6px;">x</button>`;
          preview.appendChild(wrapper);
          wrapper.querySelector('.remove-img').addEventListener('click', () => { wrapper.remove(); updateFileAvailability(); });
          updateFileAvailability();
        };
        reader.readAsDataURL(file);
      });
      input.value = '';
    });

    tr.querySelector('.btn-remove-variant').addEventListener('click', () => {
      const tbody = tr.parentElement;
      tr.remove();
      // If editing panel and now zero variants -> prompt to delete product
      if (tbody.id === 'editVariantBody' && tbody.children.length === 0) {
        if (confirm('Xóa hết variant sẽ xóa luôn product. Bạn muốn xóa product này không?')) {
          const productId = $('#edit-id').value;
          fetch(`/api/products/${productId}`, { method: 'DELETE' }).then(r => {
            if (r.ok) { alert('Đã xóa product'); closeEditModal(); loadProducts(); }
            else alert('Xóa thất bại');
          });
        } else {
          // do nothing (admin cancelled) -> you might want to re-add one row automatically
          addVariantRow(tbody);
        }
      }
    });

    return tr;
  }

  function addVariantRow(tbody, variant) {
    tbody.appendChild(createVariantRow(variant));
  }

  // BIND create form
  function bindCreateForm() {
    const variantBody = $('#variantBody');
    $('#addVariant').addEventListener('click', () => addVariantRow(variantBody));
    // ensure at least one variant row on open
    $('#tab-create').addEventListener('click', () => {
      if (variantBody.children.length === 0) addVariantRow(variantBody);
    });

    $('#product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);

      // collect variants
      const rows = Array.from(variantBody.querySelectorAll('tr'));
      if (rows.length === 0) return alert('Yêu cầu ít nhất 1 biến thể');
      const variants = [];
      for (const r of rows) {
        const color = r.querySelector("select[name='variantColor[]']").value;
        const size = r.querySelector("select[name='variantSize[]']").value;
        const quantity = parseInt(r.querySelector("input[name='variantStock[]']").value)||0;
        const price = parseInt(r.querySelector("input[name='variantPrice[]']").value)||0;
        const previewImgs = Array.from(r.querySelectorAll('.image-preview img')).map(img => img.src);

        // each variant must have at least one image (either preview URL or files)
        const fileInput = r.querySelector("input[name='variantImageFile[]']");
        const fileCount = fileInput.files ? fileInput.files.length : 0;
        if (!previewImgs.length && fileCount === 0) return alert('Mỗi variant phải có ít nhất 1 ảnh');

        if (!color || !size) return alert('Chưa chọn màu/size cho một variant');
        if (price <= 0) return alert('Giá phải > 0');

        variants.push({ color, size, quantity, price });
        // append files to FormData
        if (fileInput.files) for (const f of fileInput.files) fd.append('variantImageFile[]', f);
      }

      fd.append('variants', JSON.stringify(variants));

      // productImages
      const prodFiles = e.target.querySelector("input[name='productImageFiles']");
      if (prodFiles && prodFiles.files) for (const f of prodFiles.files) fd.append('productImageFiles', f);

      const res = await fetch('/api/products', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'Tạo thất bại');
      alert('Tạo sản phẩm thành công');
      e.target.reset();
      variantBody.innerHTML = '';
      loadProducts();
      showPanel('list');
    });

    // reset create panel
    $('#resetCreate').addEventListener('click', () => {
      $('#variantBody').innerHTML = '';
      addVariantRow($('#variantBody'));
    });

    // ensure one variant default
    addVariantRow($('#variantBody'));
  }

  // IMPORT
  function bindImportForm() {
    $('#csv-import-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const res = await fetch('/api/products/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'Import thất bại');
      alert(`Import thành công: ${data.count || 0} product(s)`);
      e.target.reset();
      loadProducts();
      showPanel('list');
    });
  }

  // LIST / LOAD
  function bindListControls() {
    $('#searchName').addEventListener('input', debounce(() => { currentPage = 1; loadProducts(); }, 400));
    $('#filterCategory').addEventListener('change', () => { currentPage =1; loadProducts(); });
    $('#filterBrand').addEventListener('input', debounce(() => { currentPage = 1; loadProducts(); }, 300));
  }

  async function loadProducts() {
    const q = new URLSearchParams({
      page: currentPage, limit,
      name: $('#searchName').value || '',
      category: $('#filterCategory').value || '',
      brand: $('#filterBrand').value || ''
    });
    const res = await fetch(`/api/products?${q.toString()}`);
    if (!res.ok) return console.error('Load products failed');
    const data = await res.json();
    renderProductsGrid(data.products || []);
    renderProductsTable(data.products || []);
    totalPages = data.pagination?.totalPages || 1;
    renderPagination();
  }

  function renderProductsGrid(items) {
    const grid = $('#productGrid');
    grid.innerHTML = items.map(p => {
      // compute min price and colors
      const prices = (p.variants||[]).map(v => v.price||0).filter(Boolean);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const colorSet = [...new Map((p.variants||[]).map(v => [v.colors?.[0]?._id || (v.colors?._id), v.colors?.[0] || v.colors]).filter(Boolean)).values()];
      const colorDots = colorSet.slice(0,4).map(c => `<div class="dot" title="${c.name}" style="background:${c.hex||'#ddd'}"></div>`).join('');
      const cover = p.coverImage || (p.images && p.images[0]) || '/imgs/placeholder.jpg';
      return `<div class="product-card" data-id="${p._id}">
        <img src="${cover}" onerror="this.src='/imgs/placeholder.jpg'"/>
        <h4 style="margin:8px 0 4px">${escapeHtml(p.name)}</h4>
        <div class="small">SKU: ${escapeHtml(p.SKU)} • ${p.brand || ''}</div>
        <div style="margin-top:6px;font-weight:700">${minPrice.toLocaleString()} VNĐ</div>
        <div style="margin-top:8px">${colorDots}${colorSet.length>4?` <span class="small">+${colorSet.length-4}</span>`:''}</div>
        <div style="margin-top:8px;display:flex;gap:8px;justify-content:center">
          <button class="btn-edit btn-small" data-id="${p._id}">Sửa</button>
          <button class="btn-delete btn-small" data-id="${p._id}">Xóa</button>
        </div>
      </div>`;
    }).join('') || '<p style="text-align:center;padding:18px;">Chưa có sản phẩm.</p>';

    // attach actions
    grid.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(b.dataset.id);
    }));
    grid.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      deleteProduct(b.dataset.id);
    }));
  }

  function renderProductsTable(items) {
    const tbody = $('#productTableBody');
    tbody.innerHTML = items.map(p => {
      const prices = (p.variants||[]).map(v => v.price||0).filter(Boolean);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const maxPrice = prices.length ? Math.max(...prices) : 0;
      const totalStock = (p.variants||[]).reduce((s,v)=>s+(v.quantity||0),0);
      return `<tr>
        <td>${escapeHtml(p.SKU)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.category?.name||''}</td>
        <td>${escapeHtml(p.brand||'')}</td>
        <td>${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}</td>
        <td>${totalStock}</td>
        <td>
          <button class="btn-edit btn-small" data-id="${p._id}">Sửa</button>
          <button class="btn-delete btn-small" data-id="${p._id}">Xóa</button>
        </td>
      </tr>`;
    }).join('');
    // attach actions (table)
    tbody.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.id)));
    tbody.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', () => deleteProduct(b.dataset.id)));
  }

  function renderPagination() {
    const pg = $('#pagination');
    pg.innerHTML = '';
    for (let i=1;i<=totalPages;i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.className = i===currentPage ? 'active' : '';
      btn.onclick = () => { currentPage = i; loadProducts(); };
      pg.appendChild(btn);
    }
  }

  // --- EDIT modal ---
  const editModal = $('#editModal');
  $('#editClose').addEventListener('click', closeEditModal);
  $('#cancelEdit').addEventListener('click', closeEditModal);

  async function openEditModal(id) {
    const res = await fetch(`/api/products/${id}`);
    if (!res.ok) return alert('Không tìm thấy product');
    const p = await res.json();
    $('#edit-id').value = p._id;
    $('#edit-SKU').value = p.SKU;
    $('#edit-category').value = p.category?._id || '';
    $('#edit-brand').value = p.brand || '';
    $('#edit-name').value = p.name || '';
    $('#edit-description').value = p.description || '';

    const body = $('#editVariantBody');
    body.innerHTML = '';
    (p.variants || []).forEach(v => {
      // normalize images to array of strings
      const imgs = (v.images || []).map(i => i);
      addVariantRow(body, { colorId: (v.colors && v.colors[0]?._id) || (v.colors?._id) || '', sizeId: v.size?._id || '', quantity: v.quantity || 0, price: v.price || 0, images: imgs });
    });

    // if no variants then add one empty row (shouldn't happen normally)
    if (body.children.length === 0) addVariantRow(body);
    editModal.style.display = 'block';
  }

  function closeEditModal() {
    editModal.style.display = 'none';
    $('#editVariantBody').innerHTML = '';
  }

  // submit edit
  $('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#edit-id').value;
    const fd = new FormData(e.target);
    const rows = Array.from($('#editVariantBody').querySelectorAll('tr'));
    if (rows.length === 0) {
      if (confirm('Xóa hết variant sẽ xóa luôn product. Xác nhận?')) {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        if (res.ok) { alert('Đã xóa'); closeEditModal(); loadProducts(); }
        else alert('Xóa thất bại');
        return;
      } else { return; }
    }

    const variants = [];
    for (const r of rows) {
      const color = r.querySelector("select[name='variantColor[]']").value;
      const size = r.querySelector("select[name='variantSize[]']").value;
      const quantity = parseInt(r.querySelector("input[name='variantStock[]']").value)||0;
      const price = parseInt(r.querySelector("input[name='variantPrice[]']").value)||0;
      const previewImgs = Array.from(r.querySelectorAll('.image-preview img')).map(img => img.src);

      const fileInput = r.querySelector("input[name='variantImageFile[]']");
      const fileCount = fileInput.files ? fileInput.files.length : 0;
      if (!previewImgs.length && fileCount === 0) return alert('Mỗi variant phải có ít nhất 1 ảnh');

      variants.push({ color, size, quantity, price });
      if (fileInput.files) for (const f of fileInput.files) fd.append('variantImageFile[]', f);
    }

    fd.append('variants', JSON.stringify(variants));
    const res = await fetch(`/api/products/${id}`, { method: 'PUT', body: fd });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Cập nhật thất bại');
    alert('Cập nhật thành công');
    closeEditModal();
    loadProducts();
  });

  // delete product
  async function deleteProduct(id) {
    if (!confirm('Xóa product này?')) return;
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) return alert('Xóa thất bại');
    alert('Xóa thành công');
    loadProducts();
  }

  // utility
  function escapeHtml(s) { if (!s) return ''; return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function debounce(fn, t=250) { let to; return (...a)=>{ clearTimeout(to); to = setTimeout(()=>fn(...a), t); }; }

  // attach ability to add variants inside edit form
  $('#edit-addVariant').addEventListener('click', () => addVariantRow($('#editVariantBody')));

  // close modal on outside click
  window.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

  // expose loadProducts to global (dashboard may call)
  window.loadProducts = loadProducts;

  // start
  init();

})();
