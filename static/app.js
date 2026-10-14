document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadPantryData();
  loadRecipeData();
  setupForms();
});

function initNavigation() {
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }

  const navLinks = document.querySelectorAll('.sidebar-menu a');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('data-target');
      switchView(targetId);
      navLinks.forEach(l => l.parentElement.classList.remove('active'));
      link.parentElement.classList.add('active');
      sidebar.classList.remove('mobile-open');
    });
  });
}

function switchView(viewId) {
  document.querySelectorAll('.content-view').forEach(view => {
    view.classList.remove('active');
  });
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Data Loaders & API Integrations
async function loadPantryData() {
  try {
    const response = await fetch('/api/pantry');
    if (!response.ok) return;
    const items = await response.json();
    
    document.getElementById('stat-total-items').textContent = items.length;
    
    // Calculate expiring soon (within 3 days)
    const now = new Date();
    const expiringCount = items.filter(item => {
      const expiry = new Date(item.expiry_date);
      const diffTime = expiry - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    }).length;
    
    document.getElementById('stat-expiring-items').textContent = expiringCount;
    document.getElementById('stat-waste-saved').textContent = (items.length * 0.4).toFixed(1) + ' kg';

    renderPantryTables(items);
  } catch (err) {
    console.error('Error loading pantry:', err);
  }
}

function renderPantryTables(items) {
  const recentTbody = document.getElementById('recent-pantry-tbody');
  const fullTbody = document.getElementById('full-pantry-tbody');
  
  if (!items || items.length === 0) {
    const emptyHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-basket-shopping"></i><h4>No items in pantry</h4><p>Add food items to start tracking freshness.</p></div></td></tr>`;
    if (recentTbody) recentTbody.innerHTML = emptyHTML;
    if (fullTbody) fullTbody.innerHTML = emptyHTML;
    return;
  }

  const getBadge = (dateStr) => {
    const expiry = new Date(dateStr);
    const diffDays = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return '<span class="badge badge-expired"><i class="fa-solid fa-circle-xmark"></i> Expired</span>';
    if (diffDays <= 3) return `<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${diffDays}d left</span>`;
    return '<span class="badge badge-fresh"><i class="fa-solid fa-circle-check"></i> Fresh</span>';
  };

  if (recentTbody) {
    recentTbody.innerHTML = items.slice(0, 5).map(item => `
      <tr>
        <td>
          <div class="item-cell">
            <div class="item-icon-box"><i class="fa-solid fa-utensils"></i></div>
            <strong>${item.name}</strong>
          </div>
        </td>
        <td>${item.quantity}</td>
        <td>${item.category || 'General'}</td>
        <td>${getBadge(item.expiry_date)}</td>
      </tr>
    `).join('');
  }

  if (fullTbody) {
    fullTbody.innerHTML = items.map(item => `
      <tr>
        <td><strong>${item.name}</strong></td>
        <td>${item.quantity}</td>
        <td>${item.category || 'General'}</td>
        <td>${item.expiry_date}</td>
        <td>${getBadge(item.expiry_date)}</td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px;" onclick="deletePantryItem('${item.id || item._id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }
}

async function loadRecipeData() {
  try {
    const response = await fetch('/api/recipes');
    if (!response.ok) return;
    const recipes = await response.json();
    document.getElementById('stat-recipes-count').textContent = recipes.length;
    renderRecipes(recipes);
  } catch (err) {
    console.error('Error loading recipes:', err);
  }
}

function renderRecipes(recipes) {
  const container = document.getElementById('recipes-container');
  if (!container) return;

  if (!recipes || recipes.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><i class="fa-solid fa-utensils"></i><h4>No recipes generated yet</h4><p>Click generate above to get AI recommendations.</p></div>`;
    return;
  }

  container.innerHTML = recipes.map(recipe => `
    <div class="recipe-card">
      <div class="recipe-header-img"><i class="fa-solid fa-bowl-food"></i></div>
      <div class="recipe-body">
        <div class="recipe-meta">
          <span><i class="fa-regular fa-clock"></i> ${recipe.time || '20 mins'}</span>
          <span><i class="fa-solid fa-signal"></i> ${recipe.difficulty || 'Easy'}</span>
        </div>
        <h4>${recipe.title}</h4>
        <p>${recipe.description || 'Made with your available pantry ingredients.'}</p>
        <button class="btn btn-outline" style="width: 100%;" onclick="showToast('Recipe selected!')">View Instructions</button>
      </div>
    </div>
  `).join('');
}

async function generateAIRecipe() {
  showToast('Generating AI recipe from pantry items...', 'success');
  try {
    const response = await fetch('/api/recipes/generate', { method: 'POST' });
    if (response.ok) {
      loadRecipeData();
      showToast('New AI recipe generated successfully!');
    }
  } catch (err) {
    showToast('Failed to generate recipe', 'error');
  }
}

async function submitBarcode() {
  const barcode = document.getElementById('barcode-input').value;
  if (!barcode) {
    showToast('Please enter a barcode', 'error');
    return;
  }
  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode })
    });
    if (response.ok) {
      closeModal('scan-modal');
      loadPantryData();
      showToast('Item successfully added via barcode!');
    } else {
      showToast('Product not found for barcode', 'error');
    }
  } catch (err) {
    showToast('Barcode scanning error', 'error');
  }
}

function setupForms() {
  const addItemForm = document.getElementById('add-item-form');
  if (addItemForm) {
    addItemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(addItemForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch('/api/pantry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (response.ok) {
          closeModal('add-item-modal');
          addItemForm.reset();
          loadPantryData();
          showToast('Pantry item added successfully!');
        } else {
          showToast('Failed to add item', 'error');
        }
      } catch (err) {
        showToast('Error adding item', 'error');
      }
    });
  }
}

async function deletePantryItem(itemId) {
  try {
    const response = await fetch(`/api/pantry/${itemId}`, { method: 'DELETE' });
    if (response.ok) {
      loadPantryData();
      showToast('Item removed from pantry');
    }
  } catch (err) {
    showToast('Failed to delete item', 'error');
  }
}
