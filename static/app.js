document.addEventListener('DOMContentLoaded', () => {
    fetchPantry();
    fetchRecipes();
});

async function fetchPantry() {
    try {
        const response = await fetch('/api/pantry');
        const items = await response.json();
        
        const fullTbody = document.getElementById('full-pantry-tbody');
        const recentTbody = document.getElementById('recent-pantry-tbody');
        const totalItemsEl = document.getElementById('stat-total-items');

        if (totalItemsEl) totalItemsEl.innerText = items.length;

        if (fullTbody) {
            if (items.length === 0) {
                fullTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No items in pantry yet. Scan a barcode or add one!</td></tr>`;
            } else {
                fullTbody.innerHTML = items.map(item => `
                    <tr>
                        <td><strong>${item.name}</strong></td>
                        <td>${item.quantity}</td>
                        <td><span class="badge">${item.category}</span></td>
                        <td>${item.expiry_date}</td>
                        <td><span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #10B981;">Fresh</span></td>
                        <td><button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; color: #EF4444; border-color: #EF4444;" onclick="deleteItem(${item.id})"><i class="fa-solid fa-trash"></i></button></td>
                    </tr>
                `).join('');
            }
        }

        if (recentTbody) {
            recentTbody.innerHTML = items.slice(-5).reverse().map(item => `
                <tr>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.quantity}</td>
                    <td>${item.category}</td>
                    <td><span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #10B981;">Fresh</span></td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to fetch pantry:', error);
    }
}

async function fetchRecipes() {
    try {
        const response = await fetch('/api/recipes');
        const recipes = await response.json();
        
        const recipesCountEl = document.getElementById('stat-recipes-count');
        if (recipesCountEl) recipesCountEl.innerText = recipes.length;

        const container = document.getElementById('recipes-container');
        if (container) {
            if (recipes.length === 0) {
                container.innerHTML = `<p style="color: var(--text-muted);">No AI recipes generated yet. Click generate above!</p>`;
            } else {
                container.innerHTML = recipes.map(r => `
                    <div class="card" style="padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <h3 style="margin-bottom: 8px; font-size: 18px; color: var(--text-main);">${r.title}</h3>
                            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;"><i class="fa-regular fa-clock"></i> ${r.time || '20 mins'} &nbsp;|&nbsp; <i class="fa-solid fa-signal"></i> ${r.difficulty || 'Easy'}</p>
                            <div style="font-size: 14px; white-space: pre-line; line-height: 1.5; color: var(--text-main); background: var(--bg-body); padding: 12px; border-radius: 8px;">${r.description}</div>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Failed to fetch recipes:', error);
    }
}

// Add item form submission
const addItemForm = document.getElementById('add-item-form');
if (addItemForm) {
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addItemForm);
        const data = {
            name: formData.get('name'),
            quantity: formData.get('quantity'),
            category: formData.get('category'),
            expiry_date: formData.get('expiry_date')
        };

        try {
            const response = await fetch('/api/pantry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                closeModal('add-item-modal');
                addItemForm.reset();
                fetchPantry();
            }
        } catch (err) {
            console.error('Error adding item:', err);
        }
    });
}

async function deleteItem(id) {
    if (!confirm('Are you sure you want to remove this item?')) return;
    try {
        const response = await fetch(`/api/pantry/${id}`, { method: 'DELETE' });
        if (response.ok) {
            fetchPantry();
        }
    } catch (err) {
        console.error('Error deleting item:', err);
    }
}

async function generateAIRecipe() {
    try {
        const spotlight = document.getElementById('spotlight-recipe-content');
        if (spotlight) {
            spotlight.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px;"></i><p>Chef AI is crafting your recipe...</p></div>`;
        }

        const response = await fetch('/api/recipes/generate', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            fetchRecipes();
            const recipeRes = await fetch('/api/recipes');
            const recipes = await recipeRes.json();
            const latest = recipes[recipes.length - 1];
            if (spotlight && latest) {
                spotlight.innerHTML = `
                    <div style="padding: 15px;">
                        <h4 style="font-size: 16px; margin-bottom: 6px; color: var(--text-main);">${latest.title}</h4>
                        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">${latest.time} • ${latest.difficulty}</p>
                        <div style="font-size: 13px; white-space: pre-line; max-height: 150px; overflow-y: auto; background: var(--bg-body); padding: 10px; border-radius: 6px;">${latest.description}</div>
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error('Error generating recipe:', err);
    }
}

// Modal helpers
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

// Sidebar navigation switching
document.querySelectorAll('.sidebar-menu a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-target');
        if (!targetId) return;

        document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
        link.parentElement.classList.add('active');

        document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active');
    });
});
