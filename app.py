import os
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from groq import Groq

app = Flask(__name__, instance_path="/tmp/instance")
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fallback-dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///pantry.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Create database tables on startup for production
with app.app_context():
    db.create_all()

# --- Database Models ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    items = db.relationship('PantryItem', backref='owner', lazy=True)
    recipes = db.relationship('Recipe', backref='owner', lazy=True)

class PantryItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class Recipe(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    time = db.Column(db.String(50), nullable=True)
    difficulty = db.Column(db.String(50), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- Routes ---
@app.route('/')
@login_required
def index():
    items = PantryItem.query.filter_by(user_id=current_user.id).all()
    recipes = Recipe.query.filter_by(user_id=current_user.id).all()
    return render_template('index.html', items=items, recipes=recipes)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('index'))
        flash('Invalid username or password.')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if User.query.filter_by(username=username).first():
            flash('Username already exists.')
            return redirect(url_for('register'))
        hashed_password = generate_password_hash(password, method='scrypt')
        new_user = User(username=username, password=hashed_password)
        db.session.add(new_user)
        db.session.commit()
        login_user(new_user)
        return redirect(url_for('index'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/add_item', methods=['POST'])
@login_required
def add_item():
    name = request.form.get('name')
    category = request.form.get('category', 'General')
    if name:
        item = PantryItem(name=name, category=category, user_id=current_user.id)
        db.session.add(item)
        db.session.commit()
    return redirect(url_for('index'))

@app.route('/delete_item/<int:item_id>', methods=['POST'])
@login_required
def delete_item(item_id):
    item = PantryItem.query.get_or_404(item_id)
    if item.user_id == current_user.id:
        db.session.delete(item)
        db.session.commit()
    return redirect(url_for('index'))

# --- AI Recipe Generation Route ---
@app.route('/api/recipes/generate', methods=['POST'])
@login_required
def generate_recipe():
    items = PantryItem.query.filter_by(user_id=current_user.id).all()
    item_names = [i.name for i in items] if items else ["Assorted Pantry Ingredients"]
    
    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
        return jsonify({'success': False, 'error': 'GROQ_API_KEY environment variable is not set.'}), 500

    try:
        client = Groq(api_key=groq_api_key)
        
        prompt = f"""You are an elite, Michelin-star executive chef and culinary innovator. 
Available Pantry Inventory: {', '.join(item_names)}.

CRITICAL CHEF GUIDELINES:
1. Analyze the inventory intelligently. Separate raw ingredients or cooking supplies from ready-to-eat snacks, packaged treats, or granola bars. 
2. Do NOT force bizarre or disgusting combinations. If snack items are present, use them appropriately in breakfast bowls, yogurt parfaits, dessert crumbles, or snack boards.
3. Invent a completely unique, creative, and coherent recipe suited for these specific items.
4. Output your response in this exact plain-text structure:
[Recipe Title]
Prep Time: [e.g., 15 mins] | Difficulty: [Easy/Medium/Hard]

Step-by-Step Instructions:
1. [First step]
2. [Second step]"""
        
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.95,
            max_tokens=600
        )
        
        recipe_text = completion.choices[0].message.content.strip()
        lines = [line.strip() for line in recipe_text.split('\n') if line.strip()]
        
        recipe_title = lines[0].replace('[', '').replace(']', '').replace('Recipe Title:', '').strip() if lines else "Chef's Autonomous Creation"
        if recipe_title.startswith('Title:'):
            recipe_title = recipe_title.replace('Title:', '').strip()

        new_recipe = Recipe(
            title=recipe_title[:100],
            description=recipe_text,
            time="25 mins",
            difficulty="Medium",
            user_id=current_user.id
        )
        db.session.add(new_recipe)
        db.session.commit()
        return jsonify({'success': True, 'title': recipe_title})
        
    except Exception as e:
        print(f"Groq API error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# --- Database Initialization & Run ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
